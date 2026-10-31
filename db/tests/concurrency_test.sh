#!/usr/bin/env bash
# Race for the last slot: two transactions accept two different requests for
# "Clear Path" (2/3 members) at the same time. The row lock taken by
# fn_accept_join_request (SELECT ... FOR UPDATE on the team) makes the second
# transaction wait; when it resumes, the capacity trigger sees 3/3 and it rolls back.
#
# Usage: DATABASE_URL=postgres://user:pass@localhost:5432/teammatch ./db/tests/concurrency_test.sh
# Run on a freshly seeded DB (re-seed afterwards: the first accept is committed).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
PSQL="psql $DATABASE_URL -X -q -t -A -v ON_ERROR_STOP=1"

# second applicant for the same team (aarav is registered for the Design-a-thon)
$PSQL -c "INSERT INTO join_requests (team_id, user_id, message)
          SELECT team_id, (SELECT user_id FROM users WHERE email='aarav@teamforge.dev'), 'race test'
          FROM teams WHERE team_name='Clear Path'
          ON CONFLICT DO NOTHING;"

REQ_A=$($PSQL -c "SELECT request_id FROM join_requests jr JOIN users u USING (user_id) WHERE u.email='saanvi@teamforge.dev' AND jr.status='pending'")
REQ_B=$($PSQL -c "SELECT request_id FROM join_requests jr JOIN users u USING (user_id) WHERE u.email='aarav@teamforge.dev'  AND jr.status='pending'")
LEADER=$($PSQL -c "SELECT user_id FROM users WHERE email='ishita@teamforge.dev'")

echo "Tx A accepts request $REQ_A, holds the lock for 2s..."
( $PSQL -c "BEGIN; SELECT fn_accept_join_request($REQ_A, $LEADER); SELECT pg_sleep(2); COMMIT;" \
    && echo "Tx A: COMMITTED" || echo "Tx A: ROLLED BACK" ) &
sleep 0.5
echo "Tx B accepts request $REQ_B (should block, then fail)..."
( $PSQL -c "BEGIN; SELECT fn_accept_join_request($REQ_B, $LEADER); COMMIT;" 2>&1 \
    && echo "Tx B: COMMITTED" || echo "Tx B: ROLLED BACK" )
wait

echo
$PSQL -F ' | ' -c "SELECT team_name, member_count || '/' || capacity, is_locked FROM v_team_overview WHERE team_name='Clear Path'"
$PSQL -F ' | ' -c "SELECT u.name, jr.status FROM join_requests jr JOIN users u USING (user_id) WHERE jr.request_id IN ($REQ_A, $REQ_B) ORDER BY 1"
