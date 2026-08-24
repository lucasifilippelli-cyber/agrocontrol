/* Un escenario de lluvia con nombre —"año Niña", "año Niño"— es un nombre y un
   factor sobre la mediana histórica. Se define una vez y se aplica a cualquier
   cultivo, porque escala la mediana de la ventana que a cada uno le toca: un
   perfil en milímetros absolutos no serviría para ventanas de distinta
   duración y en distintos meses.

   No va en `perfiles`: ese objeto es el único del modelo que no pasa por
   aCamello, se lee crudo en guión bajo, y esa particularidad ya costó un
   defecto crítico.

   El tope de 3 en el factor es un límite de cordura, no agronómico: evita que
   un dedo de más convierta 65 en 6.500 % y produzca un rinde absurdo con cara
   de cálculo. */
create table public.escenarios_lluvia (
  id        uuid primary key,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre    text not null,
  factor    numeric(5,3) not null check (factor > 0 and factor <= 3),
  creado_en timestamptz not null default now(),
  unique (user_id, nombre)
);

alter table public.escenarios_lluvia enable row level security;

create policy escenarios_lluvia_propios on public.escenarios_lluvia
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
