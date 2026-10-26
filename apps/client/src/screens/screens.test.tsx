import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@csas/shared';
import { LocaleProvider } from '../locale-context.js';
import { expectNoViolations } from '../test/axe.js';
import { ThemeProvider } from '../theme.js';
import { History, toKey, toneFor } from './History.js';
import { PreferencesScreen } from './Preferences.js';
import { NewTicket } from './NewTicket.js';
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

/**
 * The JSON body the client sent to a path ending in `suffix`.
 *
 * A helper rather than the same assertion inlined twice: `fetch`'s first
 * argument is `RequestInfo`, so stringifying it to compare paths is exactly the
 * sort of accidental `[object Object]` the linter's `no-base-to-string` rule
 * exists to catch. Narrowing once here keeps the tests readable and the rule on.
 */
/** Every URL the client called, narrowed once. */
function requestedUrls(): string[] {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.map(([url]) => url)
    .filter((url): url is string => typeof url === 'string');
}

function sentBody(suffix: string): unknown {
  const call = vi
    .mocked(globalThis.fetch)
    .mock.calls.find(([url]) => typeof url === 'string' && url.endsWith(suffix));
  const body = call?.[1]?.body;
  if (typeof body !== 'string') throw new Error(`no JSON body was sent to …${suffix}`);
  return JSON.parse(body);
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
  /* Registered before the detail route on purpose: `stubApi` matches by
     prefix in insertion order, and the detail URL is a prefix of these two. */
  routes['/api/customer/tickets/507f1f77bcf86cd799439011/confirm'] = {
    ticket: { ...ticket, status: 'resolved' },
    message: {
      id: 'm2',
      author: 'system',
      body: 'Glad that solved it. Thank you for your time.',
      inputForm: 'arabizi',
      internal: false,
      confidence: null,
      createdAt: '2026-10-24T11:00:00Z',
    },
    escalated: false,
  };
  routes['/api/customer/tickets/507f1f77bcf86cd799439011/rating'] = {};
  routes['/api/customer/tickets/507f1f77bcf86cd799439011'] = {
    ticket,
    allowedTransitions: [],
    timeline: [
      { status: 'open', at: '2026-10-24T09:00:00Z', by: 'customer', note: null },
      { status: 'closed', at: '2026-10-24T10:00:00Z', by: 'staff', note: null },
    ],
    reopen: { ok: true },
    /* This fixture's ticket is closed, so there is nothing to confirm — the
       standalone rating form is what a closed ticket offers. */
    confirm: { ok: false, reason: 'not_answered', status: 'closed' },
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

  /**
   * The button says what it does.
   *
   * It called `onOpen` while reading `action.confirm`, so every row offered
   * "Confirm" and then navigated. Generic wording when the list was built;
   * actively wrong once step 16 made confirming a resolution a real action a
   * customer can take, with its own consequences. The test above clicked
   * `getByRole('button')` without looking at the name, which is why it
   * survived — so the name is asserted here.
   */
  it('names the row button for what it does, not for a different action', async () => {
    mount(<History onOpen={() => undefined} />);

    const row = (await screen.findByText('CSAS-000123')).closest('tr');
    const button = within(row as HTMLElement).getByRole('button');

    expect(button.textContent).toBe('Open');
    expect(button.textContent).not.toBe('Confirm');
  });

  /* A screen reader otherwise announces twenty-five buttons all called
     "Open" with nothing to tell them apart. */
  it('gives each row button an accessible name carrying its reference', async () => {
    mount(<History onOpen={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Open ticket CSAS-000123' })).toBeDefined();
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

  /* Step 15 refuses to send an assistant answer that cites nothing, and step
     17 is where that guarantee becomes something a reader can check. An
     enforced-but-invisible grounding is worth as much as no grounding. */
  it('shows what an assistant answer was grounded in, with the version', async () => {
    routes['/api/customer/tickets/507f1f77bcf86cd799439011/messages'] = {
      messages: [
        {
          id: 'm9',
          author: 'assistant',
          body: 'Turn the printer off for one minute.',
          inputForm: 'english',
          internal: false,
          confidence: 0.72,
          citations: [{ version: 2, title: 'Restarting a printer' }],
          createdAt: '2026-10-24T09:05:00Z',
        },
      ],
    };
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await screen.findByText('Turn the printer off for one minute.');

    /* `<bdi>`, not a span: an Arabic title inside an English line is a bidi
       boundary, and without isolation a title ending in Latin text reorders
       the version after it. Asserting the element rather than the string is
       what stops someone "simplifying" it back into one interpolation.

       Found by its text rather than by `querySelector('bdi')` — `Identifier`
       renders the ticket reference in a `bdi` too, for the same reason, and
       it comes first in the document. */
    const isolated = screen.getByText('Restarting a printer');
    expect(isolated.tagName).toBe('BDI');

    const line = isolated.closest('p');
    expect(line?.textContent).toContain('Based on:');
    expect(line?.textContent).toContain('(version 2)');
  });

  it('shows nothing where there is nothing to cite', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await screen.findByText('el printer 3am ya3mel error');
    expect(screen.queryByText(/Based on:/)).toBeNull();
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

  /* ── Closing the loop (step 16) ──────────────────────────────────────── */

  function answered() {
    routes['/api/customer/tickets/507f1f77bcf86cd799439011'] = {
      ...(routes['/api/customer/tickets/507f1f77bcf86cd799439011'] as object),
      ticket: { ...ticket, status: 'awaiting_customer' },
      confirm: { ok: true },
    };
  }

  it('asks whether it was solved once the server says there is an answer', async () => {
    answered();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Did that solve it?' })).toBeDefined();
  });

  it('does not ask on a ticket nobody has answered', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await screen.findByText('el printer 3am ya3mel error');
    expect(screen.queryByRole('heading', { name: 'Did that solve it?' })).toBeNull();
  });

  /* The whole point of the step. "No" must not be the quiet option — a
     product that makes it harder to say than "yes" collects satisfaction
     scores that mean nothing. */
  it('gives \u201cno\u201d a button of its own, not a hidden link', async () => {
    answered();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'No, I still need help' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Yes, it is solved' })).toBeDefined();
  });

  /* A radio group, not five toggle buttons: the group announces "3 of 5" and
     arrow keys move between the options. `SegmentedControl` uses
     `aria-pressed`, which would announce five independent switches. */
  it('offers the score as a radio group', async () => {
    answered();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '1, not helpful at all' })).toBeDefined();
    expect(screen.getByRole('radio', { name: '5, very helpful' })).toBeDefined();
  });

  it('sends the answer and the score together', async () => {
    answered();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await userEvent.click(await screen.findByRole('radio', { name: '4, helpful' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, it is solved' }));

    expect(sentBody('/confirm')).toEqual({ solved: true, score: 4 });
  });

  /* What the server said happened, not what the client guessed: a rejected
     answer may or may not find an agent, and the line the customer reads has
     to match. */
  it('reports the escalation the server actually performed', async () => {
    answered();
    routes['/api/customer/tickets/507f1f77bcf86cd799439011/confirm'] = {
      ...(routes['/api/customer/tickets/507f1f77bcf86cd799439011/confirm'] as object),
      escalated: true,
    };
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'No, I still need help' }));
    expect(await screen.findByText(/Passed to a specialist/)).toBeDefined();
  });

  /* Announced, not only drawn: the card the customer was reading has just
     been replaced by this. */
  it('announces the result to a screen reader', async () => {
    answered();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, it is solved' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('now resolved');
  });

  /* Someone may want to say how it went days after an agent closed it. */
  it('offers a rating on its own for a ticket with nothing to confirm', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'How was the support?' })).toBeDefined();
    /* Disabled until a score is chosen — submitting nothing is not an
       opinion. */
    expect(screen.getByRole('button', { name: 'Send rating' })).toHaveProperty('disabled', true);
  });

  it('sends a standalone rating', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await userEvent.click(await screen.findByRole('radio', { name: '2, not very helpful' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send rating' }));

    expect(sentBody('/rating')).toEqual({ score: 2 });
    expect(await screen.findByText(/Thank you for the rating/)).toBeDefined();
  });

  it('has no axe violations with the confirmation prompt up, in both languages', async () => {
    answered();
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(
        <TicketDetail id={ticket.id} onBack={() => undefined} />,
        locale,
      );
      await screen.findAllByRole('radio');
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

/* ── Reaching the assistant ─────────────────────────────────────────────── */

/**
 * The gap this screen closes.
 *
 * Everything behind the assistant worked — retrieval, citation enforcement,
 * the confidence floor, the escalation path — and a customer had no way to say
 * a single word to it. The client could only read. Step 15 built the engine
 * and no pedal, and no test noticed, because every test drove the parts
 * directly.
 */
describe('asking for help', () => {
  beforeEach(() => {
    routes['/api/customer/tickets/507f1f77bcf86cd799439011/ask'] = {
      message: {
        id: 'm5',
        author: 'assistant',
        body: 'Turn it off for a minute.',
        inputForm: 'english',
        internal: false,
        confidence: 0.71,
        citations: [{ version: 2, title: 'Restarting a printer' }],
        createdAt: '2026-10-24T09:10:00Z',
      },
      outcome: { kind: 'answered', confidence: 0.71 },
      ticketStatus: 'awaiting_customer',
    };
    routes['/api/customer/tickets'] = { ticket, message: { id: 'm1' } };
  });

  it('creates the ticket and puts the question to the assistant', async () => {
    const user = userEvent.setup();
    const onOpened = vi.fn();
    mount(<NewTicket onOpened={onOpened} onCancel={() => undefined} />);

    await user.type(screen.getByLabelText(/Short summary/), 'Printer stopped');
    await user.type(screen.getByLabelText(/What is happening/), 'el printer 3am ya3mel error');
    await user.click(screen.getByRole('button', { name: 'Ask the assistant' }));

    await waitFor(() => {
      expect(onOpened).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    const calls = requestedUrls();
    expect(calls).toContain('/api/customer/tickets');
    expect(calls.some((url) => url.endsWith('/ask'))).toBe(true);
  });

  /* Detected from what they typed rather than asked. The script settles
     Arabizi; which register Arabic script is, does not belong to this screen. */
  it('records the written form it can actually tell from the text', async () => {
    const user = userEvent.setup();
    mount(<NewTicket onOpened={() => undefined} onCancel={() => undefined} />);

    await user.type(screen.getByLabelText(/Short summary/), 'Printer');
    await user.type(screen.getByLabelText(/What is happening/), 'el printer 3am ya3mel error');
    await user.click(screen.getByRole('button', { name: 'Ask the assistant' }));

    await waitFor(() => {
      expect(sentBody('/api/customer/tickets')).toMatchObject({ inputForm: 'arabizi' });
    });
  });

  it('will not submit an empty problem', () => {
    mount(<NewTicket onOpened={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Ask the assistant' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(
        <NewTicket onOpened={() => undefined} onCancel={() => undefined} />,
        locale,
      );
      await expectNoViolations(container);
      unmount();
    }
  });
});

describe('the composer on a ticket', () => {
  /* The shared fixture is a *closed* ticket, which is exactly where the
     composer must not appear — so an open one is set up here. */
  function open_() {
    routes['/api/customer/tickets/507f1f77bcf86cd799439011'] = {
      ...(routes['/api/customer/tickets/507f1f77bcf86cd799439011'] as object),
      ticket: { ...ticket, status: 'awaiting_customer' },
      confirm: { ok: true },
    };
  }

  /* A ticket a customer can read but not reply to is a receipt, not a support
     thread. */
  it('offers both the assistant and a person', async () => {
    open_();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Ask the assistant' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send to a person' })).toBeDefined();
  });

  it('sends what was typed to the assistant', async () => {
    routes['/api/customer/tickets/507f1f77bcf86cd799439011/ask'] = {
      message: {
        id: 'm6',
        author: 'assistant',
        body: 'Try the paper tray.',
        inputForm: 'english',
        internal: false,
        confidence: 0.6,
        citations: [],
        createdAt: '2026-10-24T09:20:00Z',
      },
      outcome: { kind: 'answered', confidence: 0.6 },
      ticketStatus: 'awaiting_customer',
    };
    open_();
    const user = userEvent.setup();
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);

    await user.type(await screen.findByLabelText(/Your reply/), 'still jammed');
    await user.click(screen.getByRole('button', { name: 'Ask the assistant' }));

    await waitFor(() => {
      expect(sentBody('/ask')).toEqual({ question: 'still jammed' });
    });
  });

  /* `closed` is terminal in the state machine on purpose, so a message posted
     there would be refused by the server and the button would be a lie. The
     reopen form is the correct path and is already on the page. */
  it('is hidden on a closed ticket, where reopening is the way back', async () => {
    mount(<TicketDetail id={ticket.id} onBack={() => undefined} />);
    await screen.findByText('el printer 3am ya3mel error');
    expect(screen.queryByRole('button', { name: 'Ask the assistant' })).toBeNull();
    expect(screen.getByLabelText(/What has happened since/)).toBeDefined();
  });
});
