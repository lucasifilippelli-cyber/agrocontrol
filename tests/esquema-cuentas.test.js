var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Fix round 2 · C2. `regularizadora:true` se agregó a una cuenta de
   PLAN_BASE en la ronda anterior sin la columna en la base: la siembra
   copia todas las claves al POST (`for(var k in c){f[k]=c[k];}`) y
   PostgREST rechaza con 400 la fila que la trae, cortando el resto de la
   tanda sin reparo posible (sembrarPlan no completa un plan a medias).

   Este test es el que lo hubiera atajado: compara, después de pasar por
   aGuion() —la misma traducción que usa guardarSiembra() antes de mandar al
   POST—, las claves de cada fila de PLAN_BASE contra la lista de columnas
   reales de `public.cuentas`. La lista de acá tiene que reflejar el
   esquema tal cual queda una vez aplicadas las migraciones, no sólo lo que
   ya corre en la base hoy: por eso incluye `regularizadora`, de la
   migración `0012_cuentas_regularizadora.sql`, escrita pero **todavía no
   aplicada** (ver hallazgo C2, ronda 2). Mientras no se aplique, el plan no
   se puede sembrar en producción — y es justamente lo que este test no
   puede cubrir por sí solo: aplicar la migración es un paso manual aparte. */
var COLUMNAS_CUENTAS = ["id", "user_id", "codigo", "nombre", "tipo", "padre", "creado_en", "regularizadora"];

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

function cargarModelo(html){
  var ini = html.indexOf("/* === modelo:inicio === */");
  var fin = html.indexOf("/* === modelo:fin === */");
  assert.ok(ini > 0 && fin > ini, "no encontré el bloque de modelo en index.html");
  var ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin), ctx);
  return ctx;
}

function entorno(){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var M = cargarModelo(html);
  var src = extraerFuncion(html, "aGuion");
  var ctx = {
    COLUMNAS_FECHA: {}
  };
  vm.createContext(ctx);
  vm.runInContext(src + "\nthis.__aGuion = aGuion;", ctx);
  return {PLAN_BASE: M.PLAN_BASE, aGuion: ctx.__aGuion};
}

test("C2: ninguna clave de una fila sembrada de PLAN_BASE queda fuera del esquema real de cuentas", function(){
  var env = entorno();
  env.PLAN_BASE.forEach(function(c){
    var fila = {id: "id-de-prueba"};
    for(var k in c){ fila[k] = c[k]; }
    var traducida = env.aGuion(fila);
    Object.keys(traducida).forEach(function(col){
      assert.ok(COLUMNAS_CUENTAS.indexOf(col) !== -1,
        c.codigo + " trae la clave \"" + col + "\", que no está en el esquema de cuentas (" + COLUMNAS_CUENTAS.join(", ") + ")");
    });
  });
});

test("C2: al menos una cuenta del plan base sigue usando regularizadora, para que este test no quede vacío de sentido", function(){
  var env = entorno();
  var conMarca = env.PLAN_BASE.filter(function(c){ return c.regularizadora === true; });
  assert.ok(conMarca.length >= 1, "si nadie usa regularizadora, este test no prueba nada útil");
});
