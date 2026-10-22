
# Research, with citations from official legal texts and reputable legal analyses, the data-protection requirements for a customer-support web application operating in Lebanon that stores customers' names, phone numbers, contracts, support conversations, voice recordings, and uploaded screenshots, and that uses approved, anonymized conversations to train machine-learning models.

Cover:

1. Lebanese Law No. 81/2018 (electronic transactions and personal data): the obligations that apply (consent, purpose limitation, data-subject rights, registration or declaration requirements with the authorities, security duties, cross-border transfers, penalties), and its current enforcement status.
2. When GDPR would also apply (e.g., EU customers), and the GDPR obligations most relevant here.
3. Consent requirements for recording voice and for using conversations to train AI models; how to word consent notices and allow opt-out.
4. Data retention: reasonable retention periods for tickets, recordings, attachments, and logs.
5. Hosting data outside Lebanon (cloud providers in the EU or US): what is allowed.
6. A practical compliance checklist for a small company, and a template structure for a privacy policy.

OUTPUT: a summary per topic with citations, a compliance checklist, and a list of points that require a lawyer's confirmation. Mark anything unverified. This is for an educational/portfolio project; note where real deployment needs professional legal advice.

**Lebanese Law No. 81/2018 applies to this application’s handling of identifiable customer information, but it is not a GDPR-equivalent regime: its consent rules, filing exemptions, enforcement structure, and international-transfer provisions differ materially.** GDPR may apply additionally where the business has a relevant EU establishment, targets people in the EU, or monitors their behaviour there—not simply because a customer holds EU citizenship.[^1_1][^1_2][^1_3]

**Scope:** Educational research, reviewed against sources available on **22 October 2026**, not a deployment-ready legal opinion. Below, **Recommendation** means a proposed operational safeguard rather than a statutory requirement; **Unverified** identifies matters that could not be confirmed reliably, particularly current Lebanese administrative practice, case law, and possible adjustments to monetary penalties.

## Lebanese law requirements

### Coverage and core obligations

Names, telephone numbers, identifiable contracts, conversations, recordings, and screenshots fall within the law’s broad definition of personal data, including information that identifies someone indirectly through comparison with other information; the personal-data provisions cover automated and non-automated processing, subject to a personal/private-activity exception. Calling a project “educational” or “portfolio” does not itself establish that exception for a publicly operated application collecting real customers’ information.[^1_1]


| Topic | Legal position and application |
| :-- | :-- |
| **Consent** | The law does **not** establish a comprehensive GDPR-style definition and universal consent framework; consent instead appears in particular provisions, including the sensitive-information exception in Article 91, the objection limitation in Article 92, and the filing exemption in Article 94(7).[^1_1][^1_2] Therefore, neither “consent is always required” nor “a privacy policy authorizes everything” is a reliable statement of Lebanese law.[^1_1] |
| **Purpose limitation** | Article 87 requires fair collection for legitimate, specific, explicit purposes, relevant and non-excessive information, and accurate/up-to-date data; incompatible subsequent processing is prohibited, with an exception concerning statistical, historical, or research purposes.[^1_1] **Recommendation:** Treat customer support and AI development as separate purposes; do not assume that ordinary product improvement or a portfolio project automatically qualifies for the research exception.[^1_1] |
| **Collection notices** | Article 88 requires identification of the controller/representative, purposes, mandatory versus optional answers, consequences of not answering, recipients, and access/correction rights and procedures; collection forms must clearly include this information.[^1_1] Article 89 addresses information obtained indirectly, subject to specified exceptions.[^1_1] |
| **Security** | Article 93 requires measures appropriate to the information and processing risks to prevent alteration, damage, and unauthorized access; it does not prescribe a detailed technical-control catalogue.[^1_1][^1_2] |
| **Retention** | Article 90 links lawful storage to the period stated in the declaration or authorization decision; it does not prescribe a universal ticket or recording retention period.[^1_1] **Lawyer confirmation:** How Article 90 should be implemented where processing is exempt from filing.[^1_1] |
| **Sensitive information** | Article 91 specially restricts information revealing health, genetic identity, or sexual life, with enumerated exceptions; Article 97 establishes authorization arrangements for these and certain security/criminal/judicial processing.[^1_1] A screenshot or support message can inadvertently introduce such information.[^1_1] |
| **Automated assessments** | Article 86 provides access/objection rights concerning information and analyses used in relevant automated processing, and restricts judicial or administrative decisions based solely on specified automated assessments; this is not the same rule as GDPR Article 22.[^1_1][^1_3] |

**Recommendation:** Separate ordinary support records from contracts, recordings, attachments, and training datasets, with distinct permissions and deletion rules. For screenshots, warn users not to submit passwords, payment-card details, identification documents, third-party information, or health information unless specifically necessary; this operationalizes the law’s proportionality and security requirements.[^1_1]

### Data-subject rights

Articles 99–102 provide access and intelligible copies, information about processing, correction/completion/updating, and erasure of information that is inaccurate, incomplete, obsolete, incompatible with the processing purpose, or unlawfully processed; certain rights also extend to heirs. These are **not an unrestricted right to delete every record on demand**, nor does the reviewed chapter establish a GDPR-equivalent general portability right.[^1_1]

Article 101 specifies action on qualifying correction-related requests within **10 days**, while Article 107 penalizes refusal to answer access/correction requests within **10 working days**, or incorrect/incomplete responses. **Recommendation:** Use an internal deadline of **10 calendar days** for both, with identity verification and escalation, rather than relying on the difference in wording.[^1_1]

Article 92 permits objection for legitimate reasons, including commercial promotion, but expressly limits that right where collection is legally required or the individual has agreed to processing; the text does not reproduce GDPR’s express consent-withdrawal mechanism. **Recommendation:** Nevertheless offer withdrawal of optional recording and AI permissions as a contractual product commitment—and as a legal requirement whenever GDPR consent is relied upon.[^1_3][^1_1]

### Declaration and authorization

**There is no automatic rule that every customer-support application must register.** Article 94 contains important exemptions, including processing about customers within the limits and needs of lawful business activities, and processing previously agreed to by the individual, subject to legal prohibitions.[^1_2][^1_1]


| Situation | Requirement |
| :-- | :-- |
| Ordinary customer-support processing | Article 94(6)’s customer/business-activity exemption may apply; obtain a written assessment rather than assuming that every recording, attachment, or AI use falls within it.[^1_1] |
| Prior customer agreement | Article 94(7) provides another exemption, unless legally prohibited; this does not remove substantive duties such as notice, purpose limitation, rights, and security.[^1_1] |
| Non-exempt processing | Article 95 requires a declaration to the **Ministry of Economy and Trade**, against receipt.[^1_1] |
| Declaration contents | Article 96 includes purposes, information and sources, people concerned, recipients, retention, controller/representative, systems, access arrangements, subcontractors, interconnections, foreign transfers, and security/confidentiality safeguards.[^1_1] |
| Special authorization | Article 97 names the relevant ministers: Defence/Interior for specified state-security processing, Justice for criminal/judicial processing, and Public Health for health/genetic/sexual-life information; the decision period is **two months**, with silence treated as refusal.[^1_1] |

**Lawyer confirmation:** The interaction between Article 91’s exceptions, Article 94’s declaration/authorization exemptions, and Article 97 is particularly important if sensitive material is accepted. Generic summaries sometimes compress these into “a Ministry permit,” whereas the statutory text distinguishes declarations from category-specific ministerial authorizations.[^1_2][^1_1]

### Penalties and enforcement

The **2018 statutory text** provides these penalties; **their currently payable monetary amounts are unverified**, including whether subsequent general legislation adjusts them.[^1_1]


| Provision | Penalty in the reviewed text |
| :-- | :-- |
| Article 106 | **LBP 1 million–30 million**, imprisonment **three months–three years**, or either penalty, for specified filing/authorization violations, violations of collection/processing rules, or unauthorized disclosure—including negligent disclosure.[^1_1] |
| Article 107 | **LBP 1 million–15 million** for specified failures concerning access/correction requests.[^1_1] |
| Article 108 | Repeat-offence penalties increased by **one-third to one-half**.[^1_1] |
| Article 109 | Prosecution of specified disclosure and rights-response offences requires an injured party’s complaint, with particular consequences for withdrawal before final judgment.[^1_1] |

The law does not establish an independent GDPR-style supervisory authority; DLA Piper describes enforcement through courts and prosecutors rather than an administrative-enforcement system, but expressly warns that its Lebanon chapter was last reviewed in **2022**. The Ministry currently exposes a personal-data page stating that it publishes processing declarations under Article 98, so a categorical claim that “there is no filing mechanism at all” is not supported.[^1_4][^1_2]

**Unverified as of the research date:** Actual filing turnaround, current forms and submission channels, the completeness of the Ministry register, recent prosecutions, enforcement frequency, and all post-2022 implementing changes. The available sources do **not** justify treating the law as suspended or optional merely because enforcement may be limited.[^1_4][^1_2][^1_1]

## When GDPR also applies

GDPR territorial scope turns on the relevant processing activity and its connection to the EU, not nationality alone.[^1_3]


| Scenario | GDPR implications |
| :-- | :-- |
| Relevant EU establishment | Processing in the context of that establishment’s activities can fall under Article 3(1), even if servers and support staff are in Lebanon.[^1_3] |
| Targeted EU service | A Lebanese business deliberately offering goods/services to people **in the EU** can fall under Article 3(2)(a), including free services; EU-focused advertising, ordering arrangements, and other targeting indicators matter.[^1_3] |
| Behavioural monitoring | Tracking/profiling people’s behaviour occurring in the EU can trigger Article 3(2)(b).[^1_3] |
| Incidental EU visitor/customer | Mere website accessibility from the EU, or EU citizenship alone, is insufficient to establish targeting.[^1_3] |
| Processing for an EU business | An EU client may need an Article 28 processing agreement and a lawful international-transfer arrangement; the Lebanese supplier’s own direct territorial exposure still requires a separate assessment.[^1_3][^1_5] |
| EU cloud hosting | An EU processor’s obligations do not, by themselves, establish that its Lebanese customer is an EU-established controller; hosting and territorial scope are separate questions.[^1_3] |

### Relevant GDPR obligations

| Area | Practical implications |
| :-- | :-- |
| **Roles and lawful bases** | Identify the controller and processor for each purpose and a lawful basis under Article 6; necessary support may use contract or, where appropriate, legitimate interests, while optional AI reuse needs its own assessment.[^1_3] A processor that determines its own training purposes may become a controller for that processing—client permission alone does not settle the issue.[^1_3] |
| **Transparency and rights** | Provide Articles 13–14 notices; implement access, correction, qualified erasure/restriction, objection, and applicable portability rights; normally respond within **one month**, with permitted extensions and safeguards.[^1_3] Where Lebanese law also applies, design around its shorter relevant deadline.[^1_1] |
| **Consent** | Consent must be freely given, specific, informed, unambiguous, demonstrable, and as easy to withdraw as to give; no preselected optional boxes.[^1_3] |
| **Special-category information** | Health and other Article 9 categories require an additional exception beyond Article 6; an ordinary voice recording is not automatically special-category biometric information merely because it contains a voice, but biometric processing for unique identification changes the analysis.[^1_3] |
| **Vendors and security** | Use Article 28 agreements, subprocessor controls, privacy by design/default, appropriate security, deletion/return arrangements, and international-transfer safeguards where applicable.[^1_3] |
| **Records and accountability** | Maintain processing records; the under-250-employees exception is limited and generally does not excuse routine, non-occasional support processing.[^1_3] |
| **DPIA, representative, DPO** | Conduct a DPIA where processing is likely high risk; Article 3(2) exposure can require an EU representative unless an exception applies; a DPO is required only where the relevant statutory triggers are met—not for every small company.[^1_3] |
| **Incidents** | Notify the supervisory authority within **72 hours of awareness**, where feasible, unless the breach is unlikely to risk individuals’ rights; communicate high-risk breaches to affected people without undue delay; processors notify controllers without undue delay.[^1_3] |
| **Automated decisions** | Article 22 becomes relevant to solely automated decisions producing legal or similarly significant effects, not automatically every support classifier or response suggestion.[^1_3] |

GDPR’s higher maximum administrative-fine tier is **EUR 20 million or 4% of worldwide annual turnover, whichever is higher**, for specified infringements; lower-tier infringements have different maxima. The reviewed Lebanese general regime does not contain a comparable general breach-notification deadline, but sectoral, contractual, and GDPR duties may still apply.[^1_2][^1_3]

## Recording and AI consent

### Voice recordings

Lebanon’s Law No. 140/1999 protects communications secrecy and regulates interception; official Lebanese legal commentary and the Council of Europe identify unlawful interception as a separate legal issue. **Unverified:** Whether and on what conditions a participant business may record each proposed support-call format, and whether affirmative agreement alone is legally sufficient; the reviewed sources do not establish a simple universal Lebanese “one-party” or “all-party” rule.[^1_6][^1_7]

**Recommendation pending legal review:** Obtain affirmative agreement from everyone recorded **before substantive recording starts**, offer equivalent unrecorded support, and provide separate staff information and appropriate employment-law safeguards. GDPR consent must be genuinely optional if it is the chosen basis; consent is not the only potentially available GDPR basis, and customer permission does not resolve employee or communications-secrecy issues.[^1_7][^1_3]

**Suggested recording notice — original template:**

> “[Company legal name] would like to record this support call to document your request and review service quality. Only authorized support staff and our contracted service providers can access it. We normally delete the recording after 30 days, unless a documented legal requirement or dispute requires longer retention. Recording is optional: you can receive support without it. This permission does not authorize AI training. Do you agree to recording? You can ask us to stop at any time. Full details: [privacy-policy link].”

**Implementation recommendation:** Use “Agree to recording” and “Continue without recording” controls, keep the notice version/time/choice, and distinguish stopping future recording from requesting deletion of an existing recording. The retention and access claims in the notice must match actual configuration; longer retention still needs a valid justification.[^1_3][^1_1]

For an **uploaded voice message**, present equivalent information before upload and discourage recording other people; do not treat microphone permission or an upload action as unlimited permission for unrelated reuse.[^1_3][^1_1]

### AI-training permission

**Internal approval is not customer consent, and removing names is not necessarily anonymization.** Under GDPR, pseudonymized information remains personal data, and the EDPB warns that models trained on personal information are not automatically anonymous; identification and extraction risks require a documented, case-specific assessment.[^1_8][^1_3]

**Recommendation for this project:** Use a separate, unchecked, per-conversation AI permission, followed by staff review and genuine anonymization; exclude raw audio, contracts, and screenshots from the training pipeline by default. This is a conservative design choice—not a claim that GDPR always requires consent for every AI-training operation: the EDPB recognizes that legitimate interests may sometimes work after a proper necessity and balancing assessment.[^1_9][^1_8]

**Suggested AI notice — original template:**

> **Optional: help improve support AI**
>
> “I agree that [Company legal name] may select the text of this support conversation, review it, and process it to create anonymized examples for training and evaluating its customer-support models. This permission does not include my contracts, screenshots, or voice recordings. Saying no will not affect my support.
>
> “I can withdraw this permission in Privacy settings or through [contact method] before the example is irreversibly anonymized. After genuine anonymization, the example cannot be linked back to me. The privacy notice explains the safeguards, providers involved, and retention periods.”

Before using that wording, verify that anonymity is actually achievable: distinctive incidents, dates, addresses, contract numbers, employee names, and comparison with retained original tickets can undermine it. If a model or dataset remains identifiable, GDPR rights and security duties continue; do not use a blanket “trained models cannot be changed” disclaimer to defeat applicable withdrawal or erasure rights.[^1_9][^1_8][^1_3]

**Recommended workflow:**

1. **Permission:** Record the customer’s actual choice separately from staff approval; obtain appropriate coverage for employee and third-party information.[^1_3][^1_1]
2. **Quarantine:** Exclude non-approved conversations and sensitive material before training preparation.[^1_3][^1_1]
3. **Anonymize:** Remove direct and indirect identifiers, identifying metadata, and unnecessary narrative details; document residual identification risks.[^1_8][^1_3]
4. **Evaluate:** Test both datasets and models for memorization, extraction, and identification risks.[^1_9][^1_8]
5. **Withdrawal:** Stop future selection and remove identifiable pending examples when required; do not silently switch legal bases after withdrawal to continue the same optional processing.[^1_3]
6. **Vendor controls:** Ensure external AI providers cannot independently reuse prompts or training material unless that separate processing has been lawfully assessed and disclosed.[^1_3]

Anonymization itself is processing of personal data; later anonymity does not retrospectively legalize unlawful collection or preparation.[^1_9][^1_3]

## Reasonable retention periods

**No universal Lebanese statutory period for support tickets, recordings, or screenshots was verified.** GDPR requires storage no longer than necessary, while Lebanese Article 90 links storage to the declared/authorized period; therefore, the periods below are **proposed starting policies, not legal safe harbours**.[^1_1][^1_3]


| Record | Proposed starting policy | Qualifications |
| :-- | :-- | :-- |
| **Tickets and conversation text** | **12 months after closure**, then delete or genuinely anonymize | Extend only for documented warranty/service needs, a specific dispute, or a confirmed legal obligation; review necessity rather than retaining everything indefinitely.[^1_1][^1_3] |
| **Voice recordings** | **30 days from recording**; up to **90 days** where documented quality/dispute needs justify it | These are recommendations, not Lebanese mandates; CNIL’s 2026 French guidance uses six months as a maximum benchmark for certain training/quality recordings, with earlier deletion encouraged—it is not Lebanese law or a universal GDPR period.[^1_10] |
| **Screenshots and attachments** | Delete when no longer needed; ordinarily **within 90 days after closure** | Keep a minimal relevant extract instead of a whole document where feasible; attachments needed as contract/dispute evidence require a separate schedule.[^1_1][^1_3] |
| **Security/access audit logs** | **6–12 months** | This aligns with CNIL’s general recommendation, subject to specific legal obligations and documented needs; record actions/references, not full conversation bodies or passwords.[^1_11] |
| **Routine debug logs** | **14–30 days** | Proposed engineering default; shorten where possible and avoid collecting message contents, secrets, or sensitive information in logs.[^1_1][^1_3] |
| **Backups** | Rolling **30–90 days** | Proposed operational window; restrict restored data, reapply deletion records after restoration, and disclose delayed expiry honestly.[^1_3] |
| **Pending AI-review copies** | **30 days**, then approve/anonymize or delete | Proposed default; do not let an “awaiting approval” folder become indefinite storage.[^1_1][^1_3] |
| **Truly anonymous training data** | Review usefulness **annually** | GDPR no longer governs genuinely anonymous information, but confidentiality, intellectual-property, and contractual restrictions can remain relevant.[^1_3][^1_12] |
| **Contracts and consent evidence** | Separate legal schedule | Confirm applicable Lebanese commercial/tax requirements and limitation periods; do not import a foreign five- or ten-year rule without checking.[^1_1] |

### Important log-retention exception

Article 72 requires qualifying **technical service providers** to retain specified identifying traffic/technical information for **three years**, expressly excluding communication content; Article 74 separately contains a **ten-year** requirement for particular publisher-identification information held by hosts. These are **not blanket requirements to retain every customer ticket or all application logs for three or ten years**: the statutory provider definitions, public-communication context, and your actual service model require legal classification.[^1_1]

**Recommendation:** Obtain that classification before implementing the 6–12-month log schedule, and keep any mandated traffic records in a separate restricted store. Apply documented, narrow legal holds to relevant evidence rather than suspending deletion across the entire database.[^1_1][^1_3]

## Hosting outside Lebanon

### Lebanese position

The reviewed law does **not** establish a general GDPR-style adequacy/SCC regime or a general requirement to host ordinary customer data in Lebanon; DLA Piper describes the law as silent on cross-border transfers. That description needs a qualification: **Article 96(12) expressly requires foreign transfers to be identified in a declaration**, and Article 98 includes them in the publication framework.[^1_2][^1_1]

Accordingly, EU or US cloud hosting is **not generally prohibited by the reviewed general regime**, but it remains subject to applicable notice, purpose, security, filing/authorization, contractual, and sector-specific constraints. **Unverified:** Any newer generally applicable localization rule or sector-specific restriction relevant to the company; obtain confirmation especially for banking, healthcare, telecoms, or government customers.[^1_2][^1_1]

### GDPR position

Where GDPR applies, distinguish **hosting location**, **territorial scope**, and **restricted international transfers**; they are not interchangeable concepts.[^1_5][^1_3]


| Data flow | Practical treatment |
| :-- | :-- |
| **Lebanon → EU cloud** | No general Lebanese prohibition was identified in the reviewed regime; document the provider, destination, security, and any required declaration details.[^1_1][^1_2] |
| **EU controller → Lebanese company** | Assess GDPR Chapter V safeguards and Article 28 where the Lebanese company is a processor; no EU adequacy decision for Lebanon was verified in this research, so do not assume adequacy.[^1_3][^1_13] **Lawyer confirmation:** Current adequacy status and the correct transfer instrument. |
| **EU cloud → separate Lebanese support company** | Making data accessible to a separate recipient in Lebanon can create a transfer issue despite EU storage; remote access must be included in the data-flow assessment.[^1_5][^1_14] |
| **Transfer to US provider** | The Commission describes the EU–US Data Privacy Framework as permitting covered transfers to participating US companies; otherwise assess another valid mechanism, commonly appropriate SCCs and associated transfer-risk safeguards.[^1_15][^1_13] |
| **Customer directly submits information to Lebanese controller** | Do not assume that every direct submission is automatically a Chapter V transfer by an EU exporter; the EDPB framework requires analysis of the exporter/importer relationship, separately from GDPR territorial scope.[^1_5][^1_14] |

**Unverified for a particular deployment:** The live validity of the chosen transfer mechanism, the US recipient’s current certification and service coverage, and the correct SCC instrument where the importer is itself subject to GDPR. Have these checked at contracting and go-live rather than relying solely on a cloud provider’s “GDPR compliant” statement.[^1_15][^1_3]

**Recommendation:** For a small project, an EU-region provider with clear processor terms and limited international access can simplify the architecture, but it is not a complete compliance solution. Inventory database hosting, storage, backups, transcription, email/SMS, analytics, error monitoring, AI services, and overseas administrative access—not just the main server.[^1_3]

## Small-company compliance checklist

The following combines legal requirements with recommended implementation measures; the technical choices are examples of how to meet risk-based duties, not a statutory product specification.[^1_1][^1_3]

- [ ] **Use synthetic demonstration data.** Keep real contracts, recordings, tickets, and screenshots out of public repositories, demo videos, and model downloads; assess privacy law before any real-user pilot.[^1_3][^1_1]
- [ ] **Assign responsibility.** Name a privacy contact and determine controller/processor roles separately for support, analytics, recording, and AI training.[^1_1][^1_3]
- [ ] **Map data flows.** Record collection points, purposes, users, recipients, countries, subprocessors, backups, and deletion paths.[^1_3][^1_1]
- [ ] **Document Lebanese filing status.** Obtain advice on Article 94 exemptions; file under Articles 95–96 or obtain Article 97 authorization where required, retaining the receipt/decision.[^1_1]
- [ ] **Assess GDPR scope.** Record EU establishment, targeting, monitoring, EU-client processing, representative requirements, and transfer arrangements.[^1_5][^1_3]
- [ ] **Publish collection notices.** Put short notices beside ticket, upload, and recording controls, linked to a fuller policy—not only in a footer.[^1_3][^1_1]
- [ ] **Separate optional permissions.** Default recording and AI participation to off; keep timestamped, versioned evidence of the actual choices.[^1_3]
- [ ] **Provide rights handling.** Support access, correction, qualified deletion, objection, and applicable withdrawal/portability; operationally target the shorter Lebanese deadline where both laws apply.[^1_1][^1_3]
- [ ] **Limit access.** Use individual staff accounts, least privilege, MFA for privileged users, and separation between tenants and training reviewers.[^1_1][^1_3]
- [ ] **Secure information.** Use encrypted transport/storage, protected keys, patching, tested backups, secure sessions, and access auditing appropriate to risk.[^1_3][^1_1]
- [ ] **Harden uploads.** Use private storage, expiring authorized downloads, file-type/size restrictions, malware checks, and metadata/redaction controls where appropriate.[^1_1][^1_3]
- [ ] **Enforce retention automatically.** Implement per-category expiry, narrow legal holds, backup expiry, and deletion propagation to vendors.[^1_3][^1_1]
- [ ] **Contract with vendors.** Address confidentiality, instructions, subprocessors, locations, security, incidents, deletion/return, and prohibition of unauthorized model training.[^1_3]
- [ ] **Control AI provenance.** Require both valid permission/legal basis and internal approval; exclude sensitive data, document anonymization, and test extraction risks before training or release.[^1_8][^1_9]
- [ ] **Assess high-risk processing.** Complete a GDPR DPIA where required, and document a proportionate privacy assessment even where not mandatory.[^1_3]
- [ ] **Prepare incident response.** Establish containment, evidence preservation, vendor escalation, legal assessment, and applicable notification workflows.[^1_2][^1_3]


## Privacy-policy template structure

Use this as a **structure**, not a ready-to-publish policy: replace each item with accurate descriptions of implemented practices, and provide it in languages users understand.[^1_1][^1_3]


| Section | What to include |
| :-- | :-- |
| **Controller and contact** | Legal entity, address, privacy contact, relevant representative/DPO, and which customer organization controls support information where applicable.[^1_1][^1_3] |
| **Scope and roles** | Services covered; distinction between the company’s own processing and processing on a business customer’s instructions.[^1_3] |
| **Information collected** | Names, phone numbers, contracts, messages, recordings/transcripts, screenshots, metadata, logs, and sources.[^1_1][^1_3] |
| **Purposes and legal grounds** | A purpose-by-purpose explanation, with GDPR legal bases where applicable; distinguish necessary support from optional recording and AI reuse.[^1_1][^1_3] |
| **Required and optional fields** | Why information is requested and consequences of refusing; identify optional features clearly.[^1_1] |
| **Voice recording** | When recording starts, purposes, recipients, retention, how agreement is obtained, and unrecorded alternatives.[^1_1][^1_3] |
| **AI training and anonymization** | Precisely which content is eligible, approval versus consent, excluded categories, providers, safeguards, withdrawal before anonymization, and limits only where genuinely anonymous.[^1_3][^1_8] |
| **Recipients and providers** | Recipient categories and relevant hosting, communications, transcription, and AI providers.[^1_1][^1_3] |
| **International handling** | Hosting/access countries and applicable transfer safeguards; explain how further information is available.[^1_1][^1_3] |
| **Retention and deletion** | Category-specific periods or meaningful criteria, legal holds, backups, and genuinely anonymous information.[^1_1][^1_3] |
| **Security** | A truthful high-level description without promising absolute security or exposing sensitive implementation details.[^1_1][^1_3] |
| **Rights and complaints** | Applicable rights, verification, contact channel, response times, Lebanese judicial remedies, and relevant GDPR supervisory-authority complaints.[^1_1][^1_3] |
| **Other features and changes** | Children, cookies/tracking, significant automated decisions where relevant, effective date, and how material changes are communicated.[^1_3] |

A privacy policy is an information notice, **not a substitute for obtaining valid optional consent**, and a policy update alone does not automatically authorize a new incompatible purpose.[^1_1][^1_3]

## Lawyer-confirmation points

Before real deployment, request written confirmation on these specific questions:

1. **Current Lebanese legal position:** Have Law 81/2018, its implementing rules, or relevant sector requirements changed since the cited analyses? Current administrative practice and comprehensive post-2022 developments remain **unverified**.[^1_2]
2. **Filing exemption:** Do ordinary support, outsourced support, recordings, and AI preparation each qualify under Article 94, or require separate declaration/authorization?[^1_1]
3. **Sensitive material:** How do Articles 91, 94, and 97 interact for unsolicited health/genetic/sexual-life information, judicial documents, and criminal allegations?[^1_1]
4. **Recording legality:** Does the proposed call/voice-message workflow satisfy Law 140/1999, relevant criminal/privacy rules, staff protections, and laws applicable to overseas participants? A categorical consent rule remains **unverified**.[^1_6][^1_7]
5. **AI secondary use:** Is the proposed legal basis sufficient for selection, review, transcription, anonymization, and training—including employee and third-party information—and can the claimed anonymity withstand scrutiny?[^1_8][^1_3][^1_1]
6. **Mandatory logs:** Is the company a qualifying technical service provider/host for Articles 72 or 74, and which exact records must be kept?[^1_1]
7. **Retention and limitation periods:** Which contract, tax, accounting, warranty, employment, and litigation requirements override the proposed short operational periods?[^1_1]
8. **International transfers:** Are there sector restrictions, required declaration updates, GDPR safeguards, or remote-access issues? Confirm Lebanon’s current EU adequacy status and the chosen US mechanism/certification; these deployment-specific matters remain **unverified**.[^1_15][^1_3][^1_1]
9. **GDPR representation and governance:** Does Article 3 apply to each activity, and are an EU representative, DPIA, DPO, or particular client/processor agreements required?[^1_3]
10. **Current penalties and remedies:** Do later laws adjust the original LBP figures, and what current procedures and precedent govern enforcement? The monetary updates and recent enforcement record remain **unverified**.[^1_2][^1_1]

For the **portfolio version**, the recommended boundary is a clearly labelled demonstration using synthetic customers, fictional contracts, and fabricated conversations; any real-user pilot should receive the same pre-launch legal assessment as other real processing, rather than relying on its educational label.[^1_3][^1_1]

<span style="display:none">[^1_100][^1_101][^1_102][^1_103][^1_104][^1_105][^1_106][^1_107][^1_108][^1_109][^1_110][^1_111][^1_112][^1_113][^1_114][^1_115][^1_116][^1_117][^1_118][^1_119][^1_120][^1_121][^1_122][^1_123][^1_124][^1_125][^1_126][^1_127][^1_128][^1_129][^1_130][^1_131][^1_132][^1_133][^1_134][^1_135][^1_136][^1_137][^1_138][^1_139][^1_140][^1_141][^1_142][^1_143][^1_144][^1_145][^1_146][^1_147][^1_148][^1_149][^1_150][^1_151][^1_152][^1_153][^1_154][^1_155][^1_156][^1_157][^1_158][^1_159][^1_16][^1_160][^1_161][^1_162][^1_163][^1_164][^1_165][^1_166][^1_167][^1_168][^1_169][^1_17][^1_170][^1_171][^1_172][^1_173][^1_174][^1_175][^1_176][^1_177][^1_178][^1_179][^1_18][^1_180][^1_181][^1_182][^1_183][^1_184][^1_185][^1_186][^1_187][^1_188][^1_189][^1_19][^1_190][^1_191][^1_192][^1_193][^1_194][^1_195][^1_196][^1_197][^1_198][^1_199][^1_20][^1_200][^1_201][^1_202][^1_203][^1_204][^1_205][^1_206][^1_207][^1_208][^1_209][^1_21][^1_210][^1_211][^1_212][^1_213][^1_214][^1_215][^1_216][^1_217][^1_218][^1_219][^1_22][^1_220][^1_221][^1_222][^1_223][^1_224][^1_225][^1_226][^1_227][^1_228][^1_229][^1_23][^1_230][^1_231][^1_232][^1_233][^1_234][^1_235][^1_236][^1_237][^1_238][^1_239][^1_24][^1_240][^1_241][^1_242][^1_243][^1_244][^1_245][^1_246][^1_247][^1_248][^1_249][^1_25][^1_250][^1_251][^1_252][^1_253][^1_254][^1_255][^1_256][^1_257][^1_258][^1_259][^1_26][^1_260][^1_261][^1_262][^1_263][^1_264][^1_265][^1_266][^1_267][^1_268][^1_269][^1_27][^1_270][^1_271][^1_272][^1_273][^1_274][^1_275][^1_276][^1_277][^1_278][^1_279][^1_28][^1_280][^1_281][^1_282][^1_283][^1_284][^1_285][^1_286][^1_287][^1_288][^1_289][^1_29][^1_290][^1_291][^1_292][^1_293][^1_294][^1_295][^1_296][^1_297][^1_298][^1_299][^1_30][^1_300][^1_301][^1_302][^1_303][^1_304][^1_305][^1_306][^1_307][^1_308][^1_309][^1_31][^1_310][^1_311][^1_32][^1_33][^1_34][^1_35][^1_36][^1_37][^1_38][^1_39][^1_40][^1_41][^1_42][^1_43][^1_44][^1_45][^1_46][^1_47][^1_48][^1_49][^1_50][^1_51][^1_52][^1_53][^1_54][^1_55][^1_56][^1_57][^1_58][^1_59][^1_60][^1_61][^1_62][^1_63][^1_64][^1_65][^1_66][^1_67][^1_68][^1_69][^1_70][^1_71][^1_72][^1_73][^1_74][^1_75][^1_76][^1_77][^1_78][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92][^1_93][^1_94][^1_95][^1_96][^1_97][^1_98][^1_99]</span>

<div align="center">⁂</div>

[^1_1]: https://nhrclb.org/archives/8228

[^1_2]: https://www.dlapiperdataprotection.com/index.html?t=law\&c=LB

[^1_3]: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02016R0679-20160504

[^1_4]: https://www.economy.gov.lb/ar/services/البيانات-ذات-الطابع-الشخصي

[^1_5]: https://www.edpb.europa.eu/documents/guideline/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and-the_hr

[^1_6]: https://www.coe.int/en/web/octopus/-/lebanon

[^1_7]: https://www.lebarmy.gov.lb/ar/content/بين-احترام-الحريات-الشخصية-ومراعاة-مصلحة-الدولة-والأمن-الوطني

[^1_8]: https://www.edpb.europa.eu/news/news/2024/edpb-opinion-ai-models-gdpr-principles-support-responsible-ai_en?utm

[^1_9]: https://www.paulweiss.com/media/a3kdoba5/european_regulators_provide_guidance_on_the_use_of_personal_data_in_artificial_intelligence.pdf

[^1_10]: https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf

[^1_11]: https://www.cnil.fr/fr/securite-tracer-les-operations

[^1_12]: https://tohmelaw.com/publications/lebanon-e-transactions-law

[^1_13]: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/rules-international-data-transfers_en

[^1_14]: https://www.edpb.europa.eu/system/files/2023-09/edpb_guidelines_05-2021_interplay_between_the_application_pl.pdf

[^1_15]: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/eu-us-data-transfers_en

[^1_16]: https://worldwatch.global/lebanon/data-privacy

[^1_17]: https://www.dataguidance.com/jurisdictions/lebanon?topic=notes

[^1_18]: https://www.dataguidance.com/jurisdictions/lebanon?topic=residency

[^1_19]: https://seedslb.org/storage/publications/June2026/8YtiwSJ3bIC36zE5rCwZ.pdf

[^1_20]: https://www.dlapiperdataprotection.com/?t=enforcement\&c=LB

[^1_21]: https://www.dataguidance.com/jurisdictions/lebanon?topic=latest

[^1_22]: https://www.dlapiperdataprotection.com/?t=security\&c=LB

[^1_23]: https://www.dlapiperdataprotection.com/?t=about\&c=LB

[^1_24]: https://pacmap.dev/regulation/lb-etpd-2018

[^1_25]: https://www.dlapiperdataprotection.com/?t=collection-and-processing\&c=LB

[^1_26]: https://www.pwc.com/m1/en/publications/documents/2024/navigating-cross-border-data-transfers-key-regulations-in-the-middle-east.pdf

[^1_27]: https://economy.gov.lb/ar/services/البيانات-ذات-الطابع-الشخصي

[^1_28]: https://www.abl.org.lb/english/lebanese-banking-sector/main-banking-amp-financial-regulations

[^1_29]: http://77.42.251.205/LawArticles.aspx?LawArticleID=1094528\&LawId=278573

[^1_30]: https://www.bdl.gov.lb/CB Com/Laws And Regulations/Laws/Law_81_AR%C2%A72572_1.pdf

[^1_31]: https://assets.pubpub.org/bt8rsi6y/3518cb2b-4bb6-435d-93a9-ca2445777c09.html

[^1_32]: https://www.cambridge.org/core/journals/european-journal-of-risk-regulation/article/identifiability-as-a-data-risk-is-a-uniform-approach-to-anonymisation-about-to-emerge-in-the-eu/F8310BC4987579A48F3273950A1ADCA4

[^1_33]: https://www.europeanpapers.eu/system/files/pdf_version/EP_EF_2024_H_004_Federica_Velli_00822.pdf

[^1_34]: https://www.edpb.europa.eu/system/files/documents/2024-12/edpb_opinion_202428_ai-models_en.pdf

[^1_35]: https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_ga

[^1_36]: https://www.edpb.europa.eu/node_en?page=27

[^1_37]: https://www.enisa.europa.eu/sites/default/files/2025-04/EDPBSecretariat-ENISA_Webinar.pdf

[^1_38]: https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_pl

[^1_39]: https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04

[^1_40]: https://eur-lex.europa.eu/legal-content/EN-EL/TXT/?uri=CELEX:32016R0679

[^1_41]: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32016R0679

[^1_42]: https://eur-lex.europa.eu/eli/reg/2016/679/

[^1_43]: https://www.edpb.europa.eu/system/files/2024-12/edpb_opinion_202428_ai-models_en.pdf

[^1_44]: https://www.edpb.europa.eu/news/edpb-opinion-on-ai-models-gdpr-principles-support-responsible-ai_en

[^1_45]: https://www.edpb.europa.eu/topics/ai-and-technology/artificial-intelligence_en

[^1_46]: https://www.recordinglaw.com/world-laws/world-recording-laws/lebanon-recording-laws/

[^1_47]: https://lebaneselegislation.com/en/topic/cybercrime-electronic-transactions/

[^1_48]: https://ccprcentre.org/files/documents/INT_CCPR_ICO_LBN_27261_E.pdf

[^1_49]: https://privacyinternational.org/state-privacy/1081/state-privacy-lebanon

[^1_50]: https://privacyinternational.org/sites/default/files/2018-02/Lebanon_UPR_23rd_session_Joint_Stakeholder_submission_0.pdf

[^1_51]: https://docs.safeguard.sh/docs/frameworks/middle-east-and-africa/lebanon-81

[^1_52]: https://nhrclb.org/en/archives/6956

[^1_53]: https://www.economy.gov.lb/media/11899/20181022-1228-full-report-ar.pdf

[^1_54]: https://nhrclb.org/wp-content/uploads/2026/05/Protecting-Children-in-the-Digital-Environment-English.pdf

[^1_55]: https://www.dlapiperdataprotection.com/?t=law\&c=LB

[^1_56]: http://dspa.ul.edu.lb/static/uploads/files/etudes-differentes/justice-journal/adl-2022-4-04.pdf

[^1_57]: https://lexlint.io/l/lb-no-81-2018-91-97-3-health-genetic-identity-se

[^1_58]: https://www.cldh-lebanon.org/HumanRightsBrie/d475380b-9daf-4dce-a3ce-ff58d0681370_POLICY%20BRIEF%20MDM.pdf

[^1_59]: https://www.economy.gov.lb/public/uploads/files/3960_1653_9940.pdf

[^1_60]: https://tbinternet.ohchr.org/\_layouts/15/TreatyBodyExternal/DownloadDraft.aspx?key=LLfInPr0/Tgxh2vsGZl9fIm12KHofj/2wxjNeB6sRL95c5gfFd/91Zq+SjJ4SY0z

[^1_61]: https://www.ohchr.org/sites/default/files/Documents/Issues/NHRA/Lebanon_en.pdf

[^1_62]: https://www.economy.gov.lb/en

[^1_63]: https://www.moph.gov.lb/Laws/download_file/4433

[^1_64]: https://smex.org/wp-content/uploads/2018/10/E-transaction-law-Lebanon-Official-Gazette-English.pdf

[^1_65]: https://www.alemlaw.com/news-and-insights/alem-amp-associates-secures-unprecedented-permit-approval-for-personal-data-processing-under-the-lebanese-electronic-transactions-and-personal-data-law

[^1_66]: https://www.legalbusiness.co.uk/international/the-electronic-transactions-and-data-protection-law-in-lebanon-empowering-lebanese-companies-in-the-digital-age/

[^1_67]: https://economy.gov.lb/ar/services/دعم-المؤسسات--الصغيرة-والمتوسطة--الحجم

[^1_68]: https://economy.gov.lb/ar/services/دعم-المؤسسات--الصغيرة-والمتوسطة--/ماذا-للمؤسسات-الصغيرة-و-المتوسطة-الحجم-في-لبنان--/خدمات-تطوير-الأعمال-التجارية

[^1_69]: https://www.edpb.europa.eu/documents_en?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_publication_type:64\&f[1]=all_topics:164\&f[2]=all_topics:177\&f[3]=all_topics:913\&f[4]=all_topics:1053\&page=47

[^1_70]: https://tax.thomsonreuters.com/blog/european-data-protection-board-issues-guidelines-on-gdprs-territorial-scope/

[^1_71]: https://www.edpb.europa.eu/system/files_en?file=consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf

[^1_72]: https://www.edpb.europa.eu/system/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf

[^1_73]: https://interoperable-europe.ec.europa.eu/sites/default/files/custom-page/attachment/2021-06/GDPR - EDPB AND 29WP.pdf

[^1_74]: https://www.edpb.europa.eu/search_en?f[0]=publication_type:60\&f[1]=publication_type:64\&f[2]=publication_type:104\&f[3]=publication_type:553\&f[4]=publication_type:738\&f[5]=publication_type:783\&search=gdpr\&page=333

[^1_75]: https://www.edpb.europa.eu/public-consultations/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3_en

[^1_76]: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf?trk=article-ssr-frontend-pulse_little-text-block

[^1_77]: https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf

[^1_78]: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en.pdf?_sm_au_=iVVQtF6rt7MjtSnrQcLJjKQ1j7GJ1

[^1_79]: https://dsb.gv.at/sites/site0344/media/downloads/edpb_recommendations_202001_supplementarymeasurestransferstools_en.pdf

[^1_80]: https://www.hfw.com/app/uploads/2024/04/001731-HFW-The-GDPR-Abroad-EU-guidelines-on-territorial-scope-finalised-Jan-20.pdf

[^1_81]: https://eur-lex.europa.eu/legal-content/sr/ALL/?uri=CELEX:32016R0679

[^1_82]: https://eur-lex.europa.eu/legal-content/zh/ALL/?uri=CELEX:32016R0679

[^1_83]: https://eur-lex.europa.eu/legal-content/pt/ALL/?uri=CELEX:32016R0679

[^1_84]: https://eur-lex.europa.eu/legal-content/RO/TXT/?uri=celex:32016R0679

[^1_85]: https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=celex:32016R0679

[^1_86]: https://eur-lex.europa.eu/legal-content/HR/ALL/?uri=celex:32016R0679

[^1_87]: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex:32016R0679

[^1_88]: https://eur-lex.europa.eu/legal-content/cs/TXT/?uri=CELEX:32016R0679

[^1_89]: https://eur-lex.europa.eu/legal-content/LV/ALL/?uri=CELEX:32016R0679

[^1_90]: https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=celex:32016R0679

[^1_91]: https://bdl.gov.lb/CB Com/Laws And Regulations/Laws/Law_81_AR%C2%A72572_1.pdf

[^1_92]: https://www.edpb.europa.eu/system/files/documents/2025-04/edpb-annual-report-2024_en.pdf

[^1_93]: https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_fr

[^1_94]: https://www.edpb.europa.eu/documents_ga?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_topics:110\&f[1]=all_topics:138\&f[2]=all_topics:748\&f[3]=all_topics:768\&f[4]=all_topics:771\&page=12

[^1_95]: https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_en

[^1_96]: https://archive.org/stream/edpb_guidelines_202005_consent_en/edpb_guidelines_202005_consent_en_djvu.txt

[^1_97]: https://streamlex.eu/law-resources/edpb-guidelines-on-consent/

[^1_98]: https://www.edpb.europa.eu/documents_en?amp;amp;amp;amp;f[1]=all_topics:743\&amp;f[1]=all_topics:132\&f[0]=all_publication_type:64\&f[1]=all_topics:138\&page=44

[^1_99]: https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en

[^1_100]: https://www.edpb.europa.eu/search_ga?page=320\&search=transparency

[^1_101]: https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf

[^1_102]: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf?trk=article-ssr-frontend-pulse_little-text-block

[^1_103]: https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_pl

[^1_104]: https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_ro

[^1_105]: https://www.dlapiperdataprotection.com/?t=contacts\&c=LB

[^1_106]: https://eur-lex.europa.eu/eli/agree_internation/2026/1521/oj/eng

[^1_107]: https://www.dlapiper.com/en/legal-notices/additional/us-additional-privacy-information

[^1_108]: https://www.dlapiper.com/en/legal-notices/additional/privacy-policy

[^1_109]: https://www.dlapiper.com/en-it/legal-notices/additional/privacy-policy/careers

[^1_110]: https://digitalprivacyregs.com/lebanon.html

[^1_111]: https://practiceguides.chambers.com/practice-guides/comparison/1129/18514/29027-29028-29029-29030-29031

[^1_112]: https://cnil-d10.cnil.fr/sites/default/files/2026-05/registre_rgpd_de_la_cnil.pdf

[^1_113]: https://www.cnil.fr/sites/default/files/attachment_220_100.pdf

[^1_114]: https://www.cnil.fr/fr/donnees-personnelles-gestion-des-demandes-tout-public

[^1_115]: https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_23_3721/IP_23_3721_EN.pdf

[^1_116]: https://www.cnil.fr/sites/default/files/atoms/files/ns57.pdf

[^1_117]: https://www.cnil.fr/en/cnil-direct/question/enregistrement-ou-ecoute-des-conversations-telephoniques-faut-il-informer-ses

[^1_118]: https://www.cnil.fr/fr/cnil-direct/recherche/enregistrement des conversations téléphoniques

[^1_119]: https://www.edpb.europa.eu/topics/international-transfers-and-international-cooperation/adequacy-decision_en

[^1_120]: https://www.edpb.europa.eu/sites/default/files/2026-04/meetings/minutes/20230214plenfinalminutes75thplenarymeeting_en.pdf

[^1_121]: https://www.edpb.europa.eu/documents_ga?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_topics:138\&f[1]=all_topics:770\&f[2]=all_topics:771\&f[3]=all_topics:873\&f[4]=all_topics:967\&page=24

[^1_122]: https://www.edpb.europa.eu/documents_ga?amp;amp;amp;amp;f[1]=all_topics:743\&amp;f[1]=all_topics:132\&f[0]=all_date:2024\&f[1]=all_topics:136\&f[2]=all_topics:761\&page=24

[^1_123]: https://www.edpb.europa.eu/documents_cs?date=\&keys=\&page=3\&type[guidance]=guidance

[^1_124]: https://www.edpb.europa.eu/documents_hr?amp;amp;amp;amp;f[1]=all_topics:743\&amp;f[1]=all_topics:132\&f[0]=all_date:2024\&f[1]=all_topics:136\&f[2]=all_topics:761\&page=24

[^1_125]: https://www.edpb.europa.eu/documents_bg?date=\&keys=\&type[guidance]=guidance\&page=3

[^1_126]: https://www.edpb.europa.eu/documents_lt?date=\&keys=\&page=3\&type[guidance]=guidance

[^1_127]: https://www.praxikon.com/en/avg/richtsnoeren

[^1_128]: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en

[^1_129]: https://uodo.gov.pl/en/631

[^1_130]: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:52026DC0166

[^1_131]: https://www.edpb.europa.eu/system/files/2026-09/decision3906-1-redacted-1-2.pdf

[^1_132]: https://www.sorena.io/artifacts/eu/general-data-protection-regulation/transfer-tia-and-scc-workflow.md

[^1_133]: https://www.ppc.go.jp/files/pdf/kokusai_iten_guideline_52021.pdf

[^1_134]: https://www.edpb.europa.eu/public-consultations/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and_en

[^1_135]: https://www.fedma.org/2022/02/03/edpb-consultation-the-interplay-between-the-application-of-article-3-and-the-provisions-on-international-transfers/

[^1_136]: https://www.edpb.europa.eu/documents/guideline/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and-the_ga

[^1_137]: https://www.edpb.europa.eu/documents/guideline/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and-the_en

[^1_138]: https://www.academia.edu/179036174/Privacy_Preserving_AI_Governance_Across_Multi_Cloud_Enterprise_Systems_Integrating_Data_Sovereignty_Federated_Controls_and_Cross_Jurisdictional_Compliance_Monitoring

[^1_139]: https://cyrilla.org/entity/vrlqtpwf7ss?page=5\&file=1542184412658sl42tsmzwad.pdf

[^1_140]: https://rm.coe.int/3692-1-2-study-pdp-lebanon-coe-108-/1680a1caa2

[^1_141]: https://danigeagea.com/insights/recording-phone-calls-lebanon

[^1_142]: https://cyrilla.org/entity/vrlqtpwf7ss?page=12\&file=1542184412658sl42tsmzwad.pdf

[^1_143]: https://www.dlapiperdataprotection.com/?t=online-privacy\&c=LB

[^1_144]: https://www.byblosbank.com/common/economic-research-new/lebanon-this-week/lebanon-this-week-561/government-issues-details-of-law-on-electronic-transactions-and-personal-data

[^1_145]: https://bdl.gov.lb/laws.php

[^1_146]: https://impact.gov.lb/assets/docs/Data_Security_Privacy_Standards.pdf

[^1_147]: https://www.dataguidance.com/notes/lebanon-privacy-overview

[^1_148]: https://europeanlawblog.eu/zh4uxsfq/pdf/

[^1_149]: https://eprints.soton.ac.uk/503082/1/The_EDPB_s_Opinion_on_AI_Models\_-\_towards_a_principle-based_approach_to_innovation_by_Sophie_Stalla-Bourdillon_and_Aflred_Rossi_Privacy_Data_Protection_Volume_25_Issue_6.pdf

[^1_150]: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex:32016R0679\&;tid= 111503798

[^1_151]: https://eur-lex.europa.eu/legal-content/EN-FR/TXT/?fromTab=ALL\&uri=CELEX:32016R0679

[^1_152]: https://eur-lex.europa.eu/legal-content/EN-PL/TXT/?uri=CELEX:32016R0679\&from=EN

[^1_153]: https://www.legislation.gov.uk/eur/2016/679/article/3/2026-03-31

[^1_154]: https://www.legislation.gov.uk/eur/2016/679/article/3/adopted?ref=sorena.io

[^1_155]: https://www.legislation.gov.uk/eur/2016/679/article/3/2023-12-31?ref=caesar.co.uk\&view=extent\&timeline=false

[^1_156]: https://documents1.worldbank.org/curated/en/099071025093533166/txt/P506791-6d1439ac-240a-49e5-a0c6-9373fd5b215d.txt

[^1_157]: https://data.unhcr.org/en/documents/details/114339

[^1_158]: https://eusee.hivos.org/assets/2026/01/Lebanon-CFR-v2.pdf

[^1_159]: http://lebanon.mom-gmr.org/en/findings/law-and-practice/

[^1_160]: https://nhrclb.org/en/archives/8270

[^1_161]: https://www.linkedin.com/posts/joe-saade-a2983b179_joe-saade-ai-governance-activity-7487990218344779777-tPiR

[^1_162]: https://legal-agenda.com/wp-content/uploads/2026/03/17731505154557af70eca002e4cd4aca09c15a641ad3e-4.pdf

[^1_163]: https://www.europarl.europa.eu/doceo/document/LIBE-PR-786905_EN.pdf

[^1_164]: https://digitalcommons.bau.edu.lb/cgi/viewcontent.cgi?article=1135\&context=lsjournal

[^1_165]: https://bdl.gov.lb/CB Com/Laws And Regulations/Laws/Law_44_AR.pdf

[^1_166]: https://www.bdl.gov.lb/CB Com/Laws And Regulations/Laws/Law_234_AR.pdf

[^1_167]: https://www.bdl.gov.lb/CB Com/Laws And Regulations/Laws/Law_50_1983_AR.pdf

[^1_168]: https://www.bdl.gov.lb/CB Com/Laws And Regulations/Laws/Law_3956_AR%C2%A72_1.pdf

[^1_169]: https://docstore.ohchr.org/SelfServices/FilesHandler.ashx?enc=Fmh8hSIStKbieCz08P6Hfk5zDZ4KG+5DUnHtDHp6KZA6LDQJT8KUZ1BQuYtvaAuNN/kS+ePNYwFjT6dZPa54W3maw0EmNTeYQobraIENhWc=

[^1_170]: https://www.ppc.go.jp/files/pdf/chiritekitekiyouhanni_guideline2.1.pdf

[^1_171]: https://www.bdl.gov.lb/CB Com/Laws And Regulations/Intermediate Circulars/int81.pdf

[^1_172]: https://bdl.gov.lb/CB Com/Laws And Regulations/Intermediate Circulars/Decision_13589_AR%C2%A78710_1.pdf

[^1_173]: https://www.edpb.europa.eu/public-consultations/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3_et

[^1_174]: https://www.edpb.europa.eu/documents_ga?amp;amp;amp;amp;f[1]=all_topics:743\&amp;f[1]=all_topics:132\&f[0]=all_date:2024\&f[1]=all_topics:136\&f[2]=all_topics:761\&page=47

[^1_175]: https://www.edpb.europa.eu/our-work-tools/consistency-findings/opinions_ga?amp;f[1]=opinions_topics:748\&f[0]=opinions_topics:155\&f[1]=opinions_topics:177\&f[2]=opinions_topics:746\&f[3]=opinions_topics:753

[^1_176]: https://www.edpb.europa.eu/our-work-tools/documents/our-documents_lv?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_publication_type:61\&f[1]=all_topics:110\&f[2]=all_topics:125\&f[3]=all_topics:138\&f[4]=all_topics:155\&f[5]=all_topics:164\&f[6]=all_topics:745\&f[7]=all_topics:746\&f[8]=all_topics:896\&f[9]=all_topics:935

[^1_177]: https://www.edpb.europa.eu/documents/guideline/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3-version-adopted_de

[^1_178]: https://www.edpb.europa.eu/documents_ga?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_publication_type:64\&f[1]=all_topics:136\&f[2]=all_topics:753\&page=12

[^1_179]: https://www.privacyresources.eu/docs/edpb/opinions/

[^1_180]: https://www.europeanpapers.eu/europeanforum/protecting-personal-data-in-context-of-ai-models

[^1_181]: https://www.edpb.europa.eu/documents/guideline/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3-version-adopted_en

[^1_182]: https://www.edpb.europa.eu/public-consultations/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3_sv

[^1_183]: https://www.linkedin.com/posts/brautigam_edpb-opinion-on-ai-models-gdpr-principles-activity-7275124347512512512-5GTa

[^1_184]: https://www.linkedin.com/posts/tomasz-zemojtel-326b7245_opinion-282024-on-certain-data-protection-activity-7275259948605878272-P-cL

[^1_185]: https://eur-lex.europa.eu/legal-content/EL/ALL/?uri=celex:32016R0679

[^1_186]: https://www.paulweiss.com/insights/client-memos/european-regulators-provide-guidance-on-the-use-of-personal-data-in-artificial-intelligence

[^1_187]: https://eur-lex.europa.eu/legal-content/fi/ALL/?uri=CELEX:32016R0679

[^1_188]: https://eur-lex.europa.eu/legal-content/PL/ALL/?uri=CELEX:32016R0679

[^1_189]: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679

[^1_190]: https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:32016R0679

[^1_191]: https://www.edpb.europa.eu/our-work-tools/our-documents/topic/international-transfers-data_nl?page=15

[^1_192]: https://www.edpb.europa.eu/system/files/documents/2022-05/edpb_annual_report_2021_en.pdf

[^1_193]: https://www.edpb.europa.eu/sites/default/files/webform/public_consultation_reply/20211227.Public_consultation_EDPB_transfers_V8.pdf

[^1_194]: https://www.edpb.europa.eu/public-consultations/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and_pl?page=4

[^1_195]: https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_guidelines_05-2021_interplay_between_the_application_of_art3-chapter_v_of_the_gdpr_v2_en_0.pdf

[^1_196]: https://www.edpb.europa.eu/system/files/2021-11/edpb_guidelinesinterplaychapterv_article3_adopted_en.pdf

[^1_197]: https://www.usj.edu.lb/pdf/dataprotection.pdf

[^1_198]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_it_0.pdf

[^1_199]: https://www.edpb.europa.eu/system/files/2025-05/edpb_opinion_202428_ai-models_mt.pdf

[^1_200]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_sv.pdf

[^1_201]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_nl.pdf

[^1_202]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_fi.pdf

[^1_203]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_fr.pdf

[^1_204]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_sk_0.pdf

[^1_205]: https://www.edpb.europa.eu/system/files/2025-05/edpb_opinion_202428_ai-models_sl.pdf

[^1_206]: https://www.edpb.europa.eu/system/files/2025-05/edpb_opinion_202428_ai-models_da.pdf

[^1_207]: https://www.edpb.europa.eu/system/files/2025-05/edpb_opinion_202428_ai-models_ro_0.pdf

[^1_208]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_cs_0.pdf

[^1_209]: https://www.edpb.europa.eu/system/files/2025-05/edpb_opinion_202428_ai-models_et.pdf

[^1_210]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_bg_0.pdf

[^1_211]: https://www.edpb.europa.eu/system/files/documents/2025-05/edpb_opinion_202428_ai-models_sl.pdf

[^1_212]: https://www.edpb.europa.eu/our-work-tools/documents/our-documents_fr?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_date:2024\&f[1]=all_topics:745\&f[2]=all_topics:753\&f[3]=all_topics:770\&f[4]=all_topics:940

[^1_213]: https://www.edpb.europa.eu/our-work-tools/documents/our-documents_fr?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_topics:112\&f[1]=all_topics:125\&f[2]=all_topics:155\&f[3]=all_topics:177\&f[4]=all_topics:745\&f[5]=all_topics:753\&f[6]=all_topics:761\&f[7]=all_topics:769\&f[8]=all_topics:943\&f[9]=all_topics:957\&page=2

[^1_214]: https://doteurope.eu/wp-content/uploads/2024/12/DOT-position-EDPB-Opinion-on-AI-models-final-version.pdf

[^1_215]: https://www.edpb.europa.eu/news/edpb-opinion-on-ai-models-gdpr-principles-support-responsible-ai_sv

[^1_216]: https://www.edpb.europa.eu/news/edpb-opinion-on-ai-models-gdpr-principles-support-responsible-ai_de

[^1_217]: https://cyrilla.org/ar/entity/vrlqtpwf7ss?file=1542184412658sl42tsmzwad.pdf\&page=22

[^1_218]: https://cyrilla.org/ar/entity/vrlqtpwf7ss?file=1542184412658sl42tsmzwad.pdf\&page=20

[^1_219]: http://old.lp.gov.lb/Resources/Files/f67b348c-6d35-42a0-8ddb-c18bcc2a5e8d.pdf

[^1_220]: https://pe.ppa.gov.lb/storage/lots/files/yEnCC5XCfr4sVX2ZIFTvKXzgLxNzRCIkE9iM-1780516807.pdf

[^1_221]: https://cnil-d10.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf

[^1_222]: https://www.lexismiddleeast.com/law/Lebanon/Law_81_2018/en

[^1_223]: https://www.finance.gov.lb/en-us/Finance/BI/ABDP/Annual Budget Documents and Process/Citizen Budget 2024-ENG.pdf

[^1_224]: https://institutdesfinances.gov.lb/sites/default/files/2024-10/Citizen Budget 2024-ENG_3.pdf

[^1_225]: https://smex.org/referring-telecom-data-to-security-agencies-breaches-the-lebanese-law/

[^1_226]: https://omsar.gov.lb/en/publication/law-no-81-dated-10-10-2018electronic-transacti-ons-and-personal-data/

[^1_227]: https://www.cnil.fr/sites/default/files/atoms/files/recommandation\_-\_journalisation.pdf

[^1_228]: https://preprod.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation

[^1_229]: https://www.cnil.fr/sites/default/files/atoms/files/synthese_des_contributions-journalisation.pdf

[^1_230]: https://www.cnil.fr/sites/cnil/files/atoms/files/synthese_des_contributions-journalisation.pdf

[^1_231]: https://cnil-d10.cnil.fr/sites/default/files/2026-03/tablesil_cnil.pdf

[^1_232]: https://messervices.cyber.gouv.fr/documents-guides/anssi-guide-recommandations_securite_architecture_systeme_journalisation.pdf

[^1_233]: https://cnil-d10.cnil.fr/sites/default/files/2026-06/recommandation_utilisation_de_donnees_de_localisation.pdf

[^1_234]: https://economy.gov.lb/ar/services/حماية-الملكية-الفكرية/التشريعات

[^1_235]: https://cnil-d10.cnil.fr/sites/default/files/2025-03/projet_de_recommandation_relative_aux_traitements_de_donnees_de_localisation.pdf

[^1_236]: https://cnil-d10.cnil.fr/sites/default/files/2024-12/projet_de_referentiel_certification_des_sous-traitants.pdf

[^1_237]: https://www.cnil.fr/sites/cnil/files/atoms/files/recommandation\_-\_journalisation.pdf

[^1_238]: https://www.cnil.fr/sites/default/files/2025-08/synthese_des_contributions-journalisation_0.pdf

[^1_239]: https://www.cnil.fr/fr/consignes-pour-renforcer-la-securite-des-grandes-bases-de-donnees

[^1_240]: https://www.scribd.com/document/870909721/DLA-Piper-Data-Protection-Laws-of-the-World-Lebanon

[^1_241]: https://www.clym.io/regulations/law-no-81-on-electronic-transactions-and-personal-data-lebanon

[^1_242]: https://anuragverma.co/worldwatch/lebanon/data-privacy

[^1_243]: https://aub.edu.lb.libguides.com/Data_Privacy/LawsAndRegulations

[^1_244]: https://www.forvismazars.com/lb/en/legals/legal-and-privacy/data-privacy-statement

[^1_245]: https://www.cldh-lebanon.org/HumanRightsBrie/11fe5136-30b9-4295-a612-8a139372ebb4_CLDH-CFLI-DIGITAL-V2-EN-1.pdf

[^1_246]: http://siba-ese.unisalento.it/index.php/idps/article/download/30524/26539

[^1_247]: https://upr-info.org/sites/default/files/documents/2021-08/js12_upr37_lbn_e_main.pdf

[^1_248]: https://smex.org/wp-content/uploads/2021/02/SMEX-Device-Seizures-Report-2021-eng.pdf

[^1_249]: https://www.ecoi.net/en/file/local/2012422/cerd_c_lbn_23-24_E.pdf

[^1_250]: https://www.lawyers.com/beirut/lebanon/walid-ziade-1237422-a/

[^1_251]: https://upr-info.org/sites/default/files/documents/2021-08/js4_upr37_lbn_e_main.pdf

[^1_252]: https://elqarar.com/en/articles/196595/

[^1_253]: https://kooch.co/en/post/understanding-middle-east-data-protection-laws-for-2025

[^1_254]: https://caseguard.com/articles/data-privacy-and-protection-in-lebanon-new-legislation/

[^1_255]: https://www.edpb.europa.eu/documents_ga?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_topics:138\&f[1]=all_topics:770\&f[2]=all_topics:771\&f[3]=all_topics:873\&f[4]=all_topics:967\&page=47

[^1_256]: https://tietosuoja.fi/en/guidelines-of-the-european-data-protection-board

[^1_257]: https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_20240417_report_extraterritorial_enforcement_gdpr_en.pdf?download=1

[^1_258]: https://www.nishimura.com/sites/default/files/images/newsletter_201811_corporate.pdf

[^1_259]: https://revistas.pucp.edu.pe/index.php/derechopucp/en/article/view/21472

[^1_260]: https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:32016R0679

[^1_261]: https://www.legislation.gov.uk/eur/2016/679/article/33/england/data.xml

[^1_262]: https://eur-lex.europa.eu/legal-content/fi/HIS/?uri=CELEX:32016R0679

[^1_263]: https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679

[^1_264]: https://eur-lex.europa.eu/legal-content/EN-IT/TXT/?uri=CELEX:32016R0679

[^1_265]: https://eur-lex.europa.eu/search.html?DTS_DOM=ALL\&DTS_SUBDOM=ALL_ALL\&LB=32016R0679\&SELECT=LB_DISPLAY\&SUBDOM_INIT=ALL_ALL\&lang=en\&type=advanced

[^1_266]: https://publications.europa.eu/resource/cellar/5f2552c2-cc45-11e6-ad7c-01aa75ed71a1.0022.03/DOC_1

[^1_267]: https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2021/guidelines-052021-interplay-between-application_es?order=field_edpb_date\&sort=desc\&page=6

[^1_268]: https://www.edpb.europa.eu/public-consultations/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and_hu

[^1_269]: https://ia800800.us.archive.org/6/items/edpb_guidelines_202005_consent_en/edpb_guidelines_202005_consent_en_djvu.txt

[^1_270]: https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_fi

[^1_271]: https://asociaciondpd.com/wp-content/uploads/2020/05/1240F1589176130_edpb_guidelines_202005_consent_en_es.pdf

[^1_272]: https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_de

[^1_273]: https://www.edpb.europa.eu/our-work-tools/our-documents/topic/international-transfers-data_en?page=12

[^1_274]: https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_nl

[^1_275]: https://cpdp.bg/userfiles/file/EDPB/edpb_guidelines_202005_consent_bg.pdf

[^1_276]: https://www.aki.ee/sites/default/files/dokumendid/EU_suunised/edpb_guidelines_202005_consent_et.pdf

[^1_277]: https://www.cnil.fr/fr/les-equipements-professionnels

[^1_278]: https://www.cnil.fr/fr/lecoute-et-lenregistrement-des-appels-sur-le-lieu-de-travail

[^1_279]: https://www.cnil.fr/fr/cnil-direct/question/enregistrement-ou-ecoute-des-conversations-telephoniques-des-salaries-que-faire

[^1_280]: https://www.cnil.fr/en/cnil-direct/question/controle-du-telephone-au-travail-que-faire

[^1_281]: https://www.cnil.fr/sites/cnil/files/atoms/files/ns57.pdf

[^1_282]: https://commission.europa.eu/law/law-topic/data-protection_en

[^1_283]: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection_en

[^1_284]: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/brexit_en

[^1_285]: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/binding-corporate-rules-bcr_en

[^1_286]: https://anuragverma.co/worldwatch/lebanon/cybersecurity

[^1_287]: https://www.levellers.ai/what-is/ai-regulation-lebanon

[^1_288]: https://publicworksstudio.com/the-2024-budget-rewarding-property-owners-and-speculators/

[^1_289]: https://lebeconomy.com/315197/

[^1_290]: http://www.pcm.gov.lb/arabic/subpg.aspx?pageid=24321

[^1_291]: https://lawsociety.ly/legislation/قرار-رقم-81-لسنة-2025-م-بشأن-اعتماد-لائحة-تنظ/

[^1_292]: https://www.annahar.com/arabic/section/76-سياسة/304318/بري-وقع--قانون-موازنة-عام-2024

[^1_293]: https://lebaneselegislation.com/ar/topic/cybercrime-electronic-transactions/

[^1_294]: https://congbao.chinhphu.vn/van-ban/luat-so-81-2025-qh15-45513.htm

[^1_295]: https://www.lawrtal.com/ar/legislation/19659

[^1_296]: https://vbpl.vn/TW/Pages/vbpq-van-ban-goc.aspx?ItemID=179416

[^1_297]: https://vanban.chinhphu.vn/?pageid=27160\&docid=214577\&classid=1\&orggroupid=1

[^1_298]: https://congbao.chinhphu.vn/van-ban-dang-cong-bao/quoc-hoi-c31/trang-13.htm

[^1_299]: https://vbpl.vn/botuphap/Pages/vbpq-van-ban-goc.aspx?ItemID=179416

[^1_300]: https://aeplegal.com/app/uploads/2025/07/D.Lgs-n.-81_2025.pdf

[^1_301]: https://cyrilla.org/ar/entity/jqgn2g3qudqkqfl4zj5mkuik9/references

[^1_302]: https://www.edpb.europa.eu/search_et?f[0]=content_type:edpb_publication\&f[1]=publication_type:64\&f[2]=publication_type:904\&f[3]=year:2023\&search=GDPR

[^1_303]: https://www.edpb.europa.eu/documents_nl?page=23\&type[0]=

[^1_304]: https://www.edpb.europa.eu/documents_nl?amp;amp;amp;amp;f[0]=all_topics:747\&amp;amp;f[1]=all_topics:125\&f[0]=all_topics:112\&f[1]=all_topics:155\&f[2]=all_topics:743\&f[3]=all_topics:967\&page=24

[^1_305]: https://www.edpb.europa.eu/documents_hr?page=23\&type[0]=

[^1_306]: https://www.legislation.gov.uk/cy/eur/2016/679/chapter/IV/2026-09-30?ref=caesar.co.uk\&view=extent\&timeline=false

[^1_307]: https://www.edpb.europa.eu/system/files/2023-04/20230214plenfinalminutes75thplenarymeeting_en.pdf

[^1_308]: https://www.edpb.europa.eu/system/files/2023-02/2023021415plen1.2agenda_public.pdf

[^1_309]: https://www.legislation.gov.uk/eur/2016/679/chapter/IV/section/1/2026-09-30?ref=caesar\&view=plain

[^1_310]: https://www.edpb.europa.eu/documents_bg?amp;amp;amp;f[1]=all_topics:741\&f[0]=all_members:85\&f[0]=all_publication_type:98\&f[1]=all_topics:745\&f[2]=all_topics:747\&f[3]=all_topics:765\&f[4]=all_topics:768\&page=23

[^1_311]: https://www.edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en?amp;amp;f[0]=opinions_publication_type:64\&f[1]=opinions_topics:139\&f[0]=opinions_topics:935\&f[0]=opinions_topics:136\&f[1]=opinions_topics:770\&f[2]=opinions_topics:935

