// Builds the static site for Hostinger.
//   node build.mjs                 -> uses content/seed.json
//   API_URL=https://... node build.mjs  -> pulls live content from the API
//   PRERENDER=0 node build.mjs     -> skip prerendering (faster local preview)
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(here, 'dist');
const SITE = (process.env.SITE_URL || 'https://usamasheikh.com').replace(/\/$/, '');
const API = (process.env.API_URL || '').replace(/\/$/, '');
const PRERENDER = process.env.PRERENDER !== '0';

const log = (...a) => console.log('›', ...a);

/* ---------- 1. content ---------- */
async function loadContent() {
  if (API) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const r = await fetch(`${API}/api/public/content`, { signal: AbortSignal.timeout(90000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const c = await r.json();
        if (!c.projects?.length) throw new Error('API returned no projects');
        log(`content from API (${c.projects.length} projects, ${c.posts.length} posts)`);
        return c;
      } catch (e) {
        log(`API attempt ${attempt} failed: ${e.message}`); // Render free plan can take ~60s to wake up
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
    throw new Error('Could not load content from the API. The site was not rebuilt.');
  }
  log('content from content/seed.json');
  return JSON.parse(await fs.readFile(path.join(root, 'content/seed.json'), 'utf8'));
}

/* ---------- 2. copy public assets ---------- */
async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

/* ---------- 3. uploaded media -> local files ---------- */
async function localizeMedia(content) {
  const urls = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { for (const m of v.matchAll(/https?:\/\/[^"'\s)]+\/api\/media\/[a-f0-9]+\.webp/g)) urls.add(m[0]); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(content);
  if (!urls.size) return content;
  await fs.mkdir(path.join(dist, 'media'), { recursive: true });
  let json = JSON.stringify(content);
  for (const u of urls) {
    const name = u.split('/').pop();
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(r.status);
      await fs.writeFile(path.join(dist, 'media', name), Buffer.from(await r.arrayBuffer()));
      json = json.split(u).join(`media/${name}`);
    } catch (e) { log(`could not download ${u} (${e.message}); keeping remote URL`); }
  }
  log(`media: ${urls.size} uploaded image(s) copied into the site`);
  return JSON.parse(json);
}

/* ---------- 4. structured data for the whole site ---------- */
function siteJsonLd(c) {
  const s = c.settings || {}; const ct = s.contact || {};
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Person', '@id': `${SITE}/#person`, name: 'Usama Sheikh', url: `${SITE}/`, image: `${SITE}/img/usama-4.jpg`,
        jobTitle: 'Digital Marketing Strategist, Web Developer & AI Automation Specialist',
        email: `mailto:${ct.email || 'hello@usamasheikh.com'}`, telephone: ct.phone, address: { '@type': 'PostalAddress', addressCountry: 'PK' },
        sameAs: [ct.upwork, ct.linkedin].filter(Boolean),
        knowsAbout: ['Search Engine Optimization', 'Answer Engine Optimization', 'Generative Engine Optimization', 'Google Ads', 'Meta Ads', 'TikTok Ads', 'WordPress', 'Shopify', 'WooCommerce', 'AI automation', 'n8n', 'Chatbots', 'Core Web Vitals'] },
      { '@type': 'ProfessionalService', '@id': `${SITE}/#business`, name: 'Usama Sheikh, Digital Marketing & Web Development', url: `${SITE}/`,
        image: `${SITE}/img/usama-4.jpg`, founder: { '@id': `${SITE}/#person` }, email: ct.email, telephone: ct.phone,
        areaServed: ['US', 'GB', 'AE', 'CA', 'IE', 'PK'],
        hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Services',
          itemListElement: (c.services || []).map((x) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: x.title, description: x.description } })) } },
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Usama Sheikh', publisher: { '@id': `${SITE}/#person` } },
      { '@type': 'FAQPage', '@id': `${SITE}/#faq`, mainEntity: (c.faqs || []).map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
    ],
  };
}

const ldTag = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const jsData = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

/* ---------- 5. SEO files ---------- */
function sitemap(c) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/', pri: '1.0' }, { loc: '/blog/', pri: '0.8' },
    ...c.posts.map((b) => ({ loc: `/blog/${b.slug}/`, pri: '0.7', mod: b.updatedAt })),
    ...c.projects.map((p) => ({ loc: `/work/${p.slug}/`, pri: '0.6', mod: p.updatedAt })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) =>
    `  <url><loc>${SITE}${u.loc}</loc><lastmod>${(u.mod || today).slice(0, 10)}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`;
}
const robots = () => `User-agent: *\nAllow: /\nDisallow: /admin/\n\n# AI search and answer engines are welcome\nUser-agent: GPTBot\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: ChatGPT-User\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
function llms(c) {
  const ct = c.settings?.contact || {};
  return `# Usama Sheikh\n\n> Upwork Top Rated digital marketing strategist, web developer and AI automation specialist with 7+ years of experience and 130+ delivered projects for clients in the USA, UK, UAE, Canada, Ireland and Pakistan.\n\nContact: ${ct.email} · WhatsApp ${ct.phone} · ${ct.upwork}\n\n## Services\n${c.services.map((s) => `- ${s.title}: ${s.tagline}`).join('\n')}\n\n## Key pages\n- [Home](${SITE}/)\n- [Blog](${SITE}/blog/)\n${c.posts.map((b) => `- [${b.title}](${SITE}/blog/${b.slug}/): ${b.excerpt}`).join('\n')}\n\n## Selected case studies\n${c.projects.slice(0, 40).map((p) => `- [${p.title}](${SITE}/work/${p.slug}/): ${p.description} Result: ${p.results[0] || ''}`).join('\n')}\n\n## FAQ\n${c.faqs.map((f) => `### ${f.question}\n${f.answer}`).join('\n\n')}\n`;
}
const htaccess = () => `Options -Indexes
DirectoryIndex index.html
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
  # Old single-page links -> new pages
  RewriteRule ^portfolio/?$ /#work [NE,L,R=301]
  # Add the trailing slash to page URLs
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_URI} !(\\.[a-zA-Z0-9]{1,5}|/)$
  RewriteRule ^(.*)$ /$1/ [L,R=301]
  # Unknown paths fall back to the app
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml text/plain application/xml
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType application/javascript "access plus 1 hour"
</IfModule>
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
</IfModule>
`;

/* ---------- 6. prerender every route to real HTML ---------- */
function serveDir(dir, fallback) {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
  return http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(dir, p);
    if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fss.existsSync(f) && fss.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fss.existsSync(f)) f = fallback;
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fss.createReadStream(f).pipe(res);
  });
}

async function prerender(routes, templatePath) {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { log('playwright not installed: skipping prerender'); return; }
  const server = serveDir(dist, templatePath);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); // fonts and CDNs are not needed for the snapshot
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('page error:', e.message));
  let n = 0;
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#grid')?.children.length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(150);
    if (r !== '/') {
      // Sub-pages ship without the home sections; the app loads them if the visitor goes home.
      await page.evaluate(() => { const h = document.querySelector('#home'); h.innerHTML = ''; h.dataset.stub = '1'; });
    }
    const html = '<!doctype html>\n' + await page.evaluate(() => document.documentElement.outerHTML);
    const out = path.join(dist, r, 'index.html');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, html);
    if (++n % 25 === 0) log(`prerendered ${n}/${routes.length}`);
  }
  await browser.close(); server.close();
  log(`prerendered ${n} pages`);
}

/* ---------- main ---------- */
const started = Date.now();
await fs.rm(dist, { recursive: true, force: true });
await copyDir(path.join(here, 'public'), dist);
await copyDir(path.join(root, 'admin'), path.join(dist, 'admin'));

let content = await loadContent();
content = await localizeMedia(content);
content.projects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
content.posts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

await fs.writeFile(path.join(dist, 'content.js'),
  `window.API_URL=${jsData(API || process.env.PUBLIC_API_URL || '')};\n` +
  `window.PROJECTS=${jsData(content.projects)};\nwindow.SERVICES=${jsData(content.services)};\nwindow.POSTS=${jsData(content.posts)};\n` +
  `window.REVIEWS=${jsData(content.reviews)};\nwindow.FAQS=${jsData(content.faqs)};\nwindow.SETTINGS=${jsData(content.settings)};\n`);

let tpl = await fs.readFile(path.join(here, 'src/index.html'), 'utf8');
tpl = tpl.replace('<!--SITE_LD-->', ldTag(siteJsonLd(content)));
const ga = process.env.GA_ID;
tpl = tpl.replace('<!--ANALYTICS-->', ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');</script>` : '');
const templatePath = path.join(dist, '_app.html');
await fs.writeFile(templatePath, tpl);
await fs.writeFile(path.join(dist, 'index.html'), tpl);

await fs.writeFile(path.join(dist, 'sitemap.xml'), sitemap(content));
await fs.writeFile(path.join(dist, 'robots.txt'), robots());
await fs.writeFile(path.join(dist, 'llms.txt'), llms(content));
await fs.writeFile(path.join(dist, '.htaccess'), htaccess());

if (PRERENDER) {
  const routes = [...content.projects.map((p) => `/work/${p.slug}/`), '/blog/', ...content.posts.map((b) => `/blog/${b.slug}/`), '/'];
  await prerender(routes, templatePath);
}
await fs.rm(templatePath, { force: true });
log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${path.relative(root, dist)}/`);
