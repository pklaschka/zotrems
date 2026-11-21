// Keeps the version of both plugins in line with package.json, which is the
// single source of truth.
//
//   node scripts/sync-version.mjs                 write the version into both manifests
//   node scripts/sync-version.mjs --check         fail if a manifest differs
//   node scripts/sync-version.mjs --updates-json  print Zotero's update manifest for this version

import { readFileSync, writeFileSync } from 'node:fs';

const REMNOTE_MANIFEST = 'public/manifest.json';
const ZOTERO_MANIFEST = 'zotero-bridge/manifest.json';

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

const { version } = readJSON('package.json');
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) {
  // RemNote's manifest only has major/minor/patch, so pre-release versions cannot be expressed.
  console.error(`Version "${version}" in package.json is not of the form MAJOR.MINOR.PATCH.`);
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);

const remnote = readJSON(REMNOTE_MANIFEST);
const zotero = readJSON(ZOTERO_MANIFEST);
const mode = process.argv[2];

if (mode === '--updates-json') {
  const { id, strict_min_version, strict_max_version } = zotero.applications.zotero;
  const repoUrl = remnote.repoUrl.replace(/\/$/, '');
  const updates = {
    addons: {
      [id]: {
        updates: [
          {
            version,
            update_link: `${repoUrl}/releases/download/v${version}/zotrems-bridge.xpi`,
            applications: { zotero: { strict_min_version, strict_max_version } },
          },
        ],
      },
    },
  };
  process.stdout.write(`${JSON.stringify(updates, null, 2)}\n`);
} else if (mode === '--check') {
  const found = {
    [REMNOTE_MANIFEST]: `${remnote.version.major}.${remnote.version.minor}.${remnote.version.patch}`,
    [ZOTERO_MANIFEST]: zotero.version,
  };
  const wrong = Object.entries(found).filter(([, value]) => value !== version);
  for (const [path, value] of wrong) {
    console.error(`${path} is at ${value}, but package.json is at ${version}.`);
  }
  if (wrong.length) {
    console.error('Run "npm run version:sync" to fix this.');
    process.exit(1);
  }
  console.log(`All versions are at ${version}.`);
} else if (mode === undefined) {
  remnote.version = { major, minor, patch };
  zotero.version = version;
  writeJSON(REMNOTE_MANIFEST, remnote);
  writeJSON(ZOTERO_MANIFEST, zotero);
  console.log(`Set both plugins to ${version}.`);
} else {
  console.error(`Unknown option: ${mode}`);
  process.exit(1);
}
