-- =====================================================================
-- integrity_tests.sql — database-level test suite
-- Each test either expects a rule to REJECT bad data, or checks that a
-- trigger/procedure produced the right side effect.
-- Run on a freshly seeded DB:   psql -f db/tests/integrity_tests.sql
-- Everything runs in one transaction that is rolled back at the end.
-- =====================================================================
\set QUIET on
\pset format unaligned
\pset tuples_only on
BEGIN;

CREATE TEMP TABLE test_results (n SERIAL, test TEXT, result TEXT, detail TEXT);

-- expect the statement to fail
-- p_expect: a substring the error message must contain, so a test can't
-- "pass" because some unrelated constraint happened to fire first
CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_test TEXT, p_expect TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        INSERT INTO test_results (test, result, detail) VALUES (p_test, 'FAIL', 'statement succeeded');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results (test, result, detail)
        VALUES (p_test, CASE WHEN SQLERRM ILIKE '%' || p_expect || '%' THEN 'PASS' ELSE 'FAIL' END, SQLERRM);
    END;
END $$;

-- expect a boolean query to be true
CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_test TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE ok BOOLEAN;
BEGIN
    EXECUTE p_sql INTO ok;
    INSERT INTO test_results (test, result, detail)
    VALUES (p_test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, p_sql);
EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results (test, result, detail) VALUES (p_test, 'FAIL', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.u(h TEXT) RETURNS INT LANGUAGE sql AS
$$ SELECT user_id FROM users WHERE email = h || '@teamforge.dev' $$;
CREATE OR REPLACE FUNCTION pg_temp.t(n TEXT) RETURNS INT LANGUAGE sql AS
$$ SELECT team_id FROM teams WHERE team_name = n $$;

-- ------------------------------------------------------------------ constraints
SELECT pg_temp.expect_error('C1 duplicate email (case-insensitive)', 'users_email_key',
  $q$INSERT INTO users (name,email,password_hash,role) VALUES ('Xavier','AARAV@teamforge.dev','$2b$10$abc','participant')$q$);
SELECT pg_temp.expect_error('C2 invalid email format', 'users_email_check',
  $q$INSERT INTO users (name,email,password_hash,role) VALUES ('Xavier','not-an-email','$2b$10$abc','participant')$q$);
SELECT pg_temp.expect_error('C3 plain-text password rejected', 'users_password_hash_check',
  $q$INSERT INTO users (name,email,password_hash,role) VALUES ('Xavier','x@y.com','hunter2','participant')$q$);
SELECT pg_temp.expect_error('C4 unknown role rejected', 'users_role_check',
  $q$INSERT INTO users (name,email,password_hash,role) VALUES ('Xavier','x@y.com','$2b$10$abc','admin')$q$);
SELECT pg_temp.expect_error('C5 proficiency out of range', 'user_skills_proficiency_check',
  $q$INSERT INTO user_skills VALUES (pg_temp.u('aarav'), 7, 9)$q$);
SELECT pg_temp.expect_error('C6 event end before start', 'chk_event_dates',
  $q$INSERT INTO events (organizer_id,title,start_date,end_date,reg_deadline) VALUES (pg_temp.u('ananya'),'Bad','2027-02-02','2027-02-01','2027-01-01')$q$);
SELECT pg_temp.expect_error('C7 max team size < min', 'chk_team_sizes',
  $q$INSERT INTO events (organizer_id,title,start_date,end_date,reg_deadline,min_team_size,max_team_size) VALUES (pg_temp.u('ananya'),'Bad2','2027-02-02','2027-02-03','2027-01-01',4,2)$q$);
SELECT pg_temp.expect_error('C8 duplicate registration', 'uq_registration',
  $q$INSERT INTO registrations (event_id,user_id) VALUES (1, pg_temp.u('aarav'))$q$);
SELECT pg_temp.expect_error('C9 score above 10', 'scores_score_check',
  $q$UPDATE scores SET score = 11 WHERE judge_id = pg_temp.u('meera') AND criterion = 'design' AND submission_id = 1$q$);
SELECT set_config('app.bypass_deadline', 'on', true);
SELECT pg_temp.expect_error('C10 second submission for same team', 'submissions_team_id_key',
  $q$INSERT INTO submissions (team_id,project_title,repo_url) VALUES (pg_temp.t('Vault Six'),'Dup','https://x.y')$q$);
SELECT set_config('app.bypass_deadline', 'off', true);
SELECT pg_temp.expect_error('C11 duplicate pending join request', 'uq_pending_request',
  $q$INSERT INTO join_requests (team_id,user_id) VALUES (pg_temp.t('Rainmakers'), pg_temp.u('mahi'))$q$);
SELECT pg_temp.expect_error('C12 member must be registered for the event (composite FK)', 'fk_tm_registration',
  $q$INSERT INTO team_members (team_id,user_id,event_id) VALUES (pg_temp.t('Puddle Pixels'), pg_temp.u('ishita'), 1)$q$);
SELECT pg_temp.expect_error('C13 member row event_id must match team (composite FK)', 'fk_tm_team',
  $q$INSERT INTO team_members (team_id,user_id,event_id) VALUES (pg_temp.t('Puddle Pixels'), pg_temp.u('aarav'), 2)$q$);
SELECT pg_temp.expect_error('C14 one team per user per event', 'uq_one_team_per_event',
  $q$INSERT INTO team_members (team_id,user_id,event_id) VALUES (pg_temp.t('Puddle Pixels'), pg_temp.u('myra'), 1)$q$);

-- ------------------------------------------------------------------ role triggers
SELECT pg_temp.expect_error('R1 participant cannot organize an event', 'requires role organizer',
  $q$INSERT INTO events (organizer_id,title,start_date,end_date,reg_deadline) VALUES (pg_temp.u('aarav'),'Mine','2027-03-02','2027-03-03','2027-03-01')$q$);
SELECT pg_temp.expect_error('R2 judge cannot register as participant', 'requires role participant',
  $q$INSERT INTO registrations (event_id,user_id) VALUES (1, pg_temp.u('meera'))$q$);
SELECT pg_temp.expect_error('R3 participant cannot be assigned as judge', 'requires role judge',
  $q$INSERT INTO event_judges VALUES (1, pg_temp.u('aarav'))$q$);
INSERT INTO users (name,email,password_hash,role) VALUES ('Unassigned Judge','tempjudge@teamforge.dev','$2b$10$abc','judge');
SELECT pg_temp.expect_error('R4 judge not assigned to event cannot score', 'is not assigned to this event',
  $q$INSERT INTO scores VALUES (1, pg_temp.u('tempjudge'), 'impact', 5)$q$);

-- ------------------------------------------------------------------ business-rule triggers
SELECT pg_temp.expect_error('B1 cannot register for a draft event', 'not open for registration',
  $q$INSERT INTO registrations (event_id,user_id) VALUES (4, pg_temp.u('aarav'))$q$);
SELECT pg_temp.expect_error('B2 cannot register for a completed event', 'not open for registration',
  $q$INSERT INTO registrations (event_id,user_id) VALUES (3, pg_temp.u('mahi'))$q$);
SELECT pg_temp.expect_error('B3 team capacity above event max', 'must be between',
  $q$INSERT INTO teams (event_id,leader_id,team_name,capacity) VALUES (2, pg_temp.u('pari'),'Too Big',5)$q$);
SELECT pg_temp.expect_error('B4 team leader must be registered', 'leader must be registered',
  $q$INSERT INTO teams (event_id,leader_id,team_name,capacity) VALUES (1, pg_temp.u('ishita'),'Ghost',3)$q$);
SELECT pg_temp.expect_error('B5 cannot join a full / locked team', 'full and locked',
  $q$INSERT INTO join_requests (team_id,user_id) VALUES (pg_temp.t('Drain Gang'), pg_temp.u('om'))$q$);
SELECT pg_temp.expect_error('B6 cannot request while already in a team for that event', 'already in a team',
  $q$INSERT INTO join_requests (team_id,user_id) VALUES (pg_temp.t('Puddle Pixels'), pg_temp.u('myra'))$q$);
SELECT pg_temp.expect_error('B7 capacity cannot drop below member count', 'cannot drop below',
  $q$UPDATE teams SET capacity = 2 WHERE team_name = 'Drain Gang'$q$);
SELECT pg_temp.expect_error('B8 submissions closed for open (not started) event', 'Submissions open once',
  $q$INSERT INTO submissions (team_id,project_title,repo_url) VALUES (pg_temp.t('Rainmakers'),'Early','https://x.y')$q$);
SELECT pg_temp.expect_error('B9 only the leader can accept a request', 'Only the team leader',
  $q$SELECT fn_accept_join_request((SELECT request_id FROM join_requests WHERE user_id = pg_temp.u('mahi')), pg_temp.u('myra'))$q$);

-- ------------------------------------------------------------------ side effects
-- accept mahi into Rainmakers through the transactional function
SELECT fn_accept_join_request(
    (SELECT request_id FROM join_requests WHERE user_id = pg_temp.u('mahi') AND team_id = pg_temp.t('Rainmakers')),
    pg_temp.u('diya'));

SELECT pg_temp.expect_true('S1 accept: user added to team',
  $q$SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = pg_temp.t('Rainmakers') AND user_id = pg_temp.u('mahi'))$q$);
SELECT pg_temp.expect_true('S2 accept: looking_for_team flag cleared by trigger',
  $q$SELECT NOT looking_for_team FROM registrations WHERE event_id = 1 AND user_id = pg_temp.u('mahi')$q$);
SELECT pg_temp.expect_true('S3 accept: status change written to audit_log',
  $q$SELECT EXISTS (SELECT 1 FROM audit_log WHERE table_name = 'join_requests' AND action = 'status:pending->accepted')$q$);
SELECT pg_temp.expect_error('S4 cannot accept the same request twice', 'already accepted',
  $q$SELECT fn_accept_join_request((SELECT request_id FROM join_requests WHERE user_id = pg_temp.u('mahi') AND team_id = pg_temp.t('Rainmakers')), pg_temp.u('diya'))$q$);

-- om joins too -> Rainmakers reaches 4/4 and must auto-lock
SELECT fn_accept_join_request(
    (SELECT request_id FROM join_requests WHERE user_id = pg_temp.u('om')), pg_temp.u('diya'));
SELECT pg_temp.expect_true('S5 team auto-locks when it reaches capacity',
  $q$SELECT is_locked FROM teams WHERE team_name = 'Rainmakers'$q$);
SELECT pg_temp.expect_error('S6 direct insert into a locked team is blocked', 'is full',
  $q$INSERT INTO team_members (team_id,user_id,event_id) VALUES (pg_temp.t('Rainmakers'), pg_temp.u('neel'), 1)$q$);
SELECT pg_temp.expect_true('S7 balance score recomputed after joins (> 59)',
  $q$SELECT balance_score > 59 FROM teams WHERE team_name = 'Rainmakers'$q$);

-- leaving unlocks the team and flips looking_for_team back on
DELETE FROM team_members WHERE team_id = pg_temp.t('Rainmakers') AND user_id = pg_temp.u('om');
SELECT pg_temp.expect_true('S8 leaving a full team unlocks it',
  $q$SELECT NOT is_locked FROM teams WHERE team_name = 'Rainmakers'$q$);
SELECT pg_temp.expect_true('S9 leaving sets looking_for_team = true',
  $q$SELECT looking_for_team FROM registrations WHERE event_id = 1 AND user_id = pg_temp.u('om')$q$);

-- creating a team withdraws the creator's own pending requests
CALL sp_create_team(1, pg_temp.u('krish'), 'Krish Solo', 'test', 2, NULL);
SELECT pg_temp.expect_true('S10 sp_create_team adds leader as member',
  $q$SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = pg_temp.t('Krish Solo') AND user_id = pg_temp.u('krish'))$q$);
SELECT pg_temp.expect_true('S11 sp_create_team withdraws leader''s pending requests',
  $q$SELECT status = 'withdrawn' FROM join_requests WHERE user_id = pg_temp.u('krish') AND team_id = pg_temp.t('Puddle Pixels')$q$);

-- adding a required skill nobody has lowers the balance score
SELECT pg_temp.expect_true('S12 required-skill trigger recomputes balance',
  $q$WITH before AS (SELECT balance_score b FROM teams WHERE team_name='Clear Path'),
          ins AS (INSERT INTO team_required_skills VALUES (pg_temp.t('Clear Path'), (SELECT skill_id FROM skills WHERE name='Kotlin'), 4) RETURNING 1)
     SELECT (SELECT count(*) FROM ins) = 1$q$);
SELECT pg_temp.expect_true('S13 balance score dropped after adding unmet skill',
  $q$SELECT balance_score < 64.67 FROM teams WHERE team_name = 'Clear Path'$q$);

-- ------------------------------------------------------------------ vector search
INSERT INTO profile_embeddings (user_id, embedding, source_hash)
SELECT u.user_id,
       (SELECT array_agg(CASE WHEN i = (u.user_id % 384) + 1 THEN 1.0 ELSE 0.01 END)::vector(384)
        FROM generate_series(1, 384) i),
       repeat('0', 64)
FROM users u WHERE u.role = 'participant';
INSERT INTO team_embeddings (team_id, embedding, source_hash)
SELECT pg_temp.t('Puddle Pixels'),
       (SELECT array_agg(CASE WHEN i = (pg_temp.u('neel') % 384) + 1 THEN 1.0 ELSE 0.01 END)::vector(384)
        FROM generate_series(1, 384) i),
       repeat('0', 64);
SELECT pg_temp.expect_true('V1 nearest neighbour by cosine distance is the matching vector',
  $q$SELECT user_id = pg_temp.u('neel') FROM profile_embeddings
     ORDER BY embedding <=> (SELECT embedding FROM team_embeddings WHERE team_id = pg_temp.t('Puddle Pixels')) LIMIT 1$q$);
SELECT pg_temp.expect_error('V2 wrong embedding dimension rejected', 'expected 384 dimensions',
  $q$INSERT INTO team_embeddings VALUES (pg_temp.t('Rainmakers'), '[1,2,3]', repeat('0',64))$q$);

-- ------------------------------------------------------------------ report
\pset tuples_only off
\pset format aligned
SELECT n, result, test, left(detail, 70) AS detail FROM test_results ORDER BY n;
SELECT result, COUNT(*) FROM test_results GROUP BY result;
ROLLBACK;
