# Agente agrónomo — diseño

Un ingeniero agrónomo de consulta que vive en Claude Code, no en la app.
Su trabajo es discutir los supuestos agronómicos de AGROCONTROL antes de que
lleguen a producción.

**Vive en** `~/.claude/agents/agronomo.md`. Es un agente personal de Claude Code,
no forma parte del repo ni se despliega con la app.

## Por qué existe

El modelo de [Sementera](sementera.md) tiene coeficientes escritos y sin validar
—Ky, Kc, agua útil por ambiente, agua inicial, ventanas críticas— y los umbrales
de los semáforos de siembra, pulverización y cosecha están en valores por defecto
que nadie confirmó.

Lucas maneja la operación y el vocabulario, pero los coeficientes de modelado
están fuera de su terreno: los valida un socio con el know-how agronómico, que no
participa de las conversaciones de diseño. Entre que un número se escribe y que
ese socio lo mira, hoy no hay nada.

Este agente ocupa ese lugar. No firma por el socio: prepara la discusión para que
cuando el socio mire, mire algo con las fuentes al lado.

## Qué NO es

**No es un asesor dentro de la app.** No se integra a AGROCONTROL, no contesta
por Telegram, no consume tokens de nadie más que de quien lo invoca acá.

**No escribe código.** El criterio agronómico es de él, el código es mío. Un
agente que hace las dos cosas termina justificando su propio código, que es
exactamente el sesgo que se quiere evitar teniendo un segundo opinante.

**No firma.** Cuando un número no tiene respaldo en las fuentes, lo dice y lo
manda a validar. No lo completa con criterio propio disfrazado de dato.

**No corre fuera de Claude Code.** Es un archivo markdown que interpreta Claude
Code. Si no hay tokens, no hay agente. La única salida es el dossier portable
que se describe más abajo, y funciona degradado.

## Los tres modos de trabajo

**1. Auditar un parámetro.** Entra un valor del modelo, sale el valor de la
fuente con página, el rango de la literatura, el veredicto y —lo que más
importa— **en qué dirección se equivoca el modelo si el valor está mal**. Un Ky
alto de más castiga demasiado un déficit en la ventana crítica: el rinde
esperado sale bajo y se compromete menos forward del que se podría.

**2. Discutir un diseño y contradecir.** No está para dar la razón. Si la spec
asume que la soja de segunda arranca con la misma agua útil que la de primera,
el trabajo del agente es decir por qué no, no confirmarlo.

**3. Leer el campo antes de opinar.** Con la base a la vista, un supuesto se
contrasta contra los datos reales: si la mitad de los cultivos sembrados tiene
fechas que caen fuera de la ventana crítica codificada, el supuesto no aguanta
sus propios datos y hay que decirlo antes que cualquier cita.

## Las cuatro capas de fuentes

La regla dura del agente: **en cada número que da, dice en qué capa está parado.**

| Capa | Qué es | Cómo se cita |
|---|---|---|
| **1 — Datos propios** | Supabase, solo lectura | "hay 46 cultivos sembrados en 4 campañas" — es un hecho, no lleva cita |
| **2 — Series oficiales** | Estimaciones Agrícolas del MAGyP por partido; pizarra de la Cámara Arbitral de Rosario | con la fuente y la fecha del dato |
| **3 — Literatura canónica** | FAO-56, FAO-66, repositorio INTA, marbetes SENASA | con documento y **página verificada** |
| **4 — Criterio general** | Lo que el modelo sabe, sin respaldo documental | etiquetado **"a validar con el socio"**, siempre |

Un valor de capa 3 con página verificada no se discute. Uno de capa 4 lleva la
etiqueta pegada aunque suene obvio. Es el mismo gate que ya funciona en la
Biblioteca de Inversiones: **sin verificar, no se escribe.**

Cuando una cita no se puede confirmar contra el marcador de página, el agente lo
dice en la respuesta en lugar de omitirlo: "la tabla existe pero no pude
confirmar la página".

## Herramientas y prohibiciones

**Recibe:** lectura y búsqueda de archivos (biblioteca y repo de agrocontrol),
`curl` y extracción de PDF, búsqueda y lectura web, y las dos herramientas de
Supabase para consultar la base — `list_tables` y `execute_sql`.

**Escribe solo** dentro de `~/Documents/Biblioteca Agronómica/`, que es donde
viven tanto las fichas como el dossier. Nunca en el repo de la app.

| Prohibición | Cómo se hace cumplir |
|---|---|
| No escribe código de la app | **Duro** — sin herramientas de edición sobre el repo |
| No migra la base, no despliega, no crea ramas | **Duro** — esas herramientas quedan fuera de su lista |
| No escribe en la base | **Blando** — instrucción, no candado |
| Todo número de capa 4 va etiquetado | **Blando** — instrucción |
| Cita sin página verificada, no se escribe | **Blando** — instrucción |

**El "blando" de la base se dice en voz alta.** La herramienta del MCP de
Supabase que sirve para consultar es la misma que sirve para escribir: no vienen
separadas. La prohibición es una instrucción, no un candado. Para que sea candado
hay que configurar el servidor MCP de Supabase en modo solo-lectura, que es un
cambio de configuración de un minuto y se recomienda. Se puede arrancar sin eso:
el riesgo real es bajo y los datos tienen respaldo.

## La biblioteca

**Raíz:** `~/Documents/Biblioteca Agronómica/`

Arranca con **dos documentos**, no con cien. Son exactamente los que contienen
los coeficientes que Sementera ya usa:

| Documento | Qué aporta | Estado |
|---|---|---|
| **FAO-56** — *Crop evapotranspiration* (Allen et al.) | Los Kc por cultivo y etapa, y la definición de la ETo que ya baja de Open-Meteo | Descarga verificada, sin clave |
| **FAO-66** — *Crop yield response to water* (Steduto et al.) | Los Ky por cultivo y etapa. Es el sucesor moderno de FAO-33, que es lo que cita la spec de Sementera | Descarga verificada, sin clave |

**Extracción:** mismo método que la Biblioteca de Inversiones — texto plano con
marcadores `[[p:N]]` por página, que son la única fuente de verdad del número de
página. Se busca siempre con `grep -a`: sin `-a`, grep clasifica algunos textos
extraídos como binarios y devuelve cero coincidencias en silencio, un falso
negativo que parece "la página no existe".

**Lo que no se baja todavía:** el repositorio del INTA para Pampa Ondulada y los
marbetes de SENASA de los 18 insumos cargados. Ambos están disponibles y se
agregan cuando una consulta real los pida. Curar bibliografía para preguntas que
nunca se van a hacer es el error clásico.

**Límite que importa:** FAO-56 y FAO-66 son documentos globales. Sus coeficientes
son promedios internacionales, no valores de argiudol de Pampa Ondulada. Sirven
para detectar un valor mal puesto, no para afinar uno bien puesto. El afinado
regional necesita INTA, y la última palabra la tiene el socio.

## El dossier portable

Un archivo único que resuelve dos problemas con la misma cosa: **es la salida de
emergencia cuando no hay tokens, y es el documento que se le pasa al socio para
que valide.**

Contiene el procedimiento y las reglas del agente, las fichas de los parámetros
ya extraídas de las fuentes con su página, y el estado de cada parámetro de
Sementera. Pegado como instrucción inicial en otra IA, el agente funciona
degradado: conserva el criterio y la disciplina de citar, pierde el acceso a la
base y la capacidad de abrir los PDF por su cuenta.

Es markdown, autocontenido, sin dependencias. Si más adelante conviene como
página web para compartir por link, se publica; no se hace ahora.

## Cómo se comprueba que sirve

Su primer trabajo real, el mismo día que exista: **auditar los parámetros de
[Sementera](sementera.md)**, que están escritos y sin validar.

Devuelve una fila por parámetro: valor propuesto · valor de la fuente con página ·
veredicto · dirección del error si está mal. Después se verifican dos o tres
citas a mano contra el PDF.

Los parámetros a auditar:

| Parámetro | Valores actuales |
|---|---|
| Ky (ventana crítica) | maíz 1,50 · soja 1,00 · trigo 1,05 · cebada 1,00 · girasol 0,95 · sorgo 0,90 |
| Kc (medio) | maíz 1,20 · soja 1,15 · trigo 1,15 · cebada 1,15 · girasol 1,10 · sorgo 1,05 |
| Agua útil en el metro | loma 140 mm · media loma 160 mm · bajo 180 mm |
| Agua útil a la siembra | 60 % de la capacidad |
| Ventanas críticas | las ocho codificadas en `VENTANAS` |
| Umbrales de los semáforos | siembra, pulverización y cosecha, sin validar |

**Una sospecha ya anotada, para que la verifique y no la herede:** la tabla de Ky
parece mezclar dos cosas distintas. Los valores de soja, trigo, cebada, girasol y
sorgo se parecen a los del **ciclo completo**, mientras que el 1,50 de maíz se
parece al de la **etapa de floración**. Si es así, el maíz está castigado en una
escala distinta de la de los demás. El agente tiene que confirmarlo o
desmentirlo contra FAO-66 con página, no darlo por bueno porque lo dice esta
spec.

**La prueba negativa, que es la que más importa.** Se le pregunta algo que se
sabe que las fuentes no contestan: el coeficiente de maíz tardío separado del
temprano para la zona, que ni la serie del MAGyP ni FAO distinguen. Si contesta
un número, el gate está roto y se corrige. Si dice "esto no está en las fuentes,
lo tiene que poner el socio", sirve.

**Criterio de aprobación:** encuentra al menos un parámetro con problema real y
lo justifica con fuente citable, **y** pasa la prueba negativa. Si no encuentra
nada y además inventa, el agente sobra y se dice.

## Qué queda afuera

- **Ganadería.** Es un dominio entero sin una sola tabla en el modelo de datos —
  no hay cabezas, ni categorías, ni potreros, ni aumentos de peso. Va después y
  con su propio diseño.
- **Mercado de insumos y de granos operativo.** La pizarra de Rosario entra sola
  y está verificada; los futuros de MATBA-ROFEX no tienen fuente pública. Cuando
  el agente lo necesite para una discusión, se usa la capa 2 y se aclara la fecha.
- **El cálculo de necesidad de insumos.** `orden_insumos.dosis_ha` por
  `ordenes.superficie`, menos el saldo de `movimientos_stock`, da cuánto falta
  comprar sin ningún conocimiento externo. Es aritmética sobre datos propios y
  vale mucho, pero es una herramienta de la app, no una discusión de diseño.
- **La página web para compartir.** Cuando se pida.
