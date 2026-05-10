import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function isUrl(text: string) {
  try { new URL(text.trim()); return text.trim().startsWith("http"); }
  catch { return false; }
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      return u.searchParams.get("v");
    }
    return null;
  } catch { return null; }
}

async function fetchYouTubeTranscript(url: string): Promise<{ title: string; transcript: string } | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  try {
    const [transcriptItems, metaRes] = await Promise.allSettled([
      YoutubeTranscript.fetchTranscript(videoId),
      fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SecondBrain/1.0)" },
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    let title = "";
    if (metaRes.status === "fulfilled") {
      const html = await metaRes.value.text();
      const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1];
      const metaTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      title = (ogTitle || metaTitle || "").replace(/ - YouTube$/, "").slice(0, 120).trim();
    }

    if (transcriptItems.status === "rejected") return null;

    const fullTranscript = transcriptItems.value.map((item) => item.text).join(" ");
    return { title, transcript: fullTranscript };
  } catch { return null; }
}


async function enrichUrl(url: string): Promise<{ text: string; fullText?: string }> {
  const ytResult = await fetchYouTubeTranscript(url);
  if (ytResult) {
    const words = ytResult.transcript.split(/\s+/);
    const preview = words.slice(0, 500).join(" ");
    const aiText = `YouTube Video: ${ytResult.title}\nURL: ${url}\n\nTranscript excerpt:\n${preview}`;
    const fullText = `YouTube Video: ${ytResult.title}\nURL: ${url}\n\nFull Transcript:\n${ytResult.transcript}`;
    return { text: aiText, fullText };
  }

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
    return { text: `URL: ${url}\nTitle: ${title}\nDescription: ${desc}` };
  } catch {
    return { text: `URL: ${url}` };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, due_date, priority, source_url } = await request.json() as {
    text: string; due_date?: string; priority?: string; source_url?: string;
  };
  if (!text?.trim()) return NextResponse.json({ error: "Empty text" }, { status: 400 });

  // Enrich URLs with page metadata (or YouTube transcript) before AI processing
  let aiInput = text;
  let captureText = text;
  if (isUrl(text.trim())) {
    const enriched = await enrichUrl(text.trim());
    aiInput = enriched.text;
    captureText = enriched.fullText ?? enriched.text;
  } else if (source_url && isUrl(source_url)) {
    // Audio transcript with a linked source URL (e.g. Reel)
    const { text: urlMeta } = await enrichUrl(source_url);
    captureText = `${urlMeta}\n\n---\n\nTranscript:\n${text}`;
    aiInput = captureText.slice(0, 1200);
  }

  const { data: userProjects } = await supabase
    .from("projects")
    .select("name")
    .eq("user_id", user.id);
  const projectNames = userProjects?.map((p) => p.name) ?? [];
  const fallbackProject = projectNames[projectNames.length - 1] ?? "Other";
  const projectList = projectNames.length > 0
    ? projectNames.map((n) => `"${n}"`).join(" | ")
    : '"Other"';

  let type = "Note";
  let project = fallbackProject;
  let title = text.slice(0, 60);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: `You are a knowledge categorization AI. Analyze the given text and return ONLY valid JSON with these fields:
- type: one of "Idea" | "Link" | "Task" | "Learning" | "Note"
- project: one of ${projectList}
- title: a short, descriptive title (max 60 chars, no quotes)

Return ONLY the JSON object, nothing else.`,
      messages: [{ role: "user", content: aiInput }],
    });

    const content = message.content[0];
    if (content.type === "text") {
      const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(raw);
      type = parsed.type ?? type;
      const validProjects = new Set(projectNames);
      project = validProjects.has(parsed.project) ? parsed.project : fallbackProject;
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
    .insert({ user_id: user.id, text: captureText, title, type, project, related_ids: [], ...extra })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ capture });
}
