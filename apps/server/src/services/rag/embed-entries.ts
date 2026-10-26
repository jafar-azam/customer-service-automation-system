import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import { KbEntry } from '../../db/models/index.js';
import type { EmbeddingsProvider } from '../providers/embeddings.js';

/**
 * Giving knowledge-base entries the vectors retrieval needs.
 *
 * This exists because the first real run of the assistant found 618 approved
 * entries and **zero embeddings**: the seed imports content, the approval flow
 * marks it usable, and nothing in between ever computed a vector. Every
 * question escalated with `no_documents`, correctly and uselessly.
 *
 * An entry is re-embedded when its vector is missing, when its text has
 * changed since the vector was written, or when it was produced by a
 * different model. That last one matters more than it looks: vectors from two
 * different models are not comparable, so a mixed index does not degrade
 * gracefully — it ranks nonsense confidently.
 */

export interface BackfillResult {
  readonly embedded: number;
  readonly skipped: number;
}

/** Batched so a large knowledge base does not become one enormous request. */
const BATCH = 32;

interface Pending {
  _id: Types.ObjectId;
  title: string;
  body: string;
  question?: string;
  updatedAt: Date;
}

/**
 * What gets embedded.
 *
 * Title, question and body together. The title alone is too short to separate
 * two entries about printing; the body alone loses the phrasing a customer is
 * most likely to echo, which is usually the question.
 */
export function textFor(entry: { title: string; body: string; question?: string }): string {
  return [entry.title, entry.question ?? '', entry.body].filter(Boolean).join('\n');
}

export async function backfillEmbeddings(
  embeddings: EmbeddingsProvider,
  logger: Logger,
  limit = 2_000,
): Promise<BackfillResult> {
  const pending = await KbEntry.find({
    status: 'approved',
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      /* A different model, or a different width from the same one. */
      { embeddingModel: { $ne: embeddings.name } },
      { embeddingDim: { $ne: embeddings.dimensions } },
      /* Edited since it was embedded. `$expr` rather than a computed query,
         because the comparison is between two fields of the same document. */
      { $expr: { $lt: ['$embeddingUpdatedAt', '$updatedAt'] } },
    ],
  })
    .select('title body question updatedAt')
    .limit(limit)
    .lean<Pending[]>()
    .exec();

  if (pending.length === 0) return { embedded: 0, skipped: 0 };

  logger.info(
    { pending: pending.length, provider: embeddings.name },
    'embedding knowledge-base entries',
  );

  let embedded = 0;
  let skipped = 0;

  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);

    let vectors;
    try {
      vectors = await embeddings.embed(batch.map((entry) => textFor(entry)));
    } catch (error) {
      /* A provider failure stops this batch, not the process. The entries
         stay unembedded and are picked up by the next run — which is better
         than a half-written batch nobody notices. */
      logger.error({ err: error, batch: batch.length }, 'embedding batch failed');
      skipped += batch.length;
      continue;
    }

    const now = new Date();
    await KbEntry.bulkWrite(
      batch.map((entry, position) => ({
        updateOne: {
          filter: { _id: entry._id },
          update: {
            $set: {
              embedding: vectors[position] ?? [],
              embeddingModel: embeddings.name,
              embeddingDim: embeddings.dimensions,
              embeddingUpdatedAt: now,
            },
          },
        },
      })),
    );
    embedded += batch.length;
  }

  logger.info({ embedded, skipped }, 'embedding backfill complete');
  return { embedded, skipped };
}
