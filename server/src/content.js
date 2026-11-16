import { q } from './db.js';

// Collections that can be edited from the admin panel.
export const COLLECTIONS = ['projects', 'posts', 'reviews', 'faqs', 'services', 'settings'];

export const slugify = (s) => String(s || '')
  .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// Light validation per collection. Returns { id, data, published, sort } or throws.
export function normalize(collection, body, existingId) {
  if (!COLLECTIONS.includes(collection)) throw httpError(404, 'Unknown collection');
  const data = { ...(body || {}) };
  const str = (k, max = 5000) => { if (data[k] != null) data[k] = String(data[k]).slice(0, max); };
  const arr = (k) => { if (data[k] == null) data[k] = []; if (!Array.isArray(data[k])) throw httpError(400, `${k} must be a list`); };

  let id = existingId;
  switch (collection) {
    case 'projects':
      if (!data.title) throw httpError(400, 'Title is required');
      ['title', 'category', 'industry', 'url', 'description', 'workDone', 'image'].forEach((k) => str(k));
      arr('tags'); arr('results');
      data.slug = slugify(data.slug || data.title);
      data.team = Boolean(data.team);
      id = id || data.slug;
      break;
    case 'posts':
      if (!data.title) throw httpError(400, 'Title is required');
      ['title', 'excerpt', 'cat', 'date', 'read', 'image', 'metaTitle', 'metaDescription'].forEach((k) => str(k));
      arr('body');
      data.slug = slugify(data.slug || data.title);
      id = id || data.slug;
      break;
    case 'reviews':
      ['quote', 'name', 'role', 'link', 'job', 'date', 'source'].forEach((k) => str(k));
      arr('tags');
      data.featured = Boolean(data.featured);
      data.rating = Math.max(1, Math.min(5, Number(data.rating || 5)));
      id = id || slugify(data.id || data.name || data.job) || `review-${Date.now()}`;
      break;
    case 'faqs':
      if (!data.question || !data.answer) throw httpError(400, 'Question and answer are required');
      str('question', 300); str('answer', 3000);
      id = id || slugify(data.question).slice(0, 60);
      break;
    case 'services':
      if (!data.title) throw httpError(400, 'Title is required');
      ['title', 'category', 'tagline', 'description'].forEach((k) => str(k));
      arr('features'); arr('tags');
      id = id || data.id || slugify(data.title);
      break;
    case 'settings':
      id = id || 'site';
      break;
  }
  delete data.published; delete data.order;
  const published = body?.published === undefined ? true : Boolean(body.published);
  const sort = Number.isFinite(Number(body?.order)) ? Number(body.order) : 0;
  return { id, data, published, sort };
}

export function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}

const rowToDoc = (r) => ({ ...r.data, id: r.id, order: r.sort, published: r.published, updatedAt: r.updated_at });

export async function list(collection, { onlyPublished = false } = {}) {
  const { rows } = await q(
    `SELECT id, data, sort, published, updated_at FROM documents
     WHERE collection = $1 ${onlyPublished ? 'AND published' : ''} ORDER BY sort, created_at`,
    [collection]);
  return rows.map(rowToDoc);
}

export async function get(collection, id) {
  const { rows } = await q('SELECT id, data, sort, published, updated_at FROM documents WHERE collection=$1 AND id=$2', [collection, id]);
  return rows[0] ? rowToDoc(rows[0]) : null;
}

export async function upsert(collection, body, existingId) {
  const { id, data, published, sort } = normalize(collection, body, existingId);
  if (!id) throw httpError(400, 'Could not create an id');
  // Moving a project/post to a new slug: keep id stable unless it is a new record.
  const { rows } = await q(
    `INSERT INTO documents (collection, id, data, sort, published)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data, sort=EXCLUDED.sort, published=EXCLUDED.published, updated_at=now()
     RETURNING id, data, sort, published, updated_at`,
    [collection, id, data, sort, published]);
  return rowToDoc(rows[0]);
}

export async function create(collection, body) {
  const { id } = normalize(collection, body);
  const exists = await get(collection, id);
  if (exists) throw httpError(409, `An item with the id "${id}" already exists. Change the title or slug.`);
  return upsert(collection, body, id);
}

export async function remove(collection, id) {
  const { rowCount } = await q('DELETE FROM documents WHERE collection=$1 AND id=$2', [collection, id]);
  if (!rowCount) throw httpError(404, 'Not found');
}

export async function reorder(collection, ids) {
  if (!Array.isArray(ids)) throw httpError(400, 'ids must be a list');
  for (let i = 0; i < ids.length; i++) {
    await q('UPDATE documents SET sort=$3, updated_at=now() WHERE collection=$1 AND id=$2', [collection, String(ids[i]), i]);
  }
}

export async function publicContent() {
  const [projects, posts, reviews, faqs, services, settingsList] = await Promise.all(
    ['projects', 'posts', 'reviews', 'faqs', 'services', 'settings'].map((c) => list(c, { onlyPublished: true })));
  const strip = (d) => { const { published, updatedAt, ...rest } = d; return rest; };
  return {
    projects: projects.map(strip),
    posts: posts.map(strip),
    reviews: reviews.map(strip),
    faqs: faqs.map(strip),
    services: services.map(strip),
    settings: strip(settingsList.find((s) => s.id === 'site') || {}),
    generatedAt: new Date().toISOString(),
  };
}
