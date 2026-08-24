var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");

/* El renombre saca de los títulos lo único que, en la pantalla, comunicaba el
   alcance real del modelo. La limitación no puede irse con él: baja a
   subtítulo permanente y se queda entera en la prosa que explica el método.

   Estos tests existen para que un futuro "limpiemos el texto" no se lleve
   puesta esa limitación sin que nadie se entere. Un rinde esperado que no
   avisa qué no contempla se lee como un pronóstico de rinde, y se desacredita
   solo la primera vez que falla por una causa que no modela. */

var HTML = fs.readFileSync(__dirname + "/../index.html", "utf8");

/* Los rótulos: acá "por agua" ya no va. Son los lugares donde el texto NOMBRA
   al número, no donde lo explica. */
var ROTULOS_VIEJOS = [
  "<strong>Rinde esperado por agua</strong>",
  "<h2>Cómo se calcula el rinde esperado por agua</h2>",
  "<h4>Rinde esperado por agua</h4>",
  "'Rinde esperado por agua':'Rango de rinde'",
  "Rinde esperado <b>por agua</b> de lo que está en pie"
];

test("ningún rótulo dice ya 'por agua'", function(){
  ROTULOS_VIEJOS.forEach(function(r){
    assert.strictEqual(HTML.indexOf(r), -1, "quedó sin renombrar el rótulo: " + r);
  });
});

test("el título nuevo está puesto", function(){
  assert.ok(HTML.indexOf("<strong>Rinde esperado</strong>") > 0,
    "falta el título en la cadena de cálculo del lote");
  assert.ok(HTML.indexOf("<h4>Rinde esperado</h4>") > 0,
    "falta el título en el panel del cultivo");
  assert.ok(HTML.indexOf("<h2>Cómo se calcula el rinde esperado</h2>") > 0,
    "falta el título del bloque que abre la cuenta");
});

test("la limitación aparece como subtítulo, no sólo en la letra chica", function(){
  assert.ok(HTML.indexOf("Responde sólo al agua") > 0,
    "falta el subtítulo permanente debajo del título");
});

test("la limitación sigue en la pantalla, palabra por palabra", function(){
  ["enfermedades", "granizo", "malezas", "plagas", "nitrógeno"].forEach(function(p){
    assert.ok(HTML.indexOf(p) > 0, "desapareció '" + p + "' de la interfaz");
  });
});

test("la prosa que explica el método conserva el 'por agua'", function(){
  /* Acá "por agua" no es el nombre del número: es de dónde sale. Sacarlo
     volvería las frases incomprensibles y borraría la advertencia. */
  assert.ok(HTML.indexOf("no un pronóstico de rinde") > 0,
    "se fue la advertencia de que no es un pronóstico de rinde");
  assert.ok(HTML.indexOf("El rinde esperado por agua responde sólo al balance hídrico") > 0,
    "se fue el pie que explica a qué responde el número");
});

test("la hoja imprimible sigue declarando qué no contempla el modelo", function(){
  /* La hoja imprimible es por donde entra el socio, que no participó de
     ninguna de las conversaciones donde se decidió esto. */
  var i = HTML.indexOf('class="hi-pie"');
  assert.ok(i > 0, "no encontré el pie de la hoja imprimible");
  var pie = HTML.slice(i, i + 600);
  assert.ok(pie.indexOf("FAO-33") > 0, "el pie tiene que decir con qué se calcula");
});
