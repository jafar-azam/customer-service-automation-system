import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from './errors.js';

/**
 * zod validation for every request.
 *
 * Two properties matter more than the convenience:
 *
 * **Unknown fields are rejected, not stripped.** `z.strictObject` refuses a
 * body carrying a field the schema does not name. Stripping would silently
 * discard a client's typo *and* quietly swallow a mass-assignment attempt —
 * `{"email":"…","role":"admin"}` would look like it worked. Rejecting makes
 * both loud, which is the behaviour step 05 chose at the schema layer too.
 *
 * **The parsed value replaces the raw one.** Handlers read `req.body` after
 * this middleware and get the typed, coerced, trimmed result — never the
 * attacker-controlled original. A handler that reaches past this is a bug a
 * reviewer can see.
 */

export interface RequestSchemas {
  readonly body?: ZodType;
  readonly query?: ZodType;
  readonly params?: ZodType;
}

/** Field-level detail, so the client can mark the right input. */
interface FieldProblem {
  readonly path: string;
  readonly code: string;
}

function problems(error: unknown): FieldProblem[] {
  const issues = (error as { issues?: { path: (string | number)[]; code: string }[] }).issues ?? [];
  return issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }));
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return function validateRequest(req: Request, _res: Response, next: NextFunction): void {
    try {
      if (schemas.params) {
        /* Assigning to req.params is intentional: the handler must read the
           validated value, not the raw one. */
        Object.assign(req.params, schemas.params.parse(req.params));
      }
      if (schemas.query) {
        /* Express 5 makes `req.query` a getter, so it cannot be replaced.
           The validated copy is attached instead, and handlers read that. */
        Object.defineProperty(req, 'validatedQuery', {
          value: schemas.query.parse(req.query),
          configurable: true,
          enumerable: false,
        });
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      /* `invalid_request` with field paths — never zod's own message, which
         can echo the submitted value back into a log or a response. */
      next(ApiError.badRequest('Request failed validation', problems(error)));
    }
  };
}

/** Reads the value `validate` attached. Callers narrow it with their schema. */
export function validatedQuery(req: Request): unknown {
  return (req as Request & { validatedQuery?: unknown }).validatedQuery;
}
