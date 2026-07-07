/**
 * AiApiCall — per-call audit log for every external AI API request.
 *
 * v1.79 — Replaces the implicit "stdout + Discord/Sentry on warn"
 * audit trail in apiUsageLog.ts with a queryable, paginated, exportable
 * record. One document per API call:
 *
 *   - Chat (inference) calls:  utils/ai/aiProvider.ts → chatWithProvider
 *   - Embedding calls:        utils/ai/embeddings.ts → callCustomEmbedding
 *   - Both routes funnel into logAiApiSuccess/logAiApiFailure which
 *     fire-and-forget persists here in addition to the named logger.
 *
 * Fields intentionally cover every audit question an admin would ask:
 *   - Which provider/model/feature was hit?
 *   - Which batch did it belong to? (null = global)
 *   - Which user triggered it?
 *   - Did it succeed? How long did it take? Tokens + cost?
 *   - If it failed, what was the HTTP status and error message?
 *
 * Indexes are sized for the three most common admin queries:
 *   - "Show me everything for batch X in the last 24h" — (batchId, createdAt)
 *   - "Top spenders by provider" — (provider, createdAt)
 *   - "Why did feature X start failing today?" — (feature, createdAt, status)
 *   - "How many calls did user Y make?" — (userId, createdAt)
 *
 * Retention: see cleanupOldApiCalls() in this file. Called from
 * /admin/ai/usage/logs when the result set hits a threshold, and
 * scheduled via cron if you wire it (not done here).
 */
import mongoose, { Schema, type Document, Types } from 'mongoose';

export type AiApiCallKind = 'inference' | 'embedding';
export type AiApiCallStatus = 'ok' | 'fail';

export interface IAiApiCall extends Document {
  // When the external API call returned (or threw).
  createdAt: Date;
  updatedAt: Date;

  kind: AiApiCallKind;        // 'inference' | 'embedding'
  status: AiApiCallStatus;    // 'ok' | 'fail'

  provider: string;           // 'anthropic' | 'openai' | ...
  // Note: not `model` because Mongoose's Document base type has a
  // `model` getter that conflicts with a `string` field of the same
  // name. Use `modelName` everywhere in this codebase.
  modelName: string;          // 'claude-3-5-sonnet-...' | 'text-embedding-3-small' | ...
  feature?: string;           // 'duplicateDetection' | 'knowledgeExtraction' | ... (inference only)

  // Tenant scope. null = global call (no batchId in context).
  batchId?: Types.ObjectId | null;

  // Who triggered the call. null = system (cron, anonymous public path).
  userId?: Types.ObjectId | null;
  userEmail?: string;         // snapshot for audit even if user is deleted
  userRole?: string;

  // Cost & usage. Embeddings have no token counter; that's why these
  // are optional.
  tokensUsed?: number;
  estimatedCostUsd?: number;
  durationMs: number;

  // Failure metadata. Populated only when status === 'fail'.
  httpStatus?: number;        // HTTP status from the upstream provider
  error?: string;             // truncated error message
  errorKind?: string;         // 'timeout' | 'rate_limit' | 'auth' | 'network' | 'unknown'

  // A short correlation id (e.g. request id) so admins can grep logs
  // by request — populated from x-request-id header when present.
  requestId?: string;
}

const aiApiCallSchema = new Schema<IAiApiCall>(
  {
    kind: { type: String, enum: ['inference', 'embedding'], required: true },
    status: { type: String, enum: ['ok', 'fail'], required: true },

    provider: { type: String, required: true },
    modelName: { type: String, required: true },
    feature: { type: String },

    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String },
    userRole: { type: String },

    tokensUsed: { type: Number },
    estimatedCostUsd: { type: Number },
    durationMs: { type: Number, required: true },

    httpStatus: { type: Number },
    error: { type: String },
    errorKind: { type: String },
    requestId: { type: String },
  },
  {
    timestamps: true,
    // Keep doc size small — we expect millions of these over time.
    minimize: false,
  },
);

// Compound indexes — every admin query filters by a batch/provider/feature
// window, so a compound index on (X, createdAt desc) is the right shape.
// The descending order on createdAt matches our default sort.
aiApiCallSchema.index({ batchId: 1, createdAt: -1 });
aiApiCallSchema.index({ provider: 1, createdAt: -1 });
aiApiCallSchema.index({ feature: 1, createdAt: -1 });
aiApiCallSchema.index({ userId: 1, createdAt: -1 });
aiApiCallSchema.index({ status: 1, createdAt: -1 });
// TTL-style cap: pure createdAt index is already implicit via the
// compound indexes above; this one supports "give me everything in the
// last N hours, no other filter" queries from the dashboard summary.
aiApiCallSchema.index({ createdAt: -1 });

/**
 * Retention cleanup. Drop docs older than `days`. Safe to call from a
 * cron or ad-hoc — uses bulk delete so it's a single round-trip.
 *
 * Returns the number of deleted docs so the caller can log the count.
 */
export async function cleanupOldApiCalls(days: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await AiApiCall.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount ?? 0;
}

export const AiApiCall = mongoose.model<IAiApiCall>('AiApiCall', aiApiCallSchema);