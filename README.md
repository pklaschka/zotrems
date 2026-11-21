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

1. **Zotero** (version 7 or later): download `zotrems-bridge.xpi` from the
   [latest release](https://github.com/pklaschka/zotrems/releases/latest). In Zotero choose
   *Tools → Plugins → gear icon → Install Plugin From File* and select the file. From then on
   Zotero keeps the bridge up to date by itself.
2. **RemNote**: open *Settings → Plugins*, search the plugin store for "Zotrems" and install
   it. RemNote keeps it up to date.
3. On the first citation, Zotero asks once whether RemNote may access it.

Both plugins share one version number and are meant to be used in matching versions.

### Building from source

Needs Node 22 and the `zip` command.

- `npm install` once.
- `npm run build:zotero` writes `zotrems-bridge.xpi`.
- `npm run build` writes `PluginZip.zip` for RemNote; every GitHub release also carries it as
  `zotrems-remnote-plugin.zip`.
- `npm run dev` serves the RemNote plugin for development: enter `http://localhost:8080` in
  RemNote under *Settings → Plugins → Build → Develop from localhost*.

## Usage

Zotero has to be running.

- **Zotero: Insert Citation** – `/zcite`, the Omnibar or `Alt+Shift+Z`. Opens the Zotero
  dialog; page number, prefix, suffix and "Omit Author" are carried over. Several sources
  become one citation: `(Meier et al., 2023; Müller, 2024, p. 12)`.
  The dialog also offers annotations and notes. Picking **annotations** inserts each quote
  (and comment) followed by its citation with the page, e.g.
  `“Spacing works.” (Müller, 2024, p. 5)`; the first goes to the cursor, further ones become
  the Rems that follow. Picking a **note** inserts it as one quote Rem below the Rem with the
  cursor (or into that Rem if it is still empty), one line per paragraph, with the citations
  inside the note turned into linked citations. Images cannot be carried over.
- **Zotero: Refresh Bibliography** – brings all entries in line with Zotero (changed
  metadata, `2024a`/`2024b`), removes empty Rems and entries that are no longer cited anywhere.
  Entries whose item was **deleted in Zotero** are kept, because they may still be cited; their
  link is relabelled "Not found in Zotero" and recovers if the item is restored from the trash.
  Entries of items that were **merged** in Zotero follow the surviving item.
- **Zotero: Connect** – pairs RemNote with Zotero again.

The interface is available in English and German. It follows the system language and can be
set in the plugin settings (takes effect after reloading the plugin).

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Automatic | interface language: Automatic, Deutsch or English |
| Name of the bibliography document | Zotero Bibliography | "Zotero-Literaturverzeichnis" in German |
| Citation language | None (Zotero's language) | or German / English; decides e.g. "p." vs. "S." |
| Remove unused entries when refreshing | on | deletes entries no Rem refers to any more; turn off to only have them reported |
| Zotero port | 23119 | only change it if the port was changed in Zotero |

## How it works

- The bibliography document starts with a quote Rem explaining how it works. You can reword
  it; if you delete it, it comes back.
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

## Releasing

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

## How this was built

Zotrems was developed with the help of [Claude](https://claude.com/claude-code), Anthropic's
AI model, which wrote most of the code. I'm an experienced software engineer: the concept and
the design decisions are mine, I direct and review the work, and I take responsibility for
what is published here. If something doesn't work, please open an issue.

## License

Copyright © 2026 Zuri Nimca Klaschka

Zotrems is licensed under the [European Union Public Licence 1.2](LICENSE) (EUPL-1.2).
