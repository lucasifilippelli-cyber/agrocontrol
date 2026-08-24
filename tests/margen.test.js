var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* El margen bruto mide la decisión agronómica, no la estructura de la empresa.
   Lo que define el número es qué costos entran, así que eso es lo primero que
   se prueba. Ver docs/margen-bruto.md. */

function cargarModelo(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  assert.ok(ini > 0 && fin > ini, "no encontré el bloque de modelo en index.html");
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}
var M = cargarModelo();

test("el arrendamiento no es un costo directo del cultivo", function(){
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Arrendamiento") < 0,
    "dos campos alquilados a distinto precio harían ver un cultivo peor que otro por una razón ajena al cultivo");
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Estructura") < 0);
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Honorarios") < 0);
  assert.ok(M.CATEGORIAS_DIRECTAS.indexOf("Impuestos y comisiones") < 0);
});

test("las labores, la cosecha y el flete sí lo son", function(){
  ["Labores de terceros","Cosecha","Flete","Otros"].forEach(function(c){
    assert.ok(M.CATEGORIAS_DIRECTAS.indexOf(c) >= 0, "falta " + c);
  });
});

test("toda categoría directa existe en el catálogo de gastos", function(){
  /* Un typo acá saca plata del margen en silencio: la categoría no matchea
     nunca, el gasto no entra por ningún lado y el margen queda mejor de lo que
     es. Ningún otro test lo cazaría. */
  M.CATEGORIAS_DIRECTAS.forEach(function(c){
    assert.ok(M.CATEGORIAS_GASTO.indexOf(c) >= 0, c + " no está en CATEGORIAS_GASTO");
  });
});

/* ============================================================
   margenBrutoPorCultivo
   ============================================================ */

var CLS = [
  { id:"cl1", campaniaId:"c1", loteId:"l1", cultivo:"soja_1", haSembrada:100 },
  { id:"cl2", campaniaId:"c1", loteId:"l2", cultivo:"soja_1", haSembrada:50 },
  { id:"cl3", campaniaId:"c1", loteId:"l3", cultivo:"maiz_t",  haSembrada:80 },
  { id:"cl9", campaniaId:"c2", loteId:"l9", cultivo:"soja_1", haSembrada:999 }
];
var ORD = [
  { id:"o1", campaniaId:"c1", cultivoLoteId:"cl1" },
  { id:"o2", campaniaId:"c1", cultivoLoteId:"cl2" },
  { id:"o3", campaniaId:"c1", cultivoLoteId:"cl3" }
];
var INS = [
  { id:"i1", nombre:"Semilla DM 4670", tipo:"Semilla",      unidad:"bolsa", precio:100 },
  { id:"i2", nombre:"Urea granulada",  tipo:"Fertilizante", unidad:"kg",    precio:0.5 },
  { id:"i3", nombre:"Glifosato",       tipo:"Herbicida",    unidad:"l",     precio:4 }
];
function mov(id, ordenId, insumoId, cantidad, pu){
  return { id:id, tipo:"aplicacion", ordenId:ordenId, insumoId:insumoId,
           cantidad:cantidad, precioUnitario:(pu===undefined?null:pu) };
}
function base(extra){
  var o = { cultivoLotes:CLS, ordenes:ORD, insumos:INS, campaniaId:"c1",
            movimientos:[ mov("m1","o1","i1",10),        /* soja cl1: 10 × 100 = 1000 */
                          mov("m2","o1","i2",1000),      /* soja cl1: 1000 × 0,5 = 500 */
                          mov("m3","o2","i3",50),        /* soja cl2: 50 × 4 = 200 */
                          mov("m4","o3","i1",20) ],      /* maíz: 20 × 100 = 2000 */
            gastos:[], ventas:[] };
  Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
  return o;
}
function deCultivo(lista, cultivo){
  return lista.filter(function(x){ return x.cultivo === cultivo; })[0];
}

test("un cultivo suma los insumos de todos sus lotes", function(){
  var soja = deCultivo(M.margenBrutoPorCultivo(base()), "soja_1");
  assert.strictEqual(soja.insumos.total, 1700, "1000 + 500 del cl1, más 200 del cl2");
  assert.strictEqual(soja.ha, 150, "las hectáreas de los dos lotes");
});

test("los cultivo-lotes de otra campaña no entran", function(){
  var soja = deCultivo(M.margenBrutoPorCultivo(base()), "soja_1");
  assert.strictEqual(soja.ha, 150, "cl9 es de la campaña c2");
});

test("el arrendamiento imputado a un lote NO entra al margen bruto", function(){
  /* El test que protege la definición. Sin él, agregar una categoría al
     catálogo la mete adentro sin que nadie lo note, y el margen de dos campos
     alquilados a distinto precio deja de ser comparable. */
  var o = base({ gastos:[
    { id:"g1", campaniaId:"c1", cultivoLoteId:"cl1", categoria:"Cosecha",      monto:300, moneda:"USD" },
    { id:"g2", campaniaId:"c1", cultivoLoteId:"cl1", categoria:"Arrendamiento", monto:9000, moneda:"USD" },
    { id:"g3", campaniaId:"c1", cultivoLoteId:"cl1", categoria:"Estructura",    monto:500, moneda:"USD" }
  ]});
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.gastosDirectos.total, 300, "sólo la cosecha");
  assert.strictEqual(JSON.stringify(soja.gastosDirectos.porCategoria),
    JSON.stringify([{categoria:"Cosecha", usd:300}]));
});

test("un gasto sin cultivo-lote es indirecto y no entra", function(){
  var o = base({ gastos:[
    { id:"g1", campaniaId:"c1", cultivoLoteId:null, categoria:"Cosecha", monto:400, moneda:"USD" }
  ]});
  assert.strictEqual(deCultivo(M.margenBrutoPorCultivo(o), "soja_1").gastosDirectos.total, 0);
});

test("el desglose por tipo suma exactamente el total de insumos", function(){
  var soja = deCultivo(M.margenBrutoPorCultivo(base()), "soja_1");
  var suma = soja.insumos.porTipo.reduce(function(a, t){ return a + t.usd; }, 0);
  assert.strictEqual(suma, soja.insumos.total,
    "si el desglose no cierra con el total, uno de los dos miente");
  assert.strictEqual(JSON.stringify(soja.insumos.porTipo),
    JSON.stringify([{tipo:"Semilla",usd:1000},{tipo:"Fertilizante",usd:500},{tipo:"Herbicida",usd:200}]),
    "ordenado de mayor a menor");
});

test("el desglose por insumo trae cantidad y unidad", function(){
  var soja = deCultivo(M.margenBrutoPorCultivo(base()), "soja_1");
  var urea = soja.insumos.porInsumo.filter(function(i){ return i.id === "i2"; })[0];
  assert.strictEqual(urea.cantidad, 1000);
  assert.strictEqual(urea.unidad, "kg");
  assert.strictEqual(urea.usd, 500);
});

test("una aplicación sin precio no baja el total en silencio", function(){
  /* Un insumo sin precio valuado en cero es una mentira barata: el margen sale
     mejor de lo que es y nada avisa. */
  var sinPrecio = { id:"i4", nombre:"Coadyuvante", tipo:"Coadyuvante", unidad:"l", precio:null };
  var o = base({ insumos: INS.concat([sinPrecio]),
                 movimientos: base().movimientos.concat([ mov("m5","o1","i4",30) ]) });
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.insumos.sinValuar, 1, "tiene que quedar declarada");
  assert.strictEqual(soja.insumos.total, 1700, "y no sumar nada al total");
});

test("el precio del movimiento manda sobre el precio de lista del insumo", function(){
  var o = base({ movimientos:[ mov("m1","o1","i1",10,150) ] });
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.insumos.total, 1500, "10 × 150, el precio al que se compró");
});

test("el ingreso sale de las ventas del cultivo, sin pasar por el reparto entre lotes", function(){
  var o = base({ ventas:[
    { id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:200, precioTn:300, moneda:"USD" },
    { id:"v2", campaniaId:"c2", cultivo:"soja_1", toneladas:99,  precioTn:999, moneda:"USD" }
  ]});
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.ingreso, 60000, "la venta de la otra campaña no cuenta");
});

test("un cultivo con ventas y cero producción conserva su ingreso y queda declarado", function(){
  /* El caso normal a mitad de campaña: se vendió forward y todavía no se
     cosechó. En el reparto por lote esa plata desaparece; acá no. */
  var o = base({ ventas:[{ id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:200, precioTn:300, moneda:"USD" }],
                 produccion:{} });
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.ingreso, 60000);
  assert.strictEqual(soja.ingresoSinProduccion, true);
});

test("con producción cargada el ingreso no se declara huérfano", function(){
  var o = base({ ventas:[{ id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:200, precioTn:300, moneda:"USD" }],
                 produccion:{ soja_1:{ kg:600000 } } });
  assert.strictEqual(deCultivo(M.margenBrutoPorCultivo(o), "soja_1").ingresoSinProduccion, false);
});

test("el margen es ingreso menos insumos menos gastos directos", function(){
  var o = base({ ventas:[{ id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:200, precioTn:50, moneda:"USD" }],
                 gastos:[{ id:"g1", campaniaId:"c1", cultivoLoteId:"cl1", categoria:"Flete", monto:300, moneda:"USD" }] });
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.margen, 8000, "10000 − 1700 − 300");
  assert.strictEqual(soja.margenPorHa, Math.round(8000 / 150 * 100) / 100);
});

test("una venta en pesos entra al margen al cambio de la operación", function(){
  var o = base({ ventas:[{ id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:200,
                           precioTn:50000, moneda:"ARS", tipoCambio:1000 }] });
  assert.strictEqual(deCultivo(M.margenBrutoPorCultivo(o), "soja_1").ingreso, 10000);
});

test("con cero hectáreas el margen por hectárea es null, no infinito", function(){
  var o = base({ cultivoLotes:[{ id:"cl1", campaniaId:"c1", loteId:"l1", cultivo:"soja_1", haSembrada:0 }],
                 ventas:[{ id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:1, precioTn:100, moneda:"USD" }] });
  var soja = deCultivo(M.margenBrutoPorCultivo(o), "soja_1");
  assert.strictEqual(soja.margenPorHa, null, "dividir por cero no puede salir como un número");
});

test("los cultivos salen ordenados por margen, de mayor a menor", function(){
  var o = base({ ventas:[
    { id:"v1", campaniaId:"c1", cultivo:"soja_1", toneladas:10, precioTn:200,  moneda:"USD" },
    { id:"v2", campaniaId:"c1", cultivo:"maiz_t", toneladas:10, precioTn:5000, moneda:"USD" }
  ]});
  var r = M.margenBrutoPorCultivo(o);
  assert.strictEqual(r[0].cultivo, "maiz_t");
});
