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
  status: {
    new: 'New',
    open: 'Open',
    inProgress: 'In progress',
    pending: 'Pending',
    resolved: 'Resolved',
    closed: 'Closed',
  },
  chat: {
    customer: 'Customer',
    assistant: 'Assistant',
    knowledgeBase: 'Knowledge base',
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
  state: {
    loading: 'Loading',
    error: 'Error',
    offline: 'No internet connection',
    sessionExpired: 'Your session has expired',
    apiUnreachable: 'The service could not be reached.',
  },
} as const;
