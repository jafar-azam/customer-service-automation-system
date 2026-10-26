import type { Locale } from '@csas/shared';
import { formatDateTime, type FormatPreferences } from '@csas/shared';
import type { MessageDocument } from '../repositories/messages.js';
import type { TicketDocument } from '../repositories/tickets.js';

/**
 * The conversation as a file a customer can keep.
 *
 * `PRIVACY.md` promises a person can take their data with them, and a support
 * thread is the part they are most likely to want — to forward to a colleague,
 * to attach to an invoice dispute, or simply because the contract ended.
 *
 * Plain text rather than PDF or HTML. It opens everywhere, it carries no
 * active content, and it is the one format where "what you see is what the
 * file contains" is literally true. A generated PDF would need a renderer in
 * the server and would hand the customer a file their own machine has to parse
 * with something far more complicated than a text editor.
 */

export interface TranscriptOptions {
  readonly locale: Locale;
  /** Internal notes are never included, whoever is downloading. */
  readonly messages: readonly MessageDocument[];
  readonly ticket: TicketDocument;
}

/* A named shape rather than `as const` alone: with only `as const` the two
   label sets are distinct literal types and neither is assignable to the
   other, so nothing can take "the labels" as a parameter. */
interface Labels {
  readonly title: string;
  readonly reference: string;
  readonly subject: string;
  readonly status: string;
  readonly opened: string;
  readonly exported: string;
  readonly customer: string;
  readonly assistant: string;
  readonly agent: string;
  readonly system: string;
  readonly note: string;
}

const LABELS: Readonly<Record<Locale, Labels>> = {
  'ar-LB': {
    title: 'نسخة من المحادثة',
    reference: 'رقم الطلب',
    subject: 'الموضوع',
    status: 'الحالة',
    opened: 'تاريخ الفتح',
    exported: 'تاريخ التصدير',
    customer: 'العميل',
    assistant: 'المساعد',
    agent: 'موظف الدعم',
    system: 'النظام',
    note: 'هذه نسخة من محادثتك مع دعم C.S.A.S. لا تحتوي على الملاحظات الداخلية.',
  },
  'en-LB': {
    title: 'Conversation transcript',
    reference: 'Reference',
    subject: 'Subject',
    status: 'Status',
    opened: 'Opened',
    exported: 'Exported',
    customer: 'Customer',
    assistant: 'Assistant',
    agent: 'Support agent',
    system: 'System',
    note: 'This is a copy of your conversation with C.S.A.S support. Internal notes are not included.',
  },
};

function speaker(author: string, labels: Labels): string {
  switch (author) {
    case 'customer':
      return labels.customer;
    case 'assistant':
      return labels.assistant;
    case 'agent':
      return labels.agent;
    default:
      return labels.system;
  }
}

export function renderTranscript({ locale, messages, ticket }: TranscriptOptions): string {
  const labels = LABELS[locale];
  const preferences: FormatPreferences = { locale };
  const at = (date: Date) => formatDateTime(date, preferences);

  const header = [
    labels.title,
    '='.repeat(labels.title.length * 2),
    '',
    `${labels.reference}: ${ticket.reference}`,
    `${labels.subject}: ${ticket.subject}`,
    `${labels.status}: ${ticket.status}`,
    `${labels.opened}: ${at(ticket.createdAt)}`,
    `${labels.exported}: ${at(new Date())}`,
    '',
    labels.note,
    '',
    '-'.repeat(60),
    '',
  ];

  const body = messages
    /* Defence in depth: the caller already excludes internal notes in its
       query, and a transcript is the single worst place for one to slip
       through — it leaves the system as a file. */
    .filter((message) => !message.internal)
    .map((message) =>
      [`[${at(message.createdAt)}] ${speaker(message.author, labels)}:`, message.body, ''].join(
        '\n',
      ),
    );

  return [...header, ...body].join('\n');
}

/**
 * A filename for the download.
 *
 * Built from the reference, which is `CSAS-000123` — ASCII, no spaces, and
 * already safe for a header. Deliberately not built from the subject, which is
 * customer-written text and would need the whole escaping dance for no gain.
 */
export function transcriptFilename(reference: string): string {
  return `${reference}.txt`;
}
