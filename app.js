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
  step:5,stepParEssence:{},classMin:10,classMax:90,repriseQualite:true,saisieDiam:'classe',resteQualite:'BI',operateur:'',syncUrl:'',refLoaded:''};
const resteQ=()=>S.params.resteQualite||'BI';
const sumTr=tr=>(tr||[]).reduce((s,t)=>s+(t.h>0?t.h:0),0);
const S={params:null,lots:[],grilles:[],screen:'home',lot:null,edit:null,form:{},hist:[]};

/* ---------- Modèle ---------- */
const stepFor=ess=>(S.params.stepParEssence&&S.params.stepParEssence[ess])||S.params.step||5;
const cls=(ess,d)=>Calc.classe(d,stepFor(ess));
function lotGrille(lot){return lot.grilleLocal||S.grilles.find(g=>g.id===lot.grilleId)||null;}
function prix(grille,ess,q,d){if(!grille)return null;let best=null,bs=-1;for(const l of grille.lignes||[]){
  if(l.ess&&l.ess!==ess)continue;if(l.q&&l.q!==q)continue;if(l.dmin!=null&&d<l.dmin)continue;if(l.dmax!=null&&d>l.dmax)continue;
  const sc=(l.ess?4:0)+(l.q?2:0)+((l.dmin!=null||l.dmax!=null)?1:0);if(sc>bs){bs=sc;best=l;}}return best?best.prix:null;}
const lenM=b=>b.lm!=null?b.lm:((b.l||0)/10);
const volB=b=>Calc.volBillon(b.d,lenM(b));
const clampT=v=>Math.min(20,Math.max(1,Math.round(Number(v)||1)));
const tarifOf=(lot,a)=>clampT(a.tarif||lot.tarif||8);
const tarifDef=(lot,ess)=>clampT((lot.tarifEss&&lot.tarifEss[ess])||lot.tarif||8);
const circ=d=>Math.round(Math.PI*d);
const clsRange=(ess,c)=>{const s=stepFor(ess);return (c-Math.floor(s/2))+'–'+(c+Math.ceil(s/2)-1);};
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
function recap(lot,sl){const rows={},cl={},g=lotGrille(lot);const add=(k,o,f)=>{const r=rows[k]||(rows[k]={ess:o.ess,q:o.q,c:o.c,n:0,v:0,sd:0,sl:0});f(r);};
  if(lot.type==='grumes'){for(const gr of lot.grumes)for(const b of gr.billons){if(sl&&b.sl!==sl)continue;const c=cls(gr.ess,b.d),v=volB(b);
    add(gr.ess+'|'+(b.q||'')+'|'+c,{ess:gr.ess,q:b.q||'',c},r=>{r.n++;r.v+=v;r.sd+=b.d;r.sl+=lenM(b);});}}
  else{for(const a of lot.arbres){if(sl&&a.sl!==sl)continue;const c=cls(a.ess,a.d),k=a.ess+'|'+c,x=arbreCalc(lot,a);const t=cl[k]||(cl[k]={ess:a.ess,c,n:0,v:0,sans:0,sh:0,nh:0});t.n+=a.n||1;
    if(x.v==null){t.sans+=a.n||1;continue;}t.v+=x.v;t.sh+=x.h*(a.n||1);t.nh+=a.n||1;for(const tr of x.tronc)add(a.ess+'|'+tr.q+'|'+c,{ess:a.ess,q:tr.q,c},r=>{r.v+=tr.v;r.n+=a.n||1;});}}
  const list=Object.values(rows).sort((a,b)=>a.ess.localeCompare(b.ess)||a.q.localeCompare(b.q)||a.c-b.c);
  for(const r of list){r.p=prix(g,r.ess,r.q,r.c);r.m=r.p!=null?r.p*r.v:null;r.dm=r.n?r.sd/r.n:null;r.lm=r.n?r.sl/r.n:null;}
  const tot={n:list.reduce((s,r)=>s+r.n,0),v:list.reduce((s,r)=>s+r.v,0),m:list.some(r=>r.m!=null)?list.reduce((s,r)=>s+(r.m||0),0):null};
  return{rows:list,tot,classes:Object.values(cl).sort((a,b)=>a.ess.localeCompare(b.ess)||a.c-b.c),grille:g};}
function listing(lot,sl){const out=[];if(lot.type==='grumes'){for(const g of lot.grumes)for(const b of g.billons){if(sl&&b.sl!==sl)continue;
    out.push({num:g.num+'.'+b.rang,ess:g.ess,q:b.q||'',l:lenM(b),d:b.d,c:cls(g.ess,b.d),v:volB(b),sl:slName(lot,b.sl)});}}
  else{for(const a of lot.arbres){if(sl&&a.sl!==sl)continue;const x=arbreCalc(lot,a);
    out.push({num:a.num||'',ess:a.ess,d:a.d,c:cls(a.ess,a.d),t:tarifOf(lot,a),n:a.n||1,h:x.h,tr:x.tronc.map(t=>t.h+'m '+(t.q||'·')).join(' / '),v:x.v,sl:slName(lot,a.sl)});}}return out;}
const slName=(lot,id)=>{const s=(lot.sousLots||[]).find(x=>x.id===id);return s?s.nom:'';};

/* ---------- Persistance ---------- */
let saveT=null;
function save(lot){lot=lot||S.lot;if(!lot)return;lot.updated=new Date().toISOString();if(lot.sync==='done')lot.sync='pending';
  clearTimeout(saveT);saveT=setTimeout(()=>DB.put('lots',lot).catch(()=>toast('Erreur d’enregistrement local')),80);}
const saveParams=()=>DB.put('params',S.params);
const saveGrille=g=>DB.put('grilles',g);

/* ---------- UI helpers ---------- */
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200);}
function go(screen,o){S.screen=screen;Object.assign(S,o||{});render();window.scrollTo(0,0);}
function back(){const h=S.hist;if(h.length){go(h.pop());}else go('home');}
function chips(name,vals,cur,small){return `<div class="chips" data-chips="${name}">${vals.map(v=>`<button type="button" class="chip${small?' small':''}${v===cur?' on':''}" data-v="${esc(v)}">${esc(v||'—')}</button>`).join('')}</div>`;}
function chipVal(name){const b=document.querySelector(`[data-chips="${name}"] .chip.on`);return b?b.dataset.v:'';}
function bindChips(){document.querySelectorAll('[data-chips]').forEach(c=>c.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;c.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');c.dispatchEvent(new CustomEvent('chip',{bubbles:true,detail:b.dataset.v}));}));}
function head(title,sub,right){$('#top').innerHTML=`<button type="button" id="back" aria-label="Retour">‹ Retour</button><h1>${esc(title)}${sub?`<span class="sub">${esc(sub)}</span>`:''}</h1>${right||''}`;$('#back').onclick=back;if(S.screen==='home')$('#back').style.visibility='hidden';}
function foot(html){const f=$('#foot');if(!html){f.hidden=true;f.innerHTML='';return;}f.hidden=false;f.innerHTML=`<div class="in">${html}</div>`;}
function trEditor(list,id){const q=S.params.qualites;return `<div class="stack" id="${id}">${list.map((t,i)=>`<div class="tr-row" data-i="${i}"><input type="number" inputmode="decimal" step="0.5" placeholder="m" value="${t.h??''}" data-f="h"><select data-f="q"><option value="">Qualité</option>${q.map(x=>`<option${x===t.q?' selected':''}>${esc(x)}</option>`).join('')}</select><button type="button" class="x" data-del="${i}">✕</button></div>`).join('')}
  <button type="button" class="btn add" data-add-tr="${id}">+ Ajouter un tronçon</button></div>`;}
function readTr(id){return [...document.querySelectorAll(`#${id} .tr-row`)].map(r=>({h:num(r.querySelector('[data-f=h]').value),q:r.querySelector('[data-f=q]').value})).filter(t=>t.h>0);}

/* ---------- Écrans ---------- */
const V={};
V.home=()=>{head('Cubage SBF',S.params.operateur?'Opérateur : '+S.params.operateur:'');
  const lots=[...S.lots].sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
  $('#main').innerHTML=`<div class="row" style="margin-bottom:12px"><button class="btn primary big grow" data-go="newLot">+ Nouveau lot</button><button class="btn big" data-go="grilles">Grilles</button><button class="btn big" data-go="params">⚙</button></div>
  <h2>Lots (${lots.length})</h2><div class="list">${lots.length?lots.map(l=>{const t=lotTotals(l);return `<button class="item" data-open="${l.id}"><div class="t"><b>${esc(l.chantier||'Sans nom')} <span class="pill">${l.type==='grumes'?'Grumes':'Sur pied'}</span></b><small>${esc(l.date)} · ${l.type==='grumes'?t.n+' grumes · '+t.nb+' billons':t.n+' tiges'} · ${l.sync==='done'?'sauvegardé':l.sync==='pending'?'à sauvegarder':'non sauvegardé'}</small></div><div class="v">${f3(t.v)} m³</div></button>`;}).join(''):'<p class="muted">Aucun lot. Créez le premier.</p>'}</div>`;foot('');};

V.newLot=()=>{head('Nouveau lot');const p=S.params;
  $('#main').innerHTML=`<div class="stack card">
  <div class="segment" id="type"><button type="button" class="on" data-v="grumes">Grumes bord de route</button><button type="button" data-v="pied">Bois sur pied</button></div>
  <label class="f"><span class="l">Chantier / propriétaire</span><input id="chantier" placeholder="Nom du chantier"></label>
  <div class="row"><label class="f"><span class="l">Date</span><input id="date" type="date" value="${today()}"></label><label class="f"><span class="l">Opérateur</span><input id="op" value="${esc(p.operateur)}"></label></div>
  <div id="optG"><label class="f"><span class="l">Premier n° de grume</span><input id="numDepart" type="number" inputmode="numeric" value="1"></label></div>
  <div id="optP" hidden class="stack"><label class="f"><span class="l">Tarif Chaudé par défaut (1 à 20)</span><input id="tarif" type="number" inputmode="numeric" min="1" max="20" value="8"></label>
   <label class="f"><span class="l">Mode d’inventaire</span><select id="mode"><option value="diam">Pied à pied, diamètre seul (hauteurs par classe ensuite)</option><option value="classes">Par classes avec effectifs</option><option value="pieds">Pied à pied numéroté (diamètre + hauteur)</option></select></label></div>
  <label class="f"><span class="l">Grille de prix</span><select id="grille"><option value="">Aucune</option>${S.grilles.map(g=>`<option value="${g.id}">${esc(g.nom)} (${g.type})</option>`).join('')}</select></label>
  </div>`;
  const seg=$('#type');seg.onclick=e=>{const b=e.target.closest('button');if(!b)return;seg.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');const pied=b.dataset.v==='pied';$('#optG').hidden=pied;$('#optP').hidden=!pied;};
  foot(`<button class="btn primary big" id="create">Créer le lot</button>`);
  $('#create').onclick=()=>{const type=seg.querySelector('.on').dataset.v;const lot={id:uid(),type,chantier:$('#chantier').value.trim(),date:$('#date').value,operateur:$('#op').value.trim(),
    numDepart:Number($('#numDepart').value)||1,tarif:Math.min(20,Math.max(1,Number($('#tarif').value)||8)),mode:$('#mode').value,grilleId:$('#grille').value||null,grilleLocal:null,
    sousLots:[],grumes:[],arbres:[],classH:{},sync:'new',created:new Date().toISOString()};
    if($('#op').value.trim()){S.params.operateur=$('#op').value.trim();saveParams();}
    S.lots.push(lot);S.lot=lot;save(lot);S.hist=['home'];go('lot');};};

V.lot=()=>{const l=S.lot,t=lotTotals(l);head(l.chantier||'Lot',(l.type==='grumes'?'Grumes':'Sur pied')+' · '+l.date);
  const g=lotGrille(l);
  $('#main').innerHTML=`<div class="kpi"><div><b>${f3(t.v)}</b><small>m³</small></div><div><b>${t.n}</b><small>${l.type==='grumes'?'grumes':'tiges'}</small></div>${l.type==='grumes'?`<div><b>${t.nb}</b><small>billons</small></div>`:`<div><b>${t.sans||0}</b><small>sans hauteur</small></div>`}</div>
  <div class="stack" style="margin-top:12px">
  <button class="btn primary big block" data-go="${l.type==='grumes'?'saisieG':'saisieP'}">Saisir</button>
  ${l.type==='pied'?'<div class="row"><button class="btn big grow" data-go="hauteurs">Hauteurs par classe</button><button class="btn big grow" data-go="tarifs">Tarifs Chaudé</button></div>':''}
  <div class="row"><button class="btn big grow" data-go="listing">Listing</button><button class="btn big grow" data-go="recap">Récapitulatif</button></div>
  <div class="row"><button class="btn grow" data-go="sousLots">Sous-lots (${(l.sousLots||[]).length})</button><button class="btn grow" data-go="lotGrille">Grille : ${esc(g?g.nom:'aucune')}</button></div>
  <h2>Sorties</h2>
  <div class="row"><button class="btn grow" id="pdf">PDF</button><button class="btn grow" id="xlsx">Excel</button><button class="btn grow" id="json">Sauvegarde JSON</button></div>
  <button class="btn block ${l.sync==='done'?'':'primary'}" id="sync">${l.sync==='done'?'Sauvegardé sur le Sheet · renvoyer':'Sauvegarder sur le Sheet SBF'}</button>
  <h2>Lot</h2>
  <div class="card stack"><div class="row"><label class="f"><span class="l">Chantier</span><input id="chantier" value="${esc(l.chantier||'')}"></label><label class="f"><span class="l">Date</span><input id="date" type="date" value="${esc(l.date)}"></label></div>
  <div class="row"><label class="f"><span class="l">Opérateur</span><input id="op" value="${esc(l.operateur||'')}"></label>${l.type==='pied'?`<label class="f"><span class="l">Tarif par défaut</span><input id="tarif" type="number" inputmode="numeric" min="1" max="20" value="${l.tarif}"></label>`:''}</div>
  ${l.type==='pied'?`<label class="f"><span class="l">Mode d’inventaire</span><select id="mode"><option value="diam"${l.mode==='diam'?' selected':''}>Diamètre seul</option><option value="classes"${l.mode==='classes'?' selected':''}>Classes avec effectifs</option><option value="pieds"${l.mode==='pieds'?' selected':''}>Pied à pied numéroté</option></select></label>`:''}
  <button class="btn danger" id="delLot">Supprimer ce lot</button></div></div>`;
  $('#chantier').oninput=e=>{l.chantier=e.target.value;save();};$('#date').onchange=e=>{l.date=e.target.value;save();};$('#op').oninput=e=>{l.operateur=e.target.value;save();};
  if($('#tarif'))$('#tarif').onchange=e=>{l.tarif=Math.min(20,Math.max(1,Number(e.target.value)||1));e.target.value=l.tarif;save();render();};
  if($('#mode'))$('#mode').onchange=e=>{l.mode=e.target.value;save();};
  $('#pdf').onclick=()=>exportPDF(l);$('#xlsx').onclick=()=>exportXLSX(l);$('#json').onclick=()=>shareFile(new Blob([JSON.stringify(l,null,1)],{type:'application/json'}),fname(l,'json'));
  $('#sync').onclick=()=>syncLot(l);
  $('#delLot').onclick=e=>{if(e.target.dataset.c){S.lots=S.lots.filter(x=>x!==l);DB.del('lots',l.id);S.lot=null;go('home');}else{e.target.textContent='Confirmer la suppression définitive';e.target.dataset.c='1';}};
  foot('');};

/* --- Saisie grumes --- */
V.saisieG=()=>{const l=S.lot,p=S.params;const ed=S.edit;let g;
  if(ed){g=l.grumes.find(x=>x.id===ed);}
  if(!S.form.g){const last=l.grumes[l.grumes.length-1];S.form.g=ed?JSON.parse(JSON.stringify(g)):{num:nextNum(l),ess:last?last.ess:p.essences[0],billons:[{rang:1,lm:null,d:null,q:(p.repriseQualite&&last&&last.billons.length)?last.billons[last.billons.length-1].q:''}]};}
  const f=S.form.g,t=lotTotals(l);head(ed?'Modifier grume '+g.num:'Saisie grumes',`${f3(t.v)} m³ · ${t.n} grumes`);
  const gv=f.billons.reduce((s,b)=>s+(b.d>0&&lenM(b)>0?volB(b):0),0);
  $('#main').innerHTML=`<div class="stack">
  <div class="row"><label class="f" style="flex:0 0 150px"><span class="l">N° grume</span><input class="big" id="num" type="number" inputmode="numeric" value="${esc(f.num)}"></label><label class="f"><span class="l">Essence</span>${chips('ess',p.essences,f.ess,true)}</label></div>
  ${f.billons.map((b,i)=>`<div class="card stack" data-b="${i}"><div class="row"><b class="grow">Billon ${f.num}.${i+1}</b><span class="muted">${b.d>0&&lenM(b)>0?f3(volB(b))+' m³':''}</span>${f.billons.length>1?`<button type="button" class="chip small" data-delb="${i}">✕</button>`:''}</div>
   <div class="bill"><label class="f"><span class="l">Longueur (m)</span><input class="big" type="text" inputmode="decimal" data-f="lm" data-i="${i}" value="${lenM(b)>0?String(lenM(b)).replace('.',','):''}" placeholder="m"></label><label class="f"><span class="l">Diamètre (cm)</span><input class="big" type="number" inputmode="numeric" data-f="d" data-i="${i}" value="${b.d??''}" placeholder="cm"></label>
   <div class="q"><span class="muted">Qualité</span>${chips('q'+i,p.qualites,b.q,true)}</div></div></div>`).join('')}
  <button type="button" class="btn big block" id="addB">+ Billon</button>
  <div class="muted">Grume : <b>${f3(gv)} m³</b></div></div>`;
  bindChips();
  $('#main').addEventListener('chip',e=>{const n=e.target.dataset.chips;if(n==='ess')f.ess=e.detail;else if(n.startsWith('q'))f.billons[Number(n.slice(1))].q=e.detail;});
  $('#num').oninput=e=>{f.num=e.target.value;};
  $('#main').querySelectorAll('input[data-f]').forEach(i=>i.oninput=e=>{const b=f.billons[Number(e.target.dataset.i)];b[e.target.dataset.f]=num(e.target.value);});
  $('#main').querySelectorAll('input[data-f=lm]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();i.closest('.bill').querySelector('[data-f=d]').focus();}}));
  $('#main').querySelectorAll('input[data-f=d]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#ok').click();}}));
  $('#addB').onclick=()=>{const lb=f.billons[f.billons.length-1];f.billons.push({rang:f.billons.length+1,lm:null,d:null,q:lb.q});render();setTimeout(()=>{const x=[...document.querySelectorAll('input[data-f=lm]')].pop();x&&x.focus();},0);};
  $('#main').querySelectorAll('[data-delb]').forEach(b=>b.onclick=()=>{f.billons.splice(Number(b.dataset.delb),1);f.billons.forEach((x,i)=>x.rang=i+1);render();});
  foot(`<button class="btn big" id="cancel">${ed?'Annuler':'Terminer'}</button><button class="btn primary big" id="ok" style="flex:2">${ed?'Enregistrer':'Grume suivante ›'}</button>`);
  $('#cancel').onclick=()=>{S.form={};S.edit=null;back();};
  $('#ok').onclick=()=>{const bad=f.billons.find(b=>!(lenM(b)>0)||!(b.d>0));if(bad){toast('Longueur et diamètre obligatoires');return;}
    const numS=String(f.num).replace(/\D/g,'');if(!numS||numS.length>10){toast('N° de grume : 1 à 10 chiffres');return;}
    const dup=l.grumes.find(x=>String(x.num)===numS&&x.id!==ed);if(dup){toast('N° '+numS+' déjà utilisé');return;}
    f.billons.forEach(b=>{b.d=Math.floor(b.d);b.lm=Math.round(lenM(b)*100)/100;delete b.l;b.id=b.id||uid();});
    if(ed){Object.assign(g,{num:numS,ess:f.ess,billons:f.billons});save();S.form={};S.edit=null;back();return;}
    l.grumes.push({id:uid(),num:numS,ess:f.ess,billons:f.billons});save();S.form={};toast('Grume '+numS+' · '+f3(f.billons.reduce((x,b)=>x+volB(b),0))+' m³');render();setTimeout(()=>{const x=document.querySelector('input[data-f=lm]');x&&x.focus();},0);};
  if(!ed)setTimeout(()=>{const x=document.querySelector('input[data-f=lm]');x&&x.focus();},0);};

/* --- Saisie sur pied --- */
V.saisieP=()=>{const l=S.lot,p=S.params,ed=S.edit;let a=ed?l.arbres.find(x=>x.id===ed):null;const mode=ed?(a.h?'pieds':'diam'):l.mode;
  if(!S.form.a){const last=l.arbres[l.arbres.length-1];S.form.a=ed?JSON.parse(JSON.stringify(a)):{num:nextNum(l),ess:last?last.ess:p.essences[0],d:null,h:null,n:1,tr:[]};if(ed)S.form.a.tarif=tarifOf(l,a);else S.form.a.tarif=tarifDef(l,S.form.a.ess);}
  const f=S.form.a,t=lotTotals(l);head(ed?'Modifier tige':'Saisie sur pied',`${f3(t.v)} m³ · ${t.n} tiges`);
  const classes=[];for(let c=p.classMin;c<=p.classMax;c+=stepFor(f.ess))classes.push(c);
  const byClass=mode!=='pieds'&&(p.saisieDiam==='classe'||mode==='classes');
  $('#main').innerHTML=`<div class="stack">
   <div class="row"><label class="f"><span class="l">Essence</span>${chips('ess',p.essences,f.ess,true)}</label></div>
   <div class="tarif-row"><span class="l">Tarif Chaudé ${esc(f.ess)}</span><button type="button" data-t="-1" aria-label="Tarif moins">−</button><b id="tv">${f.tarif}</b><button type="button" data-t="1" aria-label="Tarif plus">+</button></div>
   ${mode==='pieds'?`<label class="f" style="max-width:160px"><span class="l">N° arbre</span><input class="big" id="num" type="number" inputmode="numeric" value="${esc(f.num)}"></label>`:''}
   ${mode==='classes'?`<label class="f" style="max-width:200px"><span class="l">Nombre de tiges</span><input class="big" id="n" type="number" inputmode="numeric" value="${f.n||1}"></label>`:''}
   ${byClass?`<div><span class="muted">Classe de diamètre (cm)${mode==='diam'?' · un appui = une tige':''}</span><div class="grid-cl" id="cl">${classes.map(c=>`<button type="button" data-c="${c}"${f.d===c?' style="background:var(--accent);color:var(--accent-fg)"':''}>${c}</button>`).join('')}</div></div>`
   :`<label class="f" style="max-width:200px"><span class="l">Diamètre à 1,30 m (cm)</span><input class="big" id="d" type="number" inputmode="numeric" value="${f.d??''}" placeholder="cm"></label>`}
   ${mode!=='diam'?`<label class="f" style="max-width:200px"><span class="l">Hauteur (m)${mode==='classes'?' · optionnel':''}</span><input class="big" id="h" type="number" inputmode="decimal" step="0.5" value="${f.h??''}" placeholder="m"></label>
   <div class="stack sec"><span class="sec-t">Tronçons de qualité <span class="muted">(du bas vers le haut, optionnel)</span></span>${trEditor(f.tr||[],'tr')}<p class="muted" style="margin:0">Le reste jusqu’à la hauteur est compté en « ${esc(resteQ())} ».</p></div>`:''}
   ${mode==='diam'&&!byClass?'':''}
   ${l.arbres.length?`<div class="row"><span class="muted grow">Dernière : ${lastArbre(l)}</span><button type="button" class="btn" id="undo">Annuler dernière</button></div>`:''}
  </div>`;
  bindChips();$('#main').addEventListener('chip',e=>{if(e.target.dataset.chips==='ess'){f.ess=e.detail;if(!ed)f.tarif=tarifDef(l,f.ess);render();}});
  $('#main').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{f.tarif=clampT(f.tarif+Number(b.dataset.t));$('#tv').textContent=f.tarif;if(!ed){l.tarifEss=l.tarifEss||{};l.tarifEss[f.ess]=f.tarif;save();}});
  if($('#num'))$('#num').oninput=e=>f.num=e.target.value;if($('#n'))$('#n').oninput=e=>f.n=Math.max(1,Math.round(num(e.target.value)||1));
  if($('#d'))$('#d').oninput=e=>f.d=num(e.target.value);if($('#h'))$('#h').oninput=e=>f.h=num(e.target.value);
  bindTr('tr',()=>{f.tr=readTr('tr');});
  if($('#undo'))$('#undo').onclick=()=>{l.arbres.pop();save();render();};
  const commit=()=>{if(!(f.d>0)){toast('Diamètre manquant');return;}if(mode==='pieds'&&!(f.h>0)){toast('Hauteur obligatoire en pied à pied numéroté');return;}
    if($('#tr'))f.tr=readTr('tr');if(f.h>0&&sumTr(f.tr)>f.h+1e-9){toast('Tronçons : '+sumTr(f.tr)+' m > hauteur '+f.h+' m');return;}const rec={id:ed||uid(),num:mode==='pieds'?String(f.num):'',ess:f.ess,d:Math.floor(f.d),h:f.h>0?f.h:null,n:f.n||1,tr:f.tr||[],tarif:clampT(f.tarif),sl:a?a.sl:null};l.tarifEss=l.tarifEss||{};if(!ed)l.tarifEss[rec.ess]=rec.tarif;
    if(ed){Object.assign(a,rec);save();S.form={};S.edit=null;back();return;}
    l.arbres.push(rec);save();S.form={};toast((rec.n>1?rec.n+' × ':'')+rec.ess+' '+rec.d+(rec.h?' · '+rec.h+' m':'')+' · T'+rec.tarif);render();};
  if($('#cl'))$('#cl').onclick=e=>{const b=e.target.closest('button');if(!b)return;f.d=Number(b.dataset.c);if(mode==='diam'&&!ed)commit();else render();};
  foot(`<button class="btn big" id="cancel">${ed?'Annuler':'Terminer'}</button>${(mode==='diam'&&byClass&&!ed)?'':`<button class="btn primary big" id="ok" style="flex:2">${ed?'Enregistrer':'Ajouter ›'}</button>`}`);
  $('#cancel').onclick=()=>{S.form={};S.edit=null;back();};if($('#ok'))$('#ok').onclick=commit;
  if(!ed&&$('#d'))setTimeout(()=>{const x=$('#d');x&&x.focus();},0);};
function lastArbre(l){const a=l.arbres[l.arbres.length-1];if(!a)return '';return (a.n>1?a.n+'×':'')+a.ess+' '+a.d+(a.h?' · '+a.h+' m':'')+' · T'+tarifOf(l,a);}
function bindTr(id,onChange){const root=$('#'+id);if(!root)return;root.addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){d.closest('.tr-row').remove();onChange&&onChange();return;}
  const ad=e.target.closest('[data-add-tr]');if(ad){const list=readTr(id);list.push({h:null,q:''});root.outerHTML=trEditor(list,id);bindTr(id,onChange);const x=[...document.querySelectorAll(`#${id} [data-f=h]`)].pop();x&&x.focus();}});
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

/* --- Listing --- */
V.listing=()=>{const l=S.lot;const sl=S.slFilter||'';head('Listing',l.chantier);const rows=listing(l,sl);
  const slSel=(l.sousLots||[]).length?`<select id="slf"><option value="">Tout le lot</option>${l.sousLots.map(s=>`<option value="${s.id}"${s.id===sl?' selected':''}>${esc(s.nom)}</option>`).join('')}</select>`:'';
  const slOpt=id=>`<option value="">—</option>`+(l.sousLots||[]).map(s=>`<option value="${s.id}"${s.id===id?' selected':''}>${esc(s.nom)}</option>`).join('');
  $('#main').innerHTML=`${slSel}<div class="tbl" style="margin-top:8px"><table>${l.type==='grumes'
   ?`<tr><th>N°</th><th>Ess.</th><th>Q</th><th class="n">L m</th><th class="n">Ø cm</th><th class="n">m³</th>${(l.sousLots||[]).length?'<th>Sous-lot</th>':''}<th></th></tr>${l.grumes.map(g=>g.billons.map((b,i)=>(sl&&b.sl!==sl)?'':`<tr><td>${esc(g.num)}.${b.rang}</td><td>${esc(g.ess)}</td><td>${esc(b.q||'')}</td><td class="n">${f2(lenM(b))}</td><td class="n">${b.d}</td><td class="n">${f3(volB(b))}</td>${(l.sousLots||[]).length?`<td><select data-slb="${g.id}|${b.id}" style="min-height:36px;padding:2px 6px">${slOpt(b.sl)}</select></td>`:''}${i===0?`<td><button type="button" class="chip small" data-editg="${g.id}">✎</button> <button type="button" class="chip small" data-delg="${g.id}">✕</button></td>`:'<td></td>'}</tr>`).join('')).join('')}`
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
V.recap=()=>{const l=S.lot,sl=S.slFilter||'';head('Récapitulatif',l.chantier);const r=recap(l,sl);
  const slSel=(l.sousLots||[]).length?`<select id="slf"><option value="">Tout le lot</option>${l.sousLots.map(s=>`<option value="${s.id}"${s.id===sl?' selected':''}>${esc(s.nom)}</option>`).join('')}</select>`:'';
  let html=slSel+`<div class="row" style="margin:8px 0"><span class="muted grow">Grille : <b>${esc(r.grille?r.grille.nom:'aucune')}</b></span><button class="btn" data-go="lotGrille">Changer</button></div>`;
  if(l.type==='pied'&&r.classes.length)html+=`<h2>Par essence et classe de diamètre</h2><div class="tbl"><table><tr><th>Ess.</th><th class="n">Classe</th><th class="n">Ø cm</th><th class="n">Tiges</th><th class="n">H moy m</th><th class="n">m³</th><th class="n">m³/tige</th></tr>${classRecap(r).map(c=>c.kind==='c'?`<tr><td>${esc(c.ess)}</td><td class="n">${c.c}</td><td class="n muted">${clsRange(c.ess,c.c)}</td><td class="n">${c.n}${c.sans?` <span class="pill warn">${c.sans} sans H</span>`:''}</td><td class="n">${f1(c.hm)}</td><td class="n">${f3(c.v)}</td><td class="n">${f3(c.vt)}</td></tr>`:`<tr class="${c.kind==='t'?'tot':'grp'}"><td colspan="3">${c.kind==='t'?'Total':'Total '+esc(c.ess)}</td><td class="n">${c.n}</td><td class="n">${f1(c.hm)}</td><td class="n">${f3(c.v)}</td><td class="n">${f3(c.vt)}</td></tr>`).join('')}</table></div>`;
  html+=`<h2>Par essence, qualité et classe</h2><div class="tbl"><table><tr><th>Ess.</th><th>Q</th><th class="n">Cl.</th><th class="n">${l.type==='grumes'?'Billons':'Tiges'}</th>${l.type==='grumes'?'<th class="n">Ø moy</th><th class="n">L moy</th>':''}<th class="n">m³</th><th class="n">€/m³</th><th class="n">€</th></tr>`;
  let pe='';for(const x of r.rows){if(x.ess!==pe){pe=x.ess;const sub=r.rows.filter(y=>y.ess===pe);html+=`<tr class="grp"><td colspan="${l.type==='grumes'?6:4}">${esc(pe)}</td><td class="n">${f3(sub.reduce((s,y)=>s+y.v,0))}</td><td></td><td class="n">${sub.some(y=>y.m!=null)?f2(sub.reduce((s,y)=>s+(y.m||0),0)):''}</td></tr>`;}
    html+=`<tr><td>${esc(x.ess)}</td><td>${esc(x.q||'·')}</td><td class="n">${x.c}</td><td class="n">${x.n}</td>${l.type==='grumes'?`<td class="n">${f1(x.dm)}</td><td class="n">${f1(x.lm)}</td>`:''}<td class="n">${f3(x.v)}</td><td class="n">${x.p!=null?f2(x.p):'—'}</td><td class="n">${x.m!=null?f2(x.m):'—'}</td></tr>`;}
  html+=`<tr class="tot"><td colspan="${l.type==='grumes'?6:4}">Total</td><td class="n">${f3(r.tot.v)}</td><td></td><td class="n">${r.tot.m!=null?f2(r.tot.m):'—'}</td></tr></table></div>`;
  $('#main').innerHTML=html;if($('#slf'))$('#slf').onchange=e=>{S.slFilter=e.target.value;render();};
  foot(`<button class="btn" id="pdf">PDF</button><button class="btn" id="xlsx">Excel</button>`);$('#pdf').onclick=()=>exportPDF(l,sl);$('#xlsx').onclick=()=>exportXLSX(l,sl);};

/* --- Sous-lots --- */
V.sousLots=()=>{const l=S.lot;head('Sous-lots',l.chantier);l.sousLots=l.sousLots||[];
  $('#main').innerHTML=`<p class="muted">Un sous-lot affecte une partie du lot à un client. L’affectation se fait ligne par ligne dans le listing.</p><div class="list">${l.sousLots.map(s=>`<div class="item"><div class="t"><b>${esc(s.nom)}</b><small>${esc(s.client||'')}</small></div><button type="button" class="chip small" data-del="${s.id}">✕</button></div>`).join('')}</div>
  <div class="card stack" style="margin-top:12px"><label class="f"><span class="l">Nom du sous-lot</span><input id="nom" placeholder="ex. Scierie X"></label><label class="f"><span class="l">Client</span><input id="cli"></label><button class="btn primary" id="add">Ajouter</button></div>`;
  $('#add').onclick=()=>{const n=$('#nom').value.trim();if(!n)return;l.sousLots.push({id:uid(),nom:n,client:$('#cli').value.trim()});save();render();};
  $('#main').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const id=b.dataset.del;l.sousLots=l.sousLots.filter(s=>s.id!==id);l.grumes.forEach(g=>g.billons.forEach(x=>{if(x.sl===id)x.sl=null;}));l.arbres.forEach(a=>{if(a.sl===id)a.sl=null;});save();render();});foot('');};

/* --- Grille du lot --- */
V.lotGrille=()=>{const l=S.lot;head('Grille du lot',l.chantier);
  $('#main').innerHTML=`<div class="card stack"><label class="f"><span class="l">Grille catalogue appliquée</span><select id="g"><option value="">Aucune</option>${S.grilles.filter(g=>g.type===l.type).map(g=>`<option value="${g.id}"${(!l.grilleLocal&&g.id===l.grilleId)?' selected':''}>${esc(g.nom)}</option>`).join('')}</select></label>
  ${l.grilleLocal?`<div class="msg good">Ce lot utilise une copie locale « ${esc(l.grilleLocal.nom)} ». <button class="btn" id="editLocal">Modifier</button> <button class="btn danger" id="dropLocal">Retirer</button></div>`:`<button class="btn" id="copy"${l.grilleId?'':' disabled'}>Copier la grille dans le lot pour la modifier</button>`}</div>`;
  $('#g').onchange=e=>{l.grilleId=e.target.value||null;l.grilleLocal=null;save();render();};
  if($('#copy'))$('#copy').onclick=()=>{const g=S.grilles.find(x=>x.id===l.grilleId);if(!g)return;l.grilleLocal=JSON.parse(JSON.stringify(g));l.grilleLocal.nom=g.nom+' (lot)';save();S.hist.push('lotGrille');go('grille',{gEdit:{local:true}});};
  if($('#editLocal'))$('#editLocal').onclick=()=>{S.hist.push('lotGrille');go('grille',{gEdit:{local:true}});};
  if($('#dropLocal'))$('#dropLocal').onclick=()=>{l.grilleLocal=null;save();render();};foot('');};

/* --- Catalogue de grilles --- */
V.grilles=()=>{head('Grilles de prix');
  $('#main').innerHTML=`<div class="list">${S.grilles.map(g=>`<button class="item" data-g="${g.id}"><div class="t"><b>${esc(g.nom)} <span class="pill">${g.type}</span></b><small>${(g.lignes||[]).length} lignes</small></div><span class="v">›</span></button>`).join('')||'<p class="muted">Aucune grille.</p>'}</div>
  <div class="row" style="margin-top:12px"><button class="btn primary grow" data-new="grumes">+ Grille grumes</button><button class="btn primary grow" data-new="pied">+ Grille sur pied</button></div>`;
  $('#main').querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{S.hist.push('grilles');go('grille',{gEdit:{id:b.dataset.g}});});
  $('#main').querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>{const g={id:uid(),nom:'Nouvelle grille',type:b.dataset.new,lignes:[]};S.grilles.push(g);saveGrille(g);S.hist.push('grilles');go('grille',{gEdit:{id:g.id}});});foot('');};
V.grille=()=>{const e=S.gEdit;const g=e.local?S.lot.grilleLocal:S.grilles.find(x=>x.id===e.id);const persist=()=>e.local?save():saveGrille(g);head(g.nom,'Prix €/m³ · champs vides = toutes');
  const p=S.params;g.lignes=g.lignes||[];
  const qOpts=[...p.qualites,...(g.type==='pied'&&!p.qualites.includes(resteQ())?[resteQ()]:[])];
  $('#main').innerHTML=`<label class="f"><span class="l">Nom</span><input id="nom" value="${esc(g.nom)}"></label>
  <p class="muted" style="margin:10px 0">Un champ vide s’applique à toutes les essences, qualités ou diamètres. La ligne la plus précise l’emporte.</p>
  <div class="stack">${g.lignes.map((l,i)=>`<div class="card gl" data-gl="${i}">
   <div class="gl-row"><label class="f"><span class="l">Essence</span><select data-f="ess"><option value="">Toutes</option>${p.essences.map(x=>`<option${x===l.ess?' selected':''}>${esc(x)}</option>`).join('')}</select></label>
   <label class="f"><span class="l">Qualité</span><select data-f="q"><option value="">Toutes</option>${qOpts.map(x=>`<option${x===l.q?' selected':''}>${esc(x)}</option>`).join('')}</select></label>
   <button type="button" class="gl-del" data-del="${i}" aria-label="Supprimer la ligne">✕</button></div>
   <div class="gl-row"><label class="f"><span class="l">Ø min cm</span><input data-f="dmin" type="text" inputmode="numeric" value="${l.dmin??''}"></label>
   <label class="f"><span class="l">Ø max cm</span><input data-f="dmax" type="text" inputmode="numeric" value="${l.dmax??''}"></label>
   <label class="f"><span class="l">Prix €/m³</span><input data-f="prix" type="text" inputmode="decimal" value="${l.prix!=null?String(l.prix).replace('.',','):''}"></label></div>
  </div>`).join('')||'<p class="muted">Aucune ligne. Ajoutez la première.</p>'}</div>
  <div class="row" style="margin-top:12px"><button class="btn primary big grow" id="add">+ Ligne</button>${e.local?'':'<button class="btn danger" id="del">Supprimer la grille</button>'}</div>`;
  $('#nom').oninput=x=>{g.nom=x.target.value;persist();};
  $('#main').querySelectorAll('[data-gl]').forEach(tr=>{const l=g.lignes[Number(tr.dataset.gl)];tr.querySelectorAll('[data-f]').forEach(inp=>inp.onchange=()=>{const f=inp.dataset.f;l[f]=(f==='ess'||f==='q')?inp.value:num(inp.value);persist();});});
  $('#main').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{g.lignes.splice(Number(b.dataset.del),1);persist();render();});
  $('#add').onclick=()=>{const last=g.lignes[g.lignes.length-1];g.lignes.push({ess:last?last.ess:'',q:'',dmin:null,dmax:null,prix:null});persist();render();};
  if($('#del'))$('#del').onclick=x=>{if(x.target.dataset.c){S.grilles=S.grilles.filter(y=>y!==g);DB.del('grilles',g.id);S.lots.forEach(l=>{if(l.grilleId===g.id){l.grilleId=null;DB.put('lots',l);}});back();}else{x.target.textContent='Confirmer';x.target.dataset.c='1';}};
  foot(`<button class="btn primary big" id="ok">Terminé</button>`);$('#ok').onclick=back;};

/* --- Paramètres --- */
V.params=()=>{const p=S.params;head('Paramètres');
  $('#main').innerHTML=`<div class="stack">
  <div class="card stack"><h2>Référentiel</h2><label class="f"><span class="l">Essences (séparées par des virgules)</span><input id="ess" value="${esc(p.essences.join(', '))}"></label><label class="f"><span class="l">Qualités</span><input id="qua" value="${esc(p.qualites.join(', '))}"></label>
  <div class="row"><label class="f"><span class="l">Pas des classes (cm)</span><input id="step" type="number" inputmode="numeric" value="${p.step}"></label><label class="f"><span class="l">Classe min</span><input id="cmin" type="number" inputmode="numeric" value="${p.classMin}"></label><label class="f"><span class="l">Classe max</span><input id="cmax" type="number" inputmode="numeric" value="${p.classMax}"></label></div>
  <label class="f"><span class="l">Pas par essence (ex. CH:5, PIN:5)</span><input id="stepE" value="${esc(Object.entries(p.stepParEssence||{}).map(([k,v])=>k+':'+v).join(', '))}"></label></div>
  <div class="card stack"><h2>Saisie</h2><label class="f"><span class="l">Qualité du 1er billon</span><select id="rep"><option value="1"${p.repriseQualite?' selected':''}>Reprend la dernière qualité saisie</option><option value="0"${p.repriseQualite?'':' selected'}>Vide</option></select></label>
  <label class="f"><span class="l">Diamètre sur pied (mode diamètre seul)</span><select id="sd"><option value="classe"${p.saisieDiam==='classe'?' selected':''}>Boutons de classes</option><option value="cm"${p.saisieDiam==='cm'?' selected':''}>Saisie au cm</option></select></label>
  <label class="f"><span class="l">Code qualité du reste de tige (au-dessus des tronçons)</span><input id="rq" value="${esc(p.resteQualite||'BI')}" placeholder="BI"></label>
  <label class="f"><span class="l">Opérateur</span><input id="op" value="${esc(p.operateur)}"></label></div>
  <div class="card stack"><h2>Synchronisation Google Sheet</h2><label class="f"><span class="l">URL du script Apps Script</span><input id="url" value="${esc(p.syncUrl)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
  <div class="row"><button class="btn grow" id="loadRef">Charger le référentiel du Sheet</button><button class="btn grow" id="syncAll">Sauvegarder tous les lots</button></div>${p.refLoaded?`<span class="muted">Référentiel chargé le ${esc(p.refLoaded)}</span>`:''}</div>
  <div class="card stack"><h2>Données locales</h2><div class="row"><button class="btn grow" id="exportAll">Exporter tout (JSON)</button><label class="btn grow" for="imp">Importer un lot JSON</label><input id="imp" type="file" accept=".json,application/json" hidden></div></div>
  </div>`;
  const splitList=v=>v.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  const upd=()=>{p.essences=splitList($('#ess').value);p.qualites=splitList($('#qua').value);p.step=Number($('#step').value)||5;p.classMin=Number($('#cmin').value)||10;p.classMax=Number($('#cmax').value)||90;
    p.stepParEssence={};splitList($('#stepE').value).forEach(x=>{const[k,v]=x.split(':');if(k&&Number(v))p.stepParEssence[k.trim()]=Number(v);});
    p.repriseQualite=$('#rep').value==='1';p.saisieDiam=$('#sd').value;p.resteQualite=$('#rq').value.trim()||'BI';p.operateur=$('#op').value.trim();p.syncUrl=$('#url').value.trim();saveParams();};
  $('#main').querySelectorAll('input,select').forEach(i=>{if(i.id!=='imp')i.onchange=upd;});
  $('#loadRef').onclick=async()=>{upd();await loadRef();render();};$('#syncAll').onclick=async()=>{upd();for(const l of S.lots)if(l.sync!=='done')await syncLot(l,true);toast('Sauvegarde terminée');render();};
  $('#exportAll').onclick=()=>shareFile(new Blob([JSON.stringify({params:p,grilles:S.grilles,lots:S.lots},null,1)],{type:'application/json'}),'cubage-sbf-'+today()+'.json');
  $('#imp').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const j=JSON.parse(await f.text());const lots=j.lots||(j.id&&j.type?[j]:[]);for(const l of lots){if(!S.lots.find(x=>x.id===l.id)){S.lots.push(l);await DB.put('lots',l);}}
    for(const g of j.grilles||[])if(!S.grilles.find(x=>x.id===g.id)){S.grilles.push(g);await saveGrille(g);}toast(lots.length+' lot(s) importé(s)');render();}catch(x){toast('Fichier illisible');}};foot('');};

/* ---------- Exports ---------- */
const fname=(l,ext)=>((l.chantier||'lot').replace(/[^\w\-]+/g,'_')+'_'+l.date+'.'+ext);
async function shareFile(blob,name){const file=new File([blob],name,{type:blob.type});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return;}}catch(e){if(e&&e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);toast('Fichier '+name);}
function exportXLSX(l,sl){if(!window.XLSX){toast('Module Excel non chargé (ouvrir une fois en ligne)');return;}const r=recap(l,sl),li=listing(l,sl);const wb=XLSX.utils.book_new();
  const lot=[['Chantier',l.chantier||''],['Date',l.date],['Opérateur',l.operateur||''],['Type',l.type==='grumes'?'Grumes bord de route':'Bois sur pied'],['Tarif Chaudé par défaut',l.type==='pied'?l.tarif:''],['Sous-lot',sl?slName(l,sl):'Tout le lot'],['Grille de prix',r.grille?r.grille.nom:''],['Volume total m³',Math.round(r.tot.v*1000)/1000],['Montant €',r.tot.m!=null?Math.round(r.tot.m*100)/100:'']];
  (l.sousLots||[]).forEach(s=>lot.push(['Sous-lot '+s.nom,s.client||'']));XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(lot),'Lot');
  const L=l.type==='grumes'?[['N°','Essence','Qualité','Longueur m','Diamètre cm','Classe','Volume m³','Sous-lot'],...li.map(x=>[x.num,x.ess,x.q,x.l,x.d,x.c,Math.round(x.v*1000)/1000,x.sl])]
    :[['N°','Essence','Diamètre cm','Classe','Tarif Chaudé','Tiges','Hauteur m','Tronçons','Volume m³','Sous-lot'],...li.map(x=>[x.num,x.ess,x.d,x.c,x.t,x.n,x.h,x.tr,x.v!=null?Math.round(x.v*1000)/1000:'',x.sl])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(L),'Listing');
  const R=l.type==='grumes'?[['Essence','Qualité','Classe','Billons','Ø moyen','L moyenne','Volume m³','Prix €/m³','Montant €'],...r.rows.map(x=>[x.ess,x.q,x.c,x.n,x.dm,x.lm,Math.round(x.v*1000)/1000,x.p,x.m!=null?Math.round(x.m*100)/100:''])]
    :[['Essence','Qualité','Classe','Tiges','Volume m³','Prix €/m³','Montant €'],...r.rows.map(x=>[x.ess,x.q,x.c,x.n,Math.round(x.v*1000)/1000,x.p,x.m!=null?Math.round(x.m*100)/100:''])];
  R.push(['Total','','',r.tot.n,...(l.type==='grumes'?['','']:[]),Math.round(r.tot.v*1000)/1000,'',r.tot.m!=null?Math.round(r.tot.m*100)/100:'']);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(R),'Récapitulatif');
  if(l.type==='pied')XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Essence','Classe','Diamètres cm','Tiges','Sans hauteur','Hauteur moyenne m','Volume m³','m³/tige'],...classRecap(r).map(c=>[c.kind==='c'?c.ess:(c.kind==='t'?'Total':'Total '+c.ess),c.kind==='c'?c.c:'',c.kind==='c'?clsRange(c.ess,c.c):'',c.n,c.sans||'',c.hm!=null?Math.round(c.hm*10)/10:'',Math.round(c.v*1000)/1000,c.vt!=null?Math.round(c.vt*1000)/1000:''])]),'Classes');
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});shareFile(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),fname(l,'xlsx'));}
function exportPDF(l,sl){if(!window.jspdf){toast('Module PDF non chargé (ouvrir une fois en ligne)');return;}const{jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4'});const r=recap(l,sl),li=listing(l,sl);
  const title=(l.type==='grumes'?'Cubage grumes bord de route':'Estimation bois sur pied')+(sl?' · '+slName(l,sl):'');
  const hdr=()=>{doc.setFontSize(14);doc.text('SBF — '+title,14,16);doc.setFontSize(9);doc.text(`Chantier : ${l.chantier||''}   Date : ${l.date}   Opérateur : ${l.operateur||''}`,14,22);};
  hdr();const fr=v=>v==null?'':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3});const fe=v=>v==null?'':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  doc.setFontSize(11);doc.text('Récapitulatif par essence, qualité et classe'+(r.grille?'  —  grille : '+r.grille.nom:''),14,30);
  const head=l.type==='grumes'?[['Essence','Qualité','Classe','Billons','Ø moy','L moy','m³','€/m³','€']]:[['Essence','Qualité','Classe','Tiges','m³','€/m³','€']];
  const body=r.rows.map(x=>l.type==='grumes'?[x.ess,x.q||'·',x.c,x.n,f1(x.dm),f1(x.lm),fr(x.v),fe(x.p),fe(x.m)]:[x.ess,x.q||'·',x.c,x.n,fr(x.v),fe(x.p),fe(x.m)]);
  body.push(l.type==='grumes'?['Total','','',r.tot.n,'','',fr(r.tot.v),'',fe(r.tot.m)]:['Total','','',r.tot.n,fr(r.tot.v),'',fe(r.tot.m)]);
  doc.autoTable({startY:33,head,body,styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'},1:{halign:'left'}},headStyles:{fillColor:[31,77,43]},didParseCell:d=>{if(d.row.index===body.length-1&&d.section==='body')d.cell.styles.fontStyle='bold';}});
  if(l.type==='pied'&&r.classes.length){doc.autoTable({startY:doc.lastAutoTable.finalY+6,head:[['Essence','Classe','Ø cm','Tiges','Sans H','H moy','m³','m³/tige']],body:classRecap(r).map(c=>[c.kind==='c'?c.ess:(c.kind==='t'?'Total':'Total '+c.ess),c.kind==='c'?c.c:'',c.kind==='c'?clsRange(c.ess,c.c):'',c.n,c.sans||'',c.hm!=null?f1(c.hm):'',fr(c.v),c.vt!=null?fr(c.vt):'']),didParseCell:d=>{if(d.section==='body'&&String(d.row.raw[0]).startsWith('Total'))d.cell.styles.fontStyle='bold';},styles:{fontSize:8,halign:'right'},columnStyles:{0:{halign:'left'}},headStyles:{fillColor:[31,77,43]}});}
  doc.addPage();hdr();doc.setFontSize(11);doc.text('Listing',14,30);
  const lh=l.type==='grumes'?[['N°','Ess.','Q','L m','Ø cm','Cl.','m³','Sous-lot']]:[['N°','Ess.','Ø cm','Cl.','T','Tiges','H m','Tronçons','m³','Sous-lot']];
  const lb=li.map(x=>l.type==='grumes'?[x.num,x.ess,x.q,f2(x.l),x.d,x.c,fr(x.v),x.sl]:[x.num,x.ess,x.d,x.c,x.t,x.n,x.h!=null?f1(x.h):'',x.tr,fr(x.v),x.sl]);
  doc.autoTable({startY:33,head:lh,body:lb,styles:{fontSize:7.5,halign:'right'},columnStyles:l.type==='grumes'?{0:{halign:'left'},1:{halign:'left'},2:{halign:'left'},7:{halign:'left'}}:{0:{halign:'left'},1:{halign:'left'},7:{halign:'left'},9:{halign:'left'}},headStyles:{fillColor:[31,77,43]}});
  const n=doc.internal.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.text(`Page ${i}/${n}`,196,290,{align:'right'});}
  shareFile(doc.output('blob'),fname(l,'pdf'));}

/* ---------- Synchronisation ---------- */
function lotRows(l){const LOT=[{lot_id:l.id,type:l.type,chantier:l.chantier||'',date:l.date,operateur:l.operateur||'',tarif:l.type==='pied'?l.tarif:'',mode:l.type==='pied'?l.mode:'',grille:(lotGrille(l)||{}).nom||'',volume_m3:Math.round(lotTotals(l).v*1000)/1000,updated:l.updated||''}];
  const SOUS_LOT=(l.sousLots||[]).map(s=>({lot_id:l.id,sous_lot_id:s.id,nom:s.nom,client:s.client||''}));
  const GRUME=[],BILLON=[],ARBRE=[],TRONCON=[];
  for(const g of l.grumes){GRUME.push({lot_id:l.id,grume_id:g.id,num:g.num,essence:g.ess});for(const b of g.billons)BILLON.push({lot_id:l.id,grume_id:g.id,billon_id:b.id,num:g.num+'.'+b.rang,rang:b.rang,essence:g.ess,qualite:b.q||'',longueur_m:lenM(b),diametre_cm:b.d,classe:cls(g.ess,b.d),volume_m3:Math.round(volB(b)*10000)/10000,sous_lot_id:b.sl||''});}
  for(const a of l.arbres){const x=arbreCalc(l,a);ARBRE.push({lot_id:l.id,arbre_id:a.id,num:a.num||'',essence:a.ess,diametre_cm:a.d,classe:cls(a.ess,a.d),tarif:tarifOf(l,a),tiges:a.n||1,hauteur_m:x.h||'',volume_m3:x.v!=null?Math.round(x.v*10000)/10000:'',sous_lot_id:a.sl||''});
    x.tronc.forEach((t,i)=>TRONCON.push({lot_id:l.id,arbre_id:a.id,rang:i+1,hauteur_m:t.h,qualite:t.q||'',volume_m3:Math.round(t.v*10000)/10000}));}
  return{LOT,SOUS_LOT,GRUME,BILLON,ARBRE,TRONCON};}
async function syncLot(l,quiet){const url=S.params.syncUrl;if(!url){toast('Renseignez l’URL du script dans Paramètres');return;}if(!navigator.onLine){toast('Hors ligne : le lot sera à renvoyer');return;}
  try{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'saveLot',lot_id:l.id,rows:lotRows(l)})});
    const j=await res.json();if(j&&j.ok){l.sync='done';l.synced=new Date().toISOString();await DB.put('lots',l);if(!quiet){toast('Lot sauvegardé sur le Sheet');render();}}else throw new Error(j&&j.error||'réponse invalide');}
  catch(e){l.sync='pending';DB.put('lots',l);toast('Échec de la sauvegarde : '+e.message);}}
async function loadRef(){const url=S.params.syncUrl;if(!url){toast('URL du script manquante');return;}try{const res=await fetch(url+(url.includes('?')?'&':'?')+'action=params');const j=await res.json();const p=S.params;
  if(j.essences&&j.essences.length)p.essences=j.essences;if(j.qualites&&j.qualites.length)p.qualites=j.qualites;if(j.classes){if(j.classes.step)p.step=j.classes.step;if(j.classes.min)p.classMin=j.classes.min;if(j.classes.max)p.classMax=j.classes.max;if(j.classes.parEssence)p.stepParEssence=j.classes.parEssence;}
  for(const g of j.grilles||[]){const ex=S.grilles.find(x=>x.id===g.id);if(ex)Object.assign(ex,g);else S.grilles.push(g);await saveGrille(ex||g);}
  if(j.dmm&&Object.keys(j.dmm).length){Object.assign(Calc.DMM,j.dmm);p.dmm=j.dmm;}p.refLoaded=today();await saveParams();toast('Référentiel chargé');}catch(e){toast('Échec du chargement : '+e.message);}}

/* ---------- Rendu ---------- */
function render(){const v=V[S.screen]||V.home;v();
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{S.hist.push(S.screen);S.form={};S.edit=null;go(b.dataset.go);});
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{S.lot=S.lots.find(l=>l.id===b.dataset.open);S.slFilter='';S.hist=['home'];go('lot');});}
(async()=>{await DB.open();const p=await DB.get('params','params');S.params=Object.assign({},DEF_PARAMS,p||{});if(S.params.dmm)Object.assign(Calc.DMM,S.params.dmm);
  S.lots=(await DB.all('lots'))||[];S.grilles=(await DB.all('grilles'))||[];S.lots.forEach(l=>{l.grumes=l.grumes||[];l.arbres=l.arbres||[];l.sousLots=l.sousLots||[];l.classH=l.classH||{};});
  render();if('serviceWorker'in navigator&&location.protocol==='https:'&&!/claude\.(ai|site)/.test(location.host)){navigator.serviceWorker.register('sw.js').catch(()=>{});}})();
})();
