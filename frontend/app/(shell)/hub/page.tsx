"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Composer } from "@/components/Composer";
import { ExampleCards } from "@/components/ExampleCards";
import { api } from "@/lib/api";

export default function HubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(text: string) {
    setLoading(true);
    setError("");
    try {
      const situation = await api<{ id: string }>("/api/situations", { method: "POST", body: { text } });
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
      />
      {error && <p className="error">{error}</p>}
      <ExampleCards onSelect={(text) => void submit(text)} />
    </main>
  );
}
