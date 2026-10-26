import mongoose, { type Types } from 'mongoose';
import type { Logger } from 'pino';
import { KbEntry } from '../../db/models/index.js';
import { cosine, type EmbeddingsProvider } from '../providers/embeddings.js';

/**
 * Finding the handful of knowledge-base entries an answer may be built from.
 *
 * **Why this is not `$vectorSearch`.** That operator exists only on MongoDB
 * Atlas. This release runs on self-hosted Community in Docker — a hard
 * constraint from section 0 — so the vector comparison happens here, in the
 * application, over an index held in memory.
 *
 * That is a real trade and worth stating. It costs memory proportional to the
 * knowledge base (a few thousand entries at 256 or 384 dimensions is single-
 * digit megabytes) and a linear scan per query (microseconds at that size).
 * It stops being the right answer somewhere in the low hundreds of thousands
 * of entries, at which point a vector database is the move — which is why
 * that is in `PRODUCTION.md` rather than pretended away here.
 *
 * Retrieval is **hybrid**: lexical and vector scores are combined. Neither is
 * sufficient alone. Lexical matching cannot connect Arabizi to Arabic script,
 * because the characters have nothing in common; vector matching is weak on
 * exact identifiers — a customer quoting `KB-0412` or an error code wants that
 * entry, not the one that is semantically nearby.
 */

export interface RetrievedEntry {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly language: 'ar' | 'en';
  readonly version: number;
  readonly score: number;
  readonly vectorScore: number;
  readonly lexicalScore: number;
}

interface IndexedEntry {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly language: 'ar' | 'en';
  readonly version: number;
  readonly embedding: readonly number[];
}

/** How much each signal contributes. Lexical is the tie-breaker, not the lead. */
export const VECTOR_WEIGHT = 0.7;
export const LEXICAL_WEIGHT = 0.3;

/**
 * The in-memory vector index.
 *
 * Loaded lazily and invalidated explicitly, rather than refreshed on a timer:
 * a timer means a newly approved entry is invisible for up to its interval,
 * and the KB approval flow in step 17 knows exactly when something changed.
 *
 * One instance per process. Two server containers each hold their own copy,
 * which is correct — it is a cache of a shared source, not shared state.
 */
export class KnowledgeIndex {
  private entries: IndexedEntry[] | undefined;
  private loading: Promise<IndexedEntry[]> | undefined;

  constructor(private readonly logger?: Logger) {}

  /** Called by step 17 whenever an entry is approved, edited or archived. */
  invalidate(): void {
    this.entries = undefined;
    this.loading = undefined;
  }

  get size(): number {
    return this.entries?.length ?? 0;
  }

  async load(): Promise<IndexedEntry[]> {
    if (this.entries) return this.entries;
    /* Concurrent callers share one load. Without this, ten simultaneous
       questions on a cold process each pull the whole knowledge base. */
    this.loading ??= this.read();
    this.entries = await this.loading;
    return this.entries;
  }

  private async read(): Promise<IndexedEntry[]> {
    const rows = await KbEntry.find({
      /* Only approved content. A draft is someone's unfinished thought and an
         archived entry was withdrawn for a reason; neither may be quoted to a
         customer. The filter is in the query so no caller can forget it. */
      status: 'approved',
      embedding: { $exists: true, $ne: [] },
    })
      .select('title body language version embedding')
      .lean<
        {
          _id: Types.ObjectId;
          title: string;
          body: string;
          language: 'ar' | 'en';
          version: number;
          embedding: number[];
        }[]
      >()
      .exec();

    this.logger?.info({ entries: rows.length }, 'knowledge index loaded');

    return rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      body: row.body,
      language: row.language,
      version: row.version,
      embedding: row.embedding,
    }));
  }
}

/** How long the lexical half may take before the answer proceeds without it. */
const LEXICAL_TIMEOUT_MS = 2_000;

/** Candidate generation by MongoDB's text index, for the lexical half. */
async function lexicalCandidates(question: string, limit: number): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  /* An empty or punctuation-only question makes `$text` throw rather than
     return nothing, so it is checked rather than caught. */
  const cleaned = question.replace(/["\\]/g, ' ').trim();
  if (cleaned === '') return scores;

  /* Mongoose buffers a query issued while disconnected and resolves it if the
     connection ever returns — which means a down database makes this hang
     forever rather than fail. The documented behaviour below is "degrade to
     vector-only", and this is what makes that true: without the readiness
     check the catch is unreachable, which is how the first run of the answer
     tests timed out instead of passing. */
  /* `ConnectionStates.connected`, named rather than the literal 1 — the
     numeric comparison is also what the lint rule objects to. */
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) return scores;

  try {
    const rows = await KbEntry.find(
      { status: 'approved', $text: { $search: cleaned } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      /* A server-side cap as well: a text scan over a large collection must
         not hold a customer's question open. */
      .maxTimeMS(LEXICAL_TIMEOUT_MS)
      .lean<{ _id: Types.ObjectId; score: number }[]>()
      .exec();

    /* Squashed, not normalised against the best in the set.
     *
     * The first version divided by the top score, which guaranteed the best
     * text match always scored exactly 1.0 — however weak it actually was.
     * With a few hundred entries almost any question produces *some* text
     * match, so every answer gained a flat 0.3 and unrelated documents came
     * back at 0.6+ confidence. Three of the first four live questions were
     * answered confidently and wrongly because of it.
     *
     * `raw / (raw + 1)` is monotone, so it preserves ranking, and saturating,
     * so it maps an unbounded MongoDB text score into [0, 1) without ever
     * inventing certainty. A raw score of 1 becomes 0.5, 2 becomes 0.67. */
    for (const row of rows) scores.set(String(row._id), row.score / (row.score + 1));
  } catch {
    /* A malformed text query must degrade to vector-only rather than fail the
       question. MongoDB Community has no Arabic stemmer, so the lexical half
       is weak on Arabic anyway — losing it is survivable. */
    return scores;
  }

  return scores;
}

export interface RetrieveOptions {
  readonly limit?: number;
  /** Below this, a result is not worth showing a model at all. */
  readonly floor?: number;
}

export const DEFAULT_LIMIT = 5;
export const SCORE_FLOOR = 0.15;

export async function retrieve(
  question: string,
  index: KnowledgeIndex,
  embeddings: EmbeddingsProvider,
  options: RetrieveOptions = {},
): Promise<RetrievedEntry[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const floor = options.floor ?? SCORE_FLOOR;

  const [entries, [queryVector], lexical] = await Promise.all([
    index.load(),
    embeddings.embed([question]),
    lexicalCandidates(question, limit * 4),
  ]);

  if (!queryVector || entries.length === 0) return [];

  const scored = entries.map((entry) => {
    const vectorScore = cosine(queryVector, entry.embedding);
    const lexicalScore = lexical.get(entry.id) ?? 0;
    return {
      id: entry.id,
      title: entry.title,
      body: entry.body,
      language: entry.language,
      version: entry.version,
      vectorScore,
      lexicalScore,
      score: VECTOR_WEIGHT * vectorScore + LEXICAL_WEIGHT * lexicalScore,
    };
  });

  return scored
    .filter((entry) => entry.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
