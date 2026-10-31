-- =====================================================================
-- 99_teardown.sql — DROP everything (reverse dependency order)
-- =====================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_skill_demand;
DROP VIEW IF EXISTS v_leaderboard, v_event_dashboard, v_open_teams, v_team_overview;

DROP TABLE IF EXISTS
    audit_log, team_embeddings, profile_embeddings, scores, submissions,
    event_judges, join_requests, team_required_skills, team_members,
    teams, registrations, user_skills, skills, events, users
CASCADE;

DROP FUNCTION IF EXISTS
    fn_assert_role(INT, TEXT, TEXT), fn_team_balance_score(INT), fn_skill_gap_fill(INT, INT),
    fn_accept_join_request(INT, INT),
    trg_events_check_organizer(), trg_registrations_check(), trg_teams_check(),
    trg_team_members_capacity(), trg_team_members_after_change(), trg_required_skills_refresh(),
    trg_user_skills_refresh(), trg_join_requests_check(), trg_join_requests_audit(),
    trg_event_judges_check(), trg_scores_check(), trg_submissions_check();

DROP PROCEDURE IF EXISTS sp_refresh_team_balance(INT), sp_create_team(INT, INT, TEXT, TEXT, INT, INT);
