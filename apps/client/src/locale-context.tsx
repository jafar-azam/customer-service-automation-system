import { isLocale, type Locale } from '@csas/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  applyLocale,
  chooseLocale,
  createI18n,
  readStoredLocale,
  STORAGE_KEY,
} from './i18n/index.js';

/**
 * The language switcher's state, and the single place `lang`/`dir` are set.
 *
 * Switching language is a document-level change, not a component-level one:
 * the typography rules key on `:lang(ar)` and the layout keys on `dir`, so a
 * component that re-rendered its own text without those attributes changing
 * would show Arabic in a Latin face, laid out left to right.
 */

interface LocaleContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({
  children,
  initial,
  onMissingKey,
}: {
  children: ReactNode;
  initial?: Locale;
  /**
   * Called when a screen asks for a string that does not exist.
   *
   * Only `missing-keys.test.tsx` passes it. A missing key is otherwise
   * silent — `t()` returns the key and React renders it, so a column heading
   * reads `HISTORY.REFERENCE` and looks like a styling fault. Exposing the
   * event here is what lets a test render every screen and assert that none
   * of them fires.
   */
  onMissingKey?: (key: string) => void;
}): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(
    () => initial ?? chooseLocale(readStoredLocale(globalThis.localStorage), navigator.languages),
  );

  const [i18n] = useState(() => createI18n(locale));

  useEffect(() => {
    if (onMissingKey === undefined) return;
    const listener = (_lngs: readonly string[], _ns: string, key: string) => {
      onMissingKey(key);
    };
    i18n.on('missingKey', listener);
    return () => {
      i18n.off('missingKey', listener);
    };
  }, [i18n, onMissingKey]);

  useEffect(() => {
    applyLocale(locale, document.documentElement);
    void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The choice still applies for this session. */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext value={value}>{children}</LocaleContext>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside a LocaleProvider');
  return value;
}
