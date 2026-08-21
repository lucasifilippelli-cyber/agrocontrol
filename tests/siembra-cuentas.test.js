var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Fix round 1 · I2. guardarSiembra() no es puro (usa sb, aGuion, avisar) así
   que no vive en el bloque de modelo. Se extrae igual que clima.test.js hace
   con traerLluviaCampania: contando llaves, evaluada con dependencias
   mockeadas. aGuion se extrae de verdad (no se mockea): es la que traduce
   cada fila al guión bajo que espera la base. */
function extraerFuncion(html, nombre){
  var ini = html.indexOf("function " + nombre + "(");
  assert.ok(ini > 0, "no encontré function " + nombre + " en index.html");
  var llave = html.indexOf("{", ini);
  var prof = 1, j = llave + 1;
  while(prof > 0){
    if(html[j] === "{") prof++;
    else if(html[j] === "}") prof--;
    j++;
  }
  return html.slice(ini, j);
}

/* Arma un entorno mínimo: sb.grabar mockeado (resuelve u opcionalmente
   rechaza una fila puntual), una `cola` compartida con contenido previo para
   verificar que guardarSiembra no la toca, y un `avisar` que sólo registra
   el mensaje. */
function entorno(opts){
  opts = opts || {};
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var src = extraerFuncion(html, "aGuion") + "\n" + extraerFuncion(html, "guardarSiembra");

  var grabados = [];
  var avisos = [];
  var cola = opts.colaPrevia ? opts.colaPrevia.slice() : [];

  var ctx = {
    Promise: Promise,
    navigator: {onLine: opts.onLine !== false},
    TABLAS: {cuentas: "cuentas"},
    COLUMNAS_FECHA: {},
    cola: cola,
    avisar: function(m){ avisos.push(m); },
    sb: {
      grabar: function(tabla, fila){
        grabados.push({tabla: tabla, fila: fila});
        if(opts.fallaEn != null && grabados.length === opts.fallaEn) return Promise.reject(new Error("boom"));
        return Promise.resolve();
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src + "\nthis.__f = guardarSiembra;", ctx);

  return {
    ejecutar: function(filas){ return ctx.__f(filas); },
    ctx: ctx,
    grabados: function(){ return grabados; },
    avisos: function(){ return avisos; }
  };
}

test("I2: guardarSiembra graba cada cuenta sembrada, una por una, en la tabla de cuentas", function(){
  var env = entorno();
  var filas = [
    {id:"c1", codigo:"1", nombre:"Activo", tipo:"activo", padre:null},
    {id:"c2", codigo:"2", nombre:"Pasivo", tipo:"pasivo", padre:null}
  ];

  return env.ejecutar(filas).then(function(){
    var g = env.grabados();
    assert.strictEqual(g.length, 2);
    assert.strictEqual(g[0].tabla, "cuentas");
    assert.strictEqual(g[0].fila.codigo, "1");
    assert.strictEqual(g[1].fila.codigo, "2");
  });
});

test("I2: guardarSiembra es una llamada aislada — no lee ni toca la cola compartida de guardar()", function(){
  /* La cola trae ya algo pendiente de otra escritura, como si el productor
     hubiera alcanzado a tocar algo entre el arranque y que termine de bajar
     la sesión. Si guardarSiembra compartiera cola, el conteo cambiaría. */
  var pendiente = {op:"grabar", t:"lotes", fila:{id:"pendiente"}};
  var env = entorno({colaPrevia:[pendiente]});
  var filas = [{id:"c1", codigo:"1", nombre:"Activo", tipo:"activo", padre:null}];

  return env.ejecutar(filas).then(function(){
    assert.strictEqual(env.ctx.cola.length, 1, "la cola ajena no se tiene que tocar");
    assert.strictEqual(env.ctx.cola[0], pendiente);
  });
});

test("I2: si falla una fila del medio, se avisa un mensaje propio del plan de cuentas, no el genérico de guardar()", function(){
  var env = entorno({fallaEn:2});
  var filas = [
    {id:"c1", codigo:"1", nombre:"Activo", tipo:"activo", padre:null},
    {id:"c2", codigo:"2", nombre:"Pasivo", tipo:"pasivo", padre:null},
    {id:"c3", codigo:"3", nombre:"Patrimonio neto", tipo:"patrimonio", padre:null}
  ];

  return env.ejecutar(filas).then(function(){
    var av = env.avisos();
    assert.strictEqual(av.length, 1);
    assert.ok(av[0].indexOf("plan de cuentas") !== -1, "el aviso tiene que hablar del plan de cuentas, no de \"el cambio\" genérico");
  });
});

test("I2: aGuion le saca el creado_en a cada fila antes de mandarla, igual que guardar()", function(){
  var env = entorno();
  var filas = [{id:"c1", codigo:"1", nombre:"Activo", tipo:"activo", padre:null, creadoEn:"2026-01-01"}];

  return env.ejecutar(filas).then(function(){
    var g = env.grabados()[0].fila;
    assert.strictEqual(g.creado_en, undefined);
  });
});
