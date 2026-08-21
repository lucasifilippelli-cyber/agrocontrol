/* El escenario proyectado necesita saber CUÁNDO se paga lo que falta gastar, no
   sólo cuánto. Sin estas dos columnas la fila del presupuesto entraba a la curva
   financiera sin fecha, y una curva de saldo mes a mes con un pago que no cae en
   ningún mes no responde la única pregunta que existe para responder: si va a
   haber plata en marzo.

   `fecha` es cuándo se contrae el compromiso —la cosecha que se va a contratar,
   el arrendamiento que queda por pagar— y `dias_pago` el plazo desde esa fecha.
   Las dos anulables a propósito, con la misma convención que gastos y ventas:
   `dias_pago` en null significa "usá el plazo por defecto de tu categoría", y
   `fecha` en null significa "todavía no sé", que el escenario declara como
   incierto financiero en vez de inventarle un mes. */
alter table public.presupuestos add column if not exists fecha      date;
alter table public.presupuestos add column if not exists dias_pago  integer;
