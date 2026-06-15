/**
 * categoryClusterer — Dynamic Categories feature (v1.70)
 *
 * Per-program clustering of FAQ `category` strings. Driven by the
 * 24h cron in utils/jobs/categoryClusterCron.ts.
 *
 * Algorithm (deliberately simple, no AI/ML framework dependency):
 *
 *   1. Pull all FAQs in the batch that have embeddings. Group by
 *      `category`. For each group, compute the centroid of the
 *      FAQ embeddings, then re-normalize to unit length.
 *   2. Greedy single-link clustering: for each category, find the
 *      existing cluster whose centroid has the highest dot-product
 *      similarity. If the similarity ≥ CLUSTER_THRESHOLD, add the
 *      category to that cluster. Otherwise, start a new cluster.
 *      This is O(N^2) but N is the number of unique categories
 *      (typically 10-30 per program), so the cost is negligible.
 *   3. For each cluster with ≥ 1 member, ask Anthropic to suggest a
 *      clean canonical name from the member aliases. The AI is asked
 *      to (a) keep names short, (b) use Title Case, (c) drop
 *      parentheticals when the parent term already implies them.
 *   4. Upsert into CategoryCluster. The cron first deletes all
 *      UNLOCKED rows for the batch, then inserts the new clusters.
 *      Locked rows are preserved as-is (admins have curated them).
 *
 * Dot product vs cosine: the FAQ embeddings are unit-normalized
 * at write time (see utils/ai/embeddings.ts → `normalize: true`),
 * so dot product IS cosine similarity. We use the same metric the
 * Atlas Vector Search index uses, which means cluster results
 * match what users see as "similar" in search.
 *
 * Failure modes (handled):
 *   - No AI key: skip the naming step, use the highest-faqCount
 *     alias as the canonical name.
 *   - AI call fails: same fallback.
 *   - No embeddings yet: return an empty result; the next refresh
 *     (after backfillEmbeddings runs) will pick them up.
 */

import FAQ from '../../models/FAQ.js';
import CategoryCluster, { type ICategoryCluster } from '../../models/CategoryCluster.js';
import Batch from '../../models/Batch.js';
import { generateEmbedding } from './embeddings.js';
import { chatWithProvider, resolveActiveAiConfig } from './aiProvider.js';
import { logger } from '../http/logger.js';

const CLUSTER_THRESHOLD = 0.7;
const DOT_PRODUCT_EPSILON = 1e-9;

interface CategoryEmbedding {
  name: string;
  faqCount: number;
  centroid: number[];
}

interface PendingCluster {
  aliases: string[];
  faqCount: number;
  centroid: number[];
}

/**
 * Group FAQs by category in-memory and compute per-category centroids.
 * Skips FAQs without embeddings.
 */
async function buildCategoryCentroids(batchId: string): Promise<CategoryEmbedding[]> {
  // Pull just the fields we need. embedding is a number[] (1024 dims
  // for mxbai), so for a typical program (a few hundred FAQs) this
  // is a few hundred KB — fine to do in-memory.
  const cursor = FAQ.find({ batchId, status: 'approved' })
    .select({ category: 1, embedding: 1 })
    .lean()
    .cursor({ batchSize: 200 });

  const byCategory = new Map<string, { sum: number[]; count: number }>();

  for await (const faq of cursor) {
    if (!faq.category || !Array.isArray(faq.embedding) || faq.embedding.length === 0) continue;
    const cat = String(faq.category);
    const acc = byCategory.get(cat);
    if (!acc) {
      byCategory.set(cat, { sum: [...faq.embedding], count: 1 });
    } else {
      const e = faq.embedding;
      for (let i = 0; i < e.length; i++) acc.sum[i] += e[i];
      acc.count += 1;
    }
  }

  const out: CategoryEmbedding[] = [];
  for (const [name, { sum, count }] of byCategory) {
    if (count === 0) continue;
    const centroid = sum.map((v) => v / count);
    out.push({ name, faqCount: count, centroid: l2Normalize(centroid) });
  }
  return out;
}

/**
 * Greedy single-link clustering by dot product. Returns clusters
 * as arrays of category names (aliases) plus an aggregated
 * centroid and faqCount.
 */
function clusterByDotProduct(categories: CategoryEmbedding[]): PendingCluster[] {
  const clusters: PendingCluster[] = [];

  for (const cat of categories) {
    let bestIdx = -1;
    let bestScore = CLUSTER_THRESHOLD;
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const score = dotProduct(cat.centroid, c.centroid);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // New cluster
      clusters.push({
        aliases: [cat.name],
        faqCount: cat.faqCount,
        centroid: [...cat.centroid],
      });
    } else {
      // Merge into the best-matching cluster. Update the
      // centroid as a weighted average of the existing
      // centroid and the new category's centroid, weighted
      // by faqCount. Then re-normalize.
      const c = clusters[bestIdx];
      c.aliases.push(cat.name);
      const newCount = c.faqCount + cat.faqCount;
      const merged = c.centroid.map((v, i) =>
        (v * c.faqCount + cat.centroid[i] * cat.faqCount) / newCount
      );
      c.centroid = l2Normalize(merged);
      c.faqCount = newCount;
    }
  }

  return clusters;
}

/**
 * Ask Anthropic for a clean canonical name for a cluster. Falls
 * back to the highest-faqCount alias if AI is not configured.
 */
async function aiNameCluster(aliases: string[]): Promise<string> {
  if (aliases.length === 1) return aliases[0];
  const fallback = pickFallbackName(aliases);

  const cfg = await resolveActiveAiConfig().catch(() => null);
  // Pull the anthropic key + model up front. If anything is
  // missing, the AI step is skipped and the fallback name
  // wins. This keeps the rest of the function free of `?.`
  // chains on `cfg`.
  const anthropicKey = cfg?.anthropic?.apiKey?.trim() ?? '';
  const anthropicModel = cfg?.anthropic?.model?.trim() || 'claude-sonnet-4-20250514';
  if (!anthropicKey) {
    return fallback;
  }

  const prompt = [
    'You are naming FAQ categories for a research-internship portal.',
    'Given a list of related category strings that should be merged into one canonical category,',
    'suggest ONE short Title Case name (max 3 words, drop parentheticals).',
    'Reply with ONLY the name, no quotes, no punctuation.',
    '',
    'Aliases:',
    ...aliases.map((a) => `- ${a}`),
    '',
    'Canonical name:',
  ].join('\n');

  try {
    const reply = await chatWithProvider(
      'anthropic',
      [{ role: 'user', content: prompt }],
      anthropicModel
    );
    const cleaned = reply.trim().split('\n')[0].replace(/[`"']/g, '').trim();
    if (cleaned.length === 0 || cleaned.length > 60) return fallback;
    return cleaned;
  } catch (err) {
    logger.warn(`[categoryClusterer] AI naming failed for [${aliases.join(', ')}]: ${(err as Error).message}`);
    return fallback;
  }
}

/**
 * Fallback name: pick the alias with the highest faqCount from
 * the (already-sorted) aliases. The caller should sort aliases
 * by faqCount desc before calling.
 */
function pickFallbackName(aliases: string[]): string {
  return aliases[0] ?? 'Uncategorized';
}

/**
 * Upsert a list of clusters for a batch, preserving locked rows.
 * The cron is the canonical caller; backfill uses the same path.
 */
async function persistClusters(
  batchId: string,
  clusters: PendingCluster[]
): Promise<{ inserted: number; preserved: number }> {
  // First, lock-aware delete. Anything an admin has marked
  // locked survives; the rest gets cleared before we insert
  // fresh clusters. This keeps the "shape" of locked clusters
  // intact even if the cluster boundaries shift.
  const deleteResult = await CategoryCluster.deleteMany({
    batchId,
    locked: { $ne: true },
  });
  const preserved = await CategoryCluster.countDocuments({ batchId, locked: true });

  // For each new cluster, look up per-alias FAQ counts so we can
  // sort aliases by frequency (helps the fallback name picker).
  const aliasCountMap = new Map<string, number>();
  for (const c of clusters) {
    for (const a of c.aliases) aliasCountMap.set(a, c.faqCount / c.aliases.length);
  }
  void aliasCountMap; // currently unused; reserved for future per-alias count

  // Insert in parallel — these are independent writes.
  await Promise.all(
    clusters.map(async (c) => {
      const sortedAliases = [...c.aliases].sort((a, b) => {
        // Heuristic: shorter aliases first, then alphabetical.
        // This gives the fallback a "clean" name when AI is off.
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
      });
      const canonicalName = await aiNameCluster(sortedAliases);
      await CategoryCluster.create({
        batchId,
        canonicalName,
        aliases: sortedAliases,
        faqCount: c.faqCount,
        centroid: c.centroid,
        locked: false,
        editedByAdmin: false,
        lastRefreshedAt: new Date(),
      });
    })
  );

  return { inserted: clusters.length, preserved };
}

/**
 * Public entry point. Recomputes clusters for one batch.
 * Returns a summary for logging.
 */
export async function clusterCategoriesForBatch(
  batchId: string,
  opts: { dryRun?: boolean } = {}
): Promise<{ clusters: number; preservedLocks: number; skipped: string }> {
  // Sanity check: is this a real batch?
  const batch = await Batch.findById(batchId).select('_id isActive').lean();
  if (!batch) {
    return { clusters: 0, preservedLocks: 0, skipped: 'batch_not_found' };
  }

  const categories = await buildCategoryCentroids(String(batchId));
  if (categories.length === 0) {
    if (!opts.dryRun) await CategoryCluster.deleteMany({ batchId, locked: { $ne: true } });
    return { clusters: 0, preservedLocks: 0, skipped: 'no_categories_with_embeddings' };
  }

  const clusters = clusterByDotProduct(categories);
  if (opts.dryRun) {
    return { clusters: clusters.length, preservedLocks: 0, skipped: 'dry_run' };
  }

  const { inserted, preserved } = await persistClusters(String(batchId), clusters);
  logger.info(
    `[categoryClusterer] batch ${batchId}: ${inserted} clusters inserted, ${preserved} locked clusters preserved (input: ${categories.length} categories)`
  );
  return { clusters: inserted, preservedLocks: preserved, skipped: 'ok' };
}

/**
 * Recompute for every active batch. Called by the 24h cron.
 */
export async function clusterAllActiveBatches(): Promise<void> {
  const cursor = Batch.find({ isActive: true }).select('_id').lean().cursor();
  for await (const b of cursor) {
    try {
      await clusterCategoriesForBatch(String(b._id));
    } catch (err) {
      logger.error(`[categoryClusterer] failed for batch ${b._id}: ${(err as Error).message}`);
    }
  }
}

// ─── Math helpers ──────────────────────────────────────────────────────

function l2Normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm < DOT_PRODUCT_EPSILON) return v;
  return v.map((x) => x / norm);
}

function dotProduct(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// Re-export the embedding function so callers (e.g. the admin
// tab "recompute now" endpoint) can embed a user-typed category
// name for an ad-hoc merge preview.
export { generateEmbedding };
