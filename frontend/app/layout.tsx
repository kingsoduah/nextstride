import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextStride — When everything matters, know what to do next",
  description: "AI-powered priority decision assistant for competing responsibilities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
