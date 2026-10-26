import { describe, expect, it } from 'vitest';
import { arabicFromInputForm, arabicFromText } from './reply-language.js';

/**
 * One rule, because there were briefly two.
 *
 * The case below is the actual disagreement, taken from the step 16 live run:
 * a ticket opened in Arabizi (`inputForm: 'arabizi'`) whose question was then
 * typed in Arabic script. The two rules gave that one thread two languages.
 */

describe('arabicFromText', () => {
  it('reads Arabic script', () => {
    expect(arabicFromText('كيف أعيد تشغيل الطابعة بعد التحديث؟')).toBe(true);
  });

  it('does not read Arabizi as Arabic', () => {
    /* Deliberate: a Lebanese Arabizi fixed string is a guess at register the
       Phase 6 reviewers have not seen. English is the lesser of two wrongs. */
    expect(arabicFromText('el printer 3am ya3mel error ba3ed l update')).toBe(false);
  });

  it('does not read English as Arabic', () => {
    expect(arabicFromText('The printer stopped after the update')).toBe(false);
  });

  it('reads Arabic mixed into a code-switched line', () => {
    expect(arabicFromText('the printer بطّل يشتغل after the update')).toBe(true);
  });
});

describe('arabicFromInputForm', () => {
  it('covers both Arabic-script forms', () => {
    expect(arabicFromInputForm('lebanese_arabic')).toBe(true);
    expect(arabicFromInputForm('msa')).toBe(true);
  });

  it('leaves arabizi, english and unknown in English', () => {
    expect(arabicFromInputForm('arabizi')).toBe(false);
    expect(arabicFromInputForm('english')).toBe(false);
    expect(arabicFromInputForm('unknown')).toBe(false);
  });
});

describe('the disagreement this file exists to prevent', () => {
  it('sends one thread one language when the form and the text differ', () => {
    const subject = 'الطابعة توقفت بعد التحديث';
    const inputForm = 'arabizi' as const;

    /* What `rag/respond.ts` and step 16 must now agree on: the text wins. */
    const chosen = arabicFromText(subject) || arabicFromInputForm(inputForm);
    expect(chosen).toBe(true);
  });
});
