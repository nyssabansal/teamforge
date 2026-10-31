// Vector side of the project.
// Model: Xenova/all-MiniLM-L6-v2 (sentence-transformers, 384 dims), run
// locally through transformers.js — no API key, ~23 MB download on first use.
// Vectors are mean-pooled and L2-normalised, then stored in pgvector and
// compared with cosine distance (<=>).
import { createHash } from 'node:crypto';
import { query, one } from './db.js';
import { profiles } from './mongo.js';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DIMS = 384;
const LEVEL = ['', 'beginner', 'basic', 'intermediate', 'strong', 'expert'];

const g = globalThis;
async function extractor() {
  if (!g.__embedder) {
    g.__embedder = import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', MODEL, { dtype: 'fp32' }));
  }
  return g.__embedder;
}

export async function embed(text) {
  const fx = await extractor();
  const out = await fx(text, { pooling: 'mean', normalize: true });
  const v = Array.from(out.data);
  if (v.length !== DIMS) throw new Error(`expected ${DIMS} dims, got ${v.length}`);
  return v;
}

export const toPgVector = (v) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---- text builders: what actually gets embedded ----------------------------

export function profileText(skills, p = {}) {
  const parts = [];
  if (skills.length) parts.push('Skills: ' + skills.map((s) => `${s.name} (${LEVEL[s.proficiency]})`).join(', ') + '.');
  if (p.interests?.length) parts.push('Interests: ' + p.interests.join(', ') + '.');
  if (p.bio) parts.push(p.bio);
  for (const pr of p.past_projects ?? []) {
    parts.push(`Project ${pr.title}: ${pr.description}${pr.stack?.length ? ` (built with ${pr.stack.join(', ')})` : ''}.`);
  }
  return parts.join(' ');
}

export function teamText(team, required) {
  const need = required.map((r) => `${r.name} (${LEVEL[r.min_proficiency]})`).join(', ');
  return `Team ${team.team_name} is looking for teammates with ${need || 'any skills'}. ${team.pitch ?? ''}`.trim();
}

// ---- upserts ---------------------------------------------------------------

/** Re-embed one participant if their skills/profile text changed. */
export async function refreshProfileEmbedding(userId) {
  const { rows: skills } = await query(
    `SELECT s.name, us.proficiency FROM user_skills us JOIN skills s USING (skill_id)
     WHERE us.user_id = $1 ORDER BY us.proficiency DESC, s.name`, [userId]);
  const doc = await (await profiles()).findOne({ user_id: userId });
  const text = profileText(skills, doc ?? {});
  if (!text) return { skipped: 'empty profile' };

  const hash = sha256(text);
  const existing = await one('SELECT source_hash FROM profile_embeddings WHERE user_id = $1', [userId]);
  if (existing?.source_hash === hash) return { skipped: 'unchanged' };

  const v = await embed(text);
  await query(
    `INSERT INTO profile_embeddings (user_id, embedding, source_hash, model)
     VALUES ($1, $2::vector, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET embedding = EXCLUDED.embedding, source_hash = EXCLUDED.source_hash,
           model = EXCLUDED.model, updated_at = now()`,
    [userId, toPgVector(v), hash, MODEL]);
  return { updated: true };
}

/** Re-embed a team's "looking for" description. */
export async function refreshTeamEmbedding(teamId) {
  const team = await one('SELECT team_id, team_name, pitch FROM teams WHERE team_id = $1', [teamId]);
  if (!team) return { skipped: 'no team' };
  const { rows: required } = await query(
    `SELECT s.name, trs.min_proficiency FROM team_required_skills trs JOIN skills s USING (skill_id)
     WHERE trs.team_id = $1 ORDER BY s.name`, [teamId]);
  const text = teamText(team, required);
  const hash = sha256(text);
  const existing = await one('SELECT source_hash FROM team_embeddings WHERE team_id = $1', [teamId]);
  if (existing?.source_hash === hash) return { skipped: 'unchanged' };

  const v = await embed(text);
  await query(
    `INSERT INTO team_embeddings (team_id, embedding, source_hash) VALUES ($1, $2::vector, $3)
     ON CONFLICT (team_id) DO UPDATE
       SET embedding = EXCLUDED.embedding, source_hash = EXCLUDED.source_hash, updated_at = now()`,
    [teamId, toPgVector(v), hash]);
  return { updated: true };
}

/**
 * Embedding is best-effort from request handlers: if the model can't load
 * (first run offline, etc.) the write that triggered it still succeeds and
 * matching falls back to the rule-based SQL ranking.
 */
export function refreshInBackground(fn, id) {
  fn(id).catch((err) => console.warn(`[embeddings] ${fn.name}(${id}) skipped:`, err.message));
}
