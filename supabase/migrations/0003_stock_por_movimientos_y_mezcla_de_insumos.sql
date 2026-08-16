-- El stock deja de ser un número suelto que sube y baja sin dejar rastro.
-- Pasa a derivarse de un libro de movimientos, por insumo y por establecimiento:
-- el bidón que está en La Constancia no sirve para pulverizar en Luján.
-- Al no guardarse nunca el saldo, el saldo y su historia no pueden discrepar.
alter table public.insumos drop column stock;

create table public.movimientos_stock (
  id                  uuid primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insumo_id           uuid not null references public.insumos(id) on delete cascade,
  establecimiento_id  uuid not null references public.establecimientos(id) on delete cascade,
  fecha               date not null default current_date,
  tipo                text not null check (tipo in ('compra','aplicacion','ajuste','traslado')),
  cantidad            numeric(14,3) not null,
  precio_unitario     numeric(12,4),
  orden_id            uuid references public.ordenes(id) on delete set null,
  nota                text not null default '',
  creado_en           timestamptz not null default now()
);
comment on table public.movimientos_stock is
  'Libro de stock. La existencia de un insumo en un campo es la suma de sus movimientos.';
comment on column public.movimientos_stock.cantidad is
  'Con signo: positivo entra, negativo sale. Una aplicación siempre es negativa.';

-- Una pulverización real lleva mezcla de tanque: herbicida, coadyuvante,
-- insecticida. Un solo insumo por trabajo no alcanzaba.
create table public.orden_insumos (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  orden_id    uuid not null references public.ordenes(id) on delete cascade,
  insumo_id   uuid not null references public.insumos(id) on delete restrict,
  dosis_ha    numeric(12,4) not null check (dosis_ha > 0),
  creado_en   timestamptz not null default now(),
  unique (orden_id, insumo_id)
);
comment on column public.orden_insumos.dosis_ha is
  'Numérica, no texto: de acá sale cuánto stock se descuenta y cuánto falta comprar.';
comment on column public.orden_insumos.insumo_id is
  'on delete restrict: no se borra un insumo que un trabajo está usando.';

-- La dosis y el insumo sueltos de la orden se mudaron a orden_insumos.
alter table public.ordenes drop column insumo_id;
alter table public.ordenes drop column dosis;

alter table public.movimientos_stock enable row level security;
alter table public.orden_insumos     enable row level security;

create policy "movimientos propios" on public.movimientos_stock
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "insumos del trabajo propios" on public.orden_insumos
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index on public.movimientos_stock (user_id, insumo_id, establecimiento_id);
create index on public.movimientos_stock (user_id, orden_id);
create index on public.orden_insumos     (user_id, orden_id);
