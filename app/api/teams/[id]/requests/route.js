import { one } from '@/lib/db';
import { handler, ok, readJson, requireUser, intParam } from '@/lib/http';
import { joinRequestSchema } from '@/lib/validate';

// POST /api/teams/:id/requests  { message }
// trg_join_requests_before_insert rejects: locked team, not registered, already in a team.
// uq_pending_request rejects a second pending request to the same team.
export const POST = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const teamId = intParam((await params).id);
  const { message } = joinRequestSchema.parse(await readJson(req));
  const request = await one(
    `INSERT INTO join_requests (team_id, user_id, message) VALUES ($1, $2, $3)
     RETURNING request_id, status, created_at`, [teamId, s.userId, message]);
  return ok({ request }, 201);
});
