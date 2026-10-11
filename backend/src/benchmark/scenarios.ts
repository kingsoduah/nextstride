import type { DecisionContextV2, HumanNeed, ResponsibilityV2, TemporalExpression } from '../decision/spec';
import { createReference } from '../temporal/temporal';
import { buildTimeRange } from '../decision/expression-builder';

/** Benchmark timezone. */
export const BENCHMARK_TZ = 'Africa/Lagos';

/** Benchmark reference: Saturday, October 10, 2026, 10:21 AM Africa/Lagos */
export const REAL_WORLD_REF = '2026-10-10T09:21:00.000Z'; // 10:21 AM Lagos = 09:21 UTC

function refAt(nowIso: string) {
  return createReference({ nowIso, timezone: BENCHMARK_TZ });
}

function resp(o: Partial<ResponsibilityV2> & { title: string }): ResponsibilityV2 {
  return {
    description: '',
    category: 'academic',
    deadline: null,
    effort: null,
    consequence: '',
    consequenceKnown: false,
    flexibility: 'unknown',
    delegation: null,
    dependsOn: [],
    status: 'unknown',
    ...o,
  };
}

function exactDeadline(instantIso: string) {
  return { expression: { kind: 'exact' as const, instantIso }, precision: 'exact' as const, state: 'known' as const };
}

function approxDeadline(centreIso: string, toleranceMinutes: number, raw: string) {
  return { expression: { kind: 'approximate' as const, centreIso, toleranceMinutes, raw }, precision: 'approximate' as const, state: 'inferred' as const };
}

function relativeDeadline(expression: string, raw: string) {
  return { expression: { kind: 'relative-date' as const, expression, raw }, precision: 'relative' as const, state: 'inferred' as const };
}

function timeRangeDeadline(startClock: { hour: number; minute: number; meridiem: 'am' | 'pm' }, endClock: { hour: number; minute: number; meridiem: 'am' | 'pm' }, dayText: string, raw: string) {
  return { expression: { kind: 'time-range' as const, startClock, endClock, dayText, raw }, precision: 'approximate' as const, state: 'inferred' as const };
}

function statedEffort(minutes: number, note = '') {
  return { minutes, maxMinutes: null, confidence: 'stated' as const, state: 'known' as const, note };
}

function unknownEffort(note = '') {
  return { minutes: null, maxMinutes: null, confidence: 'unknown' as const, state: 'unknown' as const, note };
}

/** Build a sleep need with a proper time-range window. */
function sleepNeed(refIso: string, dayText: string, sh: number, sm: 'am' | 'pm', eh: number, em: 'am' | 'pm'): HumanNeed {
  const ref = refAt(refIso);
  const { expression, resolved } = buildTimeRange(
    { hour: sh, minute: 0, meridiem: sm },
    { hour: eh, minute: 0, meridiem: em },
    dayText,
    `sleep ${dayText}`,
    ref,
  );
  return { kind: 'sleep', description: 'sleep', window: expression.kind === 'unknown' ? null : expression, state: resolved.kind === 'needs-clarification' ? 'needs-clarification' : 'known' };
}

/** Build a meal need (no window, just the need). */
function mealNeed(description: string): HumanNeed {
  return { kind: 'meals', description, window: null, state: 'unknown' as const };
}

/** Build a fixed-commitment human need with a proper time-range window. */
function fixedCommitmentNeed(refIso: string, dayText: string, sh: number, sm: 'am' | 'pm', eh: number, em: 'am' | 'pm', description: string): HumanNeed {
  const ref = refAt(refIso);
  const { expression, resolved } = buildTimeRange(
    { hour: sh, minute: 0, meridiem: sm },
    { hour: eh, minute: 0, meridiem: em },
    dayText,
    description,
    ref,
  );
  return { kind: 'fixed-event', description, window: expression.kind === 'unknown' ? null : expression, state: resolved.kind === 'needs-clarification' ? 'needs-clarification' : 'known' };
}

export interface Scenario {
  id: string;
  name: string;
  refIso: string;
  responsibilities: ResponsibilityV2[];
  humanNeeds: HumanNeed[];
  constraints?: DecisionContextV2['constraints'];
  expected: {
    facts?: {
      responsibilities?: Array<{ title: string; hasDeadline?: boolean; deadlineKind?: string; deadlineEndIso?: string; effortMinutes?: number; category?: string; consequenceKnown?: boolean }>;
      humanNeeds?: Array<{ kind: string; descriptionContains?: string }>;
      constraints?: Array<{ descriptionContains?: string; strength?: string }>;
    };
    analysis?: {
      analysisStatus?: string;
      statuses?: Array<{ title: string; feasibility?: string; availableMinutes?: number; bufferMinutes?: number; shortfallMinutes?: number }>;
      conflicts?: Array<{ type: string; involves?: string[] }>;
      blockingUnknowns?: string[];
    };
    recommendation?: {
      status?: string;
      nextMoveContains?: string;
      whyContains?: string;
      planContains?: string;
      riskContains?: string;
      mustNotContain?: string[];
    };
    correction?: {
      updatedText: string;
      expectedChanges: Array<{ title: string; deadlineKind?: string; deadlineEndIso?: string; effortMinutes?: number }>;
      newRecommendation?: {
        status?: string;
        nextMoveContains?: string;
        whyContains?: string;
      };
    };
  };
}

export const BENCHMARK_SCENARIOS: Scenario[] = [
  // ============================================================
  // SCENARIO 1 — Enough Time, But Almost No Buffer
  // ============================================================
  {
    id: 'S1',
    name: 'Enough Time, But Almost No Buffer',
    refIso: '2026-10-06T18:00:00+01:00', // Tue 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow 7 AM',
        deadline: exactDeadline('2026-10-07T06:00:00.000Z'),
        effort: statedEffort(360, '6 hours'),
        consequence: 'miss deadline',
        consequenceKnown: true,
      }),
      resp({
        title: 'Second assignment due in 3 days',
        deadline: exactDeadline('2026-10-09T22:59:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-06T18:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am'),
    ],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Assignment due tomorrow 7 AM', hasDeadline: true, deadlineKind: 'exact', effortMinutes: 360 },
          { title: 'Second assignment due in 3 days', hasDeadline: true, deadlineKind: 'exact', effortMinutes: 180 },
        ],
        humanNeeds: [{ kind: 'sleep' }],
      },
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow 7 AM', feasibility: 'TIGHT', availableMinutes: 420, bufferMinutes: 60 },
        ],
        conflicts: [],
      },
      recommendation: {
        status: 'RECOMMEND',
        nextMoveContains: 'Assignment due tomorrow 7 AM',
        mustNotContain: ['plenty of time', 'plenty of buffer'],
      },
    },
  },

  // ============================================================
  // SCENARIO 2 — The Deadline Is Actually Impossible
  // ============================================================
  {
    id: 'S2',
    name: 'The Deadline Is Actually Impossible',
    refIso: '2026-10-07T20:00:00+01:00', // Wed 8 PM Lagos = 19:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow 7 AM',
        deadline: exactDeadline('2026-10-08T06:00:00.000Z'),
        effort: statedEffort(480, '8 hours'),
        consequence: 'fail exam',
        consequenceKnown: true,
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-07T20:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am'),
    ],
    expected: {
      facts: {
        responsibilities: [{ title: 'Assignment due tomorrow 7 AM', effortMinutes: 480 }],
        humanNeeds: [{ kind: 'sleep' }],
      },
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow 7 AM', feasibility: 'INFEASIBLE', availableMinutes: 300, shortfallMinutes: 180 },
        ],
      },
      recommendation: {
        status: 'INFEASIBLE',
        nextMoveContains: 'shortfall',
        mustNotContain: ['wake up earlier', 'reduce sleep'],
      },
    },
  },

  // ============================================================
  // SCENARIO 3 — Two Deadlines, Different Urgency
  // ============================================================
  {
    id: 'S3',
    name: 'Two Deadlines, Different Urgency',
    refIso: '2026-10-08T17:00:00+01:00', // Thu 5 PM Lagos = 16:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow 10 AM',
        deadline: exactDeadline('2026-10-09T09:00:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
      resp({
        title: 'Fellowship application due tomorrow 11:59 PM',
        category: 'fellowship',
        deadline: exactDeadline('2026-10-09T22:59:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-08T17:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am'),
    ],
    expected: {
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow 10 AM', feasibility: 'FEASIBLE', availableMinutes: 600, bufferMinutes: 420 },
          { title: 'Fellowship application due tomorrow 11:59 PM', feasibility: 'FEASIBLE', availableMinutes: 1439, bufferMinutes: 1139 },
        ],
      },
      recommendation: {
        nextMoveContains: 'Assignment due tomorrow 10 AM',
        whyContains: 'due first',
      },
    },
  },

  // ============================================================
  // SCENARIO 4 — Fixed Community Commitment (Not a Conflict)
  // ============================================================
  {
    id: 'S4',
    name: 'Fixed Community Commitment (Not a Conflict)',
    refIso: '2026-10-09T16:00:00+01:00', // Fri 4 PM Lagos = 15:00 UTC
    responsibilities: [
      resp({
        title: 'School project due Saturday 10 AM',
        deadline: exactDeadline('2026-10-10T09:00:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
      resp({
        title: 'Personal task due Sunday',
        deadline: exactDeadline('2026-10-11T22:59:00.000Z'),
        effort: statedEffort(120, '2 hours'),
      }),
    ],
    humanNeeds: [
      fixedCommitmentNeed('2026-10-09T16:00:00+01:00', 'tomorrow', 5, 'pm', 7, 'pm', 'Community meeting'),
      sleepNeed('2026-10-09T16:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am'),
    ],
    expected: {
      facts: {
        humanNeeds: [{ kind: 'fixed-event', descriptionContains: 'Community meeting' }],
      },
      analysis: {
        statuses: [
          { title: 'School project due Saturday 10 AM', feasibility: 'FEASIBLE' },
        ],
        conflicts: [],
      },
      recommendation: {
        nextMoveContains: 'School project',
      },
    },
  },

  // ============================================================
  // SCENARIO 5 — Delegation Is Actually Available
  // ============================================================
  {
    id: 'S5',
    name: 'Delegation Is Actually Available',
    refIso: '2026-10-05T18:00:00+01:00', // Mon 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'Group presentation tomorrow 2 PM',
        deadline: exactDeadline('2026-10-06T13:00:00.000Z'),
        effort: statedEffort(240, '4 hours'),
        delegation: { possible: true, agreed: true, savesMinutes: 90, state: 'known' },
      }),
      resp({
        title: 'Assignment due Friday',
        deadline: exactDeadline('2026-10-09T22:59:00.000Z'),
        effort: statedEffort(240, '4 hours'),
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-05T18:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am')],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Group presentation tomorrow 2 PM', effortMinutes: 240 },
        ],
      },
      analysis: {
        statuses: [
          { title: 'Group presentation tomorrow 2 PM', feasibility: 'FEASIBLE', availableMinutes: 780, bufferMinutes: 630 },
        ],
      },
      recommendation: {
        nextMoveContains: 'Group presentation',
        whyContains: 'due first',
      },
    },
  },

  // ============================================================
  // SCENARIO 6 — Delegation Is Not Available
  // ============================================================
  {
    id: 'S6',
    name: 'Delegation Is Not Available',
    refIso: '2026-10-05T18:00:00+01:00', // Mon 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'Group presentation tomorrow 2 PM',
        deadline: exactDeadline('2026-10-06T13:00:00.000Z'),
        effort: statedEffort(240, '4 hours'),
        delegation: { possible: false, agreed: false, savesMinutes: null, state: 'known' },
      }),
      resp({
        title: 'Assignment due Friday',
        deadline: exactDeadline('2026-10-09T22:59:00.000Z'),
        effort: statedEffort(240, '4 hours'),
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-05T18:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am')],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Group presentation tomorrow 2 PM', effortMinutes: 240 },
        ],
      },
      recommendation: {
        mustNotContain: ['Ask your teammate', 'delegate'],
      },
    },
  },

  // ============================================================
  // SCENARIO 7 — The Missing Deadline Matters
  // ============================================================
  {
    id: 'S7',
    name: 'The Missing Deadline Matters',
    refIso: '2026-10-06T19:00:00+01:00', // Tue 7 PM Lagos = 18:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow morning',
        deadline: relativeDeadline('tomorrow morning', 'tomorrow morning'),
        effort: statedEffort(240, '4 hours'),
      }),
      resp({
        title: 'Fellowship task',
        category: 'fellowship',
        deadline: { expression: { kind: 'unknown', raw: '' }, precision: 'unknown', state: 'unknown' },
        effort: unknownEffort(),
      }),
      resp({
        title: 'Student association activity tomorrow evening',
        deadline: relativeDeadline('tomorrow evening', 'tomorrow evening'),
        effort: unknownEffort(),
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-06T19:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am')],
    expected: {
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow morning', feasibility: 'CANNOT_DETERMINE' },
          { title: 'Fellowship task', feasibility: 'CANNOT_DETERMINE' },
          { title: 'Student association activity tomorrow evening', feasibility: 'CANNOT_DETERMINE' },
        ],
        blockingUnknowns: ['Assignment due tomorrow morning: usable deadline', 'Fellowship task: usable deadline', 'Student association activity tomorrow evening: usable deadline'],
      },
      recommendation: {
        status: 'NEEDS_INPUT',
        nextMoveContains: 'Assignment due tomorrow morning',
      },
    },
  },

  // ============================================================
  // SCENARIO 8 — The Estimate Changes
  // ============================================================
  {
    id: 'S8',
    name: 'The Estimate Changes',
    refIso: '2026-10-07T18:00:00+01:00', // Wed 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'Academic project due tomorrow 10 AM',
        deadline: exactDeadline('2026-10-08T09:00:00.000Z'),
        effort: statedEffort(420, '7 hours'),
        consequence: 'miss deadline',
        consequenceKnown: true,
      }),
      resp({
        title: 'Fellowship task due Saturday',
        deadline: exactDeadline('2026-10-10T22:59:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-07T18:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am'),
    ],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Academic project due tomorrow 10 AM', effortMinutes: 420 },
        ],
      },
      analysis: {
        statuses: [
          { title: 'Academic project due tomorrow 10 AM', feasibility: 'FEASIBLE', availableMinutes: 600, bufferMinutes: 180 },
        ],
      },
      recommendation: {
        status: 'RECOMMEND',
        nextMoveContains: 'Academic project due tomorrow 10 AM',
        whyContains: 'due first',
      },
    },
  },

  // ============================================================
  // SCENARIO 9 — Sleep Is Explicitly Protected
  // ============================================================
  {
    id: 'S9',
    name: 'Sleep Is Explicitly Protected',
    refIso: '2026-10-06T21:00:00+01:00', // Tue 9 PM Lagos = 20:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow 10 AM',
        deadline: exactDeadline('2026-10-07T09:00:00.000Z'),
        effort: statedEffort(360, '6 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-06T21:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am'),
    ],
    expected: {
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow 10 AM', feasibility: 'TIGHT', availableMinutes: 420, bufferMinutes: 60 },
        ],
        conflicts: [],
      },
      recommendation: {
        mustNotContain: ['work through the night', 'skip sleep', 'reduce sleep'],
      },
    },
  },

  // ============================================================
  // SCENARIO 10 — Nothing Is Immediately Due
  // ============================================================
  {
    id: 'S10',
    name: 'Nothing Is Immediately Due',
    refIso: '2026-10-10T14:00:00+01:00', // Sat 2 PM Lagos = 13:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due Tuesday',
        deadline: exactDeadline('2026-10-13T22:59:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
      resp({
        title: 'Fellowship task due Thursday',
        category: 'fellowship',
        deadline: exactDeadline('2026-10-15T22:59:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
      resp({
        title: 'Personal errands',
        category: 'personal',
        deadline: relativeDeadline('this weekend', 'this weekend'),
        effort: unknownEffort(),
      }),
      resp({
        title: 'Student association event next weekend',
        deadline: relativeDeadline('next weekend', 'next weekend'),
        effort: unknownEffort(),
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-10T14:00:00+01:00', 'tonight', 12, 'am', 7, 'am')],
    expected: {
      analysis: {
        statuses: [
          { title: 'Assignment due Tuesday', feasibility: 'FEASIBLE' },
          { title: 'Fellowship task due Thursday', feasibility: 'FEASIBLE' },
          { title: 'Personal errands', feasibility: 'CANNOT_DETERMINE' },
          { title: 'Student association event next weekend', feasibility: 'CANNOT_DETERMINE' },
        ],
        conflicts: [],
        blockingUnknowns: ['Personal errands: usable deadline', 'Student association event next weekend: usable deadline'],
        analysisStatus: 'partial',
      },
      recommendation: {
        status: 'NEEDS_INPUT',
        nextMoveContains: 'Personal errands',
      },
    },
  },

  // ============================================================
  // SCENARIO 11 — Consequence Matters
  // ============================================================
  {
    id: 'S11',
    name: 'Consequence Matters',
    refIso: '2026-10-05T19:00:00+01:00', // Mon 7 PM Lagos = 18:00 UTC
    responsibilities: [
      resp({
        title: 'Personal task',
        category: 'personal',
        deadline: exactDeadline('2026-10-06T14:00:00.000Z'),
        effort: statedEffort(60, '1 hour'),
      }),
      resp({
        title: 'Client project',
        category: 'business',
        deadline: exactDeadline('2026-10-07T06:00:00.000Z'),
        effort: statedEffort(240, '4 hours'),
        consequence: 'could lose future work',
        consequenceKnown: true,
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-05T19:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am')],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Client project', consequenceKnown: true, effortMinutes: 240 },
        ],
      },
      analysis: {
        statuses: [
          { title: 'Client project', feasibility: 'FEASIBLE' },
          { title: 'Personal task', feasibility: 'FEASIBLE' },
        ],
      },
      recommendation: {
        nextMoveContains: 'Personal task',
        whyContains: 'due first',
      },
    },
  },

  // ============================================================
  // SCENARIO 12 — Dependencies
  // ============================================================
  {
    id: 'S12',
    name: 'Dependencies',
    refIso: '2026-10-06T18:00:00+01:00', // Tue 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'Collect and clean data',
        category: 'academic',
        deadline: exactDeadline('2026-10-08T08:00:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
      resp({
        title: 'Write report',
        category: 'academic',
        deadline: exactDeadline('2026-10-08T08:00:00.000Z'),
        effort: statedEffort(180, '3 hours'),
        dependsOn: ['collect and clean data'],
      }),
      resp({
        title: 'Fellowship presentation tomorrow 9 AM',
        category: 'fellowship',
        deadline: exactDeadline('2026-10-07T08:00:00.000Z'),
        effort: statedEffort(120, '2 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-06T18:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am'),
      sleepNeed('2026-10-06T18:00:00+01:00', 'day after tomorrow', 12, 'am', 7, 'am'),
    ],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Write report', effortMinutes: 180 },
          { title: 'Collect and clean data', effortMinutes: 180 },
        ],
      },
      analysis: {
        conflicts: [],
      },
      recommendation: {
        nextMoveContains: 'Collect and clean data',
        whyContains: 'due first',
      },
    },
  },

  // ============================================================
  // SCENARIO 13 — Strong Preference, Not Hard Block
  // ============================================================
  {
    id: 'S13',
    name: 'Strong Preference, Not Hard Block',
    refIso: '2026-10-07T18:00:00+01:00', // Wed 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'School project due tomorrow 10 AM',
        deadline: exactDeadline('2026-10-08T09:00:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
      resp({
        title: 'Assignment due next week',
        deadline: exactDeadline('2026-10-14T22:59:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-07T18:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am'),
      { kind: 'personal', description: 'time with sibling (1 hour, flexible if necessary)', window: null, state: 'known' },
    ],
    expected: {
      analysis: {
        statuses: [
          { title: 'School project due tomorrow 10 AM', feasibility: 'FEASIBLE' },
        ],
        conflicts: [],
      },
    },
  },

  // ============================================================
  // SCENARIO 14 — The Overwhelmed Student
  // ============================================================
  {
    id: 'S14',
    name: 'The Overwhelmed Student',
    refIso: '2026-10-11T20:00:00+01:00', // Sun 8 PM Lagos = 19:00 UTC
    responsibilities: [],
    humanNeeds: [sleepNeed('2026-10-11T20:00:00+01:00', 'tonight', 12, 'am', 7, 'am')],
    expected: {
      analysis: {
        analysisStatus: 'blocked',
        blockingUnknowns: ['responsibilities'],
      },
      recommendation: {
        status: 'NEEDS_INPUT',
        mustNotContain: ['invent', 'hallucinate', 'assignment', 'exam', 'fellowship'],
      },
    },
  },

  // ============================================================
  // SCENARIO 15 — Real-Time Reassessment (Feasible → Infeasible)
  // ============================================================
  {
    id: 'S15',
    name: 'Real-Time Reassessment',
    refIso: '2026-10-05T18:00:00+01:00', // Mon 6 PM Lagos = 17:00 UTC
    responsibilities: [
      resp({
        title: 'Client project due Tuesday 7 AM',
        category: 'business',
        deadline: exactDeadline('2026-10-06T06:00:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
      resp({
        title: 'Academic assignment due Wednesday',
        deadline: exactDeadline('2026-10-07T22:59:00.000Z'),
        effort: statedEffort(180, '3 hours'),
      }),
    ],
    humanNeeds: [
      sleepNeed('2026-10-05T18:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am'),
    ],
    expected: {
      analysis: {
        statuses: [
          { title: 'Client project due Tuesday 7 AM', feasibility: 'FEASIBLE', availableMinutes: 420, bufferMinutes: 120 },
        ],
      },
      correction: {
        updatedText: 'I have only completed about one hour of the project. I now estimate I still need 5 hours of work. I still need my six hours of sleep, and the deadline is still 7 AM.',
        expectedChanges: [
          { title: 'Client project due Tuesday 7 AM', effortMinutes: 300 },
        ],
        newRecommendation: {
          status: 'INFEASIBLE',
          nextMoveContains: 'shortfall',
          whyContains: '3.5 hours available',
        },
      },
    },
  },

  // ============================================================
  // SCENARIO 16 — Paired Time Test (Same Situation, Different Time)
  // ============================================================
  {
    id: 'S16A',
    name: 'Paired Time Test - Version A (2 PM)',
    refIso: '2026-10-06T14:00:00+01:00', // Tue 2 PM Lagos = 13:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow 8 AM',
        deadline: exactDeadline('2026-10-07T07:00:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-06T14:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am')],
    expected: {
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow 8 AM', feasibility: 'FEASIBLE', availableMinutes: 660, bufferMinutes: 360 },
        ],
      },
    },
  },
  {
    id: 'S16B',
    name: 'Paired Time Test - Version B (11 PM)',
    refIso: '2026-10-06T23:00:00+01:00', // Tue 11 PM Lagos = 22:00 UTC
    responsibilities: [
      resp({
        title: 'Assignment due tomorrow 8 AM',
        deadline: exactDeadline('2026-10-07T07:00:00.000Z'),
        effort: statedEffort(300, '5 hours'),
      }),
    ],
    humanNeeds: [sleepNeed('2026-10-06T23:00:00+01:00', 'tomorrow', 12, 'am', 7, 'am')],
    expected: {
      analysis: {
        statuses: [
          { title: 'Assignment due tomorrow 8 AM', feasibility: 'INFEASIBLE', availableMinutes: 120, shortfallMinutes: 180 },
        ],
      },
    },
  },

  // ============================================================
  // REAL-WORLD REGRESSION SCENARIO (Saturday Oct 10, 10:21 AM)
  // ============================================================
  {
    id: 'RW1',
    name: 'Real-World Regression - Initial',
    refIso: REAL_WORLD_REF,
    responsibilities: [
      resp({
        title: 'Client backend feature',
        category: 'business',
        deadline: approxDeadline('2026-10-10T16:00:00.000Z', 60, '5 PM today'),
        effort: statedEffort(180, '3 hours'),
        consequence: 'client update expected',
        consequenceKnown: true,
      }),
      resp({
        title: 'Personal project',
        category: 'personal',
        deadline: relativeDeadline('today', 'today'),
        effort: statedEffort(120, '2 hours'),
      }),
      resp({
        title: 'Fellowship meeting',
        category: 'fellowship',
        deadline: timeRangeDeadline({ hour: 1, minute: 0, meridiem: 'pm' }, { hour: 2, minute: 30, meridiem: 'pm' }, 'today', '1 PM to 2:30 PM'),
        effort: null,
        flexibility: 'fixed',
      }),
    ],
    humanNeeds: [
      mealNeed('Need to eat breakfast (haven\'t eaten yet)'),
      sleepNeed(REAL_WORLD_REF, 'tonight', 12, 'am', 7, 'am'),
    ],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Client backend feature', effortMinutes: 180, category: 'business' },
          { title: 'Personal project', effortMinutes: 120, category: 'personal' },
          { title: 'Fellowship meeting', hasDeadline: true, deadlineKind: 'time-range', category: 'fellowship' },
        ],
        humanNeeds: [
          { kind: 'meals', descriptionContains: 'breakfast' },
          { kind: 'sleep' },
        ],
      },
      analysis: {
        statuses: [
          { title: 'Client backend feature', feasibility: 'FEASIBLE' },
          { title: 'Fellowship meeting', feasibility: 'CANNOT_DETERMINE' },
        ],
        conflicts: [],
      },
      recommendation: {
        status: 'RECOMMEND',
        nextMoveContains: 'Client backend feature',
        mustNotContain: ['4 PM', '4:00 PM', 'fixed meeting', 'skip', 'ignore'],
      },
    },
  },
  {
    id: 'RW2',
    name: 'Real-World Regression - After Correction',
    refIso: REAL_WORLD_REF,
    responsibilities: [
      resp({
        title: 'Client backend feature',
        category: 'business',
        deadline: exactDeadline('2026-10-11T09:00:00.000Z'),
        effort: statedEffort(180, '3 hours'),
        consequence: 'complete feature delivery',
        consequenceKnown: true,
      }),
      resp({
        title: 'Personal project',
        category: 'personal',
        deadline: approxDeadline('2026-10-11T22:59:00.000Z', 60, 'end of day tomorrow'),
        effort: statedEffort(120, '2 hours'),
      }),
      resp({
        title: 'Fellowship meeting',
        category: 'fellowship',
        deadline: timeRangeDeadline({ hour: 1, minute: 0, meridiem: 'pm' }, { hour: 2, minute: 30, meridiem: 'pm' }, 'today', '1 PM to 2:30 PM'),
        effort: null,
        flexibility: 'fixed',
      }),
    ],
    humanNeeds: [
      mealNeed('Need to eat breakfast'),
      sleepNeed(REAL_WORLD_REF, 'tonight', 12, 'am', 7, 'am'),
      fixedCommitmentNeed(REAL_WORLD_REF, 'today', 4, 'pm', 4, 'pm', '30-minute phone call at 4 PM'),
    ],
    expected: {
      facts: {
        responsibilities: [
          { title: 'Client backend feature', deadlineKind: 'instant', deadlineEndIso: '2026-10-11T09:00:00.000Z', effortMinutes: 180 },
          { title: 'Personal project', deadlineKind: 'approximate', effortMinutes: 120 },
        ],
        humanNeeds: [
          { kind: 'meals' },
          { kind: 'sleep' },
          { kind: 'fixed-event', descriptionContains: 'phone call' },
        ],
      },
      analysis: {
        statuses: [
          { title: 'Client backend feature', feasibility: 'FEASIBLE' },
          { title: 'Personal project', feasibility: 'FEASIBLE' },
        ],
        conflicts: [],
      },
      recommendation: {
        status: 'RECOMMEND',
        nextMoveContains: 'Client backend feature',
        whyContains: '10 AM',
      },
    },
  },
];

export function buildScenarioContext(scenario: Scenario): DecisionContextV2 {
  const reference = refAt(scenario.refIso);
  return {
    reference,
    rawText: `Benchmark: ${scenario.name}`,
    responsibilities: scenario.responsibilities,
    constraints: scenario.constraints ?? [],
    humanNeeds: scenario.humanNeeds,
    unknowns: [],
  };
}