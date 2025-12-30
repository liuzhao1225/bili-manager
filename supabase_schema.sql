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
create policy "Enable all operations for all users"
on bili_account
for all
using (true)
with check (true);

