"use client";

import { useEffect, useRef, useState } from "react";
import type { Capture } from "./BrainClient";

type Node = {
  id: string;
  title: string;
  type: string;
  project: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  connections: number;
};

type Edge = { source: string; target: string };

const TYPE_COLORS: Record<string, string> = {
  Idea: "#fbbf24",
  Link: "#38bdf8",
  Task: "#4ade80",
  Learning: "#c084fc",
  Note: "#94a3b8",
};

const PROJECT_COLORS: Record<string, string> = {
  "Village Booker": "#f59e0b",
  "Glumac Plus": "#a78bfa",
  FON: "#60a5fa",
  Personal: "#34d399",
  Other: "#6b7280",
};

// Soft anchor points for project clusters (normalized 0-1)
const PROJECT_ANCHORS: Record<string, [number, number]> = {
  "Village Booker": [0.25, 0.3],
  "Glumac Plus":    [0.75, 0.3],
  FON:              [0.5,  0.7],
  Personal:         [0.25, 0.72],
  Other:            [0.75, 0.72],
};

type ColorMode = "type" | "project";

export default function GraphTab({
  captures,
  onRelatesUpdated,
}: {
  captures: Capture[];
  onRelatesUpdated?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Capture | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("project");
  const [relating, setRelating] = useState(false);
  const [relateResult, setRelateResult] = useState<string>("");
  const draggingRef = useRef<string | null>(null);
  const colorModeRef = useRef<ColorMode>("project");

  colorModeRef.current = colorMode;

  async function runBatchRelate() {
    setRelating(true);
    setRelateResult("");
    try {
      const res = await fetch("/api/relate/batch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRelateResult(`✓ ${data.pairs} connections across ${data.nodes} captures`);
      onRelatesUpdated?.();
    } catch (e) {
      setRelateResult(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRelating(false);
    }
  }

  function nodeColor(node: Node): string {
    return colorModeRef.current === "project"
      ? (PROJECT_COLORS[node.project] ?? "#6b7280")
      : (TYPE_COLORS[node.type] ?? "#94a3b8");
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    // Count connections per capture
    const connMap: Record<string, number> = {};
    for (const c of captures) {
      connMap[c.id] = (c.related_ids?.length ?? 0);
    }

    nodesRef.current = captures.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      project: c.project,
      x: Math.random() * (W - 100) + 50,
      y: Math.random() * (H - 100) + 50,
      vx: 0,
      vy: 0,
      radius: 7 + Math.min(connMap[c.id] * 2.5, 14),
      connections: connMap[c.id],
    }));

    const edgeSet = new Set<string>();
    const edges: Edge[] = [];
    for (const c of captures) {
      for (const rid of c.related_ids ?? []) {
        const key = [c.id, rid].sort().join("--");
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: c.id, target: rid });
        }
      }
    }
    edgesRef.current = edges;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    function tick() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const hovered = hoveredIdRef.current;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];

        // Repulsion between all nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (1200 / (dist * dist)) * Math.min(dist / 80, 1);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }

        // Weak center gravity
        a.vx += (W / 2 - a.x) * 0.0008;
        a.vy += (H / 2 - a.y) * 0.0008;

        // Project cluster gravity — pulls same-project nodes toward anchor
        const anchor = PROJECT_ANCHORS[a.project];
        if (anchor) {
          const ax = anchor[0] * W;
          const ay = anchor[1] * H;
          a.vx += (ax - a.x) * 0.004;
          a.vy += (ay - a.y) * 0.004;
        }
      }

      // Edge attraction
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.025;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      for (const n of nodes) {
        if (draggingRef.current === n.id) continue;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(n.radius + 8, Math.min(W - n.radius - 8, n.x));
        n.y = Math.max(n.radius + 8, Math.min(H - n.radius - 8, n.y));
      }

      draw(ctx, W, H, nodes, edges, hovered);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [captures]);

  function draw(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    nodes: Node[],
    edges: Edge[],
    hovered: string | null
  ) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, W, H);

    // Draw project cluster zones (soft background halos)
    if (colorModeRef.current === "project") {
      for (const [project, anchor] of Object.entries(PROJECT_ANCHORS)) {
        const color = PROJECT_COLORS[project] ?? "#6b7280";
        const projectNodes = nodes.filter((n) => n.project === project);
        if (projectNodes.length === 0) continue;

        const ax = anchor[0] * W;
        const ay = anchor[1] * H;

        // Subtle radial gradient zone
        const grad = ctx.createRadialGradient(ax, ay, 10, ax, ay, 90);
        grad.addColorStop(0, color + "18");
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(ax, ay, 90, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Project label
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.fillStyle = color + "55";
        ctx.textAlign = "center";
        ctx.fillText(project.toUpperCase(), ax, ay + 82);
      }
      ctx.textAlign = "left";
    }

    // Edges
    for (const edge of edges) {
      const src = nodes.find((n) => n.id === edge.source);
      const tgt = nodes.find((n) => n.id === edge.target);
      if (!src || !tgt) continue;

      const isHighlighted = hovered === src.id || hovered === tgt.id;

      if (isHighlighted) {
        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0, nodeColor(src) + "99");
        grad.addColorStop(1, nodeColor(tgt) + "99");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = "rgba(30, 42, 58, 0.9)";
        ctx.lineWidth = 0.8;
      }

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
    }

    // Nodes
    for (const node of nodes) {
      const color = nodeColor(node);
      const isHovered = hovered === node.id;
      const isSelected = node.id === nodes.find(() => false)?.id; // placeholder
      const isConnectedToHovered = hovered
        ? edges.some(
            (e) =>
              (e.source === hovered && e.target === node.id) ||
              (e.target === hovered && e.source === node.id)
          )
        : false;

      // Outer glow
      if (isHovered || isConnectedToHovered) {
        const glowR = isHovered ? node.radius + 10 : node.radius + 5;
        const glow = ctx.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, glowR);
        glow.addColorStop(0, color + (isHovered ? "44" : "22"));
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      const alpha = isHovered ? "ff" : isConnectedToHovered ? "ee" : "bb";
      ctx.fillStyle = color + alpha;
      ctx.fill();

      // Ring for hub nodes (≥3 connections)
      if (node.connections >= 3) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = color + "66";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Inner highlight
      ctx.beginPath();
      ctx.arc(node.x, node.y - node.radius * 0.25, node.radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fill();

      // Always show label for hub nodes (≥4 connections) or hovered
      if (isHovered || node.connections >= 4) {
        const label = node.title.length > 24 ? node.title.slice(0, 22) + "…" : node.title;
        ctx.font = isHovered ? "bold 10px JetBrains Mono, monospace" : "9px JetBrains Mono, monospace";
        const tw = ctx.measureText(label).width;
        const lx = node.x - tw / 2;
        const ly = node.y - node.radius - 8;

        ctx.fillStyle = "rgba(8,8,8,0.85)";
        ctx.beginPath();
        ctx.roundRect?.(lx - 4, ly - 11, tw + 8, 14, 3);
        ctx.fill();

        ctx.fillStyle = isHovered ? "#e2e8f0" : color + "dd";
        ctx.fillText(label, lx, ly);
      }
    }
  }

  function getNodeAtPos(x: number, y: number): Node | null {
    for (const node of [...nodesRef.current].reverse()) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 5) return node;
    }
    return null;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggingRef.current) {
      const node = nodesRef.current.find((n) => n.id === draggingRef.current);
      if (node) { node.x = x; node.y = y; node.vx = 0; node.vy = 0; }
      return;
    }

    const hit = getNodeAtPos(x, y);
    const id = hit?.id ?? null;
    hoveredIdRef.current = id;
    setHoveredId(id);
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const hit = getNodeAtPos(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) draggingRef.current = hit.id;
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (draggingRef.current) {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const hit = getNodeAtPos(e.clientX - rect.left, e.clientY - rect.top);
      if (hit && hit.id === draggingRef.current) {
        const capture = captures.find((c) => c.id === hit.id) ?? null;
        setSelected((prev) => (prev?.id === capture?.id ? null : capture));
      }
    }
    draggingRef.current = null;
  }

  function handleMouseLeave() {
    hoveredIdRef.current = null;
    setHoveredId(null);
    draggingRef.current = null;
  }

  function getCanvasPos(e: React.TouchEvent<HTMLCanvasElement>, index = 0) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const touch = e.touches[index] ?? e.changedTouches[index];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const { x, y } = getCanvasPos(e);
    const hit = getNodeAtPos(x, y);
    if (hit) draggingRef.current = hit.id;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const { x, y } = getCanvasPos(e);
    if (draggingRef.current) {
      const node = nodesRef.current.find((n) => n.id === draggingRef.current);
      if (node) { node.x = x; node.y = y; node.vx = 0; node.vy = 0; }
      return;
    }
    const hit = getNodeAtPos(x, y);
    const id = hit?.id ?? null;
    hoveredIdRef.current = id;
    setHoveredId(id);
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (draggingRef.current) {
      const { x, y } = getCanvasPos(e, 0);
      const hit = getNodeAtPos(x, y);
      if (hit && hit.id === draggingRef.current) {
        const capture = captures.find((c) => c.id === hit.id) ?? null;
        setSelected((prev) => (prev?.id === capture?.id ? null : capture));
      }
    }
    draggingRef.current = null;
    hoveredIdRef.current = null;
    setHoveredId(null);
  }

  const connectedCaptures = selected
    ? captures.filter((c) => selected.related_ids?.includes(c.id))
    : [];

  const activeColors = colorMode === "project" ? PROJECT_COLORS : TYPE_COLORS;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {captures.length} nodes · {edgesRef.current.length} edges
          </span>
          {/* Color mode toggle */}
          <div className="flex text-xs border border-border rounded overflow-hidden">
            {(["project", "type"] as ColorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`px-3 py-1 transition-colors ${
                  colorMode === mode ? "bg-border text-text" : "text-muted hover:text-text"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend — hidden on mobile */}
          <div className="hidden sm:flex gap-3 flex-wrap">
            {Object.entries(activeColors).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-xs text-muted">
                <span style={{ color }}>●</span>
                <span>{label}</span>
              </span>
            ))}
          </div>
          <button
            onClick={runBatchRelate}
            disabled={relating || captures.length < 2}
            className="text-xs px-3 py-1 border border-purple text-purple rounded hover:bg-purple hover:text-bg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {relating ? "..." : "relate_all()"}
          </button>
        </div>
      </div>

      {/* Mobile legend */}
      <div className="sm:hidden flex gap-3 flex-wrap">
        {Object.entries(activeColors).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1 text-xs text-muted">
            <span style={{ color }}>●</span>
            <span>{label}</span>
          </span>
        ))}
      </div>

      {relateResult && (
        <p className={`text-xs ${relateResult.startsWith("✓") ? "text-green" : "text-red-400"}`}>
          {relateResult}
        </p>
      )}

      {/* Canvas */}
      <div className="relative bg-surface terminal-border rounded-lg overflow-hidden h-[340px] sm:h-[540px]">
        {captures.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted text-xs">
            no captures to graph yet
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: "block", cursor: hoveredId ? "pointer" : "crosshair" }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        )}
      </div>

      {/* Selected detail */}
      {selected && (
        <div className="bg-surface terminal-border rounded-lg p-4 animate-fade-in">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-bold"
                  style={{ color: PROJECT_COLORS[selected.project] ?? "#6b7280" }}
                >
                  {selected.project}
                </span>
                <span className="text-muted text-xs">·</span>
                <span
                  className="text-xs"
                  style={{ color: TYPE_COLORS[selected.type] ?? "#94a3b8" }}
                >
                  [{selected.type}]
                </span>
              </div>
              <p className="text-sm text-text font-bold">{selected.title}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-text text-xs">✕</button>
          </div>
          <p className="text-xs text-muted leading-relaxed mb-3 whitespace-pre-wrap">{selected.text}</p>
          {connectedCaptures.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-2">
                → <span className="text-purple">{connectedCaptures.length} connected</span>
              </p>
              <div className="grid grid-cols-2 gap-1">
                {connectedCaptures.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="text-left text-xs text-muted hover:text-text py-1 px-2 rounded hover:bg-border flex items-center gap-2 transition-colors"
                  >
                    <span style={{ color: PROJECT_COLORS[c.project] ?? "#6b7280" }}>●</span>
                    <span className="truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
