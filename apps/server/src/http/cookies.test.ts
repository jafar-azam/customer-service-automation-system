import { describe, expect, it } from 'vitest';
import { csrfCookieOptions, refreshCookieOptions } from './cookies.js';

/**
 * What a browser can and cannot do with each cookie.
 *
 * These look like assertions about configuration, and they are — but the
 * configuration is the control. The CSRF cookie was scoped to `/api/auth`,
 * which is invisible to `document.cookie` on a page served from `/`: the
 * client could not read the token, could not build the double-submit header,
 * and `POST /api/auth/refresh` answered 401 to its own client. No session
 * survived a reload, for anybody, from step 08 until it was found by reloading
 * the page in a real browser.
 *
 * Nothing in the suite could see it. `supertest` ignores cookie paths
 * entirely, and even a path-aware HTTP client sends the cookie to
 * `/api/auth/*` correctly — the rule that breaks is `document.cookie`
 * visibility, which is a browser rule rather than an HTTP one.
 */

/**
 * The browser's rule, in one line: a cookie is visible to script on a page
 * only when the page's path is the cookie's path or below it.
 */
function readableAt(cookiePath: string, pagePath: string): boolean {
  if (cookiePath === '/') return true;
  if (pagePath === cookiePath) return true;
  return pagePath.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`);
}

describe('the CSRF cookie', () => {
  const options = csrfCookieOptions(900_000);

  /* The one that matters: the application is served from `/`. */
  it('is readable by the page that has to echo it', () => {
    expect(readableAt(String(options.path), '/')).toBe(true);
  });

  it('is not httpOnly, because the client must read it', () => {
    expect(options.httpOnly).toBe(false);
  });

  /* Reading is what double-submit depends on, and the same-origin policy
     already stops another origin doing it at any path. */
  it('is still same-site and secure', () => {
    expect(options.sameSite).toBe('strict');
    expect(options.secure).toBe(true);
  });
});

describe('the refresh cookie', () => {
  const options = refreshCookieOptions(900_000);

  /* This one keeps its narrow path. No script ever reads it, so restricting
     where it travels costs nothing and reduces exposure. */
  it('stays scoped to the endpoints that consume it', () => {
    expect(options.path).toBe('/api/auth');
  });

  it('is unreadable by script anywhere', () => {
    expect(options.httpOnly).toBe(true);
  });

  it('is sent to the refresh endpoints', () => {
    expect(readableAt(String(options.path), '/api/auth/refresh')).toBe(true);
    expect(readableAt(String(options.path), '/api/auth/customer/refresh')).toBe(true);
  });

  it('is not sent to the rest of the API', () => {
    expect(readableAt(String(options.path), '/api/tickets')).toBe(false);
  });
});
