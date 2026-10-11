"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackRow, RecommendationCard, UnderstandingCard } from "@/components/Cards";
import { ControlledComposer } from "@/components/Composer";
import { ModelSelector } from "@/components/ModelSelector";
import { RecommendationV2Card } from "@/components/RecommendationV2";
import { ApiError, api, type RecommendationV2Payload, type RecommendationV2Response, type RecommendationV2Row, type RecommendationV2Status, type RecommendationV2VersionMeta, type Situation } from "@/lib/api";
import { expectedProviderFor, loadModelSelection, modelSelectionLabel, saveModelSelection, type ModelSelection } from "@/lib/model-selection";

function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Please log in again.";
    // AI failures carry a concise, actionable, secret-free message from the
    // backend — surface it instead of masking it behind the generic 5xx text.
    if (e.code === "AI_UNAVAILABLE" || e.code === "AI_INVALID_OUTPUT") return e.message;
    if (e.status === 403 || e.status === 404) return "Not found, or it doesn't belong to you.";
    if (e.status >= 500) return "The recommendation service is having trouble. Try again in a moment.";
    return e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

interface V2Display {
  version: number;
  status: RecommendationV2Status;
  payload: RecommendationV2Payload;
}

export default function SituationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [situation, setSituation] = useState<Situation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [v2, setV2] = useState<V2Display | null>(null);
  const [v2versions, setV2versions] = useState<RecommendationV2VersionMeta[]>([]);
  const [v2cache, setV2cache] = useState<Record<number, RecommendationV2Payload>>({});
  const [v2selected, setV2selected] = useState<number | null>(null);
  const [v2busy, setV2busy] = useState(false);
  const [v2answering, setV2answering] = useState(false);
  const [v2error, setV2error] = useState("");
  const [v2started, setV2started] = useState(false);
  const [modelSel, setModelSel] = useState<ModelSelection>(() => loadModelSelection());
  const [providerNote, setProviderNote] = useState("");
  const modelSelRef = useRef<ModelSelection>(modelSel);
  modelSelRef.current = modelSel;

  function noteActualProvider(requested: ModelSelection, actual: string) {
    const expected = expectedProviderFor(requested);
    if (expected && actual !== expected) {
      setProviderNote(`Requested ${modelSelectionLabel(requested)}, but ${actual} responded (fallback).`);
    } else {
      setProviderNote("");
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await api<Situation>(`/api/situations/${params.id}`);
      setSituation(data);
      setFeedbackSent(!!data.feedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this situation.");
    }
    try {
      const latest = await api<RecommendationV2Row>(`/api/situations/${params.id}/recommendation`);
      if (latest.payload) {
        setV2cache((c) => ({ ...c, [latest.version]: latest.payload as RecommendationV2Payload }));
        setV2({ version: latest.version, status: latest.status, payload: latest.payload as RecommendationV2Payload });
        setV2selected(latest.version);
        setV2started(true);
      }
      const vs = await api<RecommendationV2VersionMeta[]>(`/api/situations/${params.id}/recommendation/versions`);
      setV2versions(vs);
    } catch {
      // No V2 recommendation yet — the section offers to generate one.
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
        body: { update_text: updateText.trim(), ...modelSelRef.current },
      });
      setSituation(res.situation);
      setUpdateText("");
      if (v2started) {
        await refreshV2(res.situation.text + `\nUpdate: ${updateText.trim()}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function storeV2(res: RecommendationV2Response) {
    setV2cache((c) => ({ ...c, [res.version]: res.recommendation }));
    setV2({ version: res.version, status: res.status, payload: res.recommendation });
    setV2selected(res.version);
    setV2started(true);
    noteActualProvider(modelSelRef.current, res.provider);
    try {
      const vs = await api<RecommendationV2VersionMeta[]>(`/api/situations/${params.id}/recommendation/versions`);
      setV2versions(vs);
    } catch {
      // History is best-effort; the current recommendation already rendered.
    }
  }

  async function requestV2() {
    setV2busy(true);
    setV2error("");
    try {
      const sel = modelSelRef.current;
      await api(`/api/situations/${situation!.id}/decision-context`, { method: "POST", body: { ...sel } });
      const res = await api<RecommendationV2Response>(`/api/situations/${situation!.id}/recommendation`, {
        method: "POST",
        body: { ...sel },
      });
      await storeV2(res);
    } catch (e) {
      setV2error(friendlyError(e, "Could not generate the recommendation. Try again."));
    } finally {
      setV2busy(false);
    }
  }

  async function refreshV2(fullText: string) {
    setV2busy(true);
    setV2error("");
    try {
      const sel = modelSelRef.current;
      const updated = await api<Situation>(`/api/situations/${situation!.id}`, {
        method: "PATCH",
        body: { text: fullText },
      });
      setSituation(updated);
      await api(`/api/situations/${situation!.id}/decision-context`, { method: "POST", body: { ...sel } });
      const res = await api<RecommendationV2Response>(`/api/situations/${situation!.id}/recommendation`, {
        method: "POST",
        body: { ...sel },
      });
      await storeV2(res);
    } catch (e) {
      setV2error(friendlyError(e, "Could not refresh the recommendation. Try again."));
    } finally {
      setV2busy(false);
    }
  }

  async function answerV2(answer: string) {
    if (!situation) return;
    setV2answering(true);
    try {
      await refreshV2(`${situation.text}\nUpdate: ${answer}`);
    } finally {
      setV2answering(false);
    }
  }

  return (
    <main className="center">
      <button className="btn" onClick={() => router.push("/hub")}>← Priority Hub</button>
      <UnderstandingCard situation={situation} onConfirm={confirm} onEdit={edit} busy={busy} />

      {/* V2 is the primary recommendation experience */}
      <section aria-label="V2 recommendation">
        <h2>Smarter recommendation</h2>
        {providerNote && (
          <p className="muted" style={{ fontSize: 13 }} role="status">{providerNote}</p>
        )}
        {!v2started && !v2busy && !v2error && (
          <>
            <p className="muted">Get a structured recommendation with a concrete next step, risks, and alternatives.</p>
            <button className="btn btn-primary" onClick={() => void requestV2()}>
              Get V2 recommendation
            </button>
          </>
        )}
        {v2busy && (
          <>
            <div className="skeleton" />
            <div className="skeleton" />
            <p className="muted">Analyzing your situation…</p>
          </>
        )}
        {v2error && (
          <>
            <p className="error">{v2error}</p>
            <button className="btn" onClick={() => void requestV2()} disabled={v2busy}>
              Try again
            </button>
          </>
        )}
        {v2 && v2selected != null && v2cache[v2selected] && (
          <RecommendationV2Card
            payload={v2cache[v2selected]}
            version={v2selected}
            status={(v2versions.find((m) => m.version === v2selected)?.status ?? v2.status)}
            versions={v2versions}
            selectedVersion={v2selected}
            onSelectVersion={(ver) => {
              if (v2cache[ver]) {
                setV2selected(ver);
                const meta = v2versions.find((m) => m.version === ver);
                if (meta) setV2({ version: ver, status: meta.status, payload: v2cache[ver] });
              } else {
                setV2busy(true);
                setV2error("");
                api<RecommendationV2Row>(`/api/situations/${situation!.id}/recommendation/versions/${ver}`)
                  .then((row) => {
                    if (row.payload) {
                      setV2cache((c) => ({ ...c, [row.version]: row.payload as RecommendationV2Payload }));
                      setV2selected(row.version);
                      setV2({ version: row.version, status: row.status, payload: row.payload as RecommendationV2Payload });
                    } else {
                      setV2error("That version has no saved details to display.");
                    }
                  })
                  .catch((e) => setV2error(friendlyError(e, "Could not open that version.")))
                  .finally(() => setV2busy(false));
              }
            }}
            onAnswer={answerV2}
            answering={v2answering || v2busy}
            isCurrent={v2selected === v2.version}
          />
        )}
        {v2 && v2selected != null && !v2cache[v2selected] && !v2busy && !v2error && (
          <p className="muted">Loading version {v2selected}…</p>
        )}
      </section>

      {/* V1 legacy experience (kept for regression/comparison) */}
      {latest && (
        <>
          <h3>Legacy recommendation (V1)</h3>
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
            modelSelector={
              <ModelSelector
                value={modelSel}
                disabled={busy}
                onChange={(sel) => {
                  setModelSel(sel);
                  saveModelSelection(sel);
                }}
              />
            }
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