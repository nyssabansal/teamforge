import { query } from '@/lib/db';
import { handler, ok, intParam } from '@/lib/http';
import { profilesByUserIds } from '@/lib/mongo';

// GET /api/events/:id/participants?skill=React&min=3&rare=1
//   Free agents (registered, not in a team) with their skills.
//   skill/min  -> filter by a skill tag at a minimum proficiency (uses idx_user_skills_skill_prof)
//   rare=1     -> only people with a skill no current team member in this event has (NOT EXISTS)
// Profile bios come from MongoDB and are merged in by user_id.
export const GET = handler(async (req, { params }) => {
  const id = intParam((await params).id);
  const sp = new URL(req.url).searchParams;
  const skill = sp.get('skill') || null;
  const min = Number(sp.get('min') || 1);
  const rare = sp.get('rare') === '1';

  const { rows } = await query(
    `SELECT u.user_id, u.name,
            COALESCE(json_agg(json_build_object('name', s.name, 'category', s.category,
                                                'proficiency', us.proficiency)
                     ORDER BY us.proficiency DESC, s.name)
                     FILTER (WHERE s.skill_id IS NOT NULL), '[]') AS skills
     FROM registrations r
     JOIN users u ON u.user_id = r.user_id
     LEFT JOIN user_skills us ON us.user_id = u.user_id
     LEFT JOIN skills s       ON s.skill_id = us.skill_id
     WHERE r.event_id = $1 AND r.looking_for_team
       AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM user_skills x JOIN skills xs ON xs.skill_id = x.skill_id
              WHERE x.user_id = u.user_id AND xs.name = $2 AND x.proficiency >= $3))
       AND (NOT $4 OR EXISTS (
              SELECT 1 FROM user_skills x
              WHERE x.user_id = u.user_id AND x.proficiency >= 3
                AND NOT EXISTS (SELECT 1 FROM team_members tm
                                JOIN user_skills y ON y.user_id = tm.user_id
                                WHERE tm.event_id = $1 AND y.skill_id = x.skill_id)))
     GROUP BY u.user_id
     ORDER BY u.name`,
    [id, skill, min, rare]);

  let profiles = {};
  try { profiles = await profilesByUserIds(rows.map((r) => r.user_id)); } catch (e) { console.warn('[mongo]', e.message); }

  return ok({
    participants: rows.map((r) => ({
      ...r,
      bio: profiles[r.user_id]?.bio ?? '',
      interests: profiles[r.user_id]?.interests ?? [],
    })),
  });
});
