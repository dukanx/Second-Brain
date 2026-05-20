"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import CaptureTab from "./CaptureTab";
import SearchTab from "./SearchTab";
import GraphTab from "./GraphTab";
import GrowthTab from "./GrowthTab";
import ChatTab from "./ChatTab";
import ArchitectureTab from "./ArchitectureTab";
import SearchOverlay from "./SearchOverlay";
import type { User } from "@supabase/supabase-js";
import {
  Sparkles, Search, Network, Sprout, MessageSquare, Hexagon,
  Brain, Bell, RefreshCw, Circle, Power,
  Lightbulb, Link2, CheckSquare, GraduationCap, StickyNote,
  type LucideIcon,
} from "lucide-react";

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
  due_date: string | null;
  priority: "high" | "medium" | "low";
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  color: string;
};

type Tab = "capture" | "search" | "graph" | "grow" | "chat" | "arch";

const TYPE_COLORS: Record<string, string> = {
  Idea: "text-amber",
  Link: "text-blue",
  Task: "text-green",
  Learning: "text-purple",
  Note: "text-muted",
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  Idea: Lightbulb,
  Link: Link2,
  Task: CheckSquare,
  Learning: GraduationCap,
  Note: StickyNote,
};

function TypeIcon({ type, size = 13, className = "" }: { type: string; size?: number; className?: string }) {
  const Icon = TYPE_ICONS[type] ?? StickyNote;
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      className={`${TYPE_COLORS[type] ?? "text-muted"} ${className}`}
      aria-label={type}
    />
  );
}

export { TYPE_COLORS, TYPE_ICONS, TypeIcon };

const TABS: { id: Tab; label: string; Icon: LucideIcon; activeColor: string; desktopOnly?: boolean }[] = [
  { id: "capture", label: "capture", Icon: Sparkles,       activeColor: "text-amber"  },
  { id: "search",  label: "search",  Icon: Search,         activeColor: "text-blue"   },
  { id: "graph",   label: "graph",   Icon: Network,        activeColor: "text-green"  },
  { id: "grow",    label: "grow",    Icon: Sprout,         activeColor: "text-green"  },
  { id: "chat",    label: "chat",    Icon: MessageSquare,  activeColor: "text-purple" },
  { id: "arch",    label: "arch",    Icon: Hexagon,        activeColor: "text-muted", desktopOnly: true },
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncing, setSyncing]   = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"unknown" | "granted" | "denied" | "subscribed">("unknown");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const router   = useRouter();
  const supabase = createClient();

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => { if (d.projects) setProjects(d.projects); })
      .catch(() => {});
  }, []);

  const handleProjectCreated = useCallback(async (name: string): Promise<Project> => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.project) setProjects((prev) => [...prev, data.project]);
    return data.project;
  }, []);

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

  async function subscribePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const raw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      .replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
    const binary = atob(padded);
    const key = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) key[i] = binary.charCodeAt(i);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub }),
    });
    if (res.ok) setNotifStatus("subscribed");
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (typeof Notification === "undefined") return;
    const perm = Notification.permission;
    if (perm === "denied") { setNotifStatus("denied"); return; }
    if (perm !== "granted") return;
    // Permission already granted — check if browser already has a push subscription
    // If yes, sync it to server (no user gesture needed). If no, show the button.
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((existing) => {
        if (existing) {
          // Sync existing subscription to server in case DB was cleared
          fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: existing }),
          }).then((r) => { if (r.ok) setNotifStatus("subscribed"); });
        } else {
          // No browser subscription yet — keep button visible so user can tap (iOS requires gesture)
          setNotifStatus("granted");
        }
      })
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setNotifStatus("denied"); return; }
    await subscribePush();
  }

  useEffect(() => {
    // App opened from notification (URL param)
    const params = new URLSearchParams(window.location.search);
    const reviewParam = params.get("review");
    const taskParam = params.get("task");
    if (reviewParam) {
      setTab("chat");
      setReviewId(reviewParam);
      window.history.replaceState({}, "", "/brain");
    } else if (taskParam) {
      setTab("grow");
      setTaskId(taskParam);
      window.history.replaceState({}, "", "/brain");
    }
    // App already open — notification click sends postMessage
    if ("serviceWorker" in navigator) {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "open-review" && e.data?.captureId) {
          setTab("chat");
          setReviewId(e.data.captureId);
        } else if (e.data?.type === "open-task" && e.data?.captureId) {
          setTab("grow");
          setTaskId(e.data.captureId);
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, []);

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

  async function markReviewed(id: string) {
    const now = new Date().toISOString();
    setCaptures((prev) => prev.map((c) => c.id === id ? { ...c, last_reviewed_at: now } : c));
    const res = await fetch(`/api/capture/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_reviewed_at: now }),
    });
    const data = await res.json();
    if (data.capture) {
      setCaptures((prev) => prev.map((c) => c.id === data.capture.id ? data.capture : c));
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {searchOpen && <SearchOverlay captures={captures} projects={projects} setCaptures={setCaptures} onClose={() => setSearchOpen(false)} />}
      {/* Header */}
      <header className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Brain size={14} className="text-amber" strokeWidth={2.25} />
            <span className="text-amber font-bold text-sm tracking-tight">second_brain</span>
          </div>
          {/* Desktop tabs */}
          <nav className="hidden sm:flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-all duration-150 ${
                  tab === t.id
                    ? `${t.activeColor} bg-bg border border-border`
                    : "text-muted hover:text-text"
                }`}
              >
                <t.Icon size={12} strokeWidth={tab === t.id ? 2.25 : 1.75} />
                <span>[{t.label}]</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {notifStatus !== "subscribed" && notifStatus !== "denied" && (
            <button
              onClick={enableNotifications}
              className="hidden sm:flex items-center text-xs text-muted hover:text-amber border border-border rounded px-2 py-1 transition-colors"
              title="Enable review reminders"
            >
              <Bell size={13} strokeWidth={1.75} />
            </button>
          )}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
            title="Search (⌘K)"
          >
            <Search size={13} strokeWidth={1.75} />
            <kbd className="hidden sm:inline text-[10px] border border-border rounded px-1">⌘K</kbd>
          </button>
          {/* Sync indicator */}
          <button
            onClick={() => sync()}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors"
            title="sync now"
          >
            {syncing ? (
              <RefreshCw size={13} className="animate-spin text-amber" strokeWidth={2} />
            ) : (
              <Circle size={11} className="text-green fill-green" strokeWidth={0} />
            )}
            <span className="hidden sm:inline">{captures.length} captures</span>
            <span className="sm:hidden">{captures.length}</span>
          </button>
          <span className="text-xs text-muted hidden sm:block">{user.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-muted hover:text-amber transition-colors px-2 py-1 border border-border rounded hover:border-amber flex items-center gap-1.5"
          >
            <Power size={13} strokeWidth={1.75} />
            <span className="hidden sm:inline">exit()</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-5 pb-24 sm:pb-6">
        {tab === "capture" && <CaptureTab captures={captures} setCaptures={setCaptures} projects={projects} onProjectCreated={handleProjectCreated} onChatAbout={(id) => { setReviewId(id); setTab("chat"); }} />}
        {tab === "search"  && <SearchTab  captures={captures} setCaptures={setCaptures} projects={projects} />}
        {tab === "graph"   && <GraphTab   captures={captures} projects={projects} setCaptures={setCaptures} onRelatesUpdated={refreshCaptures} />}
        {tab === "grow"    && <GrowthTab  captures={captures} setCaptures={setCaptures} taskId={taskId} />}
        {tab === "chat"    && <ChatTab    captures={captures} pinnedCapture={reviewId ? captures.find((c) => c.id === reviewId) ?? null : null} onMarkReviewed={markReviewed} />}
        {tab === "arch"    && <ArchitectureTab />}
      </main>

      {/* Mobile bottom nav — desktop-only tabs excluded */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-surface border-t border-border flex">
        {TABS.filter((t) => !t.desktopOnly).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              tab === t.id ? t.activeColor : "text-muted"
            }`}
          >
            <t.Icon size={18} strokeWidth={tab === t.id ? 2.25 : 1.75} />
            <span className="text-[10px] tracking-wide">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
