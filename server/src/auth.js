import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';

const TOKEN_TTL = '12h';

export async function login(email, password, ip) {
  const okEmail = String(email || '').trim().toLowerCase() === config.adminEmail;
  // Always run bcrypt so response time does not reveal whether the email matched.
  const okPass = await bcrypt.compare(String(password || ''), config.adminPasswordHash);
  const ok = okEmail && okPass;
  await q('INSERT INTO login_attempts (ok, ip) VALUES ($1,$2)', [ok, String(ip || '').slice(0, 64)]).catch(() => {});
  if (!ok) return null;
  return jwt.sign({ sub: config.adminEmail, role: 'admin' }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function requireAdmin(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== 'admin') throw new Error('role');
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
}
