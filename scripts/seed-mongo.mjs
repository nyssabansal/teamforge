// Loads participant profiles into MongoDB, keyed by the SQL user_id.
// Run after `npm run db:reset` (needs the users to exist in Postgres).
import './env.mjs';
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { participants } from '../db/seed/data.mjs';
import { initMongo } from '../db/mongo/init.mjs';

const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
const mongo = new MongoClient(process.env.MONGODB_URI);

try {
  await sql.connect();
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB || 'teamforge');
  const col = await initMongo(db);
  await col.deleteMany({});

  const { rows } = await sql.query(
    `SELECT user_id, split_part(email::text, '@', 1) AS handle FROM users WHERE role = 'participant'`);
  const idByHandle = Object.fromEntries(rows.map((r) => [r.handle, r.user_id]));

  const now = new Date();
  const docs = participants
    .filter((p) => idByHandle[p.handle])
    .map((p) => ({ user_id: idByHandle[p.handle], ...p.profile, created_at: now, updated_at: now }));
  const res = await col.insertMany(docs);
  console.log(`inserted ${res.insertedCount} profiles into ${db.databaseName}.participant_profiles`);
  console.log('indexes:', (await col.indexes()).map((i) => i.name).join(', '));
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end().catch(() => {});
  await mongo.close().catch(() => {});
}
