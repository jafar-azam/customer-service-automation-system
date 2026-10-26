import { typedStyles } from '../css-module.js';
import raw from './screens.module.css';

/** The class names in `screens.module.css`. See `css-module.ts`. */
export const SCREEN_CLASS_NAMES = [
  'filters',
  'field',
  'muted',
  'stack',
  'row',
  'spread',
  'message',
  'fromCustomer',
  'fromAgent',
  'who',
  'body',
  'timeline',
  'timelineItem',
  'files',
  'file',
] as const;

export const screens = typedStyles(raw, SCREEN_CLASS_NAMES);
