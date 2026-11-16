/* Admin panel for usamasheikh.com. Talks to the API on Render. */
(function () {
  const API = (window.API_URL || localStorage.getItem('adminApi') || '').replace(/\/$/, '');
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let token = sessionStorage.getItem('adminToken') || '';
  let counts = {};

  /* ---------- helpers ---------- */
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3500);
  }
  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    let r;
    try { r = await fetch(API + path, { ...opts, headers }); }
    catch { throw new Error('Could not reach the server. It may be waking up; try again in a minute.'); }
    if (r.status === 401 && path !== '/api/auth/login') { logout(); throw new Error('Your session expired. Sign in again.'); }
    const isJson = (r.headers.get('content-type') || '').includes('json');
    const data = isJson ? await r.json() : await r.text();
    if (!r.ok) throw new Error((isJson && data.error) || `Request failed (${r.status})`);
    return data;
  }
  function logout() { token = ''; sessionStorage.removeItem('adminToken'); renderLogin(); }
  const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const imgSrc = (u) => !u ? '' : /^https?:|^\//.test(u) ? u : '/' + u;

  /* ---------- collection definitions ---------- */
  const DEF = {
    projects: {
      label: 'Projects', singular: 'project', titleKey: 'title',
      cols: [['image', 'img'], ['title', 'Title'], ['category', 'Category'], ['results', 'Result']],
      fields: [
        ['title', 'text', 'Project name'], ['slug', 'text', 'URL slug', 'Leave empty to create it from the name. Page: /work/<slug>/'],
        ['category', 'select', 'Category', '', ['WORDPRESS & ELEMENTOR', 'WORDPRESS PORTAL', 'CUSTOM WEB APP', 'LANDING PAGE', 'SERVICES PORTAL', 'CORPORATE PORTAL', 'LOCAL SERVICES', 'HOSPITALITY', 'HEALTHCARE', 'HEALTHCARE PLATFORM', 'LUXURY MEDSPA', 'DIGITAL AGENCY', 'SHOPIFY ECOMMERCE', 'WOOCOMMERCE', 'GOOGLE ADS', 'META & TIKTOK ADS', 'SEO CASE STUDIES', 'AI AUTOMATION']],
        ['industry', 'text', 'Industry', 'e.g. Medical Practice (NYC)'], ['url', 'text', 'Live website URL', 'Leave empty for private campaigns'],
        ['image', 'image', 'Screenshot', 'Website screenshots look best at 1280×800. Dashboards can be any size.'],
        ['description', 'textarea', 'Short description'], ['workDone', 'textarea', 'What was delivered'],
        ['results', 'lines', 'Results', 'One per line. The first one shows on the card.'], ['tags', 'tags', 'Tags / stack', 'Comma separated'],
        ['team', 'check', 'Team contribution (worked on it as part of a team)'], ['order', 'number', 'Order', 'Lower numbers show first'], ['published', 'check', 'Published'],
      ],
    },
    posts: {
      label: 'Blog', singular: 'article', titleKey: 'title',
      cols: [['image', 'img'], ['title', 'Title'], ['cat', 'Category'], ['date', 'Date']],
      fields: [
        ['title', 'text', 'Title'], ['slug', 'text', 'URL slug', 'Page: /blog/<slug>/'],
        ['cat', 'text', 'Category'], ['date', 'text', 'Date', 'e.g. Nov 16, 2026'], ['read', 'text', 'Read time', 'e.g. 6 min read'],
        ['image', 'image', 'Cover image'], ['excerpt', 'textarea', 'Excerpt', 'Shown on cards and used as the Google description'],
        ['body', 'body', 'Article', 'Blank line between blocks. "## " starts a heading, "- " a list item, "> " a highlighted quote.'],
        ['metaTitle', 'text', 'SEO title (optional)'], ['metaDescription', 'textarea', 'SEO description (optional)'],
        ['order', 'number', 'Order', 'Lower numbers show first'], ['published', 'check', 'Published'],
      ],
    },
    reviews: {
      label: 'Reviews', singular: 'review', titleKey: 'job',
      cols: [['featured', 'Featured'], ['job', 'Job / name'], ['quote', 'Quote'], ['date', 'Date']],
      fields: [
        ['quote', 'textarea', 'Review text', 'Leave empty for a 5-star job without a written review (shows in the small row)'],
        ['name', 'text', 'Client name', 'Only for named testimonials'], ['role', 'text', 'Role / company', 'e.g. Chief Executive Officer, Ghani Medics'],
        ['job', 'text', 'Upwork job title'], ['date', 'text', 'Date or details', 'e.g. Sep 2025'], ['tags', 'tags', 'Endorsements', 'Comma separated, e.g. Clear Communicator, Reliable'],
        ['link', 'text', 'Link (optional)', 'e.g. /work/ghani-medic/'], ['rating', 'number', 'Stars (1-5)'], ['source', 'text', 'Source', 'Upwork'],
        ['featured', 'check', 'Featured (big quote at the top)'], ['order', 'number', 'Order'], ['published', 'check', 'Published'],
      ],
    },
    faqs: {
      label: 'FAQs', singular: 'question', titleKey: 'question',
      cols: [['question', 'Question'], ['answer', 'Answer']],
      fields: [['question', 'text', 'Question'], ['answer', 'textarea', 'Answer', 'Start with the direct answer in the first sentence. Google and AI tools quote it.'], ['order', 'number', 'Order'], ['published', 'check', 'Published']],
    },
    services: {
      label: 'Services', singular: 'service', titleKey: 'title',
      cols: [['title', 'Title'], ['category', 'Category'], ['tagline', 'Tagline']],
      fields: [['title', 'text', 'Title'], ['category', 'text', 'Category label'], ['tagline', 'text', 'Tagline'], ['description', 'textarea', 'Description'],
        ['features', 'lines', 'Key deliverables', 'One per line'], ['tags', 'tags', 'Tags', 'Comma separated'], ['order', 'number', 'Order'], ['published', 'check', 'Published']],
    },
  };

  /* ---------- body <-> text for blog posts ---------- */
  const bodyToText = (body = []) => body.map(([t, c]) => t === 'h2' ? `## ${c}` : t === 'ul' ? c.map((x) => `- ${x}`).join('\n') : t === 'quote' ? `> ${c}` : c).join('\n\n');
  const textToBody = (txt) => txt.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lines = b.split('\n').map((l) => l.trim());
    if (b.startsWith('## ')) return ['h2', b.slice(3).trim()];
    if (lines.every((l) => l.startsWith('- '))) return ['ul', lines.map((l) => l.slice(2).trim())];
    if (b.startsWith('> ')) return ['quote', lines.map((l) => l.replace(/^>\s?/, '')).join(' ')];
    return ['p', lines.join(' ')];
  });

  /* ---------- login ---------- */
  function renderLogin() {
    app.innerHTML = `<div class="login"><form id="lf">
      <h1>Admin</h1><p>Sign in to manage usamasheikh.com</p>
      ${API ? '' : `<label class="field"><span>API address</span><input id="lapi" placeholder="https://your-api.onrender.com"></label>`}
      <label class="field"><span>Email</span><input id="le" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input id="lp" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Sign in</button><p class="muted" id="lmsg"></p></form></div>`;
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.disabled = true; $('#lmsg').textContent = 'Signing in… (the server can take up to a minute to wake up)';
      if ($('#lapi')) localStorage.setItem('adminApi', $('#lapi').value.trim());
      try {
        const r = await api('/api/auth/login', { method: 'POST', json: { email: $('#le').value, password: $('#lp').value } });
        token = r.token; sessionStorage.setItem('adminToken', token); if ($('#lapi')) location.reload(); else boot();
      } catch (err) { $('#lmsg').textContent = err.message; btn.disabled = false; }
    });
  }

  /* ---------- shell ---------- */
  const NAV = [['dashboard', 'Dashboard'], ['leads', 'Leads'], ['projects', 'Projects'], ['posts', 'Blog'], ['reviews', 'Reviews'], ['faqs', 'FAQs'], ['services', 'Services'], ['settings', 'Settings']];
  function shell(active, title, actions, body) {
    app.innerHTML = `<div class="shell"><nav class="side" aria-label="Admin">
      <div class="brand">usamasheikh.com</div>
      ${NAV.map(([k, l]) => `<button data-go="${k}" ${active === k ? 'aria-current="page"' : ''}><span>${l}</span><span class="count">${counts[k] ?? ''}</span></button>`).join('')}
      <div class="grow"></div><a class="btn sm" href="/" target="_blank" rel="noopener">View site ↗</a><button data-logout>Sign out</button></nav>
      <main class="main"><div class="top"><h2>${esc(title)}</h2><div class="row">${actions || ''}<div class="pub" id="pub"><span class="dot" id="pubDot"></span><span id="pubText">Checking publish status…</span><button class="btn sm primary" id="pubBtn">Publish changes</button></div></div></div>
      <div id="view">${body}</div></main></div>`;
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => (location.hash = b.dataset.go)));
    $('[data-logout]').addEventListener('click', logout);
    $('#pubBtn').addEventListener('click', publish);
    pubStatus();
  }

  async function pubStatus() {
    try {
      const s = await api('/api/admin/publish/status');
      const dot = $('#pubDot'), txt = $('#pubText'); if (!dot) return;
      if (!s.configured) { dot.className = 'dot'; txt.textContent = 'Publishing not set up'; return; }
      const r = s.run;
      if (!r) { dot.className = 'dot'; txt.textContent = 'Not published yet'; return; }
      if (r.status !== 'completed') { dot.className = 'dot run'; txt.textContent = 'Publishing… (about 2–4 min)'; setTimeout(pubStatus, 10000); return; }
      dot.className = 'dot ' + (r.conclusion === 'success' ? 'ok' : 'bad');
      txt.innerHTML = r.conclusion === 'success' ? `Live since ${esc(fmtDate(r.startedAt))}` : `Last publish failed · <a href="${esc(r.url)}" target="_blank" rel="noopener">details</a>`;
    } catch { /* ignore */ }
  }
  async function publish() {
    const b = $('#pubBtn'); b.disabled = true;
    try { await api('/api/admin/publish', { method: 'POST' }); toast('Publishing started. The site updates in about 2–4 minutes.'); setTimeout(pubStatus, 4000); }
    catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  }

  /* ---------- dashboard ---------- */
  async function viewDashboard() {
    shell('dashboard', 'Dashboard', '', '<p class="muted">Loading…</p>');
    const s = await api('/api/admin/stats');
    counts = { ...s.content, leads: Object.values(s.leads).reduce((a, b) => a + b, 0) };
    const L = s.leads;
    $('#view').innerHTML = `<div class="grid4">
      <div class="card"><span class="muted">New leads</span><b class="big">${L.new || 0}</b></div>
      <div class="card"><span class="muted">Leads this week</span><b class="big">${s.leadsThisWeek}</b></div>
      <div class="card"><span class="muted">Won</span><b class="big">${L.won || 0}</b></div>
      <div class="card"><span class="muted">Projects</span><b class="big">${s.content.projects || 0}</b></div></div>
      <div class="card" style="margin-top:16px"><b>How updates work</b><p class="muted" style="margin:6px 0 0">Edit projects, blog posts, reviews, FAQs, services or settings, then press <b>Publish changes</b>. The site rebuilds every page, the sitemap and the AI-search files, and uploads them to Hostinger.</p>
      <p class="muted" style="margin:10px 0 0">Email notifications: <b>${s.mail ? 'on' : 'off (add SMTP settings on Render)'}</b> · Publish button: <b>${s.publish ? 'ready' : 'not set up (add GITHUB_TOKEN on Render)'}</b></p></div>`;
    $$('.side .count').forEach((c, i) => (c.textContent = counts[NAV[i][0]] ?? ''));
  }

  /* ---------- leads ---------- */
  async function viewLeads() {
    const status = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || '';
    shell('leads', 'Leads', `<select id="lf"><option value="">All</option>${['new', 'contacted', 'won', 'lost'].map((x) => `<option ${x === status ? 'selected' : ''}>${x}</option>`).join('')}</select><button class="btn" id="csv">Download CSV</button>`, '<p class="muted">Loading…</p>');
    $('#lf').addEventListener('change', (e) => (location.hash = 'leads' + (e.target.value ? '?status=' + e.target.value : '')));
    $('#csv').addEventListener('click', async () => {
      try { const t = await api('/api/admin/leads.csv'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'leads.csv'; a.click(); }
      catch (e) { toast(e.message, true); }
    });
    const { leads } = await api('/api/admin/leads' + (status ? '?status=' + status : ''));
    if (!leads.length) { $('#view').innerHTML = '<div class="empty">No leads yet. Messages from the contact form appear here.</div>'; return; }
    $('#view').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Received</th><th>Client</th><th>Service &amp; message</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>
      ${leads.map((l) => `<tr data-id="${l.id}"><td>${esc(fmtDate(l.created_at))}</td>
        <td><b>${esc(l.name)}</b><br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? `<br><a href="https://wa.me/${esc(l.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(l.phone)}</a>` : ''}</td>
        <td><b>${esc(l.service)}</b>${l.estimate ? `<br><span class="muted">${esc(l.estimate)}</span>` : ''}<div class="msg">${esc(l.message)}</div></td>
        <td><select data-status>${['new', 'contacted', 'won', 'lost'].map((x) => `<option ${x === l.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><textarea data-notes rows="3" style="width:180px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;padding:6px">${esc(l.notes)}</textarea></td>
        <td><button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</tbody></table></div>`;
    $$('#view tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      $('[data-status]', tr).addEventListener('change', async (e) => { try { await api(`/api/admin/leads/${id}`, { method: 'PATCH', json: { status: e.target.value } }); toast('Status saved'); } catch (er) { toast(er.message, true); } });
      $('[data-notes]', tr).addEventListener('change', async (e) => { try { await api(`/api/admin/leads/${id}`, { method: 'PATCH', json: { notes: e.target.value } }); toast('Notes saved'); } catch (er) { toast(er.message, true); } });
      $('[data-del]', tr).addEventListener('click', async () => {
        if (!confirm('Delete this lead permanently? This cannot be undone.')) return;
        try { await api(`/api/admin/leads/${id}`, { method: 'DELETE' }); tr.remove(); toast('Lead deleted'); } catch (er) { toast(er.message, true); }
      });
    });
  }

  /* ---------- collection list ---------- */
  async function viewList(col) {
    const d = DEF[col];
    shell(col, d.label, `<input type="search" id="q" placeholder="Search ${d.label.toLowerCase()}"><button class="btn primary" id="add">Add ${d.singular}</button>`, '<p class="muted">Loading…</p>');
    $('#add').addEventListener('click', () => (location.hash = `${col}/new`));
    const { items } = await api(`/api/admin/${col}`);
    counts[col] = items.length;
    const draw = (q) => {
      const list = items.filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q));
      if (!list.length) { $('#view').innerHTML = `<div class="empty">Nothing found.</div>`; return; }
      $('#view').innerHTML = `<div class="tablewrap"><table><thead><tr>${d.cols.map(([, l]) => `<th>${l === 'img' ? '' : l}</th>`).join('')}<th>Status</th><th></th></tr></thead><tbody>
        ${list.map((it) => `<tr>${d.cols.map(([k, l]) => {
          const v = it[k];
          if (l === 'img') return `<td>${v ? `<img class="thumb" src="${esc(imgSrc(v))}" alt="" loading="lazy">` : ''}</td>`;
          if (typeof v === 'boolean') return `<td>${v ? '★' : ''}</td>`;
          const t = Array.isArray(v) ? v[0] || '' : v || '';
          return `<td>${esc(String(t).slice(0, 110))}</td>`;
        }).join('')}<td>${it.published ? '<span class="pill">Live</span>' : '<span class="pill draft">Draft</span>'}</td>
        <td class="row"><a class="btn sm" href="#${col}/${encodeURIComponent(it.id)}">Edit</a></td></tr>`).join('')}</tbody></table></div>`;
    };
    draw('');
    $('#q').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
  }

  /* ---------- editor ---------- */
  function fieldHtml([key, type, label, help, options], v) {
    const h = help ? `<small>${esc(help)}</small>` : '';
    const id = `f_${key}`;
    switch (type) {
      case 'textarea': return `<label class="field"><span>${label}</span><textarea id="${id}">${esc(v)}</textarea>${h}</label>`;
      case 'body': return `<label class="field"><span>${label}</span><textarea class="tall" id="${id}">${esc(bodyToText(v || []))}</textarea>${h}</label>`;
      case 'lines': return `<label class="field"><span>${label}</span><textarea id="${id}">${esc((v || []).join('\n'))}</textarea>${h}</label>`;
      case 'tags': return `<label class="field"><span>${label}</span><input id="${id}" value="${esc((v || []).join(', '))}">${h}</label>`;
      case 'check': return `<label class="check"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${label}</label>`;
      case 'number': return `<label class="field"><span>${label}</span><input type="number" id="${id}" value="${esc(v ?? '')}">${h}</label>`;
      case 'select': return `<label class="field"><span>${label}</span><select id="${id}">${options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}${v && !options.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>${h}</label>`;
      case 'image': return `<div class="field"><span>${label}</span><div class="imgpick"><img id="${id}_img" src="${esc(imgSrc(v))}" alt="" ${v ? '' : 'hidden'}>
        <div class="row" style="flex-direction:column;align-items:flex-start"><input id="${id}" value="${esc(v)}" placeholder="Upload or paste an image URL"><label class="btn sm">Upload image<input type="file" accept="image/*" id="${id}_file" hidden></label></div></div>${h}</div>`;
      default: return `<label class="field"><span>${label}</span><input id="${id}" value="${esc(v)}">${h}</label>`;
    }
  }
  function readField([key, type]) {
    const el = $(`#f_${key}`); if (!el) return undefined;
    switch (type) {
      case 'check': return el.checked;
      case 'number': return el.value === '' ? undefined : Number(el.value);
      case 'lines': return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      case 'tags': return el.value.split(',').map((s) => s.trim()).filter(Boolean);
      case 'body': return textToBody(el.value);
      default: return el.value.trim();
    }
  }
  function bindImage(key) {
    const file = $(`#f_${key}_file`); if (!file) return;
    const input = $(`#f_${key}`), img = $(`#f_${key}_img`);
    input.addEventListener('change', () => { img.src = imgSrc(input.value); img.hidden = !input.value; });
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      const fd = new FormData(); fd.append('file', file.files[0]);
      toast('Uploading…');
      try { const r = await api('/api/admin/media', { method: 'POST', body: fd }); input.value = r.url; img.src = r.url; img.hidden = false; toast('Image uploaded'); }
      catch (e) { toast(e.message, true); }
    });
  }

  async function viewEdit(col, id) {
    const d = DEF[col]; const isNew = id === 'new';
    shell(col, isNew ? `New ${d.singular}` : `Edit ${d.singular}`, `<a class="btn" href="#${col}">← Back</a>`, '<p class="muted">Loading…</p>');
    const item = isNew ? { published: true, order: 0, rating: 5, source: 'Upwork' } : (await api(`/api/admin/${col}/${encodeURIComponent(id)}`)).item;
    $('#view').innerHTML = `<form class="editor" id="ef">${d.fields.map((f) => fieldHtml(f, item[f[0]])).join('')}
      <div class="sticky-actions"><button class="btn primary" type="submit">${isNew ? 'Create' : 'Save'}</button>${!isNew && (col === 'projects' || col === 'posts') ? `<a class="btn" target="_blank" rel="noopener" href="/${col === 'projects' ? 'work' : 'blog'}/${esc(item.slug)}/">View live page ↗</a>` : ''}
      ${isNew ? '' : '<button class="btn danger" type="button" id="del" style="margin-left:auto">Delete</button>'}</div></form>`;
    d.fields.filter((f) => f[1] === 'image').forEach((f) => bindImage(f[0]));
    $('#ef').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { ...item };
      d.fields.forEach((f) => { const v = readField(f); if (v !== undefined) body[f[0]] = v; });
      delete body.id; delete body.updatedAt;
      try {
        const r = isNew ? await api(`/api/admin/${col}`, { method: 'POST', json: body }) : await api(`/api/admin/${col}/${encodeURIComponent(id)}`, { method: 'PUT', json: body });
        toast('Saved. Press "Publish changes" to update the live site.');
        if (isNew) location.hash = `${col}/${encodeURIComponent(r.item.id)}`;
      } catch (er) { toast(er.message, true); }
    });
    $('#del')?.addEventListener('click', async () => {
      if (!confirm(`Delete this ${d.singular}? It disappears from the site at the next publish.`)) return;
      try { await api(`/api/admin/${col}/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast('Deleted'); location.hash = col; } catch (er) { toast(er.message, true); }
    });
  }

  /* ---------- settings ---------- */
  function rowsTable(id, cols, rows) {
    return `<div class="tablewrap"><table class="minitable" id="${id}"><thead><tr>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>
      ${(rows || []).map((r) => `<tr>${cols.map(([k, , t]) => `<td><input data-k="${k}" ${t === 'n' ? 'type="number" step="any"' : ''} value="${esc(r[k] ?? '')}"></td>`).join('')}<td><button type="button" class="btn sm danger" data-rm>✕</button></td></tr>`).join('')}
      </tbody></table></div><button type="button" class="btn sm" data-addrow="${id}" style="margin-top:8px">Add row</button>`;
  }
  function readRows(id, cols) {
    return $$(`#${id} tbody tr`).map((tr) => Object.fromEntries(cols.map(([k, , t]) => { const v = $(`[data-k="${k}"]`, tr).value.trim(); return [k, t === 'n' ? Number(v) : v]; })))
      .filter((r) => Object.values(r).some((v) => v !== '' && v !== 0));
  }
  async function viewSettings() {
    shell('settings', 'Settings', '', '<p class="muted">Loading…</p>');
    const [{ item }, { items: projects }] = await Promise.all([api('/api/admin/settings/site').catch(() => ({ item: {} })), api('/api/admin/projects')]);
    const s = item || {}; const c = s.contact || {}; const est = s.estimator || {};
    const statCols = [['value', 'Number', 'n'], ['suffix', 'Suffix'], ['decimals', 'Decimals', 'n'], ['label', 'Label']];
    const estCols = [['id', 'Id'], ['label', 'Label'], ['price', 'Price ($)', 'n'], ['days', 'Days', 'n']];
    $('#view').innerHTML = `<form class="editor" id="sf">
      <h3 style="margin:0">Contact</h3><div class="cols2">
      ${[['email', 'Email'], ['phone', 'Phone (shown)'], ['whatsapp', 'WhatsApp number (digits only)'], ['upwork', 'Upwork profile URL'], ['linkedin', 'LinkedIn URL']].map(([k, l]) => `<label class="field"><span>${l}</span><input data-c="${k}" value="${esc(c[k])}"></label>`).join('')}</div>
      <h3 style="margin:8px 0 0">Rating</h3><div class="cols2"><label class="field"><span>Score</span><input id="rs" value="${esc(s.rating?.score)}"></label><label class="field"><span>Text</span><input id="rt" value="${esc(s.rating?.text)}"></label></div>
      <h3 style="margin:8px 0 0">Stats (numbers under the hero)</h3>${rowsTable('st', statCols, s.stats)}
      <h3 style="margin:8px 0 0">Featured projects (horizontal section)</h3>
      <label class="field"><span>Project slugs, one per line, in order</span><textarea id="feat">${esc((s.featured || []).join('\n'))}</textarea>
      <small>Available: ${projects.slice(0, 400).map((p) => esc(p.slug)).join(', ')}</small></label>
      <h3 style="margin:8px 0 0">Budget estimator: core services</h3>${rowsTable('ec', estCols, est.cores)}
      <h3 style="margin:8px 0 0">Budget estimator: add-ons</h3>${rowsTable('ea', estCols, est.addons)}
      <div class="sticky-actions"><button class="btn primary" type="submit">Save settings</button></div></form>`;
    const addRow = (id, cols) => { const tb = $(`#${id} tbody`); const tr = document.createElement('tr'); tr.innerHTML = `${cols.map(([k, , t]) => `<td><input data-k="${k}" ${t === 'n' ? 'type="number" step="any"' : ''}></td>`).join('')}<td><button type="button" class="btn sm danger" data-rm>✕</button></td>`; tb.appendChild(tr); };
    $('#view').addEventListener('click', (e) => {
      if (e.target.matches('[data-rm]')) e.target.closest('tr').remove();
      const add = e.target.dataset.addrow; if (add) addRow(add, add === 'st' ? statCols : estCols);
    });
    $('#sf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const feat = $('#feat').value.split('\n').map((x) => x.trim()).filter(Boolean);
      const unknown = feat.filter((f) => !projects.some((p) => p.slug === f));
      if (unknown.length) { toast(`Unknown project slug: ${unknown.join(', ')}`, true); return; }
      const body = { ...s, contact: Object.fromEntries($$('[data-c]').map((i) => [i.dataset.c, i.value.trim()])),
        rating: { score: $('#rs').value.trim(), text: $('#rt').value.trim() }, stats: readRows('st', statCols), featured: feat,
        estimator: { cores: readRows('ec', estCols), addons: readRows('ea', estCols) } };
      delete body.id; delete body.updatedAt;
      try { await api('/api/admin/settings/site', { method: 'PUT', json: body }); toast('Settings saved. Press "Publish changes" to update the site.'); }
      catch (er) { toast(er.message, true); }
    });
  }

  /* ---------- router ---------- */
  async function router() {
    if (!token) return renderLogin();
    const [path] = location.hash.slice(1).split('?');
    const [a, b] = path.split('/');
    try {
      if (!a || a === 'dashboard') await viewDashboard();
      else if (a === 'leads') await viewLeads();
      else if (a === 'settings') await viewSettings();
      else if (DEF[a] && b) await viewEdit(a, decodeURIComponent(b));
      else if (DEF[a]) await viewList(a);
      else await viewDashboard();
    } catch (e) { if (token) { const v = $('#view'); if (v) v.innerHTML = `<div class="empty">${esc(e.message)}</div>`; else toast(e.message, true); } }
  }
  function boot() { router(); }
  addEventListener('hashchange', router);
  boot();
})();
