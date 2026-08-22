/* AGROCONTROL · service worker
   La app queda guardada en el teléfono. El clima siempre se pide a la red:
   nunca se sirve un pronóstico viejo desde la caché. */
/* v4: hasta la v3 se guardaba en la caché cualquier respuesta, incluso un 500
   o un 404. Un error pasajero de Vercel —o una carga justo en medio de un
   despliegue— reemplazaba la copia buena de la app por la página de error, y
   eso era lo que quedaba para abrir sin señal. Al subir la versión, cualquier
   caché ya envenenada se borra sola en el activate. */
var CACHE = "agrocontrol-v4";
var SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./icon-192-v2.png", "./icon-512-v2.png",
  "./fuentes/IBMPlexMono-400-latin.woff2",
  "./fuentes/IBMPlexMono-500-latin.woff2",
  "./fuentes/IBMPlexMono-600-latin.woff2",
  "./fuentes/IBMPlexSans-400-latin.woff2",
  "./fuentes/IBMPlexSans-500-latin.woff2",
  "./fuentes/IBMPlexSans-600-latin.woff2",
  "./fuentes/IBMPlexSans-700-latin.woff2",
  "./fuentes/SpaceGrotesk-500-latin.woff2",
  "./fuentes/SpaceGrotesk-600-latin.woff2",
  "./fuentes/SpaceGrotesk-700-latin.woff2"
];

self.addEventListener("install", function(ev){
  self.skipWaiting();
  ev.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){}));
});

self.addEventListener("activate", function(ev){
  ev.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(ev){
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  /* el pronóstico nunca se cachea */
  if (url.hostname.indexOf("open-meteo.com") !== -1) return;

  /* la app: primero la red para tomar actualizaciones, con la caché de respaldo */
  if (url.origin === self.location.origin) {
    ev.respondWith(
      fetch(req).then(function(res){
        /* sólo se guarda lo que sirve: una respuesta con error no puede
           terminar siendo la que se abre sin señal */
        if (res && res.ok && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copia); }).catch(function(){});
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(m){ return m || caches.match("./index.html"); });
      })
    );
  }
});
