// One-off backfill: compute embeddings for all captures that don't have one yet.
//
// Run once after applying supabase/pgvector-setup.sql:
//   node --env-file=.env.local scripts/backfill-embeddings.mjs
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !VOYAGE_API_KEY) {
  console.error("Missing env: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY");
  process.exit(1);
}

const EMBEDDING_MODEL = "voyage-3.5-lite";
const MAX_CHARS = 8000;
const MAX_INPUTS = 100; // Voyage accepts up to 128 inputs per request.

// Voyage free tier (no payment method): 3 requests/min and 10K tokens/min.
// Keep each request under TOKENS_PER_REQUEST and space requests DELAY_MS apart,
// so a full minute stays at most 3 × 3000 = 9000 tokens.
const TOKENS_PER_REQUEST = 3000;
const DELAY_MS = 21_000;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Rough token estimate, before we call the API. English averages ~4 chars per
// token, while Serbian with diacritics uses more tokens, so we divide by 3 to stay safe.
const estimateTokens = (s) => Math.ceil(s.length / 3);

async function embed(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      input_type: "document",
    }),
  });
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) throw new Error(`Voyage failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    vectors: data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
    tokens: data.usage?.total_tokens,
  };
}

// Group rows into batches that each fit the per-request token budget.
function makeBatches(rows) {
  const batches = [];
  let current = [];
  let tokens = 0;
  for (const row of rows) {
    const input = `${row.title ?? ""}\n\n${row.text ?? ""}`.trim().slice(0, MAX_CHARS);
    const t = estimateTokens(input);
    if (current.length > 0 && (tokens + t > TOKENS_PER_REQUEST || current.length >= MAX_INPUTS)) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push({ id: row.id, input, estimated: t });
    tokens += t;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("captures")
    .select("id, title, text")
    .is("embedding", null);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("Nothing to backfill — all captures already have embeddings.");
    return;
  }

  const batches = makeBatches(rows);
  console.log(`Backfilling ${rows.length} captures in ${batches.length} requests...`);
  let done = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (i > 0) await sleep(DELAY_MS);

    let result = await embed(batch.map((b) => b.input));
    if (result.rateLimited) {
      // The limit is per minute, so waiting a full minute always resets it.
      console.log("  rate limited, waiting 60s and retrying...");
      await sleep(60_000);
      result = await embed(batch.map((b) => b.input));
      if (result.rateLimited) throw new Error("Still rate limited after retry; run the script again later.");
    }

    const results = await Promise.all(
      batch.map((b, j) =>
        supabase.from("captures").update({ embedding: result.vectors[j] }).eq("id", b.id)
      )
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) throw new Error(`DB update failed: ${failed[0].error.message}`);

    done += batch.length;
    const estimated = batch.reduce((sum, b) => sum + b.estimated, 0);
    console.log(`  ${done}/${rows.length}  (tokens: estimated ${estimated}, actual ${result.tokens})`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
