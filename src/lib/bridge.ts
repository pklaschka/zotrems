import type { RNPlugin } from '@remnote/plugin-sdk';
import { t } from './i18n';

// Client for the Zotrems Bridge plugin running inside Zotero.
//
// Only "simple" requests are used (GET without headers, POST with a text/plain
// body): Zotero's local server does not answer CORS preflights.

const TOKEN_KEY = 'zotero-bridge-token';

export type BridgeErrorKind = 'offline' | 'unauthorized' | 'denied' | 'busy' | 'other';

export class BridgeError extends Error {
  constructor(
    public kind: BridgeErrorKind,
    message: string
  ) {
    super(message);
  }
}

/** One citation as chosen in Zotero's picker. */
export interface PickedCite {
  uri: string;
  locator: string;
  label: string;
  prefix: string;
  suffix: string;
  suppressAuthor: boolean;
  /** Free label that `format` passes through; used to tell the citations of a note apart. */
  group?: string;
}

/** The content of a Zotero note or of annotations, as picked in the dialog. */
export interface PickedNote {
  /** Each citation inside is a link to https://www.zotero.org/?<placeholder>. */
  html: string;
  /** Placeholder -> the items of that citation. */
  citations: Record<string, PickedCite[]>;
  /** Number of images that could not be carried over. */
  images: number;
}

export interface PickResult {
  /** The picked citation; empty if a note or annotations were picked, or the dialog was cancelled. */
  cites: PickedCite[];
  note: PickedNote | null;
}

export interface FormattedItem {
  /** e.g. "Müller, 2024" */
  inText: string;
  /** APA bibliography entry; may contain <i> etc. */
  bibliographyHTML: string;
  /** Position in the APA-sorted bibliography of all requested items. */
  order: number;
}

export interface FormattedCite {
  uri: string;
  group: string;
  prefix: string;
  suffix: string;
  suppressAuthor: boolean;
  /** Replaces the author-year reference when the author is suppressed, e.g. "2024". */
  yearText: string;
  /** Ready to append after the reference, e.g. ", S. 12". */
  locatorText: string;
}

export interface FormatResult {
  items: Record<string, FormattedItem>;
  cites: FormattedCite[];
  /** URIs that no longer resolve to an item in Zotero (deleted or in the trash). */
  missing: string[];
  /** Requested URI -> current URI, for items that were merged into another item in Zotero. */
  replaced: Record<string, string>;
}

export class Bridge {
  constructor(private plugin: RNPlugin) {}

  private async base(): Promise<string> {
    const port = (await this.plugin.settings.getSetting<number>('port')) || 23119;
    return `http://127.0.0.1:${port}/zotrems`;
  }

  /** The citation locale to request; '' lets Zotero use its own language. */
  private async locale(): Promise<string> {
    const choice = await this.plugin.settings.getSetting<string>('locale');
    return choice === 'de-DE' || choice === 'en-US' ? choice : '';
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${await this.base()}${path}`, init);
    } catch {
      throw new BridgeError('offline', t('error.offline'));
    }
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // handled below
    }
    if (response.ok && body) return body as T;
    if (response.status === 404 || (response.ok && !body)) {
      throw new BridgeError('offline', t('error.noBridge'));
    }
    const code = body?.error;
    if (code === 'unauthorized') throw new BridgeError('unauthorized', t('error.unauthorized'));
    if (code === 'denied') throw new BridgeError('denied', t('error.denied'));
    if (code === 'busy') {
      throw new BridgeError('busy', t('error.pickerOpen'));
    }
    throw new BridgeError(
      'other',
      t('error.zotero', { message: body?.message || `HTTP ${response.status}` })
    );
  }

  /** Asks the user inside Zotero for permission and stores the resulting token. */
  async pair(): Promise<string> {
    await this.plugin.app.toast(t('toast.confirmInZotero'));
    const { token } = await this.request<{ token: string }>('/pair');
    await this.plugin.storage.setLocal(TOKEN_KEY, token);
    return token;
  }

  private async token(): Promise<string> {
    return (await this.plugin.storage.getLocal<string>(TOKEN_KEY)) || (await this.pair());
  }

  /** Runs `fn` with a token; pairs again once if Zotero no longer accepts the stored one. */
  private async authorized<T>(fn: (token: string) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.token());
    } catch (err) {
      if (!(err instanceof BridgeError) || err.kind !== 'unauthorized') throw err;
      return await fn(await this.pair());
    }
  }

  /** Opens Zotero's native citation dialog. Resolves with nothing picked if the user cancels. */
  async pick(): Promise<PickResult> {
    const locale = await this.locale();
    return this.authorized(async (token) => {
      const query = new URLSearchParams({ token });
      if (locale) query.set('locale', locale);
      const result = await this.request<Partial<PickResult>>(`/pick?${query}`);
      return { cites: result.cites || [], note: result.note || null };
    });
  }

  /** APA texts for all `uris` (and the items of `cites`), formatted as one bibliography. */
  async format(uris: string[], cites: PickedCite[] = []): Promise<FormatResult> {
    const locale = await this.locale();
    const result = await this.authorized((token) =>
      this.request<Partial<FormatResult>>('/format', {
        method: 'POST',
        // URI-encoded so that the body is plain ASCII
        body: encodeURIComponent(JSON.stringify({ token, locale, uris, cites })),
      })
    );
    // An older Zotrems Bridge does not send every field.
    return {
      items: result.items || {},
      cites: (result.cites || []).map((cite) => ({ ...cite, group: cite.group || '' })),
      missing: result.missing || [],
      replaced: result.replaced || {},
    };
  }
}
