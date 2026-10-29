import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets')).filter((name) => /\.(js|css)$/.test(name)).sort();
const digest = createHash('sha256');
for (const name of assets) digest.update(await readFile('dist/assets/' + name));
const template = await readFile('web/public/sw.js', 'utf8');
const manifest = assets.map((name) => JSON.stringify('/assets/' + name)).join(',');
await writeFile(
  'dist/sw.js',
  template
    .replace('__BUILD_ID__', digest.digest('hex').slice(0, 16))
    .replace('/* BUILD_ASSETS */', ',' + manifest),
);
