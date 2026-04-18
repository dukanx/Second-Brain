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

  const { text } = await request.json();
  if (!text?.trim()) return NextResponse.json({ error: "Empty text" }, { status: 400 });

  let type = "Note";
  let project = "Other";
  let title = text.slice(0, 60);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: `You are a knowledge categorization AI. Analyze the given text and return ONLY valid JSON with these fields:
- type: one of "Idea" | "Link" | "Task" | "Learning" | "Note"
- project: one of "Village Booker" | "Glumac Plus" | "FON" | "Personal" | "Other"
- title: a short, descriptive title (max 60 chars, no quotes)

Return ONLY the JSON object, nothing else.`,
      messages: [{ role: "user", content: text }],
    });

    const content = message.content[0];
    if (content.type === "text") {
      const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(raw);
      type = parsed.type ?? type;
      project = parsed.project ?? project;
      title = parsed.title ?? title;
    }
  } catch {
    // AI unavailable — save with defaults
  }

  const { data: capture, error } = await supabase
    .from("captures")
    .insert({ user_id: user.id, text, title, type, project, related_ids: [] })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget relationship detection
  const origin = new URL(request.url).origin;
  fetch(`${origin}/api/relate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ captureId: capture.id }),
  }).catch(() => {});

  return NextResponse.json({ capture });
}
