import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { LocaleProvider } from './locale-context.js';
import { ThemeProvider } from './theme.js';

/* Order matters: tokens define the custom properties that base.css and every
   component stylesheet read. */
import './styles/tokens.css';
import './styles/base.css';

/* Self-hosted, subsetted. No CDN: a font request to a third party is a request
   that leaks every visitor's address to them, and it fails in a locked-down
   network. Only the faces the chosen direction uses — Source Serif 4 for
   Latin, Noto Naskh Arabic for Arabic, IBM Plex Mono for identifiers. */
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
);
