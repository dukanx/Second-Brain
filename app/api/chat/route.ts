import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Message = { role: "user" | "assistant"; content: string };
type ContextCapture = { title: string; text: string; type: string; project: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, history, context, pinnedCapture } = await request.json() as {
    message: string;
    history: Message[];
    context: ContextCapture[];
    pinnedCapture?: ContextCapture | null;
  };

  const pinnedText = pinnedCapture
    ? pinnedCapture.text.length > 2000
      ? pinnedCapture.text.slice(0, 2000) + "\n\n[... transcript truncated — ask about specific parts if needed]"
      : pinnedCapture.text
    : "";
  const pinnedBlock = pinnedCapture
    ? `The user is currently reviewing this specific capture. When they say "this", "it", or ask about the topic without specifying, they mean THIS capture:\n\n[${pinnedCapture.type}][${pinnedCapture.project}] ${pinnedCapture.title}\n${pinnedText}\n\n`
    : "";

  const contextBlock = context.length > 0
    ? `Additional captures from their knowledge base:\n${context.map((c) => `[${c.type}][${c.project}] ${c.title}: ${c.text.slice(0, 150)}`).join("\n")}`
    : "";

  const recentHistory = history.slice(-6);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: `You are a helpful assistant for a personal knowledge base. Answer concisely based on the user's captures. If the answer isn't in the captures, say so briefly.

${pinnedBlock}${contextBlock}`.trim(),
    messages: [
      ...recentHistory,
      { role: "user", content: message },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return NextResponse.json({ error: "No response" }, { status: 500 });
  return NextResponse.json({ reply: content.text });
}
