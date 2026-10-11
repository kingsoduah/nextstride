import type { ResolvedTemporal, TemporalExpression, TemporalReference } from './spec';
import {
  addDaysYmd,
  DAY_PERIODS,
  resolveClockTime,
  resolveDayExpression,
  resolveDayPeriod,
  resolveTemporalExpression,
  zonedLocalToUtc,
  zonedParts,
} from '../temporal/temporal';

/**
 * Phase 2: deterministic day+time combiner.
 *
 * The LLM only classifies and quotes verbatim text (dayText, timeText,
 * precision label, meridiem). ALL date math happens here. Convention:
 * - `expression` preserves the user's phrasing and precision class.
 * - `resolved` is the computed instant/window Phase 3 consumes.
 * - Ambiguity (missing meridiem) is never resolved by guessing.
 */

/** Default half-width for "around/about" when no other signal exists. */
export const APPROX_DEFAULT_TOLERANCE_MINUTES = 30;

const APPROX_MARKERS = /\b(around|about|almost|roughly|or so)\b|~/i;
const CLOCK_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;
const PERIOD_WORDS = ['morning', 'afternoon', 'evening', 'night', 'tonight'];

export function hasApproxMarkers(raw: string): boolean {
  return APPROX_MARKERS.test(raw);
}

function meridiemFromText(text: string): 'am' | 'pm' | null {
  return markersIn(text)[0] ?? null;
}

/**
 * "midnight" unambiguously means 12 AM and "midday"/"noon" means 12 PM —
 * definitional, not inference. Applies only to hour-12 readings with no
 * stated meridiem, so bare "7" style ambiguity is still never guessed.
 */
export function namedMeridiem(hour: number, raw: string): 'am' | 'pm' | null {
  if (hour !== 12) return null;
  if (/\bmidnight\b/i.test(raw)) return 'am';
  if (/\b(midday|noon)\b/i.test(raw)) return 'pm';
  return null;
}

function refYmd(ref: TemporalReference) {
  const zp = zonedParts(new Date(ref.nowIso), ref.timezone);
  return { year: zp.year, month: zp.month, day: zp.day };
}

/** Meridiem markers explicitly written in a text fragment. */
function markersIn(text: string): Array<'am' | 'pm'> {
  const out: Array<'am' | 'pm'> = [];
  // NB: \b does NOT match between two word chars, so "4pm" needs a
  // lookbehind-tolerant pattern instead of \b(am|pm)\b.
  const re = /(?:(?<![a-z])(am|pm|a\.m\.|p\.m\.))(?:\b|(?![a-z]))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1][0].toLowerCase() === 'a' ? 'am' : 'pm');
  return out;
}

/**
 * Period consistency: a clock hour with no stated meridiem is resolved only
 * when the surrounding words admit exactly one reading (e.g. "morning" +
 * 7 ⇒ am, since 7pm contradicts morning). Zero or two readings ⇒ null
 * (still ambiguous — ask, don't guess).
 */
export function consistentMeridiem(hour: number, scopeText: string): 'am' | 'pm' | null {
  const words = Object.keys(DAY_PERIODS).filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(scopeText));
  // Definitional anchors behave like single-hour periods: noon/midday is
  // 12 PM, midnight is 12 AM. Anything else stays ambiguous.
  const anchors: Array<{ startHour: number; endHour: number }> = [];
  if (/\b(midday|noon)\b/i.test(scopeText)) anchors.push({ startHour: 12, endHour: 13 });
  if (/\bmidnight\b/i.test(scopeText)) anchors.push({ startHour: 0, endHour: 1 });
  if (words.length === 0 && anchors.length === 0) return null;
  const ok = (['am', 'pm'] as const).filter((m) => {
    const h24 = hour % 12 + (m === 'pm' ? 12 : 0);
    return (
      words.every((w) => {
        const p = DAY_PERIODS[w];
        return h24 >= p.startHour && h24 < p.endHour;
      }) &&
      anchors.every((p) => h24 >= p.startHour && h24 < p.endHour)
    );
  });
  return ok.length === 1 ? ok[0] : null;
}

/**
 * Split an explicit clock range ("4pm to 6pm", "4-6pm", "from 4 until 6pm").
 * Returns the two raw clauses; meridiem resolution happens separately.
 */
export function splitTimeRange(text: string): { startText: string; endText: string } | null {
  const m = text.match(/(.+?)\s*(?:\bto\b|\buntil\b|\bthrough\b|\bthru\b|\btill\b|–|—|-)\s*(.+)/i);
  if (!m) return null;
  const startText = m[1].replace(/^(?:from|between)\s+/i, '').trim();
  const endText = m[2].trim();
  if (!startText || !endText) return null;
  if (!/\d/.test(startText) || !/\d/.test(endText)) return null;
  return { startText, endText };
}

/**
 * Resolve meridiem for one end of an explicit range. Order:
 * 1. marker stated on that end itself;
 * 2. a single distinct marker anywhere in the range (standard reading —
 *    "4 to 6pm" means both pm; conflicting markers stay ambiguous);
 * 3. period-word consistency ("morning" + 4–6 ⇒ am);
 * 4. null (ask).
 */
export function resolveRangeMeridiem(
  ownText: string,
  scopeText: string,
  hour: number,
): 'am' | 'pm' | null {
  const own = markersIn(ownText);
  if (own.length > 0) return own[0];
  // A marker attached directly to this hour anywhere in scope ("4am to 6pm"
  // resolving the 4) beats scope-wide heuristics.
  const adj = new RegExp(`(?<!\\d)${hour}\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?!\\w)`, 'i').exec(scopeText);
  if (adj) return adj[1][0].toLowerCase() === 'a' ? 'am' : 'pm';
  const all = markersIn(scopeText);
  if (all.length > 0 && all.every((m) => m === all[0])) return all[0];
  if (all.some((m) => m !== all[0])) return null;
  return consistentMeridiem(hour, scopeText);
}

const DAYISH = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|weekend|this\s+week|morning|afternoon|evening|night|\d{4}-\d{2}-\d{2})/i;
const CLOCK_AT = /\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/i;

/**
 * If no timeText was given but dayText ends in a clock/range expression
 * ("tomorrow evening around 6pm", "Friday 4pm to 6pm"), split it so the
 * clock isn't lost. Strategy: split at the first temporal keyword, else
 * before the first clock reading. The day part must look day-ish;
 * otherwise leave the input untouched (conservative).
 */
export function splitTrailingClock(dayText: string): { dayText: string; timeText: string } | null {
  const text = dayText.trim();
  if (!text) return null;
  // 1. Trailing clock range first ("Friday 4pm to 6pm") — splitting at a
  // bare "to" inside the range would strand half of it in the day part.
  const rm = text.match(/^(.*?)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*(?:\bto\b|\buntil\b|\bthrough\b|\bthru\b|\btill\b|–|—|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*$/i);
  if (rm) {
    const day = rm[1].trim();
    const time = rm[2].trim();
    if (day && DAYISH.test(day)) return { dayText: day, timeText: time };
  }
  // 2. Split at the first temporal keyword ("tomorrow evening around 6pm").
  const kw = text.match(/\b(around|about|at|by|after|before|from|until|to)\b/i);
  if (kw && kw.index != null) {
    const day = text.slice(0, kw.index).trim();
    const time = text.slice(kw.index).trim();
    if (day && /\d/.test(time) && DAYISH.test(day)) return { dayText: day, timeText: time };
  }
  // 3. Split before the first clock reading ("Friday 4pm").
  const cm = CLOCK_AT.exec(text);
  if (cm && cm.index != null && cm.index > 0) {
    const day = text.slice(0, cm.index).trim().replace(/^(?:at|on|by|for)\s+/i, '').trim();
    const time = text.slice(cm.index).trim();
    if (day && DAYISH.test(day) && /\d/.test(time)) return { dayText: day, timeText: time };
  }
  return null;
}

export interface TimePartsInput {
  dayText?: string;
  timeText?: string;
  precision?: 'exact' | 'approximate' | 'relative' | 'unknown';
  meridiem?: 'am' | 'pm' | null;
  raw?: string;
}

export function buildTemporal(input: TimePartsInput, ref: TemporalReference): {
  expression: TemporalExpression;
  resolved: ResolvedTemporal;
} {
  let dayText = (input.dayText ?? '').trim();
  let timeText = (input.timeText ?? '').trim();
  // Recover clocks the extractor left inside dayText ("tomorrow evening around 6pm").
  if (!timeText && dayText) {
    const split = splitTrailingClock(dayText);
    if (split) {
      dayText = split.dayText;
      timeText = split.timeText;
    }
  }
  // Move a trailing period word off the day part ("tomorrow evening" +
  // "around 6pm") so the clock — not the whole period — wins when a
  // meridiem is known, while bare periods still resolve as windows.
  const pStrip = dayText.match(/^(.*?)\s+\b(morning|afternoon|evening|night|tonight)\b\s*$/i);
  if (pStrip && pStrip[1].trim() && DAYISH.test(pStrip[1])) {
    dayText = pStrip[1].trim();
    timeText = timeText ? `${pStrip[2]} ${timeText}`.trim() : pStrip[2];
  }
  const raw = input.raw ?? [dayText, timeText].filter(Boolean).join(' ');
  const approx = hasApproxMarkers(raw) || input.precision === 'approximate';
  const clockMatch = timeText.match(CLOCK_RE);
  // Digit-less "midnight"/"noon"/"midday" still pins hour 12 for meridiem purposes.
  const clockHour = clockMatch
    ? Number(clockMatch[1])
    : /\b(midnight|midday|noon)\b/i.test(timeText) ? 12 : NaN;
  const meridiem = meridiemFromText(timeText)
    ?? input.meridiem
    ?? namedMeridiem(clockHour, raw)
    ?? (Number.isNaN(clockHour) ? null : consistentMeridiem(clockHour, raw));

  const unknown = (reason: string): { expression: TemporalExpression; resolved: ResolvedTemporal } => ({
    expression: { kind: 'unknown', raw: raw.slice(0, 200) },
    resolved: { kind: 'unresolved', reason },
  });
  if (!dayText && !timeText) return unknown('No temporal information provided.');

  const lowerTime = timeText.toLowerCase();
  // Whole-word match only: "midnight" must not trigger the "night" period.
  const periodWord = PERIOD_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(lowerTime)) ?? null;

  // Day-only: relative date, resolved to a full-day window in-zone.
  if (dayText && !timeText && !periodWord) {
    const expression: TemporalExpression = { kind: 'relative-date', expression: dayText.slice(0, 64), raw: raw.slice(0, 200) };
    return { expression, resolved: resolveTemporalExpression(expression, ref) };
  }

  // Named period, optional day ("tomorrow morning", "tonight").
  // An explicit clock with resolved meridiem takes precedence: "tomorrow
  // evening around 6pm" is an approx 6pm window, not the whole evening.
  const clockPrefers = clockMatch != null && meridiem != null;
  if (periodWord && !clockPrefers) {
    const periodKey = periodWord === 'tonight' ? 'evening' : periodWord;
    const day = dayText ? resolveDayExpression(dayText, ref) : null;
    if (day && day.status !== 'resolved') {
      const expression: TemporalExpression = { kind: 'relative-date', expression: dayText.slice(0, 64), raw: raw.slice(0, 200) };
      return { expression, resolved: resolveTemporalExpression(expression, ref) };
    }
    const ymd = day && day.status === 'resolved' ? day.ymd : refYmd(ref);
    const window = resolveDayPeriod(periodKey, ymd, ref.timezone);
    if (!window) return unknown(`Unrecognized time expression: "${timeText}".`);
    const expression: TemporalExpression = dayText && day?.status === 'resolved'
      ? { kind: 'relative-date', expression: `${dayText} ${periodKey}`.slice(0, 64), raw: raw.slice(0, 200) }
      : { kind: 'relative-time', expression: periodKey, meridiem: null, raw: raw.slice(0, 200) };
    return { expression, resolved: { kind: 'window', ...window } };
  }

  // Explicit clock range ("4pm to 6pm", "4-6pm", "from 4 until 6pm").
  // Handled before single clocks so the end time is never dropped.
  const range = splitTimeRange(timeText);
  if (range) {
    const startM = range.startText.match(CLOCK_RE);
    const endM = range.endText.match(CLOCK_RE);
    const scope = `${dayText} ${timeText} ${raw}`;
    const sHour = startM ? Number(startM[1]) : NaN;
    const eHour = endM ? Number(endM[1]) : NaN;
    const sMer = (startM && meridiemFromText(range.startText)) ?? resolveRangeMeridiem(range.startText, scope, sHour);
    const eMer = (endM && meridiemFromText(range.endText)) ?? resolveRangeMeridiem(range.endText, scope, eHour);
    const start = startM
      ? { hour: Number(startM[1]), minute: startM[2] ? Number(startM[2]) : 0, meridiem: sMer }
      : null;
    const end = endM
      ? { hour: Number(endM[1]), minute: endM[2] ? Number(endM[2]) : 0, meridiem: eMer }
      : null;
    if (start && end) {
      const { expression, resolved } = buildTimeRange(start, end, dayText, raw, ref);
      return { expression, resolved };
    }
    // Unparseable ends fall through to single-clock handling below.
  }

  // Clock time, optional day ("around 7", "tomorrow at 7 AM", bare "7",
  // "midnight"/"noon" without digits).
  const namedClock = !clockMatch && /\b(midnight|midday|noon)\b/i.test(timeText)
    ? { hour: 12, minute: 0 }
    : null;
  const clockParts = clockMatch
    ? { hour: Number(clockMatch[1]), minute: clockMatch[2] ? Number(clockMatch[2]) : 0 }
    : namedClock;
  if (clockParts) {
    const hour = clockParts.hour;
    const minute = clockParts.minute;
    const day = dayText ? resolveDayExpression(dayText, ref) : null;
    if (day && day.status !== 'resolved') {
      const expression: TemporalExpression = { kind: 'relative-date', expression: dayText.slice(0, 64), raw: raw.slice(0, 200) };
      return { expression, resolved: resolveTemporalExpression(expression, ref) };
    }
    const ymd = day && day.status === 'resolved' ? day.ymd : refYmd(ref);
    const tol = approx ? APPROX_DEFAULT_TOLERANCE_MINUTES : 0;
    const clock = resolveClockTime({ hour, minute, meridiem, toleranceMinutes: tol }, ymd, ref.timezone);
    if (clock.status === 'needs-clarification') {
      const expression: TemporalExpression = {
        kind: 'relative-time', expression: timeText.slice(0, 64), meridiem, raw: raw.slice(0, 200),
      };
      return {
        expression,
        resolved: { kind: 'needs-clarification', question: clock.question, candidates: clock.candidates },
      };
    }
    if (!dayText) {
      const expression: TemporalExpression = {
        kind: 'relative-time', expression: timeText.slice(0, 64), meridiem, raw: raw.slice(0, 200),
      };
      return {
        expression,
        resolved: clock.status === 'instant'
          ? { kind: 'instant', instantIso: clock.instantIso }
          : { kind: 'window', startIso: clock.startIso, endIso: clock.endIso },
      };
    }
    // Day + clock: compute the instant/window deterministically.
    if (clock.status === 'instant' && !approx) {
      return {
        expression: { kind: 'exact', instantIso: clock.instantIso },
        resolved: { kind: 'instant', instantIso: clock.instantIso },
      };
    }
    const startIso = clock.status === 'instant' ? clock.instantIso : clock.startIso;
    const endIso = clock.status === 'instant' ? clock.instantIso : clock.endIso;
    return {
      expression: {
        kind: 'approximate',
        centreIso: new Date((new Date(startIso).getTime() + new Date(endIso).getTime()) / 2).toISOString(),
        toleranceMinutes: tol || APPROX_DEFAULT_TOLERANCE_MINUTES,
        raw: raw.slice(0, 200),
      },
      resolved: { kind: 'window', startIso, endIso },
    };
  }

  // Unrecognized time text with a day: keep the day, preserve raw.
  if (dayText) {
    const expression: TemporalExpression = { kind: 'relative-date', expression: dayText.slice(0, 64), raw: raw.slice(0, 200) };
    return { expression, resolved: resolveTemporalExpression(expression, ref) };
  }
  return unknown(`Unrecognized time expression: "${timeText}".`);
}

export interface ClockReading {
  hour: number;
  minute?: number;
  meridiem?: 'am' | 'pm' | null;
}

/** Explicit clock ranges ("midnight to 6"). End <= start rolls past midnight. */
export function buildTimeRange(
  start: ClockReading,
  end: ClockReading,
  dayText: string,
  raw: string,
  ref: TemporalReference,
): { expression: TemporalExpression; resolved: ResolvedTemporal } {
  // Definitional: "midnight" is 12 AM, "midday"/"noon" is 12 PM.
  const startMeridiem = start.meridiem ?? namedMeridiem(start.hour, raw);
  const endMeridiem = end.meridiem ?? namedMeridiem(end.hour, raw);
  const expression: TemporalExpression = {
    kind: 'time-range',
    startClock: { hour: start.hour, minute: start.minute ?? 0, meridiem: startMeridiem },
    endClock: { hour: end.hour, minute: end.minute ?? 0, meridiem: endMeridiem },
    dayText: dayText.slice(0, 64),
    raw: raw.slice(0, 200),
  };
  if (!startMeridiem || !endMeridiem) {
    const missing = !startMeridiem ? 'start' : 'end';
    const ymd = refYmd(ref);
    const ambig = !startMeridiem ? start : end;
    const cands = (['am', 'pm'] as const).map((m) => {
      const h = ambig.hour % 12 + (m === 'pm' ? 12 : 0);
      const c = zonedLocalToUtc(ymd.year, ymd.month, ymd.day, h, ambig.minute ?? 0, ref.timezone).getTime();
      return { label: `${ambig.hour} ${m.toUpperCase()}`, startIso: new Date(c).toISOString(), endIso: new Date(c).toISOString() };
    });
    return {
      expression,
      resolved: {
        kind: 'needs-clarification',
        question: `Which ${missing} time did you mean — morning or evening?`,
        candidates: cands,
      },
    };
  }
  const day = dayText ? resolveDayExpression(dayText, ref) : null;
  const ymd = day && day.status === 'resolved' ? day.ymd : refYmd(ref);
  const s24 = start.hour % 12 + (startMeridiem === 'pm' ? 12 : 0);
  const e24 = end.hour % 12 + (endMeridiem === 'pm' ? 12 : 0);
  const startDt = zonedLocalToUtc(ymd.year, ymd.month, ymd.day, s24, start.minute ?? 0, ref.timezone);
  let endDt = zonedLocalToUtc(ymd.year, ymd.month, ymd.day, e24, end.minute ?? 0, ref.timezone);
  if (endDt.getTime() <= startDt.getTime()) {
    const next = addDaysYmd(ymd, 1);
    endDt = zonedLocalToUtc(next.year, next.month, next.day, e24, end.minute ?? 0, ref.timezone);
  }
  return {
    expression,
    resolved: { kind: 'window', startIso: startDt.toISOString(), endIso: endDt.toISOString() },
  };
}
