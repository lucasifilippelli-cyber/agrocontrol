# AGROCONTROL — contexto del proyecto

App de gestión agrícola para **Lucas Filippelli**, ingeniero agrónomo en Adecoagro.
Controla siembra, cosecha en kg/ha, insumos, clima, finanzas y contabilidad en la
zona de San Antonio de Areco, Duggan, Luján y Carmen de Areco (Pampa Ondulada).

Habla en castellano rioplatense. Domina la operación y el vocabulario técnico,
pero **los parámetros finos de modelado agronómico y contable los valida un
socio**, no él. Todo entregable de criterio técnico tiene que ser
**autocontenido**: esa persona no participó de las conversaciones donde se
tomaron las decisiones.

**Hay dos usuarios reales con datos cargados**, no uno: Lucas y
`tomasfioreetchevest@gmail.com`. Todo lo que se despliega les llega a los dos.

## Dónde vive todo

| Qué | Dónde |
|---|---|
| Repo | `~/Documents/Proyectos/agrocontrol` → `lucasifilippelli-cyber/agrocontrol` |
| Producción | https://agrocontrol-v84a.vercel.app (Vercel, redespliega solo al hacer push) |
| Base | Supabase `ibgqriyqoikwfhlzmjet`, región sa-east-1, plan Pro |
| Organización | `dsvzzlcghaghkvtfbnyq` |

**No hay build.** La app es `index.html`, un archivo sin dependencias ni
compilación. Se edita y se recarga. El resto del repo: `sw.js`,
`manifest.webmanifest`, `fuentes/`, `icon-*.png`, `supabase/migrations/`,
`supabase/functions/telegram/`, `tests/`, `herramientas/` y `docs/`.

## Decisiones ya tomadas — no volver a preguntar

- **Un solo archivo, sin librerías.** La app se usa en el campo: cada dependencia
  externa es un punto de falla con mala señal. Los gráficos son SVG a mano, la
  autenticación es `fetch` contra la API REST de Supabase, las tipografías están
  alojadas en el repo. Los tests con `node --test` son herramienta de taller y no
  se despliegan.
- **ES5 dentro de `index.html`**: `var` y `function`, sin flechas, sin `let`, sin
  `const`, sin template literals.
- **Instalable y offline.** El service worker cachea la app entera y es
  *network-first* para el mismo origen, así que una actualización llega en la
  próxima carga con señal sin tocar la versión de caché. Nunca cachea el
  pronóstico.
- **`null` significa "todavía no sé" y NUNCA se muestra como cero.** Es la regla
  más importante del proyecto. Ver "El patrón de defecto" más abajo.
- **El rendimiento se deriva, no se guarda.** Cartas de porte → descuento de
  humedad hasta la de recibo → kilos secos ÷ superficie **cosechada**.
- **El stock se deriva, no se guarda.** Suma de `movimientos_stock`.
- **La orden de trabajo es lo que hace avanzar el lote.** Al completarla el
  cultivo pasa a sembrado y se asienta un movimiento por cada insumo.
- **El doble cultivo se mira por orden, no sumando superficies.**
- **Las ventas van por cultivo y campaña, no por lote.** El ingreso se reparte
  después según cuántos kilos puso cada lote.
- **Todo a dólares** al tipo de cambio del día de la operación.
- **Clima automático** desde Open-Meteo. El pluviómetro manual pisa al automático
  y queda marcado.
- **El criterio propio pisa al valor por defecto, y queda marcado.** Vale para el
  pluviómetro, para el rinde base, para la cuenta contable y para los plazos. El
  valor por defecto se guarda como `null`, así que **un cambio en los defaults
  alcanza a todo lo que nadie tocó a mano**.
- **El escenario no lee el estado global.** Todas sus funciones reciben las
  colecciones por argumento. Es lo que va a permitir simular campañas conectando
  una pantalla al mismo motor.

## Los diez módulos

Hoy, Inicio · Trabajos · Resumen · Siembra y cosecha · Lotes · **Finanzas y
Contabilidad** · Insumos · Lluvias · Monitoreo · **Sementera**.

### Sementera

Proyecta cuánto va a rendir cada lote **antes de cosecharlo**, lo valúa contra el
forward y avisa cuánto se puede comprometer sin pasarse.

- **Ancla**: mediana de 20 años de la serie oficial del MAGyP por partido,
  embebida (~700 B). Se regenera con `herramientas/generar-rindes.js`.
- **Modelo**: balance hídrico diario con lluvia y ETo de Open-Meteo, y la
  respuesta del rendimiento al agua de FAO-33 sobre las ventanas críticas.
- **Rango de tres escenarios**: el tramo futuro de la ventana se rellena con los
  percentiles 20/50/80 de la lluvia histórica de esa misma ventana. Se cierra
  solo a medida que la ventana pasa de pronóstico a historia.
- **Regla del compromiso**: el límite se mide contra el escenario **pesimista**,
  no el esperado. Un forward que no se puede entregar obliga a comprar grano
  justo el año en que está caro.
- **Se llama "rinde esperado por agua"**, nunca "pronóstico de rinde": el modelo
  no sabe de enfermedades, granizo, malezas, plagas ni nitrógeno.
- Descarga en hoja imprimible, CSV y JSON, los tres del mismo cálculo.

### Finanzas y Contabilidad

- **Plan de cuentas** de 40 cuentas, ampliable desde la app. Cada gasto y venta se
  imputa por su categoría, así que **nada de lo ya cargado se recodifica a mano**.
- **El cultivo es una dimensión, no una cuenta.**
- **Presupuesto** de lo que falta gastar, por categoría y campaña, con fecha y
  plazo.
- **Plazos de pago y cobro** en cada gasto y venta, con defaults por categoría.
- **El escenario**: real, proyectado y simulado, los tres con la misma forma.
  `inciertoEconomico` e `inciertoFinanciero` separados, porque un monto
  desconocido ablanda la mirada económica y una fecha desconocida sólo la curva
  financiera.

## Modelo de datos

Diecinueve tablas en `public`, todas con `user_id` y **RLS con una política por
tabla**. La clave del cliente viaja en el HTML y es pública por diseño: lo único
que separa los datos de un productor de los de otro son esas políticas.
**Verificar siempre con `get_advisors` después de tocar el esquema.**

`perfiles`, `establecimientos`, `lotes`, `campanias`, `cultivo_lotes`, `tickets`,
`insumos`, `movimientos_stock`, `ordenes`, `orden_insumos`, `ventas`, `gastos`,
`monitoreo`, `telegram_cuentas`, `clima_series`, `precios_forward`, `cuentas`,
`presupuestos`.

Migraciones aplicadas: `0001` a `0015`.

Los objetos anidados van como `jsonb`. **Las columnas de fecha aceptan `null`
pero no `""`** — contemplado en `aGuion()`.

### Cómo funciona la persistencia

`E` es el modelo en memoria y **las vistas no se tocan**. `cargar()` baja todo al
entrar; cada acción `A.*` llama a `marcar(coleccion, fila)` y `guardar()` lo
manda junto. Hay una copia de `E` en `localStorage` como caché de lectura.

**`perfil` es el único objeto que NO pasa por `aCamello`**: se lee crudo, en
guión bajo. La lectura del override de rinde está encapsulada en
`overridesDePerfil` / `escribirOverrides` justamente por eso. **La próxima
columna que se le agregue a `perfiles` puede repetir el error que ya costó un
defecto crítico.**

## Los tests

```bash
node --test          # sin ruta: en Node 24, pasarle un directorio no descubre nada
```

**272 tests.** El arnés lee `index.html`, extrae el bloque entre
`/* === modelo:inicio === */` y `/* === modelo:fin === */`, y lo evalúa aislado
con `vm`. Por eso **toda función testeable tiene que vivir dentro de ese
bloque**, y por eso las funciones del modelo reciben sus datos por argumento.

Dos cosas del arnés que ya mordieron:
- Un array creado dentro del contexto de `vm` **no es reference-equal** a un
  literal del test. Usar `JSON.stringify` en vez de `deepStrictEqual`.
- `tests/cableado.test.js` existe porque las funciones puras quedaban bien
  probadas y **el punto donde se conectan con la app, no**.

## Cómo trabajar acá

```bash
python3 -m http.server 4173      # servir el repo; el service worker necesita HTTP
git add -A && git commit && git push   # Vercel redespliega solo
```

- **Trabajar en rama y mergear al final.** Pushear `main` despliega a producción
  y hay dos usuarios reales.
- **Aplicar la migración ANTES de desplegar el código que la usa.** Ya pasó que
  un campo nuevo en un formulario sin su columna dejaba el plan de cuentas
  truncado e irreparable en el primer arranque.
- **Verificar en el navegador antes de dar algo por hecho.** Los datos de ejemplo
  (`semilla()`) muestran el módulo Sementera funcionando: la campaña 2025/26
  cerrada calcula todo y la 2026/27 en curso muestra los estados de "todavía no
  sé".
- Las migraciones se aplican con el MCP de Supabase y **se guardan también en
  `supabase/migrations/`**.

## Especificaciones, planes y decisiones

| Qué | Dónde |
|---|---|
| Spec de Sementera | `docs/sementera.md` |
| Plan de Sementera | `docs/sementera-plan.md` |
| Spec de Finanzas y Contabilidad | `docs/finanzas.md` |
| Plan del plan de cuentas | `docs/finanzas-plan-1.md` |
| Plan del escenario | `docs/finanzas-plan-2.md` |
| **Decisiones, con su razón y qué cuesta si están mal** | `.superpowers/sdd/*/progress.md` |

Los ledgers de `.superpowers/` **no se versionan** pero son la memoria real del
proyecto: cada decisión tomada en nombre de Lucas está ahí escrita.

## Pendiente, en orden

1. **El documento de validación para el socio.** Prometido y nunca escrito. Ver
   la lista completa abajo. Tiene que ser autocontenido y portable.
2. **El contraste del modelo de Sementera contra la campaña 2025/26 cerrada.**
   Era la Task 11 de su plan y nunca se corrió. **Los tests dicen que las cuentas
   están bien hechas; nadie verificó que el modelo se parezca a la realidad de
   esos campos.**
3. **Etapa 2b**: los indicadores y las dos proyecciones sobre el escenario.
   **Primer ítem, antes de dibujar la primera curva**: la marca `precioEstimado`
   existe en la fila del cultivo pero **falta en el cobro**, así que un monto
   extrapolado y uno cerrado entran a la curva financiera indistinguibles.
4. **Etapa 3**: el balance y los ratios que lo necesitan.
5. **La simulación de campañas.**
6. **El bot de Telegram.** La función está desplegada y probada, pero necesita
   que Lucas cree el bot en BotFather y cargue `TELEGRAM_TOKEN` y
   `TELEGRAM_SECRETO`. **El token no debe pasar por el chat.**

## Lo que tiene que validar el socio

**Agronómicos** — agua útil por ambiente (loma 140, media loma 160, bajo 180 mm)
· agua útil inicial a la siembra (60 %) · aporte de napa por ambiente · Ky por
cultivo (maíz 1,50, soja 1,00, trigo 1,05, cebada 1,00, girasol 0,95, sorgo 0,90)
· Kc · coeficiente de variación de lluvia (0,35) · meses de entrega por cultivo ·
**el ancla del maíz, que comparte número entre temprano y tardío porque la serie
oficial no los separa**.

**Contables** — el plan de cuentas entero · si abrir fitosanitarios por tipo · si
el arrendamiento va como costo directo o indirecto · si la compra de un bien de
uso entra como gasto imputado a activo o por otro camino · los plazos por defecto
· **si la cosecha se paga a 30 días o contra entrega** (en discusión).

**Y una limitación de diseño que conviene decir en voz alta:** el modelo hace
balance hídrico **de superficie** y no modela la napa, así que **subestima el
rinde en los bajos y en años húmedos**, que es justo donde más aporta. El campo
de "aporte de napa" por ambiente es el parche declarado.

## Trampas conocidas

- **El patrón de defecto que se repitió una y otra vez: el modelo no sabía algo y
  lo decía como si supiera.** Un lote recién sembrado mostrando el ancla completa
  como cálculo. Cinco días secos extrapolados a pérdida total. Un precio forward
  guardado con un día del mes y buscado con otro, existiendo en la base y sin
  aparecer nunca. El rinde propio leído con el nombre equivocado. **Ninguno daba
  error; todos daban un número creíble y equivocado.** De ahí la regla del `null`.
- **El segundo patrón: las funciones puras quedan bien probadas y el cable no.**
  Varias veces se pudo revertir un arreglo entero sin que ningún test avisara.
- **La marca `traido` de una campaña** significaba "ya bajé la lluvia mensual" y
  hoy hace falta además la serie diaria. Ya está resuelto —la app detecta sola si
  le falta— pero el patrón vale: **una marca vieja que cambia de significado deja
  usuarios existentes sin la funcionalidad nueva, en silencio.**
- **La confirmación por mail está desactivada** en Supabase. Con ella activada el
  registro fallaba.
- **El token de refresco se consume al usarlo**: con dos pestañas abiertas una
  perdía y echaba al usuario.
- **Los números vuelven de PostgREST como números**, no como texto.
- **Queda un aviso de seguridad menor**: la protección contra contraseñas
  filtradas está desactivada.
- **`guardar()` descarta el resto de la tanda ante el primer rechazo** y no tiene
  reintento ni cola offline. La siembra del plan de cuentas se aisló por eso.
- **`economiaCampania` tiene un agujero contable, desplegado hoy**: un cultivo
  con ventas y cero producción cargada reparte ingreso 0 y esa plata desaparece.
  **El escenario no lo reprodujo a propósito.** Merece tarea propia.
- **Una venta cuyo cultivo no tiene ningún cultivo-lote en la campaña** mete plata
  en los cobros del escenario que no aparece en los cultivos. La etapa 2b **no
  puede usar `suma(ingresos) == suma(cobros)` como autocontrol** creyéndolo
  infalible.

## Cómo le gusta trabajar

- Nombres de archivo cortos, un archivo por cosa, sin menú de variantes.
- Interfaz amigable antes que formal: decisiones al frente, tablas densas un
  nivel más adentro.
- Los datos entran solos siempre que se pueda; la carga manual es el respaldo.
- Prefiere una pregunta que cambie lo que se va a construir antes que tres de
  detalle. Cuando le ofrecen opciones de alcance responde "todas", así que
  conviene plantear **capas de un mismo modelo** en vez de alternativas
  excluyentes.
- Quiere ver las cosas desplegadas para revisarlas, no en un documento.
