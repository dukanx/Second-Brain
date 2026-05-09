import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const COLOR_PALETTE = [
  "#f59e0b", "#60a5fa", "#34d399", "#a78bfa",
  "#f87171", "#fb923c", "#22d3ee", "#a3e635",
  "#e879f9", "#f472b6",
];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Auto-seed from existing captures on first load
  if (!data || data.length === 0) {
    const { data: caps } = await supabase
      .from("captures")
      .select("project")
      .eq("user_id", user.id);

    const distinct = [...new Set((caps ?? []).map((c) => c.project).filter(Boolean))];
    if (distinct.length > 0) {
      const toInsert = distinct.map((name, i) => ({
        user_id: user.id,
        name,
        color: COLOR_PALETTE[i % COLOR_PALETTE.length],
      }));
      const { data: seeded } = await supabase
        .from("projects")
        .insert(toInsert)
        .select()
        .order("created_at", { ascending: true });
      return NextResponse.json({ projects: seeded ?? [] });
    }
  }

  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("projects")
    .select("color")
    .eq("user_id", user.id);

  const usedColors = new Set((existing ?? []).map((p) => p.color));
  const color =
    COLOR_PALETTE.find((c) => !usedColors.has(c)) ??
    COLOR_PALETTE[(existing?.length ?? 0) % COLOR_PALETTE.length];

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: name.trim(), color })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
