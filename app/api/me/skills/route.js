import { query, withTransaction } from '@/lib/db';
import { handler, ok, readJson, requireUser } from '@/lib/http';
import { skillsSchema } from '@/lib/validate';
import { refreshInBackground, refreshProfileEmbedding } from '@/lib/embeddings';

export const GET = handler(async () => {
  const s = await requireUser('participant');
  const { rows } = await query(
    `SELECT us.skill_id, s.name, s.category, us.proficiency
     FROM user_skills us JOIN skills s USING (skill_id)
     WHERE us.user_id = $1 ORDER BY us.proficiency DESC, s.name`, [s.userId]);
  return ok({ skills: rows });
});

// PUT { skills: [{skill_id, proficiency}] } — replaces the whole set.
// Upsert + delete-missing in one transaction; trg_user_skills_after_change
// then recomputes the balance score of any team the user is in.
export const PUT = handler(async (req) => {
  const s = await requireUser('participant');
  const { skills } = skillsSchema.parse(await readJson(req));
  await withTransaction(async (c) => {
    await c.query(
      'DELETE FROM user_skills WHERE user_id = $1 AND NOT (skill_id = ANY($2::int[]))',
      [s.userId, skills.map((x) => x.skill_id)]);
    for (const x of skills) {
      await c.query(
        `INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, skill_id) DO UPDATE SET proficiency = EXCLUDED.proficiency`,
        [s.userId, x.skill_id, x.proficiency]);
    }
  });
  refreshInBackground(refreshProfileEmbedding, s.userId);
  return ok({ ok: true });
});
