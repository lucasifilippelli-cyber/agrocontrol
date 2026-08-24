# Valuaciones por mes — plan

> Leer `docs/valuaciones.md` antes de empezar. Rama `valuaciones`, commit por tarea.
> ES5, todo testeable dentro del bloque del modelo, `null` nunca se muestra como cero.

### Task 1: Los meses y el precio de cada mes

Los dos cimientos. `mesesEntre(desdeISO, hastaISO)` devuelve los primeros de mes.
`precioDelMes(forwards, cultivo, finMesISO)` devuelve `{usdTn, arrastrado}` o
`null`: el forward con `fechaCarga` más reciente hasta ese mes, marcado como
arrastrado si esa carga es de un mes anterior.

- [ ] Tests: sin precio anterior devuelve null y no cero; con uno de un mes
      previo lo arrastra marcado; con uno del mismo mes no lo marca.
- [ ] Implementar, correr, commit.

### Task 2: Las capas ciertas

`valuacionMensual` con cosechado sin vender, insumos en stock y costo acumulado.
Todo filtrado por fecha hasta fin de cada mes.

- [ ] Tests: vender baja el cosechado del mes siguiente; el stock no incluye
      movimientos posteriores; el costo acumulado sólo cuenta gastos hasta ese mes.
- [ ] Implementar, correr, commit.

### Task 3: El grano en pie, con la serie truncada

Corre el motor de Sementera con `serie.lluvia.slice(0, n)` hasta fin de cada mes.

- [ ] Tests: un mes anterior a la siembra da cero y no null; un mes temprano da
      distinto que hoy —si diera igual, la serie no se truncó—.
- [ ] Implementar, correr, commit.

### Task 4: La pantalla y el cierre

- [ ] Una tabla mes a mes en Finanzas, con el total y el costo acumulado al lado.
- [ ] Un mes con alguna capa sin calcular queda declarado incompleto, no sumado como cero.
- [ ] Verificar en el navegador, `CLAUDE.md`, mergear, desplegar y **confirmar
      el sha1 de producción antes de avisar**.
