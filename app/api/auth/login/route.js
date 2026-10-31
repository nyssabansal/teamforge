import bcrypt from 'bcryptjs';
import { one } from '@/lib/db';
import { handler, ok, readJson, HttpError } from '@/lib/http';
import { loginSchema } from '@/lib/validate';
import { signSession, setSessionCookie } from '@/lib/auth';

// constant-time-ish: always run bcrypt even when the email doesn't exist
const DUMMY = '$2b$12$4yODTzes2dwPcRNkz3pUHOAiX1eZdrO75uNcBxiZ.ZrqK9S8GkhDa';

export const POST = handler(async (req) => {
  const { email, password } = loginSchema.parse(await readJson(req));
  const user = await one(
    'SELECT user_id, name, email, role, password_hash, is_active FROM users WHERE email = $1', [email]);

  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY);
  if (!user || !valid || !user.is_active) throw new HttpError(401, 'Wrong email or password');

  await setSessionCookie(await signSession(user));
  const { password_hash, ...safe } = user;
  return ok({ user: safe });
});
