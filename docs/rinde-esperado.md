# Rinde esperado — diseño

Primera de cinco piezas surgidas de la reunión del 21 de agosto de 2026 entre
Lucas y su socio. Cambia cómo Sementera nombra y presenta su número principal,
y agrega la posibilidad de mirar el rinde contra una lluvia elegida a mano en
vez de sólo contra la estadística.

Las otras cuatro piezas —margen bruto por cultivo, valuaciones por mes,
importación de facturas en PDF, importación de asientos y sumas y saldos— van
por separado, cada una con su propia especificación.

## Por qué existe

Sementera hoy responde una sola pregunta: *dado lo que llovió y lo que la
estadística dice que puede llover, ¿cuánto va a rendir este lote?* Devuelve tres
escenarios —pesimista, esperado, optimista— armados con los percentiles 20, 50
y 80 de la lluvia histórica de esa misma ventana crítica.

Le faltan dos cosas.

La primera es **decir cuánta agua supone cada escenario**. El número existe: se
calcula en `escenariosVentana` y se reparte día a día sobre el tramo de la
ventana que todavía no ocurrió. Pero nunca sale a la pantalla, así que "pesimista
2.800 kg/ha" es un número sin la premisa que lo sostiene. Nadie puede discutirlo
ni verificarlo.

La segunda es **poder elegir la lluvia**. Un productor mirando el pronóstico
extendido, o sabiendo que viene un año Niña, quiere preguntar *"¿y si llueven 60
milímetros en lugar de 140?"*. Hoy no hay forma de hacer esa pregunta.

## Qué NO cambia

**El modelo agronómico no se toca.** El balance hídrico diario, la respuesta del
rendimiento al agua de FAO-33, las ventanas críticas, los coeficientes Ky y Kc,
el ancla del MAGyP: todo queda exactamente igual. Esta pieza cambia qué se
muestra y qué se puede preguntar, no cómo se calcula.

**Sigue sin ser un pronóstico de rinde.** No sabe de enfermedades, granizo,
malezas, plagas ni nitrógeno. Ver "El renombre" más abajo, que es donde esta
decisión se pone en riesgo y cómo se la protege.

## El renombre

El módulo pasa a decir **"Rinde esperado"** donde hoy dice "rinde esperado por
agua". Son trece lugares en `index.html`, incluida la hoja imprimible.

**Esto tiene un costo y conviene decirlo en voz alta.** El "por agua" no era
decoración: era lo único que, en la pantalla, comunicaba el alcance real del
modelo. Sacarlo deja un número que se lee como un pronóstico de rinde, que es
justo lo que no es. Es el patrón de defecto que más veces mordió a este
proyecto: mostrar algo como si supiera más de lo que sabe.

**La limitación no desaparece, se muda.** Queda como subtítulo permanente
debajo del título, no como nota al pie ni como globo de ayuda:

> Responde sólo al agua. No contempla enfermedades, granizo, malezas, plagas ni
> nitrógeno.

Y sigue completa en la hoja imprimible y en el bloque "Cómo se calcula", que son
los dos lugares por donde entra alguien que no participó de esta conversación.

## Los milímetros detrás de cada escenario

`escenariosVentana` pasa a devolver, además de los tres rindes:

| Campo | Qué es |
|---|---|
| `mmCaidos` | Lluvia real acumulada en el tramo de la ventana que ya ocurrió |
| `mmPendiente` | Los tres valores —p20, p50, p80— del tramo que falta |
| `diasPendientes` | Cuántos días de la ventana todavía no ocurrieron |

En la pantalla, cada escenario muestra su premisa:

> **Pesimista — 2.800 kg/ha**
> 60 mm ya caídos + 85 mm supuestos en los 34 días que faltan de la ventana

Cuando `diasPendientes` es cero la ventana ya pasó entera, no hay nada supuesto,
y los tres escenarios convergen: ahí se muestra sólo el agua real. Es el estado
en el que el número deja de ser una proyección.

**Los milímetros son por ambiente**, igual que el rinde: cada ambiente tiene su
capacidad de agua útil y su propio balance. Suben por la misma cadena que hoy usa
`f.normal` y se ponderan por hectárea, igual que los rindes.

## El escenario propio

Se puede pedir el rinde contra una lluvia elegida, de dos maneras:

- **En milímetros**: "suponé 60 mm en lo que falta de la ventana".
- **Como porcentaje de lo normal**: "suponé el 65 % de la lluvia normal". Este
  es el que usan los escenarios con nombre, porque se aplica solo a cultivos con
  ventanas de distinta duración y en distintos meses.

`escenariosVentana` acepta un parámetro nuevo y opcional, `propio`, que es
`{factor: n}` o `{mm: n}`. El balance hídrico se corre una cuarta vez con ese
tramo pendiente y el resultado sale en un campo nuevo:

```
{ pesimista, esperado, optimista, normal, mmCaidos, mmPendiente,
  diasPendientes, propio }
```

`propio` es `{ kgHa, mm }` —el rinde resultante y los milímetros que se
supusieron para el tramo pendiente, ya resueltos a milímetros aunque hayan
entrado como factor— o **`null` cuando no se pidió ningún escenario propio**.
Nunca cero: no haber preguntado no es haber preguntado y obtenido cero.

Sube por la cadena de ambientes y lotes igual que los otros tres, ponderado por
hectárea. Si algún ambiente no puede calcularlo, el lote entero queda sin
escenario propio, con el mismo criterio que ya rige para los demás: un promedio
de la parte que sí se pudo calcular es un rinde parcial presentado como si fuera
el del lote.

### El escenario propio agrega, nunca reemplaza

**Este es el punto más importante del diseño y cambió respecto de lo conversado.**

La primera versión de esta idea era que el escenario propio *reemplazara* a los
tres automáticos. Leyendo el código quedó claro que eso rompe algo: la regla del
compromiso —cuánto forward se puede vender sin pasarse— se mide contra el
escenario **pesimista**, y lo hace leyendo el mismo campo que devuelve esta
función.

Si el escenario propio pisara el pesimista, cargar "año Niño, 130 % de lo normal"
subiría el límite de venta forward contra ese optimismo. El resultado sería
comprometer grano que no se va a tener, y comprarlo justo el año en que está
caro. Que es exactamente el riesgo que la regla del pesimista existe para evitar.

Entonces: **los tres escenarios estadísticos se calculan siempre**, el escenario
propio se agrega al lado, y **el límite de compromiso sigue leyendo el pesimista
de los percentiles históricos**. Un escenario propio no puede habilitar una venta.

## Los escenarios con nombre

Un escenario guardado es un nombre y un factor: "año Niña, 65 %". Se define una
vez y se aplica a cualquier cultivo, porque escala la mediana histórica de la
ventana que a ese cultivo le toca.

Se pueden elegir por cultivo: mirar el maíz temprano contra un año seco y la
soja de segunda contra uno normal, al mismo tiempo.

**Qué elegiste no se guarda.** La elección es una vista, no un dato: vive en la
pantalla y se pierde al salir. Los escenarios en sí sí se guardan; cuál estabas
mirando, no. Si más adelante hace falta fijarlo, se agrega entonces — es más
barato agregar persistencia después que descubrir que una marca guardada cambió
de significado.

## Marcado

Un rinde calculado contra un escenario propio **queda marcado**, con la misma
pastilla ámbar `criterio propio` que ya usan el pluviómetro manual y el rinde
base cargado a mano. El valor por defecto se sigue guardando como `null`, así
que un cambio en los defaults alcanza a todo lo que nadie tocó.

Un número mirado bajo un supuesto propio y uno salido de la estadística no pueden
verse iguales en la pantalla.

## Modelo de datos

Una tabla nueva. Migración `0016`, aplicada **antes** de desplegar el código que
la usa.

```sql
create table public.escenarios_lluvia (
  id        uuid primary key,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre    text not null,
  factor    numeric(5,3) not null check (factor > 0 and factor <= 3),
  creado_en timestamptz not null default now(),
  unique (user_id, nombre)
);

alter table public.escenarios_lluvia enable row level security;

create policy escenarios_lluvia_propios on public.escenarios_lluvia
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

No va en `perfiles`: ese objeto es el único del modelo que no pasa por
`aCamello`, se lee crudo en guión bajo, y esa particularidad ya costó un defecto
crítico. Una tabla propia sigue el patrón del resto y entra sola en `cargar()`,
`marcar()` y la cola de escritura.

El tope de `factor` en 3 es un límite de cordura, no agronómico: evita que un
dedo de más convierta 65 en 6.500 % y produzca un rinde absurdo con cara de
cálculo.

## Qué se prueba

El invariante fuerte, primero: **con `factor: 1.0` el rinde propio tiene que dar
idéntico al escenario esperado de hoy**. Si difiere, el camino nuevo no está
corriendo el mismo modelo, y todo lo demás da igual.

Después:

- Los milímetros que salen coinciden con los que el motor reparte día a día.
- Con la ventana ya cumplida, `diasPendientes` es cero y no se declara nada supuesto.
- Un factor escala la mediana de la ventana, no la ventana entera ni el tramo ya caído.
- **El límite de compromiso no se mueve cuando hay un escenario propio cargado.**
  Este es el test que protege la decisión de la sección anterior; sin él, un
  refactor futuro puede volver a conectar el propio al pesimista y ningún otro
  test se entera.
- De cable: la pantalla le pasa el factor al motor por argumento y no lo lee del
  estado global. El motor de Sementera no lee estado global por diseño, y es lo
  que va a permitir simular campañas conectándole otra pantalla.

## Lo que tiene que validar el socio

- **Que el renombre valga la pena.** El número va a leerse como pronóstico de
  rinde con más facilidad que antes. La pregunta concreta: ¿el subtítulo alcanza
  para que alguien que abre la app por primera vez entienda qué no contempla?
- **El tope de 3 en el factor** y si tiene sentido un piso (¿un escenario de
  30 % de la lluvia normal es informativo o es ruido?).
- **Si el escenario propio debería poder mover el límite de compromiso** en algún
  caso. Acá se decidió que no, nunca. Si en la operación real hay un caso donde
  sí, hay que saberlo antes de que alguien lo descubra vendiendo.
