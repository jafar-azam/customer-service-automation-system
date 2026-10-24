import type { Env } from '@csas/shared';
import type { Server as HttpServer } from 'node:http';
import type { Logger } from 'pino';
import { Server, type Socket } from 'socket.io';
import { canAccessTicket } from '../repositories/tickets.js';
import { visibleTo, type MessageDocument } from '../repositories/messages.js';
import { customerScope, staffScope, type Scope } from '../repositories/scope.js';
import type { TicketDocument } from '../repositories/tickets.js';
import {
  isFamilyActive,
  verifyAccessToken,
  verifyCustomerAccessToken,
} from '../services/auth/tokens.js';
import { present, presentMessage } from '../routes/tickets.js';
import { STAFF_ROOM, ticketRoom, type TicketEvents } from './events.js';

/**
 * Real-time updates, authenticated and authorised.
 *
 * Two things make this different from the usual Socket.IO setup:
 *
 * **The handshake is authenticated, not the first message.** A connection with
 * no valid token is refused before any handler runs, so there is no window in
 * which an anonymous socket exists and some `if (!socket.user)` has to be
 * remembered in every listener.
 *
 * **Joining a room is an authorisation decision, taken by the same code that
 * guards HTTP.** `canAccessTicket` is the repository function the REST
 * handlers use. A separate socket-side check is how the two drift apart, and
 * the socket side is the one nobody re-reads.
 */

interface SocketUser {
  readonly scope: Scope;
}

const USER = Symbol('csas.user');

type AuthedSocket = Socket & { [USER]?: SocketUser };

function tokenFrom(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown };
  if (typeof auth.token === 'string' && auth.token.length > 0) return auth.token;
  /* A browser cannot set a header on a WebSocket, so `auth` is the real path;
     the header is here for `socket.io-client` in Node and for tests. */
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7);
  }
  return undefined;
}

/**
 * Resolves a token to a scope, or to nothing.
 *
 * Staff is tried first and customer second, and a token that verifies as
 * neither is refused. Both verifications check the session family, for the
 * same reason the HTTP guard does: a logged-out session's access token stays
 * cryptographically valid for its full fifteen minutes, and a socket is a
 * *long-lived* connection — without the family check, "log out" would mean
 * "stop receiving updates in a quarter of an hour", and the socket would
 * outlive the logout by longer than any request could.
 */
export async function scopeForToken(token: string, env: Env): Promise<Scope | undefined> {
  const staff = await verifyAccessToken(token, env.ACCESS_TOKEN_SECRET);
  if (staff && (await isFamilyActive(staff.sid))) return staffScope(staff.sub, staff.role);

  const customer = await verifyCustomerAccessToken(token, env.ACCESS_TOKEN_SECRET);
  if (customer && (await isFamilyActive(customer.sid))) return customerScope(customer.sub);

  return undefined;
}

export interface RealtimeOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly httpServer: HttpServer;
}

export class SocketTicketEvents implements TicketEvents {
  constructor(private readonly io: Server) {}

  ticketCreated(ticket: TicketDocument, message: MessageDocument): void {
    /* Only the staff room: the customer who just posted has the response in
       their hand already, and nobody else may know this ticket exists. */
    this.io.to(STAFF_ROOM).emit('ticket.created', {
      ticket: present(ticket),
      message: presentMessage(message),
    });
  }

  ticketUpdated(ticket: TicketDocument): void {
    const payload = { ticket: present(ticket) };
    this.io.to(ticketRoom(String(ticket._id))).emit('ticket.updated', payload);
    this.io.to(STAFF_ROOM).emit('ticket.updated', payload);
  }

  /**
   * Fans a message out to the people entitled to it.
   *
   * An internal note goes to the staff room and to **no** ticket room, because
   * a ticket room contains the customer. Broadcasting it to the room and
   * filtering in the browser would put the note on the customer's machine,
   * where "the UI does not render it" is not a security control.
   */
  messagePosted(ticket: TicketDocument, message: MessageDocument): void {
    const room = ticketRoom(String(ticket._id));
    const payload = { ticketId: String(ticket._id), message: presentMessage(message) };

    if (message.internal) {
      this.io.to(STAFF_ROOM).emit('message.posted', payload);
      return;
    }

    this.io.to(room).emit('message.posted', payload);
    this.io.to(STAFF_ROOM).emit('message.posted', payload);
  }
}

export function createRealtime({ env, logger, httpServer }: RealtimeOptions): {
  io: Server;
  events: TicketEvents;
} {
  const io = new Server(httpServer, {
    path: '/api/socket.io',
    /* Same-origin only. The browser reaches this through the same nginx that
       serves the application, so there is no cross-origin case to allow — and
       a permissive default here would let any page on the internet open an
       authenticated socket with a token it tricked out of the user. */
    cors: { origin: false },
    /* A socket that has not spoken in this long is gone. The default is
       generous for a chat application that should notice a dropped agent. */
    pingTimeout: 20_000,
    pingInterval: 25_000,
    maxHttpBufferSize: 100_000,
  });

  io.use((socket, next) => {
    const token = tokenFrom(socket);
    if (token === undefined) {
      next(new Error('unauthenticated'));
      return;
    }

    scopeForToken(token, env)
      .then((scope) => {
        if (!scope) {
          next(new Error('unauthenticated'));
          return;
        }
        (socket as AuthedSocket)[USER] = { scope };
        next();
      })
      .catch((error: unknown) => {
        logger.warn({ err: error }, 'socket authentication failed');
        next(new Error('unauthenticated'));
      });
  });

  io.on('connection', (socket) => {
    const user = (socket as AuthedSocket)[USER];
    if (!user) {
      /* Unreachable: the middleware above refuses the connection. Closing
         rather than trusting that is cheap, and the alternative is a socket
         with no scope reaching a handler that assumes one. */
      socket.disconnect(true);
      return;
    }

    const { scope } = user;
    if (scope.kind === 'staff') void socket.join(STAFF_ROOM);

    socket.on('ticket.join', (raw: unknown, ack?: (result: { ok: boolean }) => void) => {
      const ticketId = typeof raw === 'string' ? raw : '';
      canAccessTicket(scope, ticketId)
        .then((allowed) => {
          if (allowed) void socket.join(ticketRoom(ticketId));
          /* Acknowledged either way, with no detail. "You may not" and "it
             does not exist" are the same answer here for the same reason they
             are over HTTP. */
          ack?.({ ok: allowed });
        })
        .catch(() => {
          ack?.({ ok: false });
        });
    });

    socket.on('ticket.leave', (raw: unknown) => {
      if (typeof raw === 'string') void socket.leave(ticketRoom(raw));
    });
  });

  return { io, events: new SocketTicketEvents(io) };
}

export { visibleTo };
