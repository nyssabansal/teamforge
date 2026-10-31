import { query, one } from '@/lib/db';
import { handler, ok, requireUser, intParam, HttpError } from '@/lib/http';

// POST /api/teams/:id/leave — a member (not the leader) leaves.
// The AFTER DELETE trigger unlocks the team, recomputes its balance score
// and marks the user as looking for a team again.
export const POST = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  const t = await one('SELECT leader_id FROM teams WHERE team_id = $1', [id]);
  if (!t) throw new HttpError(404, 'Team not found');
  if (t.leader_id === s.userId) throw new HttpError(400, 'Leaders can\'t leave — disband the team instead');
  if (await one('SELECT 1 FROM submissions WHERE team_id = $1', [id])) {
    throw new HttpError(400, 'You can\'t leave after your team has submitted');
  }
  const { rowCount } = await query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [id, s.userId]);
  if (!rowCount) throw new HttpError(404, 'You are not in this team');
  return ok({ ok: true });
});
