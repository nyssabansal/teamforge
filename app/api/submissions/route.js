import { one } from '@/lib/db';
import { handler, ok, readJson, requireUser, HttpError } from '@/lib/http';
import { submissionSchema } from '@/lib/validate';

// POST — team leader submits once (UNIQUE team_id); allowed only while the
// event is ongoing (trg_submissions_before_write).
export const POST = handler(async (req) => {
  const s = await requireUser('participant');
  const x = submissionSchema.parse(await readJson(req));
  const t = await one('SELECT leader_id FROM teams WHERE team_id = $1', [x.team_id]);
  if (!t) throw new HttpError(404, 'Team not found');
  if (t.leader_id !== s.userId) throw new HttpError(403, 'Only the team leader can submit');
  const submission = await one(
    `INSERT INTO submissions (team_id, project_title, summary, repo_url)
     VALUES ($1, $2, $3, $4) RETURNING *`, [x.team_id, x.project_title, x.summary, x.repo_url]);
  return ok({ submission }, 201);
});
