create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  work_description text not null,
  location text,
  date date,
  responsible_person text,
  worker_count integer,
  generated_content jsonb,
  created_at timestamptz default now() not null
);

alter table public.risk_assessments enable row level security;

create policy "Users can manage own risk assessments"
  on public.risk_assessments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
