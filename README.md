# usamasheikh.com

Portfolio website, admin panel and API for Usama Sheikh.

```
web/       Static site (design, animations) + build script that prerenders every page
admin/     Admin panel, served at usamasheikh.com/admin/
server/    API on Render: leads, content, image uploads, publish button
content/   seed.json: starting content (132 projects, posts, reviews, FAQs, services, settings)
.github/   GitHub Action that builds the site and uploads it to Hostinger
```

## How it fits together

1. You edit content in **/admin** (projects, blog, reviews, FAQs, services, settings).
2. The admin saves it to the **API on Render**, which stores it in **PostgreSQL**.
3. **Publish changes** starts the GitHub Action. It pulls the content from the API, builds every page
   (`/`, `/work/<slug>/`, `/blog/`, `/blog/<slug>/`) as real HTML with titles, descriptions and schema,
   writes `sitemap.xml`, `robots.txt` and `llms.txt`, and uploads everything to Hostinger over FTP.
4. The contact form sends leads to the API (saved + emailed). `mail.php` on Hostinger is the fallback.

## One-time setup

### 1. Database (free, permanent)
Create a free PostgreSQL database at [neon.tech](https://neon.tech) and copy the connection string
(`postgres://...sslmode=require`). Avoid Render's free Postgres: it expires after 30 days.

### 2. Render (API)
In the existing Render service, set **Root Directory** to `server`, **Build Command** `npm install --omit=dev`,
**Start Command** `npm start`, then add these environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | a long random string (40+ characters) |
| `ADMIN_EMAIL` | `hello@usamasheikh.com` |
| `ADMIN_PASSWORD` | your admin password, 12+ characters (or `ADMIN_PASSWORD_HASH` from `npm run hash-password`) |
| `ALLOWED_ORIGINS` | `https://usamasheikh.com,https://www.usamasheikh.com` |
| `PUBLIC_API_URL` | your Render URL, e.g. `https://usama-portfolio-backend-16jd.onrender.com` |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.hostinger.com` / `465` |
| `SMTP_USER` / `SMTP_PASS` | `hello@usamasheikh.com` and its mailbox password |
| `GITHUB_TOKEN` | fine-grained token, this repo only, permission **Actions: Read and write** |
| `GITHUB_REPO` | `iamusamasheikh/redesign-v2` |

After the first deploy, load the starting content once: Render → Shell → `npm run seed`.

### 3. GitHub secrets (Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `API_URL` | the Render URL |
| `FTP_SERVER` | from Hostinger → Files → FTP Accounts (e.g. `ftp.usamasheikh.com`) |
| `FTP_USERNAME` / `FTP_PASSWORD` | Hostinger FTP account |
| `FTP_DIR` | optional, default `public_html/` |
| `FTP_PROTOCOL` | optional, `ftps` (default) or `ftp` if FTPS is refused |
| `GA_ID` | optional Google Analytics ID (`G-XXXX`) |

### 4. Go live
Merge this branch into `main`. Render redeploys the API, and the Action builds and uploads the site.

## Local development

```bash
# API
cd server && cp .env.example .env   # fill in DATABASE_URL etc.
npm install && npm run seed && npm run dev

# Site
cd web && npm install && npx playwright install chromium
API_URL=http://localhost:5000 npm run build     # or: npm run build:fast (no prerender)
```

## Security notes
- Admin sign-in uses a bcrypt-hashed password and 12-hour tokens; all admin endpoints require it.
- Login and contact form are rate-limited; the contact form has a honeypot field against bots.
- Never commit `.env`. The old admin PIN from the previous version is no longer used anywhere.
