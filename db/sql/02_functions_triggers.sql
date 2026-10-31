-- =====================================================================
-- 02_functions_triggers.sql — stored functions, procedures, triggers
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: role check used by several triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assert_role(p_user_id INT, p_role TEXT, p_context TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM users WHERE user_id = p_user_id;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'User % does not exist', p_user_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_role <> p_role THEN
        RAISE EXCEPTION '% requires role %, but user % is %', p_context, p_role, p_user_id, v_role
            USING ERRCODE = 'check_violation';
    END IF;
END $$;

-- =====================================================================
-- STORED FUNCTION: team balance score (0–100)
--   coverage  (50%) : share of the team's required skills that at least one
--                     member meets at >= min_proficiency
--   diversity (30%) : distinct skill categories among members / 5, capped at 1
--   fill      (20%) : members / capacity
--   If a team has listed no required skills, coverage falls back to the
--   members' average top proficiency / 5.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_team_balance_score(p_team_id INT)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_required   INT;
    v_covered    INT;
    v_coverage   NUMERIC;
    v_categories INT;
    v_members    INT;
    v_capacity   INT;
BEGIN
    SELECT capacity INTO v_capacity FROM teams WHERE team_id = p_team_id;
    IF v_capacity IS NULL THEN RETURN 0; END IF;

    SELECT COUNT(*) INTO v_members FROM team_members WHERE team_id = p_team_id;
    IF v_members = 0 THEN RETURN 0; END IF;

    SELECT COUNT(*) INTO v_required FROM team_required_skills WHERE team_id = p_team_id;

    IF v_required > 0 THEN
        SELECT COUNT(*) INTO v_covered
        FROM team_required_skills trs
        WHERE trs.team_id = p_team_id
          AND EXISTS (
                SELECT 1
                FROM team_members tm
                JOIN user_skills us ON us.user_id = tm.user_id
                WHERE tm.team_id   = p_team_id
                  AND us.skill_id  = trs.skill_id
                  AND us.proficiency >= trs.min_proficiency);
        v_coverage := v_covered::NUMERIC / v_required;
    ELSE
        SELECT COALESCE(AVG(top_prof), 0) / 5.0 INTO v_coverage
        FROM (SELECT MAX(us.proficiency) AS top_prof
              FROM team_members tm JOIN user_skills us ON us.user_id = tm.user_id
              WHERE tm.team_id = p_team_id
              GROUP BY tm.user_id) t;
    END IF;

    SELECT COUNT(DISTINCT s.category) INTO v_categories
    FROM team_members tm
    JOIN user_skills us ON us.user_id = tm.user_id AND us.proficiency >= 3
    JOIN skills s       ON s.skill_id = us.skill_id
    WHERE tm.team_id = p_team_id;

    RETURN ROUND(100 * (
              0.5 * v_coverage
            + 0.3 * LEAST(v_categories / 5.0, 1)
            + 0.2 * LEAST(v_members::NUMERIC / v_capacity, 1)), 2);
END $$;

-- STORED PROCEDURE: recompute and persist one team's balance score
CREATE OR REPLACE PROCEDURE sp_refresh_team_balance(p_team_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE teams SET balance_score = fn_team_balance_score(p_team_id)
    WHERE team_id = p_team_id;
END $$;

-- =====================================================================
-- STORED FUNCTION: "what-if" score — how would the balance change if
-- candidate p_user_id joined p_team_id? Used to rank join requests.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_skill_gap_fill(p_team_id INT, p_user_id INT)
RETURNS INT LANGUAGE sql STABLE AS $$
    -- number of required skills that are currently UNMET and that this
    -- candidate would meet
    SELECT COUNT(*)::INT
    FROM team_required_skills trs
    JOIN user_skills us ON us.skill_id = trs.skill_id
                       AND us.user_id  = p_user_id
                       AND us.proficiency >= trs.min_proficiency
    WHERE trs.team_id = p_team_id
      AND NOT EXISTS (
            SELECT 1 FROM team_members tm
            JOIN user_skills us2 ON us2.user_id = tm.user_id
            WHERE tm.team_id = p_team_id
              AND us2.skill_id = trs.skill_id
              AND us2.proficiency >= trs.min_proficiency);
$$;

-- =====================================================================
-- STORED PROCEDURE: create a team AND make the creator its first member,
-- atomically (CALL runs inside the caller's transaction).
-- =====================================================================
CREATE OR REPLACE PROCEDURE sp_create_team(
    p_event_id  INT,
    p_leader_id INT,
    p_name      TEXT,
    p_pitch     TEXT,
    p_capacity  INT,
    INOUT p_team_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO teams (event_id, leader_id, team_name, pitch, capacity)
    VALUES (p_event_id, p_leader_id, p_name, COALESCE(p_pitch, ''), p_capacity)
    RETURNING team_id INTO p_team_id;

    INSERT INTO team_members (team_id, user_id, event_id)
    VALUES (p_team_id, p_leader_id, p_event_id);

    -- creator's other pending requests in this event are withdrawn
    UPDATE join_requests jr
    SET status = 'withdrawn', responded_at = now()
    FROM teams t
    WHERE jr.team_id = t.team_id AND t.event_id = p_event_id
      AND jr.user_id = p_leader_id AND jr.status = 'pending';
END $$;

-- =====================================================================
-- STORED FUNCTION: accept a join request.
--   All steps run in ONE transaction (the caller wraps it in BEGIN/COMMIT;
--   any RAISE rolls everything back).  Row locks prevent two leaders
--   accepting the last free slot simultaneously.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_accept_join_request(p_request_id INT, p_actor_id INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    r  join_requests%ROWTYPE;
    t  teams%ROWTYPE;
BEGIN
    SELECT * INTO r FROM join_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Join request % not found', p_request_id; END IF;
    IF r.status <> 'pending' THEN
        RAISE EXCEPTION 'Request is already %', r.status USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO t FROM teams WHERE team_id = r.team_id FOR UPDATE;   -- serialises on the team row
    IF t.leader_id <> p_actor_id THEN
        RAISE EXCEPTION 'Only the team leader can accept requests' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE join_requests SET status = 'accepted', responded_at = now()
    WHERE request_id = p_request_id;

    -- capacity / lock checks fire here (trg_team_members_before_insert)
    INSERT INTO team_members (team_id, user_id, event_id)
    VALUES (r.team_id, r.user_id, t.event_id);

    -- the user's other pending requests in the same event are auto-rejected
    UPDATE join_requests jr
    SET status = 'rejected', responded_at = now()
    FROM teams t2
    WHERE jr.team_id = t2.team_id AND t2.event_id = t.event_id
      AND jr.user_id = r.user_id AND jr.status = 'pending';

    RETURN r.team_id;
END $$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- T1. events.organizer must be an organizer
CREATE OR REPLACE FUNCTION trg_events_check_organizer() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_assert_role(NEW.organizer_id, 'organizer', 'Creating an event');
    RETURN NEW;
END $$;
CREATE TRIGGER trg_events_organizer
BEFORE INSERT OR UPDATE OF organizer_id ON events
FOR EACH ROW EXECUTE FUNCTION trg_events_check_organizer();

-- T2. registrations: participant only, event must be open, before deadline
CREATE OR REPLACE FUNCTION trg_registrations_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE e events%ROWTYPE;
BEGIN
    PERFORM fn_assert_role(NEW.user_id, 'participant', 'Registering for an event');
    SELECT * INTO e FROM events WHERE event_id = NEW.event_id;
    -- seed scripts may load historical data by setting app.bypass_deadline = 'on'
    IF COALESCE(current_setting('app.bypass_deadline', true), 'off') <> 'on' THEN
        IF e.status <> 'open' THEN
            RAISE EXCEPTION 'Event "%" is not open for registration (status: %)', e.title, e.status
                USING ERRCODE = 'check_violation';
        END IF;
        IF CURRENT_DATE > e.reg_deadline THEN
            RAISE EXCEPTION 'Registration for "%" closed on %', e.title, e.reg_deadline
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_registrations_before_insert
BEFORE INSERT ON registrations
FOR EACH ROW EXECUTE FUNCTION trg_registrations_check();

-- T3. teams: capacity within event's min/max, leader must be a registered participant
CREATE OR REPLACE FUNCTION trg_teams_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE e events%ROWTYPE; v_members INT;
BEGIN
    SELECT * INTO e FROM events WHERE event_id = NEW.event_id;
    IF NEW.capacity < e.min_team_size OR NEW.capacity > e.max_team_size THEN
        RAISE EXCEPTION 'Team capacity % must be between % and % for this event',
            NEW.capacity, e.min_team_size, e.max_team_size USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        SELECT COUNT(*) INTO v_members FROM team_members WHERE team_id = NEW.team_id;
        IF NEW.capacity < v_members THEN
            RAISE EXCEPTION 'Capacity cannot drop below current member count (%)', v_members
                USING ERRCODE = 'check_violation';
        END IF;
        -- keep lock flag consistent with the new capacity
        NEW.is_locked := v_members >= NEW.capacity;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM registrations WHERE event_id = NEW.event_id AND user_id = NEW.leader_id) THEN
        RAISE EXCEPTION 'Team leader must be registered for the event' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_teams_before_write
BEFORE INSERT OR UPDATE OF capacity, leader_id ON teams
FOR EACH ROW EXECUTE FUNCTION trg_teams_check();

-- T4. team_members BEFORE INSERT: reject if team locked / full
CREATE OR REPLACE FUNCTION trg_team_members_capacity() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE t teams%ROWTYPE; v_members INT;
BEGIN
    SELECT * INTO t FROM teams WHERE team_id = NEW.team_id FOR UPDATE;
    SELECT COUNT(*) INTO v_members FROM team_members WHERE team_id = NEW.team_id;
    IF t.is_locked OR v_members >= t.capacity THEN
        RAISE EXCEPTION 'Team "%" is full (%/%)', t.team_name, v_members, t.capacity
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_team_members_before_insert
BEFORE INSERT ON team_members
FOR EACH ROW EXECUTE FUNCTION trg_team_members_capacity();

-- T5. team_members AFTER INSERT/DELETE: auto-lock/unlock, update
--     looking_for_team flag, refresh balance score
CREATE OR REPLACE FUNCTION trg_team_members_after_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_team INT; v_event INT; v_user INT; v_members INT; v_capacity INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_team := NEW.team_id; v_event := NEW.event_id; v_user := NEW.user_id;
    ELSE
        v_team := OLD.team_id; v_event := OLD.event_id; v_user := OLD.user_id;
    END IF;

    UPDATE registrations SET looking_for_team = (TG_OP = 'DELETE')
    WHERE event_id = v_event AND user_id = v_user;

    SELECT capacity INTO v_capacity FROM teams WHERE team_id = v_team;
    IF v_capacity IS NULL THEN RETURN NULL; END IF;          -- team itself is being deleted

    SELECT COUNT(*) INTO v_members FROM team_members WHERE team_id = v_team;

    UPDATE teams SET is_locked = (v_members >= v_capacity),
                     balance_score = fn_team_balance_score(v_team)
    WHERE team_id = v_team;

    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('team_members', TG_OP, v_team,
            jsonb_build_object('user_id', v_user, 'members', v_members, 'capacity', v_capacity,
                               'locked', v_members >= v_capacity));
    RETURN NULL;
END $$;
CREATE TRIGGER trg_team_members_after_change
AFTER INSERT OR DELETE ON team_members
FOR EACH ROW EXECUTE FUNCTION trg_team_members_after_change();

-- T6. required-skill changes also change the balance score
CREATE OR REPLACE FUNCTION trg_required_skills_refresh() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE teams SET balance_score = fn_team_balance_score(team_id)
    WHERE team_id = COALESCE(NEW.team_id, OLD.team_id);
    RETURN NULL;
END $$;
CREATE TRIGGER trg_required_skills_after_change
AFTER INSERT OR UPDATE OR DELETE ON team_required_skills
FOR EACH ROW EXECUTE FUNCTION trg_required_skills_refresh();

-- T7. a member editing their skills changes their team(s)' balance
CREATE OR REPLACE FUNCTION trg_user_skills_refresh() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE teams t SET balance_score = fn_team_balance_score(t.team_id)
    FROM team_members tm
    WHERE tm.team_id = t.team_id AND tm.user_id = COALESCE(NEW.user_id, OLD.user_id);
    RETURN NULL;
END $$;
CREATE TRIGGER trg_user_skills_after_change
AFTER INSERT OR UPDATE OR DELETE ON user_skills
FOR EACH ROW EXECUTE FUNCTION trg_user_skills_refresh();

-- T8. join_requests BEFORE INSERT: requester must be a registered participant
--     with no team yet in that event, and the team must have room
CREATE OR REPLACE FUNCTION trg_join_requests_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE t teams%ROWTYPE;
BEGIN
    PERFORM fn_assert_role(NEW.user_id, 'participant', 'Requesting to join a team');
    SELECT * INTO t FROM teams WHERE team_id = NEW.team_id;
    IF t.is_locked THEN
        RAISE EXCEPTION 'Team "%" is full and locked', t.team_name USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM registrations WHERE event_id = t.event_id AND user_id = NEW.user_id) THEN
        RAISE EXCEPTION 'Register for the event before requesting to join a team' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM team_members WHERE event_id = t.event_id AND user_id = NEW.user_id) THEN
        RAISE EXCEPTION 'You are already in a team for this event' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_join_requests_before_insert
BEFORE INSERT ON join_requests
FOR EACH ROW EXECUTE FUNCTION trg_join_requests_check();

-- T9. audit every join-request status change
CREATE OR REPLACE FUNCTION trg_join_requests_audit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('join_requests', 'status:' || OLD.status || '->' || NEW.status, NEW.request_id,
            jsonb_build_object('team_id', NEW.team_id, 'user_id', NEW.user_id));
    RETURN NULL;
END $$;
CREATE TRIGGER trg_join_requests_after_status
AFTER UPDATE OF status ON join_requests
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION trg_join_requests_audit();

-- T10. judges: role check on assignment
CREATE OR REPLACE FUNCTION trg_event_judges_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_assert_role(NEW.judge_id, 'judge', 'Judging an event');
    RETURN NEW;
END $$;
CREATE TRIGGER trg_event_judges_before_insert
BEFORE INSERT ON event_judges
FOR EACH ROW EXECUTE FUNCTION trg_event_judges_check();

-- T11. scores: judge must be assigned to the submission's event,
--      and the event must be in judging (or completed, for history)
CREATE OR REPLACE FUNCTION trg_scores_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_event INT; v_status TEXT;
BEGIN
    SELECT t.event_id, e.status INTO v_event, v_status
    FROM submissions s JOIN teams t ON t.team_id = s.team_id
    JOIN events e ON e.event_id = t.event_id
    WHERE s.submission_id = NEW.submission_id;

    IF NOT EXISTS (SELECT 1 FROM event_judges WHERE event_id = v_event AND judge_id = NEW.judge_id) THEN
        RAISE EXCEPTION 'Judge % is not assigned to this event', NEW.judge_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_status NOT IN ('judging', 'completed') THEN
        RAISE EXCEPTION 'Scoring is only allowed while the event is in judging' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_scores_before_write
BEFORE INSERT OR UPDATE ON scores
FOR EACH ROW EXECUTE FUNCTION trg_scores_check();

-- T12. submissions: only while the event is ongoing (or later, for seed history)
CREATE OR REPLACE FUNCTION trg_submissions_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
    SELECT e.status INTO v_status FROM teams t JOIN events e ON e.event_id = t.event_id
    WHERE t.team_id = NEW.team_id;
    IF v_status NOT IN ('ongoing', 'judging', 'completed') THEN
        RAISE EXCEPTION 'Submissions open once the event is ongoing (current: %)', v_status
            USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(current_setting('app.bypass_deadline', true), 'off') <> 'on'
       AND v_status <> 'ongoing' THEN
        RAISE EXCEPTION 'Submissions are closed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_submissions_before_write
BEFORE INSERT OR UPDATE ON submissions
FOR EACH ROW EXECUTE FUNCTION trg_submissions_check();
