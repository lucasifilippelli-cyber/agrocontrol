/* Algunas cuentas de activo son regularizadoras: saldo acreedor, restan en
   vez de sumar (la amortización acumulada de maquinaria es la primera del
   plan). El modelo todavía no tenía marcador de signo. `not null default
   false` para que las 39 filas existentes queden sin marcar y el productor
   pueda marcar una cuenta propia como regularizadora cuando la cree. */
alter table public.cuentas add column if not exists regularizadora boolean not null default false;
