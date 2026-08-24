# Valuaciones por mes — diseño

Tercera de las cinco piezas surgidas de la reunión del 21 de agosto de 2026
entre Lucas y su socio. Responde: **¿cuánto valía lo que tenía, mes a mes, y
cuánto había puesto hasta ahí?**

## Por qué existe

La app hoy sabe dos cosas y no sabe una tercera. Sabe lo que ya pasó —cartas de
porte, ventas, gastos— y sabe lo que puede llegar a pasar —Sementera—. Lo que
no sabe es **cuánto valía el patrimonio del cultivo en cada momento**.

Es la pregunta que se hace frente a un banco, frente a un socio, o para decidir
si conviene vender ahora o esperar. Y es una pregunta de serie, no de foto: el
número solo no dice nada; lo que dice algo es cómo se movió.

## La restricción que define esta pieza

**El único precio de grano que existe en la app es el forward cargado a mano.**
No hay serie histórica ni precio spot: no hay fuente pública y gratuita sin
credenciales, y por eso este es el único dato del módulo que no entra solo.

`precios_forward` guarda `fecha_carga`, así que hay traza temporal —pero sólo de
los meses en que efectivamente se cargó un precio. Una valuación mes a mes hacia
atrás va a tener huecos.

**Los huecos no se inventan.** En un mes sin precio cargado se arrastra el
último precio conocido y **queda marcado como precio de otro mes**. Si no hay
ninguno anterior, ese mes vale `null`: "todavía no sé", nunca cero. Un
patrimonio en cero y un patrimonio desconocido no pueden verse iguales — es la
regla más importante del proyecto y acá se aplica al número más grande de todos.

## Qué se valúa

Cuatro capas, todas a fin de cada mes:

| Capa | Qué es | Qué tan cierto es |
|---|---|---|
| **Cosechado sin vender** | Kilos de balanza menos lo vendido, por el precio del mes | Los kilos son ciertos; el precio es del mes o arrastrado |
| **Grano en pie** | Lo sembrado sin cosechar, al rinde esperado por el precio | Es una proyección, y sale como rango |
| **Insumos en stock** | Lo que queda en el galpón por su precio | Cantidad cierta; precio de última compra, no de mercado |
| **Costos acumulados** | Lo gastado hasta ese mes, imputado al cultivo | Cierto |

Los costos acumulados **no son patrimonio**: van al lado, no adentro del total.
Puestos juntos responden la pregunta que importa: *si lo que tengo parado vale
más que lo que puse*.

### El grano en pie, mes a mes

Es la capa cara y hay que decir cómo se hace. Para valuar lo que estaba en pie a
fin de marzo hace falta **el rinde que el modelo esperaba en marzo**, no el que
espera hoy. Eso no está guardado en ningún lado.

Se reconstruye: la serie diaria de clima está completa en `clima_series`, y el
motor de Sementera recibe todos sus datos por argumento y no lee estado global.
Así que se le pasa **la serie truncada a fin de cada mes** y devuelve el rinde
esperado como se veía en ese momento.

Es el motor corrido una vez por mes. Con quince lotes, tres ambientes y doce
meses son unos cientos de balances hídricos; cada uno recorre la serie diaria de
la campaña. Es el cálculo más pesado de la app y **se hace una sola vez por
pintada, no por lote**.

Sale como **rango**, igual que en Sementera: el esperado es la línea principal,
con el pesimista y el optimista al lado. Valuar el patrimonio sólo por el
esperado esconde que es una proyección.

**Un mes anterior a la siembra no tiene grano en pie**, y eso es cero de verdad,
no un "no sé": no había nada sembrado. La diferencia entre esos dos ceros es
justamente lo que esta pieza tiene que respetar.

## La función

En el bloque del modelo, pura y con todo por argumento:

```
valuacionMensual({ campania, cultivoLotes, lotes, establecimientos, tickets,
                   ventas, gastos, movimientos, insumos, ordenes, series,
                   historias, overrides, forwards, hastaISO })
```

Devuelve un array de meses, del inicio de campaña hasta `hastaISO`, cada uno con
`mes`, `enPie` (`{tn, usd, pesimista, esperado, optimista, precioArrastrado}`),
`cosechado` (`{tn, usd}`), `insumos` (`{usd}`), `total`, `costoAcumulado`, y
`falta` cuando algo no se pudo calcular.

`economiaCampania`, `margenBrutoPorCultivo` y `sementeraDeCampania` **no se
tocan**. Esta pieza los usa o replica su criterio, no los modifica.

## Qué se prueba

- Un mes anterior a la siembra tiene `enPie` en cero, no en `null`.
- Un mes sin precio cargado **arrastra el último** y lo marca; sin ninguno
  anterior, el valor es `null` y no cero.
- Vender grano **baja** el cosechado sin vender del mes siguiente.
- El grano en pie de un mes temprano usa la serie truncada a ese mes: con
  menos días de lluvia el rinde esperado es distinto al de hoy, y si diera igual
  es que la serie no se truncó.
- El costo acumulado sólo cuenta gastos con fecha hasta ese mes.
- El stock de insumos a fin de mes no incluye movimientos posteriores.
- **El total suma lo que sí se sabe y declara lo que falta.** Corriéndolo sobre
  datos reales quedó claro que poner el total entero en `null` por una capa
  faltante es peor: sin serie de clima no hay grano en pie, pero el silo y los
  insumos se saben igual, y borrar todo hacía desaparecer información cierta.
  "Sé esto y me falta aquello" es honesto; sumar un `null` como si fuera cero y
  presentarlo como total cerrado, no. Son cosas distintas y sólo la segunda es
  una mentira.
- **El rinde declarado también es producción.** No todo entra por carta de
  porte; se fecha por la cosecha del lote, y la balanza manda sobre lo declarado
  cuando hay las dos cosas.

## Lo que tiene que validar el socio

- **Que el grano en pie entre en la valuación**, y a qué escenario. Acá se
  muestra el esperado con el rango al lado; contablemente lo prudente sería el
  pesimista, y es una diferencia grande de plata.
- **Valuar el stock de insumos al precio de la última compra** en vez de a
  precio de reposición. Es lo que hay, pero en un año de salto de precios
  subvalúa el galpón.
- **Arrastrar el último precio conocido** en los meses sin dato, contra dejar el
  mes vacío. Acá se arrastra y se marca.
- **Si el cosechado sin vender debería valuarse al forward de su mes de entrega
  o al del mes que se está valuando.** Acá se usa el del mes valuado, que es lo
  que responde "cuánto valía en ese momento".
