import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import {
  getIdentity,
  restoreSession,
  signOut as apiSignOut,
  type CustomerIdentity,
} from './api/auth.js';
import {
  getStaffIdentity,
  restoreStaffSession,
  staffSignOut,
  type StaffIdentity,
} from './api/staff-auth.js';

/**
 * Who is signed in.
 *
 * Three states, not two. "We do not know yet" is a real state — the refresh
 * request on load takes a moment, and rendering the sign-in screen during it
 * would flash a login form at someone who is already signed in, every single
 * reload.
 */

export type SessionState =
  | { readonly status: 'restoring' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'signedIn'; readonly customer: CustomerIdentity }
  /**
   * Staff, as a separate state rather than a role on the customer one.
   *
   * They are different identities with different shapes against different
   * endpoints, and a union makes "which of these am I" a question the
   * compiler answers. A `role?: string` on one object would make every
   * customer screen accept a staff session and render nothing sensible.
   */
  | { readonly status: 'staff'; readonly staff: StaffIdentity };

interface SessionValue {
  readonly state: SessionState;
  /** Called after a successful verify, to load the identity. */
  readonly refresh: (signal?: AbortSignal) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

/**
 * The restore, as a page-level operation rather than a component one.
 *
 * Refreshing **rotates** the token: the old one is retired the moment it is
 * accepted. So the restore is not idempotent, and running it twice means the
 * second call presents a retired token — which the server correctly reads as a
 * replay and answers 401, after which reuse detection can revoke the whole
 * family. The user is signed out by the act of restoring their session.
 *
 * React's StrictMode invokes effects twice in development precisely to surface
 * this, and it did: the reload made `200 /api/auth/customer/refresh` followed
 * by `401 /api/auth/customer/refresh`, and nobody could stay signed in across a
 * reload. The same thing would happen in production the first time a parent
 * remounted the provider.
 *
 * Memoising the promise — not the result — is what makes it safe: a second
 * caller arriving mid-flight joins the first request instead of starting a
 * competing one.
 */
let restoring: Promise<SessionState> | undefined;

async function restoreOnce(): Promise<SessionState> {
  /* Exchange the httpOnly refresh cookie for an access token. A failure is
     the ordinary first visit, not a fault. */
  const restored = await restoreSession();
  if (restored.ok) {
    const identity = await getIdentity();
    return identity.ok ? { status: 'signedIn', customer: identity.data } : { status: 'anonymous' };
  }

  /* Not a customer — try staff before giving up.

     Two requests on a cold load for staff and one for a customer, which is the
     right way round: customers are the many. Trying both beats remembering
     which kind signed in last, because that memory is state that can be wrong,
     and being wrong means showing a sign-in page to somebody already
     authenticated.

     Safe only because the server refuses a wrong-subject refresh *without*
     rotating it — otherwise this very attempt would destroy a staff session. */
  const staffRestored = await restoreStaffSession();
  if (!staffRestored.ok) return { status: 'anonymous' };

  const identity = await getStaffIdentity();
  return identity.ok ? { status: 'staff', staff: identity.data } : { status: 'anonymous' };
}

export function SessionProvider({
  children,
  initial,
}: {
  readonly children: ReactNode;
  readonly initial?: SessionState;
}): JSX.Element {
  const [state, setState] = useState<SessionState>(initial ?? { status: 'restoring' });
  /* Read inside `signOut`, which must not be rebuilt on every state change —
     it is handed to a context value that other components depend on. */
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const identity = await getIdentity(signal);
    if (signal?.aborted === true) return;
    setState(
      identity.ok ? { status: 'signedIn', customer: identity.data } : { status: 'anonymous' },
    );
  }, []);

  useEffect(() => {
    if (initial) return;

    /* An AbortController rather than a `cancelled` boolean. The boolean is the
       usual idiom and TypeScript is right to call the check always-false:
       nothing in this scope reassigns it where the compiler can see. */
    const controller = new AbortController();
    /* Read through a call, not as a property: `signal.aborted` is a readonly
       boolean, so after the first check TypeScript narrows it to `false` for
       the rest of the function and the linter reports every later check as
       dead code. It is not dead — each `await` is a point at which the effect
       can be torn down. */
    const aborted = () => controller.signal.aborted;

    restoring ??= restoreOnce();
    void restoring.then((next) => {
      if (aborted()) return;
      setState(next);
    });

    return () => {
      controller.abort();
    };
  }, [initial]);

  const signOut = useCallback(async () => {
    /* Whichever kind of session this is. Calling only the customer logout
       while signed in as staff would clear the token in memory and leave the
       staff refresh cookie alive, so the next reload signs them back in. */
    await (stateRef.current.status === 'staff' ? staffSignOut() : apiSignOut());
    /* So a later sign-in on the same page is restored afresh rather than
       resolving to the memoised "signed in" from before the sign-out. */
    restoring = undefined;
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}
