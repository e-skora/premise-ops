import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PREMISE // The Premise-Decay Engine",
  description:
    "CI/CD for Architectural & Strategic Decisions — Automated garbage collector for outdated load-bearing assumptions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
