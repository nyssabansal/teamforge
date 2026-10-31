import { handler, ok } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth';

export const POST = handler(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
