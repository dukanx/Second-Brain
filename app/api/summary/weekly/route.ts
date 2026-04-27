import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("summaries")
    .select("content, created_at, week_start")
    .eq("user_id", user.id)
    .order("week_start", { ascending: false })
    .limit(8);

  if (!data || data.length === 0) return NextResponse.json({ summaries: [] });
  return NextResponse.json({ summaries: data });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const { data: captures } = await supabase
    .from("captures")
    .select("title, text, type, project, created_at")
    .eq("user_id", user.id)
    .gte("created_at", weekStart)
    .lt("created_at", weekEnd.toISOString().slice(0, 10))
    .order("created_at", { ascending: true });

  if (!captures || captures.length === 0) {
    return NextResponse.json({ error: "No captures this week" }, { status: 400 });
  }

  const catalogue = captures
    .map((c) => `[${c.type}][${c.project}] ${c.title}: ${c.text.slice(0, 80)}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a personal knowledge analyst. Analyze this week's captures and return ONLY valid JSON:
- highlights: string[] — 3-4 most notable things captured (max 10 words each)
- themes: string[] — 2-3 main themes (max 4 words each)
- insight: string — one key observation about this week (max 2 sentences)
- momentum: "high" | "medium" | "low" — based on quantity and variety of captures

Return ONLY the JSON object. Keep all strings short.`,
    messages: [{ role: "user", content: `${captures.length} captures this week:\n${catalogue}` }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("No text response");
  const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(raw);

  await supabase
    .from("summaries")
    .upsert({ user_id: user.id, week_start: weekStart, content: parsed }, { onConflict: "user_id,week_start" });

  return NextResponse.json({ summary: parsed, generatedAt: new Date().toISOString() });
}
