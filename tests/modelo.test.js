var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Extrae el bloque del modelo de index.html y lo evalúa aislado.
   Así la app sigue siendo un solo archivo y el modelo igual se testea. */
function cargarModelo(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  assert.ok(ini > 0, "falta el marcador modelo:inicio en index.html");
  assert.ok(fin > ini, "falta el marcador modelo:fin en index.html");
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}

var M = cargarModelo();

test("rindeBase devuelve la mediana oficial del partido", function(){
  assert.strictEqual(M.rindeBase("soja_1", "San Antonio de Areco"), 3600);
});

test("Duggan resuelve al partido de San Antonio de Areco", function(){
  assert.strictEqual(M.rindeBase("soja_1", "Duggan"), 3600);
});

test("maíz temprano y tardío comparten ancla porque la serie no los separa", function(){
  assert.strictEqual(M.rindeBase("maiz_t", "Luján"), M.rindeBase("maiz_d", "Luján"));
});

test("una localidad desconocida devuelve null en vez de inventar", function(){
  assert.strictEqual(M.rindeBase("soja_1", "Tandil"), null);
});

test("mmEntre suma sólo los días del rango, con los bordes incluidos", function(){
  var serie = { desde:"2026-01-01", hasta:"2026-01-05",
                lluvia:[10, 0, 5, 20, 1], eto:[4,4,4,4,4] };
  assert.strictEqual(M.mmEntre(serie, "2026-01-01", "2026-01-05"), 36);
  assert.strictEqual(M.mmEntre(serie, "2026-01-03", "2026-01-04"), 25);
});

test("mmEntre ignora lo que cae fuera de la serie", function(){
  var serie = { desde:"2026-01-01", hasta:"2026-01-03", lluvia:[10,10,10], eto:[4,4,4] };
  assert.strictEqual(M.mmEntre(serie, "2025-12-01", "2026-12-31"), 30);
});

test("serieDe encuentra la fila del establecimiento y la campaña pedidos", function(){
  var series = [
    { id:"s1", establecimientoId:"e1", campaniaId:"c1", desde:"2025-09-01", hasta:"2026-06-30",
      lluvia:[1,2,3], eto:[4,5,6] },
    { id:"s2", establecimientoId:"e2", campaniaId:"c1", desde:"2025-09-01", hasta:"2026-06-30",
      lluvia:[7,8,9], eto:[1,1,1] }
  ];
  assert.strictEqual(JSON.stringify(M.serieDe(series, "e2", "c1")),
    JSON.stringify({ desde:"2025-09-01", hasta:"2026-06-30", lluvia:[7,8,9], eto:[1,1,1] }));
});

test("serieDe devuelve null si no hay serie para ese establecimiento y campaña", function(){
  var series = [
    { id:"s1", establecimientoId:"e1", campaniaId:"c1", desde:"2025-09-01", hasta:"2026-06-30",
      lluvia:[1,2,3], eto:[4,5,6] }
  ];
  assert.strictEqual(M.serieDe(series, "e1", "c2"), null);
  assert.strictEqual(M.serieDe([], "e1", "c1"), null);
});
