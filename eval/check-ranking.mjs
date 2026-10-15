// Sanity checks for eval/ranking.mjs: hand-computed BM25 values and RRF order.
//
//   node eval/check-ranking.mjs
//
// Run it after touching ranking.mjs — a silent bug there would make every
// eval comparison against BM25 or hybrid meaningless.

import assert from "node:assert/strict";
import { buildBm25, rrf, tokenize } from "./ranking.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-4, `${msg}: ${a} != ${b}`);

// 1. Tokenizer: lowercase, diacritics stripped, đ → dj, whole words only
assert.deepEqual(tokenize("Vežbe: Đak čita N+1!"), ["vezbe", "djak", "cita", "n", "1"]);

// 2. BM25 value computed by hand on a 3-capture collection
//    N = 3, lengths 3/3/2 → avgLen = 8/3; "mockito" is in 1 capture with tf = 2
//    IDF = ln(1 + (3 − 1 + 0.5) / (1 + 0.5)) = ln(8/3)
//    TF part = 2·2.2 / (2 + 1.2·(0.25 + 0.75·3/(8/3))) = 4.4 / 3.3125
const toy = [
  { id: "A", title: "", text: "mockito mockito test" },
  { id: "B", title: "", text: "test na na" },
  { id: "C", title: "", text: "malkier intervju" },
];
const bm25 = buildBm25(toy);
const score = (q, id) => bm25.scores(q).find((r) => r.id === id).score;
close(score("mockito", "A"), Math.log(8 / 3) * (4.4 / 3.3125), "BM25 hand value");
assert.equal(score("mockito", "B"), 0, "capture without the word scores 0");

// 3. Rare words outweigh common ones (IDF)
const common = buildBm25([
  { id: "A", title: "", text: "na na na test" },
  { id: "B", title: "", text: "na mockito" },
  { id: "C", title: "", text: "na malkier intervju" },
]);
assert.equal(common("na malkier")[0], "C", "rare 'malkier' beats repeated common 'na'");

// 4. Repeating a word helps, but with diminishing returns (k1 saturation)
const sat = buildBm25([
  { id: "x1", title: "", text: "mockito a b c d e f g h i" },
  { id: "x2", title: "", text: "mockito mockito b c d e f g h i" },
  { id: "x5", title: "", text: "mockito mockito mockito mockito mockito f g h i j" },
  { id: "other", title: "", text: "nothing relevant here at all ok yes no maybe" },
]);
const [s1, s2, s5] = ["x1", "x2", "x5"].map((id) => sat.scores("mockito").find((r) => r.id === id).score);
assert.ok(s1 < s2 && s2 < s5, "more occurrences score higher");
assert.ok(s5 / s1 < 5 / 2, "5× the occurrences is far from 5× the score");

// 5. RRF: a = 1/61 + 1/62, c = 1/63 + 1/61, b = 1/62, d = 1/63
assert.deepEqual(rrf([["a", "b", "c"], ["c", "a", "d"]]), ["a", "c", "b", "d"]);

console.log("ranking checks passed");
