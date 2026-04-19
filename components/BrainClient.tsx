"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import CaptureTab from "./CaptureTab";
import SearchTab from "./SearchTab";
import GraphTab from "./GraphTab";
import DigestTab from "./DigestTab";
import GrowthTab from "./GrowthTab";
import ChatTab from "./ChatTab";
import SearchOverlay from "./SearchOverlay";
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
  starred: boolean;
  last_reviewed_at: string | null;
};

type Tab = "capture" | "search" | "graph" | "digest" | "grow" | "chat";

const TYPE_COLORS: Record<string, string> = {
  Idea: "text-amber",
  Link: "text-blue",
  Task: "text-green",
  Learning: "text-purple",
  Note: "text-muted",
};

export { TYPE_COLORS };

const TABS: { id: Tab; label: string; icon: string; activeColor: string }[] = [
  { id: "capture", label: "capture", icon: "✦", activeColor: "text-amber"  },
  { id: "search",  label: "search",  icon: "⌕", activeColor: "text-blue"   },
  { id: "graph",   label: "graph",   icon: "◉", activeColor: "text-green"  },
  { id: "digest",  label: "digest",  icon: "◈", activeColor: "text-purple" },
  { id: "grow",    label: "grow",    icon: "✺", activeColor: "text-green"  },
  { id: "chat",    label: "chat",    icon: "◇", activeColor: "text-purple" },
];

export default function BrainClient({
  user,
  initialCaptures,
}: {
  user: User;
  initialCaptures: Capture[];
}) {
  const [tab, setTab]           = useState<Tab>("capture");
  const [captures, setCaptures] = useState<Capture[]>(initialCaptures);
  const [syncing, setSyncing]   = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"unknown" | "granted" | "denied">("unknown");
  const router   = useRouter();
  const supabase = createClient();

  // ── Visibility-based sync (free alternative to Realtime) ─────
  const sync = useCallback(async (quiet = false) => {
    if (!quiet) setSyncing(true);
    try {
      const { data } = await supabase
        .from("captures")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setCaptures(data);
    } finally {
      if (!quiet) setSyncing(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Sync when tab becomes visible (switch device, lock/unlock screen)
    function onVisibility() {
      if (document.visibilityState === "visible") sync(true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Passive poll every 60s while tab is active
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") sync(true);
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [sync]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    setNotifStatus(Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "unknown");
  }, []);

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setNotifStatus("denied"); return; }
    setNotifStatus("granted");
    const reg = await navigator.serviceWorker.ready;
    const raw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      .replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(raw);
    const key = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) key[i] = binary.charCodeAt(i);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub }),
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refreshCaptures = useCallback(() => sync(), [sync]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {searchOpen && <SearchOverlay captures={captures} onClose={() => setSearchOpen(false)} />}
      {/* Header */}
      <header className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
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
          {notifStatus !== "granted" && notifStatus !== "denied" && (
            <button
              onClick={enableNotifications}
              className="text-xs text-muted hover:text-amber border border-border rounded px-2 py-1 transition-colors hidden sm:block"
              title="Enable review reminders"
            >
              🔔
            </button>
          )}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
            title="Search (⌘K)"
          >
            <span>⌕</span>
            <kbd className="hidden sm:inline text-[10px] border border-border rounded px-1">⌘K</kbd>
          </button>
          {/* Sync indicator */}
          <button
            onClick={() => sync()}
            className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors"
            title="sync now"
          >
            <span className={syncing ? "animate-spin text-amber" : "text-green"}>
              {syncing ? "↻" : "■"}
            </span>
            <span className="hidden sm:inline">{captures.length} captures</span>
            <span className="sm:hidden">{captures.length}</span>
          </button>
          <span className="text-xs text-muted hidden sm:block">{user.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-muted hover:text-amber transition-colors px-2 py-1 border border-border rounded hover:border-amber"
          >
            exit()
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-5 pb-24 sm:pb-6">
        {tab === "capture" && <CaptureTab captures={captures} setCaptures={setCaptures} />}
        {tab === "search"  && <SearchTab  captures={captures} />}
        {tab === "graph"   && <GraphTab   captures={captures} onRelatesUpdated={refreshCaptures} />}
        {tab === "digest"  && <DigestTab  captures={captures} userId={user.id} />}
        {tab === "grow"    && <GrowthTab  captures={captures} setCaptures={setCaptures} />}
        {tab === "chat"    && <ChatTab    captures={captures} />}
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
