import { z } from 'zod';

// Structured contracts (PRD §§22-23). The backend rejects anything that fails these.

export const ResponsibilitySchema = z.object({
  title: z.string().min(1).max(200),
  category: z
    .enum(['academic', 'fellowship', 'business', 'work', 'personal', 'other'])
    .default('other'),
  timeRef: z.string().max(120).default(''),
  fixedTime: z.boolean().default(false),
  flexible: z.boolean().default(true),
  delegatable: z.boolean().default(false),
  detail: z.string().min(1).max(2000),
});

export const ConflictSchema = z.object({
  description: z.string().min(1).max(500),
  involves: z.array(z.string()).default([]),
});

export const SituationContextSchema = z.object({
  responsibilities: z.array(ResponsibilitySchema).min(0).max(12),
  conflicts: z.array(ConflictSchema).max(12),
  uncertainties: z.array(z.string().max(500)).max(12),
});

export const OtherHandlingSchema = z.object({
  responsibilityId: z.string().default(''),
  title: z.string().min(1).max(200),
  suggestedHandling: z.string().min(1).max(500),
});

export const RecommendationSchema = z.object({
  recommendedPriority: z.string().min(1).max(300),
  why: z.string().min(1).max(1500),
  nextAction: z.string().min(1).max(500),
  others: z.array(OtherHandlingSchema).max(12),
  reassessIf: z.array(z.string().max(300)).max(8),
  uncertaintyNotes: z.string().max(800).default(''),
});

export type ParsedContext = z.infer<typeof SituationContextSchema>;
export type ResponsibilityDraft = z.infer<typeof ResponsibilitySchema>;
export type RecommendationDraft = z.infer<typeof RecommendationSchema>;
