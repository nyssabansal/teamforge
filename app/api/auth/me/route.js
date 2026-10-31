import { handler, ok } from '@/lib/http';
import { getSession } from '@/lib/auth';

export const GET = handler(async () => {
  const s = await getSession();
  return ok({ user: s ? { user_id: s.userId, name: s.name, role: s.role } : null });
});
