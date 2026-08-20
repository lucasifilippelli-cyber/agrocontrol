# Plan de cuentas — plan de implementación (etapa 1 de 3)

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDO: usar
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para seguimiento.

**Goal:** Que todo lo que se carga en AGROCONTROL lleve un código de cuenta, con
un plan estándar para actividad agropecuaria que el productor puede ampliar.

**Architecture:** Tabla `cuentas` con código, nombre, tipo y cuenta padre. Cada
gasto y cada venta lleva `cuenta_id`, con valor por defecto derivado de la
categoría o del cultivo que ya se carga hoy, así nada se recodifica a mano. El
plan por defecto se siembra al crear la cuenta y con los datos de ejemplo.

**Tech Stack:** JavaScript ES5 a mano, `fetch` contra la API REST de Supabase,
Postgres con RLS. Tests con `node --test`.

**Spec:** `docs/finanzas.md`, sección "El plan de cuentas va primero".

## Global Constraints

- **Un solo archivo, sin librerías.** Nada de npm en runtime, nada de build.
- **ES5** dentro de `index.html`: `var` y `function`, sin flechas, sin `let`,
  sin `const`, sin template literals.
- **Toda tabla o columna nueva respeta la RLS existente**, con `user_id` y una
  política por tabla. Verificar con `get_advisors` después de aplicar.
- **Las columnas de fecha aceptan `null` pero no `""`** — contemplado en `aGuion()`.
- **Nada se recodifica a mano:** lo que ya está cargado tiene que seguir
  funcionando sin que nadie toque un solo registro.
- **Castellano rioplatense** en todo texto visible y en los mensajes de commit.
- El módulo pasa a llamarse **Finanzas y Contabilidad**.

---

### Task 1: La tabla de cuentas y el plan por defecto

**Files:**
- Create: `supabase/migrations/0010_plan_de_cuentas.sql`
- Modify: `index.html` (constantes, junto a `CATEGORIAS_GASTO`, línea ~1459)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Tabla `cuentas(id, user_id, codigo, nombre, tipo, padre, creado_en)`
  - `PLAN_BASE` — array de `{codigo, nombre, tipo, padre}` con el plan estándar
  - `cuentaPorCodigo(cuentas, codigo)` → la cuenta o `null`
  - `hijasDe(cuentas, codigo)` → array de cuentas cuyo `padre` es ese código

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0010_plan_de_cuentas.sql`:

```sql
/* Plan de cuentas. El código es texto y no número para permitir jerarquías
   como "1.1.03" sin pelearse con el orden numérico. `padre` guarda el código
   de la cuenta que agrupa, no un id, para que el plan se pueda leer y editar
   sin resolver referencias. */
create table public.cuentas (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo     text not null,
  nombre     text not null,
  tipo       text not null check (tipo in ('activo','pasivo','patrimonio','resultado')),
  padre      text,
  creado_en  timestamptz not null default now(),
  unique (user_id, codigo)
);

alter table public.cuentas enable row level security;

create policy cuentas_propias on public.cuentas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Escribir el test que falla**

Agregar a `tests/modelo.test.js`:

```javascript
test("el plan base cubre los cuatro tipos", function(){
  var tipos = {};
  M.PLAN_BASE.forEach(function(c){ tipos[c.tipo] = true; });
  assert.ok(tipos.activo && tipos.pasivo && tipos.patrimonio && tipos.resultado,
    "faltan tipos en el plan base");
});

test("ninguna cuenta del plan base apunta a un padre inexistente", function(){
  var codigos = {};
  M.PLAN_BASE.forEach(function(c){ codigos[c.codigo] = true; });
  var huerfanas = M.PLAN_BASE.filter(function(c){ return c.padre && !codigos[c.padre]; });
  assert.deepStrictEqual(huerfanas.map(function(c){ return c.codigo; }), []);
});

test("no hay códigos repetidos en el plan base", function(){
  var vistos = {}, repetidos = [];
  M.PLAN_BASE.forEach(function(c){
    if(vistos[c.codigo]) repetidos.push(c.codigo);
    vistos[c.codigo] = true;
  });
  assert.deepStrictEqual(repetidos, []);
});

test("cuentaPorCodigo encuentra y devuelve null si no está", function(){
  var cs = [{codigo:"1.1.01", nombre:"Caja", tipo:"activo", padre:"1.1"}];
  assert.strictEqual(M.cuentaPorCodigo(cs, "1.1.01").nombre, "Caja");
  assert.strictEqual(M.cuentaPorCodigo(cs, "9.9.99"), null);
});

test("hijasDe devuelve sólo las cuentas de ese padre", function(){
  var cs = [{codigo:"1.1.01", padre:"1.1"}, {codigo:"1.1.02", padre:"1.1"},
            {codigo:"2.1.01", padre:"2.1"}];
  assert.deepStrictEqual(M.hijasDe(cs, "1.1").map(function(c){ return c.codigo; }),
                         ["1.1.01", "1.1.02"]);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "Cannot read properties of undefined (reading 'forEach')",
porque `M.PLAN_BASE` no existe.

- [ ] **Step 4: Implementar dentro del bloque del modelo**

`PLAN_BASE` va junto a `CATEGORIAS_GASTO`, **dentro** de los marcadores
`/* === modelo:inicio === */` … `/* === modelo:fin === */`:

```javascript
/* Plan de cuentas estándar para actividad agropecuaria. Es criterio propio y
   está PENDIENTE DE VALIDACIÓN por un contador: ver docs/finanzas.md. El
   productor puede agregar cuentas desde la app. */
var PLAN_BASE = [
  {codigo:"1",       nombre:"Activo",                    tipo:"activo",     padre:null},
  {codigo:"1.1",     nombre:"Activo corriente",          tipo:"activo",     padre:"1"},
  {codigo:"1.1.01",  nombre:"Caja y bancos",             tipo:"activo",     padre:"1.1"},
  {codigo:"1.1.02",  nombre:"Cuentas por cobrar",        tipo:"activo",     padre:"1.1"},
  {codigo:"1.1.03",  nombre:"Bienes de cambio · granos", tipo:"activo",     padre:"1.1"},
  {codigo:"1.1.04",  nombre:"Bienes de cambio · insumos",tipo:"activo",     padre:"1.1"},
  {codigo:"1.2",     nombre:"Activo no corriente",       tipo:"activo",     padre:"1"},
  {codigo:"1.2.01",  nombre:"Maquinaria",                tipo:"activo",     padre:"1.2"},
  {codigo:"1.2.02",  nombre:"Inmuebles rurales",         tipo:"activo",     padre:"1.2"},

  {codigo:"2",       nombre:"Pasivo",                    tipo:"pasivo",     padre:null},
  {codigo:"2.1",     nombre:"Pasivo corriente",          tipo:"pasivo",     padre:"2"},
  {codigo:"2.1.01",  nombre:"Cuentas por pagar",         tipo:"pasivo",     padre:"2.1"},
  {codigo:"2.1.02",  nombre:"Deudas bancarias",          tipo:"pasivo",     padre:"2.1"},
  {codigo:"2.1.03",  nombre:"Arrendamientos a pagar",    tipo:"pasivo",     padre:"2.1"},
  {codigo:"2.1.04",  nombre:"Impuestos a pagar",         tipo:"pasivo",     padre:"2.1"},

  {codigo:"3",       nombre:"Patrimonio neto",           tipo:"patrimonio", padre:null},
  {codigo:"3.1.01",  nombre:"Capital",                   tipo:"patrimonio", padre:"3"},
  {codigo:"3.1.02",  nombre:"Resultado de la campaña",   tipo:"patrimonio", padre:"3"},

  {codigo:"4",       nombre:"Ingresos",                  tipo:"resultado",  padre:null},
  {codigo:"4.1.01",  nombre:"Venta de granos",           tipo:"resultado",  padre:"4"},
  {codigo:"4.1.02",  nombre:"Otros ingresos",            tipo:"resultado",  padre:"4"},

  {codigo:"5",       nombre:"Costos y gastos",           tipo:"resultado",  padre:null},
  {codigo:"5.1",     nombre:"Costos directos",           tipo:"resultado",  padre:"5"},
  {codigo:"5.1.01",  nombre:"Semilla",                   tipo:"resultado",  padre:"5.1"},
  {codigo:"5.1.02",  nombre:"Fertilizantes",             tipo:"resultado",  padre:"5.1"},
  {codigo:"5.1.03",  nombre:"Fitosanitarios",            tipo:"resultado",  padre:"5.1"},
  {codigo:"5.1.04",  nombre:"Labores de terceros",       tipo:"resultado",  padre:"5.1"},
  {codigo:"5.1.05",  nombre:"Cosecha",                   tipo:"resultado",  padre:"5.1"},
  {codigo:"5.1.06",  nombre:"Flete",                     tipo:"resultado",  padre:"5.1"},
  {codigo:"5.2",     nombre:"Costos indirectos",         tipo:"resultado",  padre:"5"},
  {codigo:"5.2.01",  nombre:"Arrendamiento",             tipo:"resultado",  padre:"5.2"},
  {codigo:"5.2.02",  nombre:"Honorarios",                tipo:"resultado",  padre:"5.2"},
  {codigo:"5.2.03",  nombre:"Estructura",                tipo:"resultado",  padre:"5.2"},
  {codigo:"5.2.04",  nombre:"Impuestos y comisiones",    tipo:"resultado",  padre:"5.2"},
  {codigo:"5.2.05",  nombre:"Otros",                     tipo:"resultado",  padre:"5.2"}
];

function cuentaPorCodigo(cuentas, codigo){
  if(!cuentas) return null;
  for(var i = 0; i < cuentas.length; i++){
    if(cuentas[i].codigo === codigo) return cuentas[i];
  }
  return null;
}

function hijasDe(cuentas, codigo){
  if(!cuentas) return [];
  return cuentas.filter(function(c){ return c.padre === codigo; });
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: los 5 nuevos en verde, y los 135 previos intactos.

- [ ] **Step 6: Registrar la colección en memoria**

Sin esto la tabla existe en la base pero `E.cuentas` no, y las tareas
siguientes no tienen de dónde leer. Sumar `cuentas` a `TABLAS` y a `vacio`
siguiendo el patrón de `climaSeries` y `preciosForward`, que son las dos
colecciones más nuevas. `cargar()` y `normalizar()` recorren `Object.keys(TABLAS)`
de forma genérica, así que no hay que tocarlas.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0010_plan_de_cuentas.sql index.html tests/modelo.test.js
git commit -m "Sumar el plan de cuentas estándar"
```

---

### Task 2: La cuenta por defecto de cada gasto y cada venta

Lo ya cargado tiene que quedar codificado **sin que nadie toque un registro**.

**Files:**
- Create: `supabase/migrations/0011_cuenta_en_gastos_y_ventas.sql`
- Modify: `index.html` (bloque del modelo)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `PLAN_BASE`, `cuentaPorCodigo` de la Task 1.
- Produces:
  - Columna `cuenta` (texto, el código) en `gastos` y en `ventas`, anulable
  - `cuentaDeGasto(gasto)` → código de cuenta
  - `cuentaDeVenta(venta)` → código de cuenta

- [ ] **Step 1: Escribir la migración**

```sql
/* El código de cuenta viaja como texto y no como id: así un gasto sigue
   teniendo sentido aunque alguien renombre la cuenta, y el default se puede
   derivar de la categoría sin resolver una referencia. Anulable: null
   significa "usá el default que corresponde a su categoría". */
alter table public.gastos add column if not exists cuenta text;
alter table public.ventas add column if not exists cuenta text;
```

- [ ] **Step 2: Escribir el test que falla**

```javascript
test("cada categoría de gasto cae en una cuenta del plan base", function(){
  var codigos = {};
  M.PLAN_BASE.forEach(function(c){ codigos[c.codigo] = true; });
  M.CATEGORIAS_GASTO.forEach(function(cat){
    var cod = M.cuentaDeGasto({categoria: cat});
    assert.ok(codigos[cod], cat + " cae en " + cod + ", que no existe en el plan");
  });
});

test("la cuenta cargada a mano pisa al default de la categoría", function(){
  assert.strictEqual(M.cuentaDeGasto({categoria:"Cosecha", cuenta:"5.2.05"}), "5.2.05");
});

test("una categoría desconocida cae en Otros y no revienta", function(){
  assert.strictEqual(M.cuentaDeGasto({categoria:"Algo que no existe"}), "5.2.05");
});

test("una venta cae en Venta de granos por defecto", function(){
  assert.strictEqual(M.cuentaDeVenta({cultivo:"soja_1"}), "4.1.01");
});

test("la cuenta cargada a mano pisa al default de la venta", function(){
  assert.strictEqual(M.cuentaDeVenta({cultivo:"soja_1", cuenta:"4.1.02"}), "4.1.02");
});

test("un gasto sin categoría no rompe", function(){
  assert.strictEqual(M.cuentaDeGasto({}), "5.2.05");
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.cuentaDeGasto is not a function".

- [ ] **Step 4: Implementar**

`CATEGORIAS_GASTO` tiene hoy estos ocho valores, en este orden: "Labores de
terceros", "Cosecha", "Flete", "Arrendamiento", "Honorarios", "Estructura",
"Impuestos y comisiones", "Otros". El mapa los cubre a todos.

**`CATEGORIAS_GASTO` está fuera del bloque del modelo** (línea ~1459) y el test
la necesita: movela adentro del bloque, junto a `PLAN_BASE`. Es una constante
pura, no mueve comportamiento.

```javascript
/* De la categoría que el productor ya carga sale la cuenta, así nada de lo
   cargado hasta hoy hay que recodificar a mano. Lo que se cargue explícito
   en el campo `cuenta` pisa a este default. */
var CUENTA_DE_CATEGORIA = {
  "Labores de terceros":   "5.1.04",
  "Cosecha":               "5.1.05",
  "Flete":                 "5.1.06",
  "Arrendamiento":         "5.2.01",
  "Honorarios":            "5.2.02",
  "Estructura":            "5.2.03",
  "Impuestos y comisiones":"5.2.04",
  "Otros":                 "5.2.05"
};

function cuentaDeGasto(g){
  if(!g) return "5.2.05";
  if(g.cuenta) return g.cuenta;
  return CUENTA_DE_CATEGORIA[g.categoria] || "5.2.05";
}

function cuentaDeVenta(v){
  if(!v) return "4.1.01";
  if(v.cuenta) return v.cuenta;
  return "4.1.01";
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

- [ ] **Step 6: Sumar el campo a los dos formularios**

En el formulario de gasto y en el de venta, un select de cuenta que arranca en
la que corresponde por defecto. Ayuda visible: "Sale sola de la categoría.
Cambiala sólo si querés imputarla a otra cuenta."

Agregar `cuenta` a `TABLAS`/`vacio` no hace falta —son columnas de tablas que
ya existen—, pero sí verificar que el nombre viaje en la traducción
camello↔guión bajo.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0011_cuenta_en_gastos_y_ventas.sql index.html tests/modelo.test.js
git commit -m "Imputar cada gasto y cada venta a una cuenta"
```

---

### Task 3: Sembrar el plan al crear la cuenta y en el ejemplo

Sin esto, un productor nuevo abre la app y no tiene ninguna cuenta.

**Files:**
- Modify: `index.html` (`cargarEjemplo`, arranque de sesión)
- Test: `tests/ejemplo.test.js`

**Interfaces:**
- Consumes: `PLAN_BASE` de la Task 1.
- Produces: `E.cuentas` poblada, y `sembrarPlan(cuentasExistentes)` → array de
  cuentas a crear (vacío si ya hay).

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("con la cuenta vacía se siembra el plan entero", function(){
  assert.strictEqual(M.sembrarPlan([]).length, M.PLAN_BASE.length);
});

test("si ya hay cuentas no se siembra nada", function(){
  assert.deepStrictEqual(M.sembrarPlan([{codigo:"1", nombre:"Activo"}]), []);
});

test("sembrar el plan no pisa una cuenta creada por el productor", function(){
  var propias = [{codigo:"5.1.99", nombre:"Mi cuenta", tipo:"resultado", padre:"5.1"}];
  assert.deepStrictEqual(M.sembrarPlan(propias), []);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.sembrarPlan is not a function".

- [ ] **Step 3: Implementar**

```javascript
/* Se siembra sólo cuando no hay ninguna cuenta. Nunca completa un plan
   a medias: si el productor ya tiene cuentas propias, las suyas mandan y
   agregar las que falten es decisión de él, no nuestra. */
function sembrarPlan(cuentasExistentes){
  if(cuentasExistentes && cuentasExistentes.length) return [];
  return PLAN_BASE.slice();
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

- [ ] **Step 5: Engancharlo al arranque y al ejemplo**

En `cargar()`, después de bajar todo: si `E.cuentas` está vacía, sembrar el plan
y guardarlo. En `cargarEjemplo()`, sumar `cuentas` al array `orden` **antes** de
`gastos` y `ventas`, porque las referencian.

`sembrarPlan` devuelve las filas **sin `id`**, porque es pura y no puede generar
identificadores. Quien la llama les pone `id: uid()` a cada una antes de
`marcar("cuentas", fila)`, igual que hace `semillaConIds()` con el resto.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/ejemplo.test.js
git commit -m "Sembrar el plan de cuentas al arrancar y en el ejemplo"
```

---

### Task 4: La pantalla del plan de cuentas

**Files:**
- Modify: `index.html` (`vistaFinanzas`, acciones)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `bloqueCuentas()` → HTML, y `A.nuevaCuenta` / `A.borrarCuenta`.

- [ ] **Step 1: Renombrar el módulo**

En el array `mods` de `vistaInicio` y en la cabecera de la vista, "Finanzas"
pasa a **"Finanzas y Contabilidad"**. Revisar que no desborde en 375 px: si no
entra, el nombre corto del menú puede seguir siendo "Finanzas" y el título de la
vista llevar el nombre completo.

- [ ] **Step 2: Escribir el bloque del plan**

Árbol de cuentas agrupado por tipo, usando `hijasDe` para anidar. Cada cuenta
muestra código y nombre. Reutilizar `panel-vivo` y `panel-fila`.

- [ ] **Step 3: Alta de cuenta**

Formulario con `abrirForm`: código, nombre, tipo (select de los cuatro) y cuenta
padre (select de las existentes, opcional). **Validar que el código no esté
repetido** — la base ya lo impide con el `unique`, pero el aviso tiene que salir
antes y en castellano, no como error de Postgres.

- [ ] **Step 4: Baja de cuenta**

Sólo se puede borrar una cuenta **sin hijas y sin movimientos imputados**. Si
tiene, avisar cuál es el impedimento en vez de fallar.

- [ ] **Step 5: Verificar en el navegador**

```bash
python3 -m http.server 4173
```

Recorrer buscando errores de consola y desbordes horizontales, en escritorio y
en 375×812.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Mostrar y editar el plan de cuentas"
```

---

## Lo que queda para la etapa 2

Los indicadores, las dos proyecciones y los plazos de pago y cobro. El balance
va en la etapa 3, y a esa altura las cuentas por cobrar y por pagar ya salen
solas de los plazos.

## Lo que tiene que validar el contador

El **plan por defecto entero** es criterio propio. En particular: si conviene
separar fitosanitarios por tipo, si el arrendamiento va como costo indirecto o
directo, y si "Resultado de la campaña" tiene que estar dentro de patrimonio o
como cuenta puente.
