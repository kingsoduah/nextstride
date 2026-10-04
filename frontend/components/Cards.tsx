"use client";
import { useState } from "react";
import type { Situation } from "@/lib/api";

export function UnderstandingCard({
  situation,
  onConfirm,
  onEdit,
  busy,
}: {
  situation: Situation;
  onConfirm: () => Promise<void>;
  onEdit: (text: string) => Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(situation.text);
  const ctx = situation.context;
  if (!ctx) return <div className="card">Analyzing…</div>;
  return (
    <section className="card" aria-label="Here's what I understand">
      <h2 style={{ marginTop: 0 }}>Here&apos;s what I understand</h2>
      <h3>Responsibilities</h3>
      <ul>
        {ctx.responsibilities.map((r) => (
          <li key={r.id}>
            <strong>[{r.category}]</strong> {r.title} <span className="pill">{r.timeRef || "no time"}</span>
            {r.fixedTime && <span className="pill">fixed time</span>}
            {r.delegatable && <span className="pill">delegatable</span>}
          </li>
        ))}
      </ul>
      <h3>Conflicts</h3>
      <ul>
        {ctx.conflicts.length === 0 && <li>No direct overlap detected yet.</li>}
        {ctx.conflicts.map((c) => (
          <li key={c.id}>{c.description}</li>
        ))}
      </ul>
      {ctx.uncertainties.length > 0 && (
        <>
          <h3>Uncertainties</h3>
          <ul>
            {ctx.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </>
      )}
      {!editing ? (
        <div className="row">
          <button className="btn btn-primary" onClick={() => onConfirm()} disabled={busy || situation.confirmed}>
            {situation.confirmed ? "Confirmed ✓" : "Confirm — Get Recommendation"}
          </button>
          <button className="btn" onClick={() => setEditing(true)}>
            Edit situation
          </button>
        </div>
      ) : (
        <div>
          <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Edit situation" />
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => onEdit(text.trim()).then(() => setEditing(false))}>
              Save &amp; Re-analyze
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function RecommendationCard({ rec }: { rec: Situation["recommendations"][number] }) {
  return (
    <section className="card" aria-label={`Recommendation version ${rec.version}`}>
      <h2 style={{ marginTop: 0 }}>Your NextStride <span className="muted">· v{rec.version}</span></h2>
      <div className="rec-block"><strong>Recommended next step:</strong><br />{rec.recommendedPriority}</div>
      <div className="rec-block"><strong>Why:</strong><br />{rec.why}</div>
      <div className="rec-block"><strong>Do this now:</strong><br />{rec.nextAction}</div>
      <div className="rec-block">
        <strong>What happens to the others:</strong>
        <ul>
          {rec.others.length === 0 && <li>Nothing else pending.</li>}
          {rec.others.map((o, i) => (
            <li key={i}><strong>{o.title}</strong> — {o.suggestedHandling}</li>
          ))}
        </ul>
      </div>
      <div className="rec-block">
        <strong>Reassess if:</strong>
        <ul>{rec.reassessIf.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      {rec.uncertaintyNotes && <p className="muted">{rec.uncertaintyNotes}</p>}
    </section>
  );
}

export function FeedbackRow({ onSend, sent }: { onSend: (helpful: boolean, note: string) => Promise<void>; sent: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (sent) return <p className="muted">Thanks — your feedback was recorded.</p>;
  return (
    <section className="card" aria-label="Did this help?">
      <h3 style={{ marginTop: 0 }}>Did this help?</h3>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => { setBusy(true); onSend(true, note).finally(() => setBusy(false)); }}>👍 Helpful</button>
        <button className="btn" disabled={busy} onClick={() => { setBusy(true); onSend(false, note).finally(() => setBusy(false)); }}>👎 Not helpful</button>
      </div>
      <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us what happened (optional)" aria-label="Outcome note" />
    </section>
  );
}
