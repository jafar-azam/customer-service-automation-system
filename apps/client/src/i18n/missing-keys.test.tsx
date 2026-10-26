import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@csas/shared';
import { LocaleProvider } from '../locale-context.js';
import { SessionProvider } from '../session.js';
import { ThemeProvider } from '../theme.js';
import { Approvals } from '../screens/Approvals.js';
import { History } from '../screens/History.js';
import { NewTicket } from '../screens/NewTicket.js';
import { PreferencesScreen } from '../screens/Preferences.js';
import { Queue } from '../screens/Queue.js';
import { SignIn } from '../screens/SignIn.js';
import { StaffSignIn } from '../screens/StaffSignIn.js';
import { StaffTicket } from '../screens/StaffTicket.js';
import { TicketDetail } from '../screens/TicketDetail.js';

/**
 * No screen asks for a string that does not exist.
 *
 * A missing key is silent: `t('history.reference')` returns
 * `history.reference`, React renders it, and the result looks like a styling
 * fault rather than a missing translation. Three column headings shipped on the
 * staff queue reading `HISTORY.REFERENCE`, and the suite was green — the
 * existing i18n tests check that the two locales *match each other* and that
 * every enum value has a label, neither of which notices a key nobody defined
 * in either language.
 *
 * This renders every screen in both languages with a listener on i18next's
 * `missingKey` event. It is a blunt instrument and that is the point: it needs
 * no knowledge of which keys a screen uses, so it keeps working as screens
 * change.
 */

const TICKET = {
  id: '507f1f77bcf86cd799439011',
  reference: 'CSAS-000123',
  subject: 'Printer stopped',
  status: 'awaiting_customer',
  priority: 'medium',
  inputForm: 'english',
  createdAt: '2026-10-24T09:00:00Z',
  updatedAt: '2026-10-24T10:00:00Z',
  resolvedAt: null,
  closedAt: null,
  reopenedCount: 0,
  sla: { firstResponseDueAt: null, resolutionDueAt: null, firstRespondedAt: null },
};

const MESSAGE = {
  id: 'm1',
  author: 'assistant',
  body: 'Turn it off for a minute.',
  inputForm: 'english',
  internal: false,
  confidence: 0.7,
  citations: [{ version: 2, title: 'Restarting a printer' }],
  createdAt: '2026-10-24T09:01:00Z',
};

const ENTRY = {
  id: '607f1f77bcf86cd799439011',
  title: 'Invoicing',
  body: 'Invoices are issued at the start of each cycle.',
  question: 'How is invoicing done?',
  language: 'en' as const,
  category: null,
  tags: [],
  status: 'pending_review',
  version: 2,
  reviewNote: null,
  source: 'human_collected',
  publishable: false,
  usageCount: 0,
  unhelpfulCount: 0,
  updatedAt: '2026-10-26T10:00:00Z',
};

/* Enough of an API that every screen renders its full tree rather than a
   loading state — a screen that never gets past "Loading…" asks for almost no
   strings and would pass this test without proving anything. */
const BODIES: Record<string, unknown> = {
  '/api/customer/tickets/507f1f77bcf86cd799439011/messages': { messages: [MESSAGE] },
  '/api/customer/tickets/507f1f77bcf86cd799439011/attachments': { attachments: [] },
  '/api/customer/tickets/507f1f77bcf86cd799439011': {
    ticket: TICKET,
    allowedTransitions: [],
    timeline: [{ status: 'open', at: '2026-10-24T09:00:00Z', by: 'customer', note: null }],
    reopen: { ok: true },
    confirm: { ok: true },
    continues: null,
  },
  '/api/customer/tickets': { tickets: [TICKET], total: 1, limit: 25 },
  '/api/customer/preferences': {
    preferences: {
      whatsapp: true,
      email: false,
      marketingOptOut: false,
      preferredLanguage: 'ar',
      emailAvailable: false,
    },
  },
  '/api/tickets/507f1f77bcf86cd799439011/messages': { messages: [MESSAGE] },
  '/api/tickets/507f1f77bcf86cd799439011': {
    ticket: TICKET,
    allowedTransitions: ['in_progress', 'resolved'],
    timeline: [{ status: 'open', at: '2026-10-24T09:00:00Z', by: 'customer', note: null }],
  },
  '/api/tickets': { tickets: [TICKET], total: 1, limit: 50 },
  '/api/knowledge/queue': { entries: [ENTRY], total: 1 },
  '/api/knowledge/607f1f77bcf86cd799439011': { entry: ENTRY, versions: [] },
  '/api/dev/inbox': { messages: [] },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const key = Object.keys(BODIES)
        .sort((a, b) => b.length - a.length)
        .find((candidate) => input.startsWith(candidate));
      return Promise.resolve(
        new Response(JSON.stringify(key === undefined ? {} : BODIES[key]), {
          status: key === undefined ? 404 : 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SCREENS: readonly [string, () => React.ReactElement][] = [
  ['SignIn', () => <SignIn />],
  ['StaffSignIn', () => <StaffSignIn onBack={() => undefined} />],
  ['History', () => <History onOpen={() => undefined} />],
  ['NewTicket', () => <NewTicket onOpened={() => undefined} onCancel={() => undefined} />],
  ['TicketDetail', () => <TicketDetail id={TICKET.id} onBack={() => undefined} />],
  ['Preferences', () => <PreferencesScreen />],
  ['Queue', () => <Queue onOpen={() => undefined} />],
  ['StaffTicket', () => <StaffTicket id={TICKET.id} onBack={() => undefined} />],
  ['Approvals', () => <Approvals />],
];

describe('every screen asks only for strings that exist', () => {
  for (const [name, build] of SCREENS) {
    for (const locale of ['en-LB', 'ar-LB'] as Locale[]) {
      it(`${name} in ${locale}`, async () => {
        const missing: string[] = [];

        const { unmount } = render(
          <ThemeProvider initial="light">
            <LocaleProvider
              initial={locale}
              onMissingKey={(key) => {
                missing.push(key);
              }}
            >
              <SessionProvider initial={{ status: 'anonymous' }}>{build()}</SessionProvider>
            </LocaleProvider>
          </ThemeProvider>,
        );

        /* Let the data land, so the loaded tree renders rather than the
           loading state. */
        await screen.findAllByRole('heading', {}, { timeout: 3000 }).catch(() => []);
        unmount();

        expect([...new Set(missing)]).toEqual([]);
      });
    }
  }
});
