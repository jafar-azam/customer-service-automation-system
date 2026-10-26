import { detectInputForm } from '@csas/shared';
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { askAssistant, createTicket } from '../api/client.js';
import { describeError, isUnauthenticated } from '../api/errors.js';
import { Button, Callout, Card, Field, TextArea } from '../components/index.js';
import { screens } from './screen-styles.js';

/**
 * Opening a ticket, and putting the question to the assistant.
 *
 * Until this screen existed the assistant was unreachable from the interface.
 * Everything behind it worked — retrieval, citation enforcement, the
 * confidence floor, the escalation path — and a customer had no way to say a
 * single word to it. Step 15 built the engine and no pedal.
 *
 * **Creating and asking are one action here and two requests underneath.**
 * The server keeps them apart deliberately: a generation takes seconds on a
 * local model, so `POST /tickets` stays fast and `POST /ask` is its own round
 * trip. Putting both behind one button is the customer's view of it — they
 * described a problem, they expect an answer — while leaving the server free
 * to stream the reply later without the screen changing.
 *
 * **The ticket survives a failed generation.** If the assistant call fails,
 * the ticket is already created and the customer is taken to it. Rolling back
 * would throw away what they wrote because a model was slow, and an
 * unanswered ticket is a normal state this system already handles — it waits
 * for a person.
 */

export function NewTicket({
  onOpened,
  onCancel,
}: {
  readonly onOpened: (id: string) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const { t } = useTranslation();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);

    /* Detected from what they actually typed, not asked. The script settles
       Arabizi, English and code-switching; Arabic script stays `unknown`
       because which register it is, is step 19's question. */
    const created = await createTicket({
      subject,
      body,
      inputForm: detectInputForm(`${subject} ${body}`),
    });

    if (!created.ok) {
      setBusy(false);
      setError(describeError(created.error, t));
      if (isUnauthenticated(created.error)) onCancel();
      return;
    }

    const id = created.data.ticket.id;

    /* The answer is not awaited for its result — whatever happens, the next
       screen shows the conversation, and an escalation is as valid an outcome
       as an answer. Errors are swallowed here on purpose: the ticket exists,
       and reporting a failed generation as a failed submission would tell the
       customer their problem was not recorded when it was. */
    await askAssistant(id, body);

    setBusy(false);
    onOpened(id);
  };

  return (
    <section className={screens.stack}>
      <Button onClick={onCancel}>{t('newTicket.cancel')}</Button>

      <h1>{t('newTicket.title')}</h1>

      <Card title={t('newTicket.cardTitle')} headingLevel="h2">
        <form
          className={screens.stack}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            label={t('newTicket.subject')}
            dir="auto"
            required
            maxLength={200}
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
            }}
          />

          {/* `dir="auto"` on the box itself: someone writing Arabic gets a
              right-to-left field inside an English page, and someone writing
              Arabizi gets a left-to-right one inside an Arabic page. The
              direction belongs to what is being typed. */}
          <TextArea
            label={t('newTicket.body')}
            hint={t('newTicket.bodyHint')}
            dir="auto"
            required
            rows={6}
            maxLength={20_000}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />

          {error === undefined ? null : <Callout tone="danger">{error}</Callout>}

          <div className={screens.row}>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || subject.trim() === '' || body.trim() === ''}
            >
              {busy ? t('newTicket.asking') : t('newTicket.submit')}
            </Button>
          </div>

          {/* Said before they wait, not after. A local model takes seconds,
              and a button that sits there with no explanation reads as a
              broken page. */}
          {busy ? (
            <p role="status" className={screens.muted}>
              {t('newTicket.askingHint')}
            </p>
          ) : null}
        </form>
      </Card>
    </section>
  );
}
