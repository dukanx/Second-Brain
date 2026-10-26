import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { HumanMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import { Command, GraphRecursionError } from "@langchain/langgraph";
import { buildAgent, AGENT_RECURSION_LIMIT } from "@/lib/agent/graph";
import { getCheckpointer } from "@/lib/agent/checkpointer";
import { isRateLimited } from "@/lib/llm";

// An agent turn makes several model and tool calls (eval: ~2–5 s, up to ~10 s).
export const maxDuration = 60;

type Step = { tool: string; label: string };
type PendingTask = { title: string; due_date?: string; priority?: string };

// What the UI shows while/after the agent works, in the user's language.
function describe(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "semantic_search":
      return `pretraga: "${args.query}"`;
    case "list_captures":
      return `lista beleški${[args.type, args.project, args.since_days ? `poslednjih ${args.since_days} dana` : null].filter(Boolean).map((x) => ` · ${x}`).join("")}`;
    case "get_capture":
      return "čitam celu belešku";
    case "create_task":
      return `predlažem task: "${args.title}"`;
    default:
      return name;
  }
}

/**
 * POST { threadId, message }            → ask the agent
 * POST { threadId, resume: { approved }} → answer a pending create_task approval
 * Returns { answer, steps, pending }. `pending` is set when the agent paused to
 * ask for approval; the UI shows Approve / Decline and posts `resume`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    threadId?: string;
    message?: string;
    resume?: { approved?: boolean };
  };
  if (!body.threadId || !/^[A-Za-z0-9-]{8,64}$/.test(body.threadId)) {
    return NextResponse.json({ error: "Invalid threadId" }, { status: 400 });
  }
  if (!body.resume && !body.message?.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  // The checkpoint key includes the user id, so a guessed threadId can never
  // load someone else's conversation.
  const config = {
    configurable: { thread_id: `${user.id}:${body.threadId}` },
    recursionLimit: AGENT_RECURSION_LIMIT,
  };
  // User-scoped Supabase client: tools run under the user's own RLS policies.
  const agent = buildAgent({ supabase, userId: user.id, checkpointer: getCheckpointer() });

  try {
    const before = ((await agent.getState(config)).values?.messages as BaseMessage[] | undefined)?.length ?? 0;
    const state = body.resume
      ? await agent.invoke(new Command({ resume: { approved: body.resume.approved === true } }), config)
      : await agent.invoke({ messages: [new HumanMessage(body.message!.trim().slice(0, 2000))] }, config);
    const turn = (state.messages as BaseMessage[]).slice(before);

    const steps: Step[] = turn
      .filter((m) => m.getType() === "ai")
      .flatMap((m) => (m as AIMessage).tool_calls ?? [])
      .map((c) => ({ tool: c.name, label: describe(c.name, c.args) }));

    const pendingRaw = (await agent.getState(config)).tasks.flatMap((t) => t.interrupts)[0]?.value as
      | PendingTask
      | undefined;
    const last = turn.filter((m) => m.getType() === "ai").at(-1) as AIMessage | undefined;
    const answer = pendingRaw ? null : String(last?.content ?? "");

    return NextResponse.json({
      answer,
      steps,
      pending: pendingRaw ? { title: pendingRaw.title, due_date: pendingRaw.due_date, priority: pendingRaw.priority } : null,
    });
  } catch (e) {
    console.error("agent route failed:", e);
    if (isRateLimited(e)) {
      return NextResponse.json({ error: "AI is busy (free tier limit) — try again in a minute." }, { status: 429 });
    }
    if (e instanceof GraphRecursionError) {
      return NextResponse.json({ error: "The agent couldn't finish this question. Try asking more specifically." }, { status: 500 });
    }
    return NextResponse.json({ error: "Agent unavailable" }, { status: 500 });
  }
}
