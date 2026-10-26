import { api, setAccessToken, type ApiResult } from './client.js';
import { readCsrfCookie } from './auth.js';

/**
 * The staff session.
 *
 * Separate from `auth.ts` because the two sign-ins are genuinely different
 * flows against different endpoints — a customer proves a phone number with a
 * one-time code, a member of staff proves a password and, for an admin, a
 * second factor. Sharing one module would mean a union of two shapes with a
 * discriminator threaded through every call.
 *
 * What they *do* share is the access token slot in `client.ts`, because a
 * browser tab is one person: you are signed in as a customer or as staff, and
 * holding both at once would be a way to act as one while authenticated as the
 * other.
 */

export type StaffRole = 'agent' | 'admin';

export interface StaffIdentity {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  mustChangePassword: boolean;
  totpEnrolled: boolean;
}

interface StaffTokens {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
}

function csrfHeaders(): Record<string, string> {
  const token = readCsrfCookie();
  return token === undefined ? {} : { 'x-csrf-token': token };
}

/**
 * Signs in.
 *
 * `totp` is sent only when the operator has typed one. The server answers
 * `totp_required` when it needs one, which is what moves the screen to the
 * second step — the client does not decide in advance whether a second factor
 * applies, because that depends on the account and an admin who has not
 * enrolled is refused outright rather than waved through.
 */
export async function staffLogin(
  email: string,
  password: string,
  totp?: string,
): Promise<ApiResult<StaffTokens>> {
  const result = await api<StaffTokens>('/api/auth/login', {
    method: 'POST',
    body: totp === undefined || totp === '' ? { email, password } : { email, password, totp },
  });
  if (result.ok) setAccessToken(result.data.accessToken);
  return result;
}

/** Exchanges the refresh cookie for an access token. See `auth.ts` for why. */
export async function restoreStaffSession(): Promise<ApiResult<StaffTokens>> {
  const result = await api<StaffTokens>('/api/auth/refresh', {
    method: 'POST',
    headers: csrfHeaders(),
  });
  if (result.ok) setAccessToken(result.data.accessToken);
  return result;
}

export const getStaffIdentity = (signal?: AbortSignal) =>
  api<StaffIdentity>('/api/auth/me', { ...(signal ? { signal } : {}) });

export async function staffSignOut(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST', headers: csrfHeaders() });
  /* Cleared whatever the server said, for the same reason as the customer
     logout: a failed request must not leave a usable token in memory while the
     operator believes they are signed out. */
  setAccessToken(undefined);
}
