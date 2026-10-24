import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { LocaleProvider } from './locale-context.js';
import { expectNoViolations } from './test/axe.js';
import { ThemeProvider, THEME_STORAGE_KEY } from './theme.js';
import { STORAGE_KEY } from './i18n/index.js';
import type { Locale } from '@csas/shared';
import type { Theme } from './theme.js';

function mount(locale: Locale = 'ar-LB', theme: Theme = 'light'): ReturnType<typeof render> {
  return render(
    <ThemeProvider initial={theme}>
      <LocaleProvider initial={locale}>
        <App />
      </LocaleProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  /* The API call is not what these tests are about; a rejected fetch puts the
     page in its error state, which is one of the states worth rendering. */
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'csas-api', version: '0.1.0', environment: 'test' }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
  globalThis.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LOC-01 — language and direction on the document', () => {
  /* The two attributes every other rule depends on: `:lang(ar)` for
     typography, `dir` for layout. A route that sets one and not the other
     renders Arabic in a Latin face, or an RTL language laid out left to
     right. */
  it('sets lang and dir together for Arabic', () => {
    mount('ar-LB');
    expect(document.documentElement.lang).toBe('ar-LB');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('sets lang and dir together for English', () => {
    mount('en-LB');
    expect(document.documentElement.lang).toBe('en-LB');
    expect(document.documentElement.dir).toBe('ltr');
  });

  /* A regional tag, not a bare `ar`: Lebanon writes `كانون الثاني` where
     generic CLDR Arabic says `يناير`. */
  it('keeps the region in the tag', () => {
    mount('ar-LB');
    expect(document.documentElement.lang).not.toBe('ar');
  });
});

describe('the language switcher', () => {
  it('changes the text, the direction and the stored choice together', async () => {
    const user = userEvent.setup();
    mount('en-LB');

    expect(screen.getByRole('button', { name: 'Send' })).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(await screen.findByRole('button', { name: 'إرسال' })).toBeDefined();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar-LB');
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('ar-LB');
  });

  /* Each language's name is written in that language. "Arabic" in an English
     list is no use to the person who needs the switch most. */
  it('writes each language in its own script', () => {
    mount('en-LB');
    const group = screen.getByRole('group', { name: 'Language' });
    expect(within(group).getByRole('button', { name: 'العربية' })).toBeDefined();
  });
});

describe('the theme switcher', () => {
  it('writes an explicit choice to the document and to storage', async () => {
    const user = userEvent.setup();
    mount('en-LB', 'light');

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  /* `system` is a real state, not the absence of one: it means "follow the
     operating system", so the attribute is removed and the media query in
     tokens.css becomes the only thing deciding. A boolean toggle cannot say
     this, which is why so many of them stop following the system forever
     after one click. */
  it('removes the attribute for system rather than setting it', async () => {
    const user = userEvent.setup();
    mount('en-LB', 'dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'System' }));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

describe('formatting on the page', () => {
  /* The decision from the research, visible where a customer would see it. */
  it('shows Western digits in the Arabic interface', () => {
    const { container } = mount('ar-LB');
    expect(container.textContent).toContain('0.88');
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });

  it('writes the Lebanese month name, not the generic Arabic one', () => {
    const { container } = mount('ar-LB');
    expect(container.textContent).toContain('تشرين الأول');
    expect(container.textContent).not.toContain('أكتوبر');
  });

  /* Three tickets is the `few` category, which neither a singular nor a
     naive plural produces. */
  it('uses the Arabic few-plural for three', () => {
    mount('ar-LB');
    expect(screen.getAllByText('3 طلبات دعم').length).toBeGreaterThan(0);
  });
});

describe('BIDI-02/03 — direction of content', () => {
  it('isolates every identifier as an LTR bdi', () => {
    const { container } = mount('ar-LB');
    const identifiers = [...container.querySelectorAll('bdi')];
    expect(identifiers.length).toBeGreaterThan(0);
    for (const element of identifiers) expect(element.getAttribute('dir')).toBe('ltr');
    expect(container.textContent).toContain('CSAS-001241');
  });

  /* Arabizi is Arabic written in Latin characters. `dir="auto"` lets it
     resolve LTR inside an RTL page; `lang="en"` would tell a screen reader to
     pronounce it in English, which is why nothing here carries that tag. */
  it('gives the Arabizi message automatic direction and no English tag', () => {
    const { container } = mount('ar-LB');
    const bubble = screen.getByText(/el printer 3am ya3mel/);
    expect(bubble.getAttribute('dir')).toBe('auto');
    expect(bubble.closest('[lang="en"]')).toBeNull();
    expect(container.querySelector('input')?.getAttribute('dir')).toBe('auto');
  });
});

describe('accessibility', () => {
  const combinations: readonly [Locale, Theme][] = [
    ['ar-LB', 'light'],
    ['ar-LB', 'dark'],
    ['en-LB', 'light'],
    ['en-LB', 'dark'],
  ];

  for (const [locale, theme] of combinations) {
    it(`has no axe violations in ${locale} / ${theme}`, async () => {
      const { container } = mount(locale, theme);
      await expectNoViolations(container);
    });
  }

  /* The first thing a keyboard user meets. It is visually hidden until
     focused, which is not the same as being absent. */
  it('starts the page with a skip link that targets the main landmark', () => {
    mount('en-LB');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main');
    expect(document.querySelector('main')?.id).toBe('main');
  });

  it('gives the table a header for every column', () => {
    mount('en-LB');
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(3);
    for (const header of headers) expect(header.getAttribute('scope')).toBe('col');
  });
});
