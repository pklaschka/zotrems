import {
  BuiltInPowerupCodes,
  SetRemType,
  type PluginRem,
  type RNPlugin,
  type RichTextInterface,
} from '@remnote/plugin-sdk';
import type { FormatResult, FormattedItem } from './bridge';
import { DEFAULT_DOCUMENT_NAMES, INTRO_TEXTS, t } from './i18n';

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
  /** The child Rem holding the Zotero deep link. */
  link: PluginRem;
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

const INTRO_KEY = 'intro-rem-id';

/**
 * Makes sure the document starts with a quote Rem that explains how the
 * bibliography works. The Rem is remembered by ID, so it may be reworded;
 * if it is deleted, it comes back.
 */
export async function ensureIntro(plugin: RNPlugin, doc: PluginRem): Promise<void> {
  const children = await doc.getChildrenRem();
  const wanted = t('intro.text');

  const storedId = await plugin.storage.getSynced<string>(INTRO_KEY);
  let intro = children.find((rem) => rem._id === storedId);
  if (!intro) {
    // Not remembered (e.g. another device): recognise it by its text.
    for (const rem of children) {
      if (INTRO_TEXTS.includes(await plain(plugin, rem.text))) {
        intro = rem;
        break;
      }
    }
  }

  if (!intro) {
    intro = await plugin.rem.createRem();
    if (!intro) return;
    await intro.setParent(doc, 0);
    await intro.setText([wanted]);
    await intro.setIsQuote(true);
  } else {
    // Follow the interface language, unless the text was reworded.
    const current = await plain(plugin, intro.text);
    if (current !== wanted && INTRO_TEXTS.includes(current)) await intro.setText([wanted]);
    if (children[0]?._id !== intro._id) await intro.setParent(doc, 0);
  }
  if (storedId !== intro._id) await plugin.storage.setSynced(INTRO_KEY, intro._id);
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
  const found = await Promise.all(
    children.map(async (rem): Promise<Entry | undefined> => {
      for (const child of await rem.getChildrenRem()) {
        const uri = await findURIInRem(plugin, child);
        if (uri) return { rem, uri, link: child };
      }
      return undefined;
    })
  );
  return found.filter((entry): entry is Entry => !!entry);
}

/** A piece of a bibliography entry: formatted text, or a link still to be created. */
type Segment =
  | { kind: 'text'; text: string; italic: boolean; bold: boolean }
  | { kind: 'link'; text: string; url: string };

const BARE_URL = /https?:\/\/[^\s<>"]+/g;

/** Drops what merely follows a URL in a sentence: punctuation and unmatched closing brackets. */
function trimURL(url: string): string {
  for (;;) {
    const trimmed = url.replace(/[.,;:!?]+$/, '');
    const last = trimmed[trimmed.length - 1];
    const open = last === ')' ? '(' : last === ']' ? '[' : '';
    const unmatched = open && trimmed.split(open).length <= trimmed.split(last).length - 1;
    const next = unmatched ? trimmed.slice(0, -1) : trimmed;
    if (next === url) return url;
    url = next;
  }
}

/** Splits plain text into text and link segments at bare URLs (DOIs come as https://doi.org/…). */
function splitAtURLs(text: string, italic: boolean, bold: boolean): Segment[] {
  const segments: Segment[] = [];
  let position = 0;
  for (const match of text.matchAll(BARE_URL)) {
    // Punctuation that ends the sentence is not part of the URL.
    const url = trimURL(match[0]);
    const start = match.index ?? 0;
    if (start > position)
      segments.push({ kind: 'text', text: text.slice(position, start), italic, bold });
    segments.push({ kind: 'link', text: url, url });
    position = start + url.length;
  }
  if (position < text.length)
    segments.push({ kind: 'text', text: text.slice(position), italic, bold });
  return segments;
}

/** Breaks citeproc's HTML output into segments, keeping italics, bold and links. */
export function parseBibliography(html: string): Segment[] {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const out: Segment[] = [];
  const walk = (node: Node, italic: boolean, bold: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(...splitAtURLs(node.textContent || '', italic, bold));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const href = tag === 'a' ? element.getAttribute('href') || '' : '';
    if (/^https?:\/\//i.test(href)) {
      out.push({ kind: 'link', text: element.textContent || href, url: href });
      return;
    }
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

/**
 * Whether a rich text element is a link. RemNote has more than one way of
 * storing links (a URL on the text, or a reference to a link Rem), so this
 * accepts anything that is not plain formatted text.
 */
function hasLink(element: RichTextInterface[number]): boolean {
  if (typeof element !== 'object') return false;
  return element.i !== 'm' || Object.keys(element).some((key) => /url|qid/i.test(key));
}

/** Lets RemNote build the link, so it is stored the way RemNote itself would store it. */
async function linkRichText(
  plugin: RNPlugin,
  text: string,
  url: string
): Promise<RichTextInterface> {
  try {
    const label = text.replace(/([\\[\]])/g, '\\$1');
    const target = url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
    const parsed = await plugin.richText.parseFromMarkdown(`[${label}](${target})`);
    // If the markdown syntax is gone from the result, RemNote understood the link.
    if (parsed.length && !(await plugin.richText.toString(parsed)).includes('](')) return parsed;
    console.warn('[zotrems] RemNote did not turn this into a link:', url, parsed);
  } catch (err) {
    console.warn('[zotrems] Could not create a link for', url, err);
  }
  return [text];
}

async function toRichText(plugin: RNPlugin, segments: Segment[]): Promise<RichTextInterface> {
  const out: RichTextInterface = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    if (segment.kind === 'link') {
      out.push(...(await linkRichText(plugin, segment.text, segment.url)));
    } else if (!segment.italic && !segment.bold) {
      out.push(segment.text);
    } else {
      out.push({
        i: 'm',
        text: segment.text,
        ...(segment.italic ? { l: true } : {}),
        ...(segment.bold ? { b: true } : {}),
      });
    }
  }
  return out;
}

async function plain(plugin: RNPlugin, text: RichTextInterface | undefined): Promise<string> {
  return text ? (await plugin.richText.toString(text)).trim() : '';
}

/** Writes the Zotero deep link into a Rem, labelled `label`. */
async function writeZoteroLink(
  plugin: RNPlugin,
  detail: PluginRem,
  uri: string,
  label: string
): Promise<void> {
  let text: RichTextInterface | undefined;
  try {
    text = await plugin.richText.parseFromMarkdown(`[${label}](${uri})`);
  } catch {
    // fall back to the bare URI below
  }
  if (text) await detail.setText(text);

  // The link is the only mapping to Zotero, so make sure it can be read back.
  const written = text ? await plugin.rem.findOne(detail._id) : undefined;
  if (!written || (await findURIInRem(plugin, written)) !== uri) {
    await detail.setText([uri]);
  }
}

async function addZoteroLink(plugin: RNPlugin, entry: PluginRem, uri: string): Promise<PluginRem> {
  const detail = await plugin.rem.createRem();
  if (!detail) throw new Error(t('error.createLink'));
  await detail.setParent(entry);
  await writeZoteroLink(plugin, detail, uri, t('link.label'));
  await detail.addPowerup(BuiltInPowerupCodes.ExtraCardDetail);
  return detail;
}

/**
 * Labels an entry's link "Open in Zotero" or, if the item is gone, "Not found
 * in Zotero". The link itself stays, so the entry recovers when the item is
 * restored from Zotero's trash.
 */
async function labelZoteroLink(plugin: RNPlugin, entry: Entry, missing: boolean): Promise<void> {
  const label = t(missing ? 'link.missing' : 'link.label');
  const current = await plain(plugin, (await plugin.rem.findOne(entry.link._id))?.text);
  // A bare URI is the fallback for links RemNote could not store; leave it.
  if (current === label || current === entry.uri) return;
  await writeZoteroLink(plugin, entry.link, entry.uri, label);
}

/**
 * Points every reference to `from` at `to` instead. Returns whether no
 * reference to `from` is left afterwards.
 */
async function moveReferences(from: PluginRem, to: PluginRem): Promise<boolean> {
  const swap = (text: RichTextInterface | undefined): RichTextInterface | undefined => {
    if (
      !text?.some(
        (element) => typeof element === 'object' && element.i === 'q' && element._id === from._id
      )
    ) {
      return undefined;
    }
    return text.map((element) => {
      if (typeof element !== 'object' || element.i !== 'q' || element._id !== from._id)
        return element;
      // An alias belongs to the old entry and cannot be carried over.
      const { aliasId: _aliasId, ...rest } = element;
      return { ...rest, _id: to._id };
    });
  };

  const own = new Set((await from.getDescendants()).map((rem) => rem._id));
  let complete = true;
  for (const reference of await from.remsReferencingThis()) {
    if (own.has(reference._id)) continue;
    const text = swap(reference.text);
    const backText = swap(reference.backText);
    if (text) await reference.setText(text);
    if (backText) await reference.setBackText(backText);
    // The reference sits somewhere we cannot rewrite (e.g. nested in other content).
    if (!text && !backText) complete = false;
  }
  return complete;
}

async function writeEntry(plugin: RNPlugin, rem: PluginRem, item: FormattedItem): Promise<boolean> {
  let changed = false;
  if ((await plain(plugin, rem.text)) !== item.inText) {
    await rem.setText([item.inText]);
    changed = true;
  }
  const segments = parseBibliography(item.bibliographyHTML);
  const bibliography = segments
    .map((segment) => segment.text)
    .join('')
    .trim();
  // Rewrite when the text differs, or when URLs are not links yet.
  const links = segments.filter((segment) => segment.kind === 'link').length;
  const linked = (rem.backText || []).filter(hasLink).length;
  if ((await plain(plugin, rem.backText)) !== bibliography || linked < links) {
    await rem.setBackText(await toRichText(plugin, segments));
    changed = true;
  }
  return changed;
}

export interface SyncResult {
  /** URI -> entry Rem, for every entry now in the document. */
  entries: Map<string, PluginRem>;
  /** The entries now in the document, without duplicates. */
  current: Entry[];
  created: number;
  updated: number;
  /** Entries that follow an item merged into another one in Zotero. */
  relinked: number;
  /** Entries whose item no longer exists in Zotero. */
  missing: number;
}

/**
 * Brings the bibliography document in line with Zotero:
 *
 * - entries of items merged in Zotero follow the surviving item,
 * - entries of items that no longer exist are kept (they may still be cited)
 *   and marked as not found,
 * - the texts of all other entries are updated,
 * - entries are created for items that are not listed yet.
 */
export async function syncEntries(
  plugin: RNPlugin,
  doc: PluginRem,
  existing: Entry[],
  result: FormatResult
): Promise<SyncResult> {
  const { items } = result;
  const missing = new Set(result.missing);
  const byURI = new Map<string, Entry>();
  let created = 0;
  let updated = 0;
  let relinked = 0;

  // Entries whose item still exists under its own link come first, so that
  // entries of merged items can be folded into them.
  const stale = existing.filter((entry) => entry.uri in result.replaced);
  for (const entry of existing) {
    if (!(entry.uri in result.replaced) && !byURI.has(entry.uri)) byURI.set(entry.uri, entry);
  }
  for (const entry of stale) {
    const uri = result.replaced[entry.uri];
    const survivor = byURI.get(uri);
    if (survivor && (await moveReferences(entry.rem, survivor.rem))) {
      await entry.rem.remove();
    } else {
      await writeZoteroLink(plugin, entry.link, uri, t('link.label'));
      if (!survivor) byURI.set(uri, { ...entry, uri });
    }
    relinked++;
  }

  let current = [...byURI.values()];
  for (const entry of current) {
    await labelZoteroLink(plugin, entry, missing.has(entry.uri));
    const item = items[entry.uri];
    if (item && (await writeEntry(plugin, entry.rem, item))) updated++;
  }

  const fresh = Object.keys(items)
    .filter((uri) => !byURI.has(uri))
    .sort((a, b) => items[a].order - items[b].order);

  for (const uri of fresh) {
    const item = items[uri];
    const rem = await plugin.rem.createRem();
    if (!rem) throw new Error(t('error.createEntry'));

    // Keep the document in APA order: insert before the first entry that sorts later.
    const siblings = (await plugin.rem.findOne(doc._id))?.children || [];
    const successor = current.find((entry) => (items[entry.uri]?.order ?? -1) > item.order);
    const index = successor ? siblings.indexOf(successor.rem._id) : -1;
    await rem.setParent(doc, index >= 0 ? index : siblings.length);

    await rem.setText([item.inText]);
    await rem.setType(SetRemType.CONCEPT);
    await rem.setBackText(await toRichText(plugin, parseBibliography(item.bibliographyHTML)));
    await rem.setPracticeDirection('none');
    const link = await addZoteroLink(plugin, rem, uri);

    const entry = { rem, uri, link };
    byURI.set(uri, entry);
    current = [...current, entry];
    created++;
  }

  return {
    entries: new Map(current.map((entry) => [entry.uri, entry.rem])),
    current,
    created,
    updated,
    relinked,
    missing: current.filter((entry) => missing.has(entry.uri)).length,
  };
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
