import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, text, type, project, related_ids, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(120);

  if (!captures || captures.length === 0) {
    return NextResponse.json({ error: "No captures yet" }, { status: 400 });
  }

  const catalogue = captures
    .map((c) => {
      const age = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
      return `[${c.id}] [${c.type}/${c.project}] (${age}d ago) ${c.title}: ${c.text.slice(0, 120)}`;
    })
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a personal knowledge analyst. Analyze the user's second brain captures and return ONLY valid JSON with:
- themes: string[] — 4-6 recurring topics or themes you see across captures
- pendingTasks: {id:string, title:string}[] — Task captures that likely need attention (max 5)
- forgottenIdeas: {id:string, title:string}[] — older Idea/Learning captures with few connections worth revisiting (max 4)
- patterns: string — 2-3 sentences on interesting patterns, contradictions or connections you noticed
- suggestion: string — one specific, actionable suggestion for what to explore or do next

Return ONLY the JSON object.`,
    messages: [{ role: "user", content: catalogue }],
  });

  try {
    const content = message.content[0];
    if (content.type !== "text") throw new Error("No text response");
    const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(raw);
    return NextResponse.json({ ...parsed, generatedAt: new Date().toISOString(), total: captures.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
