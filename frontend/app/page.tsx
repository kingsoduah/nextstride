import Link from "next/link";

export default function Landing() {
  return (
    <main className="landing">
      <div className="landing-content">
        <div className="landing-brand">
          <span className="brand-icon">⚡</span>
          <h1>NextStride</h1>
        </div>
        <p className="landing-tagline">When everything matters, know what to do next.</p>
        <p className="landing-description">
          Bring your competing responsibilities. NextStride helps you understand 
          what deserves attention now, why, and what to do next.
        </p>
        <div className="landing-actions">
          <Link href="/signup" className="btn btn-primary btn-lg">Get Started</Link>
          <Link href="/login" className="btn btn-secondary btn-lg">Log In</Link>
        </div>
        <p className="landing-footer">AI-powered priority decision assistant for competing responsibilities.</p>
      </div>
    </main>
  );
}