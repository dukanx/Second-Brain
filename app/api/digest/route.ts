import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("digests")
    .select("id, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ digests: data ?? [] });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, text, type, project, created_at, last_reviewed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (!captures || captures.length === 0) {
    return NextResponse.json({ error: "No captures yet" }, { status: 400 });
  }

  const catalogue = captures
    .map((c) => {
      const age = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
      const reviewed = c.last_reviewed_at
        ? `reviewed:${Math.floor((Date.now() - new Date(c.last_reviewed_at).getTime()) / 86400000)}d ago`
        : "never reviewed";
      return `${c.id}|${c.type}|${c.project}|${age}d|${reviewed}| ${c.title}: ${c.text.slice(0, 70)}`;
    })
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are a personal knowledge analyst. Analyze the captures and return ONLY valid JSON with these exact fields (keep strings SHORT):
- themes: string[] — 3-4 short phrases (max 4 words each)
- momentum: "high" | "medium" | "low" — based on recency, quantity, and variety
- highlights: string[] — 3-4 most notable recent captures or patterns (max 10 words each)
- insight: string — one key observation about current focus (max 2 sentences)
- patterns: string — broader patterns across all captures (max 2 sentences)
- pendingTasks: {id:string,title:string}[] — up to 5 Task captures needing attention; use the full UUID from the original data
- forgottenIdeas: {id:string,title:string}[] — up to 4 older Idea/Learning captures worth revisiting; use the full UUID
- suggestion: string — max 1 sentence, actionable next step

Return ONLY the JSON object. Keep all strings concise.`,
    messages: [{ role: "user", content: catalogue }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("No text response");
  const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(raw);
  const now = new Date().toISOString();

  await supabase.from("digests").insert({ user_id: user.id, content: { ...parsed, total: captures.length } });

  return NextResponse.json({ ...parsed, generatedAt: now, total: captures.length });
}
