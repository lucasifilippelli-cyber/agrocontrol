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

test("los percentiles salen de la lluvia acumulada de cada año en la ventana", function(){
  var hist = [80, 100, 120, 140, 160, 180, 200, 220, 240, 260];
  var p = M.percentilesVentana(hist);
  assert.ok(p.p20 < p.p50 && p.p50 < p.p80, "tienen que venir ordenados");
  assert.strictEqual(p.p50, 170);
});

test("los tres escenarios vienen ordenados de peor a mejor", function(){
  var e = M.escenarios({ rBase:3600, ky:1.0, iaPeor:0.6, iaMedio:0.8, iaMejor:0.95 });
  assert.ok(e.pesimista <= e.esperado && e.esperado <= e.optimista);
});

test("con la ventana crítica ya cerrada los tres escenarios convergen", function(){
  var e = M.escenarios({ rBase:3600, ky:1.0, iaPeor:0.8, iaMedio:0.8, iaMejor:0.8 });
  assert.strictEqual(e.pesimista, e.esperado);
  assert.strictEqual(e.esperado, e.optimista);
});

test("con un solo año de historia los tres percentiles coinciden", function(){
  // Es lo que pasa cuando no hay 20 años reales y se cae a un único valor
  // típico (NORMAL): sin distribución no hay rango, converge a un punto.
  var p = M.percentilesVentana([37]);
  assert.strictEqual(p.p20, 37);
  assert.strictEqual(p.p50, 37);
  assert.strictEqual(p.p80, 37);
});

test("totalesPorAnio suma la lluvia de la ventana equivalente en cada año que la serie larga cubre entero", function(){
  // Tres años seguidos (2021 a 2023, ninguno bisiesto) con la ventana del
  // 10 al 14 de enero cargada a un valor constante y distinto por año.
  var lluvia = [];
  for(var i = 0; i < 1095; i++) lluvia.push(0);
  for(i = 9;   i <= 13;  i++) lluvia[i]   = 10;  // 2021-01-10..14 → 50
  for(i = 374; i <= 378; i++) lluvia[i]   = 14;  // 2022-01-10..14 → 70
  for(i = 739; i <= 743; i++) lluvia[i]   = 18;  // 2023-01-10..14 → 90
  var historiaLarga = { desde:"2021-01-01", lluvia:lluvia };
  var ventana = { desde:"2024-01-10", hasta:"2024-01-14" };
  // JSON.stringify en vez de deepStrictEqual: el array sale de otro contexto
  // de vm y no es reference-equal, aunque tenga el mismo contenido.
  assert.strictEqual(JSON.stringify(M.totalesPorAnio(historiaLarga, ventana)), JSON.stringify([90, 70, 50]));
});

test("totalesPorAnio descarta el año que la serie larga no cubre entero", function(){
  // El archivo sólo arranca a mitad de 2022: el año 2023 (equivalente n=1)
  // cierra entero, pero 2022 (n=2, enero) queda antes del arranque y se corta ahí.
  var lluvia = [];
  for(var i = 0; i < 700; i++) lluvia.push(0);
  for(i = 223; i <= 227; i++) lluvia[i] = 33 / 5;  // 2023-01-10..14 suma 33
  var historiaLarga = { desde:"2022-06-01", lluvia:lluvia };
  var ventana = { desde:"2024-01-10", hasta:"2024-01-14" };
  var r = M.totalesPorAnio(historiaLarga, ventana);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0], 33);
});

test("sin ventana crítica, escenariosVentana no inventa nada y devuelve null", function(){
  // Campaña sin fecha: ventanaCritica ya devuelve null antes; acá se propaga.
  var r = M.escenariosVentana({ ventana:null, serie:{desde:"2026-01-01",lluvia:[],eto:[]},
    cau:50, au0:50, kc:1, rBase:4000, ky:1 });
  assert.strictEqual(r, null);
});

test("con el tramo futuro de la ventana sin datos, el rango sale de los tres percentiles de lluvia", function(){
  // Tres días reales secando el perfil (cau=au0=50, ETo 20/día sin lluvia)
  // dejan el agua útil en cero justo al entrar a la ventana. Los dos días de
  // la ventana (4 y 5 de enero) todavía no ocurrieron, así que se rellenan
  // con la lluvia de los percentiles 20/50/80 de once años de historia: la
  // ventana equivalente (4 y 5 de enero de cada año, 2015 a 2025) está
  // cargada con una suma creciente para que los percentiles den exactamente
  // 0, 20 y 60 mm sin interpolar.
  var lluvia = [];
  for(var i = 0; i <= 3657; i++) lluvia.push(0);
  var porAnio = [ [3656,100], [3290,80], [2925,60], [2560,40], [2195,30],
                   [1829,20], [1464,10], [1099,5], [734,0], [368,0], [3,0] ];
  porAnio.forEach(function(par){ lluvia[par[0]] = par[1]; });

  var o = {
    serie: { desde:"2026-01-01", lluvia:[0,0,0], eto:[20,20,20] },
    ventana: { desde:"2026-01-04", hasta:"2026-01-05" },
    desdeCampaniaISO: null,
    cau:50, au0:50, kc:1,
    historiaLarga: { desde:"2015-01-01", lluvia:lluvia },
    rBase:4000, ky:1
  };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.pesimista, 0);
  assert.strictEqual(e.esperado, 2000);
  assert.strictEqual(e.optimista, 4000);
});

test("con la ventana crítica ya cubierta por datos reales, escenariosVentana converge", function(){
  // La serie ya trae los dos días de la ventana: no hay nada que rellenar,
  // así que los tres percentiles usan exactamente el mismo balance.
  var o = {
    serie: { desde:"2026-02-01", lluvia:[0,0], eto:[20,20] },
    ventana: { desde:"2026-02-01", hasta:"2026-02-02" },
    desdeCampaniaISO: null,
    cau:50, au0:50, kc:1,
    historiaLarga: null,
    rBase:4000, ky:1
  };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.pesimista, e.esperado);
  assert.strictEqual(e.esperado, e.optimista);
  assert.strictEqual(e.optimista, 4000);
});
