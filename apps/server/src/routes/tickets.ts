import { INPUT_FORMS, PRIORITIES, TICKET_STATUSES, type Env } from '@csas/shared';
import { Router, type Request } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { requireCustomer, requireStaff } from '../http/authenticate.js';
import { ApiError } from '../http/errors.js';
import { rateLimit, TICKET_LIMITS } from '../http/rate-limit-middleware.js';
import { validate, validatedQuery } from '../http/validate.js';
import { listMessages } from '../repositories/messages.js';
import { customerScope, staffScope, type Scope } from '../repositories/scope.js';
import { findTicket, listTickets } from '../repositories/tickets.js';
import { postMessage } from '../services/messages.js';
import {
  allowedTransitions,
  assignTicket,
  createTicket,
  transitionTicket,
} from '../services/tickets.js';
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

/* `coerce` on the query, because every query value arrives as a string.
   `strictObject` so an unknown filter is a 400 rather than silently ignored —
   a client asking for `?customerId=…` should be told it is not a filter, not
   quietly served everything. */
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
});

export interface TicketRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly events: TicketEvents;
  readonly audience: 'customer' | 'staff';
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

export function ticketRouter({ env, logger, events, audience }: TicketRouterOptions): Router {
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
    const options = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.priority === undefined ? {} : { priority: query.priority }),
      ...(query.assignedToMe === undefined ? {} : { assignedToMe: query.assignedToMe }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.before === undefined ? {} : { before: query.before }),
    };

    listTickets(scopeFor(req, audience), options)
      .then((tickets) => {
        res.json({ tickets: tickets.map((ticket) => present(ticket)) });
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
        });
      })
      .catch(next);
  });

  router.get('/:id/messages', validate({ params: idSchema }), (req, res, next) => {
    listMessages(scopeFor(req, audience), ticketId(req))
      .then((messages) => {
        res.json({ messages: messages.map((message) => presentMessage(message)) });
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

export function presentMessage(message: {
  _id: unknown;
  author: string;
  body: string;
  inputForm: string;
  internal: boolean;
  confidence?: number;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: String(message._id),
    author: message.author,
    body: message.body,
    inputForm: message.inputForm,
    internal: message.internal,
    confidence: message.confidence ?? null,
    createdAt: message.createdAt,
  };
}
