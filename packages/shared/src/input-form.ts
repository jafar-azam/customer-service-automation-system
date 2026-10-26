import type { InputForm } from './domain.js';

/**
 * What a customer appears to be writing in, from the script alone.
 *
 * This answers the part of the question that writing system actually settles,
 * and refuses the part it does not.
 *
 * **Knowable from the text:** whether it is Arabic script, Latin script, both,
 * or Latin script using the digit-letters that define Arabizi — `3` for ع,
 * `7` for ح, `2` for ء, `5` for خ, `9` for ق. Those are orthographic facts.
 *
 * **Not knowable:** whether Arabic script is Lebanese dialect or MSA. `بدي`
 * and `أريد` both exist in both registers in practice, and telling them apart
 * is a model's job — step 19's dialect identification, used there as triage
 * rather than as ground truth. So pure Arabic script returns `unknown`, which
 * is what that enum member is for.
 *
 * Guessing instead would be worse than useless: `inputForm` is recorded once
 * per ticket and **Phase 8 reports assistant accuracy per input form**. A
 * confident wrong label does not degrade that report, it corrupts it —
 * `REPORTED_INPUT_FORMS` excludes `unknown` precisely so an undetermined
 * ticket sits out of the numbers instead of landing in the wrong bucket.
 */

/* Escapes, not literal characters: written out, the ranges end at U+FEFF and
   the linter rejects it as irregular whitespace — correctly, since a
   zero-width character inside a character class is invisible in review. */
const ARABIC_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;
const LATIN_LETTER = /[A-Za-z]/;

/**
 * A digit standing in for an Arabic letter — the marker of Arabizi.
 *
 * It has to be adjacent to a Latin letter. A bare `3` is the number three, and
 * `version 7` is not Arabizi; `3am`, `7ekeh` and `ma2loub` are.
 */
const ARABIZI_DIGIT = /(?:[A-Za-z][23579]|[23579][A-Za-z])/;

export function detectInputForm(text: string): InputForm {
  const trimmed = text.trim();
  if (trimmed === '') return 'unknown';

  const hasArabic = ARABIC_SCRIPT.test(trimmed);
  const hasLatin = LATIN_LETTER.test(trimmed);

  /* Both scripts in one message. Checked before Arabizi, because a message
     mixing Arabic script with Latin words is code-switching whether or not
     the Latin part also uses digit-letters. */
  if (hasArabic && hasLatin) return 'code_switch';

  /* Arabic script alone: the register is the open question, so it stays
     open. */
  if (hasArabic) return 'unknown';

  if (hasLatin) return ARABIZI_DIGIT.test(trimmed) ? 'arabizi' : 'english';

  /* Digits, punctuation or emoji only — a reference number pasted on its own,
     usually. Nothing to detect. */
  return 'unknown';
}
