import type { PluginRem, RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import { Bridge, BridgeError, type FormattedCite, type PickedCite } from './bridge';
import { isAnnotationList, joinBlocks, parseNote, type BlockKind, type NoteBlock } from './note';
import {
  citingRems,
  ensureIntro,
  findDocument,
  getOrCreateDocument,
  loadEntries,
  removeEmptyRems,
  syncEntries,
} from './bibliography';
import { t } from './i18n';

let busy = false;

/** Runs a command exclusively and turns errors into toasts. */
async function run(plugin: RNPlugin, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    await plugin.app.toast(t('toast.busy'));
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

/** "(vgl. [[Müller, 2024]], S. 12; [[Meier, 2023]])", or undefined if none of the cites has an entry. */
async function citationRichText(
  cites: FormattedCite[],
  entries: Map<string, PluginRem>
): Promise<RichTextInterface | undefined> {
  const citation: RichTextInterface = ['('];
  let first = true;
  for (const cite of cites) {
    const rem = entries.get(cite.uri);
    if (!rem) continue;
    if (!first) citation.push('; ');
    first = false;
    if (cite.prefix) citation.push(`${cite.prefix.trimEnd()} `);
    // "Omit Author" is not supported: RemNote offers plugins no way to show a
    // reference under another text, so the full author-year is always used.
    citation.push({ i: 'q', _id: rem._id });
    if (cite.locatorText) citation.push(cite.locatorText);
    if (cite.suffix) citation.push(joinSuffix(cite.suffix));
  }
  if (first) return undefined;
  citation.push(')');
  return citation;
}

async function styleBlock(rem: PluginRem, kind: BlockKind): Promise<void> {
  try {
    if (kind === 'h1') await rem.setFontSize('H1');
    else if (kind === 'h2') await rem.setFontSize('H2');
    else if (kind === 'h3') await rem.setFontSize('H3');
    else if (kind === 'quote') await rem.setIsQuote(true);
    else if (kind === 'code') await rem.setIsCode(true);
    else if (kind === 'list') await rem.setIsListItem(true);
  } catch (err) {
    // Styling is a nicety; the text is what matters.
    console.warn('[zotrems]', err);
  }
}

/**
 * Inserts the first block at the cursor and the remaining ones as Rems
 * following the target – the way pasting several paragraphs behaves.
 */
async function insertBlocks(
  plugin: RNPlugin,
  targetId: string,
  blocks: NoteBlock[]
): Promise<void> {
  const [first, ...rest] = blocks;

  // Zotero's dialog takes the window focus; if the editor lost its caret,
  // append to the Rem that was focused when the command started.
  const focused = await plugin.focus.getFocusedRem();
  if (focused?._id === targetId) {
    await plugin.editor.insertRichText(first.text);
  } else {
    const current = await plugin.rem.findOne(targetId);
    if (!current) throw new Error(t('error.targetGone'));
    const text = current.text || [];
    await current.setText([...text, ...(text.length ? [' '] : []), ...first.text]);
  }
  if (!rest.length) return;

  const target = await plugin.rem.findOne(targetId);
  if (!target) throw new Error(t('error.targetGone'));
  const parent = target.parent ? await plugin.rem.findOne(target.parent) : undefined;
  // Top-level Rems have no siblings we can insert between; use children there.
  const container = parent || target;
  let index = parent ? (parent.children || []).indexOf(target._id) + 1 : 0;
  for (const block of rest) {
    const rem = await plugin.rem.createRem();
    if (!rem) throw new Error(t('error.createRem'));
    await rem.setParent(container, index++);
    await rem.setText(block.text);
    await styleBlock(rem, block.kind);
  }
}

function isBlank(text: RichTextInterface | undefined): boolean {
  return !text || text.every((element) => typeof element === 'string' && !element.trim());
}

/**
 * Inserts a whole note as one quote Rem: into the target if that is still
 * empty, otherwise into a new Rem right after it.
 */
async function insertQuote(
  plugin: RNPlugin,
  targetId: string,
  text: RichTextInterface
): Promise<void> {
  const target = await plugin.rem.findOne(targetId);
  if (!target) throw new Error(t('error.targetGone'));

  let quote = target;
  if (!isBlank(target.text) || target.children?.length) {
    const created = await plugin.rem.createRem();
    if (!created) throw new Error(t('error.createRem'));
    const parent = target.parent ? await plugin.rem.findOne(target.parent) : undefined;
    // Top-level Rems have no siblings we can insert between; use a child there.
    if (parent) await created.setParent(parent, (parent.children || []).indexOf(target._id) + 1);
    else await created.setParent(target, 0);
    quote = created;
  }
  await quote.setText(text);
  await quote.setIsQuote(true);
}

export function insertCitation(plugin: RNPlugin): Promise<void> {
  return run(plugin, async () => {
    const target = await plugin.focus.getFocusedRem();
    if (!target) {
      await plugin.app.toast(t('toast.noFocus'));
      return;
    }

    const bridge = new Bridge(plugin);
    const { cites, note } = await bridge.pick();

    // The citations inside a note are told apart by their placeholder.
    const picked: PickedCite[] = note
      ? Object.entries(note.citations).flatMap(([placeholder, items]) =>
          items.map((item) => ({ ...item, group: placeholder }))
        )
      : cites;
    if (!note && !picked.length) return;

    let formatted: FormattedCite[] = [];
    let entries = new Map<string, PluginRem>();
    if (picked.length) {
      const doc = await getOrCreateDocument(plugin);
      await ensureIntro(plugin, doc);
      const existing = await loadEntries(plugin, doc);
      const result = await bridge.format(
        existing.map((entry) => entry.uri),
        picked
      );
      formatted = result.cites;
      entries = (await syncEntries(plugin, doc, existing, result)).entries;
    }

    let blocks: NoteBlock[];
    if (note) {
      const citations = new Map<string, RichTextInterface>();
      for (const placeholder of Object.keys(note.citations)) {
        const citation = await citationRichText(
          formatted.filter((cite) => cite.group === placeholder),
          entries
        );
        if (citation) citations.set(placeholder, citation);
      }
      blocks = parseNote(note.html, (placeholder) => citations.get(placeholder));
    } else {
      const citation = await citationRichText(formatted, entries);
      blocks = citation ? [{ kind: 'text', text: citation }] : [];
    }

    if (!blocks.length) {
      await plugin.app.toast(t(note ? 'toast.nothingToInsert' : 'toast.nothingCited'));
      return;
    }
    // Annotations read as quotes within the running text; a note is a text of
    // its own and goes into one quote Rem.
    if (note && !isAnnotationList(note.html)) {
      await insertQuote(plugin, target._id, joinBlocks(blocks));
    } else {
      await insertBlocks(plugin, target._id, blocks);
    }
    if (note?.images) await plugin.app.toast(t('toast.imagesSkipped', { count: note.images }));
  });
}

export function refreshBibliography(plugin: RNPlugin): Promise<void> {
  return run(plugin, async () => {
    const doc = await findDocument(plugin);
    const empty = doc ? await removeEmptyRems(doc) : 0;
    if (doc) await ensureIntro(plugin, doc);
    const existing = doc ? await loadEntries(plugin, doc) : [];
    if (!doc || !existing.length) {
      await plugin.app.toast(
        empty ? t('toast.onlyEmptyRemoved', { count: empty }) : t('toast.bibliographyEmpty')
      );
      return;
    }

    const formatted = await new Bridge(plugin).format(existing.map((entry) => entry.uri));
    const synced = await syncEntries(plugin, doc, existing, formatted);

    const unused = [];
    for (const entry of synced.current) {
      if (!(await citingRems(entry.rem)).length) unused.push(entry);
    }
    const removeUnused = await plugin.settings.getSetting<boolean>('remove-unused');
    if (removeUnused) {
      for (const entry of unused) await entry.rem.remove();
    }

    const parts = [
      t('refresh.checked', { count: existing.length }),
      t('refresh.updated', { count: synced.updated }),
    ];
    if (unused.length) {
      parts.push(
        t(removeUnused ? 'refresh.unusedRemoved' : 'refresh.unused', { count: unused.length })
      );
    }
    if (empty) parts.push(t('refresh.emptyRemoved', { count: empty }));
    if (synced.relinked) parts.push(t('refresh.relinked', { count: synced.relinked }));
    if (synced.missing) parts.push(t('refresh.missing', { count: synced.missing }));
    await plugin.app.toast(t('toast.refreshed', { parts: parts.join(', ') }));
  });
}

export function connect(plugin: RNPlugin): Promise<void> {
  return run(plugin, async () => {
    await new Bridge(plugin).pair();
    await plugin.app.toast(t('toast.connected'));
  });
}
