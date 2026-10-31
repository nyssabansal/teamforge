import { query, one } from '@/lib/db';
import { handler, ok, readJson, requireUser } from '@/lib/http';
import { eventSchema } from '@/lib/validate';
import { getSession } from '@/lib/auth';

// GET /api/events?q=flood&status=open
//   q      -> full-text search (GIN index on generated tsvector), ranked
//   status -> filter; drafts are only visible to their organizer
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim() || null;
  const status = sp.get('status') || null;
  const session = await getSession();

  const { rows } = await query(
    `SELECT e.event_id, e.title, e.theme, e.venue, e.status, e.start_date, e.end_date,
            e.reg_deadline, e.min_team_size, e.max_team_size,
            u.name AS organizer,
            d.registrations, d.teams, d.still_seeking,
            CASE WHEN $1::text IS NULL THEN NULL
                 ELSE ts_headline('english', e.description, websearch_to_tsquery('english', $1),
                                  'MaxWords=22, MinWords=10') END AS snippet,
            CASE WHEN $1::text IS NULL THEN 0
                 ELSE ts_rank(e.search_tsv, websearch_to_tsquery('english', $1)) END AS rank,
            EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = e.event_id AND r.user_id = $3) AS is_registered
     FROM events e
     JOIN users u ON u.user_id = e.organizer_id
     JOIN v_event_dashboard d ON d.event_id = e.event_id
     WHERE ($1::text IS NULL OR e.search_tsv @@ websearch_to_tsquery('english', $1))
       AND ($2::text IS NULL OR e.status = $2)
       AND (e.status <> 'draft' OR e.organizer_id = $3)
     ORDER BY rank DESC,
              CASE e.status WHEN 'open' THEN 0 WHEN 'ongoing' THEN 1 WHEN 'judging' THEN 2
                            WHEN 'draft' THEN 3 ELSE 4 END,
              e.start_date`,
    [q, status, session?.userId ?? 0]);
  return ok({ events: rows });
});

// POST /api/events  (organizer)
export const POST = handler(async (req) => {
  const s = await requireUser('organizer');
  const e = eventSchema.parse(await readJson(req));
  const event = await one(
    `INSERT INTO events (organizer_id, title, description, theme, venue, start_date, end_date,
                         reg_deadline, min_team_size, max_team_size, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [s.userId, e.title, e.description, e.theme ?? null, e.venue ?? null, e.start_date, e.end_date,
     e.reg_deadline, e.min_team_size, e.max_team_size, e.status]);
  delete event.search_tsv;
  return ok({ event }, 201);
});
