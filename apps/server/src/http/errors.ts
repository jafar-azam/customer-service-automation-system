import type { NextFunction, Request, Response } from 'express';

/**
 * One error shape for every endpoint, so that clients never have to guess:
 *
 *   { "error": { "code": "not_found", "message": "..." } }
 *
 * `code` is a stable machine-readable string; `message` is for a developer
 * reading logs, not for a customer — user-facing copy is translated on the
 * client from the code. Anything a caller should act on goes in `details`.
 */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'bad_request', message, details);
  }
}

/**
 * Express's body parser signals malformed and oversized payloads by throwing an
 * error carrying a `type`. Without this translation both arrive at the terminal
 * handler as unknown failures and are answered with 500 — which tells the caller
 * the server is broken when in fact their request was, and makes a flood of
 * oversized bodies look like an outage in the error-rate alerts.
 */
const BODY_PARSER_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  'entity.too.large': {
    status: 413,
    code: 'payload_too_large',
    message: 'Request body is larger than the allowed limit',
  },
  'entity.parse.failed': {
    status: 400,
    code: 'invalid_json',
    message: 'Request body is not valid JSON',
  },
  'encoding.unsupported': {
    status: 415,
    code: 'unsupported_encoding',
    message: 'Request body encoding is not supported',
  },
};

function asBodyParserError(error: unknown): ApiError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const type = (error as { type?: unknown }).type;
  if (typeof type !== 'string') return undefined;
  const mapped = BODY_PARSER_ERRORS[type];
  return mapped ? new ApiError(mapped.status, mapped.code, mapped.message) : undefined;
}

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: 'not_found', message: 'Resource not found' },
  };
  res.status(404).json(body);
}

/**
 * Terminal error handler.
 *
 * Unknown errors are reported as a bare 500 on purpose: an internal message can
 * carry a stack trace, a file path or a query, and that belongs in the log, not
 * in a response. Step 03 adds the logging and the request id that ties the two
 * together.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = error instanceof ApiError ? error : asBodyParserError(error);

  if (apiError) {
    const body: ApiErrorBody = {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details === undefined ? {} : { details: apiError.details }),
      },
    };
    res.status(apiError.status).json(body);
    return;
  }

  const body: ApiErrorBody = {
    error: { code: 'internal_error', message: 'Internal server error' },
  };
  res.status(500).json(body);
}
