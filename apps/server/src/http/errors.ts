import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import type { ErrorTracker } from '../observability/error-tracking.js';
import type { Metrics } from '../observability/metrics.js';
import { matchedRoutePath, routeLabel } from '../observability/metrics.js';
import { getRequestId } from '../observability/request-context.js';

/**
 * One error shape for every endpoint, so that clients never have to guess:
 *
 *   { "error": { "code": "not_found", "message": "...", "requestId": "..." } }
 *
 * `code` is a stable machine-readable string; `message` is for a developer
 * reading logs, not for a customer — user-facing copy is translated on the
 * client from the code. Anything a caller should act on goes in `details`.
 * `requestId` is the thread back to the log line: a customer can quote it, and
 * it is the only detail of an internal failure that ever leaves the process.
 */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
    readonly requestId?: string;
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
    error: {
      code: 'not_found',
      message: 'Resource not found',
      ...withRequestId(),
    },
  };
  res.status(404).json(body);
}

function withRequestId(): { requestId?: string } {
  const requestId = getRequestId();
  return requestId === undefined ? {} : { requestId };
}

export interface ErrorHandlerOptions {
  readonly logger: Logger;
  readonly metrics: Metrics;
  readonly errorTracker: ErrorTracker;
}

/**
 * Terminal error handler.
 *
 * Unknown errors are answered as a bare 500 on purpose: an internal message can
 * carry a stack trace, a file path or a query, and that belongs in the log, not
 * in a response. The request id appears in both, which is what makes the
 * redaction affordable — the caller gets an identifier, the operator gets the
 * detail, and nobody has to choose between a useful error and a safe one.
 */
export function createErrorHandler({ logger, metrics, errorTracker }: ErrorHandlerOptions) {
  return function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (res.headersSent) {
      /* The response is already on the wire; Express's default handler closes
         the connection. Logged because a half-written response is a bug. */
      logger.error({ err: error }, 'error after response started');
      next(error);
      return;
    }

    const apiError = error instanceof ApiError ? error : asBodyParserError(error);
    const route = routeLabel(req.baseUrl, matchedRoutePath(req));

    if (apiError) {
      metrics.errorsTotal.inc({ code: apiError.code });
      /* An expected, handled rejection: `info`, not `error`. Logging a 404 at
         error level is how error-rate alerts become noise that gets muted. */
      logger.info(
        { code: apiError.code, status: apiError.status, route, method: req.method },
        'request rejected',
      );

      const body: ApiErrorBody = {
        error: {
          code: apiError.code,
          message: apiError.message,
          ...(apiError.details === undefined ? {} : { details: apiError.details }),
          ...withRequestId(),
        },
      };
      res.status(apiError.status).json(body);
      return;
    }

    metrics.errorsTotal.inc({ code: 'internal_error' });
    logger.error({ err: error, route, method: req.method }, 'unhandled error');
    errorTracker.capture({
      error,
      ...withRequestId(),
      route,
      method: req.method,
      statusCode: 500,
    });

    const body: ApiErrorBody = {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
        ...withRequestId(),
      },
    };
    res.status(500).json(body);
  };
}
