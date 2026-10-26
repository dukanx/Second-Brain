# Second Brain — TODO

## In progress
- [ ] **RAG pipeline** — ✅ pgvector + `match_captures`, ✅ Voyage `voyage-3.5-lite` (1024 dim), ✅ backfill 120/120, ✅ search/chat/relate/relate-batch na vektorima, ✅ relate prag 0.71 (izmeren: LLM-judge na 491 par + ljudska provera 17/20) · ostaje: deploy (`VOYAGE_API_KEY` na Vercel), pokrenuti batch relate jednom, commit


## Backlog

**UX**
- [ ] **Bulk akcije** — označi više captures, obriši/promeni projekt odjednom

**AI**
- [x] **Structured output + novi provider** — svi AI pozivi idu kroz `lib/llm.ts` (Groq free tier, gpt-oss-120b/20b) sa strict JSON šemama (constrained decoding) umesto `JSON.parse`; enum za tip/projekat/ID-eve; digest spojen u `lib/digest.ts`; Anthropic SDK uklonjen
- [x] **Eval kategorizacije + nova podela projekata** — nove definicije projekata (SE / AI Engineering umesto Other), 51 capture prebačen; LLM+opisi 63%, kNN 75%, u produkciji kombinacija (kNN kad se ≥3/5 suseda slaže, inače LLM) 73%. Detalji u `eval/README.md`
- [x] **Few-shot kategorizacija** — izmereno i odbijeno (2026-10-21): pravilo sa few-shot LLM-om 85% naprema 84% bez; razlika 1 capture, a u produkciji bi tražio drugi LLM poziv. `--few-shot` ostaje u evalu
- [ ] **Settings stranica** — ✅ faza 1: digest on/off + dan, review podsetnici (jutro/popodne/oba/off), task podsetnici, podrazumevani tip i projekat, export, brisanje podataka (`supabase/settings-and-query-log.sql` treba pokrenuti) · faza 2 (uz structured output): praćenje AI potrošnje + mesečni limit, auto-kategorizacija/relate on/off, jezik AI odgovora · faza 3: klizač za relate prag
- [x] **Eval skripta** — `eval/golden.json` (26 pitanja) + `eval/retrieval-eval.mjs`; hit@1/hit@3/recall@5/MRR. Prvo merenje: stari keyword iz chata hit@3 39% → vektori 96%
- [ ] **Chunking** — dugi capture-i (transkripti) se dele na delove sa sopstvenim embeddingom (`capture_chunks` tabela) umesto sečenja na 8000 karaktera; meri eval pre/posle *(posle eval skripte)*
- [x] **Hybrid search** — izmereno 2026-10-15: BM25 hit@3 52%, hybrid (RRF) 78%, sami vektori 96% → hybrid ne ide u produkciju (BM25 unosi šum, srpska morfologija). Detalji u `eval/README.md`
- [x] **Reranker** — eval 2026-10-15: vektori + Voyage rerank-2.5 → hit@1 100% (vektori sami 83%), ~0.6 s po upitu. U produkciji: search (20 → 12) i chat (15 → 8), fallback na redosled vektora
- [x] **Log upita** — `query_log` tabela: svako pitanje iz search/chata, šta je vraćeno i da li je bio fallback (rerank/vector)
- [ ] **Teži eval dataset** — trenutni je zasićen (100%), ne može da izmeri chunking ni query rewriting: dodati prava pitanja iz korišćenja, follow-up pitanja, detalje iz dugačkih captura
- [x] **Self-healing embeddinzi** — `fillMissingEmbeddings` u dnevnom task-due cronu popunjava `embedding is null` (do ~8K tokena po pokretanju)
- [x] **Query router → agent** — pitanja o vremenu i stanju rešava agent: sam bira `list_captures` (filter po tipu/datumu) umesto vektorske pretrage
- [x] **Agent (LangGraph + Groq)** — Chat bez zakačenog captura ide na `/api/agent`: alati `semantic_search`, `list_captures`, `get_capture`, `create_task` (uz potvrdu, `interrupt`); memorija u Postgresu (`PostgresSaver`, šema `langgraph`, `DATABASE_URL` preko poolera); guardrails (userId iz sesije, prompt-guard, budžet 3 pretrage / 5 koraka, clamp, kalendar). Eval `eval/agent-eval.mts` (12 pitanja)
- [ ] **Pun eval agenta: low vs medium** — `--repeat 2` za oba, na svež Groq dan (`EVAL_PACE_MS=60000`); ako je tačnost ista, `AGENT_EFFORT = "low"` (na teškim pitanjima: low 6/6 sa ~5,3K tokena, medium 6/6 sa ~11K)
- [ ] **Context compaction u agentu** — istorija (4 kruga) nosi sirove rezultate starih alata, pa 5. pitanje u razgovoru košta 11K ulaznih tokena i ide preko 8K/min. Iz starih krugova čuvati samo pitanja i konačne odgovore, rezultate alata samo za tekući krug. Meriti istim razgovorom od 5 pitanja (pre: 2,0K → 1,2K → 3,4K → 11,1K → 11,1K)
- [ ] **Search vidi datume** — katalog u `/api/search` nema datum captura, pa stare beleške predstavlja kao aktuelno stanje ("intervju početkom jula" u oktobru). Dodati datum svakom capture-u + pravilo u promptu
- [ ] **Dugme "pitaj agenta" u Search-u** *(opciono)* — za pitanja o vremenu/stanju, otvara Chat sa istim pitanjem
- [ ] **Taskovi u beleškama** — većina obaveza živi u Note/Learning capture-ima, a ne kao Task, pa ih agent ne vidi kao taskove. Razmisliti: izvlačenje taskova iz beleški (uz potvrdu) ili bar podsetnik pri capture-u
- [ ] **Jev za kategorizaciju** — TypeSafe AI "System One" model, vraća izbor iz liste (do 255 opcija), $0.042/M ulaznih tokena; treba min. $5 kredita. Dodati `classify()` u `lib/llm.ts` i pustiti `eval/categorize-eval.mts`; naslov i dalje daje LLM. Proveriti srpski
- [ ] **Query rewriting u chatu** — `/api/chat` pretvara u vektor samo trenutnu poruku, pa follow-up tipa "reci mi više o tome" vuče nasumične capture-e. Haiku 5.5 prepiše pitanje u samostalno ("reci mi više o Mockito doThrow") pre pretrage; u eval dodati i follow-up pitanja da se izmeri razlika
- [ ] **Live AI sugestije** — predlaže tip/projekt dok kucaš, pre save
- [ ] **Summarize capture** — dugme na kartici, AI sažetak jednog capture-a

- [ ] **Voyage kartica** — bez kartice 3 zahteva/min; jedna `semantic_search` u agentu = 2 Voyage zahteva (embed + rerank), pa 2 pretrage u pitanju okidaju fallback. Sa karticom 2.000/min, besplatni tokeni ostaju

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
