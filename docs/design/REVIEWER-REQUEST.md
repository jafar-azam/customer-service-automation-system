# Recruiting the Phase 6 reviewers

Send these now, not when the review is ready. People are slow to answer and
slower to deliver; the asking costs an hour and the waiting happens in parallel
with steps 12 onward.

`REVIEW-PACK.md` says what the review *is*. This is how to fill the five seats.

## The five seats

| Seat | Who | Where to look |
| :-- | :-- | :-- |
| Arabic-script user | Reads and writes Arabic script by preference | Family, older colleagues, university staff |
| Arabizi-heavy user | Writes Lebanese Arabic in Latin characters by default | Students, anyone under ~30 in your contacts |
| English-dominant bilingual | Switches language mid-conversation | Colleagues in IT, people who studied in English |
| Support agent or admin | Has actually worked a queue | The business this project is modelled on |
| Accessibility-technology user | Uses a screen reader or magnifier daily | A disability society, a university access office |

Minimum five people. The fifth is the hardest to find and the only one who can
answer anything about `A11Y-03`, so start that one first.

**Why five and not two.** A Lebanese study of 227,059 WhatsApp messages across
seven universities found script preference varies between groups. Two reviewers
who both happen to write in Arabic script would systematically miss the Arabizi
users — this product's harder case and a large part of its audience.

---

## What to send

Short. One message, no attachment, no form to fill in yet.

### English

> **Subject: 30 minutes of your opinion on Arabic in a support app?**
>
> Hi [name],
>
> I'm building a bilingual customer-support system for my final-year project —
> it answers questions in Lebanese Arabic, Arabizi, or English and hands over
> to a person when it isn't sure.
>
> The interface is written and the Arabic is researched, but not reviewed by
> anyone who actually speaks it. I'd like five people to look at it and tell me
> where it reads like a translation.
>
> What it involves: about 30 minutes, once, around [month]. I show you real
> screens, you tell me what's wrong with the wording. No technical knowledge
> needed — the point is whether it makes sense, not whether it works.
>
> Specifically I'd value your view because you [write in Arabic script / write
> in Arabizi / switch between languages / have worked a support queue / use a
> screen reader].
>
> You'd be credited in the project if you want to be, or not if you'd rather
> not. Nothing you say is published without your say-so.
>
> Would that be alright? No rush on answering — the review itself is a few
> weeks away. I'm asking early so I can plan around who's available.
>
> Thanks,
> [your name]

### Arabic

> **الموضوع: نصف ساعة من وقتك لمراجعة عربية تطبيق دعم؟**
>
> مرحبًا [الاسم]،
>
> أعمل على نظام دعم عملاء ثنائي اللغة لمشروع التخرج — يجيب بالعربية اللبنانية
> أو بالعربيزي أو بالإنكليزية، ويحوّل الطلب إلى موظف عندما لا يكون واثقًا.
>
> الواجهة جاهزة، والعربية فيها مبنية على بحث لكن لم يراجعها أحد من الناطقين
> بها. أبحث عن خمسة أشخاص ينظرون إليها ويقولون لي أين تبدو وكأنها ترجمة.
>
> ما المطلوب: حوالي ٣٠ دقيقة، مرة واحدة، في [الشهر]. أعرض شاشات حقيقية، وتقول
> لي ما الخطأ في الصياغة. لا حاجة لأي معرفة تقنية — السؤال هو هل الكلام مفهوم،
> لا هل البرنامج يعمل.
>
> رأيك مهم تحديدًا لأنك [تكتب بالحرف العربي / تكتب بالعربيزي / تنتقل بين
> اللغتين / عملت في فريق دعم / تستخدم قارئ شاشة].
>
> يمكن ذكر اسمك في المشروع إن أردت، أو عدم ذكره إن فضّلت ذلك. ولا يُنشر أي شيء
> تقوله دون موافقتك.
>
> هل يناسبك؟ لا داعي للاستعجال في الرد — المراجعة نفسها بعد أسابيع. أسأل مبكرًا
> لأرتب حسب من سيكون متاحًا.
>
> شكرًا،
> [اسمك]

---

## Three things the message deliberately does

**Names the time cost first.** "30 minutes, once" is the question people are
actually deciding. Burying it makes the ask feel open-ended, and an
open-ended ask gets no reply rather than a no.

**Says no technical knowledge is needed.** The most useful reviewer is the one
most likely to assume they are unqualified.

**Asks early and says so.** "No rush on answering" is true and it removes the
pressure that makes people postpone replying indefinitely.

## What not to promise

- Not payment, unless you can pay all five.
- Not that their wording will be used — it is input, not a decision.
- Not anonymity you cannot deliver. Credit is opt-in; say so plainly.

## Before the session

- Nothing from `reference/` goes in front of a reviewer. The screens use
  invented demo data — `Cedar Pharmaceuticals`, `CSAS-000001` — and that stays
  true.
- Record only what `REVIEW-PACK.md` §5 lists: preferences, role, device, and
  their judgements. No contact details in the repository, ever.
- Consent for any recording is separate and explicit, and the recording does
  not enter the repository either.

## Tracking

Keep the list of who was asked and who replied **outside** this repository —
it is personal data about identifiable people, and the scanner exists to keep
exactly that out. `reference/` is git-ignored and is the right home.
