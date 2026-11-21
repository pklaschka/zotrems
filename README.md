<div align="center">

# 📚 Zotrems

**Cite your Zotero library in RemNote.**

[![Latest release](https://img.shields.io/github/v/release/pklaschka/zotrems?label=release&color=cc2936)](https://github.com/pklaschka/zotrems/releases/latest)
[![License: EUPL 1.2](https://img.shields.io/badge/license-EUPL--1.2-0b5fa5)](https://github.com/pklaschka/zotrems/blob/main/LICENSE)
![Zotero 7+](https://img.shields.io/badge/Zotero-7%2B-cc2936)
![Citation style: APA 7](https://img.shields.io/badge/style-APA%207-555)

</div>

Pick sources in Zotero's own citation dialog, and Zotrems inserts an APA citation at the
cursor. Every cited source is listed exactly once in a bibliography document, and all
citations link to it.

- 🔎 **The dialog you know**: search, page numbers, prefix and suffix work as in Word or
  Google Docs.
- 🗂️ **One bibliography**: sources are formatted by Zotero itself in APA 7 and kept in sync with
  your library.
- 🖍️ **Annotations and notes**: quotes from your PDFs arrive with their citation and page.
- 🌍 **English and German** interface.

## 👀 What it looks like

**In your notes**, a citation is a link to the source's bibliography entry:

> Spacing out reviews improves retention (cf. [Müller, 2024](#-the-bibliography), p. 12).

**In the bibliography document**, each cited source is one concept with practice disabled,
and a link back to Zotero below it:

> **Müller, 2024** ↔ Müller, S. (2024). *Lernen mit Karteikarten*. Beltz.<br>
> &nbsp;&nbsp;&nbsp;&nbsp;↳ [Open in Zotero](#-the-bibliography)

## 🧰 What you need

- Zotero 7 or later, running while you cite
- The RemNote desktop app (the setup Zotrems is developed and tested with)
- Two plugins: Zotrems in RemNote, and its companion **Zotrems Bridge** in Zotero

The companion is needed because Zotero does not accept requests from apps like RemNote
directly. The bridge opens the citation dialog and does the formatting inside Zotero.

## 🚀 Installation

1. **Zotero**: download `zotrems-bridge.xpi` from the
   [latest release](https://github.com/pklaschka/zotrems/releases/latest). In Zotero choose
   *Tools → Plugins → gear icon → Install Plugin From File* and select the file. From then on
   Zotero keeps the bridge up to date by itself.
2. **RemNote**: open *Settings → Plugins*, search the plugin store for "Zotrems" and install
   it. RemNote keeps it up to date.
3. **First citation**: Zotero asks once whether RemNote may access your library. Confirm it.

Both plugins share one version number and are meant to be used in matching versions.

## ✍️ Citing

Place the cursor where the citation should go and run **Zotero: Insert Citation**: type
`/zcite`, press `Alt+Shift+Z`, or pick it from the Omnibar. Zotero's dialog opens; what you
choose there decides what is inserted.

| You pick | You get |
| --- | --- |
| One source | `(Müller, 2024)` |
| A source with a page and a prefix | `(cf. Müller, 2024, p. 12)` |
| Several sources | `(Meier et al., 2023; Müller, 2024, p. 12)` |
| Annotations | each quote and comment, followed by its citation with the page: `“Spacing works.” (Müller, 2024, p. 5)` |
| A note | the whole note as one quote Rem, with the citations inside it linked |

The author-year part is always a reference to the source's bibliography entry.

- **Annotations**: the first one goes to the cursor, further ones become the Rems that follow.
- **Notes**: the quote Rem is placed below the Rem with the cursor, or into that Rem if it is
  still empty. Each paragraph of the note becomes one line.
- **"Omit Author"** is not supported: the citation always shows author and year, because
  RemNote gives plugins no way to display a reference under another text.
- **Images** from area annotations or notes cannot be carried over; Zotrems tells you how many
  were skipped.

## 📖 The bibliography

Zotrems creates the document "Zotero Bibliography" the first time you cite. It starts with a
short explanation, followed by one entry per cited source in APA order. URLs and DOIs in the
entries are links.

Entries are written by Zotrems: they are refreshed from Zotero every time you cite, so your
own edits to an entry are lost. The "Open in Zotero" link below each entry is what ties it to
its Zotero item. Leave it in place.

Run **Zotero: Refresh Bibliography** after changing sources in Zotero. It

- updates all entries, including year suffixes such as `2024a` and `2024b`,
- removes entries that are no longer cited anywhere, and empty Rems,
- keeps entries whose item was deleted in Zotero, because your notes may still cite them, and
  relabels their link "Not found in Zotero" (restoring the item from Zotero's trash undoes this),
- lets entries of items that were merged in Zotero follow the surviving item.

RemNote does not let plugins set a document's icon. If you want one, set it once by hand.

## ⚙️ Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Automatic | interface language: Automatic, Deutsch or English; takes effect after reloading the plugin |
| Name of the bibliography document | Zotero Bibliography | "Zotero-Literaturverzeichnis" in German |
| Citation language | None (Zotero's language) | or German / English; decides e.g. "p." vs. "S." |
| Remove unused entries when refreshing | on | turn off to have uncited entries reported instead of removed |
| Zotero port | 23119 | only change it if the port was changed in Zotero |

## 🩺 Troubleshooting

- **"Cannot reach Zotero"**: Zotero is not running, or Zotrems Bridge is not installed or
  enabled there.
- **The dialog does not appear**: it may be open behind another window. Run the command again;
  Zotrems brings the open dialog to the front.
- **Nothing is inserted, or something looks off after an update**: make sure both plugins are
  on the same version, then reload RemNote.
- **Zotero refuses access**: run **Zotero: Connect** and confirm the question in Zotero.
- **"S. 12" instead of "p. 12", or the reverse**: set *Citation language* in the settings.

If something else goes wrong, please
[open an issue](https://github.com/pklaschka/zotrems/issues).

## 🛠️ Development

The repository holds both plugins:

| Part | Folder | Job |
| --- | --- | --- |
| RemNote plugin | `src/` | commands, bibliography, inserting citations |
| Zotrems Bridge (Zotero plugin) | `zotero-bridge/` | opens the citation dialog, provides the APA texts |

### Building

Needs Node 26 and the `zip` command.

- `npm install` once.
- `npm run dev` serves the RemNote plugin: enter `http://localhost:8080` in RemNote under
  *Settings → Plugins → Build → Develop from localhost*. Sources are rebuilt on change; reload
  the plugin in RemNote to pick them up.
- `npm run build` writes `PluginZip.zip` for RemNote.
- `npm run build:zotero` writes `zotrems-bridge.xpi`.
- `npm run check-types` runs the TypeScript compiler.

### How it works

- The bridge serves four endpoints under `http://127.0.0.1:23119/zotrems/` (`ping`, `pair`,
  `pick`, `format`). All except `ping` and `pair` require the token that is handed out when
  pairing, after you confirm in Zotero.
- `pick` drives Zotero's document integration, the same mechanism the Google Docs connector
  uses, against an in-memory document.
- `format` runs Zotero's citation processor with the APA 7 style. All entries of the
  bibliography are formatted together, so that year suffixes match between the text and the
  bibliography.
- The link between a Rem and its Zotero item lives only in the deep link of the
  "Extra Card Detail" Rem.

### Releasing

Both plugins share one version; `package.json` is the source of truth. To publish a release,
run the **Release** workflow from the repository's *Actions* tab and enter `patch`, `minor`,
`major` or an explicit version such as `1.2.3`. The workflow then

1. sets that version in `package.json`, `public/manifest.json` and
   `zotero-bridge/manifest.json`,
2. type-checks and builds both plugins,
3. commits the version as `Release X.Y.Z`, tags it `vX.Y.Z` and pushes both,
4. publishes a GitHub release with `zotrems-remnote-plugin.zip`, `zotrems-bridge.xpi` and
   `updates.json` attached.

Zotero reads `updates.json` from the latest release, so an installed Zotrems Bridge updates
itself. Locally, `npm run version:sync` writes the version from `package.json` into both
manifests, and `npm run version:check` verifies that they agree.

## 🤖 How this was built

Zotrems was developed with the help of [Claude](https://claude.com/claude-code), Anthropic's
AI model, which wrote most of the code. I'm an experienced software engineer: the concept and
the design decisions are mine, I direct and review the work, and I take responsibility for
what is published here. If something doesn't work, please open an issue.

## ⚖️ License

Copyright © 2026 Zuri Nimca Klaschka

Zotrems is licensed under the
[European Union Public Licence 1.2](https://github.com/pklaschka/zotrems/blob/main/LICENSE)
(EUPL-1.2).
