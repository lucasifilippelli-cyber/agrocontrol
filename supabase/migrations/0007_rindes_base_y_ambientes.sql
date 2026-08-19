/* El rinde oficial del partido es el valor por defecto; Lucas lo pisa por
   cultivo y por establecimiento, igual que el pluviómetro manual pisa al
   automático (ver rindeAncla en index.html). Sin columna nueva para
   ambientes: cau (agua útil) y napa (aporte de napa) van dentro del jsonb
   que lotes.ambientes ya tiene. */
alter table public.perfiles
  add column if not exists rindes_base jsonb not null default '{}'::jsonb;
