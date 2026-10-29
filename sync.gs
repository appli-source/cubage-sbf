/**
 * Cubage SBF : script de synchronisation (Google Apps Script) — version 3.1 (point GPS modifiable depuis le bureau ; numéros écrits en texte, plus de conversion en dates).
 * À coller dans Extensions > Apps Script du Google Sheet « Cubage SBF - Référentiel et lots »,
 * puis Déployer > Gérer les déploiements > modifier > Version : Nouvelle version > Déployer
 * (l'adresse /exec reste la même).
 *
 * Clés : onglet CLES du Sheet (colonnes : cle, operateur, role [terrain|bureau], actif [oui|non], cree_le, note),
 * géré depuis l'espace Bureau de l'application. Les deux constantes ci-dessous restent des clés « maîtres » de secours.
 */
const CLE = 'A_REMPLACER';
const CLE_BUREAU = 'A_REMPLACER_BUREAU';

// Onglets de sauvegarde des lots (remplacés lot par lot à chaque envoi)
const TABLES = ['LOT','SOUS_LOT','GRUME','BILLON','ARBRE','TRONCON','RECOUPE','LOT_JSON'];
// Onglets des lots clients (remplacés lot client par lot client)
const TABLES_CLIENT = ['LOT_CLIENT','LOT_CLIENT_LIGNE'];

function auth_(ss, key) {
  key = String(key || ''); if (!key) return null;
  const rows = sheetRows_(ss, 'CLES');
  for (const r of rows) if (String(r.cle) === key) { if (String(r.actif || 'oui').toLowerCase().indexOf('non') === 0) return null;
    return { role: String(r.role || 'terrain').toLowerCase() === 'bureau' ? 'bureau' : 'terrain', operateur: String(r.operateur || '').trim(), cle: key }; }
  if (key === CLE_BUREAU) return { role: 'bureau', operateur: '', cle: key };
  if (key === CLE) return { role: 'terrain', operateur: '', cle: key };
  return null;
}
function stamp_(rows, op) { // force l'opérateur de la clé sur les lignes qui ont une colonne operateur
  if (!op) return rows; Object.keys(rows || {}).forEach(t => (rows[t] || []).forEach(r => { if ('operateur' in r) r.operateur = op; })); return rows; }

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auth = auth_(ss, body.key);
    if (!auth) return out_({ ok:false, error:'clé refusée' });
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try { return out_(handle_(ss, auth, body)); } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok:false, error: String(err) }); }
}

function handle_(ss, auth, body) {
  const role = auth.role;
  if (body.action === 'saveLot') { replaceRows_(ss, TABLES, 'lot_id', body.lot_id, stamp_(body.rows, auth.operateur)); return { ok:true, lot_id: body.lot_id, at: new Date().toISOString() }; }
  if (body.action === 'saveClient') { if (auth.operateur && body.client) body.client.operateur = auth.operateur; return saveClient_(ss, role, body); }
  if (body.action === 'setLotGps') { if (role !== 'bureau') return { ok:false, error:'réservé au bureau' }; return setLotGps_(ss, body.lot_id, body.gps); }
  if (body.action === 'setClientStatut') { if (role !== 'bureau') return { ok:false, error:'réservé au bureau' }; return setStatut_(ss, body.client_id, body.statut, auth.operateur); }
  if (body.action === 'purgeLots') { // vide tous les onglets de lots (référentiel et clés conservés) — réservé au bureau, confirmation 'VIDER'
    if (auth.cle !== CLE_BUREAU) return { ok:false, error:'réservé à la clé maître du bureau (constante CLE_BUREAU du script)' }; if (body.confirm !== 'VIDER') return { ok:false, error:'confirmation manquante' };
    let n = 0; TABLES.concat(TABLES_CLIENT).forEach(name => { const sh = ss.getSheetByName(name); if (!sh) return; delete ROWS_CACHE_[name]; const last = sh.getLastRow(); if (last > 1) { sh.getRange(2, 1, last - 1, Math.max(1, sh.getLastColumn())).clearContent(); n += last - 1; } });
    return { ok:true, lignes_supprimees: n, at: new Date().toISOString() };
  }
  if (body.action === 'saveGrille' || body.action === 'deleteGrille') { if (role !== 'bureau') return { ok:false, error:'réservé au bureau' }; return saveGrille_(ss, body.action === 'deleteGrille' ? null : body.grille, body.code); }
  if (body.action === 'setKey') { if (role !== 'bureau') return { ok:false, error:'réservé au bureau' }; return setKey_(ss, body); }
  if (body.action === 'batch') { // plusieurs opérations en un seul appel ; arrêt à la première erreur
    const results = []; for (const op of (body.ops || [])) { const r = handle_(ss, auth, op); results.push(r); if (!r.ok) break; }
    return { ok: results.length > 0 && results.every(r => r.ok), results: results, at: new Date().toISOString() };
  }
  return { ok:false, error:'action inconnue' };
}

function doGet(e) {
  const p = e.parameter || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auth = auth_(ss, p.key);
  if (!auth) return out_({ ok:false, error:'clé refusée' });
  const role = auth.role;
  if (p.action === 'params') return out_(Object.assign(params_(ss, role), { operateur: auth.operateur }));
  if (p.action === 'restore') return out_(restore_(ss, p.all ? '' : (auth.operateur || p.operateur)));
  if (p.action === 'stock') { if (role !== 'bureau') return out_({ ok:false, error:'réservé au bureau' }); return out_(stock_(ss)); }
  if (p.action === 'keys') { if (role !== 'bureau') return out_({ ok:false, error:'réservé au bureau' }); return out_({ ok:true, keys: sheetRows_(ss, 'CLES') }); }
  return out_({ ok:true, info:'Cubage SBF : script actif', role: role, operateur: auth.operateur });
}

/* ---------- utilitaires onglets ---------- */
const ROWS_CACHE_ = {}; // lecture d'un onglet une seule fois par appel
function sheetRows_(ss, name) { if (ROWS_CACHE_[name]) return ROWS_CACHE_[name];
  const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return (ROWS_CACHE_[name] = []);
  const v = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues(); const h = v[0].map(String);
  return (ROWS_CACHE_[name] = v.slice(1).map(r => { const o = {}; h.forEach((k,i) => { if (k) o[k] = r[i]; }); return o; })); }
/* Colonnes à écrire en texte brut : sinon Google Sheets (réglage régional français) transforme « 1.2 » en date (1er février)
   et « 1 » en date du mois, ce qui casse les numéros de grumes et de billons. */
const COLONNES_TEXTE = ['num','numero','parent_num','billon_key','parent_key','piece_key','lot_id','billon_id','grume_id','piece_id','arbre_id','recoupe_id','client_id','sous_lot_id',
  'chantier_xylolink','chantier','commune','dept','operateur','essence','qualite','sous_lot','client','grille','reduction','commentaire','date','saisi_le','saisi_heure','origine','ref','note','statut','cle','role','data'];
function texte_(sh, row, nb, headers) {
  headers.forEach((h, i) => { if (COLONNES_TEXTE.indexOf(String(h)) >= 0) sh.getRange(row, i + 1, nb, 1).setNumberFormat('@'); });
}
function replaceRows_(ss, tables, keyCol, keyVal, rowsByTable) {
  // Remplace les lignes d'une clé : lecture en bloc, puis une seule réécriture à partir de la première ligne concernée.
  tables.forEach(name => {
    const rows = (rowsByTable || {})[name] || [];
    let sh = ss.getSheetByName(name);
    if (!sh) { if (!rows.length) return; sh = ss.insertSheet(name); }
    delete ROWS_CACHE_[name];
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    const data = (lastRow > 0 && lastCol > 0) ? sh.getRange(1,1,lastRow,lastCol).getValues() : [];
    let headers = data.length ? data[0].map(String) : [];
    while (headers.length && !headers[headers.length-1]) headers.pop();
    if (!headers.length) headers = rows.length ? Object.keys(rows[0]) : [keyCol];
    const nh0 = data.length ? headers.length : 0;
    rows.forEach(r => Object.keys(r).forEach(k => { if (headers.indexOf(k) < 0) headers.push(k); }));
    const col = headers.indexOf(keyCol);
    const body = data.slice(1);
    let first = -1; const kept = [];
    body.forEach((r, i) => { if (col >= 0 && col < r.length && String(r[col]) === String(keyVal)) { if (first < 0) first = i; } else kept.push(r); });
    if (first < 0 && !rows.length) return;
    if (headers.length !== nh0) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); }
    const vals = rows.map(r => headers.map(h => r[h] === undefined || r[h] === null ? '' : r[h]));
    if (first < 0) { if (vals.length) { texte_(sh, body.length + 2, vals.length, headers); sh.getRange(body.length + 2, 1, vals.length, headers.length).setValues(vals); } return; }
    const tail = kept.slice(first).map(r => headers.map((h, i) => i < r.length && r[i] !== undefined ? r[i] : '')).concat(vals);
    sh.getRange(first + 2, 1, body.length - first, Math.max(lastCol, headers.length)).clearContent();
    if (tail.length) { texte_(sh, first + 2, tail.length, headers); sh.getRange(first + 2, 1, tail.length, headers.length).setValues(tail); }
  });
}

/* ---------- lots clients ---------- */
function clientConflicts_(ss, clientId, keys) {
  // billons déjà dans un autre lot client (proposé ou validé), ou recoupés
  const statut = {}; sheetRows_(ss, 'LOT_CLIENT').forEach(r => statut[String(r.client_id)] = String(r.statut || ''));
  const other = {}; sheetRows_(ss, 'LOT_CLIENT_LIGNE').forEach(r => { const cid = String(r.client_id); if (cid === String(clientId)) return; const st = statut[cid]; if (st !== 'valide' && st !== 'propose') return; other[String(r.billon_key)] = { client_id: cid, client: String(r.client || ''), statut: st, num: String(r.num || '') }; });
  const cut = {}; sheetRows_(ss, 'RECOUPE').forEach(r => cut[String(r.parent_key)] = String(r.parent_num || ''));
  const out = [];
  keys.forEach(k => { if (other[k]) out.push({ key:k, num: other[k].num, type:'vendu', client: other[k].client, statut: other[k].statut }); else if (cut[k]) out.push({ key:k, num: cut[k], type:'recoupe' }); });
  return out;
}
function saveClient_(ss, role, body) {
  const c = body.client || {}; const lignes = body.lignes || [];
  let statut = String(c.statut || 'brouillon');
  if (role === 'terrain' && statut === 'valide') statut = 'propose';
  const conflicts = clientConflicts_(ss, c.client_id, lignes.map(l => String(l.billon_key)));
  const hard = conflicts.filter(x => x.type === 'recoupe' || x.statut === 'valide');
  if (hard.length && statut !== 'brouillon') return ({ ok:false, error:'billons indisponibles : ' + hard.map(x => x.num + (x.client ? ' (vendu · ' + x.client + ')' : ' (recoupé)')).join(', '), conflicts: conflicts });
  if (statut === 'valide' && conflicts.length) return ({ ok:false, error:'billons déjà proposés ailleurs : ' + conflicts.map(x => x.num + ' (' + x.client + ')').join(', '), conflicts: conflicts });
  const row = Object.assign({}, c, { statut: statut, updated_at: new Date().toISOString(), validated_at: statut === 'valide' ? (c.validated_at || new Date().toISOString()) : (c.validated_at || '') });
  replaceRows_(ss, TABLES_CLIENT, 'client_id', c.client_id, { LOT_CLIENT: [row], LOT_CLIENT_LIGNE: lignes.map(l => Object.assign({ client_id: c.client_id, client: c.client }, l)) });
  return ({ ok:true, client_id: c.client_id, statut: statut, conflicts: conflicts });
}
function saveGrille_(ss, grille, code) {
  // Onglet GRILLES (colonnes positionnelles : code, nom, type, essence, qualité, Ø min, Ø max, prix) : remplace les lignes du code
  code = String(code || (grille && grille.id) || '').replace(/^sheet-/, '').trim(); if (!code) return { ok:false, error:'code de grille vide' };
  const sh = ss.getSheetByName('GRILLES') || ss.insertSheet('GRILLES');
  if (sh.getLastRow() < 1) { sh.getRange(1,1,1,8).setValues([['code','nom','type','essence','qualite','diam_min','diam_max','prix_m3']]); sh.setFrozenRows(1); }
  const last = sh.getLastRow(); const data = last > 1 ? sh.getRange(2,1,last-1,8).getValues() : [];
  const kept = data.filter(r => String(r[0]).trim() !== code);
  const add = grille ? (grille.lignes || []).map(l => [code, grille.nom || code, grille.type === 'pied' ? 'pied' : 'grumes', l.ess || '', l.q || '', l.dmin == null ? '' : l.dmin, l.dmax == null ? '' : l.dmax, l.prix == null ? '' : l.prix]) : [];
  if (grille && !add.length) add.push([code, grille.nom || code, grille.type === 'pied' ? 'pied' : 'grumes', '', '', '', '', '']);
  const all = kept.concat(add);
  if (last > 1) sh.getRange(2,1,last-1,Math.max(8, sh.getLastColumn())).clearContent();
  if (all.length) sh.getRange(2,1,all.length,8).setValues(all);
  return { ok:true, code: code, lignes: add.length, at: new Date().toISOString() };
}
function setKey_(ss, body) {
  // crée ou modifie une ligne de l'onglet CLES (clé = identifiant)
  const k = body.key_row || {}; const cle = String(k.cle || '').trim(); if (!cle) return { ok:false, error:'clé vide' };
  const sh = ss.getSheetByName('CLES') || ss.insertSheet('CLES'); delete ROWS_CACHE_['CLES'];
  const H = ['cle','operateur','role','actif','cree_le','note'];
  if (sh.getLastRow() < 1) { sh.getRange(1,1,1,H.length).setValues([H]); sh.setFrozenRows(1); }
  const existing = sheetRows_(ss, 'CLES'); delete ROWS_CACHE_['CLES'];
  const idx = existing.findIndex(r => String(r.cle) === cle); const old = idx >= 0 ? existing[idx] : {};
  const row = { cle: cle, operateur: k.operateur !== undefined ? String(k.operateur).trim() : (old.operateur || ''), role: k.role !== undefined ? String(k.role) : (old.role || 'terrain'),
    actif: k.actif !== undefined ? (k.actif ? 'oui' : 'non') : (old.actif || 'oui'), cree_le: old.cree_le || new Date().toISOString(), note: k.note !== undefined ? String(k.note) : (old.note || '') };
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const vals = headers.map(h => row[h] === undefined ? '' : row[h]);
  if (idx >= 0) sh.getRange(idx + 2, 1, 1, headers.length).setValues([vals]); else sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setValues([vals]);
  return { ok:true, key_row: row };
}
function setLotGps_(ss, lotId, gps) {
  // Point GPS placé (ou corrigé) depuis le bureau : colonnes gps_* de l'onglet LOT et copie JSON du lot (LOT_JSON)
  const id = String(lotId || ''); if (!id) return { ok:false, error:'lot_id manquant' };
  const sh = ss.getSheetByName('LOT'); if (!sh || sh.getLastRow() < 2) return { ok:false, error:'onglet LOT vide' };
  const v = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues(); const h = v[0].map(String);
  const col = h.indexOf('lot_id'); const idx = v.findIndex((r, i) => i > 0 && String(r[col]) === id); if (idx < 0) return { ok:false, error:'lot inconnu sur le Sheet' };
  const g = gps && gps.lat != null ? { lat: Number(gps.lat), lon: Number(gps.lon), acc: gps.acc == null ? '' : Number(gps.acc) } : null;
  ['gps_lat','gps_lon','gps_precision_m'].forEach(k => { if (h.indexOf(k) < 0) { h.push(k); sh.getRange(1, h.length).setValue(k); } });
  const set = (k, val) => sh.getRange(idx + 1, h.indexOf(k) + 1).setValue(val);
  set('gps_lat', g ? g.lat : ''); set('gps_lon', g ? g.lon : ''); set('gps_precision_m', g ? g.acc : '');
  delete ROWS_CACHE_['LOT'];
  const parts = sheetRows_(ss, 'LOT_JSON').filter(r => String(r.lot_id) === id).sort((a, b) => Number(a.part) - Number(b.part));
  if (parts.length && parts.length === Number(parts[0].total || parts.length)) {
    try { const j = JSON.parse(parts.map(p => String(p.data || '')).join('')); if (j.lot) { j.lot.gps = g ? { lat: g.lat, lon: g.lon, acc: g.acc === '' ? null : g.acc, at: new Date().toISOString(), manuel: true } : null; j.lot.updated = new Date().toISOString();
      const txt = JSON.stringify(j); const rows = []; for (let i = 0, p = 1; i < txt.length; i += 40000, p++) rows.push({ lot_id: id, part: p, total: Math.ceil(txt.length / 40000), data: txt.slice(i, i + 40000) });
      replaceRows_(ss, ['LOT_JSON'], 'lot_id', id, { LOT_JSON: rows }); } } catch (e) {}
  }
  return { ok:true, lot_id: id, gps: g };
}
function setStatut_(ss, clientId, statut, par) {
  const sh = ss.getSheetByName('LOT_CLIENT'); if (!sh) return ({ ok:false, error:'aucun lot client' }); delete ROWS_CACHE_['LOT_CLIENT'];
  const v = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues(); const h = v[0].map(String);
  const ci = h.indexOf('client_id'), si = h.indexOf('statut'), vi = h.indexOf('validated_at');
  for (let i = 1; i < v.length; i++) if (String(v[i][ci]) === String(clientId)) {
    if (statut === 'valide') { const keys = sheetRows_(ss, 'LOT_CLIENT_LIGNE').filter(r => String(r.client_id) === String(clientId)).map(r => String(r.billon_key));
      const conflicts = clientConflicts_(ss, clientId, keys); if (conflicts.length) return ({ ok:false, error:'conflits : ' + conflicts.map(x => x.num + (x.client ? ' (' + x.client + ')' : ' (recoupé)')).join(', '), conflicts: conflicts }); }
    sh.getRange(i+1, si+1).setValue(statut); if (vi >= 0 && statut === 'valide') sh.getRange(i+1, vi+1).setValue(new Date().toISOString());
    if (par) { let pi = h.indexOf('statut_par'); if (pi < 0) { pi = h.length; sh.getRange(1, pi+1).setValue('statut_par'); } sh.getRange(i+1, pi+1).setValue(par); }
    return ({ ok:true, client_id: clientId, statut: statut });
  }
  return ({ ok:false, error:'lot client introuvable' });
}

/* ---------- lectures ---------- */
function params_(ss, role) {
  const rows = (name, nbCol) => { const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return []; return sh.getRange(2,1,sh.getLastRow()-1,nbCol).getValues(); };
  const codes = name => rows(name,1).map(r => String(r[0]).trim().toUpperCase()).filter(String);
  const res = { ok:true, role: role, essences: codes('ESSENCES'), qualites: codes('QUALITES'), classes: {}, grilles: [], dmm: {}, clientStatuts: {} };
  rows('CLASSES',2).forEach(r => { const k = String(r[0]).trim(), v = Number(r[1]); if (!k || !v) return;
    if (k === 'pas' || k === 'min' || k === 'max') res.classes[k === 'pas' ? 'step' : k] = v; else { res.classes.parEssence = res.classes.parEssence || {}; res.classes.parEssence[k.toUpperCase()] = v; } });
  const map = {};
  rows('GRILLES',8).forEach(r => { const id = String(r[0]).trim(); if (!id) return; const num = x => (x === '' || x === null) ? null : Number(x);
    const g = map[id] || (map[id] = { id: 'sheet-' + id, nom: String(r[1] || id).trim(), type: String(r[2] || 'grumes').trim().toLowerCase().indexOf('pied') >= 0 ? 'pied' : 'grumes', lignes: [] });
    g.lignes.push({ ess: String(r[3] || '').trim().toUpperCase(), q: String(r[4] || '').trim().toUpperCase(), dmin: num(r[5]), dmax: num(r[6]), prix: num(r[7]) }); });
  res.grilles = Object.keys(map).map(k => map[k]);
  rows('DMM',21).forEach(r => { const d = Number(r[0]); if (d >= 6 && d <= 100) res.dmm[d] = r.slice(1,21).map(Number); });
  sheetRows_(ss, 'LOT_CLIENT').forEach(r => res.clientStatuts[String(r.client_id)] = String(r.statut || ''));
  res.essencesVocal = motsVocaux_(ss, 'ESSENCES');
  res.qualitesVocal = motsVocaux_(ss, 'QUALITES');
  return res;
}
function motsVocaux_(ss, name) {
  // Mode vocal : onglet ESSENCES ou QUALITES, colonne dont l'en-tête contient « vocal » (ex. mots_vocaux) : « chêne, chêne rouge » → code de la colonne A
  const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 2) return {};
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const col = v[0].findIndex(h => /vocal/i.test(String(h))); if (col < 1) return {};
  const out = {};
  v.slice(1).forEach(r => { const code = String(r[0]).trim().toUpperCase(); const w = String(r[col] || '').trim(); if (code && w) out[code] = w; });
  return out;
}
function restore_(ss, operateur) {
  // Lots complets (onglet LOT_JSON) et lots clients (colonne json de LOT_CLIENT), pour un opérateur ou tous
  const op = String(operateur || '').trim().toLowerCase();
  const info = {}; sheetRows_(ss, 'LOT').forEach(r => info[String(r.lot_id)] = r);
  const parts = {}; sheetRows_(ss, 'LOT_JSON').forEach(r => { const id = String(r.lot_id); (parts[id] = parts[id] || []).push(r); });
  const lots = [];
  Object.keys(parts).forEach(id => { const i = info[id] || {}; if (op && String(i.operateur || '').trim().toLowerCase() !== op) return;
    const ps = parts[id].sort((a, b) => Number(a.part) - Number(b.part)); if (ps.length !== Number(ps[0].total || ps.length)) return;
    lots.push({ lot_id: id, operateur: i.operateur || '', chantier: i.chantier || '', date: i.date || '', type: i.type || '', updated: i.updated || '', json: ps.map(p => String(p.data || '')).join('') }); });
  const clients = sheetRows_(ss, 'LOT_CLIENT').filter(r => r.json && (!op || String(r.operateur || '').trim().toLowerCase() === op))
    .map(r => ({ client_id: String(r.client_id), operateur: r.operateur || '', client: r.client || '', statut: r.statut || '', updated_at: r.updated_at || '', json: String(r.json) }));
  return { ok:true, lots: lots, clients: clients };
}
function stock_(ss) {
  const pick = (r, cols) => { const o = {}; cols.forEach(c => o[c] = r[c] === undefined ? '' : r[c]); return o; };
  return { ok:true, at: new Date().toISOString(),
    billons: sheetRows_(ss, 'BILLON').map(r => pick(r, ['lot_id','billon_id','chantier_xylolink','chantier','date','commune','dept','operateur','num','essence','qualite','longueur_m','diametre_cm','reduction_l_cm','reduction_d_cm','volume_m3','sous_lot','client','grille','prix_m3','montant'])),
    recoupes: sheetRows_(ss, 'RECOUPE'),
    clients: sheetRows_(ss, 'LOT_CLIENT'),
    lignes: sheetRows_(ss, 'LOT_CLIENT_LIGNE') };
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
