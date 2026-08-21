/* El código de cuenta viaja como texto y no como id: así un gasto sigue
   teniendo sentido aunque alguien renombre la cuenta, y el default se puede
   derivar de la categoría sin resolver una referencia. Anulable: null
   significa "usá el default que corresponde a su categoría". */
alter table public.gastos add column if not exists cuenta text;
alter table public.ventas add column if not exists cuenta text;
