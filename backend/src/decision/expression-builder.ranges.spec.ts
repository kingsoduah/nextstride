import { describe, expect, it } from 'vitest';
import {
  buildTemporal,
  buildTimeRange,
  consistentMeridiem,
  resolveRangeMeridiem,
  splitTimeRange,
  splitTrailingClock,
} from './expression-builder';
import { createReference } from '../temporal/temporal';

// Lagos anchor week: Mon 2026-10-05 .. Sun 2026-10-11.
const refTue6pm = () => createReference({ nowIso: '2026-10-06T18:00:00+01:00', timezone: 'Africa/Lagos' });

describe('splitTimeRange', () => {
  it('splits explicit ranges with assorted separators', () => {
    expect(splitTimeRange('4pm to 6pm')).toEqual({ startText: '4pm', endText: '6pm' });
    expect(splitTimeRange('4-6pm')).toEqual({ startText: '4', endText: '6pm' });
    expect(splitTimeRange('from 4 until 6pm')).toEqual({ startText: '4', endText: '6pm' });
    expect(splitTimeRange('2:00 PM – 4:00 PM')).toEqual({ startText: '2:00 PM', endText: '4:00 PM' });
  });
  it('rejects non-ranges and digit-less clauses', () => {
    expect(splitTimeRange('tomorrow at 7 AM')).toBeNull();
    expect(splitTimeRange('morning')).toBeNull();
    expect(splitTimeRange('well-known')).toBeNull();
    expect(splitTimeRange('to 6pm')).toBeNull();
  });
});

describe('resolveRangeMeridiem', () => {
  it('own markers always win', () => {
    expect(resolveRangeMeridiem('4pm', '4pm to 6pm', 4)).toBe('pm');
    expect(resolveRangeMeridiem('6am', '4pm to 6am', 6)).toBe('am');
  });
  it('a single distinct marker scopes the whole range; midnight alone stays ambiguous', () => {
    expect(resolveRangeMeridiem('4', '4 to 6pm', 4)).toBe('pm');
    expect(resolveRangeMeridiem('6', '4pm to 6', 6)).toBe('pm');
    // "midnight" names an endpoint, not a meridiem for the other end — ask.
    expect(resolveRangeMeridiem('6', 'midnight to 6', 6)).toBeNull();
  });
  it('conflicting own markers each win their own end (no invention, no question needed)', () => {
    expect(resolveRangeMeridiem('4', '4am to 6pm', 4)).toBe('am');
  });
  it('period consistency resolves only unique readings', () => {
    expect(resolveRangeMeridiem('7', 'tomorrow morning 7 to 9', 7)).toBe('am');
    expect(resolveRangeMeridiem('6', 'tomorrow evening around 6', 6)).toBe('pm');
    expect(resolveRangeMeridiem('7', 'I can work on it at 7', 7)).toBeNull();
    expect(resolveRangeMeridiem('4', 'tomorrow morning 4 to 6', 4)).toBeNull();
    expect(consistentMeridiem(12, 'at noon')).toBe('pm');
    expect(consistentMeridiem(12, 'morning')).toBeNull();
  });
});

describe('splitTrailingClock', () => {
  it('recovers clocks stranded in dayText', () => {
    expect(splitTrailingClock('tomorrow evening around 6pm')).toEqual({ dayText: 'tomorrow evening', timeText: 'around 6pm' });
    expect(splitTrailingClock('Friday 4pm to 6pm')).toEqual({ dayText: 'Friday', timeText: '4pm to 6pm' });
  });
  it('leaves clean inputs alone', () => {
    expect(splitTrailingClock('tomorrow')).toBeNull();
    expect(splitTrailingClock('morning')).toBeNull();
    expect(splitTrailingClock('')).toBeNull();
  });
});

describe('buildTemporal ranges (acceptance: "tomorrow from 4pm to 6pm")', () => {
  it('resolves an explicit same-meridiem range to a window, never asks AM/PM', () => {
    const { expression, resolved } = buildTemporal(
      { dayText: 'tomorrow', timeText: '4pm to 6pm', precision: 'relative', raw: 'tomorrow from 4pm to 6pm' },
      refTue6pm(),
    );
    expect(expression.kind).toBe('time-range');
    // Wed 16:00+01:00 → 15:00Z ; Wed 18:00+01:00 → 17:00Z
    expect(resolved).toEqual({ kind: 'window', startIso: '2026-10-07T15:00:00.000Z', endIso: '2026-10-07T17:00:00.000Z' });
  });

  it('single-marker range scopes both ends', () => {
    const { resolved } = buildTemporal({ timeText: '4 to 6pm', raw: '4 to 6pm' }, refTue6pm());
    expect(resolved.kind).toBe('window');
    if (resolved.kind === 'window') {
      expect(resolved.startIso).toBe('2026-10-06T15:00:00.000Z');
      expect(resolved.endIso).toBe('2026-10-06T17:00:00.000Z');
    }
  });

  it('explicitly marked ends form a coherent window ("4am to 6pm" is 14 hours, not a conflict)', () => {
    const { expression, resolved } = buildTemporal({ timeText: '4am to 6pm', raw: '4am to 6pm' }, refTue6pm());
    expect(expression.kind).toBe('time-range');
    expect(resolved).toEqual({
      kind: 'window',
      startIso: '2026-10-06T03:00:00.000Z',
      endIso: '2026-10-06T17:00:00.000Z',
    });
  });

  it('mixed-marker scope without adjacent markers stays ambiguous', () => {
    expect(resolveRangeMeridiem('5', 'setup at 6am, teardown at 6pm, work 5 to 7', 5)).toBeNull();
  });

  it('bare range with no markers and no period still asks', () => {
    const { resolved } = buildTemporal({ timeText: '4 to 6', raw: '4 to 6' }, refTue6pm());
    expect(resolved.kind).toBe('needs-clarification');
  });

  it('explicit clock beats the period word ("tomorrow evening around 6pm" → ±30min window)', () => {
    const { expression, resolved } = buildTemporal(
      { dayText: 'tomorrow', timeText: 'evening around 6pm', precision: 'approximate', raw: 'tomorrow evening around 6pm' },
      refTue6pm(),
    );
    expect(expression.kind).toBe('approximate');
    expect(resolved).toEqual({
      kind: 'window',
      startIso: '2026-10-07T16:30:00.000Z',
      endIso: '2026-10-07T17:30:00.000Z',
    });
  });

  it('dayText carrying the clock is split, not dropped ("tomorrow evening around 6pm")', () => {
    const { expression, resolved } = buildTemporal(
      { dayText: 'tomorrow evening around 6pm', precision: 'approximate', raw: 'tomorrow evening around 6pm' },
      refTue6pm(),
    );
    expect(expression.kind).toBe('approximate');
    expect(resolved).toEqual({
      kind: 'window',
      startIso: '2026-10-07T16:30:00.000Z',
      endIso: '2026-10-07T17:30:00.000Z',
    });
  });
});

describe('buildTimeRange with named hours', () => {
  it('"midnight to 6" resolves without asking', () => {
    const { resolved } = buildTimeRange(
      { hour: 12, minute: 0, meridiem: null },
      { hour: 6, minute: 0, meridiem: 'am' },
      '',
      'midnight to 6',
      refTue6pm(),
    );
    expect(resolved.kind).toBe('window');
  });
});
