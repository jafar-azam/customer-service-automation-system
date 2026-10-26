import type { Env } from '@csas/shared';
import { KB_STATUSES } from '@csas/shared';
import express, { Router, type Request } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { requireRole, requireStaff } from '../http/authenticate.js';
import { ApiError } from '../http/errors.js';
import { rateLimit } from '../http/rate-limit-middleware.js';
import { validate, validatedQuery } from '../http/validate.js';
import { countEntries, findEntry, listEntries } from '../repositories/knowledge.js';
import { staffScope, type Scope } from '../repositories/scope.js';
import {
  approveEntry,
  archiveEntry,
  createEntry,
  rejectEntry,
  restoreEntry,
  submitForReview,
  updateEntry,
} from '../services/knowledge.js';
import { exportCsv, importCsv } from '../services/knowledge-csv.js';
import type { EmbeddingsProvider } from '../services/providers/embeddings.js';
import { backfillEmbeddings } from '../services/rag/embed-entries.js';
import type { KnowledgeIndex } from '../services/rag/retrieve.js';

/**
 * Knowledge management, for staff.
 *
 * There is no customer-facing route here, deliberately. A customer reaches
 * knowledge only through an answer the assistant grounded in it, with the
 * citation naming the entry — never by browsing, and never by searching.
 * Letting a customer query the knowledge base directly turns every draft and
 * every internal note in it into a disclosure, and makes the approval gate
 * decorative.
 */

const KB_LIMITS = {
  read: { name: 'kb:read', limit: 300, windowSeconds: 60 },
  write: { name: 'kb:write', limit: 120, windowSeconds: 60 },
  /* An import reads and writes up to a thousand documents, and an export
     serialises every body it returns. Both are far heavier than an ordinary
     write and neither is something a person does repeatedly. */
  bulk: { name: 'kb:bulk', limit: 10, windowSeconds: 300 },
} as const;

const idSchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) });

const entrySchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  question: z.string().trim().max(2000).optional(),
  language: z.enum(['ar', 'en']),
  category: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  changeNote: z.string().trim().max(500).optional(),
});

const listSchema = z.strictObject({
  status: z
    .union([z.enum(KB_STATUSES), z.array(z.enum(KB_STATUSES))])
    .optional()
    .transform((value) => (value === undefined ? undefined : [value].flat())),
  language: z.enum(['ar', 'en']).optional(),
  /* Bounded, and handed to `$text` rather than to a regular expression. */
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).max(10_000).optional(),
});

const exportSchema = z.strictObject({
  status: z
    .union([z.enum(KB_STATUSES), z.array(z.enum(KB_STATUSES))])
    .optional()
    .transform((value) => (value === undefined ? undefined : [value].flat())),
  language: z.enum(['ar', 'en']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const noteSchema = z.strictObject({ note: z.string().trim().max(2000).optional() });
const rejectSchema = z.strictObject({ note: z.string().trim().min(1).max(2000) });

export interface KnowledgeRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly index: KnowledgeIndex;
  readonly embeddings: EmbeddingsProvider;
}

function scopeFor(req: Request): Scope {
  if (!req.actor) throw new ApiError(401, 'unauthenticated', 'Authentication is required');
  return staffScope(req.actor.staffId, req.actor.role);
}

/** Everything a caller is allowed to see about an entry. */
function present(entry: Awaited<ReturnType<typeof findEntry>>) {
  return {
    id: String(entry._id),
    title: entry.title,
    body: entry.body,
    question: entry.question ?? null,
    language: entry.language,
    category: entry.category ?? null,
    tags: entry.tags,
    status: entry.status,
    version: entry.version,
    reviewNote: entry.reviewNote ?? null,
    approvedAt: entry.approvedAt?.toISOString() ?? null,
    source: entry.provenance.source,
    publishable: entry.provenance.publishable,
    usageCount: entry.usageCount,
    unhelpfulCount: entry.unhelpfulCount,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function knowledgeRouter({
  env,
  logger,
  index,
  embeddings,
}: KnowledgeRouterOptions): Router {
  const router = Router();

  router.use(requireStaff({ env }));

  /**
   * Makes an approval take effect.
   *
   * Approving an entry and stopping there produces something approved and
   * unfindable — exactly the state step 15 shipped in, with 618 approved
   * entries and no vectors. The embedding and the index invalidation are part
   * of the transition, not a separate chore somebody remembers.
   *
   * Failures are logged and swallowed on purpose: the approval itself is
   * committed and correct, and throwing here would report a successful
   * approval as a 500 and invite the admin to click approve again. The
   * entry is picked up by the next backfill either way.
   */
  async function publish(id: string): Promise<void> {
    try {
      const result = await backfillEmbeddings(embeddings, logger, 50);
      index.invalidate();
      logger.info({ id, embedded: result.embedded }, 'knowledge published to retrieval');
    } catch (error) {
      logger.error({ err: error, id }, 'approval committed but embedding failed');
    }
  }

  router.get('/', rateLimit(KB_LIMITS.read), validate({ query: listSchema }), (req, res, next) => {
    const scope = scopeFor(req);
    const query = validatedQuery(req) as z.infer<typeof listSchema>;
    const options = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.language === undefined ? {} : { language: query.language }),
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.skip === undefined ? {} : { skip: query.skip }),
    };
    Promise.all([listEntries(scope, options), countEntries(scope, options)])
      .then(([entries, total]) => {
        res.json({ entries: entries.map(present), total, limit: query.limit ?? 50 });
      })
      .catch(next);
  });

  /* The queue, as its own route rather than a filter, because it is the screen
     step 29 builds and the thing an admin opens every morning. */
  router.get('/queue', rateLimit(KB_LIMITS.read), (req, res, next) => {
    const scope = scopeFor(req);
    const options = { status: ['pending_review'] as const, limit: 200 };
    Promise.all([listEntries(scope, options), countEntries(scope, options)])
      .then(([entries, total]) => {
        res.json({ entries: entries.map(present), total, limit: 200 });
      })
      .catch(next);
  });

  /* ── CSV ──────────────────────────────────────────────────────────────── */

  router.get(
    '/export.csv',
    rateLimit(KB_LIMITS.bulk),
    validate({ query: exportSchema }),
    (req, res, next) => {
      const scope = scopeFor(req);
      const query = validatedQuery(req) as z.infer<typeof exportSchema>;
      exportCsv(
        scope,
        {
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.language === undefined ? {} : { language: query.language }),
          ...(query.limit === undefined ? {} : { limit: query.limit }),
        },
        logger,
      )
        .then((csv) => {
          res.setHeader('content-type', 'text/csv; charset=utf-8');
          /* An attachment, never inline: a CSV rendered in the browser is a
             document in this origin, and `nosniff` is what stops the type
             being reconsidered on the way. */
          res.setHeader('content-disposition', 'attachment; filename="knowledge.csv"');
          res.setHeader('x-content-type-options', 'nosniff');
          res.send(csv);
        })
        .catch(next);
    },
  );

  router.post(
    '/import.csv',
    rateLimit(KB_LIMITS.bulk),
    /* Text, not multipart: this is one file of bounded size and adding an
       upload pipeline for it would mean a second path into storage that the
       step 12 scanner does not cover. */
    express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
    (req, res, next) => {
      const scope = scopeFor(req);
      const body: unknown = req.body;
      if (typeof body !== 'string' || body.trim() === '') {
        next(new ApiError(400, 'empty_body', 'Send the CSV as the request body'));
        return;
      }
      importCsv(scope, body, logger)
        .then((report) => {
          /* 200 even when rows were rejected: the import ran and the report is
             the result. A 400 here would suggest nothing was written, and
             something was. */
          res.json(report);
        })
        .catch(next);
    },
  );

  /* ── One entry ────────────────────────────────────────────────────────── */

  router.get(
    '/:id',
    rateLimit(KB_LIMITS.read),
    validate({ params: idSchema }),
    (req, res, next) => {
      findEntry(scopeFor(req), String(req.params['id']))
        .then((entry) => {
          res.json({
            entry: present(entry),
            /* The frozen copies, newest first. What a citation from three months
             ago actually said. */
            versions: entry.versions
              .map((version) => ({
                version: version.version,
                title: version.title,
                body: version.body,
                status: version.status,
                editedAt: version.editedAt.toISOString(),
                changeNote: version.changeNote ?? null,
              }))
              .reverse(),
          });
        })
        .catch(next);
    },
  );

  router.post(
    '/',
    rateLimit(KB_LIMITS.write),
    validate({ body: entrySchema }),
    (req, res, next) => {
      createEntry(scopeFor(req), req.body as z.infer<typeof entrySchema>, logger)
        .then((entry) => {
          res.status(201).json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  router.put(
    '/:id',
    rateLimit(KB_LIMITS.write),
    validate({ params: idSchema, body: entrySchema }),
    (req, res, next) => {
      const id = String(req.params['id']);
      updateEntry(scopeFor(req), id, req.body as z.infer<typeof entrySchema>, logger)
        .then((entry) => {
          /* An edit to an approved entry demotes it, so retrieval must stop
             returning the old text immediately. */
          index.invalidate();
          res.json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  router.post(
    '/:id/submit',
    rateLimit(KB_LIMITS.write),
    validate({ params: idSchema }),
    (req, res, next) => {
      submitForReview(scopeFor(req), String(req.params['id']), logger)
        .then((entry) => {
          res.json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  /* ── The gate: admin only ─────────────────────────────────────────────── */

  router.post(
    '/:id/approve',
    requireRole('admin'),
    rateLimit(KB_LIMITS.write),
    validate({ params: idSchema, body: noteSchema }),
    (req, res, next) => {
      const id = String(req.params['id']);
      const body = req.body as z.infer<typeof noteSchema>;
      approveEntry(scopeFor(req), id, body.note, logger)
        .then(async (entry) => {
          await publish(id);
          res.json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  router.post(
    '/:id/reject',
    requireRole('admin'),
    rateLimit(KB_LIMITS.write),
    validate({ params: idSchema, body: rejectSchema }),
    (req, res, next) => {
      const body = req.body as z.infer<typeof rejectSchema>;
      rejectEntry(scopeFor(req), String(req.params['id']), body.note, logger)
        .then((entry) => {
          res.json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  router.post(
    '/:id/archive',
    requireRole('admin'),
    rateLimit(KB_LIMITS.write),
    validate({ params: idSchema }),
    (req, res, next) => {
      archiveEntry(scopeFor(req), String(req.params['id']), logger)
        .then((entry) => {
          /* Out of retrieval now, not at the next cache expiry. */
          index.invalidate();
          res.json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  router.post(
    '/:id/restore',
    requireRole('admin'),
    rateLimit(KB_LIMITS.write),
    validate({ params: idSchema }),
    (req, res, next) => {
      restoreEntry(scopeFor(req), String(req.params['id']), logger)
        .then((entry) => {
          res.json({ entry: present(entry) });
        })
        .catch(next);
    },
  );

  return router;
}
