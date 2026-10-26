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
  history: {
    title: 'طلبات الدعم الخاصة بك',
    empty: 'لا توجد طلبات بعد.',
    emptyFiltered: 'لا توجد طلبات تطابق هذه التصفية.',
    showing: 'عرض {{shown}} من {{total}}',
    filterStatus: 'الحالة',
    filterSearch: 'بحث',
    searchHint: 'الموضوع أو رقم الطلب',
    filterFrom: 'من تاريخ',
    filterTo: 'إلى تاريخ',
    clear: 'إزالة التصفية',
    anyStatus: 'كل الحالات',
    opened: 'تاريخ الفتح',
    updated: 'آخر تحديث',
  },
  detail: {
    back: 'العودة إلى الطلبات',
    conversation: 'المحادثة',
    attachments: 'الملفات المرفقة',
    noAttachments: 'لا توجد ملفات مرفقة.',
    timeline: 'سجل الحالة',
    download: 'تنزيل نسخة من المحادثة',
    continues: 'يكمل طلبًا سابقًا',
    reopen: 'إعادة فتح الطلب',
    reopenPrompt: 'ما الذي حدث منذ ذلك الحين؟',
    reopenWindowPassed: 'أُغلق هذا الطلب قبل أكثر من {{days}} يومًا ولم يعد بالإمكان إعادة فتحه.',
    reopenDisabled: 'لا يمكن إعادة فتح الطلبات المغلقة.',
    scanPending: 'قيد الفحص',
    scanFailed: 'غير متاح',
  },
  preferences: {
    title: 'الإشعارات',
    whatsapp: 'إرسال التحديثات عبر واتساب',
    email: 'إرسال التحديثات بالبريد الإلكتروني',
    emailUnavailable: 'يلزم إضافة بريد إلكتروني لاستخدام هذا الخيار.',
    marketing: 'عدم إرسال أي شيء سوى تحديثات الدعم',
    language: 'لغة الرسائل',
    saved: 'تم الحفظ',
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
  signIn: {
    title: 'تسجيل الدخول',
    lead: 'الدعم متاح لعملاء عقود الصيانة. يلزم إدخال رقم الهاتف المسجّل في العقد، ويُرسل رمز لمرة واحدة.',
    phone: 'رقم الهاتف',
    phoneHint: 'رقم خلوي لبناني، مثال 03 123 456',
    sendCode: 'إرسال الرمز',
    codeTitle: 'إدخال الرمز',
    codeLead: 'إذا كان الرقم مسجّلًا في عقد، فالرمز في طريقه إلى {{phone}}. صالح لمدة خمس دقائق.',
    code: 'الرمز المكوّن من ستة أرقام',
    verify: 'تسجيل الدخول',
    resend: 'إرسال رمز آخر',
    resendIn: 'يمكن طلب رمز آخر بعد {{seconds}} ثانية',
    changeNumber: 'استخدام رقم آخر',
    signOut: 'تسجيل الخروج',
    signedInAs: 'تم تسجيل الدخول باسم {{name}}',
    devInbox: 'صندوق التجربة',
    devInboxLead: 'وضع العرض: لا تُرسل الرسائل فعليًا. هذا ما كان سيُرسل.',
    devInboxEmpty: 'لم يُرسل شيء بعد.',
    contractExpired:
      'عقد الصيانة لهذا الحساب غير فعّال، لذلك الدعم غير متاح. يرجى التواصل معنا للتجديد.',
  },
  error: {
    unauthenticated: 'يلزم تسجيل الدخول لعرض طلباتك.',
    forbidden: 'لا تتوفر صلاحية الوصول.',
    not_found: 'تعذّر العثور على المطلوب.',
    network_error: 'تعذّر الوصول إلى الخدمة.',
    too_many_requests: 'عدد كبير من الطلبات — يلزم الانتظار قليلًا.',
    contract_inactive: 'لا يوجد عقد صيانة فعّال لهذا الحساب.',
    reopen_window_passed: 'لم يعد بالإمكان إعادة فتح هذا الطلب.',
    reopen_not_closed: 'هذا الطلب ليس مغلقًا.',
    unknown: 'حدث خطأ ما.',
  },
  state: {
    loading: 'جارٍ التحميل',
    error: 'خطأ',
    offline: 'غير متصل بالإنترنت',
    sessionExpired: 'انتهت صلاحية الجلسة',
    apiUnreachable: 'تعذّر الوصول إلى الخدمة.',
  },
} as const;
