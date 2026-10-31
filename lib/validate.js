import { z } from 'zod';

// App-level validation gives friendly messages early; the database still
// enforces every rule (CHECK / FK / triggers) as the source of truth.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(120),
  password: z.string().min(8, 'at least 8 characters').max(72),
  role: z.enum(['participant', 'organizer', 'judge']),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const eventSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(4000).default(''),
  theme: z.string().max(60).optional().nullable(),
  venue: z.string().max(120).optional().nullable(),
  start_date: date,
  end_date: date,
  reg_deadline: date,
  min_team_size: z.coerce.number().int().min(1).max(10),
  max_team_size: z.coerce.number().int().min(1).max(10),
  status: z.enum(['draft', 'open']).default('draft'),
});

export const eventStatusSchema = z.object({
  status: z.enum(['draft', 'open', 'ongoing', 'judging', 'completed']),
});

const requiredSkill = z.object({
  skill_id: z.coerce.number().int().positive(),
  min_proficiency: z.coerce.number().int().min(1).max(5).default(3),
});

export const teamSchema = z.object({
  event_id: z.coerce.number().int().positive(),
  team_name: z.string().trim().min(2).max(60),
  pitch: z.string().max(1000).default(''),
  capacity: z.coerce.number().int().min(1).max(10),
  required_skills: z.array(requiredSkill).max(10).default([]),
});

export const teamUpdateSchema = z.object({
  pitch: z.string().max(1000).optional(),
  capacity: z.coerce.number().int().min(1).max(10).optional(),
  required_skills: z.array(requiredSkill).max(10).optional(),
});

export const joinRequestSchema = z.object({
  message: z.string().max(500).default(''),
});

export const skillsSchema = z.object({
  skills: z.array(z.object({
    skill_id: z.coerce.number().int().positive(),
    proficiency: z.coerce.number().int().min(1).max(5),
  })).max(25),
});

const url = z.url().max(300).or(z.literal(''));
export const profileSchema = z.object({
  bio: z.string().max(1000).default(''),
  interests: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  availability: z.enum(['full-time', 'weekends', 'evenings']).default('full-time'),
  github: url.default(''),
  past_projects: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    stack: z.array(z.string().trim().max(40)).max(10).default([]),
    description: z.string().max(600).default(''),
  })).max(8).default([]),
});

export const submissionSchema = z.object({
  team_id: z.coerce.number().int().positive(),
  project_title: z.string().trim().min(2).max(120),
  summary: z.string().max(2000).default(''),
  repo_url: z.url().regex(/^https?:\/\//).max(300),
});

export const scoreSchema = z.object({
  submission_id: z.coerce.number().int().positive(),
  scores: z.object({
    innovation: z.coerce.number().int().min(0).max(10),
    technical: z.coerce.number().int().min(0).max(10),
    design: z.coerce.number().int().min(0).max(10),
    impact: z.coerce.number().int().min(0).max(10),
    presentation: z.coerce.number().int().min(0).max(10),
  }),
});
