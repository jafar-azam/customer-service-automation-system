# Production roadmap — everything deferred or reduced for the portfolio release

This file is opened at step 01 and kept current as each step defers something. It is finalized at
step 37. Every entry names **what was built instead**, **what completing it requires**, and **which
step of the full specification it belongs to**.

Nothing here is started unless the instruction "continue to production" is given.

| # | Deferred item | Shipped instead | To complete | Spec step |
| :-- | :-- | :-- | :-- | :-- |
| P1 | Real WhatsApp + SMS delivery to +961 | Mock transport + dev-inbox page showing every message; full OTP/anti-pumping logic implemented against it | Meta business portfolio + verified sender, or a Twilio paid account; authentication + utility template approval; Alfa/touch acceptance pilot on real handsets; signature verification against live callbacks. Pricing as of Oct 2026 is in `docs/research/messaging-lebanon.md` — re-verify before budgeting, it changed on 1 Oct 2026 | 08, 16, 31 |
| P2 | Real transactional email | Mock + dev inbox | Any SMTP provider, SPF/DKIM/DMARC on a domain, bounce handling | 07, 31 |
| P3 | Paid / cloud AI providers | Deterministic mock (default) + optional local Ollama | Provider account, key management, per-request cost budget enforcement, a real circuit-breaker test against a live endpoint | 15, 18 |
| P4 | MongoDB Atlas Vector Search | In-process cosine similarity behind a `VectorIndex` interface | Atlas cluster, vector index definition, migration of cached embeddings, latency re-measurement | 15 |
| P5 | TLS, HSTS, production Compose profile, deployment guide (`docs/deployment`) | Local Nginx reverse proxy without TLS | Domain, certificates (ACME), production env var table, hardened Compose/orchestration, deployment runbook | 02, 32, 37 |
| P6 | External monitoring and alerting | Structured logs, `/health`, `/ready`, `/metrics`, alerts surfaced in the dashboard and dev inbox | Self-hosted or paid error tracking with PII scrubbing and source maps, metrics backend, uptime check, alert delivery to admins | 03, 36 |
| P7 | Off-site encrypted backups | Local backup + restore scripts + automated restore test | Off-site target, encryption key custody, retention enforcement, a real restore drill with timings against the documented RPO/RTO | 36 |
| P8 | LoRA fine-tune for Lebanese response style (step 26) | Not attempted; grounding in the KB is unchanged | GPU time, a licence-cleared base model, blind native-speaker rating protocol. Must never replace KB grounding | 26 |
| P9 | Full-scale load testing | k6 locally at 50 concurrent customers on Docker Compose, reported as local results | Representative hardware, 200+ concurrent customers, p95 < 500 ms excluding AI time, bottleneck analysis re-run | 35 |
| P10 | Legal review for commercial use | Educational Privacy page + the lawyer-confirmation list from `docs/research/privacy-law.md` reproduced as open questions | Lebanese counsel on Law 81/2018 Art. 94 filing exemptions, Art. 91/97 sensitive data, Law 140/1999 recording legality, AI-training basis, mandatory log classification, transfers; GDPR scope assessment if any EU exposure | 32 |
| P11 | Human test set at research-recommended scale | 200 human-written questions (≈40 per input form), with confidence intervals reported | ~385 items for ±5 pp overall, ~400 per input form for per-form claims; double annotation with adjudication | 21 |
| P12 | Consented real-data collection | Project-owned synthetic data only | Written data-processing and contribution agreement with a business, de-identification pipeline, re-identification review, deletion procedure | 19 |
| P13 | TypeScript 7 (the native-port compiler) | TypeScript 6.0.3, because `typescript-eslint@8.72` caps at `<6.1.0` and TS 7 would silently disable every type-aware lint rule | typescript-eslint support for TS 7; then bump and re-run `npm run verify` | 02 |
| P14 | Docker base images pinned by sha256 digest | Pinned to exact tags; `npm run pin:images` rewrites them to digests | Docker running locally (the registry's auth endpoint is unreachable from the build sandbox); run once and commit the diff | 02 |
