# Step 14 — SLA timers, business hours, and the jobs that enforce them

**Phase 4 complete. Status: verified** against the test suite and the running
Compose stack on 2026-10-26.

## Goal

Make the deadlines real. A ticket has had `sla.firstResponseDueAt` since step
05 and nothing has ever computed it, let alone acted on it.

Four things have to be true together, or none of them is useful: the clock has
to run in **working time**, it has to **stop while we are waiting on the
customer**, something has to **look at it**, and that something has to be safe
to run twice.

---

## 1. What was built

```
apps/server/src/services/sla/
├── calendar.ts        Beirut hours, Lebanese holidays, working-time arithmetic
├── policy.ts          the tier × priority matrix
├── clock.ts           starting, pausing and resuming
└── rota.ts            who picks up the next ticket
apps/server/src/jobs/
├── queues.ts          BullMQ setup, repeatable schedules
├── sla-sweep.ts       warn, escalate, assign, and the retention sweep
└── index.ts           start and stop
```

---

## 2. The clock runs in working time

A four-hour target that burns through a Sunday night is not a promise anyone
made, and reporting a breach for it teaches agents to ignore breaches.

**No offset is ever hard-coded.** Beirut is UTC+2 in winter and UTC+3 in
summer, so `getUTCHours() + 2` is wrong for half the year and wrong in the
other direction across a transition. The local hour is asked of `Intl` for the
instant in question.

**Friday is a working day.** Lebanon is not a Sunday-to-Thursday week.

### 2.1 Holidays are a table, not a rule

Lebanon's calendar mixes four systems: fixed Gregorian dates, Western Easter,
Orthodox Easter, and the Islamic lunar year. The lunar dates are **announced**,
not computed — they depend on a moon sighting, and a library that calculates
them is confidently wrong about a day or two every year.

So `HOLIDAYS` is a table keyed by year, and asking about a year nobody has
filled in **throws**. Silently treating an unknown year as having no holidays
would quietly make every SLA in it too tight, and nobody would notice until the
reports were already wrong. 2026 and 2027 are entered; 2027's lunar dates are
marked provisional.

### 2.2 Stepping, not calculating

`nextOpening` walks forward in whole-day and part-day jumps rather than trying
to compute the answer. The clever version has to handle a holiday on a Monday,
three in a row around Eid, and a summer-time transition inside the gap. There
is a test for the Eid case because it is the one a day-by-day implementation
gets wrong.

---

## 3. The matrix has two dimensions

Priority alone ignores that a premium customer bought a faster answer. Tier
alone means a premium customer's cosmetic question outranks a basic customer's
outage. So targets are `tier × priority`, in **working minutes**.

Tests assert the matrix is monotonic in both directions and that no resolution
target is ever sooner than its first-response target — properties that are easy
to break by editing one cell.

`urgent` is deliberately not eight times faster than `low`. It is as fast as a
person can realistically be told and respond; the rest of the difference shows
up in the rota's paging rules rather than in a number nobody can meet.

---

## 4. Pausing is what makes the measurement honest

The clock stops while the ticket is `awaiting_customer`. Without it, a customer
who takes three days to answer a question causes a breach **we** are reported
for, and the measurement stops meaning anything.

Two details:

**Paused time is accumulated, not subtracted from the deadline.** The stored
`firstResponseDueAt` always answers "what did we promise when this opened",
which is what a report about the promise needs. The pause is added back when
the deadline is checked.

**`$inc`, not a computed total.** Two resumes racing would each write a total
derived from the same stale value.

**One write, not two.** The clock change rides in the same atomic update as the
status change — otherwise there is a window in which the status says "waiting
on the customer" and the clock is still running.

---

## 5. The sweeps are safe to run twice

A queue redelivers on a crash, two instances overlap during a deploy, and an
operator will eventually run one by hand.

So every write is guarded by the absence of the mark it sets — `breachedAt`,
`warningSentAt`, `deletedAt` — **in the query**, not in a prior read. Two
overlapping sweeps produce one escalation, one warning, one audit entry.

The warning fires at **75%** of the budget, with a quarter left to act in. A
warning at 100% is a breach notification wearing a different name.

Out of hours, **only urgent work pages anyone**. Paging for a low-priority
ticket at 02:00 is how an on-call rota stops being answered.

### 5.1 The rota

Least-load by default, ties broken by who was assigned least recently. The
thing that goes wrong in support is one person drowning while another is idle,
which is what least-load is for; the tie-break recovers the fairness
round-robin exists for without its blindness to the present.

An agent who has **never** been assigned sorts first — which is also how a rota
recovers after someone returns from leave.

Candidates are recomputed per ticket. Assigning ten from one snapshot would
give all ten to the same least-loaded agent.

### 5.2 Retention

Step 12 wrote a `deleteAfter` on every attachment and left the sweep here. The
bytes go **first** and the record is marked afterwards: the other order marks a
file deleted that is still on disk, and nothing ever comes back for it. One
unreadable file does not stop the sweep, and its record stays undeleted so it
remains visible.

---

## 6. Two bugs found by running it — with 574 tests green

Both were in the queue wiring, and **no test could see either**, because every
test calls the sweep functions directly and none of them constructed a `Queue`
or a `Worker`.

**`Queue name cannot contain :`.** The names were `csas:sla` and
`csas:retention`. BullMQ builds its Redis keys as `bull:<queue>:<thing>`, so a
colon produces an ambiguous key and the constructor refuses it.

**`maxRetriesPerRequest must be null`.** BullMQ's blocking connection refuses a
retry limit, because a blocking read that gives up after N retries silently
stops consuming the queue. The application's client keeps its limit — that is
right for a request with a user waiting — so the duplicate overrides it.

`jobs/queues.test.ts` now constructs both against a real Redis. It is the test
that would have caught both.

Worth noting what did **not** happen: the server kept serving through both.
Jobs are started outside the listen path and a failure is logged, because
timers stopping is bad and the whole service being down is worse.

---

## 7. How to verify

```bash
npm run test -w @csas/server     # 596 tests
npm run up                       # watch the sweep in the logs
```

Within a minute of starting:

```
{"msg":"background jobs started","slaIntervalMs":60000,"retentionIntervalMs":3600000}
{"warned":0,"breached":0,"paged":0,"assigned":21,"msg":"sla sweep acted"}
```

Opening an urgent ticket on a **premium** contract at 06:26 Beirut — before the
08:30 opening — produced:

```
first response due : 2026-10-26 09:00 local   (30 working minutes from 08:30)
resolution due     : 2026-10-26 12:30 local   (4 working hours from 08:30)
warn at            : 2026-10-26 08:53 local   (75% of 30 minutes)
```

The clock started at opening rather than at creation, which is the whole point.

---

## 8. What this step does not do

- **No resolution-deadline sweep.** `resolutionDueAt` is computed and stored;
  only the first-response deadline is swept. The second is the same shape and
  waits until step 29 has a queue screen to show it on.
- **The on-call number is a documented placeholder.** A real one is operational
  configuration, not source — and a fake one cannot page a stranger if this is
  ever run against a live provider by mistake.
- **No dead-letter handling beyond BullMQ's own.** Failed jobs are retried
  three times with backoff and kept for inspection; nothing routes them
  anywhere.
- **Holidays are entered to 2027.** 2028 will throw, deliberately, until
  someone adds it.
- **No business-hours configuration per customer.** One company, one calendar.
- **Conversation and audit retention** are not swept here — step 27.

---

## 9. What you must configure

Nothing. `TZ=Asia/Beirut` is already in `.env.example` and the holiday table
ships with the code.

---

## 10. Checklist

- [x] SLA targets per contract tier **and** priority, in working minutes
- [x] Beirut business hours with no hard-coded UTC offset
- [x] Lebanese public holidays, including the lunar and Orthodox dates
- [x] An unknown year fails loudly rather than assuming no holidays
- [x] The clock pauses while waiting on the customer, in the same write as the
      status change
- [x] Warnings before the deadline, escalation at it
- [x] Out-of-hours paging for urgent work only
- [x] Automatic assignment by least load, ties by least recently assigned
- [x] Attachment retention sweep, bytes before record
- [x] Every sweep safe to run twice, asserted
- [x] The application actually run, and two bugs found by doing so
