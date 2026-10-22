/* Service worker : met en cache l'application pour un fonctionnement 100 % hors ligne.
   Fichiers de l'appli : réseau d'abord (mises à jour immédiates), cache si hors ligne.
   Bibliothèques CDN : cache d'abord. */
const CACHE='cubage-sbf-v3';
const APP=['./','./index.html','./app.js','./calc.js','./manifest.json'];
const CDN=['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled([...APP,...CDN].map(a=>c.add(a)))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
  if(u.host.includes('script.google.com')||u.host.includes('googleusercontent.com'))return; // synchro : toujours réseau
  if(u.origin===location.origin){
    e.respondWith(fetch(e.request).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return res;})
      .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));return;}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return res;})));});
