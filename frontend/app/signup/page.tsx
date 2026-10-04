"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="center" style={{ maxWidth: 440 }}>
      <h1>Create your account</h1>
      <input className="field" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      <input className="field" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <input className="field" type="password" placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
      {error && <p className="error">{error}</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          authClient.signUp.email(
            { name, email, password },
            { onSuccess: () => router.push("/onboarding"), onError: (ctx) => { setError(ctx.error.message ?? "Sign up failed"); setBusy(false); } },
          );
        }}
      >
        Sign Up
      </button>
      <p className="muted">Have an account? <Link href="/login">Log in</Link></p>
    </main>
  );
}
