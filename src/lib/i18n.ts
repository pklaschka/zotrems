// User-facing strings. German and English; English is the fallback.

const de = {
  'setting.document.title': 'Name des Literaturverzeichnis-Dokuments',
  'setting.document.default': 'Zotero-Literaturverzeichnis',
  'setting.locale.title': 'Sprache der Zitate',
  'setting.locale.description': 'Bestimmt z. B. »S.« statt »p.« in den Zitaten.',
  'setting.locale.zotero': 'Keine (Sprache von Zotero)',
  'setting.locale.de': 'Deutsch',
  'setting.locale.en': 'Englisch',
  'setting.removeUnused.title': 'Unbenutzte Einträge beim Aktualisieren entfernen',
  'setting.removeUnused.description':
    'Löscht beim Aktualisieren des Literaturverzeichnisses alle Einträge, auf die kein Rem mehr verweist.',
  'setting.port.title': 'Zotero-Port',
  'setting.port.description': 'Nur ändern, wenn der Port in Zotero umgestellt wurde.',

  'command.insert.name': 'Zotero: Zitat einfügen',
  'command.insert.description':
    'Öffnet den Zotero-Zitierdialog und fügt das Zitat an der Cursorposition ein.',
  'command.refresh.name': 'Zotero: Literaturverzeichnis aktualisieren',
  'command.refresh.description': 'Gleicht alle Einträge des Literaturverzeichnisses mit Zotero ab.',
  'command.connect.name': 'Zotero: Verbindung herstellen',
  'command.connect.description': 'Koppelt RemNote (erneut) mit Zotero.',

  'link.label': 'In Zotero öffnen',

  'toast.busy': 'Zotrems arbeitet noch …',
  'toast.noFocus': 'Bitte zuerst den Cursor an die Stelle setzen, an der zitiert werden soll.',
  'toast.nothingCited': 'Die ausgewählten Einträge konnten nicht zitiert werden.',
  'toast.nothingToInsert': 'Die Auswahl enthält keinen Text, der eingefügt werden könnte.',
  'toast.imagesSkipped': '{count} Bild(er) aus Zotero konnten nicht übernommen werden.',
  'toast.confirmInZotero': 'Bitte die Verbindung in Zotero bestätigen …',
  'toast.connected': 'Mit Zotero verbunden.',
  'toast.bibliographyEmpty': 'Das Literaturverzeichnis ist noch leer.',
  'toast.onlyEmptyRemoved':
    'Literaturverzeichnis: {count} leere Rems entfernt, keine Einträge vorhanden.',
  'toast.refreshed': 'Literaturverzeichnis: {parts}.',
  'refresh.checked': '{count} Einträge geprüft',
  'refresh.updated': '{count} aktualisiert',
  'refresh.unusedRemoved': '{count} unbenutzte entfernt',
  'refresh.unused': '{count} ohne Verweis',
  'refresh.emptyRemoved': '{count} leere Rems entfernt',
  'refresh.missing': '{count} nicht mehr in Zotero',

  'error.offline':
    'Zotero ist nicht erreichbar. Läuft Zotero, und ist das Plugin »Zotrems Bridge« installiert?',
  'error.noBridge':
    'Zotero läuft, aber das Plugin »Zotrems Bridge« antwortet nicht. Ist es in Zotero installiert und aktiviert?',
  'error.unauthorized': 'Zotero hat den Zugriff abgelehnt.',
  'error.denied': 'Die Verbindung wurde in Zotero abgelehnt.',
  'error.pickerOpen': 'In Zotero ist bereits ein Zitierdialog geöffnet.',
  'error.zotero': 'Zotero-Fehler: {message}',
  'error.createDocument': 'Das Literaturverzeichnis konnte nicht angelegt werden.',
  'error.createLink': 'Der Zotero-Link konnte nicht angelegt werden.',
  'error.createEntry': 'Der Literatureintrag konnte nicht angelegt werden.',
  'error.createRem': 'Das Rem für den eingefügten Text konnte nicht angelegt werden.',
  'error.targetGone': 'Das Rem, in das zitiert werden sollte, existiert nicht mehr.',
};

type Key = keyof typeof de;

const en: Record<Key, string> = {
  'setting.document.title': 'Name of the bibliography document',
  'setting.document.default': 'Zotero Bibliography',
  'setting.locale.title': 'Citation language',
  'setting.locale.description': 'Decides e.g. “p.” vs. “S.” in citations.',
  'setting.locale.zotero': 'None (Zotero’s language)',
  'setting.locale.de': 'German',
  'setting.locale.en': 'English',
  'setting.removeUnused.title': 'Remove unused entries when refreshing',
  'setting.removeUnused.description':
    'When refreshing the bibliography, deletes all entries that no Rem refers to any more.',
  'setting.port.title': 'Zotero port',
  'setting.port.description': 'Only change this if the port was changed in Zotero.',

  'command.insert.name': 'Zotero: Insert Citation',
  'command.insert.description':
    'Opens Zotero’s citation dialog and inserts the citation at the cursor.',
  'command.refresh.name': 'Zotero: Refresh Bibliography',
  'command.refresh.description': 'Brings all bibliography entries in line with Zotero.',
  'command.connect.name': 'Zotero: Connect',
  'command.connect.description': 'Pairs RemNote with Zotero (again).',

  'link.label': 'Open in Zotero',

  'toast.busy': 'Zotrems is still working …',
  'toast.noFocus': 'Place the cursor where the citation should go first.',
  'toast.nothingCited': 'The selected items could not be cited.',
  'toast.nothingToInsert': 'The selection contains no text that could be inserted.',
  'toast.imagesSkipped': '{count} image(s) from Zotero could not be carried over.',
  'toast.confirmInZotero': 'Please confirm the connection in Zotero …',
  'toast.connected': 'Connected to Zotero.',
  'toast.bibliographyEmpty': 'The bibliography is still empty.',
  'toast.onlyEmptyRemoved': 'Bibliography: removed {count} empty Rems, no entries present.',
  'toast.refreshed': 'Bibliography: {parts}.',
  'refresh.checked': '{count} entries checked',
  'refresh.updated': '{count} updated',
  'refresh.unusedRemoved': '{count} unused removed',
  'refresh.unused': '{count} without references',
  'refresh.emptyRemoved': '{count} empty Rems removed',
  'refresh.missing': '{count} no longer in Zotero',

  'error.offline':
    'Cannot reach Zotero. Is Zotero running, and is the “Zotrems Bridge” plugin installed?',
  'error.noBridge':
    'Zotero is running, but the “Zotrems Bridge” plugin does not respond. Is it installed and enabled in Zotero?',
  'error.unauthorized': 'Zotero refused access.',
  'error.denied': 'The connection was declined in Zotero.',
  'error.pickerOpen': 'A citation dialog is already open in Zotero.',
  'error.zotero': 'Zotero error: {message}',
  'error.createDocument': 'Could not create the bibliography document.',
  'error.createLink': 'Could not create the Zotero link.',
  'error.createEntry': 'Could not create the bibliography entry.',
  'error.createRem': 'Could not create the Rem for the inserted text.',
  'error.targetGone': 'The Rem the citation was meant for no longer exists.',
};

const languages = { de, en };
export type Language = keyof typeof languages;

let current: Language = 'en';

/** `choice` is the language setting: "auto", "de" or "en". */
export function setLanguage(choice: string | undefined): void {
  if (choice === 'de' || choice === 'en') {
    current = choice;
    return;
  }
  const system = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  current = system.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function t(key: Key, params: Record<string, string | number> = {}): string {
  return languages[current][key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}

/** The default document names of all languages, so a language switch still finds the document. */
export const DEFAULT_DOCUMENT_NAMES = Object.values(languages).map(
  (messages) => messages['setting.document.default']
);
