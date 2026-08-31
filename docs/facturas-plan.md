# Importación de facturas — plan, parte A

> Leer `docs/facturas.md` antes de empezar. Rama `facturas`, commit por tarea.
> ES5 dentro de `index.html`, todo testeable dentro del bloque del modelo,
> `null` nunca se muestra como cero.

**Por qué en dos partes.** La parte A no necesita servidor, ni API key, ni que
nada salga de la cuenta, y anda sin señal: es el QR leído en el teléfono, la
factura guardada y el gasto cargado al confirmar. **Se puede desplegar sola.**
La parte B —la Edge Function y los ítems— es la que rompe la arquitectura y va
después, cuando la clave esté cargada.

### Task 1: Decodificar el QR de AFIP

`leerQrAfip(texto)` acepta la URL del QR o el base64 suelto y devuelve
`{cuit, ptoVta, tipoCmp, nroCmp, fecha, importe, moneda, ctz}`, o **`null`** si
no se puede decodificar. Nunca un objeto a medias: media factura es peor que
ninguna.

- [ ] Tests: un payload real se decodifica entero; uno corrupto, uno truncado y
      un QR de otra cosa devuelven null; la moneda `PES`/`DOL` se traduce a
      `ARS`/`USD`; el comprobante se formatea `0010-00000094`.
- [ ] Implementar, correr, commit.

### Task 2: La tabla de facturas

Migración `0017`, aplicada **antes** de cualquier código que la use, y
verificada con `get_advisors`.

- [ ] Escribir la migración con su política de RLS.
- [ ] Aplicarla y verificar que no abrió ningún agujero.
- [ ] Registrar `facturas` en `TABLAS` y en `vacio`.
- [ ] Correr los tests, verificar el arranque, commit.

### Task 3: Escanear y guardar

Cámara, `BarcodeDetector`, y la factura queda pendiente. Donde no hay
`BarcodeDetector` el botón no se ofrece y se explica por qué, en vez de fallar
al tocarlo.

- [ ] Detección de soporte, y el camino alternativo declarado.
- [ ] La misma factura dos veces se detecta por CUIT más comprobante y no entra
      dos veces.
- [ ] Verificar en el navegador con un QR de prueba.
- [ ] Commit.

### Task 4: Confirmar y que se cargue el gasto

- [ ] La factura pendiente se abre, se completa lo que falta y se confirma.
- [ ] **El tipo de cambio hay que pedirlo**: el QR da pesos y la app trabaja en
      dólares. Se propone el último usado y se puede cambiar. Sin tipo de cambio
      no se confirma — un gasto en pesos valuado a cero ensucia todo.
- [ ] Al confirmar se crea el gasto y la factura queda `confirmada` con su
      `gasto_id`. Rechazar no deja nada.
- [ ] Test de cable: nada se asienta sin pasar por confirmar.
- [ ] Verificar en el navegador, commit.

### Task 5: Cierre de la parte A

- [ ] `node --test` completo en verde.
- [ ] `CLAUDE.md` al día.
- [ ] Mergear, desplegar y **confirmar el sha1 de producción antes de avisar**.
