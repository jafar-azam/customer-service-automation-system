import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@csas/shared';
import { LocaleProvider } from '../locale-context.js';
import { SessionProvider } from '../session.js';
import { expectNoViolations } from '../test/axe.js';
import { ThemeProvider } from '../theme.js';
import { Approvals } from './Approvals.js';
import { Queue } from './Queue.js';
import { StaffSignIn } from './StaffSignIn.js';
import { StaffTicket } from './StaffTicket.js';

/**
 * The staff side of the product.
 *
 * Every endpoint these screens call was built and tested in steps 11–17, and
 * until now none of them had a face. Approving a knowledge entry — the control
 * that decides what the assistant is allowed to say — could only be done with
 * curl, which is not a control the business has.
 */

/** A route serves either a body (200) or a `[status, body]` tuple. */
type Route = unknown;
const routes = new Map<string, Route>();

function mount(ui: React.ReactElement, locale: Locale = 'en-LB') {
  return render(
    <ThemeProvider initial="light">
      <LocaleProvider initial={locale}>
        <SessionProvider initial={{ status: 'anonymous' }}>{ui}</SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

const TICKET = {
  id: '507f1f77bcf86cd799439011',
  reference: 'CSAS-000123',
  subject: 'الطابعة توقفت بعد التحديث',
  status: 'escalated',
  priority: 'medium',
  inputForm: 'arabizi',
  createdAt: '2026-10-24T09:00:00Z',
  updatedAt: '2026-10-24T10:00:00Z',
  resolvedAt: null,
  closedAt: null,
  reopenedCount: 0,
  sla: { firstResponseDueAt: null, resolutionDueAt: null, firstRespondedAt: null },
};

const ENTRY = {
  id: '607f1f77bcf86cd799439011',
  title: 'كيف يتم إصدار الفواتير؟',
  body: 'Imported question, awaiting an answer written for this company.',
  question: 'كيف يتم إصدار الفواتير؟',
  language: 'ar' as const,
  category: null,
  tags: [],
  status: 'pending_review',
  version: 1,
  reviewNote: null,
  source: 'human_collected',
  publishable: false,
  usageCount: 0,
  unhelpfulCount: 0,
  updatedAt: '2026-10-26T10:00:00Z',
};

beforeEach(() => {
  routes.clear();
  routes.set('/api/tickets?', { tickets: [TICKET], total: 1, limit: 50 });
  routes.set('/api/tickets/507f1f77bcf86cd799439011/messages', {
    messages: [
      {
        id: 'm1',
        author: 'customer',
        body: 'el printer 3am ya3mel error',
        inputForm: 'arabizi',
        internal: false,
        confidence: null,
        citations: [],
        createdAt: '2026-10-24T09:01:00Z',
      },
      {
        id: 'm2',
        author: 'agent',
        body: 'Checked the spooler logs, looks like the 4.2 regression.',
        inputForm: 'english',
        internal: true,
        confidence: null,
        citations: [],
        createdAt: '2026-10-24T09:05:00Z',
      },
    ],
  });
  routes.set('/api/tickets/507f1f77bcf86cd799439011', {
    ticket: TICKET,
    allowedTransitions: ['in_progress', 'resolved'],
    timeline: [{ status: 'open', at: '2026-10-24T09:00:00Z', by: 'customer', note: null }],
  });
  routes.set('/api/knowledge/queue', { entries: [ENTRY], total: 1 });
  routes.set('/api/knowledge/607f1f77bcf86cd799439011', { entry: ENTRY, versions: [] });
  routes.set('/api/auth/login', { accessToken: 'tok', expiresIn: 900, csrfToken: 'c' });

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const key = [...routes.keys()]
        .sort((a, b) => b.length - a.length)
        .find((candidate) => input.startsWith(candidate));
      /* A route value is either a body (served 200) or a `[status, body]`
         tuple. The first version serialised the whole tuple as the body when
         a status was given, so an error route answered with `[401, {...}]`
         and the code under test saw no `error` field at all. */
      const value = key === undefined ? undefined : routes.get(key);
      const [status, body] =
        value === undefined
          ? [404, { error: { code: 'not_found', message: 'nope' } }]
          : Array.isArray(value)
            ? [value[0] as number, value[1]]
            : [200, value];

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

/* ── The queue ──────────────────────────────────────────────────────────── */

describe('the ticket queue', () => {
  it('lists open work', async () => {
    mount(<Queue onOpen={() => undefined} />);
    expect(await screen.findByText('الطابعة توقفت بعد التحديث')).toBeDefined();
  });

  /* An agent who can only see their own tickets cannot pick up unassigned
     work, and step 14's rota hands work out rather than expecting people to
     find it. */
  it('shows the whole queue by default, not only mine', async () => {
    mount(<Queue onOpen={() => undefined} />);
    await screen.findByText('الطابعة توقفت بعد التحديث');

    const asked = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([url]) => url)
      .filter((url): url is string => typeof url === 'string');
    expect(asked.some((url) => url.includes('assignedToMe=true'))).toBe(false);
  });

  it('can narrow to mine', async () => {
    const user = userEvent.setup();
    mount(<Queue onOpen={() => undefined} />);
    await screen.findByText('الطابعة توقفت بعد التحديث');

    await user.click(screen.getByRole('button', { name: 'Only mine' }));

    await waitFor(() => {
      const asked = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([url]) => url)
        .filter((url): url is string => typeof url === 'string');
      expect(asked.some((url) => url.includes('assignedToMe=true'))).toBe(true);
    });
  });

  /* The label bug this screen would otherwise have shipped with: `medium` had
     no translation, so the column read the raw enum value. */
  it('names the priority rather than printing the enum', async () => {
    mount(<Queue onOpen={() => undefined} />);
    const row = (await screen.findByText('CSAS-000123')).closest('tr');
    expect(within(row as HTMLElement).getByText('Medium')).toBeDefined();
  });

  it('opens a ticket', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    mount(<Queue onOpen={onOpen} />);

    const row = (await screen.findByText('CSAS-000123')).closest('tr');
    await user.click(within(row as HTMLElement).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(<Queue onOpen={() => undefined} />, locale);
      await screen.findByText('CSAS-000123');
      await expectNoViolations(container);
      unmount();
    }
  });
});

/* ── One ticket ─────────────────────────────────────────────────────────── */

describe('a ticket, from the staff side', () => {
  /* A note that reads as a reply is the one mistake on this screen a customer
     sees. */
  it('marks an internal note so it cannot be mistaken for a reply', async () => {
    mount(<StaffTicket id={TICKET.id} onBack={() => undefined} />);
    const note = await screen.findByText(/Checked the spooler logs/);
    expect(note.closest('article')?.textContent).toContain('Internal note');
  });

  it('separates replying from noting, rather than using one checkbox', async () => {
    mount(<StaffTicket id={TICKET.id} onBack={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Send to the customer' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add an internal note' })).toBeDefined();
  });

  it('sends a note as internal and a reply as not', async () => {
    const user = userEvent.setup();
    mount(<StaffTicket id={TICKET.id} onBack={() => undefined} />);

    await user.type(await screen.findByLabelText(/Your reply/), 'spooler regression');
    await user.click(screen.getByRole('button', { name: 'Add an internal note' }));

    await waitFor(() => {
      const posted = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([, init]) => init?.method === 'POST');
      const body = posted?.[1]?.body;
      expect(JSON.parse(typeof body === 'string' ? body : '{}')).toMatchObject({ internal: true });
    });
  });

  /* The state machine lives on the server. A second copy here is the copy
     nobody re-reads when the first one changes. */
  it('offers only the transitions the server allowed', async () => {
    mount(<StaffTicket id={TICKET.id} onBack={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Being worked on' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Resolved' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Closed' })).toBeNull();
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(
        <StaffTicket id={TICKET.id} onBack={() => undefined} />,
        locale,
      );
      await screen.findByText(/Checked the spooler logs/);
      await expectNoViolations(container);
      unmount();
    }
  });
});

/* ── Approvals ──────────────────────────────────────────────────────────── */

describe('the approval queue', () => {
  it('lists what is waiting', async () => {
    mount(<Approvals />);
    expect(await screen.findByText('كيف يتم إصدار الفواتير؟')).toBeDefined();
  });

  /* Most of this queue is imported questions whose answers were deliberately
     not taken, so the answer has to be writable here or the screen is a dead
     end — the importer refuses a body that is still the placeholder. */
  it('lets the reviewer write the answer before approving', async () => {
    const user = userEvent.setup();
    mount(<Approvals />);
    await user.click(await screen.findByRole('button', { name: /Review/ }));

    const body = await screen.findByLabelText('Answer');
    expect((body as HTMLTextAreaElement).value).toContain('awaiting an answer');
  });

  /* The server requires the note too. Finding that out through a 400 after
     writing nothing is a worse way to learn it. */
  it('will not reject without a reason', async () => {
    const user = userEvent.setup();
    mount(<Approvals />);
    await user.click(await screen.findByRole('button', { name: /Review/ }));

    expect(await screen.findByRole('button', { name: 'Reject' })).toHaveProperty('disabled', true);

    await user.type(screen.getByLabelText('Reason'), 'outside what we support');
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveProperty('disabled', false);
  });

  /* Approving sends the *stored* text to customers, not what is in the box. */
  it('saves an edited answer before approving it', async () => {
    const user = userEvent.setup();
    mount(<Approvals />);
    await user.click(await screen.findByRole('button', { name: /Review/ }));

    const body = await screen.findByLabelText('Answer');
    await user.clear(body);
    await user.type(body, 'Invoices are issued at the start of each cycle.');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      const put = vi.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(put).toBeDefined();
    });
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(<Approvals />, locale);
      await screen.findByText('كيف يتم إصدار الفواتير؟');
      await expectNoViolations(container);
      unmount();
    }
  });
});

/* ── Signing in ─────────────────────────────────────────────────────────── */

describe('staff sign-in', () => {
  /**
   * Admin two-factor is mandatory, and the code is written down nowhere a
   * reviewer can reach — so a fresh clone could not open the staff interface
   * at all. Step 06 said the dev inbox would show it; nothing implemented
   * that until it was reported as "staff cannot open as the auth 6 digits".
   */
  it('shows the demo code, because an admin cannot sign in without one', async () => {
    routes.set('/api/dev/inbox', {
      messages: [],
      adminTotp: { email: 'admin@csas.local', code: '123456', expiresInSeconds: 21 },
    });
    mount(<StaffSignIn onBack={() => undefined} />);

    expect(await screen.findByText('123456')).toBeDefined();
    expect(screen.getByText('admin@csas.local')).toBeDefined();
    /* Said out loud, because a code that has silently expired reads as a
       rejected password rather than a stale number. */
    expect(screen.getByText(/Expires in 21 seconds/)).toBeDefined();
  });

  /* Not mounted outside `DEMO_MODE`, so a 404 is the ordinary production
     answer and must not surface as an error or an empty panel. */
  it('shows nothing when the endpoint is absent', async () => {
    mount(<StaffSignIn onBack={() => undefined} />);
    await screen.findByLabelText(/Email address/);
    expect(screen.queryByText(/Demonstration mode/)).toBeNull();
  });

  /* The client does not decide in advance whether an account needs a second
     factor — knowing which accounts are admins before anyone authenticates is
     an enumeration oracle. */
  it('asks for a code only when the server says one is needed', async () => {
    const user = userEvent.setup();
    routes.set('/api/auth/login', [401, { error: { code: 'totp_required', message: 'need' } }]);
    mount(<StaffSignIn onBack={() => undefined} />);

    expect(screen.queryByLabelText(/Six-digit code/)).toBeNull();

    await user.type(screen.getByLabelText(/Email address/), 'admin@csas.local');
    await user.type(screen.getByLabelText(/Password/), 'a-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByLabelText(/Six-digit code/)).toBeDefined();
  });

  it('has no axe violations, in both languages', async () => {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      const { container, unmount } = mount(<StaffSignIn onBack={() => undefined} />, locale);
      await expectNoViolations(container);
      unmount();
    }
  });
});
