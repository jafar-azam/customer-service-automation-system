import { createHash } from 'node:crypto';
import type { Logger } from 'pino';

/**
 * Turning text into a vector.
 *
 * Two implementations, and the difference between them is the difference
 * between "the pipeline works" and "the answers are good".
 *
 * **The mock is lexical, not semantic.** It hashes character trigrams into a
 * fixed number of buckets, so near-identical text scores highly and unrelated
 * text does not. That is enough to exercise retrieval, ranking, thresholds and
 * citation enforcement without a model — but it will not connect "الطابعة لا
 * تطبع" to "printer won't print", because nothing in it understands either.
 *
 * **The real one is `local`**, behind the ML service, where a sentence
 * transformer does understand that. The research in `arabic-data.md` compares
 * candidates; step 25 fine-tunes one.
 *
 * Saying this plainly matters because a mock that silently produced plausible
 * similarity scores would make the retrieval evaluation in step 21 meaningless
 * — it would be measuring the hash.
 */

export interface EmbeddingsProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** Small enough to hold thousands in memory, wide enough to separate them. */
const MOCK_DIMENSIONS = 256;

/**
 * Normalises before hashing.
 *
 * Arabic diacritics, the several forms of alef, and the final-ya/alef-maqsura
 * confusion all produce different bytes for text a reader considers
 * identical. Folding them is the minimum that makes a lexical match useful on
 * Arabic at all; the full normalisation policy is step 19's.
 */
export function normalizeForMatching(text: string): string {
  return (
    text
      .toLowerCase()
      /* Arabic diacritics (tashkeel) and the tatweel stretching character. */
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function trigrams(text: string): string[] {
  const padded = ` ${normalizeForMatching(text)} `;
  const grams: string[] = [];
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    grams.push(padded.slice(index, index + 3));
  }
  return grams;
}

function bucketFor(gram: string, dimensions: number): number {
  const digest = createHash('sha256').update(gram).digest();
  return digest.readUInt32BE(0) % dimensions;
}

export class MockEmbeddings implements EmbeddingsProvider {
  readonly name = 'mock';
  readonly dimensions = MOCK_DIMENSIONS;

  embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.one(text)));
  }

  private one(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const gram of trigrams(text)) {
      const bucket = bucketFor(gram, this.dimensions);
      vector[bucket] = (vector[bucket] ?? 0) + 1;
    }
    /* Unit length, so cosine similarity is a dot product and a long document
       does not outrank a short one simply by having more of everything. */
    return normalize(vector);
  }
}

/**
 * The ML service.
 *
 * It holds the model, so the Node process never loads one — which keeps the
 * server's memory flat and means a model change is a deployment of one
 * container rather than both.
 */
export class MlEmbeddings implements EmbeddingsProvider {
  readonly name = 'local';

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    readonly dimensions: number,
    private readonly logger?: Logger,
    private readonly timeoutMs = 20_000,
  ) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/v1/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      this.logger?.error({ status: response.status }, 'embedding request failed');
      throw new Error(`embeddings: ${String(response.status)}`);
    }

    const body = (await response.json()) as { vectors: number[][] };
    return body.vectors.map((vector) => normalize(vector));
  }
}

/* ── Vector arithmetic ──────────────────────────────────────────────────── */

export function normalize(vector: readonly number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  /* A zero vector stays zero rather than becoming NaN — empty or
     unnormalisable text should score nothing, not poison every comparison it
     touches. */
  return length === 0 ? [...vector] : vector.map((value) => value / length);
}

/**
 * Cosine similarity of two **already normalised** vectors.
 *
 * A dot product, because both sides are unit length. Callers that build
 * vectors elsewhere must normalise first; mismatched lengths return 0 rather
 * than throwing, because a dimension change should degrade retrieval rather
 * than take the endpoint down.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += (a[index] ?? 0) * (b[index] ?? 0);
  }
  return total;
}

export function createEmbeddings(
  provider: 'mock' | 'local',
  options: { readonly baseUrl: string; readonly token: string; readonly logger?: Logger },
): EmbeddingsProvider {
  return provider === 'local'
    ? new MlEmbeddings(options.baseUrl, options.token, 384, options.logger)
    : new MockEmbeddings();
}
