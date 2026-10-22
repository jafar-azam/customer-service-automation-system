
# Research, with citations from official sources, how to send WhatsApp and SMS messages to Lebanese phone numbers (+961) from a web application, for two uses: (1) one-time login codes and (2) notifications (ticket updates, escalation alerts to agents, contract-renewal reminders).

Cover:

1. Meta WhatsApp Cloud API vs. Twilio vs. other providers (e.g., MessageBird/Bird, Vonage, Infobip): setup steps, business verification requirements, phone-number requirements, free test/sandbox options, and current pricing per conversation/message category (authentication, utility, marketing) for Lebanon.
2. WhatsApp authentication templates for one-time codes: rules, approval process, copy-code buttons, and rate limits.
3. Template message approval for notifications; the 24-hour customer-service window; receiving incoming messages via webhooks; webhook signature verification.
4. SMS delivery to Lebanese mobile networks (Alfa and touch): which providers deliver reliably, sender ID rules, pricing, and known delivery problems.
5. Fallback strategy when WhatsApp fails (SMS fallback, retries, delivery receipts).
6. Anti-abuse: preventing SMS pumping/toll fraud on OTP endpoints.
7. Node.js SDK support and any restrictions for open-source projects.

OUTPUT: a comparison table (provider, WhatsApp support, SMS to Lebanon, OTP support, pricing, test mode, setup difficulty), a recommended setup for a student portfolio project with near-zero cost, a recommended setup for real business use, and step-by-step setup instructions for the recommended option. Cite official pricing pages and docs; mark anything unverified. Do not invent prices.

**For a near-zero-cost portfolio, use Twilio’s WhatsApp Sandbox and mock SMS delivery; for a small production business, use Twilio Verify for OTPs and Twilio Messaging for approved WhatsApp notifications, subject to a delivery pilot on both Alfa and touch.** The sandbox includes a limited trial allowance, while Verify manages the OTP lifecycle rather than merely transporting a code.[^1_1][^1_2]

**Important October 2026 change:** WhatsApp is no longer priced per conversation, and an open 24-hour service window no longer makes all replies free: since October 1, Meta charges for utility templates inside that window and for service messages after the first 1,000 per business number each month.[^1_3]

*Pricing checked for October 22, 2026. USD figures below are published list prices, not negotiated quotes; taxes, carrier charges, additional products, and account-specific rates may apply.*

## Provider comparison

“Supported” below means documented product or destination support—not independently measured delivery reliability. Setup difficulty is an implementation assessment.


| Provider | WhatsApp support | SMS to Lebanon | OTP support | Published pricing | Test mode | Setup difficulty |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| **Meta Cloud API directly** | Direct WhatsApp Business Platform integration. [^1_4] | **No SMS transport**; add another provider | Authentication templates; application manages code generation and validation | Lebanon Meta fee: **\$0.0091 authentication/utility**, **\$0.0392 marketing**; no BSP processing fee. [^1_5] | Meta-provided test sender and temporary token; follow the dashboard’s recipient restrictions. [^1_4] | Medium; lowest messaging overhead, more engineering |
| **Twilio** | WhatsApp through Messaging API, plus Verify. [^1_6][^1_1] | Published Lebanon SMS offering; tariff data identifies Alfa and mtc touch. [^1_7] | Managed Verify, or self-managed codes through approved authentication templates. [^1_8][^1_9] | Messaging: **\$0.005/message inbound or outbound**, plus applicable Meta fees. Lebanon SMS live page: **\$0.3619/segment**. Verify adds **\$0.05/successful verification** plus its channel fees. [Official WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing) · [Lebanon SMS pricing](https://www.twilio.com/en-us/sms/pricing/lb) · [Verify pricing](https://www.twilio.com/en-us/verify/pricing) | WhatsApp Sandbox; current docs specify **100 WhatsApp messages** in trial free units; no custom sandbox templates. [^1_2] | Low for demo; medium for production |
| **Bird / MessageBird** | WhatsApp API and templates. [^1_10] | Published Lebanon SMS destination and alphanumeric-sender offering. [^1_11] | Authentication templates; separately offered Verify product | WhatsApp: **\$0.005 outbound processing** plus Meta; Lebanon authentication/utility **\$0.0141 total**, marketing **\$0.0442 total**. SMS: **\$0.28/segment**, with separate fees possible. [Official WhatsApp pricing](https://bird.com/pricing/whatsapp/lb) · [SMS pricing](https://bird.com/pricing/sms/lb) | A current Lebanon-specific free WhatsApp sandbox entitlement was **not verified**; onboarding docs require wallet balance. [^1_12] | Medium |
| **Vonage** | Messages API, including WhatsApp. [^1_13] | SMS product available; **current +961 carrier coverage, sender rules, and price require confirmation** | WhatsApp templates and a separate Verify product; confirm the selected product’s Lebanon channels | Meta fees plus Vonage platform fees; **numeric Lebanon WhatsApp/SMS totals not verified**. [Official pricing](https://www.vonage.com/communications-apis/messages/pricing/) | Free Messages Sandbox; **1 message/second, 100/month**; current sandbox guide says templates are not enabled. [^1_14][^1_15] | Low for sandbox; medium for production |
| **Infobip** | WhatsApp Business Platform offering. [^1_16] | SMS documentation offers worldwide self-sign-up coverage with exceptions that do not list Lebanon; **Alfa/touch route quality still needs testing**. [^1_17] | Authentication messaging; request the appropriate managed-verification configuration | **Lebanon totals not independently verified**; use calculator/account quote. [Official WhatsApp pricing](https://www.infobip.com/whatsapp-business/pricing) | SMS docs specify **100 free SMS to up to five verified recipients**. [^1_17] | Medium; potentially more account coordination |

### Actual Lebanon WhatsApp rates

Lebanon is mapped to **“Rest of Middle East”** in the current official Twilio-hosted Meta rate data. Authentication-international is marked **not applicable** for Lebanon.[^1_5]


| Message category | Meta directly | Twilio Messaging | Bird |
| :-- | --: | --: | --: |
| Authentication | \$0.0091/delivered message. [^1_5] | \$0.0141: Meta + \$0.005 handling | \$0.0141 |
| Utility, including inside the service window | \$0.0091/delivered message. [^1_3][^1_5] | \$0.0141 | \$0.0141 |
| Marketing | \$0.0392/delivered message. [^1_5] | \$0.0442 | \$0.0442 |
| Outbound service, within 24-hour window | First 1,000/month/business number free; then \$0.0091/message. [^1_3][^1_5] | \$0.005 handling even when Meta allowance applies; then \$0.0141 | \$0.005 processing even when Meta allowance applies; then \$0.0141 |
| Incoming user messages | Meta does not charge | Twilio charges \$0.005/message | Bird says incoming messages are free |

Twilio totals above are simple additions of its published handling fee and Meta’s Lebanon rate; they apply to **Messaging, not automatically to Verify**. Bird publishes the same outbound category totals and says its processing fee applies when processed, while Meta’s fee follows delivery-based billing. [Official Twilio pricing](https://www.twilio.com/en-us/whatsapp/pricing) · [Official Bird pricing](https://bird.com/pricing/whatsapp/lb)

**Verify caution:** Twilio publishes a \$0.05 successful-verification fee, but its pricing page contains inconsistent US WhatsApp examples. The exact **Lebanese Verify channel charge is therefore unverified here**; obtain it from the account or sales rather than adding the Messaging handling fee yourself. [Official Verify pricing](https://www.twilio.com/en-us/verify/pricing)

Utility and authentication can receive volume-tier discounts; use [Meta’s current rate cards](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) for the applicable tier.[^1_18][^1_3]

## Setup and verification

### Shared WhatsApp requirements

Production onboarding generally involves a Meta business portfolio, a WhatsApp Business Account, a business profile/display name, and verification of the sending number’s ownership by SMS or voice OTP. The sending number may be your own number rather than one rented from the messaging provider.[^1_19]

**Phone-number verification, business verification, and an Official Business Account badge are different processes.** Twilio explicitly says Meta business verification is free and is not the “Meta Verified” subscription.[^1_20]

For a clean integration, use a dedicated number that you control and can receive verification calls or SMS on. If it is already used in WhatsApp or WhatsApp Business, check the provider’s supported migration/coexistence procedure before changing or deleting that registration; do not assume every onboarding route supports simultaneous app/API use.


| Provider | Production onboarding path |
| :-- | :-- |
| **Meta** | Create a developer app with the WhatsApp use case; connect/create the business portfolio and messaging account; test; add a production sender, billing, production credentials, and webhooks. [^1_4] |
| **Twilio** | Upgrade the account; open WhatsApp Senders; use Self Sign-up/“Continue with Facebook”; connect the portfolio/WABA; verify the number; complete Meta business verification. Current Twilio docs require verification before production. [^1_19] |
| **Bird** | Fund the wallet; obtain Meta Business Manager administrator access; choose a number; create the channel; verify the business. A non-Bird number must receive SMS or calls. [^1_12] |
| **Vonage** | Start in Messages Sandbox; production requires the production application/account configuration and WhatsApp business onboarding. Exact current document requirements should be confirmed during onboarding. [^1_14][^1_21] |
| **Infobip** | Create the account, configure the WhatsApp offering, and complete its business/channel onboarding. Exact current Lebanon-specific onboarding documents were **not verified** in this review. [^1_16] |

Meta’s platform limits allow a newly created portfolio to start at **250 unique recipients outside service windows in a moving 24-hour period**. That does **not** override a provider’s stricter production-onboarding requirements; the live WhatsApp Manager limit and provider approval both matter.[^1_22][^1_19]

## OTP authentication templates

### Rules and approval

Use an **authentication template**, not a utility or marketing template, for WhatsApp login codes. Twilio requires authentication-template approval even when replying within an open service window.[^1_9]

Authentication templates use preset verification wording, optionally including a security notice and expiry warning; supported experiences include copy-code and native-app autofill. For a browser-based application, **copy-code is the simplest cross-platform choice**.[^1_23][^1_24]

Key constraints:

- Do not add promotional copy, arbitrary URLs, media, or emojis to the authentication template; parameters have a documented 15-character limit.[^1_10]
- Create the template in WhatsApp Manager or through the provider’s template API, selecting the authentication category and required language.[^1_25][^1_23]
- Submit for WhatsApp approval and wait for an approved status; Twilio says review can take up to 24 hours or usually one business day—not an approval guarantee.[^1_25][^1_9]
- For direct/Bird-style template payloads, supply the **same OTP in the body and button parameters**; the sending payload can use `sub_type: "url"` for the OTP button despite presenting a copy-code interaction.[^1_10]
- With **Twilio Verify**, WhatsApp OTPs use Meta-defined copy-code authentication templates rather than ordinary Verify default templates.[^1_8]

**Implementation recommendation:** enforce the actual code expiry on your backend. Displayed expiry wording is not a substitute for server-side expiry, attempt limits, or single-use consumption.

### Rate limits

There is no single “WhatsApp OTP limit”: platform throughput, unique-recipient limits, provider limits, and your own anti-abuse limits all apply.[^1_2][^1_26][^1_22]


| Limit | Verified value |
| :-- | :-- |
| Cloud API throughput | Up to **80 messages/second per registered number** by default; eligible numbers can upgrade to **1,000/second**. [^1_26] |
| New portfolio audience limit | **250 unique recipients outside service windows per moving 24 hours**, shared at portfolio level; scaling paths lead to higher limits. [^1_22] |
| Twilio WhatsApp Sandbox | One message every **three seconds**; joined recipient sessions expire after **three days**. [^1_2] |
| Vonage Sandbox | **One message/second and 100/month** across channels. [^1_15] |

The live Meta limits guide also distinguishes audience limits from throughput; sending many codes to one person should not be treated as permission to consume the full advertised throughput. [Official Meta limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) · [Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput)

## Notifications and incoming messages

### Choose the correct category

The following classification is a **recommended submission approach**, not guaranteed approval; Meta’s approved category determines billing. Utility covers specific transactions, customer requests, and billing reminders, while marketing covers content that does not qualify as utility or authentication. [Official Twilio category guidance](https://www.twilio.com/en-us/whatsapp/pricing)


| Your notification | Suggested category and boundaries |
| :-- | :-- |
| Ticket update | **Utility** when tied to an existing ticket or requested support interaction |
| Escalation alert to an agent | Submit as **utility** if it is a specific operational alert; approval for this exact internal-agent use case is **unverified** |
| Contract-renewal reminder | **Utility** when neutrally identifying an existing contract’s expiry or required action; promotional renewal offers/upsells can be marketing |
| Login code | **Authentication**, regardless of whether a service window is open. [^1_9] |

Submit templates with meaningful sample variable values, correct language, and the appropriate category. Through Twilio, creating content and submitting its WhatsApp approval request are separate operations.[^1_25]

**Approval is not recipient consent.** Collect and retain notification preferences, provide a way to stop messages, and keep sensitive ticket or contract details behind an authenticated link.

### The 24-hour window

An incoming user message opens or refreshes the **24-hour customer-service window**, during which permitted free-form replies can be sent. Outside that window, outbound WhatsApp messages require an approved template; sending a business notification does not itself create permission for arbitrary free-form follow-ups.[^1_2]

Since October 1, utility templates are billable even inside that window, and outbound non-template service messages are billable after the monthly allowance. Some older official pages still describe the previous free-utility model, so prioritize the dated October 2026 update over those passages.[^1_3]

### Webhooks and signatures

Use webhooks for incoming messages and delivery-status updates. Meta’s setup guide explicitly includes a webhook endpoint for delivered/read notifications; provider callbacks should be treated as asynchronous rather than assuming a successful API request means delivery.[^1_27][^1_4]


| Integration | Verification approach |
| :-- | :-- |
| **Meta directly** | Handle the GET subscription challenge using your configured verify token; verify POST payloads using `X-Hub-Signature-256`, HMAC-SHA256 over the **raw request bytes**, keyed with the app secret. The challenge token is not the POST-signing secret. [Official webhook setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint) |
| **Twilio** | Validate `X-Twilio-Signature` using the official SDK, your account Auth Token, the exact public callback URL, and all supplied parameters. Preserve the external HTTPS URL when behind a proxy. [^1_28][^1_29][^1_30] |
| **Other providers** | Implement that provider’s documented callback authentication; exact current Bird/Vonage/Infobip headers were **not verified here**. Do not reuse a Meta signature verifier for a provider-generated callback |

**Implementation recommendation:** verify first, persist/enqueue the event, acknowledge promptly, deduplicate by message/event identifier, and tolerate duplicate or out-of-order status events.

## SMS on Alfa and touch

### Coverage is not reliability

Twilio’s official pricing data explicitly names both **Alfa** and **mtc touch**, while Bird publishes a Lebanon destination page. Neither establishes an independently measured delivery success rate or latency ranking.[^1_7][^1_11]

**No defensible “most reliable provider in Lebanon” ranking was verified.** Require a pilot on both networks and written confirmation of the commercial route, sender behavior, delivery-receipt support, and escalation process.


| Provider | Verified Lebanon position | Remaining uncertainty |
| :-- | :-- | :-- |
| Twilio | Lebanon SMS product; Alfa/touch tariff entries; published sender guidance. [^1_7] | Actual OTP conversion and latency on both networks |
| Bird | Lebanon SMS destination; alphanumeric sender supported without registration according to its destination page. [^1_11] | Network-by-network performance and complete account charges |
| Infobip | Worldwide self-sign-up coverage, with Lebanon absent from the documented exclusions. [^1_17] | Exact Alfa/touch routes, rate, and sender provisioning |
| Vonage | General SMS offering | Current Lebanon route availability, restrictions, and price were **not verified** |

### Sender IDs and problems

Twilio strongly recommends **alphanumeric sender IDs** for Lebanon: numeric senders may be overwritten with a generic alphanumeric ID, with delivery attempted on a best-effort basis. Its Lebanon guidelines show alphanumeric preregistration as not required. [Official Lebanon guidelines](https://www.twilio.com/en-us/guidelines/lb/sms)

Bird’s Lebanon destination page likewise says alphanumeric registration is not required, the submitted sender is preserved, and messaging is one-way. Treat these as provider-specific route descriptions rather than a universal promise covering every aggregator.[^1_11]

Known, documented risks include:

- **Sender rewriting or non-delivery:** particularly with inappropriate numeric sender IDs on Twilio’s Lebanon routes. [Official Lebanon guidelines](https://www.twilio.com/en-us/guidelines/lb/sms)
- **Unexpected segment charges:** GSM-7 normally permits 160 characters in one segment, whereas UCS-2 permits 70; Arabic and other non-GSM text can therefore change cost substantially.[^1_27]
- **Fraud-screening false positives:** Twilio Fraud Guard can block a legitimate destination within a suspicious prefix range.[^1_31]
- **Accepted versus delivered confusion:** a provider’s accepted response is not a handset delivery receipt.[^1_27]

A current Lebanon-wide outage, carrier-specific URL blacklist, or systematic Alfa-versus-touch failure difference was **not verified**.

**Pricing discrepancy:** an official Twilio CSV returned \$0.15030 for Lebanon, but the live Lebanon pricing page returned **\$0.3619/segment\*\*. Budget against the live page and obtain account-specific `LB` pricing through Twilio’s Pricing API before launch; do not rely on the lower CSV value. [Live pricing](https://www.twilio.com/en-us/sms/pricing/lb)[^1_32][^1_7]

## Fallback and retries

### OTP delivery

Twilio Verify documents automatic WhatsApp-to-SMS fallback for channel outages, degradation, unavailable destinations, and missing/misconfigured WhatsApp senders, provided SMS is enabled. This is not evidence that every possible undelivered WhatsApp message triggers the same fallback behavior.[^1_33]

Recommended application policy:

1. Create one verification challenge and record its state.
2. Send through the selected channel; distinguish API acceptance, delivery, and successful code verification.
3. Offer a controlled “Send by SMS instead” action after a short delay, rather than repeatedly sending both channels.
4. Reuse the same active challenge or invalidate the previous challenge explicitly; do not leave multiple unrelated codes valid.
5. Stop sends after verification succeeds or the challenge expires.

**Do not bypass a fraud block by automatically switching to another SMS provider.** Route suspected legitimate false positives through an alternative trusted factor or support review instead. Twilio documents alternative channels for legitimate users affected by Fraud Guard.[^1_31]

### Notifications

For ticket alerts and reminders, implement a separate delivery workflow rather than using Verify. Suggested states are `queued → submitted → delivered`, with terminal failure and a separately recorded fallback attempt.

Use limited exponential-backoff retries for transient API failures, not permanent failures such as invalid recipients or unapproved templates. Reserve SMS fallback for important notifications, deduplicate by business event and recipient, and do not interpret “not read” as “not delivered.”

For escalation alerts, define an **acknowledgement deadline** separately from message delivery; a delivered SMS does not establish that an agent accepted the ticket.

## Preventing OTP fraud

Twilio recommends Verify Fraud Guard for verification traffic and SMS Pumping Protection when using Programmable Messaging instead. Verify’s published base offering includes OTP lifecycle management, rate limiting, and SMS pumping protection. [Official Verify pricing](https://www.twilio.com/en-us/verify/pricing)[^1_34]

Recommended controls—not provider-imposed thresholds:

- **Destination allowlist:** enable only Lebanon initially; validate full mobile numbers rather than accepting any string beginning with `+961`.
- **Layered rate limits:** per phone number, account, session/device, IP, and destination prefix; enforce counters atomically.
- **Resend controls:** start with a 30–60-second cooldown and a small rolling send allowance, then tune against legitimate usage.
- **Challenge protection:** short expiry, bounded verification attempts, single-use consumption, and no OTP values in logs.
- **Bot resistance:** apply CAPTCHA or risk challenges before paid sends when behavior is suspicious.
- **Budget enforcement:** maintain application-level daily and hourly send/spend caps with an emergency kill switch; alerts alone are not a hard stop.
- **Conversion monitoring:** alert on rising sends with falling successful verification rates, concentrated prefixes, or repeated channel switching.
- **Restricted endpoints:** never expose an unauthenticated general-purpose “send message to arbitrary number” endpoint.

Keep provider fraud protection enabled, but monitor false positives rather than assuming it replaces your own controls.[^1_31]

## Recommended configurations

### Student portfolio

**Use Twilio WhatsApp Sandbox + a mock SMS adapter.** This gives a documented trial allowance, incoming-message testing, delivery callbacks, and pre-approved verification/notification examples without production WhatsApp onboarding.[^1_2]

Suggested build:

1. Create the Twilio trial and activate WhatsApp Sandbox.
2. Join from your own Lebanese WhatsApp number using the dashboard instructions.
3. Implement OTP start/check endpoints, but enforce an allowlist of demo recipients.
4. Use the sandbox’s supplied verification-code template and notification examples; do not claim this tests your own approved production templates.
5. Mock SMS failures and fallback in automated tests.
6. Optionally use Infobip’s 100-SMS trial for a small real Alfa/touch pilot, within its verified-recipient limits.[^1_17]

Sandbox recipients must rejoin after three days, custom templates are unavailable, and usage beyond trial allowances should not be presented as permanently free.[^1_2]

Meta’s direct test sender is an alternative for learning Cloud API without a BSP layer; its current setup guide covers the temporary token, test recipient, first message, and webhook flow. Exact current test quotas and custom-authentication-template test availability were **not verified here**.[^1_4]

### Real business

**Recommended starting point: Twilio Verify for login codes + Twilio Messaging for notifications**, with production WhatsApp onboarding and an Alfa/touch acceptance test. Verify reduces the authentication code you must operate; Messaging handles approved notifications and callbacks.[^1_6][^1_1]

For a cost-sensitive business with engineering capacity, consider **Meta Cloud API for WhatsApp + a separately contracted SMS provider**. This avoids Twilio’s \$0.005 WhatsApp handling charge, but you must own OTP security, delivery orchestration, retries, and monitoring. [Official Twilio pricing](https://www.twilio.com/en-us/whatsapp/pricing)

Bird is a credible price comparison for Lebanese SMS at its published \$0.28/segment versus Twilio’s live \$0.3619, but that is **not an all-in cost or reliability verdict**. [Bird pricing](https://bird.com/pricing/sms/lb) · [Twilio pricing](https://www.twilio.com/en-us/sms/pricing/lb)

## Production setup steps

The following uses the recommended **Twilio-based configuration**.

1. **Prepare business information.** Obtain administrator access to the Meta business portfolio and use genuine business/profile information. Upgrade the Twilio account.[^1_19]
2. **Register a WhatsApp sender.** In Twilio’s WhatsApp Senders area, choose Create New Sender, continue with Facebook, connect/create the WABA, and verify ownership of the chosen number by SMS or voice. A non-Twilio number is supported.[^1_19]
3. **Complete business verification.** Follow the current production requirements and confirm the sender is usable before enabling customer traffic. Do not confuse this with buying a verification subscription.[^1_20][^1_19]
4. **Create a Verify service.** Configure the desired channels, review WhatsApp sender/template behavior, enable SMS only for intended destinations, and retain Fraud Guard. Verify WhatsApp uses Meta-defined authentication templates.[^1_8][^1_34]
5. **Obtain exact Lebanon Verify pricing.** Confirm its SMS and WhatsApp channel charges; do not assume the generic Messaging rate is the Verify tariff. The verification base fee is \$0.05 on successful verification. [Official Verify pricing](https://www.twilio.com/en-us/verify/pricing)
6. **Submit notification templates.** Create separate templates for ticket updates, escalation alerts, and neutral contract-expiry reminders, with realistic samples and required languages. Submit the WhatsApp approval request and inspect the final approved category.[^1_9][^1_25]
7. **Connect Node.js server-side.** Use the official Twilio SDK; keep credentials in server-side environment variables or a secret manager. The following illustrates API calls, not a complete secured public endpoint.[^1_28]
```js
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const verify = client.verify.v2.services(
  process.env.TWILIO_VERIFY_SERVICE_SID
);

// Call only after number validation, abuse checks, and budget checks.
async function startLogin(to) {
  return verify.verifications.create({
    to,                       // Validated E.164 mobile number
    channel: "whatsapp"
  });
}

async function checkLogin(to, code) {
  const result = await verify.verificationChecks.create({ to, code });
  return result.status === "approved";
}
```

8. **Send approved notification content separately.** Supply the approved content identifier and template variables through Messaging, not through Verify. Twilio’s Content API distinguishes content creation from WhatsApp approval.[^1_25]
```js
async function sendTicketUpdate(to, ticketId, status) {
  return client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${to}`,
    contentSid: process.env.TICKET_UPDATE_CONTENT_SID,
    contentVariables: JSON.stringify({
      "1": ticketId,
      "2": status
    }),
    statusCallback:
      `${process.env.PUBLIC_BASE_URL}/webhooks/twilio/status`
  });
}
```

9. **Implement signed callbacks.** Configure incoming-message and status URLs; use `twilio.validateRequest(...)` or the SDK webhook middleware. Validate against the exact public HTTPS URL, including all callback parameters; account for reverse-proxy TLS termination.[^1_30][^1_29][^1_28]
10. **Configure notification SMS separately.** Use an allowed alphanumeric sender and enable Lebanon. Do not assume that Verify’s managed sender pool and your notification sender have identical configuration or behavior. [Official Lebanon guidelines](https://www.twilio.com/en-us/guidelines/lb/sms) · [Verify features](https://www.twilio.com/en-us/verify/pricing)
11. **Run an acceptance pilot.** Test real Alfa and touch phones, OTP completion, expired codes, duplicate callbacks, WhatsApp unavailability, SMS fallback, sender display, Arabic segmentation, and cost reporting.
12. **Enable production gradually.** Start with tight destination/send budgets, review conversion and delivery metrics, and increase capacity only after the route meets your latency and reliability requirements.

## Node.js and open source

| Provider | Practical Node.js position |
| :-- | :-- |
| Meta | Call the HTTPS Graph API using Node’s HTTP client/`fetch`; no SDK is necessary. A currently maintained official Node SDK was **not verified**. [^1_4] |
| Twilio | Official Node SDK, including webhook-signature validation. [^1_28] |
| Vonage | Official server-SDK examples include Node.js message sending. [^1_14] |
| Bird | REST integration is available; confirm whether a legacy MessageBird helper covers the current Bird API you choose. Current SDK coverage/version was **not verified**. [^1_10] |
| Infobip | Use its supported REST integration; exact current official Node package coverage was **not verified** in this review |

**No special exemption for an open-source or student project was established.** Public source code does not substitute for production sender registration, template approval, business onboarding, or paid usage.[^1_9][^1_19]

Keep `.env` files, tokens, real customer numbers, webhook secrets, and OTP logs out of the repository; publish an `.env.example` and a mock transport instead. SDK licensing and hosted-service terms are separate questions: verify the exact package’s `LICENSE` and provider agreement before redistribution, rather than assuming that “open-source SDK” means “free messaging.”

<span style="display:none">[^1_100][^1_101][^1_102][^1_103][^1_104][^1_105][^1_106][^1_107][^1_108][^1_109][^1_110][^1_111][^1_112][^1_113][^1_114][^1_115][^1_116][^1_117][^1_118][^1_119][^1_120][^1_121][^1_122][^1_123][^1_124][^1_125][^1_126][^1_127][^1_128][^1_129][^1_130][^1_131][^1_132][^1_133][^1_134][^1_135][^1_136][^1_137][^1_138][^1_139][^1_140][^1_141][^1_142][^1_143][^1_144][^1_145][^1_146][^1_147][^1_148][^1_149][^1_150][^1_151][^1_152][^1_153][^1_154][^1_155][^1_156][^1_157][^1_158][^1_159][^1_160][^1_161][^1_162][^1_163][^1_164][^1_165][^1_166][^1_167][^1_168][^1_169][^1_170][^1_171][^1_172][^1_173][^1_174][^1_175][^1_176][^1_177][^1_178][^1_179][^1_180][^1_181][^1_182][^1_183][^1_184][^1_185][^1_186][^1_187][^1_188][^1_189][^1_190][^1_191][^1_192][^1_193][^1_194][^1_195][^1_196][^1_197][^1_198][^1_199][^1_200][^1_201][^1_202][^1_203][^1_204][^1_205][^1_206][^1_207][^1_208][^1_209][^1_210][^1_211][^1_212][^1_213][^1_214][^1_215][^1_216][^1_217][^1_218][^1_219][^1_220][^1_221][^1_222][^1_223][^1_224][^1_225][^1_226][^1_227][^1_228][^1_229][^1_230][^1_231][^1_232][^1_233][^1_234][^1_235][^1_236][^1_237][^1_238][^1_239][^1_240][^1_241][^1_242][^1_243][^1_244][^1_245][^1_246][^1_247][^1_248][^1_249][^1_250][^1_251][^1_252][^1_253][^1_254][^1_255][^1_256][^1_257][^1_258][^1_259][^1_260][^1_261][^1_262][^1_263][^1_264][^1_265][^1_266][^1_267][^1_268][^1_269][^1_270][^1_271][^1_272][^1_273][^1_274][^1_275][^1_276][^1_277][^1_278][^1_279][^1_280][^1_281][^1_282][^1_283][^1_284][^1_285][^1_286][^1_287][^1_288][^1_289][^1_290][^1_291][^1_292][^1_35][^1_36][^1_37][^1_38][^1_39][^1_40][^1_41][^1_42][^1_43][^1_44][^1_45][^1_46][^1_47][^1_48][^1_49][^1_50][^1_51][^1_52][^1_53][^1_54][^1_55][^1_56][^1_57][^1_58][^1_59][^1_60][^1_61][^1_62][^1_63][^1_64][^1_65][^1_66][^1_67][^1_68][^1_69][^1_70][^1_71][^1_72][^1_73][^1_74][^1_75][^1_76][^1_77][^1_78][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92][^1_93][^1_94][^1_95][^1_96][^1_97][^1_98][^1_99]</span>

<div align="center">⁂</div>

[^1_1]: https://www.twilio.com/en-us/user-authentication-identity/verify

[^1_2]: https://www.twilio.com/docs/whatsapp/sandbox.md

[^1_3]: https://help.twilio.com/articles/53100480177819

[^1_4]: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started

[^1_5]: https://static1.twilio.com/content/dam/twilio-com/pricing-data/en/WhatsAppPricing-pricing-details.csv

[^1_6]: https://www.twilio.com/docs/whatsapp

[^1_7]: https://www.twilio.com/content/dam/twilio-com/pricing-data/en/csv/PMded94a0dae30eaaec0f115f22859bd38_SMSPricing.csv

[^1_8]: https://www.twilio.com/docs/verify/verification-templates.md

[^1_9]: https://www.twilio.com/docs/content/content-types-overview

[^1_10]: https://developers.messagebird.com/quickstarts/whatsapp/send-message-with-buttons/

[^1_11]: https://bird.com/sms-api/features/destinations/lebanon

[^1_12]: https://docs.bird.com/applications/channels/channels/supported-channels/whatsapp/quickstarts/before-you-start

[^1_13]: https://www.vonage.com/communications-apis/messages/features/whatsapp/

[^1_14]: https://developer.vonage.com/en/messages/concepts/messages-api-sandbox

[^1_15]: https://api.support.vonage.com/hc/en-us/articles/11679887237276-What-is-the-Messages-API-sandbox-rate-limit

[^1_16]: https://www.infobip.com/whatsapp-business/pricing

[^1_17]: https://www.infobip.com/docs/sms.md

[^1_18]: https://help.twilio.com/articles/30304057900699

[^1_19]: https://www.twilio.com/docs/whatsapp/self-sign-up

[^1_20]: https://www.twilio.com/docs/whatsapp/self-sign-up.md

[^1_21]: https://developer.vonage.com/en/blog/sandbox-quickstart-send-and-receive-whatsapp-messages-with-python

[^1_22]: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits

[^1_23]: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates?locale=zh_CN

[^1_24]: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/autofill-button-authentication-templates

[^1_25]: https://www.twilio.com/docs/content/content-api-resources

[^1_26]: https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput

[^1_27]: https://bird.com/en-gb/docs/guides/sms/sending-sms

[^1_28]: https://www.twilio.com/docs/usage/security

[^1_29]: https://www.twilio.com/docs/usage/webhooks/webhooks-security

[^1_30]: https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/handle-ssl-termination-twilio-node-js-helper-library

[^1_31]: https://help.twilio.com/articles/18224141185947-Troubleshooting-False-Positives-of-Verify-Fraud-Guard

[^1_32]: https://www.twilio.com/docs/messaging/api/pricing

[^1_33]: https://www.twilio.com/en-us/changelog/Verify_Fallback_Scenarios

[^1_34]: https://static0.twilio.com/docs/messaging/guides/preventing-messaging-fraud

[^1_35]: https://www.twilio.com/en-us/voice/pricing/lb

[^1_36]: https://help.twilio.com/articles/223134687

[^1_37]: https://plumcut.com/blog/whatsapp-business-api-cost

[^1_38]: https://help.twilio.com/articles/223181568

[^1_39]: https://www.twilio.com/en-us/sms/pricing/usa.md

[^1_40]: https://help.twilio.com/sections/205113067

[^1_41]: https://help.twilio.com/articles/223183228-How-Does-Twilio-s-Pricing-Work-

[^1_42]: https://help.twilio.com/articles/223182908-How-much-does-a-phone-number-cost-

[^1_43]: https://whatsappbusiness.com/products/platform-pricing/

[^1_44]: https://help.twilio.com/articles/223134147-Obtaining-a-full-list-of-Twilio-s-SMS-and-MMS-pricing

[^1_45]: https://www.twilio.com/en-us/products/conversational-ai/pricing

[^1_46]: https://static0.twilio.com/docs/messaging/api/pricing

[^1_47]: https://whatsappbusiness.com/resources/faq/

[^1_48]: https://help.twilio.com/articles/360016571913

[^1_49]: https://www.twilio.com/en-us/sms/pricing/lb

[^1_50]: https://frontdeskreview.com/software/whatsapp-business/twilio-whatsapp/

[^1_51]: https://www.twilio.com/docs/trust-hub/registrations/alphanumeric-sender-id

[^1_52]: https://www.twilio.com/docs/messaging/services/alphanumeric-sender-ids-in-messaging-services.md

[^1_53]: https://www.twilio.com/en-us/pricing/messaging

[^1_54]: https://www.twilio.com/en-us/messaging/channels/whatsapp

[^1_55]: https://help.twilio.com/articles/223181348-Alphanumeric-Sender-ID-for-Twilio-Programmable-SMS

[^1_56]: https://help.twilio.com/articles/53100462475931

[^1_57]: https://www.twilio.com/en-us/blog/new-pricing-twilio-api-whatsapp

[^1_58]: https://help.twilio.com/hc/en-us/articles/223133767-International-support-for-Alphanumeric-Sender-ID

[^1_59]: https://help.twilio.com/articles/223133767-International-support-for-Alphanumeric-Sender-ID

[^1_60]: https://static0.twilio.com/docs/messaging/guides/sending-international-sms-guide

[^1_61]: https://www.twilio.com/en-us/verify/pricing

[^1_62]: https://www.twilio.com/en-us/guidelines/lb/sms

[^1_63]: https://www.twilio.com/en-us/pricing

[^1_64]: https://www.twilio.com/en-us/whatsapp/pricing

[^1_65]: https://www.wappbiz.com/pricing/

[^1_66]: https://www.chatwoot.com/tools/whatsapp-pricing-calculator

[^1_67]: https://www.courier.com/guides/whatsapp-pricing

[^1_68]: https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026

[^1_69]: https://www.getmacha.com/blog/wati-pricing-explained

[^1_70]: https://aahfil.com/en/whatsapp-api/pricing

[^1_71]: https://agentdeals.dev/whatsapp-business-api-pricing-2026

[^1_72]: https://whatsapp-docs.kap.so/documentation/whatsapp/pricing

[^1_73]: https://www.salesforce.com/en-us/wp-content/uploads/sites/4/assets/pdf/whatsapp-business-messaging-rate-card-mm-lite-dec-1-2025-to-jan-31-2026.pdf?bc=OTH

[^1_74]: https://www.salesforce.com/en-us/wp-content/uploads/sites/4/assets/pdf/whatsapp-business-messaging-rate-card-mm-lite-feb-1-2026.pdf?bc=OTH

[^1_75]: https://www.gupshup.ai/resources/wp-content/uploads/2025/12/USD_Jan2026.pdf

[^1_76]: https://www.salesforce.com/en-us/wp-content/uploads/sites/4/WhatsApp-Business-Messaging-Rate-Card-MM-Lite-May-1-2026.pdf?bc=OTH

[^1_77]: https://faq.whatsapp.com/1356785542323967/?cms_platform=web

[^1_78]: https://faq.whatsapp.com/1022626499062292

[^1_79]: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing

[^1_80]: https://support.chatarchitect.com/books/meta-whatsapp/page/copy-code-authentication-templates-developer-documentation

[^1_81]: https://developers.facebook.com/community/threads/121606771014675/

[^1_82]: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started

[^1_83]: https://stackoverflow.com/questions/74622031/whatsapp-business-api-cloud-how-do-i-register-a-customers-phonenumber-via-api

[^1_84]: https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-solution-partners

[^1_85]: https://docs.axelor.com/connect-help-center/docs/HTML/en/apps/communication/whatsapp-business-cloud.html

[^1_86]: https://support.chatarchitect.com/books/meta-whatsapp/page/copy-code-authentication-templates-developer-documentation/export/html

[^1_87]: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/?locale=zh_CN

[^1_88]: https://docs.kapso.ai/docs/whatsapp/templates/authentication

[^1_89]: https://github.com/gpcuneo/moodle-message_whatsapp

[^1_90]: https://developers.facebook.com/docs/whatsapp/cloud-api/overview

[^1_91]: https://docs.kore.ai/agent-platform/channels/whatsapp

[^1_92]: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/zero-tap-authentication-templates/?locale=zh_CN

[^1_93]: https://developers.secure.facebook.com/docs/messenger-platform/webhooks

[^1_94]: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/autofill-button-authentication-templates/?locale=zh_HK

[^1_95]: https://apio.sh/apis/bird-sms

[^1_96]: https://api.support.vonage.com/hc/en-us/articles/20773952146460-WhatsApp-Pricing-Vonage-Platform-Fees

[^1_97]: https://developer.vonage.com/en/messages/concepts/whatsapp

[^1_98]: https://www.infobip.com/guides/get-started-guide/faq

[^1_99]: https://apio.sh/apis/infobip-sms

[^1_100]: https://developer.vonage.com/en/api/pricing

[^1_101]: https://www.vonage.com/communications-apis/pricing/

[^1_102]: https://bird.com/products/whatsapp/pricing/lb

[^1_103]: https://bird.com/pricing/whatsapp/lb

[^1_104]: https://www.vonage.com/communications-apis/messages/features/whatsapp/pricing/

[^1_105]: https://www.vonage.com/communications-apis/sms/pricing/

[^1_106]: https://www.vonage.com/communications-apis/messages/pricing/

[^1_107]: https://bird.com/pricing

[^1_108]: https://bird.com/pricing/whatsapp/us

[^1_109]: https://www.infobip.com/docs/whatsapp/get-started

[^1_110]: https://api.support.vonage.com/hc/en-us/articles/204017663-Lebanon-SMS-Features-and-Restrictions

[^1_111]: https://developer.vonage.com/en/api/sms

[^1_112]: https://api.support.vonage.com/hc/en-us/categories/200201483-SMS

[^1_113]: https://www.vonage.com/communications-apis/sms/

[^1_114]: https://api.support.vonage.com/hc/en-us

[^1_115]: https://api.support.vonage.com/hc/en-us/articles/204017803-Israel-SMS-Features-and-Restrictions

[^1_116]: https://support.vonage.com/articles/answer/2FA--Prior-Version

[^1_117]: https://api.support.vonage.com/hc/en-us/articles/204017933-Syria-SMS-Features-and-Restrictions

[^1_118]: https://bird.com/de-de/produkte/sms/destinations/alphanumeric-sender-ids

[^1_119]: https://bird.com/sms-api/features/destinations

[^1_120]: https://api.support.vonage.com/hc/en-us/articles/204017113-Bahrain-SMS-Features-and-Restrictions

[^1_121]: https://api.support.vonage.com/hc/en-us/sections/9182319113372-Middle-East

[^1_122]: https://bird.com/products/sms/destinations/lebanon

[^1_123]: https://bird.com/pricing/sms/lb

[^1_124]: https://bird.com/nl-nl/sms-api/prijzen/lb

[^1_125]: https://docs.ycloud.com/en/documentation/whatsapp-business-platform/messaging/message-templates/authentication-message-templates/copy-code-authentication.md

[^1_126]: https://developers.facebook.com/docs/whatsapp/overview /

[^1_127]: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/template-library

[^1_128]: https://support.chatarchitect.com/books/meta-whatsapp/page/best-practices-for-authenticating-users-via-whatsapp-developer-documentation

[^1_129]: https://support.chatarchitect.com/books/meta-whatsapp/page/zero-tap-authentication-templates-developer-documentation

[^1_130]: https://docs.ycloud.com/en/documentation/whatsapp-business-platform/messaging/message-templates/index

[^1_131]: https://developers.facebook.com/docs/whatsapp/webhooks

[^1_132]: https://developers.facebook.com/docs/whatsapp/on-premises/guides/send-message-performance/?locale=id_ID

[^1_133]: https://support.chatarchitect.com/books/meta-whatsapp/page/throughput-developer-documentation

[^1_134]: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates

[^1_135]: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates

[^1_136]: https://www.infobip.com/docs/tutorials/authenticate-users-with-whatsapp-template-messages

[^1_137]: https://infobip.my.site.com/partner/s/grow-business-with-whatsapp-and-infobip

[^1_138]: https://help.twilio.com/articles/55716603108763

[^1_139]: https://www.twilio.com/docs/usage/trials.md

[^1_140]: https://www.infobip.com/docs/whatsapp/message-types-and-templates

[^1_141]: https://www.infobip.com/whatsapp-business

[^1_142]: https://support.infobip.com/how-to-use-whatsapp

[^1_143]: https://static0.twilio.com/docs/content/whatsappauthentication

[^1_144]: https://www.twilio.com/docs/usage/trials

[^1_145]: https://www.twilio.com/docs/content/whatsappauthentication.md

[^1_146]: https://cdn-web.infobip.com/uploads/2023/07/The-WhatsApp-Business-Platform-A-Z-guide.pdf

[^1_147]: https://www.twilio.com/docs/whatsapp/key-concepts

[^1_148]: https://www.infobip.com/whatsapp-business/otp

[^1_149]: https://help.twilio.com/articles/360007721954-Getting-Started-with-Twilio-for-WhatsApp

[^1_150]: https://www.twilio.com/docs/whatsapp/sandbox

[^1_151]: https://www.sentdm.com/resources/lebanon-sms-pricing

[^1_152]: https://www.alfa.com.lb/en/business/sms-short-code

[^1_153]: https://www.alfa.com.lb/en/business/corporate-offers

[^1_154]: https://www.alfa.com.lb/en/roaming

[^1_155]: https://www.alfa.com.lb/en/business/alfa-media

[^1_156]: https://legacy.touch.com.lb/autoforms/portal/touch/business/m2m/overview

[^1_157]: https://www.alfa.com.lb/en/prepaid/services/call-waiting

[^1_158]: https://www.alfa.com.lb/en/support/faq

[^1_159]: https://legacy.touch.com.lb/autoforms/portal/touch/footer/sitemap

[^1_160]: https://support.infobip.com/what-is-the-sms-price

[^1_161]: https://www.infobip.com/docs/sms/sms-coverage-and-connectivity

[^1_162]: https://www.infobip.com/?price=free

[^1_163]: https://touch.com.lb/en/business

[^1_164]: https://www.infobip.com/pricing

[^1_165]: https://www.infobip.com/sms/pricing

[^1_166]: https://www.twilio.com/en-us/blog/how-to-secure-twilio-webhook-urls-in-nodejs

[^1_167]: https://www.twilio.com/docs/usage/webhooks/webhooks-faq

[^1_168]: https://www.twilio.com/docs/usage/webhooks/webhooks-security.md

[^1_169]: https://static1.twilio.com/docs/usage/webhooks/webhook-configuration.md

[^1_170]: https://static0.twilio.com/docs/verify/preventing-toll-fraud/verify-geo-permissions.md

[^1_171]: https://www.twilio.com/docs/usage/webhooks

[^1_172]: https://www.twilio.com/docs/usage/webhooks/webhook-testing

[^1_173]: https://www.twilio.com/docs/verify/api/programmable-rate-limits.md

[^1_174]: https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-flask-app-by-validating-incoming-twilio-requests

[^1_175]: https://www.twilio.com/docs/messaging/guides/preventing-messaging-fraud

[^1_176]: https://www.twilio.com/en-us/blog/developers/tutorials/product/getting-the-most-out-of-your-twilio-account-security-project

[^1_177]: https://help.twilio.com/articles/18956637364763

[^1_178]: https://help.twilio.com/articles/18956637364763-Fraud-Guard-in-Authy-and-Verify-v1

[^1_179]: https://static0.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard.md

[^1_180]: https://www.twilio.com/docs/usage/fraud-response-guide/analyze

[^1_181]: https://github.com/WhatsApp/WhatsApp-Nodejs-SDK/security

[^1_182]: https://github.com/WhatsApp/WhatsApp-Nodejs-SDK/blob/main/CHANGELOG

[^1_183]: https://github.com/WhatsApp/WhatsApp-Nodejs-SDK

[^1_184]: https://github.com/orgs/WhatsApp/repositories

[^1_185]: https://github.com/whatsapp-sdk

[^1_186]: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/

[^1_187]: https://github.com/asumaroks/codex-plugins/blob/main/plugins/twilio-developer-kit/skills/twilio-verify-send-otp/SKILL.md

[^1_188]: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/projectSetup/

[^1_189]: https://www.twilio.com/docs/whatsapp/isv/register-senders

[^1_190]: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/receivingMessages/

[^1_191]: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/whatsapp/this/

[^1_192]: https://www.twilio.com/docs/whatsapp/api/senders

[^1_193]: https://www.twilio.com/docs/verify/whatsapp.md

[^1_194]: https://static0.twilio.com/docs/whatsapp

[^1_195]: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/document/

[^1_196]: https://www.infobip.com/docs/voice-and-video/getting-started

[^1_197]: https://bird.com/en-gb/explained/whatsapp

[^1_198]: https://www.infobip.com/docs/sms

[^1_199]: https://bird.com/en-gb/docs/guides/whatsapp/numbers/overview

[^1_200]: https://apio.sh/apis/infobip-whatsapp

[^1_201]: https://docs.bird.com/applications/channels/channels/supported-channels/whatsapp/how-to/become-a-whatsapp-tech-provider/onboard-as-a-tech-provider

[^1_202]: https://docs.bird.com/applications/channels/channels/supported-channels/whatsapp/concepts/use-whatsapp

[^1_203]: https://apio.sh/apis/bird-whatsapp

[^1_204]: https://docs.bird.com/applications/channels/channels/supported-channels/whatsapp

[^1_205]: https://www.vonage.com/communications-apis/messages/features/facebook-messenger/

[^1_206]: https://www.infobip.com/docs/essentials/getting-started/free-trial

[^1_207]: https://www.infobip.com/docs/sms/get-started

[^1_208]: https://www.vonage.com/about-us/vonage-stories/introducing-vonage-messages-api-sandbox/

[^1_209]: https://developer.vonage.com/en/blog/introducing-the-messages-api-sandbox

[^1_210]: https://developer.vonage.com/en/messages/code-snippets/whatsapp/send-media-mtm

[^1_211]: https://developer.vonage.com/en/blog/send-whatsapp-messages-with-laravel-dr

[^1_212]: https://developer.vonage.com/en/messages/code-snippets/whatsapp/send-button-link

[^1_213]: https://www.infobip.com/c/whatsapp-business-api

[^1_214]: https://developer.vonage.com/en/messages/code-snippets/whatsapp/send-unreaction

[^1_215]: https://developer.vonage.com/fr/messages/concepts/whatsapp

[^1_216]: https://help.twilio.com/articles/26677541240859

[^1_217]: https://docs.customer.io/journeys/faq-whatsapp.md

[^1_218]: https://www.twilio.com/en-us/sms/pricing/us

[^1_219]: https://help.twilio.com/articles/223181508-Does-Twilio-Support-Concatenated-SMS-Over-160-Characters

[^1_220]: https://www.twilio.com/en-us/guidelines/us/sms

[^1_221]: https://www.twilio.com/en-us/guidelines/sms

[^1_222]: https://docs.customer.io/messaging/channels/whatsapp/faq-whatsapp/

[^1_223]: https://zernio.com/blog/twilio-whatsapp-pricing-breakdown-what-it-really-costs

[^1_224]: https://help.twilio.com/sections/205555047

[^1_225]: https://api.support.vonage.com/hc/en-us/articles/10207369049372-Unable-to-Sign-In-to-the-API-Support-Help-Center

[^1_226]: https://www.twilio.com/en-us/guidelines/voice

[^1_227]: https://www.twilio.com/en-us/guidelines/regulatory

[^1_228]: https://api.support.vonage.com/hc/en-us/articles/6749696044828-Vonage-API-Support-Incident-Handling

[^1_229]: https://api.support.vonage.com/hc/en-us/articles/13557658383900-Intermittent-WebSocket-Disconnections

[^1_230]: https://api.support.vonage.com/hc/en-us/articles/14124705425436-How-to-Get-Started-with-a-Voice-based-Agent-in-AI-Studio

[^1_231]: https://api.support.vonage.com/hc/en-us/articles/7081193249684-Models

[^1_232]: https://api.support.vonage.com/hc/en-us/articles/13827643944604-Voice-Broadcast

[^1_233]: https://api.support.vonage.com/hc/en-us/articles/360021744552-Single-Sign-On-for-Support-Portal-and-Vonage-API-Dashboard

[^1_234]: https://api.support.vonage.com/hc/en-us/articles/23999821631004-How-to-raise-a-request-with-Vonage-API-Support-Help-Center

[^1_235]: https://www.fiscoclic.mx/asistencia/meta-precios-whatsapp-mxn-2026-10-01.pdf

[^1_236]: https://support.kommo.com/docs/updated-pricing-rules-for-whatsapp-business

[^1_237]: https://www.twilio.com/en-us/sip-trunking/pricing/lb

[^1_238]: https://docs.360dialog.com/docs/get-started/pricing

[^1_239]: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/pricing

[^1_240]: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers

[^1_241]: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages

[^1_242]: https://support.infobip.com/how-do-i-get-an-sms-sender

[^1_243]: https://developer.vonage.com/en/messaging/sms/guides/custom-sender-id

[^1_244]: https://docs.bird.com/connectivity-platform/country-restrictions-and-regulations/sender-id-availability-and-restrictions-per-country

[^1_245]: https://developer.vonage.com/en/messages/guides/sms/sender-identity

[^1_246]: https://bird.com/docs/guides/sms/senders

[^1_247]: https://support.infobip.com/can-my-sms-sender-name-be-something-other-than-infosms

[^1_248]: https://www.infobip.com/docs/resources-and-numbers/alphanumeric-senders

[^1_249]: https://www.infobip.com/docs/resources-and-numbers/get-started-with-resources-and-numbers

[^1_250]: https://api.support.vonage.com/hc/en-us/articles/204017433-Palestinian-SMS-Features-and-Restrictions

[^1_251]: https://www.infobip.com/docs/myrequests/submit-myrequests

[^1_252]: https://support.chatarchitect.com/books/meta-whatsapp/page/pricing-on-the-whatsapp-business-platform-developer-documentation

[^1_253]: https://www.twilio.com/en-us/user-authentication-identity

[^1_254]: https://www.twilio.com/en-us/use-cases/user-verification-identity

[^1_255]: https://www.vonagebusiness.jp/communications-apis/messages/pricing/

[^1_256]: https://www.vonage.fr/communications-apis/messages/pricing/

[^1_257]: https://www.vonagebusiness.de/communications-apis/messages/pricing/

[^1_258]: https://www.vonage.com.br/communications-apis/messages/pricing/

[^1_259]: https://www.vonage.com.es/communications-apis/messages/pricing/

[^1_260]: https://help.1msg.io/1msg-knowledge-base/template/work-with-api/creating-a-template-via-api

[^1_261]: https://pywa.readthedocs.io/en/dev/content/templates/types.html

[^1_262]: https://docs.ycloud.com/en/documentation/quick-start/send-verification-codes-via-whatsapp

[^1_263]: https://developers.facebook.com/docs/whatsapp/cloud-api/support/?locale=th_TH

[^1_264]: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/

[^1_265]: https://pywa.readthedocs.io/en/latest/content/templates/types.html

[^1_266]: https://developers.facebook.com/community/threads/1570378644314635/

[^1_267]: https://ideas.gohighlevel.com/whatsapp/p/authentication-templates-in-whatsapp

[^1_268]: https://docs.ycloud.com/api-reference/whatsapp-templates/create-a-template

[^1_269]: https://docs.360dialog.com/docs/resources/wabas/messaging-limits

[^1_270]: https://developers.facebook.com/docs/whatsapp/messaging-limits?locale=zh_TW

[^1_271]: https://support.chatarchitect.com/books/meta-whatsapp/page/upcoming-changes-to-messaging-limits-developer-documentation

[^1_272]: https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers

[^1_273]: https://help.twilio.com/articles/6686317584155

[^1_274]: https://www.twilio.com/docs/whatsapp/register-senders-using-api

[^1_275]: https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide

[^1_276]: https://www.twilio.com/en-us/lp/it-userauth-verification-apj

[^1_277]: https://help.twilio.com/articles/43430648191259

[^1_278]: https://static0.twilio.com/docs/usage

[^1_279]: https://docs.jaalyantra.com/docs/reference/webhooks/diagnostic-guide

[^1_280]: https://stackoverflow.com/questions/36620841/what-is-the-best-practice-to-secure-your-facebook-chatbot-webhook

[^1_281]: https://www.twilio.com/docs/content/content-types-overview.md

[^1_282]: https://github.com/avzamelek/hookproof/tree/main/src/providers/meta

[^1_283]: https://www.twilio.com/docs/serverless/functions-assets/quickstart/send-sms-and-mms

[^1_284]: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/zero-tap-authentication-templates

[^1_285]: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages.md

[^1_286]: https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform.md

[^1_287]: https://developers.facebook.com/community/threads/317263614057982/

[^1_288]: https://developers.facebook.com/community/profile/126443510508717?locale=zh_HK

[^1_289]: https://developers.facebook.com/support/faq/

[^1_290]: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/autofill-button-authentication-templates/?locale=zh_CN

[^1_291]: https://support.chatarchitect.com/books/meta-whatsapp/page/text-messages-webhook-reference-developer-documentation

[^1_292]: https://support.chatarchitect.com/books/meta-whatsapp/page/get-started-developer-documentation

