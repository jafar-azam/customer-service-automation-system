# Bundled fonts

Five families, all under the **SIL Open Font License 1.1**, which permits
bundling and redistribution inside this repository provided the licence travels
with them and the fonts are not sold on their own. None of them is modified.

| File | Family | Source package | Copyright |
| :-- | :-- | :-- | :-- |
| `plex-sans-400/600.woff2` | IBM Plex Sans | `@fontsource/ibm-plex-sans` | © IBM Corp. |
| `plex-arabic-400/600.woff2` | IBM Plex Sans Arabic | `@fontsource/ibm-plex-sans-arabic` | © IBM Corp. |
| `plex-mono-400.woff2` | IBM Plex Mono | `@fontsource/ibm-plex-mono` | © IBM Corp. |
| `serif-400/600.woff2` | Source Serif 4 | `@fontsource/source-serif-4` | © Adobe |
| `naskh-400/600.woff2` | Noto Naskh Arabic | `@fontsource/noto-naskh-arabic` | © The Noto Project Authors |
| `figtree-400/600.woff2` | Figtree | `@fontsource/figtree` | © Erik Kennedy |
| `readex-400/600.woff2` | Readex Pro | `@fontsource/readex-pro` | © The Readex Pro Project Authors |

Each file is copied verbatim from the corresponding `@fontsource` package by
`npm run build:previews`; the full licence text of each ships inside that
package under `node_modules/@fontsource/<name>/LICENSE`.

Only the Arabic subset is taken for the Arabic faces and only the Latin subset
for the Latin ones, which is why thirteen files come to 360 KB rather than
several megabytes. Nothing here is loaded from a CDN — the previews must open
from a `file://` URL with no network.
