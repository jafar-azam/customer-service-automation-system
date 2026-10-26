import type { Logger } from 'pino';
import type { PromptParts } from '../rag/prompt.js';

/**
 * Generating the answer.
 *
 * **The mock is extractive, not decorative.** It returns the most relevant
 * document's text with a real citation, and refuses when nothing was
 * retrieved. That is the same reasoning as the EICAR-detecting virus scanner
 * in step 12: a mock that always produces something plausible makes the
 * refusal path unreachable, and nobody discovers it is broken until a customer
 * is relying on it.
 *
 * It is also honestly limited. It does not summarise, does not combine two
 * documents, and does not answer in the customer's language if the document is
 * in another. It proves the pipeline — retrieval, citation, grounding,
 * escalation — and `ollama` is what makes the answers good.
 */

export interface LlmResponse {
  readonly text: string;
  readonly model: string;
  /** What the provider itself reports, where it reports anything. */
  readonly tokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(prompt: PromptParts, signal?: AbortSignal): Promise<LlmResponse>;
}

/** What a provider says when the documents do not answer the question. */
export const NO_ANSWER = 'NO_ANSWER';

/**
 * Pulls the first document's body back out of the built prompt.
 *
 * The mock deliberately reads the same string the real model would, rather
 * than being handed the entries separately. If `buildPrompt` ever produces
 * something malformed, the mock breaks in tests instead of the fault being
 * invisible until a real model is attached.
 */
export function firstDocument(user: string): { id: string; body: string } | undefined {
  const match =
    /<document id="(KB-\d+)"[^>]*>\n(?:title: ([^\n]*)\n)?([\s\S]*?)\n<\/document>/.exec(user);
  if (!match) return undefined;
  return { id: match[1] ?? '', body: (match[3] ?? '').trim() };
}

export class MockLlm implements LlmProvider {
  readonly name = 'mock';

  complete(prompt: PromptParts): Promise<LlmResponse> {
    const document = firstDocument(prompt.user);

    if (!document || prompt.citableIds.length === 0) {
      /* The refusal path, reachable and therefore testable. */
      return Promise.resolve({ text: NO_ANSWER, model: 'mock-extractive-1' });
    }

    return Promise.resolve({
      text: `${document.body} [${document.id}]`,
      model: 'mock-extractive-1',
    });
  }
}

/**
 * Ollama, running locally behind the `llm` Compose profile.
 *
 * Not in the default stack because the smallest useful model is about 3 GB,
 * and section 0 caps the default footprint at roughly 2.5 GB of RAM. A
 * reviewer who wants real answers turns it on; everyone else gets a working
 * pipeline.
 */
export class OllamaLlm implements LlmProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly logger?: Logger,
    private readonly timeoutMs = 60_000,
  ) {}

  async complete(prompt: PromptParts, signal?: AbortSignal): Promise<LlmResponse> {
    /* The caller's signal and our own timeout both apply: a request the
       customer abandoned should stop, and one the model never finishes must
       not hold a connection open indefinitely. */
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        options: {
          /* Low but not zero. Zero makes a small model repeat itself when it
             is unsure, which reads as confidence it does not have. */
          temperature: 0.2,
          num_predict: 512,
        },
      }),
      signal: combined,
    });

    if (!response.ok) {
      this.logger?.error({ status: response.status }, 'ollama request failed');
      throw new Error(`llm: ${String(response.status)}`);
    }

    const body = (await response.json()) as {
      message?: { content?: string };
      eval_count?: number;
    };

    return {
      text: body.message?.content ?? NO_ANSWER,
      model: this.model,
      ...(body.eval_count === undefined ? {} : { tokens: body.eval_count }),
    };
  }
}

export function createLlm(
  provider: 'mock' | 'ollama',
  options: { readonly baseUrl: string; readonly model: string; readonly logger?: Logger },
): LlmProvider {
  return provider === 'ollama'
    ? new OllamaLlm(options.baseUrl, options.model, options.logger)
    : new MockLlm();
}
