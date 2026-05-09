"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { Capture, Project } from "./BrainClient";

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
type Viewport = { x: number; y: number; scale: number };

const TYPE_COLORS: Record<string, string> = {
  Idea: "#fbbf24",
  Link: "#38bdf8",
  Task: "#4ade80",
  Learning: "#c084fc",
  Note: "#94a3b8",
};

type ColorMode = "project" | "type";

function abbrev(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3);
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
}

function computeAnchors(names: string[]): Record<string, [number, number]> {
  const n = names.length;
  if (n === 0) return {};
  if (n === 1) return { [names[0]]: [0.5, 0.5] };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return Object.fromEntries(
    names.map((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = cols === 1 ? 0.5 : 0.15 + (col / (cols - 1)) * 0.7;
      const y = rows === 1 ? 0.5 : 0.15 + (row / (rows - 1)) * 0.7;
      return [name, [x, y] as [number, number]];
    })
  );
}

export default function GraphTab({
  captures,
  projects,
  onRelatesUpdated,
}: {
  captures: Capture[];
  projects: Project[];
  onRelatesUpdated?: () => void;
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const animRef     = useRef<number>(0);
  const nodesRef    = useRef<Node[]>([]);
  const edgesRef    = useRef<Edge[]>([]);
  const hoveredRef  = useRef<string | null>(null);

  // Viewport (pan + zoom)
  const vpRef       = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const isPanRef    = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, vx: 0, vy: 0 });
  const pinchRef    = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);

  const draggingRef = useRef<string | null>(null);

  const [hoveredId, setHoveredId]   = useState<string | null>(null);
  const [selected, setSelected]     = useState<Capture | null>(null);
  const [colorMode, setColorMode]   = useState<ColorMode>("project");
  const colorModeRef = useRef<ColorMode>("project");
  colorModeRef.current = colorMode;

  // Filters — empty set = show all (opt-in selection)
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes]       = useState<Set<string>>(new Set());
  const selectedProjectsRef = useRef(selectedProjects);
  const selectedTypesRef    = useRef(selectedTypes);
  selectedProjectsRef.current = selectedProjects;
  selectedTypesRef.current    = selectedTypes;

  const [relating, setRelating]         = useState(false);
  const [relateResult, setRelateResult] = useState("");
  const [showFilters, setShowFilters]   = useState(false);

  const ALL_PROJECTS = useMemo(() => projects.map((p) => p.name), [projects]);
  const projectColors = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.name, p.color])),
    [projects]
  );
  const projectAnchors = useMemo(() => computeAnchors(ALL_PROJECTS), [ALL_PROJECTS]);
  const effectiveAnchors = useMemo(() => {
    if (selectedProjects.size === 0) return projectAnchors;
    return computeAnchors([...selectedProjects]);
  }, [selectedProjects, projectAnchors]);
  const projectColorsRef  = useRef<Record<string, string>>({});
  const projectAnchorsRef = useRef<Record<string, [number, number]>>({});
  const effectiveAnchorsRef = useRef<Record<string, [number, number]>>({});
  projectColorsRef.current  = projectColors;
  projectAnchorsRef.current = projectAnchors;
  effectiveAnchorsRef.current = effectiveAnchors;

  const reheatRef = useRef(false);
  useEffect(() => { reheatRef.current = true; }, [selectedProjects, selectedTypes]);

  const ALL_TYPES    = ["Idea", "Link", "Task", "Learning", "Note"];

  function toggleProject(p: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }
  function toggleType(t: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  function isNodeVisible(n: Node) {
    const projOk = selectedProjectsRef.current.size === 0 || selectedProjectsRef.current.has(n.project);
    const typeOk = selectedTypesRef.current.size === 0 || selectedTypesRef.current.has(n.type);
    return projOk && typeOk;
  }

  // Coordinate helpers
  function toWorld(sx: number, sy: number) {
    const { x, y, scale } = vpRef.current;
    return { x: (sx - x) / scale, y: (sy - y) / scale };
  }

  function fitView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const nodes = nodesRef.current.filter(isNodeVisible);
    if (nodes.length === 0) return;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad  = 60;
    const s    = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1), 2.5);
    vpRef.current = {
      scale: s,
      x: W / 2 - ((minX + maxX) / 2) * s,
      y: H / 2 - ((minY + maxY) / 2) * s,
    };
  }

  function getNodeAtScreen(sx: number, sy: number): Node | null {
    const w = toWorld(sx, sy);
    for (const node of [...nodesRef.current].reverse()) {
      if (!isNodeVisible(node)) continue;
      const dx = w.x - node.x;
      const dy = w.y - node.y;
      const hitR = node.radius + 6 / vpRef.current.scale;
      if (Math.sqrt(dx * dx + dy * dy) <= hitR) return node;
    }
    return null;
  }

  // Build simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";

    const isMobile = W < 500;
    const connMap: Record<string, number> = {};
    captures.forEach((c) => { connMap[c.id] = c.related_ids?.length ?? 0; });

    nodesRef.current = captures.map((c) => ({
      id: c.id, title: c.title, type: c.type, project: c.project,
      x: Math.random() * (W - 80) + 40,
      y: Math.random() * (H - 80) + 40,
      vx: 0, vy: 0,
      radius: (isMobile ? 5 : 7) + Math.min(connMap[c.id] * 2.5, isMobile ? 8 : 14),
      connections: connMap[c.id],
    }));

    const edgeSet = new Set<string>();
    const edges: Edge[] = [];
    for (const c of captures) {
      for (const rid of c.related_ids ?? []) {
        const key = [c.id, rid].sort().join("--");
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: c.id, target: rid }); }
      }
    }
    edgesRef.current = edges;
    vpRef.current = { x: 0, y: 0, scale: 1 };

    const ctx = canvas.getContext("2d")!;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // After settling, fit view
    let ticks = 0;
    function tick() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const hovered = hoveredRef.current;

      if (reheatRef.current) {
        for (const n of nodes) {
          if (isNodeVisible(n)) { n.vx += (Math.random() - 0.5) * 18; n.vy += (Math.random() - 0.5) * 18; }
        }
        reheatRef.current = false;
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (!isNodeVisible(a)) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          if (!isNodeVisible(b)) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (1200 / (dist * dist)) * Math.min(dist / 80, 1);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
        a.vx += (W / 2 - a.x) * 0.0006;
        a.vy += (H / 2 - a.y) * 0.0006;
        const anchor = effectiveAnchorsRef.current[a.project];
        if (anchor) {
          a.vx += (anchor[0] * W - a.x) * 0.004;
          a.vy += (anchor[1] * H - a.y) * 0.004;
        }
      }
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt || !isNodeVisible(src) || !isNodeVisible(tgt)) continue;
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.025;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        src.vx += fx; src.vy += fy; tgt.vx -= fx; tgt.vy -= fy;
      }
      for (const n of nodes) {
        if (!isNodeVisible(n) || draggingRef.current === n.id) continue;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.radius + 8, Math.min(W - n.radius - 8, n.x));
        n.y = Math.max(n.radius + 8, Math.min(H - n.radius - 8, n.y));
      }

      ticks++;
      if (ticks === 120) fitView(); // auto-fit after settling

      draw(ctx, W, H, nodes, edges, hovered);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    // Touch handlers registered with { passive: false } so preventDefault works
    function getTouchPos(e: TouchEvent, idx = 0) {
      const r = canvas!.getBoundingClientRect();
      const t = e.touches[idx] ?? e.changedTouches[idx];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function touchDist(e: TouchEvent) {
      const a = getTouchPos(e, 0), b = getTouchPos(e, 1);
      return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    }
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = touchDist(e);
        const a = getTouchPos(e, 0), b = getTouchPos(e, 1);
        pinchRef.current = { dist, scale: vpRef.current.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        draggingRef.current = null; isPanRef.current = false;
        return;
      }
      if (e.touches.length === 1) {
        e.preventDefault();
        const { x, y } = getTouchPos(e);
        const hit = getNodeAtScreen(x, y);
        if (hit) { draggingRef.current = hit.id; }
        else { isPanRef.current = true; panStartRef.current = { mx: x, my: y, vx: vpRef.current.x, vy: vpRef.current.y }; }
      }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      if (e.touches.length === 2 && pinchRef.current) {
        const dist = touchDist(e);
        const { dist: d0, scale: s0, cx, cy } = pinchRef.current;
        const newS = Math.max(0.2, Math.min(5, s0 * (dist / d0)));
        const ratio = newS / vpRef.current.scale;
        vpRef.current = { scale: newS, x: cx - (cx - vpRef.current.x) * ratio, y: cy - (cy - vpRef.current.y) * ratio };
        return;
      }
      if (e.touches.length === 1) {
        const { x, y } = getTouchPos(e);
        if (draggingRef.current) {
          const w = toWorld(x, y);
          const node = nodesRef.current.find((n) => n.id === draggingRef.current);
          if (node) { node.x = w.x; node.y = w.y; node.vx = 0; node.vy = 0; }
          return;
        }
        if (isPanRef.current) {
          const { mx, my, vx, vy } = panStartRef.current;
          vpRef.current = { ...vpRef.current, x: vx + x - mx, y: vy + y - my };
        }
      }
    }
    function onTouchEnd(e: TouchEvent) {
      e.preventDefault();
      pinchRef.current = null;
      if (draggingRef.current && e.changedTouches.length > 0) {
        const r = canvas!.getBoundingClientRect();
        const t = e.changedTouches[0];
        const hit = getNodeAtScreen(t.clientX - r.left, t.clientY - r.top);
        if (hit && hit.id === draggingRef.current) {
          const cap = captures.find((c) => c.id === hit.id) ?? null;
          setSelected((prev) => (prev?.id === cap?.id ? null : cap));
        }
      }
      draggingRef.current = null; isPanRef.current = false;
    }
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd,   { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  }, [captures]);

  function nodeColor(node: Node): string {
    return colorModeRef.current === "project"
      ? (projectColorsRef.current[node.project] ?? "#6b7280")
      : (TYPE_COLORS[node.type] ?? "#94a3b8");
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    W: number, H: number,
    nodes: Node[], edges: Edge[],
    hovered: string | null
  ) {
    const vp = vpRef.current;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.scale, vp.scale);

    // Cluster zones
    if (colorModeRef.current === "project") {
      for (const [project, anchor] of Object.entries(projectAnchorsRef.current)) {
        const visible = nodes.filter((n) => n.project === project && isNodeVisible(n));
        if (visible.length === 0) continue;
        const ax = anchor[0] * W, ay = anchor[1] * H;
        const color = projectColorsRef.current[project] ?? "#6b7280";
        const grad = ctx.createRadialGradient(ax, ay, 10, ax, ay, 90);
        grad.addColorStop(0, color + "18");
        grad.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(ax, ay, 90, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.fillStyle = color + "44"; ctx.textAlign = "center";
        ctx.fillText(project.toUpperCase(), ax, ay + 82);
      }
      ctx.textAlign = "left";
    }

    // Edges
    for (const edge of edges) {
      const src = nodes.find((n) => n.id === edge.source);
      const tgt = nodes.find((n) => n.id === edge.target);
      if (!src || !tgt || !isNodeVisible(src) || !isNodeVisible(tgt)) continue;
      const isHl = hovered === src.id || hovered === tgt.id;
      if (isHl) {
        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0, nodeColor(src) + "99");
        grad.addColorStop(1, nodeColor(tgt) + "99");
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = "rgba(30,42,58,0.9)"; ctx.lineWidth = 0.8;
      }
      ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
    }

    // Nodes
    for (const node of nodes) {
      if (!isNodeVisible(node)) continue;
      const color  = nodeColor(node);
      const isHov  = hovered === node.id;
      const isConn = hovered
        ? edges.some((e) => (e.source === hovered && e.target === node.id) || (e.target === hovered && e.source === node.id))
        : false;

      if (isHov || isConn) {
        const glowR = isHov ? node.radius + 10 : node.radius + 5;
        const glow  = ctx.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, glowR);
        glow.addColorStop(0, color + (isHov ? "44" : "22")); glow.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();
      }

      ctx.beginPath(); ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color + (isHov ? "ff" : isConn ? "ee" : "bb"); ctx.fill();

      if (node.connections >= 3) {
        ctx.beginPath(); ctx.arc(node.x, node.y, node.radius + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = color + "66"; ctx.lineWidth = 1; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(node.x, node.y - node.radius * 0.25, node.radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fill();

      if (isHov || node.connections >= 4) {
        const label = node.title.length > 24 ? node.title.slice(0, 22) + "…" : node.title;
        ctx.font = isHov ? "bold 10px JetBrains Mono, monospace" : "9px JetBrains Mono, monospace";
        const tw = ctx.measureText(label).width;
        const lx = node.x - tw / 2, ly = node.y - node.radius - 8;
        ctx.fillStyle = "rgba(8,8,8,0.85)";
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D & { roundRect?: (x:number,y:number,w:number,h:number,r:number)=>void })
          .roundRect?.(lx - 4, ly - 11, tw + 8, 14, 3);
        ctx.fill();
        ctx.fillStyle = isHov ? "#e2e8f0" : color + "dd";
        ctx.fillText(label, lx, ly);
      }
    }

    ctx.restore();
  }

  // ── Mouse events ────────────���─────────────────────────────────
  function getClientPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getClientPos(e);
    const hit = getNodeAtScreen(x, y);
    if (hit) {
      draggingRef.current = hit.id;
    } else {
      isPanRef.current = true;
      panStartRef.current = { mx: x, my: y, vx: vpRef.current.x, vy: vpRef.current.y };
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getClientPos(e);
    if (draggingRef.current) {
      const w = toWorld(x, y);
      const node = nodesRef.current.find((n) => n.id === draggingRef.current);
      if (node) { node.x = w.x; node.y = w.y; node.vx = 0; node.vy = 0; }
      return;
    }
    if (isPanRef.current) {
      const { mx, my, vx, vy } = panStartRef.current;
      vpRef.current = { ...vpRef.current, x: vx + x - mx, y: vy + y - my };
      return;
    }
    const hit = getNodeAtScreen(x, y);
    hoveredRef.current = hit?.id ?? null;
    setHoveredId(hit?.id ?? null);
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getClientPos(e);
    if (draggingRef.current) {
      const hit = getNodeAtScreen(x, y);
      if (hit && hit.id === draggingRef.current) {
        const cap = captures.find((c) => c.id === hit.id) ?? null;
        setSelected((prev) => (prev?.id === cap?.id ? null : cap));
      }
    }
    draggingRef.current = null;
    isPanRef.current = false;
  }

  function handleMouseLeave() {
    hoveredRef.current = null; setHoveredId(null);
    draggingRef.current = null; isPanRef.current = false;
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const { x, y } = { x: e.clientX - (e.target as HTMLCanvasElement).getBoundingClientRect().left,
                        y: e.clientY - (e.target as HTMLCanvasElement).getBoundingClientRect().top };
    const delta  = e.deltaY > 0 ? 0.9 : 1.1;
    const newS   = Math.max(0.2, Math.min(5, vpRef.current.scale * delta));
    const ratio  = newS / vpRef.current.scale;
    vpRef.current = {
      scale: newS,
      x: x - (x - vpRef.current.x) * ratio,
      y: y - (y - vpRef.current.y) * ratio,
    };
  }

  function handleDblClick() { fitView(); }

  // ── Touch events ────────────────────���─────────────────────────

  // ── relate_all ───────────────��────────────────────────────────
  async function runBatchRelate() {
    setRelating(true); setRelateResult("");
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

  const activeColors = colorMode === "project" ? projectColorsRef.current : TYPE_COLORS;
  const visibleCount = nodesRef.current.filter(isNodeVisible).length;
  const connectedCaptures = selected ? captures.filter((c) => selected.related_ids?.includes(c.id)) : [];

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted">
          {visibleCount}/{captures.length} nodes · {edgesRef.current.length} edges
        </span>

        {/* Color toggle */}
        <div className="flex text-xs border border-border rounded overflow-hidden">
          {(["project", "type"] as ColorMode[]).map((m) => (
            <button key={m} onClick={() => setColorMode(m)}
              className={`px-3 py-1 transition-colors ${colorMode === m ? "bg-border text-text" : "text-muted hover:text-text"}`}>
              {m}
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button onClick={() => setShowFilters((v) => !v)}
          className={`text-xs px-3 py-1 border rounded transition-colors ${showFilters ? "border-blue text-blue bg-blue/10" : "border-border text-muted hover:text-text"}`}>
          filter{selectedProjects.size + selectedTypes.size > 0 ? ` (${selectedProjects.size + selectedTypes.size})` : ""}
        </button>
        {(selectedProjects.size > 0 || selectedTypes.size > 0) && (
          <button
            onClick={() => { setSelectedProjects(new Set()); setSelectedTypes(new Set()); }}
            className="text-xs px-3 py-1 border border-border text-muted hover:text-red-400 hover:border-red-400 rounded transition-colors"
          >
            reset
          </button>
        )}

        <div className="ml-auto flex gap-2">
          {/* Fit view */}
          <button onClick={fitView}
            className="text-xs px-3 py-1 border border-border text-muted rounded hover:text-text transition-colors">
            fit()
          </button>
          <button onClick={runBatchRelate} disabled={relating || captures.length < 2}
            className="text-xs px-3 py-1 border border-purple text-purple rounded hover:bg-purple hover:text-bg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {relating ? "..." : "relate_all()"}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-surface terminal-border rounded-lg p-3 space-y-2 animate-fade-in">
          <div className="flex gap-1.5 flex-wrap">
            <span className="text-xs text-muted self-center w-12">type</span>
            {ALL_TYPES.map((t) => {
              const active = selectedTypes.has(t);
              const anySelected = selectedTypes.size > 0;
              const lit = active || !anySelected;
              return (
                <button key={t} onClick={() => toggleType(t)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${lit ? "" : "opacity-30"}`}
                  style={{ borderColor: lit ? TYPE_COLORS[t] + "66" : undefined,
                           color: lit ? TYPE_COLORS[t] : undefined }}>
                  {active && <span className="mr-1 text-[9px]">✓</span>}{t}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <span className="text-xs text-muted self-center w-12">project</span>
            {ALL_PROJECTS.map((p) => {
              const active = selectedProjects.has(p);
              const anySelected = selectedProjects.size > 0;
              const lit = active || !anySelected;
              return (
                <button key={p} onClick={() => toggleProject(p)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${lit ? "" : "opacity-30"}`}
                  style={{ borderColor: lit ? projectColorsRef.current[p] + "66" : undefined,
                           color: lit ? projectColorsRef.current[p] : undefined }}>
                  {active && <span className="mr-1 text-[9px]">✓</span>}{abbrev(p)}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">klik = filtriraj · dbl-click na canvas = fit view</p>
            {(selectedProjects.size > 0 || selectedTypes.size > 0) && (
              <button
                onClick={() => { setSelectedProjects(new Set()); setSelectedTypes(new Set()); }}
                className="text-[10px] text-muted hover:text-red-400 border border-border hover:border-red-400 rounded px-2 py-0.5 transition-colors"
              >
                reset
              </button>
            )}
          </div>
        </div>
      )}

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
          <>
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ display: "block", cursor: hoveredId ? "pointer" : isPanRef.current ? "grabbing" : "grab" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              onDoubleClick={handleDblClick}
            />
            {/* Legend overlay */}
            <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none">
              {Object.entries(activeColors).map(([label, color]) => (
                <span key={label} className="flex items-center gap-1 text-xs" style={{ color }}>
                  <span>●</span>
                  <span className="opacity-70 text-[10px]">{abbrev(label)}</span>
                </span>
              ))}
            </div>
            {/* Hint */}
            <div className="absolute top-3 right-3 text-[10px] text-muted/50 pointer-events-none hidden sm:block">
              scroll = zoom · drag = pan · dbl-click = fit
            </div>
          </>
        )}
      </div>

      {/* Selected capture detail */}
      {selected && (
        <div className="bg-surface terminal-border rounded-lg p-4 animate-fade-in">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold" style={{ color: projectColorsRef.current[selected.project] ?? "#6b7280" }}>
                  {selected.project}
                </span>
                <span className="text-muted text-xs">·</span>
                <span className="text-xs" style={{ color: TYPE_COLORS[selected.type] ?? "#94a3b8" }}>
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
              <p className="text-xs text-muted mb-2">→ <span className="text-purple">{connectedCaptures.length} connected</span></p>
              <div className="grid grid-cols-2 gap-1">
                {connectedCaptures.map((c) => (
                  <button key={c.id} onClick={() => setSelected(c)}
                    className="text-left text-xs text-muted hover:text-text py-1 px-2 rounded hover:bg-border flex items-center gap-2 transition-colors">
                    <span style={{ color: projectColorsRef.current[c.project] ?? "#6b7280" }}>●</span>
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
