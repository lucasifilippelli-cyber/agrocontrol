var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* La valuación es el número más grande que muestra la app, y el que más fácil
   miente: no hay serie de precios, sólo el forward que el productor cargó a
   mano. Un mes sin precio no vale cero, vale "todavía no sé".
   Ver docs/valuaciones.md. */

function cargarModelo(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}
var M = cargarModelo();

test("mesesEntre devuelve los primeros de cada mes, inclusive los dos extremos", function(){
  assert.strictEqual(JSON.stringify(M.mesesEntre("2025-07-01", "2025-10-15")),
    JSON.stringify(["2025-07-01","2025-08-01","2025-09-01","2025-10-01"]));
});

test("mesesEntre cruza el año sin saltearse diciembre ni enero", function(){
  var r = M.mesesEntre("2025-11-20", "2026-02-03");
  assert.strictEqual(JSON.stringify(r),
    JSON.stringify(["2025-11-01","2025-12-01","2026-01-01","2026-02-01"]));
});

test("mesesEntre con hasta anterior a desde no devuelve nada", function(){
  assert.strictEqual(M.mesesEntre("2026-03-01", "2025-12-01").length, 0);
});

var FWD = [
  { id:"f1", cultivo:"soja_1", mesEntrega:"2026-05-01", usdTn:300, fechaCarga:"2025-09-10" },
  { id:"f2", cultivo:"soja_1", mesEntrega:"2026-05-01", usdTn:340, fechaCarga:"2025-12-05" },
  { id:"f3", cultivo:"maiz_t", mesEntrega:"2026-04-01", usdTn:190, fechaCarga:"2025-12-20" }
];

test("sin ningún precio cargado antes, el mes vale null y no cero", function(){
  /* Cero es "no vale nada". Null es "no sé cuánto vale". Confundirlos acá
     mostraría un patrimonio de cero dólares con cara de dato. */
  assert.strictEqual(M.precioDelMes(FWD, "soja_1", "2025-08-31"), null);
});

test("el precio del mismo mes no se marca como arrastrado", function(){
  var p = M.precioDelMes(FWD, "soja_1", "2025-09-30");
  assert.strictEqual(p.usdTn, 300);
  assert.strictEqual(p.arrastrado, false);
});

test("un mes sin carga arrastra el último precio conocido, marcado", function(){
  var p = M.precioDelMes(FWD, "soja_1", "2025-10-31");
  assert.strictEqual(p.usdTn, 300, "el de septiembre");
  assert.strictEqual(p.arrastrado, true, "es de otro mes y hay que decirlo");
});

test("cuando aparece un precio nuevo, deja de arrastrarse el viejo", function(){
  var p = M.precioDelMes(FWD, "soja_1", "2025-12-31");
  assert.strictEqual(p.usdTn, 340);
  assert.strictEqual(p.arrastrado, false);
});

test("el precio de un cultivo no se usa para otro", function(){
  assert.strictEqual(M.precioDelMes(FWD, "trigo", "2026-06-30"), null,
    "no hay forward de trigo cargado: el trigo no vale lo que vale la soja");
});

/* ============================================================
   Las capas ciertas: cosechado sin vender, stock e inversión
   ============================================================ */

var CAMP = { id:"c1", nombre:"2025/26", desde:"2025-07-01" };
var CLS  = [{ id:"cl1", campaniaId:"c1", loteId:"l1", cultivo:"soja_1",
              haSembrada:100, haCosechada:100, fechaSiembra:"2025-11-05" }];

function entrada(extra){
  var o = {
    campania:CAMP, cultivoLotes:CLS, lotes:[], establecimientos:[],
    tickets:[], ventas:[], gastos:[], movimientos:[], insumos:[], ordenes:[],
    series:[], historias:{}, overrides:null, forwards:FWD,
    hastaISO:"2026-03-15"
  };
  Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
  return o;
}
function mes(serie, mesISO){
  return serie.filter(function(m){ return m.mes === mesISO; })[0];
}

test("la serie va del inicio de campaña hasta la fecha pedida", function(){
  var r = M.valuacionMensual(entrada());
  assert.strictEqual(r[0].mes, "2025-07-01");
  assert.strictEqual(r[r.length - 1].mes, "2026-03-01");
});

test("el grano cosechado aparece recién en el mes que se cosechó", function(){
  var o = entrada({ tickets:[{ id:"t1", cultivoLoteId:"cl1", fecha:"2026-02-10",
                               kgNetos:300000, humedad:13.5 }] });
  var r = M.valuacionMensual(o);
  assert.strictEqual(mes(r, "2026-01-01").cosechado.tn, 0, "en enero todavía estaba en pie");
  assert.strictEqual(mes(r, "2026-02-01").cosechado.tn, 300, "300 t en el silo");
});

test("vender baja el cosechado sin vender del mes siguiente", function(){
  var o = entrada({
    tickets:[{ id:"t1", cultivoLoteId:"cl1", fecha:"2026-02-10", kgNetos:300000, humedad:13.5 }],
    ventas:[{ id:"v1", campaniaId:"c1", cultivo:"soja_1", fecha:"2026-03-05",
              toneladas:120, precioTn:340, moneda:"USD" }] });
  var r = M.valuacionMensual(o);
  assert.strictEqual(mes(r, "2026-02-01").cosechado.tn, 300);
  assert.strictEqual(mes(r, "2026-03-01").cosechado.tn, 180, "300 menos las 120 vendidas");
});

test("el cosechado sin vender se valúa al precio del mes", function(){
  var o = entrada({ tickets:[{ id:"t1", cultivoLoteId:"cl1", fecha:"2026-02-10",
                               kgNetos:300000, humedad:13.5 }] });
  var m = mes(M.valuacionMensual(o), "2026-02-01");
  assert.strictEqual(m.cosechado.usd, 300 * 340, "el forward de diciembre, arrastrado");
});

test("sin precio no se valúa en cero: se declara", function(){
  var o = entrada({ forwards:[],
    tickets:[{ id:"t1", cultivoLoteId:"cl1", fecha:"2026-02-10", kgNetos:300000, humedad:13.5 }] });
  var m = mes(M.valuacionMensual(o), "2026-02-01");
  assert.strictEqual(m.cosechado.tn, 300, "las toneladas se saben igual");
  assert.strictEqual(m.cosechado.usd, null, "lo que no se sabe es cuánto valen");
  assert.strictEqual(m.total, null, "y el total no puede sumar un null como si fuera cero");
});

test("el stock de insumos no incluye movimientos posteriores al mes", function(){
  var o = entrada({
    insumos:[{ id:"i1", nombre:"Urea", tipo:"Fertilizante", unidad:"kg", precio:0.5 }],
    movimientos:[{ id:"m1", insumoId:"i1", tipo:"compra", fecha:"2025-08-10", cantidad:10000 },
                 { id:"m2", insumoId:"i1", tipo:"compra", fecha:"2026-01-15", cantidad:4000 }] });
  var r = M.valuacionMensual(o);
  assert.strictEqual(mes(r, "2025-09-01").insumos.usd, 5000, "10.000 kg a 0,50");
  assert.strictEqual(mes(r, "2026-02-01").insumos.usd, 7000, "14.000 kg a 0,50");
});

test("aplicar un insumo lo saca del stock", function(){
  var o = entrada({
    insumos:[{ id:"i1", nombre:"Urea", tipo:"Fertilizante", unidad:"kg", precio:0.5 }],
    movimientos:[{ id:"m1", insumoId:"i1", tipo:"compra", fecha:"2025-08-10", cantidad:10000 },
                 { id:"m2", insumoId:"i1", tipo:"aplicacion", fecha:"2025-11-06", cantidad:-6000 }] });
  var r = M.valuacionMensual(o);
  assert.strictEqual(mes(r, "2025-12-01").insumos.usd, 2000, "quedan 4.000 kg");
});

test("la inversión acumulada sólo cuenta gastos hasta ese mes", function(){
  var o = entrada({ gastos:[
    { id:"g1", campaniaId:"c1", cultivoLoteId:"cl1", categoria:"Labores de terceros",
      fecha:"2025-10-20", monto:8000, moneda:"USD" },
    { id:"g2", campaniaId:"c1", cultivoLoteId:null, categoria:"Arrendamiento",
      fecha:"2026-02-01", monto:50000, moneda:"USD" } ]});
  var r = M.valuacionMensual(o);
  assert.strictEqual(mes(r, "2025-09-01").costoAcumulado, 0, "todavía no se gastó nada");
  assert.strictEqual(mes(r, "2025-11-01").costoAcumulado, 8000);
  assert.strictEqual(mes(r, "2026-02-01").costoAcumulado, 58000, "acumula, no reemplaza");
});

test("la inversión acumulada incluye los insumos aplicados", function(){
  var o = entrada({
    insumos:[{ id:"i1", nombre:"Urea", tipo:"Fertilizante", unidad:"kg", precio:0.5 }],
    ordenes:[{ id:"o1", cultivoLoteId:"cl1" }],
    movimientos:[{ id:"m1", insumoId:"i1", tipo:"aplicacion", ordenId:"o1",
                   fecha:"2025-11-06", cantidad:-6000, precioUnitario:0.5 }] });
  assert.strictEqual(mes(M.valuacionMensual(o), "2025-12-01").costoAcumulado, 3000);
});
