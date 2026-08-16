-- Telegram no manda un usuario de Supabase: manda un chat. Hay que atarlos.
-- El código lo genera la app, el productor se lo manda al bot una sola vez, y
-- desde ahí ese chat queda ligado a su cuenta.
alter table public.perfiles
  add column codigo_telegram text,
  add column codigo_expira timestamptz;

comment on column public.perfiles.codigo_telegram is
  'Código de un solo uso para vincular un chat. Se borra al usarse.';

create table public.telegram_cuentas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  chat_id      bigint not null unique,
  nombre       text not null default '',
  vinculado_en timestamptz not null default now()
);
comment on table public.telegram_cuentas is
  'Qué chat de Telegram escribe en nombre de qué cuenta.';

alter table public.telegram_cuentas enable row level security;

-- El productor puede ver y desvincular sus propios chats. Escribir el vínculo
-- lo hace la función con la clave de servicio, que no pasa por RLS.
create policy "chats propios" on public.telegram_cuentas
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index on public.telegram_cuentas (user_id);
