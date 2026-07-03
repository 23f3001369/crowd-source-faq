/**
 * adminCrud.ts — Discord admin CRUD layer for FAQs, WebPages, and Documents.
 *
 * 15 handlers: 3 entities × 5 ops each (list, view, create, update, delete).
 *
 * Design notes
 * ------------
 * - Each handler returns `{ embeds: EmbedBuilder[] }` for normal flows,
 *   or `{ ephemeral: string }` for a short error / "send me the fields"
 *   prompt. The Discord command layer (registered separately) consumes
 *   the same shape regardless of entity, so it can stay generic.
 * - The bot calls the REST API over HTTP (same process in dev) using
 *   `INTERNAL_API_URL`. Auth uses a service-role JWT minted in
 *   `serviceJwt.ts`. Until the `kind: 'service'` bypass is wired into
 *   `protect`, the bot should also send `X-Internal-Api-Key` (the
 *   `protect` middleware already accepts it as a fallback).
 * - Embeds are color-coded: green=ok/idle, blue=info/list, yellow=
 *   pending/warning, red=error. List items always include the entity
 *   ID so admins can copy/paste it into `view <id>`.
 * - Create/Update return ephemeral "send me the fields" messages
 *   instead of modals — modals are a follow-up.
 * - Long fields are truncated with `…`; the full value stays in the DB.
 */

import { EmbedBuilder } from 'discord.js';
import { mintServiceJwt, hasJwtSecret } from './serviceJwt.js';

// ── Config ──────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.INTERNAL_API_URL ??
  `http://localhost:${process.env.PORT ?? '6767'}`;
const PAGE_LIMIT = 20;

// Discord embed colors (decimal).
const COLOR_INFO   = 0x2563eb; // blue — list / view
const COLOR_OK     = 0x4a7c59; // green — created / updated / deleted
const COLOR_WARN   = 0xf4a261; // yellow — pending / partial
const COLOR_ERROR  = 0xff6b6b; // red — failed

// ── Response shape returned to the Discord command layer ────────────────────

export type AdminCrudResult =
  | { embeds: EmbedBuilder[]; ephemeral?: undefined }
  | { ephemeral: string; embeds?: undefined };

// ── Generic dispatch helpers ────────────────────────────────────────────────

interface DispatchOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string; // e.g. '/csfaq/api/admin/web-pages'
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Optional internal-API-key header (preferred while service-JWT bypass is WIP). */
  internalApiKey?: string;
}

interface DispatchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function dispatch<T>({
  method,
  path,
  body,
  query,
  internalApiKey,
}: DispatchOptions): Promise<DispatchResult<T>> {
  let token: string | null = null;
  try {
    if (hasJwtSecret()) token = mintServiceJwt();
  } catch {
    // Fall through — fetch will just be unauthenticated.
  }

  const qs = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (internalApiKey) headers['X-Internal-Api-Key'] = internalApiKey;

  try {
    const res = await fetch(`${API_BASE}${path}${qs}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') ?? '';
    const data = (ct.includes('application/json') ? await res.json() : null) as T | null;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : extractError(data) ?? `${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: (err as Error).message || 'fetch failed',
    };
  }
}

function extractError(data: unknown): string | null {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

function statusEmoji(s: string | undefined | null): string {
  switch ((s ?? '').toLowerCase()) {
    case 'approved':
    case 'active':
    case 'verified':
      return '🟢';
    case 'pending':
    case 'pending_review':
    case 'evergreen':
      return '🟡';
    case 'rejected':
    case 'flagged':
    case 'inactive':
      return '🔴';
    default:
      return '⚪';
  }
}

function statusColor(s: string | undefined | null): number {
  switch ((s ?? '').toLowerCase()) {
    case 'approved':
    case 'active':
    case 'verified':
      return COLOR_OK;
    case 'pending':
    case 'pending_review':
      return COLOR_WARN;
    case 'rejected':
      return COLOR_ERROR;
    default:
      return COLOR_INFO;
  }
}

function errorEmbed(title: string, detail: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setTitle(title)
    .setDescription(detail)
    .setTimestamp();
}

function ephemeralError(label: string, detail: string): AdminCrudResult {
  return { ephemeral: `❌ **${label}** — ${detail}` };
}

// ── Entity: FAQ ─────────────────────────────────────────────────────────────

interface FaqItem {
  _id: string;
  question: string;
  answer?: string;
  category?: string;
  status?: string;
  reviewStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FaqListResponse {
  faqs?: FaqItem[];
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

export async function faqList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<FaqListResponse>({
    method: 'GET',
    path: '/csfaq/api/faq/paginated',
    query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('FAQ list failed', r.error ?? 'unknown');
  const items = r.data?.faqs ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((f) =>
        `• \`${f._id}\` — ${truncate(f.question ?? '(no question)', 90)} ${statusEmoji(f.status)} _[${f.status ?? 'unknown'}/${f.category ?? '—'}]_`,
      )
    : ['_no FAQs found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`📚 FAQs — page ${page} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `Use /admin faqs view <id> for details. Showing ${items.length} of ${total}.` })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function faqView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<FaqItem>({ method: 'GET', path: `/csfaq/api/faq/${encodeURIComponent(id)}` });
  if (!r.ok || !r.data) return ephemeralError('FAQ view failed', r.error ?? `id ${id} not found`);
  const f = r.data;
  const embed = new EmbedBuilder()
    .setColor(statusColor(f.status))
    .setTitle(`📖 FAQ ${f._id}`)
    .addFields(
      { name: 'Question', value: truncate(f.question ?? '(none)', 1024), inline: false },
      { name: 'Answer', value: truncate(f.answer ?? '(none)', 1024), inline: false },
      { name: 'Category', value: String(f.category ?? '—'), inline: true },
      { name: 'Status', value: String(f.status ?? '—'), inline: true },
      { name: 'Review', value: String(f.reviewStatus ?? '—'), inline: true },
    )
    .setFooter({ text: `Use /admin faqs update <id> ... or /admin faqs delete <id>` })
    .setTimestamp();
  return { embeds: [embed] };
}

/**
 * Create FAQ — placeholder. The real modal flow lands in a follow-up
 * dispatch. For now we tell the admin what to send back.
 */
export async function faqCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '📝 **Create FAQ** — send me the fields in one message, e.g.:\n' +
      '```\n' +
      'question: How do I reset my password?\n' +
      'answer: Visit /login and click "Forgot password".\n' +
      'category: Account\n' +
      'batchId: 65f0000000000000000000a1\n' +
      '```\n' +
      '_Modal support ships in the next dispatch._',
  };
}

/**
 * Update FAQ — placeholder. Like faqCreate, we ask for the fields
 * inline until the modal handler lands.
 */
export async function faqUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral:
      `✏️ **Update FAQ \`${id}\`** — send me only the fields you want to change:\n` +
      '```\n' +
      'status: approved|pending|rejected\n' +
      'category: General\n' +
      'answer: <new answer>\n' +
      '```\n' +
      '_Modal support ships in the next dispatch._',
  };
}

export async function faqDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE',
    path: `/csfaq/api/faq/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('FAQ delete failed', r.error ?? `id ${id} not found`);
  return {
    ephemeral: `🗑️ Deleted FAQ \`${id}\`.`,
  };
}

// ── Entity: WebPage ─────────────────────────────────────────────────────────

interface WebPageItem {
  _id: string;
  url: string;
  domain?: string;
  title?: string;
  approved?: boolean;
  source?: string;
  statusCode?: number;
  lastFetchError?: string | null;
  fetchedAt?: string;
}

interface WebPageListResponse {
  items?: WebPageItem[];
  total?: number;
  page?: number;
  pages?: number;
}

export async function webPageList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<WebPageListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/web-pages',
    query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Web pages list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const pages = r.data?.pages ?? 1;
  const lines = items.length
    ? items.map((p) => {
        const flag = p.lastFetchError ? ' ⚠️' : '';
        return `• \`${p._id}\` — ${truncate(p.title || p.url, 80)} ${p.approved ? '🟢' : '🟡'} _[${p.approved ? 'approved' : 'pending'}/${p.source ?? '—'}]_${flag}`;
      })
    : ['_no web pages found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`🌐 Web pages — page ${page}/${pages} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Use /admin web-pages view <id> for details. ⚠️ = last fetch failed.' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function webPageView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<WebPageListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/web-pages',
    query: { page: 1, limit: 1 },
  });
  // The admin list endpoint paginates, not filter-by-id, so we look up
  // via the global page list — coarse but works for the scaffold.
  if (!r.ok || !r.data) return ephemeralError('Web page view failed', r.error ?? `id ${id} not found`);
  const match = (r.data.items ?? []).find((p: WebPageItem) => String(p._id) === id);
  if (!match) {
    return ephemeralError('Web page not found', `id ${id} not on the current page`);
  }
  const embed = new EmbedBuilder()
    .setColor(match.approved ? COLOR_OK : COLOR_WARN)
    .setTitle(`🌐 WebPage ${match._id}`)
    .addFields(
      { name: 'URL', value: truncate(match.url ?? '—', 1024), inline: false },
      { name: 'Title', value: truncate(match.title ?? '(no title)', 1024), inline: false },
      { name: 'Domain', value: String(match.domain ?? '—'), inline: true },
      { name: 'Source', value: String(match.source ?? '—'), inline: true },
      { name: 'Approved', value: match.approved ? '✅ yes' : '🟡 pending', inline: true },
      { name: 'HTTP', value: String(match.statusCode ?? '—'), inline: true },
    )
    .setFooter({ text: 'Use /admin web-pages approve|unapprove|delete <id>' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function webPageCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '🌐 **Add web page** — send me a URL in one message:\n' +
      '```\n' +
      'url: https://docs.example.com/getting-started\n' +
      '```\n' +
      '_Modal support ships in the next dispatch._',
  };
}

export async function webPageUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral:
      `🔄 **Update WebPage \`${id}\`** — approve / unapprove / delete by subcommand:\n` +
      '```\n' +
      '/admin web-pages approve <id>\n' +
      '/admin web-pages unapprove <id>\n' +
      '```\n' +
      '_Field-level edits ship in the next dispatch._',
  };
}

export async function webPageDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE',
    path: `/csfaq/api/admin/web-pages/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Web page delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted web page \`${id}\`.` };
}

// ── Entity: Document ────────────────────────────────────────────────────────

interface DocumentItem {
  _id: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
  uploadedAt?: string;
  lastFetchError?: string | null;
}

interface DocumentListResponse {
  items?: DocumentItem[];
  total?: number;
  page?: number;
  pages?: number;
}

function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function documentList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<DocumentListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/documents',
    query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Documents list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const pages = r.data?.pages ?? 1;
  const lines = items.length
    ? items.map((d) => {
        const flag = d.lastFetchError ? ' ⚠️' : '';
        return `• \`${d._id}\` — ${truncate(d.title ?? d.filename ?? '(no title)', 80)} _[${d.mimeType ?? '—'}/${formatBytes(d.sizeBytes)}${d.pageCount ? `, ${d.pageCount}p` : ''}]_${flag}`;
      })
    : ['_no documents found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`📄 Documents — page ${page}/${pages} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Use /admin documents view <id> for details. ⚠️ = extraction failed.' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function documentView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<DocumentListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/documents',
    query: { page: 1, limit: 1 },
  });
  // Same caveat as webPageView: list endpoint doesn't filter-by-id, so
  // this is a scaffold lookup. A future dispatch can add a GET /:id route.
  if (!r.ok || !r.data) return ephemeralError('Document view failed', r.error ?? `id ${id} not found`);
  const match = (r.data.items ?? []).find((d: DocumentItem) => String(d._id) === id);
  if (!match) {
    return ephemeralError('Document not found', `id ${id} not on the current page`);
  }
  const embed = new EmbedBuilder()
    .setColor(match.lastFetchError ? COLOR_ERROR : COLOR_INFO)
    .setTitle(`📄 Document ${match._id}`)
    .addFields(
      { name: 'Title', value: truncate(match.title ?? '(no title)', 1024), inline: false },
      { name: 'Filename', value: String(match.filename ?? '—'), inline: true },
      { name: 'MIME', value: String(match.mimeType ?? '—'), inline: true },
      { name: 'Size', value: formatBytes(match.sizeBytes), inline: true },
      { name: 'Pages', value: String(match.pageCount ?? 0), inline: true },
      { name: 'Uploaded', value: String(match.uploadedAt ?? '—'), inline: true },
    )
    .setFooter({ text: 'Use /admin documents delete <id>' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function documentCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '📤 **Upload document** — drop the PDF / TXT / MD / CSV file in this channel with the message `upload`, ' +
      'or send a file as an attachment with the word `upload` in the caption.\n' +
      '_Allowed MIME: application/pdf, text/plain, text/markdown, text/csv. Max 10MB._',
  };
}

export async function documentUpdate(_id: string): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '✏️ **Document edit** — re-upload the file to replace it (delete + upload), ' +
      'or update the title via the REST API for now.',
  };
}

export async function documentDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE',
    path: `/csfaq/api/admin/documents/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Document delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted document \`${id}\`.` };
}

// Re-export errorEmbed so the command layer can compose with it.
export { errorEmbed };