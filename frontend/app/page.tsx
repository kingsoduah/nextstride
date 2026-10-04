import Link from "next/link";

export default function Landing() {
  return (
    <main className="center" style={{ textAlign: "center" }}>
      <h1>NextStride</h1>
      <p style={{ fontSize: 20, fontWeight: 600 }}>When everything matters, know what to do next.</p>
      <p className="muted">
        Bring your competing responsibilities. NextStride helps you understand what deserves
        attention now, why, and what to do next.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link href="/signup" className="btn btn-primary" style={{ textDecoration: "none" }}>Get Started</Link>
        <Link href="/login" className="btn" style={{ textDecoration: "none" }}>Log In</Link>
      </div>
    </main>
  );
}
