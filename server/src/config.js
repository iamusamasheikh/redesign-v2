// All configuration comes from environment variables (set them in Render > Environment).
import bcrypt from 'bcryptjs';
const req = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
};

// Either ADMIN_PASSWORD_HASH (bcrypt) or ADMIN_PASSWORD (plain, hashed here at start-up).
function adminHash() {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  const pw = process.env.ADMIN_PASSWORD || '';
  if (pw.length < 12) throw new Error('Set ADMIN_PASSWORD (12+ characters) or ADMIN_PASSWORD_HASH');
  return bcrypt.hashSync(pw, 12);
}

export const config = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: req('DATABASE_URL'),
  jwtSecret: req('JWT_SECRET'),
  adminEmail: req('ADMIN_EMAIL').toLowerCase(),
  adminPasswordHash: adminHash(),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://usamasheikh.com,https://www.usamasheikh.com')
    .split(',').map((s) => s.trim()).filter(Boolean),
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    to: process.env.LEADS_TO || 'hello@usamasheikh.com',
    from: process.env.MAIL_FROM || 'Usama Sheikh <hello@usamasheikh.com>',
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || '',
    workflow: process.env.GITHUB_WORKFLOW || 'deploy.yml',
    ref: process.env.GITHUB_REF || 'main',
  },
  dbSsl: process.env.DATABASE_SSL !== 'false',
};
