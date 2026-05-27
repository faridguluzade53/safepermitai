-- Run this in your Supabase SQL Editor

create table public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  document_type text not null,
  input_text text not null,
  generated_output text not null,
  created_at timestamptz default now() not null
);

-- Enable Row Level Security
alter table public.documents enable row level security;

-- Users can only read their own documents
create policy "Users can read own documents"
  on public.documents for select
  using (auth.uid() = user_id);

-- Users can insert their own documents
create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);
