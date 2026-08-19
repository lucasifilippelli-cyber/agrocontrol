create table public.clima_series (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  establecimiento_id uuid not null references public.establecimientos(id) on delete cascade,
  campania_id        uuid not null references public.campanias(id) on delete cascade,
  desde              date not null,
  hasta              date,
  lluvia             jsonb not null default '[]'::jsonb,
  eto                jsonb not null default '[]'::jsonb,
  creado_en          timestamptz not null default now(),
  unique (establecimiento_id, campania_id)
);

alter table public.clima_series enable row level security;

create policy clima_series_propias on public.clima_series
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
