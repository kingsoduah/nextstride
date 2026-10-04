"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STEPS = [
  "You don't need to do everything at once.",
  "Tell NextStride what's competing for your attention.",
  "We'll help you understand what deserves attention first and why.",
  "When things change, update us and we'll reassess.",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  return (
    <main className="center" style={{ maxWidth: 520 }}>
      <h1>How NextStride works</h1>
      <p className="muted">Step {step + 1} of {STEPS.length}</p>
      <div className="card"><p style={{ fontSize: 18 }}>{STEPS[step]}</p></div>
      <div className="row">
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <button className="btn btn-primary" onClick={() => router.push("/hub")}>Continue to Priority Hub</button>
        )}
      </div>
    </main>
  );
}
