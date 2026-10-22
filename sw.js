/* Service worker : met en cache l'application et ses bibliothèques pour un fonctionnement 100 % hors ligne */
const CACHE='cubage-sbf-v1';
const ASSETS=['./','./index.html','./app.js','./calc.js','./manifest.json',
 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(ASSETS.map(a=>c.add(a)))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
  if(u.host.includes('script.google.com'))return; // synchro : toujours réseau
  e.respondWith(caches.match(e.request,{ignoreSearch:u.origin===location.origin}).then(r=>r||fetch(e.request).then(res=>{if(res&&(res.ok||res.type==='opaque'))caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res;}).catch(()=>caches.match('./index.html'))));});
