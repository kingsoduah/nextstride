import { z } from 'zod';
import { DecisionStateSchema, TemporalReferenceSchema, UnknownSchema } from '../decision/spec';

/**
 * Phase 3: DecisionAnalysisV2 contracts.
 *
 * A deterministic, inspectable analysis of a DecisionContextV2.
 * No recommendations, no prose, no LLM — Phase 4 consumes this.
 */

export const WindowSchema = z.object({
  startIso: z.string(),
  endIso: z.string(),
  minutes: z.number().int().min(0),
});

export const BlockedWindowSchema = WindowSchema.extend({
  reason: z.string().max(300),
  source: z.enum(['human-need', 'fixed-commitment']),
});

export const FeasibilitySchema = z.enum(['FEASIBLE', 'TIGHT', 'AT_RISK', 'INFEASIBLE', 'CANNOT_DETERMINE']);
export type Feasibility = z.infer<typeof FeasibilitySchema>;

export const ResponsibilityAnalysisSchema = z.object({
  index: z.number().int().min(0),
  title: z.string(),
  consequenceKnown: z.boolean(),
  deadlineKind: z.enum(['instant', 'window', 'needs-clarification', 'unresolved']),
  deadlineEndIso: z.string().nullable(),
  effortMinutes: z.number().int().nullable(),
  requiredMinutes: z.number().int().nullable(),
  delegationApplied: z.boolean(),
  availableMinutes: z.number().int(),
  availableWindows: z.array(WindowSchema),
  bufferMinutes: z.number().int().nullable(),
  shortfallMinutes: z.number().int().nullable(),
  feasibility: FeasibilitySchema,
  unknowns: z.array(UnknownSchema),
});
export type ResponsibilityAnalysis = z.infer<typeof ResponsibilityAnalysisSchema>;

export const DependencyLinkSchema = z.object({
  prerequisiteIndex: z.number().int().min(0),
  dependentIndex: z.number().int().min(0),
  prerequisiteTitle: z.string(),
  dependentTitle: z.string(),
});
export type DependencyLink = z.infer<typeof DependencyLinkSchema>;

export const ConflictSchema = z.object({
  type: z.enum(['time', 'deadline', 'constraint', 'energy', 'dependency']),
  description: z.string().min(1).max(1000),
  involves: z.array(z.string().max(200)).default([]),
  minutes: z.number().int().nullable().default(null),
});
export type AnalysisConflict = z.infer<typeof ConflictSchema>;

export const DecisionAnalysisV2Schema = z.object({
  reference: TemporalReferenceSchema,
  timezone: z.string(),
  responsibilityAnalysis: z.array(ResponsibilityAnalysisSchema),
  availableWindows: z.array(WindowSchema),
  blockedWindows: z.array(BlockedWindowSchema),
  dependencies: z.array(DependencyLinkSchema),
  conflicts: z.array(ConflictSchema),
  totalRequiredMinutes: z.number().int().nullable(),
  totalAvailableMinutes: z.number().int(),
  bufferMinutes: z.number().int().nullable(),
  shortfallMinutes: z.number().int().nullable(),
  unknowns: z.array(UnknownSchema),
  blockingUnknowns: z.array(UnknownSchema),
  analysisStatus: z.enum(['complete', 'partial', 'blocked']),
});
export type DecisionAnalysisV2 = z.infer<typeof DecisionAnalysisV2Schema>;

/** Input accepted by the analysis endpoints (context + optional clock override). */
export const AnalyzeRequestSchema = z.object({
  context: z.unknown(),
  nowIso: z.string().optional(),
  timezone: z.string().max(64).optional(),
});
