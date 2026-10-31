import { withTransaction } from '@/lib/db';
import { handler, ok, readJson, requireUser } from '@/lib/http';
import { scoreSchema } from '@/lib/validate';

// POST { submission_id, scores: { innovation, technical, design, impact, presentation } }
// All five criteria are written in one transaction (all or nothing).
// trg_scores_before_write checks the judge is assigned and the event is in judging.
export const POST = handler(async (req) => {
  const s = await requireUser('judge');
  const { submission_id, scores } = scoreSchema.parse(await readJson(req));
  await withTransaction(async (c) => {
    for (const [criterion, score] of Object.entries(scores)) {
      await c.query(
        `INSERT INTO scores (submission_id, judge_id, criterion, score) VALUES ($1, $2, $3, $4)
         ON CONFLICT (submission_id, judge_id, criterion)
         DO UPDATE SET score = EXCLUDED.score, scored_at = now()`,
        [submission_id, s.userId, criterion, score]);
    }
  });
  return ok({ ok: true });
});
