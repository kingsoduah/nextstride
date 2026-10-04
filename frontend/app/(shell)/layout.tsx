"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [situations, setSituations] = useState<Array<{ id: string; text: string }>>([]);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (session) api<Array<{ id: string; text: string }>>("/api/situations").then(setSituations).catch(() => undefined);
  }, [session]);

  if (isPending || !session) return <main className="center"><div className="skeleton" /></main>;
  return (
    <div className="shell">
      <Sidebar situations={situations} />
      <div className="main">{children}</div>
    </div>
  );
}
