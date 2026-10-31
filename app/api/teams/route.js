import { query, withTransaction } from '@/lib/db';
import { handler, ok, readJson, requireUser, intParam } from '@/lib/http';
import { teamSchema } from '@/lib/validate';
import { refreshInBackground, refreshTeamEmbedding } from '@/lib/embeddings';

// GET /api/teams?eventId=1&open=1&sort=balance|slots|name
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const eventId = intParam(sp.get('eventId'), 'eventId');
  const openOnly = sp.get('open') === '1';
  const order = { slots: 'slots_left DESC, balance_score DESC', name: 'team_name' }[sp.get('sort')]
    ?? 'is_locked, balance_score DESC';  // whitelisted — never interpolate raw input

  const { rows } = await query(
    `SELECT team_id, team_name, pitch, leader_id, leader_name, capacity, member_count, slots_left,
            is_locked, balance_score::float, members, required_skills, missing_skills
     FROM v_team_overview
     WHERE event_id = $1 AND (NOT $2 OR (NOT is_locked AND slots_left > 0))
     ORDER BY ${order}`, [eventId, openOnly]);
  return ok({ teams: rows });
});

// POST /api/teams — create a team; creator becomes leader + first member.
// One transaction: sp_create_team + required skills. If any step fails
// (name taken, capacity outside event limits, not registered...) nothing is kept.
export const POST = handler(async (req) => {
  const s = await requireUser('participant');
  const t = teamSchema.parse(await readJson(req));

  const teamId = await withTransaction(async (c) => {
    const { rows } = await c.query(
      'CALL sp_create_team($1, $2, $3, $4, $5, NULL)',
      [t.event_id, s.userId, t.team_name, t.pitch, t.capacity]);
    const id = rows[0].p_team_id;
    for (const r of t.required_skills) {
      await c.query(
        'INSERT INTO team_required_skills (team_id, skill_id, min_proficiency) VALUES ($1, $2, $3)',
        [id, r.skill_id, r.min_proficiency]);
    }
    return id;
  });

  refreshInBackground(refreshTeamEmbedding, teamId);
  return ok({ team_id: teamId }, 201);
});
