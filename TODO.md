# Second Brain — TODO

## In progress
_nothing_


## Backlog

**UX**
- [ ] **Bulk akcije** — označi više captures, obriši/promeni projekt odjednom

**AI**
- [ ] **Structured output** — zameni `JSON.parse` sa Anthropic `tool_use` na svim Claude endpointima (capture, search, relate, summary, digest) → garantovana struktura, nema crash na malformed JSON
- [ ] **RAG pipeline** — aktiviraj pgvector na Supabase, dodaj `embedding vector(1536)` na captures, generiši embedding pri svakom save-u, zameni keyword scoring u `/api/chat` sa cosine similarity; backfill za postojeće capture-e
- [ ] **Eval skripta** — 15–20 pitanja + očekivani capture-i (golden dataset), meri precision@1 i precision@3; pokreni na keyword vs. embedding retrievalu da vidiš konkretnu razliku *(radi tek kad RAG bude gotov)*
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
