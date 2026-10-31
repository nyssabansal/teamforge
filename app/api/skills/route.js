import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';

export const GET = handler(async () => {
  const { rows } = await query('SELECT skill_id, name, category FROM skills ORDER BY category, name');
  return ok({ skills: rows });
});
