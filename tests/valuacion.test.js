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
