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
    description: 'The main hub component. Owns global captures[] and projects[] state, orchestrates 6 tabs, handles auth, visibility-based polling, notification routing, and keyboard shortcuts.',
    tech: ['React 19 (useState, useCallback, useEffect)', 'Supabase client SDK', 'Next.js router'],
    details: [
      'Polls Supabase every 60s via setInterval + onVisibilityChange (free realtime alternative)',
      'Routes SW postMessages: open-review → setTab("chat"), open-task → setTab("grow")',
      'Cmd+K shortcut → opens SearchOverlay modal',
      'Passes captures[] + callbacks down to all tab components via props',
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
      'Template buttons: Task / Idea / TIL / Link / Note prefix shortcuts',
      'Filter + sort: by type, project, starred, created date',
    ],
  },
  chat_tab: {
    title: 'ChatTab.tsx',
    file: 'components/ChatTab.tsx',
    description: 'RAG-based conversational interface. Operates freely or with a pinned capture as primary context. Maintains conversation history across turns.',
    tech: ['Keyword-based RAG', 'Chat history (last 6 turns)', 'Spaced repetition integration'],
    details: [
      'Pinned capture always prepended first in Claude\'s context window',
      'Keyword match: user message tokens scored against title+text+type+project of all captures',
      'Top 7 ranked captures sent as context (top 8 when no pinned capture)',
      '"Mark Reviewed" → PATCH last_reviewed_at on pinned capture → removes from review queue',
    ],
  },
  search_tab: {
    title: 'SearchTab.tsx',
    file: 'components/SearchTab.tsx',
    description: 'Semantic search that synthesizes insights across the entire knowledge base using Claude AI.',
    tech: ['Claude full-catalogue scan (100 captures)', 'JSON structured response', 'Follow-up question loop'],
    details: [
      'Sends query + all captures (up to 100) to Claude as a formatted catalogue',
      'Returns: synthesis text + relevantIds[] + 3 follow-up questions',
      'Follow-up question buttons → automatically trigger a new search',
      'Relevant captures highlighted/filtered in list below the synthesis',
    ],
  },
  graph_tab: {
    title: 'GraphTab.tsx',
    file: 'components/GraphTab.tsx',
    description: 'Interactive force-directed knowledge graph. Visualizes semantic relationships between all captures.',
    tech: ['Custom force simulation (no D3)', 'Canvas API', 'Pointer events (pan/zoom)', 'Batch relate mode'],
    details: [
      'Custom physics: repulsion between all nodes + spring attraction along related_ids edges',
      'Node size ∝ related_ids.length (more connections = bigger node)',
      'Pan/zoom via pointerdown + pointermove events on canvas',
      'Batch mode: select multiple captures → /api/relate/batch → new edges appear in graph',
      'Filter nodes by project, type, or starred status',
    ],
  },
  growth_tab: {
    title: 'GrowthTab.tsx',
    file: 'components/GrowthTab.tsx',
    description: '52-week heatmap, streak, spaced repetition queue, task manager, weekly AI summary, and AI digest — all embedded in a single collapsable-section layout.',
    tech: ['ISO week date math', 'Spaced repetition (14-day cron cutoff)', 'Claude weekly summary', 'Claude digest', 'JSONB subtasks'],
    details: [
      '52-week GitHub-style heatmap + monthly day view toggle',
      'Streak: consecutive days with ≥1 capture',
      'Review queue: Idea/Learning captures not reviewed in 7 days, max 5 shown',
      'Tasks: due_date, priority, subtasks stored as JSON array in capture.text',
      'Weekly summary: Mon–Sun → Claude analysis → upserted to summaries table',
      'AI Digest embedded here (was separate tab): themes, momentum, highlights, insight, pending tasks, forgotten ideas — stored + browsable',
    ],
  },
  digest_tab: {
    title: 'DigestTab.tsx',
    file: 'components/DigestTab.tsx',
    description: 'Previously a standalone tab. Now embedded as a collapsable section inside GrowthTab — no longer rendered directly from BrainClient.',
    tech: ['Claude Sonnet 4.6', 'Supabase digest storage', 'last_reviewed_at in catalogue'],
    details: [
      'Digest API returns: themes, momentum, highlights, insight, patterns, pendingTasks, forgottenIdeas, suggestion',
      'Catalogue includes last_reviewed_at per capture so Claude can factor in recency of reviews',
      'Stored in Supabase digests table — history browsable, regenerate on demand',
      'Moved into GrowthTab as collapsable section to consolidate growth/insight views',
    ],
  },
  CaptureDetailModal: {
    title: 'CaptureDetailModal.tsx',
    file: 'components/CaptureDetailModal.tsx',
    description: 'Universal modal for viewing, editing, and deleting a capture. Used across ChatTab, GraphTab, SearchTab, and SearchOverlay — replacing per-tab inline expand logic.',
    tech: ['React portal pattern', 'PATCH /api/capture/[id]', 'Shared across 4 tabs'],
    details: [
      'Modes: view → edit → confirmDelete (state machine within modal)',
      'Edit saves via PATCH with updated title, text, type, project',
      'Used by: ChatTab (pinned expand), GraphTab (node click), SearchTab (result expand), SearchOverlay (result expand)',
      'Replaces duplicated inline expand logic that was in each tab',
    ],
  },
  api_capture: {
    title: '/api/capture',
    file: 'app/api/capture/route.ts',
    description: 'Creates a new capture. Enriches URLs, extracts YouTube transcripts, then asks Claude to assign type, project, and title.',
    tech: ['Claude Sonnet 4.6', 'youtube-transcript pkg', 'Open Graph scraping', 'Supabase insert'],
    details: [
      'YouTube URL → full transcript + video title via youtube-transcript package',
      'Web URL → og:title + og:description fetched from page HTML',
      'Claude prompt: text + enriched URL content + existing project names → {type, project, title}',
      'Inserts capture row → fires background POST /api/relate (async, doesn\'t block response)',
    ],
  },
  api_chat: {
    title: '/api/chat',
    file: 'app/api/chat/route.ts',
    description: 'RAG chat: keyword-based context selection from all captures, then Claude generates a conversational response.',
    tech: ['Claude Sonnet 4.6', 'Keyword ranking', 'Conversation history', 'Pinned context'],
    details: [
      'Receives: message + history[≤6] + optional pinnedCaptureId',
      'Keyword scoring: split message → tokens, count matches per capture in title+text+type+project',
      'Takes top 7 captures by score (8 if no pinned); pinned is always prepended',
      'max_tokens: 600 — concise, conversational responses',
    ],
  },
  api_search: {
    title: '/api/search',
    file: 'app/api/search/route.ts',
    description: 'Semantic search with AI synthesis. Sends all recent captures to Claude as a text catalogue and asks for insights.',
    tech: ['Claude Sonnet 4.6', 'Full text catalogue (100 captures)', 'JSON structured response'],
    details: [
      'Fetches last 100 captures from DB ordered by recency',
      'Builds catalogue: "ID | type | project | title | text[:100]" per line, joined with \\n',
      'Claude returns: { synthesis, relevantIds[≤8], followUpQuestions[3] }',
      'No vector embeddings — full text scan (fast enough at personal-scale knowledge bases)',
    ],
  },
  api_relate: {
    title: '/api/relate',
    file: 'app/api/relate/route.ts',
    description: 'Finds semantic connections between a new capture and existing ones, then links them bidirectionally in the DB.',
    tech: ['Claude Sonnet 4.6', 'Bidirectional array update', 'Background trigger from capture'],
    details: [
      'Always triggered async after a new capture is saved (does not block save response)',
      'Compares new capture vs 50 most recent other captures by full text content',
      'Claude returns related IDs → update A.related_ids AND B.related_ids (bidirectional)',
      'Result: undirected semantic graph stored as related_ids[] arrays in DB',
    ],
  },
  api_relate_batch: {
    title: '/api/relate/batch',
    file: 'app/api/relate/batch/route.ts',
    description: 'Batch semantic relate: finds pairwise connections between multiple selected captures from the graph view.',
    tech: ['Claude Sonnet 4.6', 'Pairwise comparison', 'Bulk bidirectional update'],
    details: [
      'Accepts array of captureIds selected in GraphTab batch mode',
      'Claude reads full text of all selected captures, returns semantic pairs',
      'Bulk update: all discovered pairs linked bidirectionally',
    ],
  },
  api_transcribe: {
    title: '/api/transcribe',
    file: 'app/api/transcribe/route.ts',
    description: 'Transcribes uploaded audio files to text using Groq\'s Whisper model (faster and cheaper than OpenAI).',
    tech: ['Groq SDK', 'whisper-large-v3', 'FormData multipart'],
    details: [
      'Accepts audio/* file via multipart FormData POST',
      'Groq LPU (Language Processing Unit) hardware → sub-second transcription latency',
      'Returns { transcript: string }',
      'CaptureTab merges transcript with any text already typed in the input',
    ],
  },
  api_summary: {
    title: '/api/summary/weekly',
    file: 'app/api/summary/weekly/route.ts',
    description: 'Generates a weekly AI summary of captures. Upserted to DB for persistent week-over-week history.',
    tech: ['Claude Sonnet 4.6', 'Supabase upsert', 'Mon–Sun date range query'],
    details: [
      'Fetches all captures from Monday–Sunday of the current week',
      'Claude returns: { highlights, themes, insight, momentum }',
      'Upserted on unique key (user_id, week_start) — re-running same week overwrites',
      'GrowthTab displays latest card + scrollable history of past weeks',
    ],
  },
  claude: {
    title: 'Claude Sonnet 4.6',
    description: 'Anthropic AI model powering categorization, RAG chat, semantic search, semantic relate, and weekly summaries.',
    tech: ['@anthropic-ai/sdk', '200K token context window', 'JSON output parsing', 'Anthropic API'],
    details: [
      'Used by: /api/capture, /api/chat, /api/search, /api/relate, /api/summary/weekly',
      'All non-chat endpoints return structured JSON — prompts explicitly request JSON',
      'Token budgets: categorize=150, relate=200, summary=400, search=500, chat=600',
      'Cost: ~$0.003 input / $0.01 output per million tokens',
    ],
  },
  groq: {
    title: 'Groq Whisper',
    description: 'Ultra-fast speech-to-text via Groq LPU hardware. Used exclusively for audio file transcription in /api/transcribe.',
    tech: ['groq-sdk', 'whisper-large-v3 model', 'Sub-second latency'],
    details: [
      'Model: whisper-large-v3 (same accuracy as OpenAI Whisper, ~10× faster)',
      'Custom LPU hardware avoids GPU memory bottlenecks',
      'Accepts: wav, mp3, m4a, webm audio formats',
      'Not used for live voice capture — that uses browser SpeechRecognition API directly',
    ],
  },
  supabase: {
    title: 'Supabase',
    description: 'PostgreSQL BaaS providing auth (Google OAuth), database, and row-level security. Both SSR and client SDK patterns used.',
    tech: ['PostgreSQL', 'Google OAuth (Supabase Auth)', 'Row Level Security', '@supabase/ssr'],
    details: [
      'Tables: captures, projects, summaries, push_subscriptions',
      'RLS policy: every table filtered by auth.uid() = user_id (enforced at DB level)',
      'Auth: Google OAuth → JWT session stored in httpOnly cookie (SSR-safe)',
      'Server client (@supabase/ssr) reads cookies from Next.js headers() — used in all API routes',
      'Browser client (createBrowserClient) only used in BrainClient for polling sync',
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
    description: 'Text / voice / URL → AI categorization → DB save → background semantic linking',
    steps: [
      { layer: 'frontend', component: 'CaptureTab', action: 'User submits text (or voice transcript / audio upload / URL)', data: '{ text, due_date?, source_url? }' },
      { layer: 'api', component: '/api/capture', action: 'Enrich URL if detected in text', note: 'YouTube → full transcript; Web page → og:title + og:description from HTML' },
      { layer: 'ai', component: 'Claude Sonnet 4.6', action: 'Categorize: assign type, project, and title', data: '← { type: "Idea"|"Task"|"Link"|"Learning"|"Note", project: "...", title: "..." }', note: 'max_tokens: 150, JSON-only response' },
      { layer: 'db', component: 'Supabase', action: 'INSERT INTO captures', data: '{ text, title, type, project, user_id, created_at, starred: false, related_ids: [] }' },
      { layer: 'frontend', component: 'CaptureTab', action: 'Update UI list + show "finding connections…" indicator', note: 'Local state update immediately; relate runs async in background' },
      { layer: 'api', component: '/api/relate', action: 'Background: compare vs 50 recent captures', data: '{ captureId }', note: 'Triggered via fetch() after response already sent to client' },
      { layer: 'ai', component: 'Claude Sonnet 4.6', action: 'Find semantically related captures', data: '← ["id1", "id2", ...]', note: 'max_tokens: 200, reads full text of all compared captures' },
      { layer: 'db', component: 'Supabase', action: 'Bidirectional link update: related_ids on both A and B', note: 'A.related_ids += B.id AND B.related_ids += A.id' },
    ],
  },
  chat: {
    title: 'Send Chat Message',
    description: 'User message → keyword context selection → Claude RAG response',
    steps: [
      { layer: 'frontend', component: 'ChatTab', action: 'User types message (optionally with a pinned capture)', data: '{ message, history[≤6], pinnedCaptureId? }' },
      { layer: 'api', component: '/api/chat', action: 'Keyword-rank all captures by relevance to message', note: 'Tokens = message.split(whitespace); score each capture by token matches in title+text+type+project' },
      { layer: 'ai', component: 'Claude Sonnet 4.6', action: 'Generate conversational answer using context window', data: '[system: pinned capture? + top 7 ranked captures] + [last 6 history turns] + [current message]', note: 'max_tokens: 600' },
      { layer: 'frontend', component: 'ChatTab', action: 'Render AI response as chat bubble', note: 'Full response at once — no streaming; appended to local history' },
      { layer: 'db', component: 'Supabase', action: 'PATCH last_reviewed_at + sync state from server response', note: 'Awaits response → updates captures[] from server data (fixes race condition where optimistic update could diverge)' },
    ],
  },
  search: {
    title: 'Semantic Search',
    description: 'Query → full knowledge base scan → Claude synthesis + relevant IDs + follow-ups',
    steps: [
      { layer: 'frontend', component: 'SearchTab', action: 'User enters query', data: '{ query: string }' },
      { layer: 'db', component: 'Supabase', action: 'Fetch recent captures', data: 'SELECT * FROM captures ORDER BY created_at DESC LIMIT 100' },
      { layer: 'api', component: '/api/search', action: 'Build catalogue string', note: 'Format each as: "id | type | project | title | text[:100]" — joined with newlines' },
      { layer: 'ai', component: 'Claude Sonnet 4.6', action: 'Synthesize insights across full catalogue', data: '← { synthesis: "2–4 paragraphs", relevantIds[≤8], followUpQuestions[3] }', note: 'max_tokens: 500' },
      { layer: 'frontend', component: 'SearchTab', action: 'Render synthesis + highlighted captures + follow-up buttons', note: 'Follow-up clicks auto-trigger a new search with the follow-up as query' },
    ],
  },
  relate: {
    title: 'Batch Relate (Graph)',
    description: 'Select captures in graph → Claude finds semantic pairs → force graph re-renders with new edges',
    steps: [
      { layer: 'frontend', component: 'GraphTab', action: 'User enters batch mode, selects captures on canvas', data: 'string[] selectedIds' },
      { layer: 'api', component: '/api/relate/batch', action: 'Fetch all selected captures from DB', data: 'SELECT * FROM captures WHERE id IN (selectedIds)' },
      { layer: 'ai', component: 'Claude Sonnet 4.6', action: 'Find semantic pairs among all selected captures', data: '← Array<{ a: id, b: id }>', note: 'Reads full text of each; returns pairs with genuine thematic overlap' },
      { layer: 'db', component: 'Supabase', action: 'Bulk bidirectional update for all discovered pairs', note: 'For each pair (A,B): A.related_ids += B and B.related_ids += A' },
      { layer: 'frontend', component: 'GraphTab', action: 'Force simulation restarts with new spring edges', note: 'New connection lines appear; node sizes update to reflect higher connection counts' },
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
          { name: 'capture/route.ts', type: 'file', detail: { description: 'Enrich URL → Claude categorize → DB insert → background relate trigger', exports: ['POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server', 'youtube-transcript'], usedBy: ['CaptureTab'] } },
          { name: 'capture/[id]/route.ts', type: 'file', detail: { description: 'Update or delete individual capture by UUID', exports: ['PATCH', 'DELETE'], imports: ['lib/supabase/server'], usedBy: ['CaptureTab', 'ChatTab', 'GrowthTab'] } },
          { name: 'chat/route.ts', type: 'file', detail: { description: 'RAG chat: keyword context selection → Claude conversational response', exports: ['POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server'], usedBy: ['ChatTab'] } },
          { name: 'search/route.ts', type: 'file', detail: { description: 'Semantic search: full catalogue scan → Claude synthesis + IDs + follow-ups', exports: ['POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server'], usedBy: ['SearchTab'] } },
          { name: 'relate/route.ts', type: 'file', detail: { description: 'Single-capture semantic relate → bidirectional link in DB', exports: ['POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server'], usedBy: ['/api/capture (background call)'] } },
          { name: 'relate/batch/route.ts', type: 'file', detail: { description: 'Batch semantic relate for multiple selected captures', exports: ['POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server'], usedBy: ['GraphTab'] } },
          { name: 'projects/route.ts', type: 'file', detail: { description: 'List all projects (GET) and create new project (POST)', exports: ['GET', 'POST'], imports: ['lib/supabase/server'], usedBy: ['BrainClient', 'CaptureTab'] } },
          { name: 'transcribe/route.ts', type: 'file', detail: { description: 'Audio file → Groq whisper-large-v3 → transcript string', exports: ['POST'], imports: ['groq-sdk'], usedBy: ['CaptureTab'] } },
          { name: 'summary/weekly/route.ts', type: 'file', detail: { description: 'Mon–Sun captures → Claude analysis → summaries table upsert', exports: ['POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server'], usedBy: ['GrowthTab'] } },
          { name: 'digest/route.ts', type: 'file', detail: { description: 'AI digest: last 80 captures → Claude analysis → themes, momentum, highlights, insight, pendingTasks, forgottenIdeas. Stored in digests table.', exports: ['GET', 'POST'], imports: ['@anthropic-ai/sdk', 'lib/supabase/server'], usedBy: ['GrowthTab (via embedded DigestTab section)'] } },
          { name: 'push/subscribe/route.ts', type: 'file', detail: { description: 'Store VAPID Web Push subscription object in push_subscriptions table', exports: ['POST'], imports: ['lib/supabase/server'], usedBy: ['BrainClient'] } },
          { name: 'cron/review-reminder/route.ts', type: 'file', detail: { description: 'Cron job: send push to users whose Learnings/Ideas are due for spaced review', exports: ['GET'], imports: ['web-push', 'lib/supabase/server'], usedBy: ['Vercel Cron (daily)'] } },
          { name: 'cron/task-due/route.ts', type: 'file', detail: { description: 'Cron job: send push to users with tasks due today', exports: ['GET'], imports: ['web-push', 'lib/supabase/server'], usedBy: ['Vercel Cron (daily)'] } },
          { name: 'auth/callback/route.ts', type: 'file', detail: { description: 'Google OAuth callback: exchange PKCE code for session cookie', exports: ['GET'], imports: ['lib/supabase/server'], usedBy: ['Supabase Auth redirect'] } },
        ],
      },
      { name: 'brain/page.tsx', type: 'file', detail: { description: 'Server component: verifies auth, fetches initial captures from DB, renders BrainClient as client island', exports: ['default (page)'], imports: ['lib/supabase/server', 'components/BrainClient'], usedBy: ['Next.js router (/brain)'] } },
      { name: 'login/page.tsx', type: 'file', detail: { description: 'Login page with Google OAuth button. Redirects to /brain on success.', exports: ['default (page)'], imports: ['lib/supabase/server'], usedBy: ['Next.js router (/login)'] } },
      { name: 'layout.tsx', type: 'file', detail: { description: 'Root layout: JetBrains Mono font, CSS variables, PWA metadata', exports: ['default', 'metadata'], imports: ['next/font/google', 'app/globals.css'], usedBy: ['Next.js (wraps all pages)'] } },
      { name: 'manifest.ts', type: 'file', detail: { description: 'PWA manifest: app name, icons, display:standalone, theme color', exports: ['default'], imports: [], usedBy: ['Next.js (auto-serves /manifest.webmanifest)'] } },
      { name: 'globals.css', type: 'file', detail: { description: 'Tailwind imports, CSS custom properties, scrollbar styling, global utility classes (.no-scrollbar, .glow-amber, etc.)', exports: [], imports: [], usedBy: ['app/layout.tsx'] } },
    ],
  },
  {
    name: 'components', type: 'dir', children: [
      { name: 'BrainClient.tsx', type: 'file', detail: { description: 'Hub: owns captures/projects state, 6 tabs (no DigestTab — merged into GrowthTab), auth, visibility polling, SW notification routing, Cmd+K', exports: ['default', 'Capture (type)', 'Project (type)', 'TYPE_COLORS'], imports: ['lib/supabase/client', 'All tab components', 'CaptureDetailModal', 'SearchOverlay'], usedBy: ['app/brain/page.tsx'] } },
      { name: 'CaptureTab.tsx', type: 'file', detail: { description: 'Create + browse captures: text/voice/URL/audio input, template buttons, filter/sort/expand/edit/delete', exports: ['default'], imports: ['BrainClient (Capture, Project types)'], usedBy: ['BrainClient'] } },
      { name: 'ChatTab.tsx', type: 'file', detail: { description: 'RAG chat: pinned context mode, conversation history, context capture display, mark-reviewed button', exports: ['default'], imports: ['BrainClient (Capture type)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'SearchTab.tsx', type: 'file', detail: { description: 'Semantic search UI: query input → synthesis display → relevant capture cards → follow-up question buttons', exports: ['default'], imports: ['BrainClient (Capture type)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'GraphTab.tsx', type: 'file', detail: { description: 'Force-directed knowledge graph: custom physics sim, canvas pan/zoom, batch relate, project/type filters', exports: ['default'], imports: ['BrainClient (Capture, Project types)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'GrowthTab.tsx', type: 'file', detail: { description: '52-week heatmap, streak, spaced rep queue, task manager, weekly AI summary, and AI digest — all as collapsable sections in one view', exports: ['default'], imports: ['BrainClient (Capture type)'], usedBy: ['BrainClient'] } },
      { name: 'DigestTab.tsx', type: 'file', detail: { description: 'AI digest logic (themes, momentum, highlights, insight, pendingTasks, forgottenIdeas). No longer a standalone tab — embedded as a collapsable section inside GrowthTab.', exports: ['default'], imports: ['BrainClient (Capture type)'], usedBy: ['GrowthTab (collapsable section)'] } },
      { name: 'CaptureDetailModal.tsx', type: 'file', detail: { description: 'Universal expand/edit/delete modal replacing per-tab inline logic. Shared across ChatTab, GraphTab, SearchTab, and SearchOverlay.', exports: ['default'], imports: ['BrainClient (Capture type)'], usedBy: ['ChatTab', 'GraphTab', 'SearchTab', 'SearchOverlay'] } },
      { name: 'SearchOverlay.tsx', type: 'file', detail: { description: 'Cmd+K quick-search modal: instant client-side filter across captures by text/title/type/project', exports: ['default'], imports: ['BrainClient (Capture, Project types)', 'CaptureDetailModal'], usedBy: ['BrainClient'] } },
      { name: 'ArchitectureTab.tsx', type: 'file', detail: { description: 'Desktop-only system explorer: Overview, Data Flows, File Tree, AI Pipeline views. Visual documentation of the entire app.', exports: ['default'], imports: [], usedBy: ['BrainClient'] } },
    ],
  },
  {
    name: 'lib', type: 'dir', children: [
      {
        name: 'supabase', type: 'dir', children: [
          { name: 'client.ts', type: 'file', detail: { description: 'createBrowserClient — client-side Supabase instance using browser cookies (for BrainClient polling)', exports: ['createClient'], imports: ['@supabase/ssr'], usedBy: ['BrainClient'] } },
          { name: 'server.ts', type: 'file', detail: { description: 'createServerClient — server-side Supabase that reads cookies from Next.js headers() (for API routes + server pages)', exports: ['createClient'], imports: ['@supabase/ssr', 'next/headers'], usedBy: ['All API routes', 'Server pages', 'middleware.ts'] } },
        ],
      },
    ],
  },
  { name: 'middleware.ts', type: 'file', detail: { description: 'Auth guard: unauthenticated requests to /brain → redirect to /login; passes /auth/callback through unchanged', exports: ['middleware', 'config (matcher)'], imports: ['lib/supabase/server', 'next/server'], usedBy: ['Next.js (auto-applied to all matched routes)'] } },
  { name: 'public/sw.js', type: 'file', detail: { description: 'Service Worker: displays push notifications with actions; routes clicks via postMessage back to the React app', exports: [], imports: [], usedBy: ['BrainClient (navigator.serviceWorker.register("/sw.js"))'] } },
  { name: 'vercel.json', type: 'file', detail: { description: 'Vercel deployment config: two daily cron jobs (review-reminder + task-due) scheduled via crons array', exports: [], imports: [], usedBy: ['Vercel deployment platform'] } },
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
  maxTokens: number;
  description: string;
  steps: PipelineStep[];
}> = {
  categorize: {
    title: 'Capture Categorization',
    route: '/api/capture',
    model: 'claude-sonnet-4-6',
    maxTokens: 150,
    description: 'Assigns type, project name, and short title to every new capture',
    steps: [
      { label: 'Context gathered', type: 'input', content: `capture.text  (what the user typed / spoke)

URL enrichment (if URL detected in text):
  YouTube → full transcript via youtube-transcript pkg
  Web page  → og:title + og:description from page HTML

DB query: existing project names for this user` },
      { label: 'System prompt', type: 'system', content: `You are a personal knowledge assistant.
Categorize this capture and return ONLY valid JSON.

Available types: Idea | Link | Task | Learning | Note
Existing projects: {projectNames.join(", ")}

Return exactly: {"type":"...","project":"...","title":"..."}
Use an existing project name or invent a short new one.` },
      { label: 'User message', type: 'user', content: `{captureText}

{enrichedURLContent  // appended if URL was enriched}` },
      { label: 'Model response', type: 'response', content: `{"type": "Learning", "project": "React", "title": "Concurrent features in React 19"}` },
      { label: 'Parse → store → trigger relate', type: 'store', content: `const { type, project, title } = JSON.parse(response.content[0].text)

INSERT INTO captures {
  text, title, type, project, user_id,
  created_at: now(), starred: false, related_ids: []
}

// async, non-blocking:
fetch("/api/relate", { method:"POST", body: { captureId } })` },
    ],
  },
  chat: {
    title: 'RAG Chat',
    route: '/api/chat',
    model: 'claude-sonnet-4-6',
    maxTokens: 600,
    description: 'Keyword-based context retrieval from captures + conversational Claude response',
    steps: [
      { label: 'Context selection algorithm', type: 'input', content: `Receive: { message, history[≤6 turns], pinnedCaptureId? }

// Keyword scoring
const tokens = message.split(/\s+/)
for each capture:
  score = count how many tokens appear in
          capture.title + capture.text +
          capture.type + capture.project

Sort captures by score DESC
Take top 7  (top 8 if no pinned capture)
Prepend pinnedCapture at position 0 (always)` },
      { label: 'System prompt', type: 'system', content: `You are a helpful second brain assistant.
Answer the user's question based on their personal knowledge base.

${`[PINNED CAPTURE — answer primarily about this]:
{pinnedCapture.title}
{pinnedCapture.text}

`}[RELATED CONTEXT FROM KNOWLEDGE BASE]:
{topCaptures.map(c => c.title + "\\n" + c.text).join("\\n---\\n")}` },
      { label: 'User message + history', type: 'user', content: `// messages array sent to Claude:
[
  { role: "user",      content: "<turn 1>" },
  { role: "assistant", content: "<turn 1 reply>" },
  ...up to 6 turns...
  { role: "user",      content: "{currentMessage}" }  // ← current
]` },
      { label: 'Model response', type: 'response', content: `Plain text answer — NOT JSON.
Conversational tone, references the provided context.
Max 600 tokens.` },
      { label: 'Display + optionally mark reviewed', type: 'parse', content: `No parsing — plain text rendered directly.
Appended to local chatHistory state in ChatTab.

If user clicks "Mark Reviewed":
  PATCH /api/capture/{pinnedId}
  body: { last_reviewed_at: new Date().toISOString() }` },
    ],
  },
  search: {
    title: 'Semantic Search',
    route: '/api/search',
    model: 'claude-sonnet-4-6',
    maxTokens: 500,
    description: 'Synthesizes insights across the full knowledge base for a given query',
    steps: [
      { label: 'Catalogue build', type: 'input', content: `SELECT id, type, project, title, text
  FROM captures
  WHERE user_id = $uid
  ORDER BY created_at DESC
  LIMIT 100

// Format each capture as one line:
const catalogue = captures.map(c =>
  \`\${c.id} | \${c.type} | \${c.project} | \${c.title} | \${c.text.slice(0,100)}\`
).join("\\n")` },
      { label: 'System prompt', type: 'system', content: `You are a second brain assistant analyzing the user's personal knowledge base.

KNOWLEDGE BASE:
{catalogue}` },
      { label: 'User message', type: 'user', content: `Query: {userQuery}

Return JSON (no other text):
{
  "synthesis":         "2–4 paragraphs of insight",
  "relevantIds":       ["id1", "id2", ...],  // max 8
  "followUpQuestions": ["Q1?", "Q2?", "Q3?"]
}` },
      { label: 'Model response', type: 'response', content: `{
  "synthesis": "Based on your notes, the main themes around X are...",
  "relevantIds": ["abc123", "def456", "ghi789"],
  "followUpQuestions": [
    "How does X relate to Y in your recent work?",
    "What patterns have emerged across these captures?",
    "What would be your next step given these insights?"
  ]
}` },
      { label: 'Parse → render', type: 'parse', content: `const { synthesis, relevantIds, followUpQuestions } = JSON.parse(res)

→ Render synthesis text block prominently at top
→ Filter capture list to show only relevantIds (highlighted)
→ Render 3 follow-up buttons below synthesis
   onClick: setQuery(q) + submit → new search cycle` },
    ],
  },
  relate: {
    title: 'Semantic Relate',
    route: '/api/relate',
    model: 'claude-sonnet-4-6',
    maxTokens: 200,
    description: 'Discovers semantically similar captures and links them bidirectionally in the DB',
    steps: [
      { label: 'Data fetch', type: 'input', content: `// Target capture
SELECT * FROM captures WHERE id = captureId

// Comparison pool
SELECT id, type, project, title, text
  FROM captures
  WHERE id != captureId AND user_id = $uid
  ORDER BY created_at DESC
  LIMIT 50` },
      { label: 'System prompt', type: 'system', content: `You are a second brain assistant.
Find which captures are semantically related to the target.
Return ONLY a JSON array of IDs — no other text.` },
      { label: 'User message', type: 'user', content: `TARGET:
{id} | {type} | {project} | {title} | {text}

COMPARE AGAINST:
{id1} | {type} | {project} | {title} | {text}
{id2} | ...
...

Return: ["id3", "id7"]
Only include captures with genuine thematic or conceptual overlap.` },
      { label: 'Model response', type: 'response', content: `["abc123", "def456"]
// or [] if no meaningful connections found` },
      { label: 'Bidirectional DB update', type: 'store', content: `const relatedIds = JSON.parse(response)

for (const relatedId of relatedIds) {
  // Add relatedId to target's related_ids array
  await supabase.rpc("array_append_unique",
    { row_id: captureId, value: relatedId })

  // Add target to related capture's array (bidirectional)
  await supabase.rpc("array_append_unique",
    { row_id: relatedId, value: captureId })
}
// Result: undirected semantic graph stored in related_ids[]` },
    ],
  },
  summary: {
    title: 'Weekly Summary',
    route: '/api/summary/weekly',
    model: 'claude-sonnet-4-6',
    maxTokens: 400,
    description: 'Analyzes the week\'s captures and generates personal growth insights',
    steps: [
      { label: 'Weekly data fetch', type: 'input', content: `// Calculate Monday 00:00 and Sunday 23:59 for current week
const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
const weekEnd   = endOfWeek(new Date(), { weekStartsOn: 1 })

SELECT type, project, title, text
  FROM captures
  WHERE user_id = $uid
  AND created_at BETWEEN weekStart AND weekEnd
  ORDER BY created_at ASC` },
      { label: 'System prompt', type: 'system', content: `You are a personal growth coach analyzing someone's weekly knowledge captures.
Be specific, encouraging, and honest. Focus on patterns and momentum.` },
      { label: 'User message', type: 'user', content: `My captures this week:
{captures.map(c => \`[\${c.type}] \${c.title}: \${c.text}\`).join("\\n")}

Return JSON:
{
  "highlights": "3–4 notable captures or insights",
  "themes":     "2–3 main themes that emerged",
  "insight":    "1 key observation about thinking patterns",
  "momentum":   "high | medium | low"
}` },
      { label: 'Model response', type: 'response', content: `{
  "highlights": "Strong focus on distributed systems — 3 deep captures about consensus...",
  "themes": "Technical depth, product thinking, decision frameworks",
  "insight": "You\'re consistently connecting implementation details to user impact",
  "momentum": "high"
}` },
      { label: 'Upsert → display history', type: 'store', content: `const parsed = JSON.parse(response)

// Insert or overwrite for this week
INSERT INTO summaries (user_id, week_start, data)
VALUES ($uid, $weekStart, $parsed)
ON CONFLICT (user_id, week_start)
DO UPDATE SET data = EXCLUDED.data

GrowthTab reads:
  • Latest summary displayed as top card
  • Scrollable history of all past weeks
  • momentum value → color indicator (green/amber/muted)` },
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
          {(['capture_tab', 'chat_tab', 'search_tab', 'graph_tab', 'growth_tab', 'digest_tab'] as const).map(id => (
            <NodeBox key={id} id={id} label={id.replace('_tab', '')} layer="frontend" small />
          ))}
        </div>
      </LayerRow>

      <Connector from="frontend" to="api" />

      <LayerRow layer="api">
        {[
          { id: 'api_capture',      label: '/api/capture',       sub: 'URL enrich → categorize' },
          { id: 'api_chat',         label: '/api/chat',          sub: 'RAG → reply' },
          { id: 'api_search',       label: '/api/search',        sub: 'Catalogue synthesis' },
          { id: 'api_relate',       label: '/api/relate',        sub: 'Semantic link' },
          { id: 'api_relate_batch', label: '/api/relate/batch',  sub: 'Bulk link' },
          { id: 'api_transcribe',   label: '/api/transcribe',    sub: 'Audio → text' },
          { id: 'api_summary',      label: '/api/summary/weekly',sub: 'Weekly analysis' },
        ].map(n => (
          <NodeBox key={n.id} id={n.id} label={n.label} sub={n.sub} layer="api" />
        ))}
      </LayerRow>

      <Connector from="api" to="ai" />

      <LayerRow layer="ai">
        <NodeBox id="claude" label="Claude Sonnet 4.6" sub="Categorize · Chat · Search · Relate · Summary" layer="ai" />
        <NodeBox id="groq" label="Groq Whisper" sub="Audio transcription only" layer="ai" />
      </LayerRow>

      <Connector from="ai" to="db" />

      <LayerRow layer="db">
        <NodeBox
          id="supabase"
          label="Supabase · PostgreSQL"
          sub="captures · projects · summaries · push_subscriptions · Google OAuth · RLS"
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
  { id: 'mp_claude', col: 3, row: 2, label: 'Claude Sonnet',   color: '#a78bfa'                              },
  { id: 'mp_groq',   col: 3, row: 3, label: 'Groq Whisper',    color: '#a78bfa'                              },
  { id: 'mp_db',     col: 3, row: 4, label: 'Supabase DB',     color: '#34d399'                              },
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
  { from: 'mp_are',   to: 'mp_claude'},
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
                ? 'Claude Sonnet 4.6 via @anthropic-ai/sdk — used by all AI-powered API routes: categorize, chat, search, relate, summary.'
                : selNode.id === 'mp_groq'
                ? 'Groq Whisper via groq-sdk — used by /api/transcribe for audio-to-text. Faster and cheaper than OpenAI Whisper.'
                : selNode.id === 'mp_db'
                ? 'Supabase PostgreSQL. Tables: captures, projects, summaries, push_subscriptions. Accessed exclusively via supabase/server.ts.'
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
          <span className="text-[10px] font-mono px-2 py-1 rounded border border-amber/30 text-amber bg-amber/10">
            max_tokens: {pipeline.maxTokens}
          </span>
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
