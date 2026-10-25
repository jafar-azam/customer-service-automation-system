import type { Env } from '@csas/shared';
import { Router, type Request } from 'express';
import multer from 'multer';
import type { Logger } from 'pino';
import { z } from 'zod';
import { requireCustomer, requireStaff } from '../http/authenticate.js';
import { ApiError } from '../http/errors.js';
import { rateLimit } from '../http/rate-limit-middleware.js';
import { validate } from '../http/validate.js';
import { customerScope, staffScope, type Scope } from '../repositories/scope.js';
import {
  listAttachments,
  MAX_UPLOAD_BYTES,
  readAttachment,
  uploadAttachment,
} from '../services/attachments/index.js';
import {
  DOWNLOAD_TTL_SECONDS,
  issueDownloadToken,
  verifyDownload,
} from '../services/attachments/signed-url.js';
import type { FileScanner } from '../services/providers/virus-scan.js';
import type { StorageProvider } from '../services/providers/storage.js';

/**
 * Uploading and downloading files.
 *
 * Mounted twice with a different guard, exactly like the ticket router, and
 * for the same reason: one implementation, one place to fix a filter.
 */

const UPLOAD_LIMIT = { name: 'attachment:upload', limit: 30, windowSeconds: 3_600 };
const DOWNLOAD_LIMIT = { name: 'attachment:download', limit: 300, windowSeconds: 3_600 };

/**
 * In memory, never to a temporary file.
 *
 * The bytes have to be identified, re-encoded and scanned before anything is
 * written, and a disk-backed temporary file would put unscanned, unidentified
 * content on a filesystem — the exact thing the storage design avoids. At
 * 10 MB and one file per request the memory cost is bounded and small.
 *
 * `limits` is enforced by multer while reading the stream, so an oversized
 * body is cut off rather than buffered in full and measured afterwards.
 * nginx's `client_max_body_size` is set higher (12m) deliberately: the app
 * should be what refuses a too-large file, with a JSON error a client can
 * read, rather than nginx returning an opaque HTML 413.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, parts: 4 },
});

const idSchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) });
const downloadQuery = z.strictObject({ token: z.string().min(16).max(256) });

function scopeFor(req: Request, audience: 'customer' | 'staff'): Scope {
  if (audience === 'customer') {
    if (!req.customerActor)
      throw new ApiError(401, 'unauthenticated', 'Authentication is required');
    return customerScope(req.customerActor.customerId);
  }
  if (!req.actor) throw new ApiError(401, 'unauthenticated', 'Authentication is required');
  return staffScope(req.actor.staffId, req.actor.role);
}

/** The identity a download token is bound to, so one cannot replay another's. */
function subjectFor(scope: Scope): string {
  switch (scope.kind) {
    case 'customer':
      return `c:${scope.customerId}`;
    case 'staff':
      return `s:${scope.staffId}`;
    case 'system':
      /* No route here builds a system scope, and a token bound to "the
         system" would be a token any background job could mint. Refusing is
         the behaviour that stays correct if one ever does. */
      throw new ApiError(500, 'internal_error', 'Not available');
  }
}

function paramId(req: Request): string {
  const value = req.params['id'];
  if (typeof value !== 'string') throw new ApiError(404, 'not_found', 'Not found');
  return value;
}

export interface AttachmentRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly storage: StorageProvider;
  readonly scanner: FileScanner;
  readonly audience: 'customer' | 'staff';
}

export function attachmentRouter({
  env,
  logger,
  storage,
  scanner,
  audience,
}: AttachmentRouterOptions): Router {
  const router = Router();

  /* The guard is attached to each route rather than with `router.use`.
     This router is mounted at `/api`, and a `router.use` guard there runs for
     every request under that prefix — including paths this router does not
     define. The first version did exactly that, and every unknown `/api/*`
     path started answering 401 instead of 404, which both leaks that
     authentication exists and breaks the proxy's 404 for `/metrics`. Caught
     by the app and observability suites, not by anything in this file. */
  const guard = audience === 'customer' ? requireCustomer({ env }) : requireStaff({ env });

  router.get(
    '/tickets/:id/attachments',
    guard,
    validate({ params: idSchema }),
    (req, res, next) => {
      listAttachments(scopeFor(req, audience), paramId(req))
        .then((attachments) => {
          res.json({ attachments });
        })
        .catch(next);
    },
  );

  router.post(
    '/tickets/:id/attachments',
    guard,
    rateLimit(UPLOAD_LIMIT),
    validate({ params: idSchema }),
    upload.single('file'),
    (req, res, next) => {
      const file = req.file;
      if (!file) {
        next(new ApiError(400, 'no_file', 'No file was sent'));
        return;
      }

      uploadAttachment(
        scopeFor(req, audience),
        paramId(req),
        {
          bytes: file.buffer,
          /* multer decodes the filename from the multipart headers; it is
             data from the client and is treated as such everywhere. */
          originalFilename: file.originalname,
        },
        { storage, scanner, logger, env },
      )
        .then((attachment) => {
          res.status(201).json({ attachment });
        })
        .catch(next);
    },
  );

  /**
   * Issues a short-lived download URL.
   *
   * Separate from the download itself so the expensive part — the ownership
   * check — happens once, while the browser can then fetch the bytes with a
   * plain GET it can put in an `<img src>` or a link.
   */
  router.post(
    '/attachments/:id/download-url',
    guard,
    rateLimit(DOWNLOAD_LIMIT),
    validate({ params: idSchema }),
    (req, res, next) => {
      const scope = scopeFor(req, audience);
      const id = paramId(req);

      /* Resolved first: a token must never be issued for something the caller
         cannot read, even though the download re-checks. */
      readAttachment(scope, id, storage, logger)
        .then(() => {
          const { token, expiresAt } = issueDownloadToken(
            id,
            subjectFor(scope),
            env.ACCESS_TOKEN_SECRET,
          );
          const prefix = audience === 'customer' ? '/api/customer' : '/api';
          res.json({
            url: `${prefix}/attachments/${id}/download?token=${token}`,
            expiresAt,
            expiresInSeconds: DOWNLOAD_TTL_SECONDS,
          });
        })
        .catch(next);
    },
  );

  router.get(
    '/attachments/:id/download',
    guard,
    rateLimit(DOWNLOAD_LIMIT),
    validate({ params: idSchema, query: downloadQuery }),
    (req, res, next) => {
      const scope = scopeFor(req, audience);
      const id = paramId(req);
      const token = (req.query['token'] as string | undefined) ?? '';

      const verdict = verifyDownload(token, id, subjectFor(scope), env.ACCESS_TOKEN_SECRET);
      if (verdict !== 'valid') {
        next(
          new ApiError(
            403,
            verdict === 'expired' ? 'link_expired' : 'invalid_link',
            verdict === 'expired'
              ? 'That download link has expired'
              : 'That download link is not valid',
          ),
        );
        return;
      }

      /* The signature is checked, and the ownership check runs anyway. A
         signature proves the link was issued; it does not prove the session
         presenting it is still entitled to the file. */
      readAttachment(scope, id, storage, logger)
        .then((file) => {
          /* `nosniff` so a browser cannot decide a text/plain file is really
             HTML and render it. `attachment` so nothing is displayed inline in
             this origin at all — the single most effective control against a
             stored-XSS payload in an uploaded file.

             `filename*` is the RFC 5987 form, so a non-Latin name survives.
             The plain `filename` stays ASCII for old clients. */
          res.setHeader('content-type', file.mimeType);
          res.setHeader('x-content-type-options', 'nosniff');
          res.setHeader('content-security-policy', "default-src 'none'; sandbox");
          res.setHeader('cache-control', 'private, no-store');
          res.setHeader(
            'content-disposition',
            `attachment; filename="${file.filename.replace(/[^\x20-\x7e]/g, '_')}"; ` +
              `filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          );
          res.send(file.bytes);
        })
        .catch(next);
    },
  );

  return router;
}
