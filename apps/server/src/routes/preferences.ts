import type { Env } from '@csas/shared';
import { Router } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { Customer } from '../db/models/index.js';
import { requireCustomer } from '../http/authenticate.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { toObjectId } from '../repositories/scope.js';
import { record as recordAudit } from '../services/audit.js';

/**
 * What a customer has asked to receive, and in which language.
 *
 * Customer-only. An agent changing someone's contact preferences on their
 * behalf is exactly the action a consent record is supposed to make
 * impossible to do quietly — and there is no support case for it that a
 * phone call does not solve better.
 */

const updateSchema = z
  .strictObject({
    whatsapp: z.boolean().optional(),
    email: z.boolean().optional(),
    marketingOptOut: z.boolean().optional(),
    preferredLanguage: z.enum(['ar', 'en']).optional(),
  })
  /* An empty body would be a successful request that changed nothing, which
     reads to a client as "saved". */
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to change' });

export interface PreferencesRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
}

interface PreferencesRow {
  notificationPreferences: { whatsapp: boolean; email: boolean; marketingOptOut: boolean };
  preferredLanguage: 'ar' | 'en';
  email?: string;
}

function present(row: PreferencesRow): Record<string, unknown> {
  return {
    whatsapp: row.notificationPreferences.whatsapp,
    email: row.notificationPreferences.email,
    marketingOptOut: row.notificationPreferences.marketingOptOut,
    preferredLanguage: row.preferredLanguage,
    /* Whether email is even selectable. Turning on a channel there is no
       address for would be a setting that silently does nothing. */
    emailAvailable: typeof row.email === 'string' && row.email !== '',
  };
}

export function preferencesRouter({ env, logger }: PreferencesRouterOptions): Router {
  const router = Router();
  const guard = requireCustomer({ env });

  router.get('/', guard, (req, res, next) => {
    const id = toObjectId(req.customerActor?.customerId ?? '');
    Customer.findById(id)
      .select('notificationPreferences preferredLanguage email')
      .lean<PreferencesRow>()
      .exec()
      .then((row) => {
        if (!row) throw new ApiError(404, 'not_found', 'Not found');
        res.json({ preferences: present(row) });
      })
      .catch(next);
  });

  router.patch('/', guard, validate({ body: updateSchema }), (req, res, next) => {
    const id = toObjectId(req.customerActor?.customerId ?? '');
    const body = req.body as z.infer<typeof updateSchema>;

    /* Built key by key rather than spread: `strictObject` already refuses an
       unknown field, and naming each one here means a future schema addition
       cannot become a writable field by accident. */
    const set: Record<string, unknown> = {};
    if (body.whatsapp !== undefined) set['notificationPreferences.whatsapp'] = body.whatsapp;
    if (body.email !== undefined) set['notificationPreferences.email'] = body.email;
    if (body.marketingOptOut !== undefined) {
      set['notificationPreferences.marketingOptOut'] = body.marketingOptOut;
    }
    if (body.preferredLanguage !== undefined) set['preferredLanguage'] = body.preferredLanguage;

    Customer.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after', runValidators: true })
      .select('notificationPreferences preferredLanguage email')
      .lean<PreferencesRow>()
      .exec()
      .then(async (row) => {
        if (!row) throw new ApiError(404, 'not_found', 'Not found');

        /* Audited because consent is the thing a regulator asks about: who
           turned marketing off, and when. The values are the record — there
           is nothing personal in a pair of booleans. */
        await recordAudit(logger, {
          action: body.marketingOptOut === undefined ? 'customer.updated' : 'consent.withdrawn',
          actorType: 'customer',
          actorCustomerId: req.customerActor?.customerId,
          targetType: 'customer',
          metadata: { ...body },
        });

        res.json({ preferences: present(row) });
      })
      .catch(next);
  });

  return router;
}
