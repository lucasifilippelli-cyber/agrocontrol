-- El grano de varios lotes se mezcla en el mismo camión y se vende junto, así
-- que la venta se registra por cultivo y campaña, no por lote. El resultado
-- por lote se reparte después, según cuánto grano puso cada uno.
create table public.ventas (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campania_id     uuid not null references public.campanias(id) on delete cascade,
  cultivo         text not null,
  fecha           date not null,
  tipo_operacion  text not null default 'disponible'
                  check (tipo_operacion in ('disponible','forward','futuro','canje')),
  toneladas       numeric(12,3) not null check (toneladas > 0),
  precio_tn       numeric(12,2) not null check (precio_tn >= 0),
  moneda          text not null default 'USD' check (moneda in ('USD','ARS')),
  tipo_cambio     numeric(12,4),
  comprador       text not null default '',
  fecha_entrega   date,
  nota            text not null default '',
  creado_en       timestamptz not null default now()
);
comment on column public.ventas.tipo_operacion is
  'disponible: entrega inmediata. forward: precio cerrado hoy, entrega futura. futuro: posición en mercado. canje: grano por insumos.';
comment on column public.ventas.tipo_cambio is
  'Pesos por dólar en la fecha de la operación. Sólo se usa si la moneda es ARS.';

-- Todo lo que cuesta y no es insumo: contratistas, fletes, arrendamiento,
-- cosecha de terceros, honorarios. Si no se puede atribuir a un cultivo,
-- queda como indirecto y se prorratea por hectárea sembrada.
create table public.gastos (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campania_id      uuid not null references public.campanias(id) on delete cascade,
  cultivo_lote_id  uuid references public.cultivo_lotes(id) on delete set null,
  fecha            date not null,
  categoria        text not null,
  descripcion      text not null default '',
  monto            numeric(14,2) not null check (monto >= 0),
  moneda           text not null default 'USD' check (moneda in ('USD','ARS')),
  tipo_cambio      numeric(12,4),
  proveedor        text not null default '',
  creado_en        timestamptz not null default now()
);
comment on column public.gastos.cultivo_lote_id is
  'Nulo cuando el gasto no se puede atribuir a un cultivo: ahí se prorratea por hectárea.';

alter table public.ventas enable row level security;
alter table public.gastos enable row level security;

create policy "ventas propias" on public.ventas
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "gastos propios" on public.gastos
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index on public.ventas (user_id, campania_id, cultivo);
create index on public.gastos (user_id, campania_id, cultivo_lote_id);
