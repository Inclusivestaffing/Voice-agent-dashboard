-- Voice Agent Analytics — initial schema
-- Every tenant-scoped table carries workspace_id and is protected by RLS via is_member().

create extension if not exists "pgcrypto";

-- ───────────────────────── Workspaces & membership ─────────────────────────
create table public.workspaces (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  logo_url           text,
  brand_primary      text not null default '#facc15',
  brand_ink          text not null default '#0a0a0a',
  timezone           text not null default 'America/Chicago',
  business_hours     jsonb not null default '{"mon":[8.5,17.5],"tue":[8.5,17.5],"wed":[8.5,17.5],"thu":[8.5,17.5],"fri":[8.5,17.5]}'::jsonb,
  success_definition text not null default 'The caller''s request was completed: an appointment was booked, the caller was connected to the right person, or their contact details and need were captured for follow-up.',
  agent_display_name text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

-- owner > admin > user (your team, read-only) > client (the business the agent serves).
create type public.member_role as enum ('owner', 'admin', 'user', 'client');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null default 'user',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         public.member_role not null default 'user',
  invited_by   uuid references auth.users(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, email)
);

-- Retell credentials live in their own table that the browser can never read.
create table public.retell_connections (
  workspace_id      uuid primary key references public.workspaces(id) on delete cascade,
  api_key_encrypted text not null,
  api_key_last4     text not null,
  last_synced_at    timestamptz,
  last_sync_error   text,
  created_at        timestamptz not null default now()
);

-- ───────────────────────── Agents ─────────────────────────
create table public.agents (
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  agent_id       text not null,
  agent_name     text,
  latest_version integer,
  response_engine jsonb,
  prompt_text    text,           -- the agent's intended behaviour (LLM prompt / flow), fed to the AI judge
  prompt_fetched_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, agent_id)
);

-- ───────────────────────── Calls ─────────────────────────
create table public.calls (
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  call_id              text not null,
  agent_id             text,
  agent_name           text,
  agent_version        integer,
  call_type            text,
  direction            text,
  call_status          text,
  from_number          text,
  to_number            text,
  start_ts             timestamptz,
  end_ts               timestamptz,
  duration_ms          integer,
  disconnection_reason text,
  transfer_destination text,
  batch_call_id        text,
  user_sentiment       text,
  call_successful      boolean,
  in_voicemail         boolean,
  call_summary         text,
  custom_analysis      jsonb,
  metadata             jsonb,
  dynamic_variables    jsonb,
  combined_cost_cents  numeric,
  e2e_p50_ms           numeric,
  e2e_p90_ms           numeric,
  llm_p50_ms           numeric,
  tts_p50_ms           numeric,
  asr_p50_ms           numeric,
  recording_url        text,
  recording_multi_channel_url text,
  public_log_url       text,
  transcript_text      text,
  transcript_tsv       tsvector generated always as (to_tsvector('english', coalesce(transcript_text, ''))) stored,
  has_details          boolean not null default false,   -- true once get-call (with transcript) has been fetched
  raw                  jsonb not null,
  synced_at            timestamptz not null default now(),
  primary key (workspace_id, call_id)
);
create index calls_ws_start_idx on public.calls (workspace_id, start_ts desc);
create index calls_ws_agent_idx on public.calls (workspace_id, agent_id, agent_version);
create index calls_ws_from_idx  on public.calls (workspace_id, from_number);
create index calls_ws_batch_idx on public.calls (workspace_id, batch_call_id);
create index calls_tsv_idx      on public.calls using gin (transcript_tsv);

-- Deterministic per-call conversation & audio metrics.
create table public.call_metrics (
  workspace_id            uuid not null,
  call_id                 text not null,
  turns                   integer,
  agent_turns             integer,
  user_turns              integer,
  agent_talk_s            numeric,
  user_talk_s             numeric,
  talk_ratio              numeric,       -- agent share of total speech, 0..1
  time_to_first_word_s    numeric,
  avg_response_gap_s      numeric,
  p90_response_gap_s      numeric,
  max_response_gap_s      numeric,
  interruptions           integer,       -- user barges in while agent speaking (backchannels excluded)
  agent_interruptions     integer,       -- agent starts talking over the user
  overtalk_pct            numeric,
  dead_air_pct            numeric,
  longest_silence_s       numeric,
  longest_agent_monologue_s numeric,
  repetition_count        integer,       -- near-duplicate agent turns (loops)
  tool_calls              integer,
  tool_failures           integer,
  user_spoke              boolean,       -- transcript evidence the caller said anything
  -- audio-layer (from multi-channel recording)
  audio_analyzed          boolean not null default false,
  audio_user_speech_s     numeric,
  audio_agent_speech_s    numeric,
  audio_user_peak_db      numeric,
  audio_user_noise_db     numeric,
  audio_clipping_pct      numeric,
  audio_error             text,
  computed_at             timestamptz not null default now(),
  primary key (workspace_id, call_id),
  foreign key (workspace_id, call_id) references public.calls(workspace_id, call_id) on delete cascade
);

-- AI diagnosis per call.
create table public.call_analyses (
  workspace_id     uuid not null,
  call_id          text not null,
  outcome          text not null,
  success          boolean,
  severity         text,
  primary_root_cause text,
  root_causes      text[] not null default '{}',
  overall_score    numeric,
  analysis         jsonb not null,
  source           text not null,         -- 'rules' | 'llm'
  model            text,
  prompt_version   text not null,
  input_tokens     integer,
  output_tokens    integer,
  analyzed_at      timestamptz not null default now(),
  primary key (workspace_id, call_id),
  foreign key (workspace_id, call_id) references public.calls(workspace_id, call_id) on delete cascade
);
create index call_analyses_outcome_idx on public.call_analyses (workspace_id, outcome);

-- ───────────────────────── Reports, views, jobs ─────────────────────────
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  title         text not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  filters       jsonb not null default '{}'::jsonb,
  snapshot      jsonb not null,
  narrative     jsonb,
  status        text not null default 'ready',
  pdf_path      text,
  share_token   text unique default encode(gen_random_bytes(18), 'hex'),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create table public.saved_views (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  query        text not null,       -- URL query string of the filter state
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create table public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         text not null,          -- backfill | incremental | webhook
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  calls_seen   integer default 0,
  calls_upserted integer default 0,
  error        text
);

-- Custom dashboard charts (metric × measure × chart type × breakdown × bucket), like Retell's builder.
create table public.dashboard_charts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null,
  config       jsonb not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.dashboard_charts enable row level security;
create policy dc_read  on public.dashboard_charts for select using (public.is_member(workspace_id));
-- writes go through validated server actions (service role)

-- Anthropic Message Batches submitted for bulk (50%-off) call analysis.
create table public.ai_batches (
  id            text primary key,          -- Anthropic batch id
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  call_ids      text[] not null,
  status        text not null default 'in_progress',
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
alter table public.ai_batches enable row level security;

create table public.alert_rules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  metric       text not null,          -- success_rate | transfer_fail_count | negative_sentiment_rate | e2e_p90 | cost_sum | silent_hangup_rate
  comparator   text not null,          -- lt | gt
  threshold    numeric not null,
  window_minutes integer not null default 60,
  webhook_url  text,
  email        text,
  enabled      boolean not null default true,
  last_fired_at timestamptz,
  created_at   timestamptz not null default now()
);

-- Ask AI conversations. Private to the member who started them.
create table public.ai_chats (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null default 'New chat',
  messages     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index ai_chats_user_idx on public.ai_chats (workspace_id, user_id, updated_at desc);

-- ───────────────────────── RLS ─────────────────────────
create or replace function public.is_member(ws uuid, min_role public.member_role default 'client')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and case min_role
            when 'client' then true
            when 'user'   then m.role in ('user','admin','owner')
            when 'admin'  then m.role in ('admin','owner')
            when 'owner'  then m.role = 'owner'
          end
  );
$$;

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.retell_connections enable row level security;
alter table public.agents            enable row level security;
alter table public.calls             enable row level security;
alter table public.call_metrics      enable row level security;
alter table public.call_analyses     enable row level security;
alter table public.reports           enable row level security;
alter table public.saved_views       enable row level security;
alter table public.sync_runs         enable row level security;
alter table public.alert_rules       enable row level security;

create policy ws_read   on public.workspaces for select using (public.is_member(id));

create policy wm_read  on public.workspace_members for select using (public.is_member(workspace_id));
create policy wm_write on public.workspace_members for all using (public.is_member(workspace_id, 'owner')) with check (public.is_member(workspace_id, 'owner'));

create policy wi_rw on public.workspace_invites for all using (public.is_member(workspace_id, 'admin'))
  with check (public.is_member(workspace_id, 'admin') and (role <> 'owner' or public.is_member(workspace_id, 'owner')));

-- retell_connections: no browser policies at all → only the service role can touch it.

create policy ag_read on public.agents        for select using (public.is_member(workspace_id));
create policy ca_read on public.calls         for select using (public.is_member(workspace_id));
create policy cm_read on public.call_metrics  for select using (public.is_member(workspace_id));
create policy an_read on public.call_analyses for select using (public.is_member(workspace_id));
create policy rp_read on public.reports       for select using (public.is_member(workspace_id));
create policy sr_read on public.sync_runs     for select using (public.is_member(workspace_id));
create policy sv_read on public.saved_views   for select using (public.is_member(workspace_id));
create policy sv_ins  on public.saved_views   for insert with check (public.is_member(workspace_id) and created_by = auth.uid());
create policy sv_del  on public.saved_views   for delete using (public.is_member(workspace_id) and created_by = auth.uid());
create policy al_read on public.alert_rules   for select using (public.is_member(workspace_id, 'admin'));
-- Ask AI chats: only the member who started a chat can read or delete it; the server writes after a membership check.
alter table public.ai_chats enable row level security;
create policy aic_read on public.ai_chats for select using (user_id = auth.uid() and public.is_member(workspace_id));
create policy aic_del  on public.ai_chats for delete using (user_id = auth.uid() and public.is_member(workspace_id));

-- Ended calls that still need (re)analysis for the current prompt version.
create or replace function public.pending_calls(ws uuid, version text, lim integer default 50)
returns table (call_id text) language sql stable as $$
  select c.call_id from public.calls c
  left join public.call_analyses a on a.workspace_id = c.workspace_id and a.call_id = c.call_id
  where c.workspace_id = ws and c.call_status in ('ended', 'error', 'not_connected')
    and (a.call_id is null or a.prompt_version <> version)
    and not exists (select 1 from public.ai_batches b where b.workspace_id = ws and b.status = 'in_progress' and c.call_id = any(b.call_ids))
  order by c.start_ts desc nulls last
  limit lim;
$$;

-- Accept pending invites automatically when the invited email signs in.
create or replace function public.accept_invites_for_current_user()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; v_email text;
begin
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    select i.workspace_id, auth.uid(), i.role from public.workspace_invites i
    where lower(i.email) = lower(v_email) and i.accepted_at is null
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.workspace_invites set accepted_at = now()
    where lower(email) = lower(v_email) and accepted_at is null;
  return n;
end $$;

-- Storage bucket for logos and report PDFs (private; served through signed URLs).
insert into storage.buckets (id, name, public) values ('reports', 'reports', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict do nothing;

-- ───────────────────────── Function privileges ─────────────────────────
revoke execute on function public.pending_calls(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.accept_invites_for_current_user() from public, anon;
grant execute on function public.accept_invites_for_current_user() to authenticated;
revoke execute on function public.is_member(uuid, public.member_role) from public, anon;
grant execute on function public.is_member(uuid, public.member_role) to authenticated;
