/* Genera la constante RINDES_PARTIDO desde la serie oficial del MAGyP.
   Uso: node herramientas/generar-rindes.js > /tmp/rindes.js           */
var URL_CSV = "https://datos.magyp.gob.ar/dataset/9e1e77ba-267e-4eaa-a59f-3296e86b5f36" +
              "/resource/95d066e6-8a0f-4a80-b59d-6f28f88eacd5/download/estimaciones-agricolas-2026-03.csv";

var PARTIDOS = ["San Antonio de Areco", "Carmen de Areco", "Luján"];
/* la serie trae un solo "maíz": temprano y tardío arrancan con el mismo ancla */
var MAPA = { "maíz":["maiz_t","maiz_d"], "soja 1ra":["soja_1"], "soja 2da":["soja_2"],
             "trigo total":["trigo"], "cebada cervecera":["cebada"],
             "girasol":["girasol"], "sorgo":["sorgo"] };
var DESDE = 2005;

function mediana(a){
  var b = a.slice().sort(function(x,y){ return x-y; });
  var m = Math.floor(b.length/2);
  return b.length % 2 ? b[m] : Math.round((b[m-1]+b[m])/2);
}

/* parser de CSV con campos entrecomillados */
function filas(txt){
  var out=[], campo="", fila=[], dentro=false;
  for(var i=0;i<txt.length;i++){
    var c=txt[i];
    if(c==='"'){ if(dentro && txt[i+1]==='"'){ campo+='"'; i++; } else dentro=!dentro; }
    else if(c==="," && !dentro){ fila.push(campo); campo=""; }
    else if((c==="\n") && !dentro){ fila.push(campo); out.push(fila); fila=[]; campo=""; }
    else if(c!=="\r"){ campo+=c; }
  }
  if(campo||fila.length){ fila.push(campo); out.push(fila); }
  return out;
}

fetch(URL_CSV).then(function(r){ return r.text(); }).then(function(txt){
  var f = filas(txt), cab = f[0], ix = {};
  cab.forEach(function(n,i){ ix[n]=i; });
  var acum = {};
  for(var i=1;i<f.length;i++){
    var r = f[i];
    if(r.length < cab.length) continue;
    if(r[ix.provincia] !== "Buenos Aires") continue;
    if(PARTIDOS.indexOf(r[ix.departamento]) < 0) continue;
    if(!MAPA[r[ix.cultivo]]) continue;
    if(parseInt(r[ix.anio],10) < DESDE) continue;
    var rin = parseInt(r[ix.rendimiento_kgxha],10);
    if(!rin) continue;
    MAPA[r[ix.cultivo]].forEach(function(k){
      var p = r[ix.departamento];
      acum[p] = acum[p] || {};
      (acum[p][k] = acum[p][k] || []).push(rin);
    });
  }
  var salida = {};
  Object.keys(acum).sort().forEach(function(p){
    salida[p] = {};
    Object.keys(acum[p]).sort().forEach(function(k){ salida[p][k] = mediana(acum[p][k]); });
  });
  console.log("var RINDES_PARTIDO = " + JSON.stringify(salida) + ";");
});
