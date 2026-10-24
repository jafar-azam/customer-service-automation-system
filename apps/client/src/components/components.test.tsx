import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../test/axe.js';
import { Button, Callout, Card, Field, Identifier, SegmentedControl, Tag } from './index.js';
import { AlertIcon, ClockIcon } from './icons.js';
import { CLASS_NAMES, styles } from './styles.js';

describe('Button', () => {
  /* HTML defaults a button inside a form to `submit`, so a button that opens a
     dialog submits the form instead. The fix belongs in the component. */
  it('defaults to type="button", not submit', () => {
    render(<Button>Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('type', 'button');
  });

  it('still allows an explicit submit', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('type', 'submit');
  });

  it('has no violations in any variant', async () => {
    const { container } = render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="quiet">Quiet</Button>
        <Button disabled>Disabled</Button>
      </>,
    );
    await expectNoViolations(container);
  });
});

describe('Field', () => {
  it('associates its label with its input', () => {
    render(<Field label="Phone number" />);
    expect(screen.getByLabelText('Phone number')).toBeDefined();
  });

  /* `aria-invalid` is what carries the failure to assistive technology; the
     red border alone is invisible to it. `role="alert"` makes the message
     announced when it appears rather than found by going looking. */
  it('marks an invalid field and announces the reason', () => {
    render(<Field label="Phone number" error="That is not a valid phone number." />);
    const input = screen.getByLabelText('Phone number');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('not a valid phone number');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
  });

  /* Both, not just the error: a screen reader should hear the requirement and
     the failure, or the user is told they are wrong without being told what
     would be right. */
  it('describes a field by its hint and its error together', () => {
    render(<Field label="Phone number" hint="Lebanese mobile" error="Too short." />);
    const describedBy =
      screen.getByLabelText('Phone number').getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
  });

  it('leaves aria-invalid off when the field is fine', () => {
    render(<Field label="Phone number" hint="Lebanese mobile" />);
    expect(screen.getByLabelText('Phone number').getAttribute('aria-invalid')).toBeNull();
  });

  it('has no violations with or without an error', async () => {
    const { container } = render(
      <>
        <Field label="Phone number" hint="Lebanese mobile" />
        <Field label="Email" error="Required." />
      </>,
    );
    await expectNoViolations(container);
  });
});

describe('Identifier', () => {
  /* BIDI-02. `<bdi>` isolates in the algorithm itself, so the token survives
     selection and copy; a CSS-only `direction: ltr` looks right and copies
     wrong. */
  it('is an isolated LTR bdi carrying the value unchanged', () => {
    const { container } = render(<Identifier value="CSAS-001241" />);
    const element = container.querySelector('bdi');
    expect(element?.getAttribute('dir')).toBe('ltr');
    expect(element?.textContent).toBe('CSAS-001241');
  });

  /* LOC-05: what is displayed is what is on the clipboard. No normalisation,
     no case folding, no markup inside the token. */
  it('does not transform the value', () => {
    const odd = 'KB-0412';
    const { container } = render(<Identifier value={odd} />);
    expect(container.querySelector('bdi')?.innerHTML).toBe(odd);
  });
});

describe('Callout', () => {
  /* `alert` is assertive and interrupts whatever a screen reader is saying.
     Right for a failure, exhausting for anything else — using it everywhere is
     how a screen reader becomes unusable. */
  it('interrupts only for a problem', () => {
    const { rerender } = render(<Callout tone="danger">Payment failed.</Callout>);
    expect(screen.getByRole('alert')).toBeDefined();

    rerender(<Callout tone="info">Your ticket was received.</Callout>);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has no violations in any tone', async () => {
    const { container } = render(
      <>
        <Callout tone="info">Info</Callout>
        <Callout tone="success">Success</Callout>
        <Callout tone="warning">Warning</Callout>
        <Callout tone="danger">Danger</Callout>
      </>,
    );
    await expectNoViolations(container);
  });
});

describe('SegmentedControl', () => {
  it('labels the group and marks the active option', () => {
    render(
      <SegmentedControl
        label="Theme"
        value="dark"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('group', { name: 'Theme' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('has no violations', async () => {
    const { container } = render(
      <SegmentedControl
        label="Language"
        value="ar-LB"
        options={[
          { value: 'ar-LB', label: 'العربية' },
          { value: 'en-LB', label: 'English' },
        ]}
        onChange={() => undefined}
      />,
    );
    await expectNoViolations(container);
  });
});

describe('icons', () => {
  /* An icon beside a label is decoration and must be hidden, or a screen
     reader reads the label twice. An icon standing alone needs a name. */
  it('is hidden from assistive technology by default', () => {
    const { container } = render(<ClockIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('becomes an image with a name when given a title', async () => {
    const { container } = render(<AlertIcon title="Deadline breached" />);
    expect(screen.getByRole('img', { name: 'Deadline breached' })).toBeDefined();
    await expectNoViolations(container);
  });
});

describe('Card and Tag', () => {
  it('has no violations', async () => {
    const { container } = render(
      <Card title="Support tickets">
        <Tag tone="warning" icon={<ClockIcon />}>
          00:12
        </Tag>
      </Card>,
    );
    await expectNoViolations(container);
  });

  /* A card's heading must fit the page's outline rather than always being an
     h2, or the document grows two competing hierarchies. */
  it('lets the caller place the heading in the outline', () => {
    render(
      <Card title="Nested" headingLevel="h3">
        body
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Nested' })).toBeDefined();
  });
});

describe('the typed class list', () => {
  /* The list in styles.ts is what makes a class-name typo a compile error
     instead of an unstyled element. It is hand-written, so it can rot — this
     compares it against the stylesheet it claims to describe. */
  it('names every class the stylesheet exports, and no others', () => {
    expect(Object.keys(styles).sort()).toEqual([...CLASS_NAMES].sort());
  });

  /* A name in the list that the stylesheet does not define compiles fine and
     renders an element with no styling. */
  it('resolves every name to a real class', () => {
    for (const name of CLASS_NAMES) {
      expect(styles[name], name).toBeTruthy();
    }
  });
});
