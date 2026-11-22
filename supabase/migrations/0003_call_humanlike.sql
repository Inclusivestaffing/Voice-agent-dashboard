-- How human the agent sounded on each call: voice measured from the recording + Claude's review.
create table if not exists public.call_humanlike (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  call_id      text not null,
  result       jsonb not null,           -- HumanlikeResult, or { skipped: true, reason } for calls that can't be judged
  score        integer,                  -- 0–100, null when skipped
  analyzed_at  timestamptz not null default now(),
  primary key (workspace_id, call_id)
);
create index if not exists call_humanlike_score on public.call_humanlike (workspace_id, score);

alter table public.call_humanlike enable row level security;
-- Members can read their workspace's results; writes go through the server (service role).
create policy hl_read on public.call_humanlike for select using (public.is_member(workspace_id));
