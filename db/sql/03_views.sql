-- =====================================================================
-- 03_views.sql — views used by the dashboards
-- =====================================================================

-- One row per team with everything the team cards need
CREATE OR REPLACE VIEW v_team_overview AS
SELECT
    t.team_id,
    t.event_id,
    e.title                                   AS event_title,
    e.status                                  AS event_status,
    t.team_name,
    t.pitch,
    t.leader_id,
    l.name                                    AS leader_name,
    t.capacity,
    COUNT(DISTINCT tm.user_id)::INT           AS member_count,
    (t.capacity - COUNT(DISTINCT tm.user_id))::INT AS slots_left,
    t.is_locked,
    t.balance_score,
    COALESCE(
        (SELECT string_agg(u.name, ', ' ORDER BY (tm2.user_id = t.leader_id) DESC, tm2.joined_at, tm2.user_id)
         FROM team_members tm2 JOIN users u ON u.user_id = tm2.user_id
         WHERE tm2.team_id = t.team_id), '')  AS members,
    COALESCE(
        (SELECT string_agg(s.name, ', ' ORDER BY s.name)
         FROM team_required_skills trs JOIN skills s ON s.skill_id = trs.skill_id
         WHERE trs.team_id = t.team_id), '')  AS required_skills,
    COALESCE(
        (SELECT string_agg(s.name, ', ' ORDER BY s.name)
         FROM team_required_skills trs JOIN skills s ON s.skill_id = trs.skill_id
         WHERE trs.team_id = t.team_id
           AND NOT EXISTS (SELECT 1 FROM team_members tm3
                           JOIN user_skills us ON us.user_id = tm3.user_id
                           WHERE tm3.team_id = t.team_id
                             AND us.skill_id = trs.skill_id
                             AND us.proficiency >= trs.min_proficiency)), '') AS missing_skills
FROM teams t
JOIN events e      ON e.event_id = t.event_id
JOIN users  l      ON l.user_id  = t.leader_id
LEFT JOIN team_members tm ON tm.team_id = t.team_id
GROUP BY t.team_id, e.event_id, l.user_id;

-- Teams a participant can still ask to join
CREATE OR REPLACE VIEW v_open_teams AS
SELECT * FROM v_team_overview
WHERE NOT is_locked AND slots_left > 0 AND event_status IN ('open', 'ongoing');

-- Organizer dashboard: one row per event
CREATE OR REPLACE VIEW v_event_dashboard AS
SELECT
    e.event_id,
    e.title,
    e.status,
    e.organizer_id,
    e.start_date,
    e.reg_deadline,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id)::INT                         AS registrations,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id AND r.looking_for_team)::INT  AS still_seeking,
    (SELECT COUNT(*) FROM teams t WHERE t.event_id = e.event_id)::INT                                 AS teams,
    (SELECT COUNT(*) FROM teams t WHERE t.event_id = e.event_id AND t.is_locked)::INT                 AS full_teams,
    (SELECT ROUND(AVG(t.balance_score), 1) FROM teams t WHERE t.event_id = e.event_id)               AS avg_balance,
    (SELECT COUNT(*) FROM submissions s JOIN teams t ON t.team_id = s.team_id
      WHERE t.event_id = e.event_id)::INT                                                             AS submissions,
    (SELECT COUNT(*) FROM join_requests jr JOIN teams t ON t.team_id = jr.team_id
      WHERE t.event_id = e.event_id AND jr.status = 'pending')::INT                                   AS pending_requests
FROM events e;

-- Judging leaderboard with RANK() per event
CREATE OR REPLACE VIEW v_leaderboard AS
SELECT
    t.event_id,
    s.submission_id,
    t.team_id,
    t.team_name,
    s.project_title,
    s.repo_url,
    COUNT(DISTINCT sc.judge_id)::INT          AS judges_scored,
    ROUND(AVG(sc.score), 2)                   AS avg_score,
    ROUND(AVG(sc.score) FILTER (WHERE sc.criterion = 'innovation'), 2) AS innovation,
    ROUND(AVG(sc.score) FILTER (WHERE sc.criterion = 'technical'), 2)  AS technical,
    ROUND(AVG(sc.score) FILTER (WHERE sc.criterion = 'impact'), 2)     AS impact,
    RANK() OVER (PARTITION BY t.event_id ORDER BY AVG(sc.score) DESC NULLS LAST) AS rank
FROM submissions s
JOIN teams t ON t.team_id = s.team_id
LEFT JOIN scores sc ON sc.submission_id = s.submission_id
GROUP BY t.event_id, s.submission_id, t.team_id;

-- Skill demand vs supply per event (what teams need vs who is still free).
-- Materialised because it's an expensive cross-aggregate; refreshed on demand.
CREATE MATERIALIZED VIEW mv_skill_demand AS
SELECT
    e.event_id,
    s.skill_id,
    s.name      AS skill,
    s.category,
    COUNT(DISTINCT trs.team_id)                                  AS teams_needing,
    COUNT(DISTINCT us.user_id) FILTER (WHERE us.proficiency >= 3) AS free_participants_with_skill
FROM events e
CROSS JOIN skills s
LEFT JOIN teams t                 ON t.event_id = e.event_id AND NOT t.is_locked
LEFT JOIN team_required_skills trs ON trs.team_id = t.team_id AND trs.skill_id = s.skill_id
LEFT JOIN registrations r          ON r.event_id = e.event_id AND r.looking_for_team
LEFT JOIN user_skills us           ON us.user_id = r.user_id AND us.skill_id = s.skill_id
GROUP BY e.event_id, s.skill_id
HAVING COUNT(DISTINCT trs.team_id) > 0 OR COUNT(DISTINCT us.user_id) > 0;

CREATE UNIQUE INDEX idx_mv_skill_demand ON mv_skill_demand (event_id, skill_id);  -- allows REFRESH ... CONCURRENTLY
