/**
 * Cross-component signal: something mutated the situation list (e.g. the hub
 * just created a situation). The shell layout owns the history list and
 * persists across App Router navigations, so it listens for this event and
 * refreshes — no full page reload, no polling.
 */
export const SITUATIONS_CHANGED_EVENT = "nextstride:situations-changed";

export function notifySituationsChanged() {
  window.dispatchEvent(new Event(SITUATIONS_CHANGED_EVENT));
}
