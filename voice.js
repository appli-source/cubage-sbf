/* Cubage SBF — mode vocal.
   Deux usages : pointage des tiges par classe de diamètre (estimation sur pied) et dictée des billons
   (cubage bord de route : essence, qualité, longueur, diamètre).
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
const sansAccent=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');

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
/* Qualités : mots connus du modèle pour les libellés courants ; les autres codes sont épelés (CA → « cé a »,
   CXX → « cé double ixe », ST → « esse té », PA → « pé a »). « Avivé » n'existe pas dans le modèle : « avive »
   (le verbe) s'en approche assez pour être compris quand on prononce « avivé ». Merrain : pas de mot proche, à définir. */
const LETTRES={A:'a',B:'bé',C:'cé',D:'dé',E:'e',F:'effe',G:'gé',H:'hache',I:'i',J:'ji',K:'ka',L:'elle',M:'aime',N:'aine',O:'o',P:'pé',Q:'ku',R:'erre',S:'esse',T:'té',U:'u',V:'vé',W:'double vé',X:'ixe',Y:'i grec',Z:'zed','+':'plus','-':'moins','1':'un','2':'deux','3':'trois','4':'quatre','5':'cinq','6':'six','7':'sept','8':'huit','9':'neuf','0':'zéro'};
const MOTS_Q={AVIVE:'avive',AVIVES:'avive',SCIAGE:'sciage',PALETTE:'palette',PALETTES:'palette',CHARPENTE:'charpente',MENUISERIE:'menuiserie',EBENISTERIE:'ébénisterie',
  INDUSTRIE:'industrie',CHAUFFAGE:'chauffage',PLOT:'plot',PLOTS:'plot',PLACAGE:'placage',TRANCHE:'tranche',PARQUET:'parquet',POTEAU:'poteau',POTEAUX:'poteau',PIQUET:'piquet',
  EMBALLAGE:'emballage',COFFRAGE:'coffrage',TRAVERSE:'traverse',TRAVERSES:'traverse',BARDAGE:'bardage',BOIS:'bois',ENERGIE:'énergie',PAPETERIE:'papeterie',BILLON:'billon',
  MERRAIN:'',MERRAINS:'',TRITURATION:'',DEROULAGE:'',TRANCHAGE:''}; // '' = pas de mot utilisable dans le modèle
function epeler(code){const c=sansAccent(String(code||'')).toUpperCase().trim();if(!c)return '';
  return c.split(/[\s_.\/]+/).filter(Boolean).map(part=>{if(MOTS_Q[part]!==undefined)return MOTS_Q[part];
    if(part.length>3&&/^[A-Z]+$/.test(part))return part.toLowerCase(); // mot entier (ex. un libellé) : tel quel, reconnu s'il est dans le modèle
    const out=[];for(let i=0;i<part.length;i++){const ch=part[i];if(!LETTRES[ch])continue;if(part[i+1]===ch&&/[A-Z]/.test(ch)){out.push('double '+LETTRES[ch]);i++;}else out.push(LETTRES[ch]);}return out.join(' ');})
    .filter(Boolean).join(' ').trim();}
const CMD={annule:'annule',annuler:'annule',erreur:'annule',efface:'annule',pause:'pause',stop:'pause',reprise:'reprise',reprends:'reprise',suivante:'suivante',suivant:'suivante',numéro:'numero'};

/* Nombres en toutes lettres (10 → « dix », 35 → « trente-cinq », 105 → « cent cinq ») et lecture inverse */
const UNITS=['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
const TENS={20:'vingt',30:'trente',40:'quarante',50:'cinquante',60:'soixante',80:'quatre-vingt'};
function nombre(n){n=Math.round(n);if(n<0)return '';if(n<20)return UNITS[n];
  if(n<100){let t=Math.floor(n/10)*10,u=n-t;if(t===70||t===90){t-=10;u+=10;}const b=TENS[t];
    if(u===0)return t===80?'quatre-vingts':b;if(u===1&&t!==80)return b+'-et-un';if(u===11&&t===60)return b+'-et-onze';return b+'-'+UNITS[u];}
  if(n<1000){const c=Math.floor(n/100),r=n%100;return (c>1?UNITS[c]+' ':'')+(r?'cent '+nombre(r):(c>1?'cents':'cent'));}
  if(n<10000){const m=Math.floor(n/1000),r=n%1000;return (m>1?UNITS[m]+' ':'')+'mille'+(r?' '+nombre(r):'');}
  return String(n);}
const NUMW=new Map();for(let n=0;n<100;n++)NUMW.set(nombre(n),n);NUMW.set('quatre-vingt',80);NUMW.set('soixante-onze',71);NUMW.set('quatre-vingt-un',81);
const MULT={cent:100,cents:100,mille:1000};
/* Longueur parlée pour la relecture : 8,2 → « huit mètres vingt » */
const longueurParlee=L=>{const m=Math.floor(L+1e-9),c=Math.round((L-m)*100);return nombre(m)+' mètre'+(m>1?'s':'')+(c?' '+nombre(c):'');};
const fmtL=L=>String(Math.round(L*100)/100).replace('.',',');

const V={etat:'off',msg:'',model:null,rec:null,ctx:null,stream:null,src:null,node:null,hook:null,gramKey:'',lex:new Map(),
  cur:'',curQ:'',dernier:'',partiel:'',pause:false,parle:false,wake:null,bound:false,chargement:false,ignorerJusqua:0,pend:null};

function disponible(){return !!(window.Worker&&window.WebAssembly&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&(window.AudioContext||window.webkitAudioContext)&&window.indexedDB);}

/* Noms parlés d'un code (priorité : mots de l'utilisateur / du Sheet, puis défauts) */
function motsDe(code,mots){let v=mots&&mots[code];if(v==null)v=DEFAUT[String(code).toUpperCase()];if(v==null)return[];
  return [].concat(v).join(',').split(/[,;\/]/).map(norm).filter(Boolean);}
function motsQ(code,mots){let v=mots&&mots[code];if(v==null)v=epeler(code);
  return [].concat(v).join(',').split(/[,;\/]/).map(norm).filter(Boolean);}

/* Grammaire (liste de phrases attendues) + lexique de décodage, à partir des essences, qualités et classes du lot */
function construire(h){const lex=new Map();const ess=[],qual=[];
  for(const code of h.essences||[]){for(const n of motsDe(code,h.mots)){if(!lex.has(n)){lex.set(n,{k:'ess',v:code});ess.push(n);}}}
  const phrases=[];
  if(h.mode==='grumes'){
    for(const code of h.qualites||[]){for(const n of motsQ(code,h.motsQ)){if(!lex.has(n)){lex.set(n,{k:'q',v:code});qual.push(n);}}}
    for(const [w,n] of NUMW)lex.set(w,{k:'num',v:n});for(const w of Object.keys(MULT))lex.set(w,{k:'mult',v:MULT[w]});
    lex.set('mètres',{k:'m'});lex.set('mètre',{k:'m'});lex.set('virgule',{k:'virg'});lex.set('et demi',{k:'demi'});lex.set('demi',{k:'demi'});
    for(const w of Object.keys(CMD))lex.set(w,{k:'cmd',v:CMD[w]});
    phrases.push(...ess,...qual);for(let n=1;n<100;n++)phrases.push(nombre(n));phrases.push('quatre-vingt','cent','cents','mille','mètres','mètre','virgule','et demi');
    for(const e of ess.slice(0,6))for(const q of qual.slice(0,6))phrases.push(e+' '+q);
    phrases.push('suivante','numéro','annule','erreur','pause','stop','reprise','[unk]');
    return{lex,phrases,key:JSON.stringify(['g',ess,qual])};}
  const nums=[];for(const c of h.classes||[]){const n=nombre(c);if(n){lex.set(n,{k:'num',v:c});nums.push(n);}}
  for(const w of ['annule','annuler','erreur','efface','pause','stop','reprise','reprends'])lex.set(w,{k:'cmd',v:CMD[w]});
  for(const e of ess){phrases.push(e);for(const n of nums)phrases.push(e+' '+n);}
  for(const n of nums)phrases.push(n);const some=nums.slice(0,8);for(const a of some)for(const b of some)phrases.push(a+' '+b);
  phrases.push('annule','erreur','pause','stop','reprise','[unk]');
  return{lex,phrases,key:JSON.stringify(['c',ess,nums])};}

/* ---------- Retour sonore / vocal ---------- */
function bip(f,ms,g){try{if(!V.ctx)return;const o=V.ctx.createOscillator(),a=V.ctx.createGain();o.type='sine';o.frequency.value=f;a.gain.value=g||.12;o.connect(a);a.connect(V.ctx.destination);const t=V.ctx.currentTime;o.start(t);a.gain.setValueAtTime(g||.12,t);a.gain.exponentialRampToValueAtTime(.001,t+ms/1000);o.stop(t+ms/1000+.02);}catch(e){}}
const bipOk=()=>bip(1046,90),bipErr=()=>{bip(220,160,.18);setTimeout(()=>bip(220,160,.18),200);},bipEss=()=>{bip(660,70);setTimeout(()=>bip(880,90),90);};
function vibrer(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}
/* Annonce vocale : pendant qu'elle parle, le micro n'alimente plus la reconnaissance (sinon le téléphone s'entendrait) */
function dire(txt){if(!V.hook||V.hook.annonce===false||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(txt);u.lang='fr-FR';u.rate=1.05;
  V.parle=true;const fin=()=>{V.parle=false;V.ignorerJusqua=Date.now()+300;};u.onend=u.onerror=fin;speechSynthesis.speak(u);setTimeout(()=>{if(V.parle)fin();},5000);}catch(e){V.parle=false;}}

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
function pousser(buf){if(!V.rec||V.etat!=='ecoute'&&V.etat!=='pause')return;if(V.parle)return;try{V.rec.acceptWaveformFloat(buf,V.ctx.sampleRate);}catch(e){}}
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
    V.pause=false;V.pend=null;creerReco();V.cur=V.hook.cur||'';V.curQ=V.hook.curQ||'';V.dernier='';V.partiel='';setEtat('ecoute','');veille(true);bipEss();}
  catch(e){couperAudio();const m=(e&&e.name==='NotAllowedError')?'Micro refusé : autorisez-le pour cette application dans les réglages du téléphone':(e&&e.message)||String(e);setEtat('erreur',m);}
  finally{V.chargement=false;}}
function arreter(msg){couperAudio();if(V.rec){try{V.rec.remove();}catch(e){}V.rec=null;V.gramKey='';}V.pause=false;V.pend=null;veille(false);try{window.speechSynthesis&&speechSynthesis.cancel();}catch(e){}setEtat(msg?'erreur':'off',msg||'');}
function basculer(){if(V.etat==='ecoute'||V.etat==='pause')arreter('');else if(V.etat!=='chargement')demarrer();}

/* ---------- Interprétation ---------- */
/* Découpe une phrase reconnue en éléments du lexique (essence, qualité, nombre, commande…) ; les nombres composés
   (« cent vingt », « deux mille trois ») sont regroupés, mais « huit vingt » reste deux nombres (8 puis 20). */
function elements(t){const toks=t.split(' ').filter(Boolean);const out=[];let i=0,grp=null;
  const fin=()=>{if(!grp)return;let total=0,cur=0;for(const x of grp){if(x.mult===1000){total+=(cur||1)*1000;cur=0;}else if(x.mult===100)cur=(cur||1)*100;else cur+=x.n;}out.push({k:'num',v:total+cur});grp=null;};
  while(i<toks.length){let m=null;for(let L=Math.min(3,toks.length-i);L>=1;L--){const e=V.lex.get(toks.slice(i,i+L).join(' '));if(e){m={e,L};break;}}
    if(!m){fin();out.push({k:'unk',w:toks[i]});i++;continue;}i+=m.L;const e=m.e;
    if(e.k==='mult'){if(!grp)grp=[];grp.push({mult:e.v});continue;}            // « cent », « mille » : prolonge le nombre en cours
    if(e.k==='num'){if(grp&&grp[grp.length-1].mult){grp.push({n:e.v});continue;} // « cent vingt » → 120
      fin();grp=[{n:e.v}];continue;}                                                // « huit vingt » → 8 puis 20
    fin();out.push({k:e.k,v:e.v});}
  fin();return out;}

function traiter(text){const t=norm(text);if(!t)return;try{console.debug('vocal :',t);}catch(e){}if(V.parle||Date.now()<V.ignorerJusqua)return; // écho de l'annonce vocale
  const els=elements(t);
  // commandes communes : pause / reprise
  const cmds=els.filter(e=>e.k==='cmd').map(e=>e.v);
  if(cmds.includes('pause')&&!V.pause){V.pause=true;setEtat('pause','');bipEss();V.dernier='pause';majBloc();return;}
  if(V.pause){if(cmds.includes('reprise')){V.pause=false;setEtat('ecoute','');bipEss();V.dernier='reprise';majBloc();}return;} // en pause, on laisse parler
  const faits=(V.hook&&V.hook.mode==='grumes')?traiterGrumes(els):traiterClasses(els);
  if(faits!==null){V.dernier=faits.length?faits.join(' · '):('non compris : « '+t.replace(/\[unk\]/g,'…')+' »');if(!faits.length)bipErr();}
  V.partiel='';majBloc();}

/* Pointage par classes : « chêne quarante », « quarante », « chêne », « annule » */
function traiterClasses(els){let n=0;const faits=[];
  for(let i=0;i<els.length;i++){const e=els[i];
    if(e.k==='cmd'){if(e.v==='annule'){const ok=V.hook&&V.hook.onAnnule&&V.hook.onAnnule();if(ok){faits.push('annulé');bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler');bipErr();}}continue;}
    if(e.k==='ess'){V.cur=e.v;if(V.hook&&V.hook.onEssence)V.hook.onEssence(e.v);faits.push(e.v);const suiv=els[i+1];
      if(!(suiv&&suiv.k==='num')){bipEss();dire(motsDe(e.v,V.hook&&V.hook.mots)[0]||e.v);}continue;}
    if(e.k==='num'){if(!V.cur){bipErr();faits.push('essence ?');continue;}const code=V.cur;const ok=!!(V.hook&&V.hook.onPointage&&V.hook.onPointage(code,e.v));
      if(ok){n++;faits.push(code+' '+e.v);}else{bipErr();faits.push('classe '+e.v+' ?');}continue;}}
  if(n){bipOk();vibrer(30);}
  return faits;}

/* Dictée des billons : « chêne, CA, huit vingt, quarante-deux » (essence et qualité facultatives = précédentes),
   « suivante » (grume suivante), « numéro cent douze », « annule ». Un billon se dicte d'une traite : le dernier
   nombre est le diamètre, ce qui précède est la longueur (« huit » = 8 m, « huit vingt » = 8,20). « mètres » est
   un simple séparateur ; « virgule » et « et demi » marquent des décimales sans ambiguïté. Une longueur dictée seule
   reste en attente de son diamètre. */
function traiterGrumes(els){const faits=[];const h=()=>V.hook;
  let seq=[];     // nombres et marqueurs de la longueur/du diamètre en cours
  let attenteNum=false; // après « numéro »
  const flush=()=>{ // transforme seq en billon (ou en longueur en attente)
    if(!seq.length)return;
    let L=null,d=null;const nums=seq.filter(x=>x.k==='num');
    if(V.pend){ // une longueur attendait son diamètre : « vingt quarante-deux » complète 8 → 8,20 / Ø 42 ; « quarante-deux » → Ø 42
      L=V.pend.L;if(nums.length>=2&&!V.pend.dec){L=Math.floor(L)+nums[0].v/100;d=nums[nums.length-1].v;}
      else if(nums.length>=1)d=nums[nums.length-1].v;}
    else{
      if(!nums.length){seq=[];return;}
      if(nums.length>3){faits.push('un billon à la fois');bipErr();seq=[];return;}
      const iV=seq.findIndex(x=>x.k==='virg'),iD=seq.findIndex(x=>x.k==='demi');
      L=nums[0].v;let dec=false;let reste=nums.slice(1);
      if(iD>=0){L+=.5;dec=true;}
      else if(iV>=0){const nv=seq.slice(iV+1).find(x=>x.k==='num');if(nv){L+=nv.v<10?nv.v/10:nv.v/100;dec=true;reste=reste.filter(x=>x!==nv);}}
      else if(reste.length>=2){L+=reste[0].v/100;dec=true;reste=reste.slice(1);}
      if(reste.length)d=reste[reste.length-1].v;
      if(d==null){seq=[];if(!(L>=0.5&&L<=40)){faits.push('longueur '+fmtL(L)+' m ?');bipErr();return;}V.pend={L,dec};faits.push(fmtL(L)+' m · Ø ?');majBloc();return;}}
    seq=[];V.pend=null;
    if(!(L>=0.5&&L<=40)){faits.push('longueur '+fmtL(L)+' m ?');bipErr();return;}
    if(!(d>=5&&d<=250)){faits.push('diamètre '+d+' ?');bipErr();return;}
    if(!V.cur){faits.push('essence ?');bipErr();return;}
    const r=h()&&h().onBillon&&h().onBillon(V.cur,V.curQ,Math.round(L*100)/100,Math.round(d));
    if(!r){faits.push('billon refusé');bipErr();return;}
    faits.push((r.label?r.label+' · ':'')+V.cur+' '+(V.curQ||'—')+' · '+fmtL(L)+' m · Ø '+Math.round(d));bipOk();vibrer(30);
    dire((V.curQ?(motsQ(V.curQ,h()&&h().motsQ)[0]||V.curQ)+', ':'')+longueurParlee(L)+', '+nombre(Math.round(d)));};
  const oubli=()=>{if(V.pend){faits.push(fmtL(V.pend.L)+' m abandonné');V.pend=null;}};
  for(let i=0;i<els.length;i++){const e=els[i];
    if(e.k==='num'||e.k==='m'||e.k==='virg'||e.k==='demi'){
      if(attenteNum&&e.k==='num'){attenteNum=false;const ok=h()&&h().onNumero&&h().onNumero(e.v);faits.push(ok?'grume n° '+e.v:'numéro refusé');if(ok){bipEss();dire('grume '+nombre(e.v));}else bipErr();continue;}
      seq.push(e);continue;}
    flush();
    if(e.k==='ess'){oubli();V.cur=e.v;if(h()&&h().onEssence)h().onEssence(e.v);faits.push(e.v);const suiv=els[i+1];if(!suiv||suiv.k==='unk'){bipEss();dire(motsDe(e.v,h()&&h().mots)[0]||e.v);}continue;}
    if(e.k==='q'){oubli();V.curQ=e.v;if(h()&&h().onQualite)h().onQualite(e.v);faits.push(e.v);const suiv=els[i+1];if(!suiv||suiv.k==='unk')bipEss();continue;}
    if(e.k==='cmd'){
      if(e.v==='numero'){attenteNum=true;continue;}
      if(e.v==='suivante'){oubli();const r=h()&&h().onSuivante&&h().onSuivante();
        if(r){faits.push('→ grume '+r);bipEss();vibrer([30,60,30]);dire('grume '+nombre(Number(r)||0));}else{faits.push('grume non enregistrée');bipErr();}continue;}
      if(e.v==='annule'){if(V.pend){V.pend=null;faits.push('longueur annulée');bipEss();continue;}const r=h()&&h().onAnnule&&h().onAnnule();
        if(r){faits.push('annulé : '+r);bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler');bipErr();}continue;}}}
  flush();
  return faits;}

/* ---------- Liaison avec l'écran de saisie ---------- */
function bind(h){const chg=V.hook&&V.hook.mode!==h.mode;V.hook=h;V.bound=true;if(h.cur)V.cur=h.cur;if(h.curQ!==undefined&&h.curQ!==null)V.curQ=h.curQ;if(chg)V.pend=null;
  if(V.model&&V.rec&&(V.etat==='ecoute'||V.etat==='pause'))creerReco();majBloc();}
function unbind(){V.bound=false;}
function apresRendu(){if(!V.bound&&(V.etat==='ecoute'||V.etat==='pause'||V.etat==='chargement')){arreter('');}if(!V.bound){V.hook=null;}}
function setEtat(e,msg){V.etat=e;V.msg=msg||'';majBloc();}

function majPartiel(){const el=$('#vocPart');if(el)el.textContent=V.partiel?'… '+V.partiel:'';}
function majBloc(){const el=$('#vocal');if(!el||!V.hook)return;const h=V.hook,e=V.etat,gr=h.mode==='grumes';
  const nomsE=(h.essences||[]).map(c=>{const m=motsDe(c,h.mots);return m.length?`<b>${esc(m[0])}</b> <span class="muted">${esc(c)}</span>`:`<span class="muted">${esc(c)} (aucun mot)</span>`;}).join(' · ');
  const nomsQ=gr?(h.qualites||[]).map(c=>{const m=motsQ(c,h.motsQ);return m.length?`<b>${esc(m[0])}</b> <span class="muted">${esc(c)}</span>`:`<span class="muted">${esc(c)} (aucun mot)</span>`;}).join(' · '):'';
  const curNom=V.cur?(motsDe(V.cur,h.mots)[0]||V.cur):'—';
  if(e==='off'||e==='erreur'){el.innerHTML=`<div class="voc"><button type="button" class="btn big block" id="vocBtn">🎤 Mode vocal</button>${e==='erreur'?`<div class="msg bad">${esc(V.msg)}</div>`:''}</div>`;}
  else if(e==='chargement'){el.innerHTML=`<div class="voc"><button type="button" class="btn big block" disabled>⏳ ${esc(V.msg||'Chargement…')}</button></div>`;}
  else{const aide=gr?'Dites « chêne, CA, huit vingt, quarante-deux » · « suivante » = grume suivante · « annule »':'Dites « chêne quarante », puis « trente-cinq »… « annule » retire la dernière tige';
    el.innerHTML=`<div class="voc on${e==='pause'?' paused':''}"><div class="voc-head"><span class="voc-dot"></span><span class="grow">${e==='pause'?'En pause · dites « reprise »':'À l’écoute'} · <b>${esc(curNom)}</b>${gr?` <b>${esc(V.curQ||'—')}</b>`:''}${gr&&h.num?` · grume ${esc(h.num)}`:''}</span><button type="button" class="btn" id="vocPause">${e==='pause'?'Reprendre':'Pause'}</button><button type="button" class="btn danger" id="vocBtn">Arrêter</button></div>
    <div class="voc-last" id="vocLast">${esc(V.pend?V.cur+' '+(V.curQ||'—')+' · '+fmtL(V.pend.L)+' m · Ø ?':(V.dernier||aide))}</div><div class="voc-part muted" id="vocPart"></div>
    <div class="voc-help muted">${nomsE}${nomsQ?'<br>'+nomsQ:''}</div></div>`;
    $('#vocPause').onclick=()=>{V.pause=!V.pause;setEtat(V.pause?'pause':'ecoute','');};}
  const b=$('#vocBtn');if(b)b.onclick=basculer;}

window.CubageVoice={disponible,bind,unbind,apresRendu,basculer,arreter:()=>arreter(''),etat:()=>V.etat,nombre,motsDe,motsQ,epeler,_elements:elements};
})();
