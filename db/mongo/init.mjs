// MongoDB data model for TeamForge — collection, JSON-schema validator, indexes.
// Used by scripts/seed-mongo.mjs (and safe to run repeatedly).
//
// Collection: participant_profiles   (one document per participant)
// {
//   user_id:       Number   -> users.user_id in PostgreSQL (the link between the two DBs)
//   bio:           String
//   interests:     [String]
//   availability:  'full-time' | 'weekends' | 'evenings'
//   github:        String (URL or '')
//   past_projects: [{ title, stack: [String], description }]   variable length
//   created_at, updated_at: Date
// }

export const PROFILE_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['user_id', 'bio', 'interests', 'past_projects'],
    additionalProperties: true,
    properties: {
      user_id: { bsonType: ['int', 'long', 'double'], minimum: 1, description: 'SQL users.user_id' },
      bio: { bsonType: 'string', maxLength: 1000 },
      interests: { bsonType: 'array', maxItems: 15, items: { bsonType: 'string', maxLength: 40 } },
      availability: { enum: ['full-time', 'weekends', 'evenings'] },
      github: { bsonType: 'string', maxLength: 300 },
      past_projects: {
        bsonType: 'array', maxItems: 8,
        items: {
          bsonType: 'object', required: ['title'],
          properties: {
            title: { bsonType: 'string', maxLength: 100 },
            stack: { bsonType: 'array', items: { bsonType: 'string' } },
            description: { bsonType: 'string', maxLength: 600 },
          },
        },
      },
    },
  },
};

export async function initMongo(db) {
  const exists = (await db.listCollections({ name: 'participant_profiles' }).toArray()).length > 0;
  if (!exists) {
    await db.createCollection('participant_profiles', { validator: PROFILE_VALIDATOR, validationLevel: 'strict' });
  } else {
    await db.command({ collMod: 'participant_profiles', validator: PROFILE_VALIDATOR, validationLevel: 'strict' });
  }
  const col = db.collection('participant_profiles');
  await col.createIndex({ user_id: 1 }, { unique: true, name: 'uq_user_id' });
  await col.createIndex({ interests: 1 }, { name: 'idx_interests' });              // multikey
  await col.createIndex({ 'past_projects.stack': 1 }, { name: 'idx_project_stack' }); // multikey on nested array
  await col.createIndex(
    { bio: 'text', 'past_projects.title': 'text', 'past_projects.description': 'text' },
    { name: 'txt_profile', weights: { bio: 3, 'past_projects.title': 2, 'past_projects.description': 1 } });
  return col;
}
