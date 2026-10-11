import type { TemporalExpression, TemporalReference } from '../decision/spec';

/**
 * NextStride V2 — Phase 1: deterministic temporal core.
 *
 * Reliability boundary: everything time-related that MUST be right is
 * computed here with pure functions — never by the LLM. The LLM (Phase 4)
 * receives resolved instants/windows plus explicit unknowns.
 *
 * Rules:
 * - "Now" comes from the system clock at the API boundary (or an explicit
 *   override for tests/benchmarks). Nothing in here reads the clock itself
 *   except `systemNowIso()`.
 * - Timezones are IANA names attached to the user's context; the default is
 *   documented below and overridable per request. No single zone is special.
 * - Approximation is preserved as windows; missing meridiem yields
 *   needs-clarification with both candidates, never a silent guess.
 * - No new dependencies: `Intl` only.
 */

/** Default reasoning timezone (first users are Nigerian students; override freely). */
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

export function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
}

/** System clock, ISO. The ONLY place wall-clock time may enter the system. */
export function systemNowIso(): string {
  return new Date().toISOString();
}

export function createReference(input?: { nowIso?: string; timezone?: string }): TemporalReference {
  const timezone = input?.timezone ?? DEFAULT_TIMEZONE;
  assertValidTimezone(timezone);
  const nowIso = input?.nowIso ?? systemNowIso();
  const parsed = new Date(nowIso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid nowIso: ${nowIso}`);
  return { nowIso: parsed.toISOString(), timezone };
}

// ---------------------------------------------------------------------------
// Zoned calendar math (pure, DST-safe via offset iteration).
// ---------------------------------------------------------------------------

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 0=Sunday..6=Saturday
}

export function zonedParts(date: Date, timezone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday as string] ?? 0,
  };
}

/** Offset of `timezone` at `date`, in ms (local = UTC + offset). */
export function tzOffsetMs(timezone: string, date: Date): number {
  const asUTC = Date.parse(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(date)
      .replace(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z'),
  );
  return asUTC - date.getTime();
}

/** Interpret a wall-clock reading in `timezone` as a UTC instant. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 2; i += 1) {
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute) - tzOffsetMs(timezone, guess));
  }
  return guess;
}

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

export function addDaysYmd(ymd: Ymd, n: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

// ---------------------------------------------------------------------------
// Relative-date resolution ("tomorrow", "Friday", "in two days").
// Convention: weekday names resolve to the nearest such weekday ON OR AFTER
// the reference date ("due Friday" said on Friday means today).
// ---------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Deterministic number words only (one–twelve). Richer language parsing is Phase 2.
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

export type DayResolution =
  | { status: 'resolved'; ymd: Ymd }
  | { status: 'range'; start: Ymd; end: Ymd }
  | { status: 'unresolved'; reason: string };

export function resolveDayExpression(expression: string, ref: TemporalReference): DayResolution {
  const now = new Date(ref.nowIso);
  const zp = zonedParts(now, ref.timezone);
  const today: Ymd = { year: zp.year, month: zp.month, day: zp.day };
  const expr = expression.trim().toLowerCase();
  if (expr === 'today') return { status: 'resolved', ymd: today };
  if (expr === 'tomorrow') return { status: 'resolved', ymd: addDaysYmd(today, 1) };
  const inNDays = expr.match(/^in[-\s]?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[-\s]?days?$/);
  if (inNDays) {
    const raw = inNDays[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    return { status: 'resolved', ymd: addDaysYmd(today, n) };
  }
  const wdIndex = WEEKDAYS.indexOf(expr);
  if (wdIndex >= 0) {
    const delta = (wdIndex - zp.weekday + 7) % 7;
    return { status: 'resolved', ymd: addDaysYmd(today, delta) };
  }
  if (expr === 'this-week') {
    // Monday..Sunday containing the reference date.
    const mondayDelta = (zp.weekday + 6) % 7;
    return { status: 'range', start: addDaysYmd(today, -mondayDelta), end: addDaysYmd(today, 6 - mondayDelta) };
  }
  if (expr === 'weekend' || expr === 'this-weekend') {
    const satDelta = (6 - zp.weekday + 7) % 7;
    const sat = addDaysYmd(today, satDelta);
    return { status: 'range', start: sat, end: addDaysYmd(sat, 1) };
  }
  const isoDate = expr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return {
      status: 'resolved',
      ymd: { year: Number(isoDate[1]), month: Number(isoDate[2]), day: Number(isoDate[3]) },
    };
  }
  return { status: 'unresolved', reason: `Unrecognized day expression: "${expression}"` };
}

/** Named day periods, zoned (end may fall on the next calendar day). */
export const DAY_PERIODS: Record<string, { startHour: number; endHour: number }> = {
  morning: { startHour: 6, endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening: { startHour: 17, endHour: 22 },
  night: { startHour: 22, endHour: 30 }, // ends 06:00 next day
};

export function resolveDayPeriod(
  expression: string,
  ymd: Ymd,
  timezone: string,
): { startIso: string; endIso: string } | null {
  const period = DAY_PERIODS[expression.trim().toLowerCase()];
  if (!period) return null;
  const start = zonedLocalToUtc(ymd.year, ymd.month, ymd.day, period.startHour, 0, timezone);
  const endDay = period.endHour >= 24 ? addDaysYmd(ymd, 1) : ymd;
  const end = zonedLocalToUtc(endDay.year, endDay.month, endDay.day, period.endHour % 24, 0, timezone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// ---------------------------------------------------------------------------
// Clock-time resolution ("at 7" vs "around 7", with/without meridiem).
// Missing meridiem → needs-clarification with BOTH candidates. Never guess.
// ---------------------------------------------------------------------------

export type ClockResolution =
  | { status: 'instant'; instantIso: string }
  | { status: 'window'; startIso: string; endIso: string }
  | { status: 'needs-clarification'; question: string; candidates: Array<{ label: string; startIso: string; endIso: string }> };

export function resolveClockTime(
  opts: { hour: number; minute?: number; meridiem?: 'am' | 'pm' | null; toleranceMinutes?: number },
  ymd: Ymd,
  timezone: string,
): ClockResolution {
  const { hour, minute = 0, meridiem = null, toleranceMinutes = 0 } = opts;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return {
      status: 'needs-clarification',
      question: `What time did you mean by "${hour}${minute ? `:${minute}` : ''}"?`,
      candidates: [],
    };
  }
  if (!meridiem) {
    const mk = (m: 'am' | 'pm') => {
      const h24 = hour % 12 + (m === 'pm' ? 12 : 0);
      const centre = zonedLocalToUtc(ymd.year, ymd.month, ymd.day, h24, minute, timezone).getTime();
      const tol = Math.max(toleranceMinutes, 0) * 60000;
      return {
        label: `${hour}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${m.toUpperCase()}`,
        startIso: new Date(centre - tol).toISOString(),
        endIso: new Date(centre + tol).toISOString(),
      };
    };
    return {
      status: 'needs-clarification',
      question: `Did you mean ${hour} in the morning or in the evening?`,
      candidates: [mk('am'), mk('pm')],
    };
  }
  const h24 = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  const centre = zonedLocalToUtc(ymd.year, ymd.month, ymd.day, h24, minute, timezone).getTime();
  if (toleranceMinutes > 0) {
    const tol = toleranceMinutes * 60000;
    return {
      status: 'window',
      startIso: new Date(centre - tol).toISOString(),
      endIso: new Date(centre + tol).toISOString(),
    };
  }
  return { status: 'instant', instantIso: new Date(centre).toISOString() };
}

// ---------------------------------------------------------------------------
// Top-level: resolve any Phase 1 TemporalExpression against a reference.
// ---------------------------------------------------------------------------

export type ResolvedTemporal =
  | { kind: 'instant'; instantIso: string }
  | { kind: 'window'; startIso: string; endIso: string }
  | { kind: 'needs-clarification'; question: string; candidates: Array<{ label: string; startIso: string; endIso: string }> }
  | { kind: 'unresolved'; reason: string };

export function resolveTemporalExpression(expr: TemporalExpression, ref: TemporalReference): ResolvedTemporal {
  switch (expr.kind) {
    case 'exact':
      return { kind: 'instant', instantIso: new Date(expr.instantIso).toISOString() };
    case 'unknown':
      return { kind: 'unresolved', reason: 'No temporal information provided.' };
    case 'event-relative':
      return { kind: 'unresolved', reason: `Anchored to another event ("${expr.anchorEvent}"); needs the anchor resolved first.` };
    case 'relative-date': {
      const day = resolveDayExpression(expr.expression, ref);
      if (day.status === 'resolved') {
        const start = zonedLocalToUtc(day.ymd.year, day.ymd.month, day.ymd.day, 0, 0, ref.timezone);
        const end = zonedLocalToUtc(day.ymd.year, day.ymd.month, day.ymd.day, 23, 59, ref.timezone);
        return { kind: 'window', startIso: start.toISOString(), endIso: end.toISOString() };
      }
      if (day.status === 'range') {
        const start = zonedLocalToUtc(day.start.year, day.start.month, day.start.day, 0, 0, ref.timezone);
        const end = zonedLocalToUtc(day.end.year, day.end.month, day.end.day, 23, 59, ref.timezone);
        return { kind: 'window', startIso: start.toISOString(), endIso: end.toISOString() };
      }
      return { kind: 'unresolved', reason: day.reason };
    }
    case 'relative-time': {
      // Bare named period ("morning") applies to the reference date.
      const now = new Date(ref.nowIso);
      const zp = zonedParts(now, ref.timezone);
      const period = resolveDayPeriod(expr.expression, { year: zp.year, month: zp.month, day: zp.day }, ref.timezone);
      if (period) return { kind: 'window', ...period };
      return { kind: 'unresolved', reason: `Unrecognized time expression: "${expr.expression}" (needs the Phase 2 parser).` };
    }
    case 'approximate': {
      const centre = new Date(expr.centreIso).getTime();
      const tol = expr.toleranceMinutes * 60000;
      return {
        kind: 'window',
        startIso: new Date(centre - tol).toISOString(),
        endIso: new Date(centre + tol).toISOString(),
      };
    }
    default:
      return { kind: 'unresolved', reason: 'Unknown temporal expression kind.' };
  }
}
