import { query, one } from '@/lib/db';
import { handler, ok, readJson, requireUser, intParam, HttpError } from '@/lib/http';
import { eventStatusSchema } from '@/lib/validate';
import { getSession } from '@/lib/auth';

export const GET = handler(async (req, { params }) => {
  const id = intParam((await params).id);
  const s = await getSession();
  const uid = s?.userId ?? 0;

  const event = await one(
    `SELECT e.event_id, e.organizer_id, e.title, e.description, e.theme, e.venue, e.status,
            e.start_date, e.end_date, e.reg_deadline, e.min_team_size, e.max_team_size,
            u.name AS organizer, d.registrations, d.still_seeking, d.teams, d.full_teams,
            d.avg_balance, d.submissions, d.pending_requests,
            EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = e.event_id AND r.user_id = $2) AS is_registered,
            (SELECT tm.team_id FROM team_members tm WHERE tm.event_id = e.event_id AND tm.user_id = $2) AS my_team_id,
            EXISTS (SELECT 1 FROM event_judges j WHERE j.event_id = e.event_id AND j.judge_id = $2) AS is_judge
     FROM events e
     JOIN users u ON u.user_id = e.organizer_id
     JOIN v_event_dashboard d ON d.event_id = e.event_id
     WHERE e.event_id = $1`, [id, uid]);

  if (!event || (event.status === 'draft' && event.organizer_id !== uid)) {
    throw new HttpError(404, 'Event not found');
  }
  const { rows: judges } = await query(
    `SELECT u.user_id, u.name FROM event_judges j JOIN users u ON u.user_id = j.judge_id
     WHERE j.event_id = $1 ORDER BY u.name`, [id]);

  return ok({ event: { ...event, is_organizer: event.organizer_id === uid }, judges });
});

// PATCH /api/events/:id  { status }  — organizer moves the event through its lifecycle
const NEXT = { draft: ['open'], open: ['ongoing', 'draft'], ongoing: ['judging'], judging: ['completed'], completed: [] };

export const PATCH = handler(async (req, { params }) => {
  const s = await requireUser('organizer');
  const id = intParam((await params).id);
  const { status } = eventStatusSchema.parse(await readJson(req));

  const ev = await one('SELECT status, organizer_id FROM events WHERE event_id = $1', [id]);
  if (!ev) throw new HttpError(404, 'Event not found');
  if (ev.organizer_id !== s.userId) throw new HttpError(403, 'Only this event\'s organizer can change it');
  if (!NEXT[ev.status].includes(status)) {
    throw new HttpError(400, `Can't move from ${ev.status} to ${status}`);
  }
  const updated = await one(
    'UPDATE events SET status = $2 WHERE event_id = $1 RETURNING event_id, status', [id, status]);
  return ok({ event: updated });
});
