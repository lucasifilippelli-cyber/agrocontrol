var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var vm = require("node:vm");

/* Sin señal, un cambio cargado en el campo se perdía: guardar() vaciaba la
   cola antes de intentar mandarla, avisaba "no se guardó" —y la pantalla lo
   seguía mostrando igual, porque guardarCache() ya lo había escrito en el
   teléfono—. Recién desaparecía cuando volvía la señal y cargar() pisaba E
   con lo que había en la base. Es el patrón de defecto del proyecto corrido
   de lugar: la app mostraba como cierto algo que no lo era.

   Estos tests son de cable, no de función pura: lo que hay que probar es
   que la cola sobreviva, que se reintente sola y que una fila rechazada no
   se lleve puesto el resto de la tanda. */

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

var HTML = fs.readFileSync(__dirname + "/../index.html", "utf8");

function almacen(inicial){
  var datos = inicial || {};
  return {
    datos: datos,
    getItem: function(k){ return Object.prototype.hasOwnProperty.call(datos,k) ? datos[k] : null; },
    setItem: function(k,v){ datos[k] = String(v); },
    removeItem: function(k){ delete datos[k]; }
  };
}

/* Arma el entorno con las piezas reales de index.html y una base falsa que
   responde lo que le pida cada test. */
function entorno(opciones){
  var o = opciones || {};
  var src = [
    extraerDesde(HTML, "function aGuion(", "aGuion"),
    extraerDesde(HTML, "function guardarCola(", "guardarCola"),
    extraerDesde(HTML, "function leerCola(", "leerCola"),
    extraerDesde(HTML, "function olvidarCola(", "olvidarCola"),
    extraerDesde(HTML, "function idUsuario(", "idUsuario"),
    extraerDesde(HTML, "function sacarDeCola(", "sacarDeCola"),
    extraerDesde(HTML, "function seReintenta(", "seReintenta"),
    extraerDesde(HTML, "function frasePendientes(", "frasePendientes"),
    extraerDesde(HTML, "function mandarUno(", "mandarUno"),
    extraerDesde(HTML, "function subirCola(", "subirCola"),
    extraerDesde(HTML, "function marcar(", "marcar"),
    extraerDesde(HTML, "function marcarBaja(", "marcarBaja"),
    extraerDesde(HTML, "function guardar(", "guardar")
  ].join("\n") + "\nthis.__api = {guardar:guardar, subirCola:subirCola, marcar:marcar, marcarBaja:marcarBaja," +
     " leerCola:leerCola, guardarCola:guardarCola, olvidarCola:olvidarCola};";

  var mandados = [], avisos = [], pintadas = 0;
  var ctx = {
    cola: o.cola || [],
    subiendo: null,
    otraVuelta: false,
    CLAVE_COLA: "agrocontrol.cola.v1",
    COLUMNAS_FECHA: {},
    TABLAS: {ordenes:"ordenes", gastos:"gastos", ventas:"ventas"},
    sesion: o.sesion === undefined ? {user:{id:"u-lucas"}} : o.sesion,
    localStorage: almacen(o.guardado),
    navigator: {onLine: o.online === undefined ? true : o.online},
    guardarCache: function(){},
    pintarPendientes: function(){ pintadas++; },
    avisar: function(m){ avisos.push(m); },
    sb: {
      grabar: function(t, f){
        mandados.push({op:"grabar", t:t, fila:f});
        return (o.respuesta || function(){ return Promise.resolve(); })(t, f);
      },
      borrar: function(t, id){
        mandados.push({op:"borrar", t:t, id:id});
        return (o.respuesta || function(){ return Promise.resolve(); })(t, {id:id});
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.mandados = mandados; ctx.avisos = avisos;
  ctx.pintadas = function(){ return pintadas; };
  return ctx;
}

function errorDeRed(){ var e = new Error("sin conexión"); e.esRed = true; return e; }
function rechazoDeLaBase(){ var e = new Error("Ese registro ya existe."); e.estado = 400; return e; }
function errorConEstado(estado, texto){ var e = new Error(texto || ("Error " + estado)); e.estado = estado; return e; }

/* ============================================================
   1 · la cola sobrevive
   ============================================================ */

test("sin señal el cambio no se pierde: queda en la cola", function(){
  var ctx = entorno({online:false, respuesta:function(){ return Promise.reject(errorDeRed()); }});
  ctx.__api.marcar("ordenes", {id:"o1", estado:"en_curso"});
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(ctx.cola.length, 1, "la fila tiene que seguir esperando");
    assert.strictEqual(JSON.parse(ctx.localStorage.getItem("agrocontrol.cola.v1")).items.length, 1,
      "y tiene que estar escrita en el teléfono, no sólo en memoria");
  });
});

test("marcar escribe la cola en el teléfono antes de intentar mandarla", function(){
  var ctx = entorno();
  ctx.__api.marcar("ordenes", {id:"o1"});
  var g = JSON.parse(ctx.localStorage.getItem("agrocontrol.cola.v1"));
  assert.strictEqual(g.items.length, 1);
  assert.strictEqual(g.u, "u-lucas", "la cola queda atada al usuario que la creó");
});

test("la cola sobrevive a cerrar y reabrir la app", function(){
  var guardado = {"agrocontrol.cola.v1": JSON.stringify({u:"u-lucas", items:[{op:"grabar", t:"ordenes", fila:{id:"o1"}}]})};
  var ctx = entorno({guardado:guardado});
  assert.strictEqual(ctx.__api.leerCola(), 1, "al arrancar tiene que recuperar lo que quedó pendiente");
  assert.strictEqual(ctx.cola.length, 1);
});

test("la cola de otro usuario no se sube a esta cuenta", function(){
  var guardado = {"agrocontrol.cola.v1": JSON.stringify({u:"u-tomas", items:[{op:"grabar", t:"ordenes", fila:{id:"o1"}}]})};
  var ctx = entorno({guardado:guardado});
  assert.strictEqual(ctx.__api.leerCola(), 0, "es de otra cuenta: no se replica acá");
  assert.strictEqual(ctx.cola.length, 0);
  assert.strictEqual(ctx.localStorage.getItem("agrocontrol.cola.v1"), null, "y se limpia");
});

/* ============================================================
   2 · cuando vuelve la señal
   ============================================================ */

test("al volver la señal sube lo pendiente y la cola queda vacía", function(){
  var guardado = {"agrocontrol.cola.v1": JSON.stringify({u:"u-lucas", items:[
    {op:"grabar", t:"ordenes", fila:{id:"o1", fechaPlan:"2026-08-20"}},
    {op:"borrar", t:"gastos", id:"g9"}
  ]})};
  var ctx = entorno({guardado:guardado});
  ctx.__api.leerCola();
  return ctx.__api.subirCola().then(function(){
    assert.strictEqual(ctx.cola.length, 0);
    assert.strictEqual(ctx.mandados.length, 2);
    assert.strictEqual(ctx.mandados[0].fila.fecha_plan, "2026-08-20", "sale traducida a guion bajo, como siempre");
    assert.strictEqual(ctx.mandados[1].op, "borrar");
    assert.strictEqual(ctx.localStorage.getItem("agrocontrol.cola.v1"), null, "y no queda nada guardado");
  });
});

test("las filas se suben en el orden en que se cargaron", function(){
  var ctx = entorno();
  ctx.__api.marcar("ordenes", {id:"o1"});
  ctx.__api.marcarBaja("ordenes", "o1");
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(JSON.stringify(ctx.mandados.map(function(m){ return m.op; })),
      JSON.stringify(["grabar","borrar"]), "grabar y después borrar, no al revés");
  });
});

/* ============================================================
   3 · qué pasa con la fila que falla
   ============================================================ */

test("una fila rechazada por la base no se lleva puesto el resto de la tanda", function(){
  var ctx = entorno({respuesta:function(t, f){
    return f.id === "malo" ? Promise.reject(rechazoDeLaBase()) : Promise.resolve();
  }});
  ctx.__api.marcar("gastos", {id:"malo"});
  ctx.__api.marcar("gastos", {id:"bueno"});
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(ctx.mandados.length, 2, "la segunda fila tiene que intentarse igual");
    assert.strictEqual(ctx.cola.length, 0, "reintentar una fila que la base rechaza es inútil: se descarta");
    assert.ok(ctx.avisos.join(" ").indexOf("Ese registro ya existe.") >= 0, "y se avisa por qué");
  });
});

test("sin señal, lo que viene atrás de la fila que falla espera su turno", function(){
  var ctx = entorno({online:false, respuesta:function(){ return Promise.reject(errorDeRed()); }});
  ctx.__api.marcar("gastos", {id:"a"});
  ctx.__api.marcar("gastos", {id:"b"});
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(ctx.mandados.length, 1, "sin señal no tiene sentido insistir con las que siguen");
    assert.strictEqual(ctx.cola.length, 2, "las dos siguen pendientes, en orden");
    assert.strictEqual(JSON.stringify(ctx.cola.map(function(o){ return o.fila.id; })), JSON.stringify(["a","b"]));
  });
});

test("sin señal el aviso dice que el cambio queda pendiente, no que se perdió", function(){
  var ctx = entorno({online:false, respuesta:function(){ return Promise.reject(errorDeRed()); }});
  ctx.__api.marcar("gastos", {id:"a"});
  return ctx.__api.guardar().then(function(){
    var texto = ctx.avisos.join(" ");
    assert.ok(/sin subir|pendiente|cuando vuelva/i.test(texto), "el aviso fue: " + texto);
    assert.ok(!/no se guardó/i.test(texto), "ya no se pierde, así que no puede decir que se perdió: " + texto);
  });
});

/* ============================================================
   4 · la pantalla se entera
   ============================================================ */

test("cada subida repinta el cartel de pendientes", function(){
  var ctx = entorno({online:false, respuesta:function(){ return Promise.reject(errorDeRed()); }});
  ctx.__api.marcar("gastos", {id:"a"});
  return ctx.__api.guardar().then(function(){
    assert.ok(ctx.pintadas() > 0, "si la cola cambia y la pantalla no se entera, volvemos al problema de origen");
  });
});

test("dos subidas simultáneas no mandan la misma fila dos veces", function(){
  var libera, espera = new Promise(function(r){ libera = r; });
  var ctx = entorno({respuesta:function(){ return espera; }});
  ctx.__api.marcar("gastos", {id:"a"});
  var p1 = ctx.__api.subirCola();
  var p2 = ctx.__api.subirCola();
  libera();
  return Promise.all([p1,p2]).then(function(){
    assert.strictEqual(ctx.mandados.length, 1);
  });
});

/* ============================================================
   5 · el cliente distingue quedarse sin señal de un rechazo
   ============================================================ */

test("pedir marca los errores de red, y sólo esos", function(){
  var src = extraerDesde(HTML, "function pedir(", "pedir") + "\nthis.__pedir = pedir;";
  function correr(fetchFalso){
    var ctx = {SB_URL:"", fetch:fetchFalso, traducirError:function(t,e){ return "rechazo "+e; }};
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return ctx.__pedir("/x", {});
  }
  var sinRed = correr(function(){ return Promise.reject(new TypeError("Load failed")); })
    .then(function(){ throw new Error("tenía que fallar"); }, function(e){
      assert.strictEqual(e.esRed, true, "quedarse sin señal es reintentable");
      assert.ok(/conexi/i.test(e.message), "y se dice en castellano: " + e.message);
    });
  var rechazo = correr(function(){
      return Promise.resolve({ok:false, status:400, text:function(){ return Promise.resolve("{}"); }});
    })
    .then(function(){ throw new Error("tenía que fallar"); }, function(e){
      assert.ok(!e.esRed, "un rechazo de la base no es falta de señal");
      assert.strictEqual(e.estado, 400, "el estado viaja con el error: es lo que decide si se reintenta");
    });
  return Promise.all([sinRed, rechazo]);
});

/* ============================================================
   6 · las fallas de las que se vuelve solo
   ============================================================ */

test("una sesión vencida no tira a la basura lo que se cargó en el campo", function(){
  var ctx = entorno({respuesta:function(){ return Promise.reject(errorConEstado(401, "Se venció la sesión. Volvé a entrar.")); }});
  ctx.__api.marcar("gastos", {id:"a"});
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(ctx.cola.length, 1, "la sesión se renueva y la misma fila entra igual: tiene que esperar");
    assert.ok(!/no se pudo guardar/i.test(ctx.avisos.join(" ")), "y no se avisa como si se hubiera perdido");
  });
});

test("un error pasajero de la base tampoco descarta la fila", function(){
  var ctx = entorno({respuesta:function(){ return Promise.reject(errorConEstado(503)); }});
  ctx.__api.marcar("gastos", {id:"a"});
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(ctx.cola.length, 1);
  });
});

test("un rechazo por lo que dice la fila sí se suelta", function(){
  var ctx = entorno({respuesta:function(){ return Promise.reject(errorConEstado(400, "Ese registro ya existe.")); }});
  ctx.__api.marcar("gastos", {id:"a"});
  return ctx.__api.guardar().then(function(){
    assert.strictEqual(ctx.cola.length, 0, "reintentarla taparía para siempre todo lo que venga atrás");
    assert.ok(/Ese registro ya existe/.test(ctx.avisos.join(" ")));
  });
});

test("cuando la espera no es por señal, el aviso no dice que no hay señal", function(){
  var ctx = entorno({respuesta:function(){ return Promise.reject(errorConEstado(500)); }});
  ctx.__api.marcar("gastos", {id:"a"});
  return ctx.__api.guardar().then(function(){
    assert.ok(!/sin señal/i.test(ctx.avisos.join(" ")), "el aviso fue: " + ctx.avisos.join(" "));
  });
});
