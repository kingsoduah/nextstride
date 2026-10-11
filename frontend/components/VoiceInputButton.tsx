"use client";
import type { RecognitionState } from "@/hooks/useSpeechRecognition";

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/**
 * Microphone toggle for voice input. Visual state only — the parent owns
 * the recognition session via `useSpeechRecognition`.
 */
export function VoiceInputButton({
  recState,
  isSupported,
  disabled,
  onStart,
  onStop,
}: {
  recState: RecognitionState;
  isSupported: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (!isSupported) return null;
  const listening = recState === "listening" || recState === "finalizing";
  return (
    <button
      type="button"
      className={`icon-btn voice-btn${listening ? " listening" : ""}`}
      onClick={listening ? onStop : onStart}
      disabled={disabled}
      aria-label={listening ? "Stop recording" : "Start voice input"}
      aria-pressed={listening}
      title={listening ? "Stop recording" : "Dictate with your voice"}
    >
      {listening ? <StopIcon /> : <MicIcon />}
    </button>
  );
}
