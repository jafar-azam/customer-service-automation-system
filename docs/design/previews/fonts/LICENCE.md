# Bundled fonts

Seven families, all under the **SIL Open Font License 1.1**, which permits
bundling and redistribution inside this repository provided the licence travels
with them and the fonts are not sold on their own. None of them is modified.

`docs/research/localization-lebanon.md` (rule TYPE-04) requires that a font ship
only with recorded licence approval, and explicitly marks its own font shortlist
as **unverified against the actual distributed files**. The table below is the
verification it asks for: each row was read from the `LICENSE` file inside the
installed package, not from the family's reputation.

| File | Family | Package | Version | Licence file says | Copyright line |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `plex-sans-400/600.woff2` | IBM Plex Sans | `@fontsource/ibm-plex-sans` | 5.3.0 | SIL OFL 1.1 | IBM Corp., 2019 |
| `plex-arabic-400/600.woff2` | IBM Plex Sans Arabic | `@fontsource/ibm-plex-sans-arabic` | 5.3.0 | SIL OFL 1.1 | IBM Corp., 2019 |
| `plex-mono-400.woff2` | IBM Plex Mono | `@fontsource/ibm-plex-mono` | 5.3.0 | SIL OFL 1.1 | IBM Corp., 2017 |
| `serif-400/600.woff2` | Source Serif 4 | `@fontsource/source-serif-4` | 5.3.1 | SIL OFL 1.1 | Google Inc. |
| `naskh-400/600.woff2` | Noto Naskh Arabic | `@fontsource/noto-naskh-arabic` | 5.3.0 | SIL OFL 1.1 | The Noto Project Authors, 2022 |
| `figtree-400/600.woff2` | Figtree | `@fontsource/figtree` | 5.3.0 | SIL OFL 1.1 | The Figtree Project Authors, 2022 |
| `readex-400/600.woff2` | Readex Pro | `@fontsource/readex-pro` | 5.3.0 | SIL OFL 1.1 | The Readex Pro Project Authors, 2019 |

All seven `package.json` files also declare `"license": "OFL-1.1"`, matching the
licence text they ship. Source Serif 4's licence header names **Google Inc.**
rather than Adobe, who originally drew the family; the recorded holder is what
the distributed file says, not what the family's history suggests.

Reproducing this check:

```bash
for pkg in ibm-plex-sans ibm-plex-sans-arabic ibm-plex-mono source-serif-4 \
           noto-naskh-arabic figtree readex-pro; do
  grep -il 'SIL OPEN FONT LICENSE' "node_modules/@fontsource/$pkg/LICENSE"
done
```

Each file is copied verbatim from its package by `npm run build:previews`; the
full licence text of each ships inside that package under
`node_modules/@fontsource/<name>/LICENSE`.

Only the Arabic subset is taken for the Arabic faces and only the Latin subset
for the Latin ones, which is why thirteen files come to 364 KB rather than
several megabytes. The research warns that subsetting can break Arabic joining
and mark positioning; that is checked by eye in the Arabic previews, not
asserted here. Nothing is loaded from a CDN — the previews must open from a
`file://` URL with no network.

## A departure worth naming

The research's Arabic shortlist is Noto Sans Arabic, IBM Plex Sans Arabic, Cairo
and Tajawal — all sans. **Noto Naskh Arabic, used by the Dossier direction, is
not on it.** The shortlist is presented there as "candidates for evaluation, not
licensed-and-approved selections" and is framed around a sans interface, so this
is a departure rather than a contradiction; it is recorded here so that choosing
Dossier is a decision made with the shortlist in view, and so the Naskh face is
put in front of the native reviewers specifically.
