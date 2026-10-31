import { MongoClient } from 'mongodb';

const g = globalThis;

export const PROFILES = 'participant_profiles';

export async function mongo() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!g.__mongoConnect) {
    g.__mongoClient = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 3000, // fail fast if Mongo is down; pages degrade instead of hanging
    });
    g.__mongoConnect = g.__mongoClient.connect().catch((err) => {
      g.__mongoConnect = null;          // allow a retry on the next request
      throw err;
    });
  }
  await g.__mongoConnect;
  return g.__mongoClient.db(process.env.MONGODB_DB || 'teamforge');
}

export async function profiles() {
  return (await mongo()).collection(PROFILES);
}

/** Fetch profiles for many SQL user ids at once: { [userId]: profile } */
export async function profilesByUserIds(ids) {
  if (!ids.length) return {};
  const docs = await (await profiles())
    .find({ user_id: { $in: ids } }, { projection: { _id: 0 } })
    .toArray();
  return Object.fromEntries(docs.map((d) => [d.user_id, d]));
}
