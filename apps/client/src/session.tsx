import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  | { readonly status: 'signedIn'; readonly customer: CustomerIdentity };

interface SessionValue {
  readonly state: SessionState;
  /** Called after a successful verify, to load the identity. */
  readonly refresh: (signal?: AbortSignal) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({
  children,
  initial,
}: {
  readonly children: ReactNode;
  readonly initial?: SessionState;
}): JSX.Element {
  const [state, setState] = useState<SessionState>(initial ?? { status: 'restoring' });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const identity = await getIdentity(signal);
    if (signal?.aborted === true) return;
    setState(
      identity.ok ? { status: 'signedIn', customer: identity.data } : { status: 'anonymous' },
    );
  }, []);

  useEffect(() => {
    if (initial) return;

    /* An AbortController rather than a `cancelled` boolean. The boolean is
       the usual idiom and TypeScript is right to call the check always-false:
       nothing in this scope reassigns it where the compiler can see. The
       controller also does more than record the intent — it cancels the
       in-flight requests, which a flag cannot. */
    const controller = new AbortController();

    void (async () => {
      /* Exchange the httpOnly refresh cookie for an access token. A failure
         is the ordinary first visit, not a fault. */
      const restored = await restoreSession();
      if (controller.signal.aborted) return;
      if (!restored.ok) {
        setState({ status: 'anonymous' });
        return;
      }
      await refresh(controller.signal);
    })();

    return () => {
      controller.abort();
    };
  }, [initial, refresh]);

  const signOut = useCallback(async () => {
    await apiSignOut();
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
