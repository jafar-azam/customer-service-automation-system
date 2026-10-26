import type { TFunction } from 'i18next';
import type { ApiErrorBody } from './client.js';

/**
 * Turns an API error into something a customer can read.
 *
 * The server's `message` is English and written for whoever is reading a log —
 * "Authentication is required". Rendering it put an English sentence in the
 * middle of an Arabic page, which is what the first run of these screens did.
 *
 * So the **code** is the contract and the message is a developer detail. A
 * code with no translation falls back to a generic sentence in the right
 * language rather than to the English one, because a vague sentence the reader
 * can read beats a precise one they cannot.
 */
export function describeError(error: ApiErrorBody, t: TFunction): string {
  const key = `error.${error.code}`;
  const translated = t(key, { defaultValue: '' });
  return translated === '' ? t('error.unknown') : translated;
}

/** Whether this is "you are not signed in" rather than a failure. */
export function isUnauthenticated(error: ApiErrorBody): boolean {
  return error.code === 'unauthenticated';
}
