// Builds pgvector embeddings for every participant profile and every team.
// First run downloads the MiniLM model (~23 MB) into the local cache.
import './env.mjs';
import { query, pool } from '../lib/db.js';
import { refreshProfileEmbedding, refreshTeamEmbedding, MODEL } from '../lib/embeddings.js';

console.log(`Embedding with ${MODEL} ...`);
const t0 = Date.now();
let done = 0, skipped = 0;
try {
  const { rows: users } = await query(`SELECT user_id FROM users WHERE role = 'participant' ORDER BY user_id`);
  for (const { user_id } of users) {
    const r = await refreshProfileEmbedding(user_id);
    r.updated ? done++ : skipped++;
    process.stdout.write(`\r  profiles: ${done} embedded, ${skipped} skipped`);
  }
  console.log();
  const { rows: teams } = await query('SELECT team_id FROM teams ORDER BY team_id');
  let tDone = 0;
  for (const { team_id } of teams) {
    const r = await refreshTeamEmbedding(team_id);
    if (r.updated) tDone++;
  }
  console.log(`  teams: ${tDone} embedded`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
} finally {
  await pool().end();
  if (globalThis.__mongoClient) await globalThis.__mongoClient.close();
}
