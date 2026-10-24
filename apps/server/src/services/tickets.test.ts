import { describe, expect, it } from 'vitest';
import { TICKET_STATUSES, type TicketStatus } from '@csas/shared';
import { allowedTransitions, canTransition } from './tickets.js';
import { statusAfterMessage } from './messages.js';
import { customerScope, staffScope, systemScope } from '../repositories/scope.js';

const customer = customerScope('507f1f77bcf86cd799439011');
const agent = staffScope('507f1f77bcf86cd799439012', 'agent');
const admin = staffScope('507f1f77bcf86cd799439013', 'admin');
const system = systemScope('sla-timer');

describe('the ticket state machine', () => {
  it('lets an agent work a ticket through to resolved', () => {
    expect(canTransition('open', 'in_progress', agent)).toBe(true);
    expect(canTransition('in_progress', 'awaiting_customer', agent)).toBe(true);
    expect(canTransition('awaiting_customer', 'resolved', agent)).toBe(true);
    expect(canTransition('resolved', 'closed', agent)).toBe(true);
  });

  /* A closed ticket is final. Step 13's reopen window creates a *new* ticket
     linked to it; allowing a transition out of `closed` would let an
     auto-close job and a customer fight over one record indefinitely. */
  it('makes closed terminal for everyone', () => {
    for (const status of TICKET_STATUSES) {
      for (const scope of [customer, agent, admin, system]) {
        expect(canTransition('closed', status, scope), `closed → ${status}`).toBe(false);
      }
    }
  });

  /* Exactly two moves, both of which are things a customer genuinely does:
     saying "that did not fix it", and answering a question we asked. The
     second exists because `postMessage` applies it on their behalf — keeping
     it out of the table would mean the message path and the state machine
     disagreed about who may do what. */
  it('lets a customer reopen and reply, and nothing else', () => {
    const moves = TICKET_STATUSES.flatMap((from) =>
      TICKET_STATUSES.filter((to) => canTransition(from, to, customer)).map(
        (to) => `${from} → ${to}`,
      ),
    );
    expect(moves.sort()).toEqual(['awaiting_customer → in_progress', 'resolved → reopened'].sort());
  });

  /* A background job that can make any transition is a job that can resurrect
     a closed ticket or silently resolve work nobody looked at. */
  it('gives the system a narrow set of moves', () => {
    expect(canTransition('open', 'assistant_answering', system)).toBe(true);
    expect(canTransition('assistant_answering', 'escalated', system)).toBe(true);
    expect(canTransition('open', 'in_progress', system)).toBe(false);
    expect(canTransition('resolved', 'reopened', system)).toBe(false);
  });

  it('never allows a transition to the same status', () => {
    for (const status of TICKET_STATUSES) {
      expect(canTransition(status, status, agent), status).toBe(false);
    }
  });

  it('reports what each actor may do from here', () => {
    expect(allowedTransitions('resolved', customer)).toEqual(['reopened']);
    expect(allowedTransitions('closed', agent)).toEqual([]);
    expect(allowedTransitions('open', agent).sort()).toEqual(
      ['awaiting_customer', 'closed', 'escalated', 'in_progress', 'resolved'].sort(),
    );
  });

  /* Every target has to be a status the schema accepts, or the transition
     passes this check and then fails Mongoose's enum at write time. */
  it('only names statuses the domain defines', () => {
    for (const from of TICKET_STATUSES) {
      for (const to of allowedTransitions(from, admin)) {
        expect(TICKET_STATUSES).toContain(to);
      }
    }
  });
});

describe('what a message does to a ticket', () => {
  /* An internal note is staff talking to each other. Treating it as a reply
     would stop the first-response clock on work nobody has answered. */
  it('does not move the ticket for an internal note', () => {
    for (const status of TICKET_STATUSES) {
      expect(statusAfterMessage(status, agent, true), status).toBeNull();
    }
  });

  it('puts a ticket back in the queue when the customer answers', () => {
    expect(statusAfterMessage('awaiting_customer', customer, false)).toBe('in_progress');
  });

  it('reopens a resolved ticket when the customer writes again', () => {
    expect(statusAfterMessage('resolved', customer, false)).toBe('reopened');
  });

  it('hands the ticket back to the customer when an agent replies', () => {
    for (const status of ['open', 'in_progress', 'reopened'] as TicketStatus[]) {
      expect(statusAfterMessage(status, agent, false), status).toBe('awaiting_customer');
    }
  });

  /* An escalation is resolved by a decision, not by the first person to type
     into it. */
  it('leaves an escalated ticket escalated', () => {
    expect(statusAfterMessage('escalated', agent, false)).toBeNull();
    expect(statusAfterMessage('escalated', customer, false)).toBeNull();
  });

  it('never produces a transition the state machine forbids', () => {
    for (const status of TICKET_STATUSES) {
      for (const scope of [customer, agent]) {
        const next = statusAfterMessage(status, scope, false);
        if (next === null) continue;
        expect(canTransition(status, next, scope), `${status} → ${next}`).toBe(true);
      }
    }
  });
});
