import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { getDevInbox, type DemoAdminTotp } from '../api/auth.js';
import { describeError } from '../api/errors.js';
import { staffLogin } from '../api/staff-auth.js';
import { Button, Callout, Card, Field, Identifier } from '../components/index.js';
import { screens } from './screen-styles.js';

/**
 * The demo second factor.
 *
 * Admin 2FA is mandatory and the code is never written down anywhere a
 * reviewer can reach, so without this panel a fresh clone cannot open the
 * staff interface at all — which is how this was reported: "staff cannot open
 * as the auth 6 digits".
 *
 * It re-reads on its own, because a TOTP code lasts thirty seconds and a
 * number that has silently expired is worse than no number: it reads as a
 * rejected password rather than a stale code.
 *
 * Renders nothing when the endpoint is absent — it is not mounted outside
 * `DEMO_MODE`, so a 404 is the ordinary production answer rather than a fault.
 */
function DemoSecondFactor(): JSX.Element | null {
  const { t } = useTranslation();
  const [totp, setTotp] = useState<DemoAdminTotp | undefined>();

  useEffect(() => {
    let live = true;
    const read = () => {
      void getDevInbox().then((result) => {
        if (live && result.ok) setTotp(result.data.adminTotp);
      });
    };
    read();
    /* Every five seconds rather than at the exact expiry: the window is
       thirty seconds and the server accepts a step either side, so the panel
       does not need to be precise, only never stale for long. */
    const timer = setInterval(read, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (totp === undefined) return null;

  return (
    <Card title={t('staff.demoTitle')} headingLevel="h2">
      <p className={screens.muted}>{t('staff.demoLead')}</p>
      <p>
        <Identifier value={totp.email} /> · <Identifier value={totp.code} />
      </p>
      <p className={screens.muted}>{t('staff.demoExpires', { count: totp.expiresInSeconds })}</p>
    </Card>
  );
}

/**
 * Signing in as staff.
 *
 * **The second factor is not predicted.** The screen asks for email and
 * password, and moves to the code step only when the server answers
 * `totp_required`. Deciding in advance whether an account needs one would mean
 * the client knowing which accounts are admins before anybody has
 * authenticated — which is an enumeration oracle, and wrong anyway, since step
 * 06 refuses an admin who has never enrolled rather than waving them through.
 *
 * **The password step is not re-shown after that.** Moving back would make the
 * operator retype a password they have already proved, and the server wants
 * all three values together, so they are kept and resent.
 */
export function StaffSignIn({ onBack }: { readonly onBack: () => void }): JSX.Element {
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const result = await staffLogin(email, password, needsTotp ? totp : undefined);
    setBusy(false);

    if (result.ok) {
      /* The session provider re-reads the identity; a full reload is the
         honest way to get there without threading a callback through two
         providers for a transition that happens once. */
      window.location.reload();
      return;
    }

    if (result.error.code === 'totp_required') {
      setNeedsTotp(true);
      return;
    }
    setError(describeError(result.error, t));
  };

  return (
    <section className={screens.stack}>
      <Button onClick={onBack}>{t('staff.backToCustomer')}</Button>

      <h1>{t('staff.signInTitle')}</h1>

      <Card title={t('staff.signInCard')} headingLevel="h2">
        <form
          className={screens.stack}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            label={t('staff.email')}
            type="email"
            autoComplete="username"
            required
            value={email}
            disabled={needsTotp}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <Field
            label={t('staff.password')}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={needsTotp}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />

          {needsTotp ? (
            <Field
              label={t('staff.totp')}
              hint={t('staff.totpHint')}
              /* `inputMode` rather than `type="number"`: a numeric input strips
                 a leading zero and offers spinners for something that is a code
                 rather than a quantity. */
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={totp}
              onChange={(event) => {
                setTotp(event.target.value);
              }}
            />
          ) : null}

          {error === undefined ? null : <Callout tone="danger">{error}</Callout>}

          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || email === '' || password === '' || (needsTotp && totp === '')}
            >
              {t('staff.signIn')}
            </Button>
          </div>
        </form>
      </Card>

      <DemoSecondFactor />
    </section>
  );
}
