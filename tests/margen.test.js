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
