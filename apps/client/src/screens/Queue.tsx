import { formatDate, type FormatPreferences } from '@csas/shared';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/errors.js';
import { getQueue } from '../api/staff.js';
import type { TicketSummary } from '../api/client.js';
import { Button, Callout, Card, Identifier, Tag } from '../components/index.js';
import { ClockIcon } from '../components/icons.js';
import { styles } from '../components/styles.js';
import { useLocale } from '../locale-context.js';
import { screens } from './screen-styles.js';
import { toKey, toneFor } from './History.js';

/**
 * The work, in one list.
 *
 * Sorted by the server, not here: "what should I pick up next" is a business
 * rule — step 14's rota and SLA clocks decide it — and a second ordering in
 * the browser would quietly disagree with the one the escalation path uses.
 *
 * **Mine first, not mine only.** The default filter is the whole open queue
 * rather than the signed-in agent's assignments, because an agent who can only
 * see their own tickets cannot pick up unassigned work, and step 14's rota
 * hands work out rather than expecting people to find it.
 */

const OPEN_STATES = [
  'open',
  'assistant_answering',
  'awaiting_customer',
  'escalated',
  'in_progress',
];

export function Queue({ onOpen }: { readonly onOpen: (id: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const preferences: FormatPreferences = { locale };

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void getQueue(
      { status: OPEN_STATES, assignedToMe: mineOnly, limit: 50 },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!result.ok) {
        setError(describeError(result.error, t));
        return;
      }
      setTickets(result.data.tickets);
      setTotal(result.data.total);
    });
    return () => {
      controller.abort();
    };
  }, [mineOnly, t]);

  if (error !== undefined) return <Callout tone="danger">{error}</Callout>;

  return (
    <section className={screens.stack}>
      <div className={screens.spread}>
        <h1>{t('staff.queueTitle')}</h1>
        <Button
          /* A toggle rather than two tabs: it is one question with two
             answers, and `aria-pressed` is what says which it is. */
          aria-pressed={mineOnly}
          onClick={() => {
            setMineOnly((value) => !value);
          }}
        >
          {mineOnly ? t('staff.showAll') : t('staff.showMine')}
        </Button>
      </div>

      <Card title={t('staff.openWork', { count: total })} headingLevel="h2">
        {loading ? (
          <p role="status" className={screens.muted}>
            {t('state.loading')}
          </p>
        ) : tickets.length === 0 ? (
          <p className={screens.muted}>{t('staff.queueEmpty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('ticket.reference')}</th>
                  <th scope="col">{t('ticket.subject')}</th>
                  <th scope="col">{t('ticket.status')}</th>
                  <th scope="col">{t('staff.priority')}</th>
                  <th scope="col">{t('history.opened')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t('action.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Identifier value={ticket.reference} />
                    </td>
                    {/* The customer's words, so the direction is theirs. */}
                    <td dir="auto">{ticket.subject}</td>
                    <td>
                      <Tag tone={toneFor(ticket.status)}>
                        {t(`status.${toKey(ticket.status)}`, { defaultValue: ticket.status })}
                      </Tag>
                    </td>
                    <td>
                      <Tag tone={ticket.priority === 'urgent' ? 'danger' : 'neutral'}>
                        {t(`priority.${ticket.priority}`, { defaultValue: ticket.priority })}
                      </Tag>
                    </td>
                    <td>
                      <Tag icon={<ClockIcon />}>
                        {formatDate(new Date(ticket.createdAt), preferences)}
                      </Tag>
                    </td>
                    <td>
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
        )}
      </Card>
    </section>
  );
}
