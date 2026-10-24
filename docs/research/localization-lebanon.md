# Arabic/English localization for Lebanon

**Recommended baseline:** use clear, contemporary Modern Standard Arabic (MSA) for the interface; Western digits `0–9`; Lebanese month names; an explicitly configured Gregorian calendar and `Asia/Beirut` time zone; and semantic RTL layout with isolated LTR identifiers. Lebanese public-service and commercial examples support several of these choices, but they do **not** establish a population-wide preference.[^1_1][^1_2][^1_3][^1_4][^1_5]

**Evidence limitation:** this is an evidence-qualified implementation report, not a completed Lebanese usability study. Exact CLDR regional defaults, authenticated banking interfaces, individual screen-reader/browser combinations, font licenses, and term-by-term terminology-portal matches remain **unverified** where identified below.

## Evidence interpretation

The report distinguishes three things:

- **Verified evidence:** an inspected primary source or published study supports the stated observation.
- **Recommendation:** a proposed product decision, not a claim about what all Lebanese users prefer.
- **Unverified:** the necessary source inspection, runtime experiment, or native-speaker validation was not completed.

Evidence strength describes the support for a decision—not merely the authority of a source. An official website strongly establishes **that website’s behavior**, but only moderately supports a national interface convention.

## Numerals

### Verified findings

Western digits appear in Arabic Lebanese government and financial-regulatory content: the Ministry of Finance service displays `20/06/2026` and the telephone number `1710`; the Banking Control Commission’s Arabic table displays dates such as `2026/06/30`, circular numbers, and percentages using Western digits.[^1_2][^1_1]

The Arabic 2026 citizen-budget publication combines Western digits with Arabic financial text and the Lebanese abbreviation `ل.ل.`; Spinneys Lebanon displays an exchange-rate statement using `USD`, `LBP`, and Western digits.[^1_3][^1_4]

The inspected Arabic Toters App Store listing contains Western digits in developer-authored promotional examples, while Apple’s surrounding storefront also contains Arabic-Indic digits: this is evidence of mixed publishing conventions, **not** an inspection of the app’s transaction screens.[^1_5]

A Lebanese WhatsApp study collected 227,059 messages from 1,112 students in 33 groups across seven universities and documented Arabic-script, Latin-script, and mixed writing; its sample and method do not establish a national preference for interface numerals.[^1_6]

**Unverified:** no representative Lebanese experiment comparing `123` with `١٢٣` was established here. Direct inspections of Bank Audi, BLOM, Byblos, and other authenticated banking apps were not completed.

### Recommendation

Default to **Western digits `0–9` in both interface languages**. Offer an optional Arabic-Indic **display preference** if the product can support it consistently; do not make that setting alter identifiers, stored data, or user-authored messages.


| Context | Recommended behavior |
| :-- | :-- |
| Phone numbers | Display and copy as an isolated LTR token; preserve the international `+` and leading zeros where relevant |
| Prices | Format numeric values through a shared formatter; label the currency explicitly |
| Dates and times | Apply the selected display numbering system consistently |
| Ticket IDs | Preserve the exact canonical identifier, including digits, punctuation, and case |
| Charts | Use the selected numeral preference for ticks and tooltips; do not change numeric values |
| Numeric inputs | Accept Western and Arabic-Indic digits; normalize only in fields explicitly defined as numeric |
| Chat and Arabizi | Preserve the original text; never globally replace digit characters |
| Exports and APIs | Use machine-readable values and canonical identifiers, not localized display strings |

**Critical distinction:** `3` in an Arabizi word is not necessarily a quantity. The Lebanese study explicitly used digits embedded in Latin words to help identify Arabizi, while acknowledging limitations in that detection method.[^1_6]

## Dates and times

### Verified findings

The Lebanese citizen-budget publication uses `كانون الثاني` for January, whereas the inspected generic Arabic CLDR date chart shows `يناير` in its January example.[^1_7][^1_3]

Lebanese official pages do not demonstrate one universal numeric date order: the Ministry of Finance service uses day/month/year, while the Banking Control Commission’s table uses year/month/day and its document titles also contain day/month/year dates.[^1_1][^1_2]

The WhatsApp study encountered both 12-hour and 24-hour exported timestamps and multiple date orders depending on device settings; these observations establish variation, not a preferred Lebanese clock format.[^1_6]

### Recommended product conventions

Use these as an **explicit product policy**, rather than relying on unspecified browser defaults:


| Surface | Recommendation |
| :-- | :-- |
| Public Arabic website | Written Lebanese month names, for example `24 تشرين الأول 2026` |
| Compact Arabic dates | Day/month/year, with an accessible full-date alternative |
| English website | An unambiguous written form such as `24 October 2026` |
| Chat timestamps | Respect a saved 12/24-hour preference; otherwise choose and document one default |
| Admin dashboard | Default to 24-hour time for operational consistency |
| Logs and exports | Machine-readable timestamps with offsets; preserve UTC instants |
| Display time zone | `Asia/Beirut`, explicitly configured |
| Date-only values | Store as date-only values, not arbitrary midnight timestamps |

The proposed Arabic month vocabulary is:


| Month | Product vocabulary |
| :-- | :-- |
| January | كانون الثاني |
| February | شباط |
| March | آذار |
| April | نيسان |
| May | أيار |
| June | حزيران |
| July | تموز |
| August | آب |
| September | أيلول |
| October | تشرين الأول |
| November | تشرين الثاني |
| December | كانون الأول |

The full list above is a **recommended Lebanese vocabulary set**; January has a directly inspected Lebanese example, but the complete list was not independently checked against the current `ar-LB` CLDR dataset.[^1_3]

### CLDR comparison status

| Locale | Verified here | Still unverified |
| :-- | :-- | :-- |
| `ar-LB` | Lebanese institutional use of a Levantine month name, not a CLDR default.[^1_3] | Exact default digits, month strings, hour cycle, date patterns, calendar |
| `ar` | Generic Arabic CLDR January example uses `يناير`.[^1_7] | Full runtime defaults in the target browser/ICU version |
| `ar-SA` | No regional dataset inspection completed | Calendar, digits, months, hour cycle, patterns |
| `ar-EG` | No regional dataset inspection completed | Digits, months, hour cycle, patterns |

Do **not** treat `ar`, `ar-SA`, or `ar-EG` as a verified substitute for Lebanese regional conventions.

### Explicit Intl configuration

The following is a **proposed implementation**, not a transcript of executed output:

```js
const preferences = {
  language: "ar",
  numberingSystem: "latn", // optional alternative: "arab"
  hourCycle: "h23",       // optional alternative: "h12"
  timeZone: "Asia/Beirut"
};

const locale =
  preferences.language === "ar" ? "ar-LB" : "en-LB";

const dateFormatter = new Intl.DateTimeFormat(locale, {
  calendar: "gregory",
  numberingSystem: preferences.numberingSystem,
  timeZone: preferences.timeZone,
  year: "numeric",
  month: "long",
  day: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat(locale, {
  calendar: "gregory",
  numberingSystem: preferences.numberingSystem,
  timeZone: preferences.timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: preferences.hourCycle
});

const numberFormatter = new Intl.NumberFormat(locale, {
  numberingSystem: preferences.numberingSystem
});
```

**Required verification:** run the following audit in every supported runtime, save its output, and compare it with the product’s approved conventions. Runtime behavior must not be claimed as verified until this has been executed.

```js
const instant = new Date("2026-01-15T13:05:00Z");

const audit = ["ar-LB", "ar", "ar-SA", "ar-EG"].map(locale => {
  const dates = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Beirut",
    dateStyle: "full",
    timeStyle: "short"
  });

  const months = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      timeZone: "UTC",
      month: "long"
    }).format(new Date(Date.UTC(2026, month, 15)))
  );

  const numbers = new Intl.NumberFormat(locale);

  return {
    locale,
    dateOptions: dates.resolvedOptions(),
    numberOptions: numbers.resolvedOptions(),
    dateExample: dates.format(instant),
    numberExample: numbers.format(1234567.89),
    months
  };
});

console.log(JSON.stringify(audit, null, 2));
```

Additional product rules:

- Never hard-code Beirut as a permanent UTC offset.
- Test dates around offset transitions using the runtime’s installed time-zone data.
- Define how scheduling handles ambiguous or nonexistent local times.
- When AI chat receives an ambiguous date such as `03/04`, request clarification before performing a consequential action.
- Keep date-only values separate from instants to avoid unintended day changes.

These are engineering recommendations; current IANA data and the exact transition behavior remain **unverified** in this report.

## Currency and prices

### Verified findings

Lebanese official Arabic financial material uses `ل.ل.`; an inspected Lebanese retailer displays both `USD` and `LBP` and publishes its own conversion statement.[^1_4][^1_3]

That retailer’s displayed rate is evidence of **its page**, not proof of a universal, current, legally applicable Lebanese exchange rate.[^1_4]

### Recommendation

Use **explicit currencies**, not an unlabeled `$`, wherever a support action can affect billing or refunds.


| Context | Recommended policy |
| :-- | :-- |
| Arabic public price | Localized number plus an approved currency label |
| Arabic LBP label | `ل.ل.` in familiar consumer contexts; `LBP` where operational clarity matters |
| USD billing | `USD` or `دولار أميركي`; introduce `$` only where its meaning is unambiguous |
| Admin money columns | Currency in the column header and in accessible/exported values |
| Refunds and disputes | State amount, currency, payment method, and applicable conversion basis |
| Conversion | Show source, effective timestamp, rate, and rounding policy |
| Currency arithmetic | Keep amounts and currency codes separate from display strings |

Treat whole-pound LBP display and two-decimal USD display as **product policies**, not as verified statements about universal Lebanese practice or currency-standard defaults.

```js
function formatMoney(amount, currency, language = "ar") {
  return new Intl.NumberFormat(
    language === "ar" ? "ar-LB" : "en-LB",
    {
      style: "currency",
      currency,
      currencyDisplay: "code",
      numberingSystem: "latn",
      minimumFractionDigits: currency === "USD" ? 2 : 0,
      maximumFractionDigits: currency === "USD" ? 2 : 0
    }
  ).format(amount);
}
```

Do not manually reverse the result or concatenate a symbol based on its apparent screen position. Isolate the complete formatted token; W3C guidance recommends tightly wrapping opposite-direction phrases and isolating unknown inserted content.[^1_8]

```html
<p dir="rtl">
  المبلغ المستحق:
  <bdi dir="auto">{{ formattedAmount }}</bdi>
</p>
```

If the design requires a fixed operational representation, define it explicitly—for example, an LTR-isolated `USD 12.50` token—rather than pretending it is the locale formatter’s native output.

## Bidirectional text

### Verified findings

W3C distinguishes an RTL paragraph’s base direction from embedded numbers and Latin text, which retain their own directional behavior; it recommends `dir="auto"` for suitable user-input fields and `<bdi>` or tightly wrapped directional markup for inserted content.[^1_8]

### Recommended component contracts

| Content | Direction contract |
| :-- | :-- |
| Arabic interface shell | Explicit RTL |
| English interface shell | Explicit LTR |
| Unknown name or short inserted phrase | `<bdi>` or a tightly wrapped element with `dir="auto"` |
| Known phone, email, URL, ticket ID | Isolated LTR token |
| User message | Direction per message or paragraph, not per application language |
| Arabizi message | Usually an LTR presentation candidate; never identify it as English solely because it uses Latin letters |
| Code block | LTR code presentation |
| Multiline mixed content | Separate paragraph handling; do not assume one direction fits the entire conversation |

The wrapping and automatic-direction approach follows W3C’s bidi guidance; the application-specific contracts are recommendations.[^1_8]

```html
<html lang="ar-LB" dir="rtl">
  <body>
    <p>
      رقم الطلب:
      <bdi dir="ltr">SUP-2026-00127</bdi>
    </p>

    <p>
      البريد الإلكتروني:
      <bdi dir="ltr">support@example.com</bdi>
    </p>

    <label for="message">الرسالة</label>
    <textarea id="message" dir="auto"></textarea>

    <label for="phone">رقم الهاتف</label>
    <input id="phone" type="tel" dir="ltr">

    <article class="message" dir="auto">
      {{ escapedUserMessage }}
    </article>
  </body>
</html>
```

**Important qualification:** `dir="auto"` is direction handling, not language detection. W3C describes its behavior in terms of strong directional characters; it cannot establish whether Latin-script input is English or Arabizi.[^1_8]

### Isolation policy

For HTML, prefer semantic markup. For plain-text channels, adopt an approved isolation helper with these Unicode characters, and verify it against the Unicode Bidirectional Algorithm before release:


| Character | Intended use in the proposed helper |
| :-- | :-- |
| LRI, U+2066 | Start an isolated known-LTR token |
| RLI, U+2067 | Start an isolated known-RTL token |
| FSI, U+2068 | Start an isolated unknown-direction token |
| PDI, U+2069 | Close the isolate |

**Verification status:** the control-character table and the exact CSS behavior below were not independently checked against the current Unicode/CSS specifications in this research pass.

Proposed CSS:

```css
.identifier {
  direction: ltr;
  unicode-bidi: isolate;
}

.message {
  text-align: start;
}
```

Recommended safeguards:

- Do not use `<bdo>` or bidi overrides as a routine mixed-text fix.
- Do not reverse strings.
- Do not insert invisible marks into canonical ticket IDs.
- Provide clean copy actions for phone numbers, emails, IDs, and URLs.
- Detect suspicious bidi controls in security-sensitive identifiers.
- Preserve user messages separately from any normalized search representation.
- Escape user content before inserting it into HTML.


### Bidi test cases

The following are **synthetic fixtures**, not observed user messages:

```text
مرحباً، رقم الطلب SUP-2026-00127.
تم إرسال الرد إلى support@example.com.
اتصل على +961 1 234 567.
السعر USD 12.50، وليس LBP 12.50.
الرابط: https://example.com/help?ticket=SUP-127&lang=ar
مرحبا John Smith (VIP)، هل وصل الملف invoice-2026.pdf؟
ma 3am ye2bal el password, ticket SUP-127
Hello، ما وصلني رمز OTP بعد.
2026: مرحباً، بدي مساعدة.
🙂 مرحباً — test@example.com — تم.
```

Test display, line wrapping, selection, caret movement, deletion, copy/paste, search, notification previews, and export—not just screenshots.

## Layout mirroring

### Verified findings

Material’s RTL guidance calls for directional layout adaptation, mirroring directional navigation icons, and RTL linear progress for most RTL languages; it also explicitly warns that not every element mirrors.[^1_9][^1_10]

Its cited LTR chart example concerns Persian and Urdu; that example does **not** prove a universal Arabic chart-axis rule.[^1_9]

### Recommended mirroring policy

| Element | Product rule | Qualification |
| :-- | :-- | :-- |
| Navigation shell | Mirror inline-start/end placement | Follow reading/navigation direction |
| Form labels and text alignment | Use logical start/end | Do not force every field’s contents RTL |
| Breadcrumbs and step navigation | Follow locale direction | Validate labels and arrow semantics together |
| Back/forward chevrons | Mirror semantic navigation icons | Supported by Material guidance.[^1_9] |
| Up/down arrows | Do not flip merely for RTL | Proposed icon contract |
| Checkmarks | Preserve the approved glyph | Proposed icon contract |
| Logos and trademarks | Do not mirror artwork | Proposed brand contract |
| Photographs and illustrations | Do not automatically mirror | Review meaningful directional content individually |
| Analog clocks | Preserve physical clock geometry | Proposed component contract |
| Phone keypad | Preserve the approved keypad arrangement | Do not reverse digit order |
| Upload/download | Preserve vertical action meaning | Proposed icon contract |
| Media controls | Do not apply a global horizontal transform | Review the player’s own timeline and control semantics |
| Task progress | Default RTL fill for Arabic | Consistent with Material’s stated progress guidance.[^1_9] |
| Time-series charts | Keep chronological direction explicitly specified | Fixed LTR is recommended for this admin product, not claimed as a Lebanese universal |
| Category charts | Choose ordering intentionally | Do not let page direction silently reorder data |
| Geographic maps | Preserve geographic meaning | Do not mirror coordinates |
| Table columns | Adapt visual reading order deliberately | Keep semantic DOM and keyboard order coherent |

**Do not state “all charts must remain LTR” as a universal Arabic standard.** For this support dashboard, fixed LTR chronological axes are a defensible **product recommendation** for comparison across languages; Lebanese preference remains **unverified**.

### Logical CSS policy

Proposed implementation:

```css
.panel {
  padding-inline: 1rem;
  margin-inline-start: 0.5rem;
  border-inline-start: 1px solid var(--border);
  text-align: start;
}

.toolbar {
  display: flex;
  gap: 0.75rem;
}

.layout {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
}
```

Do not automatically add `row-reverse`, reverse the data array, and swap physical margins when switching to RTL. Treat that combination as a **double-mirroring risk** to catch in visual tests.

**Verification status:** exact Flexbox/Grid directional behavior and plugin configuration were not independently source-audited here. The implementation must be tested against the supported CSS engines.

### Legitimate physical properties

Allow physical `left`/`right` when they express **physical geometry**, rather than reading order:

- Map coordinates and geographic overlays.
- Chart plotting coordinates inside an explicitly fixed-direction plotting surface.
- Canvas/video annotations tied to source-media coordinates.
- Image cropping or artwork positioning.
- A documented third-party API that requires physical offsets.
- A specifically approved nonmirroring component.

Use a logical-properties lint rule such as a rule from `stylelint-use-logical`, but verify its current package name, rule names, maintenance status, and behavior before adoption: these details are **unverified** here.

Require exceptions to include a reason and test reference:

```css
/* rtl-physical-exception:
   Coordinates refer to the source image, not reading order.
   Test: annotation-overlay-rtl */
.annotation {
  left: var(--source-x);
}
```

The enforceable policy should be **“logical by default, reviewed physical exceptions”**, not “the words left and right may never appear.”

## Typography

### Verified findings

Microsoft’s Arabic localization guide recommends Western digits, concise language, selective diacritics, and gender-neutral alternatives; it also notes that Arabic has no capitalization. See the inspected [Microsoft Arabic localization guide](https://download.microsoft.com/download/5/6/d/56d1774f-ac3f-4ad9-80af-a6dfd5df419d/ara-sau-StyleGuide.pdf).

### Font shortlist

These are **candidates for evaluation**, not licensed-and-approved selections:


| Arabic candidate | Proposed Latin pairing | License status here |
| :-- | :-- | :-- |
| Noto Sans Arabic | Noto Sans | **Unverified** against the actual distributed files |
| IBM Plex Sans Arabic | IBM Plex Sans | **Unverified** against the actual distributed files |
| Cairo | Its bundled Latin, after review | **Unverified** |
| Tajawal | Its bundled Latin, after review | **Unverified** |

Do not ship based on an assumed license. Record the exact font version, source, license file, modification restrictions, and redistribution obligations in the dependency inventory.

### Recommended type rules

- Start evaluation around `1rem` body text and unitless `1.6` line height; treat these as design starting points, not an Arabic standard.
- Compare apparent size, counters, dots, and diacritics—not just identical CSS pixel sizes.
- Avoid fixed-height text containers.
- Preserve Arabic joining and mark positioning when building font subsets.
- Test font fallback, bold weights, loading failure, and mixed Arabic/Latin baselines.
- Prefer selective disambiguating tashkeel in interface copy rather than fully vocalizing every string.
- Preserve user-entered diacritics in displayed messages and names.
- Do not remove hamza, dots, or other meaningful distinctions as a display “cleanup.”


### Tracking, italics, and uppercase

Adopt this **product rule** for Arabic interface text:

```css
:lang(ar) {
  letter-spacing: normal;
  text-transform: none;
}

.arabic-ui {
  font-synthesis: none;
}
```

Do not explain the rule as “Arabic can never have italics” or “CSS spacing always breaks Arabic.” Instead, prohibit **unreviewed Latin-style tracking and synthetic slanting** in this interface, and permit an intentionally designed alternative only after typographic review.

Use weight, contrast, and layout for emphasis. Arabic itself has no uppercase distinction, while an uppercase transform can still affect embedded Latin content; the no-capitalization point is documented in Microsoft’s guide linked above.

### Performance policy

Recommended release checks:

- Prefer WOFF2 where supported by the product’s browser policy.
- Load only required families and weights.
- Verify shaping and diacritic coverage after subsetting.
- Test a page containing Arabic, English, Arabizi, currency, and extended punctuation.
- Measure actual transfer size and rendering behavior before choosing variable versus static files.
- Avoid preloading every font file.
- Do not claim a performance improvement without measurements.

Exact licensing, subsetting-tool behavior, and measured performance remain **unverified**.

## Language and tone

### Verified findings

The Ministry of Finance’s interface uses standard Arabic administrative and account terminology, including `تسجيل الدخول` and `كلمة المرور`; the Banking Control Commission’s interface uses standard Arabic labels and formal regulatory prose.[^1_2][^1_1]

Toters’ developer-authored Arabic listing mixes standard Arabic with Lebanese-flavored wording such as `دايماً قريب` and `بالخدمة`; its current storefront text is not proof that every in-app label uses dialect.[^1_5]

The inspected touch pages establish English-language authentication and support surfaces, but do not establish the wording of touch’s Arabic interface.[^1_11][^1_12]

**Unverified:** Alfa’s Arabic interface, touch’s complete Arabic flow, authenticated bank interfaces, and a representative set of Lebanese e-commerce apps were not inspected sufficiently to characterize their house styles.

### Recommended register

| Surface | Recommended register |
| :-- | :-- |
| Buttons and navigation | Concise contemporary MSA |
| Validation and errors | Clear MSA; explain the problem and next action |
| Security, payments, consent | Precise MSA; avoid playful dialect |
| Public marketing | MSA with optional reviewed Lebanese flavor |
| AI assistant | Default clear Arabic; allow a Lebanese conversational mode |
| Agent conversation | Follow the customer’s chosen language and appropriate tone |
| Admin dashboard | Consistent technical MSA, with selective English aliases where tested |

Do not equate approachable Arabic with heavy dialect or excessively formal Arabic. A support interface should be understandable before it is distinctive.

### Gender-neutral wording

Use nominal action labels and impersonal problem descriptions where natural. Microsoft’s guide explicitly includes gender-neutral strategies, although its broader guidance also contains imperative examples; it should not be read as imposing one grammatical construction everywhere. See the [Microsoft guide](https://download.microsoft.com/download/5/6/d/56d1774f-ac3f-4ad9-80af-a6dfd5df419d/ara-sau-StyleGuide.pdf).


| Avoid as the default | Proposed replacement |
| :-- | :-- |
| أنت مسجل الدخول | تم تسجيل الدخول |
| لقد أدخلت كلمة مرور خاطئة | كلمة المرور غير صحيحة |
| اختر / اختاري ملفاً | اختيار ملف |
| هل أنت متأكد؟ | تأكيد حذف الملف؟ |
| عزيزي العميل | مرحباً |
| يجب أن تكون مسجلاً | يلزم تسجيل الدخول |

These are **editorial proposals**, not translations quoted from a Lebanese company.

Do not import a European-style formal/informal “you” toggle. For this product, express politeness through wording and clarity; do not mechanically pluralize every address or assume a user’s gender.

### AI language policy

Recommended behavior:

- Accept Lebanese Arabic, Arabizi, MSA, and English without requesting a script change.
- Keep interface language separate from conversation language.
- Offer an explicit reply-language preference.
- Preserve names, identifiers, amounts, and quoted customer text.
- Do not infer language solely from script.
- Do not automatically transliterate all Arabizi.
- Ask about consequential ambiguity instead of guessing.
- Maintain the approved register for security, financial, and policy statements.
- Evaluate answers with native Lebanese reviewers, including users who prefer Arabic script.

The need to accommodate varied scripts has direct support from the Lebanese WhatsApp study, but this particular AI policy is a product recommendation.[^1_6]

## Grammar and plurals

### Verification status

The six categories in the request—`zero`, `one`, `two`, `few`, `many`, and `other`—should be part of the implementation contract. However, the current Arabic CLDR plural-rule table and the selected i18next version were **not independently inspected** in this research pass.

The following is therefore a **test specification to verify**, not a reported CLDR runtime result:


| Category | Expected representative inputs |
| :-- | :-- |
| `zero` | `0` |
| `one` | `1` |
| `two` | `2` |
| `few` | `3`, `7`, `10`, `103` |
| `many` | `11`, `25`, `99`, `111` |
| `other` | `100`, `101`, `102`, `1.5` |

Do not reduce Arabic to `count === 1 ? singular : plural`.

### Recommended message architecture

Translate complete messages, not separately concatenated number and noun fragments. Require linguistic review for number agreement, dual forms, case, and the counted noun.

Proposed ICU MessageFormat string:

```text
{count, plural,
  =0 {لا توجد طلبات دعم}
  one {طلب دعم واحد}
  two {طلبا دعم}
  few {# طلبات دعم}
  many {# طلب دعم}
  other {عدد طلبات الدعم: #}
}
```

The fallback deliberately uses a label-style construction rather than pretending every numerical value fits an identical noun phrase.

Proposed i18next resource structure, subject to verification against the installed version:

```json
{
  "ticketCount_zero": "لا توجد طلبات دعم",
  "ticketCount_one": "طلب دعم واحد",
  "ticketCount_two": "طلبا دعم",
  "ticketCount_few": "{{count}} طلبات دعم",
  "ticketCount_many": "{{count}} طلب دعم",
  "ticketCount_other": "عدد طلبات الدعم: {{count}}"
}
```

Recommended implementation rules:

- Pass a numeric `count`.
- Do not concatenate a translated noun after a separately formatted count.
- Do not pass ICU syntax into an engine that has not been configured to interpret it.
- Test the exact library version and its Arabic locale data.
- Include boundary values and decimals.
- Review each message in its actual grammatical context.
- Distinguish exact `=0` wording from category-based selection.

Primary verification targets are the [Unicode plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html), [ICU message documentation](https://unicode-org.github.io/icu/userguide/format_parse/messages/), and [i18next plural documentation](https://www.i18next.com/translation-function/plurals); their current contents remain **unverified here**.

## Terminology and glossary

### Terminology policy

Use one approved term per concept, with exceptions recorded by context. In particular, distinguish **upload** from **download**, **resolved** from **closed**, and a support **ticket** from a commercial order.

For customer-facing support, `طلب دعم` is recommended over a literal `تذكرة` where it improves clarity; `تذكرة دعم` remains a reasonable alternative to test. This is an editorial recommendation, **not a verified Lebanese preference**.

Microsoft’s guide directs localizers toward approved terminology resources, but a term-by-term Microsoft, Google, or Apple terminology audit was **not completed**. The glossary below is a proposed product glossary, not a falsely attributed export from those collections.

### Bilingual glossary

**Local-usage column:** “Test English alias” means a research candidate—not evidence that Lebanese users commonly prefer it. Unless a row contains a source citation, its terminology provenance and Lebanese preference remain **unverified**.


| English | Recommended Arabic | Lebanese usage or validation note |
| :-- | :-- | :-- |
| Support ticket | طلب دعم | Test `ticket` and `تذكرة دعم`; preference unverified |
| Ticket ID | رقم طلب الدعم | Keep the identifier unchanged |
| Dashboard | لوحة المعلومات | Test `dashboard`; preference unverified |
| Admin dashboard | لوحة الإدارة | Test with actual administrators |
| Escalation | تصعيد طلب الدعم | Test whether an explanatory label is clearer |
| Escalate to a specialist | إحالة الطلب إلى فريق مختص | Proposed customer-facing wording |
| Knowledge base | قاعدة المعرفة | Test `مركز المساعدة` for a public article collection |
| Help center | مركز المساعدة | Proposed |
| Log in | تسجيل الدخول | Observed on the Lebanese finance service.[^1_2] |
| Log out | تسجيل الخروج | Proposed |
| Sign up | إنشاء حساب | Proposed |
| Account | حساب | Proposed |
| Profile | الملف الشخصي | Proposed |
| Username | اسم المستخدم | Observed in the finance-service error text.[^1_2] |
| Password | كلمة المرور | Observed on the finance service.[^1_2] |
| Confirm password | تأكيد كلمة المرور | Proposed |
| Forgot password? | هل نسيت كلمة المرور؟ | Proposed |
| Reset password | إعادة تعيين كلمة المرور | Proposed |
| Two-factor authentication | المصادقة الثنائية | Test an explanatory description |
| Verification code | رمز التحقق | Developer-authored Toters release text uses this terminology.[^1_5] |
| One-time password | رمز مرور لمرة واحدة | Test `OTP`; preference unverified |
| Settings | الإعدادات | Proposed |
| Preferences | التفضيلات | Proposed |
| Language | اللغة | Proposed |
| Time zone | المنطقة الزمنية | Proposed |
| Notification | إشعار | Proposed |
| Notifications | الإشعارات | Proposed |
| Attachment | مرفق | Proposed |
| Attach file | إرفاق ملف | Proposed |
| Upload | رفع | Use for transfer to the service |
| Download | تنزيل | Use for transfer to the user’s device |
| File | ملف | Proposed |
| Folder | مجلد | Proposed |
| Status | الحالة | Proposed |
| Priority | الأولوية | Proposed |
| Low priority | أولوية منخفضة | Proposed |
| Normal priority | أولوية عادية | Proposed |
| High priority | أولوية عالية | Proposed |
| Urgent | عاجل | Define operational meaning |
| New | جديد | Check agreement with the named object |
| Open | مفتوح | Check agreement with the named object |
| Pending | قيد الانتظار | Define what is awaited |
| In progress | قيد المعالجة | Recommended for support work |
| Resolved | تم الحل | Keep distinct from closed |
| Closed | مغلق | Define reopening behavior |
| Reopen | إعادة فتح | Proposed |
| Assigned to | الفريق أو الشخص المسؤول | Adapt to available assignment types |
| Assignee | المسؤول عن الطلب | Review role terminology |
| Support agent | موظف الدعم | Consider `فريق الدعم` when a collective is sufficient |
| Customer | العميل | Validate brand preference against `الزبون` |
| Conversation | محادثة | Proposed |
| Message | رسالة | Proposed |
| Reply | رد | Proposed |
| Internal note | ملاحظة داخلية | Make its visibility explicit |
| Send | إرسال | Proposed |
| Save | حفظ | Proposed |
| Cancel | إلغاء | Proposed |
| Delete | حذف | Proposed |
| Edit | تعديل | Proposed |
| Search | بحث | Proposed |
| Filter | تصفية | Test with dashboard users |
| Sort | فرز | Proposed |
| Refresh | تحديث | Distinguish from editing data |
| Retry | إعادة المحاولة | Proposed |
| Back | رجوع | Proposed |
| Next | التالي | Proposed |
| Previous | السابق | Proposed |
| Submit | إرسال | Use a more specific action when possible |
| Confirm | تأكيد | Proposed |
| Continue | متابعة | Proposed |
| Required | مطلوب | Check agreement or use a neutral field instruction |
| Optional | اختياري | Proposed |
| Error | خطأ | Proposed |
| Warning | تحذير | Proposed |
| Success | اكتملت العملية بنجاح | Prefer a specific completion message |
| Loading | جارٍ التحميل | Proposed |
| Offline | غير متصل بالإنترنت | Proposed |
| Connection lost | انقطع الاتصال | Proposed |
| Session expired | انتهت صلاحية الجلسة | Proposed |
| Permission | صلاحية | Proposed |
| Access denied | لا تتوفر صلاحية الوصول | Proposed |
| Customer support | دعم العملاء | Proposed |
| AI assistant | مساعد بالذكاء الاصطناعي | Test against shorter `المساعد الذكي` |
| Human support | التواصل مع فريق الدعم | Proposed customer-facing action |
| Feedback | ملاحظات | Test context; do not use one translation for every sense |
| Satisfaction rating | تقييم الرضا | Proposed |
| Response time | وقت الاستجابة | Define the measurement |
| Resolution time | الوقت المستغرق للحل | Define the measurement |
| Service-level agreement | اتفاقية مستوى الخدمة | Test `SLA` in the admin interface |
| Export | تصدير | Proposed |
| Import | استيراد | Proposed |
| Report | تقرير | Proposed |
| Chart | مخطط بياني | Proposed |
| Table | جدول | Proposed |
| Row | صف | Proposed |
| Column | عمود | Proposed |
| Date range | الفترة الزمنية | Prefer over a literal translation |
| Billing | الفوترة | Proposed |
| Invoice | فاتورة | Proposed |
| Refund | استرداد المبلغ | Proposed |

Before approving the glossary, conduct a terminology-source audit and a Lebanese task-based comprehension review. Do not label English aliases “common Lebanese usage” without evidence.

## Accessibility

### Verified findings

W3C’s bidi guidance supports explicit document direction, direction changes for embedded content, and automatic direction for appropriate user inputs; visual alignment alone is not the recommended replacement for directional markup.[^1_8]

**Unverified:** no empirical testing of this application with NVDA, JAWS, VoiceOver, or TalkBack was performed. No universal statement such as “all screen readers correctly handle mixed Arabic” is justified here.

### Recommended markup

```html
<html lang="ar-LB" dir="rtl">
```

For an English interface:

```html
<html lang="en-LB" dir="ltr">
```

Mark known English passages separately, while preserving the surrounding Arabic structure:

```html
<p>
  يمكن متابعة الطلب في
  <span lang="en" dir="ltr">Customer Portal</span>.
</p>
```

W3C’s directional guidance supports explicit wrapping of opposite-direction phrases; language tagging and assistive-technology behavior require separate verification.[^1_8]

For Arabizi, do not automatically assign `lang="en"` simply because its characters are Latin. Treat language metadata and text direction as independent properties, and test whether any proposed `ar-Latn` tagging helps the actual supported speech stack.

### Assistive-technology matrix

| Stack to test | Required tasks | Status |
| :-- | :-- | :-- |
| NVDA with supported Windows browsers | Arabic labels, mixed messages, IDs, tables, errors | **Unverified** |
| JAWS with supported Windows browsers | Same tasks, plus dashboard navigation | **Unverified** |
| VoiceOver with Safari on macOS | Reading order, controls, language changes | **Unverified** |
| VoiceOver with Safari on iOS | Chat updates, forms, touch navigation | **Unverified** |
| TalkBack with Chrome on Android | Chat, keyboard entry, validation, notifications | **Unverified** |

Record OS, browser, screen-reader version, installed voice, voice language, and settings. A passing result on one stack must not be generalized to another.

### Proposed accessibility requirements

Target WCAG 2.2 AA, but treat formal criterion mapping and conformance as **unverified** until audited against the [W3C recommendation](https://www.w3.org/TR/WCAG22/).

Required acceptance checks:

- Semantic DOM order remains meaningful in both directions.
- Keyboard focus order matches the task.
- Labels remain visible and programmatically associated.
- Errors identify the field, problem, and recovery action.
- Arabic text survives zoom, reflow, and user text-spacing changes.
- Diacritics are not clipped.
- Icon-only controls have localized accessible names.
- Chart information is available in an accessible textual or tabular form.
- Status updates are announced without repeatedly interrupting users.
- AI streaming does not announce every token individually.
- Phone numbers, currencies, dates, and IDs are understandable when spoken.
- English fragments receive appropriate language metadata where known.
- Destructive confirmations do not rely only on icon orientation or color.

Do not invent an “Arabic WCAG requirement” that mandates a particular digit family, dialect, or font.

## Testing strategy

### Automated and manual layers

W3C’s bidi guidance and Material’s RTL guidance provide a basis for testing direction handling and selective mirroring rather than applying one indiscriminate flip.[^1_9][^1_8]


| Layer | Recommended checks |
| :-- | :-- |
| String validation | Missing keys, untranslated text, interpolation integrity, forbidden terminology |
| Pseudo-localization | Expansion, wrapping, combining marks, mixed scripts, deliberate direction stress |
| Unit tests | Formatting options, plural boundaries, numeric normalization, ID preservation |
| Component tests | Inputs, dropdowns, calendars, dialogs, tables, charts |
| Visual regression | Separate approved LTR and RTL baselines |
| Browser tests | Supported engines and responsive widths |
| Accessibility | Automated checks plus the screen-reader matrix |
| Human linguistic review | Lebanese native speakers using actual tasks |
| AI evaluation | Script switching, ambiguity, terminology, escalation, preservation of amounts and IDs |

**Tool status:** particular pseudo-localization packages, visual-regression products, accessibility scanners, and stylelint plugin versions were not independently evaluated here.

### Pseudo-localization policy

Create two separate test modes:

- **Expansion mode:** longer labels, multiline buttons, long error text, and long customer names.
- **Bidi-stress mode:** Arabic, Latin, punctuation, leading numbers, URLs, and isolated identifiers.

Do not treat reversing English text as realistic Arabic pseudo-localization. Do not mistake a pseudo-localized pass for native-language approval.

### Native-speaker recruitment

Recommended reviewer coverage:

- Lebanese Arabic-script users.
- Arabizi-heavy users.
- English-dominant bilingual users.
- At least one experienced support agent or administrator.
- People using relevant accessibility technology, where feasible.

This is a proposed coverage strategy, not a representative sampling claim. The Lebanese WhatsApp study demonstrates meaningful differences between sampled educational contexts, which argues against reviewing only one homogeneous user group.[^1_6]

## Decision table

| Topic | Recommended choice | Alternatives | Evidence strength |
| :-- | :-- | :-- | :-- |
| Interface register | Contemporary MSA | Reviewed dialect for selected marketing/chat | **Moderate**: official and commercial examples differ.[^1_2][^1_5] |
| Default digits | Western `0–9` | Optional Arabic-Indic display preference | **Moderate** for Lebanon; directly observed across several sources.[^1_1][^1_2][^1_3] |
| National numeral preference | Do not claim one | Commission a representative study | **Unverified** |
| Digit normalization | Numeric fields only | None for user-authored chat | **Moderate** rationale from documented Arabizi use.[^1_6] |
| Arabic month vocabulary | Lebanese/Levantine names | Numeric compact dates | **Moderate** for January; full dataset verification pending.[^1_3] |
| Exact CLDR defaults | Audit supported runtimes | Pin a formatting layer | **Unverified** |
| Calendar | Explicit Gregorian | Additional calendars if required | **Weak** as a preference claim; explicit product policy |
| Numeric date order | Day/month/year | Written dates; ISO-style operational views | **Moderate**: official examples vary.[^1_2][^1_1] |
| Public clock | Saved user preference | Documented 12- or 24-hour default | **Weak** for national preference |
| Admin clock | 24-hour | Saved preference | **Weak**; operational recommendation |
| Time zone | `Asia/Beirut` | User-selected zone when needed | **Unverified** against current IANA data here |
| Currency labels | Explicit LBP/USD | Local abbreviation in familiar contexts | **Moderate**.[^1_3][^1_4] |
| Exchange rate | Configured, sourced, timestamped | No conversion | **Strong** need for scope discipline; no national current rate established |
| Unknown inserted text | Isolation and automatic direction | Known-direction wrappers | **Strong** W3C guidance.[^1_8] |
| Navigation mirroring | Semantic and selective | Component-specific exceptions | **Strong** platform guidance.[^1_9] |
| Chart time axis | Fixed LTR for this dashboard | Explicitly designed RTL chart | **Weak** for Lebanese preference |
| Progress direction | RTL for Arabic task progress | Documented semantic exception | **Strong** platform guidance.[^1_9] |
| Physical CSS | Reviewed exception allowlist | Logical properties elsewhere | **Moderate** design rationale; tooling unverified |
| Font choice | Evaluate an Arabic-capable shortlist | Licensed system/custom font | **Unverified** licensing and comparative legibility |
| Arabic styling | No unreviewed tracking/slant/case transforms | Designed alternatives after review | **Moderate** editorial policy; exact CSS audit pending |
| Plurals | Full Arabic category support | Complete-message rewrites | **Unverified** current CLDR/library integration here |
| Terminology | Approved contextual glossary | Tested English aliases | **Weak** until source and user validation |
| Screen-reader support | Test named combinations | Narrower documented support | **Unverified** |
| Release acceptance | Automation plus native review | Neither alone is sufficient as product policy | **Moderate** engineering recommendation |

## Enforceable developer rules

The following are **proposed acceptance requirements**, not claims that this application already meets them.


| ID | Rule | Automated enforcement or test |
| :-- | :-- | :-- |
| LOC-01 | Set root `lang` and `dir` from interface language | DOM assertion on every route |
| LOC-02 | Keep interface language separate from conversation language | State-model and end-to-end tests |
| LOC-03 | Route dates, numbers, and money through shared formatters | Static analysis and code review |
| LOC-04 | Explicitly configure calendar, numbering system, and time zone | Formatter unit tests |
| LOC-05 | Preserve ticket IDs exactly | Round-trip and clipboard tests |
| LOC-06 | Never globally convert digits in chat | Regression fixtures containing Arabizi |
| LOC-07 | Normalize supported digit families only in numeric fields | Field-specific parser tests |
| LOC-08 | Never parse formatted currency as the source of truth | Architecture check and unit tests |
| LOC-09 | Never hard-code a permanent Beirut UTC offset | Search/lint check with reviewed exceptions |
| LOC-10 | Keep date-only values distinct from instants | Schema and date-boundary tests |
| BIDI-01 | Isolate unknown inserted inline text | Approved component API |
| BIDI-02 | Isolate known LTR identifiers | Component tests |
| BIDI-03 | Use automatic direction for free-text input where appropriate | DOM assertions and typing tests |
| BIDI-04 | Do not reverse strings to implement RTL | Static checks and review |
| BIDI-05 | Do not use bidi overrides without a documented exception | Unicode/control-character scan |
| BIDI-06 | Copy actions return canonical values | Clipboard assertions |
| CSS-01 | Use logical properties by default | Logical-properties lint rule |
| CSS-02 | Permit physical properties only with a documented geometry reason | Allowlist and suppression audit |
| CSS-03 | Do not globally transform the application with `scaleX(-1)` | CSS scan |
| CSS-04 | Mirror only icons marked directional in metadata | Icon registry test |
| CSS-05 | Reject accidental double mirroring | LTR/RTL component snapshots |
| CSS-06 | Specify chart direction explicitly | Chart configuration test |
| TYPE-01 | Do not apply unreviewed tracking or synthetic italics to Arabic UI | Computed-style tests |
| TYPE-02 | Do not use fixed text heights that clip approved samples | Visual and overflow tests |
| TYPE-03 | Preserve user diacritics in display | Round-trip tests |
| TYPE-04 | Ship font files only with recorded license approval | Dependency/license gate |
| MSG-01 | Translate complete messages | Lint against prohibited concatenation patterns |
| MSG-02 | Test plural boundaries | Locale unit tests |
| MSG-03 | Validate interpolation variables across languages | Build-time resource validation |
| TERM-01 | Enforce the approved glossary contextually | Translation QA rules |
| A11Y-01 | Preserve semantic DOM and focus order | Keyboard and accessibility tests |
| A11Y-02 | Give icon-only controls localized accessible names | Accessibility scan |
| A11Y-03 | Announce completed chat updates at a usable cadence | Assistive-technology review |
| QA-01 | Maintain distinct LTR and RTL visual baselines | CI visual regression |
| QA-02 | Block release for critical linguistic or bidi defects | Review workflow gate |

Avoid naïve lint checks that ban every occurrence of `left` and `right`: they would also catch legitimate geometry, API names, and explanatory text. Enforce the intended rule at the CSS declaration and component-contract level.

## Native-speaker review checklist

Use this checklist against screenshots **and working flows**. Reviewers should see the English source, Arabic string, intended action, variables, and surrounding interface.

### Language and comprehension

- [ ] The action is clear without reading the English source.
- [ ] The Arabic sounds natural rather than literally translated.
- [ ] The register matches the surface: interface, marketing, security, or conversation.
- [ ] Lebanese-specific wording is appropriate, not forced.
- [ ] English aliases help the intended audience rather than substituting for translation.
- [ ] One concept uses one approved term.
- [ ] Errors explain recovery.
- [ ] Destructive actions describe the consequence.
- [ ] Gendered address is avoided where a natural alternative exists.
- [ ] Number agreement and dual/plural forms are correct.
- [ ] Tashkeel is sufficient for ambiguity without unnecessary visual density.
- [ ] Arabic punctuation and spacing are appropriate.


### Regional formatting

- [ ] Month names follow the approved Lebanese vocabulary.
- [ ] Numeric dates are unambiguous in context.
- [ ] Clock format follows the saved preference.
- [ ] Displayed time zone is clear when operationally important.
- [ ] Western/Arabic-Indic display preference is consistent.
- [ ] Prices identify LBP or USD.
- [ ] Exchange-rate and rounding information is sufficient.
- [ ] Phone numbers and ticket IDs remain recognizable and copy correctly.


### Direction and layout

- [ ] Arabic, English, and Arabizi messages each display appropriately.
- [ ] Names, emails, URLs, and identifiers do not disturb surrounding punctuation.
- [ ] Parentheses and final punctuation are correct.
- [ ] Leading numbers and emoji do not produce surprising alignment.
- [ ] Buttons and menus do not truncate important text.
- [ ] Icons communicate the intended action.
- [ ] Media, maps, logos, keypads, and charts follow their documented exceptions.
- [ ] Table reading and keyboard order make sense.
- [ ] Mixed text wraps and selects correctly.


### Accessibility and AI

- [ ] Arabic labels are understandable with the selected screen reader.
- [ ] Mixed-language speech behavior is acceptable on the recorded test stack.
- [ ] Focus and error announcements are usable.
- [ ] Chat streaming does not create excessive announcements.
- [ ] The AI understands the tested dialect and Arabizi examples.
- [ ] The AI preserves names, amounts, IDs, and quoted text.
- [ ] The AI requests clarification for consequential ambiguity.
- [ ] Human-support escalation is understandable and reachable.


## Reviewer rating form

**Proposed rating scale**


| Score | Meaning |
| :-- | :-- |
| 1 | Unusable, misleading, or seriously incorrect |
| 2 | Major revision required |
| 3 | Understandable but noticeably awkward or inconsistent |
| 4 | Good; minor revision required |
| 5 | Natural, clear, accurate, and ready |

**Review record**

```text
Reviewer:
Lebanese language/script preferences:
Role: customer / support agent / administrator / accessibility reviewer
Build and date:
Page or task:
Interface language:
Conversation language:
Numeral preference:
Clock preference:
Browser / OS / device:
Screen reader / voice / versions, if applicable:

Dimension                         Score 1–5
Meaning and task clarity:         __
Natural Arabic:                   __
Lebanese appropriateness:         __
Terminology consistency:          __
Grammar and number agreement:     __
Gender-inclusive wording:         __
Dates, times, numbers, currency:  __
Bidi and punctuation:             __
Typography and readability:       __
Accessibility in tested stack:    __
AI conversation quality:          __ / not applicable

Critical misunderstanding?       yes / no
Incorrect amount, date, or ID?    yes / no
Blocked task?                    yes / no

String key / component:
English source:
Current Arabic:
Observed problem:
Suggested Arabic:
Screenshot or recording:
Severity:
Owner:
Retest result:

Disposition:
approve / approve after corrections / reject
```

**Proposed release gate:** no critical meaning, financial, security, identifier, or task-blocking defects; all major defects corrected; and explicit sign-off on the glossary, formatting policy, and supported accessibility combinations. Treat numerical score thresholds as internal quality policy—not as a validated research scale.

<span style="display:none">[^1_100][^1_101][^1_102][^1_103][^1_104][^1_105][^1_106][^1_107][^1_108][^1_109][^1_110][^1_111][^1_112][^1_113][^1_114][^1_115][^1_116][^1_117][^1_118][^1_119][^1_120][^1_121][^1_122][^1_123][^1_124][^1_125][^1_126][^1_127][^1_128][^1_129][^1_13][^1_130][^1_131][^1_132][^1_133][^1_134][^1_135][^1_136][^1_137][^1_138][^1_139][^1_14][^1_140][^1_141][^1_142][^1_143][^1_144][^1_145][^1_146][^1_147][^1_148][^1_149][^1_15][^1_150][^1_151][^1_152][^1_153][^1_154][^1_155][^1_156][^1_157][^1_158][^1_159][^1_16][^1_160][^1_161][^1_162][^1_163][^1_164][^1_165][^1_166][^1_167][^1_168][^1_169][^1_17][^1_170][^1_171][^1_172][^1_173][^1_174][^1_175][^1_176][^1_177][^1_178][^1_179][^1_18][^1_180][^1_181][^1_182][^1_183][^1_184][^1_185][^1_186][^1_187][^1_188][^1_189][^1_19][^1_190][^1_191][^1_192][^1_193][^1_194][^1_195][^1_196][^1_197][^1_198][^1_199][^1_20][^1_200][^1_201][^1_202][^1_203][^1_204][^1_205][^1_206][^1_207][^1_208][^1_209][^1_21][^1_210][^1_211][^1_212][^1_213][^1_214][^1_215][^1_216][^1_217][^1_218][^1_219][^1_22][^1_220][^1_221][^1_222][^1_223][^1_224][^1_225][^1_226][^1_227][^1_228][^1_229][^1_23][^1_230][^1_231][^1_232][^1_233][^1_234][^1_235][^1_236][^1_237][^1_238][^1_239][^1_24][^1_240][^1_241][^1_242][^1_243][^1_244][^1_245][^1_246][^1_247][^1_248][^1_249][^1_25][^1_250][^1_251][^1_252][^1_253][^1_254][^1_255][^1_256][^1_257][^1_258][^1_259][^1_26][^1_260][^1_261][^1_262][^1_263][^1_264][^1_265][^1_266][^1_267][^1_268][^1_269][^1_27][^1_270][^1_271][^1_272][^1_273][^1_274][^1_275][^1_276][^1_277][^1_278][^1_279][^1_28][^1_280][^1_281][^1_282][^1_283][^1_284][^1_285][^1_286][^1_287][^1_288][^1_289][^1_29][^1_290][^1_291][^1_292][^1_293][^1_294][^1_295][^1_296][^1_297][^1_298][^1_299][^1_30][^1_300][^1_301][^1_302][^1_303][^1_304][^1_305][^1_306][^1_307][^1_308][^1_309][^1_31][^1_310][^1_311][^1_312][^1_313][^1_314][^1_315][^1_316][^1_317][^1_318][^1_319][^1_32][^1_320][^1_321][^1_322][^1_323][^1_324][^1_325][^1_326][^1_327][^1_328][^1_329][^1_33][^1_330][^1_331][^1_332][^1_333][^1_334][^1_335][^1_336][^1_337][^1_338][^1_339][^1_34][^1_340][^1_341][^1_342][^1_343][^1_344][^1_345][^1_346][^1_347][^1_348][^1_349][^1_35][^1_350][^1_351][^1_352][^1_353][^1_354][^1_355][^1_356][^1_357][^1_358][^1_359][^1_36][^1_360][^1_361][^1_362][^1_363][^1_364][^1_365][^1_366][^1_367][^1_368][^1_369][^1_37][^1_370][^1_371][^1_372][^1_373][^1_374][^1_375][^1_376][^1_377][^1_378][^1_379][^1_38][^1_380][^1_381][^1_382][^1_383][^1_384][^1_385][^1_386][^1_387][^1_388][^1_389][^1_39][^1_390][^1_391][^1_392][^1_393][^1_394][^1_395][^1_396][^1_397][^1_398][^1_399][^1_40][^1_400][^1_401][^1_402][^1_403][^1_404][^1_405][^1_406][^1_407][^1_408][^1_409][^1_41][^1_410][^1_411][^1_412][^1_413][^1_414][^1_415][^1_416][^1_417][^1_418][^1_419][^1_42][^1_420][^1_421][^1_422][^1_423][^1_424][^1_425][^1_43][^1_44][^1_45][^1_46][^1_47][^1_48][^1_49][^1_50][^1_51][^1_52][^1_53][^1_54][^1_55][^1_56][^1_57][^1_58][^1_59][^1_60][^1_61][^1_62][^1_63][^1_64][^1_65][^1_66][^1_67][^1_68][^1_69][^1_70][^1_71][^1_72][^1_73][^1_74][^1_75][^1_76][^1_77][^1_78][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92][^1_93][^1_94][^1_95][^1_96][^1_97][^1_98][^1_99]</span>

<div align="center">⁂</div>

[^1_1]: https://bccl.gov.lb/search-arabic/

[^1_2]: https://eservices.finance.gov.lb/Login.aspx/Namazej.aspx?type=IndT

[^1_3]: https://institutdesfinances.gov.lb/sites/default/files/2026-04/Pamphlet-Citizen Budget 2026-Apr26-Ar-final.pdf

[^1_4]: https://www.spinneyslebanon.com/default/branch-finder/

[^1_5]: https://apps.apple.com/us/app/toters-توترز/id1015006220?l=ar

[^1_6]: https://lsj.cnrs.edu.lb/vol-22-no-1-2021/

[^1_7]: https://www.unicode.org/cldr/charts/48/verify/dates/ar.html

[^1_8]: https://www.w3.org/International/docs/bp-html-bidi/

[^1_9]: https://m3.material.io/m3/pages/bidirectionality-rtl

[^1_10]: https://m3.material.io/foundations/layout/bidirectionality-rtl

[^1_11]: https://touch.com.lb/en/corporate/auth

[^1_12]: https://touch.com.lb/en/find-store

[^1_13]: https://www.w3.org/TR/2018/WD-alreq-20180222/

[^1_14]: https://home.unicode.org/category/cldr/

[^1_15]: https://www.w3.org/TR/alreq/

[^1_16]: https://cldr.unicode.org/index/charts

[^1_17]: https://www.unicode.org/cldr/cldr-aux/charts/28/by_type/locale_display_names.keys.html

[^1_18]: https://sites.google.com/unicode.org/cldr/translation/date-time/date-time-patterns

[^1_19]: https://sites.google.com/unicode.org/cldr/index/downloads/cldr-43

[^1_20]: https://www.unicode.org/cldr/cldr-aux/charts/28/summary/ar.html

[^1_21]: https://lists.w3.org/Archives/Public/public-alreq-admin/2018JanMar/0009.html

[^1_22]: https://sites.google.com/unicode.org/cldr/index

[^1_23]: http://www.unicode.org/cldr/charts/49/by_type/numbers.symbols.html

[^1_24]: https://www.unicode.org/cldr/cldr-aux/charts/24/summary/ar_LB.html

[^1_25]: http://www.unicode.org/cldr/charts/46/delta/ar.html

[^1_26]: https://github.com/unicode-org/cldr/tree/main/common/main

[^1_27]: https://download.microsoft.com/download/5/6/d/56d1774f-ac3f-4ad9-80af-a6dfd5df419d/ara-sau-StyleGuide.pdf

[^1_28]: https://www.touch.com.lb/en/news/385/1178

[^1_29]: https://payment.touch.com.lb/autoforms/portal/touch/personal/prepaid/start/tariffs

[^1_30]: https://www.alfa.com.lb/ar

[^1_31]: https://legacy.touch.com.lb/autoforms/portal/touch/personal/postpaid/touchmobile/services

[^1_32]: https://www.touch.com.lb/en

[^1_33]: https://www.alfa.com.lb/ar/postpaid/services/post-to-pre-recharge

[^1_34]: https://www.alfa.com.lb/ar/postpaid/plans/alfa-postpaid

[^1_35]: https://www.alfa.com.lb/ar/prepaid/services/vip

[^1_36]: https://www.alfa.com.lb/ar/business/corporate-offers

[^1_37]: https://www.alfa.com.lb/ar/prepaid/recharge

[^1_38]: https://www.alfa.com.lb/ar/offers-promos

[^1_39]: https://www.alfa.com.lb/ar/pick-your-line/pickline

[^1_40]: https://www.alfa.com.lb/ar/prepaid/plans/268

[^1_41]: https://www.touch.com.lb/en/mobile-plans/postpaid/touch-mobile

[^1_42]: https://bdl.gov.lb/

[^1_43]: https://www.blombank.com/english/home

[^1_44]: https://www.blombank.com/arabic/delivery-channels/eblom-online-banking

[^1_45]: https://www.bankmed.com.lb/content/express-banking/products.aspx

[^1_46]: https://finance.gov.lb/ar-lb

[^1_47]: https://finance.gov.lb/en-US/Pages/default.aspx

[^1_48]: https://eservices.finance.gov.lb/PaymentTaxSelect.aspx

[^1_49]: https://www.blombank.com/arabic/network

[^1_50]: https://www.finance.gov.lb/ar-lb/Finance/BI

[^1_51]: https://www.finance.gov.lb/en-us/Finance/Rep-Pub/DRI-MOF/PFR

[^1_52]: https://www.finance.gov.lb/en-us/Finance/BI/ABDP/

[^1_53]: https://finance.gov.lb/ar-lb/Taxation/TN/Pages/2026.aspx

[^1_54]: https://www.blombank.com/arabic/products-and-services/investment-services

[^1_55]: https://www.bankmed.com.lb/

[^1_56]: https://www.bankmed.com.lb/content/consumer/products.aspx?subsid=41

[^1_57]: https://eservices.finance.gov.lb/

[^1_58]: https://www.unicode.org/cldr/cldr-aux/charts/28/delta/transform-Arabic-Latin.html

[^1_59]: https://unicode.org/Public/cldr/48/?\_gl=1*pm0ovf*\_ga*MTQwNTc5MjQ4LjE3NTY4MzI3ODQ.*\_ga_BPN1D3SEJM\*czE3NjI3Mjk0MDgkbzkkZzEkdDE3NjI3Mjk5MjckajYwJGwwJGgw

[^1_60]: https://github.com/unicode-org/cldr-json/blob/44.1.0/cldr-json/cldr-numbers-full/main/en-IN/numbers.json

[^1_61]: https://sites.google.com/unicode.org/cldr/index/downloads

[^1_62]: https://cldr-smoke.unicode.org/spec/main/ldml/tr35-numbers.html

[^1_63]: https://www.unicode.org/Public/cldr/

[^1_64]: https://cldr.unicode.org/development/development-process/design-proposals/supported-numberingsystems

[^1_65]: https://www.unicode.org/cldr/version/1.4.html

[^1_66]: https://cldr.unicode.org/translation/translation-guide-general/default-content

[^1_67]: https://cldr.unicode.org/translation/core-data/numbering-systems

[^1_68]: https://unicode.org/cldr/charts/42/summary/ar.html

[^1_69]: https://www.unicode.org/cldr/charts/48/supplemental/likely_subtags.html

[^1_70]: https://www.w3.org/International/i18n-tests/

[^1_71]: https://github.com/mdn/content/blob/main/files/en-us/web/html/reference/elements/bdi/index.md?plain=1

[^1_72]: https://www.w3.org/TR/2017/WD-html52-20170406/rendering.html

[^1_73]: https://www.w3.org/International/tutorials/bidi-xhtml/index.fr

[^1_74]: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPInternational/SupportingRight-To-LeftLanguages/SupportingRight-To-LeftLanguages.html

[^1_75]: https://developer.apple.com/videos/play/wwdc2022/10034/?time=1030

[^1_76]: https://m1.material.io/usability/accessibility.html

[^1_77]: https://developer.apple.com/cn/design/human-interface-guidelines/right-to-left

[^1_78]: https://m1.material.io/usability/bidirectionality.html

[^1_79]: https://www.w3.org/International/articles/inline-bidi-markup/

[^1_80]: https://www.w3.org/International/articles/inline-bidi-markup/bidi_examples.en.html

[^1_81]: https://www.w3.org/International/tests/html-css/bidi-html5/results-bidi-html5

[^1_82]: https://www.w3.org/International/talks/1602-oman/

[^1_83]: https://www.w3.org/TR/html-bidi/

[^1_84]: https://www.w3.org/International/reviews/html5-bidi/

[^1_85]: https://app.unpkg.com/stylelint-use-logical@2.1.3/files/package.json

[^1_86]: https://github.com/topics/logical-css

[^1_87]: https://github.com/yuschick/stylelint-plugin-logical-css/blob/main/V1-DOCUMENTATION.md

[^1_88]: https://github.com/csstools/stylelint-use-logical/blob/main/README.md

[^1_89]: https://www.w3.org/TR/2016/CR-css-flexbox-1-20160526/

[^1_90]: https://dev.arcxp.com/themes/core-concepts/css-logical-properties-on-arc-blocks.md

[^1_91]: https://www.w3.org/TR/css-grid-3/

[^1_92]: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/COMPARISON.md

[^1_93]: https://lupyuen.github.io/pinetime-rust-mynewt/src/druid/localization.rs.html

[^1_94]: https://www.w3.org/International/questions/qa-bidi-unicode-controls

[^1_95]: https://www.w3.org/TR/css-logical-1/

[^1_96]: https://www.w3.org/International/questions/qa-bidi-unicode-controls.zh-hans.html

[^1_97]: https://www.w3.org/International/questions/qa-bidi-controls

[^1_98]: https://github.com/csstools/stylelint-use-logical

[^1_99]: https://github.com/yuschick/stylelint-plugin-logical-css

[^1_100]: http://www.lebweb.com/site/lebanon-mtctouch-lb-42569

[^1_101]: https://www.linkedin.com/company/touch-lebanon

[^1_102]: https://legacy.touch.com.lb/autoforms/portal/touch/about-touch/media-center/press-releases

[^1_103]: https://en.wikipedia.org/wiki/Touch\_(Lebanon)

[^1_104]: https://www.touch.com.lb/en/contact-us

[^1_105]: https://www.linkedin.com/company/toters-delivery

[^1_106]: https://aclanthology.org/2022.wanlp-1.18/

[^1_107]: https://journals.lib.unb.ca/index.php/CJAL/article/view/32158

[^1_108]: https://touch.com.lb/en/news

[^1_109]: https://www.totersapp.com/baghdad

[^1_110]: https://www.totersapp.com/data-privacy-arabic

[^1_111]: https://www.totersapp.com/t-terms-in-arabic

[^1_112]: https://www.touch.com.lb/en/find-store

[^1_113]: https://www.totersapp.com/khorafi-kur-bad

[^1_114]: https://ftp.iana.org/tz/tzdb-2022e/asia

[^1_115]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization

[^1_116]: https://github.com/unicode-org/cldr/blob/main/common/annotations/ar.xml

[^1_117]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat.

[^1_118]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions

[^1_119]: https://developer.mozilla.org.cach3.com/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat\$revision/519861

[^1_120]: https://developer.amazon.com/docs/react-native-vega/0.72/internationalization-and-localization

[^1_121]: https://developer.mozilla.org.cach3.com/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat\$revision/668919

[^1_122]: https://github.com/LostBeard/SpawnDev.BlazorJS/blob/main/Docs/api/IntlResolvedDateTimeFormatOptions.md

[^1_123]: https://data.iana.org/time-zones/data/zone.tab

[^1_124]: https://cldr.unicode.org/downloads/cldr-48

[^1_125]: https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab

[^1_126]: https://data.iana.org/time-zones/data/zone1970.tab

[^1_127]: https://data.iana.org/time-zones/tzdb-2024a/zone1970.tab

[^1_128]: https://lists.iana.org/hyperkitty/list/tz@iana.org/thread/YFUWQJZGZBMKSV5Y7T7M5W2SK5YZI7DP/

[^1_129]: https://github.com/formatjs/formatjs/blob/main/packages/ecma402-abstract/NumberFormat/format_to_parts.ts

[^1_130]: https://tc39.es/ecma402/2025/

[^1_131]: https://tc39.es/proposal-intl-numberformat-v3/out/numberformat/proposed.html

[^1_132]: https://tc39.es/ecma402/2024/

[^1_133]: https://cldr.unicode.org/downloads/cldr-40

[^1_134]: https://www.unicode.org/cldr/charts/48/summary/ar.html

[^1_135]: https://pursuit.purescript.org/packages/purescript-js-intl/1.1.4/docs/JS.Intl.NumberFormat

[^1_136]: https://pursuit.purescript.org/packages/purescript-js-intl/1.0.1/docs/JS.Intl.NumberFormat

[^1_137]: https://pursuit.purescript.org/packages/purescript-js-intl/1.0.3/docs/JS.Intl.NumberFormat

[^1_138]: https://unicode.org/cldr/charts/44/summary/ar.html?hide

[^1_139]: https://sites.google.com/unicode.org/cldr/translation/core-data/numbering-systems

[^1_140]: https://github.com/andyearnshaw/Intl.js/issues/336

[^1_141]: https://tc39.es/proposal-intl-numberformat-v3/

[^1_142]: https://fonts.google.com/specimen/IBM Plex Sans Arabic

[^1_143]: https://fonts.google.com/knowledge/glossary/italic

[^1_144]: https://fonts.google.com/noto/specimen/Noto+Sans+Arabic

[^1_145]: https://github.com/google/fonts/blob/main/ofl/notosansarabic/OFL.txt

[^1_146]: https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html

[^1_147]: https://github.com/Homebrew/homebrew-cask/blob/100c26d71dfb84b00dfd411e75873e57879a322d/Casks/font/font-n/font-noto-sans-arabic.rb

[^1_148]: https://github.com/googlefonts/plex

[^1_149]: https://www.w3.org/WAI/standards-guidelines/act/rules/9e45ec/

[^1_150]: https://gist.github.com/zecka/3cc2f53af8b72f4f26268c69d2c3c2ff

[^1_151]: https://github.com/amiryxe/next-persian-fonts

[^1_152]: https://notofonts.github.io/noto-docs/specimen/NotoSansArabic/

[^1_153]: https://fonts.google.com/knowledge/using_type/language_support_in_fonts

[^1_154]: https://fonts.google.com/knowledge

[^1_155]: https://github.com/notofonts

[^1_156]: https://www.w3.org/WAI/standards-guidelines/act/implementations/axe-core/

[^1_157]: https://unicode-org.github.io/icu-docs/apidoc/released/icu4c/classicu_1_1PluralFormat.html

[^1_158]: https://unicode-org.github.io/icu-docs/apidoc/dev/icu4j/com/ibm/icu/text/PluralFormat.html

[^1_159]: https://www.unicode.org/cldr/charts/47/supplemental/language_plural_rules.html

[^1_160]: https://www.unicode.org/cldr/cldr-aux/charts/34/supplemental/language_plural_rules.html

[^1_161]: https://unicode-org.github.io/icu-docs/apidoc/released/icu4j/com/ibm/icu/text/MessageFormat.html

[^1_162]: https://unicode-org.github.io/icu-docs/apidoc/released/icu4c/classMessageFormat.html

[^1_163]: https://docs.oracle.com/en-us/iaas/digital-assistant/doc/resource-bundles-for-skills.html

[^1_164]: https://icu.unicode.org/design/formatting/messageformat/newsyntax

[^1_165]: https://unicode-org.github.io/icu/userguide/format_parse/messages/examples.html

[^1_166]: https://i18next.github.io/i18next/pages/doc_features.html

[^1_167]: https://i18next.github.io/i18next/node/pages/doc_features.html

[^1_168]: https://unicode-org.github.io/icu/userguide/format_parse/messages/try-mf2.html

[^1_169]: https://unicode-org.github.io/icu/userguide/format_parse/messages/

[^1_170]: https://www.i18next.com/translation-function/plurals

[^1_171]: https://unicode-org.github.io/icu/userguide/format_parse/

[^1_172]: https://github.com/Zinoo00/apple-human-interface-guideline-skills/blob/main/skills/apple-hig-foundations/references/right-to-left.md

[^1_173]: https://developer.apple.com/design/human-interface-guidelines/layout.md

[^1_174]: https://github.com/mr8lu/apple-design-hig/blob/main/skills/apple-design-hig/references/catalog.md

[^1_175]: https://developer.apple.com/design/human-interface-guidelines/offering-help

[^1_176]: https://developer.apple.com/design/human-interface-guidelines/components

[^1_177]: https://developer.apple.com/design/human-interface-guidelines/inclusion

[^1_178]: https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides

[^1_179]: https://learn.microsoft.com/en-us/globalization/reference/microsoft-language-resources

[^1_180]: https://developer-rno.apple.com/design/human-interface-guidelines/components/all-components

[^1_181]: https://developer.apple.com/design/human-interface-guidelines/right-to-left?changes=la\_\_11_8_8

[^1_182]: https://developer.apple.com/design/human-interface-guidelines/layout

[^1_183]: https://www.alfa.com.lb/ar/business/large-corporation

[^1_184]: https://www.961portal.com/profile/blom-bank-sal

[^1_185]: https://www.blomretail.com/retail/branches

[^1_186]: http://www.lebweb.com/site/lebanon-blom-lb-20195

[^1_187]: https://www.arope.com/storage/annual-reports/annual-report-2015-1766997534.pdf

[^1_188]: https://www.blombank.com/english/delivery-channels/ecash

[^1_189]: https://www.blomretail.com/retail/blom-branches

[^1_190]: https://bdl.gov.lb/economicandfinancialdatasub.php?docId=152\&code=9\&filecode=90

[^1_191]: https://bdl.gov.lb/economicandfinancialdatasub.php?docId=161\&code=9\&filecode=90

[^1_192]: https://www.bdl.gov.lb/CB Com/Publications/Publications/Quarterly Bulletin_158_En%C2%A72658_3.pdf

[^1_193]: https://bdl.gov.lb/currentrate.php

[^1_194]: https://www.alfa.com.lb/ar/support/faq

[^1_195]: https://www.finance.gov.lb/ar-lb

[^1_196]: https://www.bdl.gov.lb/coinssub.php

[^1_197]: https://www.w3docs.com/learn-html/html-bdi-tag

[^1_198]: https://github.com/LemmyNet/lemmy-ui/issues/347

[^1_199]: https://www.w3.org/International/articles/inline-bidi-markup/index.zh-hans.html

[^1_200]: https://stackoverflow.com/questions/51690891/contact-form-in-hebrew-rtl-with-phpmailer

[^1_201]: https://www.w3.org/blog/International/tag/qa-html-dir/

[^1_202]: https://www.w3.org/blog/International/2009/07/10/updated_tutorial_creating_html_pages_in\_/

[^1_203]: https://m1.material.io/material-design/whats-new.html

[^1_204]: https://www.w3.org/International/articles/lang-bidi-use-cases/

[^1_205]: https://www.w3.org/International/i18n-drafts/techniques/authoring-html.en

[^1_206]: https://at.mo.gov/wp-content/uploads/Accessibility-Testing-Checklist-2025.docx

[^1_207]: https://download.nvaccess.org/releases/2026.3beta6/documentation/my/userGuide.html

[^1_208]: https://api.nvaccess.org/releases/2022.1/documentation/is/userGuide.html

[^1_209]: https://download.nvaccess.org/releases/2026.3rc1/documentation/userGuide.html

[^1_210]: https://download.nvaccess.org/releases/beta/documentation/userGuide.html

[^1_211]: https://www.nvaccess.org/post/in-process-17th-july-2023/

[^1_212]: https://github.com/mgifford/wai-yaml-ld/blob/main/kitty-specs/001-wai-standards-yaml-ld-ingestion/research/wcag-2.2-normative.yaml

[^1_213]: https://www.nvaccess.org/post/in-process-26th-may-2020/

[^1_214]: https://www.nvaccess.org/get-help/

[^1_215]: https://www.digitalpolicy.gov.hk/sc/our_work/digital_infrastructure/digital_inclusion/accessibility/promulgating_resources/handbook/wcag2aa/9_18_language_of_parts.html

[^1_216]: https://www.nvaccess.org/post/nvda-2025-1/

[^1_217]: https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html

[^1_218]: https://www.nvaccess.org/post/in-process-10th-april-2026/

[^1_219]: https://www.w3.org/International/track/issues/354

[^1_220]: https://raw.githubusercontent.com/w3c/typography/gh-pages/gap-analysis/arab-ar-fa.html

[^1_221]: https://www.w3.org/International/talks/1409-china/index.html

[^1_222]: https://www.w3.org/International/alreq/arab-ks/

[^1_223]: https://dev.w3.org/SVG/profiles/1.2T/master/text.html

[^1_224]: https://dev.w3.org/SVG/profiles/1.1F2/master/text.html

[^1_225]: https://www.w3.org/International/articlelist.gl.html

[^1_226]: https://www.w3.org/International/alreq/

[^1_227]: https://www.w3.org/TR/2019/WD-typography-20190520/

[^1_228]: https://www.w3.org/TR/2018/WD-typography-20180828/

[^1_229]: https://www.w3.org/International/alreq/gap-analysis/

[^1_230]: https://github.com/w3c/alreq/issues/100

[^1_231]: https://github.com/w3c/alreq/issues/118

[^1_232]: https://deepwiki.com/unicode-org/cldr/2.3.3-numbering-systems

[^1_233]: https://www.unicode.org/reports/tr35/46/tr35-numbers.html

[^1_234]: https://cldr.unicode.org/development/development-process/design-proposals/math-formula-preferences

[^1_235]: https://rich-iannone.github.io/i18n/reference/numbers.html

[^1_236]: https://github.com/unicode-org/cldr

[^1_237]: http://www.unicode.org/cldr/charts/49/by_type/index.html

[^1_238]: https://www.unicode.org/cldr/charts/46/summary/kab.html

[^1_239]: https://github.com/unicode-org/cldr/blob/main/common/supplemental/numberingSystems.xml

[^1_240]: https://revues.imist.ma/index.php/IJAL/en/article/download/68917/34625/197258

[^1_241]: https://scholarworks.aub.edu.lb/items/1b356264-5b6f-4260-b955-bbedaaf23f71

[^1_242]: https://cerj.educ.cam.ac.uk/archive/v9_2022/v9_10_118-137_hajir_rasman_mcinerney.pdf

[^1_243]: https://scholarworks.aub.edu.lb/items/624d0a2f-e1a7-4213-b35e-e0ca1308bb4a

[^1_244]: https://imminent.translated.com/lebanon-a-multilingual-hub

[^1_245]: https://awej-tls.org/wp-content/uploads/2021/05/12-1.pdf

[^1_246]: https://huggingface.co/api/resolve-cache/spaces/oddadmix/lahgtna-chatterbox-demo/163c675f4a8bef99cc023c1d595ad8e2f775e6a4/src%2Fchatterbox%2Fmodels%2Ftokenizers%2FlebaneseTextUtil.py?download=true\&etag="dec400f4517f55b0417835033c5a776211fcfc00"

[^1_247]: https://www.intercultural.urv.cat/media/upload/domain_317/arxius/TP5/08-Bassan.pdf

[^1_248]: https://lsj.cnrs.edu.lb/wp-content/uploads/2022/02/Ayman-Halawi.pdf

[^1_249]: https://aclanthology.org/2023.arabicnlp-1.36.pdf

[^1_250]: https://www.erudit.org/en/journals/cjal/2022-v25-n2-cjal07730/1096923ar.pdf

[^1_251]: https://digitalcommons.bau.edu.lb/schbjournal/vol1/iss1/2/

[^1_252]: https://aclanthology.org/R19-1138.pdf

[^1_253]: https://touch.com.lb/en

[^1_254]: https://www.awraqthaqafya.com/5881/

[^1_255]: https://legacy.touch.com.lb/autoforms/portal/touch/about-touch/media-center/news/webandtalkmaxibundles

[^1_256]: https://touch.com.lb/en/contact-us

[^1_257]: https://lendsqr.com/providers/BankMed

[^1_258]: https://ar.wikipedia.org/wiki/أم\_%D8%AA%D9%8A\_%D8%B3%D9%8A\_%D8%AA%D8%A7%D8%AA%D8%B4

[^1_259]: https://www.abl.org.lb/Library/Assets/Gallery/Documents/Almanac of BANK 2024 - 2025.pdf

[^1_260]: https://cldr.unicode.org/index/downloads

[^1_261]: https://github.com/koreader/koreader/blob/081825285f348bbc423490b4375e220d1bd3cf9e/frontend/ui/bidi.lua

[^1_262]: https://www.freecodecamp.org/news/designing-for-the-arab-user-basic-arabic-ux-for-business-6ff29d4c7c60/

[^1_263]: https://support.google.com/a/users/answer/9282745?visit_id=639110118294820429-1952883595\&hl=ar-BH\&rd=1

[^1_264]: https://knowledge.workspace.google.com/admin/security/protect-your-business-with-2-step-verification?hl=ar\&visit_id=639082685522128573-240597546\&rd=1

[^1_265]: https://knowledge.workspace.google.com/admin/security/manage-a-users-security-settings?hl=ar

[^1_266]: https://support.google.com/accounts/answer/185839?ref_topic=2954345\&hl=ar

[^1_267]: https://support.google.com/accounts/answer/185833?hl=ar-CH

[^1_268]: https://support.google.com/accounts/thread/305614052/i-cannot-access-my-account-due-to-two-step-verification-،لا-أستطيع-الدخول-لحسابي-بسبب-التحقق-بخطوتين?hl=ar

[^1_269]: https://support.google.com/accounts/thread/269353837/لقد-رصدنا-نشاطًا-غير-معتاد-في-الحساب-الذي-تتم-محاولة-الوصول-إليه?hl=ar

[^1_270]: https://knowledge.workspace.google.com/admin/support/troubleshooting/troubleshoot-login-challenges-2-step-verification-and-sign-in-issues?hl=ar

[^1_271]: https://support.google.com/accounts/thread/443302739

[^1_272]: https://learn.microsoft.com/ar-sa/dynamics365/customer-service/administer/set-up-knowledge-management-embedded-knowledge-search

[^1_273]: https://support.google.com/accounts/thread/323167281?hl=ar\&msgid=323497896

[^1_274]: https://support.google.com/accounts/thread/446580979

[^1_275]: https://knowledge.workspace.google.com/admin/support/troubleshooting/identify-and-secure-compromised-accounts?hl=ar

[^1_276]: https://support.google.com/accounts/answer/7162782?hl=ar\&co=GENIE.Platform=iOS

[^1_277]: https://support.google.com/accounts/answer/185834?hl=ar

[^1_278]: https://www.alfa.com.lb/ar/business/services/alfanet

[^1_279]: https://www.alfa.com.lb/

[^1_280]: https://www.alfa.com.lb/en/mobile-broadband/alfanet

[^1_281]: http://www.unicode.org/cldr/charts/49/by_type/core_data.alphabetic_information.html

[^1_282]: https://unicode.org/cldr/charts/42/supplemental/territory_containment_un_m_49.html

[^1_283]: https://www.unicode.org/cldr/charts/49/supplemental/territory_containment_un_m_49.html

[^1_284]: http://unicode.org/cldr/charts/49/supplemental/language_territory_information.html

[^1_285]: https://www.unicode.org/cldr/charts/44/supplemental/territory_information.html

[^1_286]: https://www.unicode.org/cldr/charts/49/supplemental/index.html

[^1_287]: https://www.unicode.org/cldr/charts/48/supplemental/territory_information.html

[^1_288]: https://unicode.org/cldr/charts/latest/supplemental/territory_containment_un_m_49.html

[^1_289]: https://www.unicode.org/cldr/charts/48/supplemental/language_territory_information.html

[^1_290]: https://www.unicode.org/cldr/charts/latest/supplemental/territory_language_information.html

[^1_291]: https://learn.microsoft.com/ar-sa/azure/sentinel/data-connectors/microsoft-365-insider-risk-management

[^1_292]: https://support.apple.com/ar-ae/102660

[^1_293]: https://support.apple.com/ar-sa/guide/personal-safety/ips7d5628cc5/web

[^1_294]: https://support.apple.com/ar-kw/102606

[^1_295]: https://learn.microsoft.com/ar-sa/services-hub/unified/roles/sc-overview

[^1_296]: https://support.apple.com/ar-kw/101555

[^1_297]: https://support.apple.com/ar-jo/guide/ipad/ipad4c370380/15.0/ipados/15.0

[^1_298]: https://learn.microsoft.com/ar-sa/azure/azure-portal/supportability/how-to-create-azure-support-request

[^1_299]: https://learn.microsoft.com/ar-sa/azure/cost-management-billing/troubleshoot-billing/how-to-create-azure-support-request-ea

[^1_300]: https://learn.microsoft.com/ar-sa/unified-secops-platform/cases-overview

[^1_301]: https://support.microsoft.com/ar-SA/support/

[^1_302]: https://learn.microsoft.com/ar-sa/training/modules/managing-cases-with-dynamics-365/8-working-with-status-reason-transitions

[^1_303]: https://learn.microsoft.com/ar-sa/microsoft-365/enterprise/microsoft-365-admin-engagements?view=o365-worldwide

[^1_304]: https://support.microsoft.com/ar-sa/

[^1_305]: https://learn.microsoft.com/ar-sa/services-hub/microsoft-engage-center/support/support-requests

[^1_306]: https://github.com/google/fonts/blob/main/ofl/tajawal/Tajawal-Bold.ttf

[^1_307]: https://github.com/google/fonts/blob/main/ofl/tajawal/Tajawal-Light.ttf

[^1_308]: https://github.com/google/fonts/blob/main/ofl/tajawal/Tajawal-ExtraBold.ttf

[^1_309]: https://github.com/google/fonts/blob/main/ofl/tajawal/Tajawal-Medium.ttf

[^1_310]: https://github.com/google/fonts/blob/main/ofl/tajawal/Tajawal-Regular.ttf

[^1_311]: https://fontinfo.opensuse.org/fonts/NotoSansArabicBold.html

[^1_312]: https://notofonts.github.io/arabic/

[^1_313]: https://github.com/notofonts/Noto-Arabic

[^1_314]: https://github.com/notofonts/noto-fonts

[^1_315]: https://fontsource.org/fonts/noto-sans-arabic/about

[^1_316]: https://github.com/google/fonts/blob/main/ofl/cairo/DESCRIPTION.en_us.html

[^1_317]: https://notofonts.github.io/noto-docs/website/homepage/

[^1_318]: https://github.com/google/fonts/commit/3dd78844021e948ceb633d1dcee3f7885561b5d9

[^1_319]: https://github.com/googlefonts/tajawal

[^1_320]: https://www.finance.gov.lb/en-us

[^1_321]: https://www.finance.gov.lb/en-us/Taxation/TN/Pages/2026.aspx

[^1_322]: https://bdl.gov.lb/CB Com/Statistics And Research/Daily/BDL_DailyExchangeRates.xls

[^1_323]: https://www.bdl.gov.lb/CB Com/Publications/Publications/Quarterly Bulletin_178_En%C2%A79411_3.pdf

[^1_324]: https://blog.bankofbeirut.com/

[^1_325]: https://www.alfa.com.lb/Uploads/faq-ar.pdf

[^1_326]: https://bankofbeirut.com.sitescorechecker.com/

[^1_327]: https://bankofbeirut.com.om/

[^1_328]: https://alfa.com.lb.siteindices.com/

[^1_329]: https://www.alfa.com.lb/ar/media-center/press-releases/landing

[^1_330]: https://arabiclexicon.hawramani.com/حَزَرَ/

[^1_331]: https://www.bankofbeirut.com/en/Digital/phone-banking

[^1_332]: https://timbu.com/lebanon/networks/alfa/airtime

[^1_333]: https://www.bankofbeirut.com/content/uploads/FinancialHighlight/balance sheet - AR - Dec 21221012115911568~.pdf

[^1_334]: https://www.bankofbeirut.com/content/uploads/BoardOfDirector/Bank of Beirut - Salim Sfeir CV - AR260206113511586~.pdf

[^1_335]: https://chatscontrol.com/learn/style-guides/microsoft-ar

[^1_336]: https://wiki.localizationlab.org/index.php/Translator_Resources

[^1_337]: https://www.iana.org/domains/idn-tables/tables/xn--rovu88b_ar_5.xml

[^1_338]: https://support.microsoft.com/en-us/office/languages/language-accessory-pack-for-microsoft-365

[^1_339]: https://cldr.unicode.org/downloads/cldr-49

[^1_340]: https://www.unicode.org/cldr/charts/43/supplemental/languages_and_scripts.html

[^1_341]: https://cldr.unicode.org/

[^1_342]: https://github.com/eslint/css/issues/13

[^1_343]: https://github.com/eslint/css/blob/main/docs/rules/prefer-logical-properties.md

[^1_344]: https://learn.microsoft.com/pt-pt/style-guide/global-communications/

[^1_345]: https://github.com/eslint/css/pull/63

[^1_346]: https://learn.microsoft.com/en-us/archive/teamblog/style-guide

[^1_347]: https://learn.microsoft.com/en-us/product-style-guide-msft-internal/a_z_names_terms/c/customize

[^1_348]: https://learn.microsoft.com/en-us/style-guide/welcome/

[^1_349]: https://github.com/csstools

[^1_350]: https://stackoverflow.com/questions/49378307/how-can-i-support-my-html5-template-rtl-right-to-left

[^1_351]: https://www.reddit.com/r/webdev/comments/ubnib5/does_anybody_know_how_to_format_arabic_correctly/

[^1_352]: https://www.w3.org/International/questions/qa-html-dir.en.html

[^1_353]: https://www.localeplanet.com/icu/ar-LB/index.html

[^1_354]: https://www.unicode.org/cldr/charts/46.1/supplemental/languages_and_scripts.html

[^1_355]: https://download.microsoft.com/download/6/2/a/62a993f1-d3b2-4f28-b3e7-22965eb91426/amh-eth-styleguide.pdf

[^1_356]: https://www.unicode.org/cldr/charts/46/by_type/core_data.numbering_systems.html

[^1_357]: https://chatscontrol.com/learn/style-guides/microsoft-ks-arab

[^1_358]: https://www.unicode.org/search/

[^1_359]: https://github.com/unicode-org/cldr/blob/main/common/transforms/Arabic-Latin.xml

[^1_360]: https://www.microsoft.com/content/dam/microsoft/usetm/documents/windows/7-ultimate/retail-packaged/Windows_7%20Ultimate_Arabic.pdf

[^1_361]: https://www.unicode.org/cldr/charts/49/by_type/core_data.numbering_systems.html

[^1_362]: https://www.w3.org/Bugs/Public/show_bug.cgi?id=11734

[^1_363]: https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides?rtc=1

[^1_364]: https://www.w3.org/Bugs/Public/show_bug.cgi?id=16564

[^1_365]: https://www.w3.org/International/docs/html-bidi-requirements/

[^1_366]: https://cldr.unicode.org/translation/date-time/date-time-symbols

[^1_367]: https://www.unicode.org/cldr/charts/49/by_type/date\_\&\_time.gregorian.html

[^1_368]: https://www.unicode.org/cldr/charts/47/by_type/date\_\&\_time.gregorian.html

[^1_369]: https://unicode.org/cldr/charts/45/by_type/date\_\&\_time.gregorian.html

[^1_370]: https://github.com/microsoft/TypeScript/blob/9a8581c3/tsc/internal/bundled/libs/lib.es2020.intl.d.ts

[^1_371]: https://tc39.es/proposal-intl-locale-info/

[^1_372]: https://tc39.es/proposal-intl-datetime-style/

[^1_373]: https://unicode-org.github.io/icu-docs/apidoc/dev/icu4c/classicu_1_1PluralFormat.html

[^1_374]: https://www.unicode.org/cldr/charts/49/supplemental/language_plural_rules.html

[^1_375]: https://github.com/unicode-org/icu/blob/main/docs/userguide/format_parse/messages/examples.md

[^1_376]: https://docs.oracle.com/en/cloud/paas/digital-assistant/use-chatbot/resource-bundles-skills.html

[^1_377]: https://github.com/unicode-org/icu/blob/main/docs/userguide/format_parse/messages/mf2.md

[^1_378]: https://darklikally.github.io/I18Next.Net/guide/plurals

[^1_379]: https://hermes-ide.com/prompts/write-icu-plural-messages

[^1_380]: https://docs.weblate.org/en/latest/formats/i18next.html

[^1_381]: https://frontendchecklist.io/rules/i18n/pluralization

[^1_382]: https://intlayer.org/blog/icu-message-format

[^1_383]: http://messageformat.github.io/messageformat/guide/

[^1_384]: https://www.i18next.com/misc/migration-guide

[^1_385]: https://webtranslateit.com/learn/locales/icu-messageformat-guide

[^1_386]: https://symfony.com/doc/current/reference/formats/message_format.html

[^1_387]: https://developer.apple.com/design/human-interface-guidelines/right-to-left

[^1_388]: https://github.com/r-lib/pillar/issues/333

[^1_389]: https://github.com/koreader/koreader/blob/6596e5ddc710bfbf6e3a57e0ee9f03f68f24c968/frontend/ui/bidi.lua

[^1_390]: https://www.w3.org/International/articles/inline-bidi-markup/index

[^1_391]: https://github.com/w3c/unicode-xml/issues/4

[^1_392]: https://github.com/mdn/content/blob/main/files/en-us/web/html/reference/elements/input/url/index.md?plain=1

[^1_393]: https://m2.material.io/go/design-bidirectionality/

[^1_394]: https://m2.material.io/design/communication/data-visualization.html

[^1_395]: https://m2.material.io/design/guidelines-overview

[^1_396]: https://www.w3.org/International/questions/qa-upright-counters-in-vertical.en.html

[^1_397]: https://github.com/material-components/material-components-ios-codelabs/blob/master/MDC-103/Swift/Starter/Shrine/Pods/MDFInternationalization/Sources/NSString+MaterialBidi.m

[^1_398]: https://www.w3.org/International/questions/qa-bidi-unicode-controls.en.html

[^1_399]: https://m2.material.io/design/usability/bidirectionality.html

[^1_400]: https://www.w3.org/TR/2014/NOTE-WCAG20-TECHS-20140311/C8

[^1_401]: https://www.w3.org/TR/2008/WD-WCAG20-TECHS-20081103/C8.html

[^1_402]: https://www.w3.org/TR/2014/NOTE-WCAG20-TECHS-20140311/C22

[^1_403]: https://www.w3.org/TR/WD-CSS2/text.html

[^1_404]: https://www.w3.org/TR/alreq-gap/

[^1_405]: https://www.w3.org/TR/2024/DNOTE-alreq-20240430/

[^1_406]: https://www.itic.org/dotAsset/9893d84b-efc7-460a-97ed-851477def5c4.docx

[^1_407]: https://www.w3.org/TR/2021/WD-alreq-gap-20210120/

[^1_408]: https://www.w3.org/TR/2021/WD-alreq-gap-20210216/

[^1_409]: https://www.ddpmod.gov.in/sites/default/files/0e513fd182a7fc8be850c762934d08c5fcd1def4d30b0828c6eabe1507c9b9cf/406f978acc0f2206f8d661d30f0eb18c67e3143840ba221cad7c53bd2ede2fc1.pdf

[^1_410]: https://www.w3.org/TR/WCAG22/

[^1_411]: https://www.w3.org/TR/arab-lreq/

[^1_412]: https://www.w3.org/TR/wcag2ict-22/

[^1_413]: https://www.finance.gov.lb/en-us/Finance/BI/ABDP/Annual Budget Documents and Process/Citizen Budget 2026-Pamphlet-Mar26-Ar.pdf

[^1_414]: https://macrothink.org/journal/index.php/jsel/article/viewFile/23809/18223

[^1_415]: https://www.macrothink.org/journal/index.php/jsel/article/download/23809/18223

[^1_416]: https://www.bayanatlabs.com/insights/arabizi-code-switching

[^1_417]: https://www.touch.com.lb/autoforms/portal/touch/Personal/Samme3ni RBT

[^1_418]: https://www.finance.gov.lb/ar-lb/Taxation/LRT/VAT/Pages/default.aspx

[^1_419]: https://www.usj.edu.lb/enseignants/?empid=473\&lang=2

[^1_420]: https://www.spinneyslebanon.com/ajaltoun/home-outdoor

[^1_421]: https://www.spinneyslebanon.com/home-outdoor.html

[^1_422]: https://www.totersapp.com/kurdistan

[^1_423]: https://www.spinneyslebanon.com/ajaltoun/brands

[^1_424]: https://macrothink.org/journal/index.php/jsel/article/download/23809/18223

[^1_425]: https://m3.material.io/foundations/layout/layout-overview

