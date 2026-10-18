import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { embedOne, captureEmbedInput } from "@/lib/embeddings";
import { CAPTURE_COLUMNS } from "@/lib/captures";
import { getSettings } from "@/lib/settings";
import { categorizeCapture, projectFromNeighbors } from "@/lib/categorize";

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

  // select("*") so this keeps working before the `description` column exists
  // (supabase/project-descriptions.sql); descriptions are then just absent.
  const { data: userProjects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id);
  const projectNames = userProjects?.map((p) => p.name) ?? [];
  // Used when AI is unavailable or returns an unknown project: the user's
  // default from settings if it still exists, else the last project.
  const settings = await getSettings(supabase, user.id);
  const fallbackProject =
    settings.default_project && projectNames.includes(settings.default_project)
      ? settings.default_project
      : projectNames[projectNames.length - 1] ?? "Other";

  let type: string = settings.default_type ?? "Note";
  let project = fallbackProject;
  let title = text.slice(0, 60);

  try {
    const parsed = await categorizeCapture(aiInput, userProjects ?? []);
    type = parsed.type;
    project = parsed.project;
    title = parsed.title || title;
  } catch (e) {
    // AI unavailable (rate limit, outage) — save with defaults from settings
    console.error("capture: categorization failed, using defaults:", e);
  }

  const extra: Record<string, unknown> = {};
  if (due_date) extra.due_date = due_date;
  if (priority && ["high", "medium", "low"].includes(priority)) extra.priority = priority;

  // Embedding for semantic search / relation (RAG). Best-effort: if Voyage is
  // down we still save the capture; the backfill script can fill it in later.
  try {
    const embedding = await embedOne(captureEmbedInput(title, captureText), "document");
    extra.embedding = embedding;

    // If the most similar existing captures mostly sit in one project, follow
    // the user's own filing habit instead of the LLM's guess.
    const neighborProject = await projectFromNeighbors(supabase, user.id, embedding, projectNames);
    if (neighborProject) project = neighborProject;
  } catch (e) {
    console.error("embedding failed on capture create:", e);
  }

  const { data: capture, error } = await supabase
    .from("captures")
    .insert({ user_id: user.id, text: captureText, title, type, project, related_ids: [], ...extra })
    .select(CAPTURE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ capture });
}
