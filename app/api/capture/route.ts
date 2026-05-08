import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function isUrl(text: string) {
  try { new URL(text.trim()); return text.trim().startsWith("http"); }
  catch { return false; }
}

async function enrichUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SecondBrain/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1];
    const metaTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1];
    const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1];
    const title = (ogTitle || metaTitle || "").slice(0, 120).trim();
    const desc = (ogDesc || metaDesc || "").slice(0, 300).trim();
    return `URL: ${url}\nTitle: ${title}\nDescription: ${desc}`;
  } catch {
    return `URL: ${url}`;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, due_date, priority } = await request.json();
  if (!text?.trim()) return NextResponse.json({ error: "Empty text" }, { status: 400 });

  // Enrich URLs with page metadata before AI processing
  const aiInput = isUrl(text.trim()) ? await enrichUrl(text.trim()) : text;

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
      messages: [{ role: "user", content: aiInput }],
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

  const extra: Record<string, string> = {};
  if (due_date) extra.due_date = due_date;
  if (priority && ["high", "medium", "low"].includes(priority)) extra.priority = priority;

  const { data: capture, error } = await supabase
    .from("captures")
    .insert({ user_id: user.id, text, title, type, project, related_ids: [], ...extra })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ capture });
}
