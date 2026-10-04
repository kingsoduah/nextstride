"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FeedbackRow, RecommendationCard, UnderstandingCard } from "@/components/Cards";
import { ControlledComposer } from "@/components/Composer";
import { api, type Situation } from "@/lib/api";

export default function SituationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [situation, setSituation] = useState<Situation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<Situation>(`/api/situations/${params.id}`);
      setSituation(data);
      setFeedbackSent(!!data.feedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this situation.");
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <main className="center"><p className="error">{error}</p></main>;
  if (!situation) return <main className="center"><div className="skeleton" /><div className="skeleton" /></main>;

  const latest = situation.recommendations[situation.recommendations.length - 1];

  async function confirm() {
    setBusy(true);
    try {
      await api(`/api/situations/${situation!.id}`, { method: "PATCH", body: { confirmed: true } });
      const res = await api<{ recommendation: Situation["recommendations"][number]; situation: Situation }>(
        `/api/situations/${situation!.id}/prioritize`,
        { method: "POST", body: {} },
      );
      setSituation(res.situation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recommendation failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function edit(text: string) {
    setBusy(true);
    try {
      const updated = await api<Situation>(`/api/situations/${situation!.id}`, { method: "PATCH", body: { text } });
      setSituation(updated);
    } finally {
      setBusy(false);
    }
  }

  async function reassess() {
    if (!updateText.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ situation: Situation }>(`/api/situations/${situation!.id}/reassess`, {
        method: "POST",
        body: { update_text: updateText.trim() },
      });
      setSituation(res.situation);
      setUpdateText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <button className="btn" onClick={() => router.push("/hub")}>← Priority Hub</button>
      <UnderstandingCard situation={situation} onConfirm={confirm} onEdit={edit} busy={busy} />
      {latest && (
        <>
          <RecommendationCard rec={latest} />
          {situation.recommendations.length > 1 && (
            <p className="muted">
              History: {situation.recommendations.map((r) => `v${r.version}`).join(" → ")} (immutable, never overwritten)
            </p>
          )}
          <h3>Situation changed?</h3>
          <ControlledComposer
            value={updateText}
            setValue={setUpdateText}
            onSubmit={reassess}
            loading={busy}
            placeholder="e.g. My assistant just said they can't cover the fellowship."
            submitLabel="Reassess"
          />
          <FeedbackRow
            sent={feedbackSent}
            onSend={async (helpful, note) => {
              await api(`/api/situations/${situation.id}/feedback`, { method: "POST", body: { helpful, note } });
              setFeedbackSent(true);
            }}
          />
        </>
      )}
    </main>
  );
}
