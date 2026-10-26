import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { renderTranscript, transcriptFilename } from './transcript.js';
import type { MessageDocument } from '../repositories/messages.js';
import type { TicketDocument } from '../repositories/tickets.js';

const ticket = {
  _id: new Types.ObjectId(),
  reference: 'CSAS-000123',
  subject: 'Printer stopped after the update',
  status: 'resolved',
  createdAt: new Date('2026-10-24T09:00:00Z'),
} as unknown as TicketDocument;

function message(author: string, body: string, internal = false): MessageDocument {
  return {
    _id: new Types.ObjectId(),
    author,
    body,
    internal,
    createdAt: new Date('2026-10-24T09:05:00Z'),
  } as unknown as MessageDocument;
}

describe('the transcript', () => {
  it('carries the ticket identity and the conversation', () => {
    const text = renderTranscript({
      locale: 'en-LB',
      ticket,
      messages: [
        message('customer', 'the printer stopped'),
        message('agent', 'restart the spooler'),
      ],
    });

    expect(text).toContain('CSAS-000123');
    expect(text).toContain('Printer stopped after the update');
    expect(text).toContain('the printer stopped');
    expect(text).toContain('restart the spooler');
    expect(text).toContain('Customer');
    expect(text).toContain('Support agent');
  });

  /* The single worst place for an internal note to appear: it leaves the
     system as a file the customer keeps. The caller already excludes them in
     its query; this is the second line. */
  it('never includes an internal note, even if handed one', () => {
    const text = renderTranscript({
      locale: 'en-LB',
      ticket,
      messages: [
        message('customer', 'the printer stopped'),
        message('agent', 'known spooler regression, see KB-0412', true),
      ],
    });

    expect(text).not.toContain('KB-0412');
    expect(text).toContain('the printer stopped');
  });

  it('renders in Arabic with Levantine months and Western digits', () => {
    const text = renderTranscript({
      locale: 'ar-LB',
      ticket,
      messages: [message('customer', 'الطابعة توقفت')],
    });

    expect(text).toContain('نسخة من المحادثة');
    expect(text).toContain('رقم الطلب: CSAS-000123');
    expect(text).toContain('تشرين الأول');
    expect(text).toContain('الطابعة توقفت');
    /* The step 09 decision, visible in a file the customer keeps. */
    expect(text).not.toMatch(/[٠-٩]/);
  });

  it('is plain text with no markup at all', () => {
    const text = renderTranscript({
      locale: 'en-LB',
      ticket,
      messages: [message('customer', 'see <b>this</b>')],
    });
    /* Whatever the customer wrote is reproduced verbatim — it is a text
       file, so there is nothing to escape and nothing that executes. */
    expect(text).toContain('see <b>this</b>');
    expect(text).not.toContain('<html');
  });

  it('names the file after the reference, which is already header-safe', () => {
    expect(transcriptFilename('CSAS-000123')).toBe('CSAS-000123.txt');
  });
});
