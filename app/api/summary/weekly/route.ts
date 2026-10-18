import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateObject, isRateLimited } from "@/lib/llm";

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

  type Summary = { highlights: string[]; themes: string[]; insight: string; momentum: "high" | "medium" | "low" };
  let parsed: Summary;
  try {
    parsed = await generateObject<Summary>({
      maxTokens: 1500,
      schemaName: "weekly_summary",
      system: `You are a personal knowledge analyst. Analyze this week's captures. Keep all strings short, in the language most captures are written in.
- highlights: 3-4 most notable things captured (max 10 words each)
- themes: 2-3 main themes (max 4 words each)
- insight: one key observation about this week (max 2 sentences)
- momentum: based on quantity and variety of captures`,
      messages: [{ role: "user", content: `${captures.length} captures this week:\n${catalogue}` }],
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["highlights", "themes", "insight", "momentum"],
        properties: {
          highlights: { type: "array", items: { type: "string" } },
          themes: { type: "array", items: { type: "string" } },
          insight: { type: "string" },
          momentum: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    });
  } catch (e) {
    console.error("weekly summary: generation failed:", e);
    return isRateLimited(e)
      ? NextResponse.json({ error: "AI is busy (free tier limit) — try again in a minute." }, { status: 429 })
      : NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
  }

  await supabase
    .from("summaries")
    .upsert({ user_id: user.id, week_start: weekStart, content: parsed }, { onConflict: "user_id,week_start" });

  return NextResponse.json({ summary: parsed, generatedAt: new Date().toISOString() });
}
