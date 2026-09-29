import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synapse | Brand Governance Console",
  description: "Real-time AI memory alignment and governance audit testbench.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-slate-950 text-slate-100 selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
