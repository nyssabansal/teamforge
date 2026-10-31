import { query, one } from '@/lib/db';
import { handler, ok, requireUser, intParam, HttpError } from '@/lib/http';
import { profilesByUserIds } from '@/lib/mongo';

// GET /api/teams/:id/suggestions — free agents the leader might invite.
//
// Semantic mode (when the team and candidates have embeddings):
//   1. pgvector HNSW search: nearest profile vectors to the team vector by
//      cosine distance (<=>), restricted to free agents in the same event
//   2. re-rank: 0.6 * cosine similarity + 0.4 * (skill gaps filled / 3)
// Rule mode (fallback, no embeddings yet): rank purely by fn_skill_gap_fill.
export const GET = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  const team = await one('SELECT team_id, event_id, leader_id FROM teams WHERE team_id = $1', [id]);
  if (!team) throw new HttpError(404, 'Team not found');
  if (team.leader_id !== s.userId) throw new HttpError(403, 'Only the leader sees suggestions');

  const hasVector = await one('SELECT 1 FROM team_embeddings WHERE team_id = $1', [id]);
  let rows;
  if (hasVector) {
    ({ rows } = await query(
      `WITH q AS (SELECT embedding FROM team_embeddings WHERE team_id = $1),
       nearest AS (
         SELECT pe.user_id, 1 - (pe.embedding <=> q.embedding) AS similarity
         FROM profile_embeddings pe, q
         WHERE pe.user_id IN (SELECT user_id FROM registrations WHERE event_id = $2 AND looking_for_team)
         ORDER BY pe.embedding <=> q.embedding
         LIMIT 25)
       SELECT u.user_id, u.name,
              ROUND(n.similarity::numeric, 3)::float AS similarity,
              fn_skill_gap_fill($1, u.user_id) AS gaps_filled,
              ROUND((0.6 * n.similarity + 0.4 * LEAST(fn_skill_gap_fill($1, u.user_id), 3) / 3.0)::numeric, 3)::float AS match_score,
              EXISTS (SELECT 1 FROM join_requests jr WHERE jr.team_id = $1 AND jr.user_id = u.user_id
                      AND jr.status = 'pending') AS already_requested
       FROM nearest n JOIN users u ON u.user_id = n.user_id
       ORDER BY match_score DESC LIMIT 8`, [id, team.event_id]));
  } else {
    ({ rows } = await query(
      `SELECT u.user_id, u.name, NULL::float AS similarity,
              fn_skill_gap_fill($1, u.user_id) AS gaps_filled,
              (LEAST(fn_skill_gap_fill($1, u.user_id), 3) / 3.0)::float AS match_score,
              EXISTS (SELECT 1 FROM join_requests jr WHERE jr.team_id = $1 AND jr.user_id = u.user_id
                      AND jr.status = 'pending') AS already_requested
       FROM registrations r JOIN users u ON u.user_id = r.user_id
       WHERE r.event_id = $2 AND r.looking_for_team
       ORDER BY gaps_filled DESC, u.name LIMIT 8`, [id, team.event_id]));
  }

  const { rows: skillRows } = await query(
    `SELECT us.user_id, json_agg(json_build_object('name', s.name, 'proficiency', us.proficiency)
                                 ORDER BY us.proficiency DESC) AS skills
     FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
     WHERE us.user_id = ANY($1) GROUP BY us.user_id`, [rows.map((r) => r.user_id)]);
  const skills = Object.fromEntries(skillRows.map((r) => [r.user_id, r.skills]));
  let bios = {};
  try { bios = await profilesByUserIds(rows.map((r) => r.user_id)); } catch {}

  return ok({
    mode: hasVector ? 'semantic' : 'rule',
    suggestions: rows.map((r) => ({ ...r, skills: skills[r.user_id] ?? [], bio: bios[r.user_id]?.bio ?? '' })),
  });
});
