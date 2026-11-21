import type { RichTextInterface } from '@remnote/plugin-sdk';

// Converts the HTML of a Zotero note (or of annotations, which Zotero hands
// over as a generated note) into blocks of RemNote rich text.

/** Zotero replaces each citation inside a note with a link to this URL + a placeholder ID. */
const PLACEHOLDER_LINK = 'https://www.zotero.org/?';

export type BlockKind = 'text' | 'h1' | 'h2' | 'h3' | 'quote' | 'code' | 'list';

export interface NoteBlock {
  kind: BlockKind;
  text: RichTextInterface;
}

interface Format {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'blockquote',
  'pre',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
const SKIPPED_TAGS = new Set(['script', 'style', 'head', 'title', 'img']);

function blockKind(tag: string, inherited: BlockKind): BlockKind {
  if (tag === 'h1') return 'h1';
  if (tag === 'h2') return 'h2';
  if (/^h[3-6]$/.test(tag)) return 'h3';
  if (tag === 'blockquote') return 'quote';
  if (tag === 'pre') return 'code';
  if (tag === 'li') return 'list';
  // A paragraph inside a quote or list item stays a quote or list item.
  return inherited;
}

function trimEdges(text: RichTextInterface): RichTextInterface {
  const out = [...text];
  const edit = (index: number, trim: (s: string) => string) => {
    const element = out[index];
    if (typeof element === 'string') out[index] = trim(element);
    else if (element && element.i === 'm') out[index] = { ...element, text: trim(element.text) };
  };
  if (out.length) edit(0, (s) => s.replace(/^\s+/, ''));
  if (out.length) edit(out.length - 1, (s) => s.replace(/\s+$/, ''));
  return out.filter((element) =>
    typeof element === 'string' ? element : element.i !== 'm' || element.text
  );
}

/**
 * @param citation Returns the rich text for the citation behind a placeholder,
 *   or undefined if it cannot be cited; the citation's own text is kept then.
 */
export function parseNote(
  html: string,
  citation: (placeholder: string) => RichTextInterface | undefined
): NoteBlock[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: NoteBlock[] = [];
  let current: RichTextInterface = [];
  let currentKind: BlockKind = 'text';

  const flush = () => {
    const text = trimEdges(current);
    if (text.length) blocks.push({ kind: currentKind, text });
    current = [];
  };

  const pushText = (raw: string, format: Format, preformatted: boolean) => {
    const text = preformatted ? raw : raw.replace(/\s+/g, ' ');
    if (!text) return;
    // Do not start a block with, or repeat, collapsed whitespace.
    const last = current[current.length - 1];
    const lastText =
      typeof last === 'string' ? last : last && last.i === 'm' ? last.text : undefined;
    if (!preformatted && text === ' ' && (!current.length || lastText?.endsWith(' '))) return;
    if (!format.bold && !format.italic && !format.underline && !format.code) {
      current.push(text);
      return;
    }
    current.push({
      i: 'm',
      text,
      ...(format.bold ? { b: true } : {}),
      ...(format.italic ? { l: true } : {}),
      ...(format.underline ? { u: true } : {}),
      ...(format.code ? { q: true } : {}),
    });
  };

  const walk = (node: Node, format: Format, kind: BlockKind) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent || '', format, kind === 'code');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (SKIPPED_TAGS.has(tag)) return;

    if (tag === 'br') {
      pushText(kind === 'code' ? '\n' : ' ', format, kind === 'code');
      return;
    }

    if (tag === 'a') {
      const href = element.getAttribute('href') || '';
      if (href.startsWith(PLACEHOLDER_LINK)) {
        const cited = citation(href.slice(PLACEHOLDER_LINK.length));
        if (cited) {
          current.push(...cited);
          return;
        }
      }
    }

    if (BLOCK_TAGS.has(tag)) {
      const nextKind = blockKind(tag, kind);
      flush();
      currentKind = nextKind;
      element.childNodes.forEach((child) => {
        // A nested block may have changed the kind; restore it for what follows.
        currentKind = nextKind;
        walk(child, format, nextKind);
      });
      flush();
      currentKind = kind;
      return;
    }

    const next: Format = {
      bold: format.bold || tag === 'b' || tag === 'strong',
      italic: format.italic || tag === 'i' || tag === 'em',
      underline: format.underline || tag === 'u',
      code: format.code || tag === 'code',
    };
    element.childNodes.forEach((child) => walk(child, next, kind));
    // Keep table cells apart.
    if (tag === 'td' || tag === 'th') pushText(' ', format, false);
  };

  body.childNodes.forEach((child) => walk(child, {}, 'text'));
  flush();
  return blocks;
}

/**
 * Whether the HTML is what Zotero generates for picked annotations (every
 * paragraph is an annotation) rather than a note someone wrote.
 */
export function isAnnotationList(html: string): boolean {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  // Zotero wraps the content in a single <div data-schema-version>.
  const wrapper =
    body.children.length === 1 && body.children[0].tagName === 'DIV' ? body.children[0] : body;
  const paragraphs = Array.from(wrapper.children).filter(
    (element) => element.textContent?.trim() || element.querySelector('img')
  );
  return (
    paragraphs.length > 0 &&
    paragraphs.every(
      (element) =>
        element.matches('[data-annotation]') || element.querySelector('[data-annotation]')
    )
  );
}

/** Joins blocks into the text of a single Rem, one line per block. */
export function joinBlocks(blocks: NoteBlock[]): RichTextInterface {
  const out: RichTextInterface = [];
  blocks.forEach((block, index) => {
    if (index) out.push('\n');
    if (block.kind === 'list') out.push('• ');
    if (block.kind === 'h1' || block.kind === 'h2' || block.kind === 'h3') {
      // A heading inside a single Rem can only be set apart by weight.
      for (const element of block.text) {
        if (typeof element === 'string') out.push({ i: 'm', text: element, b: true });
        else if (element.i === 'm') out.push({ ...element, b: true });
        else out.push(element);
      }
    } else {
      out.push(...block.text);
    }
  });
  return out;
}
