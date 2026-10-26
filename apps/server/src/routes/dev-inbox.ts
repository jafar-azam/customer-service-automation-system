import type { Env } from '@csas/shared';
import { Router } from 'express';
import { Notification } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';

/**
 * Every message the system would have sent, for someone with no phone.
 *
 * Section 0 of the specification: WhatsApp and SMS are mocked, and a "dev
 * inbox" shows what would have gone out — OTP codes, escalation alerts,
 * reminders. Without it a reviewer cannot sign in at all, because the one-time
 * code is deliberately never logged and never returned by the API.
 *
 * **Three guards, because this hands out one-time codes.**
 *
 * 1. `DEMO_MODE` must be on, and the environment validator refuses
 *    `DEMO_MODE` when `NODE_ENV=production` — so this cannot exist in a
 *    production process even by misconfiguration.
 * 2. The router is not mounted at all unless the flag is set, so the path
 *    404s rather than 403s when it is off. An endpoint that answers
 *    "forbidden" tells you it exists.
 * 3. It is read-only and returns the most recent few, never a searchable
 *    history.
 *
 * The alternative — returning the code in the `request-code` response under
 * `DEMO_MODE` — was rejected. It would make the response for a known number
 * differ from an unknown one, which is exactly the anti-enumeration property
 * step 08 built and tested.
 */

interface InboxRow {
  _id: unknown;
  channel: string;
  kind: string;
  recipientMasked?: string;
  preview?: string;
  status: string;
  createdAt: Date;
}

export function devInboxRouter({ env }: { readonly env: Env }): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    /* Checked again at request time, not only at mount: a flag read once at
       startup is a flag someone eventually moves. */
    if (!env.DEMO_MODE) {
      next(new ApiError(404, 'not_found', 'Not found'));
      return;
    }

    Notification.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .select('channel kind recipientMasked preview status createdAt')
      .lean<InboxRow[]>()
      .exec()
      .then((rows) => {
        res.setHeader('cache-control', 'no-store');
        res.json({
          demo: true,
          messages: rows.map((row) => ({
            id: String(row._id),
            channel: row.channel,
            kind: row.kind,
            /* Already masked when it was written — the inbox shows what would
               have been sent, not who it would have reached. */
            to: row.recipientMasked ?? null,
            body: row.preview ?? '',
            status: row.status,
            at: row.createdAt,
          })),
        });
      })
      .catch(next);
  });

  return router;
}
