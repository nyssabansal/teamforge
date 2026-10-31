import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'tf_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ chars)');
  return new TextEncoder().encode(s);
}

export async function signSession(user) {
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.user_id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.sub), name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,                      // not readable from JS -> XSS can't steal it
    sameSite: 'lax',                     // blocks cross-site POSTs (CSRF)
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Session for the current request, or null. */
export async function getSession() {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}
