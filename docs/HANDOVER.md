# Where this is, as of 2026-10-26

A working note for picking the build back up. Progress itself lives in
`docs/steps/NN-*/README.md` and in git history; this file records only what
those do not say.

## State

**17 of 37 steps**, plus the staff interface pulled forward out of step 29.

Phases 1–4 complete. Phase 5 is three of four: steps 15 (assistant), 16
(resolution and escalation) and 17 (the knowledge gate) are done; **step 18
closes the phase** — timeouts, retries with backoff and jitter, a circuit
breaker, a fallback provider, degraded keyword mode, caches invalidated on a
knowledge change, and cost tracking.

Measured today: 1,106 tests across 64 files, 44 smoke checks through nginx,
138 security-checklist requirements with 106 **done**.

## What a person can actually do

Both halves of the product are reachable in a browser at `http://localhost:8080`.
See the step 17 README and `docs/steps/13-history-and-detail/` for the customer
flow; the sign-in details are in the project memory rather than here, because
this file is committed and they are not secrets worth repeating.

- **Customers** sign in by phone, open a ticket, ask the assistant, read a
  grounded answer with its citation and version, attach files, confirm a
  resolution and rate it.
- **Staff** sign in with password and TOTP, work the ticket queue, reply or
  write an internal note, move a ticket through the state machine, and run the
  knowledge approval queue — write an answer, approve, reject.

## The one piece of real work waiting

**74 imported Arabic questions are still unanswered**, sitting `pending_review`
with the placeholder body step 16 wrote. Three were answered and approved as a
demonstration; those three are demo text written for a fictional company, not
domain knowledge.

Until somebody who knows the business writes the rest, the assistant can answer
almost nothing in Arabic — which is the product's whole point. The approval
queue is the screen for it, and `GET /api/knowledge/export.csv` → edit → `POST
/api/knowledge/import.csv` is the bulk path.

## Deviation from the plan, recorded deliberately

The staff interface belongs to **step 29**, in Phase 9. It was built on
2026-10-26, with the user's agreement, because the approval gate and the agent
queue could otherwise only be operated with `curl` — and a control only an
engineer can use is not a control the business has.

So step 29 is now partly done and **steps 18–28 are still ahead of it**. Anyone
reading the plan in order should know the dashboard exists already.

## Loose end

One test failed once during a full run on 2026-10-26 and was not identified —
the output scrolled past before it could be captured, and ten consecutive runs
since have been clean. If it reappears, run the suite with a JSON reporter so
the failure survives the scrollback.

Two flakes *were* found and fixed the same day, both worth knowing about because
they looked like test problems and were not: the fixtures read "the newest
one-time code" without checking whose it was, and the rate limiter set its
window in a second command that could be lost, stranding a counter with no
expiry. See the step 17 README §7a and §7b.
