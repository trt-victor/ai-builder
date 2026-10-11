// One query interface, two engines with the same SQL: Azure Database for PostgreSQL when DATABASE_URL is set,
// otherwise PGlite (Postgres in-process) so the app and the tests run with no database to install.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function open() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: true } });
    return { query: (sql, params) => pool.query(sql, params), exec: (sql) => pool.query(sql) };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  // The default folder sits next to this file, wherever the server was started from.
  const dir = process.env.PGLITE_DIR || fileURLToPath(new URL('./data/pg', import.meta.url));
  if (!dir.includes('://')) mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  return { query: (sql, params) => db.query(sql, params), exec: (sql) => db.exec(sql) };
}
