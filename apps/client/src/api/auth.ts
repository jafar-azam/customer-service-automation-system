import { api, setAccessToken, type ApiResult } from './client.js';

/**
 * The customer session, as the browser sees it.
 *
 * **The access token is held in memory and never in `localStorage`.** Anything
 * in local storage is readable by any script that reaches this origin, so one
 * XSS becomes a stolen session that outlives the page. In memory it dies with
 * the tab, and the thing that survives a reload is the refresh cookie — which
 * is `httpOnly`, so no script can read it at all.
 *
 * The cost is one extra request on load: `refresh` exchanges the cookie for a
 * new access token. That is the intended shape, and it is why the refresh
 * cookie exists.
 */

export interface Entitlement {
  status: 'active' | 'expired' | 'not_started' | 'none';
  tier?: string;
  endDate?: string;
}

export interface CustomerIdentity {
  id: string;
  name: string;
  companyName?: string;
  preferredLanguage: 'ar' | 'en';
  phoneLast3?: string;
  products: string[];
  entitlement: Entitlement;
}

interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  entitlement?: Entitlement;
}

/**
 * Reads the CSRF cookie.
 *
 * Deliberately *not* `httpOnly` — the client has to echo it in a header, which
 * is the double-submit pattern. It is safe because another origin can cause
 * the cookie to be sent but cannot read it to build the matching header.
 */
export function readCsrfCookie(): string | undefined {
  const match = /(?:^|;\s*)csas_csrf=([^;]+)/.exec(document.cookie);
  return match?.[1];
}

function csrfHeaders(): Record<string, string> {
  const token = readCsrfCookie();
  return token === undefined ? {} : { 'x-csrf-token': token };
}

export const requestCode = (phone: string, channel: 'whatsapp' | 'sms' = 'whatsapp') =>
  api<{ status: string; expiresInSeconds: number }>('/api/auth/customer/request-code', {
    method: 'POST',
    body: { phone, channel },
  });

export async function verifyCode(phone: string, code: string): Promise<ApiResult<SessionTokens>> {
  const result = await api<SessionTokens>('/api/auth/customer/verify', {
    method: 'POST',
    body: { phone, code },
  });
  if (result.ok) setAccessToken(result.data.accessToken);
  return result;
}

/**
 * Restores a session from the refresh cookie.
 *
 * Called once on load. A failure is the normal case for a first visit, so it
 * is a value rather than a thrown error and the caller renders the sign-in
 * screen without treating it as a fault.
 */
export async function restoreSession(): Promise<ApiResult<SessionTokens>> {
  const result = await api<SessionTokens>('/api/auth/customer/refresh', {
    method: 'POST',
    headers: csrfHeaders(),
  });
  if (result.ok) setAccessToken(result.data.accessToken);
  return result;
}

export const getIdentity = (signal?: AbortSignal) =>
  api<CustomerIdentity>('/api/auth/customer/me', { ...(signal ? { signal } : {}) });

export async function signOut(): Promise<void> {
  await api('/api/auth/customer/logout', { method: 'POST', headers: csrfHeaders() });
  /* Cleared whatever the server said. A logout that leaves a usable token in
     memory because the request failed is the one case where the user believes
     they are signed out and is not. */
  setAccessToken(undefined);
}

export interface DevMessage {
  id: string;
  channel: string;
  kind: string;
  to: string | null;
  body: string;
  status: string;
  at: string;
}

/** Only mounted when DEMO_MODE is on; 404 otherwise, which is not an error. */
/**
 * The demo admin's current second factor, when one is configured.
 *
 * Admin 2FA is mandatory, so without this a reviewer with no authenticator
 * seeded cannot open the staff interface at all. Present only under
 * `DEMO_MODE`, which the environment validator refuses in production.
 */
export interface DemoAdminTotp {
  email: string;
  code: string;
  expiresInSeconds: number;
}

export const getDevInbox = () =>
  api<{ messages: DevMessage[]; adminTotp?: DemoAdminTotp }>('/api/dev/inbox');
