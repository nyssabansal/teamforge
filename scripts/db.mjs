// npm run db:schema | db:seed | db:reset | db:test
import './env.mjs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const cmd = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing (.env.local)'); process.exit(1); }

const SCHEMA = ['01_schema', '02_functions_triggers', '03_views'];
const SEED = ['04_seed'];

async function run(files) {
  const client = new pg.Client({ connectionString: url, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    for (const f of files) {
      process.stdout.write(`  ${f}.sql ... `);
      await client.query(readFileSync(`db/sql/${f}.sql`, 'utf8'));
      console.log('ok');
    }
  } finally {
    await client.end();
  }
}

try {
  if (cmd === 'schema') await run(SCHEMA);
  else if (cmd === 'seed') await run(SEED);
  else if (cmd === 'reset') {
    // drop only this project's objects; extensions stay installed, so a
    // non-superuser database owner can reset repeatedly
    console.log('Dropping project objects and reloading...');
    await run(['99_teardown', ...SCHEMA, ...SEED]);
  } else if (cmd === 'test') {
    // the test file uses psql meta-commands for formatting, so run it through psql
    const r = spawnSync('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'db/tests/integrity_tests.sql'], { stdio: 'inherit' });
    if (r.error) console.error('psql not found on PATH — run db/tests/integrity_tests.sql from pgAdmin or psql instead');
    process.exit(r.status ?? 1);
  } else {
    console.log('usage: node scripts/db.mjs schema|seed|reset|test');
    process.exit(1);
  }
  console.log('done');
} catch (e) {
  console.error('\nFAILED:', e.message);
  if (/permission denied to create extension/.test(e.message)) {
    console.error('-> create the extensions once as a superuser (see README "Setup"):');
    console.error('   psql -U postgres -d <your db> -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS citext;"');
  } else if (/extension "vector" is not available|could not open extension control file/.test(e.message)) {
    console.error('-> pgvector is not installed for this Postgres version (see README "Prerequisites")');
  }
  process.exit(1);
}
