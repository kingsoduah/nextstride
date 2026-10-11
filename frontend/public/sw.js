/**
 * NextStride service worker — deliberately cache-free.
 *
 * Why this exists: installability heuristics expect a registered worker with
 * a fetch handler. Why it caches nothing: every meaningful response in this
 * app is private or dynamic — Better Auth sessions, /api situation/history
 * data, AI requests, voice drafts. Caching any of that in Cache Storage
 * risks leaking one user's data to another session on a shared device and
 * risks trapping users on stale app assets.
 *
 * With no caches, updates flow through the normal network path: a new
 * deployment is picked up on next navigation, and this worker itself
 * updates via the browser's built-in service-worker update check.
 * AI recommendations are NOT available offline and nothing here claims
 * otherwise — fetches pass straight through to the network.
 */

const SW_VERSION = "nextstride-sw-v1";

self.addEventListener("install", () => {
  // No pre-cache by design (see above). Activate whenever the browser decides.
});

self.addEventListener("activate", () => {
  // No old caches to purge — none are ever created.
});

// Pass-through fetch handler. Present so installability checks see a worker
// that owns fetches; intentionally performs no caching, no offline fallback,
// and never touches request/response bodies (no credentials are read here).
self.addEventListener("fetch", () => {
  // Intentionally empty: use default network behavior for everything.
});
