var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* El service worker guardaba en la caché cualquier respuesta del mismo
   origen, sin mirar si había salido bien. Un 500 pasajero de Vercel, o una
   carga en medio de un despliegue, pisaba la copia buena de index.html con
   la página de error —y esa era la que quedaba para abrir sin señal, que es
   justo cuando la caché importa—. */

/* Corre sw.js con los globales de un service worker falsos y devuelve el
   manejador de fetch más lo que haya quedado guardado en la caché. */
function correrSW(){
  var oyentes = {}, guardado = {};
  var ctx = {
    self: {
      addEventListener: function(ev, fn){ oyentes[ev] = fn; },
      skipWaiting: function(){},
      clients: {claim: function(){}},
      location: {origin: "https://agrocontrol-v84a.vercel.app"}
    },
    caches: {
      open: function(){ return Promise.resolve({ put: function(req, res){ guardado[req.url] = res; } }); },
      keys: function(){ return Promise.resolve([]); },
      match: function(){ return Promise.resolve(null); }
    },
    URL: URL,
    fetch: null,
    Promise: Promise
  };
  ctx.self.addEventListener = ctx.self.addEventListener;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + "/../sw.js", "utf8"), ctx);
  return {ctx: ctx, oyentes: oyentes, guardado: guardado};
}

/* Dispara el manejador de fetch con la respuesta que conteste la red. */
function pedirCon(respuesta){
  var sw = correrSW();
  sw.ctx.fetch = function(){ return Promise.resolve(respuesta); };
  var devuelta = null;
  sw.oyentes.fetch({
    request: {method: "GET", url: "https://agrocontrol-v84a.vercel.app/index.html"},
    respondWith: function(p){ devuelta = p; }
  });
  return Promise.resolve(devuelta).then(function(r){
    return {respuesta: r, guardado: sw.guardado};
  });
}

function respuesta(estado){
  return {ok: estado >= 200 && estado < 300, status: estado, clone: function(){ return {copia: estado}; }};
}

test("una respuesta buena se guarda en la caché", function(){
  return pedirCon(respuesta(200)).then(function(r){
    assert.ok(r.guardado["https://agrocontrol-v84a.vercel.app/index.html"], "la app tiene que quedar disponible sin señal");
  });
});

test("un error del servidor no se guarda en la caché", function(){
  return pedirCon(respuesta(500)).then(function(r){
    assert.deepStrictEqual(Object.keys(r.guardado), [],
      "si se guarda, la página de error es lo que se abre después sin señal");
  });
});

test("un 404 tampoco se guarda", function(){
  return pedirCon(respuesta(404)).then(function(r){
    assert.deepStrictEqual(Object.keys(r.guardado), []);
  });
});

test("la respuesta se devuelve igual, buena o mala", function(){
  return Promise.all([pedirCon(respuesta(200)), pedirCon(respuesta(503))]).then(function(rs){
    assert.strictEqual(rs[0].respuesta.status, 200);
    assert.strictEqual(rs[1].respuesta.status, 503, "el navegador tiene que ver el error de verdad, no una copia vieja");
  });
});

test("el pronóstico nunca pasa por la caché", function(){
  var sw = correrSW();
  var contestado = false;
  sw.oyentes.fetch({
    request: {method: "GET", url: "https://api.open-meteo.com/v1/forecast?x=1"},
    respondWith: function(){ contestado = true; }
  });
  assert.strictEqual(contestado, false, "el service worker no se mete: el clima siempre va a la red");
});

test("subir la versión de la caché borra la que pudo haber quedado envenenada", function(){
  var src = fs.readFileSync(__dirname + "/../sw.js", "utf8");
  var m = /var CACHE = "([^"]+)"/.exec(src);
  assert.ok(m, "no encontré la versión de la caché");
  assert.notStrictEqual(m[1], "agrocontrol-v3",
    "mientras siga en v3, la caché ya envenenada de un usuario no se limpia sola");
});
