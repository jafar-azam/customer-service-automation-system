import { useEffect, useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { getDevInbox, requestCode, verifyCode, type DevMessage } from '../api/auth.js';
import { describeError } from '../api/errors.js';
import { Button, Callout, Card, Field, Identifier } from '../components/index.js';
import { useSession } from '../session.js';
import { screens } from './screen-styles.js';

/**
 * Signing in with a one-time code.
 *
 * Two steps, and the second is reached **whatever the server says** about the
 * first. `request-code` answers identically for a number on a contract, a
 * number that is not, and one the kill switch has suppressed — that is the
 * anti-enumeration property step 08 built, and a screen that only advanced on
 * "we sent it" would hand the distinction straight back.
 *
 * So the second step's wording is conditional by design: *if* that number is
 * on a contract, a code is on its way.
 */

/** Matches the resend limit the server enforces (`OTP_LIMITS.resend`). */
const RESEND_COOLDOWN_SECONDS = 45;

function useCountdown(from: number): [number, () => void] {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (remaining <= 0) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setRemaining((value) => value - 1);
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [remaining]);

  return [
    remaining,
    () => {
      setRemaining(from);
    },
  ];
}

/**
 * The dev inbox panel.
 *
 * Only rendered when the endpoint answers — it is not mounted unless
 * `DEMO_MODE` is on, so a 404 is the ordinary production answer and not an
 * error worth showing. Without this a reviewer cannot sign in at all: the code
 * is deliberately never logged and never returned by the auth API.
 */
function DevInbox(): JSX.Element | null {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<DevMessage[] | undefined>();

  useEffect(() => {
    void getDevInbox().then((result) => {
      if (result.ok) setMessages(result.data.messages);
    });
  }, []);

  if (messages === undefined) return null;

  return (
    <Card title={t('signIn.devInbox')} headingLevel="h2">
      <p className={screens.muted}>{t('signIn.devInboxLead')}</p>
      {messages.length === 0 ? (
        <p className={screens.muted}>{t('signIn.devInboxEmpty')}</p>
      ) : (
        <ul className={screens.files}>
          {messages.slice(0, 5).map((message) => (
            <li key={message.id} className={screens.file}>
              <Identifier value={message.to ?? '—'} />
              {/* `dir="auto"`: the OTP message is Arabic with a Latin code. */}
              <span dir="auto">{message.body}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SignIn(): JSX.Element {
  const { t } = useTranslation();
  const { refresh } = useSession();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCountdown(RESEND_COOLDOWN_SECONDS);

  const send = async () => {
    setBusy(true);
    setError(undefined);
    const result = await requestCode(phone);
    setBusy(false);

    /* A rate limit is the one refusal worth showing: a client that cannot see
       it retries into a wall. Everything else advances, because the server's
       answer is identical either way and the screen must not add a signal the
       API deliberately withholds. */
    if (!result.ok && result.error.code === 'too_many_requests') {
      setError(describeError(result.error, t));
      return;
    }
    if (!result.ok && result.error.code === 'invalid_phone') {
      setError(describeError(result.error, t));
      return;
    }

    setStep('code');
    startCooldown();
  };

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    const result = await verifyCode(phone, code);
    setBusy(false);

    if (!result.ok) {
      setError(describeError(result.error, t));
      return;
    }
    /* The identity load decides what is rendered next, including the
       contract gate — the token alone does not mean support is available. */
    await refresh();
  };

  return (
    <section className={screens.stack}>
      <h1>{t('signIn.title')}</h1>

      {step === 'phone' ? (
        <Card headingLevel="h2">
          <form
            className={screens.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <p>{t('signIn.lead')}</p>
            <Field
              label={t('signIn.phone')}
              hint={t('signIn.phoneHint')}
              type="tel"
              /* A phone number is an LTR token whatever the interface
                 language is, and `tel` gets the right keypad on a handset. */
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              {...(error === undefined ? {} : { error })}
            />
            <div>
              <Button type="submit" variant="primary" disabled={busy || phone.trim() === ''}>
                {t('signIn.sendCode')}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card headingLevel="h2">
          <form
            className={screens.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            <h2>{t('signIn.codeTitle')}</h2>
            <p>{t('signIn.codeLead', { phone })}</p>
            <Field
              label={t('signIn.code')}
              type="text"
              dir="ltr"
              /* `one-time-code` is what lets a phone offer the code from the
                 message, and `numeric` gets a digit keypad. */
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ''));
              }}
              {...(error === undefined ? {} : { error })}
            />
            <div className={screens.row}>
              <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>
                {t('signIn.verify')}
              </Button>
              <Button
                disabled={cooldown > 0 || busy}
                onClick={() => {
                  void send();
                }}
              >
                {cooldown > 0 ? t('signIn.resendIn', { seconds: cooldown }) : t('signIn.resend')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setError(undefined);
                }}
              >
                {t('signIn.changeNumber')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <DevInbox />
    </section>
  );
}

/**
 * Shown when a customer signs in but has no live contract.
 *
 * A separate state rather than an error: they are who they say they are, and
 * the answer is about their contract, not their identity.
 */
export function ContractInactive({ onSignOut }: { readonly onSignOut: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={screens.stack}>
      <h1>{t('signIn.title')}</h1>
      <Callout tone="warning">{t('signIn.contractExpired')}</Callout>
      <div>
        <Button onClick={onSignOut}>{t('signIn.signOut')}</Button>
      </div>
    </section>
  );
}
