# TeamForge

Event and hackathon team-matching platform. Teams list the skills they're missing, participants list what they can do, and the app matches the two. Matching uses SQL skill-gap scoring plus semantic similarity over profile embeddings.

DBMS Experiential Learning, Level 3 project. Stack: **Next.js 16 · PostgreSQL 16 + pgvector · MongoDB**.

![Team page](docs/images/screen-team-leader.png)

## What's in here

| Requirement | Where |
| --- | --- |
| ER diagram, relational schema | `docs/images/er-diagram.png`, `docs/diagrams/er.mmd`, `db/sql/01_schema.sql` |
| DDL: CREATE / ALTER / DROP, keys, constraints, indexes | `db/sql/01_schema.sql`, `db/sql/06_alter_drop_demo.sql`, `db/sql/99_teardown.sql` |
| Triggers (12), functions (4), procedures (2) | `db/sql/02_functions_triggers.sql` |
| Views (4) + materialised view | `db/sql/03_views.sql` |
| Important queries (JOIN, GROUP BY/HAVING, subqueries, CTE, window functions, FTS, vector kNN) | `db/sql/05_queries.sql` |
| Transactions | `fn_accept_join_request`, `lib/db.js → withTransaction`, used in `app/api/requests`, `app/api/teams`, `app/api/me/skills`, `app/api/scores` |
| MongoDB model, validator, indexes, aggregation | `db/mongo/init.mjs`, `db/mongo/aggregations.mjs`, `app/api/me/profile` |
| Vector search (pgvector, MiniLM, cosine) | `lib/embeddings.js`, `app/api/teams/[id]/suggestions`, `app/api/matching` |
| Auth + 3 roles (participant, organizer, judge) | `lib/auth.js`, `lib/http.js → requireUser`, `proxy.js` |
| Tests | `db/tests/integrity_tests.sql` (42 cases), `db/tests/concurrency_test.sh` |

## Prerequisites

- **Node.js 20.9+**
- **PostgreSQL 15+ with the pgvector extension** (0.5+, for HNSW)
  - macOS: `brew install postgresql@16 pgvector`
  - Ubuntu/Debian: `sudo apt install postgresql-16-pgvector`
  - Windows: use the EDB installer, then follow pgvector's Windows build notes, or run Postgres in Docker: `docker run -d --name tf-pg -e POSTGRES_PASSWORD=change-me -p 5432:5432 pgvector/pgvector:pg16`
- **MongoDB 6+** (local, or a free Atlas cluster). Docker: `docker run -d --name tf-mongo -p 27017:27017 mongo:7`
- `psql` on your PATH (only needed for `npm run db:test`)

## Setup

```bash
npm install                      # downloads the ONNX runtime used for embeddings
cp .env.example .env.local       # then fill it in (see below)

# create the database and user (adjust to your Postgres setup)
psql -U postgres -c "CREATE ROLE teamforge LOGIN PASSWORD 'change-me';"
psql -U postgres -c "CREATE DATABASE teamforge OWNER teamforge;"
psql -U postgres -d teamforge -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS citext;"

npm run setup                    # schema + seed (Postgres), profiles (Mongo), embeddings (pgvector)
npm run dev                      # http://localhost:3000
```

`.env.local`:

```ini
DATABASE_URL=postgres://teamforge:change-me@localhost:5432/teamforge
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=teamforge
AUTH_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ORGANIZER_INVITE_CODE=<anything>
JUDGE_INVITE_CODE=<anything>
```

The first `npm run embed` (part of `setup`) downloads the MiniLM model (~23 MB) and caches it. After that it works offline.

## Demo accounts

All seed accounts use the password `password123`.

| Role | Email | Good for showing |
| --- | --- | --- |
| Participant, team leader | `tara@teamforge.dev` | Incoming requests, suggested candidates, editing the team |
| Participant, team leader | `diya@teamforge.dev` | A team with pending requests to accept |
| Participant, free agent | `neel@teamforge.dev` | "Teams for you", sending a request |
| Organizer | `ananya@teamforge.dev` | Dashboard, Insights, moving an event through stages, assigning judges |
| Judge | `meera@teamforge.dev` | Scoring (move Hack the Monsoon to *judging* first as Ananya) |

A good demo path: Neel requests to join Puddle Pixels → Tara accepts (transaction, seat fills) → Ananya's Insights update → Ananya starts the event → Tara submits → Ananya opens judging → Meera scores → leaderboard.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:reset` | Drop and recreate schema, load `01`–`04` |
| `npm run db:schema` / `db:seed` | Load schema only / seed only |
| `npm run db:test` | Run the 42-case integrity suite (rolled back, leaves data unchanged) |
| `npm run seed:mongo` | Create the Mongo collection, validator and indexes; load profiles |
| `npm run embed` | Build embeddings for all participants and teams |
| `npm run setup` | `db:reset` + `seed:mongo` + `embed` |
| `npm run seed:sql` | Regenerate `04_seed.sql` from `db/seed/data.mjs` |
| `./db/tests/concurrency_test.sh` | Race two accepts for the last seat (needs `DATABASE_URL`; re-seed afterwards) |

## Project structure

```
app/
  api/                 route handlers: auth, events, teams, requests, matching, me, scores, submissions
  _components/         seat row, skill chips, skill picker, fetch helpers
  events/ teams/ dashboard/ profile/ login/ register/   pages
db/
  sql/                 01 schema · 02 functions & triggers · 03 views · 04 seed · 05 queries · 06 alter/drop · 99 teardown
  mongo/               collection init (validator, indexes) and aggregation pipelines
  seed/data.mjs        single source of demo data for SQL, Mongo and embeddings
  tests/               integrity suite and concurrency test
lib/                   db pool + transactions, mongo client, auth, validation, embeddings
scripts/               setup scripts used by npm run …
docs/                  ER and architecture diagrams, screenshots
proxy.js               page-level role gating (Next 16's middleware)
```

## Troubleshooting

- **`extension "vector" is not available`**: pgvector isn't installed for the Postgres version you're running. Install the package matching your major version, or use the `pgvector/pgvector:pg16` Docker image.
- **Profile page says "Profile storage (MongoDB) is unavailable"**: start MongoDB and check `MONGODB_URI`. Everything else keeps working without it.
- **Matching says it's ranking by skills only**: embeddings haven't been built. Run `npm run embed` (needs internet the first time).
- **`npm install` fails on `onnxruntime-node`**: it downloads a native binary during install. Retry on a normal network; behind a proxy, set `HTTPS_PROXY`.
