# Research inputs

Six deep-research reports commissioned for this project (Perplexity-generated, citation-backed;
the first five have an evidence cutoff of **22 October 2026**, the sixth **24 October 2026**).
They were delivered as long Markdown files with their original prompt as the H1 title; they have
been renamed to the names the build plan refers to. Content is unmodified except for removal of a
remote logo `<img>` tag at the top of each file.

Each report states its own evidence strength. `localization-lebanon.md` in particular separates
**verified**, **recommended** and **unverified** on every claim, and several of its most useful
findings are of the form "this is not established" — those are treated here as findings, not as
gaps to paper over.

| File | Original filename | Covers | Used by steps |
| :-- | :-- | :-- | :-- |
| [datasets.md](datasets.md) | `Act as a machine-learning data researcher. Conduct.md` | 25+ public datasets with verified licenses, KB/eval/intent/Arabic/speech selections, gap analysis, synthetic-generation strategy, cleaning + dedup + leakage plan, minimum dataset sizes, metric set, GitHub licensing verdicts | 05, 19, 21, 22–25, 37 |
| [arabic-data.md](arabic-data.md) | `Lebanese-Arabic support dataset.md` | Lebanese dialect + Arabizi generation, prompting evidence, embedding bake-off (Swan vs E5), normalization policy, dialect ID, ASR evidence, native-reviewer protocol and rubric, escalation metrics, test-set sizing | 15, 18, 19, 20, 21, 25, 28 |
| [messaging-lebanon.md](messaging-lebanon.md) | `Research, with citations from official sources, ho.md` | WhatsApp/SMS to +961: Meta Cloud API vs Twilio vs Bird vs Vonage vs Infobip, Oct-2026 WhatsApp pricing change, authentication templates, 24-hour window, webhook signature verification, Alfa/touch SMS realities, OTP fraud controls, portfolio vs production setups | 08, 16, 31 |
| [privacy-law.md](privacy-law.md) | `Research, with citations from official legal texts.md` | Lebanese Law 81/2018 (Articles 86–109), when GDPR also applies, voice + AI-training consent wording, retention schedule, hosting outside Lebanon, small-company compliance checklist, privacy-policy structure, lawyer-confirmation list | 04, 07, 12, 13, 27, 32 |
| [localization-lebanon.md](localization-lebanon.md) | `Arabic_English localization for Lebanon.md` | Numerals, dates and the Levantine month vocabulary, currency, bidi component contracts, selective RTL mirroring, Arabic typography rules, register and gender-neutral wording, Arabic plural categories, a ~110-term bilingual glossary, the assistive-technology matrix, 35 enforceable developer rules, and the native-speaker review checklist and rating form | **09**, 10, 11, 14, 17, 28, 33, 34 |
| [ml-training-adjacent.md](ml-training-adjacent.md) | `Arabic News Briefing LLM_ Model, Data, Training, a.md` | Arabic open-weight model licensing, dataset licence interpretation, QLoRA/DPO training plan, leakage controls, quantization policy, faithfulness gates, evaluation design | 22–27 (**see caveat below**) |

## Caveat on `ml-training-adjacent.md`

The build plan expects a file called `ml-training.md` about **fine-tuning and MLOps practice for
this project**. The report that arrived is a model/data/training plan for a *different* product — an
Arabic **news-briefing** LLM. It is genuinely useful and is cited where it transfers:

- open-weight Arabic model licensing (Apache-2.0 vs Falcon vs Gemma vs CC-BY-NC) and the warning
  that a dataset's packaging licence does not licence the text inside it;
- leakage control by cluster/lineage rather than by row, and chronological splits;
- QLoRA hyper-parameter starting ranges, quantization policy, teacher-distillation rights;
- the principle that a benchmark average is not evidence for your task, and that release
  thresholds ("go/no-go gates") belong to the product, not to the literature.

What it does **not** cover, and what step 22 therefore has to establish from primary sources
instead: experiment tracking and model-registry tooling (MLflow/DVC), calibration of a classifier's
probabilities, contrastive embedding fine-tuning with hard negatives, and promotion/shadow-eval
mechanics. These are named in the specification, so no decision is blocked — but the plan flags
every place where it is standing on general practice rather than on a commissioned report.
