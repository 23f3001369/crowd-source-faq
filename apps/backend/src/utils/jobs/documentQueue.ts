/**
 * documentQueue — BullMQ + ioredis queue for the OCR / document
 * processing pipeline.
 *
 * Why BullMQ (not the existing `jobQueue.ts`)?
 * - This pipeline is **heavy** (tesseract.js can spike to ~500MB;
 *   markitdown-ts loads mammoth/pdf-parse/xlsx into memory). A
 *   in-process queue would blow the heap on concurrent uploads.
 * - Jobs should **survive a backend restart** — a user uploading a
 *   50-page PDF doesn't want the work lost on a deploy.
 * - The worker needs **retry with backoff** when an AI call
 *   429s or a tesseract worker crashes.
 * - Observability via BullMQ's standard tools (Bull-Board, etc.)
 *   is a free win.
 *
 * Connection:
 * - `REDIS_TCP_URL` is the ioredis connection string. Upstash
 *   exposes both a REST URL (`REDIS_URL`, used by the cache) and
 *   a TCP/REDISS URL (`REDIS_TCP_URL`, used here) — they're
 *   different protocols against the same database.
 * - If `REDIS_TCP_URL` is unset, the queue is **disabled** —
 *   the controller will reject uploads with a 503. This keeps
 *   the rest of the app working when Redis isn't configured.
 *
 * Wiring:
 * - `addDocumentJob(documentId, buffer)` enqueues
 * - `startDocumentWorker()` is called once at server startup
 *   to begin processing. Worker runs in-process (same Node
 *   process) — fine for our scale; a separate worker process can
 *   be added later by exporting `processDocument` and importing
 *   it in a `worker.ts` entrypoint.
 */

import { Queue, Worker, QueueEvents, type Job, type Processor, type ConnectionOptions } from 'bullmq';
import { logger } from '../http/logger.js';
import { processDocument } from './documentJob.js';
import { loadConfig } from '../../config/loader.js';

// ─── Connection ──────────────────────────────────────────────────────────────

const QUEUE_NAME = 'document-processing';

let useLocalFallback = false;
let queueFailed = false;
let queueDisabledByAdmin = false;

// v1.71 — Warn throttle. ioredis auto-reconnects with exponential
// backoff (~2s cap), and every reconnect attempt fires an 'error'
// event on the Queue/Worker/QueueEvents. Without throttling, identical
// "[documentQueue] Queue error: connect ECONNREFUSED" warns flood the
// ops Discord channel (logger.ts forwards warn|error|alert to the
// webhook). Throttle by (category, error-message) so:
//   - First occurrence of any new error → logs immediately
//   - Identical re-fires within the window → silent
//   - After WARN_THROTTLE_MS → re-fires if the error still persists
//   - A different error message → logs immediately even within the window
// Pure additive; worst-case bug is "still spams", never data corruption.
const WARN_THROTTLE_MS = 30_000;
const lastWarnAt = new Map<string, number>();
function shouldWarn(key: string): boolean {
  const now = Date.now();
  const last = lastWarnAt.get(key) ?? 0;
  if (now - last < WARN_THROTTLE_MS) return false;
  lastWarnAt.set(key, now);
  return true;
}

function getRedisUrl(): string {
  if (process.env.REDIS_DISABLED === 'true') {
    return '';
  }
  const config = loadConfig();
  const url = config.redis.tcpUrl || process.env.REDIS_TCP_URL;
  const hasRemoteUrl = url && url !== '#' && url.trim() !== '';
  
  const localUrlExplicit = !!process.env.REDIS_LOCAL_TCP_URL;
  
  // Only enable Redis if explicitly configured or local fallback is explicitly set
  if (!hasRemoteUrl && !localUrlExplicit) {
    return '';
  }
  
  if (useLocalFallback || !hasRemoteUrl) {
    return localUrlExplicit ? process.env.REDIS_LOCAL_TCP_URL! : '';
  }
  
  return url;
}

export type DocumentQueueStatus = 'online' | 'disabled' | 'failed';

export function getDocumentQueueStatus(): DocumentQueueStatus {
  if (queueFailed) return 'failed';
  if (queueDisabledByAdmin || buildConnectionOptions() === null) return 'disabled';
  return 'online';
}

export function setQueueDisabledByAdmin(disabled: boolean): void {
  queueDisabledByAdmin = disabled;
  if (disabled) {
    void stopDocumentWorker();
  } else {
    queueFailed = false;
    startDocumentWorker();
  }
}

export function isDocumentQueueEnabled(): boolean {
  return !queueFailed && !queueDisabledByAdmin && buildConnectionOptions() !== null;
}

/**
 * Build the connection options. BullMQ requires `maxRetriesPerRequest:
 * null` on any IORedis instance used by blocking commands — see
 * https://docs.bullmq.io/guide/connections. We construct a fresh
 * IORedis per-Queue/Worker/QueueEvents (BullMQ manages its own
 * connection lifecycle) so the singleton pattern is wrong here.
 */
function buildConnectionOptions(): ConnectionOptions | null {
  const url = getRedisUrl();
  if (!url) return null;
  return {
    // Cast to any: the top-level ioredis and bullmq's pinned ioredis
    // are type-incompatible (different generic Connector classes) but
    // runtime-compatible. BullMQ only needs the connection object;
    // the URL parsing happens inside IORedis itself.
    host: (() => {
      const u = new URL(url);
      return u.hostname;
    })(),
    port: (() => {
      const u = new URL(url);
      return Number(u.port) || 6379;
    })(),
    password: (() => {
      const u = new URL(url);
      return u.password || undefined;
    })(),
    username: (() => {
      const u = new URL(url);
      return u.username || undefined;
    })(),
    // Force IPv4. Many Ubuntu VPS providers (DigitalOcean, AWS, Hetzner) have broken IPv6 routing
    // which causes instant ECONNREFUSED/ENETUNREACH when Node tries to connect to Upstash over IPv6.
    family: 4,
    // Required by BullMQ for blocking commands
    maxRetriesPerRequest: null as unknown as number,
    // Upstash requires TLS on the TCP endpoint
    ...(url.startsWith('rediss://') ? { tls: {} as Record<string, unknown> } : {}),
  };
}

// ─── Queue + worker singletons ────────────────────────────────────────────────

let _queue: Queue<DocumentJobData> | null = null;
let _worker: Worker<DocumentJobData> | null = null;
let _events: QueueEvents | null = null;

function handleQueueConnectionError(err: Error) {
  const msg = err.message || '';
  const lowerMsg = msg.toLowerCase();
  // v1.71 — Broader matchers. The original list (econnrefused, rate
  // limit, quota, forbidden, limit exceeded, max requests) only
  // covered "well-behaved" failures. ioredis reconnect-loop emits
  // ECONNRESET, ETIMEDOUT, ENOTFOUND, "Connection is closed",
  // "READONLY" (when a proxy returns it mid-stream), "Stream isn't
  // writeable" — none of which previously flipped useLocalFallback or
  // queueFailed. Adding them so the worker actually disables itself
  // in the reconnect-storm scenario. The throttle on the 'error'
  // listeners prevents the spam regardless; this just makes sure the
  // disable path actually fires.
  if (
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('connection is closed') ||
    lowerMsg.includes('readonly') ||
    lowerMsg.includes('stream isn') ||  // "Stream isn't writeable" + "Stream is not writeable"
    lowerMsg.includes('stream is not') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('limit exceeded') ||
    lowerMsg.includes('max requests')
  ) {
    if (!useLocalFallback) {
      logger.warn('[documentQueue] Remote Redis connection failed. Falling back to local Redis.');
      useLocalFallback = true;
      void recreateQueueAndWorker();
    } else if (!queueFailed) {
      logger.error('[documentQueue] Fallback local Redis also failed. Disabling document processing worker.');
      queueFailed = true;
      void stopDocumentWorker();
    }
    // If queueFailed already true, do nothing — the throttle on the
    // listeners will prevent further noise, and re-creating a dead
    // worker just makes more noise when it fails again.
  }
}

export interface DocumentJobData {
  documentId: string;
  /** Base64-encoded file bytes. We re-encode so the job payload
   *  survives the BullMQ Redis round-trip (no buffer support). */
  bufferBase64: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'docx' | 'xlsx';
  mimeType: string;
  title: string;
  uploaderUserId: string;
}

export interface DocumentJobResult {
  insightsCreated: number;
  extractionDurationMs: number;
  aiDurationMs: number;
}

export function getDocumentQueue(): Queue<DocumentJobData> | null {
  if (_queue) return _queue;
  const conn = buildConnectionOptions();
  if (!conn) return null;
  // BullMQ creates its own ioredis connection from these options.
  _queue = new Queue<DocumentJobData>(QUEUE_NAME, { connection: conn });
  _queue.on('error', (err) => {
    if (queueFailed) return;
    const key = `queue:${err.message}`;
    if (!shouldWarn(key)) return;
    logger.warn(`[documentQueue] Queue error: ${err.message}`);
    handleQueueConnectionError(err);
  });
  return _queue;
}

/**
 * Enqueue a document for processing. Returns the BullMQ job id.
 * The job actually carries the file bytes (base64) so the worker
 * can run without re-fetching from Cloudinary.
 */
export async function addDocumentJob(data: DocumentJobData): Promise<string> {
  const q = getDocumentQueue();
  if (!q) {
    throw new Error('Document queue is not configured. Set REDIS_TCP_URL.');
  }
  const job = await q.add(
    'process-document',
    data,
    {
      // Bounded retries — tesseract crashes, AI 429s. After 3
      // attempts the DocumentRecord goes to 'failed' manually.
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      // 5 MB cap on the BASE64 string (~3.75 MB raw). Larger files
      // should be uploaded to Cloudinary first and processed by
      // streaming — left as a future improvement.
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  );
  return job.id ?? '';
}

// ─── Worker ──────────────────────────────────────────────────────────────────

const processor: Processor<DocumentJobData, DocumentJobResult> = async (job: Job<DocumentJobData>) => {
  logger.info(`[documentQueue] job ${job.id} starting for documentId=${job.data.documentId}`);
  const t0 = Date.now();
  const result = await processDocument(job.data);
  logger.info(`[documentQueue] job ${job.id} done in ${Date.now() - t0}ms — ${result.insightsCreated} insights`);
  return result;
};

/** Start the in-process worker. Idempotent — calling twice is a no-op. */
export function startDocumentWorker(): boolean {
  if (_worker) return true;
  const conn = buildConnectionOptions();
  if (!conn) {
    logger.info('[documentQueue] REDIS_TCP_URL not set — worker NOT started. Document upload will be disabled.');
    return false;
  }

  _worker = new Worker<DocumentJobData, DocumentJobResult>(QUEUE_NAME, processor, {
    connection: conn,
    // Cap concurrency so tesseract doesn't OOM us. The 5MB payload
    // cap means at most ~5 jobs × ~500MB peak = 2.5GB, but in
    // practice most jobs are <1MB so 3 concurrent is comfortable.
    concurrency: 3,
    // Time limit per job — tesseract OCR of a 50-page PDF can take
    // a couple minutes. AI extraction is ~10-30s.
    lockDuration: 5 * 60 * 1000,
  });

  _worker.on('failed', (job, err) => {
    logger.warn(`[documentQueue] job ${job?.id} failed: ${err.message}`);
  });
  _worker.on('error', (err) => {
    if (queueFailed) return;
    const key = `worker:${err.message}`;
    if (!shouldWarn(key)) return;
    logger.warn(`[documentQueue] worker error: ${err.message}`);
    handleQueueConnectionError(err);
  });

  _events = new QueueEvents(QUEUE_NAME, { connection: conn });
  _events.on('error', (err) => {
    if (queueFailed) return;
    const key = `events:${err.message}`;
    if (!shouldWarn(key)) return;
    logger.warn(`[documentQueue] QueueEvents error: ${err.message}`);
    handleQueueConnectionError(err);
  });
  _events.on('failed', ({ jobId, failedReason }) => {
    logger.warn(`[documentQueue] event failed ${jobId}: ${failedReason}`);
  });

  logger.info(`[documentQueue] worker started, queue=${QUEUE_NAME}, concurrency=3`);
  return true;
}

async function safelyClose(obj: any): Promise<void> {
  if (!obj) return;
  try {
    // Swallow unhandled errors on the object itself
    if (typeof obj.on === 'function') {
      obj.on('error', () => {});
    }
    // Swallow unhandled errors on the underlying client during shutdown
    if (obj.connection && obj.connection._client) {
      obj.connection._client.on('error', () => {});
    }
    // Swallow unhandled errors on the blocking client (Worker bclient)
    if (obj.blockingConnection && obj.blockingConnection._client) {
      obj.blockingConnection._client.on('error', () => {});
    }
    // Close with a timeout to prevent hanging when Redis is unreachable
    await Promise.race([
      obj.close(),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
  } catch (err) {
    // Ignore close errors
  }
}

async function recreateQueueAndWorker(): Promise<void> {
  try {
    if (_worker) {
      await safelyClose(_worker);
      _worker = null;
    }
    if (_queue) {
      await safelyClose(_queue);
      _queue = null;
    }
    if (_events) {
      await safelyClose(_events);
      _events = null;
    }
    
    const conn = buildConnectionOptions();
    if (conn) {
      _queue = new Queue<DocumentJobData>(QUEUE_NAME, { connection: conn });
      _queue.on('error', (err) => {
        if (queueFailed) return;
        // v1.71 — Shared throttle key with the primary instance so a
        // message that's been spamming on the primary doesn't resume
        // spamming when we recreate the fallback. The primary listener
        // is also gated by shouldWarn, but if it already logged 1s
        // ago and the fallback emits the same message, we want the
        // throttle to skip the second emission.
        const key = `queue:${err.message}`;
        if (!shouldWarn(key)) return;
        logger.warn(`[documentQueue] fallback Queue error: ${err.message}`);
        handleQueueConnectionError(err);
      });
      _worker = new Worker<DocumentJobData, DocumentJobResult>(QUEUE_NAME, processor, {
        connection: conn,
        concurrency: 3,
        lockDuration: 5 * 60 * 1000,
      });
      
      _worker.on('failed', (job, err) => {
        logger.warn(`[documentQueue] job ${job?.id} failed: ${err.message}`);
      });
      _worker.on('error', (err) => {
        if (queueFailed) return;
        const key = `worker:${err.message}`;
        if (!shouldWarn(key)) return;
        logger.warn(`[documentQueue] fallback worker error: ${err.message}`);
        handleQueueConnectionError(err);
      });

      _events = new QueueEvents(QUEUE_NAME, { connection: conn });
      _events.on('error', (err) => {
        if (queueFailed) return;
        const key = `events:${err.message}`;
        if (!shouldWarn(key)) return;
        logger.warn(`[documentQueue] fallback QueueEvents error: ${err.message}`);
        handleQueueConnectionError(err);
      });
      logger.info('[documentQueue] Recreated document queue and worker using local Redis fallback');
    }
  } catch (err) {
    logger.warn(`[documentQueue] Failover recreation failed: ${(err as Error).message}`);
  }
}

/**
 * v1.71 — Test-only: reset module-level state so each test starts
 * with a fresh throttle Map, no worker, and no queue. NOT exported
 * from the public API surface; only consumed by __tests__.
 */
export function __resetDocumentQueueForTests(): void {
  lastWarnAt.clear();
  _queue = null;
  _worker = null;
  _events = null;
  useLocalFallback = false;
  queueFailed = false;
}

/** Stop the worker. Called on SIGTERM. */
export async function stopDocumentWorker(): Promise<void> {
  if (_worker) {
    await safelyClose(_worker);
    _worker = null;
  }
  if (_events) {
    await safelyClose(_events);
    _events = null;
  }
  if (_queue) {
    await safelyClose(_queue);
    _queue = null;
  }
  logger.info('[documentQueue] worker stopped');
}
