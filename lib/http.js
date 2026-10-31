import { NextResponse } from 'next/server';
import { getSession } from './auth.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ok = (data, status = 200) => NextResponse.json(data, { status });

/**
 * Throws 401/403 unless the caller is logged in with one of `roles`.
 * Returns the session.
 */
export async function requireUser(...roles) {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Please log in');
  if (roles.length && !roles.includes(s.role)) {
    throw new HttpError(403, `This action is for ${roles.join(' / ')} accounts`);
  }
  return s;
}

// Postgres SQLSTATE -> HTTP status. Trigger RAISEs use these codes too, so a
// rule enforced in the database surfaces as a clean 4xx with its message.
const PG_STATUS = {
  '23505': 409, // unique_violation
  '23503': 400, // foreign_key_violation
  '23514': 400, // check_violation
  '23502': 400, // not_null_violation
  '22P02': 400, // invalid_text_representation
  '22001': 400, // string too long
  '42501': 403, // insufficient_privilege
  P0001: 400,   // plain RAISE EXCEPTION
};

const FRIENDLY = {
  users_email_key: 'An account with this email already exists',
  uq_registration: 'You are already registered for this event',
  uq_team_name_per_event: 'A team with that name already exists in this event',
  uq_one_team_per_event: 'You are already in a team for this event',
  uq_pending_request: 'You already have a pending request for this team',
  submissions_team_id_key: 'Your team has already submitted',
  fk_tm_registration: 'You must register for the event first',
};

/** Wrap a route handler: maps thrown errors to JSON responses. */
export function handler(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return ok({ error: err.message }, err.status);
      if (err?.name === 'ZodError') {
        const first = err.issues?.[0];
        return ok({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input' }, 400);
      }
      if (/^Mongo(ServerSelection|Network|Topology)/.test(err?.name ?? '') || /MONGODB_URI/.test(err?.message ?? '')) {
        return ok({ error: 'Profile storage (MongoDB) is unavailable. Check that MongoDB is running and MONGODB_URI is set.' }, 503);
      }
      if (err?.code === 'ECONNREFUSED' || /DATABASE_URL/.test(err?.message ?? '')) {
        return ok({ error: 'The database is unavailable. Check that PostgreSQL is running and DATABASE_URL is set.' }, 503);
      }
      if (err?.code && PG_STATUS[err.code]) {
        const msg = FRIENDLY[err.constraint] || err.message;
        return ok({ error: msg }, PG_STATUS[err.code]);
      }
      console.error(err);
      return ok({ error: 'Something went wrong' }, 500);
    }
  };
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
}

export function intParam(v, name = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${name}`);
  return n;
}
