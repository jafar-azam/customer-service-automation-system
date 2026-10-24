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
}: {
  children: ReactNode;
  initial?: Locale;
}): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(
    () => initial ?? chooseLocale(readStoredLocale(globalThis.localStorage), navigator.languages),
  );

  const [i18n] = useState(() => createI18n(locale));

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
