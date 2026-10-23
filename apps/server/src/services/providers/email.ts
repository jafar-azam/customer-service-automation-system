import { createHash } from 'node:crypto';
import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import type { NotificationKind } from '@csas/shared';
import { Notification } from '../../db/models/index.js';
import { maskEmail } from '../../observability/logger.js';

/**
 * Email, behind an interface, with a mock as the only implementation.
 *
 * This release sends nothing. Every message is written to the `notifications`
 * collection instead, which **is** the dev inbox the dashboard renders in step
 * 29 — so a reviewer can read the password-reset link a real deployment would
 * have emailed, without an SMTP account, a domain, or a deliverability
 * problem.
 *
 * The interface is the point. A provider swap is one class, and the roadmap
 * (P2) records what a real one needs. Meanwhile every control that lives in
 * *our* code — idempotency, masked recipients, never putting a secret in the
 * stored body — is implemented and tested now rather than postponed.
 */

export interface EmailMessage {
  readonly to: string;
  readonly kind: NotificationKind;
  readonly templateKey: string;
  readonly subject: string;
  /** Rendered body. Must never contain a token, a code or a password. */
  readonly preview: string;
  /**
   * Makes a retry harmless: the same message for the same purpose is written
   * once, however many times the job runs.
   */
  readonly idempotencyKey: string;
  readonly staffId?: Types.ObjectId | string;
  readonly customerId?: Types.ObjectId | string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Writes to the dev inbox.
 *
 * The recipient is **masked at write time**. The address already exists on the
 * staff or customer record; copying it into a second collection with a longer
 * retention would be a second place to leak it, and a second place to have to
 * delete it when someone exercises their rights.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await Notification.create({
        kind: message.kind,
        channel: 'email',
        recipientMasked: maskEmail(message.to),
        templateKey: message.templateKey,
        preview: `${message.subject}\n\n${message.preview}`,
        status: 'sent',
        sentAt: new Date(),
        idempotencyKey: message.idempotencyKey,
        ...(message.staffId ? { staffId: message.staffId } : {}),
        ...(message.customerId ? { customerId: message.customerId } : {}),
      });

      this.logger.info(
        { kind: message.kind, recipientMasked: maskEmail(message.to) },
        'email queued to the dev inbox',
      );
    } catch (error) {
      /* A duplicate idempotency key is the retry working, not a failure. */
      if ((error as { code?: number }).code === 11_000) {
        this.logger.debug({ kind: message.kind }, 'email already sent, skipping duplicate');
        return;
      }
      throw error;
    }
  }
}

/**
 * Builds a stable idempotency key.
 *
 * Hashed so that a key can be derived from an address without storing the
 * address in it — the keys are themselves a collection somebody could read.
 */
export function idempotencyKey(purpose: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('|')).digest('base64url').slice(0, 32);
  return `${purpose}:${digest}`;
}
