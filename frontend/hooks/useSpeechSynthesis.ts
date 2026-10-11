"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "idle" | "speaking" | "paused" | "unsupported";

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export function isSpeechSynthesisSupported(): boolean {
  return getSynthesis() !== null;
}

export interface UseSpeechSynthesis {
  state: SpeechState;
  error: string;
  isSupported: boolean;
  /** Speak text, replacing any active speech. Never called automatically. */
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/**
 * Browser-native speech synthesis for read-aloud recommendations.
 * - Speaks only via explicit `speak()` (user activation), never on render.
 * - A new `speak()` cancels previous speech first (no overlap, no repeats).
 * - Cleans up on unmount.
 */
export function useSpeechSynthesis(): UseSpeechSynthesis {
  const [supported] = useState<boolean>(() => isSpeechSynthesisSupported());
  const [state, setState] = useState<SpeechState>(supported ? "idle" : "unsupported");
  const [error, setError] = useState("");
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopInternal = useCallback(() => {
    const synth = getSynthesis();
    if (synth) {
      try {
        synth.cancel();
      } catch {
        // Ignore — synthesis may already be idle.
      }
    }
    utterRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopInternal();
    },
    [stopInternal],
  );

  const stop = useCallback(() => {
    stopInternal();
    if (supported) setState("idle");
  }, [stopInternal, supported]);

  const speak = useCallback(
    (text: string) => {
      const synth = getSynthesis();
      if (!synth) {
        setState("unsupported");
        setError("Read aloud is not supported in this browser.");
        return;
      }
      const clean = text.trim();
      if (!clean) return;
      // Replace any active speech — never overlap, never repeat stale content.
      stopInternal();
      setError("");
      try {
        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang = "en-US";
        utter.onend = () => {
          if (utterRef.current === utter) {
            utterRef.current = null;
            setState("idle");
          }
        };
        utter.onerror = () => {
          if (utterRef.current === utter) {
            utterRef.current = null;
            setState("idle");
            setError("Read aloud stopped unexpectedly.");
          }
        };
        utterRef.current = utter;
        synth.speak(utter);
        setState("speaking");
      } catch {
        setError("Read aloud could not start in this browser.");
        setState("idle");
      }
    },
    [stopInternal],
  );

  const pause = useCallback(() => {
    const synth = getSynthesis();
    if (!synth || !utterRef.current) return;
    try {
      synth.pause();
      setState("paused");
    } catch {
      // Pause unsupported — stay speaking.
    }
  }, []);

  const resume = useCallback(() => {
    const synth = getSynthesis();
    if (!synth || !utterRef.current) return;
    try {
      synth.resume();
      setState("speaking");
    } catch {
      // Resume unsupported — stay paused.
    }
  }, []);

  return { state, error, isSupported: supported, speak, pause, resume, stop };
}
