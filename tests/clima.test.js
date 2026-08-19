var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* traerLluviaCampania no es puro (usa fetch, E, marcar, guardar) así que no
   vive en el bloque de modelo. Para testear su manejo de fallas parciales sin
   red, extraemos sólo esa función del index.html contando llaves —evita
   depender de un número de línea— y la evaluamos con dependencias mockeadas. */
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

/* Arma un entorno mínimo: un establecimiento cuyo fetch resuelve y otro cuyo
   fetch rechaza. Devuelve el contexto para inspeccionar E, la cola de marcar
   y si guardar() se llamó. */
function entorno(opts){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var src = extraerFuncion(html, "traerLluviaCampania");

  var campaniaObj = {id:"c1", desde:"2026-01-01", manual:{}, lluvia:[0,0,0,0,0,0,0,0,0,0,0,0], traido:false};
  var marcados = [];
  var guardarLlamado = 0;
  var siguienteId = 1;

  function jsonDe(es){
    /* dos días de datos, distintos por establecimiento para poder distinguirlos */
    return {daily:{time:["2026-01-01","2026-01-02"],
      precipitation_sum:[es.mm1, es.mm2],
      et0_fao_evapotranspiration:[es.eto1, es.eto2]}};
  }

  var ctx = {
    Promise: Promise,
    campActiva: "c1",
    E: {establecimientos: opts.establecimientos, climaSeries: []},
    campania: function(id){ return id === campaniaObj.id ? campaniaObj : null; },
    marcar: function(coleccion, fila){ marcados.push({coleccion:coleccion, fila:fila}); },
    guardar: function(){ guardarLlamado++; return Promise.resolve(); },
    uid: function(){ return "s" + (siguienteId++); },
    fetch: function(u){
      var es = opts.establecimientos.filter(function(x){
        return u.indexOf("latitude=" + x.lat) >= 0;
      })[0];
      if(es.falla) return Promise.reject(new Error("sin conexión"));
      return Promise.resolve({ok:true, json:function(){ return Promise.resolve(jsonDe(es)); }});
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src + "\nthis.__f = traerLluviaCampania;", ctx);

  return {
    ejecutar: function(){ return ctx.__f(true); },
    campania: campaniaObj,
    E: ctx.E,
    marcados: function(){ return marcados; },
    guardarLlamado: function(){ return guardarLlamado; }
  };
}

test("con un establecimiento caído y otro que resuelve, la serie del que resolvió se persiste igual", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:10, mm2:5, eto1:4, eto2:3, falla:false};
  var e2 = {id:"e2", lat:"-34.5", lon:"-59.1", mm1:0, mm2:0, eto1:0, eto2:0, falla:true};
  var env = entorno({establecimientos:[e1, e2]});

  return env.ejecutar().then(function(){
    assert.strictEqual(env.E.climaSeries.length, 1, "sólo debe quedar la serie del establecimiento que resolvió");
    assert.strictEqual(env.E.climaSeries[0].establecimientoId, "e1");
    assert.deepStrictEqual(env.E.climaSeries[0].lluvia, [10, 5]);
  });
});

test("con un establecimiento caído y otro que resuelve, el llenado mensual no se pierde", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:10, mm2:5, eto1:4, eto2:3, falla:false};
  var e2 = {id:"e2", lat:"-34.5", lon:"-59.1", mm1:0, mm2:0, eto1:0, eto2:0, falla:true};
  var env = entorno({establecimientos:[e1, e2]});

  return env.ejecutar().then(function(){
    assert.strictEqual(env.campania.traido, true);
    assert.strictEqual(env.campania.lluvia[0], 15);
  });
});

test("con un establecimiento caído y otro que resuelve, guardar() corre igual", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:10, mm2:5, eto1:4, eto2:3, falla:false};
  var e2 = {id:"e2", lat:"-34.5", lon:"-59.1", mm1:0, mm2:0, eto1:0, eto2:0, falla:true};
  var env = entorno({establecimientos:[e1, e2]});

  return env.ejecutar().then(function(){
    assert.strictEqual(env.guardarLlamado(), 1);
    /* la fila de climaSeries del que resolvió y la campaña con el mensual quedaron marcadas */
    var colecciones = env.marcados().map(function(m){ return m.coleccion; });
    assert.ok(colecciones.indexOf("climaSeries") >= 0);
    assert.ok(colecciones.indexOf("campanias") >= 0);
  });
});

test("si falla justo el primer establecimiento, el resumen mensual no se actualiza pero el segundo igual persiste", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:0, mm2:0, eto1:0, eto2:0, falla:true};
  var e2 = {id:"e2", lat:"-34.5", lon:"-59.1", mm1:8, mm2:2, eto1:3, eto2:3, falla:false};
  var env = entorno({establecimientos:[e1, e2]});

  return env.ejecutar().then(function(){
    assert.strictEqual(env.campania.traido, false, "sin el primero no hay resumen mensual esta vuelta");
    assert.strictEqual(env.campania.lluvia[0], 0);
    assert.strictEqual(env.E.climaSeries.length, 1);
    assert.strictEqual(env.E.climaSeries[0].establecimientoId, "e2");
    assert.strictEqual(env.guardarLlamado(), 1, "guardar() corre igual aunque el primero haya fallado");
  });
});
