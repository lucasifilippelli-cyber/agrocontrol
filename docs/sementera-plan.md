# Módulo Sementera — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDO: usar
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para seguimiento.

**Goal:** Proyectar el rinde de cada lote sembrado antes de cosecharlo, valuarlo
contra el forward, avisar cuánto se puede comprometer sin pasarse, y dejarlo
descargar en tres formatos.

**Architecture:** Todo vive en `index.html`, que sigue siendo un archivo sin
build ni librerías. El ancla de rinde son las medianas por partido de la serie
oficial del MAGyP, unos 700 bytes embebidos. Encima corre un balance hídrico diario con lluvia y ETo de
Open-Meteo, y la respuesta del rendimiento al agua de FAO-33 sobre las ventanas
críticas que ya están codificadas. Dos tablas nuevas en Supabase.

**Tech Stack:** JavaScript ES5 a mano, SVG a mano, `fetch` contra la API REST de
Supabase, Open-Meteo, Postgres con RLS. Tests con `node --test` (viene con Node,
no agrega dependencias a la app).

**Spec:** `docs/sementera.md`

## Global Constraints

- **Un solo archivo, sin librerías.** Nada de npm en runtime, nada de build. Los
  gráficos son SVG a mano. Los tests son la única herramienta de desarrollo y no
  se despliegan.
- **ES5.** El código de `index.html` usa `var` y `function`, sin flechas, sin
  `let`, sin template literals. Seguir ese estilo.
- **Andar offline.** Ningún dato nuevo se baja en vivo si puede estar embebido.
- **Toda tabla nueva lleva `user_id` y una política de RLS.** Verificar con
  `get_advisors` después de aplicar. Guardar la migración en
  `supabase/migrations/`.
- **Las columnas de fecha aceptan `null` pero no `""`.** Ya está contemplado en
  `aGuion()`.
- **Nombre en la interfaz:** siempre "rinde esperado **por agua**", nunca
  "pronóstico de rinde" a secas.
- **Castellano rioplatense** en todo texto visible y en los mensajes de commit.

---

### Task 1: Tabla de rindes oficiales embebida y arnés de tests

Establece el ancla del modelo y la infraestructura de tests que usan todas las
tareas siguientes.

**Files:**
- Create: `tests/modelo.test.js`
- Create: `herramientas/generar-rindes.js`
- Modify: `index.html` (constantes, después de `VENTANAS`, línea ~668)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `RINDES_PARTIDO` — objeto `{partido: {claveCultivo: kgHa}}`
  - `PARTIDO_DE_LOCALIDAD` — objeto `{localidad: partido}`
  - `rindeBase(cultivo, localidad)` → `number` o `null`
  - Marcadores `/* === modelo:inicio === */` y `/* === modelo:fin === */` en
    `index.html`, que el arnés de tests usa para extraer el bloque.

- [ ] **Step 1: Escribir el generador de la tabla**

Crear `herramientas/generar-rindes.js`. Baja el CSV oficial, lo filtra y escribe
el bloque JS listo para pegar. Se corre a mano una vez al año.

```javascript
/* Genera la constante RINDES_PARTIDO desde la serie oficial del MAGyP.
   Uso: node herramientas/generar-rindes.js > /tmp/rindes.js           */
var URL_CSV = "https://datos.magyp.gob.ar/dataset/9e1e77ba-267e-4eaa-a59f-3296e86b5f36" +
              "/resource/95d066e6-8a0f-4a80-b59d-6f28f88eacd5/download/estimaciones-agricolas-2026-03.csv";

var PARTIDOS = ["San Antonio de Areco", "Carmen de Areco", "Luján"];
/* la serie trae un solo "maíz": temprano y tardío arrancan con el mismo ancla */
var MAPA = { "maíz":["maiz_t","maiz_d"], "soja 1ra":["soja_1"], "soja 2da":["soja_2"],
             "trigo total":["trigo"], "cebada cervecera":["cebada"],
             "girasol":["girasol"], "sorgo":["sorgo"] };
var DESDE = 2005;

function mediana(a){
  var b = a.slice().sort(function(x,y){ return x-y; });
  var m = Math.floor(b.length/2);
  return b.length % 2 ? b[m] : Math.round((b[m-1]+b[m])/2);
}

/* parser de CSV con campos entrecomillados */
function filas(txt){
  var out=[], campo="", fila=[], dentro=false;
  for(var i=0;i<txt.length;i++){
    var c=txt[i];
    if(c==='"'){ if(dentro && txt[i+1]==='"'){ campo+='"'; i++; } else dentro=!dentro; }
    else if(c==="," && !dentro){ fila.push(campo); campo=""; }
    else if((c==="\n") && !dentro){ fila.push(campo); out.push(fila); fila=[]; campo=""; }
    else if(c!=="\r"){ campo+=c; }
  }
  if(campo||fila.length){ fila.push(campo); out.push(fila); }
  return out;
}

fetch(URL_CSV).then(function(r){ return r.text(); }).then(function(txt){
  var f = filas(txt), cab = f[0], ix = {};
  cab.forEach(function(n,i){ ix[n]=i; });
  var acum = {};
  for(var i=1;i<f.length;i++){
    var r = f[i];
    if(r.length < cab.length) continue;
    if(r[ix.provincia] !== "Buenos Aires") continue;
    if(PARTIDOS.indexOf(r[ix.departamento]) < 0) continue;
    if(!MAPA[r[ix.cultivo]]) continue;
    if(parseInt(r[ix.anio],10) < DESDE) continue;
    var rin = parseInt(r[ix.rendimiento_kgxha],10);
    if(!rin) continue;
    MAPA[r[ix.cultivo]].forEach(function(k){
      var p = r[ix.departamento];
      acum[p] = acum[p] || {};
      (acum[p][k] = acum[p][k] || []).push(rin);
    });
  }
  var salida = {};
  Object.keys(acum).sort().forEach(function(p){
    salida[p] = {};
    Object.keys(acum[p]).sort().forEach(function(k){ salida[p][k] = mediana(acum[p][k]); });
  });
  console.log("var RINDES_PARTIDO = " + JSON.stringify(salida) + ";");
});
```

- [ ] **Step 2: Correr el generador y verificar los números**

```bash
node herramientas/generar-rindes.js > /tmp/rindes.js && head -c 400 /tmp/rindes.js
```

Esperado: una línea `var RINDES_PARTIDO = {...};` de unos 700 bytes (las medianas
ya agregadas, no las 369 filas crudas). San Antonio de Areco tiene que dar
`maiz_t: 8050`, `maiz_d: 8050`, `soja_1: 3600`, `trigo: 4247`.
Los números que manda son los que produce **este** generador: si al regenerarlo
salen distintos a los embebidos, el generador no sirve para nada.

- [ ] **Step 3: Escribir el test que falla**

Crear `tests/modelo.test.js`:

```javascript
var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Extrae el bloque del modelo de index.html y lo evalúa aislado.
   Así la app sigue siendo un solo archivo y el modelo igual se testea. */
function cargarModelo(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  assert.ok(ini > 0, "falta el marcador modelo:inicio en index.html");
  assert.ok(fin > ini, "falta el marcador modelo:fin en index.html");
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}

var M = cargarModelo();

test("rindeBase devuelve la mediana oficial del partido", function(){
  assert.strictEqual(M.rindeBase("soja_1", "San Antonio de Areco"), 3600);
});

test("Duggan resuelve al partido de San Antonio de Areco", function(){
  assert.strictEqual(M.rindeBase("soja_1", "Duggan"), 3600);
});

test("maíz temprano y tardío comparten ancla porque la serie no los separa", function(){
  assert.strictEqual(M.rindeBase("maiz_t", "Luján"), M.rindeBase("maiz_d", "Luján"));
});

test("una localidad desconocida devuelve null en vez de inventar", function(){
  assert.strictEqual(M.rindeBase("soja_1", "Tandil"), null);
});
```

- [ ] **Step 4: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "falta el marcador modelo:inicio en index.html".

- [ ] **Step 5: Implementar en index.html**

Insertar después de `VENTANAS` (línea ~668), pegando la salida del generador:

```javascript
/* === modelo:inicio === */
/* Rinde mediano por partido, kg/ha, últimos 20 años de la serie oficial del
   MAGyP (Estimaciones Agrícolas). Se regenera con herramientas/generar-rindes.js.
   La serie trae un solo "maíz": temprano y tardío comparten ancla, por eso el
   número de Lucas la pisa cuando hace falta. */
var RINDES_PARTIDO = { /* … salida de /tmp/rindes.js … */ };

/* Duggan no es partido: es localidad de San Antonio de Areco. */
var PARTIDO_DE_LOCALIDAD = {
  "San Antonio de Areco": "San Antonio de Areco",
  "Duggan":               "San Antonio de Areco",
  "Carmen de Areco":      "Carmen de Areco",
  "Luján":                "Luján"
};

function rindeBase(cultivo, localidad){
  var p = PARTIDO_DE_LOCALIDAD[localidad];
  if(!p || !RINDES_PARTIDO[p]) return null;
  var v = RINDES_PARTIDO[p][cultivo];
  return v == null ? null : v;
}
/* === modelo:fin === */
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 4 tests en verde.

- [ ] **Step 7: Commit**

```bash
git add tests/modelo.test.js herramientas/generar-rindes.js index.html
git commit -m "Anclar el rinde esperado en la serie oficial por partido"
```

---

### Task 2: Serie diaria de lluvia y ETo por establecimiento

Hoy la histórica se baja **sólo para el primer establecimiento** y se guarda
mensualizada. El modelo la necesita diaria y por campo.

**Files:**
- Create: `supabase/migrations/0006_series_de_clima.sql`
- Modify: `index.html:1165-1187` (`traerLluviaCampania`)
- Modify: `index.html` (colecciones de `E`, `marcar`, mapa de nombres ~línea 1002)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `rindeBase` de la Task 1 (sólo el bloque de marcadores).
- Produces:
  - Tabla `clima_series(id, user_id, establecimiento_id, campania_id, desde,
    hasta, lluvia jsonb, eto jsonb)`
  - `E.climaSeries` — colección en memoria
  - `serieDe(establecimientoId, campaniaId)` → `{desde, hasta, lluvia:[], eto:[]}` o `null`
  - `mmEntre(serie, desdeISO, hastaISO)` → `number`

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0006_series_de_clima.sql`:

```sql
create table public.clima_series (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  establecimiento_id uuid not null references public.establecimientos(id) on delete cascade,
  campania_id        uuid not null references public.campanias(id) on delete cascade,
  desde              date not null,
  hasta              date,
  lluvia             jsonb not null default '[]'::jsonb,
  eto                jsonb not null default '[]'::jsonb,
  creado_en          timestamptz not null default now(),
  unique (establecimiento_id, campania_id)
);

alter table public.clima_series enable row level security;

create policy clima_series_propias on public.clima_series
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Escribir el test que falla**

Agregar a `tests/modelo.test.js`:

```javascript
test("mmEntre suma sólo los días del rango, con los bordes incluidos", function(){
  var serie = { desde:"2026-01-01", hasta:"2026-01-05",
                lluvia:[10, 0, 5, 20, 1], eto:[4,4,4,4,4] };
  assert.strictEqual(M.mmEntre(serie, "2026-01-01", "2026-01-05"), 36);
  assert.strictEqual(M.mmEntre(serie, "2026-01-03", "2026-01-04"), 25);
});

test("mmEntre ignora lo que cae fuera de la serie", function(){
  var serie = { desde:"2026-01-01", hasta:"2026-01-03", lluvia:[10,10,10], eto:[4,4,4] };
  assert.strictEqual(M.mmEntre(serie, "2025-12-01", "2026-12-31"), 30);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.mmEntre is not a function".

- [ ] **Step 4: Implementar `mmEntre` dentro del bloque del modelo**

```javascript
function diasEntre(a, b){
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
}

function mmEntre(serie, desdeISO, hastaISO){
  if(!serie || !serie.lluvia || !serie.lluvia.length) return 0;
  var i0 = Math.max(0, diasEntre(serie.desde, desdeISO));
  var i1 = Math.min(serie.lluvia.length - 1, diasEntre(serie.desde, hastaISO));
  var t = 0;
  for(var i = i0; i <= i1; i++) t += (serie.lluvia[i] || 0);
  return Math.round(t * 10) / 10;
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 6 tests en verde.

- [ ] **Step 6: Reescribir `traerLluviaCampania` para guardar la serie diaria**

En `index.html:1165`, cambiar el recorrido: pedir la ETo además de la lluvia,
iterar **todos** los establecimientos y guardar los arrays diarios. Mantener el
llenado de `c.lluvia` mensual, que las vistas existentes lo usan.

```javascript
var u = "https://archive-api.open-meteo.com/v1/archive?latitude=" + es.lat +
        "&longitude=" + es.lon + "&start_date=" + desde + "&end_date=" + hasta +
        "&daily=precipitation_sum,et0_fao_evapotranspiration" +
        "&timezone=America%2FArgentina%2FBuenos_Aires";
```

Y al resolver, además de acumular en `acum[idx]`, guardar la fila de
`clima_series` con `marcar("climaSeries", fila)`.

- [ ] **Step 7: Aplicar la migración y verificar la seguridad**

Aplicar con el MCP de Supabase y después correr `get_advisors`. Esperado: sin
avisos nuevos de RLS. El aviso preexistente de contraseñas filtradas sigue.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0006_series_de_clima.sql index.html tests/modelo.test.js
git commit -m "Guardar la lluvia diaria y la ETo por establecimiento"
```

---

### Task 3: Balance hídrico diario

**Files:**
- Modify: `index.html` (bloque del modelo)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `mmEntre`, `diasEntre` de la Task 2.
- Produces: `balanceHidrico({lluvia, eto, cau, au0, kc})` →
  `{au:[], etr:[], etc:[]}` — tres arrays del mismo largo que `lluvia`.

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("el agua útil no pasa de la capacidad: el excedente se pierde", function(){
  var b = M.balanceHidrico({ lluvia:[100, 100], eto:[0, 0], cau:150, au0:100, kc:1 });
  assert.strictEqual(b.au[0], 150);
  assert.strictEqual(b.au[1], 150);
});

test("el agua útil no baja de cero y la ETR se corta en lo disponible", function(){
  var b = M.balanceHidrico({ lluvia:[0, 0], eto:[10, 10], cau:150, au0:5, kc:1 });
  assert.strictEqual(b.au[0], 0);
  assert.strictEqual(b.etr[0], 5);   // sólo pudo evapotranspirar lo que había
  assert.strictEqual(b.etc[0], 10);  // la demanda era 10
  assert.strictEqual(b.etr[1], 0);
});

test("la demanda es ETo por Kc", function(){
  var b = M.balanceHidrico({ lluvia:[0], eto:[10], cau:150, au0:100, kc:1.2 });
  assert.strictEqual(b.etc[0], 12);
  assert.strictEqual(b.etr[0], 12);
  assert.strictEqual(b.au[0], 88);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.balanceHidrico is not a function".

- [ ] **Step 3: Implementar**

```javascript
/* Balance hídrico diario de superficie. No modela napa: ver el ajuste por
   ambiente en la Task 6 y la advertencia de docs/sementera.md. */
function balanceHidrico(o){
  var cau = o.cau, au = Math.min(o.au0, cau);
  var n = o.lluvia.length, aus = [], etrs = [], etcs = [];
  for(var i = 0; i < n; i++){
    var etc = (o.eto[i] || 0) * o.kc;
    var disp = au + (o.lluvia[i] || 0);
    var etr = Math.min(etc, Math.max(0, disp));
    au = Math.min(cau, disp - etr);
    aus.push(Math.round(au * 10) / 10);
    etrs.push(Math.round(etr * 10) / 10);
    etcs.push(Math.round(etc * 10) / 10);
  }
  return { au:aus, etr:etrs, etc:etcs };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 9 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Calcular el balance hídrico diario del lote"
```

---

### Task 4: Índice de agua y rinde esperado

**Files:**
- Modify: `index.html` (bloque del modelo; coeficientes junto a `VENTANAS`)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `balanceHidrico` (Task 3), `rindeBase` (Task 1), `VENTANAS` (ya existe).
- Produces:
  - `KY` y `KC` — objetos `{claveCultivo: number}`
  - `ventanaCritica(cultivo, desdeCampaniaISO)` → `{desde, hasta, etapa}` en ISO
  - `indiceAgua(balance, desdeSerieISO, ventana)` → `number` en `[0,1]`
  - `rindeEsperado(rBase, ia, ky)` → `number` en kg/ha

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("sin estrés el índice de agua es 1 y el rinde es el ancla", function(){
  var ia = 1;
  assert.strictEqual(M.rindeEsperado(3600, ia, 1.0), 3600);
});

test("FAO-33: con Ky 1 y mitad del agua, se pierde la mitad del rinde", function(){
  assert.strictEqual(M.rindeEsperado(3600, 0.5, 1.0), 1800);
});

test("un Ky más alto castiga más el mismo déficit", function(){
  var soja = M.rindeEsperado(3600, 0.8, 1.0);
  var maiz = M.rindeEsperado(3600, 0.8, 1.5);
  assert.ok(maiz < soja, "el maíz debería sufrir más el mismo déficit");
});

test("el rinde nunca es negativo por más que el déficit sea total", function(){
  assert.strictEqual(M.rindeEsperado(3600, 0, 1.5), 0);
});

test("la ventana crítica se ubica a partir del inicio de la campaña", function(){
  var v = M.ventanaCritica("soja_1", "2025-07-01");
  assert.ok(v.desde >= "2026-01-01" && v.desde <= "2026-01-20", "R3-R5 arranca en enero, dio " + v.desde);
  assert.strictEqual(v.etapa, "Llenado · R3–R5");
});

test("el índice de agua es la ETR sobre la ETC dentro de la ventana", function(){
  var bal = { etr:[5, 5, 2], etc:[5, 5, 10] };  // 12 de 20
  var ia = M.indiceAgua(bal, "2026-01-01", { desde:"2026-01-01", hasta:"2026-01-03" });
  assert.strictEqual(Math.round(ia * 100) / 100, 0.6);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.rindeEsperado is not a function".

- [ ] **Step 3: Implementar**

Los coeficientes van junto a `VENTANAS`, a la vista, porque **falta que Lucas los
valide**:

```javascript
/* Respuesta del rendimiento al agua (FAO-33) y coeficiente de cultivo (FAO-56).
   VALORES DE MANUAL, PENDIENTES DE VALIDACIÓN POR LUCAS. */
var KY = { maiz_t:1.50, maiz_d:1.50, soja_1:1.00, soja_2:1.00,
           trigo:1.05, cebada:1.00, girasol:0.95, sorgo:0.90 };
var KC = { maiz_t:1.20, maiz_d:1.20, soja_1:1.15, soja_2:1.15,
           trigo:1.15, cebada:1.15, girasol:1.10, sorgo:1.05 };
```

Y dentro del bloque del modelo:

```javascript
/* VENTANAS trae ini/fin como meses fraccionarios desde el inicio de campaña. */
function ventanaCritica(cultivo, desdeCampaniaISO){
  var v = VENTANAS[cultivo];
  if(!v) return null;
  function fecha(frac){
    var b = new Date(desdeCampaniaISO + "T12:00:00Z");
    var mes = Math.floor(frac);
    var d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + mes, 1));
    var dias = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(1 + Math.round((frac - mes) * dias));
    return d.toISOString().slice(0, 10);
  }
  return { desde: fecha(v.ini), hasta: fecha(v.fin), etapa: v.et };
}

function indiceAgua(balance, desdeSerieISO, ventana){
  var i0 = Math.max(0, diasEntre(desdeSerieISO, ventana.desde));
  var i1 = Math.min(balance.etc.length - 1, diasEntre(desdeSerieISO, ventana.hasta));
  var etr = 0, etc = 0;
  for(var i = i0; i <= i1; i++){ etr += (balance.etr[i] || 0); etc += (balance.etc[i] || 0); }
  if(etc <= 0) return 1;
  return Math.max(0, Math.min(1, etr / etc));
}

function rindeEsperado(rBase, ia, ky){
  return Math.max(0, Math.round(rBase * (1 - ky * (1 - ia))));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 15 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Derivar el rinde esperado del agua en el período crítico"
```

---

### Task 5: Los tres escenarios

**Files:**
- Modify: `index.html` (bloque del modelo y la bajada de clima)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `percentilesVentana(historico, ventana)` → `{p20, p50, p80}` en mm
  - `escenarios(o)` → `{pesimista, esperado, optimista}` en kg/ha, ordenados

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("los percentiles salen de la lluvia acumulada de cada año en la ventana", function(){
  var hist = [80, 100, 120, 140, 160, 180, 200, 220, 240, 260];
  var p = M.percentilesVentana(hist);
  assert.ok(p.p20 < p.p50 && p.p50 < p.p80, "tienen que venir ordenados");
  assert.strictEqual(p.p50, 170);
});

test("los tres escenarios vienen ordenados de peor a mejor", function(){
  var e = M.escenarios({ rBase:3600, ky:1.0, iaPeor:0.6, iaMedio:0.8, iaMejor:0.95 });
  assert.ok(e.pesimista <= e.esperado && e.esperado <= e.optimista);
});

test("con la ventana crítica ya cerrada los tres escenarios convergen", function(){
  var e = M.escenarios({ rBase:3600, ky:1.0, iaPeor:0.8, iaMedio:0.8, iaMejor:0.8 });
  assert.strictEqual(e.pesimista, e.esperado);
  assert.strictEqual(e.esperado, e.optimista);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.percentilesVentana is not a function".

- [ ] **Step 3: Implementar**

```javascript
function percentil(ordenado, p){
  var i = (ordenado.length - 1) * p;
  var lo = Math.floor(i), hi = Math.ceil(i);
  if(lo === hi) return ordenado[lo];
  return Math.round(ordenado[lo] + (ordenado[hi] - ordenado[lo]) * (i - lo));
}

/* historico: un total de mm por año, para la misma ventana del calendario */
function percentilesVentana(historico){
  var o = historico.slice().sort(function(a, b){ return a - b; });
  return { p20: percentil(o, 0.20), p50: percentil(o, 0.50), p80: percentil(o, 0.80) };
}

function escenarios(o){
  var r = [ rindeEsperado(o.rBase, o.iaPeor,  o.ky),
            rindeEsperado(o.rBase, o.iaMedio, o.ky),
            rindeEsperado(o.rBase, o.iaMejor, o.ky) ]
          .sort(function(a, b){ return a - b; });
  return { pesimista:r[0], esperado:r[1], optimista:r[2] };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 18 tests en verde.

- [ ] **Step 5: Bajar 20 años de historia por establecimiento**

Agregar `traerHistoriaLarga(es)`, que pide al archivo de Open-Meteo los últimos
20 años de `precipitation_sum` para las coordenadas del campo y cachea el
resultado en `localStorage`. Si la llamada falla, caer a la serie `NORMAL` de
lluvia mensual típica que ya está en el código (línea ~655) y marcarlo en la
interfaz.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Abrir el rinde esperado en tres escenarios de lluvia"
```

---

### Task 6: Lo que carga Lucas — override de rinde, agua útil y napa

**Files:**
- Create: `supabase/migrations/0007_rindes_base_y_ambientes.sql`
- Modify: `index.html` (formulario de ambientes en `vistaLotes`, ajustes)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `rindeBase` (Task 1).
- Produces:
  - `perfiles.rindes_base` `jsonb` → `{claveCultivo: kgHa}` por establecimiento
  - Campos `cau` y `napa` dentro de cada ambiente de `lotes.ambientes`
  - `rindeAncla(cultivo, establecimiento)` → usa el override si existe, si no el oficial

- [ ] **Step 1: Escribir la migración**

```sql
alter table public.perfiles
  add column if not exists rindes_base jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Escribir el test que falla**

```javascript
test("el número de Lucas pisa al oficial", function(){
  var ancla = M.rindeAncla("maiz_d", { localidad:"Luján" }, { "maiz_d": 11000 });
  assert.strictEqual(ancla.kgHa, 11000);
  assert.strictEqual(ancla.propio, true);
});

test("sin override manda el oficial y queda marcado como tal", function(){
  var ancla = M.rindeAncla("maiz_d", { localidad:"Luján" }, {});
  assert.strictEqual(ancla.kgHa, 7800);
  assert.strictEqual(ancla.propio, false);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.rindeAncla is not a function".

- [ ] **Step 4: Implementar**

```javascript
/* El oficial es el valor por defecto; el de Lucas lo pisa y queda marcado,
   igual que el pluviómetro manual pisa al automático. */
function rindeAncla(cultivo, establecimiento, overrides){
  var o = overrides && overrides[cultivo];
  if(o != null && o !== "") return { kgHa: Number(o), propio: true };
  var v = rindeBase(cultivo, establecimiento.localidad);
  return { kgHa: v, propio: false };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 20 tests en verde.

- [ ] **Step 6: Sumar los campos al formulario de ambientes**

Cada ambiente suma **agua útil (mm)** con los valores iniciales de la spec —loma
140, media loma 160, bajo 180— y **aporte de napa (mm)**, que arranca vacío.
Ayuda visible: "Cuánto suma la napa en este ambiente. Dejalo vacío si no aporta."

- [ ] **Step 7: Aplicar la migración y verificar la seguridad**

Aplicar con el MCP de Supabase y correr `get_advisors`. Esperado: sin avisos
nuevos.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0007_rindes_base_y_ambientes.sql index.html tests/modelo.test.js
git commit -m "Dejar que el criterio de Lucas pise al rinde oficial"
```

---

### Task 7: Precio forward

**Files:**
- Create: `supabase/migrations/0008_precios_forward.sql`
- Modify: `index.html` (colecciones de `E`, formulario)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Produces:
  - Tabla `precios_forward(id, user_id, cultivo, mes_entrega, usd_tn, fecha_carga)`
  - `E.preciosForward` — colección en memoria
  - `forwardDe(lista, cultivo, mesEntregaISO)` → `number` o `null` (el más
    reciente por `fechaCarga`). Recibe la lista como argumento, no lee `E`, para
    que sea pura y testeable fuera del navegador.

- [ ] **Step 1: Escribir la migración**

```sql
create table public.precios_forward (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cultivo      text not null,
  mes_entrega  date not null,
  usd_tn       numeric(10,2) not null check (usd_tn > 0),
  fecha_carga  date not null,
  creado_en    timestamptz not null default now()
);

alter table public.precios_forward enable row level security;

create policy precios_forward_propios on public.precios_forward
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Escribir el test que falla**

```javascript
test("forwardDe toma el precio cargado más recientemente", function(){
  var lista = [
    { cultivo:"soja_1", mesEntrega:"2026-05-01", usdTn:330, fechaCarga:"2026-08-01" },
    { cultivo:"soja_1", mesEntrega:"2026-05-01", usdTn:340, fechaCarga:"2026-08-15" }
  ];
  assert.strictEqual(M.forwardDe(lista, "soja_1", "2026-05-01"), 340);
});

test("sin precio cargado devuelve null en vez de suponer", function(){
  assert.strictEqual(M.forwardDe([], "soja_1", "2026-05-01"), null);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.forwardDe is not a function".

- [ ] **Step 4: Implementar**

```javascript
/* Único dato del módulo que no entra solo: no hay fuente pública sin
   credenciales. Si algún día hay acceso a MATBA-ROFEX, se automatiza acá. */
function forwardDe(lista, cultivo, mesEntregaISO){
  var c = lista.filter(function(p){
    return p.cultivo === cultivo && p.mesEntrega === mesEntregaISO;
  }).sort(function(a, b){ return a.fechaCarga < b.fechaCarga ? 1 : -1; });
  return c.length ? Number(c[0].usdTn) : null;
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 22 tests en verde.

- [ ] **Step 6: Formulario de carga**

Reutiliza `abrirForm`. Campos: cultivo (select con `CULTIVOS`), mes de entrega
(date), USD por tonelada (number), fecha de carga (date, hoy por defecto).

- [ ] **Step 7: Aplicar la migración y verificar la seguridad**

Aplicar con el MCP de Supabase y correr `get_advisors`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0008_precios_forward.sql index.html tests/modelo.test.js
git commit -m "Cargar el precio forward por cultivo y mes de entrega"
```

---

### Task 8: Valuación y regla del compromiso

**Files:**
- Modify: `index.html` (bloque del modelo)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: `escenarios` (Task 5), `forwardDe` (Task 7), y las funciones que ya
  existen `produccionPorCultivo(campaniaId)` y `ventasPorCultivo(campaniaId)`
  (`index.html:1969-1971`).
- Produces: `compromiso({tnPesimista, tnVendidas})` →
  `{margen, excedido:boolean}` en toneladas

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("el margen se mide contra el escenario pesimista, no contra el esperado", function(){
  var c = M.compromiso({ tnPesimista:100, tnVendidas:80 });
  assert.strictEqual(c.margen, 20);
  assert.strictEqual(c.excedido, false);
});

test("avisa cuando lo comprometido pasa el escenario pesimista", function(){
  var c = M.compromiso({ tnPesimista:100, tnVendidas:120 });
  assert.strictEqual(c.margen, -20);
  assert.strictEqual(c.excedido, true);
});

test("vender exactamente el pesimista todavía no es exceso", function(){
  assert.strictEqual(M.compromiso({ tnPesimista:100, tnVendidas:100 }).excedido, false);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.compromiso is not a function".

- [ ] **Step 3: Implementar**

```javascript
/* El límite prudente es el escenario pesimista: un forward que no se puede
   entregar obliga a comprar grano justo el año en que está caro, porque está
   caro precisamente porque a todos les fue mal. */
function compromiso(o){
  var margen = Math.round((o.tnPesimista - o.tnVendidas) * 10) / 10;
  return { margen: margen, excedido: margen < 0 };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 25 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Frenar el compromiso en el escenario pesimista"
```

---

### Task 9: El décimo módulo

**Files:**
- Modify: `index.html:2700-2710` (`ICONOS`)
- Modify: `index.html:2886-2916` (array `mods` de `vistaInicio`)
- Modify: `index.html:3180-3184` (`VISTAS` y `NECESITAN_CAMPANIA`)
- Modify: `index.html` (nueva `vistaSementera`)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `vistaSementera()` → string de HTML; entrada `sementera` en `VISTAS`.

- [ ] **Step 1: Sumar el icono**

En `ICONOS`, con el mismo patrón `svgIco(...)` que los otros nueve. Un brote
saliendo del suelo con una línea de horizonte.

- [ ] **Step 2: Sumar el módulo al menú**

En el array `mods` de `vistaInicio`, después de `finanzas`:

```javascript
{v:"sementera", ico:"sementera", nom:"Sementera",
 dice:"Cuánto va a rendir cada lote sembrado, cuánto vale contra el forward y cuánto podés comprometer.",
 dato:sem && sem.tn ? nf(sem.tn,1)+" <span>t esperadas</span>" : "Sin lotes sembrados"},
```

Calcular `sem` arriba, junto a `r`, `ec` y `oc`.

- [ ] **Step 3: Registrar la vista**

```javascript
var VISTAS={inicio:vistaInicio, hoy:vistaHoy, campania:vistaCampania, lotes:vistaLotes,
            cultivos:vistaCultivos, ordenes:vistaOrdenes, insumos:vistaInsumos,
            clima:vistaClima, monitoreo:vistaMonitoreo, finanzas:vistaFinanzas,
            sementera:vistaSementera, lote:vistaLote};
var NECESITAN_CAMPANIA={campania:1, cultivos:1, clima:1, lote:1, finanzas:1, sementera:1};
```

- [ ] **Step 4: Escribir `vistaSementera`**

Adelante, por cultivo: rango de rinde esperado, producción esperada,
comprometido y margen, con el aviso en rojo cuando `compromiso().excedido`.
Un nivel adentro, por lote: la ficha —genética, densidad, fecha de siembra,
aplicaciones, mm desde la siembra, mm en la ventana crítica, cuánto de la
ventana ya pasó— y la cuenta del modelo abierta paso por paso. Reutilizar
`panel-vivo` y `panel-fila`, que ya existen.

Marcar con un distintivo el ancla propia versus la oficial, y si se usó el
ajuste de napa.

- [ ] **Step 5: Verificar en el navegador**

```bash
python3 -m http.server 4173
```

Recorrer buscando errores de consola y desbordes horizontales, en escritorio y
en 375×812.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Sumar Sementera como décimo módulo"
```

---

### Task 10: Descarga en tres formatos

**Files:**
- Modify: `index.html` (bloque del modelo, `vistaSementera`, hoja de estilos de impresión)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consumes: la salida de `vistaSementera`.
- Produces:
  - `filasSementera(campaniaId)` → array de objetos, una fila por cultivo-lote
  - `aCSV(filas)` → string
  - `aJSON(filas)` → string

- [ ] **Step 1: Escribir el test que falla**

```javascript
test("el CSV entrecomilla lo que trae comas y duplica las comillas", function(){
  var csv = M.aCSV([{ lote:'La Loma, norte', cultivo:'Soja 1ª', kgHa:3600 }]);
  var lineas = csv.split("\n");
  assert.strictEqual(lineas[0], 'lote,cultivo,kgHa');
  assert.strictEqual(lineas[1], '"La Loma, norte",Soja 1ª,3600');
});

test("el CSV y el JSON salen de las mismas filas", function(){
  var filas = [{ lote:"L1", cultivo:"Soja 1ª", kgHa:3600 }];
  assert.deepStrictEqual(JSON.parse(M.aJSON(filas)), filas);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node --test
```

Esperado: FALLA con "M.aCSV is not a function".

- [ ] **Step 3: Implementar**

```javascript
function aCSV(filas){
  if(!filas.length) return "";
  var cols = Object.keys(filas[0]);
  function celda(v){
    var s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  return [cols.join(",")].concat(filas.map(function(f){
    return cols.map(function(c){ return celda(f[c]); }).join(",");
  })).join("\n");
}

function aJSON(filas){ return JSON.stringify(filas, null, 2); }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --test
```

Esperado: 27 tests en verde.

- [ ] **Step 5: Conectar la descarga y la hoja imprimible**

Botón con las tres opciones. CSV y JSON con `Blob` y `URL.createObjectURL`. La
hoja imprimible es `@media print`: oculta la navegación, despliega el detalle de
todos los lotes y muestra el método completo. Sin librerías.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Bajar la sementera en hoja imprimible, CSV y JSON"
```

---

### Task 11: Contraste contra una campaña real

La prueba que decide si el modelo sirve.

**Files:**
- Create: `tests/contraste.test.js`

**Interfaces:**
- Consumes: todo el bloque del modelo.

- [ ] **Step 1: Escribir el contraste**

La campaña 2025/26 de `semilla()` está cerrada y tiene rindes reales cargados
—por ejemplo el cultivo-lote `cl7`, soja 1ª DM 4670, con `rd:3180`—. Correr el
modelo sobre esa campaña con la lluvia real del período y comparar.

```javascript
var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Mismo extractor que tests/modelo.test.js, más el bloque de la semilla, para
   correr el modelo contra los cultivo-lotes reales de la campaña cerrada. */
function cargar(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}

var M = cargar();

/* Los cultivo-lotes cosechados de la campaña 2025/26 de semilla(), con su rinde
   declarado a campo (rd) y la localidad de su establecimiento. Se completa al
   ejecutar la tarea leyendo semilla() en index.html. */
var COSECHADOS = [
  { lote:"cl7", cultivo:"soja_1", localidad:"Luján", real:3180, siembra:"2025-11-08" }
  /* … el resto de los cultivo-lotes con estado "cosechado" … */
];

test("el rinde real de la campaña cerrada cae dentro del rango del modelo", function(){
  var fuera = [];
  COSECHADOS.forEach(function(c){
    var e = rangoDelModelo(M, c);   // definida abajo, arma el balance con la lluvia real
    if(c.real < e.pesimista || c.real > e.optimista){
      fuera.push(c.lote + ": real " + c.real +
                 " fuera de [" + e.pesimista + ", " + e.optimista + "]");
    }
  });
  assert.deepStrictEqual(fuera, [], fuera.join(" · "));
});
```

`rangoDelModelo(M, caso)` baja del archivo de Open-Meteo la lluvia y la ETo del
ciclo real de ese cultivo-lote, arma el balance con el agua útil del ambiente y
devuelve `escenarios(...)`. Se escribe en este mismo archivo.

- [ ] **Step 2: Correr y anotar el resultado**

```bash
node --test
```

**Si falla, no forzar los coeficientes para que pase.** Anotar cuánto se desvía
y por qué, y llevárselo a Lucas: puede ser la napa, puede ser que el ancla
oficial no represente sus lotes, o puede ser que un Ky esté mal. Es información,
no un test roto.

- [ ] **Step 3: Commit**

```bash
git add tests/contraste.test.js
git commit -m "Contrastar el modelo contra la campaña 2025/26 cerrada"
```

---

## Lo que queda para Lucas

Nada de esto se da por bueno hasta que lo mire:

1. **Ky, Kc y el agua útil por ambiente** — valores de manual, no de su zona.
2. **La napa** — el modelo la ignora y va a subestimar los bajos en años húmedos.
3. **El ancla del maíz** — temprano y tardío comparten número oficial.
4. **El límite en el escenario pesimista** — la decisión más opinada del diseño.
5. **El resultado de la Task 11** — si el modelo no le pega a una campaña que ya
   pasó, hay que revisarlo antes de confiarle una que está en curso.
