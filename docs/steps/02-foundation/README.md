# Step 02 — Monorepo, tooling, Docker Compose, environment validation

**Phase 1. Status: code complete and verified natively; the Compose stack is
written but not yet started, because Docker was not running on this machine.
See §7.**

## Goal

Create the skeleton every later step builds on: one repository with four
workspaces, a strict TypeScript and Python toolchain, commit-time gates that
catch mistakes before they are committed, a local stack that starts with one
command, and configuration that is validated before the server will boot.

Nothing in this step is a feature. The point is that from here on, a mistake is
caught by a tool rather than by a reviewer.

---

## 1. What was built

```
C.S.A.S
├── apps/
│   ├── client/          React + Vite web client (deliberately unstyled; see §2.6)
│   ├── server/          Express API: env validation, error contract, /api/version
│   └── ml/              FastAPI service: config, service-to-service auth, /health
├── packages/shared/     Types and zod schemas shared by client and server
├── infra/
│   ├── nginx/           Local reverse proxy: one origin for browser and API
│   └── mongo/           Replica-set init and least-privilege user creation
├── scripts/
│   ├── setup.mjs        Generates .env with real secrets (the "one command")
│   ├── secret-scan.mjs  Secret scanner: pre-commit, CI, and full git history
│   └── pin-images.mjs   Rewrites image tags to sha256 digests
├── .github/workflows/   CI: quality, ml, secrets, audit, docker, compose
├── docker-compose.yml   mongo, redis, ml, server, client, nginx (+ 2 profiles)
└── .husky/              pre-commit and commit-msg hooks
```

Dependency versions were all checked against the registry at build time rather
than recalled, as the plan requires. Current at 22 October 2026: TypeScript
6.0.3, Node 24.22.1, React 19.3, Vite 8.3, Express 5.3, Mongoose 9.11 (added in
step 05), zod 4.6, Vitest 5.0, ESLint 10.13, FastAPI 0.159, Ruff 0.17,
pytest 9.1.

## 2. Decisions, and what was rejected

### 2.1 TypeScript 6.0.3, not the latest 7.0.2

`typescript-eslint@8.72` — the only stable line, and the one ESLint 10 supports
— declares `typescript >=4.8.4 <6.1.0`. Installing TypeScript 7 would have
silently cost every type-aware lint rule: `no-floating-promises`,
`no-misused-promises`, `no-unsafe-member-access`. Those are the rules that catch
a dropped `await` in a request handler, which is a silent 500 in production.

A newer compiler is not worth losing them. Recorded in the roadmap (P13) and
revisited when typescript-eslint supports TypeScript 7.

### 2.2 Node 24, and why 20 was not an option

Node 20 was installed on this machine and reached end of life in April 2026.
Beyond the general problem of shipping on an unpatched runtime, it is not even
possible here: `vitest@5` requires Node ≥22.12 and `react-router@8` requires
≥22.22. Node 24 is pinned in `.nvmrc`, in `engines`, and in the Docker images.

### 2.3 BullMQ + Redis for jobs (container added now, used in step 14)

Decided in step 01 and confirmed here. Delayed jobs (SLA timers), repeatable
jobs (renewal reminders, retention sweeps), retries with backoff and jitter, and
idempotency keys are all first-class in BullMQ. Redis additionally gives the
atomic counters the OTP anti-abuse rules need in step 08, which MongoDB does
awkwardly. Rejected: Agenda (MongoDB-native, no extra container, but thinner
primitives and weaker maintenance), and anything requiring Postgres.

Redis runs with `--appendonly yes`, because a restart must not lose scheduled
SLA timers, and with `--requirepass`, because it will hold sessions and
rate-limit state and reaching the network should not be enough to read them.

### 2.4 MongoDB as a single-node replica set with authentication

A replica set is required for multi-document transactions and change streams.
Step 06 has to write a rotated refresh token, revoke the old session family and
append to the audit log as one unit; without transactions that becomes
compensating logic in exactly the place where correctness is a security
property.

Authentication plus a replica set requires internal authentication, which means
a keyfile. The keyfile is generated into a Docker volume by a one-shot container
that sets `0400` and the right owner — a bind-mounted keyfile fails on
Windows/WSL because of host file ownership, which is a well-known trap.
`infra/mongo/init-replica-set.js` then initiates the set and creates the
application user with `readWrite` on the `csas` database only: no `dbAdmin`, no
access to `admin`, no cluster rights. Both steps check their own state first, so
they are safe on every `up`.

### 2.5 `npm run setup` generates `.env`, instead of `cp .env.example .env`

Two requirements collided. The environment validator rejects placeholder
secrets, which is what makes it worth having. But "clone, one command, running
in five minutes" cannot work if the first step is to hand-generate six secrets.

`scripts/setup.mjs` renders `.env.example` with freshly generated values —
32-byte hex secrets, a 32-byte base64 AES key, distinct database passwords
threaded into both the URI and the standalone variable, a base32 TOTP secret —
writes the file `0600`, and prints the demo admin password once. It refuses to
overwrite an existing `.env` without `--force`, because that file holds the only
copy of the database passwords for an existing volume.

A test asserts the generated file passes the validator, in development *and*
production mode. That test is the quick start's guarantee.

### 2.6 The client is deliberately unstyled

Step 09 presents three design directions for you to choose from, and step 10
turns the chosen one into tokens. Anything decorative written now would have to
be thrown away — and worse, would quietly become the design by default. What the
client does prove is that it can reach the API through the reverse proxy and
render the answer.

### 2.7 A hand-written secret scanner rather than gitleaks

The pre-commit hook has to work on a fresh clone on Windows, macOS and Linux
with nothing but `npm ci`. A hook that depends on a separately installed Go
binary is a hook that gets skipped — and a skipped hook is worse than no hook,
because it is believed.

`scripts/secret-scan.mjs` has 13 rules: eleven provider-specific credential
shapes (AWS, GitHub, Google, Slack, OpenAI, Anthropic, Twilio ×2, Meta, JWT,
private keys), one for credentials inside connection strings, and two broad
rules for secret-ish assignments gated on a placeholder check and a Shannon
entropy threshold. It runs over staged files in the hook, tracked files in CI,
and **every blob in git history** for the step 37 release audit. Findings are
printed redacted — the first place a scanner's output goes is a terminal, and
after that a screenshot.

The audited escape hatch is a `secret-scan:allow` marker on a line; the
scanner's own test fixtures are its only current use.

## 3. Four bugs the tests and hooks caught

Worth recording, because each would have cost real time later.

1. **`.env.example` had inline comments** (`LLM_PROVIDER=mock  # mock | ollama`).
   Node's `--env-file`, Docker Compose's `env_file` and the dotenv libraries do
   not agree on whether text after `#` belongs to the value. The server would
   have booted natively and failed validation inside the container with
   `Invalid option: expected one of "mock"|"ollama"`. The fix is in the file, not
   in the parser: no inline comments anywhere in `.env.example`, kept honest by
   the test that runs the generated output through the validator.

2. **An oversized request body returned 500, not 413.** Express's body parser
   throws an error carrying a `type`; the terminal handler reduced it to a bare
   500. That tells the caller the server is broken when their request was, and
   makes a flood of oversized bodies look like an outage in the error-rate
   alerts. Now mapped: `entity.too.large` → 413, `entity.parse.failed` → 400,
   `encoding.unsupported` → 415.

3. **Component tests leaked into each other.** With `globals: false`, Testing
   Library's automatic cleanup never registers, so one test's component stayed
   mounted and the next test's `findByRole` matched the *previous* test's output.
   One test passed for entirely the wrong reason. `apps/client/src/test-setup.ts`
   now calls `cleanup()` after every test, before step 10 adds dozens more.

4. **The pre-commit hook blocked this step's own commit**, with 12 findings. All
   were false positives, and two pointed at a genuine gap: the scanner treated
   `mongodb://user:${MONGODB_APP_PASSWORD}@mongo` and `` `Demo-${hex(8)}` `` as
   literal credentials. They are references *to* a secret, not a secret, and a
   scanner that cries wolf on every Compose file gets disabled within a week. It
   now strips `${...}`, `$VAR` and `%VAR%` and judges what remains — while still
   flagging a real literal that sits next to an interpolation, which has its own
   test. The remaining fixtures carry the audited `secret-scan:allow` marker, and
   the demo TOTP value in `.env.example` was changed to one that reads as a
   placeholder (`CHANGEMEDEMOTOTPSECRET234567`) while staying valid base32.

## 4. Security controls added, and the test that proves each

| Control | Where | Proven by |
| :-- | :-- | :-- |
| Configuration validated before boot; process exits 1 with every problem listed | `packages/shared/src/env.ts` | `env.test.ts` "reports every problem at once" |
| Secret values never appear in an error message | same | "never includes the offending value in the message" |
| Secrets ≥32 characters; access and refresh secrets must differ | same | "requires at least 32 characters", "refuses the same value" |
| `DEMO_MODE` refused when `NODE_ENV=production` | same | "is refused outright in production" |
| Placeholder secrets refused in production | same | "refuses placeholder secrets left over from .env.example" |
| Phone encryption key must be exactly 32 bytes (AES-256-GCM) | same | "requires a 32-byte phone encryption key" |
| `CORS_ORIGINS` may not be `*` and may not carry a path | same | "refuses a wildcard origin", "refuses an origin carrying a path" |
| Unimplemented providers cannot be configured | same | "refuses a messaging provider that is not implemented" |
| Request body size limit (100 KB JSON) | `apps/server/src/app.ts` | "answers 413, not 500, for a body over the JSON limit" |
| Internal errors never leak a message, stack or connection string | `apps/server/src/http/errors.ts` | "reduces an unexpected error to a bare 500, leaking nothing" |
| Framework version not advertised | `app.ts` (`x-powered-by` off) | "does not advertise the framework" |
| ML service requires a bearer token, compared in constant time | `apps/ml/app/security.py` | 8 tests in `TestServiceAuthentication`, incl. prefix and malformed headers |
| ML service refuses a missing or short token at startup | `apps/ml/app/config.py` | `TestConfiguration` (4 tests) |
| Containers run as non-root | all three Dockerfiles | verified when the stack starts (§7) |
| Secrets cannot be committed | `.husky/pre-commit`, CI | 27 tests in `scripts/secret-scan.test.mjs` |
| Dependency vulnerabilities fail the build | `.github/workflows/ci.yml` | `npm audit --audit-level=high`, `pip-audit --strict` |

Not yet done, and deliberately: HTTPS/HSTS, CSP, helmet, rate limiting and CSRF
arrive with the endpoints they protect (steps 06–08, 32). `docs/security/` is
step 04's deliverable.

## 5. Exact commands

```bash
# One-time, on this machine
nvm install 24 && nvm alias default 24     # done
curl -LsSf https://astral.sh/uv/install.sh | sh   # done

# From a fresh clone
npm ci                      # installs all workspaces, sets up Husky hooks
npm run setup               # writes .env with generated secrets, prints demo login
npm run up                  # setup + docker compose up --build -d   (needs Docker)

# Day-to-day
npm run verify              # format:check + lint + build + secret scan + tests
npm run test:coverage       # enforces the >=80% server threshold
npm run test:ml             # pytest
npm run lint:ml             # ruff + ruff format --check + mypy
npm run dev                 # native server + client, with reload
npm run logs                # docker compose logs -f
npm run down                # stop the stack
```

## 6. How to verify

### 6.1 Natively, with no Docker (what was run here)

```bash
npm ci && npm run setup && npm run build
node --env-file=.env apps/server/dist/index.js
```

Then, in Postman or curl — in this order:

| # | Request | Expected |
| :-- | :-- | :-- |
| 1 | `GET http://localhost:4000/api/version` | `200`, body `{"name":"csas-server","version":"0.1.0","environment":"development"}`, and **no `X-Powered-By` header** |
| 2 | `GET http://localhost:4000/api/nope` | `404`, body `{"error":{"code":"not_found","message":"Resource not found"}}` |
| 3 | `POST http://localhost:4000/api/version` with a >100 KB JSON body | `413`, code `payload_too_large` |
| 4 | `POST http://localhost:4000/api/version` with body `{"unclosed":` | `400`, code `invalid_json` |
| 5 | Stop with `Ctrl-C` | log line `SIGTERM received, closing server`, exit 0 |
| 6 | `node apps/server/dist/index.js` with no environment | 11 named problems, **no values printed**, exit code 1 |

All six were run and produced exactly that. There is nothing to inspect in
MongoDB yet — the first collections appear in step 05, where this section starts
describing what to look at in Compass.

### 6.2 With Docker, once it is running

```bash
npm run up
docker compose ps                      # every service healthy
curl http://localhost:8080/api/version # through nginx
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/v1/version   # expect 401
docker compose exec server whoami      # expect "node", not root
docker compose exec ml whoami          # expect "mlsvc"
npm run pin:images                     # rewrite image tags to sha256 digests
```

MongoDB Compass connects to `mongodb://localhost:27017/?directConnection=true`
with the **root** credentials from `.env`. The application user
(`MONGODB_APP_USERNAME`) is intentionally limited to `readWrite` on `csas` and
cannot browse other databases — if Compass shows you everything, you are
connected as root, which is the point of having two users.

## 7. What you must do

1. **Start Docker Desktop** (it is installed; its WSL distro is currently
   stopped) and enable **Settings → Resources → WSL Integration → Ubuntu**.
   Then `docker --version` answers in this shell and §6.2 can run. **Step 02 is
   not finished until that passes** — the plan's rule is that no step is done
   without running the app.
2. Optionally raise the WSL memory limit to 12 GB in `C:\Users\<you>\.wslconfig`
   before enabling the `scan` (ClamAV) or `llm` (Ollama) profiles.
3. Nothing else. No accounts, no keys, no paid services.

## 8. Test results

```
Node:   6 test files, 94 tests passed          (vitest run)
        Statements 94.89%  Branches 87.75%  Functions 100%  Lines 96.8%
Python: 15 tests passed                        (pytest -q)
Lint:   eslint clean; ruff clean; ruff format clean; mypy clean (6 files)
Build:  tsc -b clean across 4 projects
Secret scan: clean (tracked files, and 18 blobs across full git history)
```

## 9. Checklist

- [x] npm workspaces: `apps/client`, `apps/server`, `apps/ml`, `packages/shared`
- [x] TypeScript strict everywhere, including `noUncheckedIndexedAccess` and
      `exactOptionalPropertyTypes`; project references so `tsc -b` checks all
- [x] ESLint 10 flat config with type-aware rules; Prettier; Ruff; mypy strict
- [x] Husky: pre-commit (lint-staged → secret scan → type-check), commit-msg
      (Conventional Commits via commitlint)
- [x] `.editorconfig`, `.gitattributes` (LF everywhere), complete `.gitignore`
- [x] Environment validated with zod, fail-fast, no values in errors
- [x] `.env.example` committed with placeholders only; `.env` generated and
      git-ignored
- [x] Apache-2.0 `LICENSE` and `NOTICE` recording TechQA's CDLA-Permissive-1.0
- [x] Docker Compose written: mongo (replica set + auth + least-privilege user),
      redis (persisted, password), ml, server, client, nginx, and opt-in
      `scan` / `llm` profiles
- [x] Dockerfiles multi-stage, non-root, with health checks
- [x] CI: quality, ml, secrets (full history), audit, docker build, compose
      smoke test — no secrets required
- [x] CodeQL and Dependabot configured
- [x] Tests pass, coverage above threshold, app runs and was exercised
- [ ] **`docker compose up` verified** — blocked on Docker Desktop (§7.1)
- [ ] **Image digests pinned** — `npm run pin:images`, needs Docker
