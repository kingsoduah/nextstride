"use client";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useVoiceDraft } from "@/hooks/useVoiceDraft";
import { VoiceInputButton } from "./VoiceInputButton";

/**
 * Mobile-friendly auto-grow: compact single row at rest, grows with content
 * up to a cap (collapsed ~200px, expanded ~60vh), then scrolls internally.
 * The draft lives in React state, so toggling expanded never loses text.
 */
function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  measured: string,
  expanded: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = expanded
      ? Math.floor(window.innerHeight * 0.6)
      : 200;
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  }, [ref, measured, expanded]);
}

export function Composer({
  onSubmit,
  loading,
  placeholder,
  modelSelector,
}: {
  onSubmit: (text: string) => Promise<void>;
  loading: boolean;
  placeholder: string;
  /** Optional Model Lab control; typing/voice behavior is unchanged without it. */
  modelSelector?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const voice = useVoiceDraft({
    getDraft: () => valueRef.current,
    setDraft: setValue,
    submitDraft: (text) => {
      if (text) void onSubmit(text);
    },
    loading,
  });
  const { rec, listening } = voice;
  const [expanded, setExpanded] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const shown =
    value + (listening && rec.interimText ? (value && !value.endsWith(" ") ? " " : "") + rec.interimText : "");
  useAutoGrow(areaRef, shown, expanded);

  return (
    <form
      className={`composer${expanded ? " expanded" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        voice.handleSubmitWithVoice();
      }}
    >
      <label className="muted" htmlFor="composer-input" style={{ fontSize: 13 }}>
        Describe what&apos;s competing — times and deadlines help
      </label>
      <textarea
        id="composer-input"
        ref={areaRef}
        rows={1}
        value={shown}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && expanded) {
            e.preventDefault();
            setExpanded(false);
          }
        }}
        placeholder={placeholder}
        aria-label="What's competing for your attention?"
      />
      <div className="composer-footer">
        <span className="muted" style={{ fontSize: 13 }} role="status">
          {listening ? "Listening… speak now" : "AI recommends · you decide"}
        </span>
        <span className="composer-actions">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse the writing area" : "Expand the writing area"}
            title={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
          >
            <span aria-hidden>{expanded ? "⤡" : "⤢"}</span>
          </button>
          {modelSelector}
          <VoiceInputButton
            recState={rec.state}
            isSupported={rec.isSupported}
            disabled={loading}
            onStart={voice.handleMicStart}
            onStop={voice.handleMicStop}
          />
          <button className="icon-btn primary" type="submit" disabled={loading || (!value.trim() && !listening)} aria-label="Analyze my situation">
            {loading ? "…" : "↑"}
          </button>
        </span>
      </div>
      {(rec.error || voice.voiceNote) && (
        <p className={rec.error ? "error" : "muted"} style={{ fontSize: 13, margin: "6px 0 0" }} role="status">
          {rec.error || voice.voiceNote}
        </p>
      )}
    </form>
  );
}

export function ControlledComposer({
  value,
  setValue,
  onSubmit,
  loading,
  placeholder,
  submitLabel,
  modelSelector,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: () => Promise<void>;
  loading: boolean;
  placeholder: string;
  submitLabel: string;
  /** Optional Model Lab control; typing/voice behavior is unchanged without it. */
  modelSelector?: ReactNode;
}) {
  // Controlled: the parent owns the draft and its existing onSubmit() reads
  // it from state. Voice text is flushed synchronously before submit, so the
  // existing submit contract is unchanged.
  const voice = useVoiceDraft({
    getDraft: () => value,
    setDraft: setValue,
    submitDraft: () => {
      void onSubmit();
    },
    loading,
  });
  const { rec, listening } = voice;
  const [expanded, setExpanded] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const shown =
    value + (listening && rec.interimText ? (value && !value.endsWith(" ") ? " " : "") + rec.interimText : "");
  useAutoGrow(areaRef, shown, expanded);

  return (
    <form
      className={`composer${expanded ? " expanded" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        voice.handleSubmitWithVoice();
      }}
    >
      <textarea
        ref={areaRef}
        rows={1}
        value={shown}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && expanded) {
            e.preventDefault();
            setExpanded(false);
          }
        }}
        placeholder={placeholder}
        aria-label={submitLabel}
      />
      <div className="composer-footer">
        <span className="muted" style={{ fontSize: 13 }} role="status">
          {listening ? "Listening… speak now" : ""}
        </span>
        <span className="composer-actions">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse the writing area" : "Expand the writing area"}
            title={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
          >
            <span aria-hidden>{expanded ? "⤡" : "⤢"}</span>
          </button>
          {modelSelector}
          <VoiceInputButton
            recState={rec.state}
            isSupported={rec.isSupported}
            disabled={loading}
            onStart={voice.handleMicStart}
            onStop={voice.handleMicStop}
          />
          <button className="icon-btn primary" type="submit" disabled={loading || (!value.trim() && !listening)} aria-label={submitLabel}>
            {loading ? "…" : "↑"}
          </button>
        </span>
      </div>
      {(rec.error || voice.voiceNote) && (
        <p className={rec.error ? "error" : "muted"} style={{ fontSize: 13, margin: "6px 0 0" }} role="status">
          {rec.error || voice.voiceNote}
        </p>
      )}
    </form>
  );
}
