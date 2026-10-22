/**
 * Cubage SBF — script Google Apps Script de synchronisation.
 * À coller dans Extensions > Apps Script du Google Sheet cible, puis Déployer > Application web
 * (Exécuter en tant que : moi ; Accès : tout le monde). Copier l'URL /exec dans l'application.
 *
 * Onglets créés automatiquement : LOT, SOUS_LOT, GRUME, BILLON, ARBRE, TRONCON
 * Onglets de référentiel (à remplir au bureau) : ESSENCES (col A), QUALITES (col A),
 *   CLASSES (A: clé, B: valeur — step / min / max / <ESSENCE> pour un pas par essence),
 *   GRILLES (A: grille_id, B: nom, C: type grumes|pied, D: essence, E: qualite, F: dmin, G: dmax, H: prix),
 *   DMM (A: diametre, B..U: tarifs 1 à 20) — optionnel, remplace la table embarquée.
 */
const TABLES = ['LOT','SOUS_LOT','GRUME','BILLON','ARBRE','TRONCON'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'saveLot') return out_({ ok:false, error:'action inconnue' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      TABLES.forEach(name => {
        const rows = body.rows[name] || [];
        const sh = ss.getSheetByName(name) || ss.insertSheet(name);
        let headers = sh.getLastColumn() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].filter(String) : [];
        if (!headers.length) { headers = rows.length ? Object.keys(rows[0]) : ['lot_id']; sh.getRange(1,1,1,headers.length).setValues([headers]); }
        // ajoute les colonnes manquantes
        rows.forEach(r => Object.keys(r).forEach(k => { if (headers.indexOf(k) < 0) { headers.push(k); sh.getRange(1,headers.length).setValue(k); } }));
        // supprime les anciennes lignes du lot
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
  const action = (e.parameter && e.parameter.action) || '';
  if (action !== 'params') return out_({ ok:true, info:'Cubage SBF — script actif' });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const col = (name) => { const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 1) return []; return sh.getRange(1,1,sh.getLastRow(),1).getValues().map(r => String(r[0]).trim()).filter(v => v && v.toLowerCase() !== name.toLowerCase()); };
  const res = { essences: col('ESSENCES'), qualites: col('QUALITES'), classes: {}, grilles: [], dmm: {} };
  const cl = ss.getSheetByName('CLASSES');
  if (cl && cl.getLastRow() > 0) cl.getRange(1,1,cl.getLastRow(),2).getValues().forEach(r => { const k = String(r[0]).trim(), v = Number(r[1]); if (!k || !v) return;
    if (k === 'step' || k === 'min' || k === 'max') res.classes[k] = v; else { res.classes.parEssence = res.classes.parEssence || {}; res.classes.parEssence[k] = v; } });
  const gr = ss.getSheetByName('GRILLES');
  if (gr && gr.getLastRow() > 1) { const map = {}; gr.getRange(2,1,gr.getLastRow()-1,8).getValues().forEach(r => { const id = String(r[0]).trim(); if (!id) return;
    const g = map[id] || (map[id] = { id: id, nom: String(r[1]||id), type: String(r[2]||'grumes').trim(), lignes: [] });
    g.lignes.push({ ess: String(r[3]||'').trim(), q: String(r[4]||'').trim(), dmin: r[5] === '' ? null : Number(r[5]), dmax: r[6] === '' ? null : Number(r[6]), prix: r[7] === '' ? null : Number(r[7]) }); });
    res.grilles = Object.keys(map).map(k => map[k]); }
  const dm = ss.getSheetByName('DMM');
  if (dm && dm.getLastRow() > 1) dm.getRange(2,1,dm.getLastRow()-1,21).getValues().forEach(r => { const d = Number(r[0]); if (d >= 6 && d <= 100) res.dmm[d] = r.slice(1,21).map(Number); });
  return out_(res);
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
