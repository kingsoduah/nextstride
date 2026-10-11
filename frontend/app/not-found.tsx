export default function NotFound() {
  return (
    <main className="center" style={{ textAlign: "center", padding: "64px 20px" }}>
      <h1 style={{ fontSize: 96, fontWeight: 700, margin: 0, color: "var(--muted)" }}>404</h1>
      <h2 style={{ fontSize: 24, fontWeight: 600, margin: "16px 0 8px" }}>Page not found</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Sorry, we couldn't find the page you're looking for.</p>
      <a href="/" className="btn btn-primary">Go home</a>
    </main>
  );
}