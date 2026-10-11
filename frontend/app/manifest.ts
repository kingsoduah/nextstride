import type { MetadataRoute } from "next";

/**
 * NextStride installable web app manifest (served at /manifest.webmanifest).
 * All icon paths are real generated assets in frontend/public/icons.
 * No offline claims: AI recommendations require connectivity, so nothing
 * here promises offline behavior.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NextStride — Know what to do next",
    short_name: "NextStride",
    description: "AI-powered priority decision assistant for competing responsibilities.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#171717",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
