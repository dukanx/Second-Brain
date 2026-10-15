# Second Brain — TODO

## In progress
- [ ] **RAG pipeline** — ✅ pgvector + `match_captures`, ✅ Voyage `voyage-3.5-lite` (1024 dim), ✅ backfill 120/120, ✅ search/chat/relate/relate-batch na vektorima, ✅ relate prag 0.71 (izmeren: LLM-judge na 491 par + ljudska provera 17/20) · ostaje: deploy (`VOYAGE_API_KEY` na Vercel), pokrenuti batch relate jednom, ažurirati ArchitectureTab opis relate-a i chat-a, commit


## Backlog

**UX**
- [ ] **Bulk akcije** — označi više captures, obriši/promeni projekt odjednom

**AI**
- [ ] **Structured output + novi modeli** — zameni `JSON.parse` i forced `tool_choice` sa `output_config.format` na svim Claude endpointima (capture, search, summary, digest, cron) → garantovana struktura; uz to prelazak sa `claude-sonnet-4-6` na Sonnet 5.5 (search, chat, digest) i Haiku 5.5 (kategorizacija captura). Novi modeli ne podržavaju forced `tool_choice`, zato ide zajedno
- [ ] **Settings stranica** — uključi/isključi auto digest, review podsetnike i task podsetnike; kasnije: praćenje AI potrošnje + mesečni limit, prag za relate, jezik AI odgovora
- [x] **Eval skripta** — `eval/golden.json` (26 pitanja) + `eval/retrieval-eval.mjs`; hit@1/hit@3/recall@5/MRR. Prvo merenje: stari keyword iz chata hit@3 39% → vektori 96%
- [ ] **Chunking** — dugi capture-i (transkripti) se dele na delove sa sopstvenim embeddingom (`capture_chunks` tabela) umesto sečenja na 8000 karaktera; meri eval pre/posle *(posle eval skripte)*
- [ ] **Hybrid search + reranker** — vektori su loši za tačne termine i imena ("N+1", "Malkier"): kombinovati keyword (Postgres full-text) i vektorsku pretragu (npr. Reciprocal Rank Fusion), pa reranker (Voyage rerank) nad top kandidatima; meri evalom svaki korak posebno *(posle eval skripte)*
- [ ] **Self-healing embeddinzi** — capture sačuvan dok Voyage ne radi ostaje bez embeddinga zauvek; dnevni cron popunjava `embedding is null` (logika iz backfill skripte), uz log koliko ih je bilo
- [ ] **Query router** — pitanja o vremenu i stanju ("šta sam poslednje učio", "trenutni fokus", "otvoreni taskovi") nisu pitanja o sličnosti: prepoznati tip pitanja i umesto vektorske pretrage uzeti najnovije capture-e ili filtrirati po tipu/datumu. U evalu su to `aggregate` pitanja (trenutno 0% za obe metode)
- [ ] **Query rewriting u chatu** — `/api/chat` pretvara u vektor samo trenutnu poruku, pa follow-up tipa "reci mi više o tome" vuče nasumične capture-e. Haiku 5.5 prepiše pitanje u samostalno ("reci mi više o Mockito doThrow") pre pretrage; u eval dodati i follow-up pitanja da se izmeri razlika
- [ ] **Live AI sugestije** — predlaže tip/projekt dok kucaš, pre save
- [ ] **Summarize capture** — dugme na kartici, AI sažetak jednog capture-a

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
