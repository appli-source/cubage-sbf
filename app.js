/* Cubage SBF — application terrain local-first
   Données : IndexedDB (lots, grilles, params). Calculs : calc.js. Exports : PDF (jsPDF) / Excel (SheetJS). */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const f3=v=>(v==null||isNaN(v))?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3});
const f2=v=>(v==null||isNaN(v))?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const f1=v=>(v==null||isNaN(v))?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
const today=()=>new Date().toISOString().slice(0,10);
const num=v=>{const x=parseFloat(String(v).replace(',','.'));return isNaN(x)?null:x;};

/* ---------- Stockage IndexedDB ---------- */
const DB=(()=>{
  let db=null, mem={lots:{},grilles:{},params:{}};
  function open(){return new Promise(res=>{try{const r=indexedDB.open('cubage-sbf',1);
    r.onupgradeneeded=e=>{const d=e.target.result;['lots','grilles','params'].forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'});});};
    r.onsuccess=e=>{db=e.target.result;res(true);};r.onerror=()=>res(false);}catch(e){res(false);}});}
  function tx(store,mode,fn){return new Promise((res,rej)=>{if(!db){res(fn(null));return;}const t=db.transaction(store,mode);const o=t.objectStore(store);const q=fn(o);if(q&&q.onsuccess!==undefined){q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}else{t.oncomplete=()=>res(q);t.onerror=()=>rej(t.error);}});}
  return{open,
    all:s=>db?tx(s,'readonly',o=>o.getAll()):Promise.resolve(Object.values(mem[s])),
    get:(s,id)=>db?tx(s,'readonly',o=>o.get(id)):Promise.resolve(mem[s][id]),
    put:(s,v)=>db?tx(s,'readwrite',o=>o.put(v)):(mem[s][v.id]=v,Promise.resolve()),
    del:(s,id)=>db?tx(s,'readwrite',o=>o.delete(id)):(delete mem[s][id],Promise.resolve())};
})();

/* ---------- État ---------- */
const DEF_PARAMS={id:'params',essences:['CH','PIN','DOU','PEU','HET','CHA','FR','EP'],qualites:['A','B','C','D'],
  step:5,stepParEssence:{},classMin:10,classMax:90,repriseQualite:true,saisieDiam:'classe',resteQualite:'BI',operateur:'',syncUrl:'',refLoaded:'',
  motsVocaux:'',motsVocauxQ:'',vocalAnnonce:true,vocalMot:'note',vocalStrict:true,essencesVocal:{},qualitesVocal:{}};
/* Mode vocal (voice.js) : noms parlés des essences et des qualités — mots saisis dans les Paramètres (« CH: chêne, chêne rouge ; PIN: pin »)
   prioritaires sur la colonne mots_vocaux des onglets ESSENCES / QUALITES du Sheet ; les codes courants ont des noms par défaut dans voice.js */
function motsVocauxDe(sheet,champ){const out={};for(const [k,v] of Object.entries(sheet||{}))out[String(k).toUpperCase()]=[].concat(v).join(', ');
  String(champ||'').split(/[;\n]/).forEach(x=>{const i=x.indexOf(':');if(i<0)return;const k=x.slice(0,i).trim().toUpperCase(),v=x.slice(i+1).trim();if(k&&v)out[k]=v;});return out;}
const motsVocaux=()=>motsVocauxDe(S.params.essencesVocal,S.params.motsVocaux);
const motsVocauxQ=()=>motsVocauxDe(S.params.qualitesVocal,S.params.motsVocauxQ);
const vocalDispo=()=>!!(window.CubageVoice&&window.CubageVoice.disponible());
const vocalActif=()=>!!(window.CubageVoice&&['ecoute','pause','chargement'].includes(window.CubageVoice.etat()));
/* En mode vocal, aucun champ ne prend le focus (le clavier cacherait l'écran) et l'écran suit la dictée */
function focusSaisie(sel){if(vocalActif()){const a=document.activeElement;if(a&&a.blur)a.blur();return;}setTimeout(()=>{const x=document.querySelector(sel);x&&x.focus();},0);}
function voirElement(sel){setTimeout(()=>{const a=document.activeElement;if(a&&a.blur&&a!==document.body)a.blur();const c=sel?document.querySelector(sel):null;if(c)c.scrollIntoView({block:'center',behavior:'smooth'});else window.scrollTo({top:0,behavior:'smooth'});},30);}
const resteQ=()=>S.params.resteQualite||'BI';
const sumTr=tr=>(tr||[]).reduce((s,t)=>s+(t.h>0?t.h:0),0);
const S={params:null,lots:[],grilles:[],screen:'home',lot:null,edit:null,form:{},hist:[]};

/* ---------- Modèle ---------- */
const stepFor=ess=>(S.params.stepParEssence&&S.params.stepParEssence[ess])||S.params.step||5;
const cls=(ess,d)=>Calc.classe(d,stepFor(ess));
/* Deux grilles par lot de cubage : la grille PROPRIÉTAIRE (prix d'achat, grilleId / grilleLocal) et la grille CLIENT (prix de vente,
   grilleCliId / grilleCliLocal). Un sous-lot peut porter sa propre grille client (grilleId / grilleLocal) qui l'emporte sur celle du lot.
   Un lot client (isClient) n'a qu'une grille, de vente, dans grilleId / grilleLocal. Chaque grille est soit une grille du catalogue, soit une copie locale modifiable. */
const catGrille=id=>id?(S.grilles.find(g=>g.id===id)||null):null;
function lotGrille(lot){return lot.grilleLocal||catGrille(lot.grilleId);}
function lotGrilleCli(lot){if(lot.isClient)return lotGrille(lot);return lot.grilleCliLocal||catGrille(lot.grilleCliId);}
function slGrille(lot,slId){const s=slId&&slId!==NONE&&(lot.sousLots||[]).find(x=>x.id===slId);return s?(s.grilleLocal||catGrille(s.grilleId)):null;}
/* Grille applicable à une ligne selon le rôle : 'prop' (défaut) = grille propriétaire du lot ; 'cli' = grille du sous-lot si définie, sinon grille client du lot */
function grilleFor(lot,slId,role){if(lot.isClient)return lotGrille(lot);return role==='cli'?(slGrille(lot,slId)||lotGrilleCli(lot)):lotGrille(lot);}
const hasGrille=(lot,role,sl)=>!!grilleFor(lot,sl,role);
function prix(grille,ess,q,d){const l=prixLine(grille,ess,q,d);return l?l.prix:null;}
function prixLine(grille,ess,q,d){if(!grille)return null;let best=null,bs=-1;for(const l of grille.lignes||[]){
  if(l.ess&&l.ess!==ess)continue;if(l.q&&l.q!==q)continue;if(l.dmin!=null&&d<l.dmin)continue;if(l.dmax!=null&&d>l.dmax)continue;
  const sc=(l.ess?4:0)+(l.q?2:0)+((l.dmin!=null||l.dmax!=null)?1:0);if(sc>bs&&l.prix!=null){bs=sc;best=l;}}return best;}
const trancheLab=l=>!l?'sans prix':(l.dmin!=null&&l.dmax!=null)?l.dmin+'–'+l.dmax+' cm':l.dmin!=null?l.dmin+' cm et +':l.dmax!=null?'jusqu’à '+l.dmax+' cm':'tous Ø';
const lenM=b=>b.lm!=null?b.lm:((b.l||0)/10);
/* Réductions (réfactions) : rl en cm sur la longueur, rd en cm sur le diamètre. Le cubage utilise les dimensions réduites, le listing garde les vraies. */
const redL=b=>(b.rl>0?b.rl:0)/100;const redD=b=>b.rd>0?b.rd:0;
const cubL=b=>Math.max(0,lenM(b)-redL(b));const cubD=b=>Math.max(0,(b.d||0)-redD(b));
const redTxt=b=>[b.rl>0?'L −'+f2(b.rl/100)+' m':'',b.rd>0?'Ø −'+b.rd+' cm':'',b.note?String(b.note).trim():''].filter(Boolean).join(' · ');
const volB=b=>Calc.volBillon(cubD(b),cubL(b));
const clampT=v=>Math.min(20,Math.max(1,Math.round(Number(v)||1)));
const tarifOf=(lot,a)=>clampT(a.tarif||lot.tarif||8);
const tarifDef=(lot,ess)=>clampT((lot.tarifEss&&lot.tarifEss[ess])||lot.tarif||8);
const circ=d=>Math.round(Math.PI*d);
const clsRange=(ess,c)=>{const s=stepFor(ess);return (c-Math.floor(s/2))+'–'+(c+Math.ceil(s/2)-1);};
function qualRecap(r){const m={};for(const x of r.rows){const k=x.ess+'|'+x.q;const t=m[k]||(m[k]={ess:x.ess,q:x.q,n:0,v:0,sd:0,sl:0,m:0,hasM:false});t.n+=x.n;t.v+=x.v;t.sd+=x.sd||0;t.sl+=x.sl||0;if(x.m!=null){t.m+=x.m;t.hasM=true;}}
  const list=Object.values(m).sort((a,b)=>a.ess.localeCompare(b.ess)||a.q.localeCompare(b.q));const out=[];
  const fin=(t,kind)=>({...t,kind,dm:t.n&&t.sd?t.sd/t.n:null,lm:t.n&&t.sl?t.sl/t.n:null,m:t.hasM?t.m:null,pm:t.hasM&&t.v?t.m/t.v:null});
  const sum=(arr,ess)=>arr.reduce((a,t)=>({ess,q:'',n:a.n+t.n,v:a.v+t.v,sd:a.sd+t.sd,sl:a.sl+t.sl,m:a.m+t.m,hasM:a.hasM||t.hasM}),{ess,q:'',n:0,v:0,sd:0,sl:0,m:0,hasM:false});
  for(const e of [...new Set(list.map(t=>t.ess))]){const sub=list.filter(t=>t.ess===e);out.push(...sub.map(t=>fin(t,'q')));if(sub.length>1)out.push(fin(sum(sub,e),'e'));}
  out.push(fin(sum(list,'Total'),'t'));return out;}
function classRecap(r){const out=[];const byE={};for(const c of r.classes){c.hm=c.nh?c.sh/c.nh:null;c.vt=c.nh?c.v/c.nh:null;(byE[c.ess]=byE[c.ess]||[]).push(c);}
  const agg=(list,ess)=>{const n=list.reduce((s,c)=>s+c.n,0),v=list.reduce((s,c)=>s+c.v,0),sh=list.reduce((s,c)=>s+c.sh,0),nh=list.reduce((s,c)=>s+c.nh,0),sans=list.reduce((s,c)=>s+c.sans,0);return{ess,n,v,sans,hm:nh?sh/nh:null,vt:nh?v/nh:null};};
  for(const e of Object.keys(byE)){out.push(...byE[e].map(c=>({...c,kind:'c'})));out.push({...agg(byE[e],e),kind:'e'});}
  out.push({...agg(r.classes,'Total'),kind:'t'});return out;}
function arbreCalc(lot,a){const k=a.ess+'|'+cls(a.ess,a.d);const ch=(lot.classH||{})[k]||{};
  const h=(a.h!=null&&a.h>0)?a.h:(ch.h||null);const tr=(a.tr&&a.tr.length)?a.tr:(ch.tr||[]);
  const n=a.n||1;if(!h)return{h:null,tr:[],v:null,tronc:[]};
  const T=tarifOf(lot,a);const v=Calc.volChaude(a.d,h,T,n);const tronc=Calc.volTroncons(a.d,h,T,n,tr).map(t=>({h:t.h,q:t.q||resteQ(),v:t.v}));return{h,tr,v,tronc};}
function lotTotals(lot){if(lot.type==='grumes'){let v=0,nb=0;for(const g of lot.grumes)for(const b of g.billons){v+=volB(b);nb++;}return{v,n:lot.grumes.length,nb};}
  let v=0,n=0,sans=0;for(const a of lot.arbres){const c=arbreCalc(lot,a);n+=a.n||1;if(c.v==null)sans+=a.n||1;else v+=c.v;}return{v,n,sans};}
function nextNum(lot){if(lot.type==='grumes'){const m=lot.grumes.reduce((x,g)=>Math.max(x,Number(g.num)||0),0);return m?m+1:(lot.numDepart||1);}
  return lot.arbres.reduce((x,a)=>Math.max(x,Number(a.num)||0),0)+1;}

/* ---------- Récapitulatifs ---------- */
function recap(lot,sl,role){role=role||'prop';const rows={},cl={},g=grilleFor(lot,(sl&&sl!==NONE)?sl:null,role);const add=(k,o,f)=>{const r=rows[k]||(rows[k]={ess:o.ess,q:o.q,c:o.c,n:0,v:0,sd:0,sl:0,mm:0,vp:0});f(r);};
  const pr={};const price=(r,slId,ess,q,d,v,n)=>{const G0=grilleFor(lot,slId,role),L=prixLine(G0,ess,q,d),p=L?L.prix:null;if(p!=null){r.mm+=p*v;r.vp+=v;}
    const k=ess+'|'+q+'|'+(G0?G0.id:'')+'|'+(L?G0.lignes.indexOf(L):'x');const t=pr[k]||(pr[k]={ess,q,gNom:G0?G0.nom:'',tr:trancheLab(L),dmin:L&&L.dmin!=null?L.dmin:-1,p,n:0,v:0,m:0});t.n+=n;t.v+=v;if(p!=null)t.m+=p*v;};
  if(lot.type==='grumes'){for(const gr of lot.grumes)for(const b of gr.billons){if(!slMatch(b.sl,sl))continue;const c=cls(gr.ess,cubD(b)),v=volB(b);
    add(gr.ess+'|'+(b.q||'')+'|'+c,{ess:gr.ess,q:b.q||'',c},r=>{r.n++;r.v+=v;r.sd+=cubD(b);r.sl+=cubL(b);price(r,b.sl,gr.ess,b.q||'',cubD(b),v,1);});}}
  else{for(const a of lot.arbres){if(!slMatch(a.sl,sl))continue;const c=cls(a.ess,a.d),k=a.ess+'|'+c,x=arbreCalc(lot,a);const t=cl[k]||(cl[k]={ess:a.ess,c,n:0,v:0,sans:0,sh:0,nh:0});t.n+=a.n||1;
    if(x.v==null){t.sans+=a.n||1;continue;}t.v+=x.v;t.sh+=x.h*(a.n||1);t.nh+=a.n||1;for(const tr of x.tronc)add(a.ess+'|'+tr.q+'|'+c,{ess:a.ess,q:tr.q,c},r=>{r.v+=tr.v;r.n+=a.n||1;price(r,a.sl,a.ess,tr.q,a.d,tr.v,a.n||1);});}}
  const list=Object.values(rows).sort((a,b)=>a.ess.localeCompare(b.ess)||a.q.localeCompare(b.q)||a.c-b.c);
  for(const r of list){r.m=r.vp>0?r.mm:null;r.p=r.vp>0?r.mm/r.vp:null;r.partial=r.vp>0&&r.vp<r.v-1e-9;r.dm=r.n?r.sd/r.n:null;r.lm=r.n?r.sl/r.n:null;}
  const tot={n:list.reduce((s,r)=>s+r.n,0),v:list.reduce((s,r)=>s+r.v,0),m:list.some(r=>r.m!=null)?list.reduce((s,r)=>s+(r.m||0),0):null};
  const prices=Object.values(pr).sort((a,b)=>a.ess.localeCompare(b.ess)||a.q.localeCompare(b.q)||a.gNom.localeCompare(b.gNom)||a.dmin-b.dmin);
  return{rows:list,tot,classes:Object.values(cl).sort((a,b)=>a.ess.localeCompare(b.ess)||a.c-b.c),grille:g,prices,role,priced:prices.some(x=>x.p!=null),byDiam:prices.some(x=>x.p!=null&&x.tr!=='tous Ø'&&x.tr!=='sans prix')};}
function priceRecap(r){const multiG=new Set(r.prices.filter(x=>x.gNom).map(x=>x.gNom)).size>1;const out=[];const byE={};
  for(const x of r.prices){(byE[x.ess]=byE[x.ess]||[]).push({...x,kind:'p',lab:(multiG&&x.gNom?x.gNom+' · ':'')+x.tr,m:x.p!=null?x.m:null});}
  const sum=(a,ess)=>({ess,kind:ess==='Total'?'t':'e',n:a.reduce((s,x)=>s+x.n,0),v:a.reduce((s,x)=>s+x.v,0),m:a.some(x=>x.m!=null)?a.reduce((s,x)=>s+(x.m||0),0):null});
  for(const e of Object.keys(byE)){out.push(...byE[e]);if(byE[e].length>1)out.push(sum(byE[e],e));}out.push(sum(r.prices.map(x=>({...x,m:x.p!=null?x.m:null})),'Total'));return out;}
function listing(lot,sl){const out=[];if(lot.type==='grumes'){for(const g of lot.grumes)for(const b of g.billons){if(!slMatch(b.sl,sl))continue;
    out.push({num:b.label||(g.num+'.'+b.rang),ess:g.ess,q:b.q||'',l:lenM(b),d:b.d,c:cls(g.ess,cubD(b)),v:volB(b),sl:slName(lot,b.sl),o:g.orig||'',red:redTxt(b)});}}
  else{for(const a of lot.arbres){if(!slMatch(a.sl,sl))continue;const x=arbreCalc(lot,a);
    out.push({num:(a.num||'')+(a.numOrig?' (ex '+a.numOrig+')':'')+(a.de?' ['+a.de+']':''),ess:a.ess,d:a.d,c:cls(a.ess,a.d),t:tarifOf(lot,a),n:a.n||1,h:x.h,tr:x.tronc.map(t=>t.h+'m '+(t.q||'·')).join(' / '),v:x.v,sl:slName(lot,a.sl)});}}return out;}
const uniqL=a=>[...new Set(a.filter(Boolean))];
const lotEss=(l,extra)=>uniqL([...((l&&l.essSel&&l.essSel.length)?l.essSel:S.params.essences),...(extra||[])]);
const lotQual=(l,extra)=>uniqL([...((l&&l.qualSel&&l.qualSel.length)?l.qualSel:S.params.qualites),...(extra||[])]);
const addBtn=(kind,i)=>`<button type="button" class="chip-add" data-addref="${kind}"${i!=null?` data-i="${i}"`:''} aria-label="Ajouter">+</button>`;
const multi=(name,all,sel)=>`<div class="chips" data-multi="${name}">${all.map(v=>`<button type="button" class="chip small${sel.includes(v)?' on':''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
const readMulti=name=>[...document.querySelectorAll(`[data-multi="${name}"] .chip.on`)].map(b=>b.dataset.v);
function bindMulti(){document.querySelectorAll('[data-multi]').forEach(c=>c.onclick=e=>{const b=e.target.closest('.chip');if(b)b.classList.toggle('on');});}
/* Ajout d'une essence ou d'une qualité au lot pendant la saisie */
function bindAddRef(l,onAdded){document.querySelectorAll('[data-addref]').forEach(btn=>btn.onclick=()=>{const kind=btn.dataset.addref,isE=kind==='ess';
  const cur=isE?lotEss(l):lotQual(l),all=isE?S.params.essences:S.params.qualites,rest=all.filter(v=>!cur.includes(v));
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>Ajouter ${isE?'une essence':'une qualité'} au lot</b>
   ${rest.length?`<div class="chips">${rest.map(v=>`<button type="button" class="chip" data-pick="${esc(v)}">${esc(v)}</button>`).join('')}</div>`:'<p class="muted" style="margin:0">Toutes celles du référentiel sont déjà dans le lot.</p>'}
   <div class="row"><input id="newRef" placeholder="Nouveau code (ex. ${isE?'AUL':'C+'})" style="flex:1" autocapitalize="characters"><button type="button" class="btn primary" id="okRef">Ajouter</button></div>
   <button type="button" class="btn" id="mClose">Fermer</button></div>`;
  document.body.appendChild(m);const close=()=>m.remove();m.addEventListener('click',e=>{if(e.target===m)close();});m.querySelector('#mClose').onclick=close;
  const add=v=>{v=String(v||'').trim().toUpperCase();if(!v)return;if(!all.includes(v)){all.push(v);saveParams();}
    const key=isE?'essSel':'qualSel';l[key]=uniqL([...(isE?lotEss(l):lotQual(l)),v]);save();close();onAdded&&onAdded(kind,v,btn.dataset.i);};
  m.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>add(b.dataset.pick));m.querySelector('#okRef').onclick=()=>add(m.querySelector('#newRef').value);});}
const isBureau=()=>!!(S.params&&S.params.syncKeyBureau);
const apiKey=()=>S.params.syncKeyBureau||S.params.syncKey||'';
const NONE='__none';
const slMatch=(x,sl)=>!sl||(sl===NONE?!x:x===sl);
const slChips=(l,cur)=>`<div class="chips" data-chips="sl"><button type="button" class="chip small${!cur?' on':''}" data-v="">Aucun</button>${l.sousLots.map(s=>`<button type="button" class="chip small${cur===s.id?' on':''}" data-v="${s.id}">${esc(s.nom)}</button>`).join('')}</div>`;
const slName=(lot,id)=>{if(id===NONE)return 'Non affecté';const s=(lot.sousLots||[]).find(x=>x.id===id);return s?s.nom:'';};

/* ---------- Persistance ---------- */
let saveT=null;
function save(lot){lot=lot||S.lot;if(!lot)return;if(lot.readonly){toast('Lot en lecture seule : modification ignorée');return;}lot.updated=new Date().toISOString();if(lot.sync==='done')lot.sync='pending';
  clearTimeout(saveT);saveT=setTimeout(()=>DB.put('lots',lot).catch(()=>toast('Erreur d’enregistrement local')),80);}
const saveParams=()=>DB.put('params',S.params);
const saveGrille=g=>DB.put('grilles',g);

/* ---------- UI helpers ---------- */
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200);}
const EDIT_SCREENS=['saisieG','saisieP','hauteurs','tarifs','sousLots','slAssign','lotGrille','lotRef','recoupe'];
function go(screen,o){if(EDIT_SCREENS.includes(screen)&&S.lot&&S.lot.readonly&&!(o&&o.force)){toast('Lot en lecture seule (envoyé à un collègue)');return;}S.screen=screen;Object.assign(S,o||{});render();window.scrollTo(0,0);}
function back(){const h=S.hist;if(h.length){go(h.pop());}else go('home');}
function chips(name,vals,cur,small){return `<div class="chips" data-chips="${name}">${vals.map(v=>`<button type="button" class="chip${small?' small':''}${v===cur?' on':''}" data-v="${esc(v)}">${esc(v||'—')}</button>`).join('')}</div>`;}
function chipVal(name){const b=document.querySelector(`[data-chips="${name}"] .chip.on`);return b?b.dataset.v:'';}
let chipCb=null;const onChip=cb=>{chipCb=cb;};
function bindChips(){document.querySelectorAll('[data-chips]').forEach(c=>c.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;c.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');if(chipCb)chipCb({target:c,detail:b.dataset.v});}));}
function head(title,sub,right){$('#top').innerHTML=`<button type="button" id="back" aria-label="Retour">‹ Retour</button><h1>${esc(title)}${sub?`<span class="sub">${esc(sub)}</span>`:''}</h1>${right||''}`;$('#back').onclick=back;if(S.screen==='home')$('#back').style.visibility='hidden';}
if(window.visualViewport){const fixFoot=()=>{const f=$('#foot');if(!f)return;const vv=window.visualViewport;const off=window.innerHeight-(vv.height+vv.offsetTop);f.style.transform=off>2?`translateY(-${off}px)`:'';};window.visualViewport.addEventListener('resize',fixFoot);window.visualViewport.addEventListener('scroll',fixFoot);}
function foot(html){const f=$('#foot');if(!html){f.hidden=true;f.innerHTML='';return;}f.hidden=false;f.innerHTML=`<div class="in">${html}</div>`;}
function trEditor(list,id,noBtn){const q=lotQual(S.lot,list.map(t=>t.q));return `<div class="stack" id="${id}"${noBtn?' data-nobtn="1"':''}>${list.map((t,i)=>`<div class="tr-row" data-i="${i}"><input type="number" inputmode="decimal" step="0.5" placeholder="m" value="${t.h??''}" data-f="h"><select data-f="q"><option value="">Qualité</option>${q.map(x=>`<option${x===t.q?' selected':''}>${esc(x)}</option>`).join('')}</select><button type="button" class="x" data-del="${i}">✕</button><span class="tvol" data-tv="${i}"></span></div>`).join('')}
  ${noBtn?'':`<button type="button" class="btn add" data-add-tr="${id}">+ Ajouter un tronçon</button>`}</div>`;}
function readTr(id){return [...document.querySelectorAll(`#${id} .tr-row`)].map(r=>({h:num(r.querySelector('[data-f=h]').value),q:r.querySelector('[data-f=q]').value})).filter(t=>t.h>0);}

/* ---------- Écrans ---------- */
const V={};
const MODS={grumes:{t:'Cubage bord de route',s:'Grumes et billons'},pied:{t:'Estimation sur pied',s:'Inventaire et barème Chaudé'}};
const syncLab=l=>l.sync==='done'?'sauvegardé le '+new Date(l.synced).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):l.sync==='pending'?'à sauvegarder':'non sauvegardé';
V.home=()=>{head('Cubage SBF',S.params.operateur?'Opérateur : '+S.params.operateur:'');
  const card=m=>{const ls=S.lots.filter(l=>l.type===m&&!l.archive&&!l.remote),todo=ls.filter(l=>l.sync!=='done'&&!l.test).length;return `<button class="tile" data-mod="${m}"><b>${MODS[m].t}</b><small>${MODS[m].s}</small><span class="tile-n">${ls.length} lot${ls.length>1?'s':''}${todo?` · <span class="pill warn">${todo} à sauvegarder</span>`:''}</span></button>`;};
  $('#main').innerHTML=`<div class="stack">${card('grumes')}${card('pied')}${isBureau()?'<button class="tile light" data-go="bureau"><b>Bureau</b><small>Stock de tous les téléphones, validation des ventes</small></button>':''}<button class="btn big block" data-go="params">⚙ Paramètres</button>
  <div class="row" style="gap:8px"><button class="btn big" id="hSync" style="flex:1">☁ Sauvegarder les lots${(()=>{const n=lotsToSync().length;return n?` <span class="pill warn">${n}</span>`:'';})()}</button><button class="btn big" id="hRef" style="flex:1">⟳ Mettre à jour depuis le Sheet</button></div>
  <small class="muted" style="text-align:center">Sauvegarder = envoyer vos lots sur le Sheet SBF · Mettre à jour = recevoir essences, qualités, grilles de prix et statuts des ventes</small>
  <small class="muted" style="text-align:center">Version ${(()=>{const m=/app\.js\?v=(\d+)/.exec([...document.scripts].map(x=>x.src).join(' '));return m?m[1]:'?';})()}</small></div>`;
  $('#main').querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>{S.mod=b.dataset.mod;S.hist=['home'];go('module');});$('#hSync').onclick=syncAllUI;$('#hRef').onclick=loadRefUI;foot('');};
V.module=()=>{const m=S.mod||'grumes';head(MODS[m].t);const ls=S.lots.filter(l=>l.type===m);const ng=S.grilles.filter(g=>g.type===m).length;
  $('#main').innerHTML=`<div class="stack"><button class="tile" data-go="newLot"><b>+ Ajouter un lot</b><small>${m==='grumes'?'Cubage de grumes bord de route':'Inventaire de bois sur pied'}</small></button>
  <button class="tile light" data-go="lots"><b>Liste des lots</b><small>${ls.length} lot${ls.length>1?'s':''} · recherche par chantier, commune, date</small></button>
  ${m==='grumes'?`<button class="tile light" data-go="clients"><b>Lots clients</b><small>${S.lots.filter(l=>l.type==='client').length} lot(s) client · vente de billons, recoupe</small></button>`:''}
  <button class="tile light" data-go="grilles"><b>Grilles de prix</b><small>${ng} grille${ng>1?'s':''} ${m==='grumes'?'grumes':'sur pied'}</small></button>
  <label class="tile light" for="impM" style="cursor:pointer"><b>Importer un lot reçu ou un inventaire</b><small>${m==='grumes'?'Lot .json d’un collègue, ou Excel / CSV d’un bûcheron (crée un nouveau lot)':'Fichier .json envoyé par un collègue (mail, WhatsApp, AirDrop…)'}</small></label><input id="impM" type="file" accept="${m==='grumes'?'.json,.xlsx,.xls,.csv,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel':'.json,application/json'}" hidden></div>`;
  $('#impM').onchange=e=>{const f=e.target.files[0];if(!f)return;if(/\.(xlsx|xls|csv)$/i.test(f.name)){const targets=S.lots.filter(l=>l.type==='grumes'&&!l.readonly&&!l.remote&&!l.archive).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
      const mo=document.createElement('div');mo.className='modal';mo.innerHTML=`<div class="modal-box"><b>Inventaire : ${esc(f.name)}</b><p class="muted" style="margin:0">Importer les grumes dans un nouveau lot (fiche à créer : n° Xylolink, essences, qualités) ou dans un lot existant ?</p><div class="stack"><button type="button" class="btn primary big" data-ch="new">Nouveau lot</button>${targets.slice(0,8).map(t=>`<button type="button" class="btn big" data-ch="${t.id}">Dans « ${esc(t.chantier||'Sans nom')} »${t.xylo?' · '+esc(t.xylo):''}</button>`).join('')}<button type="button" class="btn" data-ch="x">Annuler</button></div></div>`;document.body.appendChild(mo);
      mo.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>{mo.remove();const ch=b.dataset.ch;if(ch==='x')return;if(ch==='new'){S.pendingInv=f;S.hist.push('module');go('newLot');return;}const t=S.lots.find(l=>l.id===ch);S.lot=t;S.hist.push('module');go('lot');importInventory(f,t);});}
    else importLotFile(f);e.target.value='';};foot('');};
V.lots=()=>{const m=S.mod||'grumes';head('Lots · '+MODS[m].t);const qy=S.lotSearch||'';
  $('#main').innerHTML=`<input id="lsq" type="search" placeholder="Rechercher : n° Xylolink, chantier, commune, dépt, date…" value="${esc(qy)}" style="margin-bottom:10px"><div class="list" id="lsl"></div>`;
  const draw=()=>{const words=($('#lsq').value||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/\s+/).filter(Boolean);
    const nArch=S.lots.filter(l=>l.type===m&&l.archive).length;
    const ls=S.lots.filter(l=>l.type===m&&!l.remote&&(S.showArch?l.archive:!l.archive)).filter(l=>{const hay=[l.xylo,l.chantier,l.commune,l.dept,l.date,l.date&&l.date.split('-').reverse().join('/'),l.operateur,...(l.sousLots||[]).map(x=>x.nom)].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');return words.every(w=>hay.includes(w));})
      .sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
    $('#lsl').innerHTML=(nArch||S.showArch?`<button type="button" class="btn block" id="tgArch" style="margin-bottom:8px">${S.showArch?'‹ Retour aux lots en cours':'Voir les lots archivés ('+nArch+')'}</button>`:'')+(ls.length?ls.map(l=>{const t=lotTotals(l);return `<button class="item" data-open="${l.id}"><div class="t"><b>${l.test?'<span class="pill warn">ESSAI</span> ':''}${l.xylo?esc(l.xylo)+' · ':''}${esc(l.chantier||'Sans nom')}</b><small>${esc(l.date.split('-').reverse().join('/'))}${l.commune?' · '+esc(l.commune)+(l.dept?' ('+esc(l.dept)+')':''):''} · ${m==='grumes'?t.n+' grumes':t.n+' tiges'} · ${l.test?'lot d’essai':syncLab(l)}</small></div><div class="v">${f3(t.v)} m³</div></button>`;}).join(''):`<p class="muted">${words.length?'Aucun lot ne correspond.':S.showArch?'Aucun lot archivé.':'Aucun lot en cours. Créez le premier.'}</p>`);
    if($('#tgArch'))$('#tgArch').onclick=()=>{S.showArch=!S.showArch;draw();};
    $('#lsl').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{S.lot=S.lots.find(l=>l.id===b.dataset.open);S.slFilter='';S.hist.push('lots');go('lot');});};
  $('#lsq').oninput=()=>{S.lotSearch=$('#lsq').value;draw();};draw();foot('');};

/* Position GPS du téléphone (fonctionne hors réseau, GPS activé) */
function captureGps(cb){if(!navigator.geolocation){toast('GPS indisponible sur cet appareil');return;}toast('Recherche de la position…');
  navigator.geolocation.getCurrentPosition(p=>cb({lat:Math.round(p.coords.latitude*1e6)/1e6,lon:Math.round(p.coords.longitude*1e6)/1e6,acc:Math.round(p.coords.accuracy),at:new Date().toISOString()}),
    e=>toast(e.code===1?'Accès à la position refusé : autorisez-le dans les réglages du téléphone':'Position introuvable : réessayez à découvert'),{enableHighAccuracy:true,timeout:30000,maximumAge:0});}
const gpsTxt=g=>g?`${Number(g.lat).toFixed(6)}, ${Number(g.lon).toFixed(6)} ${g.acc!=null&&g.acc!==''?'(± '+g.acc+' m)':'(placé sur la carte)'}`:'';
const gpsUrl=g=>g?`https://www.google.com/maps?q=${Number(g.lat).toFixed(6)},${Number(g.lon).toFixed(6)}`:'';
const gpsBlock=g=>`<div class="stack"><span class="l-sec">Point GPS</span><span id="gpsTxt">${g?esc(gpsTxt(g)):'<span class="muted">Non relevé</span>'}</span><div class="row"><button type="button" class="btn grow" id="gpsBtn">${g?'📍 Relever à nouveau':'📍 Relever la position'}</button><button type="button" class="btn grow" id="gpsMap">🗺 ${g?'Corriger sur la carte':'Placer sur la carte'}</button></div>${g?`<a href="${gpsUrl(g)}" target="_blank" rel="noopener" class="muted">Ouvrir dans Google Maps</a>`:''}</div>`;
/* Point GPS choisi ou corrigé sur une carte (Leaflet + fond OpenStreetMap : le réseau est nécessaire pour les tuiles, pas pour le reste) */
function pickGpsOnMap(cur,cb){if(!window.L){toast('Fond de carte non chargé : ouvrez l’application une fois en ligne');return;}
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box map-box"><b>Point GPS du lot</b><span class="muted">Touchez la carte pour poser le repère, ou déplacez-le. Vous pouvez aussi saisir les coordonnées.</span><div id="mapPick"></div>
   <div class="row"><label class="f"><span class="l">Latitude</span><input id="mLat" inputmode="decimal" value="${cur?cur.lat:''}"></label><label class="f"><span class="l">Longitude</span><input id="mLon" inputmode="decimal" value="${cur?cur.lon:''}"></label></div>
   <div class="row"><button type="button" class="btn" id="mMe">Ma position</button><button type="button" class="btn grow" id="mNo">Annuler</button><button type="button" class="btn primary grow" id="mOk" ${cur?'':'disabled'}>Valider</button></div></div>`;
  document.body.appendChild(m);const close=()=>{try{map.remove();}catch(e){}m.remove();};
  const last=S.params.lastGps;const c0=cur||last||{lat:47.75,lon:0.15};const map=L.map('mapPick',{zoomControl:true}).setView([c0.lat,c0.lon],cur?15:last?12:9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  let pt=cur?{lat:Number(cur.lat),lon:Number(cur.lon)}:null;const mk=L.circleMarker(pt?[pt.lat,pt.lon]:[c0.lat,c0.lon],{radius:9,color:'#fff',weight:2,fillColor:'#c0392b',fillOpacity:pt?1:0}).addTo(map);
  const setPt=(lat,lon,pan)=>{pt={lat:Math.round(lat*1e6)/1e6,lon:Math.round(lon*1e6)/1e6};mk.setLatLng([pt.lat,pt.lon]);mk.setStyle({fillOpacity:1});m.querySelector('#mLat').value=pt.lat;m.querySelector('#mLon').value=pt.lon;m.querySelector('#mOk').disabled=false;if(pan)map.setView([pt.lat,pt.lon],Math.max(map.getZoom(),15));};
  map.on('click',e=>setPt(e.latlng.lat,e.latlng.lng));
  const fromInputs=()=>{const a=num(m.querySelector('#mLat').value),b=num(m.querySelector('#mLon').value);if(a!=null&&b!=null&&Math.abs(a)<=90&&Math.abs(b)<=180)setPt(a,b,true);};m.querySelector('#mLat').onchange=m.querySelector('#mLon').onchange=fromInputs;
  m.querySelector('#mMe').onclick=()=>captureGps(g=>setPt(g.lat,g.lon,true));m.querySelector('#mNo').onclick=close;
  m.querySelector('#mOk').onclick=()=>{if(!pt)return;const g={lat:pt.lat,lon:pt.lon,acc:null,at:new Date().toISOString(),manuel:true};S.params.lastGps={lat:g.lat,lon:g.lon};saveParams();close();cb(g);};
  setTimeout(()=>map.invalidateSize(),50);}
/* Branche les deux boutons du bloc GPS ; sur un lot du technicien consulté au bureau, le point est aussi écrit sur le Sheet (action setLotGps du script) */
function bindGps(getCur,setCur){const after=g=>{setCur(g);};$('#gpsBtn').onclick=()=>captureGps(after);$('#gpsMap').onclick=()=>pickGpsOnMap(getCur(),after);}
async function pushLotGps(l){if(!S.params.syncUrl||!isBureau()){toast('Point enregistré sur ce poste uniquement');return;}try{const j=await keysApi({action:'setLotGps',lot_id:l.id,gps:l.gps});if(!j.ok)throw new Error(j.error||'refusé');toast('Point GPS enregistré sur le Sheet');}catch(e){toast('Point gardé ici, mais non écrit sur le Sheet : '+(e.message.includes('inconnue')?'script du Sheet à mettre à jour (version 3.0)':e.message));}}

V.newLot=()=>{const m0=S.mod||'grumes';head('Nouveau lot',MODS[m0].t);const p=S.params;S.newGps=S.newGps||null;const prevLot=type=>[...S.lots].filter(x=>x.type===type).sort((a,b)=>(b.created||'').localeCompare(a.created||''))[0];const pl=prevLot(m0)||prevLot(m0==='grumes'?'pied':'grumes');
  $('#main').innerHTML=`<div class="stack card">
  ${m0==='grumes'?'<label class="f"><span class="l">N° chantier Xylolink *</span><input id="xylo" placeholder="Obligatoire" autocapitalize="characters"></label>':''}
  <label class="f"><span class="l">Chantier</span><input id="chantier" placeholder="Nom du chantier" value="${esc(S.pendingInv?S.pendingInv.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '):'')}"></label>
  ${m0==='grumes'?'<label class="f"><span class="l">Propriétaire (nom, pour le bordereau)</span><input id="proprio" placeholder="ex. GFA des Chênes"></label>':''}
  <div class="row"><label class="f" style="flex:2"><span class="l">Commune (option)</span><input id="commune" placeholder="Commune"></label><label class="f" style="flex:1"><span class="l">Dépt</span><input id="dept" inputmode="numeric" maxlength="3" placeholder="72"></label></div>
  ${gpsBlock(S.newGps)}
  <div class="row"><label class="f"><span class="l">Date</span><input id="date" type="date" value="${today()}"></label><label class="f"><span class="l">Opérateur</span><input id="op" value="${esc(p.operateur)}"></label></div>
  <div id="optG"${m0==='pied'?' hidden':''}><label class="f"><span class="l">Premier n° de grume</span><input id="numDepart" type="number" inputmode="numeric" value="1"></label></div>
  <div id="optP"${m0==='grumes'?' hidden':''} class="stack"><label class="f"><span class="l">Tarif Chaudé par défaut (1 à 20)</span><input id="tarif" type="number" inputmode="numeric" min="1" max="20" value="8"></label>
   <label class="f"><span class="l">Mode d’inventaire</span><select id="mode"><option value="diam">Pied à pied, diamètre seul (hauteurs par classe ensuite)</option><option value="classes">Par classes avec effectifs</option><option value="pieds">Pied à pied numéroté (diamètre + hauteur)</option></select></label></div>
  <div class="stack"><span class="l-sec">Essences du lot</span>${multi('essSel',p.essences,[])}</div>
  <div class="stack"><span class="l-sec">Qualités du lot</span>${multi('qualSel',p.qualites,[])}</div>
  <p class="muted" style="margin:0">Cochez les essences et qualités du lot : seules celles-ci apparaîtront à la saisie. Le bouton + permet d’en ajouter en cours de route.</p>
  <label class="f"><span class="l">${m0==='grumes'?'Grille de prix propriétaire (achat)':'Grille de prix'}</span><select id="grille"><option value="">Aucune</option>${S.grilles.filter(g=>g.type===m0).map(g=>`<option value="${g.id}">${esc(g.nom)}</option>`).join('')}</select></label>
  ${m0==='grumes'?`<label class="f"><span class="l">Grille de prix client (vente)</span><select id="grilleCli"><option value="">Aucune</option>${S.grilles.filter(g=>g.type===m0).map(g=>`<option value="${g.id}">${esc(g.nom)}</option>`).join('')}</select></label><p class="muted" style="margin:0">Les deux grilles peuvent être changées ou copiées dans le lot pour y être modifiées (bouton « Grilles » du lot).</p>`:''}
  <label class="row" style="gap:10px"><input id="essai" type="checkbox" style="width:24px;height:24px"><span>Lot d’essai / formation — jamais envoyé sur le Sheet, à supprimer quand on n’en a plus besoin</span></label>
  </div>`;
  bindMulti();
  bindGps(()=>S.newGps,g=>{S.newGps=g;$('#gpsTxt').textContent=gpsTxt(g);$('#gpsBtn').textContent='📍 Relever à nouveau';$('#gpsMap').textContent='🗺 Corriger sur la carte';toast('Point GPS enregistré');});
  foot(`<button class="btn primary big" id="create">Créer le lot</button>`);
  $('#create').onclick=()=>{const type=m0;const xylo=$('#xylo')?$('#xylo').value.trim():'';const test=$('#essai').checked;if(type==='grumes'&&!xylo&&!test){toast('Le n° de chantier Xylolink est obligatoire');$('#xylo').focus();return;}const lot={id:uid(),type,xylo,test,chantier:$('#chantier').value.trim(),proprietaire:$('#proprio')?$('#proprio').value.trim():'',commune:$('#commune').value.trim(),dept:$('#dept').value.trim(),gps:S.newGps||null,date:$('#date').value,operateur:$('#op').value.trim(),
    numDepart:Number($('#numDepart').value)||1,tarif:Math.min(20,Math.max(1,Number($('#tarif').value)||8)),mode:$('#mode').value,grilleId:$('#grille').value||null,grilleLocal:null,grilleCliId:$('#grilleCli')?$('#grilleCli').value||null:null,grilleCliLocal:null,
    sousLots:[],grumes:[],arbres:[],classH:{},essSel:readMulti('essSel'),qualSel:readMulti('qualSel'),sync:'new',created:new Date().toISOString()};
    if(!lot.essSel.length){toast('Cochez au moins une essence');return;}if(!lot.qualSel.length){toast('Cochez au moins une qualité');return;}
    if($('#op').value.trim()){S.params.operateur=$('#op').value.trim();saveParams();}
    S.newGps=null;S.lots.push(lot);S.lot=lot;save(lot);S.hist=['home','module','lots'];go('lot');if(S.pendingInv){const f=S.pendingInv;S.pendingInv=null;importInventory(f,lot);}};};

V.lot=()=>{const l=S.lot,t=lotTotals(l);head((l.test?'ESSAI · ':'')+(l.chantier||'Lot'),(l.archive?'Archivé · ':'')+(l.type==='grumes'?'Grumes'+(l.xylo?' · Xylolink '+l.xylo:l.test?'':' · n° Xylolink manquant'):'Sur pied')+' · '+l.date);
  const g=lotGrille(l);
  $('#main').innerHTML=`<div class="kpi"><div><b>${f3(t.v)}</b><small>m³</small></div><div><b>${t.n}</b><small>${l.type==='grumes'?'grumes':'tiges'}</small></div>${l.type==='grumes'?`<div><b>${t.nb}</b><small>billons</small></div>`:`<div><b>${t.sans||0}</b><small>sans hauteur</small></div>`}</div>
  <div class="stack" style="margin-top:12px">
  ${l.remote?`<div class="msg warn">Lot du technicien ${esc(l.operateur||'?')} · copie du Sheet en lecture seule (listing, récap et exports possibles).</div>`:l.readonly?`<div class="msg warn">Lot envoyé à un collègue le ${esc(new Date(l.sentAt||l.updated).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))} · lecture seule sur ce téléphone (consultation et exports possibles).<br><button type="button" class="btn" id="takeBack" style="margin-top:8px">Reprendre la main sur ce lot</button></div>`:`<button class="btn primary big block" data-go="${l.type==='grumes'?'saisieG':'saisieP'}">Saisir</button>`}
  ${l.type==='pied'?'<div class="row"><button class="btn big grow" data-go="hauteurs">Hauteurs par classe</button><button class="btn big grow" data-go="tarifs">Tarifs Chaudé</button></div>':''}
  <div class="row"><button class="btn big grow" data-go="listing">Listing</button><button class="btn big grow" data-go="recap">Récapitulatif</button></div>
  <button class="btn block" data-go="lotRef">Essences (${lotEss(l).length}) et qualités (${lotQual(l).length})</button>
  <div class="row"><button class="btn grow" data-go="sousLots">Sous-lots (${(l.sousLots||[]).length})</button><button class="btn grow" data-go="lotGrille">${l.type==='grumes'?`Grilles · propriétaire : ${esc(g?g.nom:'aucune')} · client : ${esc((gc=>gc?gc.nom:'aucune')(lotGrilleCli(l)))}`:`Grille : ${esc(g?g.nom:'aucune')}`}</button></div>
  <h2>Sorties</h2>
  ${l.type==='grumes'&&!l.isClient?`<div class="row"><button class="btn big grow" id="bProp">Bordereau propriétaire</button><button class="btn big grow" id="bCli">Bordereau client</button></div>`:''}
  <div class="row"><button class="btn grow" id="pdf">PDF interne</button><button class="btn grow" id="xlsx">Excel</button><button class="btn grow" id="json">Envoyer à un collègue</button></div>
  ${l.type==='grumes'&&!l.readonly?`<label class="btn block" for="impInv" style="cursor:pointer">Importer un inventaire (Excel / CSV d’un bûcheron)</label><input id="impInv" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden>`:''}
  ${l.test?'<span class="pill warn">Lot d’essai : jamais envoyé sur le Sheet SBF</span>':l.remote?'':l.readonly?'<span class="pill warn">Lecture seule : la sauvegarde sur le Sheet revient au collègue qui a reçu le lot</span>':`<button class="btn block ${l.sync==='done'?'':'primary'}" id="sync">${l.sync==='done'?'Sauvegardé sur le Sheet · renvoyer':'Sauvegarder sur le Sheet SBF'}</button>${l.synced?`<span class="muted">Dernière sauvegarde : ${esc(new Date(l.synced).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))}${l.sync!=='done'?' · modifié depuis':''}</span>`:''}`}
  ${(l.type==='grumes'&&!l.isClient)?(()=>{const st=lotStatus(l);const its=Object.values(st);const cut=its.filter(x=>x.cut),sold=its.filter(x=>x.client&&!x.cut),free=its.filter(x=>!x.cut&&!x.client);if(!cut.length&&!sold.length)return'';
    const sum=a=>a.reduce((s,x)=>s+x.v,0);const byC={};for(const x of sold){const k=x.client.client;byC[k]=byC[k]||{n:0,v:0};byC[k].n++;byC[k].v+=x.v;}
    return `<h2>Stock et ventes</h2><div class="card stack"><div class="kpi"><div><b>${free.length}</b><small>en stock · ${f3(sum(free))} m³</small></div><div><b>${sold.length}</b><small>vendus · ${f3(sum(sold))} m³</small></div><div><b>${cut.length}</b><small>recoupés</small></div></div>
    ${Object.keys(byC).length?`<div class="muted">${Object.entries(byC).map(([k,v])=>`${esc(k)} : ${v.n} billon(s) · ${f3(v.v)} m³`).join(' · ')}</div>`:''}
    ${cut.length?`<div class="muted">Recoupes : ${(l.recoupes||[]).map(r=>esc(r.parentNum)+' → '+r.pieces.map(p=>esc(p.num)+' ('+f2(p.lm)+' m)').join(' + ')).join(' ; ')}</div>`:''}
    <span class="muted">Le détail est dans le listing (colonne Statut). Les billons vendus ou recoupés ne peuvent plus être supprimés.</span></div>`;})():''}
  <h2>Lot</h2>
  <div class="card stack">${l.type==='grumes'?`<label class="f"><span class="l">N° chantier Xylolink *</span><input id="xylo" value="${esc(l.xylo||'')}" autocapitalize="characters"${l.xylo?'':' style="border-color:var(--bad)"'}></label>`:''}<div class="row"><label class="f"><span class="l">Chantier</span><input id="chantier" value="${esc(l.chantier||'')}"></label><label class="f"><span class="l">Date</span><input id="date" type="date" value="${esc(l.date)}"></label></div>
  ${l.type==='grumes'?`<label class="f"><span class="l">Propriétaire (nom, pour le bordereau)</span><input id="proprio" value="${esc(l.proprietaire||'')}"></label>`:''}
  <div class="row"><label class="f" style="flex:2"><span class="l">Commune</span><input id="commune" value="${esc(l.commune||'')}"></label><label class="f" style="flex:1"><span class="l">Dépt</span><input id="dept" inputmode="numeric" maxlength="3" value="${esc(l.dept||'')}"></label></div>
  ${gpsBlock(l.gps)}
  <div class="row"><label class="f"><span class="l">Opérateur</span><input id="op" value="${esc(l.operateur||'')}"></label>${l.type==='pied'?`<label class="f"><span class="l">Tarif par défaut</span><input id="tarif" type="number" inputmode="numeric" min="1" max="20" value="${l.tarif}"></label>`:''}</div>
  ${l.type==='grumes'?`<label class="f"><span class="l">Longueur des billons</span><select id="lgFixe"><option value="0"${l.lgFixe?'':' selected'}>Saisie à chaque billon</option><option value="1"${l.lgFixe?' selected':''}>Fixe : reprend la dernière longueur enregistrée (billons de même longueur)</option></select></label>`:''}
  ${l.type==='pied'?`<label class="f"><span class="l">Mode d’inventaire</span><select id="mode"><option value="diam"${l.mode==='diam'?' selected':''}>Diamètre seul</option><option value="classes"${l.mode==='classes'?' selected':''}>Classes avec effectifs</option><option value="pieds"${l.mode==='pieds'?' selected':''}>Pied à pied numéroté</option></select></label>`:''}
  <div class="row"><button class="btn grow" id="arch"${(!l.archive&&!l.test&&l.sync!=='done')?' disabled':''}>${l.archive?'Désarchiver (remettre en cours)':'Archiver ce lot'}</button><button class="btn danger grow" id="delLot">Supprimer ce lot</button></div>
  ${(!l.archive&&!l.test&&l.sync!=='done')?'<span class="muted">Archivage possible une fois le lot sauvegardé sur le Sheet. Un lot archivé reste sur le téléphone (liste « lots archivés ») mais n’encombre plus la liste.</span>':''}</div></div>`;
  $('#chantier').oninput=e=>{l.chantier=e.target.value;save();};if($('#proprio'))$('#proprio').oninput=e=>{l.proprietaire=e.target.value;save();};$('#date').onchange=e=>{l.date=e.target.value;save();};$('#op').oninput=e=>{l.operateur=e.target.value;save();};$('#commune').oninput=e=>{l.commune=e.target.value;save();};if($('#xylo'))$('#xylo').oninput=e=>{l.xylo=e.target.value.trim();e.target.style.borderColor=l.xylo?'':'var(--bad)';save();};$('#dept').oninput=e=>{l.dept=e.target.value;save();};
  bindGps(()=>l.gps,g=>{if(l.readonly&&!l.remote){toast('Lot en lecture seule');return;}l.gps=g;if(l.remote){l.updated=new Date().toISOString();DB.put('lots',l);pushLotGps(l);}else{save();toast('Point GPS enregistré');}render();});
  if($('#tarif'))$('#tarif').onchange=e=>{l.tarif=Math.min(20,Math.max(1,Number(e.target.value)||1));e.target.value=l.tarif;save();render();};
  if($('#mode'))$('#mode').onchange=e=>{l.mode=e.target.value;save();};
  if($('#lgFixe'))$('#lgFixe').onchange=e=>{l.lgFixe=e.target.value==='1';save();toast(l.lgFixe?'Longueur fixe : la dernière longueur sera reprise à chaque billon':'Longueur saisie à chaque billon');};
  if($('#impInv'))$('#impInv').onchange=e=>{const f=e.target.files[0];if(f)importInventory(f,l);e.target.value='';};
  if($('#bProp'))$('#bProp').onclick=()=>{if(!l.grumes.length){toast('Aucun billon dans ce lot');return;}CubageDocs.bordereauAsk('Bordereau de cubage propriétaire','Document destiné au propriétaire : récapitulatif par essence et qualité, listing des billons, prix HT de la grille propriétaire si demandé.',!!lotGrille(l),w=>CubageDocs.bordereauProprietaire(l,w));};
  if($('#bCli'))$('#bCli').onclick=()=>bordereauCliAsk(l);
  $('#pdf').onclick=()=>exportAsk(l,'pdf');$('#xlsx').onclick=()=>exportAsk(l,'xlsx');$('#json').onclick=()=>shareFile(lotFile(l),fname(l,'json'),false,()=>{if(l.readonly)return;const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>Lot envoyé à un collègue</b><p class="muted" style="margin:0">Pour éviter que deux téléphones modifient le même lot (le dernier sauvegardé écrase l’autre), votre copie peut passer en lecture seule et être archivée. Vous pourrez « reprendre la main » plus tard si besoin.</p><div class="stack"><button type="button" class="btn primary big" id="aYes">Archiver ma copie (recommandé)</button><button type="button" class="btn" id="aNo">Garder ma copie modifiable</button></div></div>`;document.body.appendChild(m);
    m.querySelector('#aYes').onclick=()=>{l.readonly=true;l.sentAt=new Date().toISOString();l.archive=true;DB.put('lots',l);m.remove();toast('Copie archivée (lecture seule)');back();};m.querySelector('#aNo').onclick=()=>m.remove();});
  if($('#sync'))$('#sync').onclick=()=>syncLot(l);
  $('#arch').onclick=()=>{l.archive=!l.archive;DB.put('lots',l);toast(l.archive?'Lot archivé':'Lot remis en cours');back();};
  if($('#takeBack'))$('#takeBack').onclick=e=>{if(!e.target.dataset.c){e.target.textContent='Confirmer : ce téléphone redevient responsable du lot';e.target.dataset.c='1';return;}l.readonly=false;l.archive=false;delete l.sentAt;l.sync='pending';DB.put('lots',l);toast('Vous avez repris la main');render();};
  if(l.readonly)$('#main').querySelectorAll('input,select').forEach(i=>i.disabled=true);
  $('#delLot').onclick=e=>{if(e.target.dataset.c){S.lots=S.lots.filter(x=>x!==l);DB.del('lots',l.id);S.lot=null;go('home');}else{e.target.textContent='Confirmer la suppression définitive';e.target.dataset.c='1';}};
  foot('');};

/* --- Saisie grumes --- */
V.saisieG=()=>{const l=S.lot,p=S.params;const ed=S.edit;let g;
  if(ed){g=l.grumes.find(x=>x.id===ed);}
  if(!S.form.g){const last=l.grumes[l.grumes.length-1];const lastB=last&&last.billons.length?last.billons[last.billons.length-1]:null;S.form.g=ed?JSON.parse(JSON.stringify(g)):{num:nextNum(l),ess:last?last.ess:p.essences[0],sl:l.slCur||null,billons:[{rang:1,lm:(l.lgFixe&&lastB&&lenM(lastB)>0)?lenM(lastB):null,d:null,q:(p.repriseQualite&&lastB)?lastB.q:''}]};}
  const f=S.form.g,t=lotTotals(l);head(ed?'Modifier grume '+g.num:'Saisie grumes',`${f3(t.v)} m³ · ${t.n} grumes`);
  if(ed&&f.sl===undefined){const u=[...new Set(f.billons.map(b=>b.sl||null))];f.sl=u.length===1?u[0]:'mixte';}
  const hasSL=(l.sousLots||[]).length>0;
  const gv=f.billons.reduce((s,b)=>s+(b.d>0&&lenM(b)>0?volB(b):0),0);
  const vocal=!ed&&vocalDispo(); // dictée des billons à la voix
  $('#main').innerHTML=`<div class="stack">
  <div class="count-bar"><div class="ess"><b>${f3(t.v)}</b><small>m³ lot · ${t.n} grume${t.n>1?'s':''}</small></div></div>
  ${vocal?'<div id="vocal"></div>':''}
  <div class="row"><label class="f" style="flex:0 0 150px"><span class="l">N° grume</span><input class="big" id="num" type="number" inputmode="numeric" value="${esc(f.num)}"></label><label class="f"><span class="l">Essence</span>${chips('ess',lotEss(l,[f.ess]),f.ess,true).replace(/<\/div>$/,addBtn('ess')+'</div>')}</label></div>
  ${hasSL?`<div class="sl-box"><span class="l">Sous-lot de la grume${f.sl==='mixte'?' · <span class="pill warn">billons répartis</span>':''}</span>${slChips(l,f.sl)}</div>`:''}
  ${f.billons.map((b,i)=>{const red=b.rl>0||b.rd>0||(f.redOpen&&f.redOpen[i]);const note=!!(b.note&&b.note.trim())||(f.noteOpen&&f.noteOpen[i]);return `<div class="card stack" data-b="${i}"><div class="row"><b class="grow">Billon ${f.num}.${i+1}</b><button type="button" class="chip small tog${note?' on':''}" data-note="${i}">${note?'− Note':'+ Note'}</button><button type="button" class="chip small tog${red?' on':''}" data-red="${i}">${red?'− Réduction':'+ Réduction'}</button>${f.billons.length>1?`<button type="button" class="chip small" data-delb="${i}">✕</button>`:''}</div>
   <div class="q"><span class="muted">Qualité</span>${chips('q'+i,lotQual(l,[b.q]),b.q,true).replace(/<\/div>$/,addBtn('q',i)+'</div>')}</div>
   <div class="bill"><label class="f"><span class="l">Longueur (m)</span><input class="big" type="text" inputmode="decimal" data-f="lm" data-i="${i}" value="${lenM(b)>0?String(lenM(b)).replace('.',','):''}" placeholder="m"></label><label class="f"><span class="l">Diamètre (cm)</span><input class="big" type="number" inputmode="numeric" data-f="d" data-i="${i}" value="${b.d??''}" placeholder="cm"></label>
   ${red?`<label class="f"><span class="l">Réduction L (cm)</span><input type="text" inputmode="numeric" data-f="rl" data-i="${i}" value="${b.rl>0?b.rl:''}" placeholder="0"></label><label class="f"><span class="l">Réduction Ø (cm)</span><input type="text" inputmode="numeric" data-f="rd" data-i="${i}" value="${b.rd>0?b.rd:''}" placeholder="0"></label>`:''}
   ${note?`<label class="f" style="grid-column:1/-1"><span class="l">Commentaire du billon</span><input type="text" data-f="note" data-i="${i}" value="${esc(b.note||'')}" placeholder="ex. gélivure, pourriture au pied, bois de réserve…" autocapitalize="sentences"></label>`:''}
   <div class="vbox"><b data-bv="${i}">${b.d>0&&lenM(b)>0?f3(volB(b)):'—'}</b><small data-bc="${i}">${(b.rl>0||b.rd>0)?'m³ · cubé '+f2(cubL(b))+' m × Ø'+cubD(b):'m³ billon'}</small></div>
   </div></div>`;}).join('')}
  <div class="vbox main"><b id="gv">${f3(gv)}</b><small>m³ grume${f.billons.length>1?' · '+f.billons.length+' billons':''}</small></div>
  </div>`;
  $('#main').querySelectorAll('[data-note]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.note);f.noteOpen=f.noteOpen||{};const bl=f.billons[i];if(bl.note&&bl.note.trim()){bl.note='';f.noteOpen[i]=false;}else f.noteOpen[i]=!f.noteOpen[i];render();if(f.noteOpen[i])setTimeout(()=>{const x=document.querySelector(`input[data-f=note][data-i="${i}"]`);x&&x.focus();},0);});
  $('#main').querySelectorAll('[data-red]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.red);f.redOpen=f.redOpen||{};const bl=f.billons[i];if(bl.rl>0||bl.rd>0){bl.rl=0;bl.rd=0;f.redOpen[i]=false;}else f.redOpen[i]=!f.redOpen[i];render();if(f.redOpen[i])setTimeout(()=>{const x=document.querySelector(`input[data-f=rl][data-i="${i}"]`);x&&x.focus();},0);});
  bindChips();bindAddRef(l,(k,v,i)=>{if(k==='ess')f.ess=v;else if(i!=null&&f.billons[Number(i)])f.billons[Number(i)].q=v;render();});
  onChip(e=>{const n=e.target.dataset.chips;if(n==='sl'){f.sl=e.detail||null;f.slSet=true;if(!ed){l.slCur=f.sl;save();}}else if(n==='ess')f.ess=e.detail;else if(n.startsWith('q'))f.billons[Number(n.slice(1))].q=e.detail;});
  $('#num').oninput=e=>{f.num=e.target.value;};
  const updV=()=>{let tot=0;f.billons.forEach((b,i)=>{const ok=b.d>0&&lenM(b)>0,v=ok?volB(b):0;tot+=v;const el=document.querySelector(`[data-bv="${i}"]`);if(el)el.textContent=ok?f3(v):'—';const ec=document.querySelector(`[data-bc="${i}"]`);if(ec)ec.textContent=(b.rl>0||b.rd>0)?'m³ · cubé '+f2(cubL(b))+' m × Ø'+cubD(b):'m³ billon';});const g=$('#gv');if(g)g.textContent=f3(tot);};
  $('#main').querySelectorAll('input[data-f]').forEach(i=>i.oninput=e=>{const b=f.billons[Number(e.target.dataset.i)],k=e.target.dataset.f;if(k==='note'){b.note=e.target.value;return;}let v=num(e.target.value);if((k==='rl'||k==='rd')&&v!=null)v=Math.abs(v);b[k]=v;updV();});
  $('#main').querySelectorAll('input[data-f=lm]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();i.closest('.bill').querySelector('[data-f=d]').focus();}}));
  $('#main').querySelectorAll('input[data-f=d]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#ok').click();}}));
  $('#main').querySelectorAll('[data-delb]').forEach(b=>b.onclick=()=>{f.billons.splice(Number(b.dataset.delb),1);f.billons.forEach((x,i)=>x.rang=i+1);render();});
  foot(`<button class="btn big" id="cancel">${ed?'Annuler':'Terminer'}</button><button type="button" class="btn big" id="addB">+ Billon</button><button class="btn primary big" id="ok" style="flex:2">${ed?'Enregistrer':'Grume suivante ›'}</button>`);
  $('#addB').onclick=()=>{const lb=f.billons[f.billons.length-1];f.billons.push({rang:f.billons.length+1,lm:(l.lgFixe&&lenM(lb)>0)?lenM(lb):null,d:null,q:lb.q});render();setTimeout(()=>{const x=[...document.querySelectorAll(l.lgFixe?'input[data-f=d]':'input[data-f=lm]')].pop();x&&x.focus();},0);};
  // Entrée / « suivant » au clavier : longueur → diamètre → billon suivant ou grume suivante
  $('#main').querySelectorAll('input[data-f=lm],input[data-f=d]').forEach(i=>{i.setAttribute('enterkeyhint','next');i.onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const k=i.dataset.f,n=Number(i.dataset.i);
    const nx=k==='lm'?document.querySelector(`input[data-f=d][data-i="${n}"]`):document.querySelector(`input[data-f=lm][data-i="${n+1}"]`);if(nx)nx.focus();else $('#ok').click();};});
  $('#cancel').onclick=()=>{S.form={};S.edit=null;back();};
  $('#ok').onclick=()=>{try{const bad=f.billons.find(b=>!(lenM(b)>0)||!(b.d>0));if(bad){toast('Longueur et diamètre obligatoires');return;}
    const numS=String(f.num).replace(/\D/g,'');if(!numS||numS.length>10){toast('N° de grume : 1 à 10 chiffres');return;}
    const dup=l.grumes.find(x=>String(x.num)===numS&&x.id!==ed);if(dup){toast('N° '+numS+' déjà utilisé');return;}
    f.billons.forEach(b=>{b.d=Math.floor(b.d);b.lm=Math.round(lenM(b)*100)/100;delete b.l;b.rl=b.rl>0?Math.round(b.rl):0;b.rd=b.rd>0?Math.round(b.rd):0;if(b.rl>=b.lm*100||b.rd>=b.d){toast('Réduction supérieure à la dimension du billon '+b.rang);throw new Error('red');}b.id=b.id||uid();if(f.sl!=='mixte'&&(!ed||f.slSet))b.sl=f.sl||null;});
    if(ed){Object.assign(g,{num:numS,ess:f.ess,modifie:new Date().toISOString(),billons:f.billons.map(({slSet,...b})=>b)});save();S.form={};S.edit=null;back();return;}
    l.grumes.push({id:uid(),num:numS,ess:f.ess,saisi:new Date().toISOString(),billons:JSON.parse(JSON.stringify(f.billons))});save();S.form={};toast('Grume '+numS+' · '+f3(f.billons.reduce((x,b)=>x+volB(b),0))+' m³'+(f.sl?' · '+slName(l,f.sl):''));render();focusSaisie('input[data-f=lm]');}catch(e){if(e.message!=='red')throw e;}};
  if(!ed)focusSaisie(l.lgFixe?'input[data-f=d]':'input[data-f=lm]');
  /* Mode vocal : chaque billon dicté remplit la ligne vide ou en ajoute une (comme « + Billon »), « suivante » = bouton « Grume suivante » */
  if(vocal){const vide=b=>!(lenM(b)>0)&&!(b.d>0);const lastQ=[...f.billons].reverse().find(b=>b.q)||f.billons[f.billons.length-1];
    window.CubageVoice.bind({mode:'grumes',motDepart:p.vocalMot==null?'note':p.vocalMot,strict:p.vocalStrict!==false,essences:lotEss(l,[f.ess]),qualites:lotQual(l,f.billons.map(b=>b.q)),cur:f.ess,curQ:lastQ?lastQ.q||'':'',num:f.num,mots:motsVocaux(),motsQ:motsVocauxQ(),annonce:p.vocalAnnonce!==false,
      onEssence:code=>{if(code!==f.ess){f.ess=code;render();voirElement(null);}},
      onQualite:code=>{const b=f.billons[f.billons.length-1];if(b&&vide(b)&&b.q!==code){b.q=code;render();voirElement('.card[data-b="'+(f.billons.length-1)+'"]');}},
      onBillon:(ess,q,lm,d)=>{if(!(lm>0&&d>0))return null;if(ess!==f.ess)f.ess=ess;let b=f.billons[f.billons.length-1];
        if(b&&vide(b))Object.assign(b,{q,lm,d});else{b={rang:f.billons.length+1,lm,d,q};f.billons.push(b);}render();voirElement('.card[data-b="'+(b.rang-1)+'"]');return{label:f.num+'.'+b.rang};},
      onSuivante:()=>{if(f.billons.length>1&&vide(f.billons[f.billons.length-1])){f.billons.pop();}
        if(!f.billons.length||f.billons.some(vide))return false;const n=l.grumes.length;const b=$('#ok');if(b)b.click();
        if(l.grumes.length>n){const g=l.grumes[l.grumes.length-1];S.vocalGrume=g.id;voirElement(null);return String(S.form.g?S.form.g.num:nextNum(l));}return false;},
      onNumero:n=>{const s=String(n).replace(/\D/g,'');if(!s||s.length>10)return false;if(l.grumes.find(x=>String(x.num)===s)){toast('N° '+s+' déjà utilisé');return false;}f.num=s;const i=$('#num');if(i)i.value=s;voirElement(null);return true;},
      onAnnule:()=>{const idx=f.billons.map(vide).lastIndexOf(false);
        if(idx>=0){const b=f.billons[idx];f.billons.splice(idx,1);if(!f.billons.length)f.billons.push({rang:1,lm:null,d:null,q:b.q});f.billons.forEach((x,i)=>x.rang=i+1);render();voirElement('.card[data-b="'+(f.billons.length-1)+'"]');return 'billon '+f.num+'.'+(idx+1);}
        const g=l.grumes[l.grumes.length-1];if(g&&S.vocalGrume===g.id){l.grumes.pop();S.vocalGrume=null;S.form.g={num:g.num,ess:g.ess,sl:f.sl,billons:g.billons.map(x=>({...x}))};save();render();voirElement('.card[data-b="'+(g.billons.length-1)+'"]');return 'grume '+g.num+' rouverte';}
        return false;}});}};

/* --- Saisie sur pied --- */
V.saisieP=()=>{const l=S.lot,p=S.params,ed=S.edit;let a=ed?l.arbres.find(x=>x.id===ed):null;const mode=ed?(a.h?'pieds':'diam'):l.mode;
  if(!S.form.a){const last=l.arbres[l.arbres.length-1];S.form.a=ed?JSON.parse(JSON.stringify(a)):{num:nextNum(l),ess:last?last.ess:p.essences[0],d:null,h:null,n:1,tr:[]};if(ed)S.form.a.tarif=tarifOf(l,a);else{S.form.a.tarif=tarifDef(l,S.form.a.ess);S.form.a.sl=l.slCur||null;}}
  const f=S.form.a,t=lotTotals(l);head(ed?'Modifier tige':'Saisie sur pied',`${f3(t.v)} m³ · ${t.n} tiges`);
  const classes=[];for(let c=p.classMin;c<=p.classMax;c+=stepFor(f.ess))classes.push(c);
  const byClass=mode!=='pieds'&&(p.saisieDiam==='classe'||mode==='classes');
  const cntCl={};let nEss=0;for(const x of l.arbres){if(x.ess!==f.ess)continue;nEss+=x.n||1;const c=cls(x.ess,x.d);cntCl[c]=(cntCl[c]||0)+(x.n||1);}
  const vocal=mode==='diam'&&byClass&&!ed&&vocalDispo(); // pointage à la voix : uniquement en « un appui = une tige » par classes
  $('#main').innerHTML=`<div class="stack">
   ${ed?'':`<div class="count-bar"><div><b>${t.n}</b><small>tiges au total</small></div><div class="ess"><b>${nEss}</b><small>${esc(f.ess)}</small></div></div>`}
   ${vocal?'<div id="vocal"></div>':''}
   <div class="row"><label class="f"><span class="l">Essence</span>${chips('ess',lotEss(l,[f.ess]),f.ess,true).replace(/<\/div>$/,addBtn('ess')+'</div>')}</label></div>
   ${(l.sousLots||[]).length?`<div class="sl-box"><span class="l">Sous-lot</span>${slChips(l,f.sl||null)}</div>`:''}
   <div class="tarif-row"><span class="l">Tarif Chaudé ${esc(f.ess)}</span><button type="button" data-t="-1" aria-label="Tarif moins">−</button><b id="tv">${f.tarif}</b><button type="button" data-t="1" aria-label="Tarif plus">+</button></div>
   ${mode==='pieds'?`<label class="f" style="max-width:160px"><span class="l">N° arbre</span><input class="big" id="num" type="number" inputmode="numeric" value="${esc(f.num)}"></label>`:''}
   ${mode==='classes'?`<label class="f" style="max-width:200px"><span class="l">Nombre de tiges</span><input class="big" id="n" type="number" inputmode="numeric" value="${f.n||1}"></label>`:''}
   ${byClass?`<div><span class="muted">Classe de diamètre (cm)${mode==='diam'?' · un appui = une tige':''}</span><div class="grid-cl" id="cl">${classes.map(c=>{const k=cntCl[c]||0;return `<button type="button" data-c="${c}" class="${S.flash===c?'flash ':''}${(mode!=='diam'&&f.d===c)?'sel':''}">${c}${k?`<small>${k}</small>`:''}</button>`;}).join('')}</div></div>`
   :`<label class="f" style="max-width:200px"><span class="l">Diamètre à 1,30 m (cm)</span><input class="big" id="d" type="number" inputmode="numeric" value="${f.d??''}" placeholder="cm"></label>`}
   ${mode!=='diam'?`<label class="f" style="max-width:200px"><span class="l">Hauteur (m)${mode==='classes'?' · optionnel':''}</span><input class="big" id="h" type="number" inputmode="decimal" step="0.5" value="${f.h??''}" placeholder="m"></label>
   <div class="vbox main"><b id="av">—</b><small id="avs">m³</small></div>
   <div class="stack sec"><span class="sec-t">Tronçons de qualité <span class="muted">(du bas vers le haut, optionnel)</span></span>${trEditor(f.tr||[],'tr',true)}<div class="row"><p class="muted grow" style="margin:0" id="trRest">Le reste jusqu’à la hauteur est compté en « ${esc(resteQ())} ».</p>${addBtn('q')}</div></div>`:''}
   ${mode==='diam'&&!byClass?'':''}
   ${l.arbres.length?`<div class="row"><span class="muted grow">Dernière : ${lastArbre(l)}</span><button type="button" class="btn" id="undo">Annuler dernière</button></div>`:''}
  </div>`;
  bindChips();bindAddRef(l,(k,v)=>{if(k==='ess'){f.ess=v;if(!ed)f.tarif=tarifDef(l,v);}render();});onChip(e=>{if(e.target.dataset.chips==='sl'){f.sl=e.detail||null;if(!ed){l.slCur=f.sl;save();}return;}if(e.target.dataset.chips==='ess'){f.ess=e.detail;if(!ed)f.tarif=tarifDef(l,f.ess);render();}});
  $('#main').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{f.tarif=clampT(f.tarif+Number(b.dataset.t));$('#tv').textContent=f.tarif;updA();if(!ed){l.tarifEss=l.tarifEss||{};l.tarifEss[f.ess]=f.tarif;save();}});
  if($('#num'))$('#num').oninput=e=>f.num=e.target.value;if($('#n'))$('#n').oninput=e=>{f.n=Math.max(1,Math.round(num(e.target.value)||1));updA();};
  const updA=()=>{const b=$('#av');if(!b)return;const n=f.n||1,ok=f.d>0&&f.h>0;b.textContent=ok?f3(Calc.volChaude(f.d,f.h,f.tarif,n)):'—';$('#avs').textContent='m³'+(n>1?' · '+n+' tiges':' · tige')+' · tarif '+f.tarif;
    const rows=[...document.querySelectorAll('#tr .tr-row')];if(!rows.length&&!$('#trRest'))return;const tr=readTr('tr'),res=ok?Calc.volTroncons(f.d,f.h,f.tarif,n,tr):[];let k=0;
    rows.forEach(r=>{const hh=num(r.querySelector('[data-f=h]').value),sp=r.querySelector('[data-tv]');if(!sp)return;if(hh>0){const x=res[k++];sp.textContent=x?f3(x.v)+' m³':'';}else sp.textContent='';});
    const rest=$('#trRest');if(rest){const sum=sumTr(tr);if(ok&&sum>f.h+1e-9){rest.innerHTML='<b style="color:var(--bad)">Tronçons : '+f1(sum)+' m > hauteur '+f1(f.h)+' m</b>';}else{const x=(ok&&sum<f.h)?res[res.length-1]:null;rest.textContent=x?'Reste « '+resteQ()+' » : '+f1(x.h)+' m · '+f3(x.v)+' m³':'Le reste jusqu’à la hauteur est compté en « '+resteQ()+' ».';}}};
  if($('#d'))$('#d').oninput=e=>{f.d=num(e.target.value);updA();};if($('#h'))$('#h').oninput=e=>{f.h=num(e.target.value);updA();};updA();
  const rebindTr=()=>bindTr('tr',()=>{f.tr=readTr('tr');updA();});rebindTr();
  if($('#undo'))$('#undo').onclick=()=>{l.arbres.pop();save();render();};
  const commit=()=>{if(!(f.d>0)){toast('Diamètre manquant');return;}if(mode==='pieds'&&!(f.h>0)){toast('Hauteur obligatoire en pied à pied numéroté');return;}
    if($('#tr'))f.tr=readTr('tr');if(f.h>0&&sumTr(f.tr)>f.h+1e-9){toast('Tronçons : '+sumTr(f.tr)+' m > hauteur '+f.h+' m');return;}const rec={id:ed||uid(),num:mode==='pieds'?String(f.num):'',ess:f.ess,d:Math.floor(f.d),h:f.h>0?f.h:null,n:f.n||1,tr:f.tr||[],tarif:clampT(f.tarif),sl:f.sl||null};l.tarifEss=l.tarifEss||{};if(!ed)l.tarifEss[rec.ess]=rec.tarif;
    if(ed){Object.assign(a,rec);save();S.form={};S.edit=null;back();return;}
    rec.saisi=new Date().toISOString();l.arbres.push(rec);save();S.form={};toast((rec.n>1?rec.n+' × ':'')+rec.ess+' '+rec.d+(rec.h?' · '+rec.h+' m':'')+' · T'+rec.tarif);render();};
  S.flash=null;
  if($('#cl'))$('#cl').onclick=e=>{const b=e.target.closest('button');if(!b)return;f.d=Number(b.dataset.c);if(mode==='diam'&&!ed){S.flash=f.d;try{navigator.vibrate&&navigator.vibrate(30);}catch(x){}commit();}else render();};
  /* Mode vocal : le module appelle exactement ce que font les boutons (changement d'essence, appui sur une classe, « Annuler dernière ») */
  if(vocal)window.CubageVoice.bind({motDepart:p.vocalMot==null?'note':p.vocalMot,strict:p.vocalStrict!==false,essences:lotEss(l,[f.ess]),cur:f.ess,classes,mots:motsVocaux(),annonce:p.vocalAnnonce!==false,
    onEssence:code=>{if(code===f.ess)return;f.ess=code;f.tarif=tarifDef(l,code);render();},
    onPointage:(code,c)=>{if(!classes.includes(c))return false;if(code!==f.ess){f.ess=code;f.tarif=tarifDef(l,code);}f.d=c;S.flash=c;commit();return true;},
    onAnnule:()=>{if(!l.arbres.length)return false;l.arbres.pop();save();toast('Dernière tige annulée');render();return true;}});
  const hasTr=!!$('#tr');
  foot(`<button class="btn big" id="cancel">${ed?'Annuler':'Terminer'}</button>${hasTr?'<button type="button" class="btn big" id="addTrF">+ Qualité</button>':''}${(mode==='diam'&&byClass&&!ed)?'':`<button class="btn primary big" id="ok" style="flex:2">${ed?'Enregistrer':'Ajouter ›'}</button>`}`);
  $('#cancel').onclick=()=>{S.form={};S.edit=null;back();};if($('#ok'))$('#ok').onclick=commit;
  if($('#addTrF'))$('#addTrF').onclick=()=>{const root=$('#tr');if(!root)return;const list=readTr('tr');list.push({h:null,q:''});root.outerHTML=trEditor(list,'tr',true);rebindTr();const x=[...document.querySelectorAll('#tr [data-f=h]')].pop();x&&x.focus();};
  if(!ed&&$('#d'))focusSaisie('#d');};
function lastArbre(l){const a=l.arbres[l.arbres.length-1];if(!a)return '';return (a.n>1?a.n+'×':'')+a.ess+' '+a.d+(a.h?' · '+a.h+' m':'')+' · T'+tarifOf(l,a);}
function bindTr(id,onChange){const root=$('#'+id);if(!root)return;root.addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){d.closest('.tr-row').remove();onChange&&onChange();return;}
  const ad=e.target.closest('[data-add-tr]');if(ad){const list=readTr(id);list.push({h:null,q:''});root.outerHTML=trEditor(list,id,root.dataset.nobtn==='1');bindTr(id,onChange);const x=[...document.querySelectorAll(`#${id} [data-f=h]`)].pop();x&&x.focus();}});
  root.addEventListener('input',()=>onChange&&onChange());root.addEventListener('change',()=>onChange&&onChange());}

/* --- Hauteurs par classe --- */
V.hauteurs=()=>{const l=S.lot;head('Hauteurs par classe',l.chantier);const keys={};for(const a of l.arbres){const k=a.ess+'|'+cls(a.ess,a.d);keys[k]=(keys[k]||0)+(a.n||1);}
  const ks=Object.keys(keys).sort((a,b)=>{const[ea,ca]=a.split('|'),[eb,cb]=b.split('|');return ea.localeCompare(eb)||ca-cb;});l.classH=l.classH||{};
  $('#main').innerHTML=`<p class="muted">Hauteur et tronçons par défaut pour les tiges sans hauteur propre. Tronçons du bas vers le haut ; le reste jusqu’à la hauteur est compté en « ${esc(resteQ())} ».</p><div class="stack">${ks.length?ks.map(k=>{const[e,c]=k.split('|');const v=l.classH[k]||{h:null,tr:[]};const id='tr_'+k.replace(/\W/g,'_');
   return `<div class="card stack" data-k="${esc(k)}"><div class="row"><b class="grow">${esc(e)} · classe ${c}</b><span class="muted">${keys[k]} tiges</span><label class="f" style="flex:0 0 110px"><span class="l">Hauteur m</span><input type="number" inputmode="decimal" step="0.5" data-h value="${v.h??''}"></label></div>${trEditor(v.tr||[],id)}<div class="msg bad" data-err hidden></div></div>`;}).join(''):'<p class="muted">Aucune tige saisie.</p>'}</div>`;
  $('#main').querySelectorAll('[data-k]').forEach(card=>{const k=card.dataset.k,id='tr_'+k.replace(/\W/g,'_');const upd=()=>{const h=num(card.querySelector('[data-h]').value),tr=readTr(id),err=card.querySelector('[data-err]');
    if(h>0&&sumTr(tr)>h+1e-9){err.hidden=false;err.textContent='Tronçons : '+sumTr(tr)+' m > hauteur '+h+' m — non enregistré';return;}err.hidden=true;l.classH[k]={h,tr};save();};card.querySelector('[data-h]').oninput=upd;bindTr(id,upd);});
  foot(`<button class="btn primary big" id="done">Terminé</button>`);$('#done').onclick=back;};


/* --- Tarifs Chaudé par essence et par classe --- */
V.tarifs=()=>{const l=S.lot;head('Tarifs Chaudé',l.chantier);const base=S.tarifBase||'d';
  const ess=[...new Set(l.arbres.map(a=>a.ess))].sort();
  const kOf=a=>base==='d'?cls(a.ess,a.d):Math.round(circ(a.d)/10)*10;
  const opts=cur=>`${cur==null?'<option value="" selected>mixte</option>':''}${Array.from({length:20},(_,i)=>i+1).map(t=>`<option value="${t}"${t===cur?' selected':''}>${t}</option>`).join('')}`;
  const uniq=list=>{const u=[...new Set(list.map(a=>tarifOf(l,a)))];return u.length===1?u[0]:null;};
  let html=`<p class="muted">Modifie le tarif des tiges déjà saisies. Le tarif choisi pour une essence devient aussi celui proposé pour les prochaines tiges de cette essence.</p>
  <div class="segment" id="base" style="margin:10px 0"><button type="button" data-v="d"${base==='d'?' class="on"':''}>Classes de diamètre</button><button type="button" data-v="c"${base==='c'?' class="on"':''}>Classes de circonférence</button></div><div class="stack">`;
  if(!ess.length)html+='<p class="muted">Aucune tige saisie.</p>';
  for(const e of ess){const ta=l.arbres.filter(a=>a.ess===e);const ks=[...new Set(ta.map(kOf))].sort((a,b)=>a-b);const nT=ta.reduce((s,a)=>s+(a.n||1),0);
    html+=`<div class="card stack"><div class="row"><b class="grow">${esc(e)} · ${nT} tiges</b><label class="f" style="flex:0 0 130px"><span class="l">Toute l’essence</span><select data-te="${esc(e)}">${opts(uniq(ta))}</select></label></div>
    <div class="stack sec"><span class="sec-t">Par classe de ${base==='d'?'diamètre':'circonférence'}</span>${ks.map(k=>{const tk=ta.filter(a=>kOf(a)===k);const nk=tk.reduce((s,a)=>s+(a.n||1),0);
      return `<div class="row"><span class="grow">${base==='d'?'Ø '+k+' cm <span class="muted">(C ≈ '+circ(k)+')</span>':'C '+k+' cm <span class="muted">(Ø ≈ '+Math.round(k/Math.PI)+')</span>'} · <span class="muted">${nk} tiges</span></span><select data-tk="${esc(e)}|${k}" style="flex:0 0 100px">${opts(uniq(tk))}</select></div>`;}).join('')}</div></div>`;}
  $('#main').innerHTML=html+'</div>';
  $('#base').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.tarifBase=b.dataset.v;render();};
  $('#main').querySelectorAll('[data-te]').forEach(sel=>sel.onchange=()=>{if(!sel.value)return;const e=sel.dataset.te,t=clampT(sel.value);l.arbres.forEach(a=>{if(a.ess===e)a.tarif=t;});l.tarifEss=l.tarifEss||{};l.tarifEss[e]=t;save();toast(e+' : tarif '+t+' appliqué');render();});
  $('#main').querySelectorAll('[data-tk]').forEach(sel=>sel.onchange=()=>{if(!sel.value)return;const[e,k]=sel.dataset.tk.split('|');const t=clampT(sel.value);let n=0;l.arbres.forEach(a=>{if(a.ess===e&&kOf(a)===Number(k)){a.tarif=t;n+=a.n||1;}});save();toast(n+' tiges '+e+' : tarif '+t);render();});
  foot(`<button class="btn primary big" id="done">Terminé</button>`);$('#done').onclick=back;};


/* ================= Lots clients et recoupe =================
   Stock = billons des lots de cubage du téléphone + tronçons issus de recoupes,
   hors éléments recoupés et hors éléments déjà affectés à un lot client. */
function stockItems(){const items=[];const rcs=[];
  for(const l of S.lots){if(l.type!=='grumes'||l.test||l.archive)continue;const orig=(l.xylo?l.xylo+' · ':'')+(l.chantier||'');
    for(const g of l.grumes)for(const b of g.billons)items.push({key:l.id+'|'+b.id,lotId:l.id,id:b.id,num:g.num+'.'+b.rang,base:String(g.num),ess:g.ess,q:b.q||'',lm:lenM(b),d:b.d,rl:b.rl||0,rd:b.rd||0,red:redTxt(b),v:volB(b),orig,lot:l});
    for(const rc of l.recoupes||[]){rcs.push(rc.parentKey);for(const p of rc.pieces)items.push({key:l.id+'|'+p.id,lotId:l.id,id:p.id,num:p.num,base:String(p.num).split('.')[0],ess:rc.ess,q:p.q||'',lm:p.lm,d:p.d,v:Calc.volBillon(p.d,p.lm),orig,lot:l,parent:rc.parentNum});}}
  const cut=new Set(rcs);const sold={};for(const c of S.lots)if(c.type==='client')for(const k of c.lignes||[])sold[k]=c;
  const bu=S.bureau?new Map(S.bureau.items.map(it=>[it.key,it])):null;
  for(const it of items){it.cut=cut.has(it.key);it.client=sold[it.key]||null;if(bu&&!it.client){const b=bu.get(it.key);if(b){if(b.cut)it.cut=true;else if(b.client)it.client={client:b.client.client,statut:b.client.statut,id:b.client.id,fromSheet:true};}}}return items;}
function lotStatus(l){const st={};for(const it of stockItems())if(it.lotId===l.id)st[it.key]=it;return st;}
function searchItems(qy){const all=stockItems();const t=(qy||'').trim().replace(/\s+/g,'');if(!t)return[];
  const m=/^(\d+)-(\d+)$/.exec(t);if(m){const a=Math.min(+m[1],+m[2]),b=Math.max(+m[1],+m[2]);return all.filter(it=>{const n=Number(it.base);return n>=a&&n<=b;});}
  if(t.includes('.'))return all.filter(it=>it.num===t||String(it.num).startsWith(t+'.'));
  return all.filter(it=>it.base===t);}
function clientVirtual(c){const by=new Map(stockItems().map(it=>[it.key,it]));const grumes=[];
  for(const k of c.lignes||[]){const it=by.get(k);if(!it)continue;grumes.push({id:it.key,lotId:it.lotId,num:it.base,ess:it.ess,orig:it.orig,billons:[{id:it.key,rang:'',label:String(it.num),lm:it.lm,d:it.d,rl:it.rl||0,rd:it.rd||0,q:it.q}]});}
  return{id:c.id,type:'grumes',isClient:true,chantier:'Lot client '+(c.client||''),date:c.date,operateur:c.ref?'Réf. '+c.ref:'',grilleId:c.grilleId,grilleLocal:c.grilleLocal||null,sousLots:[],grumes,arbres:[],xylo:''};}
/* Grille de vente propre au lot client : créée à la demande (copie de la grille choisie ou vide), complétée d'une ligne par essence × qualité présente */
function ensureClientGrille(c){const v=clientVirtual(c);if(!c.grilleLocal){const base=S.grilles.find(g=>g.id===c.grilleId);c.grilleLocal=base?JSON.parse(JSON.stringify({...base,id:'cli-'+c.id,nom:'Prix '+(c.client||'client'),src:''})):{id:'cli-'+c.id,nom:'Prix '+(c.client||'client'),type:'grumes',lignes:[]};}
  const have=new Set((c.grilleLocal.lignes||[]).map(l=>(l.ess||'')+'|'+(l.q||'')));const seen=new Set();for(const g of v.grumes){const k=g.ess+'|'+(g.billons[0].q||'');if(seen.has(k))continue;seen.add(k);if(!have.has(k)&&!have.has(g.ess+'|')&&!have.has('|'+(g.billons[0].q||''))&&!have.has('|'))c.grilleLocal.lignes.push({ess:g.ess,q:g.billons[0].q||'',dmin:null,dmax:null,prix:null});}
  c.grilleLocal.lignes.sort((a,b)=>(a.ess||'').localeCompare(b.ess||'')||(a.q||'').localeCompare(b.q||'')||(a.dmin||0)-(b.dmin||0));save(c);return c.grilleLocal;}
function clientMissing(c){const v=clientVirtual(c),g=lotGrille(v);return v.grumes.filter(gr=>prixLine(g,gr.ess,gr.billons[0].q||'',cubD(gr.billons[0]))==null);}
const cliTot=c=>{const v=clientVirtual(c);const r=recap(v,'');return{n:v.grumes.length,v:r.tot.v,m:r.tot.m};};

V.clients=()=>{head('Lots clients');const qy=S.cliSearch||'';
  $('#main').innerHTML=`<button class="tile" data-go="newClient" style="margin-bottom:12px"><b>+ Nouveau lot client</b><small>Billons des lots du téléphone, hors ligne</small></button>
  <input id="csq" type="search" placeholder="Rechercher : client, référence, date…" value="${esc(qy)}" style="margin-bottom:10px"><div class="list" id="csl"></div>`;
  const draw=()=>{const w=($('#csq').value||'').toLowerCase().split(/\s+/).filter(Boolean);
    const nArch=S.lots.filter(l=>l.type==='client'&&l.archive).length;
    const ls=S.lots.filter(l=>l.type==='client'&&(S.showArchC?l.archive:!l.archive)).filter(c=>{const h=[c.client,c.ref,c.date,c.date&&c.date.split('-').reverse().join('/'),c.note].join(' ').toLowerCase();return w.every(x=>h.includes(x));}).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
    $('#csl').innerHTML=(nArch||S.showArchC?`<button type="button" class="btn block" id="tgArchC" style="margin-bottom:8px">${S.showArchC?'‹ Retour aux lots clients en cours':'Voir les lots clients archivés ('+nArch+')'}</button>`:'')+(ls.length?ls.map(c=>{const t=cliTot(c);return `<button class="item" data-cli="${c.id}"><div class="t"><b>${esc(c.client||'Client ?')} <span class="pill${(c.statut||'brouillon')==='valide'?'':' warn'}">${STL[c.statut||'brouillon']}</span></b><small>${esc((c.date||'').split('-').reverse().join('/'))}${c.ref?' · '+esc(c.ref):''} · ${t.n} billon(s)${t.m!=null?' · '+f2(t.m)+' €':''}</small></div><div class="v">${f3(t.v)} m³</div></button>`;}).join(''):'<p class="muted">Aucun lot client.</p>');
    if($('#tgArchC'))$('#tgArchC').onclick=()=>{S.showArchC=!S.showArchC;draw();};
    $('#csl').querySelectorAll('[data-cli]').forEach(b=>b.onclick=()=>{S.cli=S.lots.find(x=>x.id===b.dataset.cli);S.hist.push('clients');go('client');});};
  $('#csq').oninput=()=>{S.cliSearch=$('#csq').value;draw();};draw();foot('');};

V.newClient=()=>{head('Nouveau lot client');
  $('#main').innerHTML=`<div class="card stack"><label class="f"><span class="l">Client *</span><input id="cl" placeholder="ex. Scierie X"></label>
  <div class="row"><label class="f"><span class="l">Date</span><input id="cd" type="date" value="${today()}"></label><label class="f"><span class="l">Réf. contrat / bon</span><input id="cr"></label></div>
  <label class="f"><span class="l">Grille de prix du client</span><select id="cg"><option value="">Aucune</option>${S.grilles.filter(g=>g.type==='grumes').map(g=>`<option value="${g.id}">${esc(g.nom)}</option>`).join('')}</select></label>
  <label class="f"><span class="l">Remarques</span><input id="cn"></label></div>`;
  foot(`<button class="btn primary big" id="ok">Créer le lot client</button>`);
  $('#ok').onclick=()=>{const n=$('#cl').value.trim();if(!n){toast('Indiquez le client');return;}const c={id:uid(),type:'client',client:n,date:$('#cd').value,ref:$('#cr').value.trim(),grilleId:$('#cg').value||null,note:$('#cn').value.trim(),lignes:[],statut:'brouillon',created:new Date().toISOString(),sync:'new'};
    S.lots.push(c);S.cli=c;save(c);S.hist=['home','module','clients'];go('client');};};

const STL={brouillon:'Brouillon',propose:'Transmis au bureau',valide:'Vente validée',annule:'Annulé'};
V.client=()=>{const c=S.cli;if(!c){back();return;}c.statut=c.statut||'brouillon';head(c.client||'Lot client',STL[c.statut]+' · '+(c.date||'').split('-').reverse().join('/'));
  const v=clientVirtual(c),r=recap(v,''),lock=c.statut!=='brouillon',bu=isBureau();
  $('#main').innerHTML=`<div class="kpi"><div><b>${v.grumes.length}</b><small>billons</small></div><div><b>${f3(r.tot.v)}</b><small>m³</small></div><div><b>${r.tot.m!=null?f2(r.tot.m):'—'}</b><small>€</small></div></div>
  <div class="stack" style="margin-top:12px">${lock?'':'<button class="btn primary big block" data-go="clientAdd">+ Ajouter des billons (n° ou plage)</button>'}
  ${(()=>{const miss=clientMissing(c);return miss.length?`<div class="msg bad">${miss.length} billon(s) sans prix unitaire : ${[...new Set(miss.map(g=>g.ess+' '+(g.billons[0].q||'·')))].join(', ')}. Renseignez les prix avant de transmettre.</div>`:'';})()}
  <button class="btn big block ${clientMissing(c).length?'primary':''}" id="cprix">Prix de vente${c.grilleLocal?' (propres à ce lot)':c.grilleId?' (grille '+esc((S.grilles.find(g=>g.id===c.grilleId)||{}).nom||'')+')':''}</button>
  <div class="row"><button class="btn big grow" id="crec">Récapitulatif</button><button class="btn big grow" id="cpdf">PDF</button><button class="btn big grow" id="cxls">Excel</button></div>
  <button class="btn big block" id="cbord">Bordereau de réception (PDF client)</button>
  <h2>Billons du lot</h2><div class="tbl"><table><tr><th>N°</th><th>Ess.</th><th>Q</th><th class="n">L m</th><th class="n">Ø</th><th class="n">m³</th><th>Origine</th>${lock?'':'<th></th>'}</tr>
  ${v.grumes.map(g=>{const b=g.billons[0];return `<tr><td>${esc(b.label)}</td><td>${esc(g.ess)}</td><td>${esc(b.q||'')}</td><td class="n">${f2(b.lm)}</td><td class="n">${b.d}</td><td class="n">${f3(volB(b))}</td><td class="muted">${esc(g.orig)}</td>${lock?'':`<td><button type="button" class="chip small" data-rm="${esc(b.id)}">✕</button></td>`}</tr>`;}).join('')||'<tr><td colspan="8" class="muted">Aucun billon : utilisez « Ajouter des billons ».</td></tr>'}</table></div>
  <h2>Lot client</h2><div class="card stack"><div class="row"><label class="f"><span class="l">Client</span><input id="cl" value="${esc(c.client||'')}"></label><label class="f"><span class="l">Date</span><input id="cd" type="date" value="${esc(c.date||'')}"></label></div>
  <div class="row"><label class="f"><span class="l">Réf. contrat / bon</span><input id="cr" value="${esc(c.ref||'')}"></label><label class="f"><span class="l">Grille de prix</span><select id="cg"><option value="">Aucune</option>${S.grilles.filter(g=>g.type==='grumes').map(g=>`<option value="${g.id}"${g.id===c.grilleId?' selected':''}>${esc(g.nom)}</option>`).join('')}</select></label></div>
  <label class="f"><span class="l">Remarques</span><input id="cn" value="${esc(c.note||'')}"></label>
  <div class="msg ${c.statut==='valide'?'good':c.statut==='annule'?'bad':'warn'}">${STL[c.statut]}${c.synced?' · envoyé le '+new Date(c.synced).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):' · non envoyé'}${c.sync==='pending'?' · à renvoyer':''}</div>
  ${c.statut==='brouillon'?`<button class="btn primary" id="cval">${bu?'Valider la vente':'Transmettre au bureau'}</button>`:c.statut==='propose'?`${bu?'<button class="btn primary" id="cval">Valider la vente</button>':''}<button class="btn" id="cback">Repasser en brouillon</button>`:c.statut==='valide'&&bu?'<button class="btn" id="cback">Annuler la validation (repasser en brouillon)</button>':c.statut==='annule'?'<p class="muted" style="margin:0">Ce lot a été annulé par le bureau. Repassez-le en brouillon pour le modifier et le retransmettre.</p><button class="btn primary" id="cback">Repasser en brouillon</button>':''}
  ${lock&&c.statut!=='annule'?'<button class="btn" id="csync">Renvoyer au Sheet</button>':''}<button class="btn" id="carch">${c.archive?'Désarchiver':'Archiver'}</button><button class="btn danger" id="cdel">Supprimer ce lot client</button></div></div>`;
  const fld=(id,k)=>$(id).oninput=$(id).onchange=e=>{c[k]=e.target.value;save(c);};fld('#cl','client');fld('#cd','date');fld('#cr','ref');fld('#cn','note');$('#cg').onchange=e=>{c.grilleId=e.target.value||null;c.grilleLocal=null;save(c);render();};
  $('#main').querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{c.lignes=c.lignes.filter(k=>k!==b.dataset.rm);save(c);render();});
  $('#crec').onclick=()=>{S.lot=clientVirtual(c);S.slFilter='';S.hist.push('client');go('recap');};
  $('#cprix').onclick=()=>{ensureClientGrille(c);S.hist.push('client');go('grille',{gEdit:{cli:true}});};
  $('#cpdf').onclick=()=>exportPDF(clientVirtual(c),'');$('#cbord').onclick=()=>CubageDocs.bordereauAsk('Bordereau de réception','Document destiné au client : billons livrés, récapitulatif par essence et qualité, prix HT de sa grille si demandé.',!!lotGrille(v),w=>CubageDocs.bordereauClient({client:c},w));$('#cxls').onclick=()=>exportXLSX(clientVirtual(c),'');
  if($('#cval'))$('#cval').onclick=async()=>{if(!c.lignes.length){toast('Aucun billon dans ce lot');return;}const miss=clientMissing(c);if(miss.length){toast(miss.length+' billon(s) sans prix unitaire : renseignez les prix de vente');return;}const prev=c.statut;c.statut=bu?'valide':'propose';save(c);const ok=await syncClient(c);if(!ok){c.statut=prev;save(c);render();}};
  if($('#cback'))$('#cback').onclick=async()=>{const prev=c.statut;c.statut='brouillon';save(c);const ok=await syncClient(c);if(!ok){c.statut=prev;save(c);}render();};
  if($('#csync'))$('#csync').onclick=()=>syncClient(c);
  $('#carch').onclick=()=>{c.archive=!c.archive;DB.put('lots',c);toast(c.archive?'Lot client archivé':'Lot client remis en cours');back();};$('#cdel').onclick=async e=>{if(!e.target.dataset.c){e.target.textContent='Confirmer : les billons repassent en stock';e.target.dataset.c='1';return;}
    if(c.synced){c.statut='annule';c.lignes=[];const ok=await syncClient(c,true);if(!ok){toast('Impossible de prévenir le Sheet (réseau ?) : réessayez');c.statut='brouillon';return;}}
    S.lots=S.lots.filter(x=>x!==c);DB.del('lots',c.id);S.cli=null;back();};foot('');};

V.clientAdd=()=>{const c=S.cli;head('Ajouter à '+(c.client||'lot client'),'Stock des lots du téléphone');const qy=S.cliQ||'';
  $('#main').innerHTML=`<div class="row"><input id="aq" inputmode="decimal" placeholder="Rechercher : n° grume, billon (1234.2) ou plage (1200-1250)" value="${esc(qy)}" style="flex:1"></div>
  <details style="margin-top:8px"><summary class="muted">Coller une liste de numéros (bordereau de chargement)</summary><textarea id="aList" rows="4" placeholder="Un n° par ligne, ou séparés par espaces / virgules. Ex. : 1234  1235.2  1240-1245" style="width:100%;margin-top:6px"></textarea><button type="button" class="btn primary" id="aListGo" style="margin-top:6px">Ajouter tous les numéros trouvés</button></details>
  <div id="ares" class="stack" style="margin-top:10px"></div>`;
  $('#aListGo').onclick=()=>{const toks=$('#aList').value.split(/[\s,;]+/).map(t=>t.trim()).filter(Boolean);const found=[],missing=[],busy=[];
    for(const t of toks){const res=searchItems(t);if(!res.length){missing.push(t);continue;}for(const it of res){if(it.cut||(it.client&&it.client!==c))busy.push(it.num);else if(!c.lignes.includes(it.key)){c.lignes.push(it.key);found.push(it.num);}}}
    save(c);const set=statusBox();set(found.length+' billon(s) ajouté(s)',(missing.length?'Introuvables sur ce téléphone : '+missing.join(', ')+'.':'')+(busy.length?'\nDéjà vendus ou recoupés : '+busy.join(', ')+'.':'')||'Tous les numéros ont été trouvés.',true,missing.length>0||busy.length>0);draw();};
  const items=(res,box,extra)=>{const free=res.filter(it=>!it.cut&&!it.client);
    box.innerHTML=(extra||'')+(free.length>1?`<button type="button" class="btn primary" id="addAll">Ajouter les ${free.length} billons disponibles</button>`:'')+'<div class="list">'+res.map(it=>{const mine=it.client===c,blocked=it.cut||(it.client&&!mine);
      const st=it.cut?'<span class="pill">recoupé</span>':mine?'<span class="pill">dans ce lot ✓</span>':it.client?`<span class="pill warn">vendu · ${esc(it.client.client)}</span>`:'<span class="pill" style="background:var(--card);border:1px solid var(--line)">en stock</span>';
      return `<div class="item${mine?' on':''}" style="${blocked?'opacity:.55':''}"><div class="t"><b>${esc(it.num)} · ${esc(it.ess)} ${esc(it.q||'')}</b><small>${f2(it.lm)} m × Ø${it.d}${it.red?' ('+esc(it.red)+')':''} · ${f3(it.v)} m³ · ${esc(it.orig)}${it.parent?' · issu de '+esc(it.parent):''}</small><div>${st}</div></div>
       ${blocked?'':`<div class="stack" style="gap:6px"><button type="button" class="btn ${mine?'':'primary'}" data-tg="${esc(it.key)}">${mine?'Retirer':'Ajouter'}</button>${mine||(it.lot&&it.lot.remote)?'':`<button type="button" class="btn" data-rc="${esc(it.key)}">Recouper</button>`}</div>`}</div>`;}).join('')+'</div>';
    box.querySelectorAll('[data-tg]').forEach(b=>b.onclick=()=>{const k=b.dataset.tg;c.lignes=c.lignes.includes(k)?c.lignes.filter(x=>x!==k):[...c.lignes,k];save(c);draw();});
    box.querySelectorAll('[data-rc]').forEach(b=>b.onclick=()=>{S.rcKey=b.dataset.rc;S.hist.push('clientAdd');go('recoupe');});
    if(box.querySelector('#addAll'))box.querySelector('#addAll').onclick=()=>{for(const it of free)if(!c.lignes.includes(it.key))c.lignes.push(it.key);save(c);toast(free.length+' billon(s) ajouté(s)');draw();};};
  const draw=()=>{const box=$('#ares'),qv=$('#aq').value.trim();
    if(qv){const res=searchItems(qv);if(!res.length){box.innerHTML='<p class="muted">Aucun billon trouvé.</p>';return;}items(res,box);return;}
    const all=stockItems();
    if(S.cliBrowse){const l0=S.lots.find(x=>x.id===S.cliBrowse);const res=all.filter(it=>it.lotId===S.cliBrowse);
      items(res,box,`<button type="button" class="btn" id="bk">‹ Tous les lots</button><h2>${esc((l0&&l0.xylo?l0.xylo+' · ':'')+(l0?l0.chantier||'':''))}</h2>`);$('#bk').onclick=()=>{S.cliBrowse=null;draw();};return;}
    const lots=S.lots.filter(l=>l.type==='grumes').map(l=>{const its=all.filter(it=>it.lotId===l.id),free=its.filter(it=>!it.cut&&!it.client),mine=its.filter(it=>it.client===c);return{l,free,mine,vf:free.reduce((s,x)=>s+x.v,0)};}).filter(x=>x.free.length||x.mine.length)
      .sort((a,b)=>(b.l.updated||'').localeCompare(a.l.updated||''));
    box.innerHTML=lots.length?`<h2>Choisir dans un lot</h2><div class="list">${lots.map(x=>`<button class="item" data-bl="${x.l.id}"><div class="t"><b>${esc(x.l.xylo?x.l.xylo+' · ':'')}${esc(x.l.chantier||'Sans nom')}</b><small>${esc((x.l.date||'').split('-').reverse().join('/'))} · ${x.free.length} billon(s) en stock${x.mine.length?' · '+x.mine.length+' dans ce lot':''}</small></div><div class="v">${f3(x.vf)} m³ ›</div></button>`).join('')}</div>`:'<p class="muted">Aucun billon en stock sur ce téléphone.</p>';
    box.querySelectorAll('[data-bl]').forEach(b=>b.onclick=()=>{S.cliBrowse=b.dataset.bl;draw();});};
  $('#aq').oninput=()=>{S.cliQ=$('#aq').value;draw();};draw();
  const t=cliTot(c);foot(`<button class="btn primary big" id="done">Terminé · ${t.n} billon(s) · ${f3(t.v)} m³</button>`);$('#done').onclick=back;};

V.recoupe=()=>{const c=S.cli;const it=stockItems().find(x=>x.key===S.rcKey);if(!it||it.cut||it.client){toast('Billon indisponible');back();return;}
  head('Recouper '+it.num,it.ess+' · '+f2(it.lm)+' m × Ø'+it.d+' · '+f3(it.v)+' m³');const ql=lotQual(it.lot,[it.q]);
  if(!S.rcForm||S.rcForm.key!==it.key)S.rcForm={key:it.key,pieces:[{num:it.base,lm:null,d:null,q:it.q,add:true},{num:'',lm:null,d:null,q:it.q,add:false}]};const f=S.rcForm;
  $('#main').innerHTML=`<p class="muted" style="margin-top:0">Tronçons du bas vers le haut. Le premier garde le n° d’origine (modifiable) ; mettez le n° de la nouvelle plaquette sur les autres. Diamètre médian remesuré sur chaque tronçon.</p>
  <div class="stack">${f.pieces.map((p,i)=>`<div class="card stack" data-p="${i}"><div class="row"><b class="grow">Tronçon ${i+1}${i===0?' (bas)':''}</b>${f.pieces.length>1?`<button type="button" class="chip small" data-dp="${i}">✕</button>`:''}</div>
   <div class="row"><label class="f"><span class="l">N° plaquette</span><input data-k="num" value="${esc(p.num||'')}" inputmode="numeric"></label><label class="f"><span class="l">Long. m</span><input data-k="lm" value="${p.lm!=null?String(p.lm).replace('.',','):''}" inputmode="decimal"></label><label class="f"><span class="l">Ø cm</span><input data-k="d" value="${p.d??''}" inputmode="numeric"></label></div>
   <div class="row"><label class="f"><span class="l">Qualité</span><select data-k="q">${ql.map(q=>`<option${q===p.q?' selected':''}>${esc(q)}</option>`).join('')}</select></label>
   <label class="row" style="flex:1;gap:8px;align-items:center"><input type="checkbox" data-k="add" ${p.add?'checked':''} style="width:24px;min-height:24px"> <span>Mettre dans « ${esc(c.client||'ce lot')} »</span></label></div>
   <div class="vbox"><b data-pv="${i}">—</b><small>m³</small></div></div>`).join('')}
  <button type="button" class="btn add" id="addP">+ Ajouter un tronçon</button>
  <div class="vbox main"><b id="rcRest">—</b><small id="rcRestL">écart de recoupe</small></div></div>`;
  const upd=()=>{let L=0,V=0;f.pieces.forEach((p,i)=>{const ok=p.lm>0&&p.d>0,v=ok?Calc.volBillon(p.d,p.lm):0;L+=p.lm>0?p.lm:0;V+=v;const e=document.querySelector(`[data-pv="${i}"]`);if(e)e.textContent=ok?f3(v):'—';});
    $('#rcRest').textContent=f3(it.v-V);$('#rcRestL').textContent=L>it.lm+1e-9?'⚠ longueurs '+f2(L)+' m > '+f2(it.lm)+' m':'écart de recoupe · reste '+f2(Math.max(0,it.lm-L))+' m';};
  $('#main').querySelectorAll('[data-p]').forEach(card=>{const p=f.pieces[Number(card.dataset.p)];card.querySelectorAll('[data-k]').forEach(inp=>{inp.oninput=inp.onchange=()=>{const k=inp.dataset.k;p[k]=k==='add'?inp.checked:k==='lm'||k==='d'?num(inp.value):inp.value.trim();upd();};});});
  $('#main').querySelectorAll('[data-dp]').forEach(b=>b.onclick=()=>{f.pieces.splice(Number(b.dataset.dp),1);render();});
  $('#addP').onclick=()=>{f.pieces.push({num:'',lm:null,d:null,q:it.q,add:false});render();};upd();
  foot(`<button class="btn big" id="cancel">Annuler</button><button class="btn primary big" id="ok" style="flex:2">Enregistrer la recoupe</button>`);
  $('#cancel').onclick=()=>{S.rcForm=null;back();};
  $('#ok').onclick=()=>{const ps=f.pieces;if(ps.length<1){toast('Ajoutez au moins un tronçon');return;}
    for(const [i,p] of ps.entries()){if(!String(p.num||'').replace(/\D/g,'')){toast('N° manquant (tronçon '+(i+1)+')');return;}if(!(p.lm>0)||!(p.d>0)){toast('Longueur et diamètre obligatoires (tronçon '+(i+1)+')');return;}}
    const L=ps.reduce((s,p)=>s+p.lm,0);if(L>it.lm+1e-9){toast('Les tronçons dépassent la longueur d’origine');return;}
    const nums=ps.map(p=>String(p.num).trim());if(new Set(nums).size!==nums.length){toast('Deux tronçons ont le même n°');return;}
    const used=stockItems().filter(x=>!x.cut&&x.key!==it.key&&nums.includes(String(x.num)));if(used.length){toast('N° déjà utilisé en stock : '+used.map(x=>x.num).join(', '));return;}
    const lot=it.lot;lot.recoupes=lot.recoupes||[];const pieces=ps.map(p=>({id:uid(),num:String(p.num).trim(),lm:Math.round(p.lm*100)/100,d:Math.floor(p.d),q:p.q}));
    lot.recoupes.push({id:uid(),parentKey:it.key,parentNum:String(it.num),ess:it.ess,at:new Date().toISOString(),pieces});save(lot);
    ps.forEach((p,i)=>{if(p.add)c.lignes.push(lot.id+'|'+pieces[i].id);});save(c);S.rcForm=null;toast('Recoupe enregistrée');back();};};


/* ================= Espace Bureau (clé bureau, réseau requis) ================= */
async function loadStock(){const url=S.params.syncUrl;if(!url||!isBureau())return null;try{const res=await fetch(url+(url.includes('?')?'&':'?')+'action=stock&key='+encodeURIComponent(apiKey()));const j=await res.json();if(!j.ok)throw new Error(j.error||'refusé');
  await DB.put('params',{id:'bureau',j});return buildStock(j);}catch(e){toast('Lecture du Sheet impossible : '+e.message);return null;}}
/* Construction du stock Bureau à partir de la réponse du Sheet (conservée sur l'appareil) */
function buildStock(j){
  const cut=new Set(j.recoupes.map(r=>String(r.parent_key)));const st={};j.clients.forEach(c=>st[String(c.client_id)]=c);const sold={};j.lignes.forEach(l=>{const c=st[String(l.client_id)];if(c&&(c.statut==='valide'||c.statut==='propose'))sold[String(l.billon_key)]=c;});
  const items=[];const px=r=>({key:String(r.lot_id)+'|'+String(r.billon_id||r.piece_id),lotId:String(r.lot_id),num:String(r.num),base:String(r.num).split('.')[0],ess:String(r.essence),q:String(r.qualite||''),lm:Number(r.longueur_m)||0,d:Number(r.diametre_cm)||0,v:Number(r.volume_m3)||0,orig:(r.chantier_xylolink?r.chantier_xylolink+' · ':'')+(r.chantier||''),date:String(r.date||'').slice(0,10),op:String(r.operateur||''),grille:String(r.grille||''),p:r.prix_m3===''||r.prix_m3==null?null:Number(r.prix_m3),m:r.montant===''||r.montant==null?null:Number(r.montant),red:r.reduction_l_cm>0||r.reduction_d_cm>0?[r.reduction_l_cm>0?'L −'+f2(r.reduction_l_cm/100)+' m':'',r.reduction_d_cm>0?'Ø −'+r.reduction_d_cm+' cm':''].filter(Boolean).join(' · '):''});
  j.billons.forEach(r=>items.push(px(r)));j.recoupes.forEach(r=>items.push(Object.assign(px(r),{key:String(r.piece_key),parent:String(r.parent_num||'')})));
  for(const it of items){it.cut=cut.has(it.key);it.client=sold[it.key]?{client:String(sold[it.key].client),statut:sold[it.key].statut,id:String(sold[it.key].client_id)}:null;}
  const lp={};j.lignes.forEach(l=>lp[String(l.client_id)+'|'+String(l.billon_key)]=l);S.bureau={at:j.at,items,clients:j.clients,lignes:j.lignes,lp};return S.bureau;}
V.bureau=()=>{head('Bureau','Données de tous les téléphones (Sheet SBF)');const b=S.bureau;
  $('#main').innerHTML=`<div class="stack"><button class="tile" id="bRefresh"><b>${b?'Actualiser le stock':'Charger le stock'}</b><small>${b?'Dernière lecture du Sheet : '+new Date(b.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})+' (conservée sur cet appareil)':'Lecture du Sheet (réseau)'}</small></button>
  <button class="tile light" data-go="bStock" ${b?'':'disabled'}><b>Stock bord de route</b><small>${b?(()=>{const st=b.items.filter(x=>!x.cut&&!x.client);const m=st.reduce((s,x)=>s+(x.m||0),0);return st.length+' billons en stock · '+f3(st.reduce((s,x)=>s+x.v,0))+' m³'+(m?' · '+f2(m)+' € (grilles des lots)':'');})():'—'}</small></button>
  <button class="tile light" data-go="bClients" ${b?'':'disabled'}><b>Lots clients de l’entreprise</b><small>${b?b.clients.filter(c=>c.statut==='propose').length+' à valider · '+b.clients.filter(c=>c.statut==='valide').length+' validés':'—'}</small></button>
  <button class="tile light" data-go="bLots"><b>Lots des techniciens</b><small>${S.lots.filter(l=>l.remote).length} lot(s) chargé(s) depuis le Sheet · consultation, listing, récap, PDF</small></button>
  <button class="tile light" id="bNewCli"><b>Lot client multi-techniciens</b><small>Grumes de plusieurs techniciens et de plusieurs lots (ramasse) · à partir des lots chargés</small></button>
  <button class="tile light" data-go="bKeys"><b>Clés d’accès et liens de configuration</b><small>Une clé par technicien · création, remplacement (téléphone perdu), désactivation</small></button>
  <button class="tile light" id="bGrilles"><b>Grilles de prix communes</b><small>${S.grilles.filter(g=>g.src==='sheet').length} grille(s) sur le Sheet · diffusées à tous les téléphones</small></button></div>`;
  $('#bRefresh').onclick=async()=>{toast('Lecture du Sheet…');if(await loadStock())render();};
  $('#bGrilles').onclick=()=>{S.mod=null;S.hist.push('bureau');go('grilles');};
  $('#bNewCli').onclick=()=>{if(!S.lots.some(l=>l.remote)){toast('Chargez d’abord les lots des techniciens');return;}S.mod='grumes';S.hist.push('bureau');go('clients');};
  foot('');if(!b)$('#bRefresh').click();};
V.bStock=()=>{const b=S.bureau;if(!b){back();return;}head('Stock bord de route',b.items.length+' billons connus');const f=S.bF||(S.bF={q:'',st:'stock',ess:''});
  const ess=[...new Set(b.items.map(x=>x.ess))].sort();
  $('#main').innerHTML=`<div class="stack"><input id="bq" type="search" placeholder="N° Xylolink, chantier, n° grume, commune…" value="${esc(f.q)}">
  <div class="row"><select id="bst"><option value="stock"${f.st==='stock'?' selected':''}>En stock</option><option value="propose"${f.st==='propose'?' selected':''}>Proposés (à valider)</option><option value="vendu"${f.st==='vendu'?' selected':''}>Vendus</option><option value="recoupe"${f.st==='recoupe'?' selected':''}>Recoupés</option><option value=""${f.st===''?' selected':''}>Tous</option></select>
  <select id="bess"><option value="">Toutes essences</option>${ess.map(e=>`<option${e===f.ess?' selected':''}>${esc(e)}</option>`).join('')}</select></div><div id="bres"></div></div>`;
  const draw=()=>{const w=f.q.toLowerCase().split(/\s+/).filter(Boolean);const rows=b.items.filter(it=>{const s=it.cut?'recoupe':it.client?(it.client.statut==='valide'?'vendu':'propose'):'stock';if(f.st&&s!==f.st)return false;if(f.ess&&it.ess!==f.ess)return false;const h=(it.orig+' '+it.num+' '+it.ess+' '+it.q+' '+it.date+' '+it.op).toLowerCase();return w.every(x=>h.includes(x));});
    const byLot={};rows.forEach(it=>{const k=it.orig||it.lotId;(byLot[k]=byLot[k]||[]).push(it);});const tot=rows.reduce((s,x)=>s+x.v,0),totM=rows.reduce((s,x)=>s+(x.m||0),0);
    $('#bres').innerHTML=`<p class="muted">${rows.length} billon(s) · ${f3(tot)} m³${totM?' · '+f2(totM)+' € (prix des grilles de lot)':''}</p>`+Object.entries(byLot).map(([k,its])=>`<h2>${esc(k)} · ${its.length} · ${f3(its.reduce((s,x)=>s+x.v,0))} m³${its.some(x=>x.m!=null)?' · '+f2(its.reduce((s,x)=>s+(x.m||0),0))+' €':''}</h2><div class="tbl"><table><tr><th>N°</th><th>Ess.</th><th>Q</th><th class="n">L m</th><th class="n">Ø</th><th class="n">m³</th><th class="n">€/m³</th><th class="n">€</th><th>Statut</th></tr>${its.map(it=>`<tr><td>${esc(it.num)}${it.parent?' <span class="muted">(de '+esc(it.parent)+')</span>':''}</td><td>${esc(it.ess)}</td><td>${esc(it.q)}</td><td class="n">${f2(it.lm)}</td><td class="n">${it.d}</td><td class="n">${f3(it.v)}</td><td class="n">${it.p!=null?f2(it.p):'—'}</td><td class="n">${it.m!=null?f2(it.m):'—'}</td><td>${it.cut?'<span class="pill">recoupé</span>':it.client?`<span class="pill${it.client.statut==='valide'?'':' warn'}">${it.client.statut==='valide'?'vendu':'proposé'} · ${esc(it.client.client)}</span>`:'<span class="muted">stock</span>'}</td></tr>`).join('')}</table></div>`).join('');};
  $('#bq').oninput=e=>{f.q=e.target.value;draw();};$('#bst').onchange=e=>{f.st=e.target.value;draw();};$('#bess').onchange=e=>{f.ess=e.target.value;draw();};draw();foot('');};
/* ---------- Bureau : lots des techniciens (copies en lecture seule des lots du Sheet) ---------- */
async function loadRemoteLots(){const set=statusBox();set('Lecture du Sheet SBF…','Tous les lots sauvegardés par les techniciens',false);const url=S.params.syncUrl;
  try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),180000);const res=await fetch(url+(url.includes('?')?'&':'?')+'action=restore&all=1&key='+encodeURIComponent(apiKey()),{signal:ctl.signal});clearTimeout(to);
    const j=await res.json();if(!j.ok)throw new Error(j.error==='action inconnue'?'Script du Sheet à mettre à jour':j.error||'refusé');let n=0,upd=0,ng=0;const seen=new Set();
    for(const r of j.lots||[]){if(!r.json)continue;let o;try{o=JSON.parse(r.json);}catch(e){continue;}const l=o.lot||o;if(!l||!l.id)continue;seen.add(l.id);const ex=S.lots.find(x=>x.id===l.id);if(ex&&!ex.remote)continue;
      for(const g of o.grilles||[])if(!S.grilles.find(x=>x.id===g.id)){S.grilles.push(g);await saveGrille(g);ng++;}
      l.remote=true;l.readonly=true;l.sync='done';l.synced=r.updated||l.synced;l.archive=false;delete l.test;if(ex){S.lots[S.lots.indexOf(ex)]=l;upd++;}else{S.lots.push(l);n++;}await DB.put('lots',l);}
    for(const l of S.lots.filter(x=>x.remote&&!seen.has(x.id))){S.lots=S.lots.filter(x=>x!==l);await DB.del('lots',l.id);}
    S.remoteAt=new Date().toISOString();set('✓ Lots des techniciens chargés',(n+upd)+' lot(s) ('+n+' nouveaux, '+upd+' actualisés)'+(ng?' · '+ng+' grille(s)':'')+'. Copies en lecture seule : les techniciens restent responsables de leurs lots.',true);render();}
  catch(e){set('Échec',e.name==='AbortError'?'Le réseau ne répond pas.':e.message,true,true);}}
V.bLots=()=>{head('Lots des techniciens','Copies en lecture seule depuis le Sheet');const qy=S.bLotQ||'';const ls0=S.lots.filter(l=>l.remote);
  $('#main').innerHTML=`<button class="tile" id="bLoad"><b>${ls0.length?'Actualiser les lots depuis le Sheet':'Charger les lots depuis le Sheet'}</b><small>${S.remoteAt?'Dernier chargement : '+new Date(S.remoteAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'Lecture du Sheet (réseau)'}</small></button>
  <input id="blq" type="search" placeholder="Rechercher : opérateur, n° Xylolink, chantier, commune, date…" value="${esc(qy)}" style="margin:10px 0"><div class="list" id="bll"></div>`;
  const draw=()=>{const words=($('#blq').value||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/\s+/).filter(Boolean);
    const ls=ls0.filter(l=>{const hay=[l.operateur,l.xylo,l.chantier,l.commune,l.dept,l.date,l.type==='grumes'?'grumes cubage':'pied estimation'].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');return words.every(w=>hay.includes(w));}).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
    $('#bll').innerHTML=ls.length?ls.map(l=>{const t=lotTotals(l);return `<button class="item" data-open="${l.id}"><div class="t"><b><span class="pill">${esc(l.operateur||'?')}</span> ${l.xylo?esc(l.xylo)+' · ':''}${esc(l.chantier||'Sans nom')}</b><small>${l.type==='grumes'?'Cubage':'Sur pied'} · ${esc((l.date||'').split('-').reverse().join('/'))}${l.commune?' · '+esc(l.commune):''} · ${t.n} ${l.type==='grumes'?'grumes · '+t.nb+' billons':'tiges'}</small></div><div class="v">${f3(t.v)} m³</div></button>`;}).join(''):`<p class="muted">${ls0.length?'Aucun lot ne correspond.':'Aucun lot chargé.'}</p>`;
    $('#bll').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{S.lot=S.lots.find(l=>l.id===b.dataset.open);S.mod=S.lot.type;S.slFilter='';S.hist.push('bLots');go('lot');});};
  $('#bLoad').onclick=loadRemoteLots;$('#blq').oninput=()=>{S.bLotQ=$('#blq').value;draw();};draw();foot('');};
/* ---------- Bureau : clés d'accès (onglet CLES du Sheet) ---------- */
const newKey=()=>{const a=new Uint8Array(18);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const cfgLink=(cle,role)=>location.origin+location.pathname+'#cfg='+btoa(unescape(encodeURIComponent(JSON.stringify(role==='bureau'?{u:S.params.syncUrl,k:'',b:cle}:{u:S.params.syncUrl,k:cle,b:''})))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function keysApi(body){const url=S.params.syncUrl;const res=body?await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({key:apiKey()},body))}):await fetch(url+(url.includes('?')?'&':'?')+'action=keys&key='+encodeURIComponent(apiKey()));const j=await res.json();if(!j.ok)throw new Error(j.error==='action inconnue'?'Script du Sheet à mettre à jour (version 2.5)':j.error||'refusé');return j;}
V.bKeys=()=>{head('Clés d’accès','Une clé = un technicien ou un poste bureau');const ks=S.keys;
  $('#main').innerHTML=`<div class="stack"><div class="card stack"><h2>Nouvelle clé</h2><div class="row"><label class="f grow"><span class="l">Opérateur (prénom / initiales)</span><input id="kOp" autocapitalize="characters"></label><label class="f" style="flex:0 0 140px"><span class="l">Rôle</span><select id="kRole"><option value="terrain">Terrain</option><option value="bureau">Bureau</option></select></label></div><button class="btn primary big block" id="kNew">Créer la clé et le lien</button></div>
  <div id="kList">${ks?(ks.length?ks.map(k=>`<div class="card stack" data-k="${esc(k.cle)}"><div class="row"><div class="grow"><b>${esc(k.operateur||'(sans opérateur)')}</b> <span class="pill${String(k.actif||'oui').toLowerCase().startsWith('non')?' warn':''}">${String(k.actif||'oui').toLowerCase().startsWith('non')?'désactivée':'active'}</span> <span class="muted">· ${esc(k.role||'terrain')}${k.cree_le?' · créée le '+new Date(k.cree_le).toLocaleDateString('fr-FR'):''}</span>${k.note?`<br><span class="muted">${esc(k.note)}</span>`:''}</div></div>
    <div class="row"><button class="btn grow" data-link="${esc(k.cle)}">Lien de configuration</button>${String(k.actif||'oui').toLowerCase().startsWith('non')?`<button class="btn grow" data-act="${esc(k.cle)}" data-v="1">Réactiver</button>`:`<button class="btn grow" data-rep="${esc(k.cle)}">Remplacer (tél. perdu)</button><button class="btn danger grow" data-act="${esc(k.cle)}" data-v="0">Désactiver</button>`}</div></div>`).join(''):'<p class="muted">Aucune clé dans l’onglet CLES. Les clés maîtres du script continuent de fonctionner.</p>'):'<p class="muted">Chargement…</p>'}</div></div>`;
  const reload=async()=>{try{S.keys=(await keysApi()).keys||[];render();}catch(e){toast(e.message);}};if(!ks)reload();
  const showLink=(k)=>{const role=(S.keys.find(x=>x.cle===k)||{}).role||'terrain';const link=cfgLink(k,role);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>Lien de configuration · ${esc((S.keys.find(x=>x.cle===k)||{}).operateur||'')}</b><p class="muted" style="margin:0">À ouvrir une fois sur le téléphone (Safari ou Chrome), puis « Ajouter à l’écran d’accueil ». Sur iPhone : copier le lien et le coller dans Paramètres › « Coller le lien de configuration ».</p><textarea rows="4" style="width:100%;font-size:12px" readonly>${esc(link)}</textarea><div class="row"><button type="button" class="btn grow" id="kCopy">Copier</button>${navigator.share?'<button type="button" class="btn grow" id="kShare">Partager</button>':''}<button type="button" class="btn primary grow" id="kOk">Fermer</button></div></div>`;document.body.appendChild(m);
    m.querySelector('#kCopy').onclick=async()=>{try{await navigator.clipboard.writeText(link);toast('Lien copié');}catch(e){m.querySelector('textarea').select();toast('Sélectionnez et copiez le lien');}};if(m.querySelector('#kShare'))m.querySelector('#kShare').onclick=()=>navigator.share({title:'Cubage SBF · configuration',text:link}).catch(()=>{});m.querySelector('#kOk').onclick=()=>m.remove();};
  $('#kNew').onclick=async()=>{const op=$('#kOp').value.trim().toUpperCase();if(!op){toast('Indiquez l’opérateur');return;}const cle=newKey();try{await keysApi({action:'setKey',key_row:{cle,operateur:op,role:$('#kRole').value,actif:true}});S.keys=null;await reload();showLink(cle);}catch(e){toast(e.message);}};
  $('#main').querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>showLink(b.dataset.link));
  $('#main').querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{if(b.dataset.v==='0'&&!b.dataset.c){b.textContent='Confirmer la désactivation';b.dataset.c='1';return;}try{await keysApi({action:'setKey',key_row:{cle:b.dataset.act,actif:b.dataset.v==='1'}});S.keys=null;await reload();}catch(e){toast(e.message);}});
  $('#main').querySelectorAll('[data-rep]').forEach(b=>b.onclick=async()=>{if(!b.dataset.c){b.textContent='Confirmer : nouvelle clé, l’ancienne sera désactivée';b.dataset.c='1';return;}const old=S.keys.find(x=>x.cle===b.dataset.rep);const cle=newKey();
    try{await keysApi({action:'setKey',key_row:{cle:old.cle,actif:false,note:'remplacée le '+new Date().toLocaleDateString('fr-FR')}});await keysApi({action:'setKey',key_row:{cle,operateur:old.operateur,role:old.role||'terrain',actif:true,note:'remplace une clé (téléphone perdu)'}});S.keys=null;await reload();showLink(cle);}catch(e){toast(e.message);}});
  foot('');};
V.bClients=()=>{const b=S.bureau;if(!b){back();return;}head('Lots clients de l’entreprise');
  const cs=[...b.clients].sort((a,x)=>String(x.updated_at||'').localeCompare(String(a.updated_at||'')));
  $('#main').innerHTML=`<div class="list">${cs.length?cs.map(c=>`<button class="item" data-bc="${esc(c.client_id)}"><div class="t"><b>${esc(c.client)} <span class="pill${c.statut==='valide'?'':' warn'}">${STL[c.statut]||c.statut}</span></b><small>${esc(String(c.date||'').slice(0,10).split('-').reverse().join('/'))}${c.ref?' · '+esc(c.ref):''} · ${c.nb_billons} billon(s) · ${esc(c.operateur||'')}</small></div><div class="v">${f3(Number(c.volume_m3)||0)} m³${c.montant!==''&&c.montant!=null?'<br>'+f2(Number(c.montant))+' €':''}</div></button>`).join(''):'<p class="muted">Aucun lot client envoyé.</p>'}</div>`;
  $('#main').querySelectorAll('[data-bc]').forEach(x=>x.onclick=()=>{S.bCli=x.dataset.bc;S.hist.push('bClients');go('bClient');});foot('');};
V.bClient=()=>{const b=S.bureau,c=b&&b.clients.find(x=>String(x.client_id)===S.bCli);if(!c){back();return;}head(c.client,STL[c.statut]||c.statut);
  const lines=b.lignes.filter(l=>String(l.client_id)===String(c.client_id));const by=new Map(b.items.map(it=>[it.key,it]));const its=lines.map(l=>{const k=String(l.billon_key);const it=by.get(k);if(it)return it;return{key:k,num:String(l.num||''),ess:String(l.essence||''),q:String(l.qualite||''),lm:Number(l.longueur_m)||0,d:Number(l.diametre_cm)||0,v:Number(l.volume_m3)||0,orig:String(l.origine||''),missing:true};});const nMiss=its.filter(x=>x.missing).length;
  const conf=its.filter(it=>it.cut||(it.client&&it.client.id!==String(c.client_id)));const lp=k=>b.lp[String(c.client_id)+'|'+k]||{};const nm=x=>x===''||x==null?null:Number(x);const totM=its.reduce((s,it)=>s+(nm(lp(it.key).montant)||0),0),hasM=its.some(it=>nm(lp(it.key).montant)!=null);
  $('#main').innerHTML=`<div class="kpi"><div><b>${its.length}</b><small>billons</small></div><div><b>${f3(its.reduce((s,x)=>s+x.v,0))}</b><small>m³</small></div><div><b>${hasM?f2(totM):'—'}</b><small>€ · grille ${esc(c.grille||'aucune')}</small></div></div>
  ${nMiss?`<div class="msg warn" style="margin-top:10px">${nMiss} billon(s) dont le lot d’origine n’est pas (encore) sauvegardé sur le Sheet : statut de stock inconnu. Demandez au téléphone de sauvegarder le lot.</div>`:''}
  ${conf.length?`<div class="msg bad" style="margin-top:10px">⚠ ${conf.length} billon(s) en conflit : ${conf.map(it=>esc(it.num)+(it.cut?' (recoupé)':' ('+esc(it.client.client)+')')).join(', ')}</div>`:''}
  <div class="stack" style="margin-top:12px">${c.statut==='propose'?'<button class="btn primary big" id="bval">Valider la vente</button>':''}${c.statut==='valide'?'<button class="btn" id="bunval">Annuler la validation</button>':''}${c.statut==='annule'?'<button class="btn" id="bunval">Rétablir (proposé)</button>':'<button class="btn danger" id="bann">Annuler ce lot client</button>'}</div>
  <p class="muted">Réf. ${esc(c.ref||'—')} · ${esc(c.note||'')} · saisi par ${esc(c.operateur||'?')}</p>
  ${(()=>{const agg={};its.forEach(it=>{const l=lp(it.key),p=nm(l.prix_m3);const k=[it.orig,it.ess,it.q,p==null?'—':p].join('|');const t=agg[k]||(agg[k]={orig:it.orig,ess:it.ess,q:it.q,p,n:0,v:0,m:0});t.n++;t.v+=it.v;t.m+=nm(l.montant)||0;});const rows=Object.values(agg).sort((a,b)=>a.orig.localeCompare(b.orig)||a.ess.localeCompare(b.ess)||a.q.localeCompare(b.q)||(a.p||0)-(b.p||0));const multi=new Set(rows.map(x=>x.orig)).size>1;let prev='';
    return `<h2>Récapitulatif par essence, qualité et prix</h2><div class="tbl"><table><tr>${multi?'<th>Chantier</th>':''}<th>Ess.</th><th>Q</th><th class="n">€/m³</th><th class="n">Billons</th><th class="n">m³</th><th class="n">€</th></tr>${rows.map(x=>{const first=x.orig!==prev;prev=x.orig;return `<tr>${multi?`<td>${first?'<b>'+esc(x.orig)+'</b>':''}</td>`:''}<td>${esc(x.ess)}</td><td>${esc(x.q||'·')}</td><td class="n">${x.p!=null?f2(x.p):'—'}</td><td class="n">${x.n}</td><td class="n">${f3(x.v)}</td><td class="n">${x.p!=null?f2(x.m):'—'}</td></tr>`;}).join('')}<tr class="tot"><td colspan="${multi?4:3}">Total</td><td class="n">${its.length}</td><td class="n">${f3(its.reduce((s,x)=>s+x.v,0))}</td><td class="n">${hasM?f2(totM):'—'}</td></tr></table></div>`;})()}
  <div class="tbl"><table><tr><th>N°</th><th>Ess.</th><th>Q</th><th class="n">L m</th><th class="n">Ø</th><th class="n">m³</th><th class="n">€/m³</th><th class="n">€</th><th>Origine</th></tr>${its.map(it=>{const l=lp(it.key);return `<tr><td>${esc(it.num)}</td><td>${esc(it.ess)}</td><td>${esc(it.q)}</td><td class="n">${f2(it.lm)}</td><td class="n">${it.d}</td><td class="n">${f3(it.v)}</td><td class="n">${nm(l.prix_m3)!=null?f2(nm(l.prix_m3)):'—'}</td><td class="n">${nm(l.montant)!=null?f2(nm(l.montant)):'—'}</td><td class="muted">${esc(it.orig)}</td></tr>`;}).join('')}${hasM?`<tr class="tot"><td colspan="5">Total</td><td class="n">${f3(its.reduce((s,x)=>s+x.v,0))}</td><td></td><td class="n">${f2(totM)}</td><td></td></tr>`:''}</table></div>`;
  const setSt=async st=>{const set=statusBox();set('Mise à jour…',c.client,false);try{const res=await fetch(S.params.syncUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'setClientStatut',key:apiKey(),client_id:c.client_id,statut:st})});const j=await res.json();if(!j.ok)throw new Error(j.error||'refusé');set('✓ '+STL[st],c.client,true);await loadStock();render();}catch(e){set('Refusé',e.message,true,true);}};
  if($('#bval'))$('#bval').onclick=()=>setSt('valide');if($('#bunval'))$('#bunval').onclick=()=>setSt('propose');if($('#bann'))$('#bann').onclick=e=>{if(!e.target.dataset.c){e.target.textContent='Confirmer l’annulation';e.target.dataset.c='1';return;}setSt('annule');};foot('');};

/* --- Listing --- */
V.listing=()=>{const l=S.lot;const sl=S.slFilter||'';head('Listing',l.chantier);const rows=listing(l,sl);const st=l.type==='grumes'&&!l.isClient?lotStatus(l):{};const hasSt=Object.values(st).some(x=>x.cut||x.client);const hasRed=l.type==='grumes'&&l.grumes.some(g=>g.billons.some(b=>b.rl>0||b.rd>0||(b.note&&b.note.trim())));
  const slSel=(l.sousLots||[]).length?`<select id="slf"><option value="">Tout le lot</option>${l.sousLots.map(s=>`<option value="${s.id}"${s.id===sl?' selected':''}>${esc(s.nom)}</option>`).join('')}</select>`:'';
  const slOpt=id=>`<option value="">—</option>`+(l.sousLots||[]).map(s=>`<option value="${s.id}"${s.id===id?' selected':''}>${esc(s.nom)}</option>`).join('');
  $('#main').innerHTML=`${slSel}<div class="tbl" style="margin-top:8px"><table>${l.type==='grumes'
   ?`<tr><th>N°</th><th>Ess.</th><th>Q</th><th class="n">L m</th><th class="n">Ø cm</th><th class="n">m³</th>${hasRed?'<th>Réduction / note</th>':''}${(l.sousLots||[]).length?'<th>Sous-lot</th>':''}${hasSt?'<th>Statut</th>':''}<th></th></tr>${l.grumes.map(g=>g.billons.map((b,i)=>{if(sl&&b.sl!==sl)return'';const it=st[l.id+'|'+b.id]||{};const stx=it.cut?'<span class="pill">recoupé</span>':it.client?`<span class="pill warn">vendu · ${esc(it.client.client)}</span>`:'';
     const rc=(l.recoupes||[]).find(r=>r.parentKey===l.id+'|'+b.id);
     return `<tr${it.cut?' class="cut"':''}><td>${esc(g.num)}.${b.rang}</td><td>${esc(g.ess)}</td><td>${esc(b.q||'')}</td><td class="n">${f2(lenM(b))}</td><td class="n">${b.d}</td><td class="n">${f3(volB(b))}</td>${hasRed?`<td class="muted">${esc(redTxt(b))}</td>`:''}${(l.sousLots||[]).length?`<td><select data-slb="${g.id}|${b.id}" style="min-height:36px;padding:2px 6px">${slOpt(b.sl)}</select></td>`:''}${hasSt?`<td>${stx}</td>`:''}${i===0?`<td><button type="button" class="chip small" data-editg="${g.id}">✎</button> ${it.cut||it.client?'':`<button type="button" class="chip small" data-delg="${g.id}">✕</button>`}</td>`:'<td></td>'}</tr>`+
     (rc?rc.pieces.map(p=>{const pi=st[l.id+'|'+p.id]||{};const ps=pi.cut?'<span class="pill">recoupé</span>':pi.client?`<span class="pill warn">vendu · ${esc(pi.client.client)}</span>`:'<span class="pill" style="background:var(--card);border:1px solid var(--line)">en stock</span>';return `<tr class="piece"><td>↳ ${esc(p.num)}</td><td>${esc(rc.ess)}</td><td>${esc(p.q||'')}</td><td class="n">${f2(p.lm)}</td><td class="n">${p.d}</td><td class="n">${f3(Calc.volBillon(p.d,p.lm))}</td>${hasRed?'<td></td>':''}${(l.sousLots||[]).length?'<td></td>':''}<td>${ps}</td><td></td></tr>`;}).join(''):'');}).join('')).join('')}`
   :`<tr><th>N°</th><th>Ess.</th><th class="n">Ø</th><th class="n">Cl.</th><th class="n">T</th><th class="n">Tiges</th><th class="n">H m</th><th>Tronçons</th><th class="n">m³</th>${(l.sousLots||[]).length?'<th>Sous-lot</th>':''}<th></th></tr>${l.arbres.map(a=>{if(sl&&a.sl!==sl)return'';const x=arbreCalc(l,a);return `<tr><td>${esc(a.num||'')}</td><td>${esc(a.ess)}</td><td class="n">${a.d}</td><td class="n">${cls(a.ess,a.d)}</td><td class="n">${tarifOf(l,a)}</td><td class="n">${a.n||1}</td><td class="n">${x.h?f1(x.h):'—'}</td><td>${esc(x.tronc.map(t=>t.h+'m '+(t.q||'·')).join(' / '))}</td><td class="n">${f3(x.v)}</td>${(l.sousLots||[]).length?`<td><select data-sla="${a.id}" style="min-height:36px;padding:2px 6px">${slOpt(a.sl)}</select></td>`:''}<td><button type="button" class="chip small" data-edita="${a.id}">✎</button> <button type="button" class="chip small" data-dela="${a.id}">✕</button></td></tr>`;}).join('')}`}
   </table></div><p class="muted">${rows.length} lignes · ${f3(rows.reduce((s,r)=>s+(r.v||0),0))} m³</p>`;
  if($('#slf'))$('#slf').onchange=e=>{S.slFilter=e.target.value;render();};
  const m=$('#main');m.querySelectorAll('[data-editg]').forEach(b=>b.onclick=()=>{S.hist.push('listing');S.form={};go('saisieG',{edit:b.dataset.editg});});
  m.querySelectorAll('[data-edita]').forEach(b=>b.onclick=()=>{S.hist.push('listing');S.form={};go('saisieP',{edit:b.dataset.edita});});
  m.querySelectorAll('[data-delg]').forEach(b=>b.onclick=()=>{if(b.dataset.c){l.grumes=l.grumes.filter(g=>g.id!==b.dataset.delg);save();render();}else{b.textContent='Suppr. ?';b.dataset.c='1';}});
  m.querySelectorAll('[data-dela]').forEach(b=>b.onclick=()=>{if(b.dataset.c){l.arbres=l.arbres.filter(a=>a.id!==b.dataset.dela);save();render();}else{b.textContent='Suppr. ?';b.dataset.c='1';}});
  m.querySelectorAll('[data-slb]').forEach(s=>s.onchange=()=>{const[gi,bi]=s.dataset.slb.split('|');const b=l.grumes.find(g=>g.id===gi).billons.find(x=>x.id===bi);b.sl=s.value||null;save();});
  m.querySelectorAll('[data-sla]').forEach(s=>s.onchange=()=>{l.arbres.find(a=>a.id===s.dataset.sla).sl=s.value||null;save();});
  foot('');};

/* --- Récapitulatif --- */
function slGroups(l){return [...(l.sousLots||[]).map(s=>({id:s.id,nom:s.nom+(s.client?' ('+s.client+')':'')})),{id:NONE,nom:'Non affecté'}];}
function slRecapRows(l){const out=[];let tn=0,tv=0,tm=0,hasM=false;for(const g of slGroups(l)){const r=recap(l,g.id);if(!r.rows.length)continue;const q=qualRecap(r).filter(x=>x.kind==='q');
    q.forEach(x=>out.push({kind:'q',sl:g.nom,ess:x.ess,q:x.q,n:x.n,v:x.v,m:x.m}));out.push({kind:'s',sl:g.nom,n:r.tot.n,v:r.tot.v,m:r.tot.m});tn+=r.tot.n;tv+=r.tot.v;if(r.tot.m!=null){tm+=r.tot.m;hasM=true;}}
  out.push({kind:'t',sl:'Total lot',n:tn,v:tv,m:hasM?tm:null});return out;}
function slRecapHtml(l){const G=l.type==='grumes';const rows=slRecapRows(l);let prev='';
  return `<h2>Récapitulatif par sous-lot</h2><div class="tbl"><table><tr><th>Sous-lot</th><th>Ess.</th><th>Q</th><th class="n">${G?'Billons':'Tiges'}</th><th class="n">m³</th><th class="n">€</th></tr>${rows.map(x=>{if(x.kind==='q'){const first=x.sl!==prev;prev=x.sl;return `<tr><td>${first?'<b>'+esc(x.sl)+'</b>':''}</td><td>${esc(x.ess)}</td><td>${esc(x.q||'·')}</td><td class="n">${x.n}</td><td class="n">${f3(x.v)}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`;}
    return `<tr class="${x.kind==='t'?'tot':'grp'}"><td colspan="3">${x.kind==='t'?'Total lot':'Total '+esc(x.sl)}</td><td class="n">${x.n}</td><td class="n">${f3(x.v)}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`;}).join('')}</table></div>`;}
function origins(v){return [...new Set(v.grumes.map(g=>g.orig||''))];}
function subByOrig(v,o){return{...v,grumes:v.grumes.filter(g=>(g.orig||'')===o)};}
function qualTableHtml(l,r){const G=l.type==='grumes';return `<div class="tbl"><table><tr><th>Ess.</th><th>Qualité</th><th class="n">${G?'Billons':'Tiges'}</th>${G?'<th class="n">Ø moy</th><th class="n">L moy</th>':''}<th class="n">m³</th><th class="n">€/m³ moy</th><th class="n">€</th></tr>${qualRecap(r).map(x=>`<tr${x.kind==='q'?'':` class="${x.kind==='t'?'tot':'grp'}"`}><td${x.kind==='q'?'':' colspan="2"'}>${x.kind==='q'?esc(x.ess):(x.kind==='t'?'Total':'Total '+esc(x.ess))}</td>${x.kind==='q'?`<td>${esc(x.q||'·')}</td>`:''}<td class="n">${x.n}</td>${G?`<td class="n">${f1(x.dm)}</td><td class="n">${f2(x.lm)}</td>`:''}<td class="n">${f3(x.v)}</td><td class="n">${x.pm!=null?f2(x.pm):'—'}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`).join('')}</table></div>`;}
function priceTableHtml(l,r){const G=l.type==='grumes';return `<div class="tbl"><table><tr><th>Ess.</th><th>Q</th><th>Tranche Ø</th><th class="n">€/m³</th><th class="n">${G?'Billons':'Tiges'}</th><th class="n">m³</th><th class="n">€</th></tr>${priceRecap(r).map(x=>x.kind==='p'?`<tr><td>${esc(x.ess)}</td><td>${esc(x.q||'·')}</td><td>${esc(x.lab)}</td><td class="n">${x.p!=null?f2(x.p):'—'}</td><td class="n">${x.n}</td><td class="n">${f3(x.v)}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`:`<tr class="${x.kind==='t'?'tot':'grp'}"><td colspan="4">${x.kind==='t'?'Total':'Total '+esc(x.ess)}</td><td class="n">${x.n}</td><td class="n">${f3(x.v)}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`).join('')}</table></div>`;}
V.recap=()=>{const l=S.lot,sl=S.slFilter||'';head('Récapitulatif',l.chantier);const r=recap(l,sl);
  const slSel=(l.sousLots||[]).length?`<label class="f"><span class="l">Afficher</span><select id="slf"><option value="">Tout le lot</option><option value="*"${sl==='*'?' selected':''}>Par sous-lot (comparatif)</option>${l.sousLots.map(s=>`<option value="${s.id}"${s.id===sl?' selected':''}>Sous-lot : ${esc(s.nom)}</option>`).join('')}<option value="${NONE}"${sl===NONE?' selected':''}>Non affecté</option></select></label>`:'';
  if(sl==='*'){$('#main').innerHTML=slSel+slRecapHtml(l);$('#slf').onchange=e=>{S.slFilter=e.target.value;render();};foot(`<button class="btn" id="pdf">PDF</button><button class="btn" id="xlsx">Excel</button>`);$('#pdf').onclick=()=>exportAsk(l,'pdf');$('#xlsx').onclick=()=>exportAsk(l,'xlsx');return;}
  const G=l.type==='grumes',two=G&&!l.isClient;const rc=two?recap(l,sl,'cli'):null;const gName=g=>g?esc(g.nom):'aucune';
  let html=slSel+(two?`<div class="row" style="margin:8px 0"><span class="muted grow">Grille propriétaire : <b>${gName(r.grille)}</b> · grille client : <b>${gName(rc.grille)}</b>${!sl&&(l.sousLots||[]).some(x=>x.grilleId||x.grilleLocal)?' · grilles propres à certains sous-lots':''}</span><button class="btn" data-go="lotGrille">Changer</button></div>`
    :`<div class="row" style="margin:8px 0"><span class="muted grow">Grille : <b>${gName(r.grille)}</b></span>${l.isClient?'':'<button class="btn" data-go="lotGrille">Changer</button>'}</div>`);
  if(l.type==='pied'&&r.classes.length)html+=`<h2>Par essence et classe de diamètre</h2><div class="tbl"><table><tr><th>Ess.</th><th class="n">Classe</th><th class="n">Ø cm</th><th class="n">Tiges</th><th class="n">H moy m</th><th class="n">m³</th><th class="n">m³/tige</th></tr>${classRecap(r).map(c=>c.kind==='c'?`<tr><td>${esc(c.ess)}</td><td class="n">${c.c}</td><td class="n muted">${clsRange(c.ess,c.c)}</td><td class="n">${c.n}${c.sans?` <span class="pill warn">${c.sans} sans H</span>`:''}</td><td class="n">${f1(c.hm)}</td><td class="n">${f3(c.v)}</td><td class="n">${f3(c.vt)}</td></tr>`:`<tr class="${c.kind==='t'?'tot':'grp'}"><td colspan="3">${c.kind==='t'?'Total':'Total '+esc(c.ess)}</td><td class="n">${c.n}</td><td class="n">${f1(c.hm)}</td><td class="n">${f3(c.v)}</td><td class="n">${f3(c.vt)}</td></tr>`).join('')}</table></div>`;
  if(l.isClient&&origins(l).length>1){for(const o of origins(l)){const sr=recap(subByOrig(l,o),'');html+=`<h2>Chantier ${esc(o||'?')} · par essence et qualité</h2>`+qualTableHtml(l,sr);if(sr.priced)html+=`<h2>Chantier ${esc(o||'?')} · par tranche de prix</h2>`+priceTableHtml(l,sr);}html+='<h2 style="margin-top:24px">Ensemble du lot client</h2>';}
  if(two){/* Deux colonnes de montant : achat (grille propriétaire) et vente (grille client) ; marge en pied si les deux existent */
    const qp=qualRecap(r),qc=qualRecap(rc),pA=r.priced,pV=rc.priced;
    html+=`<h2>Par essence et qualité</h2><div class="tbl"><table><tr><th>Ess.</th><th>Qualité</th><th class="n">Billons</th><th class="n">Ø moy</th><th class="n">L moy</th><th class="n">m³</th>${pA?'<th class="n">Achat €</th>':''}${pV?'<th class="n">Vente €</th>':''}</tr>${qp.map((x,i)=>{const y=qc[i]||{};return `<tr${x.kind==='q'?'':` class="${x.kind==='t'?'tot':'grp'}"`}><td${x.kind==='q'?'':' colspan="2"'}>${x.kind==='q'?esc(x.ess):(x.kind==='t'?'Total':'Total '+esc(x.ess))}</td>${x.kind==='q'?`<td>${esc(x.q||'·')}</td>`:''}<td class="n">${x.n}</td><td class="n">${f1(x.dm)}</td><td class="n">${f2(x.lm)}</td><td class="n">${f3(x.v)}</td>${pA?`<td class="n">${x.m!=null?f2(x.m):'—'}</td>`:''}${pV?`<td class="n">${y.m!=null?f2(y.m):'—'}</td>`:''}</tr>`;}).join('')}</table></div>`;
    if(pA&&pV&&r.tot.m!=null&&rc.tot.m!=null)html+=`<div class="kpi" style="margin-top:8px"><div><b>${f2(r.tot.m)}</b><small>achat € HT</small></div><div><b>${f2(rc.tot.m)}</b><small>vente € HT</small></div><div><b>${f2(rc.tot.m-r.tot.m)}</b><small>marge bois € HT</small></div></div>`;
    if(r.priced)html+=`<h2>Prix propriétaire par tranche · ${gName(r.grille)}</h2>`+priceTableHtml(l,r);
    if(rc.priced)html+=`<h2>Prix client par tranche · ${gName(rc.grille)}</h2>`+priceTableHtml(l,rc);}
  else{html+=`<h2>Par essence et qualité</h2>`+qualTableHtml(l,r);if(r.priced)html+=`<h2>Par tranche de prix de la grille</h2>`+priceTableHtml(l,r);}
  if(!G){html+=`<h2>Par essence, qualité et classe</h2><div class="tbl"><table><tr><th>Ess.</th><th>Q</th><th class="n">Cl.</th><th class="n">Tiges</th><th class="n">m³</th><th class="n">€/m³</th><th class="n">€</th></tr>`;
  let pe='';for(const x of r.rows){if(x.ess!==pe){pe=x.ess;const sub=r.rows.filter(y=>y.ess===pe);html+=`<tr class="grp"><td colspan="4">${esc(pe)}</td><td class="n">${f3(sub.reduce((s,y)=>s+y.v,0))}</td><td></td><td class="n">${sub.some(y=>y.m!=null)?f2(sub.reduce((s,y)=>s+(y.m||0),0)):''}</td></tr>`;}
    html+=`<tr><td>${esc(x.ess)}</td><td>${esc(x.q||'·')}</td><td class="n">${x.c}</td><td class="n">${x.n}</td><td class="n">${f3(x.v)}</td><td class="n">${x.p!=null?f2(x.p):'—'}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`;}
  html+=`<tr class="tot"><td colspan="4">Total</td><td class="n">${f3(r.tot.v)}</td><td></td><td class="n">${r.tot.m!=null?f2(r.tot.m):'—'}</td></tr></table></div>`;}
  $('#main').innerHTML=html;if($('#slf'))$('#slf').onchange=e=>{S.slFilter=e.target.value;render();};
  foot(`<button class="btn" id="pdf">PDF</button><button class="btn" id="xlsx">Excel</button>`);$('#pdf').onclick=()=>exportAsk(l,'pdf',sl);$('#xlsx').onclick=()=>exportAsk(l,'xlsx',sl);};

/* --- Essences et qualités du lot --- */
V.lotRef=()=>{const l=S.lot,p=S.params;head('Essences et qualités',l.chantier);
  const usedE=uniqL(l.type==='grumes'?l.grumes.map(g=>g.ess):l.arbres.map(a=>a.ess));
  const usedQ=uniqL(l.type==='grumes'?l.grumes.flatMap(g=>g.billons.map(b=>b.q)):l.arbres.flatMap(a=>(a.tr||[]).map(t=>t.q)));
  $('#main').innerHTML=`<p class="muted">Touchez pour sélectionner ou retirer. Les codes déjà utilisés dans le lot restent toujours affichés à la saisie.</p>
  <h2>Essences</h2>${multi('essSel',p.essences,lotEss(l))}<h2>Qualités</h2>${multi('qualSel',p.qualites,lotQual(l))}
  <h2>Nouveau code</h2><div class="row"><input id="newE" placeholder="Essence (ex. AUL)" style="flex:1" autocapitalize="characters"><button class="btn" id="addE">Ajouter</button></div>
  <div class="row" style="margin-top:8px"><input id="newQ" placeholder="Qualité (ex. C+)" style="flex:1" autocapitalize="characters"><button class="btn" id="addQ">Ajouter</button></div>`;
  bindMulti();
  const persist=()=>{l.essSel=uniqL([...readMulti('essSel'),...usedE]);l.qualSel=uniqL([...readMulti('qualSel'),...usedQ]);save();};
  $('#main').querySelectorAll('[data-multi]').forEach(c=>c.addEventListener('click',persist));
  const addNew=(inp,isE)=>{const v=$(inp).value.trim().toUpperCase();if(!v)return;const all=isE?p.essences:p.qualites;if(!all.includes(v)){all.push(v);saveParams();}persist();const k=isE?'essSel':'qualSel';l[k]=uniqL([...l[k],v]);save();render();};
  $('#addE').onclick=()=>addNew('#newE',true);$('#addQ').onclick=()=>addNew('#newQ',false);
  foot(`<button class="btn primary big" id="done">Terminé</button>`);$('#done').onclick=()=>{persist();back();};};

/* --- Sous-lots --- */
V.sousLots=()=>{const l=S.lot;head('Sous-lots',l.chantier);l.sousLots=l.sousLots||[];const G=l.type==='grumes';
  const stat=id=>{let n=0,v=0;if(G){for(const g of l.grumes)for(const b of g.billons)if(slMatch(b.sl,id)){n++;v+=volB(b);}}else{for(const a of l.arbres)if(slMatch(a.sl,id)){n+=a.n||1;const x=arbreCalc(l,a);v+=x.v||0;}}return `${n} ${G?'billons':'tiges'} · ${f3(v)} m³`;};
  $('#main').innerHTML=`<p class="muted">Pendant la saisie, choisissez le sous-lot en haut de l’écran : il reste sélectionné pour les ${G?'grumes':'tiges'} suivantes. Ici, vous pouvez aussi affecter après coup.</p>
  <div class="stack">${l.sousLots.map((s,i)=>`<div class="card stack"><div class="row"><div class="grow"><b>${esc(s.nom)}</b>${s.client?` <span class="muted">· ${esc(s.client)}</span>`:''}<br><span class="muted">${stat(s.id)}</span></div><button type="button" class="chip small" data-del="${s.id}">✕</button></div>
   <label class="f"><span class="l">Grille client (vente)</span><select id="sl${i}Sel"${s.grilleLocal?' disabled':''}><option value="">${G?'Grille client du lot':'Celle du lot'}</option>${S.grilles.filter(g=>g.type===l.type).map(g=>`<option value="${g.id}"${(!s.grilleLocal&&g.id===s.grilleId)?' selected':''}>${esc(g.nom)}</option>`).join('')}</select></label>
   ${s.grilleLocal?`<div class="msg good">Grille propre au sous-lot : « ${esc(s.grilleLocal.nom)} » (${(s.grilleLocal.lignes||[]).length} ligne${(s.grilleLocal.lignes||[]).length>1?'s':''}). <div class="row" style="margin-top:8px"><button type="button" class="btn primary" id="sl${i}Edit">Modifier</button><button type="button" class="btn danger" id="sl${i}Drop">Retirer</button></div></div>`
   :`<div class="row"><button type="button" class="btn grow" id="sl${i}Copy"${catGrille(s.grilleId)?'':' disabled'}>Copier dans le sous-lot pour modifier</button><button type="button" class="btn grow" id="sl${i}New">Grille propre au sous-lot</button></div>`}
   <button type="button" class="btn primary" data-assign="${s.id}">Affecter des ${G?'grumes':'tiges'}</button></div>`).join('')}
  ${l.sousLots.length?`<div class="card"><b>Non affecté</b><br><span class="muted">${stat(NONE)}</span></div>`:''}</div>
  <h2>Nouveau sous-lot</h2><div class="card stack"><label class="f"><span class="l">Nom du sous-lot</span><input id="nom" placeholder="ex. Scierie X"></label><label class="f"><span class="l">Client</span><input id="cli"></label><label class="f"><span class="l">Grille client (vente)</span><select id="slg"><option value="">${G?'Grille client du lot':'Celle du lot'}</option>${S.grilles.filter(g=>g.type===l.type).map(g=>`<option value="${g.id}">${esc(g.nom)}</option>`).join('')}</select></label><button class="btn primary" id="add">Ajouter</button></div>`;
  l.sousLots.forEach((s,i)=>bindGrilleSlot(s,'grilleId','grilleLocal',l.type,'sl'+i,n=>n?n+' ('+s.nom+')':'Prix '+(s.client||s.nom),{sl:s.id}));
  $('#add').onclick=()=>{const n=$('#nom').value.trim();if(!n)return;l.sousLots.push({id:uid(),nom:n,client:$('#cli').value.trim(),grilleId:$('#slg').value||null});save();render();};
  $('#main').querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>{S.hist.push('sousLots');go('slAssign',{slTarget:b.dataset.assign});});
  $('#main').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{if(!b.dataset.c){b.textContent='Suppr. ?';b.dataset.c='1';return;}const id=b.dataset.del;l.sousLots=l.sousLots.filter(s=>s.id!==id);if(l.slCur===id)l.slCur=null;l.grumes.forEach(g=>g.billons.forEach(x=>{if(x.sl===id)x.sl=null;}));l.arbres.forEach(a=>{if(a.sl===id)a.sl=null;});save();render();});foot('');};

/* --- Affectation à un sous-lot --- */
V.slAssign=()=>{const l=S.lot,id=S.slTarget,G=l.type==='grumes';const s0=l.sousLots.find(x=>x.id===id);if(!s0){back();return;}head('Affecter à '+s0.nom,l.chantier);
  const items=G?l.grumes.map(g=>{const u=[...new Set(g.billons.map(b=>b.sl||null))];return{id:g.id,num:g.num,lab:`${g.num} · ${g.ess}`,sub:g.billons.map(b=>b.q||'·').join('/')+' · '+f3(g.billons.reduce((x,b)=>x+volB(b),0))+' m³',sl:u.length===1?u[0]:'mixte'};})
    :l.arbres.map((a,i)=>({id:a.id,num:a.num||String(i+1),lab:`${a.num?a.num+' · ':''}${a.ess} Ø${a.d}${(a.n||1)>1?' ×'+a.n:''}`,sub:a.h?a.h+' m':'',sl:a.sl||null}));
  const setSl=(itemId,v)=>{if(G){const g=l.grumes.find(x=>x.id===itemId);g.billons.forEach(b=>b.sl=v);}else{l.arbres.find(x=>x.id===itemId).sl=v;}};
  $('#main').innerHTML=`${G?`<div class="card stack"><b>Par plage de numéros</b><div class="row"><label class="f"><span class="l">Du n°</span><input id="r1" type="text" inputmode="numeric"></label><label class="f"><span class="l">Au n°</span><input id="r2" type="text" inputmode="numeric"></label></div><button type="button" class="btn primary" id="range">Affecter la plage à ${esc(s0.nom)}</button></div>`:''}
  <h2>Toucher pour affecter ou retirer</h2><div class="list">${items.map(it=>{const on=it.sl===id;return `<button type="button" class="item${on?' on':''}" data-it="${it.id}"><span class="tick">${on?'✓':''}</span><div class="t"><b>${esc(it.lab)}</b><small>${esc(it.sub)}</small></div><span class="pill${it.sl&&!on?' warn':''}">${on?esc(s0.nom):it.sl==='mixte'?'réparti':it.sl?esc(slName(l,it.sl)):'—'}</span></button>`;}).join('')||'<p class="muted">Rien à affecter.</p>'}</div>`;
  $('#main').querySelectorAll('[data-it]').forEach(b=>b.onclick=()=>{const it=items.find(x=>x.id===b.dataset.it);setSl(it.id,it.sl===id?null:id);save();render();});
  if($('#range'))$('#range').onclick=()=>{const a=Number(($('#r1').value||'').replace(/\D/g,'')),z=Number(($('#r2').value||'').replace(/\D/g,''))||a;if(!a){toast('Indiquez un n° de début');return;}let n=0;for(const it of items){const k=Number(it.num);if(k>=Math.min(a,z)&&k<=Math.max(a,z)){setSl(it.id,id);n++;}}save();toast(n+' grume(s) affectée(s) à '+s0.nom);render();};
  foot(`<button class="btn primary big" id="done">Terminé</button>`);$('#done').onclick=back;};

/* --- Grilles du lot : propriétaire (achat) et client (vente). Chaque emplacement : grille du catalogue ou copie locale modifiable --- */
/* Bloc générique d'un emplacement de grille : obj porte idKey (grille catalogue) et locKey (copie locale) ; edit = paramètres de V.grille pour éditer la copie */
function grilleSlotHtml(obj,idKey,locKey,type,pfx,titre,aide){const loc=obj[locKey],cat=catGrille(obj[idKey]);
  return `<div class="card stack"><h2 style="margin:0">${titre}</h2>${aide?`<span class="muted">${aide}</span>`:''}
  <label class="f"><span class="l">Grille du catalogue</span><select id="${pfx}Sel"${loc?' disabled':''}><option value="">Aucune</option>${S.grilles.filter(g=>g.type===type).map(g=>`<option value="${g.id}"${(!loc&&g.id===obj[idKey])?' selected':''}>${esc(g.nom)}</option>`).join('')}</select></label>
  ${loc?`<div class="msg good">Grille propre à ce lot : « ${esc(loc.nom)} » (${(loc.lignes||[]).length} ligne${(loc.lignes||[]).length>1?'s':''}). <div class="row" style="margin-top:8px"><button type="button" class="btn primary" id="${pfx}Edit">Modifier</button><button type="button" class="btn danger" id="${pfx}Drop">Retirer</button></div></div>`
  :`<div class="row"><button type="button" class="btn grow" id="${pfx}Copy"${cat?'':' disabled'}>Copier « ${esc(cat?cat.nom:'…')} » dans le lot pour la modifier</button><button type="button" class="btn grow" id="${pfx}New">Créer une grille propre au lot</button></div>`}</div>`;}
function bindGrilleSlot(obj,idKey,locKey,type,pfx,nomLocal,edit){const persist=()=>save(S.lot);
  $('#'+pfx+'Sel').onchange=e=>{obj[idKey]=e.target.value||null;obj[locKey]=null;persist();render();};
  const openEdit=()=>{S.hist.push(S.screen);go('grille',{gEdit:edit});};
  if($('#'+pfx+'Copy'))$('#'+pfx+'Copy').onclick=()=>{const g=catGrille(obj[idKey]);if(!g)return;obj[locKey]=JSON.parse(JSON.stringify({...g,id:'loc-'+uid(),nom:nomLocal(g.nom),src:''}));persist();openEdit();};
  if($('#'+pfx+'New'))$('#'+pfx+'New').onclick=()=>{obj[locKey]={id:'loc-'+uid(),nom:nomLocal(''),type,lignes:[]};persist();openEdit();};
  if($('#'+pfx+'Edit'))$('#'+pfx+'Edit').onclick=openEdit;
  if($('#'+pfx+'Drop'))$('#'+pfx+'Drop').onclick=e=>{if(!e.target.dataset.c){e.target.textContent='Confirmer : la grille propre au lot sera perdue';e.target.dataset.c='1';return;}obj[locKey]=null;persist();render();};}
V.lotGrille=()=>{const l=S.lot;head(l.type==='grumes'?'Grilles de prix du lot':'Grille du lot',l.chantier);const G=l.type==='grumes';
  $('#main').innerHTML=(G?`<p class="muted">Le propriétaire ne voit jamais la grille client et inversement : chaque bordereau n’utilise que la grille de son destinataire.</p>`:'')
   +grilleSlotHtml(l,'grilleId','grilleLocal',l.type,'gp',G?'Grille propriétaire (achat)':'Grille de prix',G?'Prix payés au propriétaire, bordereau de cubage propriétaire.':'')
   +(G?grilleSlotHtml(l,'grilleCliId','grilleCliLocal',l.type,'gc','Grille client (vente)','Prix de vente par défaut pour tout le lot ; un sous-lot peut avoir sa propre grille client (écran Sous-lots).'):'');
  bindGrilleSlot(l,'grilleId','grilleLocal',l.type,'gp',n=>n?n+' (lot)':'Prix propriétaire '+(l.chantier||''),{local:true});
  if(G)bindGrilleSlot(l,'grilleCliId','grilleCliLocal',l.type,'gc',n=>n?n+' (lot)':'Prix client '+(l.chantier||''),{cliLocal:true});foot('');};

/* --- Catalogue de grilles --- */
V.grilles=()=>{const m=S.mod;head('Grilles de prix',m?MODS[m].t:'');
  $('#main').innerHTML=`<div class="list">${S.grilles.filter(g=>!m||g.type===m).map(g=>`<button class="item" data-g="${g.id}"><div class="t"><b>${esc(g.nom)} <span class="pill">${g.type}</span>${g.src==='sheet'?' <span class="pill">Sheet SBF</span>':''}</b><small>${(g.lignes||[]).length} lignes</small></div><span class="v">›</span></button>`).join('')||'<p class="muted">Aucune grille.</p>'}</div>
  <div class="row" style="margin-top:12px">${!m||m==='grumes'?'<button class="btn primary grow" data-new="grumes">+ Grille grumes</button>':''}${!m||m==='pied'?'<button class="btn primary grow" data-new="pied">+ Grille sur pied</button>':''}</div>
  ${isBureau()?`<h2>Grilles communes (Sheet SBF)</h2><p class="muted" style="margin:0 0 8px">Créées ici, enregistrées sur le Sheet, reçues par tous les techniciens avec « Mettre à jour depuis le Sheet ».</p><div class="row">${!m||m==='grumes'?'<button class="btn grow" data-newS="grumes">+ Grille commune grumes</button>':''}${!m||m==='pied'?'<button class="btn grow" data-newS="pied">+ Grille commune sur pied</button>':''}</div>`:''}`;
  $('#main').querySelectorAll('[data-newS]').forEach(b=>b.onclick=()=>{const g={id:'sheet-'+uid(),nom:'Nouvelle grille commune',type:b.dataset.newS,lignes:[],src:'sheet'};S.grilles.push(g);saveGrille(g);S.hist.push('grilles');go('grille',{gEdit:{id:g.id}});});
  $('#main').querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{S.hist.push('grilles');go('grille',{gEdit:{id:b.dataset.g}});});
  $('#main').querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>{const g={id:uid(),nom:'Nouvelle grille',type:b.dataset.new,lignes:[]};S.grilles.push(g);saveGrille(g);S.hist.push('grilles');go('grille',{gEdit:{id:g.id}});});foot('');};
V.grille=()=>{const e=S.gEdit;const slObj=e.sl?(S.lot.sousLots||[]).find(x=>x.id===e.sl):null;const g=e.cli?S.cli.grilleLocal:e.local?S.lot.grilleLocal:e.cliLocal?S.lot.grilleCliLocal:e.sl?(slObj&&slObj.grilleLocal):S.grilles.find(x=>x.id===e.id);if(!g){back();return;}const isLot=e.local||e.cliLocal||e.sl;const persist=()=>e.cli?save(S.cli):isLot?save():saveGrille(g);
  head(g.nom,e.cli?'Prix de vente €/m³ · propres à ce lot client':e.cliLocal?'Prix de vente client €/m³ · propres à ce lot':e.sl?'Prix de vente €/m³ · propres au sous-lot '+(slObj?slObj.nom:''):e.local?(S.lot.type==='grumes'?'Prix propriétaire €/m³ · propres à ce lot':'Prix €/m³ · propres à ce lot'):'Prix €/m³ · champs vides = toutes');const fromSheet=g.src==='sheet'&&!isLot&&!e.cli;
  const p=S.params;g.lignes=g.lignes||[];
  const qOpts=[...p.qualites,...(g.type==='pied'&&!p.qualites.includes(resteQ())?[resteQ()]:[])];
  $('#main').innerHTML=`<label class="f"><span class="l">Nom</span><input id="nom" value="${esc(g.nom)}"></label>
  ${e.cli?(()=>{const miss=clientMissing(S.cli);return miss.length?`<div class="msg bad" style="margin-top:10px">${miss.length} billon(s) encore sans prix. Pour un prix selon le diamètre, ajoutez une ligne par tranche (Ø min / Ø max).</div>`:'<div class="msg good" style="margin-top:10px">Tous les billons ont un prix.</div>';})():''}${fromSheet?(isBureau()?'<div class="msg good" style="margin-top:10px">Grille commune : vos modifications sont diffusées à tous les téléphones quand vous cliquez « Enregistrer sur le Sheet ».</div>':'<div class="msg warn" style="margin-top:10px">Grille commune du Sheet SBF, gérée par le bureau : un changement fait ici sera remplacé au prochain « Mettre à jour depuis le Sheet ».</div>'):''}<p class="muted" style="margin:10px 0">Un champ vide s’applique à toutes les essences, qualités ou diamètres. Ø min et Ø max portent sur le diamètre mesuré (médian pour les grumes, à 1,30 m sur pied), bornes incluses : par ex. 30 à 39 puis 40 à 49. La ligne la plus précise l’emporte.</p>
  <div class="stack">${g.lignes.map((l,i)=>`<div class="card gl" data-gl="${i}">
   <div class="gl-row"><label class="f"><span class="l">Essence</span><select data-f="ess"><option value="">Toutes</option>${p.essences.map(x=>`<option${x===l.ess?' selected':''}>${esc(x)}</option>`).join('')}</select></label>
   <label class="f"><span class="l">Qualité</span><select data-f="q"><option value="">Toutes</option>${qOpts.map(x=>`<option${x===l.q?' selected':''}>${esc(x)}</option>`).join('')}</select></label>
   <button type="button" class="gl-del" data-del="${i}" aria-label="Supprimer la ligne">✕</button></div>
   <div class="gl-row"><label class="f"><span class="l">Ø min cm</span><input data-f="dmin" type="text" inputmode="numeric" value="${l.dmin??''}"></label>
   <label class="f"><span class="l">Ø max cm</span><input data-f="dmax" type="text" inputmode="numeric" value="${l.dmax??''}"></label>
   <label class="f"><span class="l">Prix €/m³</span><input data-f="prix" type="text" inputmode="decimal" value="${l.prix!=null?String(l.prix).replace('.',','):''}"></label></div>
  </div>`).join('')||'<p class="muted">Aucune ligne. Ajoutez la première.</p>'}</div>
  <div class="row" style="margin-top:12px"><button class="btn primary big grow" id="add">+ Ligne</button>${isLot||e.cli?'':'<button class="btn danger" id="del">Supprimer la grille</button>'}</div>`;
  $('#nom').oninput=x=>{g.nom=x.target.value;persist();};
  $('#main').querySelectorAll('[data-gl]').forEach(tr=>{const l=g.lignes[Number(tr.dataset.gl)];tr.querySelectorAll('[data-f]').forEach(inp=>inp.onchange=()=>{const f=inp.dataset.f;l[f]=(f==='ess'||f==='q')?inp.value:num(inp.value);persist();});});
  $('#main').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{g.lignes.splice(Number(b.dataset.del),1);persist();render();});
  $('#add').onclick=()=>{const last=g.lignes[g.lignes.length-1];g.lignes.push({ess:last?last.ess:'',q:'',dmin:null,dmax:null,prix:null});persist();render();};
  if($('#del'))$('#del').onclick=async x=>{if(x.target.dataset.c){if(fromSheet&&isBureau()){try{const set=statusBox();set('Suppression sur le Sheet…','',false);await keysApi({action:'deleteGrille',code:g.id.replace(/^sheet-/,'')});set('✓ Grille supprimée du Sheet','Les téléphones la perdront à leur prochaine mise à jour.',true);}catch(e){toast(e.message);return;}}
    S.grilles=S.grilles.filter(y=>y!==g);DB.del('grilles',g.id);S.lots.forEach(l=>{let ch=false;if(l.grilleId===g.id){l.grilleId=null;ch=true;}if(l.grilleCliId===g.id){l.grilleCliId=null;ch=true;}(l.sousLots||[]).forEach(x=>{if(x.grilleId===g.id){x.grilleId=null;ch=true;}});if(ch)DB.put('lots',l);});back();}else{x.target.textContent='Confirmer';x.target.dataset.c='1';}};
  foot(fromSheet&&isBureau()?`<button class="btn big" id="ok">Fermer</button><button class="btn primary big" id="pub" style="flex:2">Enregistrer sur le Sheet</button>`:`<button class="btn primary big" id="ok">Terminé</button>`);$('#ok').onclick=back;
  if($('#pub'))$('#pub').onclick=async()=>{const set=statusBox();set('Enregistrement sur le Sheet…',g.nom,false);try{const j=await keysApi({action:'saveGrille',grille:g});set('✓ Grille enregistrée sur le Sheet',g.nom+' · '+j.lignes+' ligne(s). Les techniciens la recevront avec « Mettre à jour depuis le Sheet ».',true);}catch(e){set('Échec',e.message,true,true);}};};

/* --- Paramètres --- */
V.params=()=>{const p=S.params;head('Paramètres');
  $('#main').innerHTML=`<div class="stack">
  <div class="card stack"><h2>Référentiel</h2><label class="f"><span class="l">Essences (séparées par des virgules)</span><input id="ess" value="${esc(p.essences.join(', '))}"></label><label class="f"><span class="l">Qualités</span><input id="qua" value="${esc(p.qualites.join(', '))}"></label>
  <div class="row"><label class="f"><span class="l">Pas des classes (cm)</span><input id="step" type="number" inputmode="numeric" value="${p.step}"></label><label class="f"><span class="l">Classe min</span><input id="cmin" type="number" inputmode="numeric" value="${p.classMin}"></label><label class="f"><span class="l">Classe max</span><input id="cmax" type="number" inputmode="numeric" value="${p.classMax}"></label></div>
  <label class="f"><span class="l">Pas par essence (ex. CH:5, PIN:5)</span><input id="stepE" value="${esc(Object.entries(p.stepParEssence||{}).map(([k,v])=>k+':'+v).join(', '))}"></label></div>
  <div class="card stack"><h2>Saisie</h2><label class="f"><span class="l">Qualité du 1er billon</span><select id="rep"><option value="1"${p.repriseQualite?' selected':''}>Reprend la dernière qualité saisie</option><option value="0"${p.repriseQualite?'':' selected'}>Vide</option></select></label>
  <label class="f"><span class="l">Diamètre sur pied (mode diamètre seul)</span><select id="sd"><option value="classe"${p.saisieDiam==='classe'?' selected':''}>Boutons de classes</option><option value="cm"${p.saisieDiam==='cm'?' selected':''}>Saisie au cm</option></select></label>
  <label class="f"><span class="l">Code qualité du reste de tige (au-dessus des tronçons)</span><input id="rq" value="${esc(p.resteQualite||'BI')}" placeholder="BI"></label>
  ${vocalDispo()?`<label class="f"><span class="l">Mode vocal · mots pour les essences (code : mots, séparés par ;)</span><textarea id="motsV" rows="2" style="width:100%" placeholder="CH: chêne, chêne rouge ; PIN: pin">${esc(p.motsVocaux||'')}</textarea></label>
  <p class="muted" style="margin:0">Facultatif : les codes courants (CH, HET, CHA, PIN, DOU, EP, SAP, PEU, FR…) ont déjà leurs mots ; la colonne « mots_vocaux » de l’onglet ESSENCES du Sheet complète la liste pour tous les téléphones.</p>
  <label class="f"><span class="l">Mode vocal · mots pour les qualités (code : mots, séparés par ;)</span><textarea id="motsVQ" rows="2" style="width:100%" placeholder="AVIVE: avive ; SCA: sciage a">${esc(p.motsVocauxQ||'')}</textarea></label>
  <p class="muted" style="margin:0">Sans indication, un code se dit lettre par lettre (CA → « cé a », CXX → « cé double ixe », ST → « esse té », PA → « pé a »). Seuls les mots connus du modèle français sont reconnus (« avivé » → dire « avive »).</p>
  <label class="f"><span class="l">Mode vocal · mot de départ (chaque phrase doit commencer par ce mot ; vide = aucun)</span><input id="vocMot" value="${esc(p.vocalMot==null?'note':p.vocalMot)}" placeholder="note"></label>
  <label class="f"><span class="l">Mode vocal · ignorer les phrases mal comprises (mots inconnus, faible confiance)</span><select id="vocS"><option value="1"${p.vocalStrict!==false?' selected':''}>Oui (recommandé)</option><option value="0"${p.vocalStrict===false?' selected':''}>Non</option></select></label>
  <label class="f"><span class="l">Mode vocal · annonce de l’essence à voix haute</span><select id="vocA"><option value="1"${p.vocalAnnonce!==false?' selected':''}>Oui (le téléphone répète l’essence quand elle change)</option><option value="0"${p.vocalAnnonce===false?' selected':''}>Non, bips seulement</option></select></label>`:''}
  <label class="f"><span class="l">En-tête des bordereaux (entreprise, adresse…)</span><textarea id="entete" rows="2" style="width:100%">${esc(p.entete||'Services Bois et Forêts SAS\nLoirecopark 1 · 72500 Vaas')}</textarea></label>
  <label class="f"><span class="l">Opérateur${p.opLocked?' <span class="muted">(défini par votre clé d’accès)</span>':''}</span><input id="op" value="${esc(p.operateur)}"${p.opLocked?' disabled':''}></label></div>
  <div class="card stack"><h2>Synchronisation Google Sheet</h2><label class="f"><span class="l">URL du script Apps Script</span><input id="url" value="${esc(p.syncUrl)}" placeholder="https://script.google.com/macros/s/…/exec"></label><label class="f"><span class="l">Clé d’accès</span><input id="key" value="${esc(p.syncKey||'')}"></label><label class="f"><span class="l">Clé bureau (valide les ventes)</span><input id="keyb" value="${esc(p.syncKeyBureau||'')}" placeholder="vide sur les téléphones de terrain"></label><label class="f"><span class="l">Coller le lien de configuration</span><div class="row"><input id="cfgLink" placeholder="https://…#cfg=…" style="flex:1"><button type="button" class="btn primary" id="cfgOk">Valider</button></div></label><p class="muted" style="margin:0">Collez ici le lien reçu du bureau (indispensable sur iPhone). Le référentiel se recharge ensuite à chaque ouverture avec du réseau.</p>
  <div class="row"><button class="btn grow" id="loadRef">Charger le référentiel du Sheet</button><button class="btn grow" id="syncAll">Sauvegarder tous les lots</button></div>${p.refLoaded?`<span class="muted">Référentiel chargé : ${esc(p.refLoaded)}</span>`:''}</div>
  <div class="card stack"><h2>Changement de téléphone</h2><span class="muted">Sur le nouveau téléphone : ouvrir le lien de configuration, renseigner l’opérateur, puis récupérer les lots sauvegardés sur le Sheet. Les lots déjà présents ne sont pas modifiés.</span>
  <div class="row"><button class="btn grow primary" id="restoreMe">Récupérer mes lots depuis le Sheet</button><button class="btn grow" id="restoreAll">Tous les opérateurs</button></div></div>
  ${isBureau()?`<details class="card"><summary><b>Maintenance du Sheet (bureau, clé maître uniquement)</b></summary><div class="stack" style="margin-top:10px"><span class="muted">Vide tous les lots, billons et lots clients du Sheet pour tous les téléphones. Essences, qualités, grilles et clés conservées. Refusé avec une clé bureau nominative : seule la clé maître du script peut le faire.</span><button class="btn danger block" id="bPurge">Vider les lots du Sheet…</button></div></details>`:''}
  <div class="card stack"><h2>Remise à zéro de ce téléphone</h2><span class="muted">Supprime tous les lots (cubage, estimation, lots clients) de ce téléphone. Les paramètres, la configuration et les grilles sont conservés. Le Sheet n’est pas touché.</span><button class="btn danger block" id="wipeLots">Supprimer tous les lots de ce téléphone (${S.lots.length})</button></div>
  <div class="card stack"><h2>Données locales</h2><span class="muted">Copie de secours complète (fichier) : à partager sur Drive, AirDrop ou par mail, puis importer sur l’autre appareil.</span><div class="row"><button class="btn grow" id="exportAll">Exporter tout (JSON)</button><label class="btn grow" for="imp">Importer un fichier JSON</label><input id="imp" type="file" accept=".json,application/json" hidden></div></div>
  </div>`;
  const splitList=v=>v.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  const upd=()=>{p.essences=splitList($('#ess').value);p.qualites=splitList($('#qua').value);p.step=Number($('#step').value)||5;p.classMin=Number($('#cmin').value)||10;p.classMax=Number($('#cmax').value)||90;
    p.stepParEssence={};splitList($('#stepE').value).forEach(x=>{const[k,v]=x.split(':');if(k&&Number(v))p.stepParEssence[k.trim()]=Number(v);});
    p.repriseQualite=$('#rep').value==='1';p.saisieDiam=$('#sd').value;p.resteQualite=$('#rq').value.trim()||'BI';if(!p.opLocked)p.operateur=$('#op').value.trim();
    if($('#motsV'))p.motsVocaux=$('#motsV').value.trim();if($('#motsVQ'))p.motsVocauxQ=$('#motsVQ').value.trim();if($('#vocA'))p.vocalAnnonce=$('#vocA').value==='1';if($('#vocMot'))p.vocalMot=$('#vocMot').value.trim().toLowerCase();if($('#vocS'))p.vocalStrict=$('#vocS').value==='1';p.entete=$('#entete').value;p.syncUrl=$('#url').value.trim();p.syncKey=$('#key').value.trim();p.syncKeyBureau=$('#keyb').value.trim();saveParams();};
  $('#main').querySelectorAll('input,select,textarea').forEach(i=>{if(i.id!=='imp')i.onchange=upd;});
  $('#loadRef').onclick=()=>{upd();loadRefUI();};
  $('#cfgOk').onclick=async()=>{const c=parseCfg($('#cfgLink').value);if(!c){toast('Lien non reconnu : collez le lien complet reçu du bureau');return;}p.syncUrl=c.u;p.syncKey=c.k||'';if(c.b!==undefined)p.syncKeyBureau=c.b||'';await saveParams();const ok=await loadRef(true);toast(ok?'Synchronisation configurée · référentiel chargé':'Configuré · référentiel non chargé (réseau ?)');render();};$('#syncAll').onclick=()=>{upd();syncAllUI();};
  if($('#bPurge'))$('#bPurge').onclick=async()=>{const w=prompt('Cette action vide DÉFINITIVEMENT tous les lots du Sheet (tous les téléphones). Tapez VIDER pour confirmer :');if(w!=='VIDER'){if(w!=null)toast('Annulé');return;}const set=statusBox();set('Suppression en cours…','',false);
    try{const j=await keysApi({action:'purgeLots',confirm:'VIDER'});await DB.del('params','bureau');S.bureau=null;set('✓ Sheet vidé',j.lignes_supprimees+' ligne(s) supprimée(s). Pensez à supprimer aussi les lots d’essai sur chaque téléphone (Remise à zéro).',true);render();}catch(e){set('Échec',e.message,true,true);}};
  $('#wipeLots').onclick=async e=>{if(!e.target.dataset.c){e.target.textContent='Confirmer la suppression définitive de '+S.lots.length+' lot(s)';e.target.dataset.c='1';return;}for(const l of S.lots)await DB.del('lots',l.id);S.lots=[];S.lot=null;S.cli=null;toast('Tous les lots ont été supprimés');render();};
  $('#restoreMe').onclick=()=>{upd();restoreUI(false);};$('#restoreAll').onclick=()=>{upd();restoreUI(true);};
  $('#exportAll').onclick=()=>shareFile(new Blob([JSON.stringify({params:p,grilles:S.grilles,lots:S.lots},null,1)],{type:'application/json'}),'cubage-sbf-'+today()+'.json');
  $('#imp').onchange=e=>{const f=e.target.files[0];if(f)importLotFile(f);};foot('');};

/* ---------- Exports ---------- */
const safe=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'');
const fname=(l,ext,sl)=>(safe(l.chantier||'lot')+(sl?'_'+safe(slName(l,sl)):'')+'_'+l.date+'.'+ext);
/* Export : téléchargement direct (dossier Téléchargements, sans choix d'emplacement) puis fenêtre Ouvrir / Partager */
let lastUrl=null;
function shareFile(blob,name,quiet,onClose){if(quiet){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);return;}
  if(lastUrl)URL.revokeObjectURL(lastUrl);const url=lastUrl=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  const isPdf=/\.pdf$/i.test(name),isJson=/\.json$/i.test(name),kind=isPdf?'PDF':/\.xlsx$/i.test(name)?'Excel':isJson?'Lot (fichier)':'Fichier';
  const file=new File([blob],name,{type:blob.type});const canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="mt">
   <b id="mt">${kind} enregistré</b><p class="muted" style="margin:0">${esc(name)}<br>${isJson?'Envoyez-le au collègue avec « Partager » ; sur son téléphone il l’ouvre par « Importer un lot reçu ».':'Dossier Téléchargements du téléphone.'}</p>
   <div class="stack"><button type="button" class="btn ${canShare&&isJson?'':'primary '}big" id="mOpen"${isJson?' hidden':''}>Ouvrir</button>${canShare?`<button type="button" class="btn ${isJson?'primary ':''}big" id="mShare">Partager (mail, WhatsApp…)</button>`:''}<button type="button" class="btn" id="mClose">Fermer</button></div></div>`;
  document.body.appendChild(m);const close=()=>{m.remove();if(onClose)onClose();};
  m.addEventListener('click',e=>{if(e.target===m)close();});m.querySelector('#mClose').onclick=close;
  m.querySelector('#mOpen').onclick=()=>{const w=window.open(url,'_blank');if(!w)location.href=url;close();};
  if(canShare)m.querySelector('#mShare').onclick=async()=>{try{await navigator.share({files:[file],title:name});}catch(e){}close();};}
/* Choix de l'export quand le lot a des sous-lots */
function exportAsk(l,kind,cur){const fn=kind==='pdf'?exportPDF:exportXLSX;const sls=l.sousLots||[];
  if(!sls.length){fn(l,'');return;}
  const has=id=>l.type==='grumes'?l.grumes.some(g=>g.billons.some(b=>slMatch(b.sl,id))):l.arbres.some(a=>slMatch(a.sl,id));
  const opts=[{id:'',lab:'Tout le lot (avec récap par sous-lot)'},...sls.filter(s=>has(s.id)).map(s=>({id:s.id,lab:'Sous-lot : '+s.nom})),...(has(NONE)?[{id:NONE,lab:'Non affecté'}]:[])];
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>Exporter en ${kind==='pdf'?'PDF':'Excel'}</b>
   <div class="stack">${opts.map(o=>`<button type="button" class="btn${o.id===(cur&&cur!=='*'?cur:'')?' primary':''}" data-x="${o.id}">${esc(o.lab)}</button>`).join('')}
   <button type="button" class="btn add" id="xAll">Chaque sous-lot dans un fichier séparé</button><button type="button" class="btn" id="mClose">Annuler</button></div></div>`;
  document.body.appendChild(m);const close=()=>m.remove();m.addEventListener('click',e=>{if(e.target===m)close();});m.querySelector('#mClose').onclick=close;
  m.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{close();fn(l,b.dataset.x);});
  m.querySelector('#xAll').onclick=()=>{close();const ids=opts.filter(o=>o.id).map(o=>o.id);ids.forEach((id,i)=>setTimeout(()=>{fn(l,id,true);if(i===ids.length-1)toast(ids.length+' fichiers enregistrés dans Téléchargements');},i*700));};}
function exportXLSX(l,sl,quiet){if(!window.XLSX){toast('Module Excel non chargé (ouvrir une fois en ligne)');return;}const r=recap(l,sl),li=listing(l,sl);const wb=XLSX.utils.book_new();
  const lot=[...(l.type==='grumes'?[['N° chantier Xylolink',l.xylo||'']]:[]),['Chantier',l.chantier||''],...(l.type==='grumes'?[['Propriétaire',l.proprietaire||'']]:[]),['Commune',(l.commune||'')+(l.dept?' ('+l.dept+')':'')],['GPS',l.gps?l.gps.lat+', '+l.gps.lon:''],['Lien carte',l.gps?gpsUrl(l.gps):''],['Date',l.date],['Opérateur',l.operateur||''],['Type',l.type==='grumes'?'Grumes bord de route':'Bois sur pied'],['Tarif Chaudé par défaut',l.type==='pied'?l.tarif:''],['Sous-lot',sl?slName(l,sl):'Tout le lot'],[l.type==='grumes'&&!l.isClient?'Grille propriétaire':'Grille de prix',r.grille?r.grille.nom:''],...(l.type==='grumes'&&!l.isClient?[['Grille client',(lotGrilleCli(l)||{}).nom||'']]:[]),['Volume total m³',Math.round(r.tot.v*1000)/1000],['Montant €',r.tot.m!=null?Math.round(r.tot.m*100)/100:'']];
  (l.sousLots||[]).forEach(s=>lot.push(['Sous-lot '+s.nom,s.client||'']));XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(lot),'Lot');
  const L=l.type==='grumes'?(l.isClient?[['N°','Essence','Qualité','Longueur m','Diamètre cm','Classe','Volume m³','Réduction / note','Origine'],...li.map(x=>[x.num,x.ess,x.q,x.l,x.d,x.c,Math.round(x.v*1000)/1000,x.red,x.o])]:[['N°','Essence','Qualité','Longueur m','Diamètre cm','Classe','Volume m³','Réduction / note','Sous-lot'],...li.map(x=>[x.num,x.ess,x.q,x.l,x.d,x.c,Math.round(x.v*1000)/1000,x.red,x.sl])])
    :[['N°','Essence','Diamètre cm','Classe','Tarif Chaudé','Tiges','Hauteur m','Tronçons','Volume m³','Sous-lot'],...li.map(x=>[x.num,x.ess,x.d,x.c,x.t,x.n,x.h,x.tr,x.v!=null?Math.round(x.v*1000)/1000:'',x.sl])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(L),'Listing');
  const R=l.type==='grumes'?[['Essence','Qualité','Classe','Billons','Ø moyen','L moyenne','Volume m³','Prix €/m³','Montant €'],...r.rows.map(x=>[x.ess,x.q,x.c,x.n,x.dm,x.lm,Math.round(x.v*1000)/1000,x.p,x.m!=null?Math.round(x.m*100)/100:''])]
    :[['Essence','Qualité','Classe','Tiges','Volume m³','Prix €/m³','Montant €'],...r.rows.map(x=>[x.ess,x.q,x.c,x.n,Math.round(x.v*1000)/1000,x.p,x.m!=null?Math.round(x.m*100)/100:''])];
  R.push(['Total','','',r.tot.n,...(l.type==='grumes'?['','']:[]),Math.round(r.tot.v*1000)/1000,'',r.tot.m!=null?Math.round(r.tot.m*100)/100:'']);const G=l.type==='grumes';XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Essence','Qualité',G?'Billons':'Tiges',...(G?['Ø moyen cm','L moyenne m']:[]),'Volume m³','Prix moyen €/m³','Montant €'],...qualRecap(r).map(x=>[x.kind==='q'?x.ess:(x.kind==='t'?'Total':'Total '+x.ess),x.kind==='q'?x.q:'',x.n,...(G?[x.dm!=null?Math.round(x.dm*10)/10:'',x.lm!=null?Math.round(x.lm*100)/100:'']:[]),Math.round(x.v*1000)/1000,x.pm!=null?Math.round(x.pm*100)/100:'',x.m!=null?Math.round(x.m*100)/100:''])]),'Récap qualités');
  if(r.prices.some(x=>x.p!=null))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Essence','Qualité','Tranche Ø','Prix €/m³',G?'Billons':'Tiges','Volume m³','Montant €'],...priceRecap(r).map(x=>x.kind==='p'?[x.ess,x.q,x.lab,x.p!=null?x.p:'',x.n,Math.round(x.v*1000)/1000,x.m!=null?Math.round(x.m*100)/100:'']:[x.kind==='t'?'Total':'Total '+x.ess,'','','',x.n,Math.round(x.v*1000)/1000,x.m!=null?Math.round(x.m*100)/100:''])]),'Récap prix');
  if(l.isClient&&origins(l).length>1)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Chantier','Essence','Qualité','Tranche Ø','Prix €/m³','Billons','Volume m³','Montant €'],...[].concat(...origins(l).map(o=>priceRecap(recap(subByOrig(l,o),'')).filter(x=>x.kind!=='e').map(x=>[o,x.kind==='p'?x.ess:'Total',x.kind==='p'?x.q:'',x.kind==='p'?x.lab:'',x.p!=null?x.p:'',x.n,Math.round(x.v*1000)/1000,x.m!=null?Math.round(x.m*100)/100:''])))]),'Récap par chantier');
  if(l.type==='pied')XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(R),'Récap classes');
  if(l.type==='grumes'&&!l.isClient&&lotGrilleCli(l)){const rc=recap(l,sl,'cli');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Grille client',rc.grille?rc.grille.nom:''],['Essence','Qualité','Tranche Ø','Prix vente €/m³','Billons','Volume m³','Montant vente €'],...priceRecap(rc).map(x=>x.kind==='p'?[x.ess,x.q,x.lab,x.p!=null?x.p:'',x.n,Math.round(x.v*1000)/1000,x.m!=null?Math.round(x.m*100)/100:'']:[x.kind==='t'?'Total':'Total '+x.ess,'','','',x.n,Math.round(x.v*1000)/1000,x.m!=null?Math.round(x.m*100)/100:''])]),'Récap vente client');}
  if(!sl&&(l.sousLots||[]).length)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Sous-lot','Essence','Qualité',G?'Billons':'Tiges','Volume m³','Montant €'],...slRecapRows(l).map(x=>[x.kind==='q'?x.sl:(x.kind==='t'?'Total lot':'Total '+x.sl),x.kind==='q'?x.ess:'',x.kind==='q'?x.q:'',x.n,Math.round(x.v*1000)/1000,x.m!=null?Math.round(x.m*100)/100:''])]),'Récap sous-lots');
  if(l.type==='pied')XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Essence','Classe','Diamètres cm','Tiges','Sans hauteur','Hauteur moyenne m','Volume m³','m³/tige'],...classRecap(r).map(c=>[c.kind==='c'?c.ess:(c.kind==='t'?'Total':'Total '+c.ess),c.kind==='c'?c.c:'',c.kind==='c'?clsRange(c.ess,c.c):'',c.n,c.sans||'',c.hm!=null?Math.round(c.hm*10)/10:'',Math.round(c.v*1000)/1000,c.vt!=null?Math.round(c.vt*1000)/1000:''])]),'Classes');
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});shareFile(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),fname(l,'xlsx',sl),quiet);}
function exportPDF(l,sl,quiet){if(!window.jspdf){toast('Module PDF non chargé (ouvrir une fois en ligne)');return;}const{jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4'});
  /* Les polices PDF standard ne connaissent pas l'espace insécable fine du format français (1 234,56) : remplacée par une espace normale */
  const sp=x=>typeof x==='string'?x.replace(/[\u202f\u00a0]/g,' '):x;const at0=doc.autoTable.bind(doc);doc.autoTable=o=>{o.body=(o.body||[]).map(r=>r.map(sp));o.head=(o.head||[]).map(r=>r.map(sp));return at0(o);};const r=recap(l,sl),li=listing(l,sl);
  const title=(l.isClient?'Lot client':l.type==='grumes'?'Cubage grumes bord de route':'Estimation bois sur pied')+(sl?' · '+slName(l,sl):'');
  const hdr=()=>{doc.setFontSize(14);doc.text('SBF — '+title,14,16);doc.setFontSize(9);doc.text(`${l.xylo?'Xylolink : '+l.xylo+'   ':''}Chantier : ${l.chantier||''}${l.commune?'   Commune : '+l.commune+(l.dept?' ('+l.dept+')':''):''}${l.gps?'   GPS : '+l.gps.lat+', '+l.gps.lon:''}   Date : ${l.date}   Opérateur : ${l.operateur||''}`,14,22);};
  hdr();const fr=v=>v==null?'':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3});const fe=v=>v==null?'':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  doc.setFontSize(11);doc.text('Récapitulatif par essence et qualité'+(r.grille?'  —  grille : '+r.grille.nom:''),14,30);
  {const G=l.type==='grumes';const qb=qualRecap(r).map(x=>[x.kind==='q'?x.ess:(x.kind==='t'?'Total':'Total '+x.ess),x.kind==='q'?(x.q||'·'):'',x.n,...(G?[f1(x.dm),f2(x.lm)]:[]),fr(x.v),fe(x.pm),fe(x.m)]);
   doc.autoTable({startY:33,head:[['Essence','Qualité',G?'Billons':'Tiges',...(G?['Ø moy','L moy']:[]),'m³','€/m³ moy','€']],body:qb,styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';}});}
  if(l.isClient&&origins(l).length>1){for(const o of origins(l)){const sr=recap(subByOrig(l,o),'');doc.setFontSize(11);doc.text('Chantier '+(o||'?')+' : par essence, qualité et prix',14,doc.lastAutoTable.finalY+8);
    doc.autoTable({startY:doc.lastAutoTable.finalY+11,head:[['Essence','Qualité','Tranche Ø','€/m³','Billons','m³','€']],body:priceRecap(sr).map(x=>x.kind==='p'?[x.ess,x.q||'·',x.lab,fe(x.p),x.n,fr(x.v),fe(x.m)]:[x.kind==='t'?'Total '+(o||''):'Total '+x.ess,'','','',x.n,fr(x.v),fe(x.m)]),styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'},2:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';}});}}
  if(r.prices.some(x=>x.p!=null)){doc.setFontSize(11);doc.text('Par tranche de prix de la grille',14,doc.lastAutoTable.finalY+8);doc.autoTable({startY:doc.lastAutoTable.finalY+11,head:[['Essence','Qualité','Tranche Ø','€/m³',l.type==='grumes'?'Billons':'Tiges','m³','€']],body:priceRecap(r).map(x=>x.kind==='p'?[x.ess,x.q||'·',x.lab,fe(x.p),x.n,fr(x.v),fe(x.m)]:[x.kind==='t'?'Total':'Total '+x.ess,'','','',x.n,fr(x.v),fe(x.m)]),styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'},2:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';}});}
  if(l.type==='grumes'&&!l.isClient&&lotGrilleCli(l)){/* Lot de cubage avec grille client : récap vente en regard du récap achat */const rc=recap(l,sl,'cli');doc.setFontSize(11);doc.text('Vente client — grille : '+(rc.grille?rc.grille.nom:''),14,doc.lastAutoTable.finalY+8);
    doc.autoTable({startY:doc.lastAutoTable.finalY+11,head:[['Essence','Qualité','Tranche Ø','€/m³','Billons','m³','€']],body:priceRecap(rc).map(x=>x.kind==='p'?[x.ess,x.q||'·',x.lab,fe(x.p),x.n,fr(x.v),fe(x.m)]:[x.kind==='t'?'Total':'Total '+x.ess,'','','',x.n,fr(x.v),fe(x.m)]),styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'},2:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';}});}
  if(l.type==='pied'){doc.setFontSize(11);doc.text('Détail par essence, qualité et classe',14,doc.lastAutoTable.finalY+8);
  const head=[['Essence','Qualité','Classe','Tiges','m³','€/m³','€']];
  const body=r.rows.map(x=>[x.ess,x.q||'·',x.c,x.n,fr(x.v),fe(x.p),fe(x.m)]);
  body.push(['Total','','',r.tot.n,fr(r.tot.v),'',fe(r.tot.m)]);
  doc.autoTable({startY:doc.lastAutoTable.finalY+11,head,body,styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.row.index===body.length-1&&d.section==='body')d.cell.styles.fontStyle='bold';}});}
  if(l.type==='pied'&&r.classes.length){doc.autoTable({startY:doc.lastAutoTable.finalY+6,head:[['Essence','Classe','Ø cm','Tiges','Sans H','H moy','m³','m³/tige']],body:classRecap(r).map(c=>[c.kind==='c'?c.ess:(c.kind==='t'?'Total':'Total '+c.ess),c.kind==='c'?c.c:'',c.kind==='c'?clsRange(c.ess,c.c):'',c.n,c.sans||'',c.hm!=null?f1(c.hm):'',fr(c.v),c.vt!=null?fr(c.vt):'']),didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';},styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'}},headStyles:{fillColor:[31,77,43]}});}
  if(!sl&&(l.sousLots||[]).length){doc.addPage();hdr();doc.setFontSize(11);doc.text('Récapitulatif par sous-lot',14,30);doc.autoTable({startY:33,head:[['Sous-lot','Essence','Qualité',l.type==='grumes'?'Billons':'Tiges','m³','€']],body:slRecapRows(l).map(x=>[x.kind==='q'?x.sl:(x.kind==='t'?'Total lot':'Total '+x.sl),x.kind==='q'?x.ess:'',x.kind==='q'?(x.q||'·'):'',x.n,fr(x.v),fe(x.m)]),styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'},2:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';}});}
  doc.addPage();hdr();doc.setFontSize(11);doc.text('Listing',14,30);
  const lh=l.type==='grumes'?[['N°','Ess.','Q','L m','Ø cm','Cl.','m³','Réduction / note',l.isClient?'Origine':'Sous-lot']]:[['N°','Ess.','Ø cm','Cl.','T','Tiges','H m','Tronçons','m³','Sous-lot']];
  const lb=li.map(x=>l.type==='grumes'?[x.num,x.ess,x.q,f2(x.l),x.d,x.c,fr(x.v),x.red,l.isClient?x.o:x.sl]:[x.num,x.ess,x.d,x.c,x.t,x.n,x.h!=null?f1(x.h):'',x.tr,fr(x.v),x.sl]);
  doc.autoTable({startY:33,head:lh,body:lb,styles:{fontSize:7.5,halign:'right'},columnStyles:l.type==='grumes'?{0:{halign:'left'},1:{halign:'left'},2:{halign:'left'},7:{halign:'left'},8:{halign:'left'}}:{0:{halign:'left'},1:{halign:'left'},7:{halign:'left'},9:{halign:'left'}},headStyles:{fillColor:[31,77,43]}});
  const n=doc.internal.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.text(`Page ${i}/${n}`,196,290,{align:'right'});}
  shareFile(doc.output('blob'),fname(l,'pdf',sl),quiet);}

/* Bordereau client depuis un lot de cubage : choix du sous-lot (ou tout le lot, qui vaut alors un seul client), puis avec / sans prix de la grille client */
function bordereauCliAsk(l){const sls=(l.sousLots||[]);const has=id=>l.grumes.some(g=>g.billons.some(b=>slMatch(b.sl,id)));const opts=[...sls.filter(s=>has(s.id)).map(s=>({id:s.id,lab:s.nom+(s.client&&s.client!==s.nom?' · '+s.client:'')})),...(sls.length&&has(NONE)?[{id:NONE,lab:'Billons non affectés'}]:[]),{id:'',lab:sls.length?'Tout le lot (un seul client)':'Tout le lot'}];
  if(!l.grumes.length){toast('Aucun billon dans ce lot');return;}
  const go1=id=>{const s=sls.find(x=>x.id===id);const hasG=!!grilleFor(l,id&&id!==NONE?id:null,'cli');CubageDocs.bordereauAsk('Bordereau de réception client','Destinataire : '+(s?(s.client||s.nom):'client du lot')+'. Billons livrés, récapitulatif par essence et qualité, prix HT de la grille client si demandé.',hasG,w=>CubageDocs.bordereauClient({lot:l,sl:id},w));};
  if(opts.length===1){go1('');return;}
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>Bordereau client : quel sous-lot ?</b><div class="stack">${opts.map(o=>`<button type="button" class="btn big" data-x="${o.id}">${esc(o.lab)}</button>`).join('')}<button type="button" class="btn" id="mClose">Annuler</button></div></div>`;
  document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)m.remove();});m.querySelector('#mClose').onclick=()=>m.remove();m.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{m.remove();go1(b.dataset.x);});}
/* ---------- Synchronisation ---------- */
const dLoc=iso=>{if(!iso)return['',''];const d=new Date(iso),p=n=>String(n).padStart(2,'0');return[d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()),p(d.getHours())+':'+p(d.getMinutes())];};
function lotRows(l){const LOT=[{lot_id:l.id,type:l.type,chantier_xylolink:l.xylo||'',chantier:l.chantier||'',proprietaire:l.proprietaire||'',commune:l.commune||'',dept:l.dept||'',gps_lat:l.gps?l.gps.lat:'',gps_lon:l.gps?l.gps.lon:'',gps_precision_m:l.gps?l.gps.acc:'',date:l.date,operateur:l.operateur||'',tarif:l.type==='pied'?l.tarif:'',mode:l.type==='pied'?l.mode:'',grille:(lotGrille(l)||{}).nom||'',grille_client:(lotGrilleCli(l)||{}).nom||'',volume_m3:Math.round(lotTotals(l).v*1000)/1000,updated:l.updated||''}];
  const SOUS_LOT=(l.sousLots||[]).map(s=>({lot_id:l.id,sous_lot_id:s.id,nom:s.nom,client:s.client||'',grille:(slGrille(l,s.id)||{}).nom||''}));
  const GRUME=[],BILLON=[],ARBRE=[],TRONCON=[],RECOUPE=[];
  for(const rc of l.recoupes||[])for(const p of rc.pieces)RECOUPE.push({lot_id:l.id,recoupe_id:rc.id,parent_key:rc.parentKey,parent_num:rc.parentNum,essence:rc.ess,date:(rc.at||'').slice(0,10),piece_id:p.id,piece_key:l.id+'|'+p.id,num:p.num,longueur_m:p.lm,diametre_cm:p.d,qualite:p.q||'',volume_m3:Math.round(Calc.volBillon(p.d,p.lm)*10000)/10000,chantier_xylolink:l.xylo||'',chantier:l.chantier||''});
  for(const g of l.grumes){GRUME.push({lot_id:l.id,grume_id:g.id,num:g.num,essence:g.ess});for(const b of g.billons){const sl=(l.sousLots||[]).find(x=>x.id===b.sl),G0=grilleFor(l,b.sl,'prop'),L=prixLine(G0,g.ess,b.q||'',cubD(b)),G1=grilleFor(l,b.sl,'cli'),L1=prixLine(G1,g.ess,b.q||'',cubD(b)),v=Math.round(volB(b)*10000)/10000;
    const [sd,sh]=g.saisi?dLoc(g.saisi):[l.date,''];BILLON.push({lot_id:l.id,chantier_xylolink:l.xylo||'',chantier:l.chantier||'',date:l.date,saisi_le:sd,saisi_heure:sh,commune:l.commune||'',dept:l.dept||'',operateur:l.operateur||'',grume_id:g.id,billon_id:b.id,num:g.num+'.'+b.rang,rang:b.rang,essence:g.ess,qualite:b.q||'',longueur_m:lenM(b),diametre_cm:b.d,reduction_l_cm:b.rl||0,reduction_d_cm:b.rd||0,commentaire:b.note||'',longueur_cubee_m:cubL(b),diametre_cube_cm:cubD(b),classe:cls(g.ess,cubD(b)),volume_m3:v,sous_lot_id:b.sl||'',sous_lot:sl?sl.nom:'',client:sl?sl.client||'':'',grille:G0?G0.nom:'',prix_m3:L?L.prix:'',montant:L?Math.round(L.prix*v*100)/100:'',grille_client:G1?G1.nom:'',prix_vente_m3:L1?L1.prix:'',montant_vente:L1?Math.round(L1.prix*v*100)/100:''});}}
  for(const a of l.arbres){const x=arbreCalc(l,a);const [ad,ah]=a.saisi?dLoc(a.saisi):[l.date,''];ARBRE.push({lot_id:l.id,chantier:l.chantier||'',date:l.date,saisi_le:ad,saisi_heure:ah,arbre_id:a.id,num:a.num||'',essence:a.ess,diametre_cm:a.d,classe:cls(a.ess,a.d),tarif:tarifOf(l,a),tiges:a.n||1,hauteur_m:x.h||'',volume_m3:x.v!=null?Math.round(x.v*10000)/10000:'',sous_lot_id:a.sl||''});
    x.tronc.forEach((t,i)=>TRONCON.push({lot_id:l.id,arbre_id:a.id,rang:i+1,hauteur_m:t.h,qualite:t.q||'',volume_m3:Math.round(t.v*10000)/10000}));}
  // Copie intégrale du lot (JSON découpé en parts de 40 000 caractères) pour pouvoir le récupérer sur un autre téléphone
  const gids=[l.grilleId,l.grilleCliId,...(l.sousLots||[]).map(x=>x.grilleId)].filter(Boolean);const grilles=S.grilles.filter(g=>gids.includes(g.id));
  const txt=JSON.stringify({lot:l,grilles});const LOT_JSON=[];for(let i=0,p=1;i<txt.length;i+=40000,p++)LOT_JSON.push({lot_id:l.id,part:p,total:Math.ceil(txt.length/40000),data:txt.slice(i,i+40000)});
  return{LOT,SOUS_LOT,GRUME,BILLON,ARBRE,TRONCON,RECOUPE,LOT_JSON};}
/* Fenêtre d'état pour la sauvegarde : en cours, réussie ou en échec */
function statusBox(){document.querySelectorAll('.modal').forEach(x=>{if(x.querySelector('#sbT'))x.remove();});const m=document.createElement('div');m.className='modal';m.innerHTML='<div class="modal-box"><b id="sbT"></b><p id="sbM" style="margin:0"></p><button type="button" class="btn primary big" id="sbOk" hidden>OK</button></div>';document.body.appendChild(m);
  const set=(t,msg,done,bad)=>{m.querySelector('#sbT').textContent=t;m.querySelector('#sbT').style.color=bad?'var(--bad)':'';m.querySelector('#sbM').textContent=msg;m.querySelector('#sbOk').hidden=!done;};m.querySelector('#sbOk').onclick=()=>m.remove();return set;}
async function syncLot(l,quiet){const url=S.params.syncUrl;if(l.readonly){if(!quiet){const set=statusBox();set('Lot en lecture seule','Ce lot a été envoyé à un collègue : c’est lui qui le sauvegarde. « Reprendre la main » dans la fiche du lot si nécessaire.',true,true);}return false;}if(l.test){if(!quiet){const set=statusBox();set('Lot d’essai','Ce lot a été créé comme lot d’essai : il n’est jamais envoyé sur le Sheet.',true,true);}return false;}
  if(!url){if(!quiet){const set=statusBox();set('Synchronisation non configurée','Ouvrez une fois le lien de configuration envoyé par le bureau.',true,true);}return false;}
  if(!navigator.onLine){l.sync='pending';DB.put('lots',l);if(!quiet){const set=statusBox();set('Pas de réseau','Le lot reste enregistré sur le téléphone. Relancez la sauvegarde quand vous aurez du réseau.',true,true);}return false;}
  if(l.type==='grumes'&&!l.xylo){if(!quiet){const st=statusBox();st('N° de chantier Xylolink manquant','Renseignez-le dans la fiche du lot avant de sauvegarder sur le Sheet.',true,true);}return false;}
  const set=quiet?null:statusBox();const t=lotTotals(l);const what=l.type==='grumes'?`${t.n} grumes · ${t.nb} billons · ${f3(t.v)} m³`:`${t.n} tiges · ${f3(t.v)} m³`;
  if(set)set('Sauvegarde en cours…',(l.chantier||'Lot')+' · '+what,false);
  try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),45000);
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'saveLot',key:apiKey(),lot_id:l.id,rows:lotRows(l)}),signal:ctl.signal});clearTimeout(to);
    const j=await res.json();if(!(j&&j.ok))throw new Error(j&&j.error||'réponse invalide');
    l.sync='done';l.synced=new Date().toISOString();await DB.put('lots',l);
    if(set){set('✓ Lot sauvegardé sur le Sheet SBF',(l.chantier||'Lot')+' · '+what+' · '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),true);render();}return true;}
  catch(e){l.sync='pending';DB.put('lots',l);const msg=e.name==='AbortError'?'Le réseau ne répond pas (délai dépassé).':e.message==='clé refusée'?'Clé d’accès refusée : rouvrez le lien de configuration.':'Erreur : '+e.message;
    if(set)set('Échec de la sauvegarde',msg+' Le lot reste enregistré sur le téléphone.',true,true);else toast('Échec : '+(l.chantier||'lot'));return false;}}
/* Plusieurs lots en un seul appel (action batch, script ≥ 2.3) ; retourne le nombre de lots sauvegardés */
async function syncLots(lots){const url=S.params.syncUrl;if(!url||!navigator.onLine||!lots.length){for(const l of lots){l.sync='pending';DB.put('lots',l);}return 0;}
  if(lots.length===1)return (await syncLot(lots[0],true))?1:0;
  try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),90000);
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'batch',key:apiKey(),ops:lots.map(l=>({action:'saveLot',lot_id:l.id,rows:lotRows(l)}))}),signal:ctl.signal});clearTimeout(to);
    const j=await res.json();if(j&&j.error==='action inconnue'){let n=0;for(const l of lots)if(await syncLot(l,true))n++;return n;}
    const rs=(j&&j.results)||[];let n=0;for(let i=0;i<lots.length;i++){const r=rs[i];if(r&&r.ok){lots[i].sync='done';lots[i].synced=r.at||new Date().toISOString();n++;}else lots[i].sync='pending';await DB.put('lots',lots[i]);}return n;}
  catch(e){for(const l of lots){l.sync='pending';DB.put('lots',l);}return 0;}}
/* Boutons « Sauvegarder les lots » et « Mettre à jour depuis le Sheet » (accueil et Paramètres) */
const lotsToSync=()=>S.lots.filter(l=>l.sync!=='done'&&!l.test&&!l.readonly&&!(l.type==='client'&&(l.statut||'brouillon')==='brouillon'));
async function syncAllUI(){const set=statusBox();if(!S.params.syncUrl){set('Synchronisation non configurée','Ouvrez une fois le lien de configuration envoyé par le bureau (Paramètres).',true,true);return;}
  if(!navigator.onLine){set('Pas de réseau','Les lots restent enregistrés sur le téléphone. Relancez quand vous aurez du réseau.',true,true);return;}
  const todo=lotsToSync();if(!todo.length){set('✓ Tout est déjà sauvegardé','Aucun lot modifié depuis la dernière sauvegarde sur le Sheet SBF.',true);return;}
  set('Sauvegarde en cours…',todo.length+' lot(s) à envoyer',false);let ok=0;const noX=todo.filter(l=>l.type==='grumes'&&!l.xylo);const plain=todo.filter(l=>l.type!=='client'&&!noX.includes(l));
  for(let i=0;i<plain.length;i+=10){const chunk=plain.slice(i,i+10);set('Sauvegarde en cours…',(i+chunk.length)+' / '+plain.length+' lot(s)…',false);ok+=await syncLots(chunk);}
  for(const l of todo.filter(l=>l.type==='client'))if(await syncClient(l,true))ok++;
  const extra=noX.length?'\n'+noX.length+' lot(s) sans n° de chantier Xylolink non envoyé(s) : '+noX.map(l=>l.chantier||'(sans nom)').join(', ')+'.':'';
  set(ok===todo.length?'✓ Sauvegarde terminée':'Sauvegarde incomplète',ok+' / '+todo.length+' lot(s) sauvegardé(s) sur le Sheet SBF.'+extra,true,ok!==todo.length);render();}
async function loadRefUI(){const set=statusBox();if(!S.params.syncUrl){set('Synchronisation non configurée','Ouvrez une fois le lien de configuration envoyé par le bureau (Paramètres).',true,true);return;}
  set('Lecture du Sheet SBF…','',false);const ok=await loadRef(true);const i=S.refInfo||{};
  if(ok)set('✓ Mise à jour depuis le Sheet',`${i.ess} essences · ${i.qual} qualités · ${i.grilles} grille(s) de prix · barème Chaudé ${i.dmm?'du Sheet':'intégré'}`+(i.chg&&i.chg.length?'\nStatuts mis à jour : '+i.chg.join(' ; '):'\nAucun changement de statut sur vos lots clients.'),true);else set('Échec de la mise à jour',S.refErr||'Vérifiez le réseau et la configuration.',true,true);render();}
/* Partage de lot entre téléphones : fichier .json (lot + grilles utilisées) */
function lotFile(l){const gids=[l.grilleId,l.grilleCliId,...(l.sousLots||[]).map(x=>x.grilleId)].filter(Boolean);return new Blob([JSON.stringify({app:'cubage-sbf',lot:l,grilles:S.grilles.filter(g=>gids.includes(g.id))},null,1)],{type:'application/json'});}
/* Import d'un inventaire de grumes (fichier Excel ou CSV d'un bûcheron) dans un lot de cubage.
   Lecture souple : la ligne d'en-tête est cherchée dans chaque onglet (colonnes Numéro, Longueur, Diamètre, et en option
   Qualité, Essence, Réduction L/Ø, Note/Commentaire) ; une ligne = une grume d'un billon. Format CSV standard : numero;essence;qualite;longueur_m;diametre_cm */
async function importInventory(file,l){if(!window.XLSX){toast('Module Excel non chargé (ouvrir une fois en ligne)');return;}
  /* CSV : lu en texte brut (raw) pour garder « 8,20 » tel quel (sinon SheetJS y voit un séparateur de milliers → 820) ;
     encodage UTF-8, ou Windows-1252 pour un CSV enregistré par Excel en français */
  let wb;try{if(/\.csv$/i.test(file.name)){const buf=await file.arrayBuffer();let txt;try{txt=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch(e){txt=new TextDecoder('windows-1252').decode(buf);}
    wb=XLSX.read(txt.replace(/^\uFEFF/,''),{type:'string',raw:true});}else wb=XLSX.read(await file.arrayBuffer(),{type:'array'});}catch(e){toast('Fichier illisible');return;}
  const key=h=>String(h==null?'':h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
  const COLS={num:['numero','num','n','no','ngrume','grume','numerogrume'],lm:['longueur','longueurm','long','l','lg','lgm'],d:['diametre','diametrecm','diam','d','o','diamm','diametremedian'],q:['qualite','qual','q','classe'],ess:['essence','ess','esp','espece'],rl:['reductionl','reductionlongueur','redl'],rd:['reductiond','reductiondiametre','redd','reductiono'],note:['note','notes','commentaire','commentaires','comment','observation','observations','obs','remarque','remarques','rem']};
  const rows=[];const feuilles=[];
  for(const name of wb.SheetNames){const aoa=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});let hi=-1,map={};
    for(let i=0;i<Math.min(aoa.length,30);i++){const r=aoa[i]||[];const m={};r.forEach((c,j)=>{const k=key(c);for(const f of Object.keys(COLS))if(m[f]==null&&COLS[f].includes(k))m[f]=j;});if(m.num!=null&&m.lm!=null&&m.d!=null){hi=i;map=m;break;}}
    if(hi<0)continue;let n=0;
    for(let i=hi+1;i<aoa.length;i++){const r=aoa[i]||[];const num=r[map.num],lm=Number(String(r[map.lm]==null?'':r[map.lm]).replace(',','.')),d=Number(String(r[map.d]==null?'':r[map.d]).replace(',','.'));
      if(num==null||String(num).trim()===''||!(lm>0)||!(d>0))continue;
      rows.push({num:String(num).trim().replace(/\.0+$/,''),lm:Math.round(lm*100)/100,d:Math.floor(d),q:map.q!=null&&r[map.q]!=null?String(r[map.q]).trim().toUpperCase():'',ess:map.ess!=null&&r[map.ess]!=null?String(r[map.ess]).trim().toUpperCase():'',rl:map.rl!=null?Math.round(Number(String(r[map.rl]==null?'':r[map.rl]).replace(',','.'))||0):0,rd:map.rd!=null?Math.round(Number(String(r[map.rd]==null?'':r[map.rd]).replace(',','.'))||0):0,note:map.note!=null&&r[map.note]!=null?String(r[map.note]).trim():'',feuille:name});n++;}
    if(n)feuilles.push(name+' ('+n+')');}
  if(!rows.length){const set=statusBox();set('Aucune grume trouvée','Le fichier doit contenir une ligne d’en-tête avec les colonnes Numéro, Longueur (m) et Diamètre (cm), puis une ligne par grume. Colonnes facultatives : Qualité, Essence, Réduction L, Réduction Ø, Note.',true,true);return;}
  // Essence et qualité par défaut pour les lignes qui n'en ont pas
  const essL=lotEss(l),qL=lotQual(l);const needE=rows.some(r=>!r.ess),needQ=rows.some(r=>!r.q);
  const choix=await new Promise(res=>{const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>${rows.length} grume(s) trouvée(s)</b><p class="muted" style="margin:0">Onglets : ${esc(feuilles.join(', '))}. Une ligne = une grume d’un billon.</p>
    ${needE?`<label class="f"><span class="l">Essence pour les lignes sans essence</span><select id="iE">${essL.map(e=>`<option>${esc(e)}</option>`).join('')}</select></label>`:''}
    ${needQ?`<label class="f"><span class="l">Qualité pour les lignes sans qualité</span><select id="iQ"><option value="">(aucune)</option>${qL.map(q=>`<option>${esc(q)}</option>`).join('')}</select></label>`:''}
    <div class="stack"><button type="button" class="btn primary big" id="iOk">Importer dans « ${esc(l.chantier||'ce lot')} »</button><button type="button" class="btn" id="iNo">Annuler</button></div></div>`;document.body.appendChild(m);
    m.querySelector('#iOk').onclick=()=>{res({ess:m.querySelector('#iE')?m.querySelector('#iE').value:'',q:m.querySelector('#iQ')?m.querySelector('#iQ').value:''});m.remove();};m.querySelector('#iNo').onclick=()=>{res(null);m.remove();};});
  if(!choix)return;
  const nums=new Set(l.grumes.map(g=>String(g.num)));let n=0,dup=0;const newE=[],newQ=[];const now=new Date().toISOString();
  for(const r of rows){if(nums.has(r.num)){dup++;continue;}const ess=r.ess||choix.ess,q=r.q||choix.q;if(ess&&!essL.includes(ess)&&!newE.includes(ess))newE.push(ess);if(q&&!qL.includes(q)&&!newQ.includes(q))newQ.push(q);
    l.grumes.push({id:uid(),num:r.num,ess,saisi:now,src:'import',billons:[Object.assign({id:uid(),rang:1,lm:r.lm,d:r.d,q,rl:r.rl>0?r.rl:0,rd:r.rd>0?r.rd:0,sl:l.slCur||null},r.note?{note:r.note}:{})]});nums.add(r.num);n++;}
  if(newE.length){l.essSel=uniqL([...(l.essSel||[]),...newE]);for(const e of newE)if(!S.params.essences.includes(e))S.params.essences.push(e);}
  if(newQ.length){l.qualSel=uniqL([...(l.qualSel||[]),...newQ]);for(const q of newQ)if(!S.params.qualites.includes(q))S.params.qualites.push(q);}
  if(newE.length||newQ.length)saveParams();save(l);
  const set=statusBox();set('✓ Inventaire importé',n+' grume(s) ajoutée(s) à « '+(l.chantier||'')+' » · '+f3(lotTotals(l).v)+' m³ au total.'+(dup?'\n'+dup+' ligne(s) ignorée(s) : n° déjà présent dans le lot.':'')+(newE.length?'\nEssence(s) ajoutée(s) : '+newE.join(', ')+'.':'')+(newQ.length?'\nQualité(s) ajoutée(s) : '+newQ.join(', ')+'.':'')+'\nLe lot reste à sauvegarder sur le Sheet.',true,dup>0);render();}
/* Fusion d'un lot reçu dans un lot existant du téléphone (plusieurs techniciens sur le même chantier) */
function mergeLot(t,src){const r={n:0,dup:0};t.essSel=uniqL([...(t.essSel||[]),...(src.essSel||[])]);t.qualSel=uniqL([...(t.qualSel||[]),...(src.qualSel||[])]);
  const slMap={};for(const s of src.sousLots||[]){let ex=(t.sousLots||[]).find(x=>x.nom===s.nom);if(!ex){ex=Object.assign({},s,{id:uid()});t.sousLots=t.sousLots||[];t.sousLots.push(ex);}slMap[s.id]=ex.id;}
  const de=src.operateur||'collègue';
  if(t.type==='pied'){for(const a of src.arbres||[]){t.arbres.push(Object.assign({},a,{id:uid(),sl:a.sl?slMap[a.sl]||null:null,de}));r.n++;}
    t.classH=t.classH||{};for(const k of Object.keys(src.classH||{}))if(t.classH[k]==null)t.classH[k]=src.classH[k];
    t.tarifEss=t.tarifEss||{};for(const k of Object.keys(src.tarifEss||{}))if(t.tarifEss[k]==null)t.tarifEss[k]=src.tarifEss[k];}
  else{const nums=new Set(t.grumes.map(g=>String(g.num)));for(const g of src.grumes||[]){if(nums.has(String(g.num))){r.dup++;continue;}t.grumes.push(Object.assign({},g,{id:uid(),de,billons:g.billons.map(b=>Object.assign({},b,{id:uid(),sl:b.sl?slMap[b.sl]||null:null}))}));nums.add(String(g.num));r.n++;}}
  t.fusions=t.fusions||[];t.fusions.push({de,lot:src.chantier||'',at:new Date().toISOString(),n:r.n});save(t);return r;}
async function importLotFile(file){let j;try{j=JSON.parse(await file.text());}catch(e){toast('Fichier illisible');return;}
  const lots=j.lots||(j.lot?[j.lot]:(j.id&&j.type?[j]:[]));if(!lots.length){toast('Aucun lot dans ce fichier');return;}
  // Un seul lot de terrain reçu et des lots compatibles sur ce téléphone : proposer la fusion
  if(lots.length===1&&(lots[0].type==='pied'||lots[0].type==='grumes')){const src=lots[0];const targets=S.lots.filter(l=>l.type===src.type&&l.id!==src.id&&!l.readonly&&!l.remote&&!l.archive);
    if(targets.length){const choice=await new Promise(res=>{const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-box"><b>Lot reçu : ${esc(src.chantier||'')} · ${esc(src.operateur||'')}</b><p class="muted" style="margin:0">${src.type==='pied'?(src.arbres||[]).length+' tige(s) relevée(s)':(src.grumes||[]).length+' grume(s)'}. L’ajouter comme nouveau lot, ou fusionner ses ${src.type==='pied'?'arbres':'grumes'} dans un de vos lots (même chantier relevé à plusieurs) ?</p>
        <div class="stack"><button type="button" class="btn primary big" data-ch="new">Nouveau lot séparé</button>${targets.slice(0,8).map(t=>`<button type="button" class="btn big" data-ch="${t.id}">Fusionner dans « ${esc(t.chantier||'Sans nom')} » (${esc((t.date||'').split('-').reverse().join('/'))}${t.xylo?' · '+esc(t.xylo):''})</button>`).join('')}<button type="button" class="btn" data-ch="x">Annuler</button></div></div>`;document.body.appendChild(m);
        m.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>{m.remove();res(b.dataset.ch);});});
      if(choice==='x')return;if(choice!=='new'){const t=S.lots.find(l=>l.id===choice);for(const g of j.grilles||[])if(!S.grilles.find(x=>x.id===g.id)){S.grilles.push(g);await saveGrille(g);}
        // Pied à pied numéroté : pas de doublon de n° — renumérotation des arbres reçus à partir d'un n° choisi
        if(t.type==='pied'&&(t.mode==='pieds'||src.mode==='pieds')){const mine=new Set(t.arbres.map(a=>String(a.num||'')).filter(Boolean));const inc=(src.arbres||[]).filter(a=>a.num&&mine.has(String(a.num)));
          if(inc.length){const max=Math.max(0,...t.arbres.map(a=>Number(a.num)||0));const v=prompt(inc.length+' n° d’arbre reçus existent déjà dans votre lot ('+inc.slice(0,5).map(a=>a.num).join(', ')+(inc.length>5?'…':'')+').\nN° de départ pour renuméroter les '+(src.arbres||[]).length+' arbres reçus (votre dernier n° : '+max+') :',String(max+1));
            if(v==null)return;let n=Number(v);if(!(n>0)){toast('N° invalide');return;}const sorted=[...(src.arbres||[])].sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));for(const a of sorted){a.numOrig=a.num;a.num=String(n++);}}}
        const r=mergeLot(t,src);const set=statusBox();set('✓ Lot fusionné',r.n+' '+(t.type==='pied'?'tige(s)':'grume(s)')+' de '+(src.operateur||'votre collègue')+' ajoutée(s) à « '+(t.chantier||'')+' »'+(r.dup?'. '+r.dup+' grume(s) ignorée(s) : numéro déjà présent dans votre lot.':'.')+((src.arbres||[]).some(a=>a.numOrig)?'\nArbres renumérotés à partir du n° '+Math.min(...src.arbres.filter(a=>a.numOrig).map(a=>Number(a.num)))+' (ancien n° conservé dans le listing).':'')+'\nLe lot reste à sauvegarder sur le Sheet.',true,r.dup>0);S.lot=t;S.mod=t.type;S.hist=['home','module','lots'];go('lot');return;}}}
  let n=0,rep=0,last=null;for(const g of j.grilles||[])if(!S.grilles.find(x=>x.id===g.id)){S.grilles.push(g);await saveGrille(g);}
  for(const l of lots){const ex=S.lots.find(x=>x.id===l.id);if(ex){const when=d=>d?new Date(d).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'?';
      if(!confirm('Le lot « '+(l.chantier||l.client||l.id)+' » existe déjà sur ce téléphone (modifié le '+when(ex.updated)+'). Le remplacer par la version reçue (modifiée le '+when(l.updated)+') ?'))continue;S.lots[S.lots.indexOf(ex)]=l;rep++;}else{S.lots.push(l);n++;}
    if(l.sync==='done')l.sync='pending';l.readonly=false;l.archive=false;delete l.sentAt;await DB.put('lots',l);last=l;}
  const set=statusBox();set('✓ Fichier importé',(n?n+' lot(s) ajouté(s)':'')+(n&&rep?' · ':'')+(rep?rep+' lot(s) remplacé(s)':'')+(!n&&!rep?'Aucun lot importé.':'')+'\nLe lot vous appartient maintenant : pensez à le sauvegarder sur le Sheet.',true);
  if(last&&lots.length===1&&last.type!=='client'){S.lot=last;S.mod=last.type;S.hist=['home','module','lots'];go('lot');}else render();}
/* Récupération des lots depuis le Sheet (changement de téléphone) */
async function restoreUI(all){const set=statusBox();const url=S.params.syncUrl;if(!url){set('Synchronisation non configurée','Ouvrez d’abord le lien de configuration envoyé par le bureau.',true,true);return;}
  const me=(S.params.operateur||'').trim().toLowerCase();set('Lecture du Sheet SBF…',all?'Tous les lots sauvegardés':'Lots de l’opérateur « '+(S.params.operateur||'?')+' »',false);
  try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),120000);const res=await fetch(url+(url.includes('?')?'&':'?')+'action=restore&key='+encodeURIComponent(apiKey())+(all?'&all=1':me?'&operateur='+encodeURIComponent(S.params.operateur.trim()):''),{signal:ctl.signal});clearTimeout(to);
    const j=await res.json();if(!j.ok)throw new Error(j.error==='action inconnue'?'Le script du Sheet doit être mis à jour (version 2.4).':j.error||'refusé');
    let n=0,skip=0,others=0,ng=0;const have=new Set(S.lots.map(l=>l.id));
    for(const r of j.lots||[]){if(have.has(String(r.lot_id))){skip++;continue;}if(!all&&me&&String(r.operateur||'').trim().toLowerCase()!==me){others++;continue;}if(!r.json)continue;
      let o;try{o=JSON.parse(r.json);}catch(e){continue;}const l=o.lot||o;if(!l||!l.id)continue;for(const g of o.grilles||[])if(!S.grilles.find(x=>x.id===g.id)){S.grilles.push(g);await saveGrille(g);ng++;}
      l.sync='done';l.synced=r.updated||new Date().toISOString();S.lots.push(l);await DB.put('lots',l);have.add(l.id);n++;}
    for(const r of j.clients||[]){if(have.has(String(r.client_id))){skip++;continue;}if(!all&&me&&String(r.operateur||'').trim().toLowerCase()!==me){others++;continue;}if(!r.json)continue;
      let c;try{c=JSON.parse(r.json);}catch(e){continue;}if(!c||!c.id)continue;c.statut=r.statut||c.statut;c.sync='done';c.synced=r.updated_at||new Date().toISOString();S.lots.push(c);await DB.put('lots',c);have.add(c.id);n++;}
    set('✓ Récupération terminée',n+' lot(s) récupéré(s) sur ce téléphone'+(ng?' · '+ng+' grille(s) de prix':'')+'.'+(skip?' '+skip+' déjà présent(s).':'')+(others?' '+others+' lot(s) d’autres opérateurs non récupéré(s) (bouton « tous les opérateurs »).':'')+'\nSeuls les lots sauvegardés avec l’application à jour (v47 ou plus) sont récupérables.',true);render();}
  catch(e){set('Échec de la récupération',e.name==='AbortError'?'Le réseau ne répond pas.':e.message,true,true);}}
/* Lecture d'un lien de configuration (…#cfg=…) */
function parseCfg(txt){const m=/#cfg=([A-Za-z0-9_\-+\/=]+)/.exec(txt||'');if(!m)return null;try{const c=JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')))));return c&&c.u?c:null;}catch(e){return null;}}
/* ---------- Lots clients : envoi au Sheet ---------- */
function clientRows(c){const v=clientVirtual(c),g=lotGrille(v);const lignes=v.grumes.map(gr=>{const b=gr.billons[0];const L=prixLine(g,gr.ess,b.q||'',cubD(b)),vol=Math.round(volB(b)*10000)/10000;
    return{billon_key:b.id,num:b.label,essence:gr.ess,qualite:b.q||'',longueur_m:b.lm,diametre_cm:b.d,reduction:redTxt(b),volume_m3:vol,origine:gr.orig,prix_m3:L?L.prix:'',montant:L?Math.round(L.prix*vol*100)/100:''};});
  return{client:{client_id:c.id,client:c.client||'',date:c.date||'',ref:c.ref||'',grille:g?g.nom:'',note:c.note||'',statut:c.statut||'brouillon',operateur:S.params.operateur||'',nb_billons:lignes.length,volume_m3:Math.round(lignes.reduce((s,x)=>s+x.volume_m3,0)*1000)/1000,montant:lignes.some(x=>x.montant!=='')?Math.round(lignes.reduce((s,x)=>s+(Number(x.montant)||0),0)*100)/100:'',created:c.created||'',json:(()=>{const t=JSON.stringify(c);return t.length<45000?t:'';})()},lignes};}
async function syncClient(c,quiet){const url=S.params.syncUrl;const set=quiet?null:statusBox();
  if(!url){if(set)set('Synchronisation non configurée','Ouvrez une fois le lien de configuration.',true,true);return false;}
  if(!navigator.onLine){c.sync='pending';DB.put('lots',c);if(set)set('Pas de réseau','Le lot client reste sur le téléphone ; il sera envoyé plus tard.',true,true);return false;}
  const t=cliTot(c);if(set)set('Envoi en cours…',(c.client||'Lot client')+' · '+t.n+' billon(s) · '+f3(t.v)+' m³',false);
  const origs=[...new Set((c.lignes||[]).map(k=>k.split('|')[0]))].map(id=>S.lots.find(l=>l.id===id)).filter(l=>l&&l.sync!=='done');
  const noX=origs.find(l=>l.type==='grumes'&&!l.xylo);if(noX){if(set)set('N° de chantier Xylolink manquant','Le lot d’origine « '+(noX.chantier||'')+' » doit avoir son n° Xylolink avant la transmission.',true,true);return false;}
  if(origs.length&&set)set('Envoi en cours…',origs.length+' lot(s) d’origine + le lot client, en un seul envoi…',false);
  try{const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),60000);const rows=clientRows(c);const cli={action:'saveClient',client:rows.client,lignes:rows.lignes};
    const body=origs.length?{action:'batch',key:apiKey(),ops:[...origs.map(l=>({action:'saveLot',lot_id:l.id,rows:lotRows(l)})),cli]}:Object.assign({key:apiKey()},cli);
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:ctl.signal});clearTimeout(to);
    let j=await res.json();
    if(origs.length){const rs=(j&&j.results)||[];if(j&&j.error==='action inconnue')throw new Error('Le script du Sheet doit être mis à jour (version 2.3).');
      for(let i=0;i<origs.length;i++){const r=rs[i];if(r&&r.ok){origs[i].sync='done';origs[i].synced=r.at||new Date().toISOString();await DB.put('lots',origs[i]);}else throw new Error('Lot d’origine « '+(origs[i].xylo||origs[i].chantier||'')+' » : '+(r&&r.error||'non sauvegardé'));}
      j=rs[origs.length]||{ok:false,error:'réponse incomplète'};}
    if(!(j&&j.ok))throw new Error(j&&j.error||'réponse invalide');
    c.sync='done';c.synced=new Date().toISOString();if(j.statut)c.statut=j.statut;await DB.put('lots',c);
    const warn=(j.conflicts||[]).length?' ⚠ Déjà proposés ailleurs : '+j.conflicts.map(x=>x.num+(x.client?' ('+x.client+')':'')).join(', '):'';
    if(set){set('✓ '+(c.statut==='valide'?'Vente validée':c.statut==='propose'?'Transmis au bureau':'Brouillon enregistré')+' sur le Sheet SBF',(c.client||'')+' · '+t.n+' billon(s) · '+f3(t.v)+' m³'+warn,true,!!warn);render();}return true;}
  catch(e){c.sync='pending';DB.put('lots',c);const msg=e.name==='AbortError'?'Le réseau ne répond pas.':e.message;if(set)set('Refusé ou échec',msg,true,true);else toast('Échec : '+(c.client||'lot client'));return false;}}
/* Chargement du référentiel commun (Google Sheet SBF) : essences, qualités, classes, grilles, table Chaudé */
async function loadRef(silent){const url=S.params.syncUrl;if(!url){if(!silent)toast('Adresse du script manquante');return false;}
  try{const res=await fetch(url+(url.includes('?')?'&':'?')+'action=params&key='+encodeURIComponent(apiKey()));const j=await res.json();if(j.ok===false)throw new Error(j.error||'refusé');const p=S.params;
  const usedE=uniqL(S.lots.flatMap(l=>l.essSel||[])),usedQ=uniqL(S.lots.flatMap(l=>l.qualSel||[]));
  if(j.essences&&j.essences.length)p.essences=uniqL([...j.essences,...usedE.filter(x=>!j.essences.includes(x))]);
  if(j.qualites&&j.qualites.length)p.qualites=uniqL([...j.qualites,...usedQ.filter(x=>!j.qualites.includes(x))]);
  if(j.classes){if(j.classes.step)p.step=j.classes.step;if(j.classes.min)p.classMin=j.classes.min;if(j.classes.max)p.classMax=j.classes.max;p.stepParEssence=j.classes.parEssence||{};}
  for(const g of j.grilles||[]){g.src='sheet';const ex=S.grilles.find(x=>x.id===g.id);if(ex)Object.assign(ex,g);else S.grilles.push(g);await saveGrille(ex||g);}
  if(Array.isArray(j.grilles)){const ids=new Set(j.grilles.map(g=>g.id));for(const g of S.grilles.filter(x=>x.src==='sheet'&&!ids.has(x.id))){S.grilles=S.grilles.filter(x=>x!==g);await DB.del('grilles',g.id);}}
  if(j.dmm&&Object.keys(j.dmm).length){Object.assign(Calc.DMM,j.dmm);p.dmm=j.dmm;}
  if(j.essencesVocal&&typeof j.essencesVocal==='object')p.essencesVocal=j.essencesVocal;
  if(j.qualitesVocal&&typeof j.qualitesVocal==='object')p.qualitesVocal=j.qualitesVocal;
  if(j.operateur){p.operateur=j.operateur;p.opLocked=true;}else p.opLocked=false;
  let chg=[];if(j.clientStatuts){for(const c of S.lots){if(c.type!=='client')continue;const st=j.clientStatuts[c.id];if(st&&st!==c.statut&&c.sync==='done'){chg.push((c.client||'lot client')+' → '+(STL[st]||st));c.statut=st;await DB.put('lots',c);}}}
  S.refInfo={ess:(j.essences||[]).length,qual:(j.qualites||[]).length,grilles:(j.grilles||[]).length,dmm:!!(j.dmm&&Object.keys(j.dmm).length),chg};
  p.refLoaded=new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});await saveParams();if(!silent)toast('Référentiel chargé');return true;}
  catch(e){S.refErr=e.message;if(!silent)toast('Échec du chargement : '+e.message);return false;}}

/* ---------- Rendu ---------- */
function render(){chipCb=null;if(S.screen!=='newLot'&&S.screen!=='lot')S.pendingInv=null;if(window.CubageVoice)window.CubageVoice.unbind();const v=V[S.screen]||V.home;v();if(window.CubageVoice)window.CubageVoice.apresRendu();
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{S.hist.push(S.screen);S.form={};S.edit=null;go(b.dataset.go);});
  document.querySelectorAll('[data-open]').forEach(b=>{if(!b.onclick)b.onclick=()=>{S.lot=S.lots.find(l=>l.id===b.dataset.open);S.mod=S.lot.type;S.slFilter='';S.hist=['home','module','lots'];go('lot');};});}
(async()=>{await DB.open();const p=await DB.get('params','params');S.params=Object.assign({},DEF_PARAMS,p||{});try{const bs=await DB.get('params','bureau');if(bs&&bs.j&&isBureau())buildStock(bs.j);}catch(e){}if(S.params.dmm)Object.assign(Calc.DMM,S.params.dmm);
  S.lots=(await DB.all('lots'))||[];S.grilles=(await DB.all('grilles'))||[];S.lots.forEach(l=>{l.grumes=l.grumes||[];l.arbres=l.arbres||[];l.sousLots=l.sousLots||[];l.classH=l.classH||{};});
  /* Lien de configuration : …/cubage-sbf/#cfg=… (adresse du script + clé), à ouvrir une fois par téléphone */
  let cfgOk=false;try{const c=parseCfg(location.hash);if(/#cfg=/.test(location.hash||'')){if(c){S.params.syncUrl=c.u;S.params.syncKey=c.k||'';if(c.b!==undefined)S.params.syncKeyBureau=c.b||'';await saveParams();cfgOk=true;}history.replaceState(null,'',location.pathname);}}catch(e){toast('Lien de configuration illisible');}
  render();if(cfgOk)toast('Synchronisation configurée');
  if(S.params.syncUrl&&navigator.onLine)loadRef(!cfgOk).then(ok=>{if(ok&&(S.screen==='home'||S.screen==='params'))render();});
  if('serviceWorker'in navigator&&location.protocol==='https:'&&!/claude\.(ai|site)/.test(location.host)){navigator.serviceWorker.register('sw.js').catch(()=>{});}
  /* Stockage persistant (appli installée) : le navigateur n'efface ni les lots ni la copie de l'appli quand le téléphone manque de place */
  try{if(navigator.storage&&navigator.storage.persist&&(matchMedia('(display-mode: standalone)').matches||navigator.standalone))navigator.storage.persist().catch(()=>{});}catch(e){}})();
/* Fonctions métier exposées aux documents PDF (docs.js), qui se chargent avant ce fichier */
window.CubageApp={recap,qualRecap,priceRecap,prixLine,grilleFor,lotGrille,lotGrilleCli,volB,cubD,cubL,lenM,redTxt,slMatch,clientVirtual,origins,shareFile,safe,today,gpsUrl,toast,esc,NONE,get S(){return S;}};
})();
