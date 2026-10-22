// Vercel build step (vercel.json "buildCommand"). Writes every archive file,
// already rewritten/recoloured, to public/__a/ for the api/ function to fetch,
// and the ones too big for a function response (4.5 MB limit) also to public/
// at their URL path so Vercel's CDN serves them directly.
const fs = require('fs');
const path = require('path');
const { manifest, load } = require('./server.js');

const OUT = path.join(__dirname, 'public');
const LIMIT = 4 * 1024 * 1024;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, '__a'), { recursive: true });

// Every archive file, as served (rewritten/recoloured), for the function to read
// back from the CDN (server.js fetchBody): the archive stays out of the function.
const written = new Set();
for (const entry of Object.values(manifest)) {
  if (written.has(entry.file)) continue;
  written.add(entry.file);
  fs.writeFileSync(path.join(OUT, '__a', entry.file), load(entry));
}
console.log(`public/__a: ${written.size} archive files`);

let n = 0;
for (const [key, entry] of Object.entries(manifest)) {
  if (key.startsWith('POST ') || !key.startsWith('www.artisan.co/')) continue;
  if (fs.statSync(path.join(__dirname, 'archive', 'files', entry.file)).size < LIMIT) continue;
  const file = path.join(OUT, decodeURIComponent(new URL('http://' + key).pathname));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, load(entry));
  console.log('static:', path.relative(OUT, file));
  n++;
}
console.log(`public/ ready (${n} large files served statically)`);
