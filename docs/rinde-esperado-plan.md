# Rinde esperado — plan de implementación

> **Para quien lo ejecute:** usar `superpowers:subagent-driven-development` o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para seguir el avance.

**Objetivo:** que Sementera muestre cuánta agua supone cada escenario, deje
preguntar el rinde contra una lluvia elegida a mano, y se llame "rinde
esperado" sin perder de vista lo que el modelo no contempla.

**Arquitectura:** todo el cálculo nuevo entra por `escenariosVentana`, que ya
recibe sus datos por argumento y no lee estado global. Devuelve dos cosas más
—los milímetros que ya calculaba internamente, y un escenario propio opcional—
y esos campos suben por la cadena que ya existe (`filaSementera` por ambiente y
lote, `sementeraDeCampania` por cultivo). El balance hídrico y FAO-33 no se
tocan.

**Herramientas:** `index.html` sin dependencias, `node --test`, migraciones SQL
por el MCP de Supabase.

**Especificación:** `docs/rinde-esperado.md` — leerla antes de empezar. El plan
argumenta desde ahí.

## Restricciones globales

- **ES5 dentro de `index.html`**: `var` y `function`. Sin flechas, sin `let`,
  sin `const`, sin template literals.
- **Un solo archivo, sin librerías.** Nada de dependencias nuevas.
- **Toda función testeable vive entre `/* === modelo:inicio === */` y
  `/* === modelo:fin === */`** (líneas 698 y 2268). El arnés de tests sólo
  evalúa ese bloque.
- **`null` significa "todavía no sé" y nunca se muestra como cero.**
- **Los arrays creados dentro del contexto de `vm` no son reference-equal a un
  literal del test.** Comparar con `JSON.stringify`, no con `deepStrictEqual`.
- **Tests:** `node --test` sin ruta. En Node 24, pasarle un directorio no
  descubre nada.
- **La migración se aplica ANTES de desplegar el código que la usa.**
- Rama de trabajo: `rinde-esperado`. Commit por tarea.

---

### Task 1: El renombre y el subtítulo

Lo más visible y lo más barato. No depende de nada y nada depende de esto.

**Archivos:**
- Modificar: `index.html` (trece apariciones de "por agua")
- Test: `tests/nombre.test.js` (crear)

**Interfaces:**
- Consume: nada
- Produce: nada que otras tareas usen

- [ ] **Paso 1: escribir el test que falla**

Crear `tests/nombre.test.js`:

```javascript
var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");

/* El renombre saca de la pantalla lo único que comunicaba el alcance del
   modelo. La limitación no puede desaparecer con él: baja a subtítulo
   permanente. Este test existe para que un futuro "limpiemos el texto" no
   se la lleve puesta sin que nadie se entere. */

var HTML = fs.readFileSync(__dirname + "/../index.html", "utf8");

test("el título ya no dice 'por agua'", function(){
  assert.strictEqual(HTML.indexOf("Rinde esperado por agua"), -1,
    "quedó un título viejo sin renombrar");
  assert.strictEqual(HTML.indexOf("rinde esperado por agua"), -1,
    "quedó un título viejo sin renombrar");
});

test("la limitación sigue en la pantalla, palabra por palabra", function(){
  ["enfermedades", "granizo", "malezas", "plagas", "nitrógeno"].forEach(function(p){
    assert.ok(HTML.indexOf(p) > 0, "desapareció '" + p + "' de la interfaz");
  });
});

test("la limitación aparece como subtítulo, no sólo en la letra chica", function(){
  assert.ok(HTML.indexOf("Responde sólo al agua") > 0,
    "falta el subtítulo permanente debajo del título");
});

test("la hoja imprimible sigue diciendo que no es un pronóstico de rinde", function(){
  assert.ok(HTML.indexOf("no un pronóstico de rinde") > 0,
    "la hoja imprimible es por donde entra alguien que no vio ninguna conversación");
});
```

- [ ] **Paso 2: correrlo y ver que falla**

Correr: `node --test tests/nombre.test.js`
Esperado: FALLA en "el título ya no dice 'por agua'".

- [ ] **Paso 3: hacer el renombre**

Las trece apariciones, con su línea aproximada. Revisar cada una en contexto —
no es un buscar-y-reemplazar ciego, porque algunas son prosa explicativa donde
"por agua" **sí tiene que quedarse** (es la explicación del método, no el
título).

Cambiar el **título** en: 5526, 5579, 5584, 5848, 5850.
Cambiar el **encabezado de la hoja imprimible** en: 5775, 5786.
Dejar como está la prosa que explica el método en: 4159, 5444, 5582, 5716,
5728, 5879 — ahí "por agua" describe de dónde sale el número, y sacarlo
volvería la frase incomprensible.

En 5526, agregar el subtítulo debajo del título:

```javascript
'<span class="cadena-t"><strong>Rinde esperado</strong>'+
  '<small>Responde sólo al agua. No contempla enfermedades, granizo, '+
  'malezas, plagas ni nitrógeno.</small><small>'+
```

- [ ] **Paso 4: correr los tests**

Correr: `node --test`
Esperado: PASAN todos. Los 294 anteriores siguen verdes.

- [ ] **Paso 5: verificar en el navegador**

```bash
python3 -m http.server 4173
```

Abrir Sementera y confirmar que el subtítulo se lee debajo del título y no
queda tapado en pantalla angosta (375 px).

- [ ] **Paso 6: commit**

```bash
git add index.html tests/nombre.test.js
git commit -m "El módulo se llama rinde esperado, y la limitación baja a subtítulo"
```

---

### Task 2: Los milímetros salen del motor

**Archivos:**
- Modificar: `index.html:1068-1122` (`escenariosVentana`)
- Test: `tests/modelo.test.js` (agregar al final)

**Interfaces:**
- Consume: `escenariosVentana(o)` tal como está hoy
- Produce: `escenariosVentana` devuelve además
  `{ mmCaidos: number, mmPendiente: [number,number,number], diasPendientes: number }`.
  `mmPendiente` va en el orden pesimista, esperado, optimista (p20, p50, p80).
  Con `diasPendientes === 0`, `mmPendiente` es `[0,0,0]`.

- [ ] **Paso 1: escribir los tests que fallan**

Agregar a `tests/modelo.test.js`:

```javascript
/* El número existía y no salía: "pesimista 2.800 kg/ha" es un número sin la
   premisa que lo sostiene. Nadie puede discutirlo ni verificarlo. */

function escenarioDeDosDias(){
  /* Mismo armado que el test de percentiles de más arriba: tres días reales
     que secan el perfil antes de la ventana, y dos días de ventana sin
     ocurrir que se rellenan con los percentiles 0, 20 y 60 mm. */
  var lluvia = [];
  for(var i = 0; i <= 3657; i++) lluvia.push(0);
  var porAnio = [ [3656,100], [3290,80], [2925,60], [2560,40], [2195,30],
                  [1829,20], [1464,10], [1099,5], [734,0], [368,0], [3,0] ];
  porAnio.forEach(function(par){ lluvia[par[0]] = par[1]; });
  return {
    serie: { desde:"2026-01-01", lluvia:[0,0,0], eto:[20,20,20] },
    ventana: { desde:"2026-01-04", hasta:"2026-01-05" },
    desdeCampaniaISO: null,
    cau:50, au0:50, kc:1,
    historiaLarga: { desde:"2015-01-01", lluvia:lluvia },
    rBase:4000, ky:1
  };
}

test("escenariosVentana declara cuánta agua supone cada escenario", function(){
  var e = M.escenariosVentana(escenarioDeDosDias());
  assert.strictEqual(JSON.stringify(e.mmPendiente), JSON.stringify([0, 20, 60]),
    "son los mismos milímetros que el motor reparte día a día");
  assert.strictEqual(e.diasPendientes, 2);
  assert.strictEqual(e.mmCaidos, 0, "ningún día de la ventana ocurrió todavía");
});

test("con la ventana cumplida no se declara nada supuesto", function(){
  var o = escenarioDeDosDias();
  /* La serie ahora cubre la ventana entera: cinco días reales, 30 mm el
     cuarto día, que cae dentro de la ventana. */
  o.serie = { desde:"2026-01-01", lluvia:[0,0,0,30,0], eto:[20,20,20,20,20] };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.diasPendientes, 0);
  assert.strictEqual(e.mmCaidos, 30, "los 30 mm cayeron dentro de la ventana");
  assert.strictEqual(JSON.stringify(e.mmPendiente), JSON.stringify([0, 0, 0]),
    "no hay tramo por estimar: no se supone nada");
});
```

- [ ] **Paso 2: correrlos y ver que fallan**

Correr: `node --test tests/modelo.test.js`
Esperado: FALLA con `undefined` en `e.mmPendiente`.

- [ ] **Paso 3: implementar**

En `escenariosVentana`, después del bloque que calcula `pcts` y antes del
`for` que arma los escenarios, calcular el agua ya caída dentro de la ventana:

```javascript
  /* Lo que ya cayó adentro de la ventana, para poder mostrar la premisa
     entera: "60 mm caídos + 85 supuestos" se puede discutir; "85 mm" solo,
     no. Se recorta a los días de la ventana que la serie efectivamente
     cubre: sumar la serie entera metería lluvia de antes de la ventana. */
  var iCaido0 = Math.max(0, diasEntre(o.serie.desde, o.ventana.desde));
  var iCaido1 = Math.min(o.serie.lluvia.length - 1,
                         diasEntre(o.serie.desde, o.ventana.hasta));
  var mmCaidos = 0;
  for(var q = iCaido0; q <= iCaido1; q++) mmCaidos += (o.serie.lluvia[q] || 0);
  mmCaidos = Math.round(mmCaidos * 10) / 10;
```

Y en el `return`, antes de devolver `r`:

```javascript
  r.mmCaidos = mmCaidos;
  r.mmPendiente = [pcts[0], pcts[1], pcts[2]];
  r.diasPendientes = faltan;
```

- [ ] **Paso 4: correr los tests**

Correr: `node --test`
Esperado: PASAN todos, incluidos los de Sementera que ya existían.

- [ ] **Paso 5: commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "Cada escenario dice cuánta agua supone: el número ya se calculaba y no salía"
```

---

### Task 3: El escenario propio, que agrega y nunca reemplaza

La tarea más delicada del plan. Leer la sección "El escenario propio agrega,
nunca reemplaza" de `docs/rinde-esperado.md` antes de empezar.

**Archivos:**
- Modificar: `index.html:1068-1122` (`escenariosVentana`)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consume: `escenariosVentana(o)` con los campos de la Task 2
- Produce: `escenariosVentana` acepta `o.propio`, que es `{factor: n}` o
  `{mm: n}`, y devuelve `r.propio = {kgHa: number, mm: number}` o **`null`**
  si no se pidió ninguno. `r.pesimista`, `r.esperado` y `r.optimista` **no
  cambian nunca** por efecto de `o.propio`.

- [ ] **Paso 1: escribir los tests que fallan**

Agregar a `tests/modelo.test.js`:

```javascript
/* El invariante fuerte: si el camino nuevo no corre el mismo modelo que el
   viejo, todo lo demás da igual. */
test("con factor 1.0 el rinde propio da idéntico al esperado", function(){
  var o = escenarioDeDosDias();
  o.propio = { factor: 1.0 };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.propio.kgHa, e.esperado);
  assert.strictEqual(e.propio.mm, 20, "el factor se resuelve a milímetros");
});

test("el factor escala la mediana de la ventana, no el tramo ya caído", function(){
  var o = escenarioDeDosDias();
  o.propio = { factor: 0.5 };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.propio.mm, 10, "la mitad de los 20 mm de la mediana");
});

test("también se pueden pedir milímetros directos", function(){
  var o = escenarioDeDosDias();
  o.propio = { mm: 60 };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.propio.mm, 60);
  assert.strictEqual(e.propio.kgHa, e.optimista,
    "60 mm es justo el percentil 80 de esta ventana");
});

test("sin escenario propio pedido, propio es null y no cero", function(){
  var e = M.escenariosVentana(escenarioDeDosDias());
  assert.strictEqual(e.propio, null,
    "no haber preguntado no es haber preguntado y obtenido cero");
});

/* El test que protege la regla del compromiso. Sin él, un refactor futuro
   vuelve a conectar el propio al pesimista y ningún otro test se entera. */
test("un escenario propio optimista NO mueve el pesimista", function(){
  var base = M.escenariosVentana(escenarioDeDosDias());
  var o = escenarioDeDosDias();
  o.propio = { factor: 3.0 };
  var conPropio = M.escenariosVentana(o);
  assert.strictEqual(conPropio.pesimista, base.pesimista,
    "el límite de venta forward se mide contra este número: no puede moverlo un supuesto");
  assert.strictEqual(conPropio.esperado, base.esperado);
  assert.strictEqual(conPropio.optimista, base.optimista);
  assert.ok(conPropio.propio.kgHa > base.optimista,
    "el escenario propio sí refleja el supuesto, al lado y no encima");
});
```

- [ ] **Paso 2: correrlos y ver que fallan**

Correr: `node --test tests/modelo.test.js`
Esperado: FALLA con `undefined` en `e.propio`.

- [ ] **Paso 3: implementar**

En `escenariosVentana`, extraer el cuerpo del `for` que corre un balance a un
helper local, para no duplicarlo. Después del `for` que llena `ias`, agregar:

```javascript
  /* El escenario propio se calcula al lado de los tres estadísticos, nunca
     encima: la regla del compromiso lee r.pesimista, y si un supuesto propio
     lo moviera, cargar un año húmedo habilitaría a vender forward grano que
     no se va a tener. Ver docs/rinde-esperado.md. */
  var propio = null;
  if(o.propio && faltan > 0){
    var mmPropio = (typeof o.propio.mm === "number")
      ? o.propio.mm
      : (typeof o.propio.factor === "number" ? pcts[1] * o.propio.factor : null);
    if(mmPropio != null && isFinite(mmPropio) && mmPropio >= 0){
      var iaPropio = balanceDeTramo(mmPropio);
      if(iaPropio != null){
        propio = { kgHa: rindeEsperado(o.rBase, iaPropio, o.ky),
                   mm: Math.round(mmPropio * 10) / 10 };
      }
    }
  }
```

El helper `balanceDeTramo` es el cuerpo del `for` existente, extraído tal cual
para no duplicar el modelo. Definirlo dentro de `escenariosVentana`, después
del bloque que llena `etoDias`:

```javascript
  /* El cuerpo del bucle de escenarios, extraído: los tres percentiles y el
     escenario propio tienen que correr exactamente el mismo balance. Si se
     duplicara, un arreglo en uno de los dos caminos dejaría al otro atrás y
     los números dejarían de ser comparables sin que nada avise. */
  function balanceDeTramo(mmTramo){
    var lluvia = o.serie.lluvia.slice(), eto = o.serie.eto.slice();
    /* eto puede venir más corta que lluvia (serieDe la trae con eto:
       fila.eto||[]). Rellenar hasta el largo real antes de appendear los días
       pendientes mantiene alineados los índices de lluvia y eto. */
    while(eto.length < o.serie.lluvia.length) eto.push(0);
    if(faltan > 0){
      var mmDia = mmTramo / faltan;   /* reparto sobre el tramo pendiente */
      for(var j = 0; j < faltan; j++){ lluvia.push(mmDia); eto.push(etoDias[j]); }
    }
    var bal = balanceHidrico({ lluvia:lluvia, eto:eto, cau:o.cau, au0:o.au0, kc:o.kc });
    var res = indiceAgua(bal, o.serie.desde, o.ventana);
    if(!res || res.dias !== res.diasVentana) return null;

    var i0 = Math.max(0, diasEntre(o.serie.desde, o.ventana.desde));
    var i1 = Math.min(bal.etc.length - 1, diasEntre(o.serie.desde, o.ventana.hasta));
    var etcVentana = 0;
    for(var m = i0; m <= i1; m++) etcVentana += (bal.etc[m] || 0);
    if(etcVentana <= 0) return null;

    return res.ia;
  }
```

El `for` que llena `ias` pasa a ser:

```javascript
  var ias = [];
  for(var k = 0; k < pcts.length; k++){
    var ia = balanceDeTramo(pcts[k]);
    if(ia == null) return null;
    ias.push(ia);
  }
```

**Ojo con una diferencia de comportamiento:** el `for` original hacía `return
null` desde adentro cuando el balance no cerraba. El helper devuelve `null` y
el `for` decide. El resultado tiene que ser el mismo — los tests de Sementera
que ya existen lo verifican, y si alguno se pone rojo acá es que la extracción
cambió algo.

Y en el `return`:

```javascript
  r.propio = propio;
```

Con `faltan === 0` el propio queda en `null`: la ventana ya pasó entera y no
hay nada que suponer. Es correcto y hay que dejarlo explícito.

- [ ] **Paso 4: correr los tests**

Correr: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 5: verificar que los tests muerden**

Cambiar a mano `r.pesimista = propio.kgHa` dentro de la función, correr
`node --test tests/modelo.test.js`, y confirmar que **falla** el test del
compromiso. Deshacer el cambio.

Un test que no falla contra el mutante que dice cazar no prueba nada.

- [ ] **Paso 6: commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "El escenario propio se calcula al lado de los tres, nunca encima"
```

---

### Task 4: Los milímetros y el propio suben por la cadena

**Archivos:**
- Modificar: `index.html:1304-1400` (`filaSementera`), `index.html:1408-1500`
  (`sementeraDeCampania`)
- Test: `tests/modelo.test.js`

**Interfaces:**
- Consume: los campos de las Tasks 2 y 3
- Produce: `filaSementera` devuelve `f.mm = {caidos, pendiente, dias}` —donde
  `pendiente` es el array de tres— y `f.propio = {kgHa, mm}` o `null`.
  `sementeraDeCampania` devuelve `g.mm` y `g.propio` con la misma forma,
  ponderados por hectárea.

**Cuidado con una asimetría:** la lluvia y la ventana crítica son del **lote**,
no del ambiente. Todos los ambientes de un lote declaran los mismos milímetros
y distinto rinde, porque lo que cambia entre ellos es la capacidad de agua útil.
Entonces en `filaSementera` los milímetros **no se ponderan**: se toman del
primer ambiente que los tenga. Ponderar valores idénticos es trabajo inútil que
además sugiere que varían.

En `sementeraDeCampania` sí se ponderan, porque dos lotes del mismo cultivo
pueden tener fechas de siembra distintas y por lo tanto ventanas distintas.

- [ ] **Paso 1: escribir los tests que fallan**

Agregar a `tests/modelo.test.js`, después de los tests de `filaSementera` que ya
existen. Usan `fila()` y `serieHasta()`, los helpers ya definidos en el archivo:

```javascript
test("el lote declara los milímetros de su ventana", function(){
  /* Sembrado el 5 de noviembre; la ventana de soja 1ª va del 10 de enero al
     26 de febrero. Con la serie hasta el 20 de enero, once días de ventana ya
     transcurrieron a 3 mm por día. */
  var f = fila({ serie: serieHasta("2026-01-20", 3, 4) });
  assert.ok(f.mm, "el lote tiene que declarar su agua");
  assert.strictEqual(f.mm.caidos, 33, "once días de ventana a 3 mm");
  assert.strictEqual(f.mm.dias, 37, "48 días de ventana menos los 11 corridos");
  assert.strictEqual(f.mm.pendiente.length, 3);
});

test("los dos ambientes del lote declaran el mismo agua y distinto rinde", function(){
  /* LOTE tiene Loma (40 ha, cau 140) y Bajo (60 ha, cau 180). El agua que cae
     es la misma para los dos; lo que cambia es cuánta retiene cada uno. */
  var f = fila({ serie: serieHasta("2026-01-20", 3, 4) });
  assert.strictEqual(f.mm.caidos, 33,
    "el agua es del lote: ponderarla entre ambientes sugeriría que varía");
});

test("sin escenario propio pedido, el lote tampoco lo inventa", function(){
  var f = fila({ serie: serieHasta("2026-01-20", 3, 4) });
  assert.strictEqual(f.propio, null);
});

test("con escenario propio, el lote lo pondera por hectárea entre sus ambientes", function(){
  var f = fila({ serie: serieHasta("2026-01-20", 3, 4), propio:{ factor:0.5 } });
  assert.ok(f.propio, "tiene que dar un rinde propio");
  assert.ok(f.propio.kgHa > 0);
  assert.ok(f.propio.kgHa < f.kgHa.optimista,
    "medio de la lluvia normal no puede dar más que el escenario optimista");
});

test("el escenario propio no mueve el rango del lote", function(){
  var base = fila({ serie: serieHasta("2026-01-20", 3, 4) });
  var con  = fila({ serie: serieHasta("2026-01-20", 3, 4), propio:{ factor:3.0 } });
  assert.strictEqual(JSON.stringify(con.kgHa), JSON.stringify(base.kgHa),
    "el compromiso se mide contra este rango: un supuesto no puede moverlo");
});
```

- [ ] **Paso 2: correr y ver fallar**

Correr: `node --test tests/modelo.test.js`
Esperado: FALLA con `undefined` en `f.mm`.

- [ ] **Paso 3: implementar la subida en `filaSementera`**

En el bucle de ambientes (líneas 1374-1385), pasarle `propio: o.propio` a
`escenariosVentana`, y después de `a.kgHa = e`:

```javascript
    /* El agua es del lote, no del ambiente: la primera que llega vale para
       todos. El rinde propio sí se acumula ponderado, como los otros tres. */
    if(e && !f.mm) f.mm = { caidos:e.mmCaidos, pendiente:e.mmPendiente, dias:e.diasPendientes };
    if(e && e.propio){ acumPropio += e.propio.kgHa * a.ha; mmPropio = e.propio.mm; }
    else if(o.propio) todosPropio = false;
```

Declarar `acumPropio = 0`, `mmPropio = null` y `todosPropio = true` junto a las
otras acumuladoras, y después del corte `if(!todos || haCon <= 0)` agregar:

```javascript
  f.propio = (o.propio && todosPropio && haCon > 0)
    ? { kgHa: Math.round(acumPropio / haCon), mm: mmPropio }
    : null;
```

Si un solo ambiente no pudo calcular el propio, el lote entero queda sin él:
mismo criterio que ya rige para `kgHa`, porque un promedio de la parte que sí se
pudo calcular es un rinde parcial presentado como si fuera el del lote.

- [ ] **Paso 4: implementar la subida en `sementeraDeCampania`**

Sobre `acum[f.cultivo]` (líneas 1440-1448), acumular ponderado por `f.ha`:
`mm.caidos`, `mm.pendiente[0..2]`, `mm.dias` y `propio.kgHa`. Al cerrar
(líneas 1453-1460), dividir por `a.ha` y redondear a un decimal los milímetros
y a entero los kilos. Si algún lote del cultivo no tiene `propio`, el cultivo
queda sin `propio`, mismo criterio que arriba.

- [ ] **Paso 5: correr los tests**

Correr: `node --test`

- [ ] **Paso 6: commit**

```bash
git add index.html tests/modelo.test.js
git commit -m "El agua declarada y el escenario propio suben del ambiente al cultivo"
```

---

### Task 5: La tabla de escenarios con nombre

**Migración antes que código.** Ya pasó en este proyecto que un campo nuevo en
un formulario sin su columna dejó el plan de cuentas truncado e irreparable en
el primer arranque.

**Archivos:**
- Crear: `supabase/migrations/0016_escenarios_lluvia.sql`
- Modificar: `index.html` (`TABLAS` en 2624, `vacio` en 2634)

**Interfaces:**
- Produce: `E.escenariosLluvia`, array de `{id, nombre, factor}`, disponible
  para las tareas de interfaz.

- [ ] **Paso 1: escribir la migración**

Crear `supabase/migrations/0016_escenarios_lluvia.sql`:

```sql
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
```

- [ ] **Paso 2: aplicar la migración con el MCP de Supabase**

Proyecto `ibgqriyqoikwfhlzmjet`.

- [ ] **Paso 3: verificar que no abrió un agujero**

Correr `get_advisors` sobre el proyecto. Esperado: ningún aviso nuevo de RLS.
La clave del cliente viaja en el HTML y es pública por diseño: lo único que
separa los datos de un productor de los del otro son estas políticas.

- [ ] **Paso 4: registrar la tabla en el modelo**

En `index.html`, agregar a `TABLAS`:

```javascript
  escenariosLluvia:"escenarios_lluvia",
```

y a `vacio`:

```javascript
  escenariosLluvia:[],
```

- [ ] **Paso 5: correr los tests y verificar el arranque**

Correr: `node --test`
Después, servir el repo y confirmar que la app arranca sin errores de consola y
que `cargar()` trae la colección vacía sin romper.

- [ ] **Paso 6: commit**

```bash
git add supabase/migrations/0016_escenarios_lluvia.sql index.html
git commit -m "Migración 0016: los escenarios de lluvia con nombre"
```

---

### Task 6: El agua a la vista en la pantalla

**Archivos:**
- Modificar: `index.html:5846-5860` (panel del cultivo), `index.html` (ficha del
  lote, dentro de `semDetalleLote`)

**Interfaces:**
- Consume: `g.mm` y `f.mm` de la Task 4

- [ ] **Paso 1: agregar la premisa debajo del rango de rinde**

En el panel del cultivo, debajo de la fila del rango:

```javascript
(g.mm && g.mm.dias > 0
  ?'<div class="panel-fila tenue"><span>El agua detrás del rango'+
    '<small>'+nf(g.mm.caidos,0)+' mm ya caídos en la ventana, más lo supuesto '+
    'en los '+g.mm.dias+' días que faltan</small></span>'+
    '<b>'+nf(g.mm.pendiente[0],0)+' · '+nf(g.mm.pendiente[1],0)+' · '+
    nf(g.mm.pendiente[2],0)+' mm</b></div>'
  :(g.mm?'<div class="panel-fila tenue"><span>El agua de la ventana'+
    '<small>la ventana pasó entera: nada supuesto</small></span>'+
    '<b>'+nf(g.mm.caidos,0)+' mm</b></div>':''))+
```

- [ ] **Paso 2: verificar en el navegador con los datos de ejemplo**

Servir el repo, entrar con una cuenta de prueba y mirar la campaña 2026/27 en
curso, que es la que tiene lotes con ventana sin cumplir. Confirmar que los tres
números de milímetros se corresponden con el rango de rinde: más agua, más
rinde.

Confirmar también la campaña 2025/26 cerrada, donde `dias` es 0 y tiene que
mostrar sólo el agua real.

- [ ] **Paso 3: commit**

```bash
git add index.html
git commit -m "Cada rango de rinde muestra el agua que lo sostiene"
```

---

### Task 7: Preguntar el rinde contra una lluvia elegida

**Archivos:**
- Modificar: `index.html` (vista de Sementera y su cadena de acciones `A.*`)

**Interfaces:**
- Consume: `o.propio` de las Tasks 3 y 4, `E.escenariosLluvia` de la Task 5
- Produce: `sementeraActual()` le pasa a `sementeraDeCampania` un
  `propioPorCultivo`, que es un objeto `{soja_1: {factor: 0.65}, maiz_t: null,
  …}`. `sementeraDeCampania` resuelve, para cada lote, el escenario del cultivo
  que le toca y se lo pasa a `filaSementera` como `o.propio`.

**Es por cultivo, no global.** La spec pide poder mirar el maíz temprano contra
un año seco y la soja de segunda contra uno normal, al mismo tiempo. Un único
selector para toda la campaña no cumple eso.

- [ ] **Paso 1: escribir el test de cable**

Agregar a `tests/cableado.test.js`, siguiendo el patrón de extracción por conteo
de llaves que ya usa el archivo:

```javascript
/* El motor de Sementera no lee estado global por diseño: es lo que va a
   permitir simular campañas conectándole otra pantalla al mismo cálculo. Un
   escenario propio leído de una variable de la vista rompería eso en silencio,
   y las funciones puras seguirían todas en verde. */
test("cable: el escenario propio entra por argumento, no por una global", function(){
  var src = bloqueModelo(HTML) + "\nthis.__f = sementeraDeCampania;";
  var ctx = { propioElegido: { soja_1: { factor: 0.5 } } };  /* la trampa */
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  /* Sin pasarle propioPorCultivo, el resultado no puede tener escenario
     propio: si lo tiene, lo leyó de la global de arriba. */
  var s = ctx.__f({ campania:CAMP, lotes:[LOTE], establecimientos:[EST],
                    cultivoLotes:[CL], series:[], ventas:[], forwards:[],
                    historias:[], overrides:null });
  s.filas.forEach(function(f){
    assert.strictEqual(f.propio, null,
      "leyó el escenario propio de una variable global en vez del argumento");
  });
});

test("cable: cada cultivo puede mirarse con un escenario distinto", function(){
  var src = bloqueModelo(HTML) + "\nthis.__f = sementeraDeCampania;";
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  var s = ctx.__f({ campania:CAMP, lotes:[LOTE], establecimientos:[EST],
                    cultivoLotes:[CL], series:[SERIE], ventas:[], forwards:[],
                    historias:[], overrides:null,
                    propioPorCultivo: { soja_1: { factor: 0.5 }, maiz_t: null } });
  var soja = s.cultivos.filter(function(g){ return g.cultivo === "soja_1"; })[0];
  assert.ok(soja.propio, "la soja se pidió con escenario propio");
});
```

`CAMP`, `EST`, `LOTE` y `CL` hay que copiarlos del bloque de constantes de
`tests/modelo.test.js` (líneas 644-652) o moverlos a un lugar compartido.
`SERIE` es `serieHasta("2026-01-20", 3, 4)` con el mismo helper.

- [ ] **Paso 2: correr y ver fallar**

Correr: `node --test tests/cableado.test.js`
Esperado: FALLA el segundo test — `soja.propio` viene `undefined`.

- [ ] **Paso 3: el selector, uno por tarjeta de cultivo**

En el encabezado de cada tarjeta de cultivo (línea 5841, junto al `aclara` que
ya muestra las hectáreas y el forward), agregar un `select` con:

- "Según la estadística" (opción por defecto, valor vacío)
- una opción por cada escenario guardado de `E.escenariosLluvia`
- "Milímetros a mano…", que abre un campo para escribir el número

La elección vive en una variable de la vista —un objeto cultivo → escenario— y
**no se persiste**: es una vista, no un dato. Al cambiar el `select` se
actualiza esa variable y se repinta.

- [ ] **Paso 4: marcar el resultado**

Cuando hay escenario propio activo, agregar la pastilla `criterio propio` con
`semMarcas`, la misma que ya usan el pluviómetro manual y el rinde base cargado
a mano. Un número mirado bajo un supuesto propio y uno salido de la estadística
no pueden verse iguales.

- [ ] **Paso 5: verificar que el compromiso no se movió**

En el navegador, con un escenario propio optimista cargado: la fila "Queda por
comprometer" tiene que mostrar **el mismo número** que sin escenario propio.
Esta es la verificación manual de la regla; el test de la Task 3 es la
automática.

- [ ] **Paso 6: commit**

```bash
git add index.html tests/cableado.test.js
git commit -m "Se puede preguntar el rinde contra la lluvia que uno elija"
```

---

### Task 8: Guardar escenarios con nombre

**Archivos:**
- Modificar: `index.html` (formulario y acciones `A.*`)

**Interfaces:**
- Consume: `E.escenariosLluvia` de la Task 5

- [ ] **Paso 1: alta, baja y listado**

Formulario con nombre y factor, siguiendo el patrón de `A.nuevoPrecioForward`.
Guardar con `marcar("escenariosLluvia", fila)` y `guardar()`, que ya entran en
la cola de escritura offline.

El factor se carga como porcentaje en la pantalla (65) y se guarda como número
(0,65). El tope de 3 del `check` de la base tiene que estar también en la
validación del formulario, con un mensaje que se entienda: un rechazo de la
base por el contenido se suelta de la cola y no se reintenta.

- [ ] **Paso 2: verificar en el navegador**

Crear "año Niña 65 %", aplicarlo, ver el rinde bajar. Borrarlo. Confirmar que
sale de la lista y que el rinde vuelve.

- [ ] **Paso 3: verificar que sobrevive sin señal**

Con el modo sin conexión del navegador: crear un escenario, ver el cartel de
pendientes, volver la señal, confirmar que sube.

- [ ] **Paso 4: commit**

```bash
git add index.html
git commit -m "Los escenarios con nombre se guardan y se reusan"
```

---

### Task 9: Cierre

- [ ] **Paso 1: correr toda la batería**

Correr: `node --test`
Esperado: los 294 anteriores más los nuevos, todos en verde.

- [ ] **Paso 2: actualizar `CLAUDE.md`**

La sección de Sementera dice hoy: *"Se llama 'rinde esperado por agua', nunca
'pronóstico de rinde'"*. Reescribirla con lo que quedó: el título es "rinde
esperado", la limitación vive en el subtítulo, y el escenario propio nunca
mueve el límite de compromiso. Actualizar también el conteo de tests y la lista
de tablas y migraciones.

- [ ] **Paso 3: verificar en el navegador antes de dar nada por hecho**

- [ ] **Paso 4: mergear y desplegar**

```bash
git checkout main && git merge --no-ff rinde-esperado
git push origin main
```

Confirmar que el sha1 de `index.html` en producción coincide con el local antes
de dar el despliegue por terminado.
