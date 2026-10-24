import { typedStyles } from '../css-module.js';
import raw from './components.module.css';

/** The class names in `components.module.css`. See `css-module.ts`. */
export const CLASS_NAMES = [
  'button',
  'primary',
  'secondary',
  'quiet',
  'card',
  'cardTitle',
  'field',
  'label',
  'optional',
  'input',
  'hint',
  'error',
  'identifier',
  'tag',
  'tagDanger',
  'tagWarning',
  'tagSuccess',
  'tagInfo',
  'callout',
  'calloutDanger',
  'calloutWarning',
  'calloutSuccess',
  'calloutIcon',
  'segmented',
  'segment',
  'tableWrap',
  'table',
] as const;

export type ClassName = (typeof CLASS_NAMES)[number];

export const styles = typedStyles(raw, CLASS_NAMES);
