"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authCatchMessage, authErrorMessage } from "@/lib/auth-errors";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await authClient.signUp.email(
        { name, email, password },
        { timeout: 60_000 },
      );
      if (authError) {
        setError(authErrorMessage(authError, "Sign up failed. Please try again."));
        return;
      }
      router.push("/onboarding");
    } catch (err) {
      setError(authCatchMessage(err, "Sign up failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-modal">
        <div className="auth-modal-header">
          <img src="/brand/App_Icon.png" alt="NextStride logo" className="auth-brand-mark" width={44} height={44} />
          <h1>Get started</h1>
          <p className="muted">Create your NextStride account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field-group">
            <label htmlFor="name" className="field-label">Name</label>
            <input
              id="name"
              type="text"
              className="field"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              disabled={busy}
            />
          </div>

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
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              disabled={busy}
            />
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy}
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}