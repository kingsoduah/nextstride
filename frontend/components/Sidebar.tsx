"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export interface SidebarSituation {
  id: string;
  text: string;
  /** Owner-set display name; null/absent = fall back to a slice of the text. */
  title?: string | null;
}

interface SidebarProps {
  situations: SidebarSituation[];
  activeId?: string;
  /** Renames server-side; resolves to the normalized title the backend stored. */
  onRename?: (id: string, title: string) => Promise<string>;
  /** Deletes server-side; must reject when the delete did not happen. */
  onDelete?: (id: string) => Promise<void>;
  /** Manual history refresh; omitted = no refresh control rendered. */
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshError?: string | null;
}

function labelFor(s: SidebarSituation): string {
  const custom = s.title?.trim();
  if (custom) return custom;
  return s.text.slice(0, 28) || "Untitled";
}

function failureText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Please log in again.";
    return e.message || fallback;
  }
  return fallback;
}

export function Sidebar({ situations, activeId, onRename, onDelete, onRefresh, refreshing, refreshError }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  // Close the open three-dot menu on outside click or Escape.
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("[data-nav-row]")) setOpenMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  function startRename(s: SidebarSituation) {
    setRowError(null);
    setDraft(labelFor(s));
    setRenamingId(s.id);
    setOpenMenu(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setDraft("");
    setRowError(null);
  }

  async function saveRename(id: string) {
    const title = draft.trim();
    if (!title) {
      setRowError({ id, text: "A name can't be empty." });
      return;
    }
    if (!onRename) return cancelRename();
    setBusyId(id);
    setRowError(null);
    try {
      await onRename(id, title);
      setRenamingId(null);
      setDraft("");
    } catch (e) {
      // Stay in edit mode so the typed name is not lost.
      setRowError({ id, text: failureText(e, "Couldn't rename that just now. Try again.") });
    } finally {
      setBusyId(null);
    }
  }

  function startDelete(s: SidebarSituation) {
    setRowError(null);
    setConfirmingId(s.id);
    setOpenMenu(null);
  }

  function cancelDelete() {
    setConfirmingId(null);
    setRowError(null);
  }

  async function confirmDelete(id: string) {
    if (!onDelete) return cancelDelete();
    setBusyId(id);
    setRowError(null);
    try {
      await onDelete(id);
      setConfirmingId(null);
      // Never leave the user on a page whose situation is gone.
      if (pathname === `/situations/${id}`) router.push("/hub");
    } catch (e) {
      // The item was NOT deleted — keep it listed and surface why.
      setConfirmingId(null);
      setRowError({ id, text: failureText(e, "Couldn't delete that just now. It's still in your list.") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <aside className="sidebar" aria-label="NextStride navigation">
      <div className="brand">NextStride</div>
      <Link href="/hub" className={`nav-item ${pathname === "/hub" ? "active" : ""}`}>
        <span aria-hidden>◇</span> Priority Hub
      </Link>
      <Link href="/hub" className="nav-item">
        <span aria-hidden>＋</span> New situation
      </Link>
      <div className="nav-group-row">
        <div className="nav-group">Recent</div>
        {onRefresh && (
          <button
            className="nav-refresh-btn"
            aria-label="Refresh history"
            title="Refresh history"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <span aria-hidden>⟳</span>
          </button>
        )}
      </div>
      {refreshError && (
        <p className="nav-row-error" role="alert">
          {refreshError}
        </p>
      )}
      {situations.length === 0 && <div className="nav-item muted">No situations yet</div>}
      {situations.slice(0, 10).map((s) => {
        const isActive = activeId === s.id || pathname === `/situations/${s.id}`;
        const label = labelFor(s);
        const busy = busyId === s.id;
        return (
          <div className={`nav-row ${isActive ? "active" : ""}`} key={s.id} data-nav-row>
            {renamingId === s.id ? (
              <form
                className="nav-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveRename(s.id);
                }}
              >
                <input
                  className="nav-rename-input"
                  value={draft}
                  maxLength={80}
                  autoFocus
                  disabled={busy}
                  aria-label={`New name for ${label}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              </form>
            ) : confirmingId === s.id ? (
              <div className="nav-confirm" role="alertdialog" aria-label={`Delete ${label}?`}>
                <span className="nav-confirm-text">
                  Delete “{label}”?
                </span>
                <div className="nav-confirm-actions">
                  <button
                    className="nav-confirm-delete"
                    onClick={() => void confirmDelete(s.id)}
                    disabled={busy}
                    autoFocus
                  >
                    {busy ? "Deleting…" : "Delete"}
                  </button>
                  <button className="nav-confirm-cancel" onClick={cancelDelete} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href={`/situations/${s.id}`}
                  className={`nav-item nav-item-link ${isActive ? "active" : ""}`}
                  title={s.text}
                >
                  <span aria-hidden>○</span>
                  <span className="nav-item-label">{label}</span>
                </Link>
                <button
                  className="nav-row-menu-btn"
                  aria-label={`Actions for ${label}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === s.id}
                  onClick={() => {
                    setRowError(null);
                    setOpenMenu(openMenu === s.id ? null : s.id);
                  }}
                >
                  ⋯
                </button>
                {openMenu === s.id && (
                  <div className="nav-row-menu" role="menu">
                    <button
                      role="menuitem"
                      className="nav-row-menu-item"
                      onClick={() => startRename(s)}
                    >
                      Rename
                    </button>
                    <button
                      role="menuitem"
                      className="nav-row-menu-item danger"
                      onClick={() => startDelete(s)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
            {rowError?.id === s.id && (
              <p className="nav-row-error" role="alert">
                {rowError.text}
              </p>
            )}
          </div>
        );
      })}
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
