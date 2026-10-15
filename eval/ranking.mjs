// Ranking building blocks shared by the eval and its sanity checks.

// Lowercase, strip diacritics (č→c, đ→dj) and split into whole words. Notes
// and questions mix "vezbe"/"vežbe", so without this they'd never match.
export function tokenize(s) {
  return (
    s
      .toLowerCase()
      .replace(/đ/g, "dj")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

// BM25: for every query word found in a capture,
//   score += IDF(word) × tf·(k1+1) / (tf + k1·(1 − b + b·len/avgLen))
// IDF makes rare words ("malkier") count far more than common ones ("na");
// k1 caps how much repeating a word helps; b penalises long captures.
// Everything comes from counting the collection itself — no training.
export function buildBm25(captures, k1 = 1.2, b = 0.75) {
  const docs = captures.map((c) => {
    const tokens = tokenize(`${c.title} ${c.text}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: c.id, tf, len: tokens.length };
  });
  const N = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / N;
  const df = new Map(); // in how many captures each word appears
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));

  // Score of every capture for a query (exposed for the sanity checks)
  const scores = (query) => {
    const terms = [...new Set(tokenize(query))];
    return docs.map((d) => {
      let score = 0;
      for (const t of terms) {
        const tf = d.tf.get(t);
        if (!tf) continue;
        score += idf(t) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.len) / avgLen));
      }
      return { id: d.id, score };
    });
  };

  const search = (query, limit = 8) =>
    scores(query)
      .filter((r) => r.score > 0)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, limit)
      .map((r) => r.id);
  search.scores = scores;
  return search;
}

// Reciprocal Rank Fusion: each list gives a capture 1/(60 + rank); sum and
// re-sort. Uses only positions, so BM25 scores and cosine similarities (which
// live on different scales) never have to be compared directly.
export function rrf(lists, limit = 8, c = 60) {
  const score = new Map();
  for (const list of lists) {
    list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (c + i + 1)));
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
