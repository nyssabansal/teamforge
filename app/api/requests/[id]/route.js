import { query, one, withTransaction } from '@/lib/db';
import { handler, ok, readJson, requireUser, intParam, HttpError } from '@/lib/http';

// POST /api/requests/:id  { action: 'accept' | 'reject' | 'withdraw' }
export const POST = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  const { action } = await readJson(req);

  if (action === 'accept') {
    // TRANSACTION: fn_accept_join_request locks the request and team rows,
    // marks the request accepted, inserts the member (capacity trigger may
    // RAISE), and auto-rejects the user's other pending requests.
    // Any error -> ROLLBACK, so nothing is half-applied.
    const teamId = await withTransaction(async (c) => {
      const { rows } = await c.query('SELECT fn_accept_join_request($1, $2) AS team_id', [id, s.userId]);
      return rows[0].team_id;
    });
    return ok({ ok: true, team_id: teamId });
  }

  if (action === 'reject') {
    const { rowCount } = await query(
      `UPDATE join_requests SET status = 'rejected', responded_at = now()
       WHERE request_id = $1 AND status = 'pending'
         AND team_id IN (SELECT team_id FROM teams WHERE leader_id = $2)`, [id, s.userId]);
    if (!rowCount) throw new HttpError(404, 'No pending request of yours to reject');
    return ok({ ok: true });
  }

  if (action === 'withdraw') {
    const { rowCount } = await query(
      `UPDATE join_requests SET status = 'withdrawn', responded_at = now()
       WHERE request_id = $1 AND user_id = $2 AND status = 'pending'`, [id, s.userId]);
    if (!rowCount) throw new HttpError(404, 'No pending request to withdraw');
    return ok({ ok: true });
  }

  throw new HttpError(400, 'action must be accept, reject or withdraw');
});
