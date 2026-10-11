"use client";
import { useEffect } from "react";

/**
 * Registers /sw.js in production builds only.
 * Never runs under `next dev` (avoids HMR interference) and the worker
 * itself performs no caching, so auth, API, voice, and AI traffic are
 * unaffected. Registration failure is silent — the app works fully
 * without an installed worker.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a progressive enhancement, not a requirement.
    });
  }, []);
  return null;
}
