/* AGROCONTROL · service worker
   La app queda guardada en el teléfono. El clima siempre se pide a la red:
   nunca se sirve un pronóstico viejo desde la caché. */
var CACHE = "agrocontrol-v1";
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

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
        var copia = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copia); }).catch(function(){});
        return res;
      }).catch(function(){
        return caches.match(req).then(function(m){ return m || caches.match("./index.html"); });
      })
    );
  }
});
