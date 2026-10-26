import { formatDate, TICKET_STATUSES, type FormatPreferences } from '@csas/shared';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isUnauthenticated } from '../api/errors.js';
import { getHistory, type HistoryFilters, type TicketPage } from '../api/client.js';
import { Button, Callout, Card, Field, Identifier, Tag } from '../components/index.js';
import { ClockIcon } from '../components/icons.js';
import { styles } from '../components/styles.js';
import { useLocale } from '../locale-context.js';
import { screens } from './screen-styles.js';

/**
 * The customer's own tickets, with filters.
 *
 * Every filter is applied by the server. Filtering a page in the browser is
 * the shortcut that makes "showing 25 of 112" a lie, because the 25 are
 * filtered and the 112 is not — and it only works at all while the whole
 * history fits in one page, which is exactly when nobody needs filters.
 */

export function History({ onOpen }: { readonly onOpen: (id: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const preferences: FormatPreferences = { locale };

  const [filters, setFilters] = useState<HistoryFilters>({ limit: 25 });
  const [page, setPage] = useState<TicketPage | undefined>();
  const [error, setError] = useState<{ text: string; signIn: boolean } | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void getHistory(filters, controller.signal).then((result) => {
      /* An aborted request is a newer keystroke, not a failure. Rendering its
         error would flash "could not be reached" while the user types. */
      if (controller.signal.aborted) return;
      setLoading(false);
      if (result.ok) {
        /* Normalised rather than trusted. The server is typed and tested, so
           a malformed page should not happen — but a client that throws
           during render shows a blank page, and a blank page is a worse
           failure than an empty list. */
        setPage({
          tickets: Array.isArray(result.data.tickets) ? result.data.tickets : [],
          total: typeof result.data.total === 'number' ? result.data.total : 0,
          limit: typeof result.data.limit === 'number' ? result.data.limit : 25,
        });
        setError(undefined);
      } else {
        setError({
          text: describeError(result.error, t),
          /* Not signed in is a prompt, not a failure. Showing it in red next
             to a "could not be reached" is how an interface teaches people
             that red means nothing. */
          signIn: isUnauthenticated(result.error),
        });
      }
    });
    return () => {
      controller.abort();
    };
  }, [filters]);

  const change = (patch: Partial<HistoryFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const hasFilters =
    Boolean(filters.status) ||
    Boolean(filters.search) ||
    Boolean(filters.openedAfter) ||
    Boolean(filters.openedBefore);

  return (
    <section>
      <h1>{t('history.title')}</h1>

      <Card title={t('history.filterSearch')} headingLevel="h2">
        <div className={screens.filters}>
          <Field
            label={t('history.filterSearch')}
            hint={t('history.searchHint')}
            type="search"
            dir="auto"
            value={filters.search ?? ''}
            onChange={(event) => {
              change({ search: event.target.value });
            }}
          />

          <div className={screens.field}>
            <label className={styles.label} htmlFor="status-filter">
              {t('history.filterStatus')}
            </label>
            <select
              id="status-filter"
              className={styles.input}
              value={filters.status ?? ''}
              onChange={(event) => {
                change({ status: event.target.value });
              }}
            >
              <option value="">{t('history.anyStatus')}</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${toKey(status)}`, { defaultValue: status })}
                </option>
              ))}
            </select>
          </div>

          <Field
            label={t('history.filterFrom')}
            type="date"
            value={filters.openedAfter ?? ''}
            onChange={(event) => {
              change({ openedAfter: event.target.value });
            }}
          />
          <Field
            label={t('history.filterTo')}
            type="date"
            value={filters.openedBefore ?? ''}
            onChange={(event) => {
              change({ openedBefore: event.target.value });
            }}
          />
        </div>

        {hasFilters ? (
          <Button
            onClick={() => {
              setFilters({ limit: 25 });
            }}
          >
            {t('history.clear')}
          </Button>
        ) : null}
      </Card>

      {error === undefined ? null : (
        <Callout tone={error.signIn ? 'info' : 'danger'}>{error.text}</Callout>
      )}

      {/* `role="status"` rather than `alert`: a list finishing loading is
          information, and an assertive announcement would interrupt whatever
          the reader was in the middle of. */}
      <p role="status" className={screens.muted}>
        {loading
          ? t('state.loading')
          : t('history.showing', { shown: page?.tickets.length ?? 0, total: page?.total ?? 0 })}
      </p>

      {!loading && page?.tickets.length === 0 ? (
        <Callout tone="info">
          {hasFilters ? t('history.emptyFiltered') : t('history.empty')}
        </Callout>
      ) : null}

      {page && page.tickets.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('ticket.reference')}</th>
                <th scope="col">{t('ticket.subject')}</th>
                {/* `ticket.status`, not `status.open`: this names the column,
                    and a status *value* standing in for it headed the column
                    "Open". */}
                <th scope="col">{t('ticket.status')}</th>
                <th scope="col">{t('history.opened')}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {page.tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Identifier value={ticket.reference} />
                  </td>
                  {/* `dir="auto"`: a subject may be Arabic, Arabizi or English
                      whatever the interface language is. */}
                  <td dir="auto">{ticket.subject}</td>
                  <td>
                    <Tag tone={toneFor(ticket.status)}>
                      {t(`status.${toKey(ticket.status)}`, { defaultValue: ticket.status })}
                    </Tag>
                  </td>
                  <td>
                    <Tag icon={<ClockIcon />}>
                      {formatDate(new Date(ticket.createdAt), preferences)}
                    </Tag>
                  </td>
                  <td>
                    {/* "Open", not "Confirm". This called `onOpen` while
                        reading `action.confirm` — harmless generic wording
                        when the list was built, and actively wrong once step
                        16 made confirming a resolution a real action with its
                        own meaning. A customer clicking "Confirm" on a row
                        expects to close the ticket; it navigates.

                        The accessible name carries the reference, because a
                        screen reader otherwise announces twenty-five buttons
                        all called "Open" with nothing to tell them apart. */}
                    <Button
                      aria-label={t('action.openTicket', { reference: ticket.reference })}
                      onClick={() => {
                        onOpen(ticket.id);
                      }}
                    >
                      {t('action.open')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/** `in_progress` in the domain, `inProgress` in the catalogue. */
export function toKey(status: string): string {
  return status.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function toneFor(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'escalated':
      return 'danger';
    case 'awaiting_customer':
      return 'warning';
    case 'closed':
      return 'neutral';
    default:
      return 'info';
  }
}
