/**
 * English interface strings, and the shape every other language must match.
 *
 * `MSG-03` is enforced against this file: a key here with no counterpart, or
 * an interpolation variable that does not appear in both, fails a test rather
 * than rendering `{{count}}` to a customer.
 */
export const enLB = {
  app: {
    name: 'C.S.A.S',
    tagline: 'Support for maintenance-contract customers',
    skipToContent: 'Skip to content',
  },
  action: {
    send: 'Send',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    open: 'Open',
    openTicket: 'Open ticket {{reference}}',
    filter: 'Filter',
    retry: 'Try again',
    signIn: 'Sign in',
    signInByPhone: 'Sign in with your phone number',
  },
  settings: {
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
  },
  page: {
    dashboard: 'Dashboard',
  },
  history: {
    title: 'Your support tickets',
    empty: 'You have no tickets yet.',
    emptyFiltered: 'No tickets match these filters.',
    showing: 'Showing {{shown}} of {{total}}',
    filterStatus: 'Status',
    filterSearch: 'Search',
    searchHint: 'Subject or reference',
    filterFrom: 'Opened from',
    filterTo: 'Opened to',
    clear: 'Clear filters',
    anyStatus: 'Any status',
    opened: 'Opened',
    updated: 'Updated',
  },
  detail: {
    back: 'Back to tickets',
    conversation: 'Conversation',
    attachments: 'Attachments',
    noAttachments: 'No files attached.',
    timeline: 'History',
    download: 'Download transcript',
    continues: 'Continues an earlier ticket',
    reopen: 'Reopen this ticket',
    reopenPrompt: 'What has happened since?',
    reopenWindowPassed:
      'This ticket closed more than {{days}} days ago and can no longer be reopened.',
    reopenDisabled: 'Closed tickets cannot be reopened.',
    scanPending: 'Being checked',
    scanFailed: 'Unavailable',
    confirmTitle: 'Did that solve it?',
    confirmPrompt: 'Let us know, so we can either close this or get a person onto it.',
    confirmYes: 'Yes, it is solved',
    confirmNo: 'No, I still need help',
    confirmThanks: 'Thank you — this ticket is now resolved.',
    confirmEscalated: 'Passed to a specialist. Someone will reply to you.',
    confirmNotAnswered: 'Nothing to confirm yet — we have not answered this one.',
    rateTitle: 'How was the support?',
    rateLegend: 'A score out of five',
    /* Named, not left as a bare number: "1" means whatever the reader
       assumes, and the two ends are the scores people actually use. */
    rateScore_one: '1, not helpful at all',
    rateScore_two: '2, not very helpful',
    rateScore_three: '3, neither good nor bad',
    rateScore_four: '4, helpful',
    rateScore_five: '5, very helpful',
    rateComment: 'Anything you want to add',
    rateSubmit: 'Send rating',
    rateSaved: 'Thank you for the rating.',
  },
  preferences: {
    title: 'Notifications',
    whatsapp: 'Send me updates on WhatsApp',
    email: 'Send me updates by email',
    emailUnavailable: 'Add an email address to use this.',
    marketing: 'Do not send me anything except support updates',
    language: 'Language for messages',
    saved: 'Saved',
  },
  ticket: {
    one: 'Support ticket',
    reference: 'Reference',
    customer: 'Customer',
    subject: 'Subject',
    priority: 'Priority',
    deadline: 'Deadline',
    script: 'Written form',
    breached: 'Deadline breached',
    count_one: '{{count}} support ticket',
    count_other: '{{count}} support tickets',
  },
  priority: {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    urgent: 'Urgent',
  },
  /* One key per `TICKET_STATUSES`, checked by a test. Four of these were
     missing and the screen fell back to the raw enum, so an Arabic page showed
     `awaiting_customer` in English snake_case. `new` and `pending` were here
     and are not statuses this system has. */
  status: {
    open: 'Open',
    assistantAnswering: 'Assistant replying',
    awaitingCustomer: 'Waiting for you',
    escalated: 'With a specialist',
    inProgress: 'Being worked on',
    resolved: 'Resolved',
    closed: 'Closed',
    reopened: 'Reopened',
  },
  chat: {
    customer: 'Customer',
    assistant: 'Assistant',
    /* A human, and said so. Labelling an agent's reply "Assistant" tells the
       customer a machine wrote it — the one distinction this product exists to
       keep honest. */
    agent: 'Support agent',
    system: 'System',
    knowledgeBase: 'Knowledge base',
    basedOn: 'Based on:',
    /* The version is shown, not hidden: the entry may have been rewritten
       since, and this names the text that was actually used. */
    version: '(version {{version}})',
    confidence: 'Confidence',
    composerLabel: 'Your reply',
    composerPlaceholder: 'Write a reply…',
    solved: 'Did this solve the problem?',
    solvedYes: 'Yes, thank you',
    solvedNo: 'No, I need a person',
    escalate: 'Escalate to a specialist',
  },
  field: {
    required: 'Required',
    optional: 'Optional',
    invalidPhone:
      'That is not a valid phone number. A Lebanese mobile starts with 03, 70, 71, 76, 78, 79 or 81.',
  },
  signIn: {
    title: 'Sign in',
    lead: 'Support is for customers with a maintenance contract. Enter the mobile number on your contract and we will send you a one-time code.',
    phone: 'Mobile number',
    phoneHint: 'A Lebanese mobile, for example 03 123 456',
    sendCode: 'Send me a code',
    codeTitle: 'Enter the code',
    codeLead:
      'If that number is on a contract, a code is on its way to {{phone}}. It is valid for five minutes.',
    code: 'Six-digit code',
    verify: 'Sign in',
    resend: 'Send another code',
    resendIn: 'You can ask for another code in {{seconds}} seconds',
    changeNumber: 'Use a different number',
    signOut: 'Sign out',
    signedInAs: 'Signed in as {{name}}',
    devInbox: 'Dev inbox',
    devInboxLead:
      'Demonstration mode: messages are not really sent. This is what would have gone out.',
    devInboxEmpty: 'Nothing sent yet.',
    contractExpired:
      'The maintenance contract on this account is not active, so support is not available. Please contact us to renew it.',
  },
  error: {
    unauthenticated: 'Please sign in to see your tickets.',
    forbidden: 'You do not have access to that.',
    not_found: 'That could not be found.',
    network_error: 'The service could not be reached.',
    too_many_requests: 'Too many requests — please wait a moment.',
    contract_inactive: 'This account has no active maintenance contract.',
    reopen_window_passed: 'That ticket can no longer be reopened.',
    reopen_not_closed: 'That ticket is not closed.',
    unknown: 'Something went wrong.',
  },
  state: {
    loading: 'Loading',
    error: 'Error',
    offline: 'No internet connection',
    sessionExpired: 'Your session has expired',
    apiUnreachable: 'The service could not be reached.',
  },
} as const;
