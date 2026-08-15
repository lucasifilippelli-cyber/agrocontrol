# AGROCONTROL

Plataforma para controlar siembra, cosecha, insumos y clima por lote, pensada para producción agrícola en la Pampa Ondulada (San Antonio de Areco, Luján y alrededores).

App web instalable, en un solo archivo, sin dependencias ni build.

## Qué hace

**Hoy y esta semana.** Trae el pronóstico de Open-Meteo para las coordenadas de cada establecimiento y lo traduce en decisiones: tres semáforos por día que dicen si se puede sembrar, pulverizar o cosechar, con el motivo en castellano llano. Los trabajos pendientes se cruzan contra el pronóstico del campo donde está cada lote, y cuando el día planificado no acompaña, propone otro.

**Siembra y cosecha.** El ciclo de cada cultivo va de planificado a sembrado, en cosecha y cosechado. El rendimiento no se carga a mano: se deriva de las cartas de porte, descontando humedad hasta la de recibo de cada especie y dividiendo por la superficie efectivamente cosechada, que puede ser menor que la sembrada.

**Trabajos.** Las órdenes son lo que hace avanzar el estado del lote. Al completar una siembra, el cultivo queda sembrado con su fecha y superficie reales, y el insumo se descuenta del stock.

**Lluvias.** La lluvia mensual de la campaña se completa sola desde el archivo histórico de Open-Meteo. Si se carga el pluviómetro del campo, ese dato manda y no se pisa.

## Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | La aplicación entera: estilos, lógica y datos de ejemplo |
| `sw.js` | Service worker. Guarda la app para abrir sin señal; nunca cachea el pronóstico |
| `manifest.webmanifest` | Permite instalarla en la pantalla de inicio |
| `vercel.json` | Cabeceras de caché: la app siempre revalida, los íconos no |

## Desarrollo

No hay build. Se edita `index.html` y se recarga.

Para probar el service worker y la instalación hace falta servirlo por HTTP, porque desde `file://` no funcionan:

```bash
python3 -m http.server 4173
```

## Datos

Los establecimientos, lotes y rendimientos que vienen cargados son **de ejemplo, inventados**, y no pertenecen a ninguna empresa. El clima sí es real.

Todo lo que se carga vive en el `localStorage` del navegador, así que cada dispositivo tiene su propia copia. La versión multiusuario con base compartida está planificada sobre Supabase.

## Umbrales de decisión

Los criterios de los semáforos son los habituales, y son discutibles. Están todos juntos en `index.html`, en la sección *reglas de decisión*.

| | Rojo | Amarillo |
|---|---|---|
| Pulverizar | Viento sobre 20 km/h, o 5 mm de lluvia | Viento bajo 4 km/h (inversión térmica) o sobre 15 km/h (deriva); 40 % de probabilidad de lluvia |
| Cosechar | 1 mm de lluvia o 60 % de probabilidad | Humedad ambiente sobre 88 % |
| Sembrar | 30 mm en los tres días previos | Entre 15 y 30 mm previos |

Además avisa heladas con mínima de 3 °C o menos, golpe de calor sobre 35 °C, lluvias de más de 25 mm y viento sobre 35 km/h.
