"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { combineDraft } from "@/lib/voice-utils";
import { useSpeechRecognition } from "./useSpeechRecognition";

/** Bounded wait for the recognition service's final result on send-while-recording. */
export const SEND_FINALIZE_TIMEOUT_MS = 3000;

export interface VoiceDraftApi {
  rec: ReturnType<typeof useSpeechRecognition>;
  listening: boolean;
  voiceNote: string;
  handleMicStart: () => void;
  handleMicStop: () => void;
  /** Submit honoring voice state. Calls `submitDraft(committedText)` exactly once. */
  handleSubmitWithVoice: () => void;
}

/**
 * Shared voice-draft behavior for every NextStride composer.
 *
 * - Stop finalizes dictated text into the editable draft — never submits.
 * - Send-while-recording stops recognition, waits (bounded) for the final
 *   result, merges it with the draft, and submits exactly once.
 * - `setDraft` is flushed synchronously before `submitDraft` runs, so
 *   parents that read the draft from their own state see the dictated words.
 */
export function useVoiceDraft(params: {
  getDraft: () => string;
  setDraft: (v: string) => void;
  submitDraft: (committedText: string) => void;
  loading: boolean;
}): VoiceDraftApi {
  const { getDraft, setDraft, submitDraft, loading } = params;
  const [voiceNote, setVoiceNote] = useState("");
  const draftRef = useRef("");
  draftRef.current = getDraft();
  const submitDraftRef = useRef(submitDraft);
  submitDraftRef.current = submitDraft;
  const sendRequestedRef = useRef(false);
  const submittedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutSafe = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  /** Merge dictated text into the draft and flush so parents see it. */
  const commitCombined = (finalized: string): string => {
    const combined = combineDraft(draftRef.current, finalized);
    if (combined !== draftRef.current) {
      flushSync(() => setDraft(combined));
      draftRef.current = combined;
    }
    return combined;
  };

  const rec = useSpeechRecognition({
    onSessionEnd: (finalized) => {
      clearTimeoutSafe();
      const combined = commitCombined(finalized);
      if (sendRequestedRef.current && !submittedRef.current) {
        submittedRef.current = true;
        sendRequestedRef.current = false;
        if (!combined.trim()) {
          setVoiceNote("Nothing was heard. Your draft is unchanged — type or try again, then send.");
          return;
        }
        setVoiceNote("");
        submitDraftRef.current(combined.trim());
      } else if (!submittedRef.current && !finalized.trim()) {
        setVoiceNote("Nothing was heard. Your draft is unchanged — type or try again.");
      }
    },
  });

  const listening = rec.state === "listening" || rec.state === "finalizing";

  const handleMicStart = () => {
    setVoiceNote("");
    sendRequestedRef.current = false;
    submittedRef.current = false;
    rec.start();
  };

  const handleMicStop = () => {
    // Stop only finalizes into the editable draft — never submits.
    sendRequestedRef.current = false;
    rec.stop();
  };

  const handleSubmitWithVoice = () => {
    if (loading) return;
    if (listening) {
      // Send-while-recording: stop, wait (bounded) for the final result, submit once.
      sendRequestedRef.current = true;
      submittedRef.current = false;
      setVoiceNote("Finalizing your speech…");
      rec.stop();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (sendRequestedRef.current && !submittedRef.current) {
          submittedRef.current = true;
          sendRequestedRef.current = false;
          const combined = commitCombined("");
          if (!combined.trim()) {
            setVoiceNote("Nothing was heard. Your draft is unchanged — type or try again, then send.");
            return;
          }
          setVoiceNote("");
          submitDraftRef.current(combined.trim());
        }
      }, SEND_FINALIZE_TIMEOUT_MS);
      return;
    }
    const text = draftRef.current.trim();
    if (!text || loading) return;
    submitDraftRef.current(text);
  };

  return {
    rec,
    listening,
    voiceNote,
    handleMicStart,
    handleMicStop,
    handleSubmitWithVoice,
  };
}
