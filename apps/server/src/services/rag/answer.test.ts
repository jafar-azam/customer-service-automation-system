import { describe, expect, it, vi } from 'vitest';
import { MockEmbeddings, cosine, normalize } from '../providers/embeddings.js';
import { MockLlm, NO_ANSWER, type LlmProvider, type LlmResponse } from '../providers/llm.js';
import { ask, CONFIDENCE_FLOOR } from './answer.js';
import { KnowledgeIndex } from './retrieve.js';
import { silentLogger } from '../../test-support.js';

/**
 * The decision, driven with fixtures.
 *
 * `ask` touches the database only through the index, so a stubbed index lets
 * every branch be reached without one — including the branches a real model
 * would reach once in a thousand answers.
 */

const embeddings = new MockEmbeddings();
const logger = silentLogger();

/** An index that answers with whatever the test puts in it. */
function indexOf(entries: readonly { id: string; title: string; body: string }[]): KnowledgeIndex {
  const index = new KnowledgeIndex();
  vi.spyOn(index, 'load').mockImplementation(async () => {
    const vectors = await embeddings.embed(entries.map((entry) => `${entry.title} ${entry.body}`));
    return entries.map((entry, position) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      language: 'en' as const,
      version: 1,
      embedding: vectors[position] ?? [],
    }));
  });
  return index;
}

/** A model that says exactly what the test wants it to say. */
function llmSaying(text: string): LlmProvider {
  return {
    name: 'scripted',
    complete: (): Promise<LlmResponse> => Promise.resolve({ text, model: 'scripted-1' }),
  };
}

const SPOOLER = {
  id: '507f1f77bcf86cd799439011',
  title: 'Print spooler stops after upgrade',
  body: 'Stop the print spooler, clear the queue folder, then start it again.',
};

const base = { embeddings, logger } as const;

describe('answering', () => {
  it('answers from a retrieved document and records what it cited', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: new MockLlm(),
    });

    expect(outcome.kind).toBe('answered');
    if (outcome.kind !== 'answered') return;
    expect(outcome.text).toContain('print spooler');
    /* The marker is stripped for display; the citation survives as data. */
    expect(outcome.text).not.toContain('[KB-1]');
    expect(outcome.citations).toHaveLength(1);
    expect(outcome.citations[0]?.kbEntryId).toBe(SPOOLER.id);
    expect(outcome.citations[0]?.version).toBe(1);
  });

  /* The mock is extractive on purpose. A mock that always produced something
     plausible would make every refusal branch below unreachable. */
  it('uses the mock provider as a real extractive answerer', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: new MockLlm(),
    });
    if (outcome.kind !== 'answered') throw new Error('expected an answer');
    expect(outcome.model).toBe('mock-extractive-1');
  });
});

describe('escalating', () => {
  it('escalates when nothing was retrieved', async () => {
    const outcome = await ask('how do I register a company in Lebanon?', {
      ...base,
      index: indexOf([]),
      llm: new MockLlm(),
    });
    expect(outcome).toMatchObject({ kind: 'escalate', reason: 'no_documents', confidence: 0 });
  });

  /* Checked before the model is called: there is no point spending a
     generation on documents we would not trust an answer from. */
  it('escalates on a weak match without calling the model at all', async () => {
    const complete = vi.fn();
    const llm: LlmProvider = { name: 'spy', complete };
    const outcome = await ask('something entirely unrelated to printers', {
      ...base,
      index: indexOf([SPOOLER]),
      llm,
      floor: 0.99,
    });

    expect(outcome.kind).toBe('escalate');
    expect(complete).not.toHaveBeenCalled();
  });

  /* The model refusing is the behaviour the system prompt asks for, so it is
     a success of the design and an escalation for the customer. */
  /* The finding that produced the margin check. Three of the first four live
     questions were answered confidently and wrongly at 0.53-0.62, including
     "how do I register a company in Lebanon?" from an SPSS licensing article.
     The top-two gap was 0.0015 and 0.0000: retrieval had not discriminated,
     and the top of a flat list is noise whatever its absolute score. */
  it('escalates when the ranking is flat, however high the top score', async () => {
    /* Three near-identical documents: whichever wins, it wins by nothing. */
    const outcome = await ask('transfer my licence to a new computer', {
      ...base,
      index: indexOf([
        { id: 'a', title: 'Transfer a licence to a new computer', body: 'Contact the vendor.' },
        { id: 'b', title: 'Transfer a licence to a new machine', body: 'Contact the vendor.' },
        { id: 'c', title: 'Transfer a license to a new computer', body: 'Contact the vendor.' },
      ]),
      llm: new MockLlm(),
    });

    expect(outcome.kind).toBe('escalate');
    if (outcome.kind !== 'escalate') return;
    expect(outcome.reason).toBe('ambiguous');
    /* The absolute score was high — which is exactly the point. */
    expect(outcome.confidence).toBeGreaterThan(CONFIDENCE_FLOOR);
  });

  /* The margin is a *relative* test, so it does not depend on how a model
     scales its scores — unlike the floor, which does. A clear winner passes. */
  it('answers when the best document wins clearly', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([
        SPOOLER,
        { id: 'other', title: 'Renewing a contract', body: 'Contact your account manager.' },
      ]),
      llm: new MockLlm(),
    });
    expect(outcome.kind).toBe('answered');
  });

  /* With one result there is nothing to compare against, so the floor is the
     only guard — the margin must not reject a lone good match. */
  it('does not apply the margin to a single result', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: new MockLlm(),
    });
    expect(outcome.kind).toBe('answered');
  });

  it('escalates when the model declines', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: llmSaying(NO_ANSWER),
    });
    expect(outcome).toMatchObject({ kind: 'escalate', reason: 'model_declined' });
  });

  /* An uncited answer may even be right — but nothing here can tell, and
     "probably right" is not what a maintenance contract pays for. */
  it('escalates an uncited answer, however confident it sounds', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: llmSaying('Just restart the printer. That always fixes it.'),
    });
    expect(outcome).toMatchObject({ kind: 'escalate', reason: 'no_citations' });
  });

  /* The check that catches a model inventing a source — and the one that
     catches an injected instruction telling it to cite something it was
     never shown. */
  it('escalates an answer citing a document that was not retrieved', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: llmSaying('Stop the spooler [KB-7].'),
    });
    expect(outcome).toMatchObject({ kind: 'escalate', reason: 'invalid_citation' });
  });

  it('escalates when the provider fails, rather than inventing an apology', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: {
        name: 'broken',
        complete: () => Promise.reject(new Error('connection refused')),
      },
    });
    expect(outcome).toMatchObject({ kind: 'escalate', reason: 'provider_error' });
  });

  /* An agent picking this up should see what the assistant looked at: it is
     usually the fastest route to the answer, and it is how a gap in the
     knowledge base gets noticed. */
  it('reports what it considered even when it escalates', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: llmSaying('no citation here'),
    });
    if (outcome.kind !== 'escalate') throw new Error('expected an escalation');
    expect(outcome.considered).toHaveLength(1);
    expect(outcome.considered[0]?.kbEntryId).toBe(SPOOLER.id);
  });
});

describe('confidence', () => {
  /* Escalating too often is the cheap failure; answering confidently from a
     weak match is the expensive one. */
  it('is conservative by default', () => {
    expect(CONFIDENCE_FLOOR).toBeGreaterThan(0.25);
  });

  it('reports the score of the document that was actually cited', async () => {
    const outcome = await ask('print spooler stops after upgrade', {
      ...base,
      index: indexOf([SPOOLER]),
      llm: new MockLlm(),
    });
    if (outcome.kind !== 'answered') throw new Error('expected an answer');
    expect(outcome.confidence).toBe(outcome.citations[0]?.score);
    expect(outcome.confidence).toBeGreaterThan(CONFIDENCE_FLOOR);
  });
});

describe('vector arithmetic', () => {
  it('scores identical text at 1 and unrelated text far below', async () => {
    const [a, b, c] = await embeddings.embed([
      'the print spooler has stopped',
      'the print spooler has stopped',
      'renewing a maintenance contract',
    ]);
    expect(cosine(a ?? [], b ?? [])).toBeCloseTo(1, 6);
    expect(cosine(a ?? [], c ?? [])).toBeLessThan(0.5);
  });

  /* A zero vector must stay zero rather than become NaN — empty text should
     score nothing, not poison every comparison it touches. */
  it('does not produce NaN from an empty vector', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
    expect(cosine([0, 0, 0], [1, 0, 0])).toBe(0);
  });

  /* A dimension change should degrade retrieval, not take the endpoint down. */
  it('returns 0 for mismatched dimensions rather than throwing', () => {
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });
});
