import { NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from './lib/auth.js';

// Next.js 16 "proxy" (formerly middleware): page-level role gating.
// API routes do their own checks with requireUser(), so this is only UX —
// the database and the API are what actually enforce access.
const RULES = [
  { prefix: '/dashboard', roles: ['participant', 'organizer', 'judge'] },
  { prefix: '/profile', roles: ['participant'] },
  { prefix: '/events/new', roles: ['organizer'] },
];

export async function proxy(req) {
  const { pathname } = req.nextUrl;
  const rule = RULES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (!rule.roles.includes(session.role)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/profile/:path*', '/events/new'] };
