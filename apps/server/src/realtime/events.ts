import type { MessageDocument } from '../repositories/messages.js';
import type { TicketDocument } from '../repositories/tickets.js';

/**
 * What the HTTP layer announces, without knowing how.
 *
 * The routers depend on this interface rather than on Socket.IO, so a route
 * test runs without a server, a port or a transport — and so the day this
 * project needs a second consumer (a webhook, an outbox table) the routers do
 * not change. `NullTicketEvents` is what the route tests use.
 */
export interface TicketEvents {
  ticketCreated(ticket: TicketDocument, message: MessageDocument): void;
  ticketUpdated(ticket: TicketDocument): void;
  messagePosted(ticket: TicketDocument, message: MessageDocument): void;
}

export class NullTicketEvents implements TicketEvents {
  readonly emitted: { event: string; reference: string }[] = [];

  ticketCreated(ticket: TicketDocument): void {
    this.emitted.push({ event: 'ticket.created', reference: ticket.reference });
  }

  ticketUpdated(ticket: TicketDocument): void {
    this.emitted.push({ event: 'ticket.updated', reference: ticket.reference });
  }

  messagePosted(ticket: TicketDocument): void {
    this.emitted.push({ event: 'message.posted', reference: ticket.reference });
  }
}

/** One room per ticket. The id, never the reference: references are guessable. */
export function ticketRoom(ticketId: string): string {
  return `ticket:${ticketId}`;
}

/**
 * The staff room, for queue-level events.
 *
 * Customers are never in it. A new ticket from one customer must not appear on
 * another customer's screen, and a single broadcast room is the easiest way to
 * make exactly that mistake.
 */
export const STAFF_ROOM = 'staff';

/**
 * A recorder whose destination is set after construction.
 *
 * There is a genuine ordering cycle at startup: Socket.IO attaches to the HTTP
 * server, the HTTP server wraps the Express app, and the Express app needs the
 * event recorder its routers announce through. Something has to be late-bound,
 * and a one-line delegate is a smaller price than passing a factory down three
 * layers or reaching for a module-level singleton — which `CLAUDE.md` rules
 * out for the reason that would bite here: two tests building two apps.
 *
 * Before `bind`, announcements are dropped rather than queued. The only window
 * is between `createApp` and `createRealtime`, during which the server is not
 * yet listening and there is nothing to announce.
 */
export class DeferredTicketEvents implements TicketEvents {
  private target: TicketEvents | undefined;

  bind(target: TicketEvents): void {
    this.target = target;
  }

  ticketCreated(ticket: TicketDocument, message: MessageDocument): void {
    this.target?.ticketCreated(ticket, message);
  }

  ticketUpdated(ticket: TicketDocument): void {
    this.target?.ticketUpdated(ticket);
  }

  messagePosted(ticket: TicketDocument, message: MessageDocument): void {
    this.target?.messagePosted(ticket, message);
  }
}
