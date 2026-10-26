import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@csas/shared';
import { App } from './App.js';
import { LocaleProvider } from './locale-context.js';
import { STORAGE_KEY } from './i18n/index.js';
import { SessionProvider, type SessionState } from './session.js';
import { expectNoViolations } from './test/axe.js';
import { ThemeProvider, THEME_STORAGE_KEY, type Theme } from './theme.js';

/**
 * The shell: language, theme, and which of the three session states is
 * rendered. The screens themselves are tested in `screens/screens.test.tsx`.
 */

const customer = {
  id: '507f1f77bcf86cd799439011',
  name: 'Demo Person',
  companyName: 'Cedar Pharmaceuticals',
  preferredLanguage: 'ar' as const,
  phoneLast3: '001',
  products: [],
  entitlement: { status: 'active' as const },
};

function mount(
  session: SessionState,
  locale: Locale = 'en-LB',
  theme: Theme = 'light',
): ReturnType<typeof render> {
  return render(
    <ThemeProvider initial={theme}>
      <LocaleProvider initial={locale}>
        <SessionProvider initial={session}>
          <App />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = input;
      const body = url.startsWith('/api/customer/preferences')
        ? {
            preferences: {
              whatsapp: true,
              email: false,
              marketingOptOut: false,
              preferredLanguage: 'ar',
              emailAvailable: false,
            },
          }
        : url.startsWith('/api/customer/tickets')
          ? { tickets: [], total: 0, limit: 25 }
          : url.startsWith('/api/dev/inbox')
            ? { messages: [] }
            : { name: 'csas-api', version: '0.1.0', environment: 'test' };

      return Promise.resolve(
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
  globalThis.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── Which session state is rendered ────────────────────────────────────── */

describe('the three session states', () => {
  /* "We do not know yet" is a real state. Rendering the sign-in screen while
     the refresh request is in flight would flash a login form at someone
     already signed in, on every single reload. */
  it('shows neither sign-in nor the screens while restoring', () => {
    mount({ status: 'restoring' });
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('shows the sign-in screen when anonymous', () => {
    mount({ status: 'anonymous' });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeDefined();
  });

  it('shows the tickets when signed in with a live contract', async () => {
    mount({ status: 'signedIn', customer });
    expect(await screen.findByRole('heading', { name: 'Your support tickets' })).toBeDefined();
    expect(screen.getByText(/Signed in as Demo Person/)).toBeDefined();
  });

  /* Signed in, but no live contract. A separate state rather than an error:
     they are who they say they are, and the answer is about their contract. */
  it('explains an inactive contract instead of showing an error', () => {
    mount({
      status: 'signedIn',
      customer: { ...customer, entitlement: { status: 'expired' } },
    });
    expect(screen.getByText(/maintenance contract on this account is not active/)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Your support tickets' })).toBeNull();
  });
});

/* ── LOC-01 ─────────────────────────────────────────────────────────────── */

describe('LOC-01 — language and direction on the document', () => {
  /* The two attributes every other rule depends on: `:lang(ar)` for
     typography, `dir` for layout. Setting one without the other renders
     Arabic in a Latin face, or an RTL language laid out left to right. */
  it('sets lang and dir together for Arabic', () => {
    mount({ status: 'anonymous' }, 'ar-LB');
    expect(document.documentElement.lang).toBe('ar-LB');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('sets lang and dir together for English', () => {
    mount({ status: 'anonymous' }, 'en-LB');
    expect(document.documentElement.lang).toBe('en-LB');
    expect(document.documentElement.dir).toBe('ltr');
  });

  /* A regional tag, not a bare `ar`: Lebanon writes `كانون الثاني` where
     generic CLDR Arabic says `يناير`. */
  it('keeps the region in the tag', () => {
    mount({ status: 'anonymous' }, 'ar-LB');
    expect(document.documentElement.lang).not.toBe('ar');
  });
});

/* ── Switchers ──────────────────────────────────────────────────────────── */

describe('the language switcher', () => {
  it('changes the text, the direction and the stored choice together', async () => {
    const user = userEvent.setup();
    mount({ status: 'anonymous' }, 'en-LB');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeDefined();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar-LB');
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('ar-LB');
  });

  it('writes each language in its own script', () => {
    mount({ status: 'anonymous' }, 'en-LB');
    const group = screen.getByRole('group', { name: 'Language' });
    expect(within(group).getByRole('button', { name: 'العربية' })).toBeDefined();
  });
});

describe('the theme switcher', () => {
  it('writes an explicit choice to the document and to storage', async () => {
    const user = userEvent.setup();
    mount({ status: 'anonymous' }, 'en-LB', 'light');

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  /* `system` is a real state, not the absence of one: it means "follow the
     operating system", so the attribute is removed and the media query in
     tokens.css becomes the only thing deciding. A boolean toggle cannot say
     this, which is why so many stop following the system after one click. */
  it('removes the attribute for system rather than setting it', async () => {
    const user = userEvent.setup();
    mount({ status: 'anonymous' }, 'en-LB', 'dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'System' }));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

/* ── Accessibility ──────────────────────────────────────────────────────── */

describe('accessibility', () => {
  const states: readonly [string, SessionState][] = [
    ['anonymous', { status: 'anonymous' }],
    ['signed in', { status: 'signedIn', customer }],
    [
      'contract inactive',
      { status: 'signedIn', customer: { ...customer, entitlement: { status: 'expired' } } },
    ],
  ];

  for (const [name, session] of states) {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      it(`has no axe violations: ${name} / ${locale}`, async () => {
        const { container } = mount(session, locale);
        await screen.findByRole('heading', { level: 1 });
        await expectNoViolations(container);
      });
    }
  }

  /* The first thing a keyboard user meets. Visually hidden until focused,
     which is not the same as absent. */
  it('starts the page with a skip link that targets the main landmark', () => {
    mount({ status: 'anonymous' });
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main');
    expect(document.querySelector('main')?.id).toBe('main');
  });
});
