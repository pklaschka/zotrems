import { declareIndexPlugin, type ReactRNPlugin } from '@remnote/plugin-sdk';
import { connect, insertCitation, refreshBibliography } from '../lib/commands';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerStringSetting({
    id: 'document',
    title: 'Name des Literaturverzeichnis-Dokuments',
    defaultValue: 'Zotero-Literaturverzeichnis',
  });

  await plugin.settings.registerStringSetting({
    id: 'locale',
    title: 'Sprache der Zitate',
    description:
      'Bestimmt z. B. »S.« statt »p.« und »&« statt »und«. Leer lassen, um die Zotero-Einstellung zu verwenden.',
    defaultValue: 'de-DE',
  });

  await plugin.settings.registerBooleanSetting({
    id: 'remove-unused',
    title: 'Unbenutzte Einträge beim Aktualisieren entfernen',
    description:
      'Löscht beim Aktualisieren des Literaturverzeichnisses alle Einträge, auf die kein Rem mehr verweist.',
    defaultValue: false,
  });

  await plugin.settings.registerNumberSetting({
    id: 'port',
    title: 'Zotero-Port',
    description: 'Nur ändern, wenn der Port in Zotero umgestellt wurde.',
    defaultValue: 23119,
  });

  await plugin.app.registerCommand({
    id: 'insert-citation',
    name: 'Zotero: Zitat einfügen',
    description: 'Öffnet den Zotero-Zitierdialog und fügt das Zitat an der Cursorposition ein.',
    keywords: 'zotero zitat zitieren cite citation quelle literatur',
    quickCode: 'zcite',
    keyboardShortcut: 'opt+shift+z',
    action: () => insertCitation(plugin),
  });

  await plugin.app.registerCommand({
    id: 'refresh-bibliography',
    name: 'Zotero: Literaturverzeichnis aktualisieren',
    description: 'Gleicht alle Einträge des Literaturverzeichnisses mit Zotero ab.',
    keywords: 'zotero literaturverzeichnis bibliographie aktualisieren refresh',
    action: () => refreshBibliography(plugin),
  });

  await plugin.app.registerCommand({
    id: 'connect',
    name: 'Zotero: Verbindung herstellen',
    description: 'Koppelt RemNote (erneut) mit Zotero.',
    keywords: 'zotero verbinden koppeln pair connect',
    action: () => connect(plugin),
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
