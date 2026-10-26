import { describe, expect, it } from 'vitest';
import { detectInputForm } from './input-form.js';

/**
 * Only what the script settles.
 *
 * The register question — Lebanese dialect or MSA — is deliberately not
 * answered here. `inputForm` is recorded once per ticket and Phase 8 reports
 * assistant accuracy per input form, so a confident wrong label does not
 * degrade that report, it corrupts it.
 */

describe('detectInputForm', () => {
  it('reads Latin with digit-letters as Arabizi', () => {
    expect(detectInputForm('el printer 3am ya3mel error ba3ed l update')).toBe('arabizi');
    expect(detectInputForm('kam tlebe fi bl 3a2d?')).toBe('arabizi');
    expect(detectInputForm('ma 7abeit l jaweb')).toBe('arabizi');
  });

  it('reads plain Latin as English', () => {
    expect(detectInputForm('The printer stopped after the update')).toBe('english');
  });

  /* A bare digit is a number. Treating `version 7` as Arabizi would put most
     English support tickets in the wrong bucket, since they are full of
     version numbers and error codes. */
  it('does not mistake numbers in English for Arabizi', () => {
    expect(detectInputForm('Is version 7 affected?')).toBe('english');
    expect(detectInputForm('Error 500 on 3 machines')).toBe('english');
    expect(detectInputForm('I have 2 printers')).toBe('english');
  });

  it('reads both scripts together as code-switching', () => {
    expect(detectInputForm('the printer بطّل يشتغل after the update')).toBe('code_switch');
    /* Code-switching wins over Arabizi: a message mixing scripts is
       code-switching whether or not its Latin half uses digit-letters. */
    expect(detectInputForm('3am ya3mel error بس ما بعرف ليش')).toBe('code_switch');
  });

  /* The honest refusal. Script says "Arabic"; nothing here can say which
     register, and `unknown` is excluded from the Phase 8 report so the ticket
     sits out of the numbers rather than landing in the wrong one. */
  it('leaves the register open for Arabic script', () => {
    expect(detectInputForm('الطابعة توقفت بعد التحديث')).toBe('unknown');
    expect(detectInputForm('بدي ساعدني بليز')).toBe('unknown');
  });

  it('has nothing to say about a bare reference or an empty box', () => {
    expect(detectInputForm('CSAS-000123')).toBe('english');
    expect(detectInputForm('   ')).toBe('unknown');
    expect(detectInputForm('12345')).toBe('unknown');
  });
});
