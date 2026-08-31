# Importación de facturas — diseño

Cuarta de las cinco piezas surgidas de la reunión del 21 de agosto de 2026
entre Lucas y su socio. **Es la primera que rompe la arquitectura de un solo
archivo sin dependencias**, y por eso se diseña aparte y con más cuidado que las
anteriores.

Objetivo: sacarle una foto a una factura y que salgan cargados el gasto, los
insumos con sus cantidades, y la imputación al cultivo — sin tipear.

## Lo que se rompe, dicho de entrada

Hasta hoy la app es `index.html`, 104 KB comprimidos, sin dependencias, y todo
lo que hace lo hace en el teléfono. Esta pieza agrega:

- **Una segunda Edge Function** en Supabase (la primera es el bot de Telegram).
- **Una dependencia de un servicio externo** que cobra por uso.
- **Facturas de tus proveedores saliendo de tu cuenta** hacia ese servicio.
- **Una función que no anda sin señal**, en una app que se usa en el campo.

Las dos primeras son costo. Las dos últimas son las que importan y abajo se
explica cómo se acotan.

## Las tres piezas

### 1 · El QR de AFIP, en el teléfono

Toda factura electrónica argentina lleva un QR obligatorio desde 2020. Adentro
viaja el CUIT del emisor, la fecha, el tipo y número de comprobante, el importe
total, la moneda y la cotización.

El navegador lo lee **sin una sola librería**: `BarcodeDetector` es una API
nativa, y está verificada como disponible con soporte de `qr_code`. Se lee en el
acto, sin señal, y sin que nada salga del teléfono.

Lo que el QR **no** trae son los ítems: no sabe qué compraste, sólo cuánto
pagaste y a quién.

**`BarcodeDetector` no existe en Safari.** Por eso el QR es una *optimización, no
un requisito*: donde está, el gasto aparece cargado al instante y offline; donde
no está, esos mismos datos salen del paso 2 junto con el resto.

### 2 · El cuerpo de la factura, en el servidor

Una Edge Function nueva recibe el archivo —PDF o foto— y devuelve JSON
estructurado: razón social, CUIT, fecha, número de comprobante, importe total,
y la lista de ítems con descripción, cantidad, unidad y precio unitario.

Sigue el molde de la función de Telegram: Deno, secretos por variable de
entorno, la clave nunca en el repositorio ni en el HTML.

Modelo: **`claude-opus-5`**, con el archivo como bloque `document` en base64 y
salida restringida por esquema (`output_config.format`), para que el JSON
devuelto valide siempre y no haya que parsear prosa.

### 3 · La confirmación, que no es opcional

**La app propone; el productor confirma.** Nada se asienta solo.

Esto no es prudencia decorativa. Una factura de urea imputada al lote que no es
ensucia el margen bruto de dos cultivos a la vez, y **la app no tiene forma de
saber que se equivocó**: el número queda creíble y mal, que es exactamente el
defecto que más veces mordió a este proyecto.

Cuesta dos toques por factura. Compra que ningún número entre a la contabilidad
sin que un humano lo haya mirado.

## El autocontrol del importe

**El total del QR es la verdad fiscal y el control de todo lo demás.** Lo firmó
AFIP; no se puede falsear. Lo que devuelve el extractor sí se puede equivocar.

**Pero los ítems no suman el total, y eso es lo normal.** En una factura A el
total es neto gravado + IVA discriminado + percepciones de IIBB. Una regla que
exija que los ítems sumen el importe del QR bloquearía casi todas las facturas
reales. El error estaba en la primera versión de esta especificación y se corrige
acá.

El control correcto es sobre la **suma completa**:

```
neto gravado + IVA + percepciones + otros tributos = importe del QR
```

El extractor devuelve esos totales además de los ítems, y **los ítems tienen que
sumar el neto gravado**, no el total. Si la ecuación no cierra dentro de un peso
—redondeos—, la factura queda marcada como no cuadrada y no se puede confirmar
hasta que alguien la mire.

Esto además mejora la carga: el IVA y las percepciones son plata que hoy se
tipea a mano y que a partir de acá entra sola, separada del costo del insumo.
**Al margen bruto va el neto**, no el total: el IVA es crédito fiscal y no es
costo del cultivo.

Es un autocontrol fuerte y gratis, y es la razón por la que conviene tener las
dos fuentes aunque una sola parezca suficiente.

Cuando no hay QR —una factura vieja, un remito, un ticket— no hay control
cruzado, y **eso se declara en la pantalla**: el gasto entra igual, marcado como
sin verificar contra AFIP.

## La imputación al cultivo

Se **propone** por reglas simples y explicables, nunca por adivinación:

- El insumo se busca en el catálogo por nombre; si no está, se propone crearlo.
- El cultivo-lote se propone por las órdenes de trabajo abiertas de esos días.
- La categoría de gasto sale del tipo de insumo.

Cada propuesta llega con **por qué se propuso**, y todas se pueden cambiar antes
de confirmar. Una propuesta que no se puede explicar no se hace: se deja el
campo vacío.

## El offline

La foto se saca sin señal y **queda en la misma cola de escritura que ya
existe**, esperando conexión para procesarse. No se pierde la factura por estar
en el campo, que era el requisito de fondo.

Donde hay `BarcodeDetector`, además, **el gasto queda cargado en el acto** con
los datos del QR: monto, fecha y proveedor, sin esperar al servidor. Los ítems
llegan después. Eso significa que la parte más valiosa —no tipear el gasto—
funciona sin señal en Android, y sólo el detalle espera.

## Modelo de datos

Una tabla nueva, `facturas`, con su migración y su política de RLS:

| Columna | Para qué |
|---|---|
| `cuit`, `razon_social` | El proveedor. El CUIT viene del QR; el nombre se aprende la primera vez |
| `fecha`, `tipo_cmp`, `nro_cmp` | Identidad del comprobante |
| `importe`, `moneda`, `cotizacion` | Del QR: la verdad fiscal, con IVA y percepciones adentro |
| `neto`, `iva`, `percepciones` | Del extractor. Al costo del cultivo va el neto |
| `qr_crudo` | El payload tal cual, para poder reprocesar sin volver a fotografiar |
| `extraido` (`jsonb`) | Lo que devolvió el extractor, sin tocar |
| `estado` | `pendiente`, `extraida`, `no_cuadra`, `confirmada`, `rechazada` |
| `gasto_id` | El gasto que se creó al confirmar, o `null` |

**El proveedor se aprende.** La primera factura de cada CUIT se nombra a mano; a
partir de ahí se reconoce solo. El QR trae el CUIT, no la razón social, y
consultar el padrón de AFIP requiere clave fiscal y un backend que la guarde —
queda afuera a propósito.

La imagen original **no se guarda**: ocupa, es dato sensible, y una vez extraída
y confirmada no agrega nada que no esté en `extraido` y `qr_crudo`.

## Costo

Estimación, no medición: una factura de una página son unos 2.000–3.000 tokens
de entrada y unos 500 de salida. Con `claude-opus-5` a 5 USD por millón de
entrada y 25 por millón de salida, da del orden de **2 a 3 centavos de dólar por
factura**. Trescientas facturas al año son menos de diez dólares.

**El costo no es el problema de esta pieza; la arquitectura y la privacidad sí.**
Si el volumen resultara mucho mayor, hay modelos más baratos, pero eso es una
decisión a tomar con datos de uso reales y no de antemano.

## La clave

Va como secreto del proyecto en Supabase, igual que `TELEGRAM_TOKEN`. **La carga
Lucas y no debe pasar por el chat.** Ni la app ni el repositorio la conocen.

## Qué se prueba

- El payload del QR se decodifica a sus campos, y uno corrupto se rechaza en vez
  de producir un gasto a medias.
- **Neto + IVA + percepciones tiene que dar el importe del QR**, con un peso de
  tolerancia por redondeo. Si no cierra, la factura queda en `no_cuadra` y no se
  puede confirmar. Es el test que protege el autocontrol.
- **Una factura A con IVA y percepciones cuadra.** Es el caso normal y hay un
  test dedicado: la primera versión de esta especificación exigía que los ítems
  sumaran el total y habría bloqueado casi todas las facturas reales.
- **Al margen bruto va el neto gravado, no el total.** El IVA es crédito fiscal
  y no es costo del cultivo; sumarlo inflaría el costo de cada insumo un 21 %.
- Una factura sin QR entra marcada como sin verificar, no como verificada.
- La misma factura cargada dos veces se detecta por CUIT más número de
  comprobante, y no crea dos gastos.
- Confirmar crea el gasto y los movimientos de stock; rechazar no deja nada.
- **Nada se asienta sin confirmación**: un test de cable que falla si alguna vez
  se crea un gasto directo desde la extracción.

## Riesgos, dichos en voz alta

- **Es la primera dependencia externa del proyecto.** Si el servicio se cae, esta
  función se cae; el resto de la app sigue andando, y eso hay que mantenerlo así.
- **Las facturas salen de la cuenta.** Es una decisión tomada a conciencia, y
  conviene que el socio la conozca antes de que esté en producción.
- **La extracción puede equivocarse en silencio** en todo lo que el QR no
  controla: cantidades, unidades, descripciones. El importe está protegido; el
  detalle no. Por eso la confirmación humana no es negociable.

## Lo que tiene que validar el socio

- **Que las facturas de proveedores se procesen en un servicio externo.** Es la
  decisión de fondo de esta pieza.
- **Que no se guarde la imagen original.** Ahorra espacio y expone menos, pero
  significa que no hay respaldo visual de lo que se cargó.
- **Que al costo del cultivo vaya el neto gravado y no el total.** Es lo
  correcto si el IVA se computa como crédito fiscal; si por la situación fiscal
  el IVA fuera costo, el número cambia un 21 % y hay que saberlo.
- **La tolerancia de un peso** para dar por cerrada la ecuación fiscal. Si los
  proveedores redondean distinto, hay que ajustarla.
- **Si hay casos legítimos donde la ecuación no cierra** —descuentos globales,
  notas de crédito aplicadas en la misma factura—, porque hoy quedarían
  bloqueados esperando confirmación manual.
- **Si la imputación al cultivo debería poder confirmarse en lote** cuando llegan
  veinte facturas juntas, o siempre una por una.
