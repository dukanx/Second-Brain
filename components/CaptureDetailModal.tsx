"use client";

import { useState } from "react";
import type { Capture, Project } from "./BrainClient";
import { TYPE_COLORS } from "./BrainClient";

export default function CaptureDetailModal({
  capture,
  projects,
  onUpdate,
  onDelete,
  onClose,
}: {
  capture: Capture;
  projects: Project[];
  onUpdate: (c: Capture) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [editText, setEditText] = useState(capture.text);
  const [editTitle, setEditTitle] = useState(capture.title);
  const [editType, setEditType] = useState(capture.type);
  const [editProject, setEditProject] = useState(capture.project);
  const [saving, setSaving] = useState(false);

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/capture/${capture.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText, title: editTitle, type: editType, project: editProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate(data.capture);
      onClose();
    } catch { /* keep edit mode open */ } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/capture/${capture.id}`, { method: "DELETE" });
      if (res.ok) { onDelete(capture.id); onClose(); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={mode === "view" ? onClose : undefined}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-border rounded-xl overflow-hidden shadow-2xl animate-fade-in flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${TYPE_COLORS[capture.type] ?? "text-muted"}`}>[{capture.type}]</span>
            <span className="text-xs text-muted">{capture.project}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-sm transition-colors">✕</button>
        </div>

        {/* View mode */}
        {mode === "view" && (
          <div className="px-5 py-5 overflow-y-auto flex-1">
            <p className="text-sm text-text font-semibold mb-3">{capture.title}</p>
            {capture.type === "Link" && (() => {
              const url = capture.text.match(/https?:\/\/[^\s]+/)?.[0];
              return url ? (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue hover:underline break-all block mb-3">
                  {url}
                </a>
              ) : null;
            })()}
            <p className="text-sm text-text leading-7 whitespace-pre-wrap">{capture.text}</p>
          </div>
        )}

        {/* Edit mode */}
        {mode === "edit" && (
          <div className="px-5 py-5 overflow-y-auto flex-1 space-y-3">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-amber font-mono"
              placeholder="title"
            />
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-amber font-mono resize-none min-h-[200px] leading-relaxed"
            />
            <div className="flex gap-2">
              <select value={editType} onChange={(e) => setEditType(e.target.value)}
                className="text-xs bg-bg border border-border text-muted rounded px-2 py-1.5 focus:outline-none flex-1">
                {["Idea", "Link", "Task", "Learning", "Note"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select value={editProject} onChange={(e) => setEditProject(e.target.value)}
                className="text-xs bg-bg border border-border text-muted rounded px-2 py-1.5 focus:outline-none flex-1">
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {mode === "confirmDelete" && (
          <div className="px-5 py-10 flex-1 flex items-center justify-center">
            <p className="text-sm text-red-400">delete this capture permanently?</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
          {mode === "view" && (
            <>
              <button onClick={onClose} className="text-xs text-muted hover:text-text transition-colors">← zatvori</button>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("confirmDelete")}
                  className="text-xs px-3 py-1 border border-border text-muted rounded hover:text-red-400 hover:border-red-400 transition-colors"
                >
                  delete
                </button>
                <button
                  onClick={() => setMode("edit")}
                  className="text-xs px-3 py-1 border border-blue text-blue rounded hover:bg-blue/10 transition-colors"
                >
                  edit
                </button>
              </div>
            </>
          )}
          {mode === "edit" && (
            <>
              <button onClick={() => setMode("view")} className="text-xs text-muted hover:text-text transition-colors">cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="text-xs px-4 py-1.5 bg-amber text-bg rounded font-bold hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                {saving ? "saving..." : "save()"}
              </button>
            </>
          )}
          {mode === "confirmDelete" && (
            <>
              <button onClick={() => setMode("view")} className="text-xs text-muted hover:text-text transition-colors">cancel</button>
              <button onClick={confirmDelete} disabled={saving}
                className="text-xs px-4 py-1.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50 transition-colors">
                {saving ? "..." : "delete"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
