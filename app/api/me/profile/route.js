import { handler, ok, readJson, requireUser } from '@/lib/http';
import { profiles } from '@/lib/mongo';
import { profileSchema } from '@/lib/validate';
import { refreshInBackground, refreshProfileEmbedding } from '@/lib/embeddings';

// The free-form profile lives in MongoDB (document per participant, keyed by
// the SQL user_id). Its shape varies a lot between people — any number of
// past projects, each with its own stack list — which is awkward to model
// as relational tables and is never joined on.

export const GET = handler(async () => {
  const s = await requireUser('participant');
  const doc = await (await profiles()).findOne({ user_id: s.userId }, { projection: { _id: 0 } });
  return ok({ profile: doc ?? { user_id: s.userId, bio: '', interests: [], past_projects: [], github: '', availability: 'full-time' } });
});

export const PUT = handler(async (req) => {
  const s = await requireUser('participant');
  const p = profileSchema.parse(await readJson(req));
  await (await profiles()).updateOne(
    { user_id: s.userId },
    { $set: { ...p, user_id: s.userId, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
    { upsert: true });
  // profile text changed -> re-embed into pgvector
  refreshInBackground(refreshProfileEmbedding, s.userId);
  return ok({ ok: true });
});
