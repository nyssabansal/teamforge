import pg from 'pg';

// One pool per server process. In dev, Next reloads modules often, so keep
// the pool on globalThis to avoid exhausting connections.
const globalForPg = globalThis;

// Return DATE columns as 'YYYY-MM-DD' strings. The default turns them into a
// JS Date at local midnight, which shifts the day for users in other timezones.
pg.types.setTypeParser(1082, (v) => v);

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env.local');
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

export function pool() {
  if (!globalForPg.__pgPool) globalForPg.__pgPool = createPool();
  return globalForPg.__pgPool;
}

/** Parameterised query — never interpolate user input into SQL strings. */
export async function query(text, params = []) {
  return pool().query(text, params);
}

export async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn(client)` inside BEGIN/COMMIT on a single connection.
 * Any thrown error (including a RAISE from a trigger) triggers ROLLBACK.
 */
export async function withTransaction(fn) {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
