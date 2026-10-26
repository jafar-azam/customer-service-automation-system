import { formatDateTime, formatNumber, type FormatPreferences } from '@csas/shared';
import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isUnauthenticated } from '../api/errors.js';
import {
  confirmResolution,
  getAttachments,
  getMessages,
  getTicket,
  rateTicket,
  reopenTicket,
  transcriptUrl,
  type AttachmentSummary,
  type Message,
  type TicketDetail as Detail,
} from '../api/client.js';
import { Button, Callout, Card, Field, Identifier, RatingScale, Tag } from '../components/index.js';
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
  const [score, setScore] = useState<number | undefined>();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  /* What the server said happened, not what the client assumes: a `false`
     answer may or may not find an agent to escalate to, and the message the
     customer reads has to match. */
  const [outcome, setOutcome] = useState<'resolved' | 'escalated' | 'rated' | undefined>();

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

  /* `rateScore_one` … `rateScore_five`. Spelled out rather than interpolated
     because each one is a sentence a translator writes, not a number with a
     word stuck to it. */
  const SCORE_KEYS = ['one', 'two', 'three', 'four', 'five'] as const;
  const scoreLabel = (value: number): string =>
    t(`detail.rateScore_${SCORE_KEYS[value - 1] ?? 'three'}`);

  function fail(error: Parameters<typeof describeError>[0]): void {
    setError({ text: describeError(error, t), signIn: isUnauthenticated(error) });
  }

  /* Both answers re-read the ticket rather than patching local state from the
     response: `confirm` can change the status, the timeline and the eligibility
     at once, and reconstructing three of those in the browser is how a screen
     starts disagreeing with the database. */
  function answer(solved: boolean): void {
    setBusy(true);
    void confirmResolution(id, {
      solved,
      ...(score === undefined ? {} : { score }),
      ...(comment === '' ? {} : { comment }),
    }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setOutcome(result.data.escalated ? 'escalated' : 'resolved');
      void getTicket(id).then((fresh) => {
        if (fresh.ok) setDetail(fresh.data);
      });
      void getMessages(id).then((fresh) => {
        if (fresh.ok) setMessages(fresh.data.messages);
      });
    });
  }

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
                  {/* The author as recorded, not "customer or assistant".
                      Collapsing `agent` into `assistant` told the customer a
                      machine had written a human's reply, which is the one
                      distinction this product exists to keep honest. */}
                  {t(`chat.${message.author}`, { defaultValue: message.author })}
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
              {/* What the answer was grounded in. The server refuses to send
                  an assistant answer that cites nothing, and showing the
                  citation is what turns that guarantee into something a
                  reader can check. The version is part of it: the entry may
                  have been rewritten since, and this names what was used. */}
              {message.citations === undefined || message.citations.length === 0 ? null : (
                <p className={screens.muted}>
                  {t('chat.basedOn')}{' '}
                  {message.citations.map((citation, position) => (
                    <span key={`${citation.title ?? ''}-${String(position)}`}>
                      {position === 0 ? '' : '، '}
                      {/* `<bdi>` and not a plain span: an Arabic title sitting
                          inside an English line is a bidi boundary, and
                          without isolation a title that ends in Latin text or
                          a digit reorders the parenthetical after it — the
                          version ends up on the wrong side of the title. This
                          is the one element whose whole job is to stop that. */}
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
                {/* The timeline records `staff`, not which person — so it maps
                    to the agent label rather than to the assistant's. */}
                {t(`chat.${entry.by === 'staff' ? 'agent' : entry.by}`, {
                  defaultValue: entry.by,
                })}
              </Tag>
            </li>
          ))}
        </ol>
      </Card>

      {/* Same rule as `reopen` below: the server says whether there is
          anything to confirm, and the client draws what it is told. */}
      {detail.confirm?.ok === true && outcome === undefined ? (
        <Card title={t('detail.confirmTitle')} headingLevel="h2">
          <div className={screens.stack}>
            <p>{t('detail.confirmPrompt')}</p>

            <RatingScale
              legend={t('detail.rateLegend')}
              name="score"
              value={score}
              onChange={setScore}
              labelFor={scoreLabel}
            />

            <Field
              label={t('detail.rateComment')}
              dir="auto"
              optionalLabel={t('field.optional')}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
            />

            {/* Two buttons, not a yes with a checkbox. "No" is a real answer
                that escalates to a person, so it gets equal weight on the
                screen — making it the quiet option is how a product collects
                satisfaction scores that mean nothing. */}
            <div className={screens.row}>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  answer(true);
                }}
              >
                {t('detail.confirmYes')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  answer(false);
                }}
              >
                {t('detail.confirmNo')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Announced, not only drawn — the card the customer was reading has
          just been replaced by this. `Callout` already carries `role="status"`
          for every tone but `danger`, so wrapping it in another one nests two
          live regions and makes "the status" ambiguous to both a screen reader
          and a test. */}
      {outcome === undefined ? null : (
        <Callout tone={outcome === 'escalated' ? 'info' : 'success'}>
          {outcome === 'escalated'
            ? t('detail.confirmEscalated')
            : outcome === 'rated'
              ? t('detail.rateSaved')
              : t('detail.confirmThanks')}
        </Callout>
      )}

      {/* A rating on its own, once there is nothing left to confirm. Someone
          may want to say how it went days after an agent closed it. */}
      {detail.confirm?.ok === false && outcome === undefined && ticket.status !== 'open' ? (
        <Card title={t('detail.rateTitle')} headingLevel="h2">
          <form
            className={screens.stack}
            onSubmit={(event) => {
              event.preventDefault();
              if (score === undefined) return;
              setBusy(true);
              void rateTicket(id, score, comment === '' ? undefined : comment).then((result) => {
                setBusy(false);
                if (result.ok) setOutcome('rated');
                else fail(result.error);
              });
            }}
          >
            <RatingScale
              legend={t('detail.rateLegend')}
              name="score-only"
              value={score}
              onChange={setScore}
              labelFor={scoreLabel}
            />
            <Field
              label={t('detail.rateComment')}
              dir="auto"
              optionalLabel={t('field.optional')}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
            />
            <div>
              <Button type="submit" variant="primary" disabled={busy || score === undefined}>
                {t('detail.rateSubmit')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

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
