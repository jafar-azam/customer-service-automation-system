import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context carried implicitly through async calls.
 *
 * Without this, correlating a log line in a repository with the request that
 * caused it means threading a request id through every service and repository
 * signature — which is noise in every function that does not use it, and is
 * quietly dropped the first time someone forgets. `AsyncLocalStorage` is Node's
 * own mechanism for exactly this, and it survives `await`.
 *
 * It holds the request id now; the authenticated actor joins it in step 06, so
 * audit entries can record who without passing the session around either.
 */
export interface RequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
