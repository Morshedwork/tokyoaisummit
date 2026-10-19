import type { Metadata } from "next";
import "./globals.css";
import "./refinements.css";
import "./ticketing.css";
import "./motion.css";

export const metadata: Metadata = {
  title: "Tokyo AI Summit 2026 — The Year in AI",
  description: "What changed. What Japan built. What comes next. A year-end gathering in Tokyo exploring AI 2026: From Models to the Real World.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html:"try{document.documentElement.classList.toggle('motion-paused',window.matchMedia('(prefers-reduced-motion: reduce)').matches||localStorage.getItem('tas-motion')==='paused')}catch{}"}}/>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
