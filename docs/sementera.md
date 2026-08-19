# Módulo Sementera — diseño

Décimo módulo de AGROCONTROL. Proyecta cuánto va a rendir cada lote sembrado
antes de cosecharlo, lo valúa contra el forward, dice cuánto se puede
comprometer sin pasarse, y deja bajar todo eso en el formato que el que lo usa
prefiera.

**Sementera** es el término contable para la siembra: el cultivo en pie con
todo lo que se le puso encima. El módulo se llama así a propósito.

## Por qué existe

Hoy la app sabe lo que pasó: cartas de porte, rinde derivado, ventas. Todo eso
sirve **después** de la cosecha. Entre la siembra y la cosecha —seis meses en
los que se decide la plata— la app no dice nada, y es justo cuando hay que
resolver cuánto forward vender y con qué financiarse.

El módulo cubre esa ventana.

## Qué NO es

**No es un pronóstico de rinde.** Es un **rinde esperado por agua**. No sabe de
enfermedades, granizo, malezas, plagas ni de si faltó nitrógeno. El nombre en
la interfaz dice "por agua" en todos lados, y la hoja imprimible lo aclara. Un
número que promete más de lo que puede se desacredita solo la primera vez que
falla por una causa que no modela.

Tampoco es el expediente publicable ni la garantía bancaria: el polígono
satelital, las fotos del avance y la publicación a terceros quedan afuera por
decisión explícita. Son de BEFORE, que es otra app y sigue separada.

## El modelo

### Ancla

`R_base(cultivo, partido)` = mediana de los últimos 20 años de rinde en kg/ha
de la serie oficial de Estimaciones Agrícolas del MAGyP, filtrada al partido
del establecimiento.

Se embeben **369 filas, 15 KB en JSON compacto** —tres partidos, ocho cultivos,
2005 en adelante— dentro de `index.html`. No se baja nada en vivo: el CSV
completo pesa 15 MB y la app tiene que andar sin señal.

Medianas embebidas (kg/ha):

| Cultivo | S.A. de Areco | C. de Areco | Luján |
|---|---:|---:|---:|
| Maíz | 8.050 | 8.400 | 7.800 |
| Soja 1ª | 3.600 | 3.750 | 3.450 |
| Soja 2ª | 2.190 | 2.540 | 2.106 |
| Trigo | 4.246 | 3.950 | 3.818 |
| Cebada | 3.300 | 3.600 | 3.800 |
| Girasol | 2.752 | 2.300 | 2.200 |
| Sorgo | 6.350 | 5.600 | 6.500 |

**Dos límites conocidos.** La serie oficial trae un solo "maíz" y no separa
temprano de tardío, que en la app son cultivos distintos con ventanas críticas
distintas: ambos arrancan con el mismo ancla. Y la mediana del partido mezcla
campos bien manejados con campos flojos, así que un lote bien llevado la supera.

Los dos se resuelven igual: **el número oficial es el valor por defecto y el de
Lucas lo pisa**, por cultivo y por establecimiento, igual que el pluviómetro
manual pisa al automático. El override queda marcado en la interfaz.

Cuando haya campañas propias cerradas con cartas de porte, el rinde derivado
real reemplaza al ancla oficial sin que nadie toque nada. Esa capa va después.

### Balance hídrico

Diario, por ambiente, desde la fecha de siembra:

```
AU(d) = min( CAU , AU(d-1) + lluvia(d) − ETc(d) )      acotado a ≥ 0
ETc(d) = ETo(d) × Kc(etapa)
```

`AU` es el agua útil almacenada, `CAU` su capacidad, ambas en mm. La lluvia y
la `ETo` salen del archivo de Open-Meteo, que ya se consulta hoy: la lluvia
diaria ya se baja y se descarta al colapsarla en meses, y la `ETo` es un campo
más en la misma llamada (`et0_fao_evapotranspiration`).

### Índice de agua y rinde

Sobre la **ventana crítica de cada cultivo, que ya está codificada en la app**
(`VENTANAS`, con etapa y fechas para los ocho cultivos):

```
IA  = ETR acumulada / ETc acumulada     en la ventana crítica, acotado a [0,1]
Ya  = R_base × ( 1 − Ky × (1 − IA) )
```

Es la respuesta del rendimiento al agua de FAO-33. Se elige porque es
publicada, auditable y explicable: cualquiera puede seguir la cuenta. Un
modelo aprendido no es opción hoy —la app arranca sin histórico propio— y
además un número sin método a la vista no se puede discutir.

El rinde del lote es el promedio de sus ambientes ponderado por superficie.
Los ambientes ya existen en el lote.

### El rango

Salen tres escenarios, no un número. Lo ya transcurrido de la ventana crítica
usa lluvia observada; lo que falta se completa con los **percentiles 20, 50 y
80 de la lluvia acumulada en esa misma ventana en los últimos 20 años** para
las coordenadas del establecimiento, calculados una vez desde el archivo de
Open-Meteo y cacheados. Si esa consulta falla, se cae a la serie `NORMAL` de
lluvia mensual típica que ya está en el código.

El rango arranca ancho en la siembra y se cierra solo a medida que la ventana
crítica pasa de pronóstico a historia. Cuando termina, los tres escenarios
convergen.

### Coeficientes por defecto — **a validar por Lucas**

Van juntos y a la vista en la sección de reglas de decisión, no escondidos.
Mismo criterio que los umbrales de los semáforos, que siguen pendientes de
validación.

| Cultivo | Ky (crítico) | Kc (medio) |
|---|---:|---:|
| Maíz temprano / tardío | 1,50 | 1,20 |
| Soja 1ª / 2ª | 1,00 | 1,15 |
| Trigo | 1,05 | 1,15 |
| Cebada | 1,00 | 1,15 |
| Girasol | 0,95 | 1,10 |
| Sorgo | 0,90 | 1,05 |

Agua útil por ambiente, valores iniciales para argiudol típico de la Pampa
Ondulada, en el metro: **loma 140 mm, media loma 160 mm, bajo 180 mm**. Agua
útil al momento de la siembra: **60 % de la capacidad**.

### Limitación que hay que decir en voz alta

**El modelo ignora el aporte de napa.** En la Pampa Ondulada, en años húmedos y
en los bajos, la napa sostiene el cultivo y el balance hídrico de superficie se
queda corto: el modelo va a subestimar el rinde justo donde más aporta. Se deja
un ajuste por lote —"aporte de napa", en mm— que Lucas carga si lo considera, y
la hoja imprimible aclara si se usó.

Tampoco modela: nitrógeno, enfermedades, plagas, malezas, granizo, ni fecha de
siembra fuera de la ventana óptima.

## Valuación y compromiso

```
Producción esperada (t) = rinde esperado (kg/ha) × ha sembradas / 1000
Valor (USD)             = producción esperada × precio forward (USD/t)
```

El **precio forward se carga a mano**, por cultivo y mes de entrega. Es el único
dato del módulo que no entra solo: no hay fuente pública y gratuita sin
credenciales. Va contra la regla de que los datos entren solos y por eso queda
escrito acá. Si algún día hay acceso a MATBA-ROFEX, se automatiza sin tocar el
resto.

### La regla del compromiso

La app **ya avisa cuando se vende de más**: el formulario de venta compara
producido contra ya vendido y marca en rojo. Hoy esa cuenta corre contra
producción **real**, así que recién sirve después de la cosecha.

El módulo la hace correr contra producción **esperada**, y entonces funciona
desde el día de la siembra. Es la misma regla, alimentada por el modelo en vez
de por las cartas de porte.

**El límite prudente es el escenario pesimista, no el esperado.** Un forward
que no se puede entregar es el error caro: se compra grano en el mercado para
cumplir, justo en el año en que está caro porque a todos les fue mal. El módulo
avisa cuando lo comprometido supera el escenario pesimista, no cuando supera el
esperado.

## La vista

Décimo módulo del menú principal, con su número vivo como los otros nueve.

- **Adelante, la decisión**: por cultivo, el rango de rinde esperado, la
  producción esperada, cuánto hay comprometido y cuánto queda por comprometer.
- **Un nivel adentro, el detalle por lote**: la ficha de la sementera —genética,
  densidad, fecha de siembra, aplicaciones, mm acumulados desde la siembra, mm
  en la ventana crítica y cuánto de esa ventana ya pasó— y la cuenta del
  modelo abierta, paso por paso.

Reutiliza el patrón de panel vivo que ya usan los formularios. Los gráficos, si
van, son SVG a mano como el resto.

## La descarga

El mismo cálculo, tres salidas. No hay tres verdades dando vueltas.

| Formato | Para quién |
|---|---|
| Hoja imprimible | Una persona: banco, socio, contador. Con el método a la vista. |
| CSV | La planilla de Lucas. |
| JSON | Otro sistema. Es el puente si algún día BEFORE lo quiere comer. |

La hoja imprimible es una hoja de estilos de impresión, sin librerías.

## Datos

Todo en `index.html` salvo lo que necesita tabla.

| Qué | Dónde | Nota |
|---|---|---|
| Serie diaria de lluvia y ETo | Tabla nueva `clima_series`, una fila por establecimiento y campaña, con arrays en `jsonb` | Hoy la histórica se baja **sólo para el primer establecimiento** y se guarda mensualizada en `campanias.lluvia`. Para un modelo por lote hace falta por establecimiento. |
| Rindes oficiales por partido | Constante embebida en `index.html` | 15 KB. Se refresca a mano una vez al año. |
| Override de rinde base | `perfiles.rindes_base` `jsonb` | Por cultivo y establecimiento. |
| Precio forward | Tabla nueva `precios_forward` | Cultivo, mes de entrega, USD/t, fecha de carga. |
| Capacidad de agua útil y aporte de napa | Dentro de `lotes.ambientes` `jsonb` | Sin migración. |

Las dos tablas nuevas llevan `user_id` y **una política de RLS cada una**, como
las once que ya existen. Verificar con `get_advisors` después de aplicar, y
guardar las migraciones en `supabase/migrations/`.

## Verificación

- Las cuentas son funciones puras: se prueban aisladas contra los datos de
  ejemplo.
- **Contraste contra la realidad**: la campaña 2025/26 de la semilla está
  cerrada y tiene rindes reales. Se corre el modelo sobre ella y se compara
  contra lo que efectivamente pasó. Es lo más honesto que se puede hacer sin
  esperar una campaña entera.
- Recorrida en el navegador buscando errores de consola y desbordes
  horizontales, como manda el CLAUDE.md.
- Los coeficientes y el rango final los valida Lucas con su criterio. El modelo
  no se da por bueno hasta eso.

**Límite del asistente**: no se crean cuentas de prueba ni se tipean
contraseñas. La verificación visual se hace sobre la página real sin loguearse,
como se hizo con el desborde del modal.

## Fuera de alcance

Polígono satelital del lote, fotos del avance, publicación del expediente a
terceros, NDVI, el monitoreo a campo como corrección del modelo, y el reemplazo
automático del ancla por el rinde derivado propio.

Las últimas tres son capas sobre esta misma estructura, no rediseños.
