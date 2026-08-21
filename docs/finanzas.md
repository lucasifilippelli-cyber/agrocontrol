# Finanzas y Contabilidad — diseño

El módulo pasa a llamarse **Finanzas y Contabilidad**. Suma un plan de cuentas,
indicadores seleccionables y dos proyecciones —una económica y una financiera—
que se pueden mirar sobre la campaña real o sobre una campaña inventada.

## El plan de cuentas va primero

Todo lo que se carga lleva un **código de cuenta**. Ésa es la decisión que ordena
el resto: con los asientos codificados, el balance y el estado de resultados **no
se arman a mano, se derivan**. Los indicadores que necesitan un balance dejan de
depender de que alguien cargue rubros sueltos.

Va **antes** que las proyecciones, no después. El motivo es concreto: las
proyecciones crean cuentas por cobrar y por pagar a partir de los plazos. Con el
plan de cuentas ya existente, esas dos nacen como cuentas de verdad; al revés,
habría que armarlas como rubros sueltos y tirarlas después.

**Estructura:** tabla `cuentas` con código, nombre, tipo —activo, pasivo,
patrimonio, resultado— y cuenta padre para agrupar.

**Viene con un plan por defecto ya cargado**, razonable para actividad
agropecuaria: bienes de cambio separando granos de insumos, arrendamientos,
labores de terceros, amortización acumulada, y retenciones y percepciones
sufridas separadas de las cuentas por cobrar. **El productor puede crear cuentas
nuevas.**

**El cultivo no es una cuenta, es una dimensión.** Cada venta ya guarda su
cultivo, y de ahí sale el resultado por cultivo y por lote. Abrir una cuenta por
cultivo daría dos fuentes de verdad para el mismo número.

**Nada se recodifica a mano:** cada gasto y cada venta lleva su cuenta, y el
valor por defecto sale de la categoría que ya se carga hoy. Lo existente sigue
funcionando sin tocar nada.

**El plan por defecto lleva criterio propio y va al documento de validación**,
junto con los plazos de pago y los parámetros agronómicos. Nadie lo validó
todavía.

## Por qué existe

Hoy Finanzas sabe lo que **ya pasó**: ventas hechas y gastos hechos, atribuidos
por lote y llevados a dólares. Es una foto hacia atrás.

Falta lo que decide: si la campaña va a dar, cuánta plata hay que conseguir y
para cuándo, y a qué rinde o a qué precio se empata. Y falta poder hacerse la
pregunta antes de sembrar: *si en vez de maíz pongo soja en estos lotes, ¿qué me
da?*

## La pieza central: el escenario

Todo gira alrededor de una estructura. Un **escenario** contiene lo necesario
para calcular:

- cultivos con su lote, superficie y rinde —real o esperado—
- precios —realizados o forward—
- costos, con su atribución a lote
- calendario de cobros y pagos

Se arma de tres maneras y **las tres devuelven la misma forma**:

| Constructor | Qué representa |
|---|---|
| `escenarioReal(campaniaId)` | Lo que efectivamente pasó hasta hoy |
| `escenarioProyectado(campaniaId)` | Lo que pasó más lo que falta, usando el rinde esperado de la Sementera |
| `escenarioSimulado(config)` | Una campaña que no existe |

**Ningún KPI lee `E` ni la campaña activa: todos reciben un escenario.** Ésa es
la decisión que hace que "verlo proyectado" salga gratis —es el mismo indicador
sobre otro escenario— y que la simulación sea después conectar una pantalla
nueva al mismo motor en vez de reescribirlo.

## Las dos miradas

El mismo escenario con dos relojes distintos:

- **Económica** — devengado. ¿La campaña da o no da? Ingreso de toda la
  producción contra el costo de producirla, sin importar cuándo se mueve la
  plata.
- **Financiera** — flujo de fondos. ¿Voy a tener plata en marzo? Una curva mes a
  mes de saldo proyectado.

Confundirlas es el error clásico: una campaña puede dar excelente y dejarte sin
caja en el peor momento.

## La atribución por lote se preserva

El resultado por lote **ya funciona hoy** y no se toca: se compone de los insumos
cargados a ese lote, más los gastos directos, más la parte proporcional de los
indirectos por superficie.

Lo que se agrega es que **esa atribución sobreviva a la proyección**: los insumos
de los trabajos programados y todavía no completados se atribuyen a su lote, no
al montón. Sin eso habría resultado proyectado a nivel campaña pero no por lote,
y se perderían las formas de evaluarlo que importan —dólares por hectárea, costo
por tonelada, margen por lote.

## Los indicadores

Criterio de selección: **que se calcule con datos reales sin supuestos
inventados, y que cambie una decisión.** Lo que no cambia una decisión es
decoración.

Cada indicador devuelve `{valor, unidad, significa}` — el último es una línea en
castellano que explica qué mirar. Todos toman un escenario.

### Adelante: los que deciden

| Indicador | Unidad | Qué decisión cambia |
|---|---|---|
| Rinde de indiferencia | kg/ha | Si el rinde esperado está arriba o abajo del empate |
| Precio de indiferencia | USD/t | A qué precio conviene cerrar forward |
| Necesidad máxima de capital, y su mes | USD | Cuánta plata conseguir y para cuándo |
| Margen neto por hectárea | USD/ha | El resultado, con estructura y arrendamiento adentro |

Los dos de indiferencia enganchan directo con la Sementera: ella da el rinde
esperado, éstos dan contra qué compararlo.

### Un nivel adentro: los que explican

Margen bruto por hectárea · costo por tonelada · retorno sobre capital invertido
· peso del arrendamiento sobre el costo total · saldo mes a mes · plazo promedio
de cobro · plazo promedio de pago · ciclo de caja · cobertura de lo que falta
pagar con ventas ya cerradas · concentración por comprador · porcentaje de
producción esperada ya comprometida · exposición al peso.

### El balance, y los indicadores que dependen de él

Con el plan de cuentas, el balance se deriva casi entero:

| Rubro | De dónde sale |
|---|---|
| Stock de insumos | De los movimientos, valuado a costo. Ya existe |
| Stock de granos | Producción cosechada menos vendida. Ya existe |
| Cuentas por cobrar | Ventas con cobro pendiente, según los plazos |
| Cuentas por pagar | Gastos con pago pendiente, según los plazos |
| Caja, deuda financiera, bienes de uso | **Carga manual**: pocos números por campaña |

Con eso, **liquidez corriente, prueba ácida y endeudamiento pasan de inventados a
reales**. Sin el saldo de caja la prueba ácida no significa nada —su gracia es
medir cuánto se puede pagar sin vender el stock—, así que ese número es
condición para mostrarla.

Al lado de cada ratio estándar va **su traducción al rubro**, que es la que se usa
en el campo y sale de los mismos datos:

- **Endeudamiento en toneladas** — cuántas toneladas de soja se deben.
- **Cobertura de la deuda con la cosecha esperada** — cuántas veces alcanza lo
  que se va a cosechar para cubrir lo que se debe.

Van los dos: el ratio estándar porque un banco o un contador lo reconoce, y la
traducción porque es la que decide algo en la mesa.

### Lo que queda afuera, y por qué

Las rotaciones tal como se usan en un comercio: suponen un negocio que factura
todos los meses, y una campaña agrícola gasta ocho meses seguidos y cobra en dos.
El plazo de cobro, el de pago y el ciclo de caja sí entran, pero medidos sobre el
ciclo real y no anualizados.

### Agregar uno más tiene que ser barato

Los indicadores son una lista de funciones chicas con la misma firma. Sumar uno
es escribir una función y agregarla a la lista, sin tocar la pantalla. Ésa es la
respuesta de diseño a "agregá todos los que puedas": que agregar sea barato, no
agregarlos todos de entrada.

## Las tres capas del costo que falta

Sin esto, proyectar ingresos contra costos que sólo incluyen lo ya gastado da un
resultado **sistemáticamente mejor que la realidad**: falta la cosecha, el flete,
el arrendamiento que queda, las aplicaciones que no se hicieron.

1. **Derivado, sin cargar nada.** Los trabajos programados y no completados ya
   tienen su mezcla de insumos, así que su costo es calculable y se atribuye a su
   lote.
2. **Presupuesto de lo que falta**, por campaña y categoría —cosecha, flete,
   arrendamiento, estructura. Formulario chico, carga del productor.
3. **Plazos de pago y cobro.** Sin esto la mirada financiera no existe.

## Los plazos

**Los carga el usuario**: días de pago en cada gasto o servicio contratado, días
de cobro en cada venta.

Vienen con **valores por defecto por categoría** —insumos a 90 días, labores a
30, cosecha contra entrega, arrendamiento en las cuotas habituales— para que la
curva exista desde el primer día. Lo que el usuario cargue pisa al default, y el
default se puede cambiar.

Sigue la regla del proyecto: los datos entran solos siempre que se pueda, la
carga manual es el respaldo.

**Estos valores por defecto son de zona y van al documento de validación**, junto
con los parámetros agronómicos: nadie los validó todavía.

## Datos

| Qué | Dónde |
|---|---|
| Plan de cuentas | Tabla nueva `cuentas`: código, nombre, tipo, cuenta padre |
| Cuenta de cada asiento | Columna en `gastos` y en `ventas`; default desde la categoría |
| Caja, deuda financiera, bienes de uso | Tabla nueva `saldos`: campaña, cuenta, importe, fecha |
| Presupuesto de lo que falta | Tabla nueva `presupuestos`: campaña, categoría, importe, moneda |
| Días de pago | Columna en `gastos`, anulable; default por categoría |
| Días de cobro | Columna en `ventas`, anulable; default |
| Plazos por defecto | Constante en `index.html`, a la vista, editable por el productor |

Las tablas y columnas nuevas llevan `user_id` y **una política de RLS**, y se
verifica con `get_advisors` después de aplicar.

## Verificación

- Los indicadores son funciones puras: se prueban aislados con escenarios
  armados a mano, dentro del bloque que extrae el arnés de tests.
- **Contraste contra la campaña 2025/26 cerrada**, que tiene ventas y gastos
  reales: el escenario real de esa campaña tiene que reproducir los números que
  Finanzas ya muestra hoy. Si no coinciden, hay un error de atribución.
- Las dos miradas sobre el mismo escenario tienen que cerrar entre sí: la suma
  de la curva financiera del ciclo completo tiene que dar el resultado económico,
  salvo lo que quede por cobrar o pagar.
- Recorrida en el navegador buscando errores de consola y desbordes
  horizontales.

**Límite del asistente**: no se crean cuentas de prueba ni se tipean contraseñas.

## Los datos de ejemplo

Se amplían para que el balance y los ratios se vean completos y no a medias:
maquinaria, saldo de caja, una deuda bancaria y sus cuentas. Sin eso, quien abra
el ejemplo ve la mitad de los indicadores en "todavía no sé" y no entiende para
qué sirven.

## Fuera de alcance

La pantalla de simulación de campañas —la fase 3— usa este mismo motor y tiene su
propia spec. Acá sólo se construye `escenarioSimulado` como constructor, sin
interfaz.

Tampoco entran: balance patrimonial, financiación con intereses, impuestos más
allá de lo que ya se carga como gasto, ni consolidación entre campañas.
