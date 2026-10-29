"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authCatchMessage, authErrorMessage } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      // Bounded wait: Render's free tier can take ~50 s to wake, but a dead
      // connection must not leave the form stuck on "Signing in…" forever.
      const { error: authError } = await authClient.signIn.email(
        { email, password },
        { timeout: 60_000 },
      );
      if (authError) {
        setError(authErrorMessage(authError, "Login failed. Please try again."));
        return;
      }
      router.push("/hub");
    } catch (err) {
      // Network failures/timeouts reject the promise instead of calling onError.
      setError(authCatchMessage(err, "Login failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-modal">
        <div className="auth-modal-header">
          <img src="/brand/App_Icon.png" alt="NextStride logo" className="auth-brand-mark" width={44} height={44} />
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