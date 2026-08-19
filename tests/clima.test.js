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
  /* La guarda de traerLluviaCampania ahora depende de faltaClimaCampania (que
     a su vez usa serieDe) y de climaIntentado, la memoria en sesión que
     evita la tormenta de pedidos. Las tres viven fuera del bloque de
     modelo salvo las dos primeras, así que se extraen igual que la función
     principal y se concatenan en el mismo contexto. */
  var src = extraerFuncion(html, "serieDe") + "\n" +
            extraerFuncion(html, "faltaClimaCampania") + "\n" +
            "var climaIntentado = {};\n" +
            extraerFuncion(html, "traerLluviaCampania");

  var campaniaObj = {id:"c1", desde:"2026-01-01", manual:{}, lluvia:[0,0,0,0,0,0,0,0,0,0,0,0],
    traido: opts.traido || false};
  var marcados = [];
  var guardarLlamado = 0;
  var fetchLlamados = 0;
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
    E: {establecimientos: opts.establecimientos, climaSeries: (opts.climaSeriesInicial || []).slice()},
    campania: function(id){ return id === campaniaObj.id ? campaniaObj : null; },
    marcar: function(coleccion, fila){ marcados.push({coleccion:coleccion, fila:fila}); },
    guardar: function(){ guardarLlamado++; return Promise.resolve(); },
    uid: function(){ return "s" + (siguienteId++); },
    fetch: function(u){
      fetchLlamados++;
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
    /* sin argumento, forzar=true — así los tests que ya existían siguen
       probando exactamente lo mismo que antes de este fix. */
    ejecutar: function(forzar){ return ctx.__f(forzar===undefined ? true : forzar); },
    campania: campaniaObj,
    E: ctx.E,
    marcados: function(){ return marcados; },
    guardarLlamado: function(){ return guardarLlamado; },
    fetchLlamados: function(){ return fetchLlamados; }
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

/* ============================================================
   Task 13 · c.traido ya no alcanza como condición
   ============================================================ */

test("con el mensual y la serie diaria completos, no pide nada sin forzar", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:10, mm2:5, eto1:4, eto2:3, falla:false};
  var env = entorno({establecimientos:[e1], traido:true, climaSeriesInicial:[
    {establecimientoId:"e1", campaniaId:"c1", desde:"2026-01-01", hasta:"2026-01-02", lluvia:[1,2], eto:[1,1]}
  ]});

  return env.ejecutar(false).then(function(){
    assert.strictEqual(env.fetchLlamados(), 0, "nada faltaba: no hay razón para pedirle a Open-Meteo");
    assert.strictEqual(env.guardarLlamado(), 0);
  });
});

test("es el caso de las dos campañas reales: mensual ya traído pero sin serie diaria, y sin forzar igual la baja", function(){
  /* Antes de este fix, c.traido=true cortaba acá para siempre: el módulo
     Sementera no tenía forma de darse cuenta solo de que le faltaba la serie
     diaria. */
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:10, mm2:5, eto1:4, eto2:3, falla:false};
  var env = entorno({establecimientos:[e1], traido:true, climaSeriesInicial:[]});

  return env.ejecutar(false).then(function(){
    assert.strictEqual(env.fetchLlamados(), 1);
    assert.strictEqual(env.E.climaSeries.length, 1);
    assert.strictEqual(env.E.climaSeries[0].establecimientoId, "e1");
  });
});

test("si falta la serie diaria de un solo establecimiento entre varios, igual pide sin forzar", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:10, mm2:5, eto1:4, eto2:3, falla:false};
  var e2 = {id:"e2", lat:"-34.5", lon:"-59.1", mm1:8, mm2:2, eto1:3, eto2:3, falla:false};
  var env = entorno({establecimientos:[e1, e2], traido:true, climaSeriesInicial:[
    {establecimientoId:"e1", campaniaId:"c1", desde:"2026-01-01", hasta:"2026-01-02", lluvia:[1,2], eto:[1,1]}
    /* e2 no tiene serie guardada todavía */
  ]});

  return env.ejecutar(false).then(function(){
    assert.strictEqual(env.fetchLlamados(), 2, "pide a los dos establecimientos, no sólo al que falta");
    assert.strictEqual(env.E.climaSeries.length, 2);
  });
});

test("si la bajada falla, no se reintenta sola en cada pintado — sólo se acuerda que ya lo intentó en esta sesión", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:0, mm2:0, eto1:0, eto2:0, falla:true};
  var env = entorno({establecimientos:[e1], traido:false, climaSeriesInicial:[]});

  return env.ejecutar(false).then(function(){
    assert.strictEqual(env.fetchLlamados(), 1, "el primer intento sin forzar pide una vez");
    assert.strictEqual(env.E.climaSeries.length, 0);
    return env.ejecutar(false);
  }).then(function(){
    assert.strictEqual(env.fetchLlamados(), 1,
      "un segundo llamado sin forzar en la misma sesión no dispara otro pedido: ya se sabe que se intentó y falló");
  });
});

test("forzar siempre pide, aunque ya se haya intentado sin forzar en esta sesión", function(){
  var e1 = {id:"e1", lat:"-34.2", lon:"-59.4", mm1:0, mm2:0, eto1:0, eto2:0, falla:true};
  var env = entorno({establecimientos:[e1], traido:false, climaSeriesInicial:[]});

  return env.ejecutar(false).then(function(){
    assert.strictEqual(env.fetchLlamados(), 1);
    return env.ejecutar(true);
  }).then(function(){
    assert.strictEqual(env.fetchLlamados(), 2, "forzar (soltarMes, campaña nueva, ejemplo) no respeta la marca de intento");
  });
});
