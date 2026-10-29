/* Service worker : met en cache l'application pour un fonctionnement 100 % hors ligne, sans dépendre de l'hébergement (GitHub Pages).
   Ouverture de l'appli : réseau d'abord pour recevoir les mises à jour, mais le téléphone ouvre sa propre copie si l'hébergement
   est injoignable, répond par une erreur (panne, site supprimé…) ou met plus de 3 s à répondre (réseau faible). Une page ouverte
   depuis la copie charge ses scripts depuis la copie (versions cohérentes) ; une réponse arrivée trop tard n'est pas mise en cache.
   Autres fichiers de l'appli : réseau d'abord, copie du téléphone en cas d'erreur ou, pour les fichiers sans ?v=, au-delà de 3 s.
   Bibliothèques CDN : cache d'abord.
   Mode vocal : le moteur (vendor/) et le modèle (models/) ne sont pas préchargés ; ils entrent dans le cache
   à la première activation du mode vocal (le modèle est en outre conservé par le moteur lui-même dans IndexedDB).
   Le nom du cache reste fixe : une mise à jour de ce fichier ne vide jamais la copie du téléphone. */
const PREFIX='cubage-sbf-v';
const CACHE=PREFIX+'6';
const DELAI=3000;
const APP=['./','./index.html','./app.js','./docs.js','./calc.js','./voice.js','./voice-worklet.js','./manifest.json'];
const CDN=['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
let ouvertDepuisCopie=0; // heure de la dernière ouverture servie depuis la copie du téléphone (0 = servie par le réseau)
const attendre=ms=>new Promise(r=>setTimeout(r,ms));
const valide=res=>{if(res&&res.ok)return res;throw new Error('HTTP '+(res?res.status:'?'));};
const garder=(req,res)=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));return res;};
const copie=req=>caches.match(req).then(r=>r||caches.match(req,{ignoreSearch:true})); // version exacte d'abord
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled([...APP,...CDN].map(a=>c.add(a)))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
/* Ouverture de l'appli (page) */
async function ouvrir(req){const net=fetch(req.url,{cache:'no-cache'});net.catch(()=>{});
  const loc=await copie(req)||await caches.match('./index.html');
  if(!loc)return net.then(res=>res.ok?garder(req,res):res);
  const res=await Promise.race([net.then(valide).catch(()=>null),attendre(DELAI).then(()=>null)]);
  if(res){ouvertDepuisCopie=0;return garder(req,res);}
  ouvertDepuisCopie=Date.now();return loc;}
/* Scripts et fichiers de l'appli */
async function fichier(req){const loc=await copie(req);
  if(!loc)return fetch(req,{cache:'no-cache'}).then(res=>res.ok?garder(req,res):res);
  if(Date.now()-ouvertDepuisCopie<60000)return loc;
  const net=fetch(req,{cache:'no-cache'}).then(valide).then(res=>garder(req,res)).catch(()=>loc);
  return new URL(req.url).searchParams.has('v')?net:Promise.race([net,attendre(DELAI).then(()=>loc)]);}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
  if(u.host.includes('script.google.com')||u.host.includes('googleusercontent.com')||u.host.includes('tile.openstreetmap.org'))return; // synchro et fond de carte : toujours réseau
  if(u.origin===location.origin){e.respondWith(e.request.mode==='navigate'?ouvrir(e.request):fichier(e.request));return;}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return res;})));});
