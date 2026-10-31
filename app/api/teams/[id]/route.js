import { query, one, withTransaction } from '@/lib/db';
import { handler, ok, readJson, requireUser, intParam, HttpError } from '@/lib/http';
import { teamUpdateSchema } from '@/lib/validate';
import { getSession } from '@/lib/auth';
import { profilesByUserIds } from '@/lib/mongo';
import { refreshInBackground, refreshTeamEmbedding } from '@/lib/embeddings';

export const GET = handler(async (req, { params }) => {
  const id = intParam((await params).id);
  const s = await getSession();
  const uid = s?.userId ?? 0;

  const team = await one(
    `SELECT v.*, v.balance_score::float AS balance_score, e.min_team_size, e.max_team_size
     FROM v_team_overview v JOIN events e ON e.event_id = v.event_id
     WHERE v.team_id = $1`, [id]);
  if (!team) throw new HttpError(404, 'Team not found');

  const members = query(
    `SELECT u.user_id, u.name, tm.joined_at, (u.user_id = $2) AS is_leader,
            COALESCE(json_agg(json_build_object('name', s.name, 'proficiency', us.proficiency, 'category', s.category)
                     ORDER BY us.proficiency DESC) FILTER (WHERE s.skill_id IS NOT NULL), '[]') AS skills
     FROM team_members tm JOIN users u ON u.user_id = tm.user_id
     LEFT JOIN user_skills us ON us.user_id = u.user_id
     LEFT JOIN skills s ON s.skill_id = us.skill_id
     WHERE tm.team_id = $1
     GROUP BY u.user_id, tm.joined_at ORDER BY (u.user_id = $2) DESC, tm.joined_at, u.user_id`, [id, team.leader_id]);

  // required skills + whether some member meets each one
  const required = query(
    `SELECT s.skill_id, s.name, s.category, trs.min_proficiency,
            EXISTS (SELECT 1 FROM team_members tm JOIN user_skills us ON us.user_id = tm.user_id
                    WHERE tm.team_id = trs.team_id AND us.skill_id = trs.skill_id
                      AND us.proficiency >= trs.min_proficiency) AS met
     FROM team_required_skills trs JOIN skills s ON s.skill_id = trs.skill_id
     WHERE trs.team_id = $1 ORDER BY met, s.name`, [id]);

  const submission = one('SELECT * FROM submissions WHERE team_id = $1', [id]);

  const me = one(
    `SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2) AS is_member,
            EXISTS (SELECT 1 FROM registrations WHERE event_id = $3 AND user_id = $2) AS is_registered,
            EXISTS (SELECT 1 FROM team_members WHERE event_id = $3 AND user_id = $2) AS has_team,
            (SELECT request_id FROM join_requests WHERE team_id = $1 AND user_id = $2 AND status = 'pending') AS pending_request_id`,
    [id, uid, team.event_id]);

  const [m, r, sub, mine] = await Promise.all([members, required, submission, me]);
  const isLeader = team.leader_id === uid;

  // leader sees incoming requests, ranked by how many unmet skills each applicant fills
  let requests = [];
  if (isLeader) {
    ({ rows: requests } = await query(
      `SELECT jr.request_id, jr.message, jr.created_at, u.user_id, u.name,
              fn_skill_gap_fill(jr.team_id, u.user_id) AS gaps_filled,
              ROUND((1 - (pe.embedding <=> te.embedding))::numeric, 3)::float AS similarity,
              COALESCE((SELECT json_agg(json_build_object('name', s.name, 'proficiency', us.proficiency)
                                        ORDER BY us.proficiency DESC)
                        FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
                        WHERE us.user_id = u.user_id), '[]') AS skills
       FROM join_requests jr
       JOIN users u ON u.user_id = jr.user_id
       LEFT JOIN profile_embeddings pe ON pe.user_id = u.user_id
       LEFT JOIN team_embeddings te    ON te.team_id = jr.team_id
       WHERE jr.team_id = $1 AND jr.status = 'pending'
       ORDER BY gaps_filled DESC, similarity DESC NULLS LAST, jr.created_at`, [id]));
  }

  let bios = {};
  try { bios = await profilesByUserIds([...m.rows, ...requests].map((x) => x.user_id)); } catch {}

  return ok({
    team,
    members: m.rows.map((x) => ({ ...x, bio: bios[x.user_id]?.bio ?? '', github: bios[x.user_id]?.github ?? '' })),
    required: r.rows,
    requests: requests.map((x) => ({ ...x, bio: bios[x.user_id]?.bio ?? '' })),
    submission: sub,
    me: { ...mine, is_leader: isLeader, logged_in: !!s, role: s?.role ?? null },
  });
});

async function assertLeader(teamId, userId) {
  const t = await one('SELECT leader_id FROM teams WHERE team_id = $1', [teamId]);
  if (!t) throw new HttpError(404, 'Team not found');
  if (t.leader_id !== userId) throw new HttpError(403, 'Only the team leader can do that');
}

// PATCH — leader edits pitch / capacity / required skills (one transaction)
export const PATCH = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  await assertLeader(id, s.userId);
  const u = teamUpdateSchema.parse(await readJson(req));

  await withTransaction(async (c) => {
    if (u.pitch !== undefined || u.capacity !== undefined) {
      await c.query(
        `UPDATE teams SET pitch = COALESCE($2, pitch), capacity = COALESCE($3, capacity)
         WHERE team_id = $1`, [id, u.pitch ?? null, u.capacity ?? null]);
    }
    if (u.required_skills) {
      await c.query('DELETE FROM team_required_skills WHERE team_id = $1', [id]);
      for (const r of u.required_skills) {
        await c.query(
          'INSERT INTO team_required_skills (team_id, skill_id, min_proficiency) VALUES ($1, $2, $3)',
          [id, r.skill_id, r.min_proficiency]);
      }
    }
  });
  refreshInBackground(refreshTeamEmbedding, id);
  return ok({ ok: true });
});

// DELETE — leader disbands the team (not allowed after submitting)
export const DELETE = handler(async (req, { params }) => {
  const s = await requireUser('participant');
  const id = intParam((await params).id);
  await assertLeader(id, s.userId);
  if (await one('SELECT 1 FROM submissions WHERE team_id = $1', [id])) {
    throw new HttpError(400, 'A team that has submitted cannot be disbanded');
  }
  await withTransaction(async (c) => {
    // members become free agents again (team_members rows cascade with the team)
    await c.query(
      `UPDATE registrations r SET looking_for_team = TRUE
       FROM team_members tm WHERE tm.team_id = $1 AND r.event_id = tm.event_id AND r.user_id = tm.user_id`, [id]);
    await c.query('DELETE FROM teams WHERE team_id = $1', [id]);
  });
  return ok({ ok: true });
});
