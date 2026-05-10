import { createClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowedTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/m4a", "audio/x-m4a", "video/mp4"];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav|mp4)$/i)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  try {
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: undefined, // auto-detect (handles Serbian + English)
      response_format: "text",
    });

    return NextResponse.json({ transcript: transcription });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
