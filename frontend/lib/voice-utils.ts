/**
 * Phase 8 voice utilities — pure functions with no DOM dependencies.
 * Kept DOM-free so the transcript-merging and spoken-text logic is unit-testable.
 */

/** One recognition result segment, mirroring the Web Speech API shape. */
export interface TranscriptSegment {
  index: number;
  text: string;
  isFinal: boolean;
}

/**
 * Merge new recognition segments into accumulated state without duplicating words.
 *
 * The Web Speech API re-sends overlapping results on every `onresult` event.
 * Only segments with `isFinal: true` whose index was not seen before are
 * appended to `finalized`. Interim text is recomputed from scratch on every
 * call (never appended), so provisional words never duplicate.
 */
export function accumulateTranscript(
  finalized: string,
  seenFinalIndices: ReadonlySet<number>,
  segments: TranscriptSegment[],
): { finalized: string; seenFinalIndices: Set<number>; interim: string } {
  const seen = new Set(seenFinalIndices);
  let next = finalized;
  const interimParts: string[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    if (seg.isFinal) {
      if (!seen.has(seg.index)) {
        seen.add(seg.index);
        next = next ? `${next} ${text}` : text;
      }
    } else {
      interimParts.push(text);
    }
  }
  return { finalized: next, seenFinalIndices: seen, interim: interimParts.join(" ") };
}

/**
 * Combine an existing typed draft with dictated text.
 * Existing content is never erased; dictated text is appended with sensible spacing.
 */
export function combineDraft(existing: string, dictated: string): string {
  const clean = dictated.trim();
  if (!clean) return existing;
  if (!existing) return clean;
  if (/[\s\n]$/.test(existing)) return `${existing}${clean}`;
  return `${existing} ${clean}`;
}

/** Minimal shape of a V2 recommendation payload needed for speech. */
export interface SpokenPayload {
  nextMove: string;
  why: string;
  plan: string[];
  risk: string;
  reassessmentTrigger: string;
  unknowns: Array<{ field: string; whyItMatters: string; blocking: boolean }>;
}

/**
 * Build the text spoken by the read-aloud control.
 * Prioritizes the recommendation, reasoning, next steps, and any blocking
 * question — never the whole interface.
 */
export function buildSpokenRecommendation(
  statusLabel: string,
  payload: SpokenPayload,
): string {
  const parts: string[] = [];
  parts.push(`${statusLabel}. ${payload.nextMove}`);
  if (payload.why) parts.push(`Why: ${payload.why}`);
  if (payload.plan.length > 0) {
    parts.push(`Action plan: ${payload.plan.map((s, i) => `step ${i + 1}: ${s}`).join(". ")}.`);
  }
  const blocking = payload.unknowns.filter((u) => u.blocking);
  const question = blocking[0] ?? payload.unknowns[0];
  if (question) {
    parts.push(`Question needing your answer: ${question.field}. ${question.whyItMatters}`);
  } else if (payload.risk) {
    parts.push(`Main risk: ${payload.risk}`);
  }
  if (payload.reassessmentTrigger) {
    parts.push(`Review when: ${payload.reassessmentTrigger}`);
  }
  return parts.join(" ");
}
