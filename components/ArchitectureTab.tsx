'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type View = 'overview' | 'flows' | 'files' | 'ai';
type FlowId = 'capture' | 'chat' | 'search' | 'relate';
type AIFlowId = 'categorize' | 'chat' | 'search' | 'relate' | 'summary';
type LayerKey = 'frontend' | 'api' | 'ai' | 'db';

// ─────────────────────────────────────────────────────────────────────────────
// Layer visual config
// ─────────────────────────────────────────────────────────────────────────────

const LAYER: Record<LayerKey, { color: string; label: string; icon: string }> = {
  frontend: { color: '#60a5fa', label: 'FRONTEND',   icon: '◉' },
  api:      { color: '#f59e0b', label: 'API ROUTES', icon: '◈' },
  ai:       { color: '#a78bfa', label: 'AI SERVICES',icon: '✦' },
  db:       { color: '#34d399', label: 'DATABASE',   icon: '◰' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Node details (overview click → detail panel)
// ─────────────────────────────────────────────────────────────────────────────

type NodeDetail = {
  title: string;
  file?: string;
  description: string;
  tech: string[];
  details: string[];
};

const NODES: Record<string, NodeDetail> = {
  browser: {
    title: 'Browser / PWA',
    description: 'Client-side entry point. Supports PWA installation, push notifications via Service Worker, and voice capture via browser speech recognition.',
    tech: ['Service Worker (/sw.js)', 'Web Push API (VAPID)', 'SpeechRecognition API', 'PWA Manifest'],
    details: [
      'Registers sw.js on load → SW handles push notification display and click routing',
      'Notification clicks → postMessage to BrainClient → setTab + setReviewId / setTaskId',
      'SpeechRecognition (continuous mode) → streams text into capture input',
      'Can be installed to home screen (manifest.ts served at /manifest.webmanifest)',
    ],
  },
  brainclient: {
    title: 'BrainClient.tsx',
    file: 'components/BrainClient.tsx',
    description: 'The main hub component. Owns global captures[] and projects[] state, orchestrates the tabs and the settings page, handles auth, background sync, notification routing, and keyboard shortcuts.',
    tech: ['React 19 (useState, useCallback, useEffect)', 'Supabase client SDK', 'Next.js router'],
    details: [
      'Re-syncs captures on an interval and whenever the tab becomes visible (free realtime alternative)',
      'Selects CAPTURE_COLUMNS, never the 1024-float embedding column',
      'Routes SW postMessages: open-review → setTab("chat"), open-task → setTab("grow")',
      'Cmd+K shortcut → opens SearchOverlay modal; gear icon → SettingsTab',
      'Manages notification permission flow and VAPID push subscription',
    ],
  },
  capture_tab: {
    title: 'CaptureTab.tsx',
    file: 'components/CaptureTab.tsx',
    description: 'Create and browse all captures. Supports text, URL enrichment, continuous voice recording, and audio file upload.',
    tech: ['SpeechRecognition API', 'Groq audio transcription', 'FormData', 'File input'],
    details: [
      'URL auto-detected in input → sends source_url to POST body for enrichment',
      'Voice: browser SpeechRecognition continuous mode → live text in input field',
      'Audio file: FormData upload → /api/transcribe → transcript merged with typed text',
      'After save → POST /api/relate in the background ("finding connections…")',
      'Filter + sort: by type, project, starred, created date; export .md / .json',
    ],
  },
  chat_tab: {
    title: 'ChatTab.tsx',
    file: 'components/ChatTab.tsx',
    description: 'Conversational interface over the knowledge base. Works freely or with a pinned capture as primary context. Retrieval happens on the server (/api/chat).',
    tech: ['Vector RAG + reranker (server-side)', 'Chat history (last 6 turns)', 'Spaced repetition integration'],
    details: [
      'Sends { message, history, pinnedCapture? } — no client-side ranking',
      'Pinned capture always comes first in the model context',
      'Errors (e.g. free-tier rate limit) are shown as a chat message instead of failing silently',
      '"Mark Reviewed" → PATCH last_reviewed_at on pinned capture → removes from review queue',
    ],
  },
  search_tab: {
    title: 'SearchTab.tsx',
    file: 'components/SearchTab.tsx',
    description: 'RAG search: answers a question from the most relevant captures, found by vector search and a reranker.',
    tech: ['pgvector', 'Voyage rerank-2.5', 'Strict structured output'],
    details: [
      'Shows: synthesis text + the captures the answer drew on + 3 follow-up questions',
      'Follow-up question buttons → automatically trigger a new search',
      'Relevant captures can be opened in CaptureDetailModal',
    ],
  },
  graph_tab: {
    title: 'GraphTab.tsx',
    file: 'components/GraphTab.tsx',
    description: 'Interactive force-directed knowledge graph. Visualizes relations between captures (cosine similarity ≥ 0.71).',
    tech: ['Custom force simulation (no D3)', 'Canvas API', 'Pointer events (pan/zoom)', 'Batch relate'],
    details: [
      'Custom physics: repulsion between all nodes + spring attraction along related_ids edges',
      'Node size ∝ related_ids.length (more connections = bigger node)',
      'Pan/zoom via pointerdown + pointermove events on canvas',
      '"Batch relate" → /api/relate/batch rebuilds every edge from stored embeddings',
      'Filter nodes by project, type, or starred status',
    ],
  },
  growth_tab: {
    title: 'GrowthTab.tsx',
    file: 'components/GrowthTab.tsx',
    description: '52-week heatmap, streak, spaced repetition queue, task manager, weekly AI summary, and AI digest — all in a single collapsable-section layout.',
    tech: ['ISO week date math', 'Spaced repetition', 'LLM weekly summary', 'LLM digest', 'JSONB subtasks'],
    details: [
      '52-week GitHub-style heatmap + monthly day view toggle',
      'Streak: consecutive days with ≥1 capture',
      'Review queue: Idea/Learning captures not reviewed in 7 days',
      'Tasks: due_date, priority, subtasks stored as JSON array in capture.text',
      'Weekly summary: Mon–Sun → LLM analysis → upserted to summaries table',
      'AI Digest section: themes, momentum, highlights, insight, pending tasks, forgotten ideas',
    ],
  },
  digest_tab: {
    title: 'DigestTab.tsx',
    file: 'components/DigestTab.tsx',
    description: 'AI digest view, embedded as a collapsable section inside GrowthTab.',
    tech: ['gpt-oss-120b (Groq)', 'lib/digest.ts (shared with cron)', 'Supabase digest storage'],
    details: [
      'Digest: themes, momentum, highlights, insight, patterns, pendingTasks, forgottenIdeas, suggestion',
      'Same lib/digest.ts powers the button and the weekly cron, so both produce the same digest',
      'Stored in Supabase digests table — history browsable, regenerate on demand',
    ],
  },
  settings_tab: {
    title: 'SettingsTab.tsx',
    file: 'components/SettingsTab.tsx',
    description: 'Per-user settings, export, and data deletion. Every change is saved immediately (PUT /api/settings).',
    tech: ['user_settings table (RLS)', 'Optimistic update + rollback', 'Typed confirmation for delete'],
    details: [
      'Weekly digest on/off + day; review reminders: morning / afternoon / both / off; task reminders',
      'Reminder times shown in the viewer\'s local time (cron runs at 09:00 / 14:00 UTC)',
      'Default type / project used when AI categorization is unavailable',
      'Export .md / .json; delete all captures requires typing a confirmation phrase (checked again on the server)',
    ],
  },
  CaptureDetailModal: {
    title: 'CaptureDetailModal.tsx',
    file: 'components/CaptureDetailModal.tsx',
    description: 'Universal modal for viewing, editing, and deleting a capture. Used across ChatTab, GraphTab, SearchTab, and SearchOverlay.',
    tech: ['React portal pattern', 'PATCH /api/capture/[id]', 'Shared across 4 tabs'],
    details: [
      'Modes: view → edit → confirmDelete (state machine within modal)',
      'Edits re-embed the capture on the server, so search stays accurate',
      'Used by: ChatTab (pinned expand), GraphTab (node click), SearchTab (result expand), SearchOverlay (result expand)',
    ],
  },
  api_capture: {
    title: '/api/capture',
    file: 'app/api/capture/route.ts',
    description: 'Creates a new capture: enriches URLs, categorizes with an LLM, embeds with Voyage, and lets similar past captures vote on the project.',
    tech: ['gpt-oss-20b (Groq)', 'Voyage voyage-3.5-lite', 'kNN project vote', 'youtube-transcript pkg'],
    details: [
      'YouTube URL → full transcript; web URL → og:title + og:description',
      'lib/categorize.ts: strict JSON schema with enums → only valid types and existing projects; prompt lists project descriptions',
      'Embedding of title + text (best-effort: if Voyage is down the capture is still saved)',
      'kNN: if ≥ 3 of the 5 most similar captures share a project, it overrides the LLM (eval: kNN 75% vs LLM 63%)',
      'Falls back to the default type / project from settings when the LLM is unavailable',
    ],
  },
  api_chat: {
    title: '/api/chat',
    file: 'app/api/chat/route.ts',
    description: 'RAG chat: vector search + reranker pick the context, then the LLM answers conversationally.',
    tech: ['gpt-oss-120b (Groq)', 'pgvector', 'Voyage rerank-2.5', 'query_log'],
    details: [
      'Embed message → match_captures top 15 → rerank → best 8 (500 chars each) + pinned capture',
      'Fallbacks: rerank fails → vector order; vector search fails → most recent captures',
      'Every question is logged with retrieved ids and which fallback (if any) was used',
      'Only the current message is embedded — vague follow-ups retrieve poorly (query rewriting is on the roadmap)',
    ],
  },
  api_search: {
    title: '/api/search',
    file: 'app/api/search/route.ts',
    description: 'RAG search with synthesis: retrieves the most relevant captures, then the LLM answers with structured output.',
    tech: ['gpt-oss-120b (Groq)', 'pgvector + Voyage rerank', 'Strict JSON schema'],
    details: [
      'Embed query → match_captures top 20 → rerank → best 12, 1,000 chars each (fits the 8K tokens/min free tier)',
      'Returns { synthesis, relevantIds[≤8], followUpQuestions[3] }',
      'relevantIds is an enum of the ids actually sent, so the model cannot invent ids',
      'Retrieval eval: hit@1 83% (vector) → 100% (vector + rerank)',
    ],
  },
  api_relate: {
    title: '/api/relate',
    file: 'app/api/relate/route.ts',
    description: 'Links a capture to its most similar captures by cosine similarity, both ways. No LLM call.',
    tech: ['pgvector match_captures', 'Threshold 0.71 (measured)', 'Bidirectional array update'],
    details: [
      'Called by CaptureTab right after a save (does not block the save)',
      'Up to 6 nearest captures with similarity ≥ 0.71 become related',
      'Threshold chosen by F1 on 491 labelled pairs (LLM-as-judge, checked by hand)',
      'Writes related_ids on both captures → undirected graph',
    ],
  },
  api_relate_batch: {
    title: '/api/relate/batch',
    file: 'app/api/relate/batch/route.ts',
    description: 'Rebuilds the whole relation graph from stored embeddings, with the same rule as /api/relate.',
    tech: ['pgvector', 'Same threshold as single relate', 'Bulk update'],
    details: [
      'For every capture: nearest neighbours above the threshold, linked both ways',
      'Clears all related_ids, then writes the new adjacency',
      'No LLM — single and batch relate can never disagree',
    ],
  },
  api_transcribe: {
    title: '/api/transcribe',
    file: 'app/api/transcribe/route.ts',
    description: 'Transcribes uploaded audio files to text using Groq\'s Whisper model.',
    tech: ['Groq SDK', 'whisper-large-v3', 'FormData multipart'],
    details: [
      'Accepts audio/* file via multipart FormData POST',
      'Returns { transcript: string }',
      'CaptureTab merges transcript with any text already typed in the input',
    ],
  },
  api_summary: {
    title: '/api/summary/weekly',
    file: 'app/api/summary/weekly/route.ts',
    description: 'Generates a weekly AI summary of captures. Upserted to DB for week-over-week history.',
    tech: ['gpt-oss-120b (Groq)', 'Strict JSON schema', 'Supabase upsert'],
    details: [
      'Fetches all captures from Monday–Sunday of the current week',
      'LLM returns: { highlights, themes, insight, momentum } (momentum is an enum)',
      'Upserted on unique key (user_id, week_start) — re-running the same week overwrites',
    ],
  },
  llm: {
    title: 'Groq · gpt-oss (lib/llm.ts)',
    file: 'lib/llm.ts',
    description: 'All LLM calls go through one provider-agnostic layer: generateText and generateObject. Switching provider or model is a change in this file only.',
    tech: ['groq-sdk', 'gpt-oss-120b / gpt-oss-20b', 'Strict structured outputs', 'Free tier: 8K tokens/min'],
    details: [
      'generateObject: json_schema with strict: true — constrained decoding, output always matches the schema',
      'gpt-oss is a reasoning model: max tokens include hidden reasoning; reasoning_effort "low" keeps it short',
      'gpt-oss-20b for categorization (separate rate-limit bucket), gpt-oss-120b for everything else',
      'Moved from Anthropic Claude to Groq when credits ran out — every route kept working unchanged',
    ],
  },
  voyage: {
    title: 'Voyage AI',
    file: 'lib/embeddings.ts',
    description: 'Embeddings for semantic search, relations and kNN, plus a reranker for the final ordering.',
    tech: ['voyage-3.5-lite (1024 dim, multilingual)', 'rerank-2.5', 'input_type: query / document'],
    details: [
      'Picked for multilingual quality — notes mix Serbian and English',
      'Embedding = title + first 8,000 chars; questions use input_type "query"',
      'Reranker (cross-encoder) reads question + candidate together → hit@1 83% → 100%',
      'Daily cron re-embeds captures saved while Voyage was unavailable (self-healing)',
    ],
  },
  groq: {
    title: 'Groq Whisper',
    description: 'Fast speech-to-text via Groq. Used for audio file transcription in /api/transcribe.',
    tech: ['groq-sdk', 'whisper-large-v3 model'],
    details: [
      'Accepts: wav, mp3, m4a, webm audio formats',
      'Not used for live voice capture — that uses browser SpeechRecognition API directly',
    ],
  },
  supabase: {
    title: 'Supabase',
    description: 'PostgreSQL with pgvector, auth (Google OAuth), and row-level security on every table.',
    tech: ['PostgreSQL + pgvector (HNSW)', 'Google OAuth (Supabase Auth)', 'Row Level Security', '@supabase/ssr'],
    details: [
      'Tables: captures (+ embedding vector(1024)), projects (+ description), user_settings, query_log, digests, summaries, push_subscriptions',
      'match_captures(): cosine similarity search, filtered by user_id; RLS still applies (anon gets 0 rows)',
      'RLS policy: every table filtered by auth.uid() = user_id',
      'Server client (@supabase/ssr) in API routes; service client only in cron jobs and data deletion',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Data flows
// ─────────────────────────────────────────────────────────────────────────────

type FlowStep = {
  layer: LayerKey;
  component: string;
  action: string;
  data?: string;
  note?: string;
};

const FLOWS: Record<FlowId, { title: string; description: string; steps: FlowStep[] }> = {
  capture: {
    title: 'Save Capture',
    description: 'Text / voice / URL → LLM categorization → embedding → kNN project vote → DB save → background relate',
    steps: [
      { layer: 'frontend', component: 'CaptureTab', action: 'User submits text (or voice transcript / audio upload / URL)', data: '{ text, due_date?, priority?, source_url? }' },
      { layer: 'api', component: '/api/capture', action: 'Enrich URL if detected in text', note: 'YouTube → full transcript; web page → og:title + og:description' },
      { layer: 'ai', component: 'Groq gpt-oss-20b', action: 'Categorize: type, project, title (strict JSON schema)', data: '← { type: enum, project: enum of existing projects, title }', note: 'Prompt lists each project with its description; falls back to settings defaults if the LLM is unavailable' },
      { layer: 'ai', component: 'Voyage AI', action: 'Embed title + text (1024 dims)', note: 'Best-effort: the capture is saved even if this fails; the daily cron fills it in later' },
      { layer: 'db', component: 'Supabase · pgvector', action: 'kNN: 5 most similar captures vote on the project', note: '≥ 3 of 5 agree → their project wins over the LLM (the user\'s own filing habit)' },
      { layer: 'db', component: 'Supabase', action: 'INSERT INTO captures', data: '{ text, title, type, project, embedding, related_ids: [] }' },
      { layer: 'frontend', component: 'CaptureTab', action: 'Show the capture + "finding connections…", then POST /api/relate', note: 'Relate runs in the background and never blocks the save' },
      { layer: 'db', component: 'Supabase · pgvector', action: 'Link to up to 6 captures with similarity ≥ 0.71, both ways', note: 'No LLM call — threshold measured by F1 on 491 labelled pairs' },
    ],
  },
  chat: {
    title: 'Send Chat Message',
    description: 'Message → vector search → reranker → LLM answer with the best captures as context',
    steps: [
      { layer: 'frontend', component: 'ChatTab', action: 'User types message (optionally with a pinned capture)', data: '{ message, history[≤6], pinnedCapture? }' },
      { layer: 'ai', component: 'Voyage AI', action: 'Embed the message (input_type: query)' },
      { layer: 'db', component: 'Supabase · pgvector', action: 'match_captures → 15 nearest captures (pinned one excluded)' },
      { layer: 'ai', component: 'Voyage rerank-2.5', action: 'Re-order the 15 candidates, keep the best 8', note: 'If rerank fails → vector order; if vector search fails → most recent captures' },
      { layer: 'db', component: 'Supabase', action: 'Log question, retrieved ids and fallback to query_log' },
      { layer: 'ai', component: 'Groq gpt-oss-120b', action: 'Answer from pinned capture + 8 captures (500 chars each) + last 6 turns' },
      { layer: 'frontend', component: 'ChatTab', action: 'Render the reply, or the error as a chat message' },
    ],
  },
  search: {
    title: 'RAG Search',
    description: 'Query → vector search → reranker → LLM synthesis with structured output',
    steps: [
      { layer: 'frontend', component: 'SearchTab', action: 'User enters query', data: '{ query: string }' },
      { layer: 'ai', component: 'Voyage AI', action: 'Embed the query (input_type: query)' },
      { layer: 'db', component: 'Supabase · pgvector', action: 'match_captures → 20 nearest captures' },
      { layer: 'ai', component: 'Voyage rerank-2.5', action: 'Re-order the 20 candidates, keep the best 12', note: 'Eval: hit@1 83% → 100% with the reranker' },
      { layer: 'db', component: 'Supabase', action: 'Log query, retrieved ids and fallback to query_log' },
      { layer: 'ai', component: 'Groq gpt-oss-120b', action: 'Synthesize an answer from 12 captures (1,000 chars each)', data: '← { synthesis, relevantIds (enum of sent ids), followUpQuestions }' },
      { layer: 'frontend', component: 'SearchTab', action: 'Render synthesis + relevant captures + follow-up buttons', note: 'Follow-up clicks trigger a new search' },
    ],
  },
  relate: {
    title: 'Batch Relate (Graph)',
    description: 'Rebuild every relation from stored embeddings → force graph re-renders with new edges',
    steps: [
      { layer: 'frontend', component: 'GraphTab', action: 'User clicks "batch relate"' },
      { layer: 'api', component: '/api/relate/batch', action: 'Load all captures that have an embedding' },
      { layer: 'db', component: 'Supabase · pgvector', action: 'For each capture: 6 nearest with similarity ≥ 0.71', note: 'Same rule as single relate — no LLM, so the two can never disagree' },
      { layer: 'db', component: 'Supabase', action: 'Clear related_ids, write the new undirected adjacency' },
      { layer: 'frontend', component: 'GraphTab', action: 'Force simulation restarts with the new edges', note: 'Node sizes update to reflect connection counts' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// File tree
// ─────────────────────────────────────────────────────────────────────────────

type FileDetail = {
  description: string;
  exports?: string[];
  imports?: string[];
  usedBy?: string[];
};

type FileNode = {
  name: string;
  type: 'file' | 'dir';
  children?: FileNode[];
  detail?: FileDetail;
};

const FILE_TREE: FileNode[] = [
  {
    name: 'app', type: 'dir', children: [
      {
        name: 'api', type: 'dir', children: [
          { name: 'capture/route.ts', type: 'file', detail: { description: 'Enrich URL → LLM categorize → embed → kNN project vote → DB insert', exports: ['POST'], imports: ['lib/categorize', 'lib/embeddings', 'lib/settings', 'youtube-transcript'], usedBy: ['CaptureTab'] } },
          { name: 'capture/[id]/route.ts', type: 'file', detail: { description: 'Update (re-embeds when text changes) or delete a capture', exports: ['PUT', 'PATCH', 'DELETE'], imports: ['lib/embeddings', 'lib/captures'], usedBy: ['CaptureTab', 'ChatTab', 'GrowthTab', 'CaptureDetailModal'] } },
          { name: 'chat/route.ts', type: 'file', detail: { description: 'RAG chat: embed → pgvector → rerank → LLM answer; logs the query', exports: ['POST'], imports: ['lib/embeddings', 'lib/llm', 'lib/queryLog'], usedBy: ['ChatTab'] } },
          { name: 'search/route.ts', type: 'file', detail: { description: 'RAG search: embed → pgvector → rerank → structured LLM synthesis; logs the query', exports: ['POST'], imports: ['lib/embeddings', 'lib/llm', 'lib/queryLog'], usedBy: ['SearchTab'] } },
          { name: 'relate/route.ts', type: 'file', detail: { description: 'Link one capture to similar ones (cosine ≥ 0.71), both ways', exports: ['POST'], imports: ['lib/embeddings'], usedBy: ['CaptureTab (after save)'] } },
          { name: 'relate/batch/route.ts', type: 'file', detail: { description: 'Rebuild all relations from stored embeddings', exports: ['POST'], imports: ['lib/embeddings'], usedBy: ['GraphTab'] } },
          { name: 'projects/route.ts', type: 'file', detail: { description: 'List all projects (GET) and create new project (POST)', exports: ['GET', 'POST'], imports: ['lib/supabase/server'], usedBy: ['BrainClient', 'CaptureTab'] } },
          { name: 'transcribe/route.ts', type: 'file', detail: { description: 'Audio file → Groq whisper-large-v3 → transcript string', exports: ['POST'], imports: ['groq-sdk'], usedBy: ['CaptureTab'] } },
          { name: 'summary/weekly/route.ts', type: 'file', detail: { description: 'Mon–Sun captures → structured LLM analysis → summaries upsert', exports: ['GET', 'POST'], imports: ['lib/llm'], usedBy: ['GrowthTab'] } },
          { name: 'digest/route.ts', type: 'file', detail: { description: 'Digest history (GET) and on-demand generation via lib/digest (POST)', exports: ['GET', 'POST'], imports: ['lib/digest', 'lib/llm'], usedBy: ['GrowthTab (DigestTab section)'] } },
          { name: 'settings/route.ts', type: 'file', detail: { description: 'Read / validate and upsert user settings', exports: ['GET', 'PUT'], imports: ['lib/settings'], usedBy: ['SettingsTab'] } },
          { name: 'account/data/route.ts', type: 'file', detail: { description: 'Delete all captures, digests, summaries and query log (requires the confirmation phrase)', exports: ['DELETE'], imports: ['lib/settings', 'lib/supabase/server'], usedBy: ['SettingsTab'] } },
          { name: 'push/subscribe/route.ts', type: 'file', detail: { description: 'Store VAPID Web Push subscription object in push_subscriptions table', exports: ['POST'], imports: ['lib/supabase/server'], usedBy: ['BrainClient'] } },
          { name: 'cron/review-reminder/route.ts', type: 'file', detail: { description: 'Cron 09:00 + 14:00 UTC: review reminders for users who chose that run; weekly digest on each user\'s chosen day (idempotent)', exports: ['GET'], imports: ['web-push', 'lib/settings', 'lib/digest'], usedBy: ['Vercel Cron'] } },
          { name: 'cron/task-due/route.ts', type: 'file', detail: { description: 'Cron 10:00 UTC: push for tasks due tomorrow; embeds captures that are missing an embedding', exports: ['GET'], imports: ['web-push', 'lib/settings', 'lib/embeddings'], usedBy: ['Vercel Cron'] } },
          { name: 'auth/callback/route.ts', type: 'file', detail: { description: 'Google OAuth callback: exchange PKCE code for session cookie', exports: ['GET'], imports: ['lib/supabase/server'], usedBy: ['Supabase Auth redirect'] } },
        ],
      },
      { name: 'brain/page.tsx', type: 'file', detail: { description: 'Server component: verifies auth, fetches initial captures (CAPTURE_COLUMNS, no embeddings), renders BrainClient', exports: ['default (page)'], imports: ['lib/supabase/server', 'lib/captures', 'components/BrainClient'], usedBy: ['Next.js router (/brain)'] } },
      { name: 'login/page.tsx', type: 'file', detail: { description: 'Login page with Google OAuth button. Redirects to /brain on success.', exports: ['default (page)'], imports: ['lib/supabase/server'], usedBy: ['Next.js router (/login)'] } },
      { name: 'layout.tsx', type: 'file', detail: { description: 'Root layout: JetBrains Mono font, CSS variables, PWA metadata', exports: ['default', 'metadata'], imports: ['next/font/google', 'app/globals.css'], usedBy: ['Next.js (wraps all pages)'] } },
      { name: 'manifest.ts', type: 'file', detail: { description: 'PWA manifest: app name, icons, display:standalone, theme color', exports: ['default'], imports: [], usedBy: ['Next.js (auto-serves /manifest.webmanifest)'] } },
      { name: 'globals.css', type: 'file', detail: { description: 'Tailwind imports, CSS custom properties, scrollbar styling, global utility classes', exports: [], imports: [], usedBy: ['app/layout.tsx'] } },
    ],
  },
  {
    name: 'components', type: 'dir', children: [
      { name: 'BrainClient.tsx', type: 'file', detail: { description: 'Hub: owns captures/projects state, tabs + settings, auth, background sync, SW notification routing, Cmd+K', exports: ['default', 'Capture (type)', 'Project (type)', 'TYPE_COLORS'], imports: ['lib/supabase/client', 'lib/captures', 'All tab components', 'SearchOverlay'], usedBy: ['app/brain/page.tsx'] } },
      { name: 'CaptureTab.tsx', type: 'file', detail: { description: 'Create + browse captures: text/voice/URL/audio input, templates, filter/sort/edit/delete, export, triggers relate', exports: ['default'], imports: ['BrainClient (types)', 'lib/export'], usedBy: ['BrainClient'] } },
      { name: 'ChatTab.tsx', type: 'file', detail: { description: 'Chat UI: pinned context mode, conversation history, mark-reviewed button, error messages', exports: ['default'], imports: ['BrainClient (Capture type)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'SearchTab.tsx', type: 'file', detail: { description: 'Search UI: query → synthesis → relevant capture cards → follow-up question buttons', exports: ['default'], imports: ['BrainClient (Capture type)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'GraphTab.tsx', type: 'file', detail: { description: 'Force-directed knowledge graph: custom physics sim, canvas pan/zoom, batch relate, project/type filters', exports: ['default'], imports: ['BrainClient (types)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'GrowthTab.tsx', type: 'file', detail: { description: 'Heatmap, streak, review queue, tasks, weekly summary and AI digest as collapsable sections', exports: ['default'], imports: ['BrainClient (Capture type)'], usedBy: ['BrainClient'] } },
      { name: 'DigestTab.tsx', type: 'file', detail: { description: 'AI digest view, embedded as a section inside GrowthTab', exports: ['default'], imports: ['BrainClient (Capture type)'], usedBy: ['GrowthTab'] } },
      { name: 'SettingsTab.tsx', type: 'file', detail: { description: 'Settings: notifications, default type/project, export, delete all captures', exports: ['default'], imports: ['lib/settings', 'lib/export'], usedBy: ['BrainClient'] } },
      { name: 'CaptureDetailModal.tsx', type: 'file', detail: { description: 'Universal view/edit/delete modal shared across ChatTab, GraphTab, SearchTab, and SearchOverlay', exports: ['default'], imports: ['BrainClient (Capture type)'], usedBy: ['ChatTab', 'GraphTab', 'SearchTab', 'SearchOverlay'] } },
      { name: 'SearchOverlay.tsx', type: 'file', detail: { description: 'Cmd+K quick-search modal: instant client-side filter (all words must match)', exports: ['default'], imports: ['BrainClient (types)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'ArchitectureTab.tsx', type: 'file', detail: { description: 'This page: Overview, Data Flows, File Tree, AI Pipeline views', exports: ['default'], imports: [], usedBy: ['BrainClient', 'app/arch'] } },
    ],
  },
  {
    name: 'lib', type: 'dir', children: [
      { name: 'llm.ts', type: 'file', detail: { description: 'Provider-agnostic LLM layer: generateText / generateObject (strict JSON schema). Currently Groq gpt-oss.', exports: ['generateText', 'generateObject', 'isRateLimited', 'MODELS'], imports: ['groq-sdk'], usedBy: ['chat, search, summary, digest routes', 'lib/categorize', 'lib/digest'] } },
      { name: 'embeddings.ts', type: 'file', detail: { description: 'Voyage embeddings + reranker, relate threshold, self-healing fill of missing embeddings', exports: ['embed', 'embedOne', 'rerank', 'fillMissingEmbeddings', 'RELATE_THRESHOLD'], imports: [], usedBy: ['capture, chat, search, relate routes', 'cron/task-due'] } },
      { name: 'categorize.ts', type: 'file', detail: { description: 'LLM categorization with project descriptions + kNN project vote; shared with the eval', exports: ['categorizeCapture', 'projectFromNeighbors'], imports: ['lib/llm'], usedBy: ['/api/capture', 'eval/categorize-eval.mts'] } },
      { name: 'digest.ts', type: 'file', detail: { description: 'Digest generation (numbered captures instead of UUIDs to save tokens); shared by button and cron', exports: ['createDigest'], imports: ['lib/llm'], usedBy: ['/api/digest', 'cron/review-reminder'] } },
      { name: 'settings.ts', type: 'file', detail: { description: 'Settings types, defaults, validation, getSettings', exports: ['getSettings', 'parseSettings', 'DEFAULT_SETTINGS'], imports: [], usedBy: ['/api/settings', 'cron jobs', '/api/capture', 'SettingsTab'] } },
      { name: 'queryLog.ts', type: 'file', detail: { description: 'Log search/chat questions, retrieved ids and fallback stage (never throws)', exports: ['logQuery'], imports: [], usedBy: ['/api/search', '/api/chat'] } },
      { name: 'captures.ts', type: 'file', detail: { description: 'CAPTURE_COLUMNS — everything except the embedding vector', exports: ['CAPTURE_COLUMNS'], imports: [], usedBy: ['brain/page', 'BrainClient', 'capture routes'] } },
      { name: 'export.ts', type: 'file', detail: { description: 'Download captures as Markdown or JSON', exports: ['exportJSON', 'exportMarkdown'], imports: [], usedBy: ['CaptureTab', 'SettingsTab'] } },
      {
        name: 'supabase', type: 'dir', children: [
          { name: 'client.ts', type: 'file', detail: { description: 'createBrowserClient — client-side Supabase instance (BrainClient sync)', exports: ['createClient'], imports: ['@supabase/ssr'], usedBy: ['BrainClient'] } },
          { name: 'server.ts', type: 'file', detail: { description: 'createServerClient (cookies, RLS) and createServiceClient (cron jobs, data deletion)', exports: ['createClient', 'createServiceClient'], imports: ['@supabase/ssr', 'next/headers'], usedBy: ['All API routes', 'Server pages', 'middleware.ts'] } },
        ],
      },
    ],
  },
  {
    name: 'eval', type: 'dir', children: [
      { name: 'retrieval-eval.mjs', type: 'file', detail: { description: 'Golden dataset (26 questions) → keyword / BM25 / vector / hybrid / rerank; hit@1, hit@3, recall@5, MRR', exports: [], imports: ['eval/ranking.mjs'], usedBy: ['node (manual runs)'] } },
      { name: 'categorize-eval.mts', type: 'file', detail: { description: 'Categorization accuracy vs stored labels; LLM, few-shot, and the production kNN rule', exports: [], imports: ['lib/categorize', 'lib/llm'], usedBy: ['npx tsx (manual runs)'] } },
      { name: 'README.md', type: 'file', detail: { description: 'Methodology and dated results log for every eval run', exports: [], imports: [], usedBy: ['humans'] } },
    ],
  },
  {
    name: 'supabase', type: 'dir', children: [
      { name: 'pgvector-setup.sql', type: 'file', detail: { description: 'vector extension, embedding column, HNSW index, match_captures()', exports: [], imports: [], usedBy: ['Supabase SQL editor (once)'] } },
      { name: 'settings-and-query-log.sql', type: 'file', detail: { description: 'user_settings and query_log tables with RLS', exports: [], imports: [], usedBy: ['Supabase SQL editor (once)'] } },
      { name: 'project-descriptions.sql', type: 'file', detail: { description: 'projects.description column + descriptions for the categorization prompt', exports: [], imports: [], usedBy: ['Supabase SQL editor (once)'] } },
    ],
  },
  { name: 'scripts/backfill-embeddings.mjs', type: 'file', detail: { description: 'One-off backfill of embeddings, batched to respect Voyage rate limits', exports: [], imports: ['@supabase/supabase-js'], usedBy: ['node (manual run)'] } },
  { name: 'middleware.ts', type: 'file', detail: { description: 'Auth guard: unauthenticated requests to /brain → redirect to /login', exports: ['middleware', 'config (matcher)'], imports: ['lib/supabase/server', 'next/server'], usedBy: ['Next.js (auto-applied to all matched routes)'] } },
  { name: 'public/sw.js', type: 'file', detail: { description: 'Service Worker: displays push notifications; routes clicks via postMessage back to the React app', exports: [], imports: [], usedBy: ['BrainClient (navigator.serviceWorker.register("/sw.js"))'] } },
  { name: 'vercel.json', type: 'file', detail: { description: 'Cron jobs: review-reminder at 09:00 and 14:00 UTC, task-due at 10:00 UTC', exports: [], imports: [], usedBy: ['Vercel deployment platform'] } },
  { name: 'next.config.ts', type: 'file', detail: { description: 'Next.js build configuration (minimal)', exports: ['default'], imports: [], usedBy: ['Next.js build process'] } },
];

// ─────────────────────────────────────────────────────────────────────────────
// AI pipeline steps
// ─────────────────────────────────────────────────────────────────────────────

type PipelineStep = {
  label: string;
  type: 'input' | 'system' | 'user' | 'response' | 'parse' | 'store';
  content: string;
};

const AI_PIPELINES: Record<AIFlowId, {
  title: string;
  route: string;
  model: string;
  maxTokens: number | null;
  description: string;
  steps: PipelineStep[];
}> = {
  categorize: {
    title: 'Capture Categorization',
    route: '/api/capture',
    model: 'gpt-oss-20b + kNN',
    maxTokens: 600,
    description: 'Type, project and title for every new capture: LLM with a strict schema, then similar past captures can overrule the project',
    steps: [
      { label: 'Context gathered', type: 'input', content: `capture text (first 4,000 chars)

URL enrichment (if URL detected):
  YouTube → transcript via youtube-transcript
  Web page → og:title + og:description

DB: the user's projects with their descriptions` },
      { label: 'System prompt', type: 'system', content: `You categorize entries in a personal knowledge base.
- type: "Learning" = something learned or explained; "Idea" = an idea or plan
  to maybe do; "Task" = a concrete to-do; "Link" = mainly a saved URL/resource;
  "Note" = personal facts, logs, status updates
- project: the project this belongs to:
  - FON: fakultet kao takav: study planovi, predmeti, kolokvijumi, diplomski
  - Software Engineering: opšte programiranje van projekata ...
  - AI Engineering: AI i ML: LLM-ovi, RAG, agenti ...
  - ... (one line per project, from projects.description)
- title: short and descriptive, max 60 chars, same language as the text` },
      { label: 'Schema (strict)', type: 'user', content: `response_format: json_schema, strict: true   // constrained decoding
{
  type:    { enum: ["Idea","Link","Task","Learning","Note"] },
  project: { enum: [...existing project names] },   // can't invent a project
  title:   { type: "string" }
}
reasoning_effort: "low"   // gpt-oss thinks before answering; keep it short` },
      { label: 'Model response', type: 'response', content: `{"type": "Learning", "project": "Software Engineering", "title": "Mockito: doThrow za void metode"}` },
      { label: 'Embed → kNN vote → store', type: 'store', content: `embedding = Voyage(title + text)

// the user's own filing habit beats the LLM's guess
neighbours = match_captures(embedding, 5)
if ≥ 3 of 5 share a project → use it

INSERT INTO captures { text, title, type, project, embedding }

Eval (120 captures): LLM 63% · kNN 75% · this rule 73%
(kept over plain kNN: kNN can't pick a project with no captures yet)` },
    ],
  },
  chat: {
    title: 'RAG Chat',
    route: '/api/chat',
    model: 'gpt-oss-120b',
    maxTokens: 1500,
    description: 'Vector search + reranker pick the context, the LLM answers conversationally',
    steps: [
      { label: 'Retrieval', type: 'input', content: `Receive: { message, history[≤6], pinnedCapture? }

q = Voyage.embed(message, input_type: "query")
candidates = match_captures(q, 15, exclude: pinned)
context = Voyage.rerank(message, candidates) → best 8

fallback: rerank fails → vector order
          vector fails → 8 most recent captures
log: query_log { query, retrieved_ids, fallback }` },
      { label: 'System prompt', type: 'system', content: `You are a helpful assistant for a personal knowledge base.
Answer concisely based on the user's captures, in the language the
user writes in. If the answer isn't in the captures, say so briefly.

[pinned capture, up to 2,000 chars — "this" / "it" means this one]

Additional captures from their knowledge base:
[type][project] title: first 500 chars   × 8` },
      { label: 'Messages', type: 'user', content: `[
  ...last 6 turns of history,
  { role: "user", content: message }
]` },
      { label: 'Model response', type: 'response', content: `Plain text answer (no schema).
Rate limit → { error: "AI is busy (free tier limit)…" }, shown in the chat.` },
      { label: 'Display', type: 'parse', content: `Appended to local chat history in ChatTab.

"Mark Reviewed" on a pinned capture:
  PATCH /api/capture/{id}  { last_reviewed_at: now }` },
    ],
  },
  search: {
    title: 'RAG Search',
    route: '/api/search',
    model: 'gpt-oss-120b',
    maxTokens: 2500,
    description: 'Answers a question from the 12 most relevant captures, with a strict output schema',
    steps: [
      { label: 'Retrieval', type: 'input', content: `q = Voyage.embed(query, input_type: "query")
candidates = match_captures(q, 20)          // pgvector, cosine
captures = Voyage.rerank(query, candidates) → best 12

catalogue = "[id] [type/project] title: first 1,000 chars"  × 12
// 12 × 1,000 chars ≈ 4K tokens → fits Groq's 8K tokens/min

Retrieval eval: hit@1 vector 83% → vector + rerank 100%` },
      { label: 'System prompt', type: 'system', content: `You are a personal knowledge assistant. Given the user's knowledge
captures and a query, synthesize a thoughtful answer drawing from their
captures. Answer in the language of the query.
- synthesis: 2-4 paragraphs
- relevantIds: ids of the most relevant captures (max 8), most relevant first
- followUpQuestions: 3 follow-up questions` },
      { label: 'Schema (strict)', type: 'user', content: `{
  synthesis:         { type: "string" },
  relevantIds:       { items: { enum: [...ids actually sent] } },  // no invented ids
  followUpQuestions: { items: { type: "string" } }
}` },
      { label: 'Model response', type: 'response', content: `{
  "synthesis": "Kada testirate void metodu koja treba da baci izuzetak...",
  "relevantIds": ["0bf22ca1-…", "13f3aebb-…"],
  "followUpQuestions": ["…", "…", "…"]
}` },
      { label: 'Render', type: 'parse', content: `→ synthesis at the top
→ relevant captures as cards (open in CaptureDetailModal)
→ 3 follow-up buttons: onClick → new search` },
    ],
  },
  relate: {
    title: 'Semantic Relate',
    route: '/api/relate',
    model: 'voyage-3.5-lite + pgvector',
    maxTokens: null,
    description: 'Links captures by embedding similarity — no LLM call (it used to be an LLM call over the 50 most recent captures)',
    steps: [
      { label: 'Embedding', type: 'input', content: `target.embedding  (stored at save time; computed now if missing)` },
      { label: 'Similarity search', type: 'system', content: `match_captures(target.embedding, 6, exclude: target)
→ [{ id, similarity }]   // cosine similarity, 0..1` },
      { label: 'Threshold (measured, not guessed)', type: 'user', content: `keep similarity ≥ 0.71

How 0.71 was picked:
  491 candidate pairs labelled related / unrelated (LLM-as-judge,
  checked by hand on 20 pairs: 17/20 agreement)
  best F1 at 0.71 → precision 70%, recall 82%
Capture↔capture scores run much higher than question↔capture,
so search doesn't reuse this threshold.` },
      { label: 'Result', type: 'response', content: `["abc123…", "def456…"]   // or [] if nothing is close enough` },
      { label: 'Bidirectional DB update', type: 'store', content: `target.related_ids = relatedIds
for each related capture:
  related.related_ids += target.id   // undirected graph

Batch relate (/api/relate/batch) applies the same rule to every capture.` },
    ],
  },
  summary: {
    title: 'Weekly Summary',
    route: '/api/summary/weekly',
    model: 'gpt-oss-120b',
    maxTokens: 1500,
    description: 'Analyzes the week\'s captures; the digest (lib/digest.ts) follows the same pattern',
    steps: [
      { label: 'Weekly data fetch', type: 'input', content: `SELECT title, text, type, project FROM captures
 WHERE user_id = $uid
   AND created_at >= monday AND created_at < next monday

catalogue = "[type][project] title: first 80 chars"  per capture` },
      { label: 'System prompt', type: 'system', content: `You are a personal knowledge analyst. Analyze this week's captures.
Keep all strings short, in the language most captures are written in.
- highlights: 3-4 most notable things captured
- themes: 2-3 main themes
- insight: one key observation about this week
- momentum: based on quantity and variety of captures` },
      { label: 'Schema (strict)', type: 'user', content: `{
  highlights: string[],
  themes:     string[],
  insight:    string,
  momentum:   { enum: ["high", "medium", "low"] }
}` },
      { label: 'Model response', type: 'response', content: `{
  "highlights": ["…"],
  "themes": ["testiranje u Javi", "RAG"],
  "insight": "…",
  "momentum": "medium"
}` },
      { label: 'Upsert → display history', type: 'store', content: `INSERT INTO summaries (user_id, week_start, content)
ON CONFLICT (user_id, week_start) DO UPDATE

Digest (lib/digest.ts): 60 captures, numbered 0..59 instead of UUIDs
(~20 tokens per UUID saved), model returns indices → mapped back to ids.` },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[11px] font-mono px-2 py-0.5 rounded border"
      style={{ color, borderColor: `${color}44`, backgroundColor: `${color}11` }}
    >
      {label}
    </span>
  );
}

function SectionLabel({ title, color }: { title: string; color: string }) {
  return (
    <div className="text-[10px] font-mono font-bold tracking-widest" style={{ color }}>
      {title}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview view
// ─────────────────────────────────────────────────────────────────────────────

function OverviewView({
  selectedNode,
  onSelectNode,
}: {
  selectedNode: string | null;
  onSelectNode: (id: string) => void;
}) {
  const detail = selectedNode ? NODES[selectedNode] : null;

  function NodeBox({
    id, label, sub, layer, small = false,
  }: { id: string; label: string; sub?: string; layer: LayerKey; small?: boolean }) {
    const c = LAYER[layer];
    const selected = selectedNode === id;
    return (
      <button
        onClick={() => onSelectNode(id)}
        className="rounded border text-left transition-all duration-150"
        style={{
          padding: small ? '4px 8px' : '8px 12px',
          borderColor: selected ? c.color : `${c.color}44`,
          backgroundColor: selected ? `${c.color}20` : `${c.color}0a`,
          boxShadow: selected ? `0 0 14px ${c.color}30` : 'none',
        }}
      >
        <div className="text-xs font-mono" style={{ color: c.color }}>{label}</div>
        {sub && !small && <div className="text-[10px] text-slate-400 mt-0.5 font-mono leading-tight">{sub}</div>}
      </button>
    );
  }

  function LayerRow({ layer, children }: { layer: LayerKey; children: ReactNode }) {
    const c = LAYER[layer];
    return (
      <div
        className="rounded-lg border p-3 space-y-2"
        style={{ borderColor: `${c.color}20`, backgroundColor: `${c.color}05` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color: c.color }}>
            {c.icon} {c.label}
          </span>
          <div className="flex-1 h-px" style={{ background: `${c.color}20` }} />
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    );
  }

  function Connector({ from, to }: { from: LayerKey; to: LayerKey }) {
    const cf = LAYER[from].color;
    const ct = LAYER[to].color;
    return (
      <div className="flex justify-center gap-10 py-0.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex flex-col items-center">
            <div className="w-px h-2" style={{ background: `linear-gradient(to bottom, ${cf}50, ${ct}50)` }} />
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: ct,
                animation: `arch-flow 1.8s ease-in-out infinite ${i * 0.6}s`,
              }}
            />
            <div className="w-px h-2" style={{ background: `linear-gradient(to bottom, ${ct}50, ${ct}20)` }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <LayerRow layer="frontend">
        <NodeBox id="browser" label="Browser / PWA" sub="PWA · Push · Voice" layer="frontend" />
        <span className="text-muted self-center text-xs">→</span>
        <NodeBox id="brainclient" label="BrainClient" sub="Hub · Sync · Auth" layer="frontend" />
        <span className="text-muted self-center text-xs">→</span>
        <div
          className="flex flex-wrap gap-1.5 rounded-md p-1.5"
          style={{ border: '1px dashed #60a5fa22' }}
        >
          <span className="text-[10px] text-muted/50 self-center font-mono mr-0.5">tabs:</span>
          {(['capture_tab', 'chat_tab', 'search_tab', 'graph_tab', 'growth_tab', 'digest_tab', 'settings_tab'] as const).map(id => (
            <NodeBox key={id} id={id} label={id.replace('_tab', '')} layer="frontend" small />
          ))}
        </div>
      </LayerRow>

      <Connector from="frontend" to="api" />

      <LayerRow layer="api">
        {[
          { id: 'api_capture',      label: '/api/capture',       sub: 'categorize → embed → kNN' },
          { id: 'api_chat',         label: '/api/chat',          sub: 'vector → rerank → reply' },
          { id: 'api_search',       label: '/api/search',        sub: 'vector → rerank → synthesis' },
          { id: 'api_relate',       label: '/api/relate',        sub: 'cosine ≥ 0.71' },
          { id: 'api_relate_batch', label: '/api/relate/batch',  sub: 'rebuild graph' },
          { id: 'api_transcribe',   label: '/api/transcribe',    sub: 'Audio → text' },
          { id: 'api_summary',      label: '/api/summary/weekly',sub: 'Weekly analysis' },
        ].map(n => (
          <NodeBox key={n.id} id={n.id} label={n.label} sub={n.sub} layer="api" />
        ))}
      </LayerRow>

      <Connector from="api" to="ai" />

      <LayerRow layer="ai">
        <NodeBox id="llm" label="Groq · gpt-oss" sub="Categorize · Chat · Search · Digest · Summary" layer="ai" />
        <NodeBox id="voyage" label="Voyage AI" sub="Embeddings · Rerank" layer="ai" />
        <NodeBox id="groq" label="Groq Whisper" sub="Audio transcription" layer="ai" />
      </LayerRow>

      <Connector from="ai" to="db" />

      <LayerRow layer="db">
        <NodeBox
          id="supabase"
          label="Supabase · PostgreSQL"
          sub="captures + pgvector · projects · settings · query_log · digests · summaries · Google OAuth · RLS"
          layer="db"
        />
      </LayerRow>

      {detail ? (
        <div
          className="mt-3 rounded-lg border p-4 space-y-3 animate-fade-in"
          style={{ borderColor: '#1a2332', backgroundColor: '#0d1117' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-mono text-text font-bold">{detail.title}</div>
              {detail.file && (
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{detail.file}</div>
              )}
            </div>
            <button
              onClick={() => onSelectNode(selectedNode!)}
              className="text-muted hover:text-text text-xs font-mono shrink-0"
            >
              ✕ close
            </button>
          </div>
          <p className="text-xs text-slate-300 font-mono leading-relaxed">{detail.description}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <SectionLabel title="TECH USED" color="#a78bfa" />
              <div className="flex flex-wrap gap-1.5">
                {detail.tech.map(t => <Badge key={t} label={t} color="#a78bfa" />)}
              </div>
            </div>
            <div className="space-y-1.5">
              <SectionLabel title="DETAILS" color="#60a5fa" />
              <ul className="space-y-1">
                {detail.details.map((d, i) => (
                  <li key={i} className="text-xs font-mono text-slate-300 flex gap-2">
                    <span className="text-blue/50 shrink-0">›</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted/40 text-center font-mono pt-2">
          ↑ click any node to inspect it
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Flows view
// ─────────────────────────────────────────────────────────────────────────────

function FlowsView({
  selectedFlow,
  onSelectFlow,
}: {
  selectedFlow: FlowId;
  onSelectFlow: (f: FlowId) => void;
}) {
  const flow = FLOWS[selectedFlow];
  const FLOW_TABS: { id: FlowId; label: string }[] = [
    { id: 'capture', label: 'Save Capture' },
    { id: 'chat',    label: 'Chat Message' },
    { id: 'search',  label: 'Semantic Search' },
    { id: 'relate',  label: 'Batch Relate' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FLOW_TABS.map(f => (
          <button
            key={f.id}
            onClick={() => onSelectFlow(f.id)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-all ${
              selectedFlow === f.id
                ? 'text-amber border-amber/50 bg-amber/10'
                : 'text-muted border-border hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div>
        <div className="text-sm font-mono text-text font-bold">{flow.title}</div>
        <div className="text-xs font-mono text-slate-400 mt-0.5">{flow.description}</div>
      </div>

      <div className="relative">
        <div className="absolute left-[13px] top-5 bottom-5 w-px bg-border" />
        <div className="space-y-2">
          {flow.steps.map((step, i) => {
            const lc = LAYER[step.layer];
            return (
              <div
                key={i}
                className="flex gap-3 items-start animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold shrink-0 z-10 bg-bg"
                  style={{ borderColor: lc.color, color: lc.color }}
                >
                  {i + 1}
                </div>
                <div
                  className="flex-1 rounded-lg border p-3 space-y-2 min-w-0"
                  style={{ borderColor: `${lc.color}30`, backgroundColor: `${lc.color}08` }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-mono font-bold tracking-wider"
                      style={{ color: lc.color }}
                    >
                      {lc.icon} {lc.label}
                    </span>
                    <span className="text-xs font-mono text-text">{step.component}</span>
                  </div>
                  <div className="text-xs font-mono text-text/90">{step.action}</div>
                  {step.data && (
                    <div className="text-[11px] font-mono text-slate-300 bg-bg/60 rounded px-2.5 py-2 border border-border/50 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {step.data}
                    </div>
                  )}
                  {step.note && (
                    <div className="text-[11px] font-mono text-amber/80 flex gap-1.5 items-start">
                      <span className="shrink-0">ⓘ</span>
                      <span>{step.note}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper (used by both Files views)
// ─────────────────────────────────────────────────────────────────────────────

function findDetail(tree: FileNode[], name: string): FileDetail | null {
  for (const node of tree) {
    if (node.type === 'file' && node.name === name) return node.detail ?? null;
    if (node.children) {
      const found = findDetail(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency map data
// ─────────────────────────────────────────────────────────────────────────────

const MC = { W: 148, GAP: 52, NODE_H: 36, ROW_STEP: 46, HDR_H: 28, PAD: 10 } as const;
const MC_STEP = MC.W + MC.GAP; // 200

type MapNode = { id: string; col: number; row: number; label: string; color: string; fileKey?: string };
type MapEdge = { from: string; to: string; dashed?: boolean };

const MAP_NODES: MapNode[] = [
  // Column 0 — Entry points
  { id: 'mp_page',   col: 0, row: 0, label: 'brain/page.tsx',  color: '#60a5fa', fileKey: 'brain/page.tsx'   },
  { id: 'mp_mw',     col: 0, row: 1, label: 'middleware.ts',   color: '#60a5fa', fileKey: 'middleware.ts'    },
  { id: 'mp_login',  col: 0, row: 2, label: 'login/page.tsx',  color: '#60a5fa', fileKey: 'login/page.tsx'   },
  // Column 1 — Components
  { id: 'mp_bc',     col: 1, row: 0, label: 'BrainClient',     color: '#60a5fa', fileKey: 'BrainClient.tsx'  },
  { id: 'mp_ca',     col: 1, row: 1, label: 'CaptureTab',      color: '#60a5fa', fileKey: 'CaptureTab.tsx'   },
  { id: 'mp_ch',     col: 1, row: 2, label: 'ChatTab',         color: '#60a5fa', fileKey: 'ChatTab.tsx'      },
  { id: 'mp_se',     col: 1, row: 3, label: 'SearchTab',       color: '#60a5fa', fileKey: 'SearchTab.tsx'    },
  { id: 'mp_gr',     col: 1, row: 4, label: 'GraphTab',        color: '#60a5fa', fileKey: 'GraphTab.tsx'     },
  { id: 'mp_gw',     col: 1, row: 5, label: 'GrowthTab',       color: '#60a5fa', fileKey: 'GrowthTab.tsx'    },
  { id: 'mp_cdm',    col: 1, row: 6, label: 'CaptureDetailModal', color: '#60a5fa', fileKey: 'CaptureDetailModal.tsx'},
  { id: 'mp_so',     col: 1, row: 7, label: 'SearchOverlay',   color: '#60a5fa', fileKey: 'SearchOverlay.tsx'},
  // Column 2 — API routes
  { id: 'mp_acap',   col: 2, row: 0, label: '/api/capture',    color: '#f59e0b', fileKey: 'capture/route.ts' },
  { id: 'mp_ach',    col: 2, row: 1, label: '/api/chat',       color: '#f59e0b', fileKey: 'chat/route.ts'    },
  { id: 'mp_ase',    col: 2, row: 2, label: '/api/search',     color: '#f59e0b', fileKey: 'search/route.ts'  },
  { id: 'mp_are',    col: 2, row: 3, label: '/api/relate',     color: '#f59e0b', fileKey: 'relate/route.ts'  },
  { id: 'mp_atr',    col: 2, row: 4, label: '/api/transcribe', color: '#f59e0b', fileKey: 'transcribe/route.ts'},
  { id: 'mp_asu',    col: 2, row: 5, label: '/api/summary',    color: '#f59e0b', fileKey: 'summary/weekly/route.ts'},
  { id: 'mp_apr',    col: 2, row: 6, label: '/api/projects',   color: '#f59e0b', fileKey: 'projects/route.ts'},
  { id: 'mp_asw',    col: 2, row: 7, label: '/api/push/sub',   color: '#f59e0b', fileKey: 'push/subscribe/route.ts'},
  // Column 3 — Lib + External
  { id: 'mp_lc',     col: 3, row: 0, label: 'supabase/client', color: '#34d399', fileKey: 'client.ts'        },
  { id: 'mp_ls',     col: 3, row: 1, label: 'supabase/server', color: '#34d399', fileKey: 'server.ts'        },
  { id: 'mp_claude', col: 3, row: 2, label: 'Groq LLM',        color: '#a78bfa', fileKey: 'llm.ts'           },
  { id: 'mp_groq',   col: 3, row: 3, label: 'Groq Whisper',    color: '#a78bfa'                              },
  { id: 'mp_db',     col: 3, row: 4, label: 'Supabase DB',     color: '#34d399'                              },
  { id: 'mp_voyage', col: 3, row: 5, label: 'Voyage AI',       color: '#a78bfa', fileKey: 'embeddings.ts'    },
];

const MAP_EDGES: MapEdge[] = [
  // Entry → Components
  { from: 'mp_page',  to: 'mp_bc'    },
  // Components → API
  { from: 'mp_bc',    to: 'mp_apr'   },
  { from: 'mp_bc',    to: 'mp_asw'   },
  { from: 'mp_ca',    to: 'mp_acap'  },
  { from: 'mp_ca',    to: 'mp_atr'   },
  { from: 'mp_ch',    to: 'mp_ach'   },
  { from: 'mp_se',    to: 'mp_ase'   },
  { from: 'mp_gr',    to: 'mp_are'   },
  { from: 'mp_gw',    to: 'mp_asu'   },
  { from: 'mp_cdm',   to: 'mp_acap'  },
  // API → Lib / External
  { from: 'mp_acap',  to: 'mp_ls'    },
  { from: 'mp_acap',  to: 'mp_claude'},
  { from: 'mp_ach',   to: 'mp_ls'    },
  { from: 'mp_ach',   to: 'mp_claude'},
  { from: 'mp_ase',   to: 'mp_ls'    },
  { from: 'mp_ase',   to: 'mp_claude'},
  { from: 'mp_are',   to: 'mp_ls'    },
  { from: 'mp_are',   to: 'mp_voyage'},
  { from: 'mp_acap',  to: 'mp_voyage'},
  { from: 'mp_ach',   to: 'mp_voyage'},
  { from: 'mp_ase',   to: 'mp_voyage'},
  { from: 'mp_atr',   to: 'mp_groq'  },
  { from: 'mp_asu',   to: 'mp_ls'    },
  { from: 'mp_asu',   to: 'mp_claude'},
  { from: 'mp_apr',   to: 'mp_ls'    },
  { from: 'mp_asw',   to: 'mp_ls'    },
  { from: 'mp_ls',    to: 'mp_db'    },
  // Cross-column secondary (dashed)
  { from: 'mp_bc',    to: 'mp_lc',   dashed: true },
  { from: 'mp_mw',    to: 'mp_ls',   dashed: true },
];

const MAP_COL_HEADERS = [
  { label: 'ENTRY',          color: '#60a5fa' },
  { label: 'COMPONENTS',     color: '#60a5fa' },
  { label: 'API ROUTES',     color: '#f59e0b' },
  { label: 'LIB / EXTERNAL', color: '#34d399' },
];

function mapNodePos(n: MapNode) {
  const x  = n.col * MC_STEP + MC.PAD;
  const y  = MC.HDR_H + n.row * MC.ROW_STEP + MC.PAD;
  const cx = x + MC.W / 2;
  const cy = y + MC.NODE_H / 2;
  const rx = x + MC.W;
  return { x, y, cx, cy, rx };
}

const MAP_SVG_W = 3 * MC_STEP + MC.W + MC.PAD * 2;          // ≈ 776
const MAP_SVG_H = MC.HDR_H + 8 * MC.ROW_STEP + MC.PAD * 2; // ≈ 420

// ─────────────────────────────────────────────────────────────────────────────
// Dependency map view
// ─────────────────────────────────────────────────────────────────────────────

function DependencyMapView() {
  const [sel, setSel] = useState<string | null>(null);

  const connectedIds = sel
    ? new Set(MAP_EDGES.filter(e => e.from === sel || e.to === sel).flatMap(e => [e.from, e.to]))
    : null;

  const selNode   = sel ? MAP_NODES.find(n => n.id === sel) : null;
  const selDetail = selNode?.fileKey ? findDetail(FILE_TREE, selNode.fileKey) : null;

  function edgePath(e: MapEdge) {
    const from = mapNodePos(MAP_NODES.find(n => n.id === e.from)!);
    const to   = mapNodePos(MAP_NODES.find(n => n.id === e.to)!);
    const mx   = (from.rx + to.x) / 2;
    return `M ${from.rx} ${from.cy} C ${mx} ${from.cy} ${mx} ${to.cy} ${to.x} ${to.cy}`;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="relative" style={{ width: MAP_SVG_W, height: MAP_SVG_H }}>

          {/* SVG connection lines */}
          <svg
            width={MAP_SVG_W} height={MAP_SVG_H}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 0 }}
          >
            {MAP_EDGES.map((edge, i) => {
              const isActive  = sel ? edge.from === sel || edge.to === sel : false;
              const toNode    = MAP_NODES.find(n => n.id === edge.to)!;
              const opacity   = sel ? (isActive ? 0.9 : 0.04) : (edge.dashed ? 0.12 : 0.2);
              const color     = isActive ? toNode.color : '#94a3b8';
              const sw        = isActive ? 1.5 : 1;
              return (
                <path
                  key={i}
                  d={edgePath(edge)}
                  fill="none"
                  stroke={color}
                  strokeWidth={sw}
                  strokeDasharray={edge.dashed ? '4 3' : undefined}
                  strokeLinecap="round"
                  opacity={opacity}
                />
              );
            })}
            {/* Dot at edge destination when active */}
            {sel && MAP_EDGES
              .filter(e => e.from === sel || e.to === sel)
              .map((edge, i) => {
                const dest = MAP_NODES.find(n => n.id === edge.to)!;
                const pos  = mapNodePos(dest);
                return <circle key={i} cx={pos.x + 3} cy={pos.cy} r={2.5} fill={dest.color} opacity={0.85} />;
              })
            }
          </svg>

          {/* Column headers */}
          {MAP_COL_HEADERS.map((col, i) => (
            <div
              key={i}
              className="absolute text-[9px] font-mono font-bold tracking-widest select-none"
              style={{ left: i * MC_STEP + MC.PAD, top: MC.PAD, width: MC.W, color: col.color, opacity: 0.7 }}
            >
              {col.label}
            </div>
          ))}

          {/* Node boxes */}
          {MAP_NODES.map(node => {
            const pos       = mapNodePos(node);
            const isSelected  = sel === node.id;
            const isConnected = connectedIds?.has(node.id) ?? false;
            const isDimmed    = sel !== null && !isSelected && !isConnected;
            return (
              <button
                key={node.id}
                onClick={() => setSel(node.id === sel ? null : node.id)}
                className="absolute font-mono text-left rounded border transition-all duration-150"
                style={{
                  left: pos.x, top: pos.y,
                  width: MC.W, height: MC.NODE_H,
                  padding: '0 9px',
                  fontSize: 11,
                  zIndex: 1,
                  borderColor:     isSelected  ? node.color : isConnected ? `${node.color}55` : `${node.color}25`,
                  backgroundColor: isSelected  ? `${node.color}1e` : `${node.color}08`,
                  color:           isSelected  ? node.color : isConnected ? `${node.color}dd` : `${node.color}88`,
                  boxShadow:       isSelected  ? `0 0 12px ${node.color}28` : 'none',
                  opacity:         isDimmed ? 0.28 : 1,
                }}
              >
                {node.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selNode ? (
        <div
          className="rounded-lg border p-4 space-y-3 animate-fade-in"
          style={{ borderColor: '#1a2332', backgroundColor: '#0d1117' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-mono font-bold text-text">{selNode.label}</div>
              {selNode.fileKey && (
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{selNode.fileKey}</div>
              )}
            </div>
            <button onClick={() => setSel(null)} className="text-muted hover:text-text text-xs font-mono shrink-0">
              ✕ close
            </button>
          </div>

          {selDetail ? (
            <>
              <p className="text-xs text-slate-300 font-mono leading-relaxed">{selDetail.description}</p>
              <div className="flex flex-wrap gap-4">
                {selDetail.exports && selDetail.exports.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel title="EXPORTS" color="#34d399" />
                    <div className="flex flex-wrap gap-1.5">
                      {selDetail.exports.map(e => <Badge key={e} label={e} color="#34d399" />)}
                    </div>
                  </div>
                )}
                {selDetail.imports && selDetail.imports.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel title="IMPORTS" color="#60a5fa" />
                    <div className="flex flex-wrap gap-1.5">
                      {selDetail.imports.map(i => <Badge key={i} label={i} color="#60a5fa" />)}
                    </div>
                  </div>
                )}
                {selDetail.usedBy && selDetail.usedBy.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel title="USED BY" color="#f59e0b" />
                    <div className="flex flex-wrap gap-1.5">
                      {selDetail.usedBy.map(u => <Badge key={u} label={u} color="#f59e0b" />)}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-300 font-mono leading-relaxed">
              {selNode.id === 'mp_claude'
                ? 'Groq gpt-oss via lib/llm.ts (provider-agnostic layer, strict structured outputs) — categorize, chat, search, digest, summary.'
                : selNode.id === 'mp_groq'
                ? 'Groq Whisper via groq-sdk — used by /api/transcribe for audio-to-text. Faster and cheaper than OpenAI Whisper.'
                : selNode.id === 'mp_db'
                ? 'Supabase PostgreSQL + pgvector. Tables: captures, projects, user_settings, query_log, digests, summaries, push_subscriptions. RLS on every table.'
                : 'External service.'}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted/40 font-mono text-center">
          click any node to highlight connections and inspect
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Files view
// ─────────────────────────────────────────────────────────────────────────────

function FilesView({
  expandedDirs,
  setExpandedDirs,
  selectedFile,
  setSelectedFile,
}: {
  expandedDirs: Set<string>;
  setExpandedDirs: (s: Set<string>) => void;
  selectedFile: string;
  setSelectedFile: (f: string) => void;
}) {
  const [mode, setMode] = useState<'map' | 'tree'>('map');

  function toggleDir(name: string) {
    const next = new Set(expandedDirs);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedDirs(next);
  }

  function TreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
    const isSelected = node.type === 'file' && node.name === selectedFile;
    const isExpanded = expandedDirs.has(node.name);
    const pl = depth * 14 + 8;

    if (node.type === 'dir') {
      return (
        <div>
          <button
            onClick={() => toggleDir(node.name)}
            className="flex items-center gap-1 w-full text-left py-0.5 hover:text-text transition-colors text-muted"
            style={{ paddingLeft: pl }}
          >
            <span className="text-[9px] text-muted/50 w-3 shrink-0">{isExpanded ? '▾' : '▸'}</span>
            <span className="text-xs font-mono text-amber/80">{node.name}/</span>
          </button>
          {isExpanded && node.children?.map(child => (
            <TreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      );
    }

    return (
      <button
        onClick={() => setSelectedFile(node.name)}
        className={`flex w-full text-left py-0.5 transition-colors rounded ${
          isSelected ? 'bg-blue/10' : 'hover:bg-surface'
        }`}
        style={{ paddingLeft: pl + 12 }}
      >
        <span className={`text-xs font-mono ${isSelected ? 'text-blue' : 'text-slate-400'}`}>
          {node.name}
        </span>
      </button>
    );
  }

  const detail = findDetail(FILE_TREE, selectedFile);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['map', 'tree'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-all ${
              mode === m ? 'text-blue border-blue/50 bg-blue/10' : 'text-muted border-border hover:text-text'
            }`}
          >
            {m === 'map' ? '◈ Dependency Map' : '◰ File Tree'}
          </button>
        ))}
      </div>

      {mode === 'map' ? (
        <DependencyMapView />
      ) : (
        <div className="flex gap-3 h-[520px] sm:h-[600px]">
          <div className="w-52 shrink-0 border border-border rounded-lg bg-surface overflow-y-auto py-2 no-scrollbar">
            <div className="text-[9px] font-mono text-muted/50 tracking-widest px-2 pb-1.5">FILE TREE</div>
            {FILE_TREE.map(node => <TreeNode key={node.name} node={node} />)}
          </div>
          <div className="flex-1 border border-border rounded-lg bg-surface overflow-y-auto p-4 no-scrollbar">
            {detail ? (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <div className="text-sm font-mono text-text font-bold">{selectedFile}</div>
                  <div className="text-xs font-mono text-slate-300 mt-1.5 leading-relaxed">{detail.description}</div>
                </div>
                {detail.exports && detail.exports.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel title="EXPORTS" color="#34d399" />
                    <div className="flex flex-wrap gap-1.5">
                      {detail.exports.map(e => <Badge key={e} label={e} color="#34d399" />)}
                    </div>
                  </div>
                )}
                {detail.imports && detail.imports.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel title="IMPORTS" color="#60a5fa" />
                    <div className="flex flex-wrap gap-1.5">
                      {detail.imports.map(i => <Badge key={i} label={i} color="#60a5fa" />)}
                    </div>
                  </div>
                )}
                {detail.usedBy && detail.usedBy.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel title="USED BY" color="#f59e0b" />
                    <div className="flex flex-wrap gap-1.5">
                      {detail.usedBy.map(u => <Badge key={u} label={u} color="#f59e0b" />)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400 font-mono">← select a file</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI pipeline view
// ─────────────────────────────────────────────────────────────────────────────

function AIView({
  aiFlow,
  onSelectAIFlow,
}: {
  aiFlow: AIFlowId;
  onSelectAIFlow: (f: AIFlowId) => void;
}) {
  const pipeline = AI_PIPELINES[aiFlow];

  const AI_TABS: { id: AIFlowId; label: string }[] = [
    { id: 'categorize', label: 'Categorize' },
    { id: 'chat',       label: 'Chat'       },
    { id: 'search',     label: 'Search'     },
    { id: 'relate',     label: 'Relate'     },
    { id: 'summary',    label: 'Summary'    },
  ];

  const STEP_CONFIG: Record<PipelineStep['type'], { color: string; label: string }> = {
    input:    { color: '#60a5fa', label: 'INPUT'    },
    system:   { color: '#a78bfa', label: 'SYSTEM'   },
    user:     { color: '#34d399', label: 'USER'     },
    response: { color: '#f59e0b', label: 'RESPONSE' },
    parse:    { color: '#60a5fa', label: 'PARSE'    },
    store:    { color: '#34d399', label: 'STORE'    },
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {AI_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onSelectAIFlow(t.id)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-all ${
              aiFlow === t.id
                ? 'text-purple border-purple/50 bg-purple/10'
                : 'text-muted border-border hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-mono text-text font-bold">{pipeline.title}</div>
          <div className="text-xs font-mono text-slate-400 mt-0.5">{pipeline.description}</div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono px-2 py-1 rounded border border-purple/30 text-purple bg-purple/10">
            {pipeline.model}
          </span>
          {pipeline.maxTokens !== null && (
            <span className="text-[10px] font-mono px-2 py-1 rounded border border-amber/30 text-amber bg-amber/10">
              max_tokens: {pipeline.maxTokens}
            </span>
          )}
          <span className="text-[10px] font-mono px-2 py-1 rounded border border-border text-muted bg-surface">
            {pipeline.route}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {pipeline.steps.map((step, i) => {
          const cfg = STEP_CONFIG[step.type];
          return (
            <div
              key={i}
              className="rounded-lg border overflow-hidden animate-fade-in"
              style={{ borderColor: `${cfg.color}30`, animationDelay: `${i * 80}ms` }}
            >
              <div
                className="flex items-center gap-2 px-3 py-1.5"
                style={{ backgroundColor: `${cfg.color}12` }}
              >
                <span
                  className="text-[10px] font-mono font-bold tracking-widest"
                  style={{ color: cfg.color }}
                >
                  {cfg.label}
                </span>
                <span className="text-xs font-mono text-text/80">{step.label}</span>
                <span className="ml-auto text-[10px] text-muted/50 font-mono">
                  {i + 1}/{pipeline.steps.length}
                </span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 px-3 py-2.5 bg-bg/40 overflow-x-auto whitespace-pre-wrap leading-relaxed no-scrollbar">
                {step.content}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export default function ArchitectureTab() {
  const [view, setView]               = useState<View>('overview');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<FlowId>('capture');
  const [expandedDirs, setExpandedDirs] = useState(
    () => new Set(['app', 'components', 'lib', 'supabase', 'api'])
  );
  const [selectedFile, setSelectedFile] = useState<string>('BrainClient.tsx');
  const [aiFlow, setAiFlow]             = useState<AIFlowId>('categorize');

  const VIEWS: { id: View; label: string; icon: string }[] = [
    { id: 'overview', label: 'System',      icon: '◉' },
    { id: 'flows',    label: 'Data Flows',  icon: '⟳' },
    { id: 'files',    label: 'Files',       icon: '◰' },
    { id: 'ai',       label: 'AI Pipeline', icon: '✦' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted/60 font-mono tracking-wider">VIEW:</span>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-all duration-150 ${
              view === v.id
                ? 'text-purple border-purple/60 bg-purple/10'
                : 'text-muted border-border hover:text-text'
            }`}
          >
            {v.icon} {v.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted/30 font-mono hidden lg:block">
          second_brain · system architecture
        </span>
      </div>

      {view === 'overview' && (
        <OverviewView
          selectedNode={selectedNode}
          onSelectNode={(id) => setSelectedNode(id === selectedNode ? null : id)}
        />
      )}
      {view === 'flows' && (
        <FlowsView selectedFlow={selectedFlow} onSelectFlow={setSelectedFlow} />
      )}
      {view === 'files' && (
        <FilesView
          expandedDirs={expandedDirs}
          setExpandedDirs={setExpandedDirs}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
        />
      )}
      {view === 'ai' && (
        <AIView aiFlow={aiFlow} onSelectAIFlow={setAiFlow} />
      )}
    </div>
  );
}
