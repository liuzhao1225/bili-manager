-- Create the table for Bilibili accounts
create table if not exists bili_account (
  dede_user_id text primary key,
  username text not null,
  buvid3 text not null,
  sessdata text not null,
  bili_jct text not null,
  server_chan_key text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table bili_account enable row level security;

-- Create a policy that allows all operations for now (MVP)
-- In production, you might want to restrict this
drop policy if exists "Enable all operations for all users" on bili_account;
create policy "Enable all operations for all users"
on bili_account
for all
using (true)
with check (true);

create table if not exists youdub_task (
  task_key text primary key,
  youtube_id text not null,
  source_type text not null check (source_type in ('video', 'short')),
  url text not null,
  priority int not null default 1,
  effective_priority int generated always as (
    case
      when status = 'failed' then -1
      when status = 'succeeded' then 0
      else priority
    end
  ) stored,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed', 'paused')),
  skip_prechecks boolean not null default false,
  source text,
  phase text,
  attempt_count int not null default 0,
  locked_by text,
  locked_until timestamp with time zone,
  failure_reason text,
  failure_detail text,
  zh_bvid text,
  en_bvid text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  started_at timestamp with time zone,
  finished_at timestamp with time zone
);

create table if not exists youdub_task_artifact (
  task_key text not null references youdub_task(task_key) on delete cascade,
  artifact_type text not null check (
    artifact_type in (
      'video_info',
      'asr',
      'asr_fixed',
      'translation',
      'normalized_translation',
      'timings',
      'upload_record',
      'subtitles'
    )
  ),
  data jsonb,
  text_content text,
  sha256 text,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (task_key, artifact_type)
);

create index if not exists youdub_task_claim_idx
on youdub_task (status, priority desc, created_at asc);

create index if not exists youdub_task_lock_idx
on youdub_task (locked_until)
where status = 'processing';

create index if not exists youdub_task_status_idx
on youdub_task (status, effective_priority desc, created_at asc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_youdub_task_updated_at on youdub_task;
create trigger set_youdub_task_updated_at
before update on youdub_task
for each row execute function set_updated_at();

alter table youdub_task enable row level security;
alter table youdub_task_artifact enable row level security;

drop policy if exists "Enable all operations for youdub_task" on youdub_task;
create policy "Enable all operations for youdub_task"
on youdub_task
for all
using (true)
with check (true);

drop policy if exists "Enable all operations for youdub_task_artifact" on youdub_task_artifact;
create policy "Enable all operations for youdub_task_artifact"
on youdub_task_artifact
for all
using (true)
with check (true);

create or replace function claim_youdub_task(
  p_worker_id text,
  p_lock_seconds int default 3600
)
returns setof youdub_task
language plpgsql
as $$
begin
  return query
  with candidate as (
    select task_key
    from youdub_task
    where
      status = 'queued'
      or (
        status = 'processing'
        and locked_until is not null
        and locked_until < timezone('utc'::text, now())
      )
    order by priority desc, created_at asc
    for update skip locked
    limit 1
  )
  update youdub_task task
  set
    status = 'processing',
    locked_by = p_worker_id,
    locked_until = timezone('utc'::text, now()) + make_interval(secs => p_lock_seconds),
    started_at = coalesce(task.started_at, timezone('utc'::text, now())),
    attempt_count = task.attempt_count + 1,
    phase = coalesce(task.phase, 'claimed'),
    failure_reason = null,
    failure_detail = null
  from candidate
  where task.task_key = candidate.task_key
  returning task.*;
end;
$$;
