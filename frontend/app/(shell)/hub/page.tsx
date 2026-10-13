"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Composer } from "@/components/Composer";
import { ExampleCards } from "@/components/ExampleCards";
import { ModelSelector } from "@/components/ModelSelector";
import { loadModelSelection, saveModelSelection, type ModelSelection } from "@/lib/model-selection";
import { notifySituationsChanged } from "@/lib/situations-events";
import { api } from "@/lib/api";

export default function HubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modelSel, setModelSel] = useState<ModelSelection>(() => loadModelSelection());

  async function submit(text: string) {
    setLoading(true);
    setError("");
    try {
      const situation = await api<{ id: string }>("/api/situations", {
        method: "POST",
        body: { text, ...modelSel },
      });
      // The shell layout owns the history list and persists across App
      // Router navigations — signal it so the new situation appears in the
      // sidebar/drawer without a full page reload.
      notifySituationsChanged();
      router.push(`/situations/${situation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze that just now. Your text is saved — try again.");
      setLoading(false);
    }
  }

  return (
    <main className="center">
      <div className="welcome">
        <h1>Welcome to NextStride</h1>
        <p>What&apos;s competing for your attention?</p>
      </div>
      <Composer
        loading={loading}
        placeholder="I have a lecture at 2 PM, fellowship starts at 4:30 PM, a customer is waiting for a delivery, and an assignment is due tomorrow…"
        onSubmit={submit}
        modelSelector={
          <ModelSelector
            value={modelSel}
            disabled={loading}
            onChange={(sel) => {
              setModelSel(sel);
              saveModelSelection(sel);
            }}
          />
        }
      />
      {error && <p className="error">{error}</p>}
      <ExampleCards onSelect={(text) => void submit(text)} />
    </main>
  );
}
