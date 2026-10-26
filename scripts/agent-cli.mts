// Talk to the Second Brain agent from the terminal (same code the app will use).
//
//   npx tsx --env-file=.env.local scripts/agent-cli.mts "your question" [--approve | --decline] [--thread NAME]
//
// --thread NAME keeps the conversation in Postgres (same checkpointer as the
// app), so a second run with the same NAME remembers the first one.
//
// Prints every step (tool calls and results), then the answer. If the agent
// wants to create a task, the run stops for approval: answer y/n, or pass
// --approve / --decline to decide up front.

import { createClient } from "@supabase/supabase-js";
import { HumanMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
import { createInterface } from "node:readline/promises";
import { buildAgent, AGENT_RECURSION_LIMIT } from "@/lib/agent/graph";
import { getCheckpointer } from "@/lib/agent/checkpointer";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: owner } = await supabase.from("captures").select("user_id").limit(1).single();

const threadArg = process.argv.indexOf("--thread");
const thread = threadArg > 0 ? process.argv[threadArg + 1] : undefined;
const checkpointer = thread ? getCheckpointer() : new MemorySaver();
const agent = buildAgent({ supabase, userId: owner!.user_id, checkpointer });
const config = { configurable: { thread_id: thread ? `cli:${thread}` : "cli" }, recursionLimit: AGENT_RECURSION_LIMIT };

const question = process.argv.find((a, i) => i >= 2 && !a.startsWith("--") && process.argv[i - 1] !== "--thread") ?? "šta sam poslednje učio?";
const preset = process.argv.includes("--approve") ? true : process.argv.includes("--decline") ? false : undefined;

function printSteps(messages: BaseMessage[]) {
  for (const m of messages) {
    if (m.getType() === "ai") {
      const calls = (m as AIMessage).tool_calls ?? [];
      for (const c of calls) console.log(`→ ${c.name}(${JSON.stringify(c.args)})`);
      if (!calls.length && m.content) console.log(`\nA: ${m.content}`);
    } else if (m.getType() === "tool") {
      const text = String(m.content);
      const n = (() => { try { const v = JSON.parse(text); return Array.isArray(v) ? `${v.length} results` : null; } catch { return null; } })();
      console.log(`← ${n ?? text.slice(0, 90).replace(/\s+/g, " ") + (text.length > 90 ? "…" : "")}`);
    }
  }
}

const t0 = Date.now();
console.log(`Q: ${question}\n`);
let seen = ((await agent.getState(config)).values?.messages as BaseMessage[] | undefined)?.length ?? 0;
if (seen) console.log(`(thread "${thread}" already has ${seen} messages — continuing that conversation)\n`);
const start = seen; // count only this turn's LLM calls
seen += 1; // skip the question itself when printing
let state = await agent.invoke(
  { messages: [new HumanMessage(question)] },
  config
);

// Interrupt loop: the graph pauses inside create_task until the user decides.
for (;;) {
  printSteps(state.messages.slice(seen));
  seen = state.messages.length;
  const pending = (await agent.getState(config)).tasks.flatMap((t) => t.interrupts);
  if (!pending.length) break;

  const ask = pending[0].value as { title: string; due_date?: string; priority?: string };
  console.log(`\n⏸ Agent wants to create a task: "${ask.title}"${ask.due_date ? `, due ${ask.due_date}` : ""}${ask.priority ? `, ${ask.priority}` : ""}`);
  let approved = preset;
  if (approved === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    approved = (await rl.question("Approve? [y/N] ")).trim().toLowerCase().startsWith("y");
    rl.close();
  } else {
    console.log(approved ? "(--approve)" : "(--decline)");
  }
  state = await agent.invoke(new Command({ resume: { approved } }), config);
}

const llmCalls = state.messages.slice(start).filter((m) => m.getType() === "ai").length;
console.log(`\n${llmCalls} LLM calls, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (thread) await (checkpointer as ReturnType<typeof getCheckpointer>).end();
