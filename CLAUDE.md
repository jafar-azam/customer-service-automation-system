# CLAUDE.md — conventions for working in this repository

Read this before touching anything. It is the short form; the reasoning lives in
`docs/steps/NN-*/README.md`, which is the real record.

## What this project is, and what it is not

C.S.A.S is a **portfolio release**: it runs entirely on one laptop, costs
nothing, and is meant to be published as a public repository and defended in
front of an academic committee.

The long specification describes a production system. This build stops at
**step 37**. Everything deferred is listed in `docs/roadmap/PRODUCTION.md` and
**must not be started** unless the user says "continue to production".

Non-negotiables that follow from that:

- **No paid services, no cloud accounts, no deployment, no TLS certificates.**
- **Every external provider is an interface with a mock implementation**, and
  the mock is the default. The whole application and every test must run with
  **zero API keys and no GPU**. Where a free local alternative exists (Ollama,
  faster-whisper, Piper, ClamAV) it is the optional "real" provider, behind a
  Compose profile, with its memory cost documented.
- **No real personal data in the repository, ever.** `reference/` is git-ignored
  and holds real customer interactions; nothing derived from it may be
  committed, and no row from it enters a training split.

## How a step is done

Each numbered step ends with **all** of:

1. `docs/steps/NN-name/README.md`, written for a learner: goal; what was built
   and why, including the alternatives rejected; files changed; exact commands;
   how to verify (requests in order with their real responses, and what to look
   at in MongoDB Compass); the security controls added and the test proving
   each; what the user must configure; a checklist.
2. Tests that were **actually run**, with their real output pasted in.
3. The application **actually run** — not just unit-tested. Several of the best
   findings so far came only from starting the stack.
4. A Conventional Commits commit.

Each phase ends with a **STOP**: summarise, show the test results, list what the
user must configure, and wait.

Two steps are explicit approval gates: **01** (the plan) and **09** (three design
directions — present them and wait for the choice).

## Rules that have already been decided

Do not re-litigate these; they are recorded with reasoning in step 01 §9.

| Decision | Value |
| :-- | :-- |
| Code licence | Apache-2.0; project data CC BY 4.0 |
| `seniordata.csv` | Real business data. Local-only, never committed, never trained on, every imported row flagged `Publishable: false` |
| Seed knowledge base | TechQA (CDLA-Permissive-1.0), downloaded by script, never committed |
| Demo two-factor | `DEMO_MODE` with a fixed documented TOTP secret, **refused when `NODE_ENV=production`** |
| Job queue | BullMQ + Redis |
| MongoDB | Single-node **replica set** (transactions and change streams), auth on, least-privilege application user |
| Metrics | Prometheus text endpoint, not OpenTelemetry |
| LoRA experiment (step 26) | Skipped; in the roadmap |

## Code conventions

- **TypeScript strict everywhere**, including `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature`. Python
  is `ruff` + `mypy --strict`.
- **Layering**: routes → controllers → services → repositories. Object-level
  authorization lives in the repository layer, which is what makes the
  cross-customer access tests meaningful.
- **Dependency injection over singletons.** `createApp` takes its logger,
  metrics, health registry and error tracker as arguments. A module-level
  Prometheus registry throws on the second test that builds an app.
- **Validate every input with zod** — body, query, params and socket events —
  rejecting unknown fields.
- **Type-check with `npm run typecheck` (`tsc -b`), never `tsc -p apps/client`.**
  `apps/client/tsconfig.json` is a references-only stub with `"files": []`, so
  `tsc -p apps/client --noEmit` checks nothing and exits 0 — a guaranteed green
  that hides real errors. The real config is `tsconfig.app.json`. The server's
  own config does have an `include`, which makes the client's silence easy to
  miss by analogy.
- **Comments explain *why*.** No placeholder comments, no dead code, no TODOs
  left in a finished step.
- **Check the current version of a dependency before adding it.** Do not install
  from memory, and do not use deprecated or unmaintained packages.

## Logging rules

- Structured JSON only. Pretty printing is `LOG_PRETTY=true`, a dev dependency.
- **Never log free-form customer text** — messages, transcripts, ticket bodies.
  That is the richest personal data in the system.
- Sensitive field names are redacted at every depth by `observability/logger.ts`.
  `code` is deliberately *not* on that list (it is the API error code); the OTP
  must therefore never be logged under any name.
- Log a masked value under `phoneMasked` / `emailMasked` using the helpers, so
  the redaction list does not swallow it.
- A request id reaches every line through `AsyncLocalStorage`; never thread it
  through function signatures.

## Security rules

- The threat model (`docs/security/THREAT_MODEL.md`) and the checklist mapping
  each requirement to its test are living documents — update them in the step
  that adds the control, not afterwards.
- Treat user input **and knowledge-base content** as untrusted data, kept apart
  from the system prompt. The model gets no tools and no database access.
- Never build a query or a regular expression from raw input. No
  `dangerouslySetInnerHTML`.
- Model artefacts are safetensors or ONNX with recorded hashes, verified before
  loading. **Never load a pickle.**
- Only human-approved data enters a training set.
- If the secret scanner blocks a commit, **fix the cause**. If it is a false
  positive, fix the scanner and add a test — never bypass the hook. A gate
  people route around is worse than no gate.

## Environment notes for this machine

- A native Windows `mongod` owns `127.0.0.1:27017`, so `.env` sets
  `MONGO_HOST_PORT=27018`. Only the host-side port moves.
- Chromium downloads fail here, so mermaid-cli cannot render locally; expect the
  same obstacle when installing Playwright browsers at step 33.
- The RTX 3070 (8 GB) handles Phase 7 training locally. Colab/Kaggle notebooks
  are still delivered, because a reviewer without a GPU must be able to
  reproduce the results.
