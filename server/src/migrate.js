import { migrate, pool } from './db.js';
await migrate();
console.log('Database tables are ready.');
await pool.end();
