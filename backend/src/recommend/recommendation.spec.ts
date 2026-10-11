import { describe, expect, it } from 'vitest';
import { RecommendationStatusSchema, RecommendationV2Schema } from './recommendation';

const valid = {
  nextMove: 'Start the statistics assignment now and complete the first 90-minute section.',
  why: 'It is due first and the window before sleep fits exactly one focused section.',
  plan: ['Work 6:00 PM–7:30 PM.', 'Stop. Sleep.', 'Finish the remainder 6:00 AM–7:00 AM.'],
  whatCanWait: ['Fellowship task'],
  risk: 'No meaningful buffer before the deadline.',
  reassessmentTrigger: 'Reassess if the first section takes longer than 90 minutes.',
  assumptions: [],
  unknowns: [],
  options: [],
  status: 'RECOMMEND',
};

describe('RecommendationV2 contract', () => {
  it('accepts a complete valid recommendation', () => {
    expect(RecommendationV2Schema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing nextMove (must be concrete)', () => {
    const { nextMove: _omitted, ...rest } = valid;
    expect(RecommendationV2Schema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty nextMove', () => {
    expect(RecommendationV2Schema.safeParse({ ...valid, nextMove: '' }).success).toBe(false);
  });

  it('rejects an unknown status value', () => {
    expect(RecommendationV2Schema.safeParse({ ...valid, status: 'DO_IT_NOW' }).success).toBe(false);
  });

  it('accepts all four machine-readable statuses', () => {
    for (const status of ['RECOMMEND', 'REASSESS', 'NEEDS_INPUT', 'INFEASIBLE']) {
      expect(RecommendationV2Schema.safeParse({ ...valid, status }).success).toBe(true);
      expect(RecommendationStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects a missing risk field (infeasibility must be statable)', () => {
    const { risk: _omitted, ...rest } = valid;
    expect(RecommendationV2Schema.safeParse(rest).success).toBe(false);
  });
});
