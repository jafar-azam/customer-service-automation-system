
# Arabic News Briefing LLM: Model, Data, Training, and Evaluation Plan

This report is current to **15 October 2026**. The strongest commercial shortlist is **Jais 2 8B, Qwen3.5 9B/27B, Mistral Small 3.1 24B or Ministral 3 14B**, plus **Falcon-H1 Arabic 7B/34B after legal and llama.cpp validation**; Arabic leaderboard scores alone should not decide because the principal public evaluations are dominated by multiple-choice tasks rather than faithful, cited summarization.

## Executive summary

- **Choose licenses before benchmarks.** Prefer checkpoints explicitly under Apache 2.0, which permits commercial use and redistribution of derivative works subject to license, modification-notice, attribution, and NOTICE obligations.[^1_1][^1_2]
- **Minimum tier:** run an Arabic task-specific bake-off among **Jais 2 8B Chat**, **Qwen3.5 9B**, and **Falcon-H1 Arabic 7B**. Jais 2 is Arabic-centric and Apache 2.0; Qwen3.5 is Apache 2.0 with a 262K native context; Falcon currently has stronger published Arabic scores but uses a hybrid Mamba–Transformer architecture and the custom Falcon license.[^1_3][^1_4][^1_5]
- **Recommended tier:** prioritize **Qwen3.5 27B**, **Mistral Small 3.1 24B**, and **Falcon-H1 Arabic 34B**. Mistral Small 3.1 is a conventional, well-supported 24B Transformer with Arabic support, 128K context, and Apache 2.0 licensing.[^1_6][^1_7]
- **High tier:** test Falcon-H1 Arabic 34B against Jais 2 70B and Llama 3.3 70B. Llama permits commercial derivatives but imposes “Built with Llama,” model-naming and NOTICE requirements, plus a 700-million-MAU threshold.[^1_8][^1_9]
- **Do not ship Aya, Aya Expanse, or Command R open weights commercially.** Their open-weight releases use CC BY-NC 4.0 with acceptable-use additions; a separate commercial arrangement would be required.[^1_10][^1_11][^1_12]
- **Do not train commercial weights on XL-Sum or Bactrian-X.** Both contain explicit non-commercial restrictions; XL-Sum’s Arabic partition has 46,897 article-summary pairs but is CC BY-NC-SA 4.0.[^1_13][^1_14]
- **Build the production corpus primarily from licensed customer content.** Public Arabic summarization data is useful for research and evaluation, but many important resources—including LANS, AraSum and SumArabic—lack sufficiently clear commercial redistribution terms.
- **Use a two-stage architecture:** deterministic ingestion, deduplication, clustering, NER, dates and provenance first; then an LLM that writes only from normalized evidence packets. For large clusters, train map-stage evidence extraction and reduce-stage briefing synthesis while propagating source IDs.
- **Start with QLoRA SFT, then DPO.** A good first production target is 20,000–50,000 carefully corrected briefing examples plus 5,000–15,000 journalist preference pairs. Data quality, contradictions, provenance and hard negatives matter more than accumulating generic instruction data.
- **Make faithfulness a release gate, not merely a metric.** Every atomic factual proposition should be linked to one or more valid source IDs; unsupported-claim rate, citation recall, contradiction handling and abstention should be evaluated separately from ROUGE.


## Base models

### Decision table

“Commercial” below addresses the **base-model license only**. It does not clear the training data, trademarks, generated content, or customer source material.


| Model | Sizes and context | Arabic evidence | Exact license and redistribution | llama.cpp / GGUF status | Recommended tier |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **Falcon-H1 Arabic** | 3B, 7B, 34B; reported 131K for 3B and 262K for 7B/34B; hybrid Transformer–Mamba [^1_15][^1_4][^1_16] | Reported OALL: about 62 for 3B, 71.7 for 7B and 75.36 for 34B; 7B scored 82.18 on the Emirati Alyah multiple-choice benchmark [^1_4][^1_17][^1_16] | **Falcon LLM License**, not Apache 2.0. Commercial and derivative use appear intended, but the exact current redistribution text for the Arabic checkpoints was **not independently verified**. Review and archive the accepted license before training. | Generic Falcon-H1’s official card lists current llama.cpp support [^1_18]. Arabic GGUF conversion should still be tested because the hybrid recurrent state differs from a standard Transformer. | 7B minimum; 34B recommended/high, conditional on legal and runtime validation |
| **Jais 2** | Verified 8B; a 70B release is reported. Exact context should be read from the selected checkpoint card. | Jais 2 8B is reported strongest below 13B in its paper; Arabic IFEval strict scores are 52.97% prompt-level and 62.50% instruction-level [^1_5]. | **Apache 2.0**; commercial use and redistribution of derivatives allowed with Apache compliance [^1_5]. | An official gated 8B Chat GGUF repository exists under Apache 2.0 [^1_19]. | 8B minimum; 70B high |
| **ALLaM** | Publicly verifiable 7B preview; reports about 13B/34B/70B availability conflict. Secondary 2026 sources disagree on whether 34B is downloadable [^1_20][^1_21]. | The 7B preview reports 64.42 average, 67.78 ArabicMMLU, 51.58 ExamsAR and 31.34 strict Arabic prompt-following in its evaluation table [^1_22][^1_23]. | **Unverified for the exact checkpoint.** Do not assume the license of an unofficial GGUF. Obtain the official license and written redistribution permission. | Unofficial Ollama/GGUF builds exist for 7B [^1_23]. Official support and redistribution chain remain unclear. | Evaluation only until license is cleared |
| **Fanar 1 9B** | 9B; continued pretraining of Gemma 2 9B on one trillion Arabic/English tokens [^1_24][^1_25]. | Arabic-English specialization; no task-relevant AraGen/QIMMA summarization score was verified. | Model card says **Apache 2.0** [^1_24][^1_26]. **Legal review required:** the declared base, Gemma 2, is governed by Gemma Terms that attach distribution and prohibited-use conditions to model derivatives [^1_27]. | Gemma 2 architecture is commonly available in GGUF; validate the exact Fanar conversion. | Minimum-tier experiment only after resolving the base-license discrepancy |
| **SILMA** | Exact current size, context and checkpoint lineage were **not verified** in primary sources during this review. | Arabic-centric claims and current benchmarks unverified. | **Unclear: check the exact model card and base-model license.** If Gemma-derived, Gemma downstream conditions may apply. | Unverified. | Do not shortlist until provenance and license are documented |
| **Qwen3** | Dense 0.6B, 1.7B, 4B, 8B, 14B and 32B; MoE 30B-A3B and 235B-A22B; larger models support up to 128K with configuration-dependent scaling [^1_28]. | Strong multilingual family, but no authoritative, directly comparable OALL/AraGen/QIMMA summarization result was verified. | **Apache 2.0**, permitting commercial derivatives and redistribution with standard obligations [^1_28]. | Mature llama.cpp/GGUF path. Prefer Qwen3 over Qwen3.5 where runtime stability matters more than context efficiency. | 8B minimum; 30B-A3B/32B recommended |
| **Qwen3.5** | 0.8B, 2B, 4B, 9B, 27B, 35B-A3B, 122B-A10B and 397B-A17B; 262,144 native context is documented for 4B/27B [^1_29][^1_30][^1_31]. | Supports 201 languages/dialects, but task-specific Arabic news-generation results were not verified [^1_29]. | **Apache 2.0**; the official 9B license explicitly permits reproduction, derivative works and distribution [^1_1][^1_2]. | Supported by recent llama.cpp builds, but hybrid Gated DeltaNet prompt-cache and multi-slot bugs were reported; disabling prompt caching avoided documented corruption/crashes [^1_32][^1_30][^1_33]. | 9B minimum; 27B recommended; production only after recurrent-state regression tests |
| **Gemma 3 / Gemma 2** | 27B Gemma 3 is directly represented in Mistral’s comparison; verify the exact 4B/12B/27B card before selection [^1_7]. | Good multilingual baseline, but no verified Arabic summarization benchmark in this review. | **Gemma Terms**, commercially usable but not Apache: redistribution requires the agreement, modified-file notices, a NOTICE file and enforceable downstream prohibited-use restrictions [^1_27][^1_34]. | Mature GGUF support. | Secondary candidate where Gemma contractual obligations are acceptable |
| **Mistral Small 3.1** | 24B, 128K context, Arabic among supported languages [^1_6][^1_7]. | “Middle Eastern” multilingual aggregate reported at 69.08%; this is not a dedicated Arabic summarization score [^1_6]. | **Apache 2.0** [^1_35][^1_7]. | Official architecture is well suited to llama.cpp; public GGUF releases exist [^1_7]. | Top recommended-tier candidate |
| **Ministral 3** | 3B, 8B and 14B family; 14B card documents 256K context and Arabic support [^1_36][^1_37]. | No dedicated Arabic generation score verified. | **Apache 2.0**; model card also warns against infringement of third-party rights [^1_36][^1_38]. | Conventional local-deployment target; confirm multimodal components are excluded or packaged correctly for text-only GGUF. | 8B minimum, 14B recommended |
| **Llama 3.3** | Public 70B instruct checkpoint; general multilingual rather than Arabic-first [^1_9]. | No directly comparable Arabic summarization score verified. | **Llama 3.3 Community License**: commercial and derivative distribution allowed, but include the agreement and NOTICE, display “Built with Llama,” prefix distributed derivative model names with “Llama,” and obtain a separate license above the 700M-MAU threshold [^1_8][^1_9]. | Mature GGUF support. | High-tier baseline |
| **Aya 23 / Aya Expanse** | Aya 23: 8B/35B; Aya Expanse: 8B/32B, Arabic among 23 languages and nominal 128K context [^1_39][^1_12]. | Strong multilingual generation candidate for research; no verified task-specific summarization result included here. | **CC BY-NC 4.0 plus acceptable-use terms. No commercial use or commercial derived-weight distribution** [^1_11][^1_12]. | GGUF/Ollama packages exist. | Research benchmark only |
| **Command R** | 35B, 128K context; trained for RAG, citations and multilingual generation including Arabic [^1_40][^1_41]. | Particularly relevant as a research teacher for grounded citation formatting. | **CC BY-NC 4.0 plus Cohere acceptable-use policy. No commercial shipment without a separate Cohere license** [^1_10][^1_42]. | GGUF packages exist. | Research teacher/evaluator only |

### Benchmark warning

OALL’s later evaluation emphasizes native Arabic benchmarks such as ArabicMMLU, ALRAGE, AraTrust and MadinahQA, using normalized log-likelihood on largely multiple-choice or classification-style tasks. These numbers test Arabic knowledge and comprehension, but they do **not** establish that a model can merge many posts, preserve uncertainty, identify contradictions, generate valid source IDs or avoid unsupported details.[^1_43]

AraGen, QIMMA and BALSAM results should be added only from their official leaderboards or model submissions. No sufficiently authoritative, checkpoint-level results for all compared models were verified here, so missing cells must remain **unverified** rather than be inferred from vendor claims.

### Tier recommendations

| Hardware | First choices | Why |
| :-- | :-- | :-- |
| **8–12 GB VRAM** | **Jais 2 8B Chat Q4/Q5**, **Qwen3.5 9B Q4**, **Falcon-H1 Arabic 7B Q4** | Jais has the cleanest Arabic-first/Apache/GGUF combination; Qwen offers stronger long-context infrastructure and permissive licensing; Falcon supplies the strongest published Arabic benchmark evidence but carries custom-license and hybrid-runtime risk. |
| **24–32 GB VRAM** | **Mistral Small 3.1 24B Q4/Q5**, **Qwen3.5 27B Q4**, **Falcon-H1 Arabic 34B Q4** | Mistral is the conservative deployment choice; Qwen is the long-context choice; Falcon is the Arabic-specialist choice. Keep at least one conventional Transformer in the final bake-off to separate model-quality problems from hybrid-runtime problems. |
| **48+ GB VRAM** | **Falcon-H1 Arabic 34B Q6/8-bit**, **Jais 2 70B Q4**, **Llama 3.3 70B Q4** | Falcon maximizes Arabic specialization; Jais should offer the strongest Arabic-centric dense high-tier alternative; Llama is a mature general baseline but has heavier license obligations. |

## Dataset inventory

### License interpretation

“Derived weights” is conservative: an Apache or CC BY dataset label does not automatically clear copyright in incorporated news articles, social-media text, upstream datasets or model-generated responses. A repository software license may cover scripts but not the text corpus.


| Dataset | Size / language | Task and value | License | Commercial use | Distribute derived weights? | Quality and access notes |
| :-- | --: | :-- | :-- | :-- | :-- | :-- |
| **Customer-licensed newsroom corpus** | Target 20K–50K corrected briefing examples | Exact production task: cited multi-source briefing | Contract-specific | **Yes, if contract says so** | **Yes, if explicitly granted** | Highest-value source. Obtain explicit ML training, adaptation and weight-distribution rights. |
| [AraSum / AraRLHF / AraDPO](https://github.com/ppke-nlpg/AraSum) | 49,604 article/leads; 1,746 ranked samples; 2,309 DPO pairs; MSA news | Arabic summarization and preferences | **No explicit license found in repository** [^1_44] | **Unclear** | **Unclear** | DW-derived articles create an additional copyright question. Contact authors and DW before commercial training. |
| **LANS** | 8,443,484 article-summary pairs, 22 newspapers, 19 countries, 1999–2019 | Large Arabic headline/summary pretraining | **Unverified; available on request** [^1_45] | **Unclear** | **Unclear** | Request from paper authors; require a signed commercial-training and derivative-weight grant, not merely download permission. |
| [XL-Sum](https://huggingface.co/datasets/csebuetnlp/xlsum) | 46,897 Arabic pairs; 1.35M multilingual | High-quality BBC article-summary pairs | **CC BY-NC-SA 4.0** [^1_13][^1_46] | **No** | **No for this product** | Excellent evaluation/research data; exclude from commercial training unless separately licensed from rights holders. |
| [Multi-News](https://github.com/Alex-Fabbri/Multi-News) | 56,216 clusters; 44,972 train | English multi-news synthesis | Dataset license **unclear**; a TensorFlow loader being Apache does not license article text [^1_47][^1_48][^1_49] | **Unclear** | **Unclear** | Useful to learn multi-document structure only after rights review. |
| [WCEP](https://github.com/complementizer/wcep-mds-dataset) | 10,200 clusters, average 235 articles in the paper | Event-centered multi-document news summary | Repository MIT; linked news text retains source copyright [^1_50][^1_51] | **Unclear for article text** | **Unclear** | Chronological split is valuable; reconstruct from URLs/archives rather than redistributing publisher text. |
| [PeerSum](https://github.com/oaimli/PeerSum) | 14,993 review clusters | Contradiction/disagreement-aware multi-document synthesis | **No explicit license found** [^1_52][^1_53] | **Unclear** | **Unclear** | Domain mismatch, but structurally valuable for disagreements, ratings and multiple authors. Contact authors/OpenReview. |
| **SumArabic** | Size not authoritatively verified here | Arabic abstractive summarization | **Unverified** | **Unclear** | **Unclear** | Do not use commercially until the exact release and source-content terms are found [^1_54]. |
| [EASC](https://huggingface.co/datasets/drelhaj/EASC) | 153 documents, 765 extractive summaries | Arabic extractive summarization evaluation | Research-use terms [^1_55] | **No/unclear** | **No without permission** | Too small for primary training; useful as an extractive sanity test. |
| [MassiveSumm](https://huggingface.co/datasets/MaLA-LM/MassiveSumm_long) | 92 languages; Arabic included | Multilingual news summarization | **Unclear for content** | **Unclear** | **Unclear** | Full data is reconstructed from Common Crawl/Wayback; access can be requested at `djam@itu.dk` [^1_56]. |
| [Aya Dataset](https://huggingface.co/datasets/CohereLabs/aya_dataset) | 204K multilingual human pairs; about 13,960 Arabic across several dialects | General Arabic instruction following | **Apache 2.0** [^1_57][^1_58] | **Yes** | **Yes, subject to provenance review** | Useful as a small general-instruction component, not as the briefing corpus. |
| [Aya Collection](https://huggingface.co/datasets/CohereLabs/aya_collection) | 513.8M multilingual templated/translated instances | Broad instruction mixture | **Apache 2.0** [^1_59] | **Yes** | **Yes, subject to constituent provenance** | Aggressively subsample; it can swamp the desired newsroom style. |
| [InstAr-500k](https://huggingface.co/datasets/ClusterlabAi/InstAr-500k) | About 481K–500K Arabic pairs | General Arabic SFT | **Apache 2.0** [^1_60][^1_58] | **Yes** | **Yes, subject to source audit** | Synthetic plus collected data; filter for correctness, verbosity and source lineage. |
| [CIDAR](https://huggingface.co/datasets/arbml/CIDAR) | 10,000 Arabic pairs | Culturally localized instruction tuning | Metadata says **Apache 2.0**, but card also says “research purposes only” [^1_61] | **Unclear conflict** | **Unclear** | Obtain written clarification. About 9,109 examples originate from translated synthetic data and 891 from a website. |
| [Wojood / Wojood-Fine](https://sina.birzeit.edu/wojood/) | About 550K tokens; MSA, Palestinian and Lebanese; 21/51 entity types | Nested NER, events, dates, locations | **CC BY 4.0** is reported by the project; full corpus on request [^1_62][^1_63] | **Yes with attribution** | **Likely yes; document attribution** | Particularly relevant to people, organizations, places and events. Request through the project site. |
| [ANERcorp](https://huggingface.co/datasets/asas-ai/ANERCorp) | 150,110 tokens; MSA news | PER/ORG/LOC/MISC NER | **CC BY-SA 4.0** [^1_64][^1_65] | **Yes with conditions** | **Unclear whether ShareAlike attaches to weights** | Obtain legal interpretation before incorporating into distributed weights. |
| **CLEF CheckThat! 2024** | 66,630 total; 9,536 Arabic in the check-worthiness task | Check-worthiness, claims, persuasion | **CC BY 4.0**, but files may be restricted [^1_66] | **Yes under CC BY, subject to access terms** | **Likely yes with attribution** | Log in/request access through the official record; inspect each task’s separate terms. |
| **AraFacts** | 6,223 naturally occurring claims | Arabic claim verification and fact-checking | **Unverified** | **Unclear** | **Unclear** | Claims span 2016–2020 and include fact-checking metadata and links [^1_67][^1_68]. Contact authors for commercial access. |
| [ARAFA](https://huggingface.co/datasets/ChristopheKhalil/ARAFA) | 181,976 synthetic claim-evidence pairs | Supported/refuted/NEI classification | **CC BY-NC-SA 4.0** [^1_69][^1_70] | **No** | **No for commercial weights** | Large and useful for research, but synthetic and non-commercial. |
| **Kawarith** | About 1M collected tweets; 12,446 labeled tweets across seven crises | Multi-dialect crisis and conflict classification | **Dataset license unverified** [^1_71][^1_72] | **Unclear** | **Unclear** | Twitter/X redistribution and rehydration rules apply; article-paper licenses do not necessarily license the corpus. |
| [ArCOV-19](https://huggingface.co/datasets/bigIR/ar_cov19) | About 3.2M Arabic tweets | Social-media event and propagation data | Card has no completed license field [^1_73] | **Unclear** | **Unclear** | Prefer tweet IDs and labels, not redistributed text. |
| **ArCOV19-Rumors** | 138 verified claims and 9.4K relevant tweets | Claim verification and propagation | **Unverified; released as IDs to respect Twitter policy** [^1_74] | **Unclear** | **Unclear** | Useful for evidence/claim structure; commercial text use requires platform and rights review. |
| **HumAID** | Multilingual disaster tweets | Humanitarian information classification | **CC BY-NC-SA 4.0** [^1_75] | **No** | **No for commercial weights** | Research/evaluation only. |
| **CrisisNLP Requests/Offers** | Multilingual crisis posts | Actionable request/offer extraction | **CC BY-NC-SA 4.0** [^1_76] | **No** | **No for commercial weights** | Research only. |
| [Arabic Event GSR](https://github.com/openeventdata/arabic_event_gsr) | Size not verified | Arabic event gold-standard records | Repository **MIT** [^1_77] | **Yes for covered material** | **Yes, subject to data provenance** | Useful for who-did-what-where-when structures. |
| [Bactrian-X](https://github.com/mbzuai-nlp/bactrian-x) | 3.4M total; roughly 65K Arabic | Generic instruction-response training | **CC BY-NC 4.0** [^1_78][^1_14] | **No** | **No for commercial weights** | Machine-translated instructions and GPT-3.5 outputs; exclude from commercial training. |

## Build proprietary data

### Rights and provenance

Before annotation, attach this record to every input:

```json
{
  "source_id": "tg:channel:message_id",
  "platform": "telegram",
  "publisher": "...",
  "permalink": "...",
  "published_at": "...",
  "collected_at": "...",
  "language": "ar",
  "dialect": "msa|levantine|mixed|unknown",
  "content_hash": "...",
  "rights_basis": "customer_owned|licensed|permission|unclear",
  "retention_policy": "...",
  "text": "..."
}
```

Do not put `rights_basis=unclear` material into the commercial training split. For X-derived public research corpora, distribute IDs and labels rather than tweet text; ArCOV19-Rumors follows this approach to comply with Twitter redistribution policy.[^1_74]

For Telegram and news sites, public accessibility is not equivalent to permission to reproduce content or train redistributable weights. The safest product structure is a written customer license covering ingestion, model training, synthetic transformation, internal retention, cross-customer use or isolation, and redistribution of adapted weights.

### Output specification

Train the model to produce machine-validated JSON first, then render Arabic prose deterministically:

```json
{
  "key_headlines": [
    {
      "text": "...",
      "source_ids": ["p17", "p44"],
      "support": "direct",
      "confidence": "high"
    }
  ],
  "topics": [],
  "entities": {
    "people": [],
    "organizations": [],
    "places": []
  },
  "events": [
    {
      "who": [],
      "action": "...",
      "where": "...",
      "when": "...",
      "source_ids": [],
      "status": "reported|confirmed|disputed|unclear"
    }
  ],
  "developing_stories": [],
  "duplicate_groups": [],
  "contradictions": [
    {
      "claim_a": "...",
      "source_ids_a": [],
      "claim_b": "...",
      "source_ids_b": [],
      "resolution": "unresolved"
    }
  ],
  "unverified_claims": []
}
```

Require source IDs from an enumerated input list. Grammar-constrained decoding can prevent malformed JSON and nonexistent ID syntax, but it cannot establish that a cited source actually entails the claim.

### Annotation protocol

1. **Cluster first.** Group exact duplicates, paraphrases, updates and reports about the same event.
2. **Normalize each source.** Record timestamp, outlet, author/channel, quoted speaker, location and whether the text is firsthand, attributed or speculative.
3. **Write atomic claims.** A bullet containing several propositions must cite evidence for every proposition.
4. **Preserve attribution.** “The ministry said X” is not equivalent to “X happened.”
5. **Preserve uncertainty.** Keep words such as “reported,” “claimed,” “according to,” “preliminary” and “unconfirmed” where the sources require them.
6. **Represent contradictions explicitly.** Never silently choose one version because it appears more frequently.
7. **Separate duplication from corroboration.** Ten channels copying one agency report are one provenance chain, not ten independent confirmations.
8. **Forbid unstated causal links.** Temporal proximity does not establish causation.
9. **Require null outputs.** Empty sections are preferable to invented content.
10. **Adjudicate high-risk examples.** Conflict, casualties, accusations, identity, locations and rapidly changing stories should receive a second journalist review.

### Data volumes

These are engineering targets, not universal sample-complexity laws:


| Stage | Recommended volume | Composition |
| :-- | --: | :-- |
| Pilot SFT | 3K–5K | Hand-corrected examples spanning all sections and output states |
| Production SFT v1 | 20K–50K | 50–60% normal clusters; 15% duplicates; 10–15% contradictions; 10% dialect-heavy; 10% sparse/no-answer |
| Long-context curriculum | 5K–15K | 20–200 posts per cluster, chronological updates and distractors |
| DPO | 5K–15K pairs | Teacher draft versus journalist edit, plus deliberately unsupported and malformed negatives |
| Gold evaluation | 500–1,000 clusters | Frozen, temporally later, outlet-disjoint, event-disjoint |
| Red-team set | 200–400 clusters | Casualties, conflict attribution, changing locations, copied rumors and conflicting timestamps |

A small corpus of precise, fully cited newsroom examples should be weighted above hundreds of thousands of generic Arabic instructions.

### Teacher distillation

Use a locally run 34B–70B teacher whose license permits its outputs to be used for training the target model. The teacher should produce:

- Candidate event frames
- Claim-to-source alignments
- Duplicate groups
- Contradiction candidates
- Draft JSON
- A self-check listing every output proposition and supporting source span

Human annotators should correct rather than merely accept drafts. Store the original draft, final edit, span-level changes and reason codes; these records naturally become SFT targets, DPO pairs and error-analysis data.

Do not use Gemma outputs for distillation without reviewing its broad “Model Derivatives” definition, which expressly covers some synthetic-output-based training. Do not use Aya/Command R outputs to create commercial derivatives unless a separate commercial license clearly grants that right.[^1_27]

### Leakage controls

- Split by **event cluster**, not article.
- Apply chronological splitting so later updates to a training event cannot leak into test; WCEP’s original work used non-overlapping chronological event dates.[^1_50]
- Deduplicate with URL canonicalization, normalized text hashes, MinHash/SimHash and multilingual semantic similarity.
- Maintain publisher-disjoint and Telegram-channel-disjoint challenge subsets.
- Search test summaries and distinctive n-grams against all training text and teacher prompts.
- Freeze the gold set before model selection.
- Do not let annotators copy reference answers into preference negatives.


## Training plan

### Phase sequence

| Phase | Work | Model/data | Tools | Planning time |
| :-- | :-- | :-- | :-- | --: |
| **0. Legal gate** | Archive model licenses; clear every dataset and teacher | All candidates | License register, content-rights ledger | 1–3 weeks |
| **1. Baseline bake-off** | Evaluate unmodified GGUF models on 200 gold clusters | 3 models per tier | llama.cpp, fixed prompts, constrained JSON | 3–7 days |
| **2. Pipeline baseline** | Dedup, clustering, NER, dates, source packing | Existing Arabic encoders plus rules | Python, sentence embeddings, Wojood-compatible NER | 2–4 weeks |
| **3. Pilot SFT** | Learn schema, source citations, abstention | 3K–5K examples | LLaMA-Factory or Axolotl; Unsloth where supported | 1–3 days for 8B; 3–7 days for 24–34B |
| **4. Production SFT** | Full behavior and long-context curriculum | 20K–50K examples | QLoRA, sequence packing, FSDP/DeepSpeed if needed | 3–14 days |
| **5. Preference tuning** | Faithfulness, format, brevity and conflict handling | 5K–15K pairs | TRL DPO/KTO/ORPO | 1–5 days |
| **6. Quantization** | Merge, convert, quantize, regression test | Final checkpoint | Transformers/PEFT, llama.cpp conversion tools | 1–3 days |
| **7. Release gate** | Blind human comparison and red-team tests | 500–1,000 gold cases | Evaluation harness | 1–2 weeks |

Time ranges are budgetary estimates for one or two high-end consumer GPUs and depend strongly on sequence length, flash-attention support, checkpointing and model architecture.

### Adaptation method

- **QLoRA:** default for 7B–34B experimentation on budget hardware.
- **BF16 LoRA:** preferable when the model and sequence length fit; it avoids 4-bit training-base complications.
- **Full fine-tuning:** not recommended for the stated hardware budget; use it only if a later training cluster and a sufficiently large proprietary corpus justify the cost.
- **Hybrid models:** verify that the trainer targets Mamba/DeltaNet modules correctly. First adapt attention and MLP projections; add recurrent/SSM projections only after measuring stability.
- **Do not train directly from a GGUF.** Train the original HF-format checkpoint, merge adapters, then convert the merged model to GGUF.

Suggested pilot ranges:


| Setting | Starting value |
| :-- | :-- |
| LoRA rank | 64 for 7–14B; 64–128 for 24–34B |
| LoRA alpha | 2× rank |
| Dropout | 0–0.05 |
| Adapter learning rate | 5e-5 to 1.5e-4 |
| Epochs | 1–3, selected by faithfulness validation |
| Warmup | 3–5% |
| Weight decay | 0–0.1 |
| Effective batch | 32–128 sequences, or token-normalized equivalent |
| Gradient clipping | 1.0 |
| Initial sequence length | 4K–8K |
| Long-context stage | 16K–32K; extend only after measuring retrieval and citation accuracy |
| Loss weighting | Upweight citation IDs, uncertainty labels, contradiction fields and null-section examples |

Do not assume a nominal 128K/262K model will produce reliable 128K briefings. Retrieval quality and recurrent-state correctness must be tested at the actual production prompt lengths; recent Qwen3.5 llama.cpp issues demonstrate why advertised context and reliable serving are different questions.[^1_32][^1_33]

### Long inputs

Use a provenance-preserving map–reduce design:

1. **Map:** extract normalized claims, entities, dates, locations, quotes and uncertainty from each post or small chronological bundle.
2. **Link:** cluster claims into duplicate, corroborating, updating and contradictory groups.
3. **Reduce:** generate the final briefing from compact evidence records, not raw posts alone.
4. **Verify:** decompose output into atomic claims and test each against cited evidence.
5. **Render:** convert validated JSON to the newsroom-facing Arabic format.

During training, include both end-to-end examples and separate map/reduce examples. Never mix unrelated briefing examples merely to improve token packing.

### Preference optimization

Use **DPO first** because chosen/rejected pairs are transparent and easy to audit:

- Prompt: identical source packet and briefing specification.
- Chosen: journalist-corrected output.
- Rejected: original draft.
- Metadata: edit reasons such as unsupported claim, missing citation, wrong attribution, contradiction ignored, duplicate repeated, invalid JSON or excessive verbosity.

Exclude pairs where the chosen output is merely stylistically different. DPO should learn a clear quality preference, not arbitrary editor voice.

Use **KTO** when journalists supply only accept/reject labels without paired rewrites. Test **ORPO** when combining instruction and preference objectives in one training phase, and **SimPO** when reference-model memory is prohibitive. Regardless of algorithm, compare against an SFT-only control because preference tuning can improve formatting while silently degrading coverage.

### Hallucination controls

- **Citation supervision:** every training claim carries valid source IDs.
- **Span supervision:** where practical, store supporting source spans, not IDs alone.
- **ID-constrained decoding:** only IDs present in the prompt are legal.
- **Retrieval grounding:** reduce the prompt to relevant evidence while preserving disagreements and updates.
- **Atomic-claim verification:** run a second local verifier before display.
- **Faithfulness reward:** penalize unsupported propositions, unsupported numbers, wrong actors and overconfident wording.
- **Abstention training:** reward “لم يتسنَّ التحقق” or an empty section when support is absent.
- **Attribution preservation:** distinguish event truth from what a person or organization claimed.
- **Template validation:** schema validation controls structure; it must never be treated as a factuality test.


## Deployment and GGUF

### Conversion path

1. Save the final adapter and base-checkpoint commit hash.
2. Merge LoRA into BF16/FP16 HF weights.
3. Run the unquantized merged checkpoint against the frozen gold set.
4. Convert with the same recent llama.cpp revision intended for customers.
5. Quantize with an Arabic/news representative importance matrix where supported.
6. Compare each quant against the merged reference using identical deterministic decoding.
7. Package model card, base license, NOTICE, training-data statement, llama.cpp revision and known limitations.

### Quantization policy

| Quant | Recommended use | Arabic risk |
| :-- | :-- | :-- |
| **Q6_K** | Quality reference or premium deployment | Lowest practical quantization risk; larger footprint |
| **Q5_K_M** | Default for 7–14B when memory permits | Preferred for names, numbers, morphology and dialect preservation |
| **Q4_K_M** | Default for 24–70B fit-constrained deployment | Usually the best capacity/quality trade-off, but must pass Arabic factuality testing |
| **IQ4_XS / IQ3 variants** | Only when a larger model otherwise cannot fit | Higher risk to rare names, exact numbers, source IDs and dialectal forms |
| **Q8_0** | Near-reference validation | Large; useful for separating quantization loss from fine-tuning loss |

There is no reliable universal percentage for “Arabic quality loss” at each quantization. Measure the delta separately for unsupported claims, exact source IDs, person/location names, numerals, date normalization, Levantine comprehension and JSON validity. A larger IQ3 model should not automatically beat a smaller Q5 model on citation fidelity.

## Evaluation plan

### Automatic suite

| Dimension | Metrics |
| :-- | :-- |
| **Citation validity** | Percentage of cited IDs present in input; zero tolerance for invented IDs |
| **Citation entailment** | Atomic claims fully supported, partially supported or unsupported by cited sources |
| **Citation completeness** | Percentage of factual claims with at least one adequate citation |
| **Faithfulness** | Arabic/multilingual NLI, QA-based consistency and claim-evidence verification; calibrate every metric against human labels |
| **Coverage** | Recall of gold event frames, entities, locations, dates, developing stories and contradictions |
| **Contradictions** | Precision/recall for identifying source disagreements without falsely declaring contradiction |
| **Duplicates** | Pairwise or cluster F1 for copied/paraphrased posts |
| **Structure** | JSON-schema pass rate, section completeness, valid enum values |
| **Arabic quality** | Grammar, newsroom register, MSA/Levantine handling, entity spelling and numeral/date rendering |
| **Compression** | Information units retained per output token; length compliance |
| **Stability** | Results across quantizations, context lengths, source order permutations and repeated deterministic runs |
| **Latency** | Prefill time, tokens/s, peak VRAM, first-token latency and total briefing time per hardware tier |

ROUGE should be reported only as a secondary lexical-overlap metric. Arabic clitics, inflection, spelling variants and paraphrase can depress overlap without indicating a worse briefing, while a fluent but unsupported summary can still score well.

Use normalized and raw variants:

- Raw Arabic ROUGE-1/2/L
- Alef/ya normalization
- Optional diacritic and tatweel removal
- Morphological segmentation where reproducible
- Multilingual semantic similarity
- Entity and event-frame F1
- Exact number/date accuracy


### Human review

Use two native Arabic journalists per sample plus adjudication. Review blind, with model identity and quantization hidden.

Score each output on:

1. Factual support
2. Citation correctness
3. Citation completeness
4. Coverage
5. Duplicate handling
6. Contradiction handling
7. Uncertainty and attribution
8. Arabic fluency
9. Newsroom usefulness
10. Severity of the worst error

Record errors at the atomic-claim level. A severe unsupported allegation, casualty number or identity mistake should outweigh several stylistic improvements.

### Gold-set design

A practical release suite is **800 frozen clusters**:

- 250 routine MSA news clusters
- 120 Levantine/mixed-dialect clusters
- 100 long clusters with at least 50 posts
- 100 rapidly developing stories
- 80 duplicate-heavy clusters
- 80 explicit contradiction clusters
- 40 sparse/no-answer clusters
- 30 high-risk casualty, identity or accusation cases

Keep a separate 200–400-case red-team set that developers cannot inspect during model tuning.

### Go/no-go gates

Recommended initial release thresholds:

- 100% valid source-ID syntax
- At least 99.5% of factual claims contain citations
- At least 99% of atomic factual claims are fully supported on routine material
- Zero severe unsupported allegations, casualty figures or identity claims in the frozen release set
- At least 95% JSON/schema validity before repair; 100% after deterministic repair
- No statistically meaningful regression against the previous release in citation entailment or contradiction recall
- Human preference win rate above 55% against the incumbent, with confidence intervals excluding parity
- Latency and VRAM within the advertised tier at the supported context length

These are product-risk thresholds, not community standards. Tighten them as the gold set grows.

## Risks and open questions

- **Falcon licensing:** archive and obtain legal approval for the exact Falcon-H1 Arabic license before investing in adaptation. Do not infer terms from older Apache-licensed Falcon checkpoints.
- **Fanar provenance:** its card declares Apache 2.0 while also declaring Gemma 2 as the base; Gemma Terms impose downstream obligations on derivatives. Treat this as unresolved until QCRI explains the licensing chain.[^1_24][^1_27]
- **ALLaM availability:** 2026 secondary sources conflict on whether 34B is gated or closed. Only an official checkpoint and license should determine product eligibility.[^1_20][^1_21]
- **SILMA:** size, benchmark, lineage and redistribution terms remain **unverified**.
- **Dataset ambiguity:** “public,” “downloadable,” or “research corpus” does not mean commercially trainable.
- **Apache metadata:** dataset-level Apache labels may cover packaging while embedded news or website content remains copyrighted.
- **Teacher-output rights:** verify whether the teacher license permits output-based distillation into a commercially distributed model.
- **Hybrid serving:** recurrent-state models need cache, batching, cancellation, prompt-reuse and concurrent-slot tests beyond ordinary token-quality evaluation; Qwen3.5 has had concrete prompt-cache defects in llama.cpp.[^1_33][^1_32]
- **Long-context overconfidence:** nominal context length does not establish recall, correct chronology or citation fidelity at that length.
- **Cross-customer contamination:** customer-specific adaptations should remain isolated unless contracts expressly permit pooled training.
- **Telegram provenance:** copied news often obscures the originating publisher; duplication logic must track syndication chains rather than treating every channel as independent evidence.
- **Benchmark obsolescence:** model cards and GGUF runtime support can change quickly. Recheck checkpoint commits, licenses and current llama.cpp issues immediately before release.


## Immediate recommendation

Run a legally clean, 200-cluster bake-off with:

1. **Jais 2 8B Chat Q5_K_M**
2. **Qwen3.5 9B Q5_K_M**
3. **Falcon-H1 Arabic 7B Q5_K_M**
4. **Mistral Small 3.1 24B Q4_K_M**
5. **Qwen3.5 27B Q4_K_M**
6. **Falcon-H1 Arabic 34B Q4_K_M**

Advance one conventional Transformer and one Arabic-specialist model to QLoRA. The safest likely commercial paths are **Jais 2 8B for the minimum tier** and **Mistral Small 3.1 24B or Qwen3.5 27B for the recommended tier**; Falcon-H1 Arabic should advance only after its license and hybrid llama.cpp behavior are formally cleared.

<span style="display:none">[^1_100][^1_101][^1_102][^1_103][^1_104][^1_105][^1_106][^1_107][^1_108][^1_109][^1_110][^1_111][^1_112][^1_113][^1_114][^1_115][^1_116][^1_117][^1_118][^1_119][^1_120][^1_121][^1_122][^1_123][^1_124][^1_125][^1_126][^1_127][^1_128][^1_129][^1_130][^1_131][^1_132][^1_133][^1_134][^1_135][^1_136][^1_137][^1_138][^1_139][^1_140][^1_141][^1_142][^1_143][^1_144][^1_145][^1_146][^1_147][^1_148][^1_149][^1_150][^1_151][^1_152][^1_153][^1_154][^1_155][^1_156][^1_157][^1_158][^1_159][^1_160][^1_161][^1_162][^1_163][^1_164][^1_165][^1_166][^1_167][^1_168][^1_169][^1_170][^1_171][^1_172][^1_173][^1_174][^1_175][^1_176][^1_177][^1_178][^1_179][^1_180][^1_181][^1_182][^1_183][^1_184][^1_185][^1_186][^1_187][^1_188][^1_189][^1_190][^1_191][^1_192][^1_193][^1_194][^1_195][^1_196][^1_197][^1_198][^1_199][^1_200][^1_201][^1_202][^1_203][^1_204][^1_205][^1_206][^1_207][^1_208][^1_209][^1_210][^1_211][^1_212][^1_213][^1_214][^1_215][^1_216][^1_217][^1_218][^1_219][^1_220][^1_221][^1_222][^1_223][^1_224][^1_225][^1_226][^1_227][^1_228][^1_229][^1_230][^1_231][^1_232][^1_233][^1_234][^1_235][^1_236][^1_237][^1_238][^1_239][^1_240][^1_241][^1_242][^1_243][^1_244][^1_245][^1_246][^1_247][^1_248][^1_249][^1_250][^1_251][^1_252][^1_253][^1_254][^1_255][^1_256][^1_257][^1_258][^1_259][^1_260][^1_261][^1_262][^1_263][^1_264][^1_265][^1_266][^1_267][^1_268][^1_269][^1_270][^1_271][^1_272][^1_273][^1_274][^1_275][^1_276][^1_277][^1_278][^1_279][^1_280][^1_281][^1_282][^1_283][^1_284][^1_285][^1_286][^1_287][^1_288][^1_289][^1_290][^1_291][^1_292][^1_293][^1_294][^1_295][^1_296][^1_297][^1_298][^1_299][^1_300][^1_301][^1_302][^1_303][^1_304][^1_305][^1_306][^1_307][^1_308][^1_309][^1_310][^1_311][^1_312][^1_313][^1_314][^1_315][^1_316][^1_317][^1_318][^1_319][^1_320][^1_321][^1_322][^1_323][^1_324][^1_325][^1_326][^1_327][^1_328][^1_329][^1_330][^1_331][^1_332][^1_333][^1_334][^1_335][^1_336][^1_337][^1_338][^1_339][^1_340][^1_341][^1_342][^1_343][^1_344][^1_345][^1_346][^1_347][^1_348][^1_349][^1_350][^1_351][^1_352][^1_353][^1_354][^1_355][^1_356][^1_357][^1_358][^1_359][^1_360][^1_361][^1_362][^1_363][^1_364][^1_365][^1_366][^1_367][^1_368][^1_369][^1_370][^1_371][^1_372][^1_373][^1_374][^1_375][^1_376][^1_377][^1_378][^1_379][^1_380][^1_381][^1_382][^1_383][^1_384][^1_385][^1_386][^1_387][^1_388][^1_389][^1_390][^1_391][^1_392][^1_393][^1_394][^1_395][^1_396][^1_397][^1_398][^1_399][^1_400][^1_401][^1_402][^1_403][^1_404][^1_405][^1_406][^1_407][^1_408][^1_409][^1_410][^1_411][^1_412][^1_413][^1_414][^1_415][^1_416][^1_417][^1_418][^1_419][^1_420][^1_421][^1_422][^1_423][^1_424][^1_425][^1_426][^1_427][^1_428][^1_429][^1_430][^1_431][^1_432][^1_433][^1_434][^1_435][^1_436][^1_437][^1_438][^1_439][^1_440][^1_441][^1_442][^1_443][^1_444][^1_445][^1_446][^1_447][^1_448][^1_449][^1_450][^1_451][^1_452][^1_453][^1_454][^1_455][^1_456][^1_457][^1_458][^1_459][^1_460][^1_461][^1_462][^1_463][^1_464][^1_465][^1_466][^1_467][^1_468][^1_469][^1_470][^1_471][^1_472][^1_473][^1_474][^1_475][^1_476][^1_477][^1_478][^1_479][^1_480][^1_481][^1_482][^1_483][^1_484][^1_485][^1_486][^1_487][^1_488][^1_489][^1_490][^1_491][^1_492][^1_493][^1_494][^1_495][^1_496][^1_497][^1_498][^1_499][^1_500][^1_501][^1_502][^1_503][^1_504][^1_505][^1_506][^1_507][^1_508][^1_509][^1_510][^1_511][^1_512][^1_513][^1_514][^1_515][^1_516][^1_517][^1_518][^1_519][^1_520][^1_521][^1_522][^1_523][^1_524][^1_525][^1_526][^1_527][^1_528][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92][^1_93][^1_94][^1_95][^1_96][^1_97][^1_98][^1_99]</span>

<div align="center">⁂</div>

[^1_1]: https://huggingface.co/Qwen/Qwen3.5-9B/blame/c418ccbcd38437a7838ce061273515d2e0613c7f/LICENSE

[^1_2]: https://huggingface.co/Qwen/Qwen3.5-9B/blame/030a14dfda27146c6baf2fc8c5ac5e12039b4e25/LICENSE

[^1_3]: https://huggingface.co/Qwen/Qwen3.5-9B

[^1_4]: https://lmmarketcap.com/ai-for-arabic

[^1_5]: https://arxiv.org/pdf/2608.13580v1.pdf

[^1_6]: https://ollama.com/MHKetbi/Mistral-Small3.1-24B-Instruct-2503

[^1_7]: https://huggingface.co/unsloth/Mistral-Small-3.1-24B-Instruct-2503-GGUF

[^1_8]: https://www.llama.com/llama3_3/license/

[^1_9]: https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct

[^1_10]: https://ollama.com/library/command-r:35b-v0.1-q4_K_M/blobs/f0624a2393a5

[^1_11]: https://ollama.com/library/aya:35b-23-q4_1/blobs/f0624a2393a5

[^1_12]: https://ollama.com/library/aya-expanse:8b

[^1_13]: https://huggingface.co/datasets/csebuetnlp/xlsum/blob/main/README.md

[^1_14]: https://github.com/mbzuai-nlp/bactrian-x

[^1_15]: https://www.uaeaicenter.com/blog/falcon-models-tii

[^1_16]: https://lmmarketcap.com/model/falcon-h1-arabic-3b-instruct

[^1_17]: https://huggingface.co/datasets/tiiuae/alyah-emirati-benchmark

[^1_18]: https://huggingface.co/tiiuae/Falcon-H1-7B-Instruct

[^1_19]: https://huggingface.co/inception42/Jais-2-8B-Chat-GGUF/tree/main

[^1_20]: https://www.saudicompute.com/guides/how-to-deploy-allam/

[^1_21]: https://www.promptquorum.com/local-llms/best-saudi-arabic-local-llms-allam-2026

[^1_22]: https://ollama.com/iKhalid/ALLaM:7b

[^1_23]: https://ollama.com/iKhalid/ALLaM:7b-q4_K_M

[^1_24]: https://huggingface.co/QCRI/Fanar-1-9B

[^1_25]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/raw/main/README.md

[^1_26]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct

[^1_27]: https://ollama.com/mannix/gemma2-9b-simpo:q4_k_m/blobs/097a36493f71

[^1_28]: https://www.bearplex.com/ai/qwen-3

[^1_29]: https://github.com/Agentiq-OSC/QwenLM-Qwen3.5

[^1_30]: https://smeltcore.com/recipes/qwen3-5-27b-rtx-3090/

[^1_31]: https://huggingface.co/AaryanK/Qwen3.5-4B-GGUF

[^1_32]: https://github.com/ggml-org/llama.cpp/issues/20222

[^1_33]: https://github.com/ggml-org/llama.cpp/issues/21681

[^1_34]: https://registry.ollama.com/library/gemma2:9b-instruct-q5_0/blobs/097a36493f71

[^1_35]: https://ollama.com/library/mistral-small3.1:24b

[^1_36]: https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512-BF16

[^1_37]: https://awesomeagents.ai/models/ministral-3-14b/

[^1_38]: https://huggingface.co/mistralai/Ministral-3-14B-Base-2512

[^1_39]: https://pristren.com/blog/aya-23-multilingual-cohere/

[^1_40]: https://www.runlocalai.co/models/command-r-35b

[^1_41]: https://ai-tldr.dev/models/command-r-03-2024/

[^1_42]: https://ollama.com/library/command-r:35b/blobs/f0624a2393a5

[^1_43]: https://annota8.ai/blog/arabic-llm-benchmark-landscape-2026.html

[^1_44]: https://github.com/ppke-nlpg/AraSum

[^1_45]: https://arxiv.org/pdf/2210.13600.pdf

[^1_46]: https://huggingface.co/datasets/csebuetnlp/xlsum

[^1_47]: https://github.com/tensorflow/datasets/blob/master/tensorflow_datasets/summarization/multi_news.py

[^1_48]: https://www.tensorflow.org/datasets/catalog/multi_news

[^1_49]: https://github.com/Alex-Fabbri/Multi-News

[^1_50]: https://arxiv.org/pdf/2005.10070.pdf

[^1_51]: https://github.com/complementizer/wcep-mds-dataset

[^1_52]: https://arxiv.org/pdf/2305.01498.pdf

[^1_53]: https://ksa.ai/models/jais-2

[^1_54]: https://www.sciencedirect.com/science/article/abs/pii/S0306457322003284

[^1_55]: https://huggingface.co/datasets/drelhaj/EASC

[^1_56]: https://huggingface.co/datasets/MaLA-LM/MassiveSumm_long

[^1_57]: https://huggingface.co/datasets/CohereLabs/aya_dataset

[^1_58]: https://arxiv.org/html/2412.04277

[^1_59]: https://huggingface.co/datasets/CohereLabs/aya_collection

[^1_60]: https://huggingface.co/datasets/ClusterlabAi/InstAr-500k/blob/main/README.md

[^1_61]: https://huggingface.co/datasets/arbml/CIDAR

[^1_62]: https://github.com/SinaLab/Wojood-Fine

[^1_63]: https://sina.birzeit.edu/resources/

[^1_64]: https://aclanthology.org/2023.ranlp-1.51.pdf

[^1_65]: https://huggingface.co/datasets/asas-ai/ANERCorp/blob/main/README.md

[^1_66]: https://zenodo.org/records/18525113

[^1_67]: https://thesai.org/Downloads/Volume15No1/Paper_37-A_Review_of_Fake_News_Detection_Techniques.pdf

[^1_68]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11623204/

[^1_69]: https://arxiv.org/html/2609.25833v2

[^1_70]: https://huggingface.co/datasets/ChristopheKhalil/ARAFA

[^1_71]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10994337/

[^1_72]: https://aclanthology.org/2023.ranlp-1.3.pdf

[^1_73]: https://huggingface.co/datasets/bigIR/ar_cov19

[^1_74]: https://arxiv.org/html/2010.08768

[^1_75]: https://arxiv.org/html/2104.03090

[^1_76]: https://crisisnlp.qcri.org/requests_offers/

[^1_77]: https://github.com/openeventdata/arabic_event_gsr

[^1_78]: https://arxiv.org/pdf/2402.03177.pdf

[^1_79]: https://falconllm.tii.ae/falcon-h1-arabic.html

[^1_80]: https://www.tii.ae/insights/big-leap-uaes-homegrown-ai-tii-releases-new-falcon-language-models

[^1_81]: https://mentronx.com/learn/the-arabic-language-models

[^1_82]: https://www.ertas.ai/models/falcon-h1-arabic

[^1_83]: https://ollama.com/iKhalid/ALLaM:7b-q5_1

[^1_84]: https://www.tii.ae/news/abu-dhabis-tii-launches-falcon-h1-arabic-establishing-worlds-leading-arabic-ai-model

[^1_85]: https://aiwiki.ai/wiki/falcon

[^1_86]: https://voho.ai/blog/allam-saudi-arabic-llm

[^1_87]: https://huggingface.co/inceptionai/Jais-2-8B-Chat-GGUF

[^1_88]: https://huggingface.co/inception42/Jais-2-8B-Chat-GGUF

[^1_89]: https://www.ibm.com/docs/en/SSYOK8/wsj/analyze-data/assets/ALLaM-1-13b-instruct-model-card.pdf

[^1_90]: https://lmmarketcap.com/reports/allam

[^1_91]: https://vision2030.ai/analysis/humain-ai-model-partnerships/

[^1_92]: https://huggingface.co/Vionex-digital/Hakeem-7B?local-app=docker-model-runner

[^1_93]: https://huggingface.co/google/gemma-3-4b-it/resolve/refs%2Fpr%2F44/README.md?download=true

[^1_94]: https://huggingface.co/p-e-w/gemma-3-12b-it-heretic/raw/main/README.md

[^1_95]: https://huggingface.co/google/gemma-3-27b-it/resolve/main/README.md?download=true

[^1_96]: https://huggingface.co/jncraton/gemma-3-270m-ct2-int8/blob/main/README.md

[^1_97]: https://huggingface.co/kevinqz/Qwen3-0.6B-CoreAI/commit/e4b2cf333d366eade7537941b1d50e4b674a451d

[^1_98]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E

[^1_99]: https://huggingface.co/ojus1/Qwen3-1.7B-Instruct

[^1_100]: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-22M/resolve/main/LICENSE?download=true

[^1_101]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8

[^1_102]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Original/tree/main

[^1_103]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E/blob/main/LICENSE

[^1_104]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Original/blob/main/README.md

[^1_105]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8-Original/tree/main

[^1_106]: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct-Original

[^1_107]: https://huggingface.co/meta-llama/Llama-Guard-4-12B/blob/main/LICENSE

[^1_108]: https://huggingface.co/Qwen/Qwen3-30B-A3B-Thinking-2507/blame/ebba3ef8bebbbd7e247d636da599493cbf9d203b/README.md

[^1_109]: https://huggingface.co/Qwen/Qwen3-30B-A3B-Base/blame/main/README.md

[^1_110]: https://huggingface.co/Qwen/Qwen3-30B-A3B-Base

[^1_111]: https://huggingface.co/Qwen/Qwen3-30B-A3B/tree/main

[^1_112]: https://huggingface.co/Qwen/Qwen3-30B-A3B-MLX-6bit/blob/main/README.md

[^1_113]: https://huggingface.co/Andrewwwwww/aya-expanse-32b

[^1_114]: https://huggingface.co/duyntnet/aya-expanse-32b-imatrix-GGUF

[^1_115]: https://huggingface.co/CohereLabs/aya-expanse-8b/resolve/main/README.md?download=true

[^1_116]: https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Base-2503/blob/refs%2Fpr%2F3/README.md

[^1_117]: https://huggingface.co/jth01/aya-expanse-8b-5.0bpw-exl2

[^1_118]: https://huggingface.co/jebish7/aya-expanse-8b

[^1_119]: https://huggingface.co/CohereLabs/aya-expanse-8b/blob/refs%2Fpr%2F3/README.md

[^1_120]: https://huggingface.co/adamo1139/aya-expanse-32b-ungated

[^1_121]: https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/blob/8021984b33105de3b479a20bbf972f9c5924b401/README.md

[^1_122]: https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503

[^1_123]: https://featherless.ai/models/QCRI/Fanar-2-27B-Instruct

[^1_124]: https://silma.ai/arabic-llm

[^1_125]: https://silma.ai/arabic-ai-model

[^1_126]: https://dev.co/ai/llms/fanar-1-9b-instruct

[^1_127]: https://ollama.com/0ssamaak0/silma-v1:fp16

[^1_128]: https://ollama.com/0ssamaak0/silma-v1:q4_K_S

[^1_129]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/raw/e7018d46bc7b1bb2b129be73b7142d31ba06c92b/README.md

[^1_130]: https://silma.ai/arabic-large-language-models

[^1_131]: https://silma.ai/open-source-arabic-tts-models

[^1_132]: https://ollama.com/0ssamaak0/silma-v1:q4_0

[^1_133]: https://huggingface.co/blog/silma-ai/arabic-llm-models-list

[^1_134]: https://github.com/SILMA-AI/silma-tts

[^1_135]: https://ollama.com/0ssamaak0/silma-v1:q4_1

[^1_136]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0

[^1_137]: https://www.arxiv.org/abs/2210.13600

[^1_138]: https://www.scribd.com/document/913648975/2023-arabicnlp-1-8

[^1_139]: https://jqcsm.qu.edu.iq/index.php/journalcm/article/download/2562/1166/6843

[^1_140]: https://aclanthology.org/volumes/2023.arabicnlp-1/

[^1_141]: https://aclanthology.org/2023.arabicnlp-1.8.pdf

[^1_142]: https://github.com/csebuetnlp/xl-sum

[^1_143]: https://publikacio.uni-eszterhazy.hu/7595/1/AMI_57_from24to35.pdf

[^1_144]: https://www.scribd.com/document/923767247/s00521-024-10277-0

[^1_145]: https://aclanthology.org/people/jianfeng-he/

[^1_146]: https://pdfs.semanticscholar.org/3d7b/2fc8dcd8fe6ff9b113303d1a9e02511fe66b.pdf

[^1_147]: https://github.com/edahanoam/Awesome-Summarization-Datasets

[^1_148]: https://github.com/anonymous-717/Multi-Sum

[^1_149]: https://aclanthology.org/2021.emnlp-main.797.pdf

[^1_150]: https://huggingface.co/datasets/GEM/xlsum

[^1_151]: https://huggingface.co/datasets/GEM/xlsum/blob/main/xlsum.py

[^1_152]: https://huggingface.co/datasets/prithiraj22/multi_news

[^1_153]: https://arxiv.org/html/2212.09674v2

[^1_154]: https://github.com/danielvarab/massive-summ

[^1_155]: https://arxiv.org/html/1906.01749v3

[^1_156]: https://arxiv.org/html/2212.05740v1

[^1_157]: https://huggingface.co/docs/hub/en/repositories-licenses

[^1_158]: https://huggingface.co/datasets/tau/multi_news

[^1_159]: https://ar5iv.labs.arxiv.org/html/2305.08828

[^1_160]: https://arxiv.org/html/2305.14989

[^1_161]: https://huggingface.co/datasets?search=news

[^1_162]: https://pypi.org/project/summertime/

[^1_163]: https://cran.rstudio.com/web/dcmeta/wcep.xml

[^1_164]: https://huggingface.co/datasets/allenai/multinews_dense_mean

[^1_165]: https://huggingface.co/datasets/alexfabbri/multi_news

[^1_166]: https://arxiv.org/html/2004.05861v4

[^1_167]: https://aclanthology.org/events/wanlp-2021/

[^1_168]: https://arxiv.org/abs/2010.08768

[^1_169]: https://github.com/alaa-a-a/kawarith

[^1_170]: https://arxiv.org/html/2104.03090v2

[^1_171]: https://aclanthology.org/2022.lrec-1.344.pdf

[^1_172]: https://github.com/Rizzwan285/Multilingual-Classification-of-Urgent-Disaster-Response-Messages

[^1_173]: https://aclanthology.org/people/reem-suwaileh/

[^1_174]: https://aclanthology.org/2021.wanlp-1.5/

[^1_175]: https://huggingface.co/datasets/QCRI/HumAID-all

[^1_176]: https://www.mdpi.com/2306-5729/7/11/152?type=check_update\&version=1

[^1_177]: https://aclanthology.org/people/maram-hasanain/

[^1_178]: https://github.com/NNLP-IL/Arabic-Resources

[^1_179]: https://crisisnlp.qcri.org/medic/

[^1_180]: https://github.com/RingBDStack/SocialED

[^1_181]: https://aclanthology.org/2023.arabicnlp-1.84.pdf

[^1_182]: https://arxiv.org/html/2310.16153v1

[^1_183]: https://camel.abudhabi.nyu.edu/anercorp/

[^1_184]: https://arxiv.org/pdf/2302.03512.pdf

[^1_185]: https://aclanthology.org/C12-1132.pdf

[^1_186]: https://github.com/ay94/NER-datasets/blob/master/README.rst

[^1_187]: https://mail.etasr.com/index.php/ETASR/article/download/10205/4813

[^1_188]: https://huggingface.co/datasets/Optune/arabic_ner_wojood/blob/main/README.md

[^1_189]: https://arxiv.org/html/2310.17333v2

[^1_190]: https://huggingface.co/datasets/Optune/arabic_ner_wojood/raw/main/README.md

[^1_191]: https://aclanthology.org/2023.arabicnlp-1.89.pdf

[^1_192]: https://aclanthology.org/2022.lrec-1.387.pdf

[^1_193]: https://link.springer.com/article/10.1007/s00521-024-10949-x

[^1_194]: https://arxiv.org/pdf/2604.02209.pdf

[^1_195]: https://aclanthology.org/people/mohammed-khalilia/

[^1_196]: https://qspace.qu.edu.qa/handle/10576/49639

[^1_197]: https://d-nb.info/1341633934/34

[^1_198]: https://aclanthology.org/2021.wanlp-1.26.pdf

[^1_199]: https://peerj.com/articles/cs-2432.pdf

[^1_200]: https://arxiv.org/html/2609.25833v1

[^1_201]: https://huggingface.co/datasets/arbml/AraFacts

[^1_202]: https://www.scitepress.org/Papers/2026/143432/143432.pdf

[^1_203]: https://aclanthology.org/people/tamer-elsayed/

[^1_204]: https://aclanthology.org/2022.osact-1.2.pdf

[^1_205]: https://www.research.unipd.it/retrieve/5e204ac3-c64a-4b48-bc7b-27f93d3ad2e2/paper-29.pdf

[^1_206]: https://aclanthology.org/people/zien-sheikh-ali/unverified/

[^1_207]: https://github.com/MammasseAmine/GAFND

[^1_208]: https://aclanthology.org/2024.arabicnlp-1.44.pdf

[^1_209]: https://arxiv.org/html/2402.17478v1

[^1_210]: https://huggingface.co/datasets/Yasbok/Alpaca_arabic_instruct

[^1_211]: https://aclanthology.org/2025.arabicnlp-main.26.pdf

[^1_212]: https://www.bayanatlabs.com/products/align

[^1_213]: https://huggingface.co/datasets/FreedomIntelligence/Alpaca-Arabic-GPT4

[^1_214]: https://ar5iv.labs.arxiv.org/html/2402.03177

[^1_215]: https://www.bayanatlabs.com/ar/insights/arabic-preference-data

[^1_216]: https://github.com/OsamaALHajj/awesome-arabic-ai

[^1_217]: https://www.bayanatlabs.com/insights

[^1_218]: https://github.com/ARBML/CIDAR

[^1_219]: https://huggingface.co/datasets/MBZUAI/Bactrian-X

[^1_220]: https://huggingface.co/datasets/MBZUAI/Bactrian-X/blame/1b6fb96ec6b4e80cefbfb6f4fdd370f6b4ea6a12/README.md

[^1_221]: https://huggingface.co/QCRI/Fanar-1-9B-Instruct/blob/e7018d46bc7b1bb2b129be73b7142d31ba06c92b/README.md

[^1_222]: https://ar5iv.labs.arxiv.org/html/2308.16149

[^1_223]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct

[^1_224]: https://awesome.papernotes.org/en/era4_foundation_models/2021_lora/

[^1_225]: https://pablocaro.es/en/unsloth-docs

[^1_226]: https://lightning.ai/pages/community/lora-insights/

[^1_227]: https://arxiv.org/html/2508.02932v2

[^1_228]: https://ai-papers.xuzou.cn/papers/qlora_2023

[^1_229]: https://unsloth.ai/docs/jp/meru/fine-tuning-for-beginners/unsloth-requirements

[^1_230]: https://docs.unsloth.ai/get-started/beginner-start-here/unsloth-requirements.md

[^1_231]: https://unsloth.ai/docs/fr/commencer/fine-tuning-for-beginners/unsloth-requirements

[^1_232]: https://www.amd.com/en/developer/resources/technical-articles/accelerate-llms-locally-on-amd-ryzen-ai-npu-and-igpu.html

[^1_233]: https://inference.net/content/lora-fine-tuning/

[^1_234]: https://airbyte.com/data-engineering-resources/how-to-train-llm-with-your-own-data

[^1_235]: https://www.mintlify.com/Shubhamsaboo/awesome-llm-apps/advanced/fine-tuning

[^1_236]: https://arxiv.org/html/2505.06841

[^1_237]: https://arxiv.org/abs/2305.14314

[^1_238]: https://arxiv.org/html/2402.10462v1

[^1_239]: https://arxiv.org/pdf/2310.10627v1.pdf

[^1_240]: https://www.linkedin.com/posts/shubhendu-sharma_orpo-simpo-dpo-activity-7448822207645999104-CHpF

[^1_241]: https://arxiv.org/html/2604.03173

[^1_242]: https://aclanthology.org/2026.findings-acl.1161.pdf

[^1_243]: https://arxiv.org/pdf/2412.18004.pdf

[^1_244]: https://arxiv.org/html/2506.17585v2

[^1_245]: https://www.nature.com/articles/s41598-025-31075-1

[^1_246]: https://arxiv.org/html/2603.18911

[^1_247]: https://web3.arxiv.org/pdf/2601.04212

[^1_248]: https://arxiv.org/html/2311.03731v2

[^1_249]: https://arxiv.org/html/2510.11394v1

[^1_250]: https://web3.arxiv.org/pdf/2510.09915

[^1_251]: https://aclanthology.org/2024.naacl-long.216.pdf

[^1_252]: https://arxiv.org/html/2405.02228v3

[^1_253]: https://machinelearning.apple.com/research/faithful-llm-summarization

[^1_254]: https://www.semanticscholar.org/paper/TRUE:-Re-evaluating-Factual-Consistency-Evaluation-Honovich-Aharoni/c69f9a5185b4c29525bedb2dcc79d20b42c14cc6

[^1_255]: https://arxiv.org/pdf/2402.13758.pdf

[^1_256]: https://arxiv.org/pdf/2112.08542.pdf

[^1_257]: https://arxiv.org/html/2404.06579v1

[^1_258]: https://www.ijcs.net/ijcs/index.php/ijcs/article/download/3190/119

[^1_259]: https://github.com/salesforce/QAFactEval

[^1_260]: https://aclanthology.org/anthology-files/anthology-files/pdf/W/W19/W19-7406.pdf

[^1_261]: https://aclanthology.org/2023.acl-long.634.pdf

[^1_262]: https://aclanthology.org/attachments/2026.lrec-1.819.OptionalSupplementaryMaterial.pdf

[^1_263]: https://www.tandfonline.com/doi/full/10.1080/23311983.2023.2185968

[^1_264]: https://aclanthology.org/2021.icnlsp-1.20.pdf

[^1_265]: https://aclanthology.org/2026.lrec-1.819.pdf

[^1_266]: https://huggingface.co/yzha/AlignScore

[^1_267]: https://huggingface.co/yzha/AlignScore/raw/main/README.md

[^1_268]: https://qwen.readthedocs.io/en/latest/\_sources/run_locally/llama.cpp.md.txt

[^1_269]: https://qwen.readthedocs.io/en/latest/run_locally/llama.cpp.html

[^1_270]: https://qwen.readthedocs.io/en/stable/run_locally/llama.cpp.html

[^1_271]: https://huggingface.co/Qwen/Qwen3-14B-GGUF

[^1_272]: https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF

[^1_273]: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF

[^1_274]: https://github.com/qwenLM/qwen3

[^1_275]: https://huggingface.co/Qwen/Qwen3-1.7B-GGUF

[^1_276]: https://huggingface.co/unsloth/Qwen3-14B-GGUF

[^1_277]: https://qwen.readthedocs.io/en/latest/quantization/llama.cpp.html

[^1_278]: https://docs.servicestack.net/ai-server/llama-server

[^1_279]: https://huggingface.co/Qwen/Qwen3-32B-GGUF

[^1_280]: https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF

[^1_281]: https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md

[^1_282]: https://github.com/crc-org/llama.cpp/blob/main/docs/multimodal.md

[^1_283]: https://huggingface.co/unsloth/Falcon-H1-0.5B-Instruct-GGUF

[^1_284]: https://www.linkedin.com/posts/blake-tindol-a17121ba_a-world-class-arabic-language-model-just-activity-7467666434437857280-mWtx

[^1_285]: https://github.com/tiiuae/Falcon-H1/blob/main/docs/deployment.md

[^1_286]: https://huggingface.co/blog/tiiuae/falcon-h1-arabic

[^1_287]: https://huggingface.co/tiiuae/Falcon-H1-3B-Base/commit/8817039c71a0a7a48c749008e44219b017b69390

[^1_288]: https://github.com/tiiuae/falcon-h1

[^1_289]: https://github.com/tiiuae/llama.cpp-Falcon-H1

[^1_290]: https://falcon-lm.github.io/tutorials/falcon-h1/

[^1_291]: https://www.promptquorum.com/ja/local-llms/best-arabic-local-llms-2026

[^1_292]: https://github.com/ggml-org/llama.cpp/blob/7e8324f5/src/llama-arch.h

[^1_293]: https://falcon-lm.github.io/tutorials/falcon-h1r/

[^1_294]: https://huggingface.co/tiiuae/collections

[^1_295]: https://github.com/ggml-org/llama.cpp/blob/master/src/llama-arch.h

[^1_296]: https://github.com/ggml-org/llama.cpp/issues/13681

[^1_297]: https://bonndoc.ulb.uni-bonn.de/xmlui/bitstream/handle/20.500.11811/13751/2025_LLM_Hardware.pdf?sequence=3

[^1_298]: https://docs.mistral.ai/resources/cookbooks/concept-deep-dive-quantization-methods-gguf

[^1_299]: https://arxiv.org/html/2601.14277

[^1_300]: https://arxiv.org/html/2603.26770v1

[^1_301]: https://github.com/maystudios/claude-skills/blob/main/llama-cpp/references/quantization-guide.md

[^1_302]: https://github.com/leeroopedia/workflow-ggml-org-llama-cpp-model-quantization

[^1_303]: https://github.com/huggingface/skills/blob/main/skills/huggingface-local-models/references/quantization.md

[^1_304]: https://github.com/NousResearch/hermes-agent/blob/main/optional-skills/mlops/inference/llama-cpp/references/quantization.md

[^1_305]: https://ggml-org-llama-cpp.mintlify.app/models/quantizing-models

[^1_306]: https://www.actian.com/blog/developer/which-quantization-level-should-you-use-for-edge-llm-deployment/

[^1_307]: https://manpages.debian.org/unstable/llama.cpp-tools/llama-quantize.1.en.html

[^1_308]: https://github.com/noonghunna/club-3090/blob/master/docs/QUANTIZATION.md

[^1_309]: https://www.sitepoint.com/quantization-explained-consumer-gpu/

[^1_310]: https://github.com/crc-org/llama.cpp/blob/main/tools/quantize/README.md

[^1_311]: https://github.com/ggml-org/llama.cpp/tree/master/tools/quantize

[^1_312]: https://www.tii.ae/insights/uae-built-arabic-ai-model-outperforms-systems-twice-its-size

[^1_313]: https://www.tii.ae/insights/falcon-h1-arabic-redefining-ai-arabic-language-dr-hakim-hacid

[^1_314]: https://aiwiki.ai/wiki/falcon/raw

[^1_315]: https://arabicagenticai.com/guides/getting-started-arabic-llms/

[^1_316]: https://arabicagenticai.com/arabic-llms/falcon-arabic/

[^1_317]: https://falcon-lm.github.io/blog/

[^1_318]: https://falcon-lm.github.io/blog/falcon-h1/

[^1_319]: https://nexgpu.net/en/models/falcon/

[^1_320]: https://arabicagenticai.com/companies/tii/

[^1_321]: https://www.sgon.ai/articles/falcon-inflection-arabic-ai-2026

[^1_322]: https://recatools.com/ai-directory/falcon-tii/

[^1_323]: https://falcon-lm.github.io/blog/falcon-h1-arabic/

[^1_324]: https://www.lodj.ma/attachment/2748562/

[^1_325]: https://huggingface.co/tiiuae

[^1_326]: https://falconllm.tii.ae/falcon-h1.html

[^1_327]: https://nextomoro.com/falcon/

[^1_328]: https://systems-analysis.info/eng/Falcon\_(language_model_family)

[^1_329]: https://huggingface.co/tiiuae/papers

[^1_330]: https://falconllm.tii.ae/

[^1_331]: https://falconllm.tii.ae/falcon-models.html

[^1_332]: https://arxiv.org/pdf/2604.03395.pdf

[^1_333]: https://dev.to/azrty/best-arabic-llm-for-business-jais-2-falcon-or-gpt-5-49gj

[^1_334]: https://huggingface.co/inception42/Jais-2-70B-Chat

[^1_335]: https://huggingface.co/inception42/jais-family-30b-8k-chat

[^1_336]: https://huggingface.co/inceptionai/jais-family-590m-chat

[^1_337]: https://huggingface.co/inception42/jais-family-590m-chat

[^1_338]: https://huggingface.co/inception42/jais-family-13b-chat

[^1_339]: https://ar5iv.labs.arxiv.org/html/2608.13580

[^1_340]: https://recatools.com/ai-directory/jais-inception/

[^1_341]: https://systems-analysis.info/eng/Jais\_(language_model)

[^1_342]: https://huggingface.co/inceptionai/jais-13b-chat

[^1_343]: https://huggingface.co/inception42/Jais-2-70B-Chat-GGUF

[^1_344]: https://huggingface.co/inception42/Jais-2-8B-Chat

[^1_345]: https://huggingface.co/inception42/Jais-2-8B-Chat/tree/main

[^1_346]: https://jais.pages.dev/assets/tech-paper/Jais_2_family.pdf

[^1_347]: https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/jais2.md

[^1_348]: https://www.linkedin.com/posts/avraham-sheinin_after-over-a-year-of-intense-work-im-thrilled-activity-7404561364096266240-j6yN

[^1_349]: https://huggingface.co/inception42

[^1_350]: https://arabicagenticai.com/arabic-llms/jais-2-deep-analysis/

[^1_351]: https://www.cerebras.ai/blog/jais2

[^1_352]: https://www.cerebras.ai/press-release/cerebras-delivers-end-to-end-training-and-inference-for-jais-2-the-world-s-leading-open-arabic

[^1_353]: https://github.com/Omar0042/allam-arabic-dialects/blob/main/README.md

[^1_354]: https://cicada.solutions/blog/2026-06-22-arabic-open-models-when-to-self-host

[^1_355]: https://ollama.com/ALIENTELLIGENCE/governmentagencies:latest/blobs/0ba8f0e314b4

[^1_356]: https://www.ollama.com/ALIENTELLIGENCE/searchfund:latest/blobs/0ba8f0e314b4

[^1_357]: https://chimitdorzhi.tech/en/ii-modeli/allam/

[^1_358]: https://ollama.com/ALIENTELLIGENCE/lawfirm:latest/blobs/0ba8f0e314b4

[^1_359]: https://slm.expert/models/allam-7b-instruct-preview/

[^1_360]: https://ollama.com/wesamhamad/qu-llm-assistant-allam

[^1_361]: https://huggingface.co/itsdevruba/midad-allam-7b

[^1_362]: https://huggingface.co/mabaashar/allam-7b-arabic-mental-health-lora

[^1_363]: https://huggingface.co/wesam3/qu-llm-assistant-allam?local-app=ollama

[^1_364]: https://huggingface.co/rahimdzx/AraCode-7B-Full

[^1_365]: https://www.llmreference.com/model/fanar-2-27b-instruct

[^1_366]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/commit/074005040e9c3511b1c43b4298bef09908285534

[^1_367]: https://www.llmreference.com/researcher/fanar

[^1_368]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/blame/main/README.md

[^1_369]: https://recatools.com/ai-directory/fanar-ai/

[^1_370]: https://www.emergentmind.com/topics/fanar-1-9b

[^1_371]: https://www.emergentmind.com/topics/fanar-1-9b-instruct.md

[^1_372]: https://megatek.ai/pcm/model/fanar/

[^1_373]: https://huggingface.co/QCRI/Fanar-2-27B-Instruct/tree/main

[^1_374]: https://aiinarabia.com/tools/arabic-llm-tracker/

[^1_375]: https://megatek.ai/en/model/fanar/

[^1_376]: https://www.promptquorum.com/local-llms/best-arabic-local-llms-2026

[^1_377]: https://llmrun.dev/model/qcri-fanar-2-27b-instruct

[^1_378]: https://aclanthology.org/anthology-files/pdf/arabicnlp/2025.arabicnlp-main.21.pdf

[^1_379]: https://www.arxiv.org/pdf/2510.27543.pdf

[^1_380]: https://arxiv.org/pdf/2609.13980.pdf

[^1_381]: https://huggingface.co/silma-ai/SILMA-9B-Instruct-v1.0/blame/main/README.md

[^1_382]: https://arxiv.org/pdf/2602.17054.pdf

[^1_383]: https://aclanthology.org/people/afrah-altamimi/unverified/

[^1_384]: https://arxiv.org/html/2511.14295

[^1_385]: https://silma.ai/labs

[^1_386]: https://silma.ai/papers/abbl-an-advanced-benchmark-and-leaderboard-for-comprehensive-evaluation-of-arabic-language-models

[^1_387]: https://aclanthology.org/2025.arabicnlp-main.21.pdf

[^1_388]: https://github.com/google-gemma/gemma-translator/blob/main/LICENSE

[^1_389]: https://github.com/google-gemma/awesome-gemma/blob/main/LICENSE

[^1_390]: https://ai.google.dev/gemma/terms-archive/terms_04_01_24

[^1_391]: https://ai.google.dev/gemma/terms-archive/terms_02_21_24

[^1_392]: https://ai.google.dev/gemma/prohibited_use_policy

[^1_393]: https://ollama.com/library/gemma:2b/blobs/097a36493f71

[^1_394]: https://ollama.com/library/codegemma:7b-code/blobs/097a36493f71

[^1_395]: https://ai.google.dev/gemma/terms-archive

[^1_396]: https://ollama.com/library/gemma3:latest/blobs/dd084c7d92a3

[^1_397]: https://ollama.com/neoali/gemma3-8k:4b/blobs/dd084c7d92a3

[^1_398]: https://ollama.com/library/gemma3:4b/blobs/dd084c7d92a3

[^1_399]: https://ollama.com/library/gemma3:12b/blobs/dd084c7d92a3

[^1_400]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/open-models/use-gemma

[^1_401]: https://ai.google.dev/gemma/terms

[^1_402]: https://github.com/google-deepmind/gemma/blob/main/LICENSE

[^1_403]: https://vdf.ai/blog/qwen-on-premises-enterprise-deployment/

[^1_404]: https://innfactory.ai/en/ai-models/qwen/

[^1_405]: https://d-central.tech/ai/model/qwen-3/

[^1_406]: https://qwen-3.com/en

[^1_407]: https://qwenlm.github.io/blog/qwen3/

[^1_408]: https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/

[^1_409]: https://docs.clore.ai/guides/language-models/qwen35

[^1_410]: https://github.com/phlx0/awesome-open-weight-models/blob/main/README.md

[^1_411]: https://github.com/phlx0/awesome-open-weight-models

[^1_412]: https://llmconfigurator.com/en/blog/complete-qwen-guide

[^1_413]: https://databubble.co/news/qimma-a-quality-first-arabic-llm-leaderboard

[^1_414]: https://graphometer.ai/qwen35/

[^1_415]: https://www.morphllm.com/qwen-3-5

[^1_416]: https://ai.tekin.cn/en/blog/qwen3-5-hybrid-attention-gated-deltanet-moe-deployment

[^1_417]: https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/LICENSE

[^1_418]: https://github.com/liuyanjing-dev/Qwen3.5

[^1_419]: https://insiderllm.com/pdfs/llamacpp-vs-ollama-vs-vllm.pdf

[^1_420]: https://github.com/taotaoxiaozhi705-web/MoE4All/blob/main/docs/qwen35.md

[^1_421]: https://meta.coolface.org/models/empero-ai/Qwen3.8-4B-Distill-GGUF

[^1_422]: https://ollama.com/treyleo16/qwen

[^1_423]: https://ollama.com/SimonPu/Mistral-Small-3.1

[^1_424]: https://ollama.com/library/llama3.3:70b-instruct-q8_0/blobs/bc371a43ce90

[^1_425]: https://ollama.com/krith/llama-3.3-70b-instruct:IQ3_M/blobs/bfc03d63cd65

[^1_426]: https://www.lmstudio.ai/models/ministral

[^1_427]: https://registry.ollama.com/library/ministral-3:14b-cloud

[^1_428]: https://ollama.com/library/llama3.3:latest/blobs/bc371a43ce90

[^1_429]: https://www.together.ai/models/ministral-3-14b-instruct-2512

[^1_430]: https://ollama.com/library/command-r:35b-08-2024-q4_1/blobs/945eaa8b1428

[^1_431]: https://d-central.tech/data/local-llm-model-database/

[^1_432]: https://ollama.com/library/aya-expanse

[^1_433]: https://www.ertas.ai/models/command-r

[^1_434]: https://www.local-llm.net/models/command-r/

[^1_435]: https://uncensoredhub.ai/best/best-uncensored-llms

[^1_436]: https://huggingface.co/jukofyork/command-r-35b-writer-v2/blob/29692830c3ed09ed806a8d78c99396096825b3ca/README.md

[^1_437]: https://llm-explorer.com/model/QCRI%2FFanar-1-9B,5GZdxTtA4C6V462cNHdF9d

[^1_438]: https://ollama.com/mannix/gemma2-9b-simpo:q4_0/blobs/097a36493f71

[^1_439]: https://www.arxiv.org/pdf/2407.15390.pdf

[^1_440]: https://huggingface.co/datasets/ahmedelsayed/xlsum-arabic

[^1_441]: https://github.com/lmmlzn/Awesome-LLMs-Datasets/blob/main/README.md

[^1_442]: https://www.kaggle.com/datasets/yashdogra/xlsum-punjabi

[^1_443]: https://huggingface.co/datasets/shannonnonshan/xlsum/blob/main/xlsum.json

[^1_444]: https://huggingface.co/datasets/csebuetnlp/xlsum/blob/main/xlsum.py

[^1_445]: https://huggingface.co/datasets/SEACrowd/xl_sum

[^1_446]: https://huggingface.co/csebuetnlp/mT5_multilingual_XLSum/blame/c21523450d1e28cd5499671586bd674cfede98c4/README.md

[^1_447]: https://github.com/ElsebaiyMohamed/ArATs

[^1_448]: https://metatext.io/datasets/essex-arabic-summaries-corpus-(easc)

[^1_449]: https://github.com/Mohammad-ALADDASI/arabic-text-summarisation-seq2seq

[^1_450]: http://acta.bibl.u-szeged.hu/88771/1/msznykonf_021_041-055.pdf

[^1_451]: https://aclanthology.org/2021.ranlp-1.74.pdf

[^1_452]: https://arxiv.org/html/2004.14900

[^1_453]: https://aclanthology.org/2025.naacl-long.372.pdf

[^1_454]: https://arxiv.org/html/2312.14542

[^1_455]: https://www.kaggle.com/datasets/sbhatti/news-summarization

[^1_456]: https://cran.rstudio.com/web/packages/wcep/index.html

[^1_457]: https://huggingface.co/datasets

[^1_458]: https://arxiv.org/pdf/2203.01769v1.pdf

[^1_459]: https://www.kaggle.com/datasets/divyanshukunwar/peersum-open-review-dataset-direct-replies

[^1_460]: https://github.com/danieldeutsch/sacrerouge/blob/master/doc/datasets/multinews.md

[^1_461]: https://arxiv.org/html/2006.08748v1

[^1_462]: https://aclanthology.org/2021.findings-acl.299.pdf

[^1_463]: https://scisimple.com/es/articles/2025-11-21-automatizando-la-generacion-de-meta-revisiones-para-articulos-cientificos--a3d614q

[^1_464]: https://www.academia.edu/102175867/AROT_COV23_A_DATASET_OF_500K_ORIGINAL_ARA_BIC_TWEETS_ON_COVID_19

[^1_465]: https://www.academia.edu/70257725/COVID_19_and_Arabic_Twitter_How_can_Arab_World_Governments_and_Public_Health_Organizations_Learn_from_Social_Media

[^1_466]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9748819/

[^1_467]: https://arxiv.org/pdf/2605.22447.pdf

[^1_468]: https://biblio.cerist.dz/hrbdonf5214/articles/00000000000000622466000000_2.pdf

[^1_469]: https://arxiv.org/pdf/2605.23325v1.pdf

[^1_470]: https://aclanthology.org/2022.osact-1.8.pdf

[^1_471]: https://aclanthology.org/2023.acl-long.901.pdf

[^1_472]: https://arxiv.org/pdf/2210.04573v3.pdf

[^1_473]: https://arxiv.org/html/2107.12360v1

[^1_474]: https://onlinelibrary.wiley.com/doi/10.1002/asi.21090

[^1_475]: https://arxiv.org/html/2103.06678

[^1_476]: https://arxiv.org/pdf/2310.16153v1.pdf

[^1_477]: https://arxiv.org/html/2407.09936v1

[^1_478]: https://huggingface.co/datasets?other=ArabicNER

[^1_479]: https://scholarworks.aub.edu.lb/server/api/core/bitstreams/b73afd4c-e968-47d8-adda-789b36935084/content

[^1_480]: https://sina.birzeit.edu/wojood/

[^1_481]: https://huggingface.co/SinaLab/ArabicNER-Wojood/tree/main

[^1_482]: https://aclanthology.org/people/mustafa-jarrar/

[^1_483]: https://arxiv.org/html/2205.09651v2

[^1_484]: https://ceur-ws.org/Vol-3740/paper-57.pdf

[^1_485]: https://easychair.org/publications/preprint/GJHM/download

[^1_486]: https://home.ipipan.waw.pl/p.przybyla/bib/clef-2024.pdf

[^1_487]: https://checkthat.gitlab.io/clef2024/pdf/CLEF_CheckThat_2024_Task3.pdf

[^1_488]: https://github.com/huggingface/datasets/commit/4049f5934faf0cdee887bcd9bd6ac6b9d0ef3e28

[^1_489]: https://arxiv.org/html/2301.05863v1

[^1_490]: https://github.com/orgs/ARBML/repositories

[^1_491]: https://aclanthology.org/people/khalid-almubarak/unverified/

[^1_492]: https://ar5iv.labs.arxiv.org/html/2503.15003

[^1_493]: https://arxiv.org/html/2407.02147v2

[^1_494]: https://huggingface.co/datasets/SEACrowd/bactrian_x

[^1_495]: https://huggingface.co/datasets/ISLAM-PO/arabic-to-code-8-langs-3m

[^1_496]: https://huggingface.co/datasets/M-A-D/Mixed-Arabic-Datasets-Repo/raw/82209cd2e84ec762f1cec4f1dee2d1dd346503c8/README.md

[^1_497]: https://www.bayanatlabs.com/insights/arabic-preference-data

[^1_498]: https://huggingface.co/sovythos/Sovythos-303M-Instruct

[^1_499]: https://huggingface.co/datasets/ClusterlabAi/InstAr-500k

[^1_500]: https://huggingface.co/datasets/2A2I/Arabic_Aya

[^1_501]: https://sophon.at/tools/aya-dataset

[^1_502]: https://huggingface.co/datasets/CohereLabs/aya_collection_language_split

[^1_503]: https://huggingface.co/datasets/CohereLabs/aya_evaluation_suite/raw/950b38bc28c99606f00ba47db3ccb062f7108a2d/README.md

[^1_504]: https://github.com/lmmlzn/Awesome-LLMs-Datasets

[^1_505]: https://huggingface.co/datasets/riotu-lab/ArabicQA_2.1M

[^1_506]: https://huggingface.co/docs/hub/datasets-cards

[^1_507]: https://vantaige.io/ai-tool/falcon

[^1_508]: https://aws.amazon.com/blogs/machine-learning/tii-falcon-h1-models-now-available-on-amazon-bedrock-marketplace-and-amazon-sagemaker-jumpstart/

[^1_509]: https://lmmarketcap.com/model/falcon-h1-arabic-34b-instruct

[^1_510]: https://github.com/crc-org/llama.cpp

[^1_511]: https://github.com/elizaOS/llama.cpp

[^1_512]: https://github.com/john-rocky/apple-silicon-llm-bench

[^1_513]: https://arabicagenticai.com/arabic-llms/jais/

[^1_514]: https://huggingface.co/tiiuae/falcon-7b-instruct

[^1_515]: https://rohitai.com/blog/falcon-emirati-7b-dialect-specialized-arabic-model

[^1_516]: https://lmmarketcap.com/model/falcon-h1-arabic-7b-instruct

[^1_517]: https://lmmarketcap.com/model/falcon-mamba-7b-instruct

[^1_518]: https://huggingface.co/brainiac-origin/jais-chat-30b-8bit

[^1_519]: https://www.llmreference.com/model/jais-30b

[^1_520]: https://huggingface.co/datasets/qimma/leaderboard-requests/commit/38f2ebb08bbf918b2c08431f314d0485c26908f2

[^1_521]: https://ollama.com/library/codellama:7b-instruct-q4_0/blobs/8c17c2ebb0ea

[^1_522]: https://ollama.com/library/llama2:7b-text-q5_K_S/blobs/8c17c2ebb0ea

[^1_523]: https://huggingface.co/meta-llama/CodeLlama-34b-hf

[^1_524]: https://ollama.com/olfh/teuken-7b-instruct-commercial-v0.4:7b-instruct-fp16/blobs/cfc7749b96f6

[^1_525]: https://ollama.com/fl0id/teuken-7b-instruct-commercial-v0.4/blobs/bd78e0b95b2e

[^1_526]: https://ollama.com/olfh/teuken-7b-instruct-commercial-v0.4:7b/blobs/cfc7749b96f6

[^1_527]: https://botmemo.com/middle-east-ai-uae-saudi-arabia

[^1_528]: https://ollama.com/library/mistral:7b/blobs/43070e2d4e53

