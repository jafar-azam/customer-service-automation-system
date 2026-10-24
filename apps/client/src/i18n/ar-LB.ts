/**
 * Arabic interface strings.
 *
 * Register is contemporary MSA, not dialect — the split the research
 * recommends: the interface is MSA, the *conversation* may be Lebanese. A
 * support interface has to be understood before it is distinctive.
 *
 * Wording follows `docs/design/LOCALIZATION.md` §3: the approved glossary, and
 * nominal/impersonal constructions rather than an imperative that has to guess
 * the reader's gender.
 *
 * Not reviewed by a native speaker. `docs/design/REVIEW-PACK.md` is the plan
 * for that, and until it has run every string here is provisional.
 */
export const arLB = {
  app: {
    name: 'C.S.A.S',
    tagline: 'دعم لعملاء عقود الصيانة',
    skipToContent: 'تخطي إلى المحتوى',
  },
  action: {
    send: 'إرسال',
    save: 'حفظ',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    filter: 'تصفية',
    retry: 'إعادة المحاولة',
    signIn: 'تسجيل الدخول',
    signInByPhone: 'الدخول برقم الهاتف',
  },
  settings: {
    language: 'اللغة',
    theme: 'المظهر',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    themeSystem: 'حسب النظام',
  },
  page: {
    dashboard: 'لوحة المعلومات',
  },
  ticket: {
    /* `طلب دعم`, not `تذكرة`: the glossary's recommendation for clarity in a
       customer-facing interface. `تذكرة` reads as a cinema ticket first. */
    one: 'طلب دعم',
    reference: 'رقم الطلب',
    customer: 'العميل',
    subject: 'الموضوع',
    priority: 'الأولوية',
    deadline: 'المهلة',
    script: 'شكل الكتابة',
    breached: 'تجاوزت المهلة',
    /* All six Arabic plural categories. `count === 1 ? a : b` is wrong in five
       of them, and the shape of the counted noun changes with the category —
       `3 طلبات` (few) but `11 طلبًا` (many, singular accusative). */
    count_zero: 'لا توجد طلبات دعم',
    count_one: 'طلب دعم واحد',
    count_two: 'طلبا دعم',
    count_few: '{{count}} طلبات دعم',
    count_many: '{{count}} طلبًا للدعم',
    count_other: 'عدد طلبات الدعم: {{count}}',
  },
  priority: {
    low: 'أولوية منخفضة',
    normal: 'أولوية عادية',
    high: 'أولوية عالية',
    urgent: 'عاجل',
  },
  status: {
    new: 'جديد',
    open: 'مفتوح',
    inProgress: 'قيد المعالجة',
    pending: 'قيد الانتظار',
    resolved: 'تم الحل',
    closed: 'مغلق',
  },
  chat: {
    customer: 'العميل',
    assistant: 'المساعد',
    knowledgeBase: 'قاعدة المعرفة',
    confidence: 'الثقة',
    composerLabel: 'نص الرد',
    composerPlaceholder: 'نص الرد…',
    /* Impersonal and correctly agreeing: `المشكلة` is feminine, so
       `هل حلّ هذا المشكلة` — which this interface shipped once — is wrong. */
    solved: 'هل حُلّت المشكلة؟',
    solvedYes: 'نعم، شكرًا',
    solvedNo: 'لا، أريد موظف دعم',
    escalate: 'إحالة الطلب إلى فريق مختص',
  },
  field: {
    required: 'مطلوب',
    optional: 'اختياري',
    /* The problem and the recovery, never "you entered something wrong". */
    invalidPhone:
      'رقم الهاتف غير صحيح. يلزم رقم لبناني يبدأ بـ 03 أو 70 أو 71 أو 76 أو 78 أو 79 أو 81.',
  },
  state: {
    loading: 'جارٍ التحميل',
    error: 'خطأ',
    offline: 'غير متصل بالإنترنت',
    sessionExpired: 'انتهت صلاحية الجلسة',
    apiUnreachable: 'تعذّر الوصول إلى الخدمة.',
  },
} as const;
