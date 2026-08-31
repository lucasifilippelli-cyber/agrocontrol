/* Las facturas importadas, entre que se fotografían y que se confirman.

   El QR de AFIP es la verdad fiscal: cuit, fecha, tipo y número de comprobante
   e importe salen de ahí y no se pueden falsear. `neto`, `iva` y `percepciones`
   los completa el extractor más tarde, y su suma tiene que dar `importe` — si
   no cierra, la factura queda en 'no_cuadra' y no se puede confirmar.

   Ojo con la aritmética: los ítems suman el NETO, no el importe. En una factura
   A el total lleva IVA discriminado y percepciones adentro, así que exigir que
   los ítems sumen el total bloquearía casi todas las facturas reales.

   `qr_crudo` se guarda para poder reprocesar sin volver a fotografiar. La
   imagen original NO se guarda: ocupa, es dato sensible, y una vez extraída no
   agrega nada que no esté acá.

   La unicidad por (user_id, cuit, tipo_cmp, pto_vta, nro_cmp) es lo que impide
   que la misma factura entre dos veces y duplique el gasto. */
create table public.facturas (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cuit          text not null,
  razon_social  text not null default '',
  fecha         date not null,
  tipo_cmp      integer not null,
  pto_vta       integer not null,
  nro_cmp       integer not null,
  importe       numeric(14,2) not null check (importe > 0),
  moneda        text not null default 'ARS' check (moneda in ('ARS','USD')),
  cotizacion    numeric(12,4),
  neto          numeric(14,2),
  iva           numeric(14,2),
  percepciones  numeric(14,2),
  qr_crudo      text not null default '',
  extraido      jsonb,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','extraida','no_cuadra','confirmada','rechazada')),
  gasto_id      uuid references public.gastos(id) on delete set null,
  creado_en     timestamptz not null default now(),
  unique (user_id, cuit, tipo_cmp, pto_vta, nro_cmp)
);

alter table public.facturas enable row level security;

create policy facturas_propias on public.facturas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
