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

test("el agua útil no pasa de la capacidad: el excedente se pierde", function(){
  var b = M.balanceHidrico({ lluvia:[100, 100], eto:[0, 0], cau:150, au0:100, kc:1 });
  assert.strictEqual(b.au[0], 150);
  assert.strictEqual(b.au[1], 150);
});

test("el agua útil no baja de cero y la ETR se corta en lo disponible", function(){
  var b = M.balanceHidrico({ lluvia:[0, 0], eto:[10, 10], cau:150, au0:5, kc:1 });
  assert.strictEqual(b.au[0], 0);
  assert.strictEqual(b.etr[0], 5);   // sólo pudo evapotranspirar lo que había
  assert.strictEqual(b.etc[0], 10);  // la demanda era 10
  assert.strictEqual(b.etr[1], 0);
});

test("la demanda es ETo por Kc", function(){
  var b = M.balanceHidrico({ lluvia:[0], eto:[10], cau:150, au0:100, kc:1.2 });
  assert.strictEqual(b.etc[0], 12);
  assert.strictEqual(b.etr[0], 12);
  assert.strictEqual(b.au[0], 88);
});

test("la lluvia del día alcanza para la evapotranspiración de ese mismo día", function(){
  var b = M.balanceHidrico({ lluvia:[10], eto:[10], cau:150, au0:0, kc:1 });
  assert.strictEqual(b.etr[0], 10);
  assert.strictEqual(b.au[0], 0);
});

test("sin estrés el índice de agua es 1 y el rinde es el ancla", function(){
  var ia = 1;
  assert.strictEqual(M.rindeEsperado(3600, ia, 1.0), 3600);
});

test("FAO-33: con Ky 1 y mitad del agua, se pierde la mitad del rinde", function(){
  assert.strictEqual(M.rindeEsperado(3600, 0.5, 1.0), 1800);
});

test("un Ky más alto castiga más el mismo déficit", function(){
  var soja = M.rindeEsperado(3600, 0.8, 1.0);
  var maiz = M.rindeEsperado(3600, 0.8, 1.5);
  assert.ok(maiz < soja, "el maíz debería sufrir más el mismo déficit");
});

test("el rinde nunca es negativo por más que el déficit sea total", function(){
  assert.strictEqual(M.rindeEsperado(3600, 0, 1.5), 0);
});

test("la ventana crítica de maíz temprano cae exacta, cruzando diciembre a enero", function(){
  var v = M.ventanaCritica("maiz_t", "2025-07-01");
  assert.strictEqual(v.desde, "2025-12-21");
  assert.strictEqual(v.hasta, "2026-01-13");
  assert.strictEqual(v.etapa, "Floración · R1");
});

test("la ventana crítica de soja de primera cae exacta, en enero-febrero", function(){
  var v = M.ventanaCritica("soja_1", "2025-07-01");
  assert.strictEqual(v.desde, "2026-01-10");
  assert.strictEqual(v.hasta, "2026-02-26");
  assert.strictEqual(v.etapa, "Llenado · R3–R5");
});

test("la ventana crítica de maíz tardío cae exacta, en febrero-marzo", function(){
  var v = M.ventanaCritica("maiz_d", "2025-07-01");
  assert.strictEqual(v.desde, "2026-02-08");
  assert.strictEqual(v.hasta, "2026-03-07");
  assert.strictEqual(v.etapa, "Floración · R1");
});

test("la ventana crítica respeta el febrero bisiesto", function(){
  // Campaña 2027/28: la ventana de soja de primera cae en un febrero de 29
  // días (2028 es bisiesto), y da una fecha distinta a la del febrero de 28
  // días del test anterior para el mismo cultivo.
  var v = M.ventanaCritica("soja_1", "2027-07-01");
  assert.strictEqual(v.desde, "2028-01-10");
  assert.strictEqual(v.hasta, "2028-02-27");
});

test("un cultivo desconocido no tiene ventana crítica", function(){
  assert.strictEqual(M.ventanaCritica("quinoa", "2025-07-01"), null);
});

test("sin fecha de inicio de campaña no hay ventana crítica, no revienta", function(){
  assert.strictEqual(M.ventanaCritica("soja_1", null), null);
});

test("una fracción que redondearía al mes siguiente queda acotada al último día del mes", function(){
  // Ninguna ventana real llega a esto hoy, pero la tabla está pensada para
  // que Lucas la ajuste, así que se fuerza el borde con un cultivo de prueba.
  M.VENTANAS._prueba_borde = { et:"Prueba", ini:0, fin:0.999 };
  var v = M.ventanaCritica("_prueba_borde", "2026-02-01");  // febrero de 28 días
  delete M.VENTANAS._prueba_borde;
  assert.strictEqual(v.hasta, "2026-02-28");
});

test("el índice de agua es la ETR sobre la ETC dentro de la ventana", function(){
  var bal = { etr:[5, 5, 2], etc:[5, 5, 10] };  // 12 de 20
  var r = M.indiceAgua(bal, "2026-01-01", { desde:"2026-01-01", hasta:"2026-01-03" });
  assert.strictEqual(Math.round(r.ia * 100) / 100, 0.6);
  assert.strictEqual(r.dias, 3);
  assert.strictEqual(r.diasVentana, 3);
});

test("si la ventana crítica cae entera fuera de la serie, el índice de agua es null", function(){
  // Lote recién sembrado: la serie sólo trae los primeros días y la ventana
  // crítica está en enero, mucho más adelante.
  var bal = { etr:[1, 1, 1], etc:[2, 2, 2] };
  var r = M.indiceAgua(bal, "2025-09-01", { desde:"2026-01-10", hasta:"2026-02-26" });
  assert.strictEqual(r, null);
});

test("con cobertura parcial de la ventana, el índice de agua avisa cuánto cubrió", function(){
  // La ventana dura 48 días pero la serie sólo trae los primeros 5, y esos
  // 5 fueron secos: el índice no se extrapola al total, se informa la
  // cobertura para que quien llama decida qué hacer.
  var etr = [], etc = [];
  for(var i = 0; i < 5; i++){ etr.push(0); etc.push(4); }
  var bal = { etr: etr, etc: etc };
  var r = M.indiceAgua(bal, "2026-01-10", { desde:"2026-01-10", hasta:"2026-02-26" });
  assert.strictEqual(r.ia, 0);
  assert.strictEqual(r.dias, 5);
  assert.strictEqual(r.diasVentana, 48);
  assert.ok(r.dias < r.diasVentana, "la cobertura tiene que quedar marcada como parcial");
});

test("si no hubo demanda de agua en los días cubiertos, el índice de agua es 1", function(){
  var bal = { etr:[0, 0], etc:[0, 0] };
  var r = M.indiceAgua(bal, "2026-01-01", { desde:"2026-01-01", hasta:"2026-01-02" });
  assert.strictEqual(r.ia, 1);
  assert.strictEqual(r.dias, 2);
  assert.strictEqual(r.diasVentana, 2);
});
