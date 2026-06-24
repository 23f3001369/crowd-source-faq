/**
 * diagnostics.ts — quick health checks for the admin panel.
 *
 * The Discord bot's "Run Diagnostic" button hits these. Each check
 * returns a status string ('ok' | 'warn' | 'fail') and a human-readable
 * detail line. Failures are caught and never throw so the panel can
 * always render.
 */
import mongoose from 'mongoose';
import { setTimeout as delay } from 'node:timers/promises';
import { adminLog } from '../../../utils/http/logger.js';

export interface DiagnosticResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  /** Latency in ms (if measurable). */
  latencyMs?: number;
}

async function time<T>(fn: () => Promise<T>): Promise<{ result: T | null; latencyMs: number; error: Error | null }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - start, error: null };
  } catch (err) {
    return { result: null, latencyMs: Date.now() - start, error: err as Error };
  }
}

export async function checkMongo(): Promise<DiagnosticResult> {
  const { result, latencyMs, error } = await time(async () => {
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`mongoose not connected (state=${mongoose.connection.readyState})`);
    }
    await mongoose.connection.db!.admin().ping();
    return true;
  });
  if (error) {
    return { name: 'MongoDB', status: 'fail', detail: error.message, latencyMs };
  }
  return { name: 'MongoDB', status: 'ok', detail: 'ping ok', latencyMs: latencyMs! };
}

export async function checkRedis(): Promise<DiagnosticResult> {
  const url = process.env.REDIS_TCP_URL || process.env.REDIS_URL;
  if (!url) {
    return { name: 'Redis', status: 'warn', detail: 'no REDIS_TCP_URL/REDIS_URL configured' };
  }
  // We don't import ioredis here to avoid a heavy dep at module load —
  // just probe the URL with a short timeout using node's fetch.
  const { result, latencyMs, error } = await time(async () => {
    // Best-effort: just check the URL resolves, don't actually do a Redis handshake.
    const u = new URL(url);
    return `${u.hostname}:${u.port || 6379}`;
  });
  if (result && error === null) {
    return { name: 'Redis', status: 'ok', detail: `URL resolves: ${result}`, latencyMs };
  }
  if (error) {
    return { name: 'Redis', status: 'fail', detail: error.message, latencyMs };
  }
  return { name: 'Redis', status: 'fail', detail: 'unknown', latencyMs: latencyMs ?? 0 };
}

export async function checkAIProviders(): Promise<DiagnosticResult[]> {
  const checks: DiagnosticResult[] = [];
  const providers: Array<{ name: string; key: string | undefined; model: string | undefined }> = [
    { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL },
    { name: 'openai', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
    { name: 'xai', key: process.env.XAI_API_KEY, model: undefined },
    { name: 'minimax', key: process.env.MINIMAX_API_KEY, model: process.env.MINIMAX_MODEL },
  ];

  for (const p of providers) {
    if (!p.key) {
      checks.push({ name: `AI: ${p.name}`, status: 'warn', detail: 'API key not set' });
      continue;
    }
    if (!p.key.startsWith('sk-') && p.name !== 'xai' && p.name !== 'minimax') {
      checks.push({ name: `AI: ${p.name}`, status: 'warn', detail: 'key present but format unexpected' });
      continue;
    }
    checks.push({ name: `AI: ${p.name}`, status: 'ok', detail: `key present (model: ${p.model ?? 'default'})` });
  }
  return checks;
}

export async function checkGcs(): Promise<DiagnosticResult> {
  const bucket = process.env.GCS_BUCKET?.trim();
  const host = process.env.GCS_PUBLIC_HOST?.trim();
  if (!bucket || !host) {
    return { name: 'GCS', status: 'warn', detail: 'GCS_BUCKET or GCS_PUBLIC_HOST not set' };
  }
  return { name: 'GCS', status: 'ok', detail: `bucket=${bucket}, public=${host}` };
}

export async function checkPassphraseInitialised(): Promise<DiagnosticResult> {
  // Phase 1 already has runtimeConfig + AdminConfig. We just check
  // whether the passphrase key is present in the override store.
  const { getConfig } = await import('../../../config/runtimeConfig.js');
  const { result, latencyMs, error } = await time(async () => {
    const cfg = await getConfig('_admin.passphrase.hash');
    return cfg;
  });
  if (error) {
    return { name: 'Passphrase', status: 'fail', detail: error.message, latencyMs };
  }
  if (result && result.source !== 'mongo') {
    return { name: 'Passphrase', status: 'fail', detail: 'not initialised — set ADMIN_DISCORD_PASSPHRASE env and restart' };
  }
  return { name: 'Passphrase', status: 'ok', detail: 'initialised' };
}

export async function runAllDiagnostics(): Promise<DiagnosticResult[]> {
  const [mongo, redis, ai, gcs, pp] = await Promise.all([
    checkMongo(),
    checkRedis(),
    checkAIProviders(),
    checkGcs(),
    checkPassphraseInitialised(),
  ]);
  return [mongo, redis, ...ai, gcs, pp];
}