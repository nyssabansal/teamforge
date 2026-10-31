-- =====================================================================
-- TeamForge : Event / Hackathon Team-Matching Platform
-- 01_schema.sql  —  DDL: tables, keys, constraints, indexes
-- Target: PostgreSQL 16 + pgvector 0.6+
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;     -- semantic matching (vector DB paradigm)
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive emails

-- ---------------------------------------------------------------------
-- USERS : one table for all three roles (participant / organizer / judge)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL        PRIMARY KEY,
    name           VARCHAR(80)   NOT NULL CHECK (length(trim(name)) >= 2),
    email          CITEXT        NOT NULL UNIQUE
                   CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password_hash  VARCHAR(100)  NOT NULL CHECK (password_hash LIKE '$2%'),  -- bcrypt only, never plain text
    role           VARCHAR(12)   NOT NULL
                   CHECK (role IN ('participant', 'organizer', 'judge')),
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- EVENTS
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id       SERIAL        PRIMARY KEY,
    organizer_id   INT           NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    title          VARCHAR(120)  NOT NULL,
    description    TEXT          NOT NULL DEFAULT '',
    theme          VARCHAR(60),
    venue          VARCHAR(120),
    start_date     DATE          NOT NULL,
    end_date       DATE          NOT NULL,
    reg_deadline   DATE          NOT NULL,
    min_team_size  SMALLINT      NOT NULL DEFAULT 2,
    max_team_size  SMALLINT      NOT NULL DEFAULT 4,
    status         VARCHAR(12)   NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'open', 'ongoing', 'judging', 'completed')),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_event_dates   CHECK (end_date >= start_date AND reg_deadline <= start_date),
    CONSTRAINT chk_team_sizes    CHECK (min_team_size >= 1 AND max_team_size >= min_team_size AND max_team_size <= 10),
    CONSTRAINT uq_event_title    UNIQUE (title, start_date)
);

-- ---------------------------------------------------------------------
-- SKILLS (master list) and USER_SKILLS (M:N with proficiency)
-- ---------------------------------------------------------------------
CREATE TABLE skills (
    skill_id   SERIAL       PRIMARY KEY,
    name       VARCHAR(50)  NOT NULL UNIQUE,
    category   VARCHAR(20)  NOT NULL
               CHECK (category IN ('frontend', 'backend', 'ml', 'design', 'data', 'devops', 'mobile', 'security', 'business'))
);

CREATE TABLE user_skills (
    user_id      INT       NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    skill_id     INT       NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    proficiency  SMALLINT  NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
    PRIMARY KEY (user_id, skill_id)
);

-- ---------------------------------------------------------------------
-- REGISTRATIONS : participant registers for an event
-- ---------------------------------------------------------------------
CREATE TABLE registrations (
    reg_id            SERIAL       PRIMARY KEY,
    event_id          INT          NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    user_id           INT          NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    looking_for_team  BOOLEAN      NOT NULL DEFAULT TRUE,
    registered_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_registration UNIQUE (event_id, user_id)
);

-- ---------------------------------------------------------------------
-- TEAMS
-- ---------------------------------------------------------------------
CREATE TABLE teams (
    team_id        SERIAL        PRIMARY KEY,
    event_id       INT           NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    leader_id      INT           NOT NULL REFERENCES users(user_id)   ON DELETE RESTRICT,
    team_name      VARCHAR(60)   NOT NULL CHECK (length(trim(team_name)) >= 2),
    pitch          TEXT          NOT NULL DEFAULT '',
    capacity       SMALLINT      NOT NULL CHECK (capacity BETWEEN 1 AND 10),
    is_locked      BOOLEAN       NOT NULL DEFAULT FALSE,
    balance_score  NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (balance_score BETWEEN 0 AND 100),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_team_name_per_event UNIQUE (event_id, team_name),
    CONSTRAINT uq_team_event          UNIQUE (team_id, event_id)   -- target for composite FK below
);

-- ---------------------------------------------------------------------
-- TEAM_MEMBERS
--   event_id is carried here (denormalised on purpose) so that:
--   (a) UNIQUE(event_id, user_id)      -> a user is in at most ONE team per event
--   (b) FK (team_id, event_id)          -> the event_id can never disagree with the team's
--   (c) FK (event_id, user_id)          -> a member MUST be registered for that event
--   All three rules are enforced declaratively, with no trigger needed.
-- ---------------------------------------------------------------------
CREATE TABLE team_members (
    team_id    INT          NOT NULL,
    user_id    INT          NOT NULL,
    event_id   INT          NOT NULL,
    joined_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id),
    CONSTRAINT uq_one_team_per_event UNIQUE (event_id, user_id),
    CONSTRAINT fk_tm_team  FOREIGN KEY (team_id, event_id)
        REFERENCES teams (team_id, event_id) ON DELETE CASCADE,
    CONSTRAINT fk_tm_registration FOREIGN KEY (event_id, user_id)
        REFERENCES registrations (event_id, user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- TEAM_REQUIRED_SKILLS : what a team is looking for
-- ---------------------------------------------------------------------
CREATE TABLE team_required_skills (
    team_id          INT       NOT NULL REFERENCES teams(team_id)   ON DELETE CASCADE,
    skill_id         INT       NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    min_proficiency  SMALLINT  NOT NULL DEFAULT 3 CHECK (min_proficiency BETWEEN 1 AND 5),
    PRIMARY KEY (team_id, skill_id)
);

-- ---------------------------------------------------------------------
-- JOIN_REQUESTS
-- ---------------------------------------------------------------------
CREATE TABLE join_requests (
    request_id    SERIAL        PRIMARY KEY,
    team_id       INT           NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id       INT           NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status        VARCHAR(10)   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    message       VARCHAR(500)  NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    responded_at  TIMESTAMPTZ,
    CONSTRAINT chk_responded CHECK ((status = 'pending') = (responded_at IS NULL))
);
-- only one *pending* request per (team, user); history of old ones is kept
CREATE UNIQUE INDEX uq_pending_request ON join_requests (team_id, user_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- EVENT_JUDGES (M:N)
-- ---------------------------------------------------------------------
CREATE TABLE event_judges (
    event_id  INT  NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    judge_id  INT  NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    PRIMARY KEY (event_id, judge_id)
);

-- ---------------------------------------------------------------------
-- SUBMISSIONS (1 : 0..1 with TEAMS)
-- ---------------------------------------------------------------------
CREATE TABLE submissions (
    submission_id  SERIAL        PRIMARY KEY,
    team_id        INT           NOT NULL UNIQUE REFERENCES teams(team_id) ON DELETE CASCADE,
    project_title  VARCHAR(120)  NOT NULL,
    summary        TEXT          NOT NULL DEFAULT '',
    repo_url       VARCHAR(300)  NOT NULL CHECK (repo_url ~ '^https?://'),
    submitted_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- SCORES : judge x submission x criterion
-- ---------------------------------------------------------------------
CREATE TABLE scores (
    submission_id  INT          NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    judge_id       INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    criterion      VARCHAR(20)  NOT NULL
                   CHECK (criterion IN ('innovation', 'technical', 'design', 'impact', 'presentation')),
    score          SMALLINT     NOT NULL CHECK (score BETWEEN 0 AND 10),
    scored_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (submission_id, judge_id, criterion)
);

-- ---------------------------------------------------------------------
-- PROFILE_EMBEDDINGS  (vector-database paradigm, pgvector)
--   One 384-d MiniLM vector per participant, built from the free-text
--   profile stored in MongoDB (bio + interests + past projects) plus skills.
-- ---------------------------------------------------------------------
CREATE TABLE profile_embeddings (
    user_id      INT           PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    embedding    vector(384)   NOT NULL,
    source_hash  CHAR(64)      NOT NULL,          -- sha256 of the text that was embedded, avoids re-embedding
    model        VARCHAR(60)   NOT NULL DEFAULT 'Xenova/all-MiniLM-L6-v2',
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Team "looking for" vectors (pitch + required skills) — the query side of matching
CREATE TABLE team_embeddings (
    team_id      INT           PRIMARY KEY REFERENCES teams(team_id) ON DELETE CASCADE,
    embedding    vector(384)   NOT NULL,
    source_hash  CHAR(64)      NOT NULL,
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- AUDIT_LOG (written only by triggers)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    log_id      BIGSERIAL    PRIMARY KEY,
    table_name  VARCHAR(40)  NOT NULL,
    action      VARCHAR(30)  NOT NULL,
    record_id   INT,
    details     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    logged_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =====================================================================
-- INDEXES  (beyond the ones PK / UNIQUE create automatically)
-- =====================================================================
-- skill-tag lookups: "who knows React at proficiency >= 4"
CREATE INDEX idx_user_skills_skill_prof  ON user_skills (skill_id, proficiency DESC);
CREATE INDEX idx_team_req_skill          ON team_required_skills (skill_id);
-- FK columns used in joins
CREATE INDEX idx_events_organizer        ON events (organizer_id);
CREATE INDEX idx_teams_event             ON teams (event_id) INCLUDE (is_locked, capacity);
CREATE INDEX idx_teams_leader            ON teams (leader_id);
CREATE INDEX idx_team_members_user       ON team_members (user_id);
CREATE INDEX idx_join_req_team_status    ON join_requests (team_id, status);
CREATE INDEX idx_join_req_user           ON join_requests (user_id, status);
CREATE INDEX idx_event_judges_judge      ON event_judges (judge_id);
CREATE INDEX idx_scores_judge            ON scores (judge_id);
-- partial index: participants still searching, per event (main matching query)
CREATE INDEX idx_reg_seeking             ON registrations (event_id) WHERE looking_for_team;
-- events browse page filters by status + date
CREATE INDEX idx_events_status_start     ON events (status, start_date);

-- Full-text search over events (title weighted above description)
ALTER TABLE events ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(theme, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED;
CREATE INDEX idx_events_fts ON events USING GIN (search_tsv);

-- Approximate nearest-neighbour index for cosine distance (HNSW)
CREATE INDEX idx_profile_emb_hnsw ON profile_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_team_emb_hnsw    ON team_embeddings    USING hnsw (embedding vector_cosine_ops);
