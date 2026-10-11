"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sidebar, type SidebarSituation } from "@/components/Sidebar";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [situations, setSituations] = useState<SidebarSituation[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (session) api<SidebarSituation[]>("/api/situations").then(setSituations).catch(() => undefined);
  }, [session]);

  // Mobile drawer: Escape closes it and the page behind stays put.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  /** Rename server-side, then reflect the normalized title immediately. */
  const renameSituation = useCallback(async (id: string, title: string) => {
    const updated = await api<{ id: string; title?: string | null }>(`/api/situations/${id}`, {
      method: "PATCH",
      body: { title },
    });
    const stored = updated.title ?? title;
    setSituations((list) => list.map((s) => (s.id === id ? { ...s, title: stored } : s)));
    return stored;
  }, []);

  /** Delete server-side; only drop the item once the backend confirms. */
  const deleteSituation = useCallback(async (id: string) => {
    await api<{ id: string; deleted: boolean }>(`/api/situations/${id}`, { method: "DELETE" });
    setSituations((list) => list.filter((s) => s.id !== id));
  }, []);

  if (isPending || !session) return <main className="center"><div className="skeleton" /></main>;
  return (
    <div className="shell">
      <Sidebar situations={situations} onRename={renameSituation} onDelete={deleteSituation} />
      <div className="main">
        <div className="mobile-bar">
          <button
            className="icon-btn mobile-menu-btn"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <span aria-hidden>☰</span>
          </button>
          <span className="mobile-brand">NextStride</span>
        </div>
        {drawerOpen && (
          <div className="drawer-root">
            <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
              <div className="drawer-head">
                <span className="brand">NextStride</span>
                <button
                  className="icon-btn"
                  aria-label="Close navigation menu"
                  autoFocus
                  onClick={() => setDrawerOpen(false)}
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>
              {/* Same sidebar (history, new, rename, delete); any link tap navigates and closes. */}
              <div
                className="drawer-body"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
                }}
              >
                <Sidebar situations={situations} onRename={renameSituation} onDelete={deleteSituation} />
              </div>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
