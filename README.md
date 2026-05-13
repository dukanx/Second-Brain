# second_brain 

A personal AI-powered knowledge capture and synthesis tool. Built for daily use — capture thoughts, links, tasks, and learnings, then let AI find connections, generate insights, and surface what you've forgotten.

> Personal use project. Feel free to fork and self-host with your own API keys and Supabase instance.

## Stack

- **Next.js 15** App Router (server components + API routes)
- **Supabase** — Postgres database + Google OAuth
- **Anthropic API** — `claude-sonnet-4-6` for all AI features
- **Groq** — `whisper-large-v3` for audio transcription
- **Tailwind CSS** — terminal aesthetic (JetBrains Mono, dark theme)
- **Vercel** — hosting + cron jobs

## Features

### Capture
- AI auto-categorizes every capture (type, project, title)
- URL detection — fetches og:title/description; YouTube URLs extract full transcript
- Voice capture via Web Speech API (continuous, live)
- Audio file upload — transcribed via Groq Whisper, merged with typed text
- Quick templates: task / idea / TIL / link / note
- Tasks support due dates and priority (high / medium / low)
- Star (favorite) captures, edit, delete

### Search & Discovery
- **⌘K** instant search overlay — client-side, multi-word AND matching
- **Search tab** — AI synthesis across all captures, follow-up questions
- **Chat tab** — conversational AI with RAG (finds top 8 relevant captures per message, ~$0.01/message)
- **Knowledge Graph** — force-directed canvas graph, pan/zoom, filter by type/project

### Growth
- **Activity heatmap** — year view (52 weeks) and month view with navigation
- **Streak counter** + weekly/monthly capture stats
- **Task manager** — all Task captures in one place, expandable, complete with one tap
- **Spaced repetition** — surfaces Learning/Idea captures due for review (7-day interval)
- **Weekly summary** — AI analysis of the current week, stored in Supabase, browsable history

### Digest
- AI analysis of last 80 captures: themes, patterns, pending tasks, forgotten ideas, next action
- Stored in Supabase — synced across all devices
- Full history, always shows last generated until you regenerate

### Architecture
- Visual system explorer — visible in header on desktop and mobile landscape
- **System Overview** — layered diagram (Frontend → API → AI → Database) with animated data flow; click any node to inspect it
- **Data Flows** — step-by-step animated breakdown of Save Capture, Chat, Search, and Batch Relate flows
- **Dependency Map** — structured 4-column node graph showing how files connect; click to highlight connections
- **File Tree** — browsable file tree with exports, imports, and used-by for each file
- **AI Pipeline** — full prompt/response breakdown for every Claude and Groq operation

### PWA
- Installable on iOS and Android (Add to Home Screen)
- Web Share Target — share links directly to the app (Android only)
- Push notifications for review reminders + weekly recap (iOS 16.4+ when installed as PWA)

## Cron

Defined in `vercel.json` — runs daily at 08:00 UTC:
- Sends review reminder if captures are due
- Sends weekly recap every Monday


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
  starred boolean not null default false,
  last_reviewed_at timestamptz,
  due_date date,
  priority text default 'medium',
  created_at timestamptz default now()
);

-- Daily digest history
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

All tables use Row Level Security — users only access their own data.

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=
CRON_SECRET=
# + server-side Supabase and other keys in Vercel dashboard
```

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/capture` | POST | Save capture, AI categorize, trigger relate |
| `/api/capture/[id]` | PATCH / DELETE | Edit fields, delete |
| `/api/relate` | POST | Find semantic connections for one capture |
| `/api/relate/batch` | POST | Batch relate selected captures (Graph tab) |
| `/api/search` | POST | AI search synthesis across all captures |
| `/api/chat` | POST | RAG chat (keyword-ranked context + history) |
| `/api/transcribe` | POST | Audio file → Groq Whisper → transcript |
| `/api/projects` | GET / POST | List projects / create new project |
| `/api/digest` | GET / POST | Fetch history / generate digest |
| `/api/summary/weekly` | GET / POST | Fetch weekly summaries / generate |
| `/api/push/subscribe` | POST | Save push subscription (VAPID) |
| `/api/cron/review-reminder` | GET | Daily cron: push for spaced repetition reviews |
| `/api/cron/task-due` | GET | Daily cron: push for tasks due today |
| `/api/auth/callback` | GET | Google OAuth callback |


## Token Usage (approximate)

| Feature | Input tokens | Cost |
|---|---|---|
| Capture (categorize) | ~200 | ~$0.001 |
| Relate (per capture) | ~3,000 | ~$0.01 |
| Search synthesis | ~15,000 | ~$0.05 |
| Chat message (RAG) | ~2,000 | ~$0.009 |
| Daily digest | ~8,000 | ~$0.03 |
| Weekly summary | ~3,000 | ~$0.01 |
## Local Development

```bash
npm install
# add .env.local with the variables above
npm run dev
```

