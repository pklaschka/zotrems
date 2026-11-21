import {
  BuiltInPowerupCodes,
  SetRemType,
  type PluginRem,
  type RNPlugin,
  type RichTextInterface,
} from '@remnote/plugin-sdk';
import type { FormattedItem } from './bridge';
import { DEFAULT_DOCUMENT_NAMES, t } from './i18n';

// The bibliography document holds one concept per Zotero item:
//
//   Müller, 2024 :: Müller, S. (2024). Titel. Verlag.     (practice disabled)
//       In Zotero öffnen -> zotero://select/...            (Extra Card Detail)
//
// The deep link in the child is what ties a Rem to its Zotero item.

const ZOTERO_URI = /zotero:\/\/select\/(?:library|groups\/\d+)\/items\/[A-Z0-9]+/;

export interface Entry {
  rem: PluginRem;
  uri: string;
}

export async function documentName(plugin: RNPlugin): Promise<string> {
  const name = ((await plugin.settings.getSetting<string>('document')) || '').trim();
  return name || t('setting.document.default');
}

export async function findDocument(plugin: RNPlugin): Promise<PluginRem | undefined> {
  // Also look for the other languages' default names, so that switching the
  // interface language does not start a second bibliography.
  for (const name of new Set([await documentName(plugin), ...DEFAULT_DOCUMENT_NAMES])) {
    const doc = await plugin.rem.findByName([name], null);
    if (doc) return doc;
  }
  return undefined;
}

export async function getOrCreateDocument(plugin: RNPlugin): Promise<PluginRem> {
  const existing = await findDocument(plugin);
  if (existing) return existing;
  const doc = await plugin.rem.createRem();
  if (!doc) throw new Error(t('error.createDocument'));
  await doc.setText([await documentName(plugin)]);
  await doc.setIsDocument(true);
  return doc;
}

function matchURI(value: unknown): string | undefined {
  return JSON.stringify(value ?? '').match(ZOTERO_URI)?.[0];
}

/** Finds a Zotero deep link in a Rem's text, however RemNote stores the link. */
async function findURIInRem(plugin: RNPlugin, rem: PluginRem): Promise<string | undefined> {
  const text = rem.text;
  if (!text) return undefined;

  const direct = matchURI(text);
  if (direct) return direct;

  try {
    const fromUrls = matchURI(await plugin.richText.findAllExternalURLs(text));
    if (fromUrls) return fromUrls;
  } catch {
    // fall through
  }

  // Inline links point at a separate link Rem.
  for (const element of text) {
    const linkId =
      typeof element === 'object' && 'qId' in element ? (element as any).qId : undefined;
    if (!linkId) continue;
    const linkRem = await plugin.rem.findOne(linkId);
    if (!linkRem) continue;
    const fromText = matchURI(linkRem.text);
    if (fromText) return fromText;
    try {
      const fromSlot = matchURI(await linkRem.getPowerupProperty(BuiltInPowerupCodes.Link, 'URL'));
      if (fromSlot) return fromSlot;
    } catch {
      // not a link Rem
    }
  }
  return undefined;
}

/** All bibliography entries, in document order. */
export async function loadEntries(plugin: RNPlugin, doc: PluginRem): Promise<Entry[]> {
  const children = await doc.getChildrenRem();
  const uris = await Promise.all(
    children.map(async (rem) => {
      for (const child of await rem.getChildrenRem()) {
        const uri = await findURIInRem(plugin, child);
        if (uri) return uri;
      }
      return undefined;
    })
  );
  const entries: Entry[] = [];
  children.forEach((rem, i) => {
    const uri = uris[i];
    if (uri) entries.push({ rem, uri });
  });
  return entries;
}

function decodeEntities(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
}

/** Converts citeproc's HTML output to RemNote rich text, keeping italics and bold. */
export function htmlToRichText(html: string): RichTextInterface {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const out: RichTextInterface = [];
  const walk = (node: Node, italic: boolean, bold: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return;
      if (!italic && !bold) out.push(text);
      else out.push({ i: 'm', text, ...(italic ? { l: true } : {}), ...(bold ? { b: true } : {}) });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const style = element.getAttribute('style') || '';
    // citeproc un-italicises nested titles with font-style:normal
    const nextItalic = /font-style:\s*normal/.test(style)
      ? false
      : italic || tag === 'i' || tag === 'em';
    const nextBold = bold || tag === 'b' || tag === 'strong';
    element.childNodes.forEach((child) => walk(child, nextItalic, nextBold));
  };
  body.childNodes.forEach((child) => walk(child, false, false));
  return out;
}

async function plain(plugin: RNPlugin, text: RichTextInterface | undefined): Promise<string> {
  return text ? (await plugin.richText.toString(text)).trim() : '';
}

async function addZoteroLink(plugin: RNPlugin, entry: PluginRem, uri: string): Promise<void> {
  const detail = await plugin.rem.createRem();
  if (!detail) throw new Error(t('error.createLink'));
  await detail.setParent(entry);

  let text: RichTextInterface | undefined;
  try {
    text = await plugin.richText.parseFromMarkdown(`[${t('link.label')}](${uri})`);
  } catch {
    // fall back to the bare URI below
  }
  if (text) await detail.setText(text);

  // The link is the only mapping to Zotero, so make sure it can be read back.
  const written = text ? await plugin.rem.findOne(detail._id) : undefined;
  if (!written || (await findURIInRem(plugin, written)) !== uri) {
    await detail.setText([uri]);
  }
  await detail.addPowerup(BuiltInPowerupCodes.ExtraCardDetail);
}

async function writeEntry(plugin: RNPlugin, rem: PluginRem, item: FormattedItem): Promise<boolean> {
  let changed = false;
  if ((await plain(plugin, rem.text)) !== item.inText) {
    await rem.setText([item.inText]);
    changed = true;
  }
  const bibliography = decodeEntities(item.bibliographyHTML).trim();
  if ((await plain(plugin, rem.backText)) !== bibliography) {
    await rem.setBackText(htmlToRichText(item.bibliographyHTML));
    changed = true;
  }
  return changed;
}

export interface SyncResult {
  entries: Map<string, PluginRem>;
  created: number;
  updated: number;
}

/**
 * Brings the bibliography document in line with Zotero: updates the texts of
 * existing entries and creates entries for items that are not listed yet.
 */
export async function syncEntries(
  plugin: RNPlugin,
  doc: PluginRem,
  existing: Entry[],
  items: Record<string, FormattedItem>
): Promise<SyncResult> {
  const entries = new Map<string, PluginRem>();
  let created = 0;
  let updated = 0;

  for (const { rem, uri } of existing) {
    if (entries.has(uri)) continue; // duplicate entry: leave it alone
    entries.set(uri, rem);
    const item = items[uri];
    if (item && (await writeEntry(plugin, rem, item))) updated++;
  }

  const fresh = Object.keys(items)
    .filter((uri) => !entries.has(uri))
    .sort((a, b) => items[a].order - items[b].order);

  for (const uri of fresh) {
    const item = items[uri];
    const rem = await plugin.rem.createRem();
    if (!rem) throw new Error(t('error.createEntry'));

    // Keep the document in APA order: insert before the first entry that sorts later.
    const siblings = (await plugin.rem.findOne(doc._id))?.children || [];
    const successor = existing.find((entry) => (items[entry.uri]?.order ?? -1) > item.order);
    const index = successor ? siblings.indexOf(successor.rem._id) : -1;
    await rem.setParent(doc, index >= 0 ? index : siblings.length);

    await rem.setText([item.inText]);
    await rem.setType(SetRemType.CONCEPT);
    await rem.setBackText(htmlToRichText(item.bibliographyHTML));
    await rem.setPracticeDirection('none');
    await addZoteroLink(plugin, rem, uri);

    entries.set(uri, rem);
    existing = [...existing, { rem, uri }];
    created++;
  }

  return { entries, created, updated };
}

function isBlank(text: RichTextInterface | undefined): boolean {
  return !text || text.every((element) => typeof element === 'string' && !element.trim());
}

/**
 * Removes Rems without any content (no text, no back text, no children)
 * anywhere in the bibliography document. Returns how many were removed.
 */
export async function removeEmptyRems(doc: PluginRem): Promise<number> {
  let removed = 0;
  for (const rem of await doc.getDescendants()) {
    if (!isBlank(rem.text) || !isBlank(rem.backText) || rem.children?.length) continue;
    await rem.remove();
    removed++;
  }
  return removed;
}
