import { describe, expect, it } from 'vitest';
import { DecisionContextV2Schema } from './spec';
import { DecisionParserService, resolveTimezone } from './parser.service';
import type { DraftResponsibility, ExtractionDraft } from './extraction';
import { ExtractionDraftSchema } from './extraction';
import { createReference } from '../temporal/temporal';

const parser = new DecisionParserService(null as never);
const ref = () => createReference({ nowIso: '2026-10-06T18:00:00+01:00', timezone: 'Africa/Lagos' });

function draft(over: Partial<ExtractionDraft> = {}): ExtractionDraft {
  return { responsibilities: [], humanNeeds: [], constraints: [], ...over };
}
const resp = (over: Partial<DraftResponsibility> = {}): DraftResponsibility => ({
  title: 'Assignment',
  description: '',
  dayText: 'tomorrow',
  timeText: '7 AM',
  precision: 'exact',
  meridiem: 'am',
  effortMinutes: null,
  effortStated: false,
  effortNote: '',
  category: 'academic',
  consequence: '',
  flexibility: null,
  delegationPossible: null,
  delegationAgreed: false,
  delegationSavesMinutes: null,
  dependsOnText: '',
  statusText: '',
  ...over,
});

describe('extraction boundary tolerates real model output styles', () => {
  it('accepts explicit JSON nulls for every optional field (live model behavior)', () => {
    const raw = {
      responsibilities: [{
        title: 'Fellowship', description: null, dayText: 'tomorrow', timeText: null,
        precision: 'relative', meridiem: null, effortMinutes: null, effortStated: false,
        effortNote: null, category: 'fellowship', consequence: null, flexibility: null,
        delegationPossible: null, delegationAgreed: null, delegationSavesMinutes: null,
        dependsOnText: null, statusText: null,
      }],
      humanNeeds: [],
      constraints: [],
    };
    const parsed = ExtractionDraftSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it('accepts the gpt-oss-20b shape observed live (caps, "" blanks, string clocks, medium strengths)', () => {
    const raw = {
      responsibilities: [{
        title: 'Assignment',
        description: 'Complete the assignment.',
        dayText: 'tomorrow',
        timeText: 'around 7',
        precision: 'approximate',
        meridiem: 'PM',
        effortMinutes: null,
        effortStated: 'unknown',
        effortNote: 'uncertain duration',
        category: 'Academic',
        consequence: '',
        flexibility: 'medium',
        delegationPossible: false,
        delegationAgreed: false,
        delegationSavesMinutes: 0,
        dependsOnText: '',
        statusText: 'not started',
      }],
      humanNeeds: [{
        kind: 'Sleep',
        description: 'Need to sleep.',
        windowText: 'night',
        startClock: '10:00 PM',
        endClock: '6:00 AM',
      }],
      constraints: [{ description: 'Uncertain duration', strength: 'medium' }],
    };
    const parsed = ExtractionDraftSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const r = parsed.data.responsibilities[0];
      expect(r.meridiem).toBe('pm');
      expect(r.effortStated).toBe(false);
      expect(r.flexibility).toBeNull();
      expect(r.delegationSavesMinutes).toBeNull();
      const n = parsed.data.humanNeeds[0];
      expect(n.startClock).toMatchObject({ hour: 10, minute: 0, meridiem: 'pm' });
      expect(n.endClock).toMatchObject({ hour: 6, minute: 0, meridiem: 'am' });
      expect(parsed.data.constraints[0].strength).toBeNull();
    }
  });
});

describe('resolveTimezone hierarchy', () => {
  it('request → user → Africa/Lagos default', () => {
    expect(resolveTimezone('UTC')).toBe('UTC');
    expect(resolveTimezone(undefined, 'America/New_York')).toBe('America/New_York');
    expect(resolveTimezone()).toBe('Africa/Lagos');
    expect(resolveTimezone('', null)).toBe('Africa/Lagos');
  });
});

describe('buildContext — effort honesty', () => {
  it('5. unknown effort stays null/unknown + listed non-blocking', () => {
    const b = parser.buildContext(draft({ responsibilities: [resp()] }), 'text', ref());
    expect(b.context.responsibilities[0].effort).toMatchObject({ minutes: null, confidence: 'unknown', state: 'unknown' });
    const u = b.context.unknowns.find((x) => x.field === 'Assignment: effort');
    expect(u).toMatchObject({ blocking: false });
  });

  it('6. explicit effort extracted with stated confidence', () => {
    const b = parser.buildContext(
      draft({ responsibilities: [resp({ effortMinutes: 240, effortStated: true })] }),
      'text',
      ref(),
    );
    expect(b.context.responsibilities[0].effort).toMatchObject({ minutes: 240, confidence: 'stated', state: 'known' });
    expect(b.context.unknowns.some((x) => x.field.endsWith(': effort'))).toBe(false);
  });

  it('6b. unstated minutes are discarded, note preserved (no fabrication)', () => {
    const b = parser.buildContext(
      draft({ responsibilities: [resp({ effortMinutes: 300, effortStated: false, effortNote: 'small' })] }),
      'text',
      ref(),
    );
    expect(b.context.responsibilities[0].effort).toMatchObject({ minutes: null, note: 'small' });
  });
});

describe('buildContext — sleep and human needs', () => {
  it('7. explicit sleep window extracted exactly', () => {
    const b = parser.buildContext(
      draft({
        humanNeeds: [{
          kind: 'sleep', description: 'sleep', windowText: 'midnight to 6',
          startClock: { hour: 12, minute: 0, meridiem: 'am' },
          endClock: { hour: 6, minute: 0, meridiem: 'am' },
        }],
      }),
      'text',
      ref(),
    );
    const need = b.context.humanNeeds[0];
    expect(need.kind).toBe('sleep');
    expect(need.window?.kind).toBe('time-range');
    expect(b.resolutions['need:0:window']).toEqual({
      kind: 'window',
      startIso: '2026-10-05T23:00:00.000Z', // Tue 00:00+01:00
      endIso: '2026-10-06T05:00:00.000Z', // Tue 06:00+01:00
    });
  });

  it('8. sleep without duration: need kept, window null, unknown non-blocking', () => {
    const b = parser.buildContext(
      draft({ humanNeeds: [{ kind: '', description: 'I need to sleep', windowText: '', startClock: null, endClock: null }] }),
      'text',
      ref(),
    );
    expect(b.context.humanNeeds[0]).toMatchObject({ kind: 'sleep', window: null, state: 'unknown' });
    const u = b.context.unknowns.find((x) => x.field.includes('sleep'));
    expect(u?.blocking).toBe(false);
  });
});

describe('buildContext — constraints and commitments', () => {
  it('9. hard stays hard, soft stays soft, unclear → unknown', () => {
    const b = parser.buildContext(
      draft({
        constraints: [
          { description: "can't reduce sleep", strength: 'hard' },
          { description: "prefer not to work late", strength: 'preference' },
          { description: 'vague thing', strength: null },
        ],
      }),
      'text',
      ref(),
    );
    expect(b.context.constraints.map((c) => c.strength)).toEqual(['hard', 'preference', 'unknown']);
  });

  it('10. fellowship tomorrow without time: dated but time-unknown', () => {
    const b = parser.buildContext(
      draft({ responsibilities: [resp({ title: 'Fellowship', category: 'fellowship', dayText: 'tomorrow', timeText: '', precision: 'relative', meridiem: null })] }),
      'text',
      ref(),
    );
    const r = b.context.responsibilities[0];
    expect(r.deadline?.expression.kind).toBe('relative-date');
    expect(r.deadline?.state).toBe('inferred');
    expect(b.resolutions['responsibility:0:deadline']?.kind).toBe('window');
  });
});

describe('buildContext — multiple, domain-neutral responsibilities', () => {
  it('11+12. parses mixed student life without domain bias', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [
          resp({ title: 'Client project', category: 'business', dayText: 'Wednesday', timeText: '7 AM', precision: 'exact', meridiem: 'am' }),
          resp({ title: 'Time with sibling', category: 'family', dayText: '', timeText: '', precision: 'unknown', meridiem: null }),
          resp({ title: 'Studio session', category: 'creative', dayText: 'Friday', timeText: '', precision: 'relative', meridiem: null }),
          resp({ title: 'API bugfix', category: 'work', dayText: 'tomorrow', timeText: '', precision: 'relative', meridiem: null }),
        ],
      }),
      'text',
      ref(),
    );
    const cats = b.context.responsibilities.map((r) => r.category);
    expect(cats).toEqual(['business', 'personal', 'personal', 'work']);
    expect(b.context.responsibilities).toHaveLength(4);
  });
});

describe('buildContext — unknowns and clarification', () => {
  it('13. vague input invents nothing', () => {
    const b = parser.buildContext(
      draft({ responsibilities: [resp({ title: 'Stuff', category: '', dayText: '', timeText: '', precision: 'unknown', meridiem: null })] }),
      'text',
      ref(),
    );
    const res = b.resolutions['responsibility:0:deadline'];
    expect(res?.kind).toBe('unresolved');
    expect(b.context.responsibilities[0].effort?.minutes).toBeNull();
    expect(b.context.unknowns.length).toBeGreaterThan(0);
  });

  it('14a. bare "7" blocks with a question', () => {
    const b = parser.buildContext(
      draft({ responsibilities: [resp({ title: 'Assignment', dayText: 'tomorrow', timeText: '7', precision: 'approximate', meridiem: null })] }),
      'text',
      ref(),
    );
    const u = b.context.unknowns.find((x) => x.field === 'Assignment: exact time');
    expect(u?.blocking).toBe(true);
    expect(b.questions[0]).toContain('morning');
  });

  it('14b. single responsibility, no timing at all → blocking "when due"', () => {
    const b = parser.buildContext(
      draft({ responsibilities: [resp({ title: 'Assignment', dayText: '', timeText: '', precision: 'unknown', meridiem: null })] }),
      'text',
      ref(),
    );
    expect(b.context.unknowns.find((x) => x.field === 'Assignment: deadline')?.blocking).toBe(true);
    expect(b.questions).toContain('When is "Assignment" due?');
  });

  it('14c. several responsibilities, none dated → collective blocking question first', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [
          resp({ title: 'A', dayText: '', timeText: '', precision: 'unknown', meridiem: null }),
          resp({ title: 'B', dayText: '', timeText: '', precision: 'unknown', meridiem: null }),
        ],
      }),
      'text',
      ref(),
    );
    expect(b.context.unknowns.find((x) => x.field === 'earliest deadline')?.blocking).toBe(true);
    expect(b.questions[0]).toBe('Which of these has the earliest deadline?');
  });

  it('14d. questions capped at 3, blocking first', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [1, 2, 3, 4, 5].map((n) => resp({ title: `Task ${n}`, dayText: '', timeText: '', precision: 'unknown', meridiem: null })),
      }),
      'text',
      ref(),
    );
    expect(b.questions.length).toBeLessThanOrEqual(3);
    expect(b.questions[0]).toBe('Which of these has the earliest deadline?');
  });

  it('15. messy overwhelmed input survives validation with unknowns, no precision invented', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [
          resp({ title: 'assignment', category: 'academic', dayText: 'tomorrow', timeText: 'around 7', precision: 'approximate', meridiem: null, statusText: "haven't started" }),
          resp({ title: 'fellowship', category: 'fellowship', dayText: 'tomorrow', timeText: '', precision: 'relative', meridiem: null }),
        ],
        humanNeeds: [{ kind: '', description: 'need to sleep', windowText: '', startClock: null, endClock: null }],
      }),
      "I have an assignment due tomorrow around 7. I haven't started. I also have fellowship tomorrow and I need to sleep. I don't know how long the assignment will take.",
      ref(),
    );
    const validated = DecisionContextV2Schema.safeParse(b.context);
    expect(validated.success).toBe(true);
    const r0 = b.context.responsibilities[0];
    expect(r0.status).toBe('not-started');
    expect(r0.effort?.minutes).toBeNull();
    // "around 7" without meridiem: relative-time expression, needs-clarification state.
    expect(r0.deadline?.precision).toBe('relative');
    expect(r0.deadline?.state).toBe('needs-clarification');
    // No exact instants anywhere in resolutions.
    expect(Object.values(b.resolutions).some((r) => r.kind === 'instant')).toBe(false);
    expect(b.context.unknowns.length).toBeGreaterThan(0);
  });
});

describe('buildContext - Phase 6 fidelity rules', () => {
  it('must-attend wording upgrades unknown flexibility to fixed, never downgrades', () => {
    const fixed = parser.buildContext(
      draft({
        responsibilities: [
          resp({ title: 'Fellowship meeting', description: 'I really want to attend, responsible for part', flexibility: null }),
        ],
      }),
      'x',
      ref(),
    );
    expect(fixed.context.responsibilities[0].flexibility).toBe('fixed');

    const kept = parser.buildContext(
      draft({
        responsibilities: [
          resp({ title: 'Gym', description: 'must attend session', flexibility: 'flexible' }),
        ],
      }),
      'x',
      ref(),
    );
    // Explicit LLM label wins over marker inference.
    expect(kept.context.responsibilities[0].flexibility).toBe('flexible');
  });

  it('agreed help implies possible help; silence stays null', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [
          resp({ title: 'Slides', delegationPossible: false, delegationAgreed: true, delegationSavesMinutes: 60 }),
          resp({ title: 'Essay', delegationPossible: true, delegationAgreed: false, delegationSavesMinutes: null }),
          resp({ title: 'Chores', delegationPossible: null, delegationAgreed: false, delegationSavesMinutes: null }),
        ],
      }),
      'x',
      ref(),
    );
    const [slides, essay, chores] = b.context.responsibilities;
    expect(slides.delegation).toMatchObject({ possible: true, agreed: true });
    expect(essay.delegation).toMatchObject({ possible: true, agreed: false });
    expect(chores.delegation).toBeNull();
  });
});

describe('buildContext - deterministic human needs augmentation', () => {
  it('adds sleep need when explicitly stated but LLM misses it', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [resp({ title: 'Assignment', dayText: 'tomorrow', timeText: '7 PM', precision: 'approximate', meridiem: 'pm', statusText: "haven't started" })],
        humanNeeds: [], // LLM returned none
      }),
      "I have an assignment due tomorrow at 7pm. I need to sleep tonight because I've been exhausted.",
      ref(),
    );
    const sleepNeed = b.context.humanNeeds.find((n) => n.kind === 'sleep');
    expect(sleepNeed).toBeDefined();
    expect(sleepNeed?.description).toContain('explicitly stated');
  });

  it('adds meals need when explicitly stated but LLM misses it', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [resp({ title: 'Assignment', dayText: 'tomorrow', timeText: '7 PM', precision: 'approximate', meridiem: 'pm', statusText: "haven't started" })],
        humanNeeds: [],
      }),
      "I have an assignment due tomorrow at 7pm. I haven't eaten yet and I'm hungry.",
      ref(),
    );
    const mealNeed = b.context.humanNeeds.find((n) => n.kind === 'meals');
    expect(mealNeed).toBeDefined();
    expect(mealNeed?.description).toContain('explicitly stated');
  });

  it('does not duplicate needs already extracted by LLM', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [resp({ title: 'Assignment', dayText: 'tomorrow', timeText: '7 PM', precision: 'approximate', meridiem: 'pm', statusText: "haven't started" })],
        humanNeeds: [{ kind: 'sleep', description: 'Need sleep tonight', windowText: '', startClock: null, endClock: null }],
      }),
      "I have an assignment due tomorrow at 7pm. I need to sleep tonight.",
      ref(),
    );
    const sleepNeeds = b.context.humanNeeds.filter((n) => n.kind === 'sleep');
    expect(sleepNeeds).toHaveLength(1);
  });

  it('does not invent needs not mentioned in the text', () => {
    const b = parser.buildContext(
      draft({
        responsibilities: [resp({ title: 'Assignment', dayText: 'tomorrow', timeText: '7 PM', precision: 'approximate', meridiem: 'pm', statusText: "haven't started" })],
        humanNeeds: [],
      }),
      "I have an assignment due tomorrow at 7pm. It's straightforward.",
      ref(),
    );
    expect(b.context.humanNeeds.length).toBe(0);
  });
});
