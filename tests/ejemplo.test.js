var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* cargarEjemplo no es puro (usa semillaConIds, E, marcar, sb, guardar,
   traerLluviaCampania) así que no vive en el bloque de modelo. Igual que
   clima.test.js hace con traerLluviaCampania, se extraen sólo las funciones
   necesarias del index.html contando llaves y se evalúan con dependencias
   mockeadas. overridesDePerfil/armarOverrides/escribirOverrides/sembrarPlan
   se extraen de verdad (no se mockean): son justo las que arman el merge (o,
   en el caso de sembrarPlan, la siembra del plan de cuentas), y el bug que
   este archivo cubre está en cómo cargarEjemplo las usa, no en ellas. uid()
   sí se mockea: usa window.crypto, que no existe en este sandbox de vm. */
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

/* Arma un entorno mínimo con un perfil que ya trae overrides reales de otro
   establecimiento, y devuelve el contexto para inspeccionar perfil y lo que
   se mandó a sb.actualizar. */
function entorno(perfilPrevio){
  var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
  var src = ["overridesDePerfil", "escribirOverrides", "armarOverrides", "sembrarPlan", "cargarEjemplo"]
    .map(function(n){ return extraerFuncion(html, n); }).join("\n\n");

  var vacio = {establecimientos:[], lotes:[], campanias:[], cultivoLotes:[], tickets:[],
    insumos:[], ordenes:[], ordenInsumos:[], movimientos:[], monitoreo:[], ventas:[],
    gastos:[], preciosForward:[], cuentas:[]};
  var actualizados = [];
  var nextId = 0;

  var ctx = {
    Promise: Promise,
    E: JSON.parse(JSON.stringify(vacio)),
    perfil: perfilPrevio,
    sesion: {user:{id:"demo-user"}},
    campActiva: null, estabClima: null,
    CLAVE_CLIMA: "clave-clima-test",
    CLIMA: {pron:{}},
    localStorage: {removeItem:function(){}},
    marcar: function(){},
    normalizar: function(){},
    guardar: function(){ return Promise.resolve(); },
    traerLluviaCampania: function(){ return Promise.resolve(); },
    traerPronostico: function(){ return Promise.resolve(); },
    /* sembrarPlan es pura y no genera ids: en el index.html real quien la
       llama le pone id:uid(). uid() usa window.crypto, así que acá se
       mockea con un contador simple en vez de extraerla del archivo real. */
    uid: function(){ return "cuenta-test-" + (nextId++); },
    sb: {
      actualizar: function(tabla, id, campos){
        actualizados.push({tabla:tabla, id:id, campos:campos});
        return Promise.resolve();
      }
    },
    /* PLAN_BASE no está en este sandbox (sembrarPlan se extrajo sola, sin
       el resto del bloque de modelo), así que sembrarPlan necesita su
       propia PLAN_BASE acá para no depender de todo el bloque. */
    PLAN_BASE: [{codigo:"1", nombre:"Activo", tipo:"activo", padre:null}],
    semillaConIds: function(){
      return {
        establecimientos:[{id:"est-nuevo-la-constancia"}],
        campanias:[{id:"camp-2627", estado:"curso"}, {id:"camp-2526", estado:"cerrada"}],
        lotes:[], cultivoLotes:[], tickets:[], insumos:[], ordenes:[], ordenInsumos:[],
        movimientos:[], monitoreo:[], ventas:[], gastos:[], preciosForward:[]
      };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src + "\nthis.__f = cargarEjemplo;", ctx);

  return {
    ejecutar: function(){ return ctx.__f(); },
    ctx: ctx,
    actualizados: function(){ return actualizados; }
  };
}

test("cargarEjemplo mergea el rinde de ejemplo, no pisa los overrides reales que ya tenía el perfil", function(){
  var env = entorno({rindes_base:{"est-real-del-productor":{soja_1:3800}}});

  return env.ejecutar().then(function(){
    var rb = env.ctx.perfil.rindes_base;
    assert.strictEqual(JSON.stringify(rb["est-real-del-productor"]), JSON.stringify({soja_1:3800}),
      "el override real del productor tiene que seguir ahí después de cargar el ejemplo");
    assert.strictEqual(JSON.stringify(rb["est-nuevo-la-constancia"]), JSON.stringify({maiz_d:9200}),
      "el rinde de ejemplo se agrega en su propio establecimiento");
  });
});

test("cargarEjemplo manda a sb.actualizar el mapa mergeado, no sólo el de ejemplo, para no persistir un borrado", function(){
  var env = entorno({rindes_base:{"est-real-del-productor":{trigo:4100}}});

  return env.ejecutar().then(function(){
    var envios = env.actualizados();
    assert.strictEqual(envios.length, 1);
    assert.strictEqual(envios[0].tabla, "perfiles");
    var rb = envios[0].campos.rindes_base;
    assert.strictEqual(JSON.stringify(rb["est-real-del-productor"]), JSON.stringify({trigo:4100}),
      "el PATCH real tiene que llevar también el override preexistente, o lo borra en la base");
    assert.strictEqual(JSON.stringify(rb["est-nuevo-la-constancia"]), JSON.stringify({maiz_d:9200}));
  });
});

test("cargarEjemplo sobre un perfil vacío (cuenta nueva, sin overrides todavía) deja sólo el de ejemplo", function(){
  var env = entorno(null);

  return env.ejecutar().then(function(){
    assert.strictEqual(JSON.stringify(env.ctx.perfil.rindes_base), JSON.stringify({"est-nuevo-la-constancia":{maiz_d:9200}}));
  });
});

/* ============================================================
   Task 4 · el plan de cuentas también se siembra con el ejemplo
   No había ninguna aserción sobre esto: nada verificaba que
   cargarEjemplo efectivamente sembrara el plan, con id en cada
   fila, ni que el orden de inserción pusiera las cuentas antes que
   las ventas y los gastos que las referencian por código.
   ============================================================ */

test("cargarEjemplo siembra tantas cuentas como trae el plan base, todas con id, antes de marcar ventas y gastos", function(){
  var env = entorno(null);
  var marcados = [];
  env.ctx.marcar = function(coleccion, fila){ marcados.push({coleccion:coleccion, id:fila.id}); };
  /* La semilla mockeada no trae ventas ni gastos: se le agrega una de cada
     una para poder verificar el orden real de marcado. */
  var semillaOriginal = env.ctx.semillaConIds;
  env.ctx.semillaConIds = function(){
    var s = semillaOriginal();
    s.ventas = [{id:"venta-1", campaniaId:s.campanias[0].id, cultivo:"soja_1"}];
    s.gastos = [{id:"gasto-1", campaniaId:s.campanias[0].id, categoria:"Otros"}];
    return s;
  };

  return env.ejecutar().then(function(){
    assert.strictEqual(env.ctx.E.cuentas.length, env.ctx.PLAN_BASE.length,
      "tiene que sembrar tantas cuentas como trae el plan base");
    env.ctx.E.cuentas.forEach(function(c){
      assert.ok(c.id, "cada cuenta sembrada tiene que traer id");
    });

    var colecciones = marcados.map(function(m){ return m.coleccion; });
    var iCuentas = colecciones.indexOf("cuentas");
    var iVentas  = colecciones.indexOf("ventas");
    var iGastos  = colecciones.indexOf("gastos");
    assert.ok(iCuentas >= 0 && iVentas >= 0 && iGastos >= 0, "las tres colecciones se tienen que haber marcado");
    assert.ok(iCuentas < iVentas, "las cuentas se marcan antes que las ventas que las referencian");
    assert.ok(iCuentas < iGastos, "las cuentas se marcan antes que los gastos que las referencian");
  });
});
