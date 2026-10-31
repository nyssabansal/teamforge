// MongoDB aggregation pipelines used by the organizer dashboard.

/** Top interests among a set of participants (e.g. everyone registered for an event). */
export const interestTrends = (userIds, limit = 10) => [
  { $match: { user_id: { $in: userIds } } },
  { $unwind: '$interests' },
  { $group: { _id: { $toLower: '$interests' }, people: { $sum: 1 } } },
  { $sort: { people: -1, _id: 1 } },
  { $limit: limit },
  { $project: { _id: 0, interest: '$_id', people: 1 } },
];

/** Most-used technologies across those participants' past projects. */
export const stackPopularity = (userIds, limit = 10) => [
  { $match: { user_id: { $in: userIds } } },
  { $unwind: '$past_projects' },
  { $unwind: '$past_projects.stack' },
  { $group: { _id: '$past_projects.stack', projects: { $sum: 1 }, users: { $addToSet: '$user_id' } } },
  { $project: { _id: 0, tech: '$_id', projects: 1, people: { $size: '$users' } } },
  { $sort: { projects: -1, tech: 1 } },
  { $limit: limit },
];

/** Availability split (full-time / weekends / evenings). */
export const availabilitySplit = (userIds) => [
  { $match: { user_id: { $in: userIds } } },
  { $group: { _id: '$availability', people: { $sum: 1 } } },
  { $project: { _id: 0, availability: '$_id', people: 1 } },
  { $sort: { people: -1 } },
];
