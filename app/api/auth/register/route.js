import bcrypt from 'bcryptjs';
import { one } from '@/lib/db';
import { handler, ok, readJson, HttpError } from '@/lib/http';
import { registerSchema } from '@/lib/validate';
import { signSession, setSessionCookie } from '@/lib/auth';

// Anyone can sign up as a participant. Organizer and judge accounts need an
// invite code from the environment, so roles can't be self-assigned.
export const POST = handler(async (req) => {
  const body = await readJson(req);
  const data = registerSchema.parse(body);

  if (data.role !== 'participant') {
    const expected = data.role === 'organizer' ? process.env.ORGANIZER_INVITE_CODE : process.env.JUDGE_INVITE_CODE;
    if (!expected || body.invite_code !== expected) {
      throw new HttpError(403, `A valid invite code is required for ${data.role} accounts`);
    }
  }

  const hash = await bcrypt.hash(data.password, 12);
  const user = await one(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
     RETURNING user_id, name, email, role`,
    [data.name, data.email, hash, data.role]);

  await setSessionCookie(await signSession(user));
  return ok({ user }, 201);
});
