-- =====================================================================
-- 05_queries.sql — important queries (each one is used by the app;
-- the API route that runs it is noted above it)
-- Run after seeding.  :'name' placeholders are psql variables.
-- =====================================================================
\set event_id 1
\set user_id 10
\set team_id 1

-- ---------------------------------------------------------------
-- Q1  JOIN + ORDER BY          GET /api/teams?eventId=
--     Open teams in an event, best-balanced first
-- ---------------------------------------------------------------
SELECT team_id, team_name, leader_name, member_count || '/' || capacity AS size,
       balance_score, missing_skills
FROM v_open_teams
WHERE event_id = :event_id
ORDER BY balance_score DESC, slots_left DESC;

-- ---------------------------------------------------------------
-- Q2  Multi-join + aggregate + GROUP BY + HAVING   GET /api/matching/rule
--     Teams in this event that need >= 1 skill this user has at the
--     required level, ranked by how many gaps the user fills.
-- ---------------------------------------------------------------
SELECT t.team_id, t.team_name,
       COUNT(*)                                        AS skills_matched,
       string_agg(s.name, ', ' ORDER BY s.name)        AS matched_skills,
       fn_skill_gap_fill(t.team_id, :user_id)          AS gaps_filled
FROM teams t
JOIN team_required_skills trs ON trs.team_id = t.team_id
JOIN user_skills us           ON us.skill_id = trs.skill_id
                             AND us.user_id  = :user_id
                             AND us.proficiency >= trs.min_proficiency
JOIN skills s                 ON s.skill_id = trs.skill_id
WHERE t.event_id = :event_id AND NOT t.is_locked
GROUP BY t.team_id
HAVING COUNT(*) >= 1
ORDER BY gaps_filled DESC, skills_matched DESC;

-- ---------------------------------------------------------------
-- Q3  Correlated subquery + NOT EXISTS        GET /api/events/[id]/participants
--     Free agents who have a skill that NO current team member has
-- ---------------------------------------------------------------
SELECT u.user_id, u.name,
       (SELECT string_agg(s.name || ' (' || us.proficiency || ')', ', ' ORDER BY us.proficiency DESC)
        FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
        WHERE us.user_id = u.user_id) AS skills
FROM registrations r
JOIN users u ON u.user_id = r.user_id
WHERE r.event_id = :event_id AND r.looking_for_team
  AND EXISTS (
        SELECT 1 FROM user_skills us
        WHERE us.user_id = u.user_id AND us.proficiency >= 3
          AND NOT EXISTS (SELECT 1 FROM team_members tm
                          JOIN user_skills us2 ON us2.user_id = tm.user_id
                          WHERE tm.event_id = :event_id AND us2.skill_id = us.skill_id))
ORDER BY u.name;

-- ---------------------------------------------------------------
-- Q4  CTE + window function                 GET /api/events/[id]/stats
--     Skill category distribution among registered participants
-- ---------------------------------------------------------------
WITH cat AS (
    SELECT s.category, COUNT(DISTINCT us.user_id) AS people
    FROM registrations r
    JOIN user_skills us ON us.user_id = r.user_id AND us.proficiency >= 3
    JOIN skills s       ON s.skill_id = us.skill_id
    WHERE r.event_id = :event_id
    GROUP BY s.category
)
SELECT category, people,
       ROUND(100.0 * people / SUM(people) OVER (), 1) AS pct,
       RANK() OVER (ORDER BY people DESC)             AS rnk
FROM cat
ORDER BY rnk;

-- ---------------------------------------------------------------
-- Q5  Full-text search with ranking          GET /api/events?q=
-- ---------------------------------------------------------------
SELECT event_id, title, status,
       ts_rank(search_tsv, websearch_to_tsquery('english', 'flood climate')) AS rank,
       ts_headline('english', description, websearch_to_tsquery('english', 'flood climate'),
                   'MaxWords=18, MinWords=8') AS snippet
FROM events
WHERE search_tsv @@ websearch_to_tsquery('english', 'flood climate')
ORDER BY rank DESC;

-- ---------------------------------------------------------------
-- Q6  Vector similarity search (pgvector, cosine distance <=>)
--     GET /api/matching/semantic?teamId=
--     Participants whose profile embedding is closest to the team's
--     "looking for" embedding, restricted to free agents of the event.
--     Final score blends semantic similarity with hard skill coverage.
-- ---------------------------------------------------------------
WITH q AS (SELECT embedding FROM team_embeddings WHERE team_id = :team_id),
cand AS (
    SELECT pe.user_id, 1 - (pe.embedding <=> q.embedding) AS similarity
    FROM profile_embeddings pe, q
    JOIN teams t ON t.team_id = :team_id
    WHERE pe.user_id IN (SELECT user_id FROM registrations
                         WHERE event_id = t.event_id AND looking_for_team)
    ORDER BY pe.embedding <=> q.embedding
    LIMIT 20
)
SELECT u.user_id, u.name,
       ROUND(c.similarity::numeric, 3)                       AS semantic,
       fn_skill_gap_fill(:team_id, u.user_id)                AS gaps_filled,
       ROUND((0.6 * c.similarity + 0.4 * LEAST(fn_skill_gap_fill(:team_id, u.user_id), 3) / 3.0)::numeric, 3) AS match_score
FROM cand c JOIN users u ON u.user_id = c.user_id
ORDER BY match_score DESC
LIMIT 10;

-- ---------------------------------------------------------------
-- Q7  Leaderboard (view with RANK + FILTER)  GET /api/events/[id]/leaderboard
-- ---------------------------------------------------------------
SELECT rank, team_name, project_title, avg_score, innovation, technical, impact
FROM v_leaderboard WHERE event_id = 3 ORDER BY rank;

-- ---------------------------------------------------------------
-- Q8  Judge progress: submissions a judge has not finished scoring
--     (LEFT JOIN + GROUP BY + HAVING)       GET /api/judge/queue
-- ---------------------------------------------------------------
SELECT s.submission_id, t.team_name, s.project_title,
       COUNT(sc.criterion) AS criteria_scored
FROM event_judges ej
JOIN teams t        ON t.event_id = ej.event_id
JOIN submissions s  ON s.team_id  = t.team_id
LEFT JOIN scores sc ON sc.submission_id = s.submission_id AND sc.judge_id = ej.judge_id
WHERE ej.judge_id = 3
GROUP BY s.submission_id, t.team_name
HAVING COUNT(sc.criterion) < 5
ORDER BY t.team_name;

-- ---------------------------------------------------------------
-- DML examples (all issued by the API with parameterised queries)
-- ---------------------------------------------------------------
-- INSERT  POST /api/events/[id]/register
--   INSERT INTO registrations (event_id, user_id) VALUES ($1, $2);
-- INSERT  POST /api/teams/[id]/requests
--   INSERT INTO join_requests (team_id, user_id, message) VALUES ($1, $2, $3);
-- UPDATE  PATCH /api/me/skills
--   INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1,$2,$3)
--   ON CONFLICT (user_id, skill_id) DO UPDATE SET proficiency = EXCLUDED.proficiency;
-- UPDATE  POST /api/requests/[id]/reject
--   UPDATE join_requests SET status = 'rejected', responded_at = now()
--   WHERE request_id = $1 AND status = 'pending'
--     AND team_id IN (SELECT team_id FROM teams WHERE leader_id = $2);
-- DELETE  DELETE /api/teams/[id]/members/me   (leave a team)
--   DELETE FROM team_members WHERE team_id = $1 AND user_id = $2;
-- TRANSACTION  POST /api/requests/[id]/accept
--   BEGIN; SELECT fn_accept_join_request($1, $2); COMMIT;   (ROLLBACK on any error)
