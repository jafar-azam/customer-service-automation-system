import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '@csas/shared';
import { Button, Callout, Identifier, SegmentedControl } from './components/index.js';
import { useLocale } from './locale-context.js';
import { ContractInactive, SignIn } from './screens/SignIn.js';
import { History } from './screens/History.js';
import { PreferencesScreen } from './screens/Preferences.js';
import { Approvals } from './screens/Approvals.js';
import { NewTicket } from './screens/NewTicket.js';
import { Queue } from './screens/Queue.js';
import { StaffSignIn } from './screens/StaffSignIn.js';
import { StaffTicket } from './screens/StaffTicket.js';
import { TicketDetail } from './screens/TicketDetail.js';
import { useSession } from './session.js';
import { THEMES, useTheme, type Theme } from './theme.js';
import { appStyles } from './app-styles.js';

/**
 * The customer application.
 *
 * Step 10's demonstration content lived here — a fabricated ticket table and
 * a chat card, built to show the component library rendering itself. It is
 * gone: the real screens now exercise the same components against real data,
 * and leaving a second, fake ticket table on the page would be an invitation
 * to wonder which one is true.
 */

interface VersionInfo {
  name: string;
  version: string;
  environment: string;
}

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; info: VersionInfo }
  | { status: 'error'; code: string };

type StaffView =
  | { readonly name: 'queue' }
  | { readonly name: 'ticket'; readonly id: string }
  | { readonly name: 'approvals' };

type View =
  | { readonly name: 'history' }
  | { readonly name: 'new' }
  | { readonly name: 'detail'; readonly id: string };

/**
 * The staff side of the product.
 *
 * The queue, one ticket, and the knowledge approvals — switched by state for
 * the same reason the customer side is: a router is a dependency serving a
 * single `if` until there are URLs worth sharing.
 *
 * The approvals tab is drawn for both roles. An agent who opens it sees the
 * queue and gets a 403 from the server on approve, which is the honest shape:
 * hiding it would mean the browser deciding who may approve, and that decision
 * belongs to `requireRole('admin')` on the server where it cannot be edited by
 * whoever is looking at the page.
 */
function StaffArea({
  name,
  role,
  onSignOut,
}: {
  readonly name: string;
  readonly role: string;
  readonly onSignOut: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [view, setView] = useState<StaffView>({ name: 'queue' });

  return (
    <>
      <div className={appStyles.settings}>
        <span className={appStyles.tagline}>{t('staff.signedInAs', { name, role })}</span>
        <Button onClick={onSignOut}>{t('signIn.signOut')}</Button>
      </div>

      <nav className={appStyles.settings} aria-label={t('staff.sections')}>
        <Button
          aria-pressed={view.name !== 'approvals'}
          onClick={() => {
            setView({ name: 'queue' });
          }}
        >
          {t('staff.queueTitle')}
        </Button>
        <Button
          aria-pressed={view.name === 'approvals'}
          onClick={() => {
            setView({ name: 'approvals' });
          }}
        >
          {t('approvals.title')}
        </Button>
      </nav>

      {view.name === 'approvals' ? (
        <Approvals />
      ) : view.name === 'ticket' ? (
        <StaffTicket
          id={view.id}
          onBack={() => {
            setView({ name: 'queue' });
          }}
        />
      ) : (
        <Queue
          onOpen={(id) => {
            setView({ name: 'ticket', id });
          }}
        />
      )}
    </>
  );
}

function Settings(): JSX.Element {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const themeLabels: Record<Theme, string> = {
    system: t('settings.themeSystem'),
    light: t('settings.themeLight'),
    dark: t('settings.themeDark'),
  };

  return (
    <div className={appStyles.settings}>
      <SegmentedControl<Locale>
        label={t('settings.language')}
        value={locale}
        /* A language's name is written in that language. "Arabic" in an
           English list is no use to someone who only reads Arabic — which is
           exactly the person who needs the switch. */
        options={LOCALES.map((value) => ({
          value,
          label: value === 'ar-LB' ? 'العربية' : 'English',
        }))}
        onChange={setLocale}
      />
      <SegmentedControl<Theme>
        label={t('settings.theme')}
        value={theme}
        options={THEMES.map((value) => ({ value, label: themeLabels[value] }))}
        onChange={setTheme}
      />
    </div>
  );
}

/** The API reachability check from step 02, kept because it is still useful. */
function ApiStatus(): JSX.Element | null {
  const { t } = useTranslation();
  const [state, setState] = useState<ApiState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/version', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`http_${String(response.status)}`);
        setState({ status: 'ready', info: (await response.json()) as VersionInfo });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error', code: error instanceof Error ? error.message : 'unknown' });
      });
    return () => {
      controller.abort();
    };
  }, []);

  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <Callout tone="danger">
        {t('state.apiUnreachable')} <Identifier value={state.code} />
      </Callout>
    );
  }
  return null;
}

function SignedIn({
  name,
  onSignOut,
}: {
  readonly name: string;
  readonly onSignOut: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ name: 'history' });

  return (
    <>
      <div className={appStyles.settings}>
        <span className={appStyles.tagline}>{t('signIn.signedInAs', { name })}</span>
        <Button onClick={onSignOut}>{t('signIn.signOut')}</Button>
      </div>

      {/* Two screens, switched by state rather than by a router. A router
          arrives when there are URLs worth sharing — step 32's public site is
          where that starts to matter. Adding one now would be a dependency
          serving a single `if`. */}
      {view.name === 'detail' ? (
        <TicketDetail
          id={view.id}
          onBack={() => {
            setView({ name: 'history' });
          }}
        />
      ) : view.name === 'new' ? (
        <NewTicket
          onOpened={(id) => {
            setView({ name: 'detail', id });
          }}
          onCancel={() => {
            setView({ name: 'history' });
          }}
        />
      ) : (
        <>
          {/* The way in. Until this existed a customer could read tickets and
              never open one, so the assistant — the thing the project is
              about — had no entry point at all. */}
          <div className={appStyles.settings}>
            <Button
              variant="primary"
              onClick={() => {
                setView({ name: 'new' });
              }}
            >
              {t('newTicket.start')}
            </Button>
          </div>
          <History
            onOpen={(id) => {
              setView({ name: 'detail', id });
            }}
          />
          <PreferencesScreen />
        </>
      )}
    </>
  );
}

export function App(): JSX.Element {
  const { t } = useTranslation();
  const { state, signOut } = useSession();
  /* Which sign-in is on screen while nobody is authenticated. */
  const [staffDoor, setStaffDoor] = useState(false);

  return (
    <>
      <a className="skip-link" href="#main">
        {t('app.skipToContent')}
      </a>

      <header className={appStyles.header}>
        <div>
          <strong>{t('app.name')}</strong>{' '}
          <span className={appStyles.tagline}>{t('app.tagline')}</span>
        </div>
        <Settings />
      </header>

      <main id="main" className={appStyles.main}>
        <ApiStatus />

        {/* Three outcomes, and "we do not know yet" is one of them. Rendering
            the sign-in screen while the refresh request is in flight would
            flash a login form at someone already signed in, on every reload. */}
        {state.status === 'restoring' ? (
          <p role="status">{t('state.loading')}</p>
        ) : state.status === 'anonymous' ? (
          /* One door with two sides rather than two URLs: there is no router
             yet (step 32 is where URLs start to matter), and a staff sign-in
             reachable only by typing a path nobody has written down is a
             staff sign-in nobody uses. */
          staffDoor ? (
            <StaffSignIn
              onBack={() => {
                setStaffDoor(false);
              }}
            />
          ) : (
            <>
              <SignIn />
              <p className={appStyles.tagline}>
                <Button
                  onClick={() => {
                    setStaffDoor(true);
                  }}
                >
                  {t('staff.signInLink')}
                </Button>
              </p>
            </>
          )
        ) : state.status === 'staff' ? (
          <StaffArea
            name={state.staff.name}
            role={state.staff.role}
            onSignOut={() => {
              void signOut();
            }}
          />
        ) : state.customer.entitlement.status === 'active' ? (
          <SignedIn
            name={state.customer.name}
            onSignOut={() => {
              void signOut();
            }}
          />
        ) : (
          /* Signed in, but no live contract. A separate state rather than an
             error: they are who they say they are, and the answer is about
             their contract rather than their identity. */
          <ContractInactive
            onSignOut={() => {
              void signOut();
            }}
          />
        )}
      </main>
    </>
  );
}
