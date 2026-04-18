"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import CaptureTab from "./CaptureTab";
import SearchTab from "./SearchTab";
import GraphTab from "./GraphTab";
import type { User } from "@supabase/supabase-js";

export type Capture = {
  id: string;
  user_id: string;
  text: string;
  title: string;
  type: string;
  project: string;
  related_ids: string[];
  created_at: string;
};

type Tab = "capture" | "search" | "graph";

const TYPE_COLORS: Record<string, string> = {
  Idea: "text-amber",
  Link: "text-blue",
  Task: "text-green",
  Learning: "text-purple",
  Note: "text-muted",
};

export { TYPE_COLORS };

const TABS: { id: Tab; label: string; icon: string; activeColor: string }[] = [
  { id: "capture", label: "capture", icon: "✦", activeColor: "text-amber" },
  { id: "search",  label: "search",  icon: "⌕", activeColor: "text-blue"  },
  { id: "graph",   label: "graph",   icon: "◉", activeColor: "text-green" },
];

export default function BrainClient({
  user,
  initialCaptures,
}: {
  user: User;
  initialCaptures: Capture[];
}) {
  const [tab, setTab] = useState<Tab>("capture");
  const [captures, setCaptures] = useState<Capture[]>(initialCaptures);
  const router = useRouter();
  const supabase = createClient();

  const refreshCaptures = useCallback(async () => {
    const { data } = await supabase
      .from("captures")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setCaptures(data);
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-amber">▣</span>
            <span className="text-amber font-bold text-sm tracking-tight">second_brain</span>
          </div>
          {/* Desktop tabs */}
          <nav className="hidden sm:flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1 text-xs rounded transition-all duration-150 ${
                  tab === t.id
                    ? `${t.activeColor} bg-bg border border-border`
                    : "text-muted hover:text-text"
                }`}
              >
                [{t.label}]
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted hidden sm:block">{user.email}</span>
          <span className="text-xs text-muted">
            <span className="text-green">■</span>{" "}
            <span className="hidden xs:inline">{captures.length} captures</span>
            <span className="xs:hidden">{captures.length}</span>
          </span>
          <button
            onClick={signOut}
            className="text-xs text-muted hover:text-amber transition-colors px-2 py-1 border border-border rounded hover:border-amber"
          >
            exit()
          </button>
        </div>
      </header>

      {/* Main — extra bottom padding on mobile for nav */}
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-5 pb-24 sm:pb-6">
        {tab === "capture" && (
          <CaptureTab captures={captures} setCaptures={setCaptures} />
        )}
        {tab === "search" && <SearchTab captures={captures} />}
        {tab === "graph" && (
          <GraphTab captures={captures} onRelatesUpdated={refreshCaptures} />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-surface border-t border-border flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              tab === t.id ? t.activeColor : "text-muted"
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[10px] tracking-wide">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
