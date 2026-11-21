import { declareIndexPlugin, type ReactRNPlugin } from '@remnote/plugin-sdk';
import { connect, insertCitation, refreshBibliography } from '../lib/commands';
import { setLanguage, t } from '../lib/i18n';

async function onActivate(plugin: ReactRNPlugin) {
  // Registered first and in both languages: everything below depends on it.
  await plugin.settings.registerDropdownSetting({
    id: 'language',
    title: 'Sprache / Language',
    description:
      'Sprache der Plugin-Oberfläche; wirkt nach dem Neuladen des Plugins. / Language of the plugin interface; takes effect after reloading the plugin.',
    defaultValue: 'auto',
    options: [
      { key: 'auto', label: 'Automatisch / Automatic', value: 'auto' },
      { key: 'de', label: 'Deutsch', value: 'de' },
      { key: 'en', label: 'English', value: 'en' },
    ],
  });
  setLanguage(await plugin.settings.getSetting<string>('language'));

  await plugin.settings.registerStringSetting({
    id: 'document',
    title: t('setting.document.title'),
    defaultValue: t('setting.document.default'),
  });

  await plugin.settings.registerDropdownSetting({
    id: 'locale',
    title: t('setting.locale.title'),
    description: t('setting.locale.description'),
    defaultValue: 'zotero',
    options: [
      { key: 'zotero', label: t('setting.locale.zotero'), value: 'zotero' },
      { key: 'de', label: t('setting.locale.de'), value: 'de-DE' },
      { key: 'en', label: t('setting.locale.en'), value: 'en-US' },
    ],
  });

  await plugin.settings.registerBooleanSetting({
    id: 'remove-unused',
    title: t('setting.removeUnused.title'),
    description: t('setting.removeUnused.description'),
    defaultValue: true,
  });

  await plugin.settings.registerNumberSetting({
    id: 'port',
    title: t('setting.port.title'),
    description: t('setting.port.description'),
    defaultValue: 23119,
  });

  // Keywords cover both languages so the commands are found either way.
  await plugin.app.registerCommand({
    id: 'insert-citation',
    name: t('command.insert.name'),
    description: t('command.insert.description'),
    keywords: 'zotero zitat zitieren quelle literatur cite citation reference source',
    quickCode: 'zcite',
    keyboardShortcut: 'opt+shift+z',
    action: () => insertCitation(plugin),
  });

  await plugin.app.registerCommand({
    id: 'refresh-bibliography',
    name: t('command.refresh.name'),
    description: t('command.refresh.description'),
    keywords: 'zotero literaturverzeichnis bibliographie aktualisieren bibliography refresh update',
    action: () => refreshBibliography(plugin),
  });

  await plugin.app.registerCommand({
    id: 'connect',
    name: t('command.connect.name'),
    description: t('command.connect.description'),
    keywords: 'zotero verbinden koppeln connect pair',
    action: () => connect(plugin),
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
