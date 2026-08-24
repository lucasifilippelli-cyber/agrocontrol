# Margen bruto por cultivo — diseño

Segunda de las cinco piezas surgidas de la reunión del 21 de agosto de 2026
entre Lucas y su socio. Responde una pregunta que la app hoy no responde:
**¿cuánto dejó cada cultivo, y en qué se fue la plata?**

## Por qué existe

`economiaCampania` ya calcula, **por lote**, ingreso, insumos, gastos directos,
gastos indirectos prorrateados y resultado. Le faltan dos cosas.

La primera es **agrupar por cultivo**. La decisión que se toma en agosto no es
"qué hago con el lote 7": es "cuánta soja y cuánto maíz siembro". Esa
comparación necesita los números por cultivo, no por lote.

La segunda es **abrir los insumos**. Hoy "insumos: 48.200 USD" es un número
cerrado. No se puede discutir si el fertilizante se fue de precio ni comparar
el paquete tecnológico de dos cultivos sin abrirlo.

## Qué es el margen bruto acá

**Margen bruto = ingreso del cultivo − sus costos directos.**

Es la definición agronómica, no un resultado contable, y la diferencia importa:
el margen bruto mide **la decisión agronómica**, no la estructura de la empresa.
Es lo que hace comparable un maíz contra una soja, y lo que se puede contrastar
contra los márgenes de referencia de la zona.

Entran:

| Concepto | De dónde sale |
|---|---|
| Ingreso | `ventasPorCultivo`: lo vendido de ese cultivo en la campaña, en dólares |
| Insumos | Movimientos de aplicación de las órdenes de sus cultivo-lotes |
| Labores de terceros, Cosecha, Flete, Otros | Gastos **atribuidos a un cultivo-lote** de ese cultivo |

**No entran** arrendamiento, honorarios, estructura ni impuestos y comisiones,
aunque alguien los impute a un lote. Son costos de la empresa, no del cultivo, y
meterlos adentro rompe la comparación: dos campos alquilados a distinto precio
harían ver un cultivo peor que otro por una razón que no tiene nada que ver con
el cultivo.

**"Otros" sí entra cuando está atribuido a un cultivo-lote.** Atribuir un gasto
a un lote es un acto deliberado del productor; dejarlo afuera haría desaparecer
plata del margen sin explicación. El riesgo es el inverso —que ahí adentro se
cuele algo que en realidad es estructura— y por eso **la pantalla muestra
siempre el desglose por categoría**: qué entró queda a la vista y se puede
auditar de un vistazo.

### La regla que hace que el número no mienta

El margen bruto **nunca se presenta como si fuera el resultado del cultivo**.
Debajo va, en la misma pantalla, lo que quedó afuera: el total de indirectos de
la campaña, sin prorratear. Un margen bruto positivo con la empresa perdiendo
plata es una situación real y frecuente, y la pantalla tiene que dejarla ver.

## El desglose de insumos

Dos capas del mismo número:

- **Por tipo**: Semilla, Fertilizante, Herbicida, Insecticida, Fungicida,
  Coadyuvante. Es la vista que sirve para discutir el paquete.
- **Por insumo**, un nivel más adentro: cantidad aplicada, unidad y dólares.

El precio de cada aplicación sale del movimiento (`precioUnitario`) y sólo cae
al precio de lista del insumo si el movimiento no lo trae — es la regla que ya
usa `costoInsumosDe` y no se cambia.

**Un insumo sin precio en ningún lado vale cero y eso es una mentira barata.**
Si algún movimiento del cultivo no tiene con qué valuarse, el costo de insumos
de ese cultivo se declara incompleto y se dice cuántas aplicaciones quedaron sin
valuar. No se muestra un total que aparenta estar cerrado.

## El agujero de las ventas sin producción

Hoy, en `economiaCampania`, el ingreso de un cultivo se reparte entre sus lotes
según cuántos kilos puso cada uno. Si el cultivo tiene ventas cargadas y **cero
producción**, `parte` da 0 para todos los lotes y **esa plata desaparece**: no
aparece en ningún lote y nadie se entera.

Es el caso normal a mitad de campaña —se vendió forward y todavía no se
cosechó—, no un caso raro.

Esta pieza lo cierra por dos lados:

1. **El margen bruto por cultivo no lo tiene.** El ingreso sale directo de
   `ventasPorCultivo`, sin pasar por el reparto entre lotes. La plata está.
2. **El reparto por lote lo declara.** Cuando un cultivo tiene ventas y ninguna
   producción cargada, la pantalla lo dice con todas las letras en vez de
   mostrar ceros: *"vendiste 240 t de soja y todavía no cargaste producción: no
   hay con qué repartir ese ingreso entre los lotes"*.

**No se inventa un reparto.** Repartir por hectárea sembrada sería una respuesta
plausible y equivocada, del tipo exacto que este proyecto ya pagó caro: los
lotes rinden distinto y el reparto por superficie le asigna ingreso a un lote
que puede no haber producido nada.

## Las funciones

Una función nueva en el bloque del modelo, pura y con los datos por argumento,
como el resto:

```
margenBrutoPorCultivo({ cultivoLotes, ordenes, movimientos, insumos, gastos,
                        ventas, campaniaId })
```

Devuelve, por cultivo: `ha`, `ingreso`, `insumos` (total, `porTipo`, `porInsumo`,
`sinValuar`), `gastosDirectos` (total y `porCategoria`), `margen`, `margenPorHa`,
y `ingresoSinProduccion` cuando aplica el caso de arriba.

`economiaCampania` **no se toca**: sigue calculando lo suyo por lote. La pieza
agrega, no reemplaza — mismo criterio que el escenario propio del rinde.

## Qué se prueba

- Un cultivo con dos lotes suma sus insumos, sus gastos directos y su ingreso.
- **El arrendamiento imputado a un cultivo-lote no entra al margen bruto.** Es
  el test que protege la definición; sin él, agregar una categoría al catálogo
  la mete adentro sin que nadie lo note.
- El desglose por tipo suma exactamente el total de insumos.
- Un movimiento sin precio no baja el total en silencio: se cuenta como sin
  valuar y el total queda declarado incompleto.
- Un cultivo con ventas y cero producción **conserva su ingreso** en el margen
  bruto y **queda declarado** en el reparto por lote.
- El margen por hectárea usa la superficie sembrada del cultivo, y con cero
  hectáreas es `null`, no una división por cero disfrazada.

## Lo que tiene que validar el socio

- **La lista de categorías directas**: Labores de terceros, Cosecha, Flete y
  Otros adentro; arrendamiento, honorarios, estructura e impuestos afuera. Es la
  decisión que define el número.
- **Si "Otros" atribuido a un lote debe entrar.** Acá se decidió que sí, con el
  desglose visible como contrapeso.
- **Si el arrendamiento debería poder entrar** cuando el campo es alquilado y se
  lo quiere ver dentro del costo del cultivo. Quedó afuera por comparabilidad,
  pero es de las cosas que en CLAUDE.md figuran como todavía en discusión.
- **Si la cosecha se paga a 30 días o contra entrega** sigue abierta y afecta
  cuándo, no cuánto: el margen bruto es económico, no financiero.
