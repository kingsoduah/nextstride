"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type PullState = "idle" | "pulling" | "ready" | "refreshing";

const READY_DISTANCE = 64;
const MAX_PULL = 96;

/** Elements where a pull gesture must never start (controls, text entry, links). */
function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, button, a, [contenteditable], [data-no-ptr]"),
  );
}

/**
 * Web-level pull-to-refresh for a scroll container (the Android WebView has
 * no native SwipeRefreshLayout). Engages ONLY when the container is already
 * scrolled to the top, the touch starts outside interactive elements, and
 * the drag is predominantly vertical and downward. Normal scrolling, taps on
 * history links, text entry, and the on-screen keyboard are unaffected:
 * any upward/horizontal move, second finger, or scroll offset cancels.
 */
export function usePullToRefresh(opts: {
  ref: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<unknown>;
  enabled?: boolean;
}) {
  const { ref, onRefresh } = opts;
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<PullState>("idle");
  const [distance, setDistance] = useState(0);
  const [error, setError] = useState("");
  const track = useRef<{ startY: number; startX: number; active: boolean } | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const clearError = useCallback(() => setError(""), []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const cancel = () => {
      track.current = null;
      setDistance(0);
      setState((s) => (s === "refreshing" ? s : "idle"));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        cancel();
        return;
      }
      const t = e.touches[0];
      // Only ever engage from the very top on a non-interactive target.
      if (el.scrollTop <= 0 && !isInteractive(e.target)) {
        track.current = { startY: t.clientY, startX: t.clientX, active: true };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const tr = track.current;
      if (!tr?.active || e.touches.length > 1) {
        if (e.touches.length > 1) cancel();
        return;
      }
      const t = e.touches[0];
      const dy = t.clientY - tr.startY;
      const dx = Math.abs(t.clientX - tr.startX);
      // Horizontal drift, upward motion, or scrolled content: not a pull.
      if (dx > 24 || dy < 0 || el.scrollTop > 0) {
        cancel();
        return;
      }
      if (dy > 8) {
        // Take over the gesture so the page doesn't rubber-band behind us.
        e.preventDefault();
        const d = Math.min(dy * 0.5, MAX_PULL);
        setDistance(d);
        setState(d >= READY_DISTANCE ? "ready" : "pulling");
        setError("");
      }
    };

    const onTouchEnd = () => {
      const tr = track.current;
      track.current = null;
      if (!tr?.active) return;
      setState((s) => {
        if (s === "ready") {
          setDistance(0);
          void (async () => {
            setState("refreshing");
            try {
              await onRefreshRef.current();
            } catch {
              setError("Couldn't refresh just now. Try again.");
            } finally {
              setState("idle");
            }
          })();
          return "refreshing";
        }
        setDistance(0);
        return "idle";
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", cancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", cancel);
    };
  }, [ref, enabled]);

  return { state, distance, error, clearError };
}
