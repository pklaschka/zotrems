/* global Zotero, Services */
/* eslint-disable no-unused-vars */

// Zotrems Bridge
//
// Zotero's local HTTP server rejects every request that comes from a browser
// context, so a RemNote plugin cannot talk to it directly. This plugin adds a
// few endpoints that opt into browser requests, protected by a pairing token:
//
//   GET  /zotrems/ping    -> is the bridge there, is my token valid?
//   GET  /zotrems/pair    -> asks the user in Zotero, then hands out the token
//   GET  /zotrems/pick    -> opens the native citation dialog
//   POST /zotrems/format  -> APA in-text + bibliography text for a set of items
//
// Only "simple" requests are used (no custom headers, text/plain bodies):
// Zotero's server does not answer CORS preflights.

const PREF_TOKEN = 'extensions.zotrems.token';
const APA = 'http://www.zotero.org/styles/apa';
const ITEM_PREFIX = 'ITEM CSL_CITATION ';
const ENDPOINTS = ['/zotrems/ping', '/zotrems/pair', '/zotrems/pick', '/zotrems/format'];

let bridgeVersion = '';
let pickInProgress = false;

// ---------------------------------------------------------------- helpers

function reply(status, payload) {
  return [
    status,
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
    JSON.stringify(payload),
  ];
}

function getToken() {
  return Zotero.Prefs.get(PREF_TOKEN, true) || '';
}

function tokenOK(token) {
  const expected = getToken();
  return !!expected && typeof token === 'string' && token === expected;
}

function isGerman() {
  return String(Zotero.locale || '').toLowerCase().startsWith('de');
}

function defaultLocale() {
  return Zotero.Prefs.get('export.quickCopy.locale') || Zotero.locale || 'en-US';
}

function selectURI(item) {
  const library = Zotero.Libraries.get(item.libraryID);
  if (library && library.libraryType === 'group') {
    return `zotero://select/groups/${library.groupID}/items/${item.key}`;
  }
  return `zotero://select/library/items/${item.key}`;
}

function itemFromSelectURI(uri) {
  const m = /^zotero:\/\/select\/(library|groups\/(\d+))\/items\/([A-Z0-9]+)$/.exec(String(uri));
  if (!m) return null;
  const libraryID = m[2]
    ? Zotero.Groups.getLibraryIDFromGroupID(Number(m[2]))
    : Zotero.Libraries.userLibraryID;
  if (!libraryID) return null;
  const item = Zotero.Items.getByLibraryAndKey(libraryID, m[3]);
  if (!item || item.deleted || !item.isRegularItem()) return null;
  return item;
}

// "(Müller, 2024)" -> "Müller, 2024"
function stripParens(text) {
  const trimmed = String(text).trim();
  return trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1) : trimmed;
}

// ---------------------------------------------------------------- picker
//
// Drives Zotero's own HTTP document integration (the protocol the Google Docs
// connector uses) against an in-memory fake document. Approach taken from
// Better BibTeX's CAYW implementation.

async function postJSON(url, payload) {
  const xhr = await Zotero.HTTP.request('POST', url, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', 'Zotero-Allowed-Request': 'true' },
    timeout: 0,
    successCodes: false,
  });
  const body = (xhr.responseText || '').trim();
  if (xhr.status === 503) throw new Error('busy');
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error(`HTTP ${xhr.status} from ${url}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

async function pickCitation(locale) {
  const docId = `zotrems-${Zotero.Utilities.randomString(12)}`;
  const base = `http://127.0.0.1:${Zotero.Prefs.get('httpServer.port')}/connector/document`;

  let documentData = `<data data-version="3" zotero-version="${Zotero.version}">`
    + `<session id="${docId}"/>`
    + `<style id="${APA}" locale="${locale}" hasBibliography="1" bibliographyStyleHasBeenSet="0"/>`
    + '<prefs><pref name="fieldType" value="Http"/><pref name="noteType" value="0"/></prefs>'
    + '</data>';
  let fields = [];
  const inserted = [];

  const newField = (code) => {
    const field = { id: String(inserted.length), code: code || '', text: '{Placeholder}', noteIndex: 0, adjacent: false };
    fields.push(field);
    inserted.push(field);
    return field;
  };
  const fieldByRef = (ref) => {
    const field = fields.find((f) => f.id === String(ref)) || fields[Number(ref)];
    if (!field) throw new Error(`Unknown field: ${ref}`);
    return field;
  };

  const respond = (command, args) => {
    if (command === 'Application.getActiveDocument') {
      return { documentID: docId, outputFormat: 'html', supportedNotes: ['footnotes'], processorName: 'RemNote' };
    }
    const a = args.slice(1); // args[0] is the document id
    switch (command) {
      case 'Document.displayAlert': return 0;
      case 'Document.activate': return null;
      case 'Document.canInsertField': return true;
      case 'Document.cursorInField': return null;
      case 'Document.getDocumentData': return documentData;
      case 'Document.setDocumentData': documentData = String(a[0] || ''); return null;
      case 'Document.insertField': return newField('');
      case 'Document.getFields': return fields;
      case 'Document.convert': return null;
      case 'Document.convertPlaceholdersToFields':
        return (Array.isArray(a[0]) ? a[0] : []).map((placeholder) => newField(String(placeholder)));
      case 'Document.insertText': return null;
      case 'Document.setBibliographyStyle': return null;
      case 'Document.complete': return null;
      case 'Field.delete': {
        const field = fieldByRef(a[0]);
        fields = fields.filter((f) => f !== field);
        field.code = '';
        return null;
      }
      case 'Field.select': return null;
      case 'Field.removeCode': fieldByRef(a[0]).code = ''; return null;
      case 'Field.setText': fieldByRef(a[0]).text = String(a[1] || ''); return null;
      case 'Field.getText': return fieldByRef(a[0]).text;
      case 'Field.setCode': fieldByRef(a[0]).code = String(a[1] || ''); return null;
      default: throw new Error(`Unsupported integration command: ${command}`);
    }
  };

  let request = await postJSON(`${base}/execCommand`, { command: 'addEditCitation', docId });
  for (;;) {
    if (!request || typeof request !== 'object' || !request.command) {
      throw new Error(`Unexpected response from Zotero: ${JSON.stringify(request)}`);
    }
    let payload;
    try {
      payload = respond(request.command, Array.isArray(request.arguments) ? request.arguments : []);
    }
    catch (err) {
      await postJSON(`${base}/respond`, { error: 'Error', message: String(err.message), stack: String(err.stack) });
      throw err;
    }
    if (request.command === 'Document.complete') break;
    request = await postJSON(`${base}/respond`, payload);
  }

  const cites = [];
  for (const field of inserted) {
    if (!field.code.startsWith(ITEM_PREFIX)) continue;
    const citation = JSON.parse(field.code.slice(ITEM_PREFIX.length));
    for (const citationItem of citation.citationItems || []) {
      let item = null;
      if (Number.isInteger(citationItem.id)) item = Zotero.Items.get(citationItem.id);
      if (!item && Array.isArray(citationItem.uris)) {
        for (const uri of citationItem.uris) {
          item = await Zotero.URI.getURIItem(uri);
          if (item) break;
        }
      }
      if (!item || !item.isRegularItem()) continue;
      cites.push({
        uri: selectURI(item),
        locator: typeof citationItem.locator === 'string' ? citationItem.locator : '',
        label: typeof citationItem.label === 'string' ? citationItem.label : 'page',
        prefix: typeof citationItem.prefix === 'string' ? citationItem.prefix : '',
        suffix: typeof citationItem.suffix === 'string' ? citationItem.suffix : '',
        suppressAuthor: !!citationItem['suppress-author'],
      });
    }
  }
  return cites;
}

// ---------------------------------------------------------------- formatting

async function formatReferences(uris, cites, locale) {
  // Right after startup the styles may not be loaded yet.
  await Zotero.Styles.init();

  const byURI = new Map();
  const missing = [];
  for (const uri of new Set([...uris, ...cites.map((cite) => cite.uri)])) {
    const item = itemFromSelectURI(uri);
    if (item) byURI.set(uri, item);
    else missing.push(uri);
  }

  const items = {};
  const formattedCites = [];
  if (!byURI.size) return { items, cites: formattedCites, missing };

  // All items go into one engine so that year suffixes (2024a/2024b) are
  // consistent between in-text citations and the bibliography.
  const ids = [...byURI.values()].map((item) => item.id);
  // makeCitationCluster (unlike previewCitationCluster) keeps the registry's
  // year-suffix disambiguation.
  const preview = (engine, citationItem) => stripParens(engine.makeCitationCluster([citationItem]));

  const bibliography = new Map();
  const htmlEngine = Zotero.Styles.get(APA).getCiteProc(locale, 'html');
  try {
    htmlEngine.updateItems(ids);
    const bib = htmlEngine.makeBibliography();
    if (bib) {
      bib[1].forEach((entry, i) => {
        const html = String(entry).trim().replace(/^<div class="csl-entry">/, '').replace(/<\/div>$/, '').trim();
        for (const id of bib[0].entry_ids[i]) bibliography.set(Number(id), { html, order: i });
      });
    }
  }
  finally {
    htmlEngine.free();
  }

  const textEngine = Zotero.Styles.get(APA).getCiteProc(locale, 'text');
  try {
    textEngine.updateItems(ids);
    for (const [uri, item] of byURI) {
      const bib = bibliography.get(item.id) || { html: '', order: 0 };
      items[uri] = {
        inText: preview(textEngine, { id: item.id }),
        bibliographyHTML: bib.html,
        order: bib.order,
      };
    }
    for (const cite of cites) {
      const item = byURI.get(cite.uri);
      if (!item) continue;
      const base = { id: item.id };
      if (cite.suppressAuthor) base['suppress-author'] = true;
      const plain = preview(textEngine, base);
      let locatorText = '';
      if (cite.locator) {
        const withLocator = preview(textEngine, { ...base, locator: cite.locator, label: cite.label || 'page' });
        locatorText = withLocator.startsWith(plain) ? withLocator.slice(plain.length) : `, ${cite.locator}`;
      }
      formattedCites.push({
        uri: cite.uri,
        prefix: cite.prefix || '',
        suffix: cite.suffix || '',
        suppressAuthor: !!cite.suppressAuthor,
        // what stands in for the reference when the author is suppressed, e.g. "2024"
        yearText: cite.suppressAuthor ? plain : '',
        locatorText,
      });
    }
  }
  finally {
    textEngine.free();
  }

  return { items, cites: formattedCites, missing };
}

// ---------------------------------------------------------------- endpoints

function endpoint(methods, handler) {
  const Endpoint = function () {};
  Endpoint.prototype = {
    supportedMethods: methods,
    supportedDataTypes: '*',
    // Browser requests are let through here on purpose; everything except
    // ping/pair requires the pairing token.
    allowRequestsFromUnsafeWebContent: true,
    init: async function (request) {
      try {
        return await handler(request);
      }
      catch (err) {
        Zotero.logError(err);
        return reply(500, { error: 'internal', message: String(err && err.message ? err.message : err) });
      }
    },
  };
  return Endpoint;
}

function registerEndpoints() {
  Zotero.Server.Endpoints['/zotrems/ping'] = endpoint(['GET'], (request) => reply(200, {
    ok: true,
    bridge: bridgeVersion,
    zotero: Zotero.version,
    paired: tokenOK(request.searchParams.get('token')),
  }));

  Zotero.Server.Endpoints['/zotrems/pair'] = endpoint(['GET'], (request) => {
    Zotero.Utilities.Internal.activate();
    const de = isGerman();
    const allowed = Services.prompt.confirm(
      Zotero.getMainWindow(),
      'Zotrems',
      de
        ? 'Ein RemNote-Plugin (Zotrems) möchte auf deine Zotero-Bibliothek zugreifen, um Zitate einzufügen.\n\nZugriff erlauben?'
        : 'A RemNote plugin (Zotrems) wants to access your Zotero library to insert citations.\n\nAllow access?'
    );
    Zotero.Utilities.Internal.sendToBack();
    if (!allowed) return reply(403, { error: 'denied' });
    let token = getToken();
    if (!token) {
      token = Zotero.Utilities.randomString(40);
      Zotero.Prefs.set(PREF_TOKEN, token, true);
    }
    return reply(200, { token });
  });

  Zotero.Server.Endpoints['/zotrems/pick'] = endpoint(['GET'], async (request) => {
    if (!tokenOK(request.searchParams.get('token'))) return reply(403, { error: 'unauthorized' });
    if (pickInProgress) return reply(409, { error: 'busy' });
    pickInProgress = true;
    try {
      const cites = await pickCitation(request.searchParams.get('locale') || defaultLocale());
      Zotero.Utilities.Internal.sendToBack();
      return reply(200, { cites });
    }
    catch (err) {
      if (err && err.message === 'busy') return reply(409, { error: 'busy' });
      throw err;
    }
    finally {
      pickInProgress = false;
    }
  });

  // Body: encodeURIComponent(JSON.stringify({ token, locale, uris, cites })) as text/plain
  Zotero.Server.Endpoints['/zotrems/format'] = endpoint(['POST'], async (request) => {
    let body = request.data;
    if (typeof body === 'string') body = JSON.parse(decodeURIComponent(body));
    if (!body || !tokenOK(body.token)) return reply(403, { error: 'unauthorized' });
    const uris = Array.isArray(body.uris) ? body.uris.map(String) : [];
    const cites = Array.isArray(body.cites) ? body.cites.filter((cite) => cite && typeof cite.uri === 'string') : [];
    return reply(200, await formatReferences(uris, cites, body.locale || defaultLocale()));
  });
}

// ---------------------------------------------------------------- lifecycle

function install() {}
function uninstall() {}

function startup({ version }) {
  bridgeVersion = version;
  registerEndpoints();
}

function shutdown() {
  for (const path of ENDPOINTS) delete Zotero.Server.Endpoints[path];
}
