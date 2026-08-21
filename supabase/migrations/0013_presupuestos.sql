/* Lo que falta gastar y no sale de ninguna orden de trabajo: cosecha, flete, el
   arrendamiento que queda, estructura. Sin esto, proyectar ingresos contra
   costos que sólo incluyen lo ya gastado da un resultado sistemáticamente
   mejor que la realidad. */
create table public.presupuestos (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campania_id  uuid not null references public.campanias(id) on delete cascade,
  categoria    text not null,
  monto        numeric(14,2) not null check (monto >= 0),
  moneda       text not null default 'USD' check (moneda in ('USD','ARS')),
  tipo_cambio  numeric(12,4),
  nota         text not null default '',
  creado_en    timestamptz not null default now(),
  unique (campania_id, categoria)
);

alter table public.presupuestos enable row level security;

create policy presupuestos_propios on public.presupuestos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
