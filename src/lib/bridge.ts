import type { RNPlugin } from '@remnote/plugin-sdk';

// Client for the Zotrems Bridge plugin running inside Zotero.
//
// Only "simple" requests are used (GET without headers, POST with a text/plain
// body): Zotero's local server does not answer CORS preflights.

const TOKEN_KEY = 'zotero-bridge-token';

export type BridgeErrorKind = 'offline' | 'unauthorized' | 'denied' | 'busy' | 'other';

export class BridgeError extends Error {
  constructor(public kind: BridgeErrorKind, message: string) {
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
  /** URIs that no longer resolve to an item in Zotero. */
  missing: string[];
}

export class Bridge {
  constructor(private plugin: RNPlugin) {}

  private async base(): Promise<string> {
    const port = (await this.plugin.settings.getSetting<number>('port')) || 23119;
    return `http://127.0.0.1:${port}/zotrems`;
  }

  private async locale(): Promise<string> {
    return ((await this.plugin.settings.getSetting<string>('locale')) || '').trim();
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${await this.base()}${path}`, init);
    } catch {
      throw new BridgeError(
        'offline',
        'Zotero ist nicht erreichbar. Läuft Zotero, und ist das Plugin »Zotrems Bridge« installiert?'
      );
    }
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // handled below
    }
    if (response.ok && body) return body as T;
    if (response.status === 404 || (response.ok && !body)) {
      throw new BridgeError(
        'offline',
        'Zotero läuft, aber das Plugin »Zotrems Bridge« antwortet nicht. Ist es in Zotero installiert und aktiviert?'
      );
    }
    const code = body?.error;
    if (code === 'unauthorized') throw new BridgeError('unauthorized', 'Zotero hat den Zugriff abgelehnt.');
    if (code === 'denied') throw new BridgeError('denied', 'Die Verbindung wurde in Zotero abgelehnt.');
    if (code === 'busy') {
      throw new BridgeError('busy', 'In Zotero ist bereits ein Zitierdialog geöffnet.');
    }
    throw new BridgeError('other', `Zotero-Fehler: ${body?.message || `HTTP ${response.status}`}`);
  }

  /** Asks the user inside Zotero for permission and stores the resulting token. */
  async pair(): Promise<string> {
    await this.plugin.app.toast('Bitte die Verbindung in Zotero bestätigen …');
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

  /** Opens Zotero's native citation dialog. Resolves with [] if the user cancels. */
  async pick(): Promise<PickedCite[]> {
    const locale = await this.locale();
    return this.authorized(async (token) => {
      const query = new URLSearchParams({ token });
      if (locale) query.set('locale', locale);
      return (await this.request<{ cites: PickedCite[] }>(`/pick?${query}`)).cites;
    });
  }

  /** APA texts for all `uris` (and the items of `cites`), formatted as one bibliography. */
  async format(uris: string[], cites: PickedCite[] = []): Promise<FormatResult> {
    const locale = await this.locale();
    return this.authorized((token) =>
      this.request<FormatResult>('/format', {
        method: 'POST',
        // URI-encoded so that the body is plain ASCII
        body: encodeURIComponent(JSON.stringify({ token, locale, uris, cites })),
      })
    );
  }
}
