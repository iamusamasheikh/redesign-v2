// Loads content/seed.json into the database.
// Usage: npm run seed            (only fills empty collections)
//        npm run seed -- --force (replaces every collection with the seed file)
//        node src/seed.js --if-new (runs on start: loads content only into a brand-new database)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, pool, q } from './db.js';
import { upsert } from './content.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(here, '../../content/seed.json'), 'utf8'));
const force = process.argv.includes('--force');

await migrate();
if (process.argv.includes('--if-new')) {
  const { rows } = await q("SELECT 1 FROM documents WHERE collection='settings' AND id='site'");
  if (rows.length) { console.log('Content already loaded, seed skipped'); await pool.end(); process.exit(0); }
}
for (const col of ['projects', 'posts', 'reviews', 'faqs', 'services']) {
  const { rows } = await q('SELECT count(*)::int AS n FROM documents WHERE collection=$1', [col]);
  if (rows[0].n && !force) { console.log(`${col}: already has ${rows[0].n} items, skipped`); continue; }
  if (force) await q('DELETE FROM documents WHERE collection=$1', [col]);
  const items = seed[col] || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const id = col === 'projects' || col === 'posts' ? it.slug : it.id;
    await upsert(col, { ...it, order: it.order ?? i }, id);
  }
  console.log(`${col}: loaded ${items.length}`);
}
const { rows } = await q("SELECT 1 FROM documents WHERE collection='settings' AND id='site'");
if (!rows.length || force) { await upsert('settings', seed.settings, 'site'); console.log('settings: loaded'); }
await pool.end();
