/**
 * Cubage SBF : script de synchronisation (Google Apps Script).
 * À coller dans Extensions > Apps Script du Google Sheet « Cubage SBF - Référentiel et lots »,
 * puis Déployer > Nouveau déploiement > Application Web (Exécuter en tant que : moi ; Qui a accès : tout le monde).
 *
 * La clé ci-dessous protège l'accès : sans elle, l'adresse du script ne renvoie rien.
 * Elle doit être identique à celle du lien de configuration des téléphones.
 */
const CLE = 'A_REMPLACER'; // la vraie clé n'est jamais publiée sur GitHub

// Onglets de sauvegarde des lots (créés automatiquement)
const TABLES = ['LOT','SOUS_LOT','GRUME','BILLON','ARBRE','TRONCON'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== CLE) return out_({ ok:false, error:'clé refusée' });
    if (body.action !== 'saveLot') return out_({ ok:false, error:'action inconnue' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      TABLES.forEach(name => {
        const rows = body.rows[name] || [];
        const sh = ss.getSheetByName(name) || ss.insertSheet(name);
        let headers = sh.getLastColumn() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].filter(String) : [];
        if (!headers.length) { headers = rows.length ? Object.keys(rows[0]) : ['lot_id']; sh.getRange(1,1,1,headers.length).setValues([headers]); }
        rows.forEach(r => Object.keys(r).forEach(k => { if (headers.indexOf(k) < 0) { headers.push(k); sh.getRange(1,headers.length).setValue(k); } }));
        const last = sh.getLastRow();
        if (last > 1) {
          const col = headers.indexOf('lot_id') + 1;
          const ids = sh.getRange(2, col, last-1, 1).getValues();
          for (let i = ids.length-1; i >= 0; i--) if (ids[i][0] === body.lot_id) sh.deleteRow(i+2);
        }
        if (rows.length) {
          const vals = rows.map(r => headers.map(h => r[h] === undefined ? '' : r[h]));
          sh.getRange(sh.getLastRow()+1, 1, vals.length, headers.length).setValues(vals);
        }
      });
    } finally { lock.releaseLock(); }
    return out_({ ok:true, lot_id: body.lot_id, at: new Date().toISOString() });
  } catch (err) { return out_({ ok:false, error: String(err) }); }
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.key !== CLE) return out_({ ok:false, error:'clé refusée' });
  if (p.action !== 'params') return out_({ ok:true, info:'Cubage SBF : script actif' });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Lignes d'un onglet sans la ligne d'en-tête
  const rows = (name, nbCol) => { const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return []; return sh.getRange(2,1,sh.getLastRow()-1,nbCol).getValues(); };
  const codes = name => rows(name,1).map(r => String(r[0]).trim().toUpperCase()).filter(String);
  const res = { ok:true, essences: codes('ESSENCES'), qualites: codes('QUALITES'), classes: {}, grilles: [], dmm: {} };
  rows('CLASSES',2).forEach(r => { const k = String(r[0]).trim(), v = Number(r[1]); if (!k || !v) return;
    if (k === 'pas' || k === 'min' || k === 'max') res.classes[k === 'pas' ? 'step' : k] = v;
    else { res.classes.parEssence = res.classes.parEssence || {}; res.classes.parEssence[k.toUpperCase()] = v; } });
  const map = {};
  rows('GRILLES',8).forEach(r => { const id = String(r[0]).trim(); if (!id) return;
    const num = x => (x === '' || x === null) ? null : Number(x);
    const g = map[id] || (map[id] = { id: 'sheet-' + id, nom: String(r[1] || id).trim(), type: String(r[2] || 'grumes').trim().toLowerCase().indexOf('pied') >= 0 ? 'pied' : 'grumes', lignes: [] });
    g.lignes.push({ ess: String(r[3] || '').trim().toUpperCase(), q: String(r[4] || '').trim().toUpperCase(), dmin: num(r[5]), dmax: num(r[6]), prix: num(r[7]) }); });
  res.grilles = Object.keys(map).map(k => map[k]);
  rows('DMM',21).forEach(r => { const d = Number(r[0]); if (d >= 6 && d <= 100) res.dmm[d] = r.slice(1,21).map(Number); });
  return out_(res);
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
