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

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (session) api<SidebarSituation[]>("/api/situations").then(setSituations).catch(() => undefined);
  }, [session]);

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
      <div className="main">{children}</div>
    </div>
  );
}
