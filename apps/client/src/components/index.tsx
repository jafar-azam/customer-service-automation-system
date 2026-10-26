import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  JSX,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { styles } from './styles.js';
import { AlertIcon, CheckIcon, InfoIcon } from './icons.js';

/* ── Button ──────────────────────────────────────────────────────────────── */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'quiet';
}

/**
 * `type="button"` by default.
 *
 * HTML's default is `submit`, so a button placed in a form to open a dialog
 * submits the form instead. It is the single most common React form bug and
 * the fix belongs in the component, not in every call site.
 */
export function Button({ variant = 'secondary', type, ...props }: ButtonProps): JSX.Element {
  return (
    <button type={type ?? 'button'} className={`${styles.button} ${styles[variant]}`} {...props} />
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */

export function Card({
  title,
  headingLevel: Heading = 'h2',
  children,
}: {
  readonly title?: string;
  readonly headingLevel?: 'h2' | 'h3' | 'h4';
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className={styles.card}>
      {title === undefined ? null : <Heading className={styles.cardTitle}>{title}</Heading>}
      {children}
    </section>
  );
}

/* ── Identifier ──────────────────────────────────────────────────────────── */

/**
 * BIDI-02. A ticket reference, phone number, email or URL.
 *
 * `<bdi>` rather than a styled `<span>`: the element isolates the token in the
 * bidi algorithm itself, so it survives selection, copy and export. A CSS-only
 * `direction: ltr` looks right and copies wrong.
 *
 * The value is never transformed — not digit-normalised, not case-folded, not
 * marked up internally (LOC-05). What is displayed is what is on the clipboard.
 */
export function Identifier({ value }: { readonly value: string }): JSX.Element {
  return (
    <bdi dir="ltr" className={styles.identifier}>
      {value}
    </bdi>
  );
}

/* ── Field ───────────────────────────────────────────────────────────────── */

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly optionalLabel?: string;
}

/**
 * A label that is always visible and always associated.
 *
 * No placeholder-as-label: the placeholder disappears the moment someone
 * types, which removes the only description of the field exactly when they
 * need it, and it fails 3.3.2.
 *
 * `aria-describedby` points at the hint and the error together, so a screen
 * reader announces the requirement and the failure rather than only the
 * failure. `aria-invalid` is what carries the error to assistive technology —
 * the red border alone would not.
 */
export function Field({
  label,
  hint,
  error,
  optionalLabel,
  required,
  ...props
}: FieldProps): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((value) => value !== null)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {!required && optionalLabel !== undefined ? (
          <span className={styles.optional}> ({optionalLabel})</span>
        ) : null}
      </label>
      <input
        id={id}
        className={styles.input}
        required={required}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        {...props}
      />
      {hint === undefined ? null : (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {/* `role="alert"` so a validation failure is announced when it appears,
          rather than only being found by someone who goes looking for it. */}
      {error === undefined ? null : (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* ── Text area ───────────────────────────────────────────────────────────── */

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly optionalLabel?: string;
}

/**
 * The same contract as `Field`, for text that runs to more than a line.
 *
 * A separate component rather than a `multiline` flag on `Field`, because the
 * element is genuinely different — `<textarea>` takes its value as a child in
 * plain HTML, has `rows` rather than `size`, and its props type is not
 * `InputHTMLAttributes`. A flag would mean a union of two prop types that
 * accepts combinations neither element supports.
 *
 * Everything else is deliberately identical: the label is always visible and
 * always associated, `aria-describedby` carries hint and error together, and
 * `aria-invalid` is what reaches assistive technology, since a red border does
 * not.
 */
export function TextArea({
  label,
  hint,
  error,
  optionalLabel,
  required,
  rows = 4,
  ...props
}: TextAreaProps): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((value) => value !== null)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {!required && optionalLabel !== undefined ? (
          <span className={styles.optional}> ({optionalLabel})</span>
        ) : null}
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={rows}
        required={required}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        {...props}
      />
      {hint === undefined ? null : (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {error === undefined ? null : (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* ── Tag ─────────────────────────────────────────────────────────────────── */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const tagTone: Record<Tone, string | undefined> = {
  neutral: undefined,
  info: styles.tagInfo,
  success: styles.tagSuccess,
  warning: styles.tagWarning,
  danger: styles.tagDanger,
};

export function Tag({
  tone = 'neutral',
  icon,
  children,
}: {
  readonly tone?: Tone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <span className={`${styles.tag} ${tagTone[tone] ?? ''}`}>
      {icon}
      {children}
    </span>
  );
}

/* ── Callout ─────────────────────────────────────────────────────────────── */

const calloutTone: Record<Exclude<Tone, 'neutral'>, string | undefined> = {
  info: undefined,
  success: styles.calloutSuccess,
  warning: styles.calloutWarning,
  danger: styles.calloutDanger,
};

const calloutIcon = {
  info: InfoIcon,
  success: CheckIcon,
  warning: AlertIcon,
  danger: AlertIcon,
} as const;

/**
 * `role="status"` for information, `role="alert"` for a problem.
 *
 * The difference is interruption: `alert` is assertive and cuts across what a
 * screen reader is currently saying, which is right for a failure and
 * exhausting for anything else. Using `alert` everywhere is how a screen
 * reader becomes unusable.
 */
export function Callout({
  tone = 'info',
  children,
}: {
  readonly tone?: Exclude<Tone, 'neutral'>;
  readonly children: ReactNode;
}): JSX.Element {
  const IconComponent = calloutIcon[tone];
  return (
    <div
      className={`${styles.callout} ${calloutTone[tone] ?? ''}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <IconComponent className={styles.calloutIcon} />
      <div>{children}</div>
    </div>
  );
}

/* ── Segmented control ───────────────────────────────────────────────────── */

export interface Segment<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * A small set of exclusive choices — theme, language.
 *
 * Buttons with `aria-pressed` inside a labelled `role="group"`, not a radio
 * group: each option applies immediately rather than waiting for a submit, and
 * `aria-pressed` is what says "this one is on" without implying a form.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly Segment<T>[];
  readonly onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segment}
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A one-to-five rating.
 *
 * Native radios in a `fieldset`, not a row of toggle buttons. The semantics
 * are the reason: `SegmentedControl` above uses `aria-pressed`, which says
 * "this button is on" — a screen reader reading five of those announces five
 * independent toggles. A radio group announces "3 of 5", arrow keys move
 * between the options, and the browser enforces that only one is chosen. None
 * of that has to be written here, which is the point.
 *
 * The numbers are labelled rather than drawn as stars: a star is an image of a
 * quantity, and this project does not use emoji as icons. Each option also
 * carries a text label for the extremes, so "1" is not left to mean whatever
 * the reader assumes.
 */
export function RatingScale({
  legend,
  name,
  value,
  onChange,
  labelFor,
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: number | undefined;
  readonly onChange: (value: number) => void;
  /** The accessible name for each score — "1, not helpful at all". */
  readonly labelFor: (score: number) => string;
}): JSX.Element {
  return (
    <fieldset className={styles.scale}>
      <legend className={styles.scaleLegend}>{legend}</legend>
      {[1, 2, 3, 4, 5].map((score) => {
        const id = `${name}-${String(score)}`;
        return (
          <span key={score}>
            {/* The full sentence as the input's `aria-label`, which outranks the
                `<label>` element in the accessible-name calculation. The first
                version kept a visually-hidden copy of the sentence *inside*
                the label next to an `aria-hidden` number, and the two were
                concatenated into "2, 2 not very helpful" — `aria-hidden` is
                not reliably excluded from a name built from label contents. */}
            <input
              className={styles.scaleInput}
              type="radio"
              id={id}
              name={name}
              value={score}
              aria-label={labelFor(score)}
              checked={value === score}
              onChange={() => {
                onChange(score);
              }}
            />
            <label className={styles.scaleOption} htmlFor={id}>
              {score}
            </label>
          </span>
        );
      })}
    </fieldset>
  );
}
