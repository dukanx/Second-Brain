import type { Metadata } from "next";
import Link from "next/link";
import ArchitectureTab from "@/components/ArchitectureTab";

export const metadata: Metadata = {
  title: "second_brain · system architecture",
  description:
    "Public, read-only architecture explorer for second_brain — layered system overview, data flows, dependency map, file tree, and the full AI pipeline.",
  openGraph: {
    title: "second_brain · system architecture",
    description:
      "Public, read-only architecture explorer: system overview, data flows, dependency map, file tree, AI pipeline.",
  },
};

export default function PublicArchPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/SBicon.png"
            alt="second_brain"
            width={20}
            height={20}
            className="rounded-sm shrink-0"
          />
          <span className="text-amber font-bold text-sm tracking-tight truncate">
            second_brain
          </span>
          <span className="text-muted/50 text-xs font-mono hidden sm:inline">
            / architecture
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://github.com/dukanx/Second-Brain"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="text-xs text-muted hover:text-amber border border-border rounded px-2 py-1 transition-colors hover:border-amber"
          >
            open app →
          </Link>
        </div>
      </header>

      {/* Intro */}
      <div className="border-b border-border bg-surface/40 px-4 py-2">
        <p className="container mx-auto max-w-5xl text-[11px] text-muted font-mono">
          <span className="text-green">$</span> read-only system explorer — no
          login or personal data, just how it&apos;s built
        </p>
      </div>

      {/* Main — horizontal scroll safety for wide diagrams on small screens */}
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-5">
        <div className="overflow-x-auto">
          <ArchitectureTab />
        </div>
      </main>
    </div>
  );
}
