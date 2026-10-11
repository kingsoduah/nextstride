/**
 * Phase 8.5 model selection (Model Lab / demo control).
 * The frontend sends only validated identifiers — never credentials.
 * The backend allowlists every combination; unknown values get HTTP 400.
 */

export interface ModelSelection {
  /** 'auto' | 'groq' | 'gemini' | 'openrouter'. Absent/empty = Auto. */
  provider?: string;
  /** Model id within the provider. Required for openrouter. */
  model?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  shortLabel: string;
  selection: ModelSelection;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'auto', label: 'Auto (recommended)', shortLabel: 'Auto', selection: {} },
  { id: 'groq', label: 'Groq (default model)', shortLabel: 'Groq', selection: { provider: 'groq' } },
  { id: 'gemini', label: 'Gemini (default model)', shortLabel: 'Gemini', selection: { provider: 'gemini' } },
  {
    id: 'openrouter-nemotron',
    label: 'Nemotron Super 120B (OpenRouter, free)',
    shortLabel: 'Nemotron 120B',
    selection: { provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  },
  {
    id: 'openrouter-gemma',
    label: 'Gemma 4 26B (OpenRouter, free)',
    shortLabel: 'Gemma 4',
    selection: { provider: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free' },
  },
];

/** Provider key for ready-state checks (auto is always available). */
export function optionProvider(id: string): string {
  return MODEL_OPTIONS.find((o) => o.id === id)?.selection.provider ?? 'auto';
}

/**
 * Temporarily parked providers (pre-deployment stabilization, mirrors
 * PARKED_PROVIDERS in backend/src/ai/provider-registry.ts). Parked options
 * stay listed but disabled with an honest reason — never presented as
 * working. To re-enable: delete the entry here and in the backend set.
 */
export const PARKED_PROVIDER_REASONS: Record<string, string> = {
  openrouter: 'Temporarily unavailable (rate-limited)',
};

/** Human reason a provider is parked, or null when it is selectable. */
export function providerParkedReason(provider?: string): string | null {
  if (!provider || provider === 'auto') return null;
  return PARKED_PROVIDER_REASONS[provider] ?? null;
}

const STORAGE_KEY = 'nextstride:model-selection';

export function loadModelSelection(): ModelSelection {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ModelSelection;
    // A stored selection whose provider has since been parked falls back to
    // Auto rather than pinning the UI to an option that cannot run.
    if (providerParkedReason(parsed.provider)) return {};
    const match = MODEL_OPTIONS.find(
      (o) =>
        (o.selection.provider ?? '') === (parsed.provider ?? '') &&
        (o.selection.model ?? '') === (parsed.model ?? ''),
    );
    return match ? match.selection : {};
  } catch {
    return {};
  }
}

export function saveModelSelection(sel: ModelSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
  } catch {
    // Storage unavailable (private mode) — selection simply won't persist.
  }
}

/** Human label for a selection, for requested-vs-actual notes. */
export function modelSelectionLabel(sel: ModelSelection): string {  const match = MODEL_OPTIONS.find(
    (o) =>
      (o.selection.provider ?? '') === (sel.provider ?? '') &&
      (o.selection.model ?? '') === (sel.model ?? ''),
  );
  return match ? match.shortLabel : 'Auto';
}

/** Expected backend provider string for a manual selection (null when Auto). */
export function expectedProviderFor(sel: ModelSelection): string | null {
  if (!sel.provider || sel.provider === 'auto') return null;
  if (sel.provider === 'groq') return 'groq';
  if (sel.provider === 'gemini') return 'gemini';
  if (sel.provider === 'openrouter' && sel.model) return `openrouter:${sel.model}`;
  return null;
}
