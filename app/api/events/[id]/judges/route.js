import { query, one } from '@/lib/db';
import { handler, ok, readJson, requireUser, intParam, HttpError } from '@/lib/http';

async function ownEvent(eventId, userId) {
  const ev = await one('SELECT organizer_id FROM events WHERE event_id = $1', [eventId]);
  if (!ev) throw new HttpError(404, 'Event not found');
  if (ev.organizer_id !== userId) throw new HttpError(403, 'Only this event\'s organizer can manage judges');
}

// GET: judges that could be assigned (organizer only)
export const GET = handler(async (req, { params }) => {
  const s = await requireUser('organizer');
  const id = intParam((await params).id);
  await ownEvent(id, s.userId);
  const { rows } = await query(
    `SELECT u.user_id, u.name, u.email,
            EXISTS (SELECT 1 FROM event_judges j WHERE j.event_id = $1 AND j.judge_id = u.user_id) AS assigned
     FROM users u WHERE u.role = 'judge' AND u.is_active ORDER BY u.name`, [id]);
  return ok({ judges: rows });
});

// POST { judge_id } assign;  role is checked by trg_event_judges_before_insert
export const POST = handler(async (req, { params }) => {
  const s = await requireUser('organizer');
  const id = intParam((await params).id);
  await ownEvent(id, s.userId);
  const judgeId = intParam((await readJson(req)).judge_id, 'judge_id');
  await query('INSERT INTO event_judges (event_id, judge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, judgeId]);
  return ok({ ok: true }, 201);
});

// DELETE ?judgeId=
export const DELETE = handler(async (req, { params }) => {
  const s = await requireUser('organizer');
  const id = intParam((await params).id);
  await ownEvent(id, s.userId);
  const judgeId = intParam(new URL(req.url).searchParams.get('judgeId'), 'judgeId');
  await query('DELETE FROM event_judges WHERE event_id = $1 AND judge_id = $2', [id, judgeId]);
  return ok({ ok: true });
});
