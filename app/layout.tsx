import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProPagandaAi — AI Clipping Studio",
  description: "Turn any YouTube video or podcast into viral clips with auto captions & smart reframe. Free, local, fast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased selection:bg-violet-500/30">
        {children}
      </body>
    </html>
  );
}
