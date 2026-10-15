// Verifies the production build is path-independent, so one build works at
// the site root and under /<repo>/pr-preview/pr-N/ (and survives repo renames).
// Run after `npm run build`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const errors = [];
const html = readFileSync(join(dist, 'index.html'), 'utf8');

for (const [, attr, url] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
  if (/^(https?:|data:|#)/.test(url)) continue;
  if (!url.startsWith('./')) errors.push(`index.html ${attr}="${url}" is not relative (./...)`);
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
for (const key of ['start_url', 'scope']) {
  if (manifest[key] !== './')
    errors.push(`manifest.${key} is ${JSON.stringify(manifest[key])}, expected "./"`);
}
for (const icon of manifest.icons ?? []) {
  if (icon.src.startsWith('/')) errors.push(`manifest icon ${icon.src} is root-absolute`);
}
if (manifest.name !== 'Lineup')
  errors.push(`manifest.name is ${JSON.stringify(manifest.name)}, expected "Lineup"`);

for (const file of readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))) {
  const js = readFileSync(join(dist, 'assets', file), 'utf8');
  if (/register\(\s*["'`]\//.test(js))
    errors.push(`assets/${file} registers a root-absolute service worker`);
}

// Size budget: the app must stay quick to load and to cache for offline use on a tablet.
// Everything the page downloads (script, style, worklet), compressed, must fit.
const BUDGET_KB = 180;
let totalBytes = 0;
for (const file of readdirSync(join(dist, 'assets')).filter((f) => /\.(js|css)$/.test(f))) {
  totalBytes += gzipSync(readFileSync(join(dist, 'assets', file))).length;
}
const totalKb = totalBytes / 1024;
if (totalKb > BUDGET_KB) {
  errors.push(`assets are ${totalKb.toFixed(0)} KB gzipped, over the ${BUDGET_KB} KB budget`);
}

if (errors.length) {
  console.error('dist check failed:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(
  `dist check ok: all asset URLs, manifest scope/start_url are relative; ${totalKb.toFixed(0)} of ${BUDGET_KB} KB gzipped`,
);
