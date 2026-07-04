// feature-flag.controller — routes for the feature flag admin UI.
//
// Phase 1 R1: the typed registry + service now live in
// `services/featureFlags.ts`. This module is purely the HTTP edge
// — it validates inputs and delegates reads/writes to the service.
//
// The previous inline allow-list (FEATURE_FLAGS) and the
// isFeatureEnabled helper have been moved. The names are
// re-exported here for back-compat with the v1.69 tests
// (`feature-flag-scoping.test.ts` imports them from this module).

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FeatureFlag from './feature-flag.model.js';
import { adminLog } from '../../utils/http/logger.js';
import { z } from 'zod';
import {
  FEATURE_FLAGS,
  featureFlags,
  isKnownFeatureFlag,
  syncFeatureFlagRegistry,
  UnknownFeatureFlagError,
  type FeatureFlagKey,
  type ResolvedFeatureFlag,
} from '../../services/featureFlags.js';

// Re-exports so existing imports keep working.
export { FEATURE_FLAGS, featureFlags };
export type { FeatureFlagKey, ResolvedFeatureFlag };
export { UnknownFeatureFlagError };

/** Lazily seed known flags so admins see them in the UI even if no
 *  one has ever toggled them. Idempotent. */
export async function ensureFlag(key: FeatureFlagKey): Promise<void> {
  if (!isKnownFeatureFlag(key)) return;
  await FeatureFlag.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        batchId: null,
        label: FEATURE_FLAGS[key].label ?? null,
        description: FEATURE_FLAGS[key].description,
        enabled: FEATURE_FLAGS[key].default,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function ensureAllFlags(): Promise<void> {
  await syncFeatureFlagRegistry();
}

// ─── Back-compat shim: isFeatureEnabled ────────────────────────────────────
//
// The previous helper lived here and is called by the support
// controllers (`support-core.controller.ts`,
// `support-requests.controller.ts`) and `bootstrap/startup.ts`.
// Keep the signature so callers don't need to change their imports.

/** Helper used by the support router — synchronous-feel check that
 *  returns true if the named feature is currently on. Delegates to
 *  the FeatureFlags service. */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  batchId: string | null = null,
): Promise<boolean> {
  try {
    return await featureFlags.isEnabled(key, batchId);
  } catch (err) {
    if (err instanceof UnknownFeatureFlagError) {
      // Fail loud on unknown keys — the task explicitly asks us to
      // NOT silently return false like the old FeatureFlagContext
      // did. The route callers handle this with a 500; the runtime
      // callers (support controllers) rethrow.
      throw err;
    }
    return false; // fail closed on infra errors
  }
}

/** Invalidate the in-process cache. The audit noted that the
 *  previous per-key `_cache.delete(key)` left per-program
 *  overrides stale for up to 30 s — the service now clears the
 *  whole cache on every write. This wrapper is kept for callers
 *  that imported the helper directly; the key argument is ignored
 *  because we always invalidate the entire cache now. */
export function invalidateFeatureFlagCache(_key?: string): void {
  featureFlags.invalidateAll();
}

// ─── Routes ────────────────────────────────────────────────────────────────

/** GET /api/feature-flags?batchId=<id> — list flags resolved for a
 *  specific program (per-program override → global default).
 *  Without batchId the endpoint returns global defaults only. */
export async function listFeatureFlags(req: Request, res: Response): Promise<void> {
  try {
    await ensureAllFlags();
    const rawBatchId = typeof req.query.batchId === 'string' ? req.query.batchId : null;
    const hasBatchId = rawBatchId !== null && Types.ObjectId.isValid(rawBatchId);
    const programBatchId = hasBatchId ? new Types.ObjectId(rawBatchId!) : null;

    if (programBatchId) {
      const overrides = await FeatureFlag.find({ batchId: programBatchId })
        .select('key enabled updatedAt firstEnabledAt lastDisabledAt')
        .lean();
      const overridesByKey = new Map(overrides.map((o) => [o.key, o]));

      const rows = await featureFlags.listAll({ batchId: programBatchId });
      const enriched = rows.map((r) => {
        const meta = FEATURE_FLAGS[r.key];
        const overrideDoc = overridesByKey.get(r.key);
        return {
          key: r.key,
          label: meta.label ?? r.key,
          description: meta.description,
          enabled: r.enabled,
          overridden: r.source === 'override',
          updatedAt: r.lastChangedAt,
          firstEnabledAt: overrideDoc?.firstEnabledAt ?? null,
          lastDisabledAt: overrideDoc?.lastDisabledAt ?? null,
        };
      });
      res.json({ batchId: programBatchId.toString(), flags: enriched });
    } else {
      const flags = await FeatureFlag.find({ batchId: null }).select('-__v').lean();
      res.json({ flags });
    }
  } catch (err) {
    adminLog.error(`[featureFlags] listFeatureFlags failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load feature flags.' });
  }
}

const updateSchema = z.object({
  enabled: z.boolean(),
  note: z.string().max(500).optional(),
});

/** PATCH /api/feature-flags/:key — admin-only toggle of the global default. */
export async function toggleFeatureFlag(req: Request, res: Response): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || !isKnownFeatureFlag(key)) {
    res.status(404).json({ message: 'Unknown feature flag.' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }

  const isEnabling = parsed.data.enabled;
  const userId = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;

  try {
    await featureFlags.setGlobal(key, isEnabling, userId ?? null);
    const updated = await FeatureFlag.findOne({ key, batchId: null }).lean();
    if (key === 'documentPipeline') {
      const { setQueueDisabledByAdmin } = await import('../../utils/jobs/documentQueue.js');
      setQueueDisabledByAdmin(!isEnabling);
    }
    res.json({ flag: updated });
  } catch (err) {
    adminLog.error(`[featureFlags] toggleFeatureFlag failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update feature flag.' });
  }
}

// ─── Per-Program Overrides (Phase 8) ────────────────────────────────────────

const batchIdParam = (req: Request): string | null => {
  const raw = req.params.batchId ?? req.params.id;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
};

function asObjectIdOr400(res: Response, raw: string | null): Types.ObjectId | null {
  if (!raw) {
    res.status(400).json({ message: 'batchId is required.' });
    return null;
  }
  if (!Types.ObjectId.isValid(raw)) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return null;
  }
  return new Types.ObjectId(raw);
}

const perProgramOverrideSchema = z.object({
  enabled: z.boolean(),
});

/**
 * PUT /api/admin/programs/:id/feature-flags/:key
 * Upsert a per-program override. The override takes effect on
 * the next isFeatureEnabled(key, batchId) call.
 */
export async function setPerProgramFeatureFlagOverride(
  req: Request, res: Response,
): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || !isKnownFeatureFlag(key)) {
    res.status(404).json({ message: 'Unknown feature flag.' });
    return;
  }
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  const parsed = perProgramOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const userId = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;
  try {
    await featureFlags.setProgramOverride(key, batchId, parsed.data.enabled, userId ?? null);
    const doc = await FeatureFlag.findOne({ key, batchId }).lean();
    res.json({ flag: doc });
  } catch (err) {
    adminLog.error(`[featureFlags] setPerProgramFeatureFlagOverride failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to set per-program feature flag override.' });
  }
}

/**
 * DELETE /api/admin/programs/:id/feature-flags/:key
 * Remove the per-program override (falls back to the global
 * default on the next isFeatureEnabled() call).
 */
export async function deletePerProgramFeatureFlagOverride(
  req: Request, res: Response,
): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key) {
    res.status(400).json({ message: 'key is required.' });
    return;
  }
  if (!isKnownFeatureFlag(key)) {
    res.status(404).json({ message: 'Unknown feature flag.' });
    return;
  }
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    await featureFlags.clearProgramOverride(key, batchId);
    res.json({ ok: true });
  } catch (err) {
    adminLog.error(`[featureFlags] deletePerProgramFeatureFlagOverride failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete per-program feature flag override.' });
  }
}

/**
 * GET /api/admin/programs/:id/feature-flags
 * List every flag with its resolved value for this program and
 * the source of that resolution (`override` | `global` | `default`).
 */
export async function listPerProgramFeatureFlags(
  req: Request, res: Response,
): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    const overrides = await FeatureFlag.find({ batchId })
      .select('key enabled updatedAt updatedBy firstEnabledAt lastDisabledAt')
      .lean();
    const overridesByKey = new Map(overrides.map((o) => [o.key, o]));

    const rows = await featureFlags.listAll({ batchId });
    const enriched = rows.map((r) => {
      const meta = FEATURE_FLAGS[r.key];
      const overrideDoc = overridesByKey.get(r.key);
      return {
        key: r.key,
        label: meta.label ?? r.key,
        description: meta.description,
        enabled: r.enabled,
        overridden: r.source === 'override',
        source: r.source,
        updatedAt: r.lastChangedAt,
        lastChangedBy: r.lastChangedBy,
        firstEnabledAt: overrideDoc?.firstEnabledAt ?? null,
        lastDisabledAt: overrideDoc?.lastDisabledAt ?? null,
      };
    });
    res.json({ batchId: batchId.toString(), flags: enriched });
  } catch (err) {
    adminLog.error(`[featureFlags] listPerProgramFeatureFlags failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to list per-program feature flags.' });
  }
}