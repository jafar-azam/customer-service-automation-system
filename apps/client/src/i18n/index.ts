import { DEFAULT_LOCALE, direction, isLocale, LOCALES, type Locale } from '@csas/shared';
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { arLB } from './ar-LB.js';
import { enLB } from './en-LB.js';

/**
 * i18next, configured for Arabic rather than configured and then given Arabic.
 *
 * The two choices that matter:
 *
 * **Regional tags as the keys.** `ar-LB`, not `ar`. Arabic month names differ
 * by region — Lebanon writes `كانون الثاني` where generic CLDR `ar` says
 * `يناير` — so a tag without a region quietly gets the wrong vocabulary.
 * `load: 'currentOnly'` stops i18next helpfully falling back to `ar`.
 *
 * **Plurals from `Intl.PluralRules`.** i18next v26 resolves the suffix through
 * the runtime's own CLDR data, which gives Arabic all six categories. Writing
 * the categories by hand, or treating plural as a binary, is wrong for five of
 * the six and produces text no native speaker would write.
 */

export const STORAGE_KEY = 'csas.locale';

export const resources = {
  'ar-LB': { translation: arLB },
  'en-LB': { translation: enLB },
} as const;

export function readStoredLocale(
  storage: Pick<Storage, 'getItem'> | undefined,
): Locale | undefined {
  const stored = storage?.getItem(STORAGE_KEY);
  return stored !== null && stored !== undefined && isLocale(stored) ? stored : undefined;
}

/**
 * The language the interface opens in.
 *
 * A stored choice always wins. Otherwise the browser's own preference order is
 * consulted by *primary subtag* — a visitor whose browser says `ar-SY` or
 * plain `ar` gets Arabic, because they read Arabic; the region only decides
 * which Arabic, and this product has one. Absent any signal the default is
 * Arabic, because the customers are in Lebanon.
 */
export function chooseLocale(
  stored: Locale | undefined,
  browserLanguages: readonly string[] = [],
): Locale {
  if (stored) return stored;
  for (const candidate of browserLanguages) {
    const [subtag] = candidate.toLowerCase().split('-');
    const match = LOCALES.find((locale) => locale.toLowerCase().startsWith(`${subtag ?? ''}-`));
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/**
 * Puts the language on the document.
 *
 * `lang` and `dir` are set together and only here. They are the two attributes
 * every other rule depends on — `:lang(ar)` for typography, `dir` for layout —
 * so a route that forgets one produces Arabic text in a Latin face, or an RTL
 * language laid out left to right. LOC-01 asserts both.
 */
export function applyLocale(locale: Locale, root: HTMLElement): void {
  root.setAttribute('lang', locale);
  root.setAttribute('dir', direction(locale));
}

export function createI18n(locale: Locale): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: false,
    supportedLngs: [...LOCALES],
    /* Never silently degrade `ar-LB` to `ar`: the vocabulary differs. */
    load: 'currentOnly',
    interpolation: {
      /* React escapes everything it renders, so i18next escaping again turns
         an apostrophe into `&#39;` on screen. Double-escaping is the bug this
         prevents; it is not a relaxation of output encoding. */
      escapeValue: false,
    },
    returnNull: false,
  });
  return instance;
}
