-- =====================================================================
-- 06_alter_drop_demo.sql — schema evolution (ALTER / DROP) examples.
-- Safe to run on the seeded database: every change is reverted, and the
-- whole script runs in a transaction that is rolled back at the end.
-- =====================================================================
BEGIN;

-- ALTER: add a column with a constraint
ALTER TABLE users ADD COLUMN phone VARCHAR(15)
    CHECK (phone ~ '^\+?[0-9]{10,14}$');
UPDATE users SET phone = '+919876543210' WHERE email = 'aarav@teamforge.dev';

-- ALTER: change a column type / default
ALTER TABLE events ALTER COLUMN venue TYPE VARCHAR(200);
ALTER TABLE teams  ALTER COLUMN pitch SET DEFAULT 'No pitch yet';

-- ALTER: add then drop a named constraint
ALTER TABLE events ADD CONSTRAINT chk_title_len CHECK (length(title) >= 5);
ALTER TABLE events DROP CONSTRAINT chk_title_len;

-- ALTER: rename a column and back
ALTER TABLE skills RENAME COLUMN category TO skill_category;
ALTER TABLE skills RENAME COLUMN skill_category TO category;

-- CREATE / DROP an index
CREATE INDEX idx_users_role ON users (role);
EXPLAIN SELECT * FROM users WHERE role = 'judge';
DROP INDEX idx_users_role;

-- CREATE / DROP a table
CREATE TABLE announcements (
    announcement_id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TABLE announcements;

-- DROP column added above
ALTER TABLE users DROP COLUMN phone;

ROLLBACK;   -- leave the schema exactly as 01–03 define it
