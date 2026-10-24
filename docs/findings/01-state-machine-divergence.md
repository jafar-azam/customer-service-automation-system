# Finding 01 — Two components disagreeing about who may do what

**Found:** 24 October 2026, during step 11.
**Class:** authorization correctness — a permission rule enforced in two places
that did not agree.
**Found by:** a test comparing the two, not by either of them failing on its own.
**Severity as shipped:** none. It was caught before the step was committed. Had
it shipped, the symptom would have been intermittent `422` responses on a
perfectly ordinary customer action.

---

## 1. The design

A ticket moves between eight statuses. Two pieces of code decide those moves,
and they exist for different reasons.

**The transition table** (`services/tickets.ts`) answers *may this actor make
this move?* It is data, not branches:

```ts
awaiting_customer: {
  in_progress: ['staff', 'system'],
  escalated:   ['staff', 'system'],
  …
}
```

It exists because without it, "can this ticket be resolved?" is answered by
whichever handler happens to be running, and the answers drift — a customer
closing a ticket by one path that an agent cannot by another.

**The message consequence** (`services/messages.ts`) answers a different
question: *what does writing a message do to the ticket?* A customer replying
to a ticket that was waiting on them puts it back in our queue. An agent
replying hands it back to the customer. An internal note does nothing, because
it is staff talking to each other and must not stop the first-response clock.

```ts
if (scope.kind === 'customer') {
  if (current === 'awaiting_customer') return 'in_progress';
  …
}
```

Both are correct in isolation. Both were reviewed. Neither is obviously wrong
when you read it.

## 2. The disagreement

The table said `awaiting_customer → in_progress` required `staff` or `system`.

The message path performed exactly that transition **on a customer's behalf**,
every time a customer replied to a ticket that was waiting on them — which is
the single most ordinary thing a customer does in this product.

So the system held two incompatible beliefs:

| Question | Answer |
| :-- | :-- |
| May a customer move `awaiting_customer → in_progress`? (the table) | **No** |
| Does a customer moving `awaiting_customer → in_progress` happen? (the message path) | **Constantly** |

## 3. Why neither test caught it

The two were tested separately, and both passed:

- The transition tests asserted the table's contents — including, explicitly,
  that a customer could *not* make that move. That test passed because the
  table said so.
- The message tests asserted that a customer reply moves the ticket to
  `in_progress`. That test passed because the code did so.

Each test confirmed its own component. Neither could see the contradiction,
because **the contradiction was not inside either component**. This is the
characteristic shape of the bug class: every part is self-consistent, and the
inconsistency lives in the relationship between them, where no unit test looks.

## 4. What did catch it

A test that asserts the two agree, rather than asserting what either one says:

```ts
it('never produces a transition the state machine forbids', () => {
  for (const status of TICKET_STATUSES) {
    for (const scope of [customer, agent]) {
      const next = statusAfterMessage(status, scope, false);
      if (next === null) continue;
      expect(canTransition(status, next, scope), `${status} → ${next}`).toBe(true);
    }
  }
});
```

It failed on the first run:

```
AssertionError: awaiting_customer → in_progress: expected false to be true
```

Written in the same sitting as the code it tested, for no better reason than
that both functions were on screen and the duplication looked suspicious.

## 5. Which one was wrong

The **table**, not the message path.

That is worth stating, because the instinct on seeing a permission check fail
is to assume the permission check is right and the caller is overreaching. Here
it was the opposite. A customer replying to a question genuinely *is* an actor
moving the ticket — not a trigger causing the system to move it on their
behalf. Modelling it as a system action would have been a second lie: the audit
log would have attributed the move to `system`, and the status history would
have shown nobody responsible for a change a person made.

The fix was one entry:

```ts
in_progress: ['customer', 'staff', 'system'],
```

The accompanying comment records why, so the next reader does not "tighten" it
back:

> The customer is an actor here, not just a trigger. A reply is what puts the
> ticket back in our queue, and `postMessage` applies this very transition on
> their behalf — so if `customer` were missing, the message path would be
> making a move the table forbids and the two would disagree about who may do
> what.

## 6. What it would have cost

Not a security hole — it failed *closed*, in the direction that denies rather
than permits. The damage would have been correctness and trust:

- `POST /tickets/:id/status` with `to: 'in_progress'` would have returned `422
  invalid_transition` to a customer for whom the identical change happened
  automatically a moment earlier when they sent a message.
- `allowedTransitions` is returned to the client so the UI knows which buttons
  to draw. The customer's own screen would have omitted an action the system
  performs for them.
- The divergence would have widened. Every future rule would have had to be
  added in two places, by someone who did not know the two were related.

## 7. The general lesson

**When one rule is enforced in two places, test that the two agree — not that
each is correct.**

Testing each component against its own specification is necessary and
insufficient. It proves each part does what it says; it cannot prove the parts
say the same thing. The cheap mitigation is a test that puts both in the same
room and compares them, which is usually a short loop over the domain:

- the transition table against the message consequence (this finding);
- the Arabic and English string catalogues against each other, so a key or an
  interpolation variable cannot exist in one and not the other (step 10,
  MSG-03);
- the hand-written class list against the stylesheet's real exports (step 10);
- the checklist's header counts against its own table (step 04) — which caught
  a wrong count on the day it was written;
- the explicit Levantine month table against the runtime's CLDR data (step 10).

Each of those is a few lines, and each exists because the two things it
compares had already drifted, or obviously would.

## 8. Related

- `docs/steps/11-tickets-and-messages/README.md` §3.1 — the finding in context
- `apps/server/src/services/tickets.test.ts` — the consistency test
- `docs/findings/` — this directory holds defects worth explaining rather than
  just fixing. A finding earns a file when the *way it was found* generalises.
