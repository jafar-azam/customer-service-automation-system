
# Lebanese-Arabic support dataset

**Build a bilingual MSA/English knowledge base, generate Lebanese query variants rather than synthetic support policies, and select the production stack using a separate, human-written Lebanese test set.** The strongest verified evidence supports **dialect-specific, few-shot generation**, an **Arabic-focused versus multilingual embedding bake-off**, and **native-speaker evaluation that separates meaning preservation from dialect naturalness**; it does **not** establish a universal winner for Lebanese Arabizi customer support. [Jon et al., March 2026](https://aclanthology.org/2026.abjadnlp-1.41.pdf)[^1_1][^1_2]

**Evidence cutoff: 22 October 2026.** The recommendations below distinguish published results from proposed project procedures. “**Unverified**” means that the relevant Lebanese result, license, price, or current-version comparison was not established from the sources inspected—not that the capability necessarily does not exist.

## Evidence and recency

| Evidence | Date | What it establishes | Important limitation |
| :-- | :-- | :-- | :-- |
| **AL-QASIDA** | December 2024; revised January 2025 | Separates dialect fidelity, understanding, quality, and diglossia; finds that few-shot examples can improve willingness to generate dialect.[^1_1] | Not a current Lebanese-support or Arabizi leaderboard |
| **Swan / ArabicMTEB** | NAACL 2025 | Arabic-focused embeddings evaluated across dialectal, cross-lingual, and cultural tasks.[^1_2] | Benchmark performance does not establish Lebanese Arabizi-to-support-document performance |
| **Current state of LLMs for Arabic dialectal machine translation** | 28 March 2026 | Direct comparisons including Lebanese translation; strong evidence for explicit dialect instructions and useful comparisons of GPT-4.1-mini and Jais-2.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) | Possible MADAR contamination; human evaluation is Egyptian, not Lebanese |
| **EDRAC** | September 2026 | Recent dialectal reading-comprehension and generative-QA evaluation, including Syrian Arabic and newer models such as GPT-5.4.[^1_3] | Abstract-level evidence inspected; not a Lebanese or Arabizi naturalness benchmark |
| **SHAMS** | 1 October 2026 | A speech-grounded Levantine benchmark including Lebanese, with aligned audio, orthography, diacritization, and phonetic transcription.[^1_4] | No Lebanese ASR ranking or WER could be verified from the inspected abstract |

An indexed WMT26 paper is dated **28–29 October 2026**, after this report’s cutoff; its newer Gemma/Fanar comparisons are therefore **excluded from the recommendation rankings**.[Primary paper](https://www2.statmt.org/wmt26/pdf/2026.wmt-1.68.pdf)

## Generation models

### Findings

**The best-supported starting pair is GPT-4.1-mini and Jais-2-70B-Chat—not because either is proven best today, but because they have directly relevant, inspected dialect-generation evidence.** In the March 2026 MADAR comparison, GPT-4.1-mini had an average ChrF-based rank of **2.1**, versus **2.9** for Jais-2-70B-Chat across the test sets.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)

The same study demonstrates why model selection must distinguish **semantic adequacy** from **dialect realization**: in a human evaluation of 100 Egyptian sentences, Jais-2-70B-Chat received accuracy/dialect scores of **94.6/98.5**, and GPT-4.1-mini **96.3/96.0**; these are **Egyptian translation scores**, not Lebanese customer-support scores.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)


| Model/family | Relevant evidence | Recommendation for this project |
| :-- | :-- | :-- |
| **GPT-4.1-mini** | Strong March 2026 multi-dialect translation results; explicit Lebanese results available.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) | Commercial generation baseline; retain only native-reviewed output |
| **Jais-2-70B-Chat** | Strong results in the same comparison; its technical report describes commercially permissive releases.[^1_5] [Primary comparison](https://aclanthology.org/2026.abjadnlp-1.41.pdf) | Main self-hosted generation candidate, subject to exact checkpoint-license review |
| **Jais-2-8B-Chat** | Included in the same comparison, below the 70B model overall.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) | Lower-resource runner-up; measure accepted examples per compute-hour |
| **ALLaM-7B-Instruct-preview** | Official card identifies an Arabic/English model and Apache-2.0 metadata.[^1_6] | Permissive-license challenger; Lebanese/Arabizi naturalness ranking **unverified** |
| **Fanar-2-27B-Instruct** | Official card explicitly claims Levantine coverage and lists Apache-2.0, while identifying Gemma-3-27B as its base.[^1_7][^1_8] | Important challenger; independently test Lebanese quality and resolve upstream licensing |
| **SILMA-9B-Instruct-v1.0** | Official repository identifies a Gemma-family model under the Gemma license.[^1_9] | Secondary challenger; Lebanese/Arabizi superiority **unverified** |
| **AceGPT-v2** | Official cards document Arabic-focused 8B, 32B, and 70B variants and general Arabic evaluations.[^1_10][^1_11] | Secondary challenger; general Arabic scores are not evidence of Lebanese chat naturalness |
| **GPT-4o, Gemini 2.0, DeepSeek V3** | A 2025 Arabic benchmarking study reports stronger broad-task performance than smaller Arabic-focused models.[^1_12] | Useful historical general-model comparators, not a Lebanese-specific ranking |
| **Newer GPT, Claude, Gemini versions** | Recent dialect benchmarks exist, but an inspected, controlled Lebanese/Arabizi naturalness comparison across current frontier versions was not established.[^1_3] | Add currently available versions to the local pilot; their ordering remains **unverified** |

The provider’s current profile also mentions **Jais-3**; a dated Lebanese-generation evaluation and checkpoint-specific licensing assessment were not verified here, so it should not automatically displace the better-evidenced Jais-2 baseline.[^1_13]

### Known weaknesses

**MSA drift has direct evidence.** AL-QASIDA finds that models often understand dialect better than they produce it, partly because they are reluctant to generate dialect; the March 2026 translation study likewise reports standardized or mixed outputs from several multilingual models. [Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)[^1_1]

**Egyptian/Gulf drift needs local measurement.** Dialect fidelity is a documented problem, but model-specific rates of Lebanese output drifting into Egyptian or Gulf Arabic are **unverified** in the inspected evidence.[^1_1]

**Arabizi inconsistency is not automatically an error.** Arabizi lacks a single standardized orthography, and documented variation depends on factors including pronunciation and the writer’s learned Latin-script conventions; evidence from Algerian Arabizi should not be treated as a Lebanese spelling standard.[^1_14]

### Recommendation and runners-up

**Recommended experiment:** compare GPT-4.1-mini, Jais-2-70B-Chat, and one currently available frontier model on the same blinded Lebanese pilot. Select using **native acceptance rate, critical meaning-error rate, diversity, and cost per accepted example**, not an MSA leaderboard.

**Runners-up:** Jais-2-8B for constrained hosting; ALLaM for a clearly advertised permissive-license candidate; Fanar-2 for explicitly claimed Levantine coverage. SILMA and AceGPT remain worthwhile challengers, but their Lebanese/Arabizi advantage is **unverified**.[^1_8][^1_9][^1_6][^1_11]

## Prompting and diversity

### What is supported

The clearest Lebanese-specific prompting result is substantial: for GPT-4.1-mini, changing from a general Arabic instruction to a Lebanese-specific instruction increased Lebanese **BLEU from 3.3 to 14.0** and **ChrF from 30.5 to 44.4** in the March 2026 study.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)

Few-shot demonstrations also have direct support: AL-QASIDA reports that examples can overcome models’ reluctance to produce dialect.[^1_1]


| Technique | Evidence status | Proposed implementation |
| :-- | :-- | :-- |
| Explicitly request Lebanese, not merely “Arabic” | Direct Lebanese translation evidence.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) | Specify Lebanese support-chat register and output script |
| Native-written few-shot examples | Supported for dialect generation generally.[^1_1] | Use reviewed Lebanese examples spanning all four writing modes |
| Separate meaning from dialect constraints | Supported by evaluations treating accuracy and dialectness independently.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) | Supply immutable facts and a separate style specification |
| Persona/register variation | Lebanese-specific efficacy **unverified** | Vary brevity, technical familiarity, frustration, and conversational context |
| Controlled Arabizi spelling variation | Variation is documented; optimal augmentation recipe **unverified**.[^1_14] | Sample from volunteer-approved spelling families |
| Repetition filtering and diversified sampling | Lebanese-specific benefit **unverified** | Deduplicate and audit recurring openings, syntax, and lexical choices |

### Recommended prompt

The following is a **proposed project template**, not a published prompt or validated Lebanese example:

```text
Task:
Write a realistic customer message in Lebanese Arabic.

Input:
- Scenario and immutable facts: ...
- Writing mode: Arabic-script Lebanese / Lebanese Arabizi /
  Arabic–English code-switching / MSA
- Register: brief informal customer-support chat
- Context: ...
- Approved native-written examples: ...

Rules:
- Preserve the issue, negation, quantities, time, device, and prior actions.
- Do not add a cause, diagnosis, policy, or troubleshooting action.
- Do not answer the customer.
- For Lebanese modes, do not turn the message into formal MSA.
- Preserve product names, error codes, URLs, and meaningful English terms.
- Use only approved spelling variation; do not replace digits blindly.
- Return one message, its intended meaning, and any ambiguity introduced.
```

**Proposed diversity controls:**

- Generate one or a few variants per call rather than requesting a large homogeneous list.
- Rotate human-written demonstrations and record which examples were used.
- Separate Arabic-script Lebanese, Arabizi, code-switching, and MSA into explicit generation conditions.
- Vary message length, information order, politeness, technical detail, and whether a previous troubleshooting attempt is mentioned.
- Permit spelling variation without changing product identifiers, literal numbers, negation, or temporal facts.
- Reject outputs that are merely the same sentence with a different greeting.

**Recommendation:** use explicit dialect instructions plus native few-shot examples as the evidence-backed core. Treat persona and spelling controls as hypotheses to validate through ablation.

**Runner-up:** direct English-to-Lebanese generation versus generation from a reviewed MSA scenario representation. Compare both; superiority of either route is **unverified**.

## Retrieval and embeddings

### Verified benchmark evidence

Swan’s ArabicMTEB evaluation reports the following Arabic retrieval results; these are **benchmark-snapshot scores**, not measurements on Lebanese support messages.[^1_15][^1_2]


| Model | Reported retrieval score, nDCG@10 × 100 | Interpretation |
| :-- | --: | :-- |
| **Swan-Large** | **65.63**.[^1_15] | Strong Arabic-focused candidate |
| **Multilingual-E5-large** | **64.01**.[^1_15] | Strong multilingual comparator |
| **Swan-Small** | **58.42**.[^1_15] | Smaller Arabic-focused option |

ArabicMTEB includes dialectal and cross-lingual evaluations, but its listed **NArabizi-to-French bitext-mining task is not Lebanese Arabizi query-to-MSA/English document retrieval**.[^1_2]

Consequently, neither an ArabicMTEB average nor a broad multilingual MTEB rank establishes the best model for this application.[^1_2]

### Recommended retrieval experiment

**Primary bake-off:** Swan-Large versus Multilingual-E5-large, using the same document chunks, relevance labels, retrieval depths, and evaluation queries.

**Runners-up:** Swan-Small for a smaller deployment; Qwen3 embeddings and BGE-M3 as additional experimental challengers. A Qwen3-Embedding-0.6B-based Arabic adaptation is documented, but a verified current head-to-head Lebanese retrieval ranking was not established here.[^1_16][^1_17]

**Proposed retrieval architecture:**

1. Keep one canonical solution ID across its English and MSA versions.
2. Index both languages, with version and applicability metadata.
3. Combine dense retrieval with a lexical channel.
4. Fuse results, then optionally rerank.
5. Retain the source solution ID through generation and evaluation.

The lexical channel is proposed particularly to protect exact product names, error codes, and identifiers; its measured benefit for this dataset must be established locally.

### Arabizi: direct or transliterated?

**A universal answer is unverified.** The inspected evidence does not establish that transliteration always improves Lebanese Arabizi retrieval against MSA/English support documents.

Run the following controlled ablation:


| Condition | Query representation | Question answered |
| :-- | :-- | :-- |
| A | Original text only | How well does direct embedding handle real spelling variation? |
| B | Light normalization only | Does normalization help without conversion errors? |
| C | Selective Arabizi-to-Arabic transliteration | Does script alignment help? |
| D | Original plus transliterated query, fused results | Can both views recover complementary results? |
| E | Original plus an MSA/English query rewrite | Does rewriting help enough to justify added latency and semantic risk? |

**Recommendation:** retain the original query and test a second transliterated view rather than destructively replacing the input. Selective conversion is important to the proposed design: English words, product names, and literal numbers must remain distinguishable from Arabizi tokens.

**Runner-up:** direct multilingual embedding alone, if it matches the multi-view system on the human-written Arabizi test slice at lower cost.

## Text processing

### Transliteration

Shazal, Usman, and Habash’s **“A Unified Model for Arabizi Detection and Transliteration Using Sequence-to-Sequence Models”** is a relevant 2020 research baseline; subsequent work explicitly describes its publicly available implementation.[^1_18][^1_19]

However, **Lebanese support-domain accuracy, current maintenance, downloadable-weight availability, and exact redistribution rights are unverified here**. A reported Egyptian or North-African transliteration score should not be relabeled as Lebanese performance.[^1_19][^1_14]

**Recommendation:** create a small, human-aligned Lebanese Arabizi/Arabic-script development set before choosing or adapting a transliterator. Preserve the original message and record every conversion.

**Runners-up:** an LLM-based selective transliterator or a constrained learned transliterator adapted to approved Lebanese pairs. Their comparative accuracy and operating cost remain project measurements, not established findings.

### Normalization

CAMeL Tools is a documented Arabic Python toolkit; the March 2026 translation study uses it for Alef, Alef Maksura, Teh Marbuta, and Hamza normalization.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)

For this project, the proposed policy is **conservative normalization with separate raw and normalized fields**, rather than applying every available operation.


| Operation | Proposed policy |
| :-- | :-- |
| Whitespace and Unicode cleanup | Apply to a derived field; preserve raw input |
| Tatweel removal | Use in retrieval-normalized text |
| Diacritic removal | Test as a retrieval view; retain original |
| Alef/hamza folding | Evaluate as an optional alias/view |
| Alef Maksura/Ya folding | Evaluate separately |
| Taa Marbuta-to-Ha folding | Do not make this the canonical stored form |
| Repeated-letter reduction | Optional retrieval view, not a destructive rewrite |
| Digit normalization | Protect literal quantities and identifiers; distinguish them from Arabizi usage |
| English tokens and error codes | Preserve |

**Recommendation:** start with minimal cleanup and ablate additional transformations. Normalization is a configurable retrieval intervention, not a justification for rewriting the released corpus.

### Dialect identification

The March 2026 study evaluates LLM dialect classification and explicitly warns that country labels are imperfect: dialects cross borders, and countries contain internal variation.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)

For **CAMeL Tools dialect identification**, an inspected, current **Lebanese support-message accuracy figure was not verified**. The same applies to Arabizi and short Arabic–English support messages.

**Proposed labeling scheme:**

- Lebanese-compatible
- Broader Levantine-compatible
- Clear non-target dialect
- MSA
- Mixed or ambiguous
- Insufficient evidence

**Recommendation:** use dialect ID as a triage signal, not an acceptance gate. Short neutral messages should be allowed to remain ambiguous.

**Runner-up:** train a domain-specific classifier after collecting human labels. Evaluate Arabic-script and Arabizi conditions separately rather than assuming transfer between them.

## Speech recognition

### Findings

**No primary-source-verified winner for Lebanese customer-support speech was established.** Available evidence nevertheless shows why MSA or read-speech performance is an inadequate proxy for spontaneous dialectal speech.[^1_20][^1_4]


| Evidence | Verified result | Relevance |
| :-- | :-- | :-- |
| **Arabic Little STT**, 2025 | Whisper Large-v3 obtained **66% WER** on 355 Levantine child-speech utterances from 288 children.[^1_20] | Demonstrates severe domain mismatch; not an adult Lebanese-support estimate |
| **Dialectal ASR shared-task study**, 2025 | Reports zero-shot Whisper average WER **93.90**, Jordanian **46.10**, and an adapted two-stage result of **39.78**.[^1_21] | Adaptation can matter substantially in that evaluation; not a Lebanese ranking |
| **SHAMS**, October 2026 | Contains **1,300 utterances** across five Levantine varieties, including Lebanese.[^1_4] | Recent candidate evaluation resource; inspected abstract supplies no Lebanese WER leaderboard |
| Community dialectal Qwen3-ASR card, July 2026 | Reports Lebanese WER **0.531** on **200 clips**, but the card mixes v2/v3 wording and inconsistent comparative descriptions.[^1_22] | Low-quality decision evidence; reproduce before relying on it |

These WER values must **not** be compared as if obtained on the same dataset, age group, audio conditions, or normalization protocol.[^1_21][^1_22][^1_20]

### Recommendation

**Self-hosted baseline:** evaluate Whisper Large-v3 first, then a domain-adapted version trained only on appropriately licensed, consented recordings. This is a defensible baseline choice, **not a claim that Whisper is best for Lebanese**.[^1_20]

**Self-hosted runners-up:** a current multilingual ASR challenger such as Qwen3-ASR and a smaller Whisper configuration, evaluated under identical conditions. Community Lebanese scores are not sufficient to choose between them.[^1_22]

**Cloud evaluation shortlist:** Azure Speech, Google Cloud Speech-to-Text, and OpenAI transcription services. Their current Lebanese locale coverage, code-switching behavior, retention terms, and prices are **unverified in this report**; require an actual test and current contractual documentation.

### Proposed speech test

- Collect spontaneous support scenarios, not just read versions of written queries.
- Include English product names, error codes, quantities, negation, hesitation, interruptions, and realistic channel noise.
- Keep speakers disjoint between adaptation, development, and test partitions.
- Report raw WER, normalized WER, CER, and errors on critical entities.
- Measure downstream retrieval and escalation using both human transcripts and ASR transcripts.
- Freeze whether the desired transcript preserves dialect and English words rather than translating them into MSA.

The adaptation target should be **successful downstream support**, not merely a lower normalized WER.

## Synthetic-data quality evaluation

### Research findings

Published dialect evaluations support assessing **semantic accuracy separately from dialectalness**; the March 2026 study explicitly treats these as orthogonal, since an output can be accurate but in the wrong dialect, or dialectally convincing but semantically wrong.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)

Automatic metrics are insufficient alone: that study reports that COMET can favor MSA-like outputs and cannot explicitly enforce the requested dialect, while surface-overlap metrics can penalize valid alternative dialect spellings.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)

### Recommended validation stack

The following is a **proposed project protocol**, not a universally validated threshold scheme.


| Layer | Checks | Acceptance role |
| :-- | :-- | :-- |
| Structural | Valid schema, required fields, valid solution IDs, no empty output | Hard gate |
| Protected facts | Numbers, negation, product names, error codes, temporal facts | Hard gate or mandatory adjudication |
| Duplication | Exact, normalized, and semantic near-duplicate review | Filter or cluster |
| Semantic consistency | Compare candidate with scenario/source meaning | Flag; never sole proof |
| Dialect ID | Detect likely MSA or non-target drift | Triage |
| Native review | Naturalness, dialect compatibility, meaning, spelling, code-switching | Main acceptance decision |
| Domain review | Policy correctness, safety, applicability, escalation | Main acceptance decision for answers/KB |

**Recommended initial release:** review every accepted synthetic example. If later moving to sampled audits, validate the acceptance filter first and continue exhaustive review of high-risk content.

**Runner-up:** automatic screening followed by stratified human sampling when review capacity is limited; report the unreviewed proportion and estimated error rate.

### Agreement and sampling

**Proposed annotation design:**

- Two independent reviewers per candidate.
- A third reviewer adjudicates critical disagreements.
- A shared calibration batch of approximately 40 items before production.
- Ordinal Krippendorff’s alpha for rating scales.
- Nominal agreement statistics for categorical error tags.
- Raw agreement, score distributions, and disagreement reasons alongside a single agreement coefficient.
- Item-cluster bootstrap intervals when reporting uncertainty.

Do not treat an agreement threshold as a universal quality certificate. Agreement and correctness are separate acceptance questions.

For generator selection, a practical **proposed pilot** is **60 scenarios × four writing modes × two generators = 480 candidate messages**. Two reviews per message require **960 review assignments**, or approximately **96–192 assignments per volunteer** across 5–10 volunteers; these are planning calculations, not literature-derived sample-size requirements.

### Leakage prevention

**Split before paraphrasing.** Assign every source scenario, solution family, translated counterpart, and generated variant a lineage ID; all descendants of a held-out family must remain held out.

Maintain two distinct evaluations:


| Evaluation | What may be shared | What must remain separate |
| :-- | :-- | :-- |
| **Production-style query generalization** | The assistant may retrieve the same KB solutions needed by test customers | Test wording, conversation histories, authorship, and generation examples |
| **Solution-family generalization** | Held-out solutions may enter the retrieval index at evaluation time | Those solution families must not have supplied training paraphrases or tuning examples |

**Having the correct solution in the retrieval index is not leakage in a RAG test.** The proposed prohibition is against using hidden test queries, their paraphrases, or reserved test scenarios to train or tune the system.

Additional proposed controls:

- Have test authors work from factual scenario cards, not generated paraphrases.
- Do not use hidden test examples as few-shot demonstrations.
- Lock development thresholds before opening the test results.
- Run exact and semantic overlap audits across partitions.
- Record model versions, prompts, generation dates, reviewer edits, and source lineage.
- Keep one private audit partition if benchmark gaming or repeated public-test tuning is a concern.


## Assistant evaluation

### Retrieval metrics

**Recommended primary metric:** solution-level **Recall@5**, with Recall@1 and Recall@10 as supporting measures. Use the canonical solution ID so that retrieving English and MSA copies of the same solution does not count as two independent successes.


| Metric | Proposed use |
| :-- | :-- |
| **Recall@k** | Whether the relevant solution is retrieved |
| **MRR@k** | How early the first relevant solution appears |
| **nDCG@10** | Ranking quality when relevance is graded; also aligns with ArabicMTEB retrieval reporting.[^1_23] |
| **All-evidence recall** | Whether every required source is retrieved for multi-step questions |
| **Exact-identifier success** | Error-code, product-name, and account-reference cases |
| **Retrieval latency** | Median and tail latency under the deployment configuration |

Report every metric separately for Lebanese Arabic script, Arabizi, code-switching, and MSA, then by issue family, answerability, and speech/text input.

### Answer quality

**Proposed human rubric:**

- Correctness against the applicable KB version
- Completeness of the required solution
- Groundedness of each factual instruction
- Citation correctness
- Unsupported or invented policy statements
- Critical entity and number preservation
- Actionability
- Lebanese/MSA register appropriateness
- Correct handling of ambiguity and required escalation

Use an LLM judge only as an auxiliary signal until its agreement with native and domain reviewers has been measured. Dialect-generation research shows why fluency or general semantic quality cannot substitute for target-dialect fidelity. [Primary evaluation](https://aclanthology.org/2026.abjadnlp-1.41.pdf)[^1_1]

**Recommendation:** make human-rated **task success without unsupported claims** the primary answer outcome.

**Runner-up:** an automated groundedness/correctness judge calibrated against a held-out human-rated sample. Lexical overlap and embedding similarity alone are insufficient acceptance criteria for this proposed system.

### Correct escalation

Use at least three gold actions:

1. **Answer:** evidence is sufficient.
2. **Clarify:** a missing fact could resolve the question.
3. **Escalate:** the KB is insufficient, conflicting, inapplicable, or policy requires a person.

Then report:


| Metric | Definition |
| :-- | :-- |
| Escalation recall | Correct escalations / all cases requiring escalation |
| Escalation precision | Correct escalations / all escalations |
| False-answer rate | Cases answered when escalation was required / all escalation-required cases |
| Unnecessary-escalation rate | Answerable cases escalated / all answerable cases |
| Clarification accuracy | Correct clarification decisions / clarification-required cases |
| Coverage | Fraction of cases answered automatically |
| Selective risk | Error rate among automatically answered cases |

**Recommendation:** choose the operating threshold using a **risk–coverage curve** and a predeclared maximum false-answer risk. Do not treat the assistant’s verbal confidence or a raw embedding similarity as a calibrated probability.

**Runner-up:** a conservative rule-based escalation policy while sufficient calibration data are collected.

### Minimum test-set size

There is **no universal minimum**. It depends on the desired confidence interval, outcome prevalence, subgroup reporting, and whether examples are independent.

For an independently sampled binary outcome, a conservative planning approximation at 95% confidence is:

$$
n \approx \frac{1.96^2 \times 0.25}{e^2}
$$

This gives the following **calculated planning values**, not empirical model results:


| Desired margin | Approximate independent cases |
| :-- | --: |
| ±5 percentage points | 385 |
| ±3 percentage points | 1,068 |
| ±2 percentage points | 2,401 |

**Proposed practical target:** approximately **1,600 human-written text scenarios**, with around **400 per writing mode**, plus a separately collected speech test. If several variants derive from one scenario or speaker, cluster the analysis rather than treating all variants as independent observations.

For rare unsafe-answer failures, consider the relevant denominator separately. With zero failures in $n$ independent trials, the exact one-sided 95% upper bound is:

$$
1 - 0.05^{1/n}
$$

At **300 escalation-required cases with zero false answers**, that upper bound is approximately **1%**. This does not establish a 1% risk for every subgroup or real-world deployment population.

A test designed to estimate a proportion is also **not automatically powered to distinguish two closely performing models**; use a paired comparison and plan around the smallest improvement that would change the deployment decision.

## Relevant prior work

| Work | Coverage and lesson |
| :-- | :-- |
| **NArabizi treebank, 2020** | Contains 1,500 Algerian Arabizi sentences with morphosyntactic/dependency annotation and translations; useful evidence for preserving code-switching and nonstandard spelling, but not Lebanese ground truth.[^1_14] |
| **Unified Arabizi detection/transliteration, 2020** | Relevant conversion baseline; public implementation is referenced by subsequent primary research. Lebanese-domain accuracy and redistribution terms remain **unverified** here.[^1_18][^1_19] |
| **AraBench, 2020** | Dialectal Arabic–English translation resource reused by the March 2026 evaluation; supports cross-dialect comparisons, not a customer-support evaluation by itself.[Primary discussion](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **CAMeL Tools, 2020** | Reusable Arabic processing toolkit, including normalization used in subsequent dialect MT research; tool availability does not establish support-domain accuracy.[Primary discussion](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **AL-QASIDA, 2024–2025** | Demonstrates the need to distinguish understanding from generation and to measure target-dialect fidelity explicitly.[^1_1] |
| **Swan / ArabicMTEB, 2025** | Provides Arabic-focused embedding models and a broad evaluation suite; useful for shortlisting, not a replacement for Lebanese support retrieval tests.[^1_2] |
| **Arabic Little STT, 2025** | Shows a substantial ASR gap on Levantine child speech; an important warning against transferring results between domains.[^1_20] |
| **Alexandria, ACL 2026** | A multi-domain dialectal Arabic translation dataset; exact Lebanese split sizes, suitability, and reuse rights were **not verified** from the inspected bibliographic record.[^1_24] |
| **Current state of dialectal MT, March 2026** | Directly relevant Lebanese prompting results and an explicit warning about contamination, imperfect country labels, and small human evaluations.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **SHAMS, October 2026** | Recent Lebanese-inclusive speech resource; potentially valuable for speech evaluation once licensing, splits, and task-specific results are checked.[^1_4] |

An end-to-end **Lebanese/Arabizi customer-support benchmark with verified retrieval, answer-quality, and escalation results** was not established in this review. That is an evidence gap, not proof that no such project exists.

## Models, tools, and costs

“Self-hostable” below concerns technical availability, **not automatic redistribution permission**. Exact model files, tokenizer files, upstream terms, dataset licenses, and generated-output terms require separate review.


| Name | Purpose | Levantine/Arabizi support | License | Cost | Self-hostable | Evidence quality |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| **GPT-4.1-mini** | Generation baseline | Lebanese translation evidence; Arabizi naturalness **unverified** | Proprietary service; output/reuse terms require review | Current API rate **unverified** | No, as a hosted baseline | Strong relevant MT comparison; no Lebanese support human study.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **Jais-2-70B-Chat** | Open-weight generation candidate | Multi-dialect evidence; Lebanese Arabizi quality **unverified** | Commercially permissive release claimed; exact terms require inspection.[^1_5] | Compute/hosting; no verified quote | Yes | Strong relevant MT evidence.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **Jais-2-8B-Chat** | Smaller generator | Evaluated across dialects; Arabizi **unverified** | Checkpoint-specific terms require inspection | Compute/hosting | Yes | Relevant comparative evidence, below 70B overall.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **ALLaM-7B-Instruct-preview** | Generation challenger | Lebanese/Arabizi ranking **unverified** | Apache-2.0 in official metadata.[^1_6] | Compute/hosting | Yes | Strong provenance; weak target-task evidence |
| **Fanar-2-27B-Instruct** | Generation challenger | Levantine explicitly claimed; Arabizi **unverified**.[^1_8] | Card says Apache-2.0; Gemma-base obligations need review.[^1_7] | Compute/hosting | Yes | Official capability claim; independent Lebanese ranking unverified |
| **SILMA-9B-Instruct-v1.0** | Generation challenger | Target-task support **unverified** | Gemma license.[^1_9] | Compute/hosting | Yes | Official provenance; weak Lebanese-specific evidence |
| **AceGPT-v2** | Generation challenger | Arabic-focused; Lebanese/Arabizi ranking **unverified**.[^1_11] | Exact variant/upstream license **unverified** | Compute/hosting | Yes | General Arabic evaluations, not target-domain proof |
| **Swan-Large / Small** | Dense retrieval | Dialect-aware Arabic evaluation; Lebanese Arabizi retrieval **unverified**.[^1_2] | Model-weight license **unverified here** | Compute/index storage | Yes | Strong Arabic benchmark evidence |
| **Multilingual-E5-large** | Cross-lingual retrieval baseline | Arabic retrieval evidence; target Arabizi **unverified**.[^1_15] | Exact license **unverified here** | Compute/index storage | Yes | Strong comparative Arabic benchmark evidence |
| **CAMeL Tools** | Normalization; dialect-ID candidate | Normalization documented; Lebanese DID accuracy **unverified** | Code and downloaded-resource licenses need separate verification | Local compute | Yes | Strong toolkit provenance; task-specific accuracy incomplete.[Primary discussion](https://aclanthology.org/2026.abjadnlp-1.41.pdf) |
| **Shazal et al. transliterator** | Arabizi conversion baseline | Lebanese support-domain accuracy **unverified** | Code/weights/data rights **unverified** | Local compute if usable release is available | Public implementation referenced | Relevant research baseline, deployment audit incomplete.[^1_18] |
| **Whisper Large-v3** | ASR baseline | Levantine evidence; Lebanese adult-support ranking **unverified** | Exact release license not verified in this audit | Compute or hosting | Yes | Relevant speech evidence, substantial domain caveats.[^1_20] |
| **Cloud speech shortlist** | Managed ASR experiment | Lebanese/code-switch availability and accuracy **unverified** | Provider contracts | Current audio-minute rates **unverified** | No, as managed services | Requires local evaluation and current documentation |

### Cost accounting

Do not budget using unverified token prices. Request current quotes and calculate:

$$
C_{\text{generation}}
=
\frac{T_{\text{input}}P_{\text{input}}+
T_{\text{output}}P_{\text{output}}}{10^6}
$$

Then add review, corrections, failed generations, speech transcription, embedding, storage, and serving.

The most useful project metric is:

$$
C_{\text{accepted example}}
=
\frac{\text{generation + review + correction + rejected-output costs}}
{\text{accepted examples}}
$$

For self-hosted alternatives, record GPU-hours, hardware configuration, throughput, and acceptance rate; “open-weight” should not be treated as “zero operating cost.”

## Data-building pipeline

The following is the recommended **implementation plan**, not a claim that this exact pipeline has already been validated.


| Step | Action | Tool or method | Deliverable |
| :-- | :-- | :-- | :-- |
| **1. Define scope** | List products, issue families, applicable policies, mandatory escalation, and prohibited actions | Domain-owner specification | Support ontology and escalation policy |
| **2. Audit English sources** | Verify rights, remove PII, identify policy-specific versus reusable intent content | License manifest; deterministic and manual inspection | Approved source inventory |
| **3. Establish canonical solutions** | Assign solution IDs, versions, applicability, and authoritative answers | Version-controlled JSON/Markdown | English KB |
| **4. Translate the KB** | Draft MSA versions; check every instruction, condition, number, and policy | GPT-4.1-mini or Jais-2 candidate; bilingual domain review | Reviewed English/MSA KB |
| **5. Create scenario cards** | Express customer-visible symptoms and immutable facts without supplying a diagnosis | Structured templates; domain review | Query-generation specifications |
| **6. Partition families** | Reserve development and evaluation families before generation | Lineage-aware split script | Frozen partition manifest |
| **7. Collect native seeds** | Obtain authentic-style examples in each writing mode | Volunteer writing task | Reviewed few-shot bank |
| **8. Run generator pilot** | Compare identical scenarios across candidate models and prompt settings | GPT-4.1-mini, Jais-2, current frontier challenger | Blinded candidate pool |
| **9. Generate variants** | Produce Lebanese Arabic script, Arabizi, code-switched, and MSA queries | Selected generator and controlled prompt matrix | Synthetic query candidates |
| **10. Screen candidates** | Validate schema, protected facts, duplication, and suspicious semantic drift | CAMeL-derived normalization views; exact/semantic checks | Flagged review queue |
| **11. Conduct native review** | Apply the protocol below; adjudicate and retain edits | CSV/JSONL review form | Accepted query dataset |
| **12. Build retrieval indexes** | Index reviewed MSA/English chunks under shared solution IDs | Swan versus E5; lexical baseline; fusion | Reproducible retrieval configurations |
| **13. Test query processing** | Compare direct, normalized, transliterated, and multi-view queries | Selective transliterator; controlled ablation | Development-set retrieval results |
| **14. Write hidden tests** | Ask humans to write new queries from reserved scenario cards | Independent native authors | Human-written text test |
| **15. Collect speech** | Record spontaneous scenarios with consent and speaker-disjoint partitions | Recording workflow; human transcription | Speech development/test sets |
| **16. Calibrate escalation** | Choose thresholds and clarification policy using development data only | Risk–coverage evaluation | Frozen decision policy |
| **17. Evaluate once** | Report retrieval, answers, escalation, speech impact, and uncertainty | Frozen evaluator and configuration | Release evaluation |
| **18. Publish responsibly** | Release permitted data, licenses, provenance, prompts, and limitations | Versioned repository and dataset card | Auditable open-source release |

**Important distinction:** external English support data may supply reusable **intents and linguistic scenarios**, but its refund rules, warranties, troubleshooting procedures, and service commitments must not become authoritative answers unless they actually apply to the supported product.

## Volunteer review protocol

This section can be copied into the volunteer instructions.

### Reviewer instructions

**Your task is to judge whether this sounds like a plausible Lebanese customer message and whether it preserves the supplied meaning. Do not make every message formal, grammatically polished, or identical in spelling.**

1. Read the candidate **without seeing the generator name**.
2. First rate naturalness and writing-style compatibility.
3. Then read the source scenario and check meaning.
4. Check negation, time, quantities, product names, error codes, and actions already attempted.
5. Do not require strongly Lebanese vocabulary in every short message.
6. Accept plausible Arabizi spelling alternatives unless they make the message unclear or change its meaning.
7. Do not transliterate genuine English words merely because they use Latin script.
8. Tag suspected MSA, Egyptian, Gulf, or other drift, but choose “ambiguous” when the evidence is insufficient.
9. Make the smallest necessary correction and preserve the original.
10. Flag sensitive data, offensive additions, invented facts, or unsafe instructions.
11. Do not review your own authored examples.
12. Escalate disagreements rather than forcing a consensus privately.

### Rating anchors

These are **proposed project scales**, not a published standardized Lebanese rubric.


| Score | Naturalness | Dialect/style compatibility | Meaning preservation |
| --: | :-- | :-- | :-- |
| **1** | Implausible or difficult to understand | Clearly wrong requested variety or script | Core meaning wrong |
| **2** | Strongly awkward or translated | Frequent non-target forms | Major omission/addition |
| **3** | Understandable but noticeably unnatural | Mixed or uncertain compatibility | Recoverable but materially imperfect |
| **4** | Plausible with a small edit | Appropriate, with minor concerns | Same issue; minor noncritical difference |
| **5** | Fully plausible in the intended context | Fully appropriate, or legitimately neutral | All relevant facts preserved |

Also record **Arabizi readability**, **code-switch plausibility**, and **critical-fact preservation** independently. Use “not applicable” where appropriate.

### Proposed acceptance rules

- Naturalness: at least **4**
- Dialect/style compatibility: at least **4**, or adjudicated as legitimately neutral
- Meaning preservation: **5**
- Critical facts: **pass**
- No unresolved privacy, safety, or invented-policy flag
- Two independent reviews, with adjudication for critical disagreement

For KB solutions, require **domain-owner approval** in addition to linguistic approval. Volunteers should not be asked to certify product policies they do not know.

### Review form template

```text
ITEM ID:
SCENARIO ID:
SOLUTION ID:
PARTITION:
REQUESTED WRITING MODE:

CANDIDATE MESSAGE:

A. FIRST-PASS LANGUAGE REVIEW
Naturalness, 1–5:
Dialect/style compatibility, 1–5:
Arabizi readability, 1–5 / N/A:
Code-switch plausibility, 1–5 / N/A:

Observed variety:
[ ] Lebanese-compatible
[ ] Broader Levantine-compatible
[ ] MSA
[ ] Clear other dialect
[ ] Mixed / ambiguous
[ ] Insufficient evidence

B. MEANING REVIEW
SOURCE SCENARIO:

Meaning preservation, 1–5:

Critical facts:
Negation preserved?                  Yes / No / N/A
Numbers and quantities preserved?    Yes / No / N/A
Time and sequence preserved?         Yes / No / N/A
Product/error identifiers preserved? Yes / No / N/A
Prior customer actions preserved?    Yes / No / N/A
Invented cause/action/policy?         Yes / No

C. ERROR TAGS
[ ] MSA drift
[ ] Suspected Egyptian drift
[ ] Suspected Gulf drift
[ ] Other dialect mismatch
[ ] Unnatural phrasing
[ ] Implausible Arabizi spelling
[ ] Unnatural code-switching
[ ] Meaning omission
[ ] Meaning addition
[ ] Incorrect number/entity/negation
[ ] Repetitive/template-like
[ ] Privacy/safety concern
[ ] No issue

D. DECISION
[ ] Accept unchanged
[ ] Accept after correction
[ ] Reject
[ ] Adjudication needed

MINIMAL CORRECTION:
REASON:
REVIEWER ID:
DATE:
```

For test-set annotation, add **gold action**, **relevant solution IDs**, **required answer facts**, **forbidden unsupported claims**, and **escalation reason**.

## Risks and limitations

- **A universal “best Lebanese model” is not established.** The strongest inspected direct comparison is March 2026 translation research, while newer dialect benchmarks do not provide a verified Lebanese/Arabizi support ranking. [Primary comparison](https://aclanthology.org/2026.abjadnlp-1.41.pdf)[^1_3]
- **Lebanese is not interchangeable with all Levantine varieties.** Country-based labeling is itself imperfect, and dialect boundaries and internal variation complicate evaluation.[Primary discussion](https://aclanthology.org/2026.abjadnlp-1.41.pdf)
- **Public benchmarks may be contaminated.** The March 2026 study explicitly identifies possible training exposure to MADAR as a major limitation.[Primary paper](https://aclanthology.org/2026.abjadnlp-1.41.pdf)
- **Arabizi evidence transfers poorly across regions without testing.** The inspected NArabizi resource is Algerian, not Lebanese.[^1_14]
- **Arabic retrieval evidence is stronger than Lebanese Arabizi retrieval evidence.** ArabicMTEB is useful for shortlisting but does not resolve this project’s specific query/document mismatch.[^1_2]
- **ASR results are highly task-dependent.** The inspected Levantine child-speech results cannot serve as adult Lebanese support estimates.[^1_20]
- **Licensing remains a release blocker.** Several exact model-weight, transliterator, and dataset licenses were unverified; Fanar’s card/base-model combination particularly warrants upstream review.[^1_7][^1_8]
- **Current prices were not verified.** No defensible commercial-versus-self-hosted cost ranking should be inferred from the model recommendations.
- **Volunteer review has scope limits.** The proposed protocol therefore separates linguistic judgments from authoritative domain and policy approval.
- **Synthetic realism is not deployment realism.** Reserve genuinely human-written text and spontaneous speech for final evaluation, and revisit the results when consented production data become available.
- **Automatic confidence is not calibrated escalation.** Validate the actual answer/clarify/escalate policy and its false-answer bounds rather than relying on fluent uncertainty language.
- **Open-source release requires privacy and provenance controls.** The proposed release gate should cover source rights, consent, personal data, upstream model terms, reviewer contributions, and the lineage of every published example.

<span style="display:none">[^1_100][^1_101][^1_102][^1_103][^1_104][^1_105][^1_106][^1_107][^1_108][^1_109][^1_110][^1_111][^1_112][^1_113][^1_114][^1_115][^1_116][^1_117][^1_118][^1_119][^1_120][^1_121][^1_122][^1_123][^1_124][^1_125][^1_126][^1_127][^1_128][^1_129][^1_130][^1_131][^1_132][^1_133][^1_134][^1_135][^1_136][^1_137][^1_138][^1_139][^1_140][^1_141][^1_142][^1_143][^1_144][^1_145][^1_146][^1_147][^1_148][^1_149][^1_150][^1_151][^1_152][^1_153][^1_154][^1_155][^1_156][^1_157][^1_158][^1_159][^1_160][^1_161][^1_162][^1_163][^1_164][^1_165][^1_166][^1_167][^1_168][^1_169][^1_170][^1_171][^1_172][^1_173][^1_174][^1_175][^1_176][^1_177][^1_178][^1_179][^1_180][^1_181][^1_182][^1_183][^1_184][^1_185][^1_186][^1_187][^1_188][^1_189][^1_190][^1_191][^1_192][^1_193][^1_194][^1_195][^1_196][^1_197][^1_198][^1_199][^1_200][^1_201][^1_202][^1_203][^1_204][^1_205][^1_206][^1_207][^1_208][^1_209][^1_210][^1_211][^1_212][^1_213][^1_214][^1_215][^1_216][^1_217][^1_218][^1_219][^1_220][^1_221][^1_222][^1_223][^1_224][^1_225][^1_226][^1_227][^1_228][^1_229][^1_230][^1_231][^1_232][^1_233][^1_234][^1_235][^1_236][^1_237][^1_238][^1_239][^1_240][^1_241][^1_242][^1_243][^1_244][^1_245][^1_246][^1_247][^1_248][^1_249][^1_25][^1_250][^1_251][^1_252][^1_253][^1_254][^1_255][^1_256][^1_257][^1_258][^1_259][^1_26][^1_260][^1_261][^1_262][^1_263][^1_264][^1_265][^1_266][^1_267][^1_268][^1_269][^1_27][^1_270][^1_271][^1_272][^1_273][^1_274][^1_275][^1_276][^1_277][^1_278][^1_279][^1_28][^1_280][^1_281][^1_282][^1_283][^1_284][^1_285][^1_286][^1_287][^1_288][^1_289][^1_29][^1_290][^1_291][^1_292][^1_293][^1_294][^1_295][^1_296][^1_297][^1_298][^1_299][^1_30][^1_300][^1_301][^1_302][^1_303][^1_304][^1_305][^1_306][^1_307][^1_308][^1_309][^1_31][^1_310][^1_311][^1_312][^1_313][^1_314][^1_315][^1_316][^1_317][^1_318][^1_319][^1_32][^1_320][^1_321][^1_322][^1_323][^1_324][^1_325][^1_326][^1_327][^1_328][^1_329][^1_33][^1_330][^1_331][^1_332][^1_333][^1_334][^1_335][^1_336][^1_337][^1_338][^1_339][^1_34][^1_340][^1_341][^1_342][^1_343][^1_344][^1_345][^1_346][^1_347][^1_348][^1_349][^1_35][^1_350][^1_351][^1_352][^1_353][^1_354][^1_355][^1_356][^1_357][^1_358][^1_359][^1_36][^1_360][^1_361][^1_362][^1_363][^1_364][^1_365][^1_366][^1_367][^1_368][^1_369][^1_37][^1_370][^1_371][^1_372][^1_373][^1_374][^1_375][^1_376][^1_377][^1_378][^1_379][^1_38][^1_380][^1_381][^1_382][^1_383][^1_384][^1_385][^1_386][^1_387][^1_388][^1_389][^1_39][^1_390][^1_391][^1_392][^1_393][^1_394][^1_395][^1_396][^1_397][^1_398][^1_399][^1_40][^1_400][^1_401][^1_402][^1_403][^1_404][^1_405][^1_406][^1_407][^1_408][^1_409][^1_41][^1_410][^1_411][^1_412][^1_413][^1_414][^1_415][^1_416][^1_417][^1_418][^1_419][^1_42][^1_420][^1_421][^1_422][^1_423][^1_424][^1_425][^1_426][^1_427][^1_428][^1_429][^1_43][^1_430][^1_431][^1_432][^1_433][^1_434][^1_435][^1_436][^1_437][^1_438][^1_439][^1_44][^1_440][^1_441][^1_442][^1_443][^1_444][^1_445][^1_45][^1_46][^1_47][^1_48][^1_49][^1_50][^1_51][^1_52][^1_53][^1_54][^1_55][^1_56][^1_57][^1_58][^1_59][^1_60][^1_61][^1_62][^1_63][^1_64][^1_65][^1_66][^1_67][^1_68][^1_69][^1_70][^1_71][^1_72][^1_73][^1_74][^1_75][^1_76][^1_77][^1_78][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92][^1_93][^1_94][^1_95][^1_96][^1_97][^1_98][^1_99]</span>

<div align="center">⁂</div>

[^1_1]: https://www.arxiv.org/abs/2412.04193

[^1_2]: https://aclanthology.org/2025.findings-naacl.263.pdf

[^1_3]: https://www.alphaxiv.org/abs/2609.01113

[^1_4]: https://arxiv.org/abs/2610.01427

[^1_5]: https://huggingface.co/papers/2608.13580

[^1_6]: https://huggingface.co/humain-ai/ALLaM-7B-Instruct-preview/blame/67393bfa50d540da331411c1ffd1b1b908c17bf0/README.md

[^1_7]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/commit/074005040e9c3511b1c43b4298bef09908285534

[^1_8]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/blame/main/README.md

[^1_9]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/blob/main/config.json

[^1_10]: https://huggingface.co/FreedomIntelligence/AceGPT-v2-8B

[^1_11]: https://huggingface.co/FreedomIntelligence/AceGPT-v2-32B-Chat

[^1_12]: https://arxiv.org/html/2507.22603v1

[^1_13]: https://huggingface.co/inception42

[^1_14]: https://aclanthology.org/2020.acl-main.107.pdf

[^1_15]: https://arxiv.org/pdf/2411.1192.pdf

[^1_16]: https://huggingface.co/Omartificial-Intelligence-Space/Semantic-Ar-Qwen-Embed-0.6B/commit/31eb4bc4b1249374a947445ab33de4ff93b81aa1

[^1_17]: https://huggingface.co/spaces/Navid-AI/The-Arabic-IR-Leaderboard/raw/3512f14cd691101a598b537a64655ca1c9534fb7/results/retrieval_results.json

[^1_18]: https://arxiv.org/html/2103.07199v1

[^1_19]: https://arxiv.org/pdf/2506.08768.pdf

[^1_20]: https://web3.arxiv.org/pdf/2510.23319

[^1_21]: https://aclanthology.org/2025.arabicnlp-sharedtasks.102.pdf

[^1_22]: https://huggingface.co/oddadmix/qwen3-asr-1.7b-arabic-dialectal-v2

[^1_23]: https://openreview.net/attachment?id=yGbc8D9fpv\&name=pdf

[^1_24]: https://aclanthology.org/2026.acl-long.1503.bib

[^1_25]: https://acl-bg.org/proceedings/2026/LaTeLL 2026/pdf/2026.latell-1.5.pdf

[^1_26]: https://pdfs.semanticscholar.org/f693/86449662443050a970b9741583efbfdbaefa.pdf

[^1_27]: https://openreview.net/pdf/f92370ed30f12ecdb1c3f1e09da3d0864e980900.pdf

[^1_28]: https://arxiv.org/html/2511.14295

[^1_29]: https://openreview.net/attachment?id=TCzBPhS8F1\&name=pdf

[^1_30]: https://aclanthology.org/anthology-files/pdf/coling/2025.coling-main.283.pdf

[^1_31]: https://aclanthology.org/2025.coling-main.283.pdf

[^1_32]: https://link.springer.com/article/10.1007/s44443-025-00407-6?error=cookies_not_supported\&code=cdab8ad5-6957-4194-b296-6e969f4997e1

[^1_33]: https://aclanthology.org/2025.findings-naacl.263/

[^1_34]: https://jais.pages.dev/assets/tech-paper/Jais_2_family.pdf

[^1_35]: https://aclanthology.org/2025.findings-emnlp.529.pdf

[^1_36]: https://docs.mteb.org/overview/available_benchmarks/

[^1_37]: https://docs.mteb.org/overview/available_models/text/

[^1_38]: https://ufal.mff.cuni.cz/~mirovsky/2025/docs/2026_09_17_NPRG071_Report_Tomchik.pdf

[^1_39]: https://www.fanar.qa/en/publications

[^1_40]: https://arxiv.org/html/2607.03936v2

[^1_41]: https://web3.arxiv.org/pdf/2510.13430

[^1_42]: https://www.speechmatics.com/company/articles-and-news/your-voice-agent-speaks-perfect-arabic-thats-the-problem

[^1_43]: https://aclanthology.org/anthology-files/pdf/vardial/2026.vardial-1.31.pdf

[^1_44]: https://aclanthology.org/2026.vardial-1.31.pdf

[^1_45]: https://huggingface.co/datasets/palmaoui/AladdinBench

[^1_46]: https://github.com/JHU-CLSP/al-qasida

[^1_47]: https://aclanthology.org/2026.vardial-1.28.pdf

[^1_48]: https://gengo.sotaro.io/2026.findings-acl.1931

[^1_49]: https://aclanthology.org/volumes/2026.vardial-1/

[^1_50]: https://github.com/mbzuai-nlp/arabic-dialect-steering

[^1_51]: https://github.com/mbzuai-nlp/arabic-dialect-steering/blob/main/README.md

[^1_52]: https://www.munsit.com/blog/best-arabic-speech-recognition-software

[^1_53]: https://www.emergentmind.com/topics/aladdin-fti

[^1_54]: https://www.bayanatlabs.com/insights/arabic-llm-benchmarks

[^1_55]: https://www.scribd.com/document/861871419/2024-emnlp-main-1211

[^1_56]: https://aclanthology.org/2025.arabicnlp-sharedtasks.103.pdf

[^1_57]: https://github.com/dev-ahmedhany/whisper-arabic-dialects/blob/main/paper/paper.md

[^1_58]: https://www.isca-archive.org/interspeech_2025/wang25_interspeech.pdf

[^1_59]: https://jarrar.info/publications/TTS25.pdf

[^1_60]: https://nadi.dlnlp.ai/2025/

[^1_61]: https://huggingface.co/oddadmix/qwen3-asr-0.6b-arabic-dialectal

[^1_62]: https://aclanthology.org/2025.icnlsp-1.5.pdf

[^1_63]: https://github.com/h9-tec/Arabic-Speech-Handbook

[^1_64]: https://github.com/echonova-ai-solutions/arabic-asr-benchmark/

[^1_65]: https://www.speechdata.ai/blog/arabic-speech-recognition-dialects

[^1_66]: https://www.linkedin.com/posts/perla-al-almaoui-2bb1a41a7_palmaouialaddinbench-datasets-at-hugging-activity-7323262383907323904-JyOh

[^1_67]: https://asjp.cerist.dz/en/downArticle/531/14/2/281921

[^1_68]: https://www.scribd.com/document/1026351606/2025-Arabicnlp-Main-22

[^1_69]: https://aclanthology.org/2024.emnlp-main.1211.pdf

[^1_70]: https://aclanthology.org/2020.lrec-1.868v1.pdf

[^1_71]: https://camel-tools.readthedocs.io/en/v1.3.1/api/dialectid.html

[^1_72]: https://github.com/CAMeL-Lab/camel-tools-data/blob/main/catalogue-1.3.json

[^1_73]: https://camel-tools.readthedocs.io/en/stable/api/dialectid.html

[^1_74]: https://github.com/CAMeL-Lab/camel_tools/blob/master/camel_tools/dialectid/__init__.py

[^1_75]: https://huggingface.co/api/resolve-cache/models/CAMeL-Lab/bert-base-arabic-camelbert-mix-did-madar-corpus26/0a6f7d73d22bfe014a029d4a29f60c3c31d85ad2/README.md?download=true\&etag="dac34e42e64727506a1558d8e83706517a4af27b"

[^1_76]: https://jarrar.info/Talks/LisanSlides.pdf

[^1_77]: https://sina.birzeit.edu/resources/

[^1_78]: https://opendatalebanon.org/en/data

[^1_79]: https://camel-tools.readthedocs.io/en/v1.4.1/reference/packages.html

[^1_80]: https://arxiv.org/pdf/2103.06678.pdf

[^1_81]: https://camel-tools.readthedocs.io/en/latest/reference/packages.html

[^1_82]: https://www.opendatalebanon.org/en/orgs/cas

[^1_83]: https://aclanthology.org/2024.arabicnlp-1.14.pdf

[^1_84]: https://camel-tools.readthedocs.io/en/latest/api/dialectid.html

[^1_85]: https://github.com/abdessamadbettal/Arabizi-Translation-Guide

[^1_86]: https://arxiv.org/pdf/2608.02555.pdf

[^1_87]: https://www.academia.edu/95692926/Global_and_local_attention_for_automatic_Arabic_text_diacritization?hb-g-sw=111978193

[^1_88]: https://aclanthology.org/2020.wanlp-1.15.pdf

[^1_89]: https://www.academia.edu/49051628/ATAR_Attention_based_LSTM_for_Arabizi_transliteration

[^1_90]: https://laur.lau.edu.lb:8443/xmlui/handle/10725/15805?show=full

[^1_91]: https://aclanthology.org/2023.arabicnlp-1.36.pdf

[^1_92]: https://www.bayanatlabs.com/insights/egyptian-arabic-data

[^1_93]: https://elon.io/grammar/arabic-levantine/writing-system/arabizi

[^1_94]: https://huggingface.co/datasets/UBC-NLP/nilechat-arabizi-egy

[^1_95]: https://arxiv.org/html/2505.00114

[^1_96]: https://tahatobaili.github.io/project-rbz/

[^1_97]: https://oro.open.ac.uk/66829/1/SenZi\_\_A_Sentiment_Analysis_Lexicon_for_the_Latinised_Arabic\_\_Arabizi\_.pdf

[^1_98]: https://pypi.org/project/arabizikit/

[^1_99]: https://apflow.co/blog/arabic-rag-that-works/

[^1_100]: https://huggingface.co/papers/2506.05176

[^1_101]: https://huggingface.co/RedHatAI/Qwen3-Embedding-8B

[^1_102]: https://huggingface.co/api/resolve-cache/models/Qwen/Qwen3-Embedding-8B/7bd6fbe3c54b9ec2b4b1cc3a052720a76fcf0d90/README.md?download=true\&etag="977e42ef4dd6c8617aa4abd43039412b5edc10ec"

[^1_103]: https://huggingface.co/ArchiveStudio/Qwen3-Embedding-8B

[^1_104]: https://huggingface.co/Qwen/Qwen3-Embedding-8B/blame/main/README.md

[^1_105]: https://huggingface.co/Qwen/Qwen3-Embedding-8B?hardware=gb10

[^1_106]: https://huggingface.co/api/resolve-cache/models/anyidea/Qwen3-Embedding-8B/07db623afd9c350e02cfc94d6bd8d5f1ff20c79c/README.md?download=true\&etag="a34687a28d7230e124c833063e9e5f682fd08711"

[^1_107]: https://huggingface.co/Qwen/Qwen3-Embedding-8B/raw/main/README.md

[^1_108]: https://huggingface.co/Qwen/Qwen3-Embedding-8B/blob/main/README.md

[^1_109]: https://huggingface.co/Qwen/Qwen3-Embedding-8B/raw/c5446774f12cc9eadeb82c01d493043cf1795a23/README.md

[^1_110]: https://huggingface.co/Qwen/Qwen3-Embedding-8B-GGUF/resolve/refs%2Fpr%2F1/README.md?download=true

[^1_111]: https://huggingface.co/api/resolve-cache/models/Qwen/Qwen3-Embedding-8B/c5446774f12cc9eadeb82c01d493043cf1795a23/README.md?download=true\&etag="28b1630a55c571fad926fec4abbd1fcda66718cd"

[^1_112]: https://huggingface.co/Qwen/Qwen3-Embedding-8B/blob/9782d53e3666059d2a989a8868adccebf465d5f0/README.md

[^1_113]: https://huggingface.co/Qwen/Qwen3-Embedding-8B

[^1_114]: https://arxiv.org/html/2506.06339v1

[^1_115]: https://link.springer.com/content/pdf/10.1007/s44443-025-00407-6_reference.pdf?error=cookies_not_supported\&code=0450a2b0-d966-4f0a-a82f-c158c9268419

[^1_116]: https://github.com/azizalzahrani/arabic-rag-toolkit/blob/main/README.md

[^1_117]: https://arxiv.org/pdf/2608.23421.pdf

[^1_118]: https://www.mdpi.com/2073-8994/18/10/1703

[^1_119]: https://github.com/jey7800/QuranRAG

[^1_120]: https://huggingface.co/81melody/algerian-law-marbert/blob/main/README.md

[^1_121]: https://huggingface.co/81melody/algerian-law-biencoder-v2

[^1_122]: https://aclanthology.org/2026.findings-acl.1317/

[^1_123]: https://jurnal.umsu.ac.id/index.php/jcositte/article/view/25562

[^1_124]: https://eprints.gla.ac.uk/352746/2/352746.pdf

[^1_125]: https://arxiv.org/pdf/2602.02270.pdf

[^1_126]: https://soluvide.com/blog/why-arabic-breaks-llms-engineering

[^1_127]: https://aclanthology.org/people/basel-mousi/

[^1_128]: https://repository.kaust.edu.sa/server/api/core/bitstreams/5a7fa661-7e91-401c-b1ab-1d9e3085385f/content

[^1_129]: https://arxiv.org/pdf/2409.11404v3.pdf

[^1_130]: https://aclanthology.org/2026.acl-long.963.pdf

[^1_131]: https://huggingface.co/api/resolve-cache/datasets/QCRI/AraDiCE/e86c72cb72d1427845d363dd93893e61b7619325/README.md?download=true\&etag="3f4b67a237f092d3a2fd1604bc274d8219f6151d"

[^1_132]: https://scipapermill.com/2026/10/03/arabic-nlp-unpacked-from-dialectal-nuances-to-sustainable-ai-and-literary-creations/

[^1_133]: https://aclanthology.org/2026.eacl-long.341.pdf

[^1_134]: https://aclanthology.org/2025.icnlsp-1.20.pdf

[^1_135]: https://en.papernotes.org/ACL2025/llm_nlp/palm_a_culturally_inclusive_and_linguistically_diverse_dataset_for_arabic_llms/

[^1_136]: https://arxiv.org/html/2510.13430v1

[^1_137]: https://aclanthology.org/2025.acl-long.1579.pdf

[^1_138]: https://aclanthology.org/events/vardial-2026/

[^1_139]: https://www.emergentmind.com/topics/allam-34b

[^1_140]: https://systems-analysis.info/eng/Jais\_(language_model)

[^1_141]: https://ar5iv.labs.arxiv.org/html/2608.13580

[^1_142]: https://aclanthology.org/people/otba-alsboul/unverified/

[^1_143]: https://aclanthology.org/people/anjali-kantharuban/unverified/

[^1_144]: https://aclanthology.org/people/salima-lamsiyah/

[^1_145]: https://aclanthology.org/people/shahd-abdelmoneim/unverified/

[^1_146]: https://aclanthology.org/2026.vardial-1.27/

[^1_147]: https://aclanthology.org/2026.vardial-1.1/

[^1_148]: https://aclanthology.org/2026.vardial-1.31/

[^1_149]: https://aclanthology.org/2026.vardial-1.30.pdf

[^1_150]: https://aclanthology.org/2026.vardial-1.29.pdf

[^1_151]: https://arxiv.org/html/2411.01192

[^1_152]: https://arxiv.org/pdf/2506.05176.pdf

[^1_153]: https://github.com/QwenLM/Qwen3-Embedding

[^1_154]: https://github.com/QwenLM/Qwen3-Embedding/blob/main/README.md

[^1_155]: https://github.com/QwenLM/Qwen3-Embedding/tree/main

[^1_156]: https://github.com/LA-Referencia-IOI/reports/blob/main/semantic-model-selection-technical-report-2026-06-en.md

[^1_157]: https://huggingface.co/prestoai/qwen3-embedding-0.6b-arabic-ecom/commit/f917fd9b703536ff6b59f02c9382bff74366fbe2

[^1_158]: https://aclanthology.org/2022.wanlp-1.18.pdf

[^1_159]: https://huggingface.co/blog/Omartificial-Intelligence-Space/he-state-of-arabic-multimodal-embedding

[^1_160]: https://github.com/NNLP-IL/Arabic-Resources/blob/main/README.rst

[^1_161]: https://aclanthology.org/2026.findings-acl.1317.pdf

[^1_162]: https://www.scribd.com/document/983012885/Chapter-2291

[^1_163]: https://silma.ai/arabic-large-language-models

[^1_164]: https://silma.ai/blog/introducing-silma-matryoshka-embedding-model-v0-1

[^1_165]: https://app.ailog.fr/en/blog/news/embedding-models-2026

[^1_166]: https://silma.ai/arabic-llm

[^1_167]: https://arxiv.org/html/2502.20973v1

[^1_168]: https://silma.ai/labs

[^1_169]: https://github.com/Samielakkad/AI-NLP-Darija-Resources

[^1_170]: https://arxiv.org/pdf/2510.23319.pdf

[^1_171]: https://huggingface.co/HebArabNlpProject/WhisperLevantine/raw/0603f16fdedf0b16bc4ac7f024653a7c4d7f7f9f/README.md

[^1_172]: https://www.hassannasr.com/projects/arabic-asr-fine-tune

[^1_173]: https://github.com/dev-ahmedhany/whisper-arabic-dialects/blob/main/README.md

[^1_174]: https://huggingface.co/oddadmix/whisper-large-v3-arabic-dialectal-v2

[^1_175]: https://www.scitepress.org/publishedPapers/2026/144577/pdf/index.html

[^1_176]: https://arxiv.org/pdf/2410.04527v1.pdf

[^1_177]: https://aclanthology.org/2025.arabicnlp-sharedtasks.99.pdf

[^1_178]: https://perle.ai/resources/asr-code-switching-revisited-updated-benchmarks-arabic-persian-german/

[^1_179]: https://www.alphaxiv.org/abs/2605.19069

[^1_180]: https://perle.ai/resources/asr-code-switching-benchmark-english-arabic-persian-german/

[^1_181]: https://arxiv.org/html/2508.08912v1

[^1_182]: https://www.perle.ai/benchmark/asr/

[^1_183]: https://www.scribd.com/document/977518219/Obeid-et-al-2020-CAMeL-Tools-An-Open-Source-Python-Toolkit-for-Arabic-Natural-Language-Processing-Proceedings-of-the-Twelfth-Language

[^1_184]: https://aclanthology.org/anthology-files/pdf/mtsummit/2025.mtsummit-2.4.pdf

[^1_185]: https://aclanthology.org/2025.mtsummit-2.4.pdf

[^1_186]: https://arxiv.org/pdf/2507.04746.pdf

[^1_187]: https://aclanthology.org/people/ali-shazal/unverified/

[^1_188]: https://aclanthology.org/volumes/2020.wanlp-1/

[^1_189]: https://ai4lt.iar.kit.edu/downloads/Masterarbeiten/2023/Ahmad's Thesis.pdf

[^1_190]: https://scholar.google.com/citations?user=sYOb7V4AAAAJ\&hl=en

[^1_191]: https://link.springer.com/article/10.1007/s10772-025-10247-4

[^1_192]: https://aclanthology.org/people/aiza-usman/unverified/

[^1_193]: https://ar5iv.labs.arxiv.org/html/2407.03020

[^1_194]: https://aclanthology.org/2020.wanlp-1.15/

[^1_195]: https://camel-tools.readthedocs.io/en/v1.5.5/api/dialectid.html

[^1_196]: https://aclanthology.org/2026.osact-1.12.pdf

[^1_197]: https://aclanthology.org/anthology-files/pdf/osact/2026.osact-1.12.pdf

[^1_198]: https://aclanthology.org/people/alexander-erdmann/unverified/

[^1_199]: https://aclanthology.org/people/nasser-zalmout/unverified/

[^1_200]: https://aclanthology.org/people/mai-oudah/unverified/

[^1_201]: https://aclanthology.org/people/bashar-alhafni/

[^1_202]: https://aclanthology.org/2025.arabicnlp-main.10.pdf

[^1_203]: https://aclanthology.org/anthology-files/pdf/arabicnlp/2025.arabicnlp-main.10.pdf

[^1_204]: https://aclanthology.org/2021.eacl-demos.14.pdf

[^1_205]: https://aclanthology.org/2020.lrec-1.868.pdf

[^1_206]: https://aclanthology.org/2026.lrec-1.251.pdf

[^1_207]: https://aclanthology.org/2026.eacl-long.102.pdf

[^1_208]: https://huggingface.co/spaces/silma-ai/Arabic-LLM-Leaderboard/commit/57315c99ceffb80e2f0d4e30806809381c8db22e

[^1_209]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/blob/39b771734a0085c839ed8adf5eef51a8ce6e2c75/README.md

[^1_210]: https://huggingface.co/api/models/meta-llama/CodeLlama-34b-Instruct-hf/revision/edf62e7a0389eafc71b8fb1da96008817c0c9edb

[^1_211]: https://huggingface.co/inceptionai/jais-family-590m/blob/b3aee8237e54f9f714c08cde4f4382590b744984/README.md

[^1_212]: https://huggingface.co/meta-llama/CodeLlama-34b-Instruct-hf/resolve/main/README.md?download=true

[^1_213]: https://huggingface.co/inceptionai/Jais-family-256m

[^1_214]: https://huggingface.co/inceptionai/Jais-2-70B-Chat-GGUF/resolve/main/README.md?download=true

[^1_215]: https://huggingface.co/meta-llama/CodeLlama-34b-Instruct-hf/tree/main

[^1_216]: https://huggingface.co/inceptionai/jais-family-2p7b/blob/main/README.md

[^1_217]: https://huggingface.co/TheBloke/CodeLlama-34B-Instruct-GGUF/blob/main/LICENSE.txt

[^1_218]: https://huggingface.co/inception42/Jais-2-70B-Chat-GGUF

[^1_219]: https://huggingface.co/inception42/Jais-2-70B-Chat

[^1_220]: https://huggingface.co/inception42/jais-adapted-70b

[^1_221]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct

[^1_222]: https://huggingface.co/inception42/Jais-2-70B-Chat/blob/8bcbd3a66b34e59424a0e5eb0329cf022df4482e/README.md

[^1_223]: https://ollama.com/iKhalid/ALLaM:7b-q3_K_M

[^1_224]: https://huggingface.co/humain-ai/ALLaM-7B-Instruct-preview/commit/4cb5169d0b3c95e468aa92185a6f7c57f8499f91

[^1_225]: https://slm.expert/models/allam-7b-instruct-preview/

[^1_226]: https://lmmarketcap.com/reports/allam

[^1_227]: https://huggingface.co/api/resolve-cache/models/silma-ai/SILMA-9B-Instruct-v1.0/6e6c8c41ee1df9321dc70caa63780d05471fac6a/README.md?download=true\&etag="962234aebff9a7f28185587c2384e3103397daf7"

[^1_228]: https://huggingface.co/api/resolve-cache/models/silma-ai/SILMA-9B-Instruct-v1.0/d8f4d2b11a71e10f4231d38f0a343ee49715f392/README.md?download=true\&etag="d262da911fc0d0834bad4fe670fc7f3af3776cd8"

[^1_229]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/raw/a16866b7490db87ece40f901564aa1ee065e8405/README.md

[^1_230]: https://github.com/ASG00-0/Saudi-Legal-RAG-System

[^1_231]: https://huggingface.co/api/resolve-cache/models/silma-ai/SILMA-9B-Instruct-v1.0/e8371ec02e14c67a8f25571b893ddb673fb8b5cc/README.md?download=true\&etag="2ff8aab8ef2550826e7f8110ee098b1a2ee7124b"

[^1_232]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct

[^1_233]: https://vision2030.ai/analysis/humain-ai-model-partnerships/

[^1_234]: https://www.omniscient.media/post/inside-humain-s-sixteen-months-the-lab-it-doesn-t-have-and-the-layer-it-s-betting-on-instead

[^1_235]: https://arxiv.org/html/2508.17378v1

[^1_236]: https://huggingface.co/humain-ai/ALLaM-7B-Instruct-preview

[^1_237]: https://aclanthology.org/anthology-files/anthology-files/pdf/wanlp/2020.wanlp-1.6.pdf

[^1_238]: https://ar5iv.labs.arxiv.org/html/2205.10687

[^1_239]: https://github.com/tareknaous/dialogue-arabic-dialects

[^1_240]: https://www.mdpi.com/2306-5729/11/4/85

[^1_241]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12900375/

[^1_242]: https://e-space.mmu.ac.uk/637242/1/BDCC-08-00157.pdf

[^1_243]: https://link.springer.com/content/pdf/10.1007/s13278-023-01077-w.pdf?error=cookies_not_supported\&code=f56e9439-d824-4558-bed0-d2305b16ceb4

[^1_244]: https://scholarworks.aub.edu.lb/server/api/core/bitstreams/2d95ccc1-3768-4259-8599-fef43bf308e5/content

[^1_245]: https://ar5iv.labs.arxiv.org/html/2305.14989

[^1_246]: https://www.semanticscholar.org/paper/Empathy-driven-Arabic-Conversational-Chatbot-Naous-Hokayem/e42fd8c71b6d4acd4da0fece2e9f18cdd781e7ab

[^1_247]: https://cacm.acm.org/arab-world-regional-special-section/the-landscape-of-arabic-large-language-models/

[^1_248]: https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1661789/abstract

[^1_249]: https://blog.pangeanic.com/arabic-ai-evaluation-why-modern-standard-arabic-is-not-enough

[^1_250]: https://ri.kfupm.edu.sa/jrcai/research/publications/publications-detail/a-comprehensive-framework-and-empirical-analysis-for-evaluating-large-language-models-in-arabic-dialect-identification

[^1_251]: https://huggingface.co/datasets/QCRI/AraDiCE/blame/2f6db5f38242d86c203b03e41bacc254e811755c/README.md

[^1_252]: https://fdalvi.github.io/research/2020-12-COLING-arabench/paper.pdf

[^1_253]: https://ar5iv.labs.arxiv.org/html/2305.14976

[^1_254]: https://elmi.hbku.edu.qa/en/publications/aradice-benchmarks-for-dialectal-and-cultural-capabilities-in-llm/

[^1_255]: https://github.com/h9-tec/arabic-ai-atlas/blob/main/docs/tables/benchmark.md

[^1_256]: https://aclanthology.org/2025.coling-main.283/

[^1_257]: https://aclanthology.org/2026.abjadnlp-1.41.pdf

[^1_258]: https://dl.acm.org/doi/10.1145/3747290

[^1_259]: https://arxiv.org/html/2505.00114v1

[^1_260]: https://www.munsit.com/blog/arabic-speech-to-text-api

[^1_261]: https://ar5iv.labs.arxiv.org/html/2306.02902

[^1_262]: https://repository.kaust.edu.sa/server/api/core/bitstreams/79fe8816-6712-47b5-8e04-244922515f48/content

[^1_263]: https://arxiv.org/pdf/2609.35564.pdf

[^1_264]: https://arxiv.org/pdf/2511.18774.pdf

[^1_265]: https://huggingface.co/blog/CohereLabs/cohere-transcribe-arabic-07-2026-release

[^1_266]: https://alphasignal.ai/news/cohere-s-open-source-transcribe-arabic-beats-whisper-in-96-of-tests

[^1_267]: https://aclanthology.org/people/karima-kadaoui/

[^1_268]: https://aclanthology.org/2025.coling-main.307.pdf

[^1_269]: https://aclanthology.org/2025.acl-long.1427.pdf

[^1_270]: https://huggingface.co/spaces/nasrellahkharroubi/darija-arabizi-transliterator/tree/d5abcb41e0a5692964e89756848b8e1e1928ba06

[^1_271]: https://camel-tools.readthedocs.io/en/v1.3.1/reference/packages.html

[^1_272]: https://aclanthology.org/2023.arabicnlp-1.30.pdf

[^1_273]: https://camel-tools.readthedocs.io/en/v1.3.0/reference/packages.html

[^1_274]: https://pub.dev/packages/arabizi_transliterator/versions

[^1_275]: https://github.com/CAMeL-Lab/camel_tools

[^1_276]: https://arxiv.org/pdf/2605.00119.pdf

[^1_277]: https://huggingface.co/datasets/Almheiri/ArabCulture-Dialogue

[^1_278]: https://research.ibm.com/publications/cultural-benchmarking-of-llms-in-msa-and-arabic-dialectal-dialogue

[^1_279]: https://www.emirates247.com/uae/uae-researchers-create-first-tool-to-measure-artificial-intelligence-understanding-of-arab-culture/4590

[^1_280]: https://en.aletihad.ae/news/culture/4685629/mbzuai-develops-landmark-benchmark-to-bridge-cultural--diale

[^1_281]: https://link.springer.com/article/10.1007/s10579-019-09454-8?error=cookies_not_supported\&code=d646fca0-77e9-4db8-b74a-320df09f92f6

[^1_282]: https://www.linkedin.com/posts/snaeemm_arabicai-mbzuai-airesearch-activity-7494981353923330048-rjZn

[^1_283]: http://arxiv.org/abs/2411.01192

[^1_284]: https://aclanthology.org/2025.arabicnlp-main.6.pdf

[^1_285]: https://www.arfadia.com/blog/arabic-question-english-answer/

[^1_286]: https://arxiv.org/abs/2506.05176

[^1_287]: https://ar5iv.labs.arxiv.org/html/2510.14274

[^1_288]: https://ar5iv.labs.arxiv.org/html/2509.12340

[^1_289]: https://www.emergentmind.com/topics/bge-m3-model

[^1_290]: https://aclanthology.org/2026.findings-acl.1773.pdf

[^1_291]: https://leaderboard.mteb.org/models/Qwen/Qwen3-Embedding-0.6B

[^1_292]: https://qwenlm.github.io/blog/qwen3-embedding/

[^1_293]: https://docs.mteb.org/overview/available_models/multimodal/

[^1_294]: https://leaderboard.mteb.org/models/Qwen/Qwen3-Embedding-4B

[^1_295]: https://aclanthology.org/events/wanlp-2020/

[^1_296]: https://www.worldscientific.com/doi/pdf/10.1142/S2196888821500044

[^1_297]: https://www.linkedin.com/posts/samir-abdaljalil_arabicnlp2026-emnlp2026-imageeval2026-activity-7488209841149206529-UMfv

[^1_298]: https://aclanthology.org/R19-1138.pdf

[^1_299]: https://aclanthology.org/L18-1133.pdf

[^1_300]: https://www.academia.edu/79012448/Boosting_Arabic_Named_Entity_Recognition_With_Multi_Attention_Layer

[^1_301]: https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/computational-approaches-to-modeling-language-lab/research/arabic-natural-language-processing.html

[^1_302]: https://github.com/jjlalli/Tunisian-Derja-NLP-Resources/blob/main/MODELS.md

[^1_303]: https://www.voctos.com/research/ai-search-optimization-middle-east/

[^1_304]: https://arxiv.org/pdf/2609.34481.pdf

[^1_305]: https://aclanthology.org/volumes/2025.abjadnlp-1/

[^1_306]: https://www.linkedin.com/in/radwan-rima

[^1_307]: https://www.alphaxiv.org/@ammar-mohanna

[^1_308]: https://archive-ouverte.unige.ch/unige:187035

[^1_309]: https://www.macrothink.org/journal/index.php/jsel/article/download/23809/18223

[^1_310]: https://github.com/h9-tec/Awesome_Arabic_NLP

[^1_311]: https://arxiv.org/list/cs.CL/2025?skip=5025\&show=2000

[^1_312]: https://www.linkedin.com/in/perla-al-almaoui-2bb1a41a7

[^1_313]: https://aclanthology.org/2025.mtsummit-2.pdf

[^1_314]: https://arxiv.org/list/cs.CL/2025-05?skip=1000\&show=1000

[^1_315]: https://aclanthology.org/people/gagan-bhatia/

[^1_316]: https://arxiv.org/list/cs.CL/2025?skip=3375\&show=1000

[^1_317]: https://arxiv.org/html/2411.01192v3

[^1_318]: https://docs.mteb.org/overview/available_tasks/retrieval/

[^1_319]: https://www.linkedin.com/posts/perla-al-almaoui-2bb1a41a7_250220973-activity-7320370731257593856-TC7-

[^1_320]: https://www.catalyzex.com/author/Pierrette Bouillon

[^1_321]: https://aclanthology.org/anthology-files/pdf/acl/2026.acl-long.963.pdf

[^1_322]: https://arxiv.org/html/2607.03936v1

[^1_323]: http://www.lrec-conf.org/proceedings/lrec2026/pdf/2026.lrec2026-1.251.pdf

[^1_324]: https://arxiv.org/pdf/2609.22796v1.pdf

[^1_325]: https://huggingface.co/datasets/QCRI/AraDiCE/blame/bffb1de1f549a0844e02949f7f26eed0b3e82665/README.md

[^1_326]: https://fdalvi.github.io/blog/2025-01-20-aradice-benchmarks-for-arabic-dialects/

[^1_327]: https://github.com/4mekki4/Alexandria

[^1_328]: https://aclanthology.org/2026.abjadnlp-1.41/

[^1_329]: https://convozen.ai/products/arabic-speech-to-text

[^1_330]: https://arxiv.org/pdf/2610.28673.pdf

[^1_331]: https://www.scribd.com/document/856027650/Icassp2024-Sada

[^1_332]: https://docs.azure.cn/en-us/ai-services/speech-service/language-support

[^1_333]: https://arxiv.org/html/2609.35564v1

[^1_334]: https://www.perle.ai/resources/asr-code-switching-revisited-updated-benchmarks-arabic-persian-german/

[^1_335]: https://huggingface.co/spaces/kalkhorayef/open_universal_arabic_asr_leaderboard/blob/23bf4c13e3c387a537f88de0c1e39edfbca3f36a/app.py

[^1_336]: https://github.com/Natural-Language-Processing-Elm/open_universal_arabic_asr_leaderboard

[^1_337]: https://huggingface.co/spaces/msalhab96/open_universal_arabic_asr_leaderboard_all/raw/main/app.py

[^1_338]: https://huggingface.co/spaces/kalkhorayef/open_universal_arabic_asr_leaderboard/blame/4af7dea5af152e6bb2faa6c6064a9273b1e596f4/app.py

[^1_339]: https://huggingface.co/audarai/Audar-ASR-V1-Turbo/blame/dc8b1ff4eedecb00f64642164e1fe5ce2cc38bf4/README.md

[^1_340]: https://www.munsit.com/blog/whisper-ai-alternatives

[^1_341]: https://aclanthology.org/2025.arabicnlp-sharedtasks.99/

[^1_342]: https://arxiv.org/html/2407.03020

[^1_343]: https://wmdqs.org/submissions-2025/15.pdf

[^1_344]: https://link.springer.com/article/10.1007/s44443-026-00609-6

[^1_345]: https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/computational-approaches-to-modeling-language-lab/resources.html

[^1_346]: https://github.com/christios/camel_tools

[^1_347]: https://github.com/CAMeL-Lab/CAMeL_Tools

[^1_348]: https://camel.abudhabi.nyu.edu/madar-coda-corpus/

[^1_349]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/blame/main/README.md

[^1_350]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/discussions/3

[^1_351]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0

[^1_352]: https://huggingface.co/api/resolve-cache/models/humain-ai/ALLaM-7B-Instruct-preview/969fa7c8803a2c6c12583fb5cff3206c94ce491a/README.md?download=true\&etag="e835041f2c7e1409b7a3a0cd2c2f6e61027a0b23"

[^1_353]: https://huggingface.co/humain-ai/ALLaM-7B-Instruct-preview/blob/2bbee43c8b50770856e5ca158d286deaec0a65ce/README.md

[^1_354]: https://huggingface.co/api/resolve-cache/models/humain-ai/ALLaM-7B-Instruct-preview/0e95d3d436b72d89e7177ccc6187cbd2282e86a4/README.md?download=true\&etag="1bbff2a727b9acc60d89f2c5ef15f401a0e1161e"

[^1_355]: https://huggingface.co/ALLaM-AI/ALLaM-7B-Instruct-preview/blob/2bbee43c8b50770856e5ca158d286deaec0a65ce/README.md

[^1_356]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/commit/6e6c8c41ee1df9321dc70caa63780d05471fac6a

[^1_357]: https://huggingface.co/inception42/jais-family-30b-8k-chat/blob/main/README.md

[^1_358]: https://huggingface.co/api/resolve-cache/models/QCRI/Fanar-1-9B-Instruct/7e3d2fada4bdb1315562d20c6c23bb20b30c2e0e/README.md?download=true\&etag="6216d91a28f212db513aa48acbc063d4b7456fe7"

[^1_359]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/raw/e7018d46bc7b1bb2b129be73b7142d31ba06c92b/README.md

[^1_360]: https://huggingface.co/QCRI/Fanar-1-9B/raw/main/README.md

[^1_361]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/raw/main/README.md

[^1_362]: https://huggingface.co/QCRI/Fanar-1-9B

[^1_363]: https://huggingface.co/QCRI/Fanar-1-9B/blob/main/README.md

[^1_364]: https://huggingface.co/api/resolve-cache/models/QCRI/Fanar-1-9B-Instruct/8a5e0bcc4c797803040457e65b8421b56d5d24ee/README.md?download=true\&etag="dc140714f5101946a055d5a2a9d11eebed59c506"

[^1_365]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/blob/617d56a3a25fed74de1ba1a653be8f58122a450e/README.md

[^1_366]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/blob/main/README.md

[^1_367]: https://huggingface.co/QCRI/Fanar-1-9B?local-app=docker-model-runner

[^1_368]: https://huggingface.co/buthainaaa/Fanar-1-9B-Instruct-GPTQ/tree/main

[^1_369]: https://huggingface.co/inceptionai/Jais-2-8B-Chat-GGUF

[^1_370]: https://arxiv.org/html/2608.01291v1

[^1_371]: https://docs.vllm.ai/en/latest/models/supported_models/

[^1_372]: https://huggingface.co/FreedomIntelligence/AceGPT-7B-chat/raw/refs%2Fpr%2F2/LICENSE.txt

[^1_373]: https://modelpiper.com/fit/inceptionai-jais-2-8b-chat

[^1_374]: https://gengo.sotaro.io/2025.acl-long.1579

[^1_375]: https://github.com/azizalzahrani/awesome-arabic-ai

[^1_376]: https://github.com/h9-tec/arabic-ai-atlas/blob/main/docs/tables/llm.md

[^1_377]: https://www.alphaxiv.org/abs/2602.09703

[^1_378]: https://aclanthology.org/people/sebastian-ruder/unverified/

[^1_379]: https://aclanthology.org/people/nathaniel-romney-robinson/unverified/

[^1_380]: https://aclanthology.org/people/kelly-marchisio/

[^1_381]: https://underline.io/lecture/122042-p-cot-a-pedagogically-motivated-participatory-chain-of-thought-prompting-for-phonological-reasoning-in-llms

[^1_382]: https://aclanthology.org/people/maram-hasanain/

[^1_383]: https://aclanthology.org/people/md-arid-hasan/

[^1_384]: https://scholar.google.com/citations?user=gZRDGQ4AAAAJ\&hl=en

[^1_385]: https://llm-stats.com/benchmarks

[^1_386]: https://www.techtimes.com/ai-benchmarks

[^1_387]: https://arxiv.org/pdf/2610.28607.pdf

[^1_388]: https://www.perle.ai/benchmark/rle/

[^1_389]: https://scipapermill.com/2026/09/13/unlocking-arabic-ai-from-dialects-to-disinformation-new-frontiers-emerge/

[^1_390]: https://aclanthology.org/events/osact-2026/

[^1_391]: https://truescho.com/en/blog/claude-vs-chatgpt-arabic-content

[^1_392]: https://truescho.com/en/blog/claude-vs-chatgpt-arabic-content-2026

[^1_393]: https://www2.statmt.org/wmt26/pdf/2026.wmt-1.68.pdf

[^1_394]: https://santa-media.co/blog/chatgpt-vs-claude-vs-gemini-vs-grok-marketing-tasks

[^1_395]: https://lebanesebusinesses.com/ai-report/

[^1_396]: https://huggingface.co/spaces/Mosescreates/arabic-agent-eval-leaderboard/blob/main/leaderboard.json

[^1_397]: https://github.com/Bayanat-Labs/labelbench

[^1_398]: https://www.themoonlight.io/fr/review/swan-and-arabicmteb-dialect-aware-arabic-centric-cross-lingual-and-cross-cultural-embedding-models-and-benchmarks

[^1_399]: https://arabizly.github.io/

[^1_400]: https://www.linkedin.com/posts/gaganbhatiaml_naacl2025-naacl-acl-activity-7288835490911342592-1A5J

[^1_401]: https://www.sciencedirect.com/science/article/pii/S2667096825000333

[^1_402]: https://link.springer.com/article/10.1007/s44443-025-00295-w

[^1_403]: https://github.com/h9-tec/arabic-ai-atlas

[^1_404]: https://huggingface.co/spaces/Navid-AI/The-Arabic-RAG-Leaderboard/blame/fe19b0be3f9dc6a0e6e6c1b6f50fda7a6b43c42b/results/retrieval_results.json

[^1_405]: https://arabicagenticai.com/encyclopedia/arabic-tokenization/

[^1_406]: https://www.omneitylabs.com/models/madmon

[^1_407]: https://arxiv.org/pdf/2604.18932.pdf

[^1_408]: https://aclanthology.org/2026.findings-acl.1236.pdf

[^1_409]: https://aclanthology.org/volumes/2025.findings-naacl/

[^1_410]: https://aclanthology.org/events/findings-2025/

[^1_411]: https://aclanthology.org/people/muhammad-abdul-mageed/

[^1_412]: https://aclanthology.org/people/fakhraddin-alwajih/unverified/

[^1_413]: https://aclanthology.org/people/abdellah-el-mekki/

[^1_414]: https://aclanthology.org/people/el-moatez-billah-nagoudi/unverified/

[^1_415]: https://aclanthology.org/people/gagan-bhatia/unverified/

[^1_416]: https://aclanthology.org/2020.lrec-1.817.pdf

[^1_417]: https://aclanthology.org/2020.wanlp-1.8.pdf

[^1_418]: https://books.openbookpublishers.com/10.11647/obp.0411.07.pdf

[^1_419]: https://ar5iv.labs.arxiv.org/html/2306.16322

[^1_420]: https://arxiv.org/html/2610.27631

[^1_421]: https://ar5iv.labs.arxiv.org/html/2507.04746

[^1_422]: https://www.um.edu.mt/library/oar/bitstream/123456789/119975/1/EACL_2024\_\_\_Maltese_Etymology.pdf

[^1_423]: https://liner.com/review/casablanca-data-and-models-for-multidialectal-arabic-speech-recognition

[^1_424]: https://www.alphaxiv.org/abs/2410.04527

[^1_425]: https://pmc.ncbi.nlm.nih.gov/articles/PMC13365381/

[^1_426]: https://www.isca-archive.org/interspeech_2023/talafha23_interspeech.pdf

[^1_427]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/tree/main

[^1_428]: https://huggingface.co/collections/inception42/jais-2

[^1_429]: https://huggingface.co/inception42/Jais-2-70B-Chat/tree/main

[^1_430]: https://huggingface.co/models?other=base_model:quantized:inception42/Jais-2-70B-Chat

[^1_431]: https://huggingface.co/inception42/Jais-2-70B-Chat/tree/refs%2Fpr%2F3

[^1_432]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/commit/25d7b116ab3fb9f97417a297f8df4a7e34e7de68

[^1_433]: https://huggingface.co/QuantFactory/SILMA-9B-Instruct-v1.0-GGUF/blob/7dc3a7bcde847ab391419b3207a9ad0f6fcc65ae/README.md

[^1_434]: https://huggingface.co/datasets/Mushari440/requests/commit/5b4fcbaac67e01c103bda1a327847bfecd6f4f32

[^1_435]: https://huggingface.co/FreedomIntelligence/collections

[^1_436]: https://arxiv.org/html/2505.18152v2

[^1_437]: https://www.arxiv.org/pdf/2510.27543.pdf

[^1_438]: https://web3.arxiv.org/pdf/2510.24328

[^1_439]: https://aclanthology.org/2026.abjadnlp-1.45.pdf

[^1_440]: https://elmi.hbku.edu.qa/en/publications/enhancing-arabic-dialectal-sentiment-analysis-through-advanced-da/

[^1_441]: https://usetech.com/blog/422-million-speakers-0-6-of-the-internet-now-three-sovereign-ai-models/

[^1_442]: https://huggingface.co/FreedomIntelligence/AceGPT-v2-70B-Chat/tree/main

[^1_443]: https://huggingface.co/FreedomIntelligence/AceGPT-v2-32B

[^1_444]: https://huggingface.co/FreedomIntelligence/AceGPT-v2-32B-Chat/blame/main/config.json

[^1_445]: https://huggingface.co/FreedomIntelligence/AceGPT-v2-70B-Chat/blob/main/model-00015-of-00030.safetensors

