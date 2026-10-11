"use client";
import type { SpeechState } from "@/hooks/useSpeechSynthesis";

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="4" width="4.5" height="16" rx="1" />
      <rect x="14.5" y="4" width="4.5" height="16" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/**
 * Read-aloud controls for a recommendation. Speaks only on explicit user
 * action; the parent owns synthesis via `useSpeechSynthesis`.
 */
export function ReadAloudControl({
  speechState,
  isSupported,
  onRead,
  onPause,
  onResume,
  onStop,
}: {
  speechState: SpeechState;
  isSupported: boolean;
  onRead: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  if (!isSupported) return null;
  const speaking = speechState === "speaking";
  const paused = speechState === "paused";
  const active = speaking || paused;
  return (
    <div className="read-aloud" role="group" aria-label="Read recommendation aloud">
      {!active && (
        <button type="button" className="btn read-aloud-btn" onClick={onRead} aria-label="Read recommendation aloud">
          <PlayIcon /> <span>Read aloud</span>
        </button>
      )}
      {speaking && (
        <>
          <button type="button" className="btn read-aloud-btn" onClick={onPause} aria-label="Pause reading aloud">
            <PauseIcon /> <span>Pause</span>
          </button>
          <button type="button" className="btn read-aloud-btn" onClick={onStop} aria-label="Stop reading aloud">
            <StopIcon /> <span>Stop</span>
          </button>
        </>
      )}
      {paused && (
        <>
          <button type="button" className="btn read-aloud-btn" onClick={onResume} aria-label="Resume reading aloud">
            <PlayIcon /> <span>Resume</span>
          </button>
          <button type="button" className="btn read-aloud-btn" onClick={onStop} aria-label="Stop reading aloud">
            <StopIcon /> <span>Stop</span>
          </button>
        </>
      )}
    </div>
  );
}
