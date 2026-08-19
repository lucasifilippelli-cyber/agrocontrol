/* mes_entrega representa un mes, no un día, y forwardDe (index.html) compara
   la fecha completa como texto contra "YYYY-MM-01". Si por algún camino que
   no sea el formulario entra una fila con otro día, el precio queda guardado
   pero la búsqueda nunca lo encuentra, sin ningún error visible. La tabla
   está vacía ahora, que es el único momento en que esta restricción sale
   gratis: bajamos al esquema la convención que hoy sólo vive en el formulario. */
alter table public.precios_forward
  add constraint precios_forward_mes_entrega_dia_uno
  check (extract(day from mes_entrega) = 1);
