import { Injectable } from '@nestjs/common';
import type { AiProvider } from './ai-provider.interface';
import type { ParsedContext, RecommendationDraft } from './schemas';

// Deterministic offline fallback, ported from archive/v0.1-prototype/backend/ai_service.py.
// Used when GROQ_API_KEY is absent or the provider fails. Keeps the MVP usable for free.

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  academic: ['lecture', 'class', 'assignment', 'exam', 'study', 'tutorial', 'lab', 'school', 'homework', 'test', 'course'],
  fellowship: ['fellowship', 'church', 'program', 'service', 'choir', 'volunteer', 'community'],
  business: ['customer', 'delivery', 'business', 'order', 'client', 'shop', 'sale', 'product'],
  work: ['work', 'job', 'shift', 'boss', 'office', 'employer'],
  personal: ['family', 'health', 'doctor', 'rest', 'sleep', 'friend', 'personal'],
};

const DELEGATION_HINTS = ['assistant', 'colleague', 'teammate', 'partner', 'cover', 'delegate', 'someone', 'staff', 'friend', 'coordinator'];

const TIME_RE = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)|tonight|tomorrow\s*morning|tomorrow|morning|afternoon|evening|today)/i;

type Category = 'academic' | 'fellowship' | 'business' | 'work' | 'personal' | 'other';

function detectCategory(sentence: string): Category {
  const lowered = sentence.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lowered.includes(k))) return category as Category;
  }
  return 'other';
}

function extractTime(sentence: string): string {
  return sentence.match(TIME_RE)?.[0]?.trim() ?? '';
}

function isFixedTime(sentence: string): boolean {
  const lowered = sentence.toLowerCase();
  return (
    TIME_RE.test(sentence) &&
    ['lecture', 'class', 'starts at', 'from', 'shift', 'service', 'program', 'meeting', 'exam'].some((h) => lowered.includes(h))
  );
}

function isDelegatable(sentence: string): boolean {
  const lowered = sentence.toLowerCase();
  return DELEGATION_HINTS.some((h) => lowered.includes(h)) || lowered.includes('coordinat') || lowered.includes('lead');
}

function score(detail: string, fixedTime: boolean, delegatable: boolean, flexible: boolean): { value: number; reasons: string[] } {
  let value = 0;
  const reasons: string[] = [];
  const d = detail.toLowerCase();
  if (fixedTime) {
    value += 3;
    reasons.push('fixed time — cannot easily move');
  }
  if (['exam', 'due tomorrow', 'due', 'deadline', 'tonight', 'consequence', 'fail', 'grade'].some((w) => d.includes(w))) {
    value += 2;
    reasons.push('deadline proximity / consequence of delay');
  }
  if (['coordinat', 'lead', 'customer waiting', 'exam', 'lecture'].some((w) => d.includes(w))) {
    value += 1;
    reasons.push('role responsibility / dependency');
  }
  if (delegatable) {
    value -= 1;
    reasons.push('delegation possible — lowers need to do it personally now');
  }
  if (flexible) value -= 0.5;
  return { value, reasons };
}

@Injectable()
export class RuleBasedFallback implements AiProvider {
  readonly name = 'rule-based-fallback';

  async understand(text: string): Promise<ParsedContext> {
    const clean = (text ?? '').trim();
    if (!clean) {
      return { responsibilities: [], conflicts: [], uncertainties: ['No situation text was provided.'] };
    }
    const parts = clean
      .split(/\band\b|\n+|(?<=[.!?])\s+/g)
      .map((p) => p.trim().replace(/^[.\s]+|[.\s]+$/g, ''))
      .filter((p) => p.length >= 4)
      .slice(0, 8);
    const responsibilities = parts.map((part) => {
      const fixedTime = isFixedTime(part);
      return {
        title: part.slice(0, 120),
        category: detectCategory(part),
        timeRef: extractTime(part),
        fixedTime,
        flexible: !fixedTime,
        delegatable: isDelegatable(part),
        detail: part,
      };
    });
    const timed = responsibilities.filter((r) => r.timeRef);
    const conflicts: ParsedContext['conflicts'] = [];
    if (timed.length >= 2) {
      conflicts.push({
        description: `Possible time overlap between '${timed[0].title.slice(0, 60)}' and '${timed[1].title.slice(0, 60)}'.`,
        involves: [],
      });
    }
    const uncertainties: string[] = [];
    if (responsibilities.length <= 1) {
      uncertainties.push('Only one responsibility was clearly detected. Add more detail if something else is competing for your attention.');
    }
    if (!responsibilities.some((r) => r.timeRef)) {
      uncertainties.push("No clear times or deadlines were detected. Adding times (e.g. '2-5:30pm', 'tonight', 'tomorrow morning') improves the recommendation.");
    }
    if (!responsibilities.some((r) => r.delegatable)) {
      uncertainties.push('No delegation option was mentioned. If anyone could cover part of this, mention them for a better plan.');
    }
    return { responsibilities, conflicts, uncertainties };
  }

  async prioritize(input: {
    situationText: string;
    context: ParsedContext;
    newInfo?: string;
  }): Promise<RecommendationDraft> {
    const responsibilities = input.context.responsibilities.map((r) => ({ ...r }));
    if (responsibilities.length === 0) {
      return {
        recommendedPriority: 'Clarify your situation first',
        why: 'No responsibilities could be extracted, so no tradeoff can be evaluated yet.',
        nextAction: "Rewrite your situation with each competing responsibility and its time (e.g. lecture 2-5:30pm, fellowship 4:30pm, delivery tonight).",
        others: [],
        reassessIf: ['You add times, deadlines, or who could help.'],
        uncertaintyNotes: 'Unknown information remains unknown — no facts were invented.',
      };
    }
    const coverageLost =
      !!input.newInfo &&
      ["can't cover", 'cannot cover', 'no cover', "assistant can't", 'nobody', 'no one'].some((w) =>
        (input.newInfo as string).toLowerCase().includes(w),
      );
    const scored = responsibilities.map((r) => {
      const delegatable = coverageLost ? false : r.delegatable;
      const s = score(r.detail, r.fixedTime, delegatable, r.flexible);
      if (coverageLost && r.delegatable) {
        return { r: { ...r, delegatable }, value: s.value + 2, reasons: [...s.reasons, 'new information: coverage fell through — must handle personally or renegotiate'] };
      }
      return { r: { ...r, delegatable }, value: s.value, reasons: s.reasons };
    });
    scored.sort((a, b) => b.value - a.value);
    const [top, ...rest] = scored;
    const others = rest.map((s) => ({
      responsibilityId: '',
      title: s.r.title.slice(0, 100),
      suggestedHandling: s.r.delegatable
        ? `Delegate or arrange coverage for '${s.r.title.slice(0, 80)}' (${s.r.timeRef || 'no time given'}).`
        : s.r.flexible
          ? `Postpone / reschedule '${s.r.title.slice(0, 80)}' until after the top priority (${s.r.timeRef || 'no deadline given'}).`
          : `Communicate early about '${s.r.title.slice(0, 80)}' — explain the conflict and agree a new expectation.`,
    }));
    const delegatable = rest.find((s) => s.r.delegatable);
    return {
      recommendedPriority: top.r.title.slice(0, 140),
      why: `Prioritized by fixed time, deadline proximity, consequences, and delegation options. ${top.reasons.join('; ')}.`,
      nextAction: delegatable
        ? `Contact cover for '${delegatable.r.title.slice(0, 80)}' now, then focus on '${top.r.title.slice(0, 80)}'.`
        : `Focus on '${top.r.title.slice(0, 80)}' now (${top.r.timeRef || 'no time given'}), then handle the next item in order.`,
      others,
      reassessIf: [
        'Coverage / delegation falls through.',
        'A lecture, shift, or program time changes.',
        'A deadline moves closer or a new consequence appears.',
      ],
      uncertaintyNotes: 'Based only on what you provided. If times or consequences change, reassess rather than treating this as final.',
    };
  }
}
