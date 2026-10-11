"use client";
import { useEffect, useState } from "react";
import { MODEL_OPTIONS, modelSelectionLabel, optionProvider, providerParkedReason, type ModelSelection } from "@/lib/model-selection";
import { api } from "@/lib/api";

interface ProvidersResponse {
  providers: Array<{ provider: string; models: string[] }>;
}

/**
 * Compact model selector for evaluation/demos. Renders as a small dropdown
 * that fits the composer footer. Sends identifiers only — never credentials.
 * Options whose provider is not configured server-side are shown disabled
 * with an explanation instead of silently pretending they ran.
 */
export function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: ModelSelection;
  onChange: (sel: ModelSelection) => void;
  disabled?: boolean;
}) {
  const [ready, setReady] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ProvidersResponse>("/api/ai/providers")
      .then((res) => {
        if (!cancelled) setReady(new Set(res.providers.map((p) => p.provider)));
      })
      .catch(() => {
        // Offline or old backend: fall back to showing all options enabled
        // (the backend allowlist still rejects invalid selections with 400).
        if (!cancelled) setReady(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentId =
    MODEL_OPTIONS.find(
      (o) =>
        (o.selection.provider ?? '') === (value.provider ?? '') &&
        (o.selection.model ?? '') === (value.model ?? ''),
    )?.id ?? 'auto';
  // A parked selection can never be current — show Auto instead of pinning
  // the dropdown to a disabled option.
  const effectiveId = providerParkedReason(
    MODEL_OPTIONS.find((o) => o.id === currentId)?.selection.provider,
  )
    ? 'auto'
    : currentId;

  const isReady = (id: string) => {
    if (id === 'auto') return true;
    if (ready === null) return true;
    return ready.has(optionProvider(id));
  };

  const parkedReason = (id: string) => {
    const opt = MODEL_OPTIONS.find((o) => o.id === id);
    return providerParkedReason(opt?.selection.provider);
  };

  const optionSuffix = (id: string) => {
    const reason = parkedReason(id);
    if (reason) return ` (${reason})`;
    if (!isReady(id)) return " (not configured)";
    return "";
  };

  return (
    <label className="model-selector" title="Model for evaluation (Auto recommended)">
      <span className="muted" style={{ fontSize: 12 }} aria-hidden="true">
        Model
      </span>
      <select
        className="model-select"
        value={effectiveId}
        disabled={disabled}
        aria-label={`Model for evaluation, currently ${modelSelectionLabel(value)}`}
        onChange={(e) => {
          const opt = MODEL_OPTIONS.find((o) => o.id === e.target.value);
          onChange(opt ? { ...opt.selection } : {});
        }}
      >
        {MODEL_OPTIONS.map((o) => (
          <option key={o.id} value={o.id} disabled={!isReady(o.id) || parkedReason(o.id) !== null}>
            {o.label}
            {optionSuffix(o.id)}
          </option>
        ))}
      </select>
    </label>
  );
}
