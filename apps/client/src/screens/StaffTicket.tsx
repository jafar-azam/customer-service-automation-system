import { formatDateTime, formatNumber, type FormatPreferences } from '@csas/shared';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message, TicketSummary, TimelineEntry } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { getStaffMessages, getStaffTicket, replyToTicket, transitionTicket } from '../api/staff.js';
import { Button, Callout, Card, Identifier, Tag, TextArea } from '../components/index.js';
import { useLocale } from '../locale-context.js';
import { screens } from './screen-styles.js';
import { toKey, toneFor } from './History.js';

/**
 * One ticket, as the person answering it sees it.
 *
 * Two things differ from the customer's view of the same ticket, and both come
 * from the server rather than from a flag here.
 *
 * **Internal notes are visible**, and marked. A note that looks like a reply is
 * the one mistake on this screen that reaches a customer, so it is labelled on
 * the message and the control that writes it is a separate button rather than
 * a checkbox next to "send".
 *
 * **The allowed transitions are the server's list.** The state machine is not
 * restated here — step 11 keeps it in one place, and a second copy in the
 * browser is the copy nobody re-reads when the first one changes.
 */
export function StaffTicket({
  id,
  onBack,
}: {
  readonly id: string;
  readonly onBack: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const preferences: FormatPreferences = { locale };

  const [ticket, setTicket] = useState<TicketSummary | undefined>();
  const [transitions, setTransitions] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function load(): Promise<void> {
    const [detail, conversation] = await Promise.all([getStaffTicket(id), getStaffMessages(id)]);
    if (!detail.ok) {
      setError(describeError(detail.error, t));
      return;
    }
    setTicket(detail.data.ticket);
    setTransitions(detail.data.allowedTransitions);
    setTimeline(detail.data.timeline);
    if (conversation.ok) setMessages(conversation.data.messages);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function send(internal: boolean): Promise<void> {
    const text = draft.trim();
    if (text === '') return;
    setBusy(true);
    setError(undefined);
    const result = await replyToTicket(id, text, internal);
    setBusy(false);
    if (!result.ok) {
      setError(describeError(result.error, t));
      return;
    }
    setDraft('');
    await load();
  }

  async function move(to: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    const result = await transitionTicket(id, to);
    setBusy(false);
    if (!result.ok) {
      setError(describeError(result.error, t));
      return;
    }
    await load();
  }

  if (!ticket) {
    return error === undefined ? (
      <p role="status" className={screens.muted}>
        {t('state.loading')}
      </p>
    ) : (
      <Callout tone="danger">{error}</Callout>
    );
  }

  return (
    <section className={screens.stack}>
      <Button onClick={onBack}>{t('staff.backToQueue')}</Button>

      <div className={screens.spread}>
        <div>
          <h1 dir="auto">{ticket.subject}</h1>
          <p className={screens.muted}>
            <Identifier value={ticket.reference} /> ·{' '}
            {formatDateTime(new Date(ticket.createdAt), preferences)}
          </p>
        </div>
        <Tag tone={toneFor(ticket.status)}>
          {t(`status.${toKey(ticket.status)}`, { defaultValue: ticket.status })}
        </Tag>
      </div>

      {error === undefined ? null : <Callout tone="danger">{error}</Callout>}

      <Card title={t('detail.conversation')} headingLevel="h2">
        <div className={screens.stack}>
          {messages.map((message) => (
            <article
              key={message.id}
              className={`${screens.message} ${
                message.author === 'customer' ? screens.fromCustomer : screens.fromAgent
              }`}
            >
              <div className={screens.who}>
                <strong>{t(`chat.${message.author}`, { defaultValue: message.author })}</strong>
                <span>{formatDateTime(new Date(message.createdAt), preferences)}</span>
                {message.confidence === null ? null : (
                  <Tag>
                    {t('chat.confidence')} {formatNumber(message.confidence, preferences)}
                  </Tag>
                )}
                {/* The label that keeps a note from reading as a reply. */}
                {message.internal ? <Tag tone="warning">{t('staff.internalNote')}</Tag> : null}
              </div>
              <div className={screens.body} dir="auto">
                {message.body}
              </div>
              {message.citations === undefined || message.citations.length === 0 ? null : (
                <p className={screens.muted}>
                  {t('chat.basedOn')}{' '}
                  {message.citations.map((citation, position) => (
                    <span key={`${citation.title ?? ''}-${String(position)}`}>
                      {position === 0 ? '' : '، '}
                      <bdi>{citation.title ?? ''}</bdi>
                      {citation.version === null
                        ? null
                        : ` ${t('chat.version', {
                            version: formatNumber(citation.version, preferences),
                          })}`}
                    </span>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      </Card>

      <Card title={t('staff.respond')} headingLevel="h2">
        <div className={screens.stack}>
          <TextArea
            label={t('chat.composerLabel')}
            placeholder={t('chat.composerPlaceholder')}
            dir="auto"
            rows={5}
            maxLength={20_000}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          {/* Two buttons rather than a checkbox beside one: posting a note as
              a reply is the single mistake on this screen a customer sees, and
              a checkbox is the control most easily left in its last state. */}
          <div className={screens.row}>
            <Button
              variant="primary"
              disabled={busy || draft.trim() === ''}
              onClick={() => {
                void send(false);
              }}
            >
              {t('staff.sendReply')}
            </Button>
            <Button
              disabled={busy || draft.trim() === ''}
              onClick={() => {
                void send(true);
              }}
            >
              {t('staff.addNote')}
            </Button>
          </div>
          <p className={screens.muted}>{t('staff.noteHint')}</p>
        </div>
      </Card>

      {transitions.length === 0 ? null : (
        <Card title={t('staff.moveTo')} headingLevel="h2">
          <div className={screens.row}>
            {transitions.map((to) => (
              <Button
                key={to}
                disabled={busy}
                onClick={() => {
                  void move(to);
                }}
              >
                {t(`status.${toKey(to)}`, { defaultValue: to })}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Card title={t('detail.timeline')} headingLevel="h2">
        <ol className={screens.timeline}>
          {timeline.map((entry, index) => (
            <li key={`${entry.status}-${String(index)}`} className={screens.timelineItem}>
              <strong>{t(`status.${toKey(entry.status)}`, { defaultValue: entry.status })}</strong>
              <span className={screens.muted}>
                {formatDateTime(new Date(entry.at), preferences)}
              </span>
              <Tag>
                {t(`chat.${entry.by === 'staff' ? 'agent' : entry.by}`, { defaultValue: entry.by })}
              </Tag>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
