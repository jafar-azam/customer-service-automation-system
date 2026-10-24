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

/**
 * Theme as a three-state choice, not a boolean.
 *
 * `system` is a real state, distinct from light and dark: it means "follow the
 * operating system", and a user who picks it expects their interface to change
 * when their system does at dusk. Storing a boolean collapses that, which is
 * why so many theme toggles stop following the system the moment they are
 * touched once.
 *
 * The CSS mirrors this exactly — `tokens.css` defines dark under both
 * `prefers-color-scheme` and `[data-theme='dark']`, and defends light with
 * `:not([data-theme='light'])`.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'csas.theme';

export function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

/**
 * Writes the choice to the document.
 *
 * `system` *removes* the attribute rather than setting it to "system": the
 * stylesheet's media query is then the only thing deciding, which is what
 * following the system means.
 */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

interface ThemeContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Theme;
}): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (initial) return initial;
    const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  });

  useEffect(() => {
    applyTheme(theme, document.documentElement);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    /* Storage can throw — Safari in private mode, or a blocked third-party
       context. A failed preference must not take the interface down with it. */
    try {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* The choice still applies for this session. */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside a ThemeProvider');
  return value;
}
