import { query } from '@/lib/db';
import { handler, ok, requireUser } from '@/lib/http';

// GET /api/me — everything the role-specific dashboard needs
export const GET = handler(async () => {
  const s = await requireUser();
  const user = { user_id: s.userId, name: s.name, role: s.role };

  if (s.role === 'participant') {
    const [regs, requests] = await Promise.all([
      query(
        `SELECT e.event_id, e.title, e.status, e.start_date, r.looking_for_team,
                v.team_id, v.team_name, v.member_count, v.capacity, v.is_locked,
                v.balance_score::float AS balance_score, (v.leader_id = $1) AS is_leader,
                (SELECT COUNT(*)::int FROM join_requests jr WHERE jr.team_id = v.team_id AND jr.status = 'pending') AS incoming
         FROM registrations r
         JOIN events e ON e.event_id = r.event_id
         LEFT JOIN team_members tm ON tm.event_id = r.event_id AND tm.user_id = r.user_id
         LEFT JOIN v_team_overview v ON v.team_id = tm.team_id
         WHERE r.user_id = $1
         ORDER BY e.start_date DESC`, [s.userId]),
      query(
        `SELECT jr.request_id, jr.status, jr.created_at, jr.responded_at,
                t.team_id, t.team_name, e.title AS event_title
         FROM join_requests jr JOIN teams t ON t.team_id = jr.team_id
         JOIN events e ON e.event_id = t.event_id
         WHERE jr.user_id = $1
         ORDER BY (jr.status = 'pending') DESC, jr.created_at DESC LIMIT 20`, [s.userId]),
    ]);
    return ok({ user, registrations: regs.rows, requests: requests.rows });
  }

  if (s.role === 'organizer') {
    const { rows } = await query(
      `SELECT d.*, d.avg_balance::float AS avg_balance FROM v_event_dashboard d
       WHERE d.organizer_id = $1 ORDER BY d.start_date DESC`, [s.userId]);
    return ok({ user, events: rows });
  }

  // judge: assigned events + submissions with how many criteria this judge has scored
  const { rows } = await query(
    `SELECT e.event_id, e.title, e.status, s.submission_id, t.team_name, s.project_title,
            s.summary, s.repo_url, COUNT(sc.criterion)::int AS criteria_scored,
            COALESCE(json_object_agg(sc.criterion, sc.score) FILTER (WHERE sc.criterion IS NOT NULL), '{}') AS my_scores
     FROM event_judges ej
     JOIN events e ON e.event_id = ej.event_id
     LEFT JOIN teams t ON t.event_id = e.event_id
     LEFT JOIN submissions s ON s.team_id = t.team_id
     LEFT JOIN scores sc ON sc.submission_id = s.submission_id AND sc.judge_id = ej.judge_id
     WHERE ej.judge_id = $1
     GROUP BY e.event_id, s.submission_id, t.team_name
     ORDER BY e.start_date DESC, criteria_scored, t.team_name`, [s.userId]);
  return ok({ user, queue: rows });
});
