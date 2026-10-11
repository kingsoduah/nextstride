import { z } from 'zod';
import { UnknownSchema } from '../decision/spec';

/**
 * Phase 4: RecommendationV2 contract.
 *
 * A structured, Zod-validated recommendation produced by reasoning OVER
 * DecisionContextV2 + DecisionAnalysisV2. The AI never computes time
 * arithmetic — every number it cites must already exist in the analysis.
 * Deterministic guardrails in the service enforce status consistency.
 */

export const RecommendationStatusSchema = z.enum([
  'RECOMMEND',
  'REASSESS',
  'NEEDS_INPUT',
  'INFEASIBLE',
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

export const RecommendationV2Schema = z.object({
  /** The single concrete next move. Actionable, not generic. */
  nextMove: z.string().min(1).max(500),
  /** Why this move, referencing facts (deadline, feasibility, consequence…). */
  why: z.string().min(1).max(1500),
  /** Short realistic steps consistent with the deterministic analysis. */
  plan: z.array(z.string().min(1).max(300)).max(8).default([]),
  /** Responsibilities that can reasonably wait (never violating hard constraints). */
  whatCanWait: z.array(z.string().min(1).max(200)).max(12).default([]),
  /** The main risk, incl. explicit shortfall when infeasible. */
  risk: z.string().min(1).max(500),
  /** Concrete condition that should trigger reassessment. */
  reassessmentTrigger: z.string().min(1).max(300),
  /** Material assumptions only; empty when there are none. */
  assumptions: z.array(z.string().min(1).max(300)).max(8).default([]),
  /** Only unknowns that materially affect this recommendation. */
  unknowns: z.array(UnknownSchema).max(8).default([]),
  /** Realistic alternatives when the plan cannot fit; constraint-safe only. */
  options: z.array(z.string().min(1).max(300)).max(8).default([]),
  status: RecommendationStatusSchema,
});
export type RecommendationV2 = z.infer<typeof RecommendationV2Schema>;
