# Zotrems

Zotero citations in RemNote: pick sources in Zotero's native citation dialog and get an APA
citation inserted at the cursor. Every cited source is listed exactly once in a bibliography
document, and all citations link to it.

```
Text in RemNote:      … (cf. [[Müller, 2024]], p. 12)

Zotero Bibliography
  Müller, 2024 :: Müller, S. (2024). Lernen mit Karteikarten. Beltz.     ← concept, practice disabled
      Open in Zotero (zotero://select/library/items/…)                    ← Extra Card Detail
```

## Parts

| Part | Folder | Job |
| --- | --- | --- |
| RemNote plugin | `src/` | commands, bibliography, inserting citations |
| Zotero plugin "Zotrems Bridge" | `zotero-bridge/` | opens the citation dialog, provides the APA texts |

The Zotero plugin is needed because Zotero rejects all requests coming from browser
environments, so a RemNote plugin cannot talk to Zotero (or Better BibTeX) directly.

## Installation

1. **Zotero** (version 7 or later): run `npm run build:zotero`, then in Zotero choose
   *Tools → Plugins → gear icon → Install Plugin From File* and select `zotrems-bridge.xpi`.
2. **RemNote**: run `npm install`, then either
   - `npm run dev` and enter `http://localhost:8080` in RemNote under *Settings → Plugins →
     Build → Develop from localhost*, or
   - `npm run build` and upload `PluginZip.zip`.
3. On the first citation, Zotero asks once whether RemNote may access it.

## Usage

Zotero has to be running.

- **Zotero: Insert Citation** – `/zcite`, the Omnibar or `Alt+Shift+Z`. Opens the Zotero
  dialog; page number, prefix, suffix and "Omit Author" are carried over. Several sources
  become one citation: `(Meier et al., 2023; Müller, 2024, p. 12)`.
- **Zotero: Refresh Bibliography** – brings all entries in line with Zotero (changed
  metadata, `2024a`/`2024b`), removes empty Rems from the bibliography and reports entries
  without references.
- **Zotero: Connect** – pairs RemNote with Zotero again.

The interface is available in English and German. It follows the system language and can be
set in the plugin settings (takes effect after reloading the plugin).

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Automatic | interface language: Automatic, Deutsch or English |
| Name of the bibliography document | Zotero Bibliography | "Zotero-Literaturverzeichnis" in German |
| Citation language | None (Zotero's language) | or German / English; decides e.g. "p." vs. "S." |
| Remove unused entries when refreshing | off | deletes entries no Rem refers to any more |
| Zotero port | 23119 | only change it if the port was changed in Zotero |

## How it works

- The link between a Rem and its Zotero item lives only in the deep link of the
  "Extra Card Detail" Rem. An entry's name and back side may change; the link must stay.
- Formatting is done by Zotero's own citation processor with the *APA 7* style. All entries
  of the bibliography are formatted together, so that year suffixes (`2024a`) match between
  the text and the bibliography.
- With "Omit Author", the entry gets an alias holding the year, and the citation links
  through that alias.
- The bridge serves four endpoints under `http://127.0.0.1:23119/zotrems/` (`ping`, `pair`,
  `pick`, `format`). All except `ping` and `pair` require the token that is handed out when
  pairing, after you confirm in Zotero.

## How this was built

Zotrems was developed with the help of [Claude](https://claude.com/claude-code), Anthropic's
AI model, which wrote most of the code. I'm an experienced software engineer: the concept and
the design decisions are mine, I direct and review the work, and I take responsibility for
what is published here. If something doesn't work, please open an issue.
