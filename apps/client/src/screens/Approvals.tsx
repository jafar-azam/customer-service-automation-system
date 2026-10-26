import { useEffect, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/errors.js';
import {
  approveKbEntry,
  getApprovalQueue,
  getKbEntry,
  knowledgeExportUrl,
  rejectKbEntry,
  updateKbEntry,
  type KbEntry,
  type KbVersion,
} from '../api/staff.js';
import { Button, Callout, Card, Identifier, Tag, TextArea } from '../components/index.js';
import { styles } from '../components/styles.js';
import { screens } from './screen-styles.js';

/**
 * The approval queue, which until now only existed as curl commands.
 *
 * Step 17 built the gate — nothing reaches the assistant without a named
 * person approving it — and every approval so far was made from a terminal.
 * A control only an engineer can operate is not a control the business has.
 *
 * **Rejecting needs a reason and the screen enforces it before the server
 * does**, not instead of it: the server requires the note too, and finding
 * that out through a 400 after writing nothing is a worse way to learn it.
 *
 * **The body is editable here.** Most of this queue is imported questions
 * whose answers were deliberately not taken (step 16), so "approve" without
 * "write the answer first" would approve a placeholder — and the importer
 * refuses to let that happen, which would be a dead end on this screen.
 */
export function Approvals(): JSX.Element {
  const { t } = useTranslation();

  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<{ entry: KbEntry; versions: KbVersion[] } | undefined>();
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();

  async function loadQueue(): Promise<void> {
    const result = await getApprovalQueue();
    if (!result.ok) {
      setError(describeError(result.error, t));
      return;
    }
    setEntries(result.data.entries);
    setTotal(result.data.total);
  }

  useEffect(() => {
    void loadQueue();
    /* `t` only: the queue is reloaded explicitly after every decision, so a
       dependency on the entries would re-fetch in a loop. */
  }, [t]);

  async function open(id: string): Promise<void> {
    setError(undefined);
    setDone(undefined);
    const result = await getKbEntry(id);
    if (!result.ok) {
      setError(describeError(result.error, t));
      return;
    }
    setSelected(result.data);
    setDraft({ title: result.data.entry.title, body: result.data.entry.body });
    setNote('');
  }

  async function decide(action: 'approve' | 'reject'): Promise<void> {
    if (!selected) return;
    const id = selected.entry.id;
    setBusy(true);
    setError(undefined);

    /* Saved first when it changed, because approving sends the *stored* text
       to customers — not whatever is in this box. Approving an edit that was
       never written would publish the old answer while the screen showed the
       new one. */
    if (
      action === 'approve' &&
      (draft.title !== selected.entry.title || draft.body !== selected.entry.body)
    ) {
      const saved = await updateKbEntry(id, {
        title: draft.title,
        body: draft.body,
        language: selected.entry.language,
        ...(selected.entry.question === null ? {} : { question: selected.entry.question }),
        changeNote: 'answer written in the approval queue',
      });
      if (!saved.ok) {
        setBusy(false);
        setError(describeError(saved.error, t));
        return;
      }
    }

    const result = action === 'approve' ? await approveKbEntry(id) : await rejectKbEntry(id, note);
    setBusy(false);

    if (!result.ok) {
      setError(describeError(result.error, t));
      return;
    }
    setDone(t(action === 'approve' ? 'approvals.approved' : 'approvals.rejected'));
    setSelected(undefined);
    await loadQueue();
  }

  return (
    <section className={screens.stack}>
      <div className={screens.spread}>
        <h1>{t('approvals.title')}</h1>
        {/* Links, not fetches: the export is a file the reviewer keeps, and
            letting the browser download it means a working right-click. */}
        <a className={styles.button} href={knowledgeExportUrl('pending_review')}>
          {t('approvals.export')}
        </a>
      </div>

      {error === undefined ? null : <Callout tone="danger">{error}</Callout>}
      {done === undefined ? null : <Callout tone="success">{done}</Callout>}

      <Card title={t('approvals.waiting', { count: total })} headingLevel="h2">
        {entries.length === 0 ? (
          <p className={screens.muted}>{t('approvals.empty')}</p>
        ) : (
          <ul className={screens.files}>
            {entries.slice(0, 50).map((entry) => (
              <li key={entry.id} className={screens.file}>
                <span dir="auto">{entry.question ?? entry.title}</span>
                <Tag>
                  {entry.language === 'ar' ? t('approvals.arabic') : t('approvals.english')}
                </Tag>
                <Button
                  aria-label={t('approvals.reviewNamed', { title: entry.title })}
                  onClick={() => {
                    void open(entry.id);
                  }}
                >
                  {t('approvals.review')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected === undefined ? null : (
        <Card title={t('approvals.reviewing')} headingLevel="h2">
          <div className={screens.stack}>
            <p className={screens.muted}>
              <Identifier value={`v${String(selected.entry.version)}`} /> ·{' '}
              {t('approvals.source', { source: selected.entry.source })}
              {selected.entry.publishable ? null : ` · ${t('approvals.notPublishable')}`}
            </p>

            {selected.entry.question === null ? null : (
              <p dir="auto">
                <strong>{selected.entry.question}</strong>
              </p>
            )}

            <TextArea
              label={t('approvals.entryTitle')}
              dir="auto"
              rows={2}
              value={draft.title}
              onChange={(event) => {
                setDraft((current) => ({ ...current, title: event.target.value }));
              }}
            />
            <TextArea
              label={t('approvals.entryBody')}
              hint={t('approvals.bodyHint')}
              dir="auto"
              rows={8}
              value={draft.body}
              onChange={(event) => {
                setDraft((current) => ({ ...current, body: event.target.value }));
              }}
            />

            <TextArea
              label={t('approvals.note')}
              hint={t('approvals.noteHint')}
              rows={2}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />

            <div className={screens.row}>
              <Button
                variant="primary"
                disabled={busy || draft.title.trim() === '' || draft.body.trim() === ''}
                onClick={() => {
                  void decide('approve');
                }}
              >
                {t('approvals.approve')}
              </Button>
              {/* Disabled without a reason, which the server also requires —
                  the screen says so before the request rather than after. */}
              <Button
                disabled={busy || note.trim() === ''}
                onClick={() => {
                  void decide('reject');
                }}
              >
                {t('approvals.reject')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setSelected(undefined);
                }}
              >
                {t('action.cancel')}
              </Button>
            </div>

            {selected.versions.length === 0 ? null : (
              <details>
                <summary>{t('approvals.history', { count: selected.versions.length })}</summary>
                <ul className={screens.files}>
                  {selected.versions.map((version) => (
                    <li key={version.version} className={screens.file}>
                      <Identifier value={`v${String(version.version)}`} />
                      <span dir="auto">{version.body.slice(0, 120)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Card>
      )}
    </section>
  );
}
