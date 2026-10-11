"use client";
import { useEffect, useRef } from "react";
import { useState } from "react";
import type { RecommendationV2Payload, RecommendationV2Status, RecommendationV2VersionMeta } from "@/lib/api";
import { buildSpokenRecommendation } from "@/lib/voice-utils";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useVoiceDraft } from "@/hooks/useVoiceDraft";
import { VoiceInputButton } from "./VoiceInputButton";
import { ReadAloudControl } from "./ReadAloudControl";

const STATUS_META: Record<RecommendationV2Status, { label: string; note: string; tone: string }> = {
  RECOMMEND: {
    label: "Recommended next step",
    note: "Based on your current situation.",
    tone: "status-ok",
  },
  REASSESS: {
    label: "Updated recommendation",
    note: "The situation changed, so this replaces the previous version.",
    tone: "status-info",
  },
  NEEDS_INPUT: {
    label: "One question first",
    note: "Some information is missing — answer below to continue.",
    tone: "status-warn",
  },
  INFEASIBLE: {
    label: "Doesn't fit as planned",
    note: "The current constraints make this impossible. See safe options below.",
    tone: "status-bad",
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_SHORT: Record<RecommendationV2Status, string> = {
  RECOMMEND: "Recommended",
  REASSESS: "Updated",
  NEEDS_INPUT: "Needs info",
  INFEASIBLE: "Needs change",
};

export function RecommendationV2Card({
  payload,
  version,
  status,
  versions,
  selectedVersion,
  onSelectVersion,
  onAnswer,
  answering,
  isCurrent,
}: {
  payload: RecommendationV2Payload;
  version: number;
  status: RecommendationV2Status;
  versions: RecommendationV2VersionMeta[];
  selectedVersion: number;
  onSelectVersion: (v: number) => void;
  onAnswer: (answer: string) => Promise<void>;
  answering: boolean;
  isCurrent: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const meta = STATUS_META[status];
  const blocking = payload.unknowns.filter((u) => u.blocking);
  const question = blocking[0] ?? payload.unknowns[0];

  // Voice answer: dictated text lands in the same editable field.
  // Send-while-recording finalizes first, then submits once via onAnswer.
  const answerRef = useRef(answer);
  answerRef.current = answer;
  const ansVoice = useVoiceDraft({
    getDraft: () => answerRef.current,
    setDraft: setAnswer,
    submitDraft: (text) => {
      if (text && !answering) void onAnswer(text).then(() => setAnswer(""));
    },
    loading: answering,
  });
  const ansRec = ansVoice.rec;
  const ansListening = ansVoice.listening;

  // Read aloud: speaks only the currently displayed recommendation, on request.
  const synth = useSpeechSynthesis();
  const spokenKey = `${version}:${status}:${payload.nextMove}`;
  const spokenKeyRef = useRef(spokenKey);
  useEffect(() => {
    // Stop stale speech when navigating to a different recommendation version.
    if (spokenKeyRef.current !== spokenKey) {
      spokenKeyRef.current = spokenKey;
      synth.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenKey]);

  return (
    <section className="card" aria-label={`V2 recommendation version ${version}`}>
      <div className={`status-banner ${meta.tone}`}>
        <strong>{meta.label}</strong>
        <span> · v{version}</span>
        {!isCurrent && <span> · viewing history</span>}
        <div className="muted" style={{ fontSize: 13 }}>{meta.note}</div>
      </div>

      <h2 style={{ marginBottom: 4 }}>{payload.nextMove}</h2>

      <ReadAloudControl
        speechState={synth.state}
        isSupported={synth.isSupported}
        onRead={() => synth.speak(buildSpokenRecommendation(meta.label, payload))}
        onPause={synth.pause}
        onResume={synth.resume}
        onStop={synth.stop}
      />
      {synth.error && (
        <p className="error" style={{ fontSize: 13, margin: "6px 0 0" }} role="status">{synth.error}</p>
      )}

      <div className="rec-block"><strong>Why this is recommended</strong><br />{payload.why}</div>

      {payload.plan.length > 0 && (
        <div className="rec-block">
          <strong>Action plan</strong>
          <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {payload.plan.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}

      {payload.whatCanWait.length > 0 && (
        <div className="rec-block">
          <strong>What can wait</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {payload.whatCanWait.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <div className="rec-block">
        <strong>Risks</strong><br />{payload.risk}
        <br /><br />
        <strong>Review when…</strong><br />{payload.reassessmentTrigger}
      </div>

      {(payload.assumptions.length > 0 || payload.unknowns.length > 0) && (
        <div className="rec-block">
          {payload.assumptions.length > 0 && (
            <>
              <strong>Assumptions</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {payload.assumptions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}
          {payload.unknowns.length > 0 && (
            <>
              <strong>What we still need to know</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {payload.unknowns.map((u, i) => (
                  <li key={i}><strong>{u.field}</strong> — {u.whyItMatters}{u.blocking ? " (needed to proceed)" : ""}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {payload.options.length > 0 && (
        <div className="rec-block">
          <strong>Safe alternatives</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {payload.options.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {status === "NEEDS_INPUT" && question && isCurrent && (
        <form
          className="composer"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            ansVoice.handleSubmitWithVoice();
          }}
        >
          <label className="muted" htmlFor="v2-answer" style={{ fontSize: 13 }}>
            {question.field} — {question.whyItMatters}
          </label>
          <textarea
            id="v2-answer"
            value={answer + (ansListening && ansRec.interimText ? (answer && !answer.endsWith(" ") ? " " : "") + ansRec.interimText : "")}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type the missing information…"
            aria-label="Answer the question"
          />
          <div className="composer-footer">
            <span className="muted" style={{ fontSize: 13 }} role="status">
              {ansListening ? "Listening… speak now" : ""}
            </span>
            <span className="composer-actions">
              <VoiceInputButton
                recState={ansRec.state}
                isSupported={ansRec.isSupported}
                disabled={answering}
                onStart={ansVoice.handleMicStart}
                onStop={ansVoice.handleMicStop}
              />
              <button className="icon-btn primary" type="submit" disabled={answering || (!answer.trim() && !ansListening)} aria-label="Submit answer and reassess">
                {answering ? "…" : "↑"}
              </button>
            </span>
          </div>
          {(ansRec.error || ansVoice.voiceNote) && (
            <p className={ansRec.error ? "error" : "muted"} style={{ fontSize: 13, margin: "6px 0 0" }} role="status">
              {ansRec.error || ansVoice.voiceNote}
            </p>
          )}
        </form>
      )}

      {versions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 14 }}>Recommendation history</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {versions.map((v) => (
              <li key={v.id} style={{ margin: "4px 0" }}>
                <button
                  className={`nav-item${v.version === selectedVersion ? " active" : ""}`}
                  onClick={() => onSelectVersion(v.version)}
                  aria-current={v.version === selectedVersion}
                >
                  <span className="pill">{STATUS_SHORT[v.status]}</span>
                  <span>v{v.version}</span>
                  <span className="muted">· {formatTime(v.createdAt)}</span>
                  {v.version === versions[versions.length - 1]?.version && <span className="muted">· current</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
