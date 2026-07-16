import pg from 'pg';
import { env } from '../config/env.js';

/**
 * Single shared connection pool. Import `query` for one-off statements or
 * `withTransaction` when you need atomicity across several writes.
 */
// Local Postgres (docker) needs no SSL; any remote host (Supabase, managed PG)
// does — so enable it whenever the host isn't localhost, regardless of NODE_ENV.
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])/.test(env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
