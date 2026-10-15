# Retrieval eval

Measures how well each retrieval method finds the right captures for a question.
Search and chat send only the retrieved captures to Claude, so if retrieval misses,
the answer misses too.

```bash
node --env-file=.env.local eval/retrieval-eval.mjs   # run the eval (needs VOYAGE_API_KEY)
node eval/check-ranking.mjs                          # sanity checks for BM25 / RRF
```

## Dataset

[`golden.json`](golden.json) has 26 questions about the real knowledge base (120 captures,
mixed Serbian/English), each with the captures that should come back, written as 8-char id
prefixes. Every question has a `kind`:

| kind | what it tests | example |
|---|---|---|
| exact | exact term or name | "AllSecure CorvusPay" |
| paraphrase | same topic, different words | "previše SQL upita kad učitavam listu entiteta" → N+1 note |
| cross-language | English question, Serbian note | "how do I mock dependencies in unit tests" |
| personal | facts about me and my projects | "koji auto imam" |
| overview | several captures needed at once | "kako stojim sa finansijama" |
| aggregate | depends on time or type, not similarity | "šta sam poslednje učio" |

`aggregate` questions are reported separately and kept out of the headline score.
Similarity search can't answer "what did I learn last" by design (see *Query router* in TODO).

## Metrics

- **hit@1**: the first result is an expected capture
- **hit@3**: at least one expected capture is in the top 3
- **recall@5**: the fraction of all expected captures that appear in the top 5
- **MRR**: 1 / rank of the first expected capture

## Results log

Each run also saves raw per-question results to `results/YYYY-MM-DD.json`.

### 2026-10-15: keyword vs BM25 vs vector vs hybrid

| method | hit@1 | hit@3 | recall@5 | MRR |
|---|---|---|---|---|
| keyword (old chat `findContext`) | 17% | 39% | 30% | 0.29 |
| BM25 (k1 = 1.2, b = 0.75) | 35% | 52% | 44% | 0.46 |
| **vector** (voyage-3.5-lite + pgvector) | **83%** | **96%** | **87%** | **0.89** |
| hybrid (BM25 + vector, RRF k = 60) | 61% | 78% | 72% | 0.71 |

What we learned:

- **BM25 beats the old keyword search** (hit@3 52% vs 39%). The old search counted query words
  as substrings, so filler words like "na" and "su" matched almost every note. BM25's IDF gives
  rare words such as "Malkier" far more weight: that note moved from rank 59 to rank 3.
- **BM25 struggles with Serbian inflection and with English questions.** "Village Bookeru" never
  matches "Booker", "finansijama" never matches "finansije", and English questions share no words
  with Serbian notes. There is no stemming, so this is a limitation of the method, not a bug.
- **Hybrid is worse than vector alone** (hit@3 78% vs 96%). RRF gives both lists equal weight.
  When BM25 has nothing relevant to return, its noise pushes correct vector results down
  ("koji auto imam": rank 2 → 7). Hybrid search mainly helps with exact terms, and vectors
  already score 100% on those here. **Decision: production stays vector-only.**
- We did not tune weights or stopwords to rescue hybrid. With only 21 scored questions, tuning
  on the same set we measure on would overfit the eval.
- **BM25 implementation verified.** It matches hand-computed values (`check-ranking.mjs`) and
  the `rank_bm25` Python library to within 1e-14 on all 26 questions × 120 captures, using the
  same IDF formula.

Caveats: the dataset is small (one question ≈ 5%), and the questions were written by looking at
the notes, so real-world questions may be harder.

### 2026-10-15: reranker on top of vector search

Vector search returns 15 candidates, and Voyage `rerank-2.5` re-orders them (title + first
700 chars per candidate). Run with `--rerank`.

| method | hit@1 | hit@3 | recall@5 | MRR |
|---|---|---|---|---|
| vector | 83% | 96% | 87% | 0.89 |
| **vector + rerank** | **100%** | **100%** | **94%** | **1.00** |

- Every question where vectors had the right capture lower in the list moved to rank 1:
  "which internships am I choosing between" 6 → 1, "koji auto imam" 2 → 1,
  "kako da testiram metodu koja ništa ne vraća…" 3 → 1. The reranker didn't push down any
  question that vectors already had at rank 1.
- Why it works: an embedding model encodes the question and each note separately. A reranker
  (cross-encoder) reads the question and the note together, so it can match details directly.
- Cost: about 2.3K tokens and ~0.6 s per query (`rerank-2.5-lite`: ~0.4 s).
- **The eval is now saturated.** 100% hit@1 means this dataset can no longer show whether
  a later change (chunking, query rewriting) helps. It needs harder questions: real questions
  from using the app, follow-ups, and details buried deep in long notes.
- `aggregate` questions stay at 0% for every method, as expected. They need a query router,
  not better ranking.
