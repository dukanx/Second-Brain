// Categorization eval: run every stored capture through categorizeCapture (the
// exact code /api/capture uses) and compare type and project with what is
// stored.
//
//   npx tsx --env-file=.env.local eval/categorize-eval.mts [--no-descriptions] [--few-shot]
//
//   --no-descriptions  prompt lists project names only
//   --limit N          only the first N captures (quick check that the code runs)
//   --few-shot         prompt also gets the 5 most similar captures and their
//                      projects (leave-one-out: never the capture itself)
//
// Every run also reports the production rule (kNN when >= 3 of 5 neighbours
// agree, else the LLM), using the same projectFromNeighbors as /api/capture.
//
// Caveat: stored labels are not ground truth. Most were picked by the previous
// model (Claude Sonnet) and only some were corrected by hand, so this measures
// agreement with the existing labels.
//
// Paced at one call per 12 s to stay under Groq's 8K tokens/minute (free tier),
// so 120 captures take ~25 minutes.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { categorizeCapture, projectFromNeighbors, KNN_NEIGHBORS, type FiledExample } from "@/lib/categorize";
import { isRateLimited } from "@/lib/llm";

const PACE_MS = 12_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Project descriptions: from the DB once supabase/project-descriptions.sql has
// run, else from the same text kept in eval/project-descriptions.json.
// --no-descriptions measures the prompt with project names only.
const useDescriptions = !process.argv.includes("--no-descriptions");
const fallbackDescriptions: Record<string, string> = JSON.parse(
  readFileSync(new URL("./project-descriptions.json", import.meta.url), "utf8")
);
const { data: dbProjects } = await supabase.from("projects").select("*");
const projects = dbProjects!.map((p) => ({
  name: p.name as string,
  description: useDescriptions ? ((p.description as string | undefined) ?? fallbackDescriptions[p.name] ?? null) : null,
}));
const useFewShot = process.argv.includes("--few-shot");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const { data: allCaptures } = await supabase
  .from("captures")
  .select("id, user_id, title, text, type, project, embedding")
  .order("created_at", { ascending: false });
const captures = allCaptures!.slice(0, limit);
const projectNames = projects.map((p) => p.name);
const titleById = new Map(allCaptures!.map((c) => [c.id, c.title as string]));

// Nearest captures to each capture, excluding itself (leave-one-out)
async function neighborsOf(c: { id: string; user_id: string; embedding: string }): Promise<FiledExample[]> {
  const { data } = await supabase.rpc("match_captures", {
    query_embedding: c.embedding,
    match_count: KNN_NEIGHBORS,
    p_user_id: c.user_id,
    exclude_id: c.id,
  });
  return ((data ?? []) as { id: string; project: string }[]).map((m) => ({ title: titleById.get(m.id) ?? "", project: m.project }));
}

// Only id prefixes and labels are saved: results are committed to a public repo,
// so no capture titles or text.
type Row = { id: string; stored: { type: string; project: string }; predicted: { type: string; project: string }; combined: string };
const rows: Row[] = [];

const minutes = Math.ceil((captures.length * (PACE_MS + 1_000)) / 60_000);
console.log(
  `Categorizing ${captures.length} captures (${useDescriptions ? "descriptions" : "names only"}${useFewShot ? ", few-shot" : ""}), ` +
    `~${minutes} min. Progress is printed every 10 captures.`
);

// The free tier also caps tokens per DAY; if the run dies there, report on the
// captures done so far instead of losing them.
let stoppedEarly = false;
let failed = 0;
outer: for (const [i, c] of captures!.entries()) {
  for (let attempt = 0; ; attempt++) {
    try {
      const examples = useFewShot ? await neighborsOf(c) : [];
      const p = await categorizeCapture(c.text, projects, examples);
      const knn = await projectFromNeighbors(supabase, c.user_id, c.embedding, projectNames, c.id);
      rows.push({
        id: c.id.slice(0, 8),
        stored: { type: c.type, project: c.project },
        predicted: { type: p.type, project: p.project },
        combined: knn ?? p.project,
      });
      break;
    } catch (e) {
      if (isRateLimited(e) && attempt < 3) {
        console.log("  rate limited, waiting 60s...");
        await sleep(60_000);
        continue;
      }
      if (isRateLimited(e)) {
        console.log(`  stopped at ${i}/${captures!.length}: ${e instanceof Error ? e.message : e}`);
        stoppedEarly = true;
        break outer;
      }
      // Any other failure (e.g. schema rejected twice) is what production would
      // answer with the default type/project: count it as a miss and go on.
      console.log(`  capture ${i + 1} failed, counted as a miss: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      failed++;
      rows.push({ id: c.id.slice(0, 8), stored: { type: c.type, project: c.project }, predicted: { type: "(failed)", project: "(failed)" }, combined: "(failed)" });
      break;
    }
  }
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${captures!.length}`);
  await sleep(PACE_MS);
}

if (stoppedEarly) console.log(`\nPARTIAL RUN: ${rows.length} of ${captures!.length} captures`);
if (failed) console.log(`${failed} capture(s) failed and count as misses`);
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
const typeOk = rows.filter((r) => r.stored.type === r.predicted.type).length;
const projectOk = rows.filter((r) => r.stored.project === r.predicted.project).length;
console.log(`\ntype accuracy:    ${typeOk}/${rows.length} = ${pct(typeOk, rows.length)}`);
console.log(`project accuracy: ${projectOk}/${rows.length} = ${pct(projectOk, rows.length)}`);
const combinedOk = rows.filter((r) => r.stored.project === r.combined).length;
console.log(`project, production rule (kNN if >= 3/5 agree, else this LLM): ${combinedOk}/${rows.length} = ${pct(combinedOk, rows.length)}`);

// Confusion: for each stored project, where did the predictions go?
console.log("\nproject: stored → predicted");
for (const proj of [...new Set(rows.map((r) => r.stored.project))].sort()) {
  const mine = rows.filter((r) => r.stored.project === proj);
  const counts: Record<string, number> = {};
  for (const r of mine) counts[r.predicted.project] = (counts[r.predicted.project] ?? 0) + 1;
  const spread = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(", ");
  console.log(`  ${proj.padEnd(15)} (${String(mine.length).padStart(2)}) → ${spread}`);
}

console.log("\ntype: stored → predicted (mismatches only)");
const typeMiss: Record<string, number> = {};
for (const r of rows) if (r.stored.type !== r.predicted.type) {
  const k = `${r.stored.type} → ${r.predicted.type}`;
  typeMiss[k] = (typeMiss[k] ?? 0) + 1;
}
for (const [k, n] of Object.entries(typeMiss).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

if (Number.isFinite(limit)) process.exit(0); // quick check: don't save
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const variant = [useDescriptions ? "descriptions" : "names-only", useFewShot ? "few-shot" : ""].filter(Boolean).join("-");
const file = new URL(`./results/categorize-${new Date().toISOString().slice(0, 10)}-${variant}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ model: "gpt-oss-20b", variant, rows }, null, 2));
console.log(`\nsaved ${file.pathname}`);
