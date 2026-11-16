import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, migrate } from './db.js';
import { login, requireAdmin } from './auth.js';
import { sendLeadEmails, mailEnabled } from './mail.js';
import * as content from './content.js';

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

/* ---------------- public ---------------- */
app.get('/', (req, res) => res.json({ ok: true, service: 'usamasheikh.com API' }));
app.get('/api/health', wrap(async (req, res) => {
  await q('SELECT 1');
  res.json({ ok: true, mail: mailEnabled() });
}));

app.get('/api/public/content', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await content.publicContent());
}));

app.get('/api/media/:id', wrap(async (req, res) => {
  const { rows } = await q('SELECT mime, bytes FROM media WHERE id=$1', [req.params.id.replace(/\.\w+$/, '')]);
  if (!rows[0]) return res.status(404).end();
  res.set('Content-Type', rows[0].mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rows[0].bytes);
}));

const contactLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many messages from this connection. Please try again in a few minutes or use WhatsApp.' } });

app.post('/api/contact', contactLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot: bots fill hidden fields
  const lead = {
    name: clip(b.name, 120), email: clip(b.email, 200).toLowerCase(), phone: clip(b.phone, 60),
    service: clip(b.service, 120), message: clip(b.message, 5000), estimate: clip(b.estimate, 500), page: clip(b.page, 300),
  };
  if (!lead.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) || !lead.message) {
    return res.status(400).json({ error: 'Please add your name, a valid email address and your project goals.' });
  }
  const { rows } = await q(
    `INSERT INTO leads (name,email,phone,service,message,estimate,page) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [lead.name, lead.email, lead.phone, lead.service, lead.message, lead.estimate, lead.page]);
  let mail = { sent: false };
  try { mail = await sendLeadEmails(lead); } catch (e) { console.error('Mail failed:', e.message); }
  res.json({ ok: true, id: rows[0].id, emailed: mail.sent });
}));

/* ---------------- auth ---------------- */
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' } });

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const token = await login(req.body?.email, req.body?.password, req.ip);
  if (!token) return res.status(401).json({ error: 'That email and password do not match.' });
  res.json({ token });
}));

/* ---------------- admin ---------------- */
const admin = express.Router();
admin.use(requireAdmin);

admin.get('/me', (req, res) => res.json({ email: req.admin.sub }));

admin.get('/stats', wrap(async (req, res) => {
  const { rows: l } = await q(`SELECT status, count(*)::int AS n FROM leads GROUP BY status`);
  const { rows: d } = await q(`SELECT collection, count(*)::int AS n FROM documents GROUP BY collection`);
  const { rows: w } = await q(`SELECT count(*)::int AS n FROM leads WHERE created_at > now() - interval '7 days'`);
  res.json({ leads: Object.fromEntries(l.map((r) => [r.status, r.n])), leadsThisWeek: w[0].n,
    content: Object.fromEntries(d.map((r) => [r.collection, r.n])), mail: mailEnabled(), publish: Boolean(config.github.token) });
}));

// Leads
const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'];
admin.get('/leads', wrap(async (req, res) => {
  const status = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
  const { rows } = await q(`SELECT * FROM leads ${status ? 'WHERE status=$1' : ''} ORDER BY created_at DESC LIMIT 500`, status ? [status] : []);
  res.json({ leads: rows });
}));
admin.patch('/leads/:id', wrap(async (req, res) => {
  const sets = []; const vals = [];
  if (req.body.status !== undefined) {
    if (!LEAD_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Unknown status' });
    vals.push(req.body.status); sets.push(`status=$${vals.length}`);
  }
  if (req.body.notes !== undefined) { vals.push(clip(req.body.notes, 5000)); sets.push(`notes=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  const { rows } = await q(`UPDATE leads SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ lead: rows[0] });
}));
admin.delete('/leads/:id', wrap(async (req, res) => {
  await q('DELETE FROM leads WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));
admin.get('/leads.csv', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM leads ORDER BY created_at DESC');
  const cols = ['created_at', 'name', 'email', 'phone', 'service', 'estimate', 'status', 'message', 'notes', 'page'];
  const cell = (v) => `"${String(v instanceof Date ? v.toISOString() : v ?? '').replace(/"/g, '""')}"`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send([cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
}));

// Media upload: images are converted to WebP and stored in the database.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)) });
admin.post('/media', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PNG, JPG, WebP or GIF image.' });
  const maxW = Math.min(Number(req.body.maxWidth) || 1600, 2400);
  const img = sharp(req.file.buffer, { failOn: 'none' }).rotate().resize({ width: maxW, withoutEnlargement: true });
  const out = await img.webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const id = crypto.randomBytes(8).toString('hex');
  await q('INSERT INTO media (id, filename, mime, width, height, bytes) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, clip(req.file.originalname, 200), 'image/webp', out.info.width, out.info.height, out.data]);
  const base = config.publicApiUrl || `${req.protocol}://${req.get('host')}`;
  res.json({ id, url: `${base}/api/media/${id}.webp`, width: out.info.width, height: out.info.height });
}));

// Publish: start the GitHub Action that rebuilds the static site and uploads it to Hostinger.
admin.post('/publish', wrap(async (req, res) => {
  const { token, repo, workflow, ref } = config.github;
  if (!token || !repo) return res.status(400).json({ error: 'Publishing is not set up yet. Add GITHUB_TOKEN and GITHUB_REPO on Render.' });
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'usamasheikh-admin' },
    body: JSON.stringify({ ref }),
  });
  if (r.status !== 204) return res.status(502).json({ error: `GitHub refused the publish request (${r.status}).` });
  res.json({ ok: true, startedAt: new Date().toISOString() });
}));
admin.get('/publish/status', wrap(async (req, res) => {
  const { token, repo, workflow } = config.github;
  if (!token || !repo) return res.json({ configured: false });
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?per_page=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'usamasheikh-admin' } });
  const j = await r.json();
  const run = j.workflow_runs?.[0];
  res.json({ configured: true, run: run ? { status: run.status, conclusion: run.conclusion, startedAt: run.run_started_at, url: run.html_url } : null });
}));

// Content collections
admin.get('/:collection', wrap(async (req, res) => {
  if (!content.COLLECTIONS.includes(req.params.collection)) return res.status(404).json({ error: 'Unknown collection' });
  res.json({ items: await content.list(req.params.collection) });
}));
admin.get('/:collection/:id', wrap(async (req, res) => {
  const doc = await content.get(req.params.collection, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ item: doc });
}));
admin.post('/:collection', wrap(async (req, res) => {
  res.status(201).json({ item: await content.create(req.params.collection, req.body) });
}));
admin.put('/:collection/:id', wrap(async (req, res) => {
  res.json({ item: await content.upsert(req.params.collection, req.body, req.params.id) });
}));
admin.post('/:collection/reorder', wrap(async (req, res) => {
  await content.reorder(req.params.collection, req.body.ids);
  res.json({ ok: true });
}));
admin.delete('/:collection/:id', wrap(async (req, res) => {
  await content.remove(req.params.collection, req.params.id);
  res.json({ ok: true });
}));

app.use('/api/admin', admin);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Try again.' : err.message });
});

await migrate();
app.listen(config.port, () => console.log(`API listening on :${config.port}`));
