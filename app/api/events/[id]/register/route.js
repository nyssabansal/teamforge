import { one, query } from '@/lib/db';
import { handler, ok, requireUser, intParam, HttpError } from '@/lib/http';

// POST: register.  Role, event status and deadline are enforced by
// trg_registrations_before_insert; duplicates by UNIQUE(event_id, user_id).
export const POST = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  const reg = await one(
    'INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) RETURNING *', [id, s.userId]);
  return ok({ registration: reg }, 201);
});

// DELETE: unregister (only while not in a team; leaders must disband first)
export const DELETE = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  const inTeam = await one('SELECT 1 FROM team_members WHERE event_id = $1 AND user_id = $2', [id, s.userId]);
  if (inTeam) throw new HttpError(400, 'Leave your team before unregistering');
  const { rowCount } = await query(
    'DELETE FROM registrations WHERE event_id = $1 AND user_id = $2', [id, s.userId]);
  if (!rowCount) throw new HttpError(404, 'You are not registered for this event');
  return ok({ ok: true });
});
