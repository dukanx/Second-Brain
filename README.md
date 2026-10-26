# second_brain 

A personal AI-powered knowledge capture and synthesis tool. Built for daily use — capture thoughts, links, tasks, and learnings, then let AI find connections, generate insights, and surface what you've forgotten.

> Personal use project. Feel free to fork and self-host with your own API keys and Supabase instance.

## Stack

- **Next.js 15** App Router (server components + API routes)
- **Supabase** — Postgres database + Google OAuth
- **Groq** (free tier) — `gpt-oss-120b` / `gpt-oss-20b` for all AI features via a provider-agnostic layer (`lib/llm.ts`) with strict structured outputs; `whisper-large-v3` for audio transcription
- **Voyage AI** — `voyage-3.5-lite` embeddings + `rerank-2.5` reranker for RAG (pgvector); see [`eval/`](eval/) for the retrieval eval
- **LangGraph JS** — tool-calling agent in the Chat tab, with human-in-the-loop approval and Postgres-backed memory
- **Tailwind CSS** — terminal aesthetic (JetBrains Mono, dark theme)
- **Vercel** — hosting + cron jobs

## Features

### Capture
- AI auto-categorizes every capture (type, project, title) with a strict JSON schema, so the model can only return valid types and existing projects
- Project choice combines the LLM (which sees each project's description) with **kNN**: if ≥ 3 of the 5 most similar existing captures share a project, that project wins (measured in [`eval/`](eval/))
- Every capture gets a Voyage embedding for semantic search, relations and kNN
- URL detection — fetches og:title/description; YouTube URLs extract full transcript
- Voice capture via Web Speech API (continuous, live)
- Audio file upload — transcribed via Groq Whisper, merged with typed text
- Quick templates: task / idea / TIL / link / note
- Tasks support due dates and priority (high / medium / low)
- Star (favorite) captures, edit, delete

### Search & Discovery (RAG)
- **Search tab** — the query is embedded, pgvector returns the 20 most similar captures, a Voyage reranker keeps the best 12, and the LLM synthesizes an answer with follow-up questions
- **Chat tab** — a **LangGraph agent** (below); with a pinned capture, plain RAG chat about that capture (15 candidates → rerank → 8)
- **Relations** — captures are linked when cosine similarity ≥ 0.71 (threshold picked by F1 on 491 labelled pairs), batch rebuild from the Graph tab
- **⌘K** instant search overlay — client-side, multi-word AND matching
- **Knowledge Graph** — force-directed canvas graph, pan/zoom, filter by type/project
- Every search/chat query is logged with what was retrieved and whether a fallback kicked in (`query_log`)

### Agent (Chat tab)
- `gpt-oss-120b` decides which tools to call, in a loop: `semantic_search` (same RAG as Search), `list_captures` (filter by type, project, last N days), `get_capture` (full text), `create_task`
- **Human in the loop:** `create_task` pauses the graph (`interrupt`); the UI shows Approve / Decline and nothing is written before you approve
- **Memory:** conversation state is checkpointed in Postgres (`PostgresSaver`, schema `langgraph`, not exposed by the REST API), keyed by `userId:threadId`; the model sees the last 4 turns
- **Guardrails:** `userId` comes from the session and is never a tool argument; tool output is checked by Groq's prompt-guard model; at most 3 searches and 5 steps per question (then a forced answer); tool limits are clamped in code; dates come from a calendar the code writes into the prompt
- Evaluated with 12 questions (tool choice, retrieved data, exact due date, LLM judge, cost); see [`eval/`](eval/)

### Growth
- **Activity heatmap** — year view (52 weeks) and month view with navigation
- **Streak counter** + weekly/monthly capture stats
- **Task manager** — all Task captures in one place, expandable, complete with one tap
- **Spaced repetition** — surfaces Learning/Idea captures due for review (7-day interval)
- **Weekly summary** — AI analysis of the current week, stored in Supabase, browsable history

### Digest
- AI analysis of the last 60 captures: themes, patterns, pending tasks, forgotten ideas, next action
- Generated on demand, or weekly by cron on the day chosen in settings (skipped if nothing new was captured)
- Stored in Supabase — synced across all devices

### Settings
- Weekly digest on/off + day, review reminders (morning / afternoon / both / off), task reminders
- Default type and project for captures when AI is unavailable
- Export (Markdown / JSON) and delete all captures (typed confirmation)

### Architecture
- Visual system explorer — visible in header on desktop and mobile landscape
- **System Overview** — layered diagram (Frontend → API → AI → Database) with animated data flow; click any node to inspect it
- **Data Flows** — step-by-step animated breakdown of Save Capture, Chat, Search, and Batch Relate flows
- **Dependency Map** — structured 4-column node graph showing how files connect; click to highlight connections
- **File Tree** — browsable file tree with exports, imports, and used-by for each file
- **AI Pipeline** — full prompt/response breakdown for every LLM operation

### PWA
- Installable on iOS and Android (Add to Home Screen)
- Web Share Target — share links directly to the app (Android only)
- Push notifications for review reminders + weekly recap (iOS 16.4+ when installed as PWA)

## Cron

Defined in `vercel.json`:
- **09:00 and 14:00 UTC** `/api/cron/review-reminder` — review reminders for users who chose that run; weekly digest in the morning run of each user's chosen day
- **10:00 UTC** `/api/cron/task-due` — push for tasks due tomorrow; embeds captures that were saved while Voyage was unavailable (self-healing)

## Retrieval & evals

Measured on a golden dataset of 26 questions over the real knowledge base ([`eval/README.md`](eval/README.md)):

| retrieval | hit@1 | hit@3 |
|---|---|---|
| old keyword matching | 17% | 39% |
| BM25 | 35% | 52% |
| vector (voyage-3.5-lite + pgvector) | 83% | 96% |
| hybrid BM25 + vector (RRF) | 61% | 78% — rejected |
| **vector + reranker** (in production) | **100%** | **100%** |

Capture categorization is evaluated against the stored labels: project accuracy LLM 63%, kNN 75%, production rule 73%.

## Database Schema

```sql
-- Main captures table
create table captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  text text not null,
  title text not null default '',
  type text not null default 'Note',
  project text not null default 'Other',
  related_ids uuid[] default '{}',
  embedding vector(1024),            -- Voyage embedding (pgvector, HNSW index)
  starred boolean not null default false,
  last_reviewed_at timestamptz,
  due_date date,
  priority text default 'medium',
  created_at timestamptz default now()
);

-- Projects (description is fed to the categorization prompt)
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  color text not null,
  description text,
  created_at timestamptz default now()
);

-- Digest history
create table digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  content jsonb not null,
  created_at timestamptz default now()
);

-- Weekly summaries (one per week per user)
create table summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  week_start date not null,
  content jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, week_start)
);

-- Push notification subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  subscription jsonb not null,
  created_at timestamptz default now()
);
```

Also: `user_settings`, `query_log` and the `match_captures()` similarity function — see
[`supabase/`](supabase/) for the full setup scripts (`pgvector-setup.sql`, `settings-and-query-log.sql`,
`project-descriptions.sql`).

All tables use Row Level Security — users only access their own data.

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GROQ_API_KEY=
VOYAGE_API_KEY=
DATABASE_URL=   # Supabase → Connect → Transaction pooler (agent memory)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=
CRON_SECRET=
# + server-side Supabase and other keys in Vercel dashboard
```

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/capture` | POST | Save capture: AI categorize + kNN project, embed, trigger relate |
| `/api/capture/[id]` | PUT / PATCH / DELETE | Edit fields (re-embeds on text change), delete |
| `/api/relate` | POST | Link one capture to similar ones (vector similarity) |
| `/api/relate/batch` | POST | Rebuild all relations (Graph tab) |
| `/api/search` | POST | RAG search: vector → rerank → LLM synthesis |
| `/api/chat` | POST | RAG chat about a pinned capture: vector → rerank → LLM answer |
| `/api/agent` | POST | Agent turn (`{threadId, message}`) or approval (`{threadId, resume}`) |
| `/api/transcribe` | POST | Audio file → Groq Whisper → transcript |
| `/api/projects` | GET / POST | List projects / create new project |
| `/api/digest` | GET / POST | Fetch history / generate digest |
| `/api/summary/weekly` | GET / POST | Fetch weekly summaries / generate |
| `/api/settings` | GET / PUT | Read / update user settings |
| `/api/account/data` | DELETE | Delete all captures, digests, summaries and query log |
| `/api/push/subscribe` | POST | Save push subscription (VAPID) |
| `/api/cron/review-reminder` | GET | Cron: review reminders + weekly digest |
| `/api/cron/task-due` | GET | Cron: task reminders + fill missing embeddings |
| `/api/auth/callback` | GET | Google OAuth callback |

## LLM budget (Groq free tier)

All AI calls go through `lib/llm.ts`. Groq's free tier allows 8K tokens/minute and 200K tokens/day per model, so prompts are kept compact:

| Feature | Model | ~Tokens per call |
|---|---|---|
| Capture (categorize) | gpt-oss-20b | 0.3–1.5K |
| Search synthesis | gpt-oss-120b | 5–6K (12 captures × 1,000 chars) |
| Chat message | gpt-oss-120b | 2–3K |
| Digest | gpt-oss-120b | ~5K (60 captures, numbered instead of UUIDs) |
| Weekly summary | gpt-oss-120b | 1–3K |
| Agent question | gpt-oss-120b | 1–12K over 1–3 calls (grows with conversation history) |

## Local Development

```bash
npm install
# add .env.local with the variables above
npx tsx --env-file=.env.local scripts/setup-agent-db.mts   # once: agent memory tables
npm run dev
```

