import { createHmac, timingSafeEqual } from 'node:crypto';
import { DELIVERY_STATUSES, type DeliveryStatus, type Env } from '@csas/shared';
import express, { Router } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { Notification } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { rateLimit } from '../http/rate-limit-middleware.js';

/**
 * Delivery callbacks from the messaging provider.
 *
 * A webhook is the one endpoint an attacker can reach without an account, so
 * the three properties below are the whole design.
 *
 * **Signed, and verified against the raw bytes.** A signature covers exactly
 * the bytes that were sent. Verifying against a re-serialised body compares a
 * signature to something the sender never signed — key order, whitespace and
 * number formatting all change under `JSON.parse` + `JSON.stringify`, so the
 * check fails for honest callers and, worse, invites someone to "fix" it by
 * weakening it.
 *
 * **Idempotent.** Providers retry on any non-2xx and sometimes on a slow 2xx.
 * The same delivery report arriving three times must move the record forward
 * once, so every write is a conditional update rather than a blind one.
 *
 * **Fast and uninformative.** It answers 202 for anything it accepts and 401
 * for anything unsigned, and does no work that could make it a useful
 * amplifier. An unknown message id is 202, not 404 — a webhook that confirms
 * which ids exist is an enumeration oracle.
 */

/**
 * What a provider may report, which is not the same as what a notification may
 * be.
 *
 * `queued` is ours — it means we created the row and have not handed it over
 * yet — and `suppressed` is ours too: a decision not to send, taken on the
 * customer's notification preferences. Neither is something a provider can
 * tell us, so neither is accepted here.
 *
 * Keeping this list separate from the shared `DELIVERY_STATUSES` is the point.
 * The first version of this file declared a local four-element
 * `DELIVERY_STATUSES` that shadowed the shared one and then used it for *both*
 * jobs — the statuses a report may carry and the statuses a report may
 * overwrite. Since `queued` was absent from it, the `$in` guard below could
 * never match a notification in its default state, so the very first delivery
 * report for every message was accepted with a 202 and silently dropped.
 */
const REPORTABLE = ['sent', 'delivered', 'read', 'failed'] as const;

const bodySchema = z.strictObject({
  providerMessageId: z.string().min(1).max(128),
  status: z.enum(REPORTABLE),
  /* Provider-supplied, so bounded and never interpolated anywhere. */
  errorCode: z.string().max(64).optional(),
  timestamp: z.coerce.date().optional(),
});

export const SIGNATURE_HEADER = 'x-csas-signature';

/**
 * A ceiling, keyed on the calling address.
 *
 * This is the only route in the system reachable with no account, so it is the
 * only one where the rate limiter's IP fallback is the primary key rather than
 * a fallback. Set high: a provider dispatching a backlog after an outage is a
 * legitimate burst, and dropping real delivery reports to slow down a forger is
 * the wrong trade — the signature check is what rejects the forger, and this
 * only stops it being used to generate load.
 */
export const WEBHOOK_LIMIT = {
  name: 'webhook:messaging',
  limit: 600,
  windowSeconds: 60,
} as const;

/**
 * Verifies the signature over the raw request body.
 *
 * Constant-time, and length-checked first because `timingSafeEqual` throws on
 * a length mismatch rather than returning false — an exception that would
 * surface as a 500 and tell the sender their forgery was the wrong *shape*.
 */
export function verifySignature(raw: Buffer, presented: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(presented.replace(/^sha256=/, ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a status may follow the one already recorded.
 *
 * Delivery reports arrive out of order — `read` before `delivered` is routine
 * on a slow network. Without this, a late `sent` would overwrite a `read` and
 * the log would show a message going backwards.
 */
/**
 * How far along each status is.
 *
 * `queued` is 0 — the starting point every notification is created at, and the
 * one a first report must be able to move. `failed` shares rank 3 with `read`
 * so that neither replaces the other: both are endings, and which one arrived
 * first is the truth.
 *
 * `suppressed` is 4, above everything, which makes it immune: we decided not to
 * send this message, and no provider callback may rewrite that into a delivery.
 */
const RANK: Readonly<Record<string, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 3,
  suppressed: 4,
};

export function isProgress(from: string | undefined, to: string): boolean {
  /* An unrecognised `from` ranks above everything, so nothing overwrites it.
     A status this build does not know about was written by a version that did,
     and guessing it is early — `-1` was the first attempt and it ranked an
     unknown status *below* `queued`, making it the easiest thing in the system
     to overwrite, which is backwards. `undefined` is different: that is a row
     with no status at all, which is a row at the beginning. */
  const before = from === undefined ? 0 : (RANK[from] ?? Number.POSITIVE_INFINITY);
  return (RANK[to] ?? 0) > before;
}

/**
 * The statuses a report may legitimately overwrite.
 *
 * Turned into an `$in` clause so the whole decision is one atomic update. The
 * first version wrote unconditionally and then put the old value back if the
 * report turned out to be stale — which is racy: a newer report arriving
 * between the two writes would be undone by the restore.
 */
export function overwritable(to: string): DeliveryStatus[] {
  /* Over the **shared** list — every state a notification can actually be in,
     `queued` included — not over the four a provider can report. */
  return DELIVERY_STATUSES.filter((status) => isProgress(status, to));
}

export interface WebhookRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
}

export function webhookRouter({ env, logger }: WebhookRouterOptions): Router {
  const router = Router();

  router.post(
    '/messaging',
    /* The raw body, not the parsed one — see the note above. Mounted on this
       route only, so the rest of the API keeps its JSON parser. */
    express.raw({ type: 'application/json', limit: '64kb' }),
    /* After the parser so a body over the limit is rejected on size before it
       costs a Redis round trip, and before the signature check so an unsigned
       flood is bounded too. */
    rateLimit(WEBHOOK_LIMIT),
    (req, res, next) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const presented = req.header(SIGNATURE_HEADER);

      if (presented === undefined || !verifySignature(raw, presented, env.ACCESS_TOKEN_SECRET)) {
        /* Logged at warn with no body: an unsigned call is either a
           misconfiguration or a probe, and both are worth seeing. */
        logger.warn({ hasSignature: presented !== undefined }, 'webhook signature rejected');
        next(new ApiError(401, 'unauthenticated', 'Invalid signature'));
        return;
      }

      let parsed;
      try {
        parsed = bodySchema.parse(JSON.parse(raw.toString('utf8')));
      } catch {
        next(new ApiError(400, 'invalid_request', 'Unrecognised payload'));
        return;
      }

      const at = parsed.timestamp ?? new Date();

      /* The ordering guard is part of the filter, so a redelivered or
         out-of-order report simply matches nothing. One atomic update, no
         read-then-write and no window for a concurrent report to be lost. */
      Notification.findOneAndUpdate(
        {
          providerMessageId: parsed.providerMessageId,
          status: { $in: overwritable(parsed.status) },
        },
        {
          $set: {
            status: parsed.status,
            ...(parsed.status === 'delivered' ? { deliveredAt: at } : {}),
            /* `sentAt` on the first hop, for the same reason: the gap between
               accepted-by-provider and delivered-to-handset is the number a
               support complaint about a missing code turns on. */
            ...(parsed.status === 'sent' ? { sentAt: at } : {}),
            /* `error`, the schema's field name. Written as `errorCode` this
               went nowhere: Mongoose is `strict` by default and drops an
               unknown path from an update without complaining, so the provider's
               reason for a failure was discarded on every failed send — and
               `tsc` could not see it, because an update object is not typed
               against the schema. */
            ...(parsed.errorCode === undefined ? {} : { error: parsed.errorCode }),
          },
        },
      )
        .exec()
        .then((matched) => {
          logger.debug(
            { status: parsed.status, applied: matched !== null },
            'delivery report received',
          );
          /* 202 whatever happened, including for an id we have never seen and
             for a stale report. A webhook that answers 404 for an unknown id
             tells a caller which ids exist. */
          res.status(202).json({ received: true });
        })
        .catch(next);
    },
  );

  return router;
}
