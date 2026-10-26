import type { InputForm } from '@csas/shared';

/**
 * Which language a system-generated line is written in.
 *
 * One rule in one place, because there were briefly two. `rag/respond.ts`
 * chose the script of the question the customer had just typed; step 16's
 * resolution messages chose from the ticket's recorded `inputForm`. Both were
 * defensible and they disagreed on a real ticket during the step 16 live run:
 * `CSAS-000054` was opened in Arabizi, so `inputForm` was `arabizi`, but the
 * question put to the assistant was typed in Arabic script. The assistant
 * handed over in Arabic and the resolution prompt came back in English, in the
 * same thread, to the same person.
 *
 * **Text wins when there is text.** What someone just typed is better evidence
 * of what they want to read than a label set from their first message days
 * earlier — a customer who switches script has told you something, and
 * `inputForm` is deliberately not updated per message (step 11) because it
 * records how the ticket was *opened*, which is what Phase 8 reports on.
 *
 * **Arabizi gets English**, which is the lesser of two wrongs and the decision
 * `rag/respond.ts` already recorded: a Lebanese Arabizi fixed string written by
 * me is a guess at register that the Phase 6 reviewers have not seen, and these
 * lines are read at a bad moment.
 */

/**
 * Arabic script, including the presentation forms a copy-paste can carry.
 *
 * Escapes rather than literal characters. Written out, the ranges end at
 * U+FEFF and the linter rejects that as irregular whitespace — correctly, since
 * a zero-width character sitting inside a character class is invisible in
 * review and impossible to diff.
 */
const ARABIC_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;

/** The preferred signal: what the customer actually wrote. */
export function arabicFromText(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/**
 * The fallback, for a line with no customer text behind it — a resolution
 * prompt, a closing note, an SLA message from a job.
 */
export function arabicFromInputForm(form: InputForm): boolean {
  return form === 'lebanese_arabic' || form === 'msa';
}
