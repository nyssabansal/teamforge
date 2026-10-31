import { query, one } from '@/lib/db';
import { handler, ok, requireUser, intParam } from '@/lib/http';

// GET /api/matching?eventId=1 — open teams ranked for the logged-in participant.
//   gaps_filled : required skills this user meets that the team is still missing
//   similarity  : cosine similarity between the user's profile vector and the
//                 team's "looking for" vector (NULL if either isn't embedded)
//   match_score : 0.6 * similarity + 0.4 * min(gaps_filled, 3) / 3
//                 (pure skill score when vectors are missing)
export const GET = handler(async (req) => {
  const s = await requireUser('participant');
  const eventId = intParam(new URL(req.url).searchParams.get('eventId'), 'eventId');
  const hasProfileVec = !!(await one('SELECT 1 FROM profile_embeddings WHERE user_id = $1', [s.userId]));

  const { rows } = await query(
    `SELECT v.team_id, v.team_name, v.pitch, v.member_count, v.capacity, v.slots_left,
            v.balance_score::float AS balance_score, v.missing_skills,
            fn_skill_gap_fill(v.team_id, $2) AS gaps_filled,
            ROUND((1 - (pe.embedding <=> te.embedding))::numeric, 3)::float AS similarity,
            ROUND(CASE WHEN te.embedding IS NULL OR pe.embedding IS NULL
                       THEN LEAST(fn_skill_gap_fill(v.team_id, $2), 3) / 3.0
                       ELSE 0.6 * (1 - (pe.embedding <=> te.embedding))
                          + 0.4 * LEAST(fn_skill_gap_fill(v.team_id, $2), 3) / 3.0 END::numeric, 3)::float AS match_score,
            EXISTS (SELECT 1 FROM join_requests jr WHERE jr.team_id = v.team_id AND jr.user_id = $2
                    AND jr.status = 'pending') AS already_requested
     FROM v_open_teams v
     LEFT JOIN team_embeddings te   ON te.team_id = v.team_id
     LEFT JOIN profile_embeddings pe ON pe.user_id = $2
     WHERE v.event_id = $1
     ORDER BY match_score DESC, v.balance_score DESC
     LIMIT 10`, [eventId, s.userId]);

  return ok({ mode: hasProfileVec ? 'semantic' : 'rule', teams: rows });
});
