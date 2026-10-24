import type { JSX, SVGProps } from 'react';

/**
 * Inline SVG, never emoji.
 *
 * An emoji is a *character*: a screen reader reads its CLDR name aloud
 * ("warning sign"), it changes shape between platforms, and it cannot inherit
 * `currentColor`. These are `aria-hidden` by default because an icon beside a
 * label is decoration — the label is the accessible name. An icon used alone
 * takes a `title`, and A11Y-02 asserts that it has one.
 */

type IconProps = SVGProps<SVGSVGElement> & { readonly title?: string };

function Icon({ title, children, ...props }: IconProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title === undefined}
      role={title === undefined ? undefined : 'img'}
      {...props}
    >
      {title === undefined ? null : <title>{title}</title>}
      {children}
    </svg>
  );
}

export const ClockIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  </Icon>
);

export const AlertIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  </Icon>
);

export const CheckIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const InfoIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" />
    </>
  </Icon>
);

/* Deliberately not mirrored for RTL, and the reason is worth stating: an
   upload arrow points away from the device in every writing direction.
   Material's guidance mirrors *navigation* icons, not icons whose meaning is
   physical. CSS-04 keeps the registry of which is which. */
export const SendIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m4 4 16 8-16 8 3-8Z" />
  </Icon>
);
