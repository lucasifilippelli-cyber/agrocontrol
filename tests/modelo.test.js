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

test("con la ventana crítica ya cubierta por datos reales, escenariosVentana converge (I3: con historia que sí abre percentiles)", function(){
  // Fix round 1, I3: el test original pasaba historiaLarga:null, así que los
  // tres percentiles ya salían en 0 antes de llegar al balance — convergía
  // aunque el relleno estuviera roto (mutante verificado por la revisión:
  // mover `faltan` a +2 y seguía en verde). Se reusa la historia con
  // percentiles bien separados (p20/p50/p80 = 0/20/60, el mismo dataset del
  // test de "rango ancho") pero con la ventana ya cubierta entera por datos
  // reales: no hay nada que rellenar, así que da lo mismo qué percentiles
  // haya disponibles.
  var lluvia = [];
  for(var i = 0; i <= 3657; i++) lluvia.push(0);
  var porAnio = [ [3656,100], [3290,80], [2925,60], [2560,40], [2195,30],
                   [1829,20], [1464,10], [1099,5], [734,0], [368,0], [3,0] ];
  porAnio.forEach(function(par){ lluvia[par[0]] = par[1]; });

  var o = {
    serie: { desde:"2026-01-01", lluvia:[0,0,0,0,0], eto:[15,15,15,15,15] },
    ventana: { desde:"2026-01-04", hasta:"2026-01-05" },
    desdeCampaniaISO: null,
    cau:50, au0:50, kc:1,
    historiaLarga: { desde:"2015-01-01", lluvia:lluvia },
    rBase:4000, ky:1
  };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.pesimista, e.esperado);
  assert.strictEqual(e.esperado, e.optimista);
  assert.strictEqual(e.optimista, 667);   // ia = 5/30, con estrés real de por medio
});

test("C1: el percentil sale del tramo pendiente, no de la ventana entera", function(){
  // Caso de los hallazgos: ventana de 10 días partida en A (días 1-5, ya
  // ocurridos y secos) y B (días 6-10, todavía pendientes). Cinco años de
  // historia donde el total de la ventana siempre da 50 (p20 de la ventana
  // entera = 50) pero el reparto entre A y B varía tanto que el p20 de B
  // solo es 8 — la mediana no sirve de pesimista.
  var lluvia = [];
  for(var i = 0; i <= 1470; i++) lluvia.push(0);
  // [offset del 1° de enero de ese año, A; offset del 6 de enero, B]
  var datos = [
    [1461, 0,  1466, 50],  // 2025: A=0,  B=50
    [1095, 50, 1100, 0],   // 2024: A=50, B=0
    [730,  10, 735,  40],  // 2023: A=10, B=40
    [365,  40, 370,  10],  // 2022: A=40, B=10
    [0,    25, 5,    25]   // 2021: A=25, B=25
  ];
  datos.forEach(function(d){ lluvia[d[0]] = d[1]; lluvia[d[2]] = d[3]; });

  var o = {
    serie: { desde:"2026-01-01", lluvia:[0,0,0,0,0], eto:[20,20,20,20,20] },
    ventana: { desde:"2026-01-01", hasta:"2026-01-10" },
    desdeCampaniaISO: null,
    cau:100, au0:100, kc:1,
    historiaLarga: { desde:"2021-01-01", lluvia:lluvia },
    rBase:4000, ky:1
  };
  var e = M.escenariosVentana(o);
  // p20(B) = 8 → 1.6 mm/día en los 5 días pendientes → ia = 108/200 = 0.54
  assert.strictEqual(e.pesimista, 2160);
  // con el bug (p20 de la ventana entera / 10 días = 5 mm/día) hubiera dado 2500
  assert.notStrictEqual(e.pesimista, 2500);
});

test("C2: el ETo del relleno sale de la climatología del día, no del promedio de toda la serie", function(){
  // La serie real trae cinco días de ETo bajo (5 mm/día, como si arrancara en
  // invierno) pero la climatología del día que falta rellenar es alta
  // (30 mm/día, como corresponde a la ventana crítica). Sin lluvia en la
  // historia (percentiles en 0, no hay relleno de agua) toda la diferencia de
  // rinde sale exclusivamente del ETo usado.
  var lluvia = [], eto = [];
  for(var i = 0; i <= 1470; i++){ lluvia.push(0); eto.push(0); }
  [5, 370, 735, 1100, 1466].forEach(function(idx){ eto[idx] = 30; });

  var o = {
    serie: { desde:"2026-01-01", lluvia:[0,0,0,0,0], eto:[5,5,5,5,5] },
    ventana: { desde:"2026-01-06", hasta:"2026-01-06" },
    desdeCampaniaISO: null,
    cau:100, au0:35, kc:1,   // au0 alcanza para los 5 días reales (etc=5) sin estrés
    historiaLarga: { desde:"2021-01-01", lluvia:lluvia, eto:eto },
    rBase:4000, ky:1
  };
  var e = M.escenariosVentana(o);
  // con ETo climatológico (30): etr = min(30,10) = 10 → ia = 10/30 = 0,333…
  assert.strictEqual(e.pesimista, 1333);
  assert.strictEqual(e.pesimista, e.optimista);   // no llovió en ningún percentil: sólo cambia el ETo
});

test("C3: sin ETc en la ventana no hay base para un rinde, y no se devuelve el ancla completa (ventana cubierta)", function(){
  // Reproduce el camino exacto de los hallazgos: una fila de climaSeries sin
  // ETo (serieDe la trae con eto:[] cuando la campaña se trajo con una
  // versión anterior). Antes, indiceAgua daba ia=1 "sin demanda" y los tres
  // escenarios devolvían R_base completo como si fuera un cálculo.
  var o = {
    serie: { desde:"2026-03-01", lluvia:[0,0], eto:[] },
    ventana: { desde:"2026-03-01", hasta:"2026-03-02" },
    desdeCampaniaISO: null,
    cau:50, au0:50, kc:1,
    historiaLarga: null,
    rBase:4000, ky:1
  };
  assert.strictEqual(M.escenariosVentana(o), null);
});

test("C3 (fix round 2): con eto más corta que lluvia, el relleno climatológico no se desplaza a los días reales", function(){
  // Fix round 1 dejó una guarda (etcVentana <= 0) pero abrió el mismo agujero
  // por otra puerta: el push sobre o.serie.eto.slice() appendea al FINAL del
  // array corto, no en la posición del día. Con eto:[] (5 días reales sin
  // dato) y 5 días pendientes con ETo climatológica real, el push viejo hacía
  // aterrizar esos 25 mm/día en los índices 0-4 (los días REALES) y dejaba
  // los índices 5-9 (los días pendientes, los que en verdad importan) en
  // ETc 0 — la guarda no frena nada porque la ETc total de la ventana sigue
  // dando positiva, sólo que mal repartida. Con cau chico (20) y 30 mm/día de
  // lluvia real, la demanda mal ubicada se satisface sola con esa lluvia y da
  // ancla completa (4000); bien ubicada, la lluvia real desborda el perfil
  // sin uso (etc=0 esos días) y el perfil llega vacío a la ventana que
  // importa. Verificado contra el código sin el parche de padding: da
  // {pesimista:4000, esperado:4000, optimista:4000}, el mismo bug que
  // reportó la revisión.
  var lluvia = [], eto = [];
  for(var i = 0; i <= 1470; i++){ lluvia.push(0); eto.push(0); }
  [5,6,7,8,9, 370,371,372,373,374, 735,736,737,738,739,
   1100,1101,1102,1103,1104, 1466,1467,1468,1469,1470].forEach(function(idx){ eto[idx] = 25; });

  var o = {
    serie: { desde:"2026-01-01", lluvia:[30,30,30,30,30], eto:[] },
    ventana: { desde:"2026-01-01", hasta:"2026-01-10" },
    desdeCampaniaISO: null,
    cau:20, au0:0, kc:1,
    historiaLarga: { desde:"2021-01-01", lluvia:lluvia, eto:eto },
    rBase:4000, ky:1
  };
  var e = M.escenariosVentana(o);
  assert.strictEqual(e.pesimista, 640);
  assert.notStrictEqual(e.pesimista, 4000);   // el bug de la revisión daba el ancla completa
});

test("C4: sin 20 años reales, percentilesDeVentana abre un rango alrededor de NORMAL en vez de un punto", function(){
  var ventana = { desde:"2025-07-10", hasta:"2025-07-15" };  // 6 días, todos julio
  var p = M.percentilesDeVentana(null, ventana, "2025-07-01");
  // Fix round 2: unificado a un decimal en las dos ramas (antes p20/p80
  // redondeaban a entero y p50 a un decimal, inconsistente).
  assert.strictEqual(p.p20, 3.8);
  assert.strictEqual(p.p50, 5.4);
  assert.strictEqual(p.p80, 7);
  assert.ok(p.p20 < p.p50 && p.p50 < p.p80, "antes colapsaban los tres al mismo punto");
});

test("I1: si el hueco está adelante (la serie arranca después que la ventana), no se rellena y se propaga null", function(){
  // El relleno de escenariosVentana sólo tapa el final de la ventana. Si la
  // serie empieza después del comienzo de la ventana, indiceAgua cubre menos
  // días de los que tiene la ventana aunque el balance tenga longitud de
  // sobra — r.dias !== r.diasVentana tiene que frenarlo.
  var o = {
    serie: { desde:"2026-01-05", lluvia:[], eto:[] },
    ventana: { desde:"2026-01-01", hasta:"2026-01-10" },
    desdeCampaniaISO: null,
    cau:50, au0:50, kc:1,
    historiaLarga: null,
    rBase:4000, ky:1
  };
  assert.strictEqual(M.escenariosVentana(o), null);
});

test("I2: sin serie (serieDe devuelve null) escenariosVentana no revienta, devuelve null", function(){
  var o = { serie:null, ventana:{ desde:"2026-01-01", hasta:"2026-01-02" },
    desdeCampaniaISO:null, cau:50, au0:50, kc:1, historiaLarga:null, rBase:4000, ky:1 };
  assert.strictEqual(M.escenariosVentana(o), null);
});

test("I4: totalNormalVentana con la ventana dentro de un solo mes", function(){
  // Julio de campaña = NORMAL[0] = 28 mm sobre 31 días. Seis días de ventana.
  var t = M.totalNormalVentana({ desde:"2025-07-10", hasta:"2025-07-15" }, "2025-07-01");
  assert.strictEqual(t, 5.4);   // 6 × 28/31, redondeado a un decimal
});

test("I4: totalNormalVentana con la ventana a caballo de dos meses", function(){
  // Tres días de julio (NORMAL[0]=28/31) más dos de agosto (NORMAL[1]=35/31).
  var t = M.totalNormalVentana({ desde:"2025-07-29", hasta:"2025-08-02" }, "2025-07-01");
  assert.strictEqual(t, 5);   // 3×28/31 + 2×35/31 = 4,9677… → 5,0
});

test("el número de Lucas pisa al oficial", function(){
  var ancla = M.rindeAncla("maiz_d", { localidad:"Luján" }, { "maiz_d": 11000 });
  assert.strictEqual(ancla.kgHa, 11000);
  assert.strictEqual(ancla.propio, true);
});

test("sin override manda el oficial y queda marcado como tal", function(){
  var ancla = M.rindeAncla("maiz_d", { localidad:"Luján" }, {});
  assert.strictEqual(ancla.kgHa, 7800);
  assert.strictEqual(ancla.propio, false);
});

test("un override en 0 también pisa al oficial: 0 no es lo mismo que sin cargar", function(){
  // Guarda contra simplificar "o != null && o !== \"\"" a "if(o)", que trataría
  // un rinde propio de 0 igual que no haber cargado nada.
  var ancla = M.rindeAncla("maiz_d", { localidad:"Luján" }, { "maiz_d": 0 });
  assert.strictEqual(ancla.kgHa, 0);
  assert.strictEqual(ancla.propio, true);
});

test("armarAmbiente: agua útil vacía cae al valor inicial del ambiente", function(){
  var a = M.armarAmbiente("Loma", "52.1", "", 140, "");
  assert.strictEqual(a.cau, 140);
});

test("armarAmbiente: un 0 explícito de agua útil se respeta, no cae al inicial", function(){
  var a = M.armarAmbiente("Loma", "52.1", "0", 140, "");
  assert.strictEqual(a.cau, 0);
});

test("armarAmbiente: napa vacía graba null — todavía no se consideró", function(){
  var a = M.armarAmbiente("Bajo", "28.1", "180", 180, "");
  assert.strictEqual(a.napa, null);
});

test("armarAmbiente: napa en \"0\" graba 0 — se consideró y no aporta", function(){
  var a = M.armarAmbiente("Loma", "52.1", "140", 140, "0");
  assert.strictEqual(a.napa, 0);
});

test("armarAmbiente: un valor normal de napa pasa como número", function(){
  var a = M.armarAmbiente("Bajo", "28.1", "180", 180, "35");
  assert.strictEqual(a.napa, 35);
  assert.strictEqual(a.ha, 28.1);
  assert.strictEqual(a.nombre, "Bajo");
});

test("forwardDe toma el precio cargado más recientemente", function(){
  var lista = [
    { cultivo:"soja_1", mesEntrega:"2026-05-01", usdTn:330, fechaCarga:"2026-08-01" },
    { cultivo:"soja_1", mesEntrega:"2026-05-01", usdTn:340, fechaCarga:"2026-08-15" }
  ];
  assert.strictEqual(M.forwardDe(lista, "soja_1", "2026-05-01"), 340);
});

test("sin precio cargado devuelve null en vez de suponer", function(){
  assert.strictEqual(M.forwardDe([], "soja_1", "2026-05-01"), null);
});

test("un precio de otro cultivo en el mismo mes de entrega no cuenta", function(){
  // Guarda contra mutar el && del filtro a ||: con OR, este registro de
  // maiz_t calzaría igual porque el mes coincide, aunque el cultivo no.
  var lista = [
    { cultivo:"maiz_t", mesEntrega:"2026-05-01", usdTn:200, fechaCarga:"2026-08-01" }
  ];
  assert.strictEqual(M.forwardDe(lista, "soja_1", "2026-05-01"), null);
});

test("un precio del cultivo correcto pero de otro mes de entrega no cuenta", function(){
  // El cultivo existe en la lista, pero para un mes distinto: tiene que
  // devolver null en vez del precio de ese otro mes.
  var lista = [
    { cultivo:"soja_1", mesEntrega:"2026-04-01", usdTn:300, fechaCarga:"2026-08-01" }
  ];
  assert.strictEqual(M.forwardDe(lista, "soja_1", "2026-05-01"), null);
});

test("con la misma fechaCarga, desempata por creadoEn de forma estable, sin importar el orden", function(){
  var a = { cultivo:"maiz_t", mesEntrega:"2026-06-01", usdTn:200, fechaCarga:"2026-08-01", creadoEn:"2026-08-01T10:00:00Z" };
  var b = { cultivo:"maiz_t", mesEntrega:"2026-06-01", usdTn:210, fechaCarga:"2026-08-01", creadoEn:"2026-08-01T15:00:00Z" };
  assert.strictEqual(M.forwardDe([a, b], "maiz_t", "2026-06-01"), 210);
  assert.strictEqual(M.forwardDe([b, a], "maiz_t", "2026-06-01"), 210);
});

test("el margen se mide contra el escenario pesimista, no contra el esperado", function(){
  var c = M.compromiso({ tnPesimista:100, tnVendidas:80 });
  assert.strictEqual(c.margen, 20);
  assert.strictEqual(c.excedido, false);
});

test("avisa cuando lo comprometido pasa el escenario pesimista", function(){
  var c = M.compromiso({ tnPesimista:100, tnVendidas:120 });
  assert.strictEqual(c.margen, -20);
  assert.strictEqual(c.excedido, true);
});

test("vender exactamente el pesimista todavía no es exceso", function(){
  assert.strictEqual(M.compromiso({ tnPesimista:100, tnVendidas:100 }).excedido, false);
});

test("compromiso: con una entrada faltante devuelve null, no NaN disfrazado de OK", function(){
  assert.strictEqual(M.compromiso({ tnPesimista:100 }), null);
});

test("compromiso: con una entrada no numérica devuelve null", function(){
  assert.strictEqual(M.compromiso({ tnPesimista:"100", tnVendidas:80 }), null);
});

test("compromiso: con NaN explícito devuelve null en vez de excedido:false", function(){
  assert.strictEqual(M.compromiso({ tnPesimista:NaN, tnVendidas:80 }), null);
});

/* ============================================================
   Task 9 · el armado de la vista Sementera
   Lo que la pantalla muestra sale de acá, así que acá se prueba:
   sobre todo que un "todavía no sé" no se disfrace de número.
   ============================================================ */

var CAMP = { id:"c1", nombre:"2025/26", desde:"2025-07-01" };
var EST  = { id:"e1", nombre:"La Constancia", localidad:"San Antonio de Areco" };
var LOTE = { id:"l1", establecimientoId:"e1", nombre:"Lote 7 — Aguada", ha:100,
             ambientes:[ { nombre:"Loma", ha:40, cau:140, napa:null },
                         { nombre:"Bajo", ha:60, cau:180, napa:null } ] };
var CL   = { id:"cl1", campaniaId:"c1", loteId:"l1", cultivo:"soja_1",
             haSembrada:100, fechaSiembra:"2025-11-05",
             variedad:"DM 4670", densidad:"320.000 pl/ha" };

/* Serie diaria pareja desde el inicio de campaña hasta la fecha que se pida. */
function serieHasta(hastaISO, mm, eto){
  var n = M.diasEntre("2025-07-01", hastaISO) + 1, lluvia = [], etos = [];
  for(var i = 0; i < n; i++){ lluvia.push(mm); etos.push(eto); }
  return { id:"s1", establecimientoId:"e1", campaniaId:"c1",
           desde:"2025-07-01", hasta:hastaISO, lluvia:lluvia, eto:etos };
}
function fila(extra){
  var o = { cl:CL, lote:LOTE, establecimiento:EST, campania:CAMP,
            serie:null, historiaLarga:null, overrides:null };
  Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
  return M.filaSementera(o);
}

test("sin serie climática el lote no da un rinde: dice que todavía no sabe", function(){
  var f = fila({});
  assert.strictEqual(f.kgHa, null);
  assert.strictEqual(f.tn, null);
  assert.strictEqual(f.falta, "serie");
});

test("con la ventana crítica por delante hay rango proyectado pero nada medido", function(){
  /* El caso normal durante media campaña: sembrado en noviembre, la ventana
     de soja 1ª arranca el 10 de enero. */
  var f = fila({ serie: serieHasta("2025-12-31", 3, 4) });
  assert.ok(f.kgHa, "tiene que dar un rango proyectado");
  assert.strictEqual(f.ia, null, "no hay índice de agua medido todavía");
  assert.strictEqual(f.iaDias, 0);
  assert.ok(f.iaDiasVentana > 0);
});

test("el índice de agua aparece recién cuando la ventana empieza a transcurrir", function(){
  var f = fila({ serie: serieHasta("2026-01-20", 3, 4) });
  assert.notStrictEqual(f.ia, null);
  assert.strictEqual(f.iaDias, 11);          /* del 10 al 20 de enero */
  assert.strictEqual(f.iaDiasVentana, 48);   /* 10 de enero al 26 de febrero */
});

test("con Ky 1,50 todo índice de agua bajo 0,333 da el mismo cero", function(){
  var f = fila({ cl:{ id:"cl2", campaniaId:"c1", loteId:"l1", cultivo:"maiz_t",
                      haSembrada:100, fechaSiembra:"2025-09-25" } });
  assert.strictEqual(f.iaCero, 0.333);
  assert.strictEqual(M.rindeEsperado(8050, 0.30, 1.5), 0);
  assert.strictEqual(M.rindeEsperado(8050, 0.05, 1.5), 0);
});

test("el ancla que puso el agrónomo queda marcada como propia", function(){
  var f = fila({ serie: serieHasta("2026-02-26", 3, 4), overrides:{ soja_1:4200 } });
  assert.strictEqual(f.ancla.propio, true);
  assert.strictEqual(f.ancla.kgHa, 4200);
});

test("la historia climática degradada a NORMAL queda marcada en la fila", function(){
  var f = fila({ serie: serieHasta("2025-12-31", 3, 4),
                 historiaLarga:{ desde:null, lluvia:[], normal:true } });
  assert.strictEqual(f.normal, true);
});

var LOTE_CON_NAPA = { id:"l1", establecimientoId:"e1", nombre:"Lote 7 — Aguada", ha:100,
  ambientes:[ { nombre:"Loma", ha:40, cau:140, napa:null },
              { nombre:"Bajo", ha:60, cau:180, napa:60 } ] };

test("el aporte de napa queda marcado y sostiene el rinde en un déficit moderado", function(){
  var serie = serieHasta("2026-02-26", 3, 4);
  var sin = fila({ serie:serie });
  var con = fila({ serie:serie, lote:LOTE_CON_NAPA });
  assert.strictEqual(sin.napa, false);
  assert.strictEqual(con.napa, true);
  assert.ok(con.kgHa.esperado > sin.kgHa.esperado, "la napa tiene que sostener el rinde");
});

test("en una seca larga la napa se consume y deja de aportar, pero nunca resta", function(){
  /* No es un defecto: 60 mm de napa contra 3,75 mm/día de déficit se agotan
     mucho antes de la ventana crítica. Se prueba para que quede escrito que
     el aporte es un depósito y no una canilla abierta. */
  var serie = serieHasta("2026-02-26", 2, 5);
  var sin = fila({ serie:serie });
  var con = fila({ serie:serie, lote:LOTE_CON_NAPA });
  assert.ok(con.kgHa.esperado >= sin.kgHa.esperado);
});

test("el balance arranca en la siembra, no en el barbecho de julio", function(){
  var serie = serieHasta("2026-02-26", 3, 4);
  var s = M.serieDesdeSiembra(serie, "2025-11-05");
  assert.strictEqual(s.desde, "2025-11-05");
  assert.strictEqual(s.lluvia.length, serie.lluvia.length - 127);
  assert.strictEqual(s.eto.length, s.lluvia.length);
});

test("sembrado hace tres días todavía no hay serie: no es un lote sin agua", function(){
  assert.strictEqual(M.serieDesdeSiembra(serieHasta("2025-11-01", 3, 4), "2025-11-05"), null);
  assert.strictEqual(fila({ serie: serieHasta("2025-11-01", 3, 4) }).falta, "serie");
});

test("un lote que todavía no se sembró no entra en la sementera", function(){
  var s = M.sementeraDeCampania({ campania:CAMP, lotes:[LOTE], establecimientos:[EST],
    cultivoLotes:[{ id:"cl9", campaniaId:"c1", loteId:"l1", cultivo:"soja_1", haSembrada:0 }],
    series:[], historias:{}, overrides:{}, vendidas:{}, forwards:[] });
  assert.strictEqual(s.filas.length, 0);
  assert.strictEqual(s.cultivos.length, 0);
});

test("sin escenarios no hay compromiso: no dice que no te pasaste", function(){
  /* El defecto que este proyecto ya se comió dos veces: sin datos, la
     pantalla no puede mostrar margen ni un tranquilizador "todo bien". */
  var s = M.sementeraDeCampania({ campania:CAMP, lotes:[LOTE], establecimientos:[EST],
    cultivoLotes:[CL], series:[], historias:{}, overrides:{},
    vendidas:{ soja_1:200 }, forwards:[] });
  var g = s.cultivos[0];
  assert.strictEqual(g.kgHa, null);
  assert.strictEqual(g.tn, null);
  assert.strictEqual(g.comp, null);
  assert.strictEqual(s.tn, 0);
  assert.strictEqual(s.sinDato, 1);
});

test("el rinde del cultivo es el promedio de sus lotes ponderado por superficie", function(){
  var l2 = { id:"l2", establecimientoId:"e1", nombre:"Lote 3 — Molino", ha:300, ambientes:[] };
  var cl2 = { id:"cl2", campaniaId:"c1", loteId:"l2", cultivo:"soja_1",
              haSembrada:300, fechaSiembra:"2025-11-05" };
  var serie = serieHasta("2026-02-26", 3, 4);
  var s = M.sementeraDeCampania({ campania:CAMP, lotes:[LOTE, l2], establecimientos:[EST],
    cultivoLotes:[CL, cl2], series:[serie], historias:{}, overrides:{},
    vendidas:{}, forwards:[] });
  var g = s.cultivos[0];
  var f1 = s.filas.filter(function(f){ return f.id === "cl1"; })[0];
  var f2 = s.filas.filter(function(f){ return f.id === "cl2"; })[0];
  var esperado = Math.round((f1.kgHa.esperado * 100 + f2.kgHa.esperado * 300) / 400);
  assert.strictEqual(g.ha, 400);
  assert.strictEqual(g.kgHa.esperado, esperado);
});

test("avisa cuando lo vendido pasa el escenario pesimista del cultivo", function(){
  var serie = serieHasta("2026-02-26", 3, 4);
  var s = M.sementeraDeCampania({ campania:CAMP, lotes:[LOTE], establecimientos:[EST],
    cultivoLotes:[CL], series:[serie], historias:{}, overrides:{},
    vendidas:{ soja_1:9999 }, forwards:[] });
  assert.strictEqual(s.cultivos[0].comp.excedido, true);
  assert.strictEqual(s.excedidos, 1);
});

test("el mes de entrega sale siempre en el día 1 y encuentra el forward", function(){
  assert.strictEqual(M.mesEntregaDe("soja_1", "2025-07-01"), "2026-05-01");
  assert.strictEqual(M.mesEntregaDe("trigo",  "2025-07-01"), "2026-01-01");
  var serie = serieHasta("2026-02-26", 3, 4);
  var s = M.sementeraDeCampania({ campania:CAMP, lotes:[LOTE], establecimientos:[EST],
    cultivoLotes:[CL], series:[serie], historias:{}, overrides:{}, vendidas:{},
    forwards:[{ id:"p1", cultivo:"soja_1", mesEntrega:"2026-05-01",
                usdTn:310, fechaCarga:"2026-08-01" }] });
  assert.strictEqual(s.cultivos[0].precio, 310);
  assert.strictEqual(s.cultivos[0].valor, Math.round(310 * s.cultivos[0].tn.esperada));
});

test("un lote sin ambientes cargados corre entero como una media loma", function(){
  var amb = M.ambientesDeLote({ id:"l2", nombre:"Lote 3", ha:120, ambientes:[] });
  assert.strictEqual(amb.length, 1);
  assert.strictEqual(amb[0].ha, 120);
  assert.strictEqual(amb[0].cau, 160);
});
