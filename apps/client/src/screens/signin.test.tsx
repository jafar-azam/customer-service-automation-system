import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@csas/shared';
import { LocaleProvider } from '../locale-context.js';
import { SessionProvider } from '../session.js';
import { expectNoViolations } from '../test/axe.js';
import { ThemeProvider } from '../theme.js';
import { SignIn } from './SignIn.js';

/* Each entry: a URL prefix → [status, body]. */
const routes = new Map<string, [number, unknown]>();

function mount(locale: Locale = 'en-LB') {
  return render(
    <ThemeProvider initial="light">
      <LocaleProvider initial={locale}>
        <SessionProvider initial={{ status: 'anonymous' }}>
          <SignIn />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  routes.clear();
  routes.set('/api/auth/customer/request-code', [
    202,
    { status: 'accepted', expiresInSeconds: 300 },
  ]);
  routes.set('/api/dev/inbox', [404, { error: { code: 'not_found', message: 'nope' } }]);

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const key = [...routes.keys()].find((candidate) => input.startsWith(candidate));
      const [status, body] =
        key === undefined
          ? [404, { error: { code: 'not_found', message: 'nope' } }]
          : routes.get(key)!;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function enterPhone(user: ReturnType<typeof userEvent.setup>, phone = '03123456') {
  await user.type(screen.getByLabelText(/Mobile number/), phone);
  await user.click(screen.getByRole('button', { name: /Send me a code/ }));
}

describe('asking for a code', () => {
  it('moves to the code step', async () => {
    const user = userEvent.setup();
    mount();
    await enterPhone(user);
    expect(await screen.findByLabelText(/Six-digit code/)).toBeDefined();
  });

  /* The anti-enumeration property, carried into the interface. The server
     answers identically for a number on a contract, one that is not, and one
     the kill switch suppressed — a screen that only advanced on "we sent it"
     would hand that distinction straight back. */
  it('moves to the code step even when the number is unknown', async () => {
    const user = userEvent.setup();
    mount();
    await enterPhone(user, '03999999');
    expect(await screen.findByLabelText(/Six-digit code/)).toBeDefined();
  });

  it('words the next step conditionally, never confirming the number exists', async () => {
    const user = userEvent.setup();
    mount();
    await enterPhone(user);
    expect(await screen.findByText(/If that number is on a contract/)).toBeDefined();
  });

  /* A rate limit is the one refusal worth showing: a client that cannot see
     it retries into a wall. */
  it('shows a rate limit instead of advancing', async () => {
    routes.set('/api/auth/customer/request-code', [
      429,
      { error: { code: 'too_many_requests', message: 'wait' } },
    ]);
    const user = userEvent.setup();
    mount();
    await enterPhone(user);

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByLabelText(/Six-digit code/)).toBeNull();
  });

  it('shows a malformed number instead of advancing', async () => {
    routes.set('/api/auth/customer/request-code', [
      400,
      { error: { code: 'invalid_phone', message: 'bad' } },
    ]);
    const user = userEvent.setup();
    mount();
    await enterPhone(user, 'nonsense');

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByLabelText(/Six-digit code/)).toBeNull();
  });
});

describe('entering the code', () => {
  async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
    mount();
    await enterPhone(user);
    return screen.findByLabelText(/Six-digit code/);
  }

  /* `one-time-code` is what lets a handset offer the code straight from the
     message, and `numeric` gets a digit keypad rather than a full keyboard. */
  it('asks the browser for the code from the message', async () => {
    const user = userEvent.setup();
    const field = await toCodeStep(user);
    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    expect(field.getAttribute('inputmode')).toBe('numeric');
  });

  it('accepts only digits, and at most six', async () => {
    const user = userEvent.setup();
    const field = await toCodeStep(user);

    await user.type(field, 'a1b2c3d4e5f6g7');
    expect((field as HTMLInputElement).value).toBe('123456');
  });

  it('refuses to submit a short code', async () => {
    const user = userEvent.setup();
    const field = await toCodeStep(user);
    await user.type(field, '123');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign in' }).disabled).toBe(true);
  });

  it('reports a wrong code without saying which part was wrong', async () => {
    routes.set('/api/auth/customer/verify', [
      401,
      { error: { code: 'invalid_code', message: 'That code is not valid' } },
    ]);
    const user = userEvent.setup();
    const field = await toCodeStep(user);

    await user.type(field, '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  /* Matches the server's resend limit, so the button is unavailable rather
     than the request being refused. */
  it('holds the resend button for the cooldown', async () => {
    const user = userEvent.setup();
    await toCodeStep(user);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: /another code in/ }).disabled,
    ).toBe(true);
  });

  it('can go back and use a different number', async () => {
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: /different number/ }));
    expect(screen.getByLabelText(/Mobile number/)).toBeDefined();
  });
});

describe('the dev inbox', () => {
  /* Not mounted unless DEMO_MODE is on, so a 404 is the ordinary production
     answer and must not surface as an error. */
  it('is absent when the endpoint is not there', async () => {
    const user = userEvent.setup();
    mount();
    await enterPhone(user);
    expect(screen.queryByText(/Dev inbox/)).toBeNull();
  });

  it('shows what would have been sent when it is', async () => {
    routes.set('/api/dev/inbox', [
      200,
      {
        messages: [
          {
            id: 'n1',
            channel: 'whatsapp',
            kind: 'otp',
            to: '+9617010••••',
            body: 'رمز الدخول إلى C.S.A.S هو 354814.',
            status: 'sent',
            at: '2026-10-26T05:00:00Z',
          },
        ],
      },
    ]);
    mount();
    expect(await screen.findByText(/رمز الدخول/)).toBeDefined();
  });
});

describe('accessibility', () => {
  it('has no axe violations on either step, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const user = userEvent.setup();
      const { container, unmount } = mount(locale);
      await expectNoViolations(container);

      await user.type(
        screen.getByLabelText(locale === 'ar-LB' ? /رقم الهاتف/ : /Mobile number/),
        '03123456',
      );
      await user.click(
        screen.getByRole('button', { name: locale === 'ar-LB' ? /إرسال الرمز/ : /Send me a code/ }),
      );
      await waitFor(() => {
        expect(
          screen.getByLabelText(locale === 'ar-LB' ? /الرمز المكوّن/ : /Six-digit code/),
        ).toBeDefined();
      });
      await expectNoViolations(container);
      unmount();
    }
  });

  /* A phone number and a one-time code are LTR tokens whatever the interface
     language is — an Arabic page must not render `03123456` right to left. */
  it('keeps the phone and code fields left-to-right in Arabic', async () => {
    const user = userEvent.setup();
    mount('ar-LB');
    const phone = screen.getByLabelText(/رقم الهاتف/);
    expect(phone.getAttribute('dir')).toBe('ltr');

    await user.type(phone, '03123456');
    await user.click(screen.getByRole('button', { name: /إرسال الرمز/ }));
    expect((await screen.findByLabelText(/الرمز المكوّن/)).getAttribute('dir')).toBe('ltr');
  });
});
