"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function Sidebar({ situations, activeId }: { situations: Array<{ id: string; text: string }>; activeId?: string }) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  return (
    <aside className="sidebar" aria-label="NextStride navigation">
      <div className="brand">NextStride</div>
      <Link href="/hub" className={`nav-item ${pathname === "/hub" ? "active" : ""}`}>
        <span aria-hidden>◇</span> Priority Hub
      </Link>
      <Link href="/hub" className="nav-item">
        <span aria-hidden>＋</span> New situation
      </Link>
      <div className="nav-group">Recent</div>
      {situations.length === 0 && <div className="nav-item muted">No situations yet</div>}
      {situations.slice(0, 10).map((s) => (
        <Link
          key={s.id}
          href={`/situations/${s.id}`}
          className={`nav-item ${activeId === s.id ? "active" : ""}`}
          title={s.text}
        >
          <span aria-hidden>○</span> {s.text.slice(0, 28) || "Untitled"}
        </Link>
      ))}
      <div style={{ marginTop: "auto" }}>
        <div className="nav-item muted">{session?.user?.name ?? session?.user?.email ?? ""}</div>
        {session && (
          <button
            className="nav-item"
            onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
          >
            <span aria-hidden>↩</span> Log out
          </button>
        )}
      </div>
    </aside>
  );
}
