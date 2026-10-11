"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { accumulateTranscript } from "@/lib/voice-utils";

export type RecognitionState = "idle" | "listening" | "finalizing" | "error" | "unsupported";

interface RecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
  length: number;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike> & { length: number };
}

interface RecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => RecognitionInstance;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as RecognitionCtor | undefined;
  return typeof ctor === "function" ? ctor : null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  /**
   * Called exactly once per session when recognition ends, with the final
   * accumulated transcript. Used by send-while-recording to submit after
   * the service delivers its final result.
   */
  onSessionEnd?: (finalizedText: string) => void;
}

export interface UseSpeechRecognition {
  state: RecognitionState;
  /** Finalized transcript accumulated so far this session. */
  finalizedText: string;
  /** Provisional text for the current utterance (not yet final). */
  interimText: string;
  error: string;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Browser-native speech recognition (Web Speech API).
 * - Starts only via explicit `start()` (user activation).
 * - Never auto-submits; the caller decides what to do with the transcript.
 * - Cleans up recognition + listeners on unmount.
 */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}): UseSpeechRecognition {
  const { lang = "en-US", onSessionEnd } = options;
  const [ctor] = useState<RecognitionCtor | null>(() => getRecognitionCtor());
  const [state, setState] = useState<RecognitionState>(ctor ? "idle" : "unsupported");
  const [finalizedText, setFinalizedText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState("");

  const recRef = useRef<RecognitionInstance | null>(null);
  const finalizedRef = useRef("");
  const seenRef = useRef<Set<number>>(new Set());
  const activeRef = useRef(false);
  const sessionNotifiedRef = useRef(false);
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  const teardown = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    activeRef.current = false;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // Already stopped — safe to ignore.
      }
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const reset = useCallback(() => {
    finalizedRef.current = "";
    seenRef.current = new Set();
    sessionNotifiedRef.current = false;
    setFinalizedText("");
    setInterimText("");
    setError("");
    if (ctor) setState("idle");
  }, [ctor]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || !activeRef.current) return;
    setState("finalizing");
    try {
      rec.stop(); // Triggers final onresult + onend; onend notifies once.
    } catch {
      teardown();
      setState("idle");
    }
  }, [teardown]);

  const start = useCallback(() => {
    if (!ctor) {
      setState("unsupported");
      setError("Voice input is not supported in this browser. You can still type.");
      return;
    }
    if (activeRef.current) return; // Prevent overlapping sessions.
    setError("");
    finalizedRef.current = "";
    seenRef.current = new Set();
    sessionNotifiedRef.current = false;
    setFinalizedText("");
    setInterimText("");

    const rec: RecognitionInstance = new ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: RecognitionEventLike) => {
      const segments = [];
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        let text = "";
        for (let a = 0; a < r.length; a += 1) text += r[a]?.transcript ?? "";
        segments.push({ index: i, text, isFinal: r.isFinal });
      }
      const merged = accumulateTranscript(finalizedRef.current, seenRef.current, segments);
      finalizedRef.current = merged.finalized;
      seenRef.current = merged.seenFinalIndices;
      setFinalizedText(merged.finalized);
      setInterimText(merged.interim);
    };

    rec.onerror = (e: { error: string }) => {
      // "aborted" after manual stop is not a user-facing error.
      if (e.error === "aborted") return;
      if (e.error === "no-speech") {
        setError("No speech was heard. Try again or type instead.");
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was denied. Allow microphone access or type instead.");
      } else if (e.error === "network") {
        setError("Speech recognition needs a network connection. Try again or type instead.");
      } else {
        setError("Voice input stopped unexpectedly. Try again or type instead.");
      }
      setState("error");
    };

    rec.onend = () => {
      activeRef.current = false;
      recRef.current = null;
      setInterimText("");
      setState((s) => (s === "finalizing" || s === "listening" ? "idle" : s));
      if (!sessionNotifiedRef.current) {
        sessionNotifiedRef.current = true;
        onSessionEndRef.current?.(finalizedRef.current);
      }
    };

    recRef.current = rec;
    activeRef.current = true;
    try {
      rec.start();
      setState("listening");
    } catch {
      teardown();
      setError("Could not start voice input. Try again or type instead.");
      setState("error");
    }
  }, [ctor, lang, teardown]);

  return { state, finalizedText, interimText, error, isSupported: ctor !== null, start, stop, reset };
}
