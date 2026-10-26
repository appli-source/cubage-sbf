/* Cubage SBF — mode vocal pour le pointage des tiges par classe de diamètre (estimation sur pied).
   Reconnaissance 100 % locale : Vosk (Kaldi) compilé en WebAssembly (vendor/vosk-browser, Apache 2.0),
   modèle français officiel (models/, Apache 2.0), exécuté dans un Web Worker. Aucun son ne quitte le téléphone.
   Le module est indépendant de app.js : il expose window.CubageVoice et n'agit sur l'application qu'à
   travers les fonctions que l'écran de saisie lui confie (bind). S'il est absent ou indisponible, l'écran
   fonctionne comme avant. */
(function(){
'use strict';
const VOSK_JS='vendor/vosk-browser/vosk.js';               // 5,8 Mo, chargé uniquement à la 1re activation
const MODEL_URL='models/vosk-model-small-fr-0.22.tar.gz';   // 42 Mo, téléchargé une fois puis conservé (IndexedDB)
const FLAG='sbf-vocal-modele';                              // marque « modèle déjà téléchargé sur ce téléphone »
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').toLowerCase().normalize('NFC').replace(/[’']/g,' ').replace(/\s+/g,' ').trim();

/* Noms parlés par défaut pour les codes d'essence courants ; le Sheet (colonne « mots_vocaux » de l'onglet
   ESSENCES) ou le champ des Paramètres complètent ou remplacent ces valeurs. Plusieurs noms : virgule. */
const DEFAUT={CH:'chêne',CHE:'chêne',CHX:'chêne',CHS:'chêne',CHP:'chêne',CHR:'chêne rouge',CHV:'chêne vert',
  HET:'hêtre',HE:'hêtre',HTR:'hêtre',CHA:'châtaignier',CHT:'châtaignier',CT:'châtaignier',
  PIN:'pin',PM:'pin maritime',PS:'pin sylvestre',PL:'pin laricio, pin corse',PN:'pin noir',PW:'pin weymouth, pin blanc',
  DOU:'douglas',DG:'douglas',EP:'épicéa',EPC:'épicéa',SAP:'sapin',SP:'sapin',MEL:'mélèze',CED:'cèdre',
  PEU:'peuplier',PEP:'peuplier',TRE:'tremble',FR:'frêne',FRE:'frêne',MER:'merisier',BOU:'bouleau',
  AUL:'aune, verne',AUN:'aune',TIL:'tilleul',CHM:'charme',CRM:'charme',ERA:'érable',ER:'érable',SYC:'sycomore',
  ROB:'acacia, robinier',ACA:'acacia',NOY:'noyer',SAU:'saule',ORM:'orme',ALI:'alisier',COR:'cormier',
  POM:'pommier',POI:'poirier',SOR:'sorbier',PLA:'platane',IF:'if',THU:'thuya',SEQ:'séquoia',CYP:'cyprès',
  FD:'feuillus divers, divers',RD:'résineux divers',DIV:'divers',BB:'bois blanc'};
const CMD={annule:'annule',annuler:'annule',erreur:'annule',efface:'annule',pause:'pause',stop:'pause',reprise:'reprise',reprends:'reprise'};

/* Nombres en toutes lettres (10 → « dix », 35 → « trente-cinq », 105 → « cent cinq ») */
const UNITS=['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
const TENS={20:'vingt',30:'trente',40:'quarante',50:'cinquante',60:'soixante',80:'quatre-vingt'};
function nombre(n){n=Math.round(n);if(n<0)return '';if(n<20)return UNITS[n];
  if(n<100){let t=Math.floor(n/10)*10,u=n-t;if(t===70||t===90){t-=10;u+=10;}const b=TENS[t];
    if(u===0)return t===80?'quatre-vingts':b;if(u===1&&t!==80)return b+'-et-un';if(u===11&&t===60)return b+'-et-onze';return b+'-'+UNITS[u];}
  if(n<200){const r=n-100;return r?'cent '+nombre(r):'cent';}
  return String(n);}

const V={etat:'off',msg:'',model:null,rec:null,ctx:null,stream:null,src:null,node:null,hook:null,gramKey:'',lex:new Map(),
  cur:'',dernier:'',partiel:'',pause:false,parle:false,wake:null,bound:false,chargement:false,ignorerJusqua:0};

function disponible(){return !!(window.Worker&&window.WebAssembly&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&(window.AudioContext||window.webkitAudioContext)&&window.indexedDB);}

/* Noms parlés d'un code (priorité : mots de l'utilisateur / du Sheet, puis défauts) */
function motsDe(code,mots){let v=mots&&mots[code];if(v==null)v=DEFAUT[code.toUpperCase()];if(v==null)return[];
  return [].concat(v).join(',').split(/[,;\/]/).map(norm).filter(Boolean);}

/* Grammaire (liste de phrases attendues) + lexique de décodage, à partir des essences et classes du lot */
function construire(h){const lex=new Map();const ess=[];
  for(const code of h.essences||[]){const noms=motsDe(code,h.mots);for(const n of noms){if(!lex.has(n)){lex.set(n,{k:'ess',v:code});ess.push(n);}}}
  const nums=[];for(const c of h.classes||[]){const n=nombre(c);if(n){lex.set(n,{k:'num',v:c});nums.push(n);}}
  for(const w of Object.keys(CMD))lex.set(w,{k:'cmd',v:CMD[w]});
  const phrases=[];for(const e of ess){phrases.push(e);for(const n of nums)phrases.push(e+' '+n);}
  for(const n of nums)phrases.push(n);const some=nums.slice(0,8);for(const a of some)for(const b of some)phrases.push(a+' '+b);
  phrases.push('annule','erreur','pause','stop','reprise','[unk]');
  return{lex,phrases,ess,key:JSON.stringify([ess,nums])};}

/* ---------- Retour sonore / vocal ---------- */
function bip(f,ms,g){try{if(!V.ctx)return;const o=V.ctx.createOscillator(),a=V.ctx.createGain();o.type='sine';o.frequency.value=f;a.gain.value=g||.12;o.connect(a);a.connect(V.ctx.destination);const t=V.ctx.currentTime;o.start(t);a.gain.setValueAtTime(g||.12,t);a.gain.exponentialRampToValueAtTime(.001,t+ms/1000);o.stop(t+ms/1000+.02);}catch(e){}}
const bipOk=()=>bip(1046,90),bipErr=()=>{bip(220,160,.18);setTimeout(()=>bip(220,160,.18),200);},bipEss=()=>{bip(660,70);setTimeout(()=>bip(880,90),90);};
function vibrer(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}
function dire(txt){if(!V.hook||V.hook.annonce===false||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(txt);u.lang='fr-FR';u.rate=1.05;
  V.parle=true;u.onend=u.onerror=()=>{V.parle=false;V.ignorerJusqua=Date.now()+400;};speechSynthesis.speak(u);setTimeout(()=>{V.parle=false;},4000);}catch(e){V.parle=false;}}

/* ---------- Chargement du moteur ---------- */
function script(src){return new Promise((res,rej)=>{if(window.Vosk)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Impossible de charger le moteur vocal (réseau ?)'));document.head.appendChild(s);});}
/* URL absolue : le worker tourne dans une URL blob:, une adresse relative y perdrait le dossier de l'application */
const modelUrl=()=>new URL(MODEL_URL,document.baseURI).href;
const flagKey=()=>FLAG+':'+modelUrl();
const dejaCharge=()=>{try{return localStorage.getItem(flagKey())==='1';}catch(e){return false;}};
function chargerModele(){return new Promise((res,rej)=>{const m=new Vosk.Model(modelUrl(),-1);let fini=false;
  m.on('load',x=>{if(fini)return;fini=true;if(x.result){try{localStorage.setItem(flagKey(),'1');}catch(e){}res(m);}else rej(new Error('Modèle vocal illisible'));});
  m.on('error',x=>{if(fini)return;fini=true;rej(new Error(/HTTP|fetch|network|Failed/i.test(x.error||'')?'Téléchargement du modèle impossible (réseau ?)':(x.error||'Erreur du moteur vocal')));});
  setTimeout(()=>{if(!fini){fini=true;rej(new Error('Le chargement du modèle vocal prend trop de temps'));}},600000);});}

async function preparer(){if(V.model)return;setEtat('chargement','Chargement du moteur vocal…');await script(VOSK_JS);
  const deja=dejaCharge();
  if(!deja&&!navigator.onLine)throw new Error('Première activation : il faut du réseau pour télécharger le modèle vocal (42 Mo, une seule fois).');
  setEtat('chargement',deja?'Ouverture du modèle vocal…':'Téléchargement du modèle vocal (42 Mo, une seule fois)…');
  V.model=await chargerModele();}

function creerReco(){if(!V.model||!V.hook)return;const g=construire(V.hook);if(V.rec&&g.key===V.gramKey)return;
  if(V.rec){try{V.rec.remove();}catch(e){}V.rec=null;}
  V.lex=g.lex;V.gramKey=g.key;const sr=V.ctx?V.ctx.sampleRate:16000;
  const rec=new V.model.KaldiRecognizer(sr,JSON.stringify(g.phrases));V.rec=rec;
  rec.on('result',m=>{if(V.rec!==rec)return;traiter(m.result&&m.result.text||'');});
  rec.on('partialresult',m=>{if(V.rec!==rec)return;const p=m.result&&m.result.partial||'';if(p!==V.partiel){V.partiel=p;majPartiel();}});
  rec.on('error',m=>{console.warn('vocal',m.error);});}

/* ---------- Micro ---------- */
const demanderMicro=()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
async function demarrerAudio(pMic){const AC=window.AudioContext||window.webkitAudioContext;if(!V.ctx)V.ctx=new AC();
  V.stream=await (pMic||demanderMicro());if(V.ctx.state==='suspended')await V.ctx.resume();
  V.stream.getTracks().forEach(t=>{t.onended=()=>{if(V.etat==='ecoute'||V.etat==='pause')arreter('Micro interrompu (appel, autre application ?) · appuyez pour reprendre');};});
  V.src=V.ctx.createMediaStreamSource(V.stream);
  let ok=false;if(V.ctx.audioWorklet){try{await V.ctx.audioWorklet.addModule('voice-worklet.js');V.node=new AudioWorkletNode(V.ctx,'sbf-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});V.node.port.onmessage=e=>pousser(e.data);ok=true;}catch(e){ok=false;}}
  if(!ok){V.node=V.ctx.createScriptProcessor(4096,1,1);V.node.onaudioprocess=e=>{const o=e.outputBuffer.getChannelData(0);o.fill(0);pousser(new Float32Array(e.inputBuffer.getChannelData(0)));};}
  V.src.connect(V.node);V.node.connect(V.ctx.destination);}
function pousser(buf){if(!V.rec||V.etat!=='ecoute'&&V.etat!=='pause')return;try{V.rec.acceptWaveformFloat(buf,V.ctx.sampleRate);}catch(e){}}
function couperAudio(){try{if(V.node){V.node.disconnect();if(V.node.port)V.node.port.onmessage=null;V.node.onaudioprocess=null;}}catch(e){}try{V.src&&V.src.disconnect();}catch(e){}try{V.stream&&V.stream.getTracks().forEach(t=>{t.onended=null;t.stop();});}catch(e){}V.node=null;V.src=null;V.stream=null;}
async function veille(on){try{if(on){if(navigator.wakeLock&&!V.wake){V.wake=await navigator.wakeLock.request('screen');V.wake.addEventListener('release',()=>{V.wake=null;});}}else if(V.wake){await V.wake.release();V.wake=null;}}catch(e){V.wake=null;}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(V.etat==='ecoute'||V.etat==='pause')){veille(true);if(V.ctx&&V.ctx.state==='suspended')V.ctx.resume().catch(()=>{});}});

/* ---------- Démarrage / arrêt ---------- */
async function demarrer(){if(V.chargement)return;V.chargement=true;
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!V.ctx)V.ctx=new AC();V.ctx.resume().catch(()=>{}); // dans le geste utilisateur (iOS)
    if(!V.model&&!dejaCharge()&&!confirm('Première activation du mode vocal : téléchargement du modèle de reconnaissance (42 Mo, une seule fois, conservé sur ce téléphone). Continuer ?')){V.chargement=false;return;}
    dire('Mode vocal'); // 1re synthèse vocale dans le geste utilisateur : la débloque sur iPhone
    const pMic=demanderMicro();pMic.catch(()=>{}); // demande du micro lancée dans le geste utilisateur (exigence Safari)
    setEtat('chargement','Accès au micro…');await demarrerAudio(pMic);
    await preparer();if(!V.hook){arreter('');return;}
    if(!V.stream){setEtat('chargement','Accès au micro…');await demarrerAudio();} // écran quitté puis repris pendant le chargement
    V.pause=false;creerReco();V.cur=V.hook.cur||'';V.dernier='';V.partiel='';setEtat('ecoute','');veille(true);bipEss();}
  catch(e){couperAudio();const m=(e&&e.name==='NotAllowedError')?'Micro refusé : autorisez-le pour cette application dans les réglages du téléphone':(e&&e.message)||String(e);setEtat('erreur',m);}
  finally{V.chargement=false;}}
function arreter(msg){couperAudio();if(V.rec){try{V.rec.remove();}catch(e){}V.rec=null;V.gramKey='';}V.pause=false;veille(false);try{window.speechSynthesis&&speechSynthesis.cancel();}catch(e){}setEtat(msg?'erreur':'off',msg||'');}
function basculer(){if(V.etat==='ecoute'||V.etat==='pause')arreter('');else if(V.etat!=='chargement')demarrer();}

/* ---------- Interprétation ---------- */
function traiter(text){const t=norm(text);if(!t)return;try{console.debug('vocal :',t);}catch(e){}if(V.parle||Date.now()<V.ignorerJusqua)return; // écho de l'annonce vocale
  const toks=t.split(' ').filter(Boolean);let i=0,n=0;const faits=[];
  while(i<toks.length){let m=null;for(let L=Math.min(3,toks.length-i);L>=1;L--){const e=V.lex.get(toks.slice(i,i+L).join(' '));if(e){m={e,L};break;}}
    if(!m){i++;continue;}i+=m.L;const e=m.e;
    if(e.k==='cmd'){if(e.v==='pause'){if(!V.pause){V.pause=true;setEtat('pause','');bipEss();}faits.push('pause');continue;}
      if(e.v==='reprise'){if(V.pause){V.pause=false;setEtat('ecoute','');bipEss();}faits.push('reprise');continue;}
      if(V.pause)continue; // en pause, seule « reprise » est écoutée
      if(e.v==='annule'){const ok=V.hook&&V.hook.onAnnule&&V.hook.onAnnule();if(ok){faits.push('annulé');bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler');bipErr();}continue;}}
    if(V.pause)continue;
    if(e.k==='ess'){V.cur=e.v;if(V.hook&&V.hook.onEssence)V.hook.onEssence(e.v);faits.push(e.v);const suiv=toks[i];const suite=suiv&&V.lex.get(suiv);
      if(!(suite&&suite.k==='num')){bipEss();dire(toks.slice(i-m.L,i).join(' '));}continue;}
    if(e.k==='num'){if(!V.cur){bipErr();faits.push('essence ?');continue;}const code=V.cur;const ok=!!(V.hook&&V.hook.onPointage&&V.hook.onPointage(code,e.v));
      if(ok){n++;faits.push(code+' '+e.v);}else{bipErr();faits.push('classe '+e.v+' ?');}continue;}}
  if(V.pause&&!faits.length)return; // en pause : on laisse parler sans réagir
  if(n){bipOk();vibrer(30);}else if(!faits.length){bipErr();faits.push('non compris : « '+t.replace(/\[unk\]/g,'…')+' »');}
  V.dernier=faits.join(' · ');V.partiel='';majBloc();}

/* ---------- Liaison avec l'écran de saisie ---------- */
function bind(h){V.hook=h;V.bound=true;if(h.cur)V.cur=h.cur;if(V.model&&V.rec&&(V.etat==='ecoute'||V.etat==='pause'))creerReco();majBloc();}
function unbind(){V.bound=false;}
function apresRendu(){if(!V.bound&&(V.etat==='ecoute'||V.etat==='pause'||V.etat==='chargement')){arreter('');}if(!V.bound){V.hook=null;}}
function setEtat(e,msg){V.etat=e;V.msg=msg||'';majBloc();}

function majPartiel(){const el=$('#vocPart');if(el)el.textContent=V.partiel?'… '+V.partiel:'';}
function majBloc(){const el=$('#vocal');if(!el||!V.hook)return;const h=V.hook,e=V.etat;
  const noms=(h.essences||[]).map(c=>{const m=motsDe(c,h.mots);return m.length?`<b>${esc(m[0])}</b> <span class="muted">${esc(c)}</span>`:`<span class="muted">${esc(c)} (aucun mot)</span>`;}).join(' · ');
  const curNom=V.cur?(motsDe(V.cur,h.mots)[0]||V.cur):'—';
  if(e==='off'||e==='erreur'){el.innerHTML=`<div class="voc"><button type="button" class="btn big block" id="vocBtn">🎤 Mode vocal</button>${e==='erreur'?`<div class="msg bad">${esc(V.msg)}</div>`:''}</div>`;}
  else if(e==='chargement'){el.innerHTML=`<div class="voc"><button type="button" class="btn big block" disabled>⏳ ${esc(V.msg||'Chargement…')}</button></div>`;}
  else{el.innerHTML=`<div class="voc on${e==='pause'?' paused':''}"><div class="voc-head"><span class="voc-dot"></span><span class="grow">${e==='pause'?'En pause · dites « reprise »':'À l’écoute'} · essence <b>${esc(curNom)}</b> <span class="muted">${esc(V.cur)}</span></span><button type="button" class="btn" id="vocPause">${e==='pause'?'Reprendre':'Pause'}</button><button type="button" class="btn danger" id="vocBtn">Arrêter</button></div>
    <div class="voc-last" id="vocLast">${esc(V.dernier||'Dites « chêne quarante », puis « trente-cinq »… « annule » retire la dernière tige')}</div><div class="voc-part muted" id="vocPart"></div>
    <div class="voc-help muted">${noms}</div></div>`;
    $('#vocPause').onclick=()=>{V.pause=!V.pause;setEtat(V.pause?'pause':'ecoute','');};}
  const b=$('#vocBtn');if(b)b.onclick=basculer;}

window.CubageVoice={disponible,bind,unbind,apresRendu,basculer,arreter:()=>arreter(''),etat:()=>V.etat,nombre,motsDe};
})();
