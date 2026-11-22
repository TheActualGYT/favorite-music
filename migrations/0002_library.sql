create table if not exists library (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
