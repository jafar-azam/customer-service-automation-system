import type { Logger } from 'pino';
import type { EmbeddingsProvider } from '../providers/embeddings.js';
import { NO_ANSWER, type LlmProvider } from '../providers/llm.js';
import { buildPrompt, extractCitations, stripCitations } from './prompt.js';
import { retrieve, type KnowledgeIndex, type RetrievedEntry } from './retrieve.js';

/**
 * Asking the assistant, and deciding whether to believe it.
 *
 * The generation is the easy part. What makes this safe to put in front of a
 * customer is everything that happens **after** the model returns, because a
 * language model will happily produce a fluent, confident, wrong answer and
 * there is no setting that stops it.
 *
 * So the answer is checked against what was retrieved, and anything that fails
 * a check escalates to a human rather than being softened and sent.
 */

export type EscalationReason =
  | 'no_documents'
  | 'low_confidence'
  | 'ambiguous'
  | 'model_declined'
  | 'no_citations'
  | 'invalid_citation'
  | 'provider_error';

export interface Citation {
  readonly kbEntryId: string;
  readonly version: number;
  /** Frozen at answer time — see the note on `citationSchema`. */
  readonly title: string;
  readonly score: number;
}

export type AssistantOutcome =
  | {
      readonly kind: 'answered';
      readonly text: string;
      readonly citations: readonly Citation[];
      readonly confidence: number;
      readonly model: string;
    }
  | {
      readonly kind: 'escalate';
      readonly reason: EscalationReason;
      readonly confidence: number;
      /* What was retrieved even though it was not used. An agent picking this
         up should see what the assistant looked at — it is usually the fastest
         route to the answer, and it is how a gap in the knowledge base gets
         noticed. */
      readonly considered: readonly Citation[];
    };

/**
 * The retrieval score below which an answer is not offered at all.
 *
 * Deliberately conservative. This release has no calibration — step 24 fits a
 * proper threshold against the labelled test set from step 21 and replaces
 * this constant with a measured one. Until then, escalating too often is the
 * cheap failure and answering confidently from a weak match is the expensive
 * one.
 */
export const CONFIDENCE_FLOOR = 0.35;

/**
 * How far ahead the best document must be.
 *
 * The absolute score is a poor signal on its own, and the first live run
 * proved it: three of four questions were answered confidently and wrongly at
 * 0.53-0.62, including "how do I register a company in Lebanon?" answered from
 * an SPSS licensing article. Inspecting the top of the ranking showed why —
 * the gap between first and second place was **0.0015 and 0.0000**. Retrieval
 * had not discriminated at all; it returned a flat spread of mediocre scores
 * and the top of a flat list is noise.
 *
 * A genuine match wins clearly. So the top document must beat the runner-up by
 * this margin, which is a *relative* test and therefore does not depend on how
 * a particular embedding model scales its scores — unlike the floor above,
 * which does.
 *
 * 0.05 is far above the measured noise (0.0015) and far below the separation a
 * real match produces. Step 24 replaces both numbers with calibrated ones.
 */
export const MARGIN_FLOOR = 0.05;

export interface AskOptions {
  readonly index: KnowledgeIndex;
  readonly embeddings: EmbeddingsProvider;
  readonly llm: LlmProvider;
  readonly logger: Logger;
  readonly floor?: number;
  readonly margin?: number;
  readonly signal?: AbortSignal;
}

/**
 * Confidence, honestly named.
 *
 * This is the **retrieval** score of the best cited document, not a
 * probability that the answer is correct — nothing here measures that. It is
 * reported so a human can see why the assistant did what it did, and it is
 * what the threshold compares against.
 *
 * Step 24 replaces it with a calibrated estimate, at which point the name
 * starts being true.
 */
function confidenceFrom(entries: readonly RetrievedEntry[]): number {
  return entries[0]?.score ?? 0;
}

export async function ask(question: string, options: AskOptions): Promise<AssistantOutcome> {
  const floor = options.floor ?? CONFIDENCE_FLOOR;
  const entries = await retrieve(question, options.index, options.embeddings);
  const confidence = confidenceFrom(entries);

  const considered = entries.map((entry) => ({
    kbEntryId: entry.id,
    version: entry.version,
    title: entry.title,
    score: entry.score,
  }));

  if (entries.length === 0) {
    return { kind: 'escalate', reason: 'no_documents', confidence: 0, considered: [] };
  }

  /* Checked *before* calling the model. There is no point spending a
     generation on documents we would not trust the answer from — and on
     Ollama that is seconds of a customer's time. */
  if (confidence < floor) {
    return { kind: 'escalate', reason: 'low_confidence', confidence, considered };
  }

  /* A flat ranking means retrieval found nothing in particular, whatever the
     absolute scores look like. With one result there is nothing to compare
     against, so the floor above is the only guard. */
  const runnerUp = entries[1]?.score ?? 0;
  if (entries.length > 1 && confidence - runnerUp < (options.margin ?? MARGIN_FLOOR)) {
    options.logger.debug(
      { top: confidence, runnerUp },
      'retrieval did not discriminate; escalating',
    );
    return { kind: 'escalate', reason: 'ambiguous', confidence, considered };
  }

  const prompt = buildPrompt(question, entries);

  let response;
  try {
    response = await options.llm.complete(prompt, options.signal);
  } catch (error) {
    /* A provider failure is an escalation, never an apology invented on its
       behalf. Step 18 adds retries, a circuit breaker and a degraded keyword
       mode around this. */
    options.logger.error({ err: error, provider: options.llm.name }, 'llm call failed');
    return { kind: 'escalate', reason: 'provider_error', confidence, considered };
  }

  const text = response.text.trim();

  /* The model saying it cannot answer is a success, not a failure — it is the
     behaviour the system prompt asks for, and it is why the mock has a
     refusal path at all. */
  if (text === '' || text.includes(NO_ANSWER)) {
    return { kind: 'escalate', reason: 'model_declined', confidence, considered };
  }

  const cited = extractCitations(text);

  /* An uncited answer is an ungrounded answer. It may even be right — but
     nothing here can tell, and "probably right" is not what a customer with a
     maintenance contract is paying for. */
  if (cited.length === 0) {
    return { kind: 'escalate', reason: 'no_citations', confidence, considered };
  }

  /* Every citation must be one we actually provided. This is what catches a
     model that invented a document, and what catches an injected instruction
     telling it to cite something it was never shown. */
  const allowed = new Set(prompt.citableIds);
  const invalid = cited.filter((label) => !allowed.has(label));
  if (invalid.length > 0) {
    options.logger.warn(
      { invalid, provider: options.llm.name },
      'answer cited a document that was not retrieved; escalating',
    );
    return { kind: 'escalate', reason: 'invalid_citation', confidence, considered };
  }

  /* Labels back to real entries. The database ids never went to the model, so
     this mapping is the only thing that can produce them — an invented label
     has already been rejected above. */
  const citations = cited
    .map((label) => {
      const position = prompt.citableIds.indexOf(label);
      const entry = entries[position];
      return entry
        ? { kbEntryId: entry.id, version: entry.version, title: entry.title, score: entry.score }
        : undefined;
    })
    .filter((citation): citation is Citation => citation !== undefined);

  return {
    kind: 'answered',
    text: stripCitations(text),
    citations,
    /* The best *cited* document's score, which is not always the best
       retrieved one — if the model used the third document, that is what the
       confidence should reflect. */
    confidence: Math.max(...citations.map((citation) => citation.score)),
    model: response.model,
  };
}
