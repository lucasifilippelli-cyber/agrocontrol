# Margen bruto por cultivo — plan de implementación

> **Para quien lo ejecute:** ir tarea por tarea; los pasos usan casillas
> (`- [ ]`). Leer `docs/margen-bruto.md` antes de empezar.

**Objetivo:** que la app diga cuánto dejó cada cultivo y en qué se fue la plata,
con los insumos abiertos, sin que el arrendamiento contamine la comparación
entre cultivos y sin que una venta sin producción cargada desaparezca.

**Arquitectura:** una función pura nueva en el bloque del modelo,
`margenBrutoPorCultivo`, que recibe todo por argumento. `economiaCampania` no se
toca: sigue calculando lo suyo por lote. La pieza agrega, no reemplaza.

**Especificación:** `docs/margen-bruto.md`.

## Restricciones globales

- **ES5 dentro de `index.html`**: `var` y `function`. Sin flechas, `let`,
  `const` ni template literals.
- **Toda función testeable vive entre `modelo:inicio` y `modelo:fin`.**
- **`null` es "todavía no sé" y nunca se muestra como cero.**
- **En `vm`, comparar arrays con `JSON.stringify`,** no con `deepStrictEqual`.
- **Tests:** `node --test` sin ruta.
- Rama: `margen-bruto`. Commit por tarea. No hay migración: no se agregan datos.

---

### Task 1: El catálogo de categorías directas

Separado de la función porque es **la decisión**, no la mecánica: la lista
define el número y es lo primero que el socio va a mirar.

**Archivos:** `index.html` (bloque del modelo, junto a `CATEGORIAS_GASTO`),
`tests/margen.test.js` (crear).

**Produce:** `CATEGORIAS_DIRECTAS`, array de strings.

- [ ] **Paso 1: el test**

```javascript
test("el arrendamiento no es un costo directo del cultivo", function(){
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Arrendamiento") < 0,
    "dos campos alquilados a distinto precio harían ver un cultivo peor que otro");
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Estructura") < 0);
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Honorarios") < 0);
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Impuestos y comisiones") < 0);
});

test("las labores, la cosecha y el flete sí lo son", function(){
  ["Labores de terceros","Cosecha","Flete","Otros"].forEach(function(c){
    assert.ok(M.CATEGORIAS_DIRECTAS.indexOf(c) >= 0, "falta " + c);
  });
});

test("toda categoría directa existe en el catálogo de gastos", function(){
  /* Un typo acá saca plata del margen en silencio: la categoría no matchea
     nunca y el gasto no entra por ningún lado. */
  M.CATEGORIAS_DIRECTAS.forEach(function(c){
    assert.ok(M.CATEGORIAS_GASTO.indexOf(c) >= 0, c + " no está en CATEGORIAS_GASTO");
  });
});
```

- [ ] **Paso 2:** correr, ver fallar.
- [ ] **Paso 3:** definir la constante junto a `CATEGORIAS_GASTO`, con el
  comentario que explica por qué el arrendamiento queda afuera.
- [ ] **Paso 4:** correr, ver pasar.
- [ ] **Paso 5:** commit.

---

### Task 2: `margenBrutoPorCultivo`

**Archivos:** `index.html` (bloque del modelo), `tests/margen.test.js`.

**Consume:** `CATEGORIAS_DIRECTAS`, y las funciones que ya existen para valuar
movimientos.

**Produce:**

```
margenBrutoPorCultivo({ cultivoLotes, ordenes, movimientos, insumos, gastos,
                        ventas, campaniaId })
  → [ { cultivo, ha, ingreso,
        insumos: { total, porTipo:[{tipo,usd}], porInsumo:[{id,nombre,unidad,cantidad,usd}],
                   sinValuar:0 },
        gastosDirectos: { total, porCategoria:[{categoria,usd}] },
        margen, margenPorHa,
        ingresoSinProduccion: false } ]
```

Ordenado por margen descendente. `margenPorHa` es `null` con `ha` en cero.

- [ ] **Paso 1: los tests**

```javascript
test("un cultivo suma los insumos y gastos directos de todos sus lotes", function(){ … });

test("el arrendamiento imputado a un lote NO entra al margen bruto", function(){
  /* El test que protege la definición. Sin él, agregar una categoría al
     catálogo la mete adentro sin que nadie lo note. */
});

test("el desglose por tipo suma exactamente el total de insumos", function(){ … });

test("una aplicación sin precio no baja el total en silencio", function(){
  /* Se cuenta en sinValuar y el total queda declarado incompleto. Un insumo
     sin precio valuado en cero es una mentira barata. */
});

test("un cultivo con ventas y cero producción conserva su ingreso", function(){
  /* El ingreso sale de las ventas del cultivo, no del reparto entre lotes. */
});

test("con cero hectáreas el margen por hectárea es null, no infinito", function(){ … });
```

Escribirlos con datos concretos, siguiendo el armado de los tests de
`economiaCampania` que ya están en `tests/modelo.test.js`.

- [ ] **Paso 2:** correr, ver fallar.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** correr, ver pasar.
- [ ] **Paso 5: verificar que los tests muerden.** Sacar `"Arrendamiento"` del
  filtro a mano y confirmar que falla el test que protege la definición.
- [ ] **Paso 6:** commit.

---

### Task 3: La venta sin producción, declarada

**Archivos:** `index.html` (`economiaCampania` y su vista), `tests/modelo.test.js`.

- [ ] **Paso 1: el test**

```javascript
test("una venta de un cultivo sin producción cargada no se pierde en silencio", function(){
  /* Hoy parte da 0 para todos los lotes y la plata desaparece. Es el caso
     normal a mitad de campaña: se vendió forward y todavía no se cosechó. */
});
```

- [ ] **Paso 2:** correr, ver fallar.
- [ ] **Paso 3:** `economiaCampania` devuelve `sinRepartir`, la lista de cultivos
  con ventas y cero producción, con sus dólares. **No se inventa un reparto.**
- [ ] **Paso 4:** la vista lo dice con todas las letras donde hoy muestra ceros.
- [ ] **Paso 5:** correr, ver pasar. Commit.

---

### Task 4: La pantalla

**Archivos:** `index.html` (vista de Finanzas).

- [ ] **Paso 1:** un bloque nuevo, "Margen bruto por cultivo": una fila por
  cultivo con ingreso, insumos, gastos directos, margen y margen por hectárea.
- [ ] **Paso 2:** el desglose de insumos adentro de un `<details>`, por tipo
  arriba y por insumo un nivel más adentro. Mismo patrón que `.sem-lote`.
- [ ] **Paso 3: lo que quedó afuera, en la misma pantalla.** El total de
  indirectos de la campaña, sin prorratear, para que el margen bruto no se lea
  como el resultado del cultivo.
- [ ] **Paso 4:** verificar en el navegador, con la campaña 2025/26 cerrada de
  la semilla y con la 2026/27 en curso.
- [ ] **Paso 5:** commit.

---

### Task 5: Cierre

- [ ] **Paso 1:** `node --test` completo en verde.
- [ ] **Paso 2:** `CLAUDE.md` al día: la pieza, el conteo de tests, y sacar el
  agujero de `economiaCampania` de "Trampas conocidas" si quedó cerrado.
- [ ] **Paso 3:** verificar en el navegador.
- [ ] **Paso 4:** mergear, desplegar, y **confirmar que el sha1 de producción
  coincide con el local antes de avisar.**
