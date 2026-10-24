import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import type { NotificationKind } from '@csas/shared';
import { Notification } from '../../db/models/index.js';
import { maskPhone } from '../../observability/logger.js';

/**
 * WhatsApp and SMS, behind an interface, with a mock as the only
 * implementation in this release.
 *
 * `messaging-lebanon.md` compares Meta Cloud API, Twilio, Bird, Vonage and
 * Infobip for +961 delivery. None of them is wired, for the reason the scope
 * gives: no paid services. What *is* implemented is everything the research
 * says lives in our code rather than the provider's — the destination
 * allow-list, the layered atomic limits, the resend cooldown, bounded
 * attempts, single use, budget caps with a kill switch, and never logging a
 * code. Those are the controls that would still be ours on the day a provider
 * is connected.
 *
 * Delivery is modelled as three distinct facts, as the research insists:
 * **accepted** by the provider, **delivered** to a handset, **verified** by a
 * person. Collapsing them is why "the code never arrived" is such a common
 * support complaint — accepted is not delivered.
 */

export interface OutboundMessage {
  readonly to: string;
  readonly channel: 'whatsapp' | 'sms';
  readonly kind: NotificationKind;
  readonly templateKey: string;
  /** Rendered body. The code is substituted only under DEMO_MODE — see below. */
  readonly body: string;
  readonly idempotencyKey: string;
  readonly customerId?: Types.ObjectId | string;
  readonly staffId?: Types.ObjectId | string;
  readonly ticketId?: Types.ObjectId | string;
}

export interface MessagingProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}

export interface MockMessagingOptions {
  /**
   * When true, the dev inbox shows the full body **including the one-time
   * code**.
   *
   * This is the one place the project deliberately stores a credential, and it
   * is worth being precise about why. The specification asks for a dev inbox
   * "showing every message the system would have sent (OTP codes, …)", because
   * otherwise nobody can try the customer login on a machine with no phone.
   * The containment is the same as the demo TOTP secret: `DEMO_MODE` cannot be
   * enabled when `NODE_ENV=production` — the environment validator refuses it,
   * and there is a test for that. With the flag off, the body is stored with
   * the code replaced by `••••••`.
   */
  readonly revealCodes: boolean;
}

/** Any six-or-more digit run in a message body is treated as the secret. */
const CODE_PATTERN = /\b\d{6,}\b/g;

export function redactCode(body: string): string {
  return body.replace(CODE_PATTERN, '••••••');
}

export class MockMessagingProvider implements MessagingProvider {
  readonly name = 'mock';

  constructor(
    private readonly logger: Logger,
    private readonly options: MockMessagingOptions,
  ) {}

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const providerMessageId = `mock-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    try {
      await Notification.create({
        kind: message.kind,
        channel: message.channel,
        /* Masked at write time. The number lives, encrypted, on the customer
           record; a second plaintext copy here would be a second leak. */
        recipientMasked: maskPhone(message.to),
        templateKey: message.templateKey,
        preview: this.options.revealCodes ? message.body : redactCode(message.body),
        /* A mock cannot know whether a handset received anything, so it claims
           only what a provider's API would: accepted. `delivered` is set by a
           webhook in step 16, and stays unset here. */
        status: 'sent',
        sentAt: new Date(),
        providerMessageId,
        idempotencyKey: message.idempotencyKey,
        ...(message.customerId ? { customerId: message.customerId } : {}),
        ...(message.staffId ? { staffId: message.staffId } : {}),
        ...(message.ticketId ? { ticketId: message.ticketId } : {}),
      });

      /* The log line never carries the body: that is where the code is. */
      this.logger.info(
        { kind: message.kind, channel: message.channel, to: maskPhone(message.to) },
        'message queued to the dev inbox',
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11_000) {
        this.logger.debug({ kind: message.kind }, 'message already sent, skipping duplicate');
        return { providerMessageId };
      }
      throw error;
    }

    return { providerMessageId };
  }
}
