import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await request.json();
  if (!query?.trim()) return NextResponse.json({ error: "Empty query" }, { status: 400 });

  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, text, type, project, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!captures || captures.length === 0) {
    return NextResponse.json({
      synthesis: "No captures found. Start by adding some knowledge captures.",
      relevantCaptures: [],
      followUpQuestions: [],
    });
  }

  const catalogue = captures
    .map((c) => `[${c.id}] [${c.type}/${c.project}] ${c.title}: ${c.text}`)
    .join("\n\n");

  let synthesis = "";
  let relevantIds: string[] = [];
  let followUpQuestions: string[] = [];

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a personal knowledge assistant. Given the user's knowledge captures and a query, synthesize a thoughtful answer drawing from their captures. Return ONLY valid JSON with:
- synthesis: string (2-4 paragraphs synthesizing insights from the captures relevant to the query)
- relevantIds: string[] (IDs of the most relevant captures, max 8)
- followUpQuestions: string[] (3 follow-up questions to deepen understanding)`,
      messages: [
        {
          role: "user",
          content: `QUERY: ${query}\n\nKNOWLEDGE BASE:\n${catalogue}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === "text") {
      const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(raw);
      synthesis = parsed.synthesis ?? "";
      relevantIds = parsed.relevantIds ?? [];
      followUpQuestions = parsed.followUpQuestions ?? [];
    }
  } catch (e) {
    synthesis = e instanceof Error && e.message.includes("credit")
      ? "AI search unavailable — insufficient Anthropic credits."
      : `AI search error: ${e instanceof Error ? e.message : String(e)}`;
  }

  const relevantCaptures = captures.filter((c) => relevantIds.includes(c.id));

  return NextResponse.json({ synthesis, relevantCaptures, followUpQuestions });
}
