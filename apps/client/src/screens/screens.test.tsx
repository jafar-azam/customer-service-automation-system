import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@csas/shared';
import { LocaleProvider } from '../locale-context.js';
import { expectNoViolations } from '../test/axe.js';
import { ThemeProvider } from '../theme.js';
import { History, toKey, toneFor } from './History.js';
import { PreferencesScreen } from './Preferences.js';
import { TicketDetail } from './TicketDetail.js';
import { historyQuery } from '../api/client.js';

/* ── Fixtures. Invented; nothing from `reference/`. ─────────────────────── */

const ticket = {
  id: '507f1f77bcf86cd799439011',
  reference: 'CSAS-000123',
  subject: 'Printer stopped after the update',
  status: 'closed',
  priority: 'medium',
  inputForm: 'arabizi',
  createdAt: '2026-10-24T09:00:00Z',
  updatedAt: '2026-10-24T10:00:00Z',
  resolvedAt: null,
  closedAt: '2026-10-24T10:00:00Z',
  reopenedCount: 0,
  sla: { firstResponseDueAt: null, resolutionDueAt: null, firstRespondedAt: null },
};

const routes: Record<string, unknown> = {};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = input;
      const key = Object.keys(routes).find((candidate) => url.startsWith(candidate));
      const body =
        key === undefined ? { error: { code: 'not_found', message: 'nope' } } : routes[key];
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: key === undefined ? 404 : 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

function mount(ui: React.ReactElement, locale: Locale = 'en-LB') {
  return render(
    <ThemeProvider initial="light">
      <LocaleProvider initial={locale}>{ui}</LocaleProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  /* Rebuilt rather than deleted key by key: a dynamic delete on a shared
     object is both slower and the sort of thing that leaves one stale entry
     behind when a key is added later. */
  for (const key of Object.keys(routes)) routes[key] = undefined;
  routes['/api/customer/tickets?'] = { tickets: [ticket], total: 1, limit: 25 };
  routes['/api/customer/tickets/507f1f77bcf86cd799439011/messages'] = {
    messages: [
      {
        id: 'm1',
        author: 'customer',
        body: 'el printer 3am ya3mel error',
        inputForm: 'arabizi',
        internal: false,
        confidence: null,
        createdAt: '2026-10-24T09:01:00Z',
      },
    ],
  };
  routes['/api/customer/tickets/507f1f77bcf86cd799439011/attachments'] = {
    attachments: [
      {
        id: 'a1',
        filename: 'screenshot.png',
        mimeType: 'image/png',
        byteSize: 20480,
        scanStatus: 'clean',
        downloadable: true,
        createdAt: '2026-10-24T09:02:00Z',
      },
      {
        id: 'a2',
        filename: 'log.txt',
        mimeType: 'text/plain',
        byteSize: 1024,
        scanStatus: 'pending',
        downloadable: false,
        createdAt: '2026-10-24T09:03:00Z',
      },
    ],
  };
  routes['/api/customer/tickets/507f1f77bcf86cd799439011'] = {
    ticket,
    allowedTransitions: [],
    timeline: [
      { status: 'open', at: '2026-10-24T09:00:00Z', by: 'customer', note: null },
      { status: 'closed', at: '2026-10-24T10:00:00Z', by: 'staff', note: null },
    ],
    reopen: { ok: true },
    continues: null,
  };
  routes['/api/customer/preferences'] = {
    preferences: {
      whatsapp: true,
      email: false,
      marketingOptOut: false,
      preferredLanguage: 'ar',
      emailAvailable: false,
    },
  };
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── History ────────────────────────────────────────────────────────────── */

describe('the history screen', () => {
  it('lists the tickets with a total', async () => {
    mount(<History onOpen={() => undefined} />);

    expect(await screen.findByText('CSAS-000123')).toBeDefined();
    expect(screen.getByText('Printer stopped after the update')).toBeDefined();
    expect(await screen.findByText(/Showing 1 of 1/)).toBeDefined();
  });

  /* Every filter is applied by the server. Filtering in the browser makes
     "showing 25 of 112" a lie, because the 25 are filtered and the 112 is not. */
  it('asks the server when a filter changes', async () => {
    const user = userEvent.setup();
    mount(<History onOpen={() => undefined} />);
    await screen.findByText('CSAS-000123');

    await user.type(screen.getByLabelText(/Search/), 'printer');

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
      );
      expect(calls.some((url) => url.includes('search=printer'))).toBe(true);
    });
  });

  it('tells the reader when nothing matches, and says why', async () => {
    const user = userEvent.setup();
    routes['/api/customer/tickets?'] = { tickets: [], total: 0, limit: 25 };
    mount(<History onOpen={() => undefined} />);

    expect(await screen.findByText('You have no tickets yet.')).toBeDefined();

    await user.type(screen.getByLabelText(/Search/), 'nothing');
    expect(await screen.findByText('No tickets match these filters.')).toBeDefined();
  });

  it('opens a ticket', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    mount(<History onOpen={onOpen} />);

    const row = (await screen.findByText('CSAS-000123')).closest('tr');
    await user.click(within(row as HTMLElement).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(<History onOpen={() => undefined} />, locale);
      await screen.findByText('CSAS-000123');
      await expectNoViolations(container);
      unmount();
    }
  });
});

/* ── Detail ─────────────────────────────────────────────────────────────── */

describe('the ticket detail', () => {
  it('shows the conversation, the files and the timeline', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);

    expect(await screen.findByText('el printer 3am ya3mel error')).toBeDefined();
    expect(screen.getByText('screenshot.png')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'History' })).toBeDefined();
  });

  /* A message's direction belongs to the message: this Arabizi line must
     resolve left-to-right even inside an Arabic page. */
  it('gives each message automatic direction', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />, 'ar-LB');
    const body = await screen.findByText('el printer 3am ya3mel error');
    expect(body.getAttribute('dir')).toBe('auto');
  });

  /* A file still being scanned is named but not offered — the server would
     refuse it, and a dead link is worse than an honest label. */
  it('does not offer a file that is still being checked', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await screen.findByText('log.txt');
    expect(screen.getByText('Being checked')).toBeDefined();
  });

  it('offers the transcript as a plain link', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    const link = await screen.findByRole('link', { name: /Download transcript/ });
    expect(link.getAttribute('href')).toBe(
      '/api/customer/tickets/507f1f77bcf86cd799439011/transcript?locale=en-LB',
    );
  });

  /* The server decides eligibility; the client renders what it was told.
     Two copies of the rule drift, and the browser's is the unread one. */
  it('offers reopening only when the server says it is possible', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    expect(await screen.findByLabelText(/What has happened since/)).toBeDefined();
  });

  it('explains why reopening is unavailable rather than hiding it', async () => {
    routes['/api/customer/tickets/507f1f77bcf86cd799439011'] = {
      ...(routes['/api/customer/tickets/507f1f77bcf86cd799439011'] as object),
      reopen: { ok: false, reason: 'window_passed', windowDays: 14 },
    };
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    expect(await screen.findByText(/more than 14 days ago/)).toBeDefined();
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(
        <TicketDetail id={ticket.id} onBack={() => undefined} />,
        locale,
      );
      await screen.findByText('el printer 3am ya3mel error');
      await expectNoViolations(container);
      unmount();
    }
  });
});

/* ── Preferences ────────────────────────────────────────────────────────── */

describe('notification preferences', () => {
  it('saves a change immediately', async () => {
    const user = userEvent.setup();
    mount(<PreferencesScreen />);

    const whatsapp = await screen.findByLabelText(/WhatsApp/);
    await user.click(whatsapp);

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patch = calls.find(
        (call) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(String((patch?.[1] as { body?: string } | undefined)?.body)).toContain(
        '"whatsapp":false',
      );
    });
  });

  /* A control that silently does nothing is worse than one that explains. */
  it('disables email and says why when there is no address', async () => {
    mount(<PreferencesScreen />);
    const email = await screen.findByLabelText(/by email/);
    expect((email as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Add an email address/)).toBeDefined();
  });

  it('has no axe violations', async () => {
    const { container } = mount(<PreferencesScreen />);
    await screen.findByLabelText(/WhatsApp/);
    await expectNoViolations(container);
  });
});

/* ── Pure helpers ───────────────────────────────────────────────────────── */

describe('helpers', () => {
  it('maps a domain status to its catalogue key', () => {
    expect(toKey('in_progress')).toBe('inProgress');
    expect(toKey('awaiting_customer')).toBe('awaitingCustomer');
    expect(toKey('open')).toBe('open');
  });

  it('gives a resolved ticket a different tone from an escalated one', () => {
    expect(toneFor('resolved')).toBe('success');
    expect(toneFor('escalated')).toBe('danger');
    expect(toneFor('open')).toBe('info');
  });

  /* A search containing `&status=closed` must stay one parameter. */
  it('encodes a filter value rather than interpolating it', () => {
    expect(historyQuery({ search: 'a&status=closed' })).toBe('?search=a%26status%3Dclosed');
    expect(historyQuery({})).toBe('');
    expect(historyQuery({ search: '' })).toBe('');
  });
});

/* ── Errors are read by the customer, not by a log ──────────────────────── */

describe('how a failure is shown', () => {
  /* The server's `message` is English and written for whoever reads a log.
     Rendering it put "Authentication is required" in the middle of an Arabic
     page — visible the first time these screens were opened in a browser and
     invisible to every test, because no test read the page as a reader. */
  it('translates the error code rather than showing the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'unauthenticated', message: 'Authentication is required' },
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );

    mount(<History onOpen={() => undefined} />, 'ar-LB');

    expect(await screen.findByText('يلزم تسجيل الدخول لعرض طلباتك.')).toBeDefined();
    expect(screen.queryByText('Authentication is required')).toBeNull();
  });

  /* A code with no translation must still answer in the reader's language: a
     vague sentence they can read beats a precise one they cannot. */
  it('falls back in the right language, never to English', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'some_new_code', message: 'Internal detail' } }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );

    mount(<History onOpen={() => undefined} />, 'ar-LB');

    expect(await screen.findByText('حدث خطأ ما.')).toBeDefined();
    expect(screen.queryByText('Internal detail')).toBeNull();
  });

  /* Not signed in is a prompt, not a failure. Showing it in red beside a real
     error is how an interface teaches people that red means nothing. */
  /* The same condition must look the same on every screen. The first version
     applied this only to the history list, so an unauthenticated visitor saw
     one blue panel and one red one saying the identical sentence. */
  it.each([
    ['history', () => <History onOpen={() => undefined} />],
    ['preferences', () => <PreferencesScreen />],
  ])('shows "not signed in" as information on the %s screen', async (_name, ui) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    mount(ui());
    expect(await screen.findByText(/Please sign in/)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows "not signed in" as information rather than as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    mount(<History onOpen={() => undefined} />);
    expect(await screen.findByRole('status')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
