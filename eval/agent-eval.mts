// Agent eval: run every question in agent-golden.json through the real agent
// (lib/agent/graph.ts) and check three things:
//   1. tools   — did it call the right tools (and not the wrong ones)?
//   2. data    — did the expected captures show up in what the tools returned?
//   3. answer  — is the final answer correct and grounded? (LLM judge with a
//                per-question rule; deterministic checks wherever possible)
// Plus cost: LLM calls, tokens and seconds per question.
//
//   npx tsx --env-file=.env.local eval/agent-eval.mts [--effort low|medium] [--only 3,7] [--repeat N]
//
// --repeat runs each question N times: the model is not deterministic, so one
// run per question can pass or fail by luck.
//
// create_task is always declined, so the eval never writes to the database.
// Only pass/fail and metrics are saved (results go to a public repo); answers
// and judge reasons are printed to the terminal only.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { HumanMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
import { buildAgent, AGENT_EFFORT, AGENT_RECURSION_LIMIT } from "@/lib/agent/graph";
import { generateObject } from "@/lib/llm";

type Golden = {
  id: number;
  kind: string;
  q: string;
  tools_include?: string[];
  tools_exclude?: string[];
  expect_ids_all?: string[];
  expect_ids_any?: string[];
  create_task_due?: "next_friday";
  judge?: string;
};

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const effort = (arg("--effort") ?? AGENT_EFFORT) as "low" | "medium" | "high";
const only = arg("--only")?.split(",").map(Number);
// Pause between questions: agent + judge calls must stay under Groq 8K tokens/min,
// and Voyage without a card allows only 3 requests/min (EVAL_PACE_MS to override).
const PACE_MS = Number(process.env.EVAL_PACE_MS ?? 25_000);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: owner } = await supabase.from("captures").select("user_id").limit(1).single();
const userId = owner!.user_id as string;
const { data: allCaptures } = await supabase.from("captures").select("id").eq("user_id", userId);
const fullId = (prefix: string) => {
  const hits = allCaptures!.filter((c) => c.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`id prefix ${prefix} matched ${hits.length}`);
  return hits[0].id as string;
};

let golden: Golden[] = JSON.parse(readFileSync(new URL("./agent-golden.json", import.meta.url), "utf8"));
if (only) golden = golden.filter((g) => only.includes(g.id));
const repeat = Number(arg("--repeat") ?? 1);
golden = golden.flatMap((g) => Array.from({ length: repeat }, () => g));

// Next Friday in Belgrade time, for "do petka"
function nextFriday(now = new Date()): string {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86400_000);
    if (d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/Belgrade" }) === "Friday") {
      return d.toLocaleDateString("en-CA", { timeZone: "Europe/Belgrade" });
    }
  }
  throw new Error("no Friday in the next 7 days");
}

async function runAgent(question: string, thread: string) {
  const agent = buildAgent({ supabase, userId, checkpointer: new MemorySaver(), effort });
  const config = { configurable: { thread_id: thread }, recursionLimit: AGENT_RECURSION_LIMIT };
  let state = await agent.invoke({ messages: [new HumanMessage(question)] }, config);
  // Always decline task creation: the eval must not write to the database.
  for (let guard = 0; guard < 3; guard++) {
    const pending = (await agent.getState(config)).tasks.flatMap((t) => t.interrupts);
    if (!pending.length) break;
    state = await agent.invoke(new Command({ resume: { approved: false } }), config);
  }
  return state.messages as BaseMessage[];
}

async function judge(question: string, rule: string, answer: string): Promise<{ pass: boolean; reason: string }> {
  return generateObject<{ pass: boolean; reason: string }>({
    maxTokens: 800,
    schemaName: "judgement",
    system:
      "You grade an assistant's answer about the user's personal notes. Apply the grading rule strictly. " +
      "Judge only what the answer says; do not reward style.",
    messages: [{ role: "user", content: `QUESTION: ${question}\n\nGRADING RULE: ${rule}\n\nANSWER:\n${answer}` }],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["pass", "reason"],
      properties: { pass: { type: "boolean" }, reason: { type: "string" } },
    },
  });
}

type Result = {
  id: number;
  kind: string;
  checks: Record<string, boolean>;
  pass: boolean;
  llmCalls: number;
  tokens: number;
  seconds: number;
  error?: string;
};
const results: Result[] = [];

console.log(`Agent eval: ${golden.length} questions, effort=${effort}, ~${Math.ceil((golden.length * (PACE_MS + 8000)) / 60000)} min\n`);

for (const [i, g] of golden.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, PACE_MS));
  const t0 = Date.now();
  const checks: Record<string, boolean> = {};
  let llmCalls = 0, tokens = 0, error: string | undefined;
  try {
    const messages = (await runAgent(g.q, `eval-${g.id}-${Date.now()}`)).slice(1);
    const ai = messages.filter((m) => m.getType() === "ai") as AIMessage[];
    const calls = ai.flatMap((m) => m.tool_calls ?? []);
    const called = new Set(calls.map((c) => c.name));
    const toolText = messages.filter((m) => m.getType() === "tool").map((m) => String(m.content)).join("\n");
    const answer = String(ai.at(-1)?.content ?? "");
    llmCalls = ai.length;
    tokens = ai.reduce((s, m) => s + (m.usage_metadata?.total_tokens ?? 0), 0);

    if (g.tools_include) checks.tools = g.tools_include.every((t) => called.has(t));
    if (g.tools_exclude) checks.no_forbidden_tool = g.tools_exclude.every((t) => !called.has(t));
    if (g.expect_ids_all) checks.data = g.expect_ids_all.map(fullId).every((id) => toolText.includes(id));
    if (g.expect_ids_any) checks.data = g.expect_ids_any.map(fullId).some((id) => toolText.includes(id));
    if (g.create_task_due) {
      const due = calls.find((c) => c.name === "create_task")?.args?.due_date;
      checks.due_date = due === nextFriday();
    }

    console.log(`#${g.id} [${g.kind}] ${g.q}`);
    console.log(`   tools: ${calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(" → ") || "none"}`);
    if (g.judge) {
      const j = await judge(g.q, g.judge, answer);
      checks.answer = j.pass;
      console.log(`   judge: ${j.pass ? "PASS" : "FAIL"} — ${j.reason}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : String(e);
    checks.ran = false;
    console.log(`#${g.id} ERROR: ${error}`);
  }
  const seconds = (Date.now() - t0) / 1000;
  const pass = Object.values(checks).every(Boolean);
  results.push({ id: g.id, kind: g.kind, checks, pass, llmCalls, tokens, seconds, error });
  console.log(`   ${pass ? "✓ PASS" : "✗ FAIL"}  ${Object.entries(checks).map(([k, v]) => `${k}:${v ? "ok" : "X"}`).join(" ")}  · ${llmCalls} LLM calls, ${tokens} tokens, ${seconds.toFixed(1)} s\n`);
}

// Summary
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
const avg = (k: "llmCalls" | "tokens" | "seconds") => results.reduce((s, r) => s + r[k], 0) / results.length;
console.log(`effort=${effort}: ${results.filter((r) => r.pass).length}/${results.length} questions pass (${pct(results.filter((r) => r.pass).length, results.length)})`);
for (const kind of [...new Set(results.map((r) => r.kind))]) {
  const rs = results.filter((r) => r.kind === kind);
  console.log(`  ${kind.padEnd(12)} ${rs.filter((r) => r.pass).length}/${rs.length}`);
}
const checkNames = [...new Set(results.flatMap((r) => Object.keys(r.checks)))];
console.log("by check: " + checkNames.map((c) => {
  const rs = results.filter((r) => c in r.checks);
  return `${c} ${rs.filter((r) => r.checks[c]).length}/${rs.length}`;
}).join(" · "));
console.log(`avg per question: ${avg("llmCalls").toFixed(1)} LLM calls, ${Math.round(avg("tokens"))} tokens, ${avg("seconds").toFixed(1)} s`);

if (!only && repeat === 1) {
  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const file = new URL(`./results/agent-${new Date().toISOString().slice(0, 10)}-${effort}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ effort, results }, null, 2));
  console.log(`\nsaved ${file.pathname}`);
}
