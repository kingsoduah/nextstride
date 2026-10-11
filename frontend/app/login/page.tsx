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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError("");
    authClient.signIn.email(
      { email, password },
      {
        onSuccess: () => router.push("/hub"),
        onError: (ctx) => {
          setError(ctx.error.message ?? "Login failed");
          setBusy(false);
        },
      },
    );
  };

  return (
    <main className="auth-page">
      <div className="auth-modal">
        <div className="auth-modal-header">
          <h1>Welcome back</h1>
          <p className="muted">Sign in to continue to NextStride</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field-group">
            <label htmlFor="email" className="field-label">Email</label>
            <input
              id="email"
              type="email"
              className="field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={busy}
            />
          </div>

          <div className="field-group">
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              type="password"
              className="field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="auth-footer">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </main>
  );
}