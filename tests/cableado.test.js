var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Fix round 2. La revisión encontró cuatro mutantes de integración vivos:
   cada uno deshace un arreglo de la ronda anterior (opcCuentas leyendo
   PLAN_BASE otra vez, los formularios llamando opcCuentas() sin el default,
   cargar() volviendo a marcar()+guardar(), A.borrarCuenta pasando [],[] en
   vez de E.insumos/E.movimientos) y los cuatro dejaban 184/184 en verde,
   porque las funciones puras del bloque de modelo estaban bien probadas
   pero el cable que las conecta —los wrappers y las acciones— no.

   Este archivo ejercita ese cable: extrae las funciones reales de
   index.html por conteo de llaves (mismo patrón que ejemplo.test.js y
   clima.test.js) y las corre con las dependencias mínimas mockeadas,
   capturando lo que le pasan a abrirForm/confirmar/marcar en vez de
   ejecutar esos efectos de verdad. */

function extraerDesde(html, patron, etiqueta){
  var ini = html.indexOf(patron);
  assert.ok(ini > 0, "no encontré \"" + patron + "\" en index.html" + (etiqueta ? " (" + etiqueta + ")" : ""));
  var llave = html.indexOf("{", ini);
  var prof = 1, j = llave + 1;
  while(prof > 0){
    if(html[j] === "{") prof++;
    else if(html[j] === "}") prof--;
    j++;
  }
  return html.slice(ini, j);
}

function bloqueModelo(html){
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  assert.ok(ini > 0 && fin > ini, "no encontré el bloque de modelo en index.html");
  return html.slice(ini, fin);
}

var HTML = fs.readFileSync(__dirname + "/../index.html", "utf8");

/* ============================================================
   Mutante 1: opcCuentas → PLAN_BASE (deshace I1)
   ============================================================ */

test("cable: opcCuentas lee E.cuentas, no PLAN_BASE", function(){
  var src = bloqueModelo(HTML) + "\n" +
    extraerDesde(HTML, "function opcCuentas(", "opcCuentas") +
    "\nthis.__f = opcCuentas;";
  var ctx = {
    E: { cuentas: [{codigo:"9.9.01", nombre:"Cuenta ajena al plan base", tipo:"resultado", padre:null}] }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  var out = ctx.__f(null);
  /* Si opcCuentas leyera PLAN_BASE en vez de E.cuentas, esto daría las 13
     hojas de resultado del plan base de verdad, no la única cuenta ajena
     que le pasamos acá. */
  assert.deepStrictEqual(out.map(function(o){ return o.v; }), ["9.9.01"]);
});

/* ============================================================
   Mutante 2: los formularios llaman opcCuentas() sin el default
   (deshace C1 entero) + la opción vacía que cierra C1 camino 2 y
   "el problema más grande" de la ronda 2 (abrirForm no reconstruye
   las opciones al cambiar de categoría).
   ============================================================ */

function entornoFormularios(cuentasExtra, ventasIniciales, gastosIniciales){
  var capturado = null;
  var guardados = { ventas: [], gastos: [] };
  var src = bloqueModelo(HTML) + "\n" +
    extraerDesde(HTML, "function opcCuentas(", "opcCuentas") + "\n" +
    "var A={};\n" +
    extraerDesde(HTML, "A.nuevaVenta=function(", "A.nuevaVenta") + "\n" +
    extraerDesde(HTML, "A.nuevoGasto=function(", "A.nuevoGasto") + "\n" +
    "this.__A = A;";

  var ctx = {
    E: {
      cuentas: cuentasExtra || [],
      ventas: ventasIniciales || [],
      gastos: gastosIniciales || []
    },
    campActiva: "camp-1",
    avisar: function(){},
    hoyISO: function(){ return "2026-08-21"; },
    opcCultivosDeCampania: function(){ return [{v:"soja_1", t:"Soja 1ª"}]; },
    opcCLCampania: function(){ return []; },
    TIPOS_OPERACION: {disponible:{nom:"Disponible"}, forward:{nom:"Forward"}},
    uid: function(){ return "id-nuevo"; },
    marcar: function(){},
    abrirForm: function(cfg){ capturado = cfg; }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  return {
    A: ctx.__A,
    cfg: function(){ return capturado; },
    campoCuenta: function(){ return capturado.campos.filter(function(c){ return c.k === "cuenta"; })[0]; },
    E: ctx.E
  };
}

test("cable C1/abrirForm: alta nueva de venta — cuenta arranca vacía y con la opción \"por defecto\"", function(){
  var env = entornoFormularios([{codigo:"4.1.01", nombre:"Venta de granos", tipo:"resultado", padre:"4.1"}]);
  env.A.nuevaVenta(undefined);
  var cfg = env.cfg(), campo = env.campoCuenta();

  assert.strictEqual(cfg.valores.cuenta, "", "una venta nueva no puede arrancar con una cuenta ya resuelta precargada");
  assert.ok(campo.vacio, "el campo cuenta tiene que ofrecer la opción vacía");
});

test("cable C1/abrirForm: alta nueva de gasto — cuenta arranca vacía y con la opción \"corresponde a la categoría\"", function(){
  var env = entornoFormularios([{codigo:"5.2.05", nombre:"Otros", tipo:"resultado", padre:"5.2"}]);
  env.A.nuevoGasto(undefined);
  var cfg = env.cfg(), campo = env.campoCuenta();

  assert.strictEqual(cfg.valores.cuenta, "", "un gasto nuevo no puede arrancar con una cuenta ya resuelta precargada");
  assert.strictEqual(campo.vacio, "La que corresponde a la categoría");
});

test("cable C1 camino 1: editar un gasto cuya cuenta explícita dejó de ser hoja igual la ofrece preseleccionada", function(){
  var cuentas = [
    {codigo:"5.1.05", nombre:"Cosecha", tipo:"resultado", padre:"5.1"},
    {codigo:"5.1.05.01", nombre:"Cosecha propia", tipo:"resultado", padre:"5.1.05"}
  ];
  var gastos = [{id:"g1", categoria:"Cosecha", cuenta:"5.1.05", monto:1000, moneda:"USD"}];
  var env = entornoFormularios(cuentas, [], gastos);
  env.A.nuevoGasto("g1");
  var cfg = env.cfg(), campo = env.campoCuenta();

  assert.strictEqual(cfg.valores.cuenta, "5.1.05");
  var codigos = campo.opciones.map(function(o){ return o.v; });
  assert.ok(codigos.indexOf("5.1.05") !== -1,
    "sin pasarle el default explícito a opcCuentas, \"5.1.05\" desaparecería del <select> al haber dejado de ser hoja");
});

test("cable C1 camino 2: si la cuenta por defecto de una categoría ya no existe, el gasto nuevo no cae en ninguna cuenta ajena", function(){
  /* Reproduce el hallazgo de la ronda 2: "5.2.05 Otros" —el default de
     cualquier categoría sin mapeo propio— se borró del plan. Antes, el
     <select> sin esa opción caía solo al índice 0 (la primera cuenta real
     de la lista) y el guardado imputaba en silencio a esa cuenta ajena.
     Con la opción vacía como primera y sin nada más preseleccionado, el
     alta nueva sigue arrancando en el auto (""), sin importar qué cuenta
     falte. */
  var env = entornoFormularios([{codigo:"4.1.01", nombre:"Venta de granos", tipo:"resultado", padre:"4.1"}]);
  env.A.nuevoGasto(undefined);
  var cfg = env.cfg(), campo = env.campoCuenta();

  assert.strictEqual(cfg.valores.cuenta, "");
  assert.ok(campo.vacio, "la opción vacía tiene que seguir ahí aunque el default de la categoría no exista más");
});

test("cable: guardar() de un gasto nuevo sin tocar el select persiste cuenta=null (se resuelve por categoría al leer)", function(){
  var env = entornoFormularios([{codigo:"5.1.05", nombre:"Cosecha", tipo:"resultado", padre:"5.1"}]);
  env.A.nuevoGasto(undefined);
  var cfg = env.cfg();
  cfg.guardar({categoria:"Cosecha", fecha:"2026-08-21", cultivoLoteId:"", monto:"500", moneda:"USD",
               tipoCambio:"", proveedor:"", descripcion:"", cuenta:""});

  assert.strictEqual(env.E.gastos.length, 1);
  assert.strictEqual(env.E.gastos[0].cuenta, null,
    "dejar el select en la opción vacía tiene que persistir null, nunca la cuenta de otra categoría");
});

/* ============================================================
   Mutante 3: cargar() vuelve a marcar()+guardar() (deshace I2)
   ============================================================ */

test("cable: cargar() persiste la siembra del plan con guardarSiembra, no con marcar()+guardar()", function(){
  var src = extraerDesde(HTML, "function cargar(", "cargar") + "\nthis.__f = cargar;";

  var marcados = [];
  var guardarLlamado = 0;
  var siembras = [];

  var ctx = {
    Promise: Promise,
    cargandoDatos: false,
    TABLAS: {establecimientos:"establecimientos", cuentas:"cuentas"},
    perfil: null,
    E: null,
    vacio: {establecimientos:[], cuentas:[]},
    sb: { leer: function(){ return Promise.resolve([]); } },
    aCamello: function(o){ return o; },
    normalizar: function(){},
    guardarCache: function(){},
    leerCache: function(){ return false; },
    avisar: function(){},
    uid: function(){ return "cuenta-nueva"; },
    sembrarPlan: function(existentes){
      return existentes.length ? [] : [{codigo:"1", nombre:"Activo", tipo:"activo", padre:null}];
    },
    marcar: function(coleccion){ marcados.push(coleccion); },
    guardar: function(){ guardarLlamado++; return Promise.resolve(); },
    guardarSiembra: function(filas){ siembras.push(filas); return Promise.resolve(); }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  return ctx.__f().then(function(){
    assert.strictEqual(marcados.indexOf("cuentas"), -1,
      "la siembra del primer arranque no se tiene que marcar en la cola compartida");
    assert.strictEqual(guardarLlamado, 0,
      "guardar() no se tiene que llamar desde acá: mezclaría la siembra con cualquier otra escritura pendiente");
    assert.strictEqual(siembras.length, 1);
    assert.strictEqual(siembras[0].length, 1);
    assert.strictEqual(siembras[0][0].codigo, "1");
    assert.ok(siembras[0][0].id, "cada fila sembrada tiene que traer id");
  });
});

/* ============================================================
   Mutante 4: A.borrarCuenta pasa [],[] en vez de E.insumos,
   E.movimientos (deshace I3)
   ============================================================ */

test("cable: A.borrarCuenta pasa E.insumos y E.movimientos de verdad — bloquea una cuenta con insumos aplicados", function(){
  var src = bloqueModelo(HTML) + "\n" +
    "var A={};\n" +
    extraerDesde(HTML, "A.borrarCuenta=function(", "A.borrarCuenta") + "\n" +
    "this.__A = A;";

  var avisos = [];
  var confirmoAlguien = false;
  var ctx = {
    E: {
      cuentas: [{id:"c1", codigo:"5.1.01", nombre:"Semilla", tipo:"resultado", padre:"5.1"}],
      gastos: [], ventas: [],
      insumos: [{id:"i1", tipo:"Semilla"}],
      movimientos: [{insumoId:"i1", tipo:"aplicacion", cantidad:-320}]
    },
    avisar: function(m){ avisos.push(m); },
    confirmar: function(){ confirmoAlguien = true; },
    esc: function(s){ return s; }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  ctx.__A.borrarCuenta("c1");

  /* Con [],[] en vez de E.insumos/E.movimientos, impedimentoBorrarCuenta no
     encuentra nada que bloquee y esto llega a confirmar() en vez de avisar. */
  assert.strictEqual(confirmoAlguien, false, "no se tiene que llegar a pedir confirmación: hay que bloquear antes");
  assert.strictEqual(avisos.length, 1);
  assert.ok(avisos[0].indexOf("aplicación de insumos imputada") !== -1, avisos[0]);
});

test("cable: A.borrarCuenta permite borrar una cuenta sin insumos aplicados de verdad", function(){
  var src = bloqueModelo(HTML) + "\n" +
    "var A={};\n" +
    extraerDesde(HTML, "A.borrarCuenta=function(", "A.borrarCuenta") + "\n" +
    "this.__A = A;";

  var confirmoAlguien = false;
  var ctx = {
    E: {
      cuentas: [{id:"c1", codigo:"5.2.05", nombre:"Otros", tipo:"resultado", padre:"5.2"}],
      gastos: [], ventas: [], insumos: [], movimientos: []
    },
    avisar: function(){},
    confirmar: function(){ confirmoAlguien = true; },
    esc: function(s){ return s; }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  ctx.__A.borrarCuenta("c1");
  assert.strictEqual(confirmoAlguien, true, "sin nada que la bloquee, tiene que llegar a pedir confirmación");
});
