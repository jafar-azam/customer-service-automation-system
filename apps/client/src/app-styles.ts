import { typedStyles } from './css-module.js';
import raw from './App.module.css';

/** The class names in `App.module.css`. See `css-module.ts`. */
export const APP_CLASS_NAMES = [
  'header',
  'tagline',
  'settings',
  'main',
  'meta',
  'bubble',
  'actions',
] as const;

export const appStyles = typedStyles(raw, APP_CLASS_NAMES);
