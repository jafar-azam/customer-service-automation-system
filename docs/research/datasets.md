
# Act as a machine-learning data researcher. Conduct deep, exhaustive research to find the best publicly available datasets for an AI customer-support system, and verify every claim against primary sources.

CONTEXT
The system is a bilingual (Arabic and English) customer-support assistant for businesses with maintenance contracts (IT, software, and technical services). It uses retrieval-augmented generation: it retrieves solutions from a knowledge base and answers only from them, escalating to a human agent on WhatsApp when it cannot resolve a problem. Customers can type or speak; Arabic users are mainly from Lebanon (Levantine dialect), plus Modern Standard Arabic. The project will be published as open source on GitHub, so dataset licenses must allow redistribution of derived data, and ideally commercial use.

The current seed data has these columns: CustomerInteractionRawText, AgentAssignedTopic, TopicCategory, ResolutionText, Priority, SentimentScore, SatisfactionRating, TimeToResolution, FollowUpRequired. Good datasets can be mapped into this schema.

FIND DATASETS IN FIVE CATEGORIES

1. Knowledge-base seed data: customer-support conversations or FAQ pairs that contain BOTH a customer problem AND a resolution (technical support, IT help desk, software, telecom, devices, accounts, billing).
2. Evaluation data: question–answer pairs or support tickets with ground-truth resolutions, usable to measure retrieval accuracy and answer correctness, plus examples of unanswerable or out-of-scope questions (to test escalation).
3. Intent classification: labeled customer-request intents, especially multilingual sets that include Arabic.
4. Arabic language: Arabic or Levantine/Lebanese-dialect customer-service text, dialogue, or FAQ data; Arabic–English code-switched text (including Arabizi/Franco-Arabic written in Latin letters, common in Lebanon).
5. Arabic speech: transcribed Arabic speech datasets, ideally including Levantine dialect, for evaluating speech-to-text.

Leads to investigate and verify (do not assume these are suitable; check each, and look well beyond them): Bitext customer-support datasets, the Twitter Customer Support corpus (TWCS), ABCD (Action-Based Conversations Dataset), MultiWOZ, Taskmaster, Banking77, CLINC150, Amazon MASSIVE, the Ubuntu Dialogue Corpus, Mozilla Common Voice (Arabic), the MGB Arabic speech challenges, and MADAR / NADI Arabic dialect resources. Search Hugging Face, Kaggle, Papers with Code, GitHub, the Linguistic Data Consortium, ELRA, Mendeley Data, Zenodo, and recent academic papers (ACL Anthology, arXiv) from 2020 onward.

FOR EACH DATASET, REPORT (verified from the dataset card, license file, or paper, with a citation link)

- Name, publisher, direct link, year, and latest version
- Size (rows, conversations, or hours of audio) and file format
- Languages and dialects; whether real or synthetic
- Domain and whether it contains resolutions/answers, not only questions
- Exact license, and three explicit yes/no/unclear answers: commercial use allowed, redistribution of derived data allowed, attribution required
- Personal data: does it contain names, phone numbers, emails, or account details? Is it anonymized?
- Known quality issues (noise, duplication, bias, outdated content, restrictions from platform terms of service, e.g., data scraped from social media)
- Which of the five categories it serves, and how it maps to the schema above
- A suitability score from 1 to 10 for this specific project, with a one-sentence justification

OUTPUT

1. A comparison table of all datasets found (at least 25 candidates, if they exist).
2. A recommended top selection: the best 2–3 datasets for each of the five categories, with reasons.
3. Gaps: what good data does NOT exist publicly (especially Lebanese-dialect support conversations), stated honestly.
4. A strategy to fill the gaps: synthetic data generation with an LLM (how to keep it realistic and diverse, how to avoid copying copyrighted material, how to validate quality with human review), translation of English data into Arabic and Levantine dialect (risks and quality checks), and collecting real data responsibly from a business with consent and anonymization.
5. A data-preparation plan: cleaning, deduplication, PII removal, mapping to the schema, splitting into knowledge base vs. evaluation sets without leakage, and the minimum dataset sizes recommended for a credible demo and a credible evaluation.
6. A licensing summary: which recommended datasets are safe to include in a public GitHub repository, which can only be used privately, and which must be avoided.

RULES

- Cite a source for every factual claim. Prefer the official dataset card, license file, or original paper over blog posts.
- If a license or detail cannot be verified, write "unverified" rather than guessing.
- Do not invent datasets, links, sizes, or licenses.
- Flag any dataset whose link is dead or which has been withdrawn.

The strongest combination is **TechQA + ABCD + Bitext** for answer-bearing seed data, **TechQA + doc2dial + CLINC150** for evaluation and escalation, **ArBanking77 + MASSIVE + CLINC150** for intent classification, and **Multi3WOZ + MADAR-Beirut + purpose-built Lebanese synthetic data** for Arabic coverage. No verified public dataset fully matches real Lebanese maintenance-support conversations with resolutions, permissive commercial redistribution, speech, Arabizi, and operational fields such as resolution time and satisfaction.

# Dataset research report

## Reading the table

- **C/R/A** means: commercial use allowed / redistribution of derived data allowed / attribution or notice required.
- **Y-SA** means redistribution is allowed but ShareAlike applies.
- **U** means unverified or materially ambiguous.
- Categories are **KB** knowledge-base seed, **EV** evaluation, **IC** intent classification, **AR** Arabic language, and **SP** Arabic speech.
- Mapping codes are **Raw** `CustomerInteractionRawText`, **Topic** `AgentAssignedTopic`, **Cat** `TopicCategory`, and **Res** `ResolutionText`.
- A dataset can be useful for benchmarking without being suitable for inclusion in a public repository.


## Candidate inventory

| Dataset | Year/version and size | Language, source and domain | Answers or resolutions | License; C/R/A | Privacy and limitations | Use, mapping and score |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| [Bitext Customer Support LLM Dataset](https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset) | 2024; no numbered release verified; 26,872 CSV rows | English; hybrid synthetic/NLG customer-service requests; 27 intents and 11 categories | **Yes**—each instruction has a generated response, although some responses merely invite clarification | CDLA-Sharing-1.0; **Y/Y under license/Y** | Entity placeholders reduce PII risk; repetitive templates, verbosity and synthetic phrasing require filtering | KB, IC; `instruction→Raw`, `intent→Topic`, `category→Cat`, `response→Res`; **8/10—excellent schema fit but synthetic and not technical enough** |
| [ABCD](https://github.com/asappresearch/abcd) | 2021, v1.1; over 10,000 dialogues; compressed JSON | English; human role-play with fictional e-commerce customers; 55 subflow intents and action sequences | **Yes**—agent utterances, actions, guidelines and task-success flows encode resolution procedures | [MIT](https://github.com/asappresearch/abcd/blob/master/LICENSE); **Y/Y/Y** | Original scenarios contain fictional names, phones and account IDs; a delexicalized version is included | KB, EV, IC; customer turn→Raw, subflow→Topic, flow→Cat, final successful action/utterance→Res; **9/10—best procedural-support analogue, though not IT support** |
| [Customer Support on Twitter](https://www.kaggle.com/datasets/thoughtvector/customer-support-on-twitter) | 2017; about 2.8–3 million tweets; CSV | Primarily English; real public interactions with brands including technology, transport and retail | **Partial**—brand replies exist, but many exchanges lack a verified final resolution | **Conflicting secondary declarations**: CC BY-SA 4.0 versus CC BY-NC-SA 4.0; **U/U/U** until the original Kaggle terms are preserved | Text reportedly masks phones/emails, but public posts, handles and thread reconstruction remain privacy/platform risks; noisy, stale and often unresolved [^1_1][^1_2][^1_3][^1_4] | KB only after stringent filtering; inbound→Raw, brand→Cat, reply→candidate Res; **5/10—valuable realism but licensing and “reply ≠ resolution” are major problems** |
| [TechQA](https://github.com/IBM/techqa) | 2019/2020 release; 600 train, 310 dev and 490 evaluation QA pairs; JSON repository files | English; real IBM technical-forum questions linked to IBM technotes | **Yes**—questions are matched to accepted technical answers/documents; includes realistic retrieval difficulty | Apache-2.0; **Y/Y/Y** [^1_5][^1_6] | Forum-origin text may contain usernames or environment details; anonymization was not verified; small and IBM-product-heavy | KB, EV; question→Raw, product/tag→Topic/Cat, answer passage→Res; **10/10—closest verified technical-support RAG dataset** |
| [doc2dial](https://huggingface.co/datasets/IBM/doc2dial) | 2020, v1.0.1; over 4,500 conversations averaging 14 turns, grounded in 450+ documents; JSON | English; expert/crowd-created dialogues grounded in government service documents | **Yes**—agent utterances reference exact document spans | CC BY 3.0; **Y/Y/Y** [^1_7][^1_8][^1_9] | Not IT support; document snapshots can age; personal-information documentation is limited | KB, EV; user turn→Raw, domain/dialog act→Topic/Cat, referenced span or agent turn→Res; **8/10—excellent grounded-dialogue evaluation structure** |
| [MSDialog](https://arxiv.org/abs/1804.08759) | 2018; annotated subset 2,199 dialogues/10,020 utterances; underlying crawl over 35,000 conversations | English; real Microsoft Community support covering Windows, Office, Bing and Skype | **Yes**—selected threads include a community-designated correct answer | Dataset license **unverified**; **U/U/U** | Real forum data may carry names, handles, configuration details and obsolete product advice; redistribution terms need confirmation [^1_10][^1_11][^1_12] | KB, EV, IC; question→Raw, utterance intent→Topic, product→Cat, correct answer→Res; **8/10 privately, 4/10 for GitHub redistribution** |
| [MultiWOZ 2.2](https://huggingface.co/datasets/pfb30/multi_woz_v22) | 2020, v2.2; 8,437 train, 1,000 validation and 1,000 test dialogues; JSON | English; crowdsourced task-oriented travel, hotel, restaurant, hospital and transport dialogue | **Partial**—system turns complete tasks, but they are not technical-support solutions | Apache-2.0; **Y/Y/Y** [^1_13][^1_14][^1_15] | Multiple revisions were needed to fix annotation errors; domain mismatch is substantial | EV, IC; user turn→Raw, service/dialog act→Topic/Cat, successful system turn→Res; **5/10—useful pipeline test, weak maintenance-support relevance** |
| [Multi3WOZ](https://github.com/cambridgeltl/multi3woz) | 2023; corrected release dated 2023-12-15; 9,160 dialogues per language | Arabic, English, French and Turkish; culturally adapted, multi-parallel, hypothetical task-oriented dialogues | **Partial**—system responses complete predefined tasks, not technical troubleshooting | Repository contains a LICENSE file, but its exact data terms were not verified here; **U/U/U** | Hypothetical dialogues minimize real PII; Arabic is not specifically Lebanese; task domains differ from support [^1_16][^1_17] | EV, IC, AR; user turn→Raw, intent/service→Topic/Cat, system turn→Res; **8/10 linguistically, 6/10 overall** |
| [BANKING77](https://huggingface.co/datasets/PolyAI/banking77) | 2020; 13,083 queries, 77 intents; text/label files and Parquet packaging | English; online-banking customer requests | **No**—intent labels only | CC BY 4.0; **Y/Y/Y** [^1_18][^1_19] | Source-data and PII documentation is sparse; narrow banking domain | IC; text→Raw, label→Topic, banking→Cat; **8/10—strong fine-grained intent baseline but no resolutions** |
| [CLINC150/OOS](https://huggingface.co/datasets/clinc/clinc_oos) | 2019; 22,500 in-scope examples plus about 1,200 OOS examples; predefined train/dev/test configurations | English; crowdsourced assistant requests across 150 intents and 10 domains | **No**—intent and out-of-scope labels only | CC BY 3.0; **Y/Y/Y** [^1_20][^1_21][^1_22] | Short artificial requests differ from real tickets; OOS data is generic rather than maintenance-specific | EV, IC; text→Raw, intent→Topic/Cat, OOS→escalation; **9/10—best off-the-shelf escalation benchmark** |
| [Amazon MASSIVE](https://github.com/alexa/massive) | 2022; over 1 million parallel utterances, 19,521 per language, 51 languages, 60 intents and 55 slots | Includes English and Saudi Arabic; localized virtual-assistant requests across 18 domains | **No**—intent and slot labels only | CC BY 4.0; **Y/Y/Y** [^1_23][^1_24] | Localized from SLURP rather than independently collected support requests; Arabic locale is Saudi, not Lebanese | IC, AR; utterance→Raw, intent→Topic, domain→Cat; **9/10—best permissive bilingual intent source** |
| [ArBanking77](https://github.com/SinaLab/ArBanking77) | 2023; repository corpus 31,038 examples; 2024 shared-task version about 39,315; CSV | MSA, Palestinian, Saudi, Moroccan and Tunisian Arabic; manually localized from BANKING77 | **No**—intent labels only | README permits academic and commercial use, but the exact data license and derivative-redistribution obligations remain **unverified**; **Y/U/U** [^1_25][^1_26][^1_27][^1_28] | Parallel/localized data may contain translation artifacts; Palestinian is useful but not equivalent to Lebanese | IC, AR; query→Raw, intent→Topic, banking/dialect→Cat; **9/10—closest large Arabic customer-intent dataset** |
| [SQuAD 2.0](https://huggingface.co/datasets/rajpurkar/squad_v2) | 2018; 130,319 train and 11,873 validation rows; 53,775 adversarial unanswerable questions; JSON/Parquet | English; crowd questions over Wikipedia passages | **Yes/No mix**—answer spans plus explicit unanswerable cases | CC BY-SA 4.0; **Y/Y-SA/Y** [^1_29][^1_30][^1_31] | Not a support domain; answerability artifacts can differ from missing enterprise knowledge | EV; question→Raw, article→Cat, span→Res, impossible→escalation; **7/10—valuable abstention mechanics, weak domain match** |
| [Stack Exchange data dump](https://stackoverflow.com/help/licensing) | Continuously updated data dump; XML archives; size varies by site | Real technical Q\&A across Stack Overflow, Server Fault, Super User, Ask Ubuntu and other sites | **Yes** when filtering for accepted answers | License depends on contribution date: CC BY-SA 2.5, 3.0 or 4.0; **Y/Y-SA/Y** [^1_32][^1_33] | Dumps are sanitized, but posts can contain personal or infrastructure details; answer age, conflicting advice and strict per-post attribution are material | KB, EV; question→Raw, tags→Topic/Cat, accepted answer→Res; **9/10 content value, 6/10 operationally because of ShareAlike/attribution** |
| [MANtIS](https://guzpenha.github.io/MANtIS/) | 2019/2020; 80,000 conversations across 14 Stack Exchange domains | English; real multi-domain information-seeking conversations | **Partial**—grounded replies exist, but not every dialogue has a verified operational resolution | Exact packaged-dataset license **unverified**; upstream Stack Exchange terms may apply; **U/U/U** | Inherits forum noise, age, attribution and possible PII/code issues [^1_34] | KB, EV; first turn→Raw, domain→Cat, accepted/relevant response→Res; **6/10 until provenance and licensing are audited** |
| [50K Stack Overflow Q\&A](https://huggingface.co/datasets/Omarrran/50K_stackoverflow_qna_dataset_by_hnm) | 2025; 50,000 filtered question–answer pairs; packaged dataset | English; high-vote programming questions with accepted or top answers | **Yes** | Underlying content is CC BY-SA 4.0 even if package metadata suggests another license; **Y/Y-SA/Y** [^1_35][^1_36] | Derivative uploader provenance must be checked; original authors and post URLs must be retained | KB, EV; question→Raw, tags→Topic/Cat, accepted answer→Res; **7/10—convenient but inferior to building directly from the official dump** |
| [Customer Support Ticket Dataset](https://www.kaggle.com/datasets/waseemalastal/customer-support-ticket-dataset) | 2024; 8,470 records; 3.95 MB CSV | Customer-support ticket records; exact source realism and generation process not established | Resolution text was **not verified** from the primary description | ODbL/DbCL declaration; **Y/Y-SA/Y** [^1_37] | Provenance, PII treatment, realism and field semantics are insufficiently documented | IC/metadata experimentation; likely Raw/Topic/Cat/Priority/TTR fields; **5/10—schema-friendly but weak provenance** |
| [CRM Support Tickets](https://www.kaggle.com/datasets/ajverse/customer-support-tickets-crm-dataset) | 2026; 20,000 synthetic rows and 12 columns; CSV | Synthetic omnichannel support tickets | Structured metadata is present, but verified solution text is unclear | Page simultaneously contains an unfinished license placeholder and an MIT metadata label; **U/U/U** [^1_38] | Synthetic; license inconsistency; customer details may be generated but still require inspection | Schema prototyping only; **3/10—do not redistribute until the author fixes the license** |
| [Arabic Dialect Dialogue Pairs](https://github.com/tareknaous/dialogue-arabic-dialects) | 2022; one CSV; row count not verified | Levantine, Egyptian and Gulf Arabic; open-domain message–response pairs | **Yes**, as conversational responses, but not verified support resolutions | Exact repository data license **unverified**; **U/U/U** [^1_39] | Open-domain, not customer service; provenance and PII description are limited | AR; message→Raw, dialect→Cat, response→Res; **6/10 for style adaptation, 3/10 for factual KB use** |
| [MADAR](https://camel.abudhabi.nyu.edu/madar-shared-task-2019/) | 2018; MADAR-26 has 2,000 parallel sentences for 25 cities plus MSA; MADAR-6 adds 10,000 sentences for five cities | Includes Beirut, Damascus, Aleppo, Amman and other city dialects alongside MSA, English and French; commissioned travel translations | **No** support resolutions; parallel linguistic expressions only | Dataset terms were not verified as a commercial redistribution license; associated publications mention research availability; **U/U/U** | Travel-domain translations, formal elicitation and known translation/annotation errors; not organic Lebanese support language [^1_40][^1_41][^1_42][^1_43] | AR; sentence→Raw, city/dialect→Cat; **7/10 for Beirut localization, 2/10 as a KB** |
| [NADI 2020](http://nadi2020.arabic-nlp.net/) | 2020; 21,000 train, 4,957 dev and 5,000 test tweets; additional 10 million tweet IDs | Arabic tweets from 21 countries and 100 provinces, including Lebanon | **No**—dialect labels only | Paper is CC BY 4.0, but that does not establish unrestricted rights to redistribute tweet text; dataset terms **unverified**; **U/U/U** [^1_44][^1_45] | Geolocation is used as a proxy for dialect; social-media noise, imbalance, deletions and platform restrictions apply | AR; tweet→Raw, country/province→Cat; **6/10 for dialect identification, unsuitable for published support data** |
| [NADI 2024/MLADI materials](https://aclanthology.org/2024.arabicnlp-1.85/) | 2024; original development/test resource about 1,120 tweets; training set reused from 2023 | Arabic country-level and multi-label dialect identification | **No** | Follow-on work states that only tweet IDs and labels may be released under the shared-task restrictions; **commercial/derived-text redistribution unclear** [^1_46][^1_47][^1_48] | Very small multi-label test component; social-media/platform constraints; no support domain | AR evaluation; tweet→Raw, dialects→Cat; **5/10—use labels/IDs only, not redistributed text** |
| [UD South Levantine MADAR](https://universaldependencies.org/treebanks/ajp_madar/index.html) | UD 2.18; 100 sentences and 789 tokens; CoNLL-U | South Levantine, primarily Amman; manually annotated subset of MADAR | **No** | CC BY-SA 4.0; **Y/Y-SA/Y** [^1_49] | Tiny and Jordanian rather than Lebanese; inherited travel-domain origin | AR normalization/parser testing; **4/10—safe but far too small for support modeling** |
| [Organic Levantine Sample](https://www.kaggle.com/datasets/ebubekr53/organic-levantine-arabic-dialect-dataset) | 2026; 71 KB public sample; full corpus private | Levantine app translation queries from native speakers, reportedly including text and voice workflows | Translation pairs rather than support solutions | CC BY-NC 4.0; **N/Y for noncommercial/Y** [^1_50] | App-user consent, anonymization and redistribution provenance need independent verification; commercial use prohibited | AR research only; **3/10—interesting natural language, unsafe for the commercial/open-source target** |
| [ArSyra Medical Preview](https://huggingface.co/datasets/ArSyra/arsyra-medical) | 2026; 50-row preview of 3,623 records | MSA and dialect groups including Levantine; verified native-speaker responses to prompts | Prompt responses, not technical-support resolutions | CC BY-NC-SA 4.0 preview plus explicit no-redistribution/access conditions; full data separately licensed; **N/N/Y** [^1_51] | Medical rather than technical; only a preview is public; access terms override usefulness | AR research only; **2/10—do not incorporate into the public repository** |
| [Common Voice Arabic 27.0](https://mozilladatacollective.com/datasets/cmu5wom3z00ceo107guxtg4xa) | 2026-09 release; 136,832 clips, 158.27 total hours, 93.34 validated hours, 1,679 speakers; MP3 plus TSV metadata | Arabic read speech; not dialect-targeted or support speech | Transcriptions only | CC0-1.0, but download terms expressly forbid rehosting/resharing the dataset; **Y/U for derivatives, raw redistribution N/no attribution under CC0** [^1_52][^1_53] | Read speech, uneven demographics, sentence-validation noise and weak Lebanese coverage; identity inference is prohibited | SP; transcript→Raw, locale→Cat; **8/10—best broad public ASR evaluator, distribute a downloader rather than audio** |
| [MGB-2 Arabic](https://huggingface.co/datasets/MohamedRashad/mgb2-arabic) | 2016; about 1,200 training hours plus 10-hour development set | Al Jazeera broadcast Arabic; MSA and multiple dialects; lightly supervised, often non-verbatim transcripts | Transcriptions only | Card refers users to original challenge and Al Jazeera terms; exact redistribution/commercial license **unverified**; **U/U/U** [^1_54][^1_55][^1_56] | MSA and political/news content dominate; public figures are identifiable; broadcast acoustics differ from WhatsApp voice notes | SP private/research evaluation; **7/10 technically, 3/10 for redistributable Lebanese evaluation** |
| [MGB-3 Egyptian ASR](https://huggingface.co/datasets/MightyStudent/Egyptian-ASR-MGB-3) | Year/version unverified; about 16 hours from 80 YouTube programs; 16 kHz packaging | Egyptian Arabic broadcast/YouTube speech; four transcriptions per program | Transcriptions only | Card says `other` and provides no exact license; **U/U/U** [^1_57] | Repackaged third-party YouTube content; dialect and channel mismatch; redistribution rights unclear | SP research only; **5/10—useful dialect stress test but not safe for release** |
| [SADA 2022](https://huggingface.co/datasets/MohamedRashad/SADA22) | 2022; over 667 hours, with 241,834 train, 5,139 validation and 6,193 test examples in one packaging | Saudi television speech, primarily Najdi, Hijazi and Gulf varieties | Transcriptions only | CC BY-NC-SA 4.0; **N/Y-SA noncommercial/Y** [^1_58][^1_59][^1_60] | Broadcast rather than support/telephony; commercial use prohibited; transcription conventions for dialectal material are imperfectly documented [^1_61] | SP private/noncommercial; **6/10—large but wrong dialect and incompatible with commercial use** |
| [MASC Levantine partitions](https://huggingface.co/datasets/otozz/levantine_train_set) | Underlying MASC published 2021; approximately 13,000 packaged train records and 3,562 packaged test records | Levantine Arabic; packaging stores preprocessed input features and labels rather than convenient raw audio | Speech transcripts/labels | Wrapper declares CC BY 4.0; upstream license and authority to redistribute the transformed files should be reconfirmed; **Y/U/Y** [^1_62][^1_63] | Country mix and speaker balance are not documented on the wrapper; precomputed features limit ASR-system evaluation | SP; **7/10 if upstream rights and raw test audio are verified** |
| [Lahgtna Levantine TTS](https://huggingface.co/datasets/mohammedaly22/lahgtna-levantine-tts) | 2026; 50,000 utterances, about 66.8 hours, 10 synthetic voices | Synthetic Levantine Arabic; 5,846 Arabic–English code-switched utterances | Speech/text pairs only | CC BY 4.0 declared; **Y/Y/Y**, subject to auditing rights in source Shami text and voice-generation chain [^1_64] | Entirely synthetic audio; only ten voices; source text and TTS artifacts can inflate apparent ASR performance | SP, AR robustness; **6/10 as an auxiliary stress set, 2/10 as the sole speech benchmark** |
| [Silencio Arabic Dialects Speech](https://huggingface.co/datasets/SilencioNetwork/arabic-dialects-speech) | 2026; 187 public examples, only four Levantine; advertised full corpus is commercial/private | Native-speaker Arabic dialect samples; Levantine group combines Jordan, Syria and Lebanon | Transcribed speech samples | CC BY-NC 4.0 sample; **N/Y noncommercial/Y** [^1_65] | Public portion is far too small; Lebanese examples are not separately quantified; commercial rights require negotiation | SP preview only; **2/10—insufficient public evaluation coverage** |
| [AmazonQA](https://arxiv.org/abs/1908.04364) | 2019; 923,000 questions, 3.6 million answers and 14 million reviews over 156,000 products | English; real consumer product Q\&A and review evidence | **Yes**, plus answerable/unanswerable annotations against reviews | Exact redistributable dataset license **unverified**; **U/U/U** | Product-user content, duplicated answers, subjective advice and Amazon-origin rights create substantial restrictions [^1_66] | EV privately; question→Raw, product→Cat, answer→Res, answerability→escalation; **6/10 privately, 2/10 for GitHub data inclusion** |

## Lead disposition

Several named leads are not recommended despite their popularity:

- **Taskmaster** and **Ubuntu Dialogue Corpus** were not placed in the evidence-backed table because an exact current data license, redistribution status and authoritative latest-version record were not verified. They should not enter the GitHub data pipeline until those points are resolved.
- **MultiWOZ** is safely licensed but mainly tests task-oriented dialogue-state handling, not troubleshooting knowledge.
- **TWCS** contains realistic customer interactions, but a company reply is not necessarily a solution, and the available license declarations conflict.
- **MGB** resources are valuable speech benchmarks, but available cards defer to upstream broadcaster/challenge terms rather than granting clear commercial redistribution rights.
- **MADAR and NADI** are linguistic/dialect resources, not support-resolution corpora; social-media and research-access restrictions further limit redistribution.


# Recommended selection

## Knowledge-base seed

### TechQA

Use TechQA as the primary externally sourced technical QA seed. It contains real support questions linked to accepted IBM technical notes, provides clean question-to-resolution mapping, and has a verified Apache-2.0 repository license.[^1_5][^1_6]

Its main limitation is scale: 1,400 labeled questions are enough to validate the ingestion and retrieval architecture, not enough to cover a broad maintenance-contract product catalog.

### ABCD

Use ABCD to model multi-step procedures, tool actions, identity checks and successful completion. Its flow/subflow ontology maps naturally to topic labels, while its agent guidelines can be transformed into atomic knowledge-base procedures.

The original values are fictional and the dataset includes delexicalized conversations, making it materially safer than real customer logs. It should nevertheless be relabeled from e-commerce concepts into generic support workflow categories rather than treated as factual IT knowledge.

### Bitext

Use Bitext for structural augmentation and intent/resolution templates, not as an authoritative KB. It is especially useful for generating schema-complete examples and paraphrase variation, but its synthetic answers should undergo factual and style review.

Do not allow Bitext responses to become evaluation gold merely because they are present in the dataset; several are generic acknowledgements rather than completed solutions.

## Evaluation data

### TechQA

Reserve the official development and evaluation questions and their linked documents. Measure both retrieval of the correct technote and grounded answer production.

Do not translate or paraphrase the evaluation questions used in the KB-training partition; that would create near-duplicate leakage.

### doc2dial

Use doc2dial to test document-grounded, multi-turn retrieval: each answer can be checked against referenced document spans, and the structure supports retrieval, grounding and conversational-context metrics.[^1_7][^1_8]

Its government-service domain is secondary. The value comes from its evidence annotations and dialogue construction, not from direct domain transfer.

### CLINC150 plus domain negatives

Use CLINC150’s OOS examples to establish the escalation pipeline and threshold-selection code. Add a new project-owned OOS set containing maintenance-contract boundaries: unsupported products, requests for credentials, legal questions, feature requests, social conversation, emergencies and requests that require live account access.[^1_20][^1_22]

SQuAD 2.0 can supplement this by testing passage-level abstention, but its Wikipedia artifacts should not determine the final production threshold.[^1_29][^1_31]

## Intent classification

### ArBanking77

ArBanking77 is the best direct source for fine-grained Arabic customer-request intents. Palestinian Arabic provides useful Levantine transfer, while MSA and the other dialects improve robustness.[^1_25][^1_27]

Before publishing derived records, obtain or verify the exact license text; a README statement allowing commercial use is helpful but does not completely specify attribution or redistribution requirements.

### MASSIVE

MASSIVE is the safest multilingual starting point: it offers aligned English and Saudi Arabic examples under CC BY 4.0 and covers 60 intents and 55 slot types. Use only the support-adjacent domains and retain a mapping from every original intent to the project’s maintenance taxonomy.[^1_23][^1_24]

Because its Arabic was localized for Saudi Arabia, do not present it as Lebanese training data.

### CLINC150

CLINC150 supplies broad intent coverage and explicit OOS examples under a verified permissive attribution license. It is especially useful for calibrating a reject option alongside the normal intent classifier.

Retain the original OOS partition exclusively for validation/test; create separate project OOS data for training.

## Arabic language

### Multi3WOZ

Multi3WOZ offers aligned Arabic and English dialogues produced with culturally adapted collection procedures rather than direct raw machine translation. It is suitable for bilingual pipeline tests, dialogue-turn handling and response-style experiments.[^1_16][^1_17]

Do not redistribute it until the repository’s exact data license has been recorded in the project’s license manifest.

### ArBanking77

Use Palestinian examples as a partial Levantine bridge and MSA examples for formal Arabic. Lebanese reviewers should rewrite—not merely relabel—a subset into Lebanese Arabic, because Palestinian and Lebanese vocabulary, negation, politeness and code-switching are not identical.

### MADAR Beirut

Use the Beirut portion only for lexical and orthographic adaptation, contrastive examples and dialect identification. Its parallel MSA/English/Beirut structure is valuable, but the travel domain and commissioned-translation style make it unsuitable as factual support knowledge.[^1_41][^1_43]

Until its exact dataset license is verified, keep it outside the public derived-data release.

## Arabic speech

### Common Voice Arabic

Use Common Voice 27.0 as the broad MSA/general-Arabic ASR benchmark: it has 93.34 validated hours and 1,679 speakers under CC0. Because the current access terms prohibit rehosting, publish download and preprocessing scripts, hashes and split manifests—not audio copies.[^1_52]

It should not be described as a Lebanese benchmark; read speech and the lack of a Lebanese-controlled test stratum limit that claim.

### MASC Levantine

Use MASC only after verifying upstream rights and obtaining raw audio/transcript test files. The available preprocessed wrapper is useful for model development but insufficient for independently comparing arbitrary speech-to-text systems.[^1_62][^1_63]

Create a fixed, speaker-disjoint Lebanese subset if the underlying metadata permits it.

### Lahgtna auxiliary set

Use Lahgtna only for code-switch and synthetic-acoustic stress testing. Its 5,846 Arabic–English code-switched utterances are directly relevant to Lebanese-style mixed language, but synthetic voices must not dominate the reported score.[^1_64]

A credible report should publish separate results for human read speech, human spontaneous Lebanese speech and synthetic code-switched speech.

# Missing public data

The largest gap is a **real, consented Lebanese customer-support corpus containing customer problem, diagnostic dialogue, verified resolution, escalation outcome and reusable commercial rights**. None of the reviewed public datasets combines those properties.

Other material gaps are:

- Lebanese technical-support dialogue rather than travel, banking, open-domain chat or social media.
- Lebanese Arabizi support messages paired with Arabic-script normalization and English terminology.
- Natural Arabic–English code-switching from IT maintenance conversations.
- Spontaneous Lebanese voice notes with human transcripts, speaker-consent records and commercial redistribution rights.
- Contract-sensitive labels such as entitlement, covered/not-covered work, SLA priority and escalation reason.
- Operational labels covering satisfaction, time to resolution, follow-up and whether the proposed fix actually worked.
- Hard negatives where the issue resembles a known problem but differs in product version, configuration, contract scope or required permissions.
- Longitudinal incident chains connecting the initial report, troubleshooting attempts, human takeover and confirmed closure.
- Public Arabic datasets in which a customer request is paired with a trustworthy technical solution. ArBanking77, MASSIVE, NADI and MADAR supply language or labels, not solutions.[^1_27][^1_44][^1_41][^1_23]


# Gap-filling strategy

## Synthetic generation

Build synthetic records **from a project-owned knowledge base**, not from scraped support answers. Each generated customer interaction should reference one approved procedure ID, supported product/version, prerequisites, expected diagnostic observations and an explicit escalation rule.

Generate along controlled axes:

- English, MSA, Lebanese Arabic script, Lebanese Arabizi and Arabic–English code-switching.
- Short chat messages, detailed tickets, multi-turn troubleshooting and noisy voice-transcript style.
- User expertise, politeness, frustration, typos, missing information and incorrect assumptions.
- Device, operating system, software version, network environment and contract scope.
- Successful resolution, partial resolution, unsafe request, unsupported product, missing KB answer and human escalation.
- Priority, sentiment, follow-up, satisfaction and plausible—but synthetic—time-to-resolution values.

Require the generator to quote only structured facts supplied in the prompt and to output the source procedure IDs used. Reject samples whose resolution introduces an executable command, URL, version number or policy absent from the source record.

### Copyright controls

- Generate from factual specifications and project-owned procedures, not from source passages copied into a “rewrite this” prompt.
- Prohibit imitation of identifiable vendors’ support prose.
- Run exact-match, long-substring, MinHash and embedding-similarity checks against all source datasets and public documentation used during development.
- Reject suspiciously similar outputs rather than trying to “paraphrase them more.”
- Store generation prompts, model/version, seed procedure IDs, reviewer decisions and similarity-test results.
- License only the project-owned synthetic records; do not claim ownership over externally sourced seed text.


### Human validation

Every resolution used as KB truth should pass:

1. Technical review by a support engineer.
2. English/Arabic semantic-equivalence review.
3. Lebanese naturalness review by a native speaker.
4. Safety and escalation review.
5. PII and secret scanning.
6. Evidence check confirming that each step follows the associated procedure.
7. Final status: approved, revise or reject.

For initial quality control, double-review every evaluation record and at least 20% of KB records. Reviewers should not see model confidence or proposed correctness labels before making their first judgment.

## Arabic translation

Translate only datasets whose licenses permit adaptations. Maintain a record-level chain of `source_dataset`, `source_record_id`, `source_license`, `translator`, `translation_method`, `reviewer` and `approval_status`.

Create three distinct Arabic targets:

- **MSA:** Formal, broadly understandable customer support.
- **Lebanese Arabic:** Natural colloquial morphology, vocabulary and politeness.
- **Lebanese Arabizi/code-switch:** Latin-script Arabic with realistic English technical terms.

Important checks include:

- Product names, commands, error codes, units and URLs remain character-identical.
- Negation and modality are preserved; “may,” “must,” “do not” and “only if” are high-risk.
- Number/gender agreement and pronoun references remain unambiguous.
- The translated question is still answerable by the same source procedure.
- Lebanese language is not merely MSA with a few dialect words.
- Arabizi includes multiple plausible spellings without turning every record into random transliteration noise.
- Back-translation is used only as a diagnostic; native bilingual adjudication is the acceptance criterion.

Do not translate source evaluation questions into the training set. Parallel versions of one incident must remain in the same split.

## Responsible collection

Collect real records through a written data-processing and contribution agreement with the participating business. The agreement should identify who can authorize redistribution of anonymized derived data—not merely who can provide database access.

Recommended workflow:

1. Export closed incidents only after the customer-facing service process is complete.
2. Separate message content from customer, employee and account identifiers before researchers receive it.
```
1. Replace identifiers with typed placeholders such as `<PERSON>`, `<ORG>`, `<PHONE>`, `<EMAIL>`, `<IP_PRIVATE>`, `<HOSTNAME>`, `<ACCOUNT_ID>` and `<TICKET_ID>`.
```

1. Remove passwords, access tokens, API keys, private keys, cookies, session URLs, database strings and internal network maps.
2. Ask the resolving technician to mark the verified resolution and whether the customer confirmed success.
3. Preserve an auditable link in a restricted vault, but publish only irreversible project IDs.
4. Sample across customer size, product, priority, resolution type and language rather than taking the easiest tickets.
5. Provide a deletion procedure if a customer or business later withdraws permission.
6. Keep raw WhatsApp exports private; release only reviewed, deidentified, contract-authorized derivatives.
7. Conduct a final human re-identification review, because names can survive in signatures, quoted emails, filenames, screenshots and diagnostic logs.

# Data preparation

## Canonical record

Add provenance fields to the current schema:

```text
InteractionID
CustomerInteractionRawText
NormalizedText
Language
Dialect
ScriptType
AudioID
AgentAssignedTopic
TopicCategory
ResolutionText
ResolutionEvidenceIDs
ResolutionVerified
AnswerableFromKB
EscalationRequired
EscalationReason
Priority
SentimentScore
SatisfactionRating
TimeToResolution
FollowUpRequired
SourceDataset
SourceRecordID
SourceLicense
Synthetic
PIIRedactionStatus
SplitGroupID
```

Do not manufacture unavailable operational fields for real external datasets. Use `null` plus a provenance flag rather than generating plausible satisfaction or resolution-time values and presenting them as observed.

## Schema mapping

| Source structure | Target mapping |
| :-- | :-- |
| Support QA | Question→`CustomerInteractionRawText`; tags/intent→topic fields; accepted answer→`ResolutionText` |
| Multi-turn support dialogue | Customer turns→raw text; flow/subflow→topics; final verified successful procedure→resolution |
| Intent-only data | Utterance→raw text; intent→`AgentAssignedTopic`; domain→`TopicCategory`; resolution stays null |
| Document-grounded QA | Question→raw text; referenced document span→resolution evidence; generated answer→resolution |
| Unanswerable/OOS data | Utterance→raw text; `AnswerableFromKB=false`; `EscalationRequired=true` |
| Speech corpus | Transcript→raw text; audio path→`AudioID`; dialect/locale→language metadata; no inferred resolution |
| Dialect corpus | Sentence→raw text; city/dialect→language metadata, not business topic |

## Cleaning pipeline

1. **Validate encoding:** Normalize UTF-8, line endings and broken markup while retaining an untouched restricted source copy.
2. **Normalize conservatively:** Standardize Arabic Unicode variants and whitespace, but keep both original and normalized forms.
3. **Preserve meaning-bearing text:** Keep error codes, version numbers, commands and mixed Arabic/English technical tokens.
4. **Remove boilerplate:** Strip signatures, ticket headers, repeated quoted messages and automatic disclaimers.
5. **Redact PII and secrets:** Combine regex detectors, Arabic/English NER, secret scanners and human review.
6. **Thread reconstruction:** Rebuild chronological conversations and distinguish customer, agent, system action and internal note.
7. **Resolution verification:** Exclude acknowledgements, “contact support” replies and unconfirmed suggestions from `ResolutionText`.
8. **Topic mapping:** Map original labels into a hierarchical maintenance taxonomy; retain the original label separately.
9. **Quality scoring:** Record grounding, completeness, linguistic quality, realism and safety as separate reviewer scores.
10. **Quarantine:** Keep records with unclear license, provenance or personal data outside the publishable dataset.

## Deduplication

Apply deduplication before splitting:

- Exact hash after low-risk normalization.
- Character and token MinHash for copied tickets and template variants.
- Embedding similarity for semantically duplicated incidents.
- Shared error-code, procedure-ID and resolution-template checks.
- Cross-language grouping of translations.
- Conversation-level grouping so turns from one ticket cannot cross splits.

Do not automatically remove every similar technical question. Preserve meaningful distinctions such as product version, operating system, permission level or error code.

## Leakage prevention

Split by **incident family**, not by row. Every original record, paraphrase, translation, synthetic variant, speech rendering and follow-up must share one `SplitGroupID`.

Also group by:

- Source thread or document.
- Resolution procedure.
- Customer organization.
- Product/version family.
- Synthetic scenario seed.
- Translation family.
- Speaker for speech evaluation.

For a strict retrieval benchmark, hold out entire question families while keeping the answer document in the KB. For a generalization benchmark, additionally hold out selected procedures or product versions and label their questions as unanswerable.

## Recommended minimums

These are project-planning targets, not universal statistical guarantees.

### Credible demo

- **Knowledge base:** 3,000 engineer-approved problem–resolution records across at least 50 intents.
- **Language mix:** At least 750 English, 750 MSA, 750 Lebanese Arabic-script and 750 Arabizi/code-switched variants.
- **Evaluation:** 600 independently written test cases, with 150 per language/script stratum.
- **Escalation:** At least 25% of evaluation cases unanswerable, unsupported or requiring privileged action.
- **Speech:** At least 500 human-recorded utterances from 50 or more speakers, evaluated separately from synthetic audio.


### Credible public evaluation

- **Text:** 2,000–3,000 independently authored cases.
- **Per stratum:** At least 500 each for English, MSA, Lebanese Arabic script and Arabizi/code-switching.
- **Answerability:** Approximately 60% answerable, 20% near-domain but unsupported, and 20% clearly out of scope.
- **Speech:** 5–10 hours of consented, speaker-disjoint human speech from at least 100 speakers, with Lebanese speech reported separately.
- **Human scoring:** Double annotation of all test resolutions and escalation labels, with adjudication of disagreements.


## Evaluation metrics

Report metrics by language, dialect, script and input mode rather than only a global average:

- Retrieval: Recall@1, Recall@5, MRR and nDCG.
- Grounding: evidence precision/recall and unsupported-claim rate.
- Answer quality: required-step coverage, prohibited-step rate and human correctness.
- Escalation: precision, recall, F1 and false-answer rate on unanswerable requests.
- Intent: macro-F1 and per-intent recall.
- Calibration: expected calibration error and risk–coverage curve.
- Speech: WER and CER, including code-switched token error rate.
- End-to-end: resolved correctly, escalated correctly, answered incorrectly and unnecessary escalation.

For a safety-oriented support assistant, the most important number is the **false-answer rate on cases that should escalate**, not average response fluency.

# Licensing decision

## Suitable for GitHub

These can generally support public redistribution of properly attributed derivatives, subject to preserving notices and auditing each packaged release:

- **TechQA — Apache-2.0.**
- **ABCD — MIT.**
- **doc2dial — CC BY 3.0.**
- **MultiWOZ 2.2 — Apache-2.0.**
- **BANKING77 — CC BY 4.0.**
- **CLINC150 — CC BY 3.0.**
- **MASSIVE — CC BY 4.0.**
- **Bitext — CDLA-Sharing-1.0**, provided its sharing and notice requirements are followed.
- **SQuAD 2.0 — CC BY-SA 4.0**, only if the derivative and attribution model satisfy ShareAlike.
- **Official Stack Exchange data — date-dependent CC BY-SA**, only with post-level license, source URL and author attribution.
- **UD South Levantine MADAR — CC BY-SA 4.0.**
- **Lahgtna — declared CC BY 4.0**, but audit its source-text and generated-voice provenance before inclusion.

For Common Voice, include **download/preprocessing scripts and split manifests**, not rehosted audio, because the current dataset page expressly forbids resharing despite the CC0 declaration.[^1_52]

## Private or conditional

Keep these private until the exact upstream agreement is verified:

- ArBanking77.
- Multi3WOZ.
- MSDialog.
- MANtIS.
- MADAR.
- MASC Levantine wrappers.
- MGB-2 and MGB-3.
- AmazonQA.
- Twitter Customer Support.
- NADI tweet text.
- Any business WhatsApp exports.

SADA, Organic Levantine, ArSyra previews and Silencio samples are noncommercial or carry additional restrictions and therefore do not fit a project that ideally permits commercial downstream use.[^1_50][^1_51][^1_65][^1_60]

## Avoid for release

Avoid incorporating the following into distributed data:

- Datasets with placeholder, contradictory or absent licenses.
- Social-media text whose uploader license conflicts with platform or original-author rights.
- Repackaged Stack Overflow data that claims a permissive license while the underlying content remains CC BY-SA.
- Public previews whose access terms prohibit redistribution.
- Synthetic datasets with no generation provenance.
- Real tickets without explicit rights to publish anonymized derivatives.
- Any source for which account data, credentials, private infrastructure details or customer consent cannot be audited.

The safest repository design is to publish **project-owned synthetic/consented data plus scripts that download external datasets from their official hosts**, with a machine-readable license manifest and no commingling of incompatible source texts.

<span style="display:none">[^1_100][^1_101][^1_102][^1_103][^1_104][^1_105][^1_106][^1_107][^1_108][^1_109][^1_110][^1_111][^1_112][^1_113][^1_114][^1_115][^1_116][^1_117][^1_118][^1_119][^1_120][^1_121][^1_122][^1_123][^1_124][^1_125][^1_126][^1_127][^1_128][^1_129][^1_130][^1_131][^1_132][^1_133][^1_134][^1_135][^1_136][^1_137][^1_138][^1_139][^1_140][^1_141][^1_142][^1_143][^1_144][^1_145][^1_146][^1_147][^1_148][^1_149][^1_150][^1_151][^1_152][^1_153][^1_154][^1_155][^1_156][^1_157][^1_158][^1_159][^1_160][^1_161][^1_162][^1_163][^1_164][^1_165][^1_166][^1_167][^1_168][^1_169][^1_170][^1_171][^1_172][^1_173][^1_174][^1_175][^1_176][^1_177][^1_178][^1_179][^1_180][^1_181][^1_182][^1_183][^1_184][^1_185][^1_186][^1_187][^1_188][^1_189][^1_190][^1_191][^1_192][^1_193][^1_194][^1_195][^1_196][^1_197][^1_198][^1_199][^1_200][^1_201][^1_202][^1_203][^1_204][^1_205][^1_206][^1_207][^1_208][^1_209][^1_210][^1_211][^1_212][^1_213][^1_214][^1_215][^1_216][^1_217][^1_218][^1_219][^1_220][^1_221][^1_222][^1_223][^1_224][^1_225][^1_226][^1_227][^1_228][^1_229][^1_230][^1_231][^1_232][^1_233][^1_234][^1_235][^1_236][^1_237][^1_238][^1_239][^1_240][^1_241][^1_242][^1_243][^1_244][^1_245][^1_246][^1_247][^1_248][^1_249][^1_250][^1_251][^1_252][^1_253][^1_254][^1_255][^1_256][^1_257][^1_258][^1_259][^1_260][^1_261][^1_262][^1_263][^1_264][^1_265][^1_266][^1_267][^1_268][^1_269][^1_270][^1_271][^1_272][^1_273][^1_274][^1_275][^1_276][^1_277][^1_278][^1_279][^1_280][^1_281][^1_282][^1_283][^1_284][^1_285][^1_286][^1_287][^1_288][^1_289][^1_290][^1_291][^1_292][^1_293][^1_294][^1_295][^1_296][^1_297][^1_298][^1_299][^1_300][^1_301][^1_302][^1_303][^1_304][^1_305][^1_306][^1_307][^1_308][^1_309][^1_310][^1_311][^1_312][^1_313][^1_314][^1_315][^1_316][^1_317][^1_318][^1_319][^1_320][^1_321][^1_322][^1_323][^1_324][^1_325][^1_326][^1_327][^1_328][^1_329][^1_330][^1_331][^1_332][^1_333][^1_334][^1_335][^1_336][^1_337][^1_338][^1_339][^1_340][^1_341][^1_342][^1_343][^1_344][^1_345][^1_346][^1_347][^1_348][^1_349][^1_350][^1_351][^1_352][^1_353][^1_354][^1_355][^1_356][^1_357][^1_358][^1_359][^1_360][^1_361][^1_362][^1_363][^1_364][^1_365][^1_366][^1_367][^1_368][^1_369][^1_370][^1_371][^1_372][^1_373][^1_374][^1_375][^1_376][^1_377][^1_378][^1_379][^1_380][^1_381][^1_382][^1_383][^1_384][^1_385][^1_386][^1_387][^1_388][^1_389][^1_390][^1_391][^1_392][^1_393][^1_394][^1_395][^1_396][^1_397][^1_398][^1_399][^1_400][^1_401][^1_402][^1_403][^1_404][^1_405][^1_406][^1_407][^1_408][^1_409][^1_410][^1_411][^1_412][^1_413][^1_414][^1_415][^1_416][^1_417][^1_418][^1_419][^1_420][^1_421][^1_422][^1_423][^1_424][^1_425][^1_426][^1_427][^1_428][^1_429][^1_430][^1_431][^1_432][^1_433][^1_434][^1_435][^1_436][^1_437][^1_438][^1_439][^1_440][^1_441][^1_442][^1_443][^1_444][^1_445][^1_446][^1_447][^1_448][^1_449][^1_450][^1_451][^1_452][^1_453][^1_454][^1_455][^1_456][^1_457][^1_458][^1_459][^1_460][^1_461][^1_462][^1_463][^1_464][^1_465][^1_466][^1_467][^1_468][^1_469][^1_470][^1_471][^1_472][^1_473][^1_474][^1_475][^1_476][^1_477][^1_478][^1_479][^1_480][^1_481][^1_482][^1_483][^1_484][^1_485][^1_486][^1_487][^1_488][^1_489][^1_490][^1_491][^1_492][^1_493][^1_494][^1_495][^1_496][^1_497][^1_498][^1_499][^1_500][^1_501][^1_502][^1_503][^1_504][^1_505][^1_506][^1_507][^1_508][^1_509][^1_510][^1_511][^1_512][^1_513][^1_514][^1_515][^1_516][^1_517][^1_518][^1_519][^1_520][^1_521][^1_522][^1_523][^1_524][^1_525][^1_526][^1_527][^1_67][^1_68][^1_69][^1_70][^1_71][^1_72][^1_73][^1_74][^1_75][^1_76][^1_77][^1_78][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92][^1_93][^1_94][^1_95][^1_96][^1_97][^1_98][^1_99]</span>

<div align="center">⁂</div>

[^1_1]: https://github.com/vishvadesai9/customer-support-tweets-analysis

[^1_2]: https://openbigdata.org/resource/customer-support-on-twitter/

[^1_3]: https://arxiv.org/pdf/1809.00303v1.pdf

[^1_4]: https://github.com/SuvidhJ/Handoff

[^1_5]: https://opendatalab.com/OpenDataLab/TechQA

[^1_6]: https://github.com/IBM/techqa/blob/master/LICENSE.md

[^1_7]: https://research.ibm.com/publications/doc2dial-a-goal-oriented-document-grounded-dialogue-dataset

[^1_8]: https://huggingface.co/datasets/IBM/doc2dial/blame/acede68c6c2c5e9bd276035144133d3896ba5527/doc2dial.py

[^1_9]: https://huggingface.co/datasets/IBM/doc2dial/blob/main/README.md

[^1_10]: https://arxiv.org/abs/1804.08759v1

[^1_11]: https://ar5iv.labs.arxiv.org/html/2304.00180

[^1_12]: https://aclanthology.org/2023.acl-long.152.pdf

[^1_13]: https://huggingface.co/datasets/pfb30/multi_woz_v22/blob/5bdb646e874107188e86c6f7bff3b642a2073bfd/dataset_infos.json

[^1_14]: https://huggingface.co/datasets/pfb30/multi_woz_v22/blob/main/README.md

[^1_15]: https://huggingface.co/datasets/pfb30/multi_woz_v22/blame/f3f94c84c70f7bf53dd90be12462bee702fc742c/README.md

[^1_16]: https://arxiv.org/html/2310.12892v1

[^1_17]: https://github.com/cambridgeltl/multi3woz

[^1_18]: https://huggingface.co/datasets/legacy-datasets/banking77

[^1_19]: https://huggingface.co/datasets/PolyAI/banking77/blame/main/README.md

[^1_20]: https://huggingface.co/datasets/clinc/clinc_oos

[^1_21]: https://arxiv.org/html/2012.03929v2

[^1_22]: https://huggingface.co/datasets/clinc/clinc_oos/blob/main/README.md

[^1_23]: https://www.amazon.science/blog/amazon-releases-51-language-dataset-for-language-understanding

[^1_24]: https://huggingface.co/datasets/qanastek/MASSIVE

[^1_25]: https://github.com/SinaLab/ArBanking77/blob/main/README.md

[^1_26]: https://www.pure.ed.ac.uk/ws/portalfiles/portal/465467888/HaririFarhaArabicNLP2024SMASHAtAraFinNLP2024.pdf

[^1_27]: https://aclanthology.org/2024.arabicnlp-1.34.pdf

[^1_28]: https://github.com/SinaLab/ArBanking77

[^1_29]: https://huggingface.co/datasets/rajpurkar/squad_v2/raw/main/README.md

[^1_30]: https://huggingface.co/datasets/rajpurkar/squad_v2/blob/3ffb306f725f7d2ce8394bc1873b24868140c412/README.md

[^1_31]: https://arxiv.org/html/1806.03822v1

[^1_32]: https://stackoverflow.blog/2014/01/23/stack-exchange-cc-data-now-hosted-by-the-internet-archive/

[^1_33]: https://stackoverflow.com/help/licensing

[^1_34]: https://ar5iv.labs.arxiv.org/html/1912.04639

[^1_35]: https://huggingface.co/datasets/Omarrran/50K_stackoverflow_qna_dataset_by_hnm/blob/main/README.md

[^1_36]: https://huggingface.co/datasets/Omarrran/50K_stackoverflow_qna_dataset_by_hnm

[^1_37]: https://www.kaggle.com/datasets/waseemalastal/customer-support-ticket-dataset

[^1_38]: https://www.kaggle.com/datasets/ajverse/customer-support-tickets-crm-dataset

[^1_39]: https://github.com/tareknaous/dialogue-arabic-dialects

[^1_40]: https://www.lrec-conf.org/proceedings/lrec2018/summaries/351.html

[^1_41]: https://aclanthology.org/2020.lrec-1.508.pdf

[^1_42]: https://aclanthology.org/2023.arabicnlp-1.30.pdf

[^1_43]: https://camel.abudhabi.nyu.edu/madar-shared-task-2019/MADAR_SharedTask_Summary_Paper_WANLP_ACL_2019.pdf

[^1_44]: https://arxiv.org/pdf/2010.11334.pdf

[^1_45]: https://aclanthology.org/2020.wanlp-1.25.pdf

[^1_46]: https://aclanthology.org/2024.arabicnlp-1.85.pdf

[^1_47]: https://irep.mbzuai.ac.ae/server/api/core/bitstreams/7633526b-4fdb-4552-bbbf-824d69bf9d30/content

[^1_48]: https://www.pure.ed.ac.uk/ws/portalfiles/portal/530937371/KelegEtalACL25RevisitingCommon.pdf

[^1_49]: https://universaldependencies.org/treebanks/ajp_madar/index.html

[^1_50]: https://www.kaggle.com/datasets/ebubekr53/organic-levantine-arabic-dialect-dataset

[^1_51]: https://huggingface.co/datasets/ArSyra/arsyra-medical

[^1_52]: https://mozilladatacollective.com/datasets/cmu5wom3z00ceo107guxtg4xa

[^1_53]: https://github.com/common-voice/cv-dataset/blob/main/datasets/scripted-speech/README.md

[^1_54]: https://huggingface.co/datasets/MohamedRashad/mgb2-arabic

[^1_55]: https://voxkitchen.readthedocs.io/en/latest/datasets/mgb2/

[^1_56]: https://huggingface.co/api/resolve-cache/datasets/MohamedRashad/mgb2-arabic/6d94091d63809eb2c0794a8c4bc1d8b40dcdea25/README.md?download=true\&etag="7edea6a0f18214416e57ef46a5f97bdd9e97ab65"

[^1_57]: https://huggingface.co/datasets/MightyStudent/Egyptian-ASR-MGB-3/blob/f54b410f51ffbaaf2a70ee03d9bc6d5a2c18083e/README.md

[^1_58]: https://huggingface.co/datasets/m6011/sada2022/commit/e2d937707d62a8b118d07cc4d29f0a4aa20c883d

[^1_59]: https://huggingface.co/datasets/MohamedRashad/SADA22

[^1_60]: https://huggingface.co/datasets/MohamedRashad/SADA22/blob/main/README.md

[^1_61]: https://ar5iv.labs.arxiv.org/html/2601.13319

[^1_62]: https://huggingface.co/datasets/otozz/levantine_train_set

[^1_63]: https://huggingface.co/datasets/otozz/levantine_test_set/blame/main/README.md

[^1_64]: https://huggingface.co/datasets/mohammedaly22/lahgtna-levantine-tts

[^1_65]: https://huggingface.co/datasets/SilencioNetwork/arabic-dialects-speech

[^1_66]: https://arxiv.org/pdf/1908.04364v1.pdf

[^1_67]: https://github.com/bitext/customer-support-llm-chatbot-training-dataset/blob/main/README.md

[^1_68]: https://github.com/bitext/customer-support-llm-chatbot-training-dataset/blob/main/LICENSE.txt

[^1_69]: https://www.bitext.com/blog/free-customer-support-dataset/

[^1_70]: https://www.kaggle.com/datasets/thoughtvector/customer-support-on-twitter/data

[^1_71]: https://openreview.net/pdf?id=f7ymGDiNRu

[^1_72]: https://www.bitext.com/chatbot-training-data/

[^1_73]: https://huggingface.co/datasets/kaushik-systalyze/customer-transcript-source

[^1_74]: https://github.com/asappresearch/abcd/tree/master

[^1_75]: https://huggingface.co/datasets/iam-tsr/amazon-customer-support/raw/main/README.md

[^1_76]: https://huggingface.co/datasets/kaushik-systalyze/customer-transcript-holdout-eval/viewer/default/holdout_eval

[^1_77]: https://github.com/guyfe/Tweetsumm

[^1_78]: https://huggingface.co/datasets/iam-tsr/amazon-customer-support/blob/main/README.md

[^1_79]: https://docs.humanfirst.ai/docs/academy/

[^1_80]: https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset

[^1_81]: https://github.com/bitext/customer-support-llm-chatbot-training-dataset

[^1_82]: https://huggingface.co/datasets/IBM/multidoc2dial/blob/main/README.md

[^1_83]: https://huggingface.co/datasets/IBM/doc2dial

[^1_84]: https://huggingface.co/datasets/IBM/multidoc2dial/blob/0c1d2e573b6a43b327745f2e63ba7da8e9b9f27d/README.md

[^1_85]: https://huggingface.co/datasets/IBM/doc2dial/raw/acede68c6c2c5e9bd276035144133d3896ba5527/doc2dial.py

[^1_86]: https://doc2dial.github.io/multidoc2dial/data_readme.html

[^1_87]: https://arxiv.org/html/2011.06623v2

[^1_88]: https://github.com/doc2dial/multidoc2dial

[^1_89]: https://huggingface.co/datasets/IBM/multidoc2dial/blob/main/multidoc2dial.py

[^1_90]: https://arxiv.org/html/2305.08371v2

[^1_91]: https://doc2dial.github.io/

[^1_92]: https://doc2dial.github.io/multidoc2dial/

[^1_93]: https://arxiv.org/html/2109.12595v1

[^1_94]: https://huggingface.co/datasets/IBM/multidoc2dial

[^1_95]: https://github.com/ibm/techqa

[^1_96]: https://github.com/IBM/multidoc2dial

[^1_97]: https://arxiv.org/html/1804.08759v1

[^1_98]: https://github.com/asappresearch/abcd/blob/master/LICENSE

[^1_99]: https://github.com/microsoft/DialoGPT/blob/master/LICENSE

[^1_100]: https://huggingface.co/docs/hub/main/repositories-licenses

[^1_101]: https://huggingface.co/docs/hub/en/repositories-licenses

[^1_102]: https://huggingface.co/docs/hub/repositories-licenses

[^1_103]: https://huggingface.co/datasets/nvidia/TechQA-RAG-Eval

[^1_104]: https://huggingface.co/datasets/nvidia/TechQA-RAG-Eval/blob/main/README.md

[^1_105]: https://arxiv.org/html/1805.00188v3

[^1_106]: https://opendatalab.com/OpenDataLab/ABCD

[^1_107]: https://github.com/asappresearch/sru/blob/master/LICENSE

[^1_108]: https://huggingface.co/datasets/kaushik-systalyze/customer-transcript-short-control/viewer/default/short_control?p=29

[^1_109]: https://www.microsoft.com/en-us/research/publication/mmdialog-a-large-scale-multi-turn-dialogue-dataset-towards-multi-modal-open-domain-conversation/

[^1_110]: https://github.com/asappresearch/abcd

[^1_111]: https://github.com/pradhyumnaag30/CLINC150

[^1_112]: https://huggingface.co/datasets/a1i6ek/den-datasets/commit/36da5a7e6c710860d914a174759be954d514821c.diff

[^1_113]: https://huggingface.co/datasets/Syedtahaali94/clinc_oos

[^1_114]: https://huggingface.co/datasets/PolyAI/banking77/tree/main

[^1_115]: https://huggingface.co/datasets/PolyAI/banking77/blob/refs%2Fpr%2F1/banking77.py

[^1_116]: https://arxiv.org/html/2607.07974v1

[^1_117]: https://arxiv.org/html/2304.01295v4

[^1_118]: https://github.com/Zefan-Cai/Open-Jev/blob/main/docs/community-routing-v3.md

[^1_119]: https://arxiv.org/html/2604.08560v1

[^1_120]: https://github.com/clinc/oos-eval/blob/master/LICENSE

[^1_121]: https://github.com/Owen150/massive-dataset

[^1_122]: https://www.amazon.science/code-and-datasets/massive

[^1_123]: https://github.com/alexa/massive/blob/main/README.md

[^1_124]: https://github.com/clinc/oos-eval

[^1_125]: https://www.kaggle.com/datasets/hongtrung/clinc150-dataset/data

[^1_126]: http://www.jarrar.info/Talks/ArBanking_slides.pdf

[^1_127]: https://huggingface.co/SinaLab/ArBanking77

[^1_128]: https://aclanthology.org/2023.arabicnlp-1.22.pdf

[^1_129]: https://huggingface.co/api/resolve-cache/datasets/najdresearch/system-one/788bc10036f4e253ff18f0f926b920ce95f1ef73/clearance.json?download=true\&etag="5c0cc51ce43d954bf18d733668e5a6ec14c7241c"

[^1_130]: https://defined.ai/datasets/jordanian-arabic-spontaneous-dialogue-telco

[^1_131]: https://huggingface.co/datasets/InfoBayAI/Arabic_Call_Center_Audio_Dataset_Dual_Channel

[^1_132]: https://proceedings.neurips.cc/paper_files/paper/2025/file/b8946cbd97fcc555a28810aee63e525a-Paper-Datasets_and_Benchmarks_Track.pdf

[^1_133]: https://arxiv.org/html/2407.09818v1

[^1_134]: https://arxiv.org/html/2403.04280v2

[^1_135]: https://aclanthology.org/events/arabicnlp-2023/

[^1_136]: https://github.com/aahrong/banking77

[^1_137]: https://arabic.ai/data-services/

[^1_138]: https://huggingface.co/datasets/najdresearch/system-one/blame/main/clearance.json

[^1_139]: https://huggingface.co/aablaess/SAV-xlm-Roberta

[^1_140]: https://jarrar.info/Talks/ArBanking_Poster.pdf

[^1_141]: https://aclanthology.org/2020.lrec-1.523.pdf

[^1_142]: https://jarrar.info/publications/TKM24.pdf

[^1_143]: https://huggingface.co/datasets/MohamedRashad/arabic-english-code-switching/blob/main/README.md

[^1_144]: https://ar5iv.labs.arxiv.org/html/2211.12000

[^1_145]: https://huggingface.co/datasets/Arabic-STT/Casablanca

[^1_146]: https://www.scitepress.org/Papers/2026/144577/144577.pdf

[^1_147]: https://aclanthology.org/2026.lrec-1.463.pdf

[^1_148]: https://aclanthology.org/2025.arabicnlp-sharedtasks.99.pdf

[^1_149]: https://github.com/h9-tec/Arabic-Speech-Handbook

[^1_150]: https://huggingface.co/datasets/UBC-NLP/Casablanca/tree/main/Algeria

[^1_151]: https://ar5iv.labs.arxiv.org/html/2210.06990

[^1_152]: https://huggingface.co/datasets/UBC-NLP/Casablanca/tree/main

[^1_153]: https://www.isca-archive.org/interspeech_2025/wang25_interspeech.pdf

[^1_154]: https://www.alphaxiv.org/abs/2410.04527

[^1_155]: https://www.bayanatlabs.com/insights/arabic-speech-datasets

[^1_156]: https://aclanthology.org/2026.vardial-1.22.pdf

[^1_157]: https://huggingface.co/datasets/IbrahimAlAzhar/limitation-generation-dataset-bagels/blame/main/ACL_24_no_limitation/ACL_24_1002.json

[^1_158]: https://aclanthology.org/2024.arabicnlp-1.79.pdf

[^1_159]: https://openreview.net/pdf/7be2d16bf9982c9dd2dec26e751393494d244656.pdf

[^1_160]: https://nadi.dlnlp.ai/

[^1_161]: https://huggingface.co/datasets/ISLAM-PO/documents-Egyptian-Arabic

[^1_162]: https://github.com/h9-tec/Awesome_Arabic_NLP

[^1_163]: https://arxiv.org/pdf/2205.09692v1.pdf

[^1_164]: https://www.madar.com/en_SA/official-certifications

[^1_165]: https://camel.abudhabi.nyu.edu/madar-coda-corpus/

[^1_166]: https://www.madar.com/en_SA/certifications

[^1_167]: https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/computational-approaches-to-modeling-language-lab/resources.html

[^1_168]: https://sina.birzeit.edu/currasat/about-en.html

[^1_169]: https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/computational-approaches-to-modeling-language-lab/research.html

[^1_170]: https://arxiv.org/html/2407.04910v1

[^1_171]: https://huggingface.co/datasets/google-research-datasets/taskmaster1/commit/3adf1adc7d2991bdef29063bfea24b3722014817

[^1_172]: https://deepwiki.com/budzianowski/multiwoz/8-license-and-contributing

[^1_173]: https://huggingface.co/datasets/google-research-datasets/taskmaster1/blob/3adf1adc7d2991bdef29063bfea24b3722014817/README.md?code=true

[^1_174]: https://huggingface.co/datasets/google-research-datasets/taskmaster1/blob/main/README.md

[^1_175]: https://github.com/budzianowski/multiwoz/blob/master/LICENSE

[^1_176]: https://github.com/google-research-datasets/Taskmaster/blob/master/TM-2-2020/README.md

[^1_177]: https://ar5iv.labs.arxiv.org/html/2310.20479

[^1_178]: https://github.com/budzianowski/multiwoz/blob/master/README.md

[^1_179]: https://huggingface.co/datasets/GEM/Taskmaster/raw/main/README.md

[^1_180]: https://github.com/google-research-datasets/Taskmaster/blob/master/TM-1-2019/README.md

[^1_181]: https://github.com/budzianowski/multiwoz

[^1_182]: https://github.com/google-research-datasets/Taskmaster/tree/master/TM-1-2019

[^1_183]: https://www.apache.org/licenses/

[^1_184]: https://httpd.apache.org/docs/current//license.html

[^1_185]: https://www.apache.org/licenses/LICENSE-2.0

[^1_186]: https://mozilladatacollective.com/datasets?page=3

[^1_187]: https://arxiv.org/html/1506.08909v3

[^1_188]: https://www.cs.mcgill.ca/~jpineau/files/lowe-dialoguediscourse-2017.pdf

[^1_189]: https://datacollective.mozillafoundation.org/datasets/cmn2cwq6k01d7o107ykckzpyr

[^1_190]: https://mozilladatacollective.com/datasets/cmn2g7uu701fqo1072r5na25l

[^1_191]: https://commonvoice.mozilla.org/en/datasets

[^1_192]: https://mozilladatacollective.com/organization/cmm3fmi6i00icnt07jsxlpf5p

[^1_193]: https://arxiv.org/pdf/1912.06670.pdf

[^1_194]: https://datacollective.mozillafoundation.org/datasets/cmn2al6jd01bvmm07tfcmt9k0

[^1_195]: https://huggingface.co/datasets/google/fleurs/blob/1712be137a62f4b1a69ce0c4820c0975bc7b6067/README.md?code=true

[^1_196]: https://www.speechdata.ai/datasets/arabic-msa

[^1_197]: https://huggingface.co/datasets/google/fleurs/blob/f6acb5c87858ace5ed9138562c377cedda34aeb6/README.md

[^1_198]: https://github.com/ryan-lowe

[^1_199]: https://datacollective.mozillafoundation.org/datasets/cmn38spwm005vmi07bejigyo6

[^1_200]: https://huggingface.co/datasets/google/fleurs/commit/d829e9610ee0c9e8d5be11fb197228926a3b38ff

[^1_201]: https://huggingface.co/datasets/AmazonScience/massive

[^1_202]: https://github.com/rkadlec/ubuntu-ranking-dataset-creator/blob/master/src/create_ubuntu_dataset.py

[^1_203]: https://github.com/SinaLab

[^1_204]: https://arxiv.org/html/1506.08909

[^1_205]: https://arxiv.org/html/1603.06127v4

[^1_206]: https://huggingface.co/datasets/AmazonScience/massive/blob/38830170b918d588b9666da887886e2eece28d14/ka-GE/massive-train.parquet

[^1_207]: https://github.com/EVASHINJI/Dialog-Datasets/blob/master/datasets/Ubuntu_Dialogue_Corpus_v2.md

[^1_208]: https://arxiv.org/html/2010.05572v1

[^1_209]: https://sina.birzeit.edu/arbanking77/arafinnlp/

[^1_210]: https://huggingface.co/datasets/AmazonScience/massive/discussions/1/files

[^1_211]: https://huggingface.co/datasets/AmazonScience/massive/blob/refs%2Fpr%2F1/LICENSE

[^1_212]: https://huggingface.co/datasets/AmazonScience/massive/tree/main

[^1_213]: https://github.com/rkadlec/ubuntu-ranking-dataset-creator

[^1_214]: https://github.com/rkadlec

[^1_215]: https://github.com/huggingface/datasets/commit/4049f5934faf0cdee887bcd9bd6ac6b9d0ef3e28

[^1_216]: https://arxiv.org/html/2601.13319v1

[^1_217]: https://www.dialectdata.com/dataset

[^1_218]: https://ar.arabicspeechcorpus.com/

[^1_219]: https://github.com/laurieburchell/open-lid-dataset/blob/main/licenses.md

[^1_220]: https://aclanthology.org/2024.lrec-main.436.pdf

[^1_221]: https://github.com/NNLP-IL/Arabic-Resources

[^1_222]: https://github.com/NNLP-IL/Arabic-Resources/blob/main/README.rst

[^1_223]: https://catalog.ldc.upenn.edu/LDC2019T01

[^1_224]: http://ldc-upenn.blogspot.com/2021/10/ldc-october-2021-newsletter.html

[^1_225]: https://catalog.ldc.upenn.edu/LDC2005S08

[^1_226]: https://aclanthology.org/2020.wanlp-1.15.pdf

[^1_227]: https://arxiv.org/abs/2609.34481v1

[^1_228]: https://huggingface.co/datasets/ArSyra/arsyra-levantine

[^1_229]: https://github.com/yrestom/nlp-masader

[^1_230]: https://github.com/google-research-datasets/dstc8-schema-guided-dialogue/blob/master/README.md

[^1_231]: https://aclanthology.org/events/acl-2020/

[^1_232]: https://github.com/google-research-datasets/dstc8-schema-guided-dialogue/blob/master/LICENSE.txt

[^1_233]: https://huggingface.co/datasets/choosealicense/licenses/blob/5e1d1e047a464730fffa8a1f588a1c790142063e/README.md

[^1_234]: https://arxiv.org/html/1909.05855v2

[^1_235]: https://aclanthology.org/people/michael-mccawley/unverified/

[^1_236]: https://github.com/tensorflow/datasets/blob/master/docs/catalog/schema_guided_dialogue.md

[^1_237]: https://aclanthology.org/2020.acl-main.600/

[^1_238]: https://aclanthology.org/people/andrzej-sakrajda/unverified/

[^1_239]: https://aclanthology.org/people/todd-ward/unverified/

[^1_240]: https://github.com/google-research-datasets

[^1_241]: https://github.com/google-research-datasets/dstc8-schema-guided-dialogue

[^1_242]: https://github.com/google-research-datasets/tydiqa/blob/master/CONTRIBUTING.md

[^1_243]: https://github.com/google-research/google-research

[^1_244]: https://github.com/google-research-datasets/tydiqa/security

[^1_245]: https://huggingface.co/datasets/SEACrowd/tydiqa

[^1_246]: https://github.com/google-research-datasets/tydiqa

[^1_247]: https://github.com/google-research-datasets/RxR/blob/main/LICENSE

[^1_248]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9138168/

[^1_249]: https://www.tensorflow.org/datasets/catalog/tydi_qa

[^1_250]: https://patch-diff.githubusercontent.com/raw/huggingface/datasets/pull/2518.patch

[^1_251]: https://www.alphaxiv.org/abs/2003.05002

[^1_252]: https://github.com/google-research-datasets/tydiqa-wana

[^1_253]: https://huggingface.co/clips/mfaq

[^1_254]: https://huggingface.co/datasets/copenlu/answerable_tydiqa/blob/main/dataset_infos.json

[^1_255]: https://arxiv.org/html/2507.17709v1

[^1_256]: https://arxiv.org/html/2008.09335

[^1_257]: https://www.uantwerpen.be/en/research-groups/clips/research/computational-linguistics/compling-resources/compling-datasets/

[^1_258]: https://arxiv.org/html/2109.12870v2

[^1_259]: https://huggingface.co/datasets?license=license:cc-by-nc-4.0

[^1_260]: https://huggingface.co/datasets?license=license:cc-by-4.0

[^1_261]: https://huggingface.co/api/resolve-cache/models/clips/mfaq/be8a8cbab0827d14663b2558b663d30912939646/README.md?download=true\&etag="326734375c1324c5c0e9dd212be48cc89cb80652"

[^1_262]: https://github.com/clips/mfaq

[^1_263]: https://huggingface.co/datasets/clips/mfaq/blame/c0ccbc03a0c5d25c656053c5e5c821ebafbbc899/all_flat/mfaq-train-00002-of-00004.parquet

[^1_264]: https://github.com/huggingface/faq

[^1_265]: https://relate.racai.ro/index.php?path=repository/resource\&resource=R10120

[^1_266]: https://huggingface.co/datasets/clips/mfaq

[^1_267]: https://huggingface.co/datasets/clips/mfaq/tree/08c1c623c387aaa55145ea731cae5597d44a5eb4/vi_flat

[^1_268]: https://huggingface.co/datasets/clips/mfaq/tree/main

[^1_269]: https://huggingface.co/datasets/clips/mfaq/tree/30b3378cbe9d573f65c1511be862834d360b6bad

[^1_270]: https://huggingface.co/datasets/MohamedRashad/MASC-Arabic/discussions/3

[^1_271]: https://huggingface.co/datasets/arbml/SenZi

[^1_272]: https://huggingface.co/datasets/MohamedRashad/MASC-Arabic

[^1_273]: https://huggingface.co/datasets/abdusah/masc

[^1_274]: https://github.com/GU-CLASP

[^1_275]: https://www.databazaar.io/datasets/10a0d619-3a20-4ee1-a21c-592f89d7570f

[^1_276]: https://huggingface.co/datasets/pain/MASC/commit/cff6e0f07d01a02a67d912ae8ed27f3a20ddd3e3

[^1_277]: https://huggingface.co/datasets/hirundo-io/MASC

[^1_278]: https://huggingface.co/datasets/abdusah/masc_dev/raw/main/README.md

[^1_279]: https://huggingface.co/datasets/pain/MASC

[^1_280]: https://huggingface.co/datasets/abdusah/masc_dev

[^1_281]: https://huggingface.co/ArabicSpeech

[^1_282]: https://github.com/GU-CLASP/shami-corpus

[^1_283]: https://huggingface.co/datasets/MohamedRashad/MASC-Arabic/commit/d8e7fb401bc1139a402b48317c4561d5aae14e60

[^1_284]: https://huggingface.co/datasets/Manar5112000/MASC

[^1_285]: https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset/blob/refs%2Fpr%2F3/README.md

[^1_286]: https://huggingface.co/datasets/bitext/Bitext-media-llm-chatbot-training-dataset

[^1_287]: https://huggingface.co/datasets/bitext/Bitext-retail-ecommerce-llm-chatbot-training-dataset/blob/12dd624ddcd3057382b2faad661bcda1fa869491/README.md

[^1_288]: https://www.icck.org/article/abs/tmi.2026.469770

[^1_289]: https://huggingface.co/datasets/ljoaql/Bitext-customer-support-llm-chatbot-training-dataset/blob/main/README.md

[^1_290]: https://huggingface.co/datasets/achrafgasmi/Bitext-customer-support-llm-chatbot-training-dataset/blame/main/README.md

[^1_291]: https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset/blob/main/README.md

[^1_292]: https://huggingface.co/datasets?other=llm

[^1_293]: https://huggingface.co/datasets/bitext/Bitext-media-llm-chatbot-training-dataset/raw/main/README.md

[^1_294]: https://github.com/audichandra/Indonesian_AI_Chatbot_Customer_Support/commit/7d9ddd4ce6419c7f4e8f2453a77f5a0232d236b6

[^1_295]: https://ciir.cs.umass.edu/downloads/msdialog/

[^1_296]: http://www.kaggle.com/thoughtvector/customer-support-on-twitter/home

[^1_297]: https://berd-platform.de/records/4c9xb-k5q03

[^1_298]: https://github.com/vishvadesai9/customer-support-tweets-analysis/blob/master/README.md

[^1_299]: https://www.kaggle.com/datasets/jeromeblanchet/sharc-nlp-dataset

[^1_300]: https://www.kaggle.com/jeromeblanchet/sharc-nlp-dataset/metadata

[^1_301]: https://huggingface.co/datasets/UCLNLP/sharc/blame/main/sharc.py

[^1_302]: https://github.com/sharc-md/sharc/releases

[^1_303]: https://sharc-data.github.io/

[^1_304]: https://sharc-data.github.io/data.html

[^1_305]: https://arxiv.org/html/2102.08633v3

[^1_306]: https://arxiv.org/html/1909.03759

[^1_307]: https://arxiv.org/html/2010.01838v3

[^1_308]: https://github.com/sharc-md/sharc

[^1_309]: https://huggingface.co/datasets/IBM/doc2dial/blob/main/doc2dial.py

[^1_310]: https://arxiv.org/html/2305.03007

[^1_311]: https://arxiv.org/html/2305.08371

[^1_312]: https://github.com/Barbariandev/MANTIS

[^1_313]: https://github.com/Guzpenha/MANtIS

[^1_314]: https://github.com/google/mantis/blob/876a0c8c6b92c92f34e0041b7dbbc0e4cccddc52/LICENSE

[^1_315]: https://github.com/OSU-SRLab/MANTIS

[^1_316]: https://github.com/Guzpenha/MANtIS/blob/master/README.md

[^1_317]: https://github.com/ropensci/mantis

[^1_318]: https://github.com/google/mantis

[^1_319]: https://aclanthology.org/2026.acl-long.1515/

[^1_320]: https://github.com/gzhhhhhhh/Mantis

[^1_321]: https://ropensci.r-universe.dev/mantis/doc/manual.html

[^1_322]: https://europepmc.org/article/pmc/8170692

[^1_323]: https://huggingface.co/datasets/PolyAI/banking77/commit/ea95213633609499a1c555a0df8a3f90874985a7

[^1_324]: https://huggingface.co/datasets/PolyAI/banking77/blob/96a234bd25c04939c4a79213eb764ae90e4d0d81/banking77.py

[^1_325]: https://huggingface.co/datasets/PolyAI/banking77/tree/205fa9903b6f9d7de925a5d0acba085a63421647

[^1_326]: https://huggingface.co/datasets/PolyAI/banking77/resolve/main/banking77.py?download=true

[^1_327]: https://huggingface.co/datasets/PolyAI/banking77/tree/830c4f2be6949546b11fe83fbc50993348a2bccd

[^1_328]: https://huggingface.co/datasets/Sangal/banking77

[^1_329]: https://github.com/doc2dial

[^1_330]: https://huggingface.co/datasets/mandylala/banking77

[^1_331]: https://huggingface.co/api/resolve-cache/datasets/IBM/doc2dial/acede68c6c2c5e9bd276035144133d3896ba5527/doc2dial.py?download=true\&etag="ecf35c6d294b949478633700331ab1acace38897"

[^1_332]: https://huggingface.co/datasets/c2d-usp/banking77-pt-br

[^1_333]: https://www.unitxt.ai/en/1.11.0/catalog/catalog.cards.banking77.html

[^1_334]: https://huggingface.co/datasets/PolyAI/banking77

[^1_335]: https://huggingface.co/datasets/Arabic-STT/mgb2

[^1_336]: https://huggingface.co/datasets/QCRI/mgb2/tree/main/dev

[^1_337]: https://github.com/openjournals/joss-reviews/issues/8432

[^1_338]: https://huggingface.co/datasets/MBZUAI/NADI-2025-Sub-task-3-all/tree/main/data

[^1_339]: https://arxiv.org/html/2509.02038v1

[^1_340]: https://camel.abudhabi.nyu.edu/madar-shared-task-2019/

[^1_341]: https://aclanthology.org/2025.arabicnlp-sharedtasks.103.pdf

[^1_342]: https://camel.abudhabi.nyu.edu/madar-parallel-corpus/

[^1_343]: https://huggingface.co/datasets/UBC-NLP/NADI2025_subtask2_ASR

[^1_344]: https://arxiv.org/html/2511.10090

[^1_345]: https://github.com/rafiulbiswas/NADI

[^1_346]: https://huggingface.co/datasets/QCRI/mgb2

[^1_347]: https://www.dialectdata.com/

[^1_348]: http://www.jarrar.info/Talks/LREC2022_CurrasBaladi_poster.pdf

[^1_349]: https://www.futurebeeai.com/dataset/text-dataset/arabic-telecom-domain-conversation-text-dataset

[^1_350]: https://arxiv.org/abs/2205.09692

[^1_351]: https://pangeanic.com/arabic-datasets-for-ai-training

[^1_352]: https://www.mendeley.com/catalogue/c3c4c8a3-7f0f-36c7-be4a-3e86167c08c6/

[^1_353]: https://lrec.elra.info/lrec2022-main-082

[^1_354]: https://aclanthology.org/2025.wacl-1.12.pdf

[^1_355]: https://github.com/InfoBay-AI/Call_center_audio_dual_channel_ar

[^1_356]: https://aclanthology.org/2025.findings-emnlp.1359.pdf

[^1_357]: https://www.kaggle.com/datasets/aqlomate/arsyra-complete

[^1_358]: https://github.com/yousefkhaled2005/arabic-dialect-dataset/blob/main/LICENSE

[^1_359]: https://balady.gov.sa/en/services/my-licenses

[^1_360]: https://github.com/mikolajkrzyminski/dstc11-track2-intent-induction-data-augmentation/blob/main/NOTICE

[^1_361]: https://huggingface.co/datasets/GEM/Taskmaster/blob/main/README.md

[^1_362]: https://huggingface.co/datasets/splevine/dstc11-intent/blob/c2a3921178940aeffebdfa589d602c82ecee2a52/README.md

[^1_363]: https://github.com/asappresearch/abcd/blob/master/data/abcd_v1.1.json.gz

[^1_364]: https://aclanthology.org/anthology-files/anthology-files/pdf/dstc/2023.dstc-1.27.pdf

[^1_365]: https://github.com/amazon-science/dstc11-track2-intent-induction/blob/main/dstc11/task1-intent-clustering.md

[^1_366]: https://github.com/google-research-datasets/Taskmaster

[^1_367]: https://www.amazon.science/code-and-datasets/intent-induction-from-conversations-for-task-oriented-dialogue

[^1_368]: https://huggingface.co/datasets/GEM/Taskmaster/blob/1f5d2f115fcfb722306f929bcdba21fb1fe6b0b8/Taskmaster.json

[^1_369]: https://github.com/amazon-science/dstc11-track2-intent-induction

[^1_370]: https://github.com/PolyAI-LDN/task-specific-datasets/blob/master/README.md

[^1_371]: https://arxiv.org/html/2204.13021v3

[^1_372]: https://huggingface.co/datasets/AmazonScience/massive/blob/main/massive.py

[^1_373]: https://huggingface.co/datasets/AmazonScience/massive/blob/cbd1bcde8157e2b00066f28d7779546a1239dcc2/all_1.1/massive-train.parquet

[^1_374]: https://huggingface.co/datasets/AmazonScience/massive/commit/afae233f9bfa81b875488373ea7b4f5ddfd78a15

[^1_375]: https://www.kaggle.com/datasets/hongtrung/clinc150-dataset

[^1_376]: https://huggingface.co/datasets/AmazonScience/massive/tree/cbd1bcde8157e2b00066f28d7779546a1239dcc2/all_1.1/train

[^1_377]: https://academ.us/article/2607.07974/

[^1_378]: https://github.com/PolyAI-LDN/task-specific-datasets

[^1_379]: https://arxiv.org/html/1909.02027v1

[^1_380]: https://blog.mozilla.org/en/mozilla/news/sharing-our-common-voices-mozilla-releases-the-largest-to-date-public-domain-transcribed-voice-dataset/

[^1_381]: https://blog.mozilla.org/blogarchive/blog/2019/02/28/sharing-our-common-voices-mozilla-releases-the-largest-to-date-public-domain-transcribed-voice-dataset/

[^1_382]: https://huggingface.co/datasets/legacy-datasets/common_voice

[^1_383]: https://datacollective.mozillafoundation.org/datasets/cmflnuzw6rmzpir0027ia3ksl

[^1_384]: https://mozilladatacollective.com/datasets/cmqinoh7z00wsnr07v5ixz5uo

[^1_385]: https://abacus.library.ubc.ca/dataset.xhtml?persistentId=hdl:11272.1/AB2/J3CPAE\&version=\&q=\&fileTypeGroupFacet=\&fileAccess=Restricted

[^1_386]: https://www.bayanatlabs.com/insights/egyptian-arabic-data

[^1_387]: https://catalog.ldc.upenn.edu/LDC97S45/

[^1_388]: https://catalog.ldc.upenn.edu/LDC97T19

[^1_389]: https://www.cis.upenn.edu/~ccb/publications/callhome-egyptian-arabic-speech-translations.pdf

[^1_390]: https://www.speechdata.ai/datasets/arabic-egyptian

[^1_391]: https://abacus.library.ubc.ca/dataset.xhtml?persistentId=hdl:11272.1/AB2/J3CPAE\&version=\&q=\&fileTypeGroupFacet="Text"\&fileAccess=Restricted\&fileTag=\&fileSortField=size\&fileSortOrder=

[^1_392]: https://list.elra.info/mailman3/hyperkitty/list/corpora@list.elra.info/thread/NXXCJFTH4XBIL6ROM3UKNKLQQEAQSHGW/

[^1_393]: https://www.bayanatlabs.com/insights/commercial-arabic-datasets

[^1_394]: https://catalog.ldc.upenn.edu/license/l2-ksu-native-and-non-native-arabic-speech-agreement.pdf

[^1_395]: https://catalog.ldc.upenn.edu/docs/LDC2014S02/KSU-Rich-Arabic-Speech-Database.pdf

[^1_396]: https://link.springer.com/content/pdf/10.1007/s10579-026-09924-w.pdf

[^1_397]: https://huggingface.co/datasets/xmodar/commonvoice-12.0-arabic-voice-converted/resolve/main/README.md?download=true

[^1_398]: https://arxiv.org/pdf/2012.07073.pdf

[^1_399]: https://github.com/memnt01F/arabic-audio-deepfake-detection/blob/main/README.md

[^1_400]: https://www.bayanatlabs.com/insights/gulf-arabic-data

[^1_401]: https://huggingface.co/datasets/IWAN/L2-KSU-Dataset

[^1_402]: https://catalog.ldc.upenn.edu/LDC2014S02

[^1_403]: https://huggingface.co/datasets/MohamedRashad/MGB-3-Arabic/blob/main/README.md

[^1_404]: https://catalog.elda.org/en-us/repository/browse/ELRA-S0384/

[^1_405]: https://mozilladatacollective.com/datasets/cmrv0fgp00022nu077cdkkcny

[^1_406]: https://huggingface.co/datasets/MightyStudent/Egyptian-ASR-MGB-3

[^1_407]: https://raw.githubusercontent.com/ARBML/masader/refs/heads/main/datasets/mgb-3.json

[^1_408]: https://commonvoice.mozilla.org/bfd/datasets

[^1_409]: https://mozilladatacollective.com/datasets/cmqi97zao002anr07098afaeh

[^1_410]: https://dev.mozilladatacollective.com/organization/cmfcxdjte0000mn07hgikansn

[^1_411]: https://www.devclass.com/development/2024/07/30/stack-exchange-restricts-access-to-dump-of-user-contributed-data-critics-complain-this-contradicts-license/1625192

[^1_412]: https://www.devclass.com/ai-ml/2023/06/12/stack-overflow-strives-to-protect-community-content-from-ai-firms-striking-mods-say-re-enable-the-data-dumps/1624108

[^1_413]: https://meta.stackexchange.com/questions/402019/creative-commons-license-by-sa-violation-data-dump-must-not-force-users-to-ag

[^1_414]: https://stackoverflow.blog/2009/06/04/stack-overflow-creative-commons-data-dump/

[^1_415]: https://huggingface.co/datasets/ubuntu-dialogs-corpus/ubuntu_dialogs_corpus/blob/main/ubuntu_dialogs_corpus.py

[^1_416]: https://meta.stackexchange.com/questions/401324/announcing-a-change-to-the-data-dump-process

[^1_417]: https://www.brentozar.com/archive/2015/10/how-to-download-the-stack-overflow-database-via-bittorrent/

[^1_418]: https://archive.org/details/stackexchange

[^1_419]: https://huggingface.co/datasets/MakTek/Customer_support_faqs_dataset/raw/refs%2Fpr%2F2/README.md

[^1_420]: https://www.opendatabay.com/data/consumer/2f6b024e-ba68-48e2-ac0c-0a0db01aac46

[^1_421]: https://huggingface.co/datasets/MakTek/Customer_support_faqs_dataset/blob/main/README.md

[^1_422]: https://stackapps.com/help/data-dumps

[^1_423]: https://ar5iv.labs.arxiv.org/html/1510.03753

[^1_424]: https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets

[^1_425]: https://huggingface.co/datasets/MohamedRashad/arabic-english-code-switching/blame/main/README.md

[^1_426]: https://arxiv.org/pdf/2109.12595.pdf

[^1_427]: https://arxiv.org/html/2210.06990v3

[^1_428]: https://huggingface.co/api/resolve-cache/datasets/IBM/multidoc2dial/0c1d2e573b6a43b327745f2e63ba7da8e9b9f27d/multidoc2dial.py?download=true\&etag="b2aa112b4011f5d9a3ab223dad6e13de9953b790"

[^1_429]: https://github.com/ynandwan/pmi-faith

[^1_430]: https://arxiv.org/html/2104.00783v1

[^1_431]: https://github.com/uiuc-conversational-ai-lab/multiwoz-helper/blob/main/LICENSE

[^1_432]: https://github.com/budzianowski/multiwoz/blob/fe0c8e65/README.md?plain=1

[^1_433]: https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00609/118298/Multi3WOZ-A-Multilingual-Multi-Domain-Multi

[^1_434]: https://www.kaggle.com/datasets/namdcnguyen/multiwoz2-0

[^1_435]: https://gem-benchmark.com/data_cards/Taskmaster

[^1_436]: https://arxiv.org/html/2310.20479v1

[^1_437]: https://aclanthology.org/2021.naacl-main.239.pdf

[^1_438]: https://github.com/google-research-datasets/Taskmaster/blob/master/README.md

[^1_439]: https://ar5iv.labs.arxiv.org/html/2305.13040

[^1_440]: https://arxiv.org/html/2603.17217

[^1_441]: https://github.com/stanford-oval/schema-guided-dialogue

[^1_442]: https://www.bitext.com/documentation/

[^1_443]: https://gem-benchmark.com/data_cards/schema_guided_dialog

[^1_444]: https://www.bitext.com/contact-us/

[^1_445]: https://huggingface.co/datasets/google-research-datasets/schema_guided_dstc8/blob/main/schema_guided_dstc8.py

[^1_446]: https://huggingface.co/datasets/google-research-datasets/schema_guided_dstc8/blob/bf400d9a91201a3438b552cf95f0c20dd884b1bf/schema_guided_dstc8.py

[^1_447]: https://www.tensorflow.org/datasets/catalog/schema_guided_dialogue

[^1_448]: https://research.google/blog/introducing-the-schema-guided-dialogue-dataset-for-conversational-assistants/

[^1_449]: https://huggingface.co/datasets/google-research-datasets/schema_guided_dstc8/blame/refs%2Fpr%2F3/schema_guided_dstc8.py

[^1_450]: https://huggingface.co/datasets/google-research-datasets/schema_guided_dstc8/blame/8ed09f53b1bddc1fd4c8368b9d51fc0048704992/schema_guided_dstc8.py

[^1_451]: https://opendatalab.com/OpenDataLab/MultiWOZ

[^1_452]: https://github.com/GaneshGS/data-and-models

[^1_453]: https://aclanthology.org/2024.naacl-demo.4.pdf

[^1_454]: https://huggingface.co/datasets/cambridgeltl/multi3woz

[^1_455]: https://www.cs.hhu.de/fileadmin/redaktion/Fakultaeten/Mathematisch-Naturwissenschaftliche_Fakultaet/Informatik/Dialog_Systems_and_Machine_Learning/MultiWOZ_2018.pdf

[^1_456]: https://www.techscience.com/iasc/v39n5/58469/html

[^1_457]: https://figshare.com/articles/dataset/NADI_dataset/27935430

[^1_458]: https://aclanthology.org/anthology-files/pdf/arabicnlp/2024.arabicnlp-1.82.pdf

[^1_459]: https://github.com/nainiayoub/moroccan-darija-datasets

[^1_460]: https://www.kaggle.com/datasets/i191796majid/tweets

[^1_461]: https://github.com/Kaggle/kaggle-cli/blob/main/docs/datasets_metadata.md

[^1_462]: https://www.kaggle.com/datasets/smmmmmmmmmmmm/twitter-data

[^1_463]: https://opendatalab.com/OpenDataLab/Doc2Dial

[^1_464]: https://huggingface.co/datasets/IBM/doc2dial/blame/main/doc2dial.py

[^1_465]: https://huggingface.co/datasets/IBM/doc2dial/blob/10aaf0f14532c1953890662f1d05b5ee3f75bb27/doc2dial.py

[^1_466]: https://aclanthology.org/people/luis-lastras/unverified/

[^1_467]: https://help.formulatrix.com/mantis/5.1/Content/Administrative_Tasks/Licensing/Licensing.htm

[^1_468]: https://github.com/google/mantis/blob/main/LICENSE

[^1_469]: https://demo.cincom.com/MantisXML/License.html

[^1_470]: https://ibm.github.io/data-science-best-practices/license.html

[^1_471]: https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00599/117736/Intent-calibrated-Self-training-for-Answer

[^1_472]: https://arxiv.org/html/1703.03897v1

[^1_473]: https://meta.stackoverflow.com/questions/tagged/licensing?tab=Active

[^1_474]: https://meta.stackexchange.com/questions/333089/stack-exchange-and-stack-overflow-have-moved-to-cc-by-sa-4-0

[^1_475]: https://www.kaggle.com/datasets/kutayahin/stackoverflow-programming-questions-2020-2025

[^1_476]: https://huggingface.co/datasets/bigscience-data/roots_en_no_code_stackexchange

[^1_477]: https://github.com/kiv-air/StackOverflowDataset

[^1_478]: https://huggingface.co/datasets/camel-ai/seta-env-seed2synth-seed

[^1_479]: https://arxiv.org/html/2504.13128v2

[^1_480]: https://stackoverflow.co/data-licensing/

[^1_481]: https://en.wikipedia.org/wiki/Stack_Overflow

[^1_482]: https://aclanthology.org/2024.arabicnlp-1.38.pdf

[^1_483]: https://arxiv.org/pdf/2405.16482.pdf

[^1_484]: https://aclanthology.org/2024.arabicnlp-1.41.pdf

[^1_485]: https://www.cambridge.org/core/journals/natural-language-processing/article/darijabanking-a-new-resource-for-overcoming-language-barriers-in-banking-intent-detection-for-moroccan-arabic-speakers/CEA99875FE7F18DBFBE9E8F4DC5B64DB

[^1_486]: https://github.com/ZhenbinChan/HuggingFaceDatasets/blob/main/datasets/banking77/README.md

[^1_487]: https://huggingface.co/datasets/nomeda-lab/arabic-decision-benchmark

[^1_488]: https://databazaar.io/datasets/0a379db4-4ab9-467f-a801-c871dfacfe48

[^1_489]: https://huggingface.co/datasets/rajpurkar/squad_v2/blame/ae8fb9b654ebae3ff2cf0ab83b3fd3eef1bdf15b/squad_v2.py

[^1_490]: https://github.com/pragyakatyayan/SQuAD_v2.0_Dataset

[^1_491]: https://aclanthology.org/2020.lrec-1.667.pdf

[^1_492]: https://eureka.patsnap.com/patent/US20260170067A1

[^1_493]: https://gem-benchmark.com/data_cards/squad_v2

[^1_494]: https://datarepository.wolframcloud.com/resources/SQuAD-v2.0

[^1_495]: https://aclanthology.org/2025.emnlp-industry.34.pdf

[^1_496]: https://aclanthology.org/2022.dialdoc-1.7.pdf

[^1_497]: https://huggingface.co/datasets/rajpurkar/squad_v2/blob/90946e14182ad257766b93a4885c52f6226d9b70/squad_v2.py

[^1_498]: https://aclanthology.org/2025.gem-1.62/

[^1_499]: https://www.lrec-conf.org/proceedings/lrec-coling-2024/osact/pdf/2024.osact-1.12.pdf

[^1_500]: https://arxiv.org/html/2508.17347v1

[^1_501]: https://www.mutazyounes.com/2020.wanlp-1.22.pdf

[^1_502]: https://discourse.mozilla.org/t/common-voice-21-dataset-now-available/141629

[^1_503]: https://mozilladatacollective.com/datasets/cmn29yhin019imm075uejkq7p

[^1_504]: https://community.mozilladatacollective.com/common-voice-23-0-live-on-mozilla-data-collective/

[^1_505]: https://arxiv.org/html/1912.06670v2

[^1_506]: https://mozilladatacollective.com/datasets/cmrv0f62m001wnu077iwrjbbo

[^1_507]: https://huggingface.co/kadirnar/arabic-stt-runs

[^1_508]: https://www.bayanatlabs.com/insights/arabic-tts-datasets

[^1_509]: https://catalog.ldc.upenn.edu/LDC2005S07

[^1_510]: https://ieee-dataport.org/keywords/saudi-speech

[^1_511]: https://www.bayanatlabs.com/insights/saudi-arabic-dialects-ai

[^1_512]: https://huggingface.co/datasets/badrex/arabic-speech-SADA22-MSA/commit/8c3f90ad97d9aec4693a383f4de348897eda33cb

[^1_513]: https://aclanthology.org/2026.speakable-1.13.pdf

[^1_514]: https://huggingface.co/datasets/Sebssihakim/Clean_One_Speaker_SADA/blob/main/README.md

[^1_515]: https://huggingface.co/datasets/SalahAbdoNLP/arabic-dataset-quality-assessments

[^1_516]: https://github.com/EmmaDPaul/LLM-Projects/blob/main/Banking-Intent-Detection-Banking77/README.md

[^1_517]: https://huggingface.co/datasets/mteb/banking77

[^1_518]: https://nlp.johnsnowlabs.com/2022/09/28/finclf_bert_banking77_en.html

[^1_519]: https://huggingface.co/datasets/neuralfoundry-coder/clinc150-ko/blame/main/data/validation-00000-of-00001.parquet

[^1_520]: https://github.com/deepopen-com/deepopen

[^1_521]: https://arxiv.org/html/2603.18641

[^1_522]: https://metatext.io/datasets/clinc/clinc_oos

[^1_523]: https://ar5iv.labs.arxiv.org/html/2607.07974

[^1_524]: https://github.com/bavard-ai/nlu-meta-dataset

[^1_525]: https://github.com/salesforce/DialogStudio/blob/main/Dataset_Stats.csv

[^1_526]: https://github.com/baobab-tech/decision-models-experiments/blob/main/experiments/common/datasets.md

[^1_527]: https://huggingface.co/datasets/m-lagnajit/calibrated-typed-decisions

