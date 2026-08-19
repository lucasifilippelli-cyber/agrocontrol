/* Único dato del módulo que no entra solo: no hay fuente pública y gratuita
   de precios forward sin credenciales. Se carga a mano por cultivo y mes de
   entrega; si algún día hay acceso a MATBA-ROFEX, se automatiza sin tocar
   el resto (ver forwardDe en index.html). */
create table public.precios_forward (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cultivo      text not null,
  mes_entrega  date not null,
  usd_tn       numeric(10,2) not null check (usd_tn > 0),
  fecha_carga  date not null,
  creado_en    timestamptz not null default now()
);

alter table public.precios_forward enable row level security;

create policy precios_forward_propios on public.precios_forward
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
