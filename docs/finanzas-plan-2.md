# El escenario y sus tres insumos — plan de implementación (etapa 2a de 3)

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDO: usar
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para seguimiento.

**Goal:** La estructura de escenario sobre la que van a correr todos los
indicadores, y las tres fuentes de costo que hoy faltan para que proyectar no
mienta.

**Architecture:** Un escenario es un paquete con cultivos, precios, costos con su
atribución a lote, y calendario de cobros y pagos. Se arma real, proyectado o
simulado, y las tres formas devuelven la misma estructura. Ningún consumidor lee
`E`: todos reciben el escenario ya armado. Las tres capas del costo que falta son
derivar los trabajos programados, un presupuesto por categoría, y los plazos.

**Tech Stack:** JavaScript ES5 a mano, `fetch` contra la API REST de Supabase,
Postgres con RLS. Tests con `node --test`.

**Spec:** `docs/finanzas.md`, secciones "La pieza central: el escenario", "Las
tres capas del costo que falta" y "Los plazos".

## Global Constraints

- **Un solo archivo, sin librerías.** Nada de npm en runtime, nada de build.
- **ES5** dentro de `index.html`: `var` y `function`, sin flechas, sin `let`,
  sin `const`, sin template literals.
- **Toda tabla o columna nueva lleva `user_id` y una política de RLS.**
  Verificar con `get_advisors` después de aplicar.
- **Las columnas de fecha aceptan `null` pero no `""`** — contemplado en `aGuion()`.
- **Todo en dólares**, al tipo de cambio del día de la operación.
- **Ninguna función del escenario lee `E`.** Reciben las colecciones por
  argumento. Es lo que permite que la simulación de campañas sea después
  conectar una pantalla al mismo motor.
- **El `null` significa "todavía no sé"** y nunca se muestra como cero. Es la
  regla que costó siete defectos críticos en el módulo Sementera.
- **Castellano rioplatense** en todo texto visible y en los mensajes de commit.

---

### Task 1: El costo de los trabajos que faltan hacer

La primera capa del costo pendiente, y **sale sola sin que el productor cargue
nada**.

**Files:**
- Modify: `index.html` (bloque del modelo)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `costoPendienteDe(cultivoLoteId, ordenes, ordenInsumos, insumos)` →
  `number` en dólares.

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("una orden programada suma su mezcla por superficie", function(){
  var ordenes=[{id:"o1", cultivoLoteId:"cl1", superficie:100, estado:"programada"}];
  var ordenInsumos=[{ordenId:"o1", insumoId:"i1", dosisHa:2}];
  var insumos=[{id:"i1", precio:15}];
  assert.strictEqual(M.costoPendienteDe("cl1", ordenes, ordenInsumos, insumos), 3000);
});

test("una orden completada no suma: su costo ya está en los movimientos", function(){
  var ordenes=[{id:"o1", cultivoLoteId:"cl1", superficie:100, estado:"completada"}];
  var ordenInsumos=[{ordenId:"o1", insumoId:"i1", dosisHa:2}];
  var insumos=[{id:"i1", precio:15}];
  assert.strictEqual(M.costoPendienteDe("cl1", ordenes, ordenInsumos, insumos), 0);
});

test("suma varias mezclas de la misma orden", function(){
  var ordenes=[{id:"o1", cultivoLoteId:"cl1", superficie:50, estado:"programada"}];
  var ordenInsumos=[{ordenId:"o1", insumoId:"i1", dosisHa:2},
                    {ordenId:"o1", insumoId:"i2", dosisHa:1}];
  var insumos=[{id:"i1", precio:10}, {id:"i2", precio:20}];
  assert.strictEqual(M.costoPendienteDe("cl1", ordenes, ordenInsumos, insumos), 2000);
});

test("no cuenta órdenes de otro cultivo-lote", function(){
  var ordenes=[{id:"o1", cultivoLoteId:"cl2", superficie:100, estado:"programada"}];
  var ordenInsumos=[{ordenId:"o1", insumoId:"i1", dosisHa:2}];
  var insumos=[{id:"i1", precio:15}];
  assert.strictEqual(M.costoPendienteDe("cl1", ordenes, ordenInsumos, insumos), 0);
});

test("un insumo sin precio cargado devuelve null y no cero", function(){
  var ordenes=[{id:"o1", cultivoLoteId:"cl1", superficie:100, estado:"programada"}];
  var ordenInsumos=[{ordenId:"o1", insumoId:"i1", dosisHa:2}];
  var insumos=[{id:"i1"}];
  assert.strictEqual(M.costoPendienteDe("cl1", ordenes, ordenInsumos, insumos), null);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.costoPendienteDe is not a function".

- [ ] **Step 3: Implementar dentro del bloque del modelo**

```javascript
/* La primera capa del costo que falta, y la única que no hay que cargar: las
   órdenes programadas ya tienen su mezcla con dosis por hectárea. Las
   completadas NO se cuentan acá — su costo ya está asentado en movimientos y
   lo suma costoInsumosDe. Contarlas dos veces inflaría el costo al doble. */
function costoPendienteDe(clId, ordenes, ordenInsumos, insumos){
  var abiertas = {}, hay = false;
  ordenes.forEach(function(o){
    if(o.cultivoLoteId === clId && o.estado !== "completada"){
      abiertas[o.id] = num(o.superficie); hay = true;
    }
  });
  if(!hay) return 0;
  var precios = {};
  insumos.forEach(function(i){ precios[i.id] = i.precio; });
  var total = 0, falta = false;
  ordenInsumos.forEach(function(oi){
    if(abiertas[oi.ordenId] == null) return;
    var p = precios[oi.insumoId];
    if(p == null){ falta = true; return; }
    total += num(oi.dosisHa) * abiertas[oi.ordenId] * num(p);
  });
  /* Un insumo sin precio no vale cero: vale "no sé". */
  return falta ? null : Math.round(total * 100) / 100;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

- [ ] **Step 5: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Derivar el costo de los trabajos que faltan hacer"
```

---

### Task 2: El presupuesto de lo que falta gastar

La segunda capa. Lo que no sale de ninguna orden: cosecha, flete, el
arrendamiento que queda, estructura.

**Files:**
- Create: `supabase/migrations/0013_presupuestos.sql`
- Modify: `index.html` (colecciones, formulario, vista de Finanzas)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `CATEGORIAS_GASTO`, `cuentaDeGasto` de la etapa 1.
- Produces:
  - Tabla `presupuestos(id, user_id, campania_id, categoria, monto, moneda, tipo_cambio, nota, creado_en)`
  - Colección `E.presupuestos`
  - `importeUSD(fila)` → `number`. Hoy la conversión a dólares vive dentro de
    `importeGasto`, que además lee cosas del gasto. **Extraela a una función
    pura dentro del bloque del modelo** que reciba `{monto, moneda, tipoCambio}`
    y devuelva dólares, y que `importeGasto` la use. La necesitan el presupuesto,
    las ventas y todo el escenario.
  - `presupuestoPendiente(presupuestos, gastos, campaniaId)` →
    `{porCategoria:{}, total:number}` — el presupuesto **menos lo ya gastado** de
    esa categoría, nunca negativo.

- [ ] **Step 1: Escribir la migración**

```sql
/* Lo que falta gastar y no sale de ninguna orden de trabajo: cosecha, flete, el
   arrendamiento que queda, estructura. Sin esto, proyectar ingresos contra
   costos que sólo incluyen lo ya gastado da un resultado sistemáticamente
   mejor que la realidad. */
create table public.presupuestos (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campania_id  uuid not null references public.campanias(id) on delete cascade,
  categoria    text not null,
  monto        numeric(14,2) not null check (monto >= 0),
  moneda       text not null default 'USD' check (moneda in ('USD','ARS')),
  tipo_cambio  numeric(12,4),
  nota         text not null default '',
  creado_en    timestamptz not null default now(),
  unique (campania_id, categoria)
);

alter table public.presupuestos enable row level security;

create policy presupuestos_propios on public.presupuestos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Escribir el test que falla**

```javascript
test("el presupuesto pendiente descuenta lo ya gastado de esa categoría", function(){
  var pres=[{campaniaId:"c1", categoria:"Cosecha", monto:10000, moneda:"USD"}];
  var gastos=[{campaniaId:"c1", categoria:"Cosecha", monto:4000, moneda:"USD"}];
  var r=M.presupuestoPendiente(pres, gastos, "c1");
  assert.strictEqual(r.porCategoria["Cosecha"], 6000);
  assert.strictEqual(r.total, 6000);
});

test("gastar más que el presupuesto deja el pendiente en cero, no en negativo", function(){
  var pres=[{campaniaId:"c1", categoria:"Cosecha", monto:10000, moneda:"USD"}];
  var gastos=[{campaniaId:"c1", categoria:"Cosecha", monto:12000, moneda:"USD"}];
  assert.strictEqual(M.presupuestoPendiente(pres, gastos, "c1").total, 0);
});

test("no mezcla campañas", function(){
  var pres=[{campaniaId:"c1", categoria:"Cosecha", monto:10000, moneda:"USD"}];
  var gastos=[{campaniaId:"c2", categoria:"Cosecha", monto:4000, moneda:"USD"}];
  assert.strictEqual(M.presupuestoPendiente(pres, gastos, "c1").total, 10000);
});

test("una categoría sin presupuesto no aporta", function(){
  var gastos=[{campaniaId:"c1", categoria:"Flete", monto:500, moneda:"USD"}];
  assert.strictEqual(M.presupuestoPendiente([], gastos, "c1").total, 0);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.presupuestoPendiente is not a function".

- [ ] **Step 4: Implementar**

```javascript
/* El presupuesto es lo que se piensa gastar en total en esa categoría, así que
   lo que falta es el presupuesto menos lo ya gastado. Nunca negativo: haberse
   pasado del presupuesto no genera un ingreso. */
function presupuestoPendiente(presupuestos, gastos, campaniaId){
  var gastado = {};
  gastos.forEach(function(g){
    if(g.campaniaId !== campaniaId) return;
    gastado[g.categoria] = (gastado[g.categoria] || 0) + importeUSD(g);
  });
  var por = {}, total = 0;
  presupuestos.forEach(function(p){
    if(p.campaniaId !== campaniaId) return;
    var falta = importeUSD(p) - (gastado[p.categoria] || 0);
    if(falta < 0) falta = 0;
    por[p.categoria] = Math.round(falta * 100) / 100;
    total += por[p.categoria];
  });
  return { porCategoria: por, total: Math.round(total * 100) / 100 };
}
```

`importeUSD` es la conversión que ya usa `importeGasto`: si la moneda es ARS,
divide por el tipo de cambio. Reutilizala; si no está expuesta con ese nombre,
extraé la que exista a una función pura dentro del bloque.

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

- [ ] **Step 6: Registrar la colección y armar el formulario**

Sumar `presupuestos` a `TABLAS` y a `vacio`, siguiendo el patrón de `cuentas`.
Formulario con `abrirForm`: categoría (select de `CATEGORIAS_GASTO`), monto,
moneda, tipo de cambio, nota. Y un bloque en la vista de Finanzas y Contabilidad
que liste los presupuestos con **cuánto falta** de cada uno, no sólo el total
cargado — que es el número que importa.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0013_presupuestos.sql index.html tests/modelo.test.js
git commit -m "Cargar el presupuesto de lo que falta gastar"
```

---

### Task 3: Los plazos de pago y de cobro

La tercera capa. **Sin esto la mirada financiera no existe.**

**Files:**
- Create: `supabase/migrations/0014_plazos.sql`
- Modify: `index.html` (constante de plazos, formularios de gasto y venta, bloque del modelo)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `CATEGORIAS_GASTO`.
- Produces:
  - Columna `dias_pago` en `gastos` y `dias_cobro` en `ventas`, las dos anulables
  - `PLAZOS_POR_DEFECTO` — `{categoria: dias}` y `{venta: dias}`
  - `fechaPagoDe(gasto)` → ISO, y `fechaCobroDe(venta)` → ISO

- [ ] **Step 1: Escribir la migración**

```sql
/* Anulables a propósito: null significa "usá el plazo por defecto de tu
   categoría". Es la misma convención que la columna `cuenta`, y hace que un
   cambio en los plazos por defecto alcance a todo lo que nadie tocó a mano. */
alter table public.gastos add column if not exists dias_pago integer;
alter table public.ventas add column if not exists dias_cobro integer;
```

- [ ] **Step 2: Escribir el test que falla**

```javascript
test("cada categoría de gasto tiene un plazo por defecto", function(){
  M.CATEGORIAS_GASTO.forEach(function(cat){
    assert.strictEqual(typeof M.PLAZOS_POR_DEFECTO.gasto[cat], "number", cat + " sin plazo");
  });
});

test("la fecha de pago sale de la fecha del gasto más su plazo", function(){
  assert.strictEqual(M.fechaPagoDe({fecha:"2026-03-01", categoria:"Cosecha"}),
                     M.sumarDias("2026-03-01", M.PLAZOS_POR_DEFECTO.gasto["Cosecha"]));
});

test("el plazo cargado a mano pisa al default", function(){
  assert.strictEqual(M.fechaPagoDe({fecha:"2026-03-01", categoria:"Cosecha", diasPago:0}),
                     "2026-03-01");
});

test("un plazo de cero es un plazo, no un vacío", function(){
  var conCero=M.fechaPagoDe({fecha:"2026-03-01", categoria:"Insumos", diasPago:0});
  assert.strictEqual(conCero, "2026-03-01");
});

test("la fecha de cobro de una venta usa la de entrega si existe", function(){
  assert.strictEqual(M.fechaCobroDe({fecha:"2026-02-01", fechaEntrega:"2026-05-01"}),
                     M.sumarDias("2026-05-01", M.PLAZOS_POR_DEFECTO.venta));
});

test("sin fecha de entrega, la de cobro sale de la fecha de la venta", function(){
  assert.strictEqual(M.fechaCobroDe({fecha:"2026-02-01"}),
                     M.sumarDias("2026-02-01", M.PLAZOS_POR_DEFECTO.venta));
});

test("una fecha inválida devuelve null y no revienta", function(){
  assert.strictEqual(M.fechaPagoDe({categoria:"Cosecha"}), null);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.PLAZOS_POR_DEFECTO is not defined".

- [ ] **Step 4: Implementar**

```javascript
/* Plazos habituales de la zona, en días. SON CRITERIO PROPIO Y ESTÁN PENDIENTES
   DE VALIDACIÓN: ver docs/finanzas.md. El productor los pisa en cada gasto o
   venta, y puede cambiar estos valores. */
var PLAZOS_POR_DEFECTO = {
  gasto: {
    "Labores de terceros":    30,
    "Cosecha":                30,
    "Flete":                  30,
    "Arrendamiento":          90,
    "Honorarios":             30,
    "Estructura":              0,
    "Impuestos y comisiones":  0,
    "Otros":                  30
  },
  venta: 30
};

function sumarDias(iso, dias){
  if(!iso) return null;
  var t = Date.parse(iso + "T12:00:00Z");
  if(isNaN(t)) return null;
  return new Date(t + dias * 864e5).toISOString().slice(0, 10);
}

function fechaPagoDe(g){
  if(!g || !g.fecha) return null;
  var d = (g.diasPago != null) ? g.diasPago
        : (PLAZOS_POR_DEFECTO.gasto[g.categoria] != null
             ? PLAZOS_POR_DEFECTO.gasto[g.categoria] : 30);
  return sumarDias(g.fecha, d);
}

function fechaCobroDe(v){
  if(!v) return null;
  var base = v.fechaEntrega || v.fecha;
  if(!base) return null;
  var d = (v.diasCobro != null) ? v.diasCobro : PLAZOS_POR_DEFECTO.venta;
  return sumarDias(base, d);
}
```

**Ojo con el test de "Insumos":** esa categoría no está en `CATEGORIAS_GASTO`.
El caso existe para fijar que un plazo de **cero** se respeta como plazo y no se
confunde con vacío — la misma distinción que costó una tarea entera en la etapa
anterior. Si la categoría no está en el mapa, cae al respaldo de 30 días, pero el
`diasPago:0` explícito manda igual.

**Y acá hay un hueco de mi plan que hay que cerrar en esta misma tarea.** El
costo más grande de la campaña —los insumos— **no es una fila de `gastos`**: sale
de los movimientos que asienta el cierre de una orden. Entonces no tiene
categoría, no tiene `diasPago`, y con lo escrito arriba **quedaría sin fecha de
pago**. La curva financiera perdería la fecha de su componente más pesado, que es
justamente el que define cuándo hace falta la plata.

Agregá `PLAZOS_POR_DEFECTO.insumo = 90` —el plazo habitual de los proveedores de
insumos en la zona— y una función:

```javascript
/* El costo de insumos no es un gasto: sale del movimiento que asienta el cierre
   de la orden. La fecha de pago se cuenta desde ese cierre. Sin esto, el
   componente más pesado del costo no tendría fecha y la curva financiera
   mentiría justo donde más importa. */
function fechaPagoInsumo(movimiento, orden){
  var base = (orden && orden.fechaCierre) || (movimiento && movimiento.fecha);
  if(!base) return null;
  var d = (movimiento && movimiento.diasPago != null)
            ? movimiento.diasPago : PLAZOS_POR_DEFECTO.insumo;
  return sumarDias(base, d);
}
```

Con su test: que use el cierre de la orden si existe, que caiga a la fecha del
movimiento si no, y que devuelva `null` sin ninguna de las dos.

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

- [ ] **Step 6: Sumar los campos a los dos formularios**

En el gasto, "Días de pago" con ayuda: "Vacío usa el plazo habitual de la
categoría." En la venta, "Días de cobro" con ayuda equivalente. **Sin `req`**, y
al guardar, si el valor coincide con el default, persistir `null` — igual que se
hizo con el campo de cuenta en la etapa 1, y por el mismo motivo: que un cambio
de los plazos por defecto alcance a todo lo que nadie tocó a mano.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0014_plazos.sql index.html tests/modelo.test.js
git commit -m "Cargar los plazos de pago y de cobro"
```

---

### Task 4: El escenario

La estructura sobre la que va a correr todo lo de la etapa 2b.

**Files:**
- Modify: `index.html` (bloque del modelo)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `costoPendienteDe`, `presupuestoPendiente`, `importeUSD`,
  `fechaPagoDe`, `fechaCobroDe`, `fechaPagoInsumo`, y las funciones que ya
  existen `produccionPorCultivo`, `ventasPorCultivo` y `rendimiento`.
- Produces:
  - `escenarioReal(datos, campaniaId)` → escenario
  - `escenarioProyectado(datos, campaniaId, sementera)` → escenario
  - `escenarioSimulado(config)` → escenario

**La forma del escenario, idéntica en las tres:**

```javascript
{
  campaniaId: string|null,
  cultivos: [ {cultivo, cultivoLoteId, loteId, ha, kg, kgEsperados|null,
               precioUSDt|null, ingresoUSD|null} ],
  costos:   [ {cultivoLoteId|null, categoria, cuenta, montoUSD, fechaPago} ],
  cobros:   [ {cultivo, montoUSD, fechaCobro} ],
  proyectado: boolean,
  incierto: boolean   /* true si algún componente vino en null */
}
```

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("el escenario real de una campaña sin nada devuelve listas vacías", function(){
  var e=M.escenarioReal({cultivoLotes:[], gastos:[], ventas:[], ordenes:[],
                         ordenInsumos:[], insumos:[], movimientos:[],
                         presupuestos:[], tickets:[]}, "c1");
  assert.strictEqual(e.cultivos.length, 0);
  assert.strictEqual(e.costos.length, 0);
  assert.strictEqual(e.cobros.length, 0);
  assert.strictEqual(e.proyectado, false);
});

test("cada costo del escenario lleva su fecha de pago", function(){
  var e=M.escenarioReal({cultivoLotes:[], ordenes:[], ordenInsumos:[], insumos:[],
                         movimientos:[], presupuestos:[], tickets:[], ventas:[],
                         gastos:[{campaniaId:"c1", categoria:"Cosecha",
                                  fecha:"2026-03-01", monto:1000, moneda:"USD"}]}, "c1");
  assert.strictEqual(e.costos.length, 1);
  assert.strictEqual(e.costos[0].fechaPago, M.fechaPagoDe({fecha:"2026-03-01", categoria:"Cosecha"}));
});

test("cada cobro del escenario lleva su fecha de cobro", function(){
  var e=M.escenarioReal({cultivoLotes:[], ordenes:[], ordenInsumos:[], insumos:[],
                         movimientos:[], presupuestos:[], tickets:[], gastos:[],
                         ventas:[{campaniaId:"c1", cultivo:"soja_1", fecha:"2026-02-01",
                                  toneladas:100, precioTn:300, moneda:"USD"}]}, "c1");
  assert.strictEqual(e.cobros.length, 1);
  assert.strictEqual(e.cobros[0].montoUSD, 30000);
  assert.strictEqual(e.cobros[0].fechaCobro, M.fechaCobroDe({fecha:"2026-02-01"}));
});

test("el escenario real no está proyectado y el proyectado sí", function(){
  var datos={cultivoLotes:[], gastos:[], ventas:[], ordenes:[], ordenInsumos:[],
             insumos:[], movimientos:[], presupuestos:[], tickets:[]};
  assert.strictEqual(M.escenarioReal(datos, "c1").proyectado, false);
  assert.strictEqual(M.escenarioProyectado(datos, "c1", null).proyectado, true);
});

test("si el costo pendiente no se puede calcular, el escenario queda incierto", function(){
  var datos={cultivoLotes:[{id:"cl1", campaniaId:"c1", cultivo:"soja_1", haSembrada:100}],
             gastos:[], ventas:[], movimientos:[], presupuestos:[], tickets:[],
             ordenes:[{id:"o1", cultivoLoteId:"cl1", superficie:100, estado:"programada"}],
             ordenInsumos:[{ordenId:"o1", insumoId:"i1", dosisHa:2}],
             insumos:[{id:"i1"}]};
  assert.strictEqual(M.escenarioProyectado(datos, "c1", null).incierto, true);
});

test("el escenario simulado no necesita ninguna campaña real", function(){
  var e=M.escenarioSimulado({cultivos:[{cultivo:"soja_1", ha:100, kgEsperados:350000,
                                        precioUSDt:300}], costos:[], cobros:[]});
  assert.strictEqual(e.campaniaId, null);
  assert.strictEqual(e.cultivos.length, 1);
  assert.strictEqual(e.proyectado, true);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.escenarioReal is not a function".

- [ ] **Step 3: Implementar los tres constructores**

Los tres arman la misma estructura. `escenarioReal` cuenta sólo lo ocurrido:
producción de cartas de porte, ventas hechas, gastos hechos, y el costo de
insumos ya asentado en movimientos. `escenarioProyectado` suma encima el costo
pendiente de las órdenes abiertas, el presupuesto que falta, y —si recibe la
sementera— los kilos esperados y su valuación. `escenarioSimulado` recibe todo
armado y no lee nada.

**`incierto` se pone en `true` en cuanto un componente devuelve `null`.** Es la
señal de que el escenario no puede sostener un número firme, y los indicadores
de la etapa 2b la van a usar para decir "todavía no sé" en vez de dar una cifra.

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

- [ ] **Step 5: Verificar contra lo que ya muestra Finanzas**

Es la prueba que decide si la atribución está bien. `escenarioReal` de la campaña
2025/26 de la semilla, sumado, tiene que **reproducir los ingresos, los costos y
el resultado que `economiaCampania` ya muestra hoy**. Si no coinciden, hay un
error de atribución y hay que encontrarlo antes de construir nada encima.
Escribí ese test.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Armar el escenario real, el proyectado y el simulado"
```

---

## Lo que queda para la etapa 2b

Los indicadores, la curva financiera mes a mes y la pantalla. Todo corre sobre el
escenario y nada vuelve a leer `E`.

## Lo que tiene que validar el contador

Los **plazos por defecto** de la Task 3: insumos a 90 días contados desde el
cierre de la orden, labores y cosecha a 30, arrendamiento a 90, flete a 30,
estructura e impuestos contra entrega, y las ventas a 30 desde la entrega. Son
de zona y criterio propio, y van al mismo documento que el plan de cuentas y los
parámetros agronómicos.

**Nota honesta sobre el detalle del plan:** las tres primeras tareas traen el
código completo. La Task 4 —los tres constructores del escenario— está
especificada por su **forma de salida exacta** y por qué compone cada
constructor, pero no trae el cuerpo escrito: son varios cientos de líneas de
composición sobre colecciones que ya existen. La forma del escenario y el test
que lo contrasta contra `economiaCampania` son las dos anclas que evitan que se
desvíe.
