var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* El QR de AFIP es la única parte de una factura que no se puede falsear: lo
   firma AFIP y viaja adentro del comprobante. De acá salen el CUIT, la fecha,
   el número y el importe total, sin que nada salga del teléfono.

   Lo que no trae son los ítems. Ver docs/facturas.md. */

function cargarModelo(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  /* atob es global del navegador; en el contexto aislado hay que dárselo. */
  var ctx = { atob: function(b){ return Buffer.from(b, "base64").toString("binary"); } };
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}
var M = cargarModelo();

/* Un payload como el que AFIP define: JSON en base64 detrás de ?p= */
function armarQr(datos){
  return "https://www.afip.gob.ar/fe/qr/?p=" +
    Buffer.from(JSON.stringify(datos), "utf8").toString("base64");
}
var FACTURA_A = {
  ver:1, fecha:"2026-08-14", cuit:30500001735, ptoVta:10, tipoCmp:1, nroCmp:94,
  importe:1210000.50, moneda:"PES", ctz:1,
  tipoDocRec:80, nroDocRec:20123456789, tipoCodAut:"E", codAut:70417054367476
};

test("un QR de AFIP se decodifica entero", function(){
  var f = M.leerQrAfip(armarQr(FACTURA_A));
  assert.ok(f, "tiene que decodificar");
  assert.strictEqual(f.cuit, "30500001735", "el CUIT viaja como número y se usa como texto");
  assert.strictEqual(f.fecha, "2026-08-14");
  assert.strictEqual(f.importe, 1210000.50);
  assert.strictEqual(f.ptoVta, 10);
  assert.strictEqual(f.nroCmp, 94);
  assert.strictEqual(f.tipoCmp, 1);
});

test("la moneda de AFIP se traduce a la de la app", function(){
  assert.strictEqual(M.leerQrAfip(armarQr(FACTURA_A)).moneda, "ARS", "PES es pesos");
  var enDolares = {}; for(var k in FACTURA_A) enDolares[k] = FACTURA_A[k];
  enDolares.moneda = "DOL"; enDolares.ctz = 1350;
  var f = M.leerQrAfip(armarQr(enDolares));
  assert.strictEqual(f.moneda, "USD");
  assert.strictEqual(f.ctz, 1350, "la cotización que declaró el emisor");
});

test("acepta el base64 suelto, no sólo la URL entera", function(){
  var url = armarQr(FACTURA_A);
  var soloBase64 = url.split("?p=")[1];
  assert.strictEqual(M.leerQrAfip(soloBase64).cuit, "30500001735");
});

test("el número de comprobante se arma como lo escribe la gente", function(){
  assert.strictEqual(M.nroComprobante(10, 94), "0010-00000094");
  assert.strictEqual(M.nroComprobante(1, 1), "0001-00000001");
});

test("el tipo de comprobante se nombra, y uno desconocido no se inventa", function(){
  assert.strictEqual(M.tipoComprobante(1), "Factura A");
  assert.strictEqual(M.tipoComprobante(6), "Factura B");
  assert.strictEqual(M.tipoComprobante(11), "Factura C");
  assert.strictEqual(M.tipoComprobante(3), "Nota de crédito A");
  assert.strictEqual(M.tipoComprobante(999), "Comprobante 999",
    "sin nombre conocido se muestra el código, no se adivina");
});

/* ---------- lo que NO tiene que pasar ---------- */

test("un QR que no es de AFIP devuelve null", function(){
  assert.strictEqual(M.leerQrAfip("https://example.com/algo"), null);
  assert.strictEqual(M.leerQrAfip("hola mundo"), null);
  assert.strictEqual(M.leerQrAfip(""), null);
  assert.strictEqual(M.leerQrAfip(null), null);
});

test("un payload corrupto devuelve null, no media factura", function(){
  /* Media factura es peor que ninguna: entra un gasto con el importe de una y
     la fecha de otra, y nada avisa. */
  assert.strictEqual(M.leerQrAfip("https://www.afip.gob.ar/fe/qr/?p=@@@no-es-base64@@@"), null);
  var truncado = Buffer.from('{"ver":1,"cuit":30500001735,"impor', "utf8").toString("base64");
  assert.strictEqual(M.leerQrAfip("https://www.afip.gob.ar/fe/qr/?p=" + truncado), null);
});

test("un JSON válido al que le faltan campos obligatorios devuelve null", function(){
  var incompleto = armarQr({ ver:1, cuit:30500001735 });   /* sin importe ni fecha */
  assert.strictEqual(M.leerQrAfip(incompleto), null,
    "sin importe o sin fecha no hay gasto que cargar");
});

test("cada campo obligatorio se exige por separado", function(){
  /* Un solo test con todo faltante no distingue cuál validación está viva: sin
     importe, la de la fecha puede estar borrada y el test pasa igual. Cada
     falta necesita su caso. */
  function sinCampo(k){
    var d = {}; for(var x in FACTURA_A) d[x] = FACTURA_A[x];
    delete d[k];
    return M.leerQrAfip(armarQr(d));
  }
  assert.strictEqual(sinCampo("fecha"), null, "sin fecha el gasto no tiene cuándo");
  assert.strictEqual(sinCampo("importe"), null, "sin importe no tiene cuánto");
  assert.strictEqual(sinCampo("cuit"), null, "sin CUIT no tiene quién");
});

test("una fecha con formato ajeno se rechaza", function(){
  var d = {}; for(var x in FACTURA_A) d[x] = FACTURA_A[x];
  d.fecha = "14/08/2026";
  assert.strictEqual(M.leerQrAfip(armarQr(d)), null,
    "guardarla así rompería toda comparación por fecha en silencio");
});

test("un importe que no es un número devuelve null", function(){
  var raro = {}; for(var k in FACTURA_A) raro[k] = FACTURA_A[k];
  raro.importe = "mil doscientos";
  assert.strictEqual(M.leerQrAfip(armarQr(raro)), null);
  raro.importe = -500;
  assert.strictEqual(M.leerQrAfip(armarQr(raro)), null, "un importe negativo no es una factura");
});

/* ============================================================
   De la factura al gasto
   ============================================================ */

var YA_CARGADA = { id:"f1", cuit:"30500001735", tipoCmp:1, ptoVta:10, nroCmp:94,
                   fecha:"2026-08-14", importe:1210000.50, moneda:"ARS", estado:"pendiente" };

test("la misma factura dos veces se reconoce y no entra de nuevo", function(){
  /* La base también lo impide con un unique, pero un rechazo de la base se
     suelta de la cola y no se reintenta: conviene frenarlo acá, donde se puede
     explicar por qué. */
  var f = M.leerQrAfip(armarQr(FACTURA_A));
  assert.ok(M.facturaRepetida([YA_CARGADA], f), "es la misma");
  assert.strictEqual(M.facturaRepetida([], f), null, "sin nada cargado no hay repetida");
});

test("otro punto de venta del mismo proveedor no es la misma factura", function(){
  var d = {}; for(var k in FACTURA_A) d[k] = FACTURA_A[k];
  d.ptoVta = 11;
  assert.strictEqual(M.facturaRepetida([YA_CARGADA], M.leerQrAfip(armarQr(d))), null);
});

test("una factura rechazada no bloquea volver a cargarla", function(){
  var rechazada = {}; for(var k in YA_CARGADA) rechazada[k] = YA_CARGADA[k];
  rechazada.estado = "rechazada";
  assert.strictEqual(M.facturaRepetida([rechazada], M.leerQrAfip(armarQr(FACTURA_A))), null,
    "si se rechazó por error, tiene que poder volver a entrar");
});

test("el gasto propuesto sale del QR, en la moneda de la factura", function(){
  var g = M.gastoDeFactura(YA_CARGADA, { tipoCambio:1350, categoria:"Otros" });
  assert.strictEqual(g.monto, 1210000.50);
  assert.strictEqual(g.moneda, "ARS");
  assert.strictEqual(g.tipoCambio, 1350);
  assert.strictEqual(g.fecha, "2026-08-14");
});

test("sin tipo de cambio no se propone un gasto en pesos", function(){
  /* El QR viene en pesos y la app trabaja en dólares. Un gasto en pesos sin
     cotización se valúa en cero: entra plata que no aparece en ningún lado. */
  assert.strictEqual(M.gastoDeFactura(YA_CARGADA, { categoria:"Otros" }), null);
  assert.strictEqual(M.gastoDeFactura(YA_CARGADA, { tipoCambio:0, categoria:"Otros" }), null);
});

test("una factura en dólares no necesita tipo de cambio", function(){
  var enUsd = {}; for(var k in YA_CARGADA) enUsd[k] = YA_CARGADA[k];
  enUsd.moneda = "USD"; enUsd.importe = 900;
  var g = M.gastoDeFactura(enUsd, { categoria:"Otros" });
  assert.ok(g, "en dólares el monto ya está en la moneda de la app");
  assert.strictEqual(g.monto, 900);
  assert.strictEqual(g.moneda, "USD");
});

test("el gasto propuesto usa el neto cuando el extractor ya lo trajo", function(){
  /* Al costo del cultivo va el neto gravado: el IVA es crédito fiscal y no es
     costo. Sumarlo inflaría el costo de cada insumo un 21 %. */
  var conNeto = {}; for(var k in YA_CARGADA) conNeto[k] = YA_CARGADA[k];
  conNeto.neto = 1000000; conNeto.iva = 210000; conNeto.percepciones = 500.50;
  var g = M.gastoDeFactura(conNeto, { tipoCambio:1350, categoria:"Otros" });
  assert.strictEqual(g.monto, 1000000, "el neto, no el total");
});

test("la ecuación fiscal cierra con un peso de tolerancia", function(){
  assert.strictEqual(M.facturaCuadra({ importe:1210500.50, neto:1000000, iva:210000, percepciones:500.50 }), true);
  assert.strictEqual(M.facturaCuadra({ importe:1210501.20, neto:1000000, iva:210000, percepciones:500.50 }), true,
    "setenta centavos es redondeo, no un error");
  assert.strictEqual(M.facturaCuadra({ importe:1300000, neto:1000000, iva:210000, percepciones:500.50 }), false);
});

test("sin extraer todavía, la factura no cuadra ni deja de cuadrar", function(){
  assert.strictEqual(M.facturaCuadra(YA_CARGADA), null,
    "todavía no se sabe: null, no false");
});

test("una factura A con IVA y percepciones cuadra", function(){
  /* El caso normal. La primera versión de la especificación exigía que los
     ítems sumaran el total y habría bloqueado casi todas las facturas reales. */
  assert.strictEqual(M.facturaCuadra({ importe:121000, neto:100000, iva:21000, percepciones:0 }), true);
});
