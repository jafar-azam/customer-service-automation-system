# Step 15 — The assistant

**Phase 5 begins. Status: complete and verified** against the test suite and
the running Compose stack on 2026-10-26.

## Goal

Answer a customer's question from approved knowledge, with a citation — or
hand it to a human and say so.

This is the step the project is named after, and the generation is the easy
part. What makes it safe to put in front of a customer is everything that
happens **after** the model returns, because a language model will produce a
fluent, confident, wrong answer and there is no setting that stops it.

---

## 1. What was built

```
apps/server/src/services/
├── providers/embeddings.ts     mock (lexical) and local (ML service)
├── providers/llm.ts            mock (extractive) and ollama
└── rag/
    ├── retrieve.ts             hybrid search over an in-memory index
    ├── embed-entries.ts        the backfill that makes retrieval possible
    ├── prompt.ts               injection-resistant prompt construction
    ├── answer.ts               the decision: answer, or escalate and why
    └── respond.ts              turning that into a message on the ticket
routes/assistant.ts             POST /api/customer/tickets/:id/ask
jobs/                           + the embedding backfill
```

---

## 2. Why this is not `$vectorSearch`

That operator exists only on MongoDB **Atlas**. This release runs self-hosted
Community in Docker — a hard constraint from section 0 — so the vector
comparison happens in the application, over an index held in memory.

That is a real trade. It costs memory proportional to the knowledge base (621
entries × 256 dimensions is under a megabyte) and a linear scan per query. It
stops being right somewhere in the low hundreds of thousands of entries, at
which point a vector database is the answer — which is in `PRODUCTION.md`
rather than pretended away here.

Retrieval is **hybrid**, because neither half is sufficient. Lexical matching
cannot connect Arabizi to Arabic script — the characters have nothing in
common. Vector matching is weak on exact identifiers: a customer quoting
`KB-0412` wants *that* entry, not the one that is semantically nearby.

---

## 3. The mock providers do real work

Both follow the rule established by step 12's EICAR-detecting scanner: **a mock
that always produces something plausible makes the failure path unreachable,
and nobody discovers it is broken until a customer is relying on it.**

**The mock LLM is extractive.** It returns the best document's text with a real
citation, and returns `NO_ANSWER` when nothing was retrieved. The refusal path
is therefore reachable and tested.

**The mock embedder is lexical, and this is stated plainly in its own source.**
It hashes character trigrams, so near-identical text scores highly and
unrelated text does not — enough to exercise retrieval, ranking, thresholds and
citation enforcement without a model. It cannot connect `الطابعة لا تطبع` to
"printer won't print", because nothing in it understands either. Saying so
matters: a mock that silently produced plausible similarity would make step
21's retrieval evaluation meaningless, because it would be measuring the hash.

---

## 4. Prompt injection: three defences, honestly ranked

1. **The model has no tools and no database access.** It takes text and returns
   text. A successful injection can make it say something wrong; it cannot make
   it *do* anything. This is the one that actually holds.
2. **Data is delimited and the delimiter is stripped from the data**, so a
   document cannot close its own block. Control and bidirectional characters go
   too — they are invisible in every review tool a human would use to approve
   an entry, which makes them the natural hiding place.
3. **Answers are verified after generation.** Real database ids never enter the
   prompt; documents are labelled `KB-1`, `KB-2`. So an injected instruction
   cannot name a document it was not shown, and a label the model invents is
   rejected.

Tested with a poisoned knowledge-base entry *and* a poisoned question. In both
cases the prompt does not leak and the answer never reaches the customer.

---

## 5. What makes an answer trustworthy

Any of these escalates instead of answering:

| Reason | What it catches |
| :-- | :-- |
| `no_documents` | nothing retrieved at all |
| `low_confidence` | best score below the floor — checked **before** calling the model |
| `ambiguous` | the ranking is flat; see §6 |
| `model_declined` | the model said it could not answer — a success of the design |
| `no_citations` | an ungrounded answer, however well it reads |
| `invalid_citation` | a document that was not retrieved |
| `provider_error` | a failure, never an apology invented on its behalf |

Both paths write a **message on the ticket**. An escalation that silently
changed the status would leave the customer watching a screen where nothing
happened — the worst possible reading of "we are getting someone".

---

## 6. Three bugs found by running it

The suite was green for all three. None was visible to any test.

### 6.1 618 approved entries, zero embeddings

The first real question escalated with `no_documents` — and so did every other
one. The seed imports content and the approval flow marks it usable, but
**nothing had ever computed a vector**. The assistant was structurally unable
to answer anything, correctly and uselessly.

`embed-entries.ts` is the fix: a backfill that embeds anything missing a
vector, edited since it was embedded, or produced by a different model. That
last condition matters more than it looks — vectors from two models are not
comparable, so a mixed index does not degrade gracefully, it ranks nonsense
confidently.

### 6.2 Jobs started before the database connected

Every boot logged two alarming stack traces, then BullMQ's retry quietly fixed
it seconds later. The retry is the right safety net and the wrong thing to rely
on for an ordering we control. Jobs now start when the connection resolves.
Zero errors at boot.

### 6.3 The lexical score always awarded a perfect 1.0

This is the interesting one.

Three of the first four live questions were answered **confidently and wrongly**
— including *"how do I register a new company in Lebanon?"* answered from an
SPSS licensing article at 0.636 confidence.

The cause was mine. I normalised the MongoDB text score against the best result
in the set, which guarantees the top text match always scores exactly 1.0
however weak it is. With a few hundred entries almost any question produces
*some* text match, so every answer gained a flat 0.3. I had even written a
comment rationalising it.

Squashing instead — `raw / (raw + 1)` — is monotone, so ranking is preserved,
and saturating, so an unbounded score maps into [0, 1) without inventing
certainty. Confidences dropped, ordering held.

**It was not enough**, which led to the finding below.

---

## 7. The finding: a high score can mean nothing

After the squash, the wrong answers persisted at 0.53. Rather than tune the
threshold until the demo looked good — the cardinal sin here — I measured the
top of the ranking:

```
Q: the print spooler stops after the 4.1 upgrade
    0.556  How do I change the default 'fit content by' b…
    0.554  Can I change the ITCAM J2EE Agent Monitoring L…
    margin top-2: 0.0015

Q: how do I register a new company in Lebanon?
    0.500  How do I transfer my SPSS 24 license key to a …
    0.500  How do I transfer my SPSS 24 license key to a …
    margin top-2: 0.0000
```

**The gap between first and second place was 0.0015 and 0.0000.** Retrieval had
not discriminated at all. It returned a flat spread of mediocre scores, and the
top of a flat list is noise whatever its absolute value.

So there is a second guard: the best document must beat the runner-up by a
margin. That is a **relative** test, so unlike the absolute floor it does not
depend on how a particular embedding model scales its scores. 0.05 is far above
the measured noise and far below the separation a genuine match produces.

The general lesson, which generalises past this project: **an absolute
similarity score is not evidence of relevance. The shape of the ranking is.**

---

## 8. What the run produced

After seeding four entries a customer might actually ask about:

```
── a question the KB answers ──
   outcome : answered | confidence 0.831 | 1 source(s)
   reply   : After the 4.1 update the print spooler service does not restart…
   ticket  : awaiting_customer

── the same thing, in Arabic ──
   outcome : escalated | low_confidence | confidence 0.247
   reply   : لم أجد إجابة مؤكدة لهذا في قاعدة المعرفة…

── something the KB does not cover ──
   outcome : escalated | ambiguous | confidence 0.531

── a prompt injection attempt ──
   outcome : escalated | ambiguous | confidence 0.530
```

The Arabic escalation is correct and is the mock embedder's honest limit: a
trigram hash cannot bridge scripts. With `EMBEDDINGS_PROVIDER=local` and a
sentence transformer it should not escalate, and step 21 measures whether it
does — **per input form**, which is exactly why that metric is specified that
way.

---

## 9. Security controls, and the test proving each

| Control | Test |
| :-- | :-- |
| KB content and questions kept out of the system prompt | poisoned entry and poisoned question both fail to leak or redirect |
| The model has no tools | the interface takes a prompt and returns a string |
| Citations validated against what was retrieved | a fabricated `[KB-9]` escalates; the text never reaches the customer |
| An uncited answer is refused | escalates however confident it reads |
| Only approved entries are retrievable | a draft matching the question exactly still escalates |
| Below the floor, escalate before generating | the model is never called |
| A flat ranking escalates | `ambiguous`, despite scoring above the floor |
| The audit records the reason, never the question | asserted on the entry's JSON |
| A question about another customer's ticket | 404, and no assistant message written |
| Generation is rate limited per account | 30/hour, the tightest limit in the system |

---

## 10. How to verify

```bash
npm run test -w @csas/server    # 657 tests
npm run up
```

Wait for `embedding backfill complete`, then sign in and ask a question on a
ticket. In Compass: `kb_entries` documents gain `embedding`, `embeddingModel`
and `embeddingUpdatedAt`; an answered question leaves an `assistant` message
with a populated `citations` array and a `confidence`.

For real answers: `docker compose --profile llm up -d ollama` and set
`LLM_PROVIDER=ollama`. It costs about 3 GB of RAM.

---

## 11. What this step does not do

- **Nothing is calibrated.** Both thresholds are reasoned, not fitted. Step 21
  builds the labelled set and step 24 fits them, with a risk–coverage curve.
- **No retries, circuit breaker or degraded mode.** A provider failure
  escalates. Step 18.
- **No resolution confirmation or rating.** Step 16.
- **The knowledge base cannot be edited.** Step 17 adds the approval workflow —
  and the index invalidation hook it will call already exists.
- **No streaming.** The answer arrives in one response and over the socket.
- **Arabic retrieval is weak with the default provider**, and that is a
  property of the mock rather than of the design.

---

## 12. What you must configure

Nothing. The mock providers are the default and the backfill runs on its own.

---

## 13. Checklist

- [x] Retrieval over approved knowledge only, enforced in the query
- [x] Hybrid lexical and vector search, self-hosted, no Atlas dependency
- [x] An embedding backfill, re-running when the text or the model changes
- [x] Prompt built so documents and questions are data, not instructions
- [x] The model has no tools and no database access
- [x] Citations validated against what was actually retrieved
- [x] Uncited, declined, low-confidence and ambiguous answers all escalate
- [x] A message written on the ticket either way
- [x] The application actually run, and three bugs found by doing so
