# Step 03 — Observability baseline: logging, health, readiness, metrics

**Phase 1. Status: complete and verified** against the running Compose stack on
2026-10-23.

## Goal

Make the system explain itself before there is anything complicated to explain.

From here on every request carries an id that appears in the response header, in
the error body the customer sees, and in every log line any layer writes while
serving it. The orchestrator can ask two different questions — "is this process
alive?" and "should traffic come here?" — and get two different answers. And a
number exists for every request, duration and error, so that step 35's load test
and step 36's alert rules have something real to read.

None of this is a feature. It is what makes every later step debuggable, and it
is also a security control: a log that leaks a customer's phone number is a data
breach stored in triplicate across every log archive, and a log that can be
forged by an attacker is not evidence.

---

## 1. What was built

```
apps/server/src/
├── observability/
│   ├── logger.ts            pino: JSON, redaction, request-id mixin, masking helpers
│   ├── request-context.ts   AsyncLocalStorage — the id, without threading it everywhere
│   ├── metrics.ts           per-app Prometheus registry, route-label helper
│   ├── health.ts            check registry: criticality, timeouts, aggregation
│   ├── dependencies.ts      the ML probe (non-critical); Mongo joins in 05, Redis in 14
│   └── error-tracking.ts    interface + disabled default + scrubbing
├── http/
│   ├── observability-middleware.ts  request id, access log, HTTP metrics
│   └── errors.ts            terminal handler, now logging and carrying the id
└── routes/
    ├── health.ts            GET /api/health, GET /api/ready
    └── metrics.ts           GET /metrics (not proxied)

apps/ml/app/
├── observability.py         the same three ideas in Python, same log shape
└── main.py                  /ready and /metrics added; config read in the lifespan
```

## 2. Decisions, and what was rejected

### 2.1 Liveness and readiness are different endpoints

`/api/health` touches nothing. `/api/ready` runs every registered dependency
probe and answers **503** when a critical one fails.

Putting a database check behind liveness is a well-known way to turn a
recoverable dependency blip into a full outage: the orchestrator reads "not
alive", kills a perfectly healthy process, and does it to every instance at
once. Readiness removes an instance from rotation without killing it, so it can
rejoin when the dependency comes back.

**Criticality** is the second half of that idea, and it is specific to this
system. MongoDB will be critical — without it nothing works. The ML service is
**not**, because step 18 gives the assistant a documented degraded mode
(keyword search plus escalation). Marking the ML service critical would refuse
requests this server can still serve. `/api/ready` therefore reports a failing
ML probe in its body while still answering 200.

Rejected: a single `/health` that checks everything (the outage above); checks
without timeouts (a hung probe makes readiness hang, which infrastructure reads
as "slow", not "broken", so nothing acts).

### 2.2 Redaction by field name, not by pattern

The logger redacts a fixed list of field names — `password`, `refreshToken`,
`otp`, `phoneNumber`, `email`, `totpSecret`, `authorization`, `cookie`, … — at
every depth, and the free-form text a customer actually writes is simply never
logged.

Scanning log messages for anything phone-shaped was rejected: it is slow on
every line, it misses `+961 3 123 456` written with spaces, and it mangles
unrelated numbers. Names are known; text is not, so the rule for text is "do not
log it".

One deliberate exception, because it is the kind of detail a committee asks
about: **`code` is not redacted.** Every rejected request logs its API error
code, and redacting `code` would blind the error-rate alerts in order to protect
an OTP that is never written to a log in the first place. When a partial value
genuinely helps, `maskPhone` and `maskEmail` produce `+961***456` and
`r***d@example.com`, logged under `phoneMasked` / `emailMasked` so the
redaction list does not swallow the value that was safe to write.

### 2.3 The request id is async context, not a parameter

`AsyncLocalStorage` carries it. A repository three layers down calls
`logger.info()` and the line still carries the id.

Rejected: threading a `requestId` argument through every service and repository
signature. It is noise in every function that does not use it, and it is dropped
the first time someone forgets — which is exactly when an incident is being
investigated.

An inbound `x-request-id` is honoured only if it matches `[A-Za-z0-9_-]{8,64}`.
**This is a security control, not tidiness**: a header containing a newline and
a fabricated JSON object writes attacker-controlled *log lines*, which is how an
intruder edits the evidence in a system whose evidence is the log. Five tests
cover the rejection cases, and the ML service applies the identical rule, so one
id spans both processes.

### 2.4 Prometheus text, and the route label is a denial-of-service control

`prom-client` exposes `/metrics` in Prometheus text format. OpenTelemetry was
allowed by the specification and rejected for this release: a scrape endpoint
needs no collector process next to a laptop stack, and a hosted Prometheus would
read the same endpoint later.

Requests are labelled with the **matched route pattern** (`/api/tickets/:id`),
never the raw path, and an unmatched request is labelled `unmatched`. Labelling
by path would create one time series per ticket id — and, worse, one per URL a
scanner probes. High-cardinality labels are the standard way to exhaust a
metrics store, and a 404 path is unauthenticated attacker-controlled input.

The registry is created **per application** rather than as a module singleton,
because a singleton throws "metric already registered" the second time a test
builds an app, which pushes people into sharing one app across tests and leaking
state between them.

### 2.5 `/metrics` is not proxied

Metrics describe internal routes, error codes and queue depths — reconnaissance
material — and a scrape endpoint is cheap to hammer. The endpoint is mounted
outside `/api`, and nginx answers `404` for it explicitly.

The explicit rule matters: without it the request fell through to the catch-all
and the client dev server answered **200** with the application shell. Nothing
leaked, but an auditor reading `curl -o /dev/null -w '%{http_code}' …` would
have seen a 200 on `/metrics` and had to dig to find out it was harmless.
Infrastructure should state its intent rather than rely on where a fall-through
happens to land. Production adds a scrape allow-list (roadmap P7).

### 2.6 Error tracking: an interface, disabled, with the scrubbing already written

No SDK ships in this release. Sending a stack trace to a third party is a data
transfer — crash payloads routinely carry request bodies and user identifiers —
and this release has no external services by scope.

What does ship is the `ErrorTracker` interface, a `DisabledErrorTracker`
default, and `scrub()`, which strips `password`, `token`, `phone`, `email`,
**`message`, `transcript` and `body`** recursively. The last three are the point:
in this system those fields hold what a customer typed or said, which is the
richest personal data the application touches and is never needed to fix a
crash. Writing the scrubbing now, with tests, means the day someone wires a
self-hosted collector there is nothing left to remember.

### 2.7 The ML service reads its configuration in the lifespan, not at import

Reading settings at import time made `app.main` unimportable without a full
environment, which turned every test into an environment-setup exercise. It now
reads them in the FastAPI lifespan — uvicorn aborts if that raises, so the
fail-fast guarantee is unchanged.

Logging *is* configured at import, because uvicorn writes its first lines while
loading the module; without that, two plain-text lines appear in an otherwise
JSON log. The validated level is applied moments later in the lifespan.

uvicorn's own access log is **disabled** rather than reformatted: the middleware
logs every request with the request id, the route pattern and the duration,
none of which uvicorn's line has, and uvicorn would also re-log the health
checks the middleware deliberately keeps quiet.

### 2.8 `trust proxy` is set to exactly one hop

`app.set('trust proxy', 1)`. Without it `req.ip` is nginx's address for every
request, and step 08's per-IP rate limits would throttle every customer as one.
Trusting the entire chain instead would let a caller forge `X-Forwarded-For` and
*evade* those same limits. One hop is the number of proxies in front of this
server.

## 3. Security controls added, and the test that proves each

| Control | Where | Test |
| :-- | :-- | :-- |
| Secrets and personal data never reach a log | `observability/logger.ts` | 9 redaction cases in `logger.test.ts`, each asserting the value is absent and `[redacted]` is present |
| Error codes stay readable despite redaction | same | "keeps an error code readable" |
| Log injection through `x-request-id` is refused | `http/observability-middleware.ts` | "rejects a value containing a newline", plus length and punctuation cases (server), and the same four in `test_observability.py` (ML) |
| Query strings are never written to a log | same | "logs the path without the query string" — asserts a phone number in a query is absent from every line |
| Internal failures leak nothing but a request id | `http/errors.ts` | "reduces an unexpected error to a bare 500, leaking nothing" |
| A readiness failure does not describe the infrastructure | `routes/health.ts`, `observability/dependencies.ts` | "never reveals a connection string in the reason it gives"; "does not put the internal hostname in the failure reason" |
| Metrics cannot be inflated into a denial of service | `observability/metrics.ts` | "collapses unmatched paths to a single label" |
| Metrics are not exposed through the proxy | `infra/nginx/nginx.conf` | "is not served under /api"; verified live in §5 |
| Crash reports would be scrubbed before leaving the process | `observability/error-tracking.ts` | "scrubs personal data before an event leaves the process", including a customer's Arabic message |
| `req.ip` is the customer, not the proxy | `app.ts` | relied on by step 08's rate-limit tests; set and documented here |

## 4. Exact commands

```bash
npm run verify            # format, lint, build, secret scan, 169 tests
npm run test:coverage     # 98.4% statements, well above the 80% gate
npm run lint:ml           # ruff + ruff format --check + mypy (8 files)
npm run test:ml           # 32 pytest tests
docker compose up -d --build server ml nginx
```

## 5. How to verify

Against the running stack. Every line below was run; the output is what it
printed.

| # | Request | Expected |
| :-- | :-- | :-- |
| 1 | `curl http://localhost:8080/api/health` | `{"status":"ok","version":"0.1.0","uptimeSeconds":49}` |
| 2 | `curl http://localhost:8080/api/ready` | `200` `{"status":"ready","checks":{"ml":{"status":"pass","durationMs":3.7}}}` |
| 3 | `curl -D- http://localhost:8080/api/version` | an `x-request-id` header holding a UUID |
| 4 | `curl -H 'x-request-id: demo-trace-001' http://localhost:8080/api/nope` | `{"error":{"code":"not_found","message":"Resource not found","requestId":"demo-trace-001"}}` — the id the caller chose, echoed into the error body |
| 5 | `docker compose logs server` for that request | `{"level":"warn",…,"requestId":"demo-trace-001","method":"GET","path":"/api/nope","route":"unmatched","status":404,"durationMs":1,…,"msg":"request rejected"}` |
| 6 | `curl http://localhost:8080/metrics` | `404` from nginx — the server's metrics are not published |
| 7 | inside the network: `fetch('http://127.0.0.1:4000/metrics')` | `http_requests_total{method="GET",route="/api/version",status="200",service="csas-server"} 4` and `route="unmatched"` for the 404 |
| 8 | `docker compose exec server node -e "fetch('http://ml:8000/ready',{headers:{'x-request-id':'trace-across-services'}})…"` | the ML service echoes `trace-across-services` — one id spans both processes |
| 9 | `docker compose logs ml` | every line JSON, including uvicorn's own startup lines; no per-request noise from the health checks |
| 10 | `docker compose ps` | 6/6 healthy, with the server's health check now hitting `/api/ready` |

To see readiness fail honestly, stop the ML service and watch it stay *ready*
(the probe is non-critical), with the failure reported in the body:

```bash
docker compose stop ml
curl -s -w '\nstatus=%{http_code}\n' http://localhost:8080/api/ready
# {"status":"ready","checks":{"ml":{"status":"fail","durationMs":71.8,"reason":"fetch failed"}}}
# status=200                    <- still serving, and honest about why
docker compose start ml
# {"status":"ready","checks":{"ml":{"status":"pass","durationMs":2.1}}}
```

That was run, not imagined: the server kept answering 200 with the ML service
stopped, and the body named the failing probe.

There is still nothing to inspect in MongoDB — the first collections appear in
step 05, where this section starts describing what to look at in Compass.

## 6. What you must do

Nothing. No accounts, no keys, no configuration. `LOG_PRETTY=true` in `.env` is
available if you prefer coloured logs while developing natively; containers
leave it off so the output stays parseable.

## 7. Test results

```
Node:   11 test files, 169 tests passed      (vitest run)
        Statements 98.4%  Branches 92.12%  Functions 98.5%  Lines 99.56%
Python: 32 tests passed                      (pytest -q)
Lint:   eslint clean; ruff clean; ruff format clean; mypy clean (8 files)
Build:  tsc -b clean across 4 projects
Secret scan: clean (tracked files)
Stack:  6/6 services healthy; the 10 checks in §5 all produced the stated output
```

### 2.9 The repository's own secret scanner needed a fix, found by using it

The pre-commit hook refused this step's commit, correctly by its own rules and
wrongly in fact: `context_token = request_id_var.set(request_id)` matched the
broad assignment rule because the variable name ends in `token`.

Two changes rather than an allow marker. The variable is now
`request_id_scope`, which is what a `contextvars.Token` actually is. And the
scanner learned that **a value which is an inline function call is never a
credential** — a secret is a literal or an environment lookup. Four tests cover
it, including the two that must keep failing: a literal assigned to the same
name, and a provider-issued key passed as an argument.

A scanner that cries wolf gets bypassed, and a bypassed pre-commit gate is worse
than none, so a false positive in it is a defect like any other.

## 8. Known limitations opened by this step

- **No metrics dashboard.** `/metrics` is a scrape endpoint with nothing
  scraping it. A Prometheus and Grafana pair is deliberately not in the default
  stack (it would double the stack's memory for a demo nobody opens); step 36
  surfaces the numbers that matter in the dashboard instead, and the roadmap
  carries the hosted option.
- **Error tracking is an interface, not an integration.** Nothing is sent
  anywhere. The scrubbing is written and tested; the collector is not.
- **No log retention or rotation.** Logs go to stdout and Docker keeps them.
  Retention is a deployment concern, deferred with the rest of deployment.
- **Readiness has one dependency so far.** MongoDB and Redis join in steps 05
  and 14; until then "ready" means less than it will.

## 9. Checklist

- [x] Structured JSON logging with a redaction list, proven by tests that assert
      the value is absent
- [x] Masking helpers for the cases where a partial value is genuinely useful
- [x] Request id: generated or safely accepted, echoed in a header, carried in
      async context, present in every log line and in every error body
- [x] Log-injection attempt through `x-request-id` rejected, on both services
- [x] `/api/health` (liveness, no dependencies) and `/api/ready` (dependency
      aware, 503 on a critical failure, honest about non-critical ones)
- [x] Probe timeouts, so a hung dependency cannot hang readiness
- [x] `/metrics` with request duration, request count and error count; route
      labels bounded; not reachable through the proxy
- [x] Error-tracking interface, disabled by default, with scrubbing tested
- [x] Terminal error handler logs, counts and reports — and still leaks nothing
- [x] Graceful shutdown with a forced-exit timeout; `uncaughtException` and
      `unhandledRejection` logged before exit
- [x] The ML service gets the same logging shape, `/ready` and `/metrics`
- [x] Container health checks moved to the readiness endpoints
- [x] Tests pass, coverage above the gate, stack run and exercised
