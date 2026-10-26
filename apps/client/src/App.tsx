import {
  formatCountdown,
  formatDate,
  formatNumber,
  LOCALES,
  type Locale,
  type FormatPreferences,
} from '@csas/shared';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Callout,
  Card,
  Field,
  Identifier,
  SegmentedControl,
  Tag,
} from './components/index.js';
import { AlertIcon, ClockIcon, SendIcon } from './components/icons.js';
import { History } from './screens/History.js';
import { PreferencesScreen } from './screens/Preferences.js';
import { TicketDetail } from './screens/TicketDetail.js';
import { useLocale } from './locale-context.js';
import { styles } from './components/styles.js';
import { THEMES, useTheme, type Theme } from './theme.js';
import { appStyles } from './app-styles.js';

interface VersionInfo {
  name: string;
  version: string;
  environment: string;
}

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; info: VersionInfo }
  | { status: 'error'; code: string };

/* Demonstration rows. Invented, not drawn from `reference/` — no real customer
   name, ticket or sentence appears anywhere in this repository. */
const ROWS = [
  { reference: 'CSAS-001241', customer: 'Cedar Pharmaceuticals', minutes: 12, tone: 'warning' },
  { reference: 'CSAS-001240', customer: 'Beirut Logistics', minutes: -40, tone: 'danger' },
  { reference: 'CSAS-001238', customer: 'Tripoli Textiles', minutes: 400, tone: 'neutral' },
] as const;

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
        /* The name of a language is written in that language. "Arabic" in an
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

function ApiStatus(): JSX.Element {
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

  if (state.status === 'loading') return <Callout tone="info">{t('state.loading')}</Callout>;
  if (state.status === 'error') {
    return (
      <Callout tone="danger">
        {t('state.apiUnreachable')} <Identifier value={state.code} />
      </Callout>
    );
  }
  return (
    <Callout tone="success">
      <Identifier value={state.info.name} /> <Identifier value={state.info.version} /> ·{' '}
      <Identifier value={state.info.environment} />
    </Callout>
  );
}

/**
 * The design system, rendering itself.
 *
 * Not a storybook: it is the real application shell with the real components,
 * so switching language or theme here exercises exactly what every later
 * screen will do. Phase 4 replaces the content and keeps the frame.
 */
type View = { readonly name: 'history' } | { readonly name: 'detail'; readonly id: string };

export function App(): JSX.Element {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ name: 'history' });
  const preferences: FormatPreferences = { locale };
  const now = new Date('2026-10-24T12:30:00Z');

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
        {/* Two screens and a panel, switched by state rather than by a router.
            A router arrives when there are URLs worth sharing — step 32 adds
            the public site, which is where that starts to matter. Adding one
            now would be a dependency serving a single `if`. */}
        {view.name === 'detail' ? (
          <TicketDetail
            id={view.id}
            onBack={() => {
              setView({ name: 'history' });
            }}
          />
        ) : (
          <>
            <History
              onOpen={(id) => {
                setView({ name: 'detail', id });
              }}
            />
            <PreferencesScreen />
          </>
        )}

        <h2>{t('page.dashboard')}</h2>
        <p>{formatDate(now, preferences)}</p>

        <ApiStatus />

        <Card title={t('ticket.count', { count: ROWS.length })} headingLevel="h2">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('ticket.reference')}</th>
                  <th scope="col">{t('ticket.customer')}</th>
                  <th scope="col">{t('ticket.deadline')}</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.reference}>
                    <td>
                      <Identifier value={row.reference} />
                    </td>
                    <td>{row.customer}</td>
                    <td>
                      {row.minutes < 0 ? (
                        <Tag tone="danger" icon={<AlertIcon />}>
                          {t('ticket.breached')}
                        </Tag>
                      ) : (
                        <Tag
                          tone={row.tone === 'warning' ? 'warning' : 'neutral'}
                          icon={<ClockIcon />}
                        >
                          {formatCountdown(row.minutes * 60_000, preferences)}
                        </Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t('chat.assistant')} headingLevel="h2">
          <p className={appStyles.meta}>
            <Identifier value="CSAS-001240" /> · {t('chat.confidence')}{' '}
            {formatNumber(0.88, preferences)}
          </p>

          {/* BIDI-03. The direction belongs to the message, not to the
              interface: this Arabizi line resolves LTR inside an Arabic page,
              and it is never tagged `lang="en"` — it is Arabic written in
              Latin characters, and that tag would have a screen reader
              pronounce it with an English voice. */}
          <p className={appStyles.bubble} dir="auto">
            el printer 3am ya3mel error ba3ed l update, chou badna na3mel?
          </p>

          <Field
            label={t('chat.composerLabel')}
            placeholder={t('chat.composerPlaceholder')}
            /* Free text of unknown script — Arabic, Arabizi or English. */
            dir="auto"
          />

          <div className={appStyles.actions}>
            <Button variant="primary">
              <SendIcon />
              {t('action.send')}
            </Button>
            <Button variant="quiet">{t('chat.escalate')}</Button>
          </div>
        </Card>
      </main>
    </>
  );
}
