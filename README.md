# Voice Agent Analytics (Retell + Claude)

A dashboard for Retell voice agents. It:
- pulls every call through the Retell API;
- shows the analytics Retell's dashboard has, plus conversation and audio metrics;
- has Claude explain why each call worked or failed;
- generates branded client reports (HTML + PDF) for any period.

Each workspace is one client, with its own Retell key, branding, team and reports.

## What's inside

| Area | What it does |
|---|---|
| **Sync** | Retell webhook (real time) + `v3/list-calls` backfill + a 15-minute cron safety net. `get-call` fetches each call's transcript, word timestamps, tool calls, recordings and latency. |
| **Metrics matching Retell** | Call counts; successful/unsuccessful; status; inbound/outbound; disconnection reason; sentiment; success, picked-up, transfer and voicemail rates; duration and end-to-end latency (avg/median/p90/min/max); cost; max concurrency. Breakdowns by agent, version, outcome, root cause, disconnection, status, call type, direction and post-call fields. Hour/day/week/month buckets and previous-period comparison. |
| **Custom charts** | A Retell-style builder: pick a metric, measure, chart type, bucket and breakdown, and save it to the workspace dashboard. |
| **"Listening"** | `lib/metrics/timing.ts` uses word timestamps to measure time to first word, response gaps, barge-ins (ignoring "ok"/"yeah"), overtalk, dead air, monologues, repetition loops and tool failures. `lib/metrics/audio.ts` decodes the two-channel recording with ffmpeg and detects speech on each channel separately: did the caller speak at all, volume, noise and clipping. |
| **AI diagnosis** | Claude **Sonnet 5.5** returns structured JSON for each call: outcome, intent, success and why, what worked and what failed (each with a clickable timestamp), root causes, severity, a concrete fix, exact prompt text to add, a 6-dimension scorecard, details captured, and whether follow-up is needed. The agent's own Retell prompt is included and cached, so the call is judged against what the agent was told to do. Obvious calls (silent, spam, voicemail, no data) are classified by rules without calling the AI. Backfills can use the Batches API at half price. |
| **Insights** | Top issues ranked by impact (with fixes, prompt changes and example calls), agent version comparison, intent success rates, scorecard, a review queue, and a follow-up list. |
| **Reports** | Pick a period, agent and filters. Every number comes from SQL; Claude **Opus 5.5** writes the narrative, and a check flags any number the model used that isn't in the data. Layout matches the Open Water Marine report. Includes a share link and PDF export (headless Chromium). |
| **Workspaces** | Supabase Auth, roles (owner / admin / user / client, plus “View as” preview), email invites, row-level security per workspace, AES-256-GCM encrypted Retell keys. |
| **Extras** | Saved filter views, CSV export, alert rules (Slack-compatible webhook), transcript full-text search. |

## Setup

1. **Supabase.** Create a project, then run `supabase/migrations/0001_init.sql`: paste it into the SQL editor, or run `supabase db push`. Under Auth → URL configuration, add `http://localhost:3000/auth/callback` and your production URL.
2. **Env.** Copy `.env.example` to `.env.local` and fill in the values. Generate `ENCRYPTION_KEY` with `openssl rand -base64 32`.
3. **Run.**
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   npm test           # metrics engine unit tests
   ```
4. **Create a workspace** and paste the client's Retell API key. The last 30–365 days of calls import in the background.
5. **Real-time updates.** Copy the webhook URL from **Settings** into Retell, either per agent (Webhook URL) or account-wide.
6. **Deploy to Vercel.** Set the same env vars. `vercel.json` schedules `/api/cron` every 15 minutes; set `CRON_SECRET`. PDF export uses `@sparticuz/chromium` on Vercel. For local PDF export, set `CHROME_PATH`.

Dev-only preview that needs no database: **`/demo`**. It runs the real Overview, Call History, call detail, Insights and Reports screens on the 44 Open Water Marine calls. Disabled in production unless `DEMO_MODE=1`.

## Costs

- **Rules:** silent, spam, voicemail and no-data calls never reach the AI.
- **Per-call analysis:** Sonnet 5.5 costs roughly 1–2¢ per call. The cached agent prompt cuts repeat input cost. "Bulk analyze" uses the Batches API, which is 50% cheaper.
- **Reports:** one Opus 5.5 call per report.

## Key files

- `lib/retell/*`: client, sync, normalize
- `lib/metrics/*`: stats, timing, audio, classify, concurrency, aggregate
- `lib/ai/*`: schemas, prompts, analyzeCall
- `lib/pipeline/*`: per-call pipeline and batches
- `lib/reports/build.ts`: snapshot and narrative
- `lib/insights.ts`
- `app/w/[slug]/{overview,calls,calls/[callId],insights,reports,settings}`
- `app/r/[token]`: public report
- `app/api/{webhooks/retell,cron,reports/[id]/pdf,w/[id]/export}`

## Retell parity

- **Date presets:** Today, Last 7 days, Last 4 weeks, Last 3 months, Week/Month/Year to date, All time, Custom, all in the workspace timezone.
- **Layout checked against a live Retell dashboard (Nov 2026):** the Retell section reproduces Retell's default Call Dashboard chart for chart and in the same order: Call Counts / Call Duration / Call Latency numbers; Call Counts over time and Concurrency Used; Call Successful, Disconnection Reason, User Sentiment and Phone inbound/outbound donuts; Call Picked Up, Successful and Transfer Rate over time; Voicemail Rate, Average call duration and Average Latency; Disconnection Reason over time; Picked Up and Transfer Rate by agent.
- **Dashboard-wide Breakdown** (Agent, Agent Version, Disconnection Reason, Call Status, Call Successful, Call Type, Post Call Extraction field). Custom ranges take start and end times; there is a **Transfer Agent** filter.
- **Retell analytics section:** Call Counts, Call Successful Rate, Call Picked Up Rate, Call Transfer Rate, Voicemail Rate, Call Duration (avg/median/p90), End to End Latency, Concurrency Used, Combined cost, Call Successful split, Disconnection Reason, User Sentiment, Phone Inbound/Outbound, Call Status. Hour/Day/Week/Month buckets and previous-period comparison.
- **Call History:** Retell's columns (Time, Duration, Channel Type, Cost, Session ID, End Reason, Session Status, User Sentiment, From, To, Session Outcome, End to End Latency, Batch Call ID), shown or hidden with "Customize fields", plus the AI columns.
- **Filters:** the same four tabs as Retell (Base, Post Call Extraction, Metadata, Dynamic Variables), plus an AI analysis tab.

## Security

- **Access control:** every server action and API route re-checks workspace membership and role on the server. Row-level security protects every table. Admins can't escalate to owner, either through invites or through direct REST calls. Invites are only accepted for verified emails.
- **Secrets:** Retell keys are encrypted with AES-256-GCM and never sent to the browser. The service-role key is used only in server-only modules.
- **Input validation:** all input is validated. JSON-path filter keys and `or()` values are whitelisted (prevents PostgREST filter injection), and chart configs are whitelisted. Logo uploads are checked by file signature (PNG/JPEG/WebP only, no SVG). CSV export neutralises spreadsheet formulas.
- **SSRF:** alert webhooks must be public https URLs. This is checked both when saving and again before every send (DNS resolution, private/link-local ranges blocked, no redirects). ffmpeg only fetches https recordings, with a protocol whitelist. The PDF renderer may only load the app's own origin and fonts.
- **Redirects and origins:** relative-only redirects block open redirects. The public origin comes from `NEXT_PUBLIC_APP_URL`, never the Host header.
- **Headers:** CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and HSTS in production. Public report links are `noindex`, `no-referrer` and `no-store`, and can be revoked (token rotation).
- **Webhooks and cron:** Retell webhooks are HMAC-verified, size-capped and ID-validated. The cron secret is compared in constant time.
- **AI prompts:** both prompts treat transcripts and call data as untrusted, so instructions spoken by a caller are ignored.
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities. Next's bundled PostCSS is pinned via `overrides`.
