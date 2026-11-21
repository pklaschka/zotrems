// Builds both plugins. Needs the `zip` command (preinstalled on macOS and Linux).
//
//   node scripts/build.mjs remnote   dist/ and PluginZip.zip
//   node scripts/build.mjs zotero    zotrems-bridge.xpi
//   node scripts/build.mjs dev       serve the RemNote plugin on http://localhost:8080 and rebuild on change
//                                    (set PORT to use another port)

import { execFileSync } from 'node:child_process';
import { cpSync, createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import * as esbuild from 'esbuild';

const DIST = 'dist';
const PORT = Number(process.env.PORT) || 8080;

// RemNote loads a widget in one of two ways: natively as <name>.js, or inside
// a sandboxed iframe through index.html, which pulls in <name>-sandbox.js.
const SANDBOX_HTML = `<body></body>
<script type="text/javascript">
const widgetName = new URLSearchParams(window.location.search).get("widgetName");
if (widgetName == null) { document.body.innerHTML += "Widget ID not specified."; }
const s = document.createElement("script");
s.type = "module";
s.src = widgetName + "-sandbox.js";
document.body.appendChild(s);
</script>
`;

function bundleOptions(production) {
  const shared = {
    entryPoints: ['src/widgets/index.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: production,
    sourcemap: production ? false : 'inline',
    define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
    logLevel: 'info',
  };
  return [
    // The SDK reads import.meta through this constant when running natively.
    { ...shared, outfile: `${DIST}/index.js`, banner: { js: 'const IMPORT_META=import.meta;' } },
    { ...shared, outfile: `${DIST}/index-sandbox.js` },
  ];
}

function prepareDist() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST);
  cpSync('public', DIST, { recursive: true });
  cpSync('README.md', `${DIST}/README.md`);
  writeFileSync(`${DIST}/index.html`, SANDBOX_HTML);
}

function zip(directory, target) {
  rmSync(target, { force: true });
  execFileSync('zip', ['-q', '-r', '-X', resolve(target), '.', '-x', '.DS_Store', '*/.DS_Store'], {
    cwd: directory,
    stdio: 'inherit',
  });
  console.log(`Wrote ${target}`);
}

async function buildRemnote() {
  prepareDist();
  for (const options of bundleOptions(true)) await esbuild.build(options);
  zip(DIST, 'PluginZip.zip');
}

function buildZotero() {
  zip('zotero-bridge', 'zotrems-bridge.xpi');
}

async function dev() {
  prepareDist();
  for (const options of bundleOptions(false)) {
    const context = await esbuild.context(options);
    await context.watch();
  }

  const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.md': 'text/markdown' };
  createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    const file = join(DIST, path === '/' ? 'index.html' : path);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store' };
    if (!resolve(file).startsWith(resolve(DIST)) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, headers).end('Not found');
      return;
    }
    response.writeHead(200, { ...headers, 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    createReadStream(file).pipe(response);
  })
    .on('error', (error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? `Port ${PORT} is already in use – is another dev server still running?`
          : error.message
      );
      process.exit(1);
    })
    .listen(PORT, () => {
      console.log(`Serving the plugin on http://localhost:${PORT} – changes in src/ are rebuilt automatically.`);
      console.log('Changes to public/ or README.md need a restart.');
    });
}

const tasks = { remnote: buildRemnote, zotero: buildZotero, dev };
const task = tasks[process.argv[2]];
if (!task) {
  console.error(`Usage: node scripts/build.mjs <${Object.keys(tasks).join('|')}>`);
  process.exit(1);
}
await task();
