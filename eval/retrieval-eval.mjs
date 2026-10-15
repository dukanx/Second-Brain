// Retrieval eval: run every golden question through each retrieval method and
// measure how often the expected captures come back.
//
//   node --env-file=.env.local eval/retrieval-eval.mjs
//
// Metrics (per question, then averaged):
//   hit@1     — is the first result one of the expected captures?
//   hit@3     — is at least one expected capture in the top 3?
//   recall@5  — what fraction of all expected captures is in the top 5?
//   MRR       — 1 / rank of the first expected capture (0 if not in top K)
//
// "aggregate" questions (e.g. "what's my current focus") need recency or
// summarisation, not similarity, so they are reported separately and kept
// out of the headline score.
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildBm25, rrf } from "./ranking.mjs";

const K = 8; // how many results each method returns (same as chat context)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

// ── Retrieval methods ────────────────────────────────────────────────────────

// Exact copy of the keyword retrieval ChatTab used before RAG (findContext):
// count how many query words appear as substrings in the capture, keep the
// ones with score > 0, sort by score (ties keep newest-first order).
function keywordSearch(query, captures) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return captures
    .map((c) => {
      const hay = `${c.title} ${c.text} ${c.type} ${c.project}`.toLowerCase();
      return { id: c.id, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, K)
    .map((r) => r.id);
}

async function embedQueries(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ model: "voyage-3.5-lite", input: texts, input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function vectorSearch(embedding, userId, limit = K) {
  const { data, error } = await supabase.rpc("match_captures", {
    query_embedding: embedding,
    match_count: limit,
    p_user_id: userId,
  });
  if (error) throw error;
  return data.map((m) => m.id);
}

// Reranker: a cross-encoder reads the question together with each candidate
// (embeddings encode them separately) and re-orders the vector shortlist.
// Opt-in with --rerank. Voyage's free tier allows 3 requests and 10K tokens
// per minute, so calls are spaced out and a full run takes ~9 minutes.
const RERANK_DEPTH = 15; // vector candidates the reranker re-orders
const RERANK_CHARS = 700; // title + start of text sent per candidate
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRerankAt = 0;
let lastRerankTokens = 0;

async function rerank(query, ids, captureById) {
  const wait = Math.max(21_000, lastRerankTokens * 6.5) - (Date.now() - lastRerankAt);
  if (lastRerankAt && wait > 0) await sleep(wait);

  const documents = ids.map((id) => {
    const c = captureById.get(id);
    return `${c.title}\n${c.text}`.slice(0, RERANK_CHARS);
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ model: "rerank-2.5", query, documents }),
    });
    lastRerankAt = Date.now();
    if (res.status === 429 && attempt === 0) {
      console.log("  rate limited, waiting 60s...");
      await sleep(60_000);
      continue;
    }
    if (!res.ok) throw new Error(`Voyage rerank failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    lastRerankTokens = data.usage.total_tokens;
    return data.data
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, K)
      .map((d) => ids[d.index]);
  }
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function score(results, expected) {
  const firstRank = results.findIndex((id) => expected.includes(id)) + 1; // 0 = miss
  return {
    hit1: firstRank === 1 ? 1 : 0,
    hit3: firstRank >= 1 && firstRank <= 3 ? 1 : 0,
    recall5: results.slice(0, 5).filter((id) => expected.includes(id)).length / expected.length,
    mrr: firstRank ? 1 / firstRank : 0,
    firstRank,
  };
}

const avg = (rows, key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);

// ── Main ─────────────────────────────────────────────────────────────────────

const { data: captures, error } = await supabase
  .from("captures")
  .select("id, user_id, title, text, type, project")
  .order("created_at", { ascending: false });
if (error) throw error;

const userIds = new Set(captures.map((c) => c.user_id));
if (userIds.size !== 1) throw new Error(`expected one user, found ${userIds.size}`);
const userId = [...userIds][0];

// Golden file uses 8-char id prefixes for readability; resolve to full ids.
const resolve = (prefix) => {
  const hits = captures.filter((c) => c.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`id prefix ${prefix} matched ${hits.length} captures`);
  return hits[0].id;
};
for (const g of golden) g.expected = g.expected.map(resolve);

const embeddings = await embedQueries(golden.map((g) => g.q)); // one request for all questions

const bm25 = buildBm25(captures);
const DEPTH = 20; // how deep each list goes before fusion

const methods = {
  keyword: async (g) => keywordSearch(g.q, captures),
  bm25: async (g) => bm25(g.q),
  vector: async (g, i) => vectorSearch(embeddings[i], userId),
  hybrid: async (g, i) => rrf([bm25(g.q, DEPTH), await vectorSearch(embeddings[i], userId, DEPTH)]),
};

if (process.argv.includes("--rerank")) {
  const captureById = new Map(captures.map((c) => [c.id, c]));
  methods.rerank = async (g, i) => {
    console.log(`  rerank ${g.id}/${golden.length}`);
    return rerank(g.q, await vectorSearch(embeddings[i], userId, RERANK_DEPTH), captureById);
  };
}

const results = {};
for (const [name, run] of Object.entries(methods)) {
  results[name] = [];
  for (const [i, g] of golden.entries()) {
    const ids = await run(g, i);
    results[name].push({ id: g.id, kind: g.kind, ...score(ids, g.expected) });
  }
}

// Per-question table: rank of the first expected capture (– = not in top K)
const rank = (r) => (r.firstRank ? String(r.firstRank) : "–").padStart(3);
console.log(`\n  #  kind            ${Object.keys(methods).map((m) => m.padStart(8)).join("")}   question`);
for (const [i, g] of golden.entries()) {
  const cols = Object.keys(methods).map((m) => rank(results[m][i]).padStart(8)).join("");
  console.log(`${String(g.id).padStart(3)}  ${g.kind.padEnd(15)} ${cols}   ${g.q}`);
}

// Summary per method, overall and per kind (aggregate questions excluded)
const kinds = [...new Set(golden.map((g) => g.kind))].filter((k) => k !== "aggregate");
console.log("\n            hit@1  hit@3  recall@5   MRR");
for (const [name, rows] of Object.entries(results)) {
  const main = rows.filter((r) => r.kind !== "aggregate");
  console.log(`${name.padEnd(10)}  ${pct(avg(main, "hit1"))}   ${pct(avg(main, "hit3"))}    ${pct(avg(main, "recall5"))}    ${avg(main, "mrr").toFixed(2)}`);
}
console.log("\nhit@3 per kind:");
for (const kind of kinds) {
  const cols = Object.entries(results)
    .map(([name, rows]) => `${name} ${pct(avg(rows.filter((r) => r.kind === kind), "hit3"))}`)
    .join("   ");
  console.log(`  ${kind.padEnd(15)} ${cols}`);
}

const aggregateCols = Object.entries(results)
  .map(([name, rows]) => `${name} ${pct(avg(rows.filter((r) => r.kind === "aggregate"), "hit3"))}`)
  .join("   ");
console.log(`  ${"aggregate*".padEnd(15)} ${aggregateCols}   (* not in the headline score)`);

// Keep a dated copy so later changes (hybrid, reranker, chunking) can be compared
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const file = new URL(`./results/${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ k: K, questions: golden.length, results }, null, 2));
console.log(`\nsaved ${file.pathname}`);
