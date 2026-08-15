-- AGROCONTROL · esquema inicial
--
-- Cada fila pertenece a un usuario. La clave anónima de Supabase viaja en el
-- HTML y es pública por diseño: lo único que separa los datos de un productor
-- de los de otro es RLS. Por eso acá no hay ninguna tabla sin política.
--
-- Los campos que en la app son objetos anidados (ambientes de un lote, lluvia
-- mensual de una campaña, rendimiento por ambiente) quedan como jsonb. Espeja
-- la forma que ya tiene el modelo en memoria y mantiene la migración chica.
-- Normalizarlos más adelante no rompe nada de lo que hay arriba.

-- ============================================================
-- 1 · PERFIL
-- ============================================================
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  empresa     text not null default '',
  creado_en   timestamptz not null default now()
);

comment on table public.perfiles is 'Datos del productor. Se crea solo al registrarse.';

-- El perfil nace con el usuario, tomando lo que se haya mandado en el registro.
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, empresa)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'empresa', '')
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ============================================================
-- 2 · ESTRUCTURA PRODUCTIVA
-- ============================================================
create table public.establecimientos (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  localidad   text not null default '',
  lat         double precision,
  lon         double precision,
  creado_en   timestamptz not null default now()
);

comment on column public.establecimientos.lat is 'Sin coordenadas no hay pronóstico para ese campo.';

create table public.lotes (
  id                   uuid primary key,
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  establecimiento_id   uuid not null references public.establecimientos(id) on delete cascade,
  nombre               text not null,
  ha                   numeric(10,2) not null check (ha > 0),
  ambientes            jsonb not null default '[]'::jsonb,
  creado_en            timestamptz not null default now()
);

create table public.campanias (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null,
  estado        text not null default 'curso' check (estado in ('curso','cerrada')),
  desde         date not null,
  lluvia        jsonb not null default '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
  manual        jsonb not null default '{}'::jsonb,
  traido        boolean not null default false,
  traido_hasta  date,
  creado_en     timestamptz not null default now(),
  unique (user_id, nombre)
);

comment on column public.campanias.lluvia is 'Doce meses, de julio a junio. Se completa solo desde Open-Meteo.';
comment on column public.campanias.manual is 'Índices de mes cargados a mano: esos no se pisan con el dato automático.';

-- El eje del modelo: un cultivo, en un lote, en una campaña.
-- Un lote puede llevar dos en el mismo año (trigo y soja de segunda).
create table public.cultivo_lotes (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lote_id           uuid not null references public.lotes(id) on delete cascade,
  campania_id       uuid not null references public.campanias(id) on delete cascade,
  cultivo           text not null,
  orden             smallint not null default 1 check (orden in (1,2)),
  variedad          text not null default '',
  densidad          text not null default '',
  ha_sembrada       numeric(10,2) not null default 0,
  ha_cosechada      numeric(10,2) not null default 0,
  fecha_siembra     date,
  fecha_cosecha     date,
  humedad_cosecha   numeric(4,1) not null default 0,
  rinde_declarado   numeric(10,2) not null default 0,
  estado            text not null default 'planificado'
                    check (estado in ('planificado','sembrado','cosechando','cosechado')),
  rindes_ambiente   jsonb,
  creado_en         timestamptz not null default now(),
  unique (lote_id, campania_id, orden),
  check (ha_cosechada <= ha_sembrada + 0.15)
);

comment on column public.cultivo_lotes.ha_cosechada is
  'Puede ser menor que la sembrada por anegamiento, granizo o vuelco. El rendimiento se calcula sobre esta.';

-- Cartas de porte: la fuente real del rendimiento.
create table public.tickets (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cultivo_lote_id  uuid not null references public.cultivo_lotes(id) on delete cascade,
  fecha            date not null,
  carta_porte      text not null,
  kg_netos         numeric(12,2) not null check (kg_netos > 0),
  humedad          numeric(4,1) not null default 0,
  creado_en        timestamptz not null default now()
);

comment on table public.tickets is
  'El rendimiento no se guarda: se deriva de acá, descontando humedad hasta la de recibo.';

-- ============================================================
-- 3 · INSUMOS Y TRABAJO
-- ============================================================
create table public.insumos (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  tipo       text not null default '',
  unidad     text not null default 'kg',
  precio     numeric(12,4) not null default 0,
  stock      numeric(14,2) not null default 0,
  creado_en  timestamptz not null default now()
);

comment on column public.insumos.precio is 'En dólares: es la única forma de comparar campañas entre sí.';

-- La orden es lo que hace avanzar el estado del lote y descuenta el stock.
create table public.ordenes (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campania_id      uuid not null references public.campanias(id) on delete cascade,
  lote_id          uuid references public.lotes(id) on delete cascade,
  cultivo_lote_id  uuid references public.cultivo_lotes(id) on delete set null,
  insumo_id        uuid references public.insumos(id) on delete set null,
  tipo             text not null,
  fecha_plan       date not null,
  fecha_cierre     date,
  responsable      text not null default '',
  superficie       numeric(10,2) not null default 0,
  dosis            text not null default '',
  detalle          text not null default '',
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','en_curso','completada')),
  creado_en        timestamptz not null default now()
);

-- Al borrar un insumo, los trabajos ya hechos quedan sin él pero no se pierden.
comment on column public.ordenes.insumo_id is 'on delete set null: el historial del trabajo sobrevive al insumo.';

create table public.monitoreo (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campania_id  uuid not null references public.campanias(id) on delete cascade,
  lote_id      uuid references public.lotes(id) on delete cascade,
  fecha        date not null,
  tipo         text not null,
  estadio      text not null default '',
  severidad    text not null default 'Baja',
  nota         text not null default '',
  creado_en    timestamptz not null default now()
);

-- ============================================================
-- 4 · RLS · cada quien ve lo suyo y nada más
-- ============================================================
alter table public.perfiles          enable row level security;
alter table public.establecimientos  enable row level security;
alter table public.lotes             enable row level security;
alter table public.campanias         enable row level security;
alter table public.cultivo_lotes     enable row level security;
alter table public.tickets           enable row level security;
alter table public.insumos           enable row level security;
alter table public.ordenes           enable row level security;
alter table public.monitoreo         enable row level security;

create policy "perfil propio" on public.perfiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "establecimientos propios" on public.establecimientos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "lotes propios" on public.lotes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "campanias propias" on public.campanias
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cultivos propios" on public.cultivo_lotes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cartas de porte propias" on public.tickets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "insumos propios" on public.insumos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "trabajos propios" on public.ordenes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "monitoreo propio" on public.monitoreo
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 5 · ÍNDICES
-- Todo se consulta por dueño, y lo de la campaña por campaña.
-- ============================================================
create index on public.establecimientos (user_id);
create index on public.lotes            (user_id, establecimiento_id);
create index on public.campanias        (user_id);
create index on public.cultivo_lotes    (user_id, campania_id);
create index on public.tickets          (user_id, cultivo_lote_id);
create index on public.insumos          (user_id);
create index on public.ordenes          (user_id, campania_id, estado);
create index on public.monitoreo        (user_id, campania_id);
