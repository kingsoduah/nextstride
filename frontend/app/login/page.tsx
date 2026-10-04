"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="center" style={{ maxWidth: 440 }}>
      <h1>Log in</h1>
      <input className="field" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <input className="field" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
      {error && <p className="error">{error}</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          authClient.signIn.email(
            { email, password },
            { onSuccess: () => router.push("/hub"), onError: (ctx) => { setError(ctx.error.message ?? "Login failed"); setBusy(false); } },
          );
        }}
      >
        Log In
      </button>
      <p className="muted">No account? <Link href="/signup">Sign up</Link></p>
    </main>
  );
}
