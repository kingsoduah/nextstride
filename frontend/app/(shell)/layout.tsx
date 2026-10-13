"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar, type SidebarSituation } from "@/components/Sidebar";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { SITUATIONS_CHANGED_EVENT } from "@/lib/situations-events";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [situations, setSituations] = useState<SidebarSituation[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const refreshInFlight = useRef(false);
  const drawerBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  /**
   * Single source of truth for the history list. Replaces state wholesale
   * from the server (never appends), so refreshes cannot duplicate entries
   * or flicker the list away — on failure the last good list simply stays.
   */
  const refreshSituations = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!session || refreshInFlight.current) return;
      refreshInFlight.current = true;
      if (opts?.manual) {
        setRefreshing(true);
        setRefreshError("");
      }
      try {
        const list = await api<SidebarSituation[]>("/api/situations");
        setSituations(list);
        setRefreshError("");
      } catch {
        if (opts?.manual) setRefreshError("Couldn't refresh your history. Try again.");
      } finally {
        refreshInFlight.current = false;
        setRefreshing(false);
      }
    },
    [session],
  );

  // The layout persists across App Router client-side navigations, so the
  // list must refresh on every route change (pushes, back/forward, returns
  // to the hub) — otherwise newly created situations stay invisible until a
  // full page reload.
  useEffect(() => {
    if (session) void refreshSituations();
  }, [pathname, session, refreshSituations]);

  // Explicit mutation signal (e.g. hub right after creating a situation).
  useEffect(() => {
    const onChanged = () => void refreshSituations();
    window.addEventListener(SITUATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SITUATIONS_CHANGED_EVENT, onChanged);
  }, [refreshSituations]);

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
    const updated = await api<{ id: string; title?: string | null }>(
      "/api/situations/" + id,
      { method: "PATCH", body: { title } },
    );
    const stored = updated.title ?? title;
    setSituations((list) => list.map((s) => (s.id === id ? { ...s, title: stored } : s)));
    return stored;
  }, []);

  /** Delete server-side; only drop the item once the backend confirms. */
  const deleteSituation = useCallback(async (id: string) => {
    await api<{ id: string; deleted: boolean }>("/api/situations/" + id, { method: "DELETE" });
    setSituations((list) => list.filter((s) => s.id !== id));
  }, []);

  const manualRefresh = useCallback(() => void refreshSituations({ manual: true }), [refreshSituations]);

  // Pull-to-refresh on the drawer history list, using the same safe refresh.
  const pull = usePullToRefresh({
    ref: drawerBodyRef,
    onRefresh: () => refreshSituations({ manual: true }),
    enabled: drawerOpen,
  });

  if (isPending || !session) return <main className="center"><div className="skeleton" /></main>;
  return (
    <div className="shell">
      <Sidebar
        situations={situations}
        onRename={renameSituation}
        onDelete={deleteSituation}
        onRefresh={manualRefresh}
        refreshing={refreshing}
        refreshError={refreshError}
      />
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
          <span className="mobile-brand">
            <img src="/brand/Primary_Logo_cropped.png" alt="NextStride" className="brand-logo-sm" width={120} height={30} />
          </span>
          <button
            className="icon-btn mobile-refresh-btn"
            aria-label="Refresh history"
            title="Refresh history"
            disabled={refreshing}
            onClick={manualRefresh}
          >
            <span aria-hidden>⟳</span>
          </button>
        </div>
        {drawerOpen && (
          <div className="drawer-root">
            <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
              <div className="drawer-head drawer-head-close">
                <button
                  className="icon-btn"
                  aria-label="Close navigation menu"
                  autoFocus
                  onClick={() => setDrawerOpen(false)}
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>
              <div
                className="drawer-body"
                ref={drawerBodyRef}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
                }}
              >
                <div
                  className={"ptr-indicator" + (pull.state !== "idle" ? " active" : "")}
                  aria-hidden={pull.state !== "refreshing"}
                >
                  {pull.state === "pulling" && <span>↓ Keep pulling to refresh</span>}
                  {pull.state === "ready" && <span>↑ Release to refresh</span>}
                  {pull.state === "refreshing" && (
                    <span role="status">Refreshing your history…</span>
                  )}
                </div>
                {pull.error && (
                  <p className="nav-row-error" role="alert">
                    {pull.error}{" "}
                    <button className="link-btn" onClick={pull.clearError}>
                      Dismiss
                    </button>
                  </p>
                )}
                <Sidebar
                  situations={situations}
                  onRename={renameSituation}
                  onDelete={deleteSituation}
                  onRefresh={manualRefresh}
                  refreshing={refreshing || pull.state === "refreshing"}
                  refreshError={refreshError}
                />
              </div>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
