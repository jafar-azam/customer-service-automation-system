import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isUnauthenticated } from '../api/errors.js';
import { getPreferences, updatePreferences, type Preferences as Values } from '../api/client.js';
import { Callout, Card } from '../components/index.js';
import { styles } from '../components/styles.js';
import { screens } from './screen-styles.js';

/**
 * What the customer has asked to receive.
 *
 * Each control saves on change rather than behind a Save button. There are
 * four of them, each independent, and a form that can be left in an unsaved
 * state is a form people leave in an unsaved state — then wonder why they are
 * still getting messages.
 */

function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <div className={screens.field}>
      <label className={screens.row} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        <span>{label}</span>
      </label>
      {hint === undefined ? null : (
        <span className={screens.muted} id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function PreferencesScreen(): JSX.Element {
  const { t } = useTranslation();
  const [values, setValues] = useState<Values | undefined>();
  const [error, setError] = useState<{ text: string; signIn: boolean } | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getPreferences(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setValues(result.data.preferences);
      else
        setError({ text: describeError(result.error, t), signIn: isUnauthenticated(result.error) });
    });
    return () => {
      controller.abort();
    };
  }, []);

  const save = (patch: Partial<Values>) => {
    /* Optimistic, then corrected by the server's answer. A checkbox that
       waits for a round trip before moving feels broken on a slow link. */
    setValues((current) => (current ? { ...current, ...patch } : current));
    setSaved(false);
    void updatePreferences(patch).then((result) => {
      if (result.ok) {
        setValues(result.data.preferences);
        setSaved(true);
      } else {
        setError({ text: describeError(result.error, t), signIn: isUnauthenticated(result.error) });
      }
    });
  };

  /* Not signed in is a prompt, not a failure — the same rule as the history
     screen. Two screens showing the same condition in different colours is
     how an interface teaches people that red means nothing. */
  if (error !== undefined) {
    return <Callout tone={error.signIn ? 'info' : 'danger'}>{error.text}</Callout>;
  }
  if (!values) {
    return (
      <p role="status" className={screens.muted}>
        {t('state.loading')}
      </p>
    );
  }

  return (
    <Card title={t('preferences.title')} headingLevel="h2">
      <div className={screens.stack}>
        <Toggle
          id="pref-whatsapp"
          label={t('preferences.whatsapp')}
          checked={values.whatsapp}
          onChange={(whatsapp) => {
            save({ whatsapp });
          }}
        />
        <Toggle
          id="pref-email"
          label={t('preferences.email')}
          /* Disabled rather than hidden, with the reason given: a control
             that silently does nothing is worse than one that explains why
             it cannot. */
          disabled={!values.emailAvailable}
          {...(values.emailAvailable ? {} : { hint: t('preferences.emailUnavailable') })}
          checked={values.email}
          onChange={(email) => {
            save({ email });
          }}
        />
        <Toggle
          id="pref-marketing"
          label={t('preferences.marketing')}
          checked={values.marketingOptOut}
          onChange={(marketingOptOut) => {
            save({ marketingOptOut });
          }}
        />

        <div className={screens.field}>
          <label className={styles.label} htmlFor="pref-language">
            {t('preferences.language')}
          </label>
          <select
            id="pref-language"
            className={styles.input}
            value={values.preferredLanguage}
            onChange={(event) => {
              save({ preferredLanguage: event.target.value as 'ar' | 'en' });
            }}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Announced politely when it changes, not on every render. */}
        <p role="status" className={screens.muted}>
          {saved ? t('preferences.saved') : ''}
        </p>
      </div>
    </Card>
  );
}
