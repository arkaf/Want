-- Items table
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  url text not null,
  domain text,
  title text,
  image text,
  price text,
  created_at timestamptz not null default now()
);

-- index for fast user fetch
create index if not exists idx_items_user_created on public.items(user_id, created_at desc);

-- Enable RLS
alter table public.items enable row level security;

-- Policies: owner-only
create policy "Users select own items"
  on public.items for select
  using (auth.uid() = user_id);

create policy "Users insert own items"
  on public.items for insert
  with check (auth.uid() = user_id);

create policy "Users delete own items"
  on public.items for delete
  using (auth.uid() = user_id);
