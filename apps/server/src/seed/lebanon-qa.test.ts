import { describe, expect, it } from 'vitest';
import { AWAITING_ANSWER, carriesContact } from './lebanon-qa.js';

/**
 * The data-safety rules, as tests.
 *
 * The import exists to take *questions* from third-party published FAQs. Each
 * assertion below corresponds to a reason the answers are not taken.
 */

describe('carriesContact', () => {
  /* Rejected rather than scrubbed. Scrubbing the answers left `391000`
     behind — a fragment of a real support number — which is the predictable
     outcome of filtering text rather than declining to take it. A question is
     one sentence, so dropping it costs almost nothing. */
  it('spots a Lebanese number in any of its written forms', () => {
    expect(carriesContact('اتصل على +961 3 391111')).toBe(true);
    expect(carriesContact('call 9611391000')).toBe(true);
    expect(carriesContact('اتصل بال1515')).toBe(true);
  });

  it('spots an email address', () => {
    expect(carriesContact('راسلنا على thepeople@example.gov.lb')).toBe(true);
  });

  /* The fragment that survived the scrubbing pass. */
  it('spots a bare run of digits long enough to be a number', () => {
    expect(carriesContact('reference 391000')).toBe(true);
  });

  it('leaves an ordinary question alone', () => {
    expect(carriesContact('كيف يمكنني ان اقدم طلب انترنت؟')).toBe(false);
    expect(carriesContact('How do I renew my contract?')).toBe(false);
  });

  /* A year, a speed or a version is not a phone number, and rejecting those
     would throw away most of the corpus. */
  it('does not reject small numbers that are part of a question', () => {
    expect(carriesContact('هل الخدمة متوفرة بسرعة 100 ميغابت؟')).toBe(false);
    expect(carriesContact('Is version 4.1 affected?')).toBe(false);
  });
});

describe('what lands in the knowledge base', () => {
  /* The body is a placeholder, not the source answer. Someone writes the real
     one for this company's products in step 17's approval queue, and nothing
     reaches a customer before then. */
  it('says plainly that the answer still has to be written', () => {
    expect(AWAITING_ANSWER).toContain('awaiting an answer');
    expect(AWAITING_ANSWER).toContain('deliberately not imported');
  });
});
