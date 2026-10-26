/**
 * Cubage SBF : script de synchronisation (Google Apps Script) — version 2.1 (données économiques dans l'espace Bureau).
 * À coller dans Extensions > Apps Script du Google Sheet « Cubage SBF - Référentiel et lots »,
 * puis Déployer > Gérer les déploiements > modifier > Version : Nouvelle version > Déployer
 * (l'adresse /exec reste la même).
 *
 * Deux clés : CLE (téléphones de terrain) et CLE_BUREAU (postes du bureau, valide les ventes).
 */
const CLE = 'A_REMPLACER';
const CLE_BUREAU = 'A_REMPLACER_BUREAU';

// Onglets de sauvegarde des lots (remplacés lot par lot à chaque envoi)
const TABLES = ['LOT','SOUS_LOT','GRUME','BILLON','ARBRE','TRONCON','RECOUPE'];
// Onglets des lots clients (remplacés lot client par lot client)
const TABLES_CLIENT = ['LOT_CLIENT','LOT_CLIENT_LIGNE'];

function role_(key) { return key === CLE_BUREAU ? 'bureau' : key === CLE ? 'terrain' : null; }

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const role = role_(body.key);
    if (!role) return out_({ ok:false, error:'clé refusée' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      if (body.action === 'saveLot') { replaceRows_(ss, TABLES, 'lot_id', body.lot_id, body.rows); return out_({ ok:true, lot_id: body.lot_id, at: new Date().toISOString() }); }
      if (body.action === 'saveClient') return saveClient_(ss, role, body);
      if (body.action === 'setClientStatut') {
        if (role !== 'bureau') return out_({ ok:false, error:'réservé au bureau' });
        return setStatut_(ss, body.client_id, body.statut);
      }
      return out_({ ok:false, error:'action inconnue' });
    } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok:false, error: String(err) }); }
}

function doGet(e) {
  const p = e.parameter || {};
  const role = role_(p.key);
  if (!role) return out_({ ok:false, error:'clé refusée' });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (p.action === 'params') return out_(params_(ss, role));
  if (p.action === 'stock') { if (role !== 'bureau') return out_({ ok:false, error:'réservé au bureau' }); return out_(stock_(ss)); }
  return out_({ ok:true, info:'Cubage SBF : script actif', role: role });
}

/* ---------- utilitaires onglets ---------- */
function sheetRows_(ss, name) { const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];
  const v = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues(); const h = v[0].map(String);
  return v.slice(1).map(r => { const o = {}; h.forEach((k,i) => { if (k) o[k] = r[i]; }); return o; }); }
function replaceRows_(ss, tables, keyCol, keyVal, rowsByTable) {
  tables.forEach(name => {
    const rows = (rowsByTable || {})[name] || [];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    let headers = sh.getLastColumn() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String).filter(String) : [];
    if (!headers.length) { headers = rows.length ? Object.keys(rows[0]) : [keyCol]; sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); }
    rows.forEach(r => Object.keys(r).forEach(k => { if (headers.indexOf(k) < 0) { headers.push(k); sh.getRange(1,headers.length).setValue(k); } }));
    const last = sh.getLastRow();
    if (last > 1) { const col = headers.indexOf(keyCol) + 1; if (col > 0) { const ids = sh.getRange(2, col, last-1, 1).getValues();
      for (let i = ids.length-1; i >= 0; i--) if (String(ids[i][0]) === String(keyVal)) sh.deleteRow(i+2); } }
    if (rows.length) { const vals = rows.map(r => headers.map(h => r[h] === undefined || r[h] === null ? '' : r[h])); sh.getRange(sh.getLastRow()+1, 1, vals.length, headers.length).setValues(vals); }
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
  if (hard.length && statut !== 'brouillon') return out_({ ok:false, error:'billons indisponibles : ' + hard.map(x => x.num + (x.client ? ' (vendu · ' + x.client + ')' : ' (recoupé)')).join(', '), conflicts: conflicts });
  if (statut === 'valide' && conflicts.length) return out_({ ok:false, error:'billons déjà proposés ailleurs : ' + conflicts.map(x => x.num + ' (' + x.client + ')').join(', '), conflicts: conflicts });
  const row = Object.assign({}, c, { statut: statut, updated_at: new Date().toISOString(), validated_at: statut === 'valide' ? (c.validated_at || new Date().toISOString()) : (c.validated_at || '') });
  replaceRows_(ss, TABLES_CLIENT, 'client_id', c.client_id, { LOT_CLIENT: [row], LOT_CLIENT_LIGNE: lignes.map(l => Object.assign({ client_id: c.client_id, client: c.client }, l)) });
  return out_({ ok:true, client_id: c.client_id, statut: statut, conflicts: conflicts });
}
function setStatut_(ss, clientId, statut) {
  const sh = ss.getSheetByName('LOT_CLIENT'); if (!sh) return out_({ ok:false, error:'aucun lot client' });
  const v = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues(); const h = v[0].map(String);
  const ci = h.indexOf('client_id'), si = h.indexOf('statut'), vi = h.indexOf('validated_at');
  for (let i = 1; i < v.length; i++) if (String(v[i][ci]) === String(clientId)) {
    if (statut === 'valide') { const keys = sheetRows_(ss, 'LOT_CLIENT_LIGNE').filter(r => String(r.client_id) === String(clientId)).map(r => String(r.billon_key));
      const conflicts = clientConflicts_(ss, clientId, keys); if (conflicts.length) return out_({ ok:false, error:'conflits : ' + conflicts.map(x => x.num + (x.client ? ' (' + x.client + ')' : ' (recoupé)')).join(', '), conflicts: conflicts }); }
    sh.getRange(i+1, si+1).setValue(statut); if (vi >= 0 && statut === 'valide') sh.getRange(i+1, vi+1).setValue(new Date().toISOString());
    return out_({ ok:true, client_id: clientId, statut: statut });
  }
  return out_({ ok:false, error:'lot client introuvable' });
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
  return res;
}
function stock_(ss) {
  const pick = (r, cols) => { const o = {}; cols.forEach(c => o[c] = r[c] === undefined ? '' : r[c]); return o; };
  return { ok:true, at: new Date().toISOString(),
    billons: sheetRows_(ss, 'BILLON').map(r => pick(r, ['lot_id','billon_id','chantier_xylolink','chantier','date','commune','dept','operateur','num','essence','qualite','longueur_m','diametre_cm','reduction_l_cm','reduction_d_cm','volume_m3','sous_lot','client','grille','prix_m3','montant'])),
    recoupes: sheetRows_(ss, 'RECOUPE'),
    clients: sheetRows_(ss, 'LOT_CLIENT'),
    lignes: sheetRows_(ss, 'LOT_CLIENT_LIGNE').map(r => pick(r, ['client_id','billon_key','prix_m3','montant'])) };
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
