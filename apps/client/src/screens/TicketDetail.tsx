import { formatDateTime, formatNumber, type FormatPreferences } from '@csas/shared';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isUnauthenticated } from '../api/errors.js';
import {
  getAttachments,
  getMessages,
  getTicket,
  reopenTicket,
  transcriptUrl,
  type AttachmentSummary,
  type Message,
  type TicketDetail as Detail,
} from '../api/client.js';
import { Button, Callout, Card, Field, Identifier, Tag } from '../components/index.js';
import { AlertIcon, CheckIcon, ClockIcon } from '../components/icons.js';
import { styles } from '../components/styles.js';
import { useLocale } from '../locale-context.js';
import { screens } from './screen-styles.js';
import { toKey, toneFor } from './History.js';

/**
 * One ticket: the conversation, its files, and what happened to it.
 *
 * The three questions a customer actually has — what did we say, what did I
 * send, and why is it in this state — answered on one screen rather than
 * behind three tabs.
 */

function bytes(size: number, preferences: FormatPreferences): string {
  const kb = size / 1024;
  return kb < 1024
    ? `${formatNumber(Math.round(kb), preferences)} KB`
    : `${formatNumber(Math.round((kb / 1024) * 10) / 10, preferences)} MB`;
}

export function TicketDetail({
  id,
  onBack,
}: {
  readonly id: string;
  readonly onBack: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const preferences: FormatPreferences = { locale };

  const [detail, setDetail] = useState<Detail | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<AttachmentSummary[]>([]);
  const [error, setError] = useState<{ text: string; signIn: boolean } | undefined>();
  const [reopenBody, setReopenBody] = useState('');
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getTicket(id, controller.signal),
      getMessages(id, controller.signal),
      getAttachments(id, controller.signal),
    ]).then(([ticketResult, messageResult, fileResult]) => {
      if (controller.signal.aborted) return;
      if (!ticketResult.ok) {
        setError({
          text: describeError(ticketResult.error, t),
          signIn: isUnauthenticated(ticketResult.error),
        });
        return;
      }
      setDetail(ticketResult.data);
      if (messageResult.ok) setMessages(messageResult.data.messages);
      if (fileResult.ok) setFiles(fileResult.data.attachments);
    });
    return () => {
      controller.abort();
    };
  }, [id]);

  if (error !== undefined) {
    return (
      <section className={screens.stack}>
        <Button onClick={onBack}>{t('detail.back')}</Button>
        <Callout tone={error.signIn ? 'info' : 'danger'}>{error.text}</Callout>
      </section>
    );
  }

  if (!detail) {
    return (
      <p role="status" className={screens.muted}>
        {t('state.loading')}
      </p>
    );
  }

  const { ticket, timeline, reopen } = detail;

  return (
    <section className={screens.stack}>
      <Button onClick={onBack}>{t('detail.back')}</Button>

      <div className={screens.spread}>
        <div>
          <h1 dir="auto">{ticket.subject}</h1>
          <p className={screens.muted}>
            <Identifier value={ticket.reference} /> ·{' '}
            {formatDateTime(new Date(ticket.createdAt), preferences)}
          </p>
        </div>
        <div className={screens.row}>
          <Tag tone={toneFor(ticket.status)}>
            {t(`status.${toKey(ticket.status)}`, { defaultValue: ticket.status })}
          </Tag>
          {/* A link, not a fetch: the transcript is a file, and letting the
              browser download it means no blob juggling and a working
              right-click. */}
          <a className={styles.button} href={transcriptUrl(id, locale)}>
            {t('detail.download')}
          </a>
        </div>
      </div>

      {detail.continues === null ? null : <Callout tone="info">{t('detail.continues')}</Callout>}

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
                <strong>
                  {t(`chat.${message.author === 'customer' ? 'customer' : 'assistant'}`, {
                    defaultValue: message.author,
                  })}
                </strong>
                <span>{formatDateTime(new Date(message.createdAt), preferences)}</span>
                {message.confidence === null ? null : (
                  <Tag>
                    {t('chat.confidence')} {formatNumber(message.confidence, preferences)}
                  </Tag>
                )}
              </div>
              {/* The direction belongs to the message, not the interface: an
                  Arabizi reply resolves left-to-right inside an Arabic page. */}
              <div className={screens.body} dir="auto">
                {message.body}
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card title={t('detail.attachments')} headingLevel="h2">
        {files.length === 0 ? (
          <p className={screens.muted}>{t('detail.noAttachments')}</p>
        ) : (
          <ul className={screens.files}>
            {files.map((file) => (
              <li key={file.id} className={screens.file}>
                <span dir="auto">{file.filename}</span>
                <span className={screens.muted}>{bytes(file.byteSize, preferences)}</span>
                {file.downloadable ? (
                  <Tag tone="success" icon={<CheckIcon />}>
                    {file.mimeType}
                  </Tag>
                ) : (
                  /* A file still being checked, or one whose scan failed, is
                     named but not offered — the server would refuse it
                     anyway, and a dead link is worse than an honest label. */
                  <Tag tone="warning" icon={<ClockIcon />}>
                    {file.scanStatus === 'pending'
                      ? t('detail.scanPending')
                      : t('detail.scanFailed')}
                  </Tag>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('detail.timeline')} headingLevel="h2">
        <ol className={screens.timeline}>
          {timeline.map((entry, index) => (
            <li key={`${entry.status}-${String(index)}`} className={screens.timelineItem}>
              <strong>{t(`status.${toKey(entry.status)}`, { defaultValue: entry.status })}</strong>
              <span className={screens.muted}>
                {formatDateTime(new Date(entry.at), preferences)}
              </span>
              <Tag>
                {t(`chat.${entry.by === 'customer' ? 'customer' : 'assistant'}`, {
                  defaultValue: entry.by,
                })}
              </Tag>
            </li>
          ))}
        </ol>
      </Card>

      {/* The server decides eligibility and says so; the client does not
          re-derive the rule. Two copies of "can this be reopened" drift, and
          the browser's copy is the one nobody re-reads. */}
      {ticket.status === 'closed' ? (
        <Card title={t('detail.reopen')} headingLevel="h2">
          {reopen.ok ? (
            <form
              className={screens.stack}
              onSubmit={(event) => {
                event.preventDefault();
                setReopening(true);
                void reopenTicket(id, reopenBody).then((result) => {
                  setReopening(false);
                  if (result.ok) onBack();
                  else
                    setError({
                      text: describeError(result.error, t),
                      signIn: isUnauthenticated(result.error),
                    });
                });
              }}
            >
              <Field
                label={t('detail.reopenPrompt')}
                dir="auto"
                required
                value={reopenBody}
                onChange={(event) => {
                  setReopenBody(event.target.value);
                }}
              />
              <div>
                <Button type="submit" variant="primary" disabled={reopening || reopenBody === ''}>
                  {t('detail.reopen')}
                </Button>
              </div>
            </form>
          ) : (
            <Callout tone="warning">
              <AlertIcon />{' '}
              {reopen.reason === 'disabled'
                ? t('detail.reopenDisabled')
                : t('detail.reopenWindowPassed', { days: reopen.windowDays ?? 0 })}
            </Callout>
          )}
        </Card>
      ) : null}
    </section>
  );
}
