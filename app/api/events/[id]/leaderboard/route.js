import { query, one } from '@/lib/db';
import { handler, ok, intParam } from '@/lib/http';
import { getSession } from '@/lib/auth';

// Leaderboard is public once the event is completed; during judging only
// the organizer and the event's judges can see it.
export const GET = handler(async (req, { params }) => {
  const id = intParam((await params).id);
  const s = await getSession();
  const ev = await one(
    `SELECT status, organizer_id,
            EXISTS (SELECT 1 FROM event_judges WHERE event_id = $1 AND judge_id = $2) AS is_judge
     FROM events WHERE event_id = $1`, [id, s?.userId ?? 0]);
  const visible = ev && (ev.status === 'completed' || ev.organizer_id === s?.userId || ev.is_judge);
  if (!visible) return ok({ leaderboard: [], hidden: true });

  const { rows } = await query(
    `SELECT rank::int, team_id, team_name, project_title, repo_url, judges_scored,
            avg_score::float, innovation::float, technical::float, impact::float
     FROM v_leaderboard WHERE event_id = $1 ORDER BY rank, team_name`, [id]);
  return ok({ leaderboard: rows });
});
