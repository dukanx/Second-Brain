"use client";

import { useEffect, useState } from "react";
import type { Capture, Project } from "./BrainClient";
import { Settings, Bell, Download, Trash2, Check, Loader2 } from "lucide-react";
import { exportJSON, exportMarkdown } from "@/lib/export";
import {
  CAPTURE_TYPES,
  DELETE_CONFIRMATION,
  DEFAULT_SETTINGS,
  REVIEW_SLOTS,
  type UserSettings,
} from "@/lib/settings";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The cron runs at 09:00 and 14:00 UTC; show those in the viewer's local time.
// Computed at render (in the browser), not at import, so the server's timezone never leaks in.
const localTime = (utcHour: number) =>
  new Date(Date.UTC(2000, 0, 1, utcHour)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const slotLabel = (slot: UserSettings["review_reminders"]) =>
  slot === "morning" ? `morning (${localTime(9)})` : slot === "afternoon" ? `afternoon (${localTime(14)})` : slot;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border text-xs text-muted">// {title}</div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div>
        <div className="text-sm text-text">{label}</div>
        {hint && <div className="text-[11px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`text-xs px-3 py-1 rounded border transition-colors ${
        on ? "text-green border-green" : "text-muted border-border hover:text-text"
      }`}
    >
      {on ? "[on]" : "[off]"}
    </button>
  );
}

const selectClass =
  "bg-bg border border-border rounded text-xs text-text px-2 py-1 focus:outline-none focus:border-amber";

export default function SettingsTab({
  captures,
  setCaptures,
  projects,
  notifStatus,
  onEnableNotifications,
}: {
  captures: Capture[];
  setCaptures: React.Dispatch<React.SetStateAction<Capture[]>>;
  projects: Project[];
  notifStatus: "unknown" | "granted" | "denied" | "subscribed";
  onEnableNotifications: () => void;
}) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d.settings) setSettings(d.settings); })
      .finally(() => setLoaded(true));
  }, []);

  // Save each change immediately; revert the field if the server rejects it.
  async function update(patch: Partial<UserSettings>) {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data.settings);
      setStatus("saved");
    } catch {
      setSettings(previous);
      setStatus("error");
    }
  }

  async function deleteAll() {
    setDeleting(true);
    setDeleteResult(null);
    try {
      const res = await fetch("/api/account/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCaptures([]);
      setConfirmText("");
      setDeleteResult(`deleted ${data.deleted.captures} captures`);
    } catch (e) {
      setDeleteResult(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  }

  if (!loaded) {
    return <div className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading settings...</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-2xl">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text flex items-center gap-1.5">
          <Settings size={12} strokeWidth={2} /> settings
        </span>
        <span className="text-[11px] text-muted flex items-center gap-1">
          {status === "saving" && <><Loader2 size={11} className="animate-spin" /> saving</>}
          {status === "saved" && <><Check size={11} className="text-green" /> saved</>}
          {status === "error" && <span className="text-red-400">save failed</span>}
        </span>
      </div>

      <Section title="notifications">
        {notifStatus !== "subscribed" && (
          <div className="text-[11px] text-muted flex items-center gap-2">
            <Bell size={11} />
            {notifStatus === "denied"
              ? "notifications are blocked in this browser, so these settings won't reach this device"
              : <>push is off on this device — <button onClick={onEnableNotifications} className="text-amber hover:underline">enable</button></>}
          </div>
        )}
        <Row label="Weekly digest" hint="AI summary of the week, skipped if nothing new was captured">
          <div className="flex items-center gap-2">
            <select
              value={settings.digest_day}
              onChange={(e) => update({ digest_day: Number(e.target.value) })}
              disabled={!settings.digest_enabled}
              className={`${selectClass} disabled:opacity-40`}
            >
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <Toggle on={settings.digest_enabled} onChange={(v) => update({ digest_enabled: v })} />
          </div>
        </Row>
        <Row label="Review reminders" hint="a capture you haven't revisited in 14+ days">
          <div className="flex gap-1">
            {REVIEW_SLOTS.map((slot) => (
              <button
                key={slot}
                onClick={() => update({ review_reminders: slot })}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  settings.review_reminders === slot ? "text-amber border-amber" : "text-muted border-border hover:text-text"
                }`}
              >
                {slotLabel(slot)}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Task reminders" hint="the day before a task's due date">
          <Toggle on={settings.task_reminders} onChange={(v) => update({ task_reminders: v })} />
        </Row>
      </Section>

      <Section title="new captures">
        <Row label="Default type" hint="used when AI categorization is unavailable">
          <select
            value={settings.default_type ?? ""}
            onChange={(e) => update({ default_type: (e.target.value || null) as UserSettings["default_type"] })}
            className={selectClass}
          >
            <option value="">Note (built-in)</option>
            {CAPTURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Default project" hint="used when AI is unavailable or picks an unknown project">
          <select
            value={settings.default_project ?? ""}
            onChange={(e) => update({ default_project: e.target.value || null })}
            className={selectClass}
          >
            <option value="">latest project (built-in)</option>
            {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </Row>
      </Section>

      <Section title="data">
        <Row label="Export" hint={`all ${captures.length} captures`}>
          <div className="flex gap-1.5">
            {([["md", exportMarkdown], ["json", exportJSON]] as const).map(([ext, fn]) => (
              <button
                key={ext}
                onClick={() => fn(captures)}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
              >
                <Download size={11} strokeWidth={1.75} /> .{ext}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="danger zone">
        <div className="space-y-2">
          <div className="text-sm text-text">Delete all captures</div>
          <div className="text-[11px] text-muted">
            Permanently deletes every capture, digest, weekly summary and query log. Projects and settings stay.
            Export first if you want a copy. Type <span className="text-red-400">{DELETE_CONFIRMATION}</span> to confirm.
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRMATION}
              className="flex-1 bg-bg border border-border rounded text-xs text-text px-2 py-1.5 focus:outline-none focus:border-red-400"
            />
            <button
              onClick={deleteAll}
              disabled={confirmText !== DELETE_CONFIRMATION || deleting}
              className="flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-400 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-400/10 transition-colors"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              delete
            </button>
          </div>
          {deleteResult && <div className="text-[11px] text-muted">{deleteResult}</div>}
        </div>
      </Section>
    </div>
  );
}
