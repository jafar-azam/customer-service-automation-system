import { arabicFromText } from '../reply-language.js';
import { KbEntry } from '../../db/models/index.js';
import { insertMessage, type MessageDocument } from '../../repositories/messages.js';
import { systemScope, toObjectId } from '../../repositories/scope.js';
import {
  findTicket,
  updateTicketFromStatus,
  type TicketDocument,
} from '../../repositories/tickets.js';
import { record as recordAudit } from '../audit.js';
import { ask, type AskOptions, type AssistantOutcome } from './answer.js';

/**
 * Turning an outcome into a message on the ticket.
 *
 * Separated from `ask` so the decision and its consequences can be tested
 * apart: `ask` is pure enough to drive with fixtures, and this is the part
 * that touches the conversation.
 *
 * Both paths write a message. An escalation that silently changed the status
 * would leave the customer watching a screen where nothing happened — the
 * worst possible reading of "we are getting someone".
 */

export interface RespondResult {
  readonly outcome: AssistantOutcome;
  readonly message: MessageDocument;
  readonly ticket: TicketDocument;
}

/** What the customer sees when the assistant hands over. */
const HANDOVER = {
  ar: 'لم أجد إجابة مؤكدة لهذا في قاعدة المعرفة، لذلك أحلت الطلب إلى أحد المختصين. سيتواصل معك قريبًا.',
  en: 'I could not find a confident answer for this in the knowledge base, so I have passed it to a specialist. Someone will reply shortly.',
} as const;

/**
 * Guesses the reply language from the question.
 *
 * Script, not language, and the rule itself now lives in
 * `services/reply-language.ts` — it was duplicated here and in step 16's
 * resolution messages, and the two copies disagreed on a real ticket.
 */
export function handoverFor(question: string): string {
  return arabicFromText(question) ? HANDOVER.ar : HANDOVER.en;
}

export async function respond(
  ticketId: string,
  question: string,
  options: AskOptions,
): Promise<RespondResult> {
  const scope = systemScope('assistant');
  const ticket = await findTicket(scope, ticketId);

  const outcome = await ask(question, options);
  const now = new Date();

  if (outcome.kind === 'answered') {
    const message = await insertMessage({
      ticketId: ticket._id,
      author: 'assistant',
      kind: 'text',
      body: outcome.text,
      inputForm: ticket.inputForm,
      internal: false,
      citations: outcome.citations.map((citation) => ({
        kbEntryId: toObjectId(citation.kbEntryId),
        /* The version actually used. An entry edited tomorrow must not change
           what the assistant is recorded as having cited today. */
        version: citation.version,
        /* Frozen with the version, so a transcript keeps naming what the
           entry was called when it was cited. */
        title: citation.title,
        score: citation.score,
      })),
      confidence: outcome.confidence,
      modelVersion: outcome.model,
    });

    /* Usage is counted on the entries that were cited, not the ones
       retrieved: "this article answered something" is a different and more
       useful number than "this article came up". */
    await KbEntry.updateMany(
      { _id: { $in: outcome.citations.map((citation) => toObjectId(citation.kbEntryId)) } },
      { $inc: { usageCount: 1 }, $set: { lastUsedAt: now } },
    ).exec();

    const updated = await moveTo(ticket, 'awaiting_customer', now, 'automatic: assistant answered');
    return { outcome, message, ticket: updated ?? ticket };
  }

  const message = await insertMessage({
    ticketId: ticket._id,
    author: 'assistant',
    kind: 'text',
    body: handoverFor(question),
    inputForm: ticket.inputForm,
    internal: false,
    citations: [],
    confidence: outcome.confidence,
  });

  const updated = await moveTo(
    ticket,
    'escalated',
    now,
    `automatic: ${outcome.reason.replace(/_/g, ' ')}`,
  );

  await recordAudit(options.logger, {
    action: 'ticket.escalated',
    actorType: 'system',
    targetType: 'ticket',
    targetId: ticket.reference,
    /* The reason and the scores, never the question or the answer: an audit
       entry is read by people who have no business reading the conversation
       (PRIVACY.md §5). */
    metadata: {
      reason: outcome.reason,
      confidence: Number(outcome.confidence.toFixed(3)),
      consideredEntries: outcome.considered.length,
    },
  });

  return { outcome, message, ticket: updated ?? ticket };
}

async function moveTo(
  ticket: TicketDocument,
  to: 'awaiting_customer' | 'escalated',
  at: Date,
  note: string,
): Promise<TicketDocument | null> {
  /* Guarded by the status it was read in, so an agent who picked the ticket
     up while the model was thinking is not overwritten. A failed guard is
     not an error — it means a human got there first, which is the outcome
     the escalation wanted anyway. */
  return updateTicketFromStatus(systemScope('assistant'), String(ticket._id), [ticket.status], {
    $set: { status: to },
    $push: { statusHistory: { status: to, at, note } },
  });
}
