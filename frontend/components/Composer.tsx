"use client";
import { useRef, useState, type ReactNode } from "react";
import { useVoiceDraft } from "@/hooks/useVoiceDraft";
import { VoiceInputButton } from "./VoiceInputButton";

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

  return (
    <form
      className="composer"
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
        value={value + (listening && rec.interimText ? (value && !value.endsWith(" ") ? " " : "") + rec.interimText : "")}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="What's competing for your attention?"
      />
      <div className="composer-footer">
        <span className="muted" style={{ fontSize: 13 }} role="status">
          {listening ? "Listening… speak now" : "AI recommends · you decide"}
        </span>
        <span className="composer-actions">
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

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        voice.handleSubmitWithVoice();
      }}
    >
      <textarea
        value={value + (listening && rec.interimText ? (value && !value.endsWith(" ") ? " " : "") + rec.interimText : "")}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={submitLabel}
      />
      <div className="composer-footer">
        <span className="muted" style={{ fontSize: 13 }} role="status">
          {listening ? "Listening… speak now" : ""}
        </span>
        <span className="composer-actions">
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
