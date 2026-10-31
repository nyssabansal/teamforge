import { query } from '@/lib/db';
import { handler, ok, intParam } from '@/lib/http';
import { profiles } from '@/lib/mongo';
import { interestTrends, stackPopularity, availabilitySplit } from '@/db/mongo/aggregations.mjs';

// Organizer insights for one event.
export const GET = handler(async (req, { params }) => {
  const id = intParam((await params).id);

  // skill category mix of registered participants (CTE + window functions)
  const categories = query(
    `WITH cat AS (
       SELECT s.category, COUNT(DISTINCT us.user_id) AS people
       FROM registrations r
       JOIN user_skills us ON us.user_id = r.user_id AND us.proficiency >= 3
       JOIN skills s       ON s.skill_id = us.skill_id
       WHERE r.event_id = $1
       GROUP BY s.category)
     SELECT category, people::int,
            ROUND(100.0 * people / SUM(people) OVER (), 1)::float AS pct
     FROM cat ORDER BY people DESC`, [id]);

  // demand vs supply per skill — materialised view, refreshed on read
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_demand');
  const demand = query(
    `SELECT skill, category, teams_needing::int AS demand, free_participants_with_skill::int AS supply
     FROM mv_skill_demand WHERE event_id = $1
     ORDER BY (teams_needing - free_participants_with_skill) DESC, skill LIMIT 12`, [id]);

  // team size distribution (GROUP BY + HAVING)
  const sizes = query(
    `SELECT member_count AS size, COUNT(*)::int AS teams
     FROM v_team_overview WHERE event_id = $1
     GROUP BY member_count HAVING COUNT(*) > 0 ORDER BY member_count`, [id]);

  const [c, d, z, regs] = await Promise.all([
    categories, demand, sizes,
    query('SELECT user_id FROM registrations WHERE event_id = $1', [id]),
  ]);

  // NoSQL aggregation over the registrants' MongoDB profiles
  let interests = [], stacks = [], availability = [];
  try {
    const col = await profiles();
    const ids = regs.rows.map((r) => r.user_id);
    [interests, stacks, availability] = await Promise.all([
      col.aggregate(interestTrends(ids, 8)).toArray(),
      col.aggregate(stackPopularity(ids, 8)).toArray(),
      col.aggregate(availabilitySplit(ids)).toArray(),
    ]);
  } catch (e) { console.warn('[mongo]', e.message); }

  return ok({ categories: c.rows, demand: d.rows, sizes: z.rows, interests, stacks, availability });
});
