import pg from 'pg';
import { DATABASE_URL } from './config.js';

const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])/.test(DATABASE_URL!);

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});

export async function dbQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}
