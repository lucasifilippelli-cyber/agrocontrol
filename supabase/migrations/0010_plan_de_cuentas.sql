/* Plan de cuentas. El código es texto y no número para permitir jerarquías
   como "1.1.03" sin pelearse con el orden numérico. `padre` guarda el código
   de la cuenta que agrupa, no un id, para que el plan se pueda leer y editar
   sin resolver referencias. */
create table public.cuentas (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo     text not null,
  nombre     text not null,
  tipo       text not null check (tipo in ('activo','pasivo','patrimonio','resultado')),
  padre      text,
  creado_en  timestamptz not null default now(),
  unique (user_id, codigo)
);

alter table public.cuentas enable row level security;

create policy cuentas_propias on public.cuentas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
