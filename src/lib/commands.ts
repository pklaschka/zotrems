import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import { Bridge, BridgeError } from './bridge';
import { findDocument, getOrCreateDocument, loadEntries, syncEntries } from './bibliography';

let busy = false;

/** Runs a command exclusively and turns errors into toasts. */
async function run(plugin: RNPlugin, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    await plugin.app.toast('Zotrems arbeitet noch …');
    return;
  }
  busy = true;
  try {
    await fn();
  } catch (err) {
    console.error('[zotrems]', err);
    const message = err instanceof Error ? err.message : String(err);
    await plugin.app.toast(err instanceof BridgeError ? message : `Zotrems: ${message}`);
  } finally {
    busy = false;
  }
}

/** Joins "Müller, 2024" + ", S. 12" + "Hervorhebung im Original" the way APA expects. */
function joinSuffix(suffix: string): string {
  if (!suffix) return '';
  return /^[\s,;.:)]/.test(suffix) ? suffix : `, ${suffix}`;
}

export function insertCitation(plugin: RNPlugin): Promise<void> {
  return run(plugin, async () => {
    const target = await plugin.focus.getFocusedRem();
    if (!target) {
      await plugin.app.toast('Bitte zuerst den Cursor an die Stelle setzen, an der zitiert werden soll.');
      return;
    }

    const bridge = new Bridge(plugin);
    const picked = await bridge.pick();
    if (!picked.length) return;

    const doc = await getOrCreateDocument(plugin);
    const existing = await loadEntries(plugin, doc);
    const formatted = await bridge.format(
      existing.map((entry) => entry.uri),
      picked
    );
    const { entries } = await syncEntries(plugin, doc, existing, formatted.items);

    const citation: RichTextInterface = ['('];
    let first = true;
    for (const cite of formatted.cites) {
      const rem = entries.get(cite.uri);
      if (!rem) continue;
      if (!first) citation.push('; ');
      first = false;
      if (cite.prefix) citation.push(`${cite.prefix.trimEnd()} `);
      if (cite.suppressAuthor && cite.yearText) {
        // An alias lets the reference show just the year while still linking to the entry.
        const alias = await rem.getOrCreateAliasWithText([cite.yearText]);
        citation.push({ i: 'q', _id: rem._id, ...(alias ? { aliasId: alias._id } : {}) });
      } else {
        citation.push({ i: 'q', _id: rem._id });
      }
      if (cite.locatorText) citation.push(cite.locatorText);
      if (cite.suffix) citation.push(joinSuffix(cite.suffix));
    }
    if (first) {
      await plugin.app.toast('Die ausgewählten Einträge konnten nicht zitiert werden.');
      return;
    }
    citation.push(')');

    // Zotero's dialog takes the window focus; if the editor lost its caret,
    // append to the Rem that was focused when the command started.
    const focused = await plugin.focus.getFocusedRem();
    if (focused?._id === target._id) {
      await plugin.editor.insertRichText(citation);
    } else {
      const current = await plugin.rem.findOne(target._id);
      if (!current) throw new Error('Das Rem, in das zitiert werden sollte, existiert nicht mehr.');
      const text = current.text || [];
      await current.setText([...text, ...(text.length ? [' '] : []), ...citation]);
    }
  });
}

export function refreshBibliography(plugin: RNPlugin): Promise<void> {
  return run(plugin, async () => {
    const doc = await findDocument(plugin);
    const existing = doc ? await loadEntries(plugin, doc) : [];
    if (!doc || !existing.length) {
      await plugin.app.toast('Das Literaturverzeichnis ist noch leer.');
      return;
    }

    const formatted = await new Bridge(plugin).format(existing.map((entry) => entry.uri));
    const { updated } = await syncEntries(plugin, doc, existing, formatted.items);

    const unused = [];
    for (const entry of existing) {
      if (!(await entry.rem.remsReferencingThis()).length) unused.push(entry);
    }
    const removeUnused = await plugin.settings.getSetting<boolean>('remove-unused');
    if (removeUnused) {
      for (const entry of unused) await entry.rem.remove();
    }

    const parts = [`${existing.length} Einträge geprüft`, `${updated} aktualisiert`];
    if (unused.length) {
      parts.push(removeUnused ? `${unused.length} unbenutzte entfernt` : `${unused.length} ohne Verweis`);
    }
    if (formatted.missing.length) parts.push(`${formatted.missing.length} nicht mehr in Zotero`);
    await plugin.app.toast(`Literaturverzeichnis: ${parts.join(', ')}.`);
  });
}

export function connect(plugin: RNPlugin): Promise<void> {
  return run(plugin, async () => {
    await new Bridge(plugin).pair();
    await plugin.app.toast('Mit Zotero verbunden.');
  });
}
