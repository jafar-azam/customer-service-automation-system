import {
  INPUT_FORMS,
  LOCALES,
  PRIORITIES,
  TICKET_STATUSES,
  type Env,
  type Locale,
} from '@csas/shared';
import { Router, type Request } from 'express';
import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import { z } from 'zod';
import { requireCustomer, requireStaff } from '../http/authenticate.js';
import { ApiError } from '../http/errors.js';
import { rateLimit, TICKET_LIMITS } from '../http/rate-limit-middleware.js';
import { validate, validatedQuery } from '../http/validate.js';
import { listMessages } from '../repositories/messages.js';
import { customerScope, staffScope, type Scope } from '../repositories/scope.js';
import { countTickets, findTicket, listTickets } from '../repositories/tickets.js';
import { postMessage } from '../services/messages.js';
import {
  allowedTransitions,
  assignTicket,
  canReopen,
  createTicket,
  reopenClosedTicket,
  transitionTicket,
} from '../services/tickets.js';
import { canConfirm, confirmResolution, rateTicket } from '../services/resolution.js';
import { MockMessagingProvider, type MessagingProvider } from '../services/providers/messaging.js';
import { renderTranscript, transcriptFilename } from '../services/transcript.js';
import type { TicketEvents } from '../realtime/events.js';

/**
 * Tickets and their conversations.
 *
 * One router for both audiences, mounted twice with a different guard. The
 * alternative — a customer router and a staff router — would duplicate every
 * handler, and the two copies would drift: the bug that follows is a filter
 * fixed on one side and not the other.
 *
 * What differs between them is entirely carried by the **scope**, and the
 * scope is built here from the authenticated actor and never from the request
 * body or query. Everything downstream takes it as a required argument.
 */

const createSchema = z.strictObject({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(20_000),
  priority: z.enum(PRIORITIES).optional(),
  inputForm: z.enum(INPUT_FORMS).optional(),
});

const messageSchema = z.strictObject({
  body: z.string().trim().min(1).max(20_000),
  inputForm: z.enum(INPUT_FORMS).optional(),
  internal: z.boolean().optional(),
});

const transitionSchema = z.strictObject({
  to: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(500).optional(),
});

const assignSchema = z.strictObject({
  staffId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const idSchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) });

/**
 * "Did that solve it?"
 *
 * `solved` is required and has no default. A default would mean a malformed
 * client silently records satisfaction nobody expressed, and this is the one
 * number in the system that must not be inferred.
 *
 * The score is optional, because the two questions are asked together in the
 * interface but a customer may answer only the first.
 */
const confirmSchema = z.strictObject({
  solved: z.boolean(),
  score: z.number().int().min(1).max(5).optional(),
  /* Free-form customer text: bounded, stored, and never logged. */
  comment: z.string().trim().max(2000).optional(),
});

const ratingSchema = z.strictObject({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

/* `coerce` on the query, because every query value arrives as a string.
   `strictObject` so an unknown filter is a 400 rather than silently ignored —
   a client asking for `?customerId=…` should be told it is not a filter, not
   quietly served everything. */
const reopenSchema = z.strictObject({
  body: z.string().trim().min(1).max(20_000),
});

const transcriptQuery = z.strictObject({
  /* The transcript is a file the customer keeps, so its language is theirs to
     choose rather than inherited from whatever the interface happened to be
     set to when they clicked. */
  locale: z.enum(LOCALES).optional(),
});

const listSchema = z.strictObject({
  status: z
    .union([z.enum(TICKET_STATUSES), z.array(z.enum(TICKET_STATUSES))])
    .optional()
    .transform((value) => (value === undefined ? undefined : [value].flat())),
  priority: z
    .union([z.enum(PRIORITIES), z.array(z.enum(PRIORITIES))])
    .optional()
    .transform((value) => (value === undefined ? undefined : [value].flat())),
  assignedToMe: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.coerce.date().optional(),
  openedAfter: z.coerce.date().optional(),
  openedBefore: z.coerce.date().optional(),
  /* Bounded: an unbounded search string is a regular expression built from
     user input, however well escaped. */
  search: z.string().trim().max(120).optional(),
});

export interface TicketRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly events: TicketEvents;
  readonly audience: 'customer' | 'staff';
  /* Injected so a test can assert on what would have been sent, and so the
     mock stays the default exactly as it is for the OTP sender. */
  readonly messaging?: MessagingProvider;
}

/**
 * The validated ticket id.
 *
 * `validate({ params: idSchema })` has already rejected anything that is not
 * 24 hex characters; this narrows the type Express gives (`string | string[]`,
 * because a repeated parameter is an array) without a cast that would also
 * accept the array.
 */
function ticketId(req: Request): string {
  const value = req.params['id'];
  if (typeof value !== 'string') throw new ApiError(404, 'not_found', 'Not found');
  return value;
}

/** The scope, from the authenticated actor and nothing else. */
function scopeFor(req: Request, audience: 'customer' | 'staff'): Scope {
  if (audience === 'customer') {
    if (!req.customerActor)
      throw new ApiError(401, 'unauthenticated', 'Authentication is required');
    return customerScope(req.customerActor.customerId);
  }
  if (!req.actor) throw new ApiError(401, 'unauthenticated', 'Authentication is required');
  return staffScope(req.actor.staffId, req.actor.role);
}

export function ticketRouter(options: TicketRouterOptions): Router {
  const { env, logger, events, audience } = options;
  const messaging =
    options.messaging ?? new MockMessagingProvider(logger, { revealCodes: env.DEMO_MODE });
  const router = Router();

  router.use(audience === 'customer' ? requireCustomer({ env }) : requireStaff({ env }));
  /* After the guard, so the limit is charged to an account rather than to an
     address, and an unauthenticated flood is rejected before it costs a Redis
     round trip. */
  router.use(rateLimit(TICKET_LIMITS.read));

  router.get('/', validate({ query: listSchema }), (req, res, next) => {
    const query = validatedQuery(req) as z.infer<typeof listSchema>;
    /* Built by omission rather than by assigning `undefined`:
       `exactOptionalPropertyTypes` draws a distinction between "absent" and
       "present and undefined", and a filter key holding `undefined` would be
       passed to Mongo as a real constraint matching nothing. */
    /* Every key of the schema appears here. The first version of this listed
       only the five filters that existed at the time, so when the date range
       and search were added they parsed successfully and were then dropped —
       an API that accepted a filter and silently ignored it, which is worse
       than refusing one. Three tests caught it; nothing in the schema could. */
    const options = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.priority === undefined ? {} : { priority: query.priority }),
      ...(query.assignedToMe === undefined ? {} : { assignedToMe: query.assignedToMe }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.before === undefined ? {} : { before: query.before }),
      ...(query.openedAfter === undefined ? {} : { openedAfter: query.openedAfter }),
      ...(query.openedBefore === undefined ? {} : { openedBefore: query.openedBefore }),
      ...(query.search === undefined ? {} : { search: query.search }),
    };

    const scope = scopeFor(req, audience);
    /* The count runs against the same filter, so "showing 25 of 112" cannot
       disagree with the rows. Built once and passed to both. */
    Promise.all([listTickets(scope, options), countTickets(scope, options)])
      .then(([tickets, total]) => {
        res.json({
          tickets: tickets.map((ticket) => present(ticket)),
          total,
          limit: options.limit ?? 25,
        });
      })
      .catch(next);
  });

  router.get('/:id', validate({ params: idSchema }), (req, res, next) => {
    const scope = scopeFor(req, audience);
    findTicket(scope, ticketId(req))
      .then((ticket) => {
        res.json({
          ticket: present(ticket),
          /* The client should not have to encode the state machine to know
             which buttons to draw, and a second copy of it in the client is a
             second copy to get wrong. */
          allowedTransitions: allowedTransitions(ticket.status, scope),
          timeline: timeline(ticket),
          /* Same function the reopen route uses, so the button the client
             draws and the request the server accepts cannot disagree. */
          reopen: canReopen(ticket, env.TICKET_REOPEN_WINDOW_DAYS),
          /* Same function `POST /:id/confirm` gates on, for the same reason as
             `reopen` above: the prompt the client draws and the request the
             server accepts cannot disagree. Customers only — an agent has no
             confirm button, and sending them eligibility for one would invite
             a client to draw it. */
          ...(audience === 'customer' ? { confirm: canConfirm(ticket) } : {}),
          continues: ticket.reopenedFromId ? String(ticket.reopenedFromId) : null,
        });
      })
      .catch(next);
  });

  router.get('/:id/messages', validate({ params: idSchema }), (req, res, next) => {
    listMessages(scopeFor(req, audience), ticketId(req))
      .then((messages) => {
        res.json({ messages: messages.map((message) => presentMessage(message, audience)) });
      })
      .catch(next);
  });

  /* No CSRF check on these, deliberately. CSRF is an attack on *ambient*
     credentials: the browser attaches a cookie to a cross-origin request the
     user did not intend. These routes authenticate with an `Authorization`
     header, which another origin cannot set on a cross-origin request without
     CORS permission this server does not grant — so there is nothing ambient
     to abuse. `/api/auth/refresh` and `/api/auth/logout` are the endpoints
     that act on a cookie, and they are the ones that carry the check.

     An earlier version of this router did apply it, and the integration tests
     passed, because supertest attaches whatever cookie it is handed without
     honouring the cookie's `path`. A real browser does honour it: the CSRF
     cookie is scoped to `/api/auth`, so it never reaches here and every write
     failed with `csrf_failed` the first time the stack was driven by hand. */
  router.post(
    '/',
    rateLimit(TICKET_LIMITS.create),
    validate({ body: createSchema }),
    (req, res, next) => {
      const scope = scopeFor(req, audience);
      createTicket(scope, req.body as z.infer<typeof createSchema>, logger)
        .then(({ ticket, message }) => {
          events.ticketCreated(ticket, message);
          res.status(201).json({ ticket: present(ticket), message: presentMessage(message) });
        })
        .catch(next);
    },
  );

  router.post(
    '/:id/messages',
    rateLimit(TICKET_LIMITS.message),
    validate({ params: idSchema, body: messageSchema }),
    (req, res, next) => {
      const scope = scopeFor(req, audience);
      postMessage(scope, ticketId(req), req.body as z.infer<typeof messageSchema>, logger)
        .then(({ message, ticket }) => {
          events.messagePosted(ticket, message);
          res.status(201).json({ message: presentMessage(message), ticket: present(ticket) });
        })
        .catch(next);
    },
  );

  router.post(
    '/:id/status',
    rateLimit(TICKET_LIMITS.transition),
    validate({ params: idSchema, body: transitionSchema }),
    (req, res, next) => {
      const scope = scopeFor(req, audience);
      transitionTicket(scope, ticketId(req), req.body as z.infer<typeof transitionSchema>, logger)
        .then((ticket) => {
          events.ticketUpdated(ticket);
          res.json({ ticket: present(ticket) });
        })
        .catch(next);
    },
  );

  /**
   * The conversation as a file.
   *
   * A GET so it can be a plain link, and no signed token: unlike an
   * attachment this is generated on demand from records the caller has
   * already proved they may read, so there is nothing to leak by URL that a
   * session does not already grant.
   */
  router.get(
    '/:id/transcript',
    validate({ params: idSchema, query: transcriptQuery }),
    (req, res, next) => {
      const scope = scopeFor(req, audience);
      const query = validatedQuery(req) as z.infer<typeof transcriptQuery>;
      const locale: Locale = query.locale ?? 'en-LB';
      const id = ticketId(req);

      Promise.all([findTicket(scope, id), listMessages(scope, id, { limit: 200 })])
        .then(([ticket, messages]) => {
          const text = renderTranscript({ locale, ticket, messages });
          res.setHeader('content-type', 'text/plain; charset=utf-8');
          res.setHeader('x-content-type-options', 'nosniff');
          res.setHeader('cache-control', 'private, no-store');
          res.setHeader(
            'content-disposition',
            `attachment; filename="${transcriptFilename(ticket.reference)}"`,
          );
          res.send(text);
        })
        .catch(next);
    },
  );

  if (audience === 'customer') {
    /**
     * Continues a closed conversation.
     *
     * Creates a *new* ticket linked to the old one. `closed` is terminal in
     * the state machine on purpose — see step 11 — so this is not a
     * transition, and the original keeps the history it had when it closed.
     */
    router.post(
      '/:id/reopen',
      rateLimit(TICKET_LIMITS.create),
      validate({ params: idSchema, body: reopenSchema }),
      (req, res, next) => {
        const scope = scopeFor(req, audience);
        const body = req.body as z.infer<typeof reopenSchema>;
        reopenClosedTicket(scope, ticketId(req), body.body, env.TICKET_REOPEN_WINDOW_DAYS, logger)
          .then(({ ticket, message }) => {
            events.ticketCreated(ticket, message);
            res.status(201).json({ ticket: present(ticket), message: presentMessage(message) });
          })
          .catch(next);
      },
    );
  }

  if (audience === 'customer') {
    /**
     * Records the answer to "did that solve it?".
     *
     * Customer-only, enforced again in the service. An agent who could confirm
     * their own work would make every satisfaction figure meaningless, and a
     * busy queue invites exactly that shortcut — so the check lives in the
     * service too, where a future internal caller also meets it.
     *
     * Rate-limited as a transition rather than a read: it closes or escalates a
     * ticket, and the escalation path sends a message to a person.
     */
    router.post(
      '/:id/confirm',
      rateLimit(TICKET_LIMITS.transition),
      validate({ params: idSchema, body: confirmSchema }),
      (req, res, next) => {
        const scope = scopeFor(req, audience);
        const body = req.body as z.infer<typeof confirmSchema>;
        confirmResolution(scope, ticketId(req), body, { logger, messaging })
          .then(({ ticket, message, escalated }) => {
            events.ticketUpdated(ticket);
            events.messagePosted(ticket, message);
            res.json({ ticket: present(ticket), message: presentMessage(message), escalated });
          })
          .catch(next);
      },
    );

    /**
     * The rating on its own.
     *
     * Separate from `confirm` because a customer may rate a ticket an agent
     * closed, days later, from the ticket list — there is no resolution to
     * confirm at that point, only an opinion to record.
     */
    router.post(
      '/:id/rating',
      rateLimit(TICKET_LIMITS.transition),
      validate({ params: idSchema, body: ratingSchema }),
      (req, res, next) => {
        const scope = scopeFor(req, audience);
        const body = req.body as z.infer<typeof ratingSchema>;
        rateTicket(scope, ticketId(req), body.score, body.comment, logger)
          .then(() => {
            /* 204: the rating is not a resource the client reads back, and
               echoing it invites a client to treat its own submission as the
               stored state. */
            res.status(204).end();
          })
          .catch(next);
      },
    );
  }

  if (audience === 'staff') {
    router.post(
      '/:id/assign',
      rateLimit(TICKET_LIMITS.transition),
      validate({ params: idSchema, body: assignSchema }),
      (req, res, next) => {
        const scope = scopeFor(req, audience);
        const body = req.body as z.infer<typeof assignSchema>;
        assignTicket(scope, ticketId(req), body.staffId, logger)
          .then((ticket) => {
            events.ticketUpdated(ticket);
            res.json({ ticket: present(ticket) });
          })
          .catch(next);
      },
    );
  }

  return router;
}

/* ── Presentation ───────────────────────────────────────────────────────────
   Explicit field lists, not `toJSON` on the document. A projection written by
   hand is a list of what leaves the system; a spread is a promise to review
   every future schema addition, which nobody keeps. The fields deliberately
   absent here are the internal ids — a customer has no use for
   `assignedStaffId`, and it identifies an employee. */

export function present(ticket: {
  _id: unknown;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  inputForm: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  reopenedCount: number;
  sla: { firstResponseDueAt?: Date; resolutionDueAt?: Date; firstRespondedAt?: Date };
}): Record<string, unknown> {
  return {
    id: String(ticket._id),
    reference: ticket.reference,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    inputForm: ticket.inputForm,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt ?? null,
    closedAt: ticket.closedAt ?? null,
    reopenedCount: ticket.reopenedCount,
    sla: {
      firstResponseDueAt: ticket.sla.firstResponseDueAt ?? null,
      resolutionDueAt: ticket.sla.resolutionDueAt ?? null,
      firstRespondedAt: ticket.sla.firstRespondedAt ?? null,
    },
  };
}

/**
 * A citation as it reaches the presenter.
 *
 * `kbEntryId` is typed rather than `unknown`: a lean document gives an
 * `ObjectId` and a plain object gives a string, and both stringify correctly —
 * but `String(unknown)` would also accept something that renders as
 * `[object Object]` in a response nobody checks.
 */
interface PresentableCitation {
  readonly kbEntryId?: Types.ObjectId | string;
  readonly version?: number;
  readonly title?: string;
}

/**
 * What the assistant's answer was grounded in.
 *
 * Step 15 refuses to send an answer that cites nothing, and records the entry
 * **and the version** it used — but until step 17 nothing ever showed them, so
 * the grounding was enforced and invisible. An unverifiable claim that an
 * answer is grounded is worth about as much as no claim.
 *
 * Staff get the entry id, so they can open it. Customers get the title only:
 * they have no knowledge endpoint to use an id on, and a reference to
 * something they cannot look at is noise rather than evidence.
 *
 * The version is what makes this worth storing. When an entry is edited to v3,
 * a transcript from last month still names v2 — which is the reason step 17
 * freezes old versions instead of overwriting them.
 */
function presentCitations(
  citations: readonly PresentableCitation[] | undefined,
  audience: 'customer' | 'staff',
): Record<string, unknown>[] {
  return (citations ?? []).map((citation) => ({
    ...(audience === 'staff' && citation.kbEntryId !== undefined
      ? { kbEntryId: citation.kbEntryId.toString() }
      : {}),
    version: citation.version ?? null,
    title: citation.title ?? null,
  }));
}

export function presentMessage(
  message: {
    _id: unknown;
    author: string;
    body: string;
    inputForm: string;
    internal: boolean;
    confidence?: number;
    citations?: readonly PresentableCitation[];
    createdAt: Date;
  },
  /* Defaults to the narrower audience. A presenter whose safe mode is the
     opt-in one leaks the first time somebody adds a call site. */
  audience: 'customer' | 'staff' = 'customer',
): Record<string, unknown> {
  return {
    id: String(message._id),
    author: message.author,
    body: message.body,
    inputForm: message.inputForm,
    internal: message.internal,
    confidence: message.confidence ?? null,
    citations: presentCitations(message.citations, audience),
    createdAt: message.createdAt,
  };
}

/**
 * The status timeline, as the detail view shows it.
 *
 * Derived from `statusHistory` rather than stored separately, so there is one
 * record of what happened. The staff id is deliberately **not** included: a
 * customer has no use for it and it identifies an employee. Who changed it is
 * reduced to a role.
 */
export function timeline(ticket: {
  statusHistory: {
    status: string;
    at: Date;
    byStaffId?: unknown;
    byCustomer?: boolean;
    note?: string;
  }[];
}): { status: string; at: Date; by: 'customer' | 'staff' | 'system'; note: string | null }[] {
  return ticket.statusHistory.map((entry) => ({
    status: entry.status,
    at: entry.at,
    by: entry.byCustomer === true ? 'customer' : entry.byStaffId ? 'staff' : 'system',
    note: entry.note ?? null,
  }));
}
