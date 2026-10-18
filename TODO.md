# Second Brain — TODO

## In progress
- [ ] **RAG pipeline** — ✅ pgvector + `match_captures`, ✅ Voyage `voyage-3.5-lite` (1024 dim), ✅ backfill 120/120, ✅ search/chat/relate/relate-batch na vektorima, ✅ relate prag 0.71 (izmeren: LLM-judge na 491 par + ljudska provera 17/20) · ostaje: deploy (`VOYAGE_API_KEY` na Vercel), pokrenuti batch relate jednom, commit


## Backlog

**UX**
- [ ] **Bulk akcije** — označi više captures, obriši/promeni projekt odjednom

**AI**
- [x] **Structured output + novi provider** — svi AI pozivi idu kroz `lib/llm.ts` (Groq free tier, gpt-oss-120b/20b) sa strict JSON šemama (constrained decoding) umesto `JSON.parse`; enum za tip/projekat/ID-eve; digest spojen u `lib/digest.ts`; Anthropic SDK uklonjen
- [x] **Eval kategorizacije + nova podela projekata** — nove definicije projekata (SE / AI Engineering umesto Other), 51 capture prebačen; LLM+opisi 63%, kNN 75%, u produkciji kombinacija (kNN kad se ≥3/5 suseda slaže, inače LLM) 73%. Detalji u `eval/README.md`
- [ ] **Few-shot kategorizacija** — kod spreman: `npx tsx --env-file=.env.local eval/categorize-eval.mts --few-shot` (troši ~ceo dnevni Groq budžet za gpt-oss-20b)
- [ ] **Settings stranica** — ✅ faza 1: digest on/off + dan, review podsetnici (jutro/popodne/oba/off), task podsetnici, podrazumevani tip i projekat, export, brisanje podataka (`supabase/settings-and-query-log.sql` treba pokrenuti) · faza 2 (uz structured output): praćenje AI potrošnje + mesečni limit, auto-kategorizacija/relate on/off, jezik AI odgovora · faza 3: klizač za relate prag
- [x] **Eval skripta** — `eval/golden.json` (26 pitanja) + `eval/retrieval-eval.mjs`; hit@1/hit@3/recall@5/MRR. Prvo merenje: stari keyword iz chata hit@3 39% → vektori 96%
- [ ] **Chunking** — dugi capture-i (transkripti) se dele na delove sa sopstvenim embeddingom (`capture_chunks` tabela) umesto sečenja na 8000 karaktera; meri eval pre/posle *(posle eval skripte)*
- [x] **Hybrid search** — izmereno 2026-10-15: BM25 hit@3 52%, hybrid (RRF) 78%, sami vektori 96% → hybrid ne ide u produkciju (BM25 unosi šum, srpska morfologija). Detalji u `eval/README.md`
- [x] **Reranker** — eval 2026-10-15: vektori + Voyage rerank-2.5 → hit@1 100% (vektori sami 83%), ~0.6 s po upitu. U produkciji: search (20 → 12) i chat (15 → 8), fallback na redosled vektora
- [x] **Log upita** — `query_log` tabela: svako pitanje iz search/chata, šta je vraćeno i da li je bio fallback (rerank/vector)
- [ ] **Teži eval dataset** — trenutni je zasićen (100%), ne može da izmeri chunking ni query rewriting: dodati prava pitanja iz korišćenja, follow-up pitanja, detalje iz dugačkih captura
- [x] **Self-healing embeddinzi** — `fillMissingEmbeddings` u dnevnom task-due cronu popunjava `embedding is null` (do ~8K tokena po pokretanju)
- [ ] **Query router** — pitanja o vremenu i stanju ("šta sam poslednje učio", "trenutni fokus", "otvoreni taskovi") nisu pitanja o sličnosti: prepoznati tip pitanja i umesto vektorske pretrage uzeti najnovije capture-e ili filtrirati po tipu/datumu. U evalu su to `aggregate` pitanja (trenutno 0% za obe metode)
- [ ] **Jev za kategorizaciju** — TypeSafe AI "System One" model, vraća izbor iz liste (do 255 opcija), $0.042/M ulaznih tokena; treba min. $5 kredita. Dodati `classify()` u `lib/llm.ts` i pustiti `eval/categorize-eval.mts`; naslov i dalje daje LLM. Proveriti srpski
- [ ] **Query rewriting u chatu** — `/api/chat` pretvara u vektor samo trenutnu poruku, pa follow-up tipa "reci mi više o tome" vuče nasumične capture-e. Haiku 5.5 prepiše pitanje u samostalno ("reci mi više o Mockito doThrow") pre pretrage; u eval dodati i follow-up pitanja da se izmeri razlika
- [ ] **Live AI sugestije** — predlaže tip/projekt dok kucaš, pre save
- [ ] **Summarize capture** — dugme na kartici, AI sažetak jednog capture-a

**Demo / javni pristup**
- [ ] **Demo nalog za regrutere** — dugme "Try demo" na login stranici uloguje u demo nalog sa izmišljenim ali realističnim capture-ima (da search, graf i chat imaju šta da pokažu); RLS čuva prave beleške; noćni cron vraća demo podatke na početno stanje. Uslov: rate limiting po korisniku, da posetilac ne potroši ceo dnevni Groq budžet

**Grow tab**
- [ ] **Ciljevi** — postavi target captures po nedelji, prati progress
- [ ] **Streak freeze** — jedna propuštena noć ne pokvari streak

**Tehničko**
- [ ] **Paginacija** — trenutno limit 50 u listi, dodati load more
- [ ] **Full-text search u Supabase** — umesto klijentskog filtera, brže na velikim bazama
- [ ] **Rate limiting** — zaštita API ruta od prekomerne upotrebe

**Integracije**
- [ ] **Import** — uvoz iz Notion, Obsidian, Readwise
- [ ] **Webhook/Zapier** — okini automatizaciju kada se sačuva novi capture

## Done
- [x] Dokumentacija: README (features, cron, evals, šema, rute, LLM budžet) i ArchitectureTab (čvorovi, tokovi, fajlovi, AI pipeline) ažurirani na RAG + Groq
- [x] Fix: weekly digest se pravio 4–6× svakog ponedeljka (2 cron pokretanja × broj push pretplata) i kad nema novih captura
- [x] Favorites / star
- [x] Export (Markdown + JSON)
- [x] Spaced repetition
- [x] Weekly summary (in-app, Grow tab)
- [x] AI chat (RAG, ~$0.01/poruka)
- [x] Google OAuth login
- [x] AI capture (type/project/title auto-categorization)
- [x] URL enrichment (og:title + meta description)
- [x] Edit / delete captures
- [x] Filter + sort
- [x] Relate (semantic connections between captures)
- [x] Batch relate
- [x] Force-directed knowledge graph (pan/zoom/filter)
- [x] Daily digest
- [x] Visibility-based sync
- [x] PWA (installable, offline-ready)
- [x] Instant search overlay (⌘K)
- [x] Voice capture
- [x] Capture templates
- [x] Growth tab (heatmap + streak + task manager)
- [x] Web Share Target (Android only)
