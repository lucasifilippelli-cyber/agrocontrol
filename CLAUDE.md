# AGROCONTROL — contexto del proyecto

App de gestión agrícola para **Lucas Filippelli**, ingeniero agrónomo en Adecoagro.
Controla siembra, cosecha en kg/ha, insumos, clima y finanzas en la zona de
San Antonio de Areco, Duggan, Luján y Carmen de Areco (Pampa Ondulada).

Habla en castellano rioplatense. Domina el vocabulario técnico: no hace falta
explicarle agronomía, pero sí conviene explicitar los umbrales que uno asume,
porque puede querer ajustarlos a su experiencia.

## Dónde vive todo

| Qué | Dónde |
|---|---|
| Repo | `~/Documents/Proyectos/agrocontrol` → `lucasifilippelli-cyber/agrocontrol` |
| Producción | https://agrocontrol-v84a.vercel.app (Vercel, redespliega solo al hacer push) |
| Base | Supabase `ibgqriyqoikwfhlzmjet`, región sa-east-1, plan Pro |
| Organización | `dsvzzlcghaghkvtfbnyq` |

**No hay build.** La app es `index.html`, un archivo sin dependencias ni
compilación. Se edita y se recarga. El resto del repo: `sw.js`, `manifest.webmanifest`,
`fuentes/` (tipografías propias), `icon-*.png`, `supabase/migrations/`,
`supabase/functions/telegram/`.

## Decisiones ya tomadas — no volver a preguntar

- **Un solo archivo, sin librerías.** La app se usa en el campo: cada dependencia
  externa es un punto de falla con mala señal. Los gráficos son SVG a mano, la
  autenticación es `fetch` contra la API REST de Supabase, las tipografías están
  alojadas en el repo y no en Google.
- **Instalable y offline.** El service worker cachea la app entera. Nunca cachea
  el pronóstico: mejor sin dato que con uno viejo.
- **El rendimiento se deriva, no se guarda.** Cartas de porte → descuento de
  humedad hasta la de recibo de cada especie → kilos secos ÷ superficie
  **cosechada** (que puede ser menor que la sembrada). Se guarda además un rinde
  declarado a campo y se avisa cuando difieren más del 2 %.
- **El stock se deriva, no se guarda.** Es la suma de `movimientos_stock`, por
  insumo y por establecimiento. Así el saldo y su historia no pueden discrepar.
- **La orden de trabajo es lo que hace avanzar el lote.** Al completarla, el
  cultivo pasa a sembrado con su fecha y superficie reales, y se asienta un
  movimiento de stock por cada insumo de la mezcla.
- **El doble cultivo se mira por orden, no sumando superficies.** Trigo y soja de
  segunda usan el lote entero dos veces en el mismo año.
- **Las ventas van por cultivo y campaña, no por lote**: el grano de varios lotes
  viaja junto. El ingreso se reparte después según cuántos kilos puso cada lote.
- **Todo a dólares** al tipo de cambio del día de la operación. Comparar campañas
  en pesos no dice nada.
- **Clima automático** desde Open-Meteo (pronóstico y archivo histórico). El
  pluviómetro cargado a mano pisa al automático y queda marcado.

## Modelo de datos

Once tablas en `public`, todas con `user_id` y **RLS con una política por tabla**.
La clave del cliente viaja en el HTML y es pública por diseño: lo único que separa
los datos de un productor de los de otro son esas políticas. **Verificar siempre
con `get_advisors` después de tocar el esquema.**

`perfiles`, `establecimientos`, `lotes`, `campanias`, `cultivo_lotes`, `tickets`,
`insumos`, `movimientos_stock`, `ordenes`, `orden_insumos`, `ventas`, `gastos`,
`monitoreo`, `telegram_cuentas`.

Los objetos anidados van como `jsonb` (`ambientes`, `lluvia`, `manual`,
`rindes_ambiente`): espeja la forma que ya tiene el modelo en memoria.

### Cómo funciona la persistencia

`E` es el modelo en memoria y **las vistas no se tocan**. `cargar()` baja todo de
una al entrar; cada acción `A.*` llama a `marcar(coleccion, fila)` o
`marcarBaja(coleccion, id)` con lo que tocó, y `guardar()` lo manda junto. Hay una
copia de `E` en `localStorage` como caché de lectura.

Los nombres se traducen solos entre camello (app) y guión bajo (base). **Las
columnas de fecha aceptan `null` pero no `""`** — está contemplado en `aGuion()`.

**Sin conexión se lee del caché pero no se escribe**, y avisa. La cola de escritura
offline sigue pendiente.

## Estado

Hecho y desplegado:

1. Campañas, lotes con ambientes, cultivos, cartas de porte, rendimiento derivado.
2. Cuentas con mail y contraseña, datos en la nube, aislados por RLS.
3. Trabajos con mezcla de varios insumos, stock trazable por campo, aviso de
   faltante y reserva por trabajos abiertos.
4. Clima: pronóstico de siete días traducido a semáforos de siembra,
   pulverización y cosecha, cruzado contra los trabajos programados.
5. Finanzas: ventas con tipo de operación (disponible, forward, futuro, canje),
   gastos, resultado por lote en USD/ha, y cuatro gráficos.
6. Menú principal con los nueve módulos y un número vivo en cada uno.

**Pendiente: el bot de Telegram.** La función está desplegada y probada
(`supabase/functions/telegram/`), pero necesita que Lucas cree el bot en BotFather
y cargue dos secretos en Supabase: `TELEGRAM_TOKEN` y `TELEGRAM_SECRETO`. Después
abre una vez `…/functions/v1/telegram?configurar=TUSECRETO` para dar de alta el
webhook. **El token del bot no debe pasar por el chat.**

## Cómo trabajar acá

```bash
python3 -m http.server 4173      # servir el repo; el service worker necesita HTTP
git add -A && git commit && git push   # Vercel redespliega solo
```

- **Verificar en el navegador antes de dar algo por hecho**, no asumir. Crear una
  cuenta de prueba, cargar los datos de ejemplo, recorrer las vistas buscando
  errores de consola y desbordes horizontales, y **borrar la cuenta de prueba al
  terminar** (`delete from auth.users where email like 'prueba.%'`).
- Los datos de ejemplo (`semilla()`) usan ids cortos que `semillaConIds()` cambia
  por UUID reescribiendo las referencias.
- Las migraciones se aplican con el MCP de Supabase y **se guardan también en
  `supabase/migrations/`** para que quede el registro.

## Trampas conocidas

- **La confirmación por mail está desactivada** en Supabase. Con ella activada el
  registro fallaba: el correo de prueba manda pocos mensajes por hora y ni siquiera
  se creaba el usuario. Contra: cualquiera con la URL puede registrarse. Si algún
  día se cierra, la forma correcta es configurar un correo propio.
- **El token de refresco se consume al usarlo**: con dos pestañas abiertas una
  perdía y echaba al usuario. El arranque ahora sigue con el token de acceso
  vigente si la renovación falla.
- **Los números vuelven de PostgREST como números**, no como texto. Verificado.
- **Queda un aviso de seguridad menor**: la protección contra contraseñas filtradas
  está desactivada (Authentication → Policies).
- Los umbrales de los semáforos son los habituales pero **Lucas todavía no los
  validó** contra su criterio. Están juntos en `index.html`, sección *reglas de
  decisión*.

## Cómo le gusta trabajar

- Nombres de archivo cortos, un archivo por cosa, sin menú de variantes.
- Interfaz amigable antes que formal: decisiones al frente, tablas densas un nivel
  más adentro.
- Los datos entran solos siempre que se pueda; la carga manual es el respaldo.
- Prefiere una pregunta que cambie lo que se va a construir antes que tres de
  detalle. Cuando le ofrecieron opciones de alcance respondió "todas", así que
  conviene plantear capas de un mismo modelo en vez de alternativas excluyentes.
