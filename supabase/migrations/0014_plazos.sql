/* Anulables a propósito: null significa "usá el plazo por defecto de tu
   categoría". Es la misma convención que la columna `cuenta`, y hace que un
   cambio en los plazos por defecto alcance a todo lo que nadie tocó a mano. */
alter table public.gastos add column if not exists dias_pago integer;
alter table public.ventas add column if not exists dias_cobro integer;
