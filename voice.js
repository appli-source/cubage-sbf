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
const CMD={annule:'annule',annuler:'annule',erreur:'annule',efface:'annule',pause:'pause',stop:'pause',reprise:'reprise',reprends:'reprise',suivante:'suivante',suivant:'suivante',numéro:'numero',terminé:'terminer',terminer:'terminer',fin:'terminer'};

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

/* Mot de départ (« note ») : seules les phrases qui commencent par ce mot sont prises en compte ; tout le reste
   (conversation, bruit) est ignoré. Vide = aucun mot de départ. */
const motDepart=h=>norm((h&&h.motDepart)||'');
/* Mots de commentaire : « gelé = gélivure » (mot dit = texte enregistré) ou simplement « fente » (dit et enregistré tels quels) */
function motsC(h){return (h.motsC||[]).map(x=>{const m=String(x).split(/[=:]/);const dit=norm(m[0]);const texte=m.length>1?String(m.slice(1).join(':')).trim():String(m[0]).trim();return dit?{dit,texte:texte||dit}:null;}).filter(Boolean);}
/* Grammaire (liste de phrases attendues) + lexique de décodage, à partir des essences, qualités et classes du lot */
function construire(h){const r=construire0(h);const w=motDepart(h);if(w){r.phrases=[w,...r.phrases.map(p=>p==='[unk]'?p:w+' '+p)];r.key+='|'+w;}return r;}
function construire0(h){const lex=new Map();const ess=[],qual=[];
  for(const code of h.essences||[]){for(const n of motsDe(code,h.mots)){if(!lex.has(n)){lex.set(n,{k:'ess',v:code});ess.push(n);}}}
  const phrases=[];
  if(h.mode==='grumes'){
    for(const code of h.qualites||[]){for(const n of motsQ(code,h.motsQ)){if(!lex.has(n)){lex.set(n,{k:'q',v:code});qual.push(n);}}}
    for(const [w,n] of NUMW)lex.set(w,{k:'num',v:n});for(const w of Object.keys(MULT))lex.set(w,{k:'mult',v:MULT[w]});
    lex.set('mètres',{k:'m'});lex.set('mètre',{k:'m'});lex.set('par',{k:'par'});lex.set('virgule',{k:'virg'});lex.set('et demi',{k:'demi'});lex.set('demi',{k:'demi'});
    for(const w of Object.keys(CMD))lex.set(w,{k:'cmd',v:CMD[w]});
    lex.set('billon suivant',{k:'cmd',v:'billon'});lex.set('billon',{k:'cmd',v:'billon'});lex.set('grume suivante',{k:'cmd',v:'suivante'});lex.set('grume',{k:'cmd',v:'suivante'});lex.set('arbre suivant',{k:'cmd',v:'suivante'});lex.set('arbre',{k:'cmd',v:'suivante'});
    lex.set('longueur',{k:'fld',v:'L'});lex.set('diamètre',{k:'fld',v:'d'});
    lex.set('longueur totale',{k:'fld',v:'lt'});lex.set('longueur d origine',{k:'fld',v:'lt'});lex.set('origine',{k:'fld',v:'lt'});lex.set('totale',{k:'fld',v:'lt'});lex.set('chute',{k:'fld',v:'ch'});lex.set('abandon',{k:'fld',v:'ch'});lex.set('abandonne',{k:'fld',v:'ch'});
    lex.set('réduction',{k:'fld',v:'rl'});lex.set('réduction longueur',{k:'fld',v:'rl'});lex.set('réduction diamètre',{k:'fld',v:'rd'});lex.set('commentaire',{k:'cmd',v:'comm'});lex.set('remarque',{k:'cmd',v:'comm'});
    for(const c of motsC(h)){if(!lex.has(c.dit))lex.set(c.dit,{k:'com',v:c.texte});}for(const a of ['annule','annuler','efface','erreur']){lex.set(a+' billon',{k:'cmd',v:'annule'});lex.set(a+' grume',{k:'cmd',v:'annuleG'});lex.set(a+' arbre',{k:'cmd',v:'annuleG'});lex.set(a+' commentaire',{k:'cmd',v:'annuleC'});lex.set(a+' remarque',{k:'cmd',v:'annuleC'});lex.set(a+' réduction',{k:'cmd',v:'annuleR'});}lex.set('billon précédent',{k:'cmd',v:'precedent'});lex.set('précédent',{k:'cmd',v:'precedent'});lex.set('retour',{k:'cmd',v:'precedent'});
    phrases.push(...ess,...qual);for(let n=1;n<100;n++)phrases.push(nombre(n));phrases.push('quatre-vingt','cent','cents','mille','mètres','mètre','par','virgule','demi'); // « et » volontairement absent du vocabulaire : il absorberait un « huit » faible
    for(const e of ess.slice(0,6))for(const q of qual.slice(0,6))phrases.push(e+' '+q);
    phrases.push('longueur totale','origine','totale','chute','abandon','réduction longueur','réduction diamètre','réduction','commentaire','remarque','annule commentaire','annule réduction',...motsC(h).map(c=>c.dit),'billon suivant','grume suivante','arbre suivant','billon précédent','précédent','retour','annule billon','annule grume','annule arbre','billon','grume','arbre','suivant','longueur','diamètre','suivante','terminé','numéro','annule','erreur','pause','stop','reprise','[unk]');
    return{lex,phrases,key:JSON.stringify(['g',ess,qual,h.motsC||[]])};}
  if(h.mode==='pieds'){ // pied à pied numéroté : essence, diamètre, hauteur, tarif, tronçons de qualité, numéro
    for(const code of h.qualites||[]){for(const n of motsQ(code,h.motsQ)){if(!lex.has(n)){lex.set(n,{k:'q',v:code});qual.push(n);}}}
    for(const [w,n] of NUMW)lex.set(w,{k:'num',v:n});for(const w of Object.keys(MULT))lex.set(w,{k:'mult',v:MULT[w]});
    lex.set('mètres',{k:'m'});lex.set('mètre',{k:'m'});lex.set('par',{k:'par'});lex.set('virgule',{k:'virg'});lex.set('et demi',{k:'demi'});lex.set('demi',{k:'demi'});
    for(const w of Object.keys(CMD))lex.set(w,{k:'cmd',v:CMD[w]});
    lex.set('diamètre',{k:'fld',v:'d'});lex.set('hauteur',{k:'fld',v:'h'});lex.set('tarif',{k:'fld',v:'t'});lex.set('tronçon',{k:'fld',v:'tr'});lex.set('qualité',{k:'fld',v:'tr'});
    lex.set('arbre suivant',{k:'cmd',v:'suivante'});lex.set('arbre',{k:'cmd',v:'suivante'});lex.set('précédent',{k:'cmd',v:'precedent'});lex.set('arbre précédent',{k:'cmd',v:'precedent'});lex.set('retour',{k:'cmd',v:'precedent'});
    for(const a of ['annule','annuler','efface','erreur']){lex.set(a+' arbre',{k:'cmd',v:'annuleA'});lex.set(a+' tronçon',{k:'cmd',v:'annuleT'});lex.set(a+' qualité',{k:'cmd',v:'annuleT'});}
    phrases.push(...ess,...qual);for(let n=1;n<100;n++)phrases.push(nombre(n));phrases.push('cent','mètres','mètre','par','virgule','demi','diamètre','hauteur','tarif','tronçon','qualité','arbre suivant','arbre précédent','précédent','retour','suivant','suivante','numéro','annule','annule arbre','annule tronçon','erreur','pause','stop','reprise','terminé','[unk]');
    for(const e of ess.slice(0,6))phrases.push(e+' quarante');
    return{lex,phrases,key:JSON.stringify(['p',ess,qual])};}
  const nums=[];for(const c of h.classes||[]){const n=nombre(c);if(n){lex.set(n,{k:'num',v:c});nums.push(n);}}
  for(const w of ['annule','annuler','erreur','efface','pause','stop','reprise','reprends','terminé','terminer','fin'])lex.set(w,{k:'cmd',v:CMD[w]});
  lex.set('tarif',{k:'fld',v:'t'});for(let t=1;t<=20;t++){const n=nombre(t);if(!lex.has(n))lex.set(n,{k:'num',v:t});} // « tarif huit » : tarif Chaudé 1 à 20
  for(const e of ess){phrases.push(e);for(const n of nums)phrases.push(e+' '+n);}
  for(const n of nums)phrases.push(n);const some=nums.slice(0,8);for(const a of some)for(const b of some)phrases.push(a+' '+b);
  phrases.push('tarif','terminé');for(let t=1;t<=20;t++)phrases.push('tarif '+nombre(t));
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
  rec.on('result',m=>{if(V.rec!==rec)return;const ws=(m.result&&m.result.result)||[];const conf=ws.length?Math.min(...ws.map(w=>Number(w.conf)||0)):1;traiter(m.result&&m.result.text||'',conf);});
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
function pousser(buf){const rec=V.libre?V.recLibre:V.rec;if(!rec||V.etat!=='ecoute'&&V.etat!=='pause')return;if(V.parle)return;try{rec.acceptWaveformFloat(buf,V.ctx.sampleRate);}catch(e){}}
/* Commentaire libre : second décodeur sans grammaire (tout le vocabulaire du modèle), actif le temps d'une phrase */
function libreStart(){if(!V.model)return false;const sr=V.ctx?V.ctx.sampleRate:16000;
  if(!V.recLibre){const r=new V.model.KaldiRecognizer(sr);V.recLibre=r;
    r.on('result',m=>{if(!V.libre)return;const txt=norm(m.result&&m.result.text||'').replace(/\[unk\]/g,'').trim();if(!txt)return;libreStop();
      const D=V.draft||(V.draft={L:null,d:null});D.note=(D.note?D.note+' ':'')+txt;montrer();V.dernier='commentaire : « '+txt+' »';bipOk();dire('commentaire noté');majBloc();});
    r.on('partialresult',m=>{if(!V.libre)return;const p=m.result&&m.result.partial||'';if(p!==V.partiel){V.partiel=p;majPartiel();}});}
  V.libre=true;clearTimeout(V.libreTo);V.libreTo=setTimeout(()=>{if(V.libre){libreStop();V.dernier='commentaire : rien entendu';bipErr();majBloc();}},12000);majBloc();return true;}
function libreStop(){V.libre=false;clearTimeout(V.libreTo);V.partiel='';majPartiel();}
/* Affiche le billon en cours à l'écran (longueur, diamètre, réductions, commentaire) */
function montrer(){const D=V.draft||(V.draft={L:null,d:null});if(V.hook&&V.hook.onDraft)V.hook.onDraft(V.cur,V.curQ,D.L,D.d,{rl:D.rl||0,rd:D.rd||0,note:D.note||''});majBloc();}
function couperAudio(){try{if(V.node){V.node.disconnect();if(V.node.port)V.node.port.onmessage=null;V.node.onaudioprocess=null;}}catch(e){}try{V.src&&V.src.disconnect();}catch(e){}try{V.stream&&V.stream.getTracks().forEach(t=>{t.onended=null;t.stop();});}catch(e){}V.node=null;V.src=null;V.stream=null;}
async function veille(on){try{if(on){if(navigator.wakeLock&&!V.wake){V.wake=await navigator.wakeLock.request('screen');V.wake.addEventListener('release',()=>{V.wake=null;});}}else if(V.wake){await V.wake.release();V.wake=null;}}catch(e){V.wake=null;}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(V.etat==='ecoute'||V.etat==='pause')){veille(true);if(V.ctx&&V.ctx.state==='suspended')V.ctx.resume().catch(()=>{});}});

/* ---------- Démarrage / arrêt ---------- */
async function demarrer(){if(V.chargement)return;V.chargement=true;try{const a=document.activeElement;if(a&&a.blur&&a!==document.body)a.blur();}catch(e){} // ferme le clavier
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!V.ctx)V.ctx=new AC();V.ctx.resume().catch(()=>{}); // dans le geste utilisateur (iOS)
    if(!V.model&&!dejaCharge()&&!confirm('Première activation du mode vocal : téléchargement du modèle de reconnaissance (42 Mo, une seule fois, conservé sur ce téléphone). Continuer ?')){V.chargement=false;return;}
    dire('Mode vocal'); // 1re synthèse vocale dans le geste utilisateur : la débloque sur iPhone
    const pMic=demanderMicro();pMic.catch(()=>{}); // demande du micro lancée dans le geste utilisateur (exigence Safari)
    setEtat('chargement','Accès au micro…');await demarrerAudio(pMic);
    await preparer();if(!V.hook){arreter('');return;}
    if(!V.stream){setEtat('chargement','Accès au micro…');await demarrerAudio();} // écran quitté puis repris pendant le chargement
    V.pause=false;V.pend=null;V.draft=null;creerReco();V.cur=V.hook.cur||'';V.curQ=V.hook.curQ||'';V.dernier='';V.partiel='';setEtat('ecoute','');veille(true);bipEss();}
  catch(e){couperAudio();const m=(e&&e.name==='NotAllowedError')?'Micro refusé : autorisez-le pour cette application dans les réglages du téléphone':(e&&e.message)||String(e);setEtat('erreur',m);}
  finally{V.chargement=false;}}
function arreter(msg){couperAudio();libreStop();if(V.recLibre){try{V.recLibre.remove();}catch(e){}V.recLibre=null;}if(V.rec){try{V.rec.remove();}catch(e){}V.rec=null;V.gramKey='';}V.pause=false;V.pend=null;veille(false);try{window.speechSynthesis&&speechSynthesis.cancel();}catch(e){}setEtat(msg?'erreur':'off',msg||'');}
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

function traiter(text,conf){if(V.libre)return;let t=norm(text);if(!t)return;try{console.debug('vocal :',t,conf);}catch(e){}if(V.parle||Date.now()<V.ignorerJusqua)return; // écho de l'annonce vocale
  const strict=!(V.hook&&V.hook.strict===false);const w=motDepart(V.hook);
  // Commandes d'enregistrement dites seules (« billon suivant », « grume suivante ») : acceptées sans le mot de départ,
  // la phrase complète est assez caractéristique pour ne pas être confondue avec une conversation. « grume » n'est pas
  // connu du moteur (il ressort en mot inconnu) : « suivante » seul ou « arbre suivant » font la même chose.
  t=t.replace(/\b(annule|annuler|efface|erreur) \[unk\]/g,'$1 grume'); // « grume » inconnu du moteur après « annule »
  const seule=t.replace(/\[unk\]/g,'').replace(/\s+/g,' ').trim();const SANS={'billon suivant':'billon suivant','suivant':'billon suivant','grume suivante':'grume suivante','arbre suivant':'grume suivante','suivante':'grume suivante','billon précédent':'précédent','précédent':'précédent','retour':'précédent','terminé':'terminé','terminer':'terminé','fin':'terminé'};
  const cmdSeule=!!SANS[seule]&&(V.hook&&(V.hook.mode==='grumes'||V.hook.mode==='pieds'||seule==='terminé'||seule==='terminer'));
  // Garde-fous contre les fausses saisies : phrase contenant des mots inconnus, ou reconnue avec peu de confiance → ignorée
  if(strict&&!cmdSeule&&(t.includes('[unk]')||(conf!=null&&conf<0.55))){V.dernier='ignoré (pas compris) : « '+t.replace(/\[unk\]/g,'…')+' »';V.partiel='';majBloc();return;}
  if(cmdSeule)t=SANS[seule];else
  if(w){const i=t.indexOf(w);if(i<0||!(i===0||t[i-1]===' ')){V.dernier='ignoré (dites « '+w+' … ») : « '+t+' »';V.partiel='';majBloc();return;}
    t=t.slice(i+w.length).trim();if(!t){V.dernier='« '+w+' » … ?';V.partiel='';majBloc();return;}
    t=t.split(' ').filter(x=>x!==w).join(' ');}
  const els=elements(t);
  // commandes communes : pause / reprise
  const cmds=els.filter(e=>e.k==='cmd').map(e=>e.v);
  if(cmds.includes('pause')&&!V.pause){V.pause=true;setEtat('pause','');bipEss();V.dernier='pause';majBloc();return;}
  if(V.pause){if(cmds.includes('reprise')){V.pause=false;setEtat('ecoute','');bipEss();V.dernier='reprise';majBloc();}return;} // en pause, on laisse parler
  if(cmds.includes('terminer')){ // « terminé » : quitte l'écran de saisie (bouton Terminer), sauf si une saisie est entamée
    const D=V.draft||{};const entame=D.L!=null||D.d!=null||D.h!=null||(D.tr||[]).length||D.rl||D.rd||D.note;
    if(entame){V.dernier='saisie en cours : dites « suivant » ou « annule » avant « terminé »';bipErr();majBloc();return;}
    const ok=V.hook&&V.hook.onTerminer&&V.hook.onTerminer();if(ok){dire('terminé');bipEss();arreter('');}else{V.dernier='impossible de terminer ici';bipErr();majBloc();}return;}
  const faits=(V.hook&&V.hook.mode==='grumes')?traiterGrumes(els):(V.hook&&V.hook.mode==='pieds')?traiterPieds(els):traiterClasses(els);
  if(faits!==null){V.dernier=faits.length?faits.join(' · '):('non compris : « '+t.replace(/\[unk\]/g,'…')+' »');if(!faits.length)bipErr();}
  V.partiel='';majBloc();}

/* Pointage par classes : « chêne quarante », « quarante », « chêne », « annule » */
function traiterClasses(els){let n=0;const faits=[];let tarif=false;
  for(let i=0;i<els.length;i++){const e=els[i];
    if(e.k==='fld'&&e.v==='t'){tarif=true;continue;}
    if(tarif&&e.k==='num'){tarif=false;const ok=!!(V.hook&&V.hook.onTarif&&V.hook.onTarif(e.v));if(ok){faits.push('tarif '+e.v+(V.cur?' ('+V.cur+')':''));bipEss();dire('tarif '+nombre(e.v));}else{faits.push('tarif '+e.v+' ? (1 à 20)');bipErr();}continue;}
    tarif=false;
    if(e.k==='cmd'){if(e.v==='annule'){const ok=V.hook&&V.hook.onAnnule&&V.hook.onAnnule();if(ok){faits.push('annulé');bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler');bipErr();}}continue;}
    if(e.k==='ess'){V.cur=e.v;if(V.hook&&V.hook.onEssence)V.hook.onEssence(e.v);faits.push(e.v);const suiv=els[i+1];
      if(!(suiv&&suiv.k==='num')){bipEss();dire(motsDe(e.v,V.hook&&V.hook.mots)[0]||e.v);}continue;}
    if(e.k==='num'){if(!V.cur){bipErr();faits.push('essence ?');continue;}const code=V.cur;const ok=!!(V.hook&&V.hook.onPointage&&V.hook.onPointage(code,e.v));
      if(ok){n++;faits.push(code+' '+e.v);}else{bipErr();faits.push('classe '+e.v+' ?');}continue;}}
  if(n){bipOk();vibrer(30);}
  return faits;}

/* Dictée des billons : « chêne, CA, huit vingt, quarante-deux » (essence et qualité facultatives = précédentes),
   « suivante » (grume suivante), « numéro cent douze », « annule ». Un billon se dicte d'une traite : « par » sépare
   longueur et diamètre (« dix par cinquante », « huit vingt par quarante-deux ») ; sans « par », le dernier nombre est
   le diamètre et ce qui précède la longueur (« huit » = 8 m, « huit vingt » = 8,20). « mètres » est un simple
   séparateur ; « virgule » et « et demi » marquent des décimales. Une longueur dictée seule attend son diamètre. */
/* Dictée des billons, un billon à la fois : les éléments dictés (essence, qualité, longueur, diamètre) remplissent le billon
   en cours, visible à l'écran ; rien n'est enregistré tant qu'on n'a pas dit « billon suivant » (ou « grume suivante », qui
   enregistre le billon en cours puis passe à la grume suivante). « par » sépare longueur et diamètre (« dix par cinquante »,
   « huit vingt par quarante-deux ») ; sans « par », le dernier nombre est le diamètre et ce qui précède la longueur.
   « longueur douze » ou « diamètre quarante » corrige un seul champ. « annule » efface le billon en cours s'il est entamé,
   sinon retire le dernier billon enregistré. « numéro cent douze » change le n° de grume. */
function traiterGrumes(els){const faits=[];const h=()=>V.hook;const D=V.draft||(V.draft={L:null,d:null});
  let seq=[],attenteNum=false,fld=null;
  const etat=()=>(D.L!=null?fmtL(D.L)+' m':'L ?')+' · Ø '+(D.d!=null?D.d:'?')+(D.rl>0?' · L −'+D.rl+' cm':'')+(D.rd>0?' · Ø −'+D.rd+' cm':'')+(D.note?' · « '+D.note+' »':'');
  const flush=()=>{ // nombres dictés → longueur et/ou diamètre du billon en cours
    if(!seq.length){fld=null;return;}const nums=seq.filter(x=>x.k==='num');if(!nums.length){seq=[];fld=null;return;}
    const iP=seq.findIndex(x=>x.k==='par');
    if(fld==='d'){D.d=nums[nums.length-1].v;}
    else if(fld==='ch'){const c=nums[0].v+(nums.length>1?nums[1].v/100:0);const ok=!!(h()&&h().onChute&&h().onChute(c));faits.push(ok?'chute '+fmtL(c)+' m abandonnée':'chute refusée');if(ok)bipEss();else bipErr();seq=[];fld=null;return;}
    else if(fld==='lt'){const lt=nums[0].v+(nums.length>1?nums[1].v/100:0);const ok=!!(h()&&h().onLt&&h().onLt(lt));faits.push(ok?'longueur d’origine '+fmtL(lt)+' m':'longueur d’origine refusée');if(ok)bipEss();else bipErr();seq=[];fld=null;return;}
    else if(fld==='rl'||fld==='rd'){const r=nums[nums.length-1].v;if(!(r>0&&r<1000)){faits.push('réduction '+r+' ?');bipErr();seq=[];fld=null;return;}D[fld]=r;}
    else if(fld==='L'||iP>=0||D.L==null){
      const avant=iP>=0?seq.slice(0,iP):seq,apres=iP>=0?seq.slice(iP+1):[];
      const nAv=avant.filter(x=>x.k==='num'),nAp=apres.filter(x=>x.k==='num');
      if(!nAv.length){if(D.L!=null&&nAp.length){D.d=nAp[nAp.length-1].v;seq=[];fld=null;montrer();faits.push(etat());bipEss();return;}faits.push('longueur ?');bipErr();seq=[];fld=null;return;}
      const iV=avant.findIndex(x=>x.k==='virg'),iD=avant.findIndex(x=>x.k==='demi');
      let L=nAv[0].v,reste=nAv.slice(1);
      if(iD>=0)L+=.5;
      else if(iV>=0){const nv=avant.slice(iV+1).find(x=>x.k==='num');if(nv){L+=nv.v<10?nv.v/10:nv.v/100;reste=reste.filter(x=>x!==nv);}}
      else if(reste.length&&(iP>=0||fld==='L'||reste.length>=2)){L+=reste[0].v/100;reste=reste.slice(1);}
      D.L=L;let d=null;if(iP>=0){if(nAp.length)d=nAp[nAp.length-1].v;}else if(fld!=='L'&&reste.length)d=reste[reste.length-1].v;
      if(d!=null)D.d=d;}
    else if(D.d==null){D.d=nums[nums.length-1].v;}
    else{faits.push('billon complet : dites « billon suivant » (ou « diamètre … » pour corriger)');bipErr();seq=[];fld=null;return;}
    seq=[];fld=null;
    if(D.L!=null&&!(D.L>=0.5&&D.L<=40)){faits.push('longueur '+fmtL(D.L)+' m ?');D.L=null;bipErr();}
    if(D.d!=null&&!(D.d>=5&&D.d<=250)){faits.push('diamètre '+D.d+' ?');D.d=null;bipErr();}
    montrer();faits.push(etat());bipEss();};
  const enregistrer=()=>{ // « billon suivant » : enregistre le billon en cours
    if(D.L==null||D.d==null||!V.cur){faits.push('billon incomplet : '+(!V.cur?'essence ? ':'')+etat());bipErr();return false;}
    const r=h()&&h().onBillonSuivant&&h().onBillonSuivant(V.cur,V.curQ,Math.round(D.L*100)/100,Math.round(D.d),{rl:D.rl||0,rd:D.rd||0,note:D.note||''});
    if(!r){faits.push('billon refusé');bipErr();return false;}
    faits.push((r.label?r.label+' enregistré · ':'')+V.cur+' '+(V.curQ||'—')+' · '+etat());bipOk();vibrer(30);
    dire((V.curQ?(motsQ(V.curQ,h()&&h().motsQ)[0]||V.curQ)+', ':'')+longueurParlee(D.L)+', '+nombre(Math.round(D.d))+(D.rl>0||D.rd>0?', avec réduction':'')+(D.note?', commenté':''));
    D.L=r.L>0?r.L:null;D.d=null;D.rl=0;D.rd=0;D.note='';return true;};
  for(let i=0;i<els.length;i++){const e=els[i];
    if(e.k==='num'||e.k==='m'||e.k==='par'||e.k==='virg'||e.k==='demi'){
      if(attenteNum&&e.k==='num'){attenteNum=false;const ok=h()&&h().onNumero&&h().onNumero(e.v);faits.push(ok?'grume n° '+e.v:'numéro refusé');if(ok){bipEss();dire('grume '+nombre(e.v));}else bipErr();continue;}
      seq.push(e);continue;}
    if(e.k==='fld'){flush();fld=e.v;continue;}
    if(e.k==='com'){flush();
      // Un mot de commentaire n'est pris que s'il est précédé de « commentaire » dans la même phrase : sans cela, un mot
      // entendu par erreur (« courbé » pour « cé bé ») finirait dans le commentaire au lieu de la qualité
      const apresComm=els.slice(0,i).some(x=>x.k==='cmd'&&x.v==='comm');
      if(!apresComm){faits.push('« '+e.v+' » ignoré : dites « commentaire '+e.v+' » pour l’enregistrer en commentaire');bipErr();continue;}
      D.note=(D.note&&!D.note.split(' ').includes(e.v)?D.note+' ':'')+(D.note&&D.note.split(' ').includes(e.v)?'':e.v);montrer();faits.push('commentaire : '+D.note);bipEss();continue;}
    flush();
    if(e.k==='ess'){V.cur=e.v;if(h()&&h().onEssence)h().onEssence(e.v);faits.push(e.v);const suiv=els[i+1];if(!suiv||suiv.k==='unk'){bipEss();dire(motsDe(e.v,h()&&h().mots)[0]||e.v);}montrer();continue;}
    if(e.k==='q'){V.curQ=e.v;if(h()&&h().onQualite)h().onQualite(e.v);faits.push(e.v);const suiv=els[i+1];if(!suiv||suiv.k==='unk')bipEss();montrer();continue;}
    if(e.k==='cmd'){
      if(e.v==='numero'){attenteNum=true;continue;}
      if(e.v==='comm'){if(els.slice(i+1).some(x=>x.k==='com'))continue; // « commentaire gélivure » : les mots suivent // « commentaire gélivure » : le mot suit
        if(libreStart())faits.push('dictez le commentaire…');else{faits.push('commentaire libre indisponible');bipErr();}continue;}
      if(e.v==='billon'){enregistrer();continue;}
      if(e.v==='precedent'){ // rouvre le dernier billon enregistré pour le corriger (« note diamètre … », puis « suivant »)
        if(D.L!=null||D.d!=null||D.rl||D.rd||D.note){faits.push('billon en cours entamé : dites « annule » avant « précédent »');bipErr();continue;}
        const r=h()&&h().onPrecedent&&h().onPrecedent();if(!r){faits.push('rien à rouvrir');bipErr();continue;}
        if(r.ess)V.cur=r.ess;V.curQ=r.q||'';D.L=r.L>0?r.L:null;D.d=r.d>0?r.d:null;D.rl=r.rl||0;D.rd=r.rd||0;D.note=r.note||'';majBloc();faits.push(r.label+' rouvert · '+V.cur+' '+(V.curQ||'—')+' · '+etat());bipEss();vibrer([30,60,30]);dire('billon '+(r.grume?'de la grume '+nombre(Number(r.grume)||0)+' ':'')+'rouvert');continue;}
      if(e.v==='suivante'){if(D.L!=null||D.d!=null){if(!enregistrer())continue;}
        const r=h()&&h().onSuivante&&h().onSuivante();
        if(r){D.L=null;D.d=null;faits.push('→ grume '+r);bipEss();vibrer([30,60,30]);dire('grume '+nombre(Number(r)||0));}else{faits.push('grume non enregistrée');bipErr();}continue;}
      if(e.v==='annule'){ // « annule » / « annule billon » : billon en cours s'il est entamé, sinon dernier billon enregistré de cette grume
        if(D.L!=null||D.d!=null||D.rl||D.rd||D.note){D.L=null;D.d=null;D.rl=0;D.rd=0;D.note='';montrer();faits.push('billon en cours effacé');bipEss();continue;}const r=h()&&h().onAnnule&&h().onAnnule('billon');
        if(r){faits.push('annulé : '+r);bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler dans cette grume');bipErr();}continue;}
      if(e.v==='annuleC'){if(V.libre)libreStop();if(!D.note){faits.push('pas de commentaire');bipErr();continue;}D.note='';montrer();faits.push('commentaire effacé');bipEss();continue;}
      if(e.v==='annuleR'){if(!D.rl&&!D.rd){faits.push('pas de réduction');bipErr();continue;}D.rl=0;D.rd=0;montrer();faits.push('réduction effacée');bipEss();continue;}
      if(e.v==='annuleG'){ // « annule grume » : vide la grume en cours ; si elle est vide, rouvre la grume précédente
        D.L=null;D.d=null;D.rl=0;D.rd=0;D.note='';const r=h()&&h().onAnnule&&h().onAnnule('grume');
        if(r){faits.push(r);bipEss();vibrer([30,60,30]);dire(r);}else{faits.push('rien à annuler');bipErr();}continue;}}}
  flush();
  return faits;}

/* Pied à pied numéroté : l'arbre en cours (diamètre cm, hauteur m, tarif, tronçons de qualité) se dicte en une ou
   plusieurs fois — « chêne quarante par douze » (Ø 40, H 12), « hauteur quatorze virgule cinq », « tarif huit »,
   « tronçon six cé a » (6 m en CA, du bas vers le haut), « numéro cent douze » — puis « suivant » l'enregistre.
   « précédent » rouvre le dernier arbre enregistré ; « annule » efface l'arbre en cours ; « annule arbre » supprime le
   dernier enregistré ; « annule tronçon » retire le dernier tronçon. */
function traiterPieds(els){const faits=[];const h=()=>V.hook;const D=V.draft||(V.draft={d:null,h:null,tarif:null,tr:[]});D.tr=D.tr||[];
  let seq=[],fld=null,attenteNum=false,qTr=null,hTr=null;
  const etat=()=>'Ø '+(D.d!=null?D.d:'?')+' · H '+(D.h!=null?fmtL(D.h)+' m':'?')+(D.tarif?' · T'+D.tarif:'')+(D.tr.length?' · '+D.tr.map(t=>fmtL(t.h)+'m '+(t.q||'·')).join(' / '):'');
  let last='dh';const show=()=>{if(h()&&h().onDraft)h().onDraft(V.cur,{d:D.d,h:D.h,tarif:D.tarif,tr:D.tr,last});majBloc();};
  const dec=(arr)=>{ // nombre avec décimales (« douze virgule cinq », « douze et demi ») à partir d'une séquence
    const nums=arr.filter(x=>x.k==='num');if(!nums.length)return null;let val=nums[0].v;const iV=arr.findIndex(x=>x.k==='virg'),iD=arr.findIndex(x=>x.k==='demi');
    if(iD>=0)val+=.5;else if(iV>=0){const nv=arr.slice(iV+1).find(x=>x.k==='num');if(nv)val+=nv.v<10?nv.v/10:nv.v/100;}return val;};
  const trPush=()=>{if(hTr==null)return;if(!(hTr>0&&hTr<=60)){faits.push('tronçon '+hTr+' m ?');bipErr();}else{D.tr.push({h:hTr,q:qTr||''});faits.push('tronçon '+fmtL(hTr)+' m '+(qTr||'·'));bipEss();}hTr=null;qTr=null;last='tr';show();};
  const flush=()=>{if(!seq.length){return;}const nums=seq.filter(x=>x.k==='num');if(!nums.length){seq=[];return;}
    if(fld==='t'){const t=nums[nums.length-1].v;const ok=!!(h()&&h().onTarif&&h().onTarif(t));if(ok){D.tarif=t;faits.push('tarif '+t);bipEss();dire('tarif '+nombre(t));}else{faits.push('tarif '+t+' ? (1 à 20)');bipErr();}}
    else if(fld==='tr'){hTr=dec(seq);if(qTr!=null)trPush();}
    else if(fld==='h'){D.h=dec(seq);last='dh';}
    else if(fld==='d'){D.d=nums[nums.length-1].v;last='dh';}
    else{last='dh';const iP=seq.findIndex(x=>x.k==='par');
      if(iP>=0){const a=seq.slice(0,iP).filter(x=>x.k==='num'),b=seq.slice(iP+1);if(a.length)D.d=a[a.length-1].v;const hh=dec(b);if(hh!=null)D.h=hh;}
      else if(D.d==null){D.d=nums[0].v;if(nums.length>1||seq.some(x=>x.k==='virg'||x.k==='demi')){const hh=dec(seq.slice(seq.indexOf(nums[0])+1));if(hh!=null)D.h=hh;}}
      else if(D.h==null){D.h=dec(seq);}
      else{faits.push('arbre complet : dites « suivant » (ou « diamètre … », « hauteur … » pour corriger)');bipErr();seq=[];return;}}
    seq=[];
    if(D.d!=null&&!(D.d>=5&&D.d<=250)){faits.push('diamètre '+D.d+' ?');D.d=null;bipErr();}
    if(D.h!=null&&!(D.h>=1&&D.h<=60)){faits.push('hauteur '+D.h+' ?');D.h=null;bipErr();}
    if(fld!=='t'&&fld!=='tr'){show();faits.push(etat());bipEss();}else show();};
  const enregistrer=()=>{if(hTr!=null)trPush();if(D.d==null||D.h==null||!V.cur){faits.push('arbre incomplet : '+(!V.cur?'essence ? ':'')+etat());bipErr();return false;}
    const r=h()&&h().onSuivante&&h().onSuivante();if(!r){faits.push('arbre refusé (tronçons > hauteur ?)');bipErr();return false;}
    faits.push('arbre '+r.num+' enregistré · '+V.cur+' · '+etat()+' · '+r.vol+' m³ → n° '+r.next);bipOk();vibrer(30);
    dire('arbre '+nombre(Number(r.num)||0)+', '+nombre(Math.round(D.d))+', '+longueurParlee(D.h)+'. Suivant '+nombre(Number(r.next)||0));
    D.d=null;D.h=null;D.tr=[];D.tarif=r.tarif||D.tarif;return true;};
  for(let i=0;i<els.length;i++){const e=els[i];
    if(e.k==='num'||e.k==='m'||e.k==='par'||e.k==='virg'||e.k==='demi'){
      if(attenteNum&&e.k==='num'){attenteNum=false;const ok=h()&&h().onNumero&&h().onNumero(e.v);faits.push(ok?'arbre n° '+e.v:'numéro refusé');if(ok){bipEss();dire('arbre '+nombre(e.v));}else bipErr();continue;}
      seq.push(e);continue;}
    if(e.k==='fld'){flush();fld=e.v;if(fld!=='tr'){hTr=null;qTr=null;}continue;}
    flush();
    if(e.k==='q'){ // qualité = tronçon : « cé a six », « six cé a », ou « cé a » seul après un « tronçon six » dicté juste avant
      if(hTr!=null){qTr=e.v;trPush();continue;}
      const sansQ=D.tr.length&&!D.tr[D.tr.length-1].q?D.tr[D.tr.length-1]:null;
      if(sansQ&&!(els[i+1]&&els[i+1].k==='num')){sansQ.q=e.v;faits.push('tronçon '+fmtL(sansQ.h)+' m '+e.v);bipEss();last='tr';show();continue;}
      qTr=e.v;fld='tr';continue;}
    if(e.k==='ess'){V.cur=e.v;faits.push(e.v);const suiv=els[i+1];if(!suiv||suiv.k==='unk'){bipEss();dire(motsDe(e.v,h()&&h().mots)[0]||e.v);}show();fld=null;continue;}
    if(e.k==='cmd'){fld=null;
      if(e.v==='numero'){attenteNum=true;continue;}
      if(e.v==='suivante'||e.v==='billon'){enregistrer();continue;}
      if(e.v==='precedent'){if(D.d!=null||D.h!=null||D.tr.length){faits.push('arbre en cours entamé : dites « annule » avant « précédent »');bipErr();continue;}
        const r=h()&&h().onPrecedent&&h().onPrecedent();if(!r){faits.push('rien à rouvrir');bipErr();continue;}
        if(r.ess)V.cur=r.ess;D.d=r.d>0?r.d:null;D.h=r.h>0?r.h:null;D.tarif=r.tarif||null;D.tr=(r.tr||[]).map(t=>({h:t.h,q:t.q||''}));majBloc();faits.push('arbre '+r.num+' rouvert · '+etat());bipEss();vibrer([30,60,30]);dire('arbre '+nombre(Number(r.num)||0)+' rouvert');continue;}
      if(e.v==='annuleT'){if(hTr!=null){hTr=null;qTr=null;faits.push('tronçon abandonné');bipEss();continue;}if(!D.tr.length){faits.push('pas de tronçon');bipErr();continue;}D.tr.pop();show();faits.push('dernier tronçon retiré');bipEss();continue;}
      if(e.v==='annuleA'){const r=h()&&h().onAnnule&&h().onAnnule('arbre');if(r){D.d=null;D.h=null;D.tr=[];faits.push(r);bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler');bipErr();}continue;}
      if(e.v==='annule'){if(D.d!=null||D.h!=null||D.tr.length||hTr!=null){D.d=null;D.h=null;D.tr=[];hTr=null;qTr=null;show();faits.push('arbre en cours effacé');bipEss();continue;}
        const r=h()&&h().onAnnule&&h().onAnnule('arbre');if(r){faits.push(r);bipEss();vibrer([30,60,30]);dire('annulé');}else{faits.push('rien à annuler');bipErr();}continue;}}}
  flush();if(hTr!=null)trPush();if(hTr==null&&qTr!=null&&fld==='tr'){faits.push('tronçon '+qTr+' : hauteur ?');}
  return faits;}

/* ---------- Liaison avec l'écran de saisie ---------- */
function bind(h){const chg=V.hook&&V.hook.mode!==h.mode;V.hook=h;V.bound=true;if(h.cur)V.cur=h.cur;if(h.curQ!==undefined&&h.curQ!==null)V.curQ=h.curQ;if(chg){V.pend=null;V.draft=null;}
  if(V.model&&V.rec&&(V.etat==='ecoute'||V.etat==='pause'))creerReco();majBloc();}
function unbind(){V.bound=false;}
function apresRendu(){if(!V.bound&&(V.etat==='ecoute'||V.etat==='pause'||V.etat==='chargement')){arreter('');}if(!V.bound){V.hook=null;}}
function setEtat(e,msg){V.etat=e;V.msg=msg||'';majBloc();}

function majPartiel(){const el=$('#vocPart');if(el)el.textContent=V.partiel?'… '+V.partiel:'';}
function majBloc(){const el=$('#vocal');if(!el||!V.hook)return;const h=V.hook,e=V.etat,gr=h.mode==='grumes',pi=h.mode==='pieds';el.classList.toggle('sticky',e==='ecoute'||e==='pause');
  const nomsE=(h.essences||[]).map(c=>{const m=motsDe(c,h.mots);return m.length?`<b>${esc(m[0])}</b> <span class="muted">${esc(c)}</span>`:`<span class="muted">${esc(c)} (aucun mot)</span>`;}).join(' · ');
  const nomsQ=(gr||pi)?(h.qualites||[]).map(c=>{const m=motsQ(c,h.motsQ);return m.length?`<b>${esc(m[0])}</b> <span class="muted">${esc(c)}</span>`:`<span class="muted">${esc(c)} (aucun mot)</span>`;}).join(' · '):'';
  const curNom=V.cur?(motsDe(V.cur,h.mots)[0]||V.cur):'—';
  if(e==='off'||e==='erreur'){el.innerHTML=`<div class="voc"><button type="button" class="btn big block" id="vocBtn">🎤 Mode vocal</button>${e==='erreur'?`<div class="msg bad">${esc(V.msg)}</div>`:''}</div>`;}
  else if(e==='chargement'){el.innerHTML=`<div class="voc"><button type="button" class="btn big block" disabled>⏳ ${esc(V.msg||'Chargement…')}</button></div>`;}
  else{const w=motDepart(h),px=w?w+' ':'';const aide=pi?'Dites « '+px+'chêne quarante par douze » (Ø 40 cm, H 12 m), « '+px+'tarif huit », « '+px+'tronçon six cé a » (du bas vers le haut), puis « suivant » pour enregistrer · « précédent » rouvre le dernier arbre · « '+px+'numéro cent douze » · « '+px+'annule » (arbre en cours) · « '+px+'annule tronçon »':gr?'Dites « '+px+'chêne, cé a, dix par cinquante », puis « billon suivant » (ou « suivant ») pour enregistrer · « grume suivante » (ou « suivante », « arbre suivant ») · « précédent » rouvre le dernier billon pour le corriger · « '+px+'réduction longueur cinquante », « '+px+'réduction diamètre deux » · « '+px+'commentaire gélivure » ou « '+px+'commentaire » puis la phrase · « '+px+'annule » (billon) · « '+px+'annule commentaire » · « '+px+'annule réduction » · « '+px+'annule grume »':'Dites « '+px+'chêne quarante », puis « '+px+'trente-cinq »… « '+px+'tarif huit » change le tarif Chaudé de l’essence en cours · « '+px+'annule » retire la dernière tige'+(w?' · tout ce qui ne commence pas par « '+w+' » est ignoré':'');
    el.innerHTML=`<div class="voc on${e==='pause'?' paused':''}"><div class="voc-head"><span class="voc-dot"></span><span class="grow">${e==='pause'?'En pause · dites « reprise »':'À l’écoute'} · <b>${esc(curNom)}</b>${gr?` <b>${esc(V.curQ||'—')}</b>`:''}${gr&&h.num?` · grume ${esc(h.num)}`:''}${pi&&h.num?` · arbre n° ${esc(h.num)}${h.tarif?' · T'+esc(h.tarif):''}`:''}</span><button type="button" class="btn" id="vocPause">${e==='pause'?'Reprendre':'Pause'}</button><button type="button" class="btn danger" id="vocBtn">Arrêter</button></div>
    <div class="voc-last" id="vocLast">${esc(V.libre?'🎙 Dictez le commentaire (phrase libre)…':(pi&&V.draft&&(V.draft.d!=null||V.draft.h!=null||(V.draft.tr||[]).length))?'Arbre en cours : '+V.cur+' · Ø '+(V.draft.d!=null?V.draft.d:'?')+' · H '+(V.draft.h!=null?fmtL(V.draft.h)+' m':'?')+((V.draft.tr||[]).length?' · '+V.draft.tr.map(t=>fmtL(t.h)+'m '+(t.q||'·')).join(' / '):'')+' — dites « suivant » pour l’enregistrer':(gr&&V.draft&&(V.draft.L!=null||V.draft.d!=null))?'Billon en cours : '+V.cur+' '+(V.curQ||'—')+' · '+(V.draft.L!=null?fmtL(V.draft.L)+' m':'L ?')+' · Ø '+(V.draft.d!=null?V.draft.d:'?')+(V.draft.rl>0?' · L −'+V.draft.rl+' cm':'')+(V.draft.rd>0?' · Ø −'+V.draft.rd+' cm':'')+(V.draft.note?' · « '+V.draft.note+' »':'')+' — dites « billon suivant » pour l’enregistrer':(V.dernier||aide))}</div><div class="voc-part muted" id="vocPart"></div>
    <details class="voc-help muted"><summary>Mots reconnus</summary>${nomsE}${nomsQ?'<br>'+nomsQ:''}</details></div>`;
    $('#vocPause').onclick=()=>{V.pause=!V.pause;setEtat(V.pause?'pause':'ecoute','');};}
  const b=$('#vocBtn');if(b)b.onclick=basculer;}

window.CubageVoice={disponible,bind,unbind,apresRendu,basculer,arreter:()=>arreter(''),etat:()=>V.etat,nombre,motsDe,motsQ,epeler,_elements:elements,_traiter:traiter,_construire:construire,_V:V};
})();
