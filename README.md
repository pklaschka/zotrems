# Zotrems

Zotero-Zitate in RemNote: Quellen werden im nativen Zotero-Zitierdialog ausgewählt und als
APA-Zitat an der Cursorposition eingefügt. Jede zitierte Quelle steht genau einmal in einem
Literaturverzeichnis-Dokument, und alle Zitate verweisen darauf.

```
Text in RemNote:      … (vgl. [[Müller, 2024]], S. 12)

Zotero-Literaturverzeichnis
  Müller, 2024 :: Müller, S. (2024). Lernen mit Karteikarten. Beltz.     ← Concept, Abfrage deaktiviert
      In Zotero öffnen (zotero://select/library/items/…)                  ← Extra Card Detail
```

## Bestandteile

| Teil | Ordner | Aufgabe |
| --- | --- | --- |
| RemNote-Plugin | `src/` | Befehle, Literaturverzeichnis, Einfügen der Zitate |
| Zotero-Plugin »Zotrems Bridge« | `zotero-bridge/` | öffnet den Zitierdialog, liefert die APA-Texte |

Das Zotero-Plugin ist nötig, weil Zotero Anfragen aus Browser-Umgebungen grundsätzlich
abweist; ein RemNote-Plugin kann Zotero (und auch Better BibTeX) deshalb nicht direkt
ansprechen.

## Installation

1. **Zotero** (ab Version 7): `npm run build:zotero`, dann in Zotero unter
   *Werkzeuge → Plugins → Zahnrad → Plugin aus Datei installieren* die Datei
   `zotrems-bridge.xpi` wählen.
2. **RemNote**: `npm install`, dann entweder
   - `npm run dev` und in RemNote unter *Einstellungen → Plugins → Build → Develop from
     localhost* `http://localhost:8080` eintragen, oder
   - `npm run build` und `PluginZip.zip` hochladen.
3. Beim ersten Zitat fragt Zotero einmalig, ob RemNote zugreifen darf.

## Benutzung

Zotero muss geöffnet sein.

- **Zotero: Zitat einfügen** – `/zcite`, Omnibar oder `Alt+Shift+Z`. Öffnet den
  Zotero-Dialog; Seitenzahl, Präfix, Suffix und »Autor weglassen« werden übernommen.
  Mehrere Quellen ergeben ein gemeinsames Zitat: `(Meier et al., 2023; Müller, 2024, S. 12)`.
- **Zotero: Literaturverzeichnis aktualisieren** – gleicht alle Einträge mit Zotero ab
  (geänderte Metadaten, `2024a`/`2024b`) und meldet Einträge ohne Verweis.
- **Zotero: Verbindung herstellen** – koppelt RemNote erneut mit Zotero.

Einstellungen: Name des Dokuments, Sprache der Zitate (Standard `de-DE`), unbenutzte
Einträge beim Aktualisieren entfernen (Standard: aus), Zotero-Port.

## Funktionsweise

- Die Zuordnung Rem ↔ Zotero-Eintrag steckt ausschließlich im Deep Link des
  »Extra Card Detail«-Rems. Name und Rückseite eines Eintrags dürfen sich also ändern;
  der Link darf nicht entfernt werden.
- Formatiert wird von Zoteros eigenem Zitierprozessor mit dem Stil *APA 7*. Alle Einträge
  des Verzeichnisses werden gemeinsam formatiert, damit Jahreszusätze (`2024a`) im Text
  und im Verzeichnis übereinstimmen.
- Bei »Autor weglassen« erhält der Eintrag einen Alias mit dem Jahr, über den verwiesen wird.
- Die Bridge stellt unter `http://127.0.0.1:23119/zotrems/` vier Endpunkte bereit
  (`ping`, `pair`, `pick`, `format`). Außer `ping` und `pair` verlangen alle das Token,
  das beim Koppeln nach Bestätigung in Zotero ausgegeben wird.
