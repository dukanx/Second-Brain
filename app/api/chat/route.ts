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

  const { message, history, context } = await request.json() as {
    message: string;
    history: Message[];
    context: ContextCapture[];
  };

  const contextBlock = context.length > 0
    ? context.map((c) => `[${c.type}][${c.project}] ${c.title}: ${c.text.slice(0, 120)}`).join("\n")
    : "No relevant captures found.";

  const recentHistory = history.slice(-4);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: `You are a helpful assistant for a personal knowledge base. Answer concisely based on the user's captures below. If the answer isn't in the captures, say so briefly.

Relevant captures:
${contextBlock}`,
    messages: [
      ...recentHistory,
      { role: "user", content: message },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return NextResponse.json({ error: "No response" }, { status: 500 });
  return NextResponse.json({ reply: content.text });
}
