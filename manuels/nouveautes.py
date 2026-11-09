# Note de version : ce qui change entre la version du dernier guide et la version actuelle.
# Usage : python3 nouveautes.py && python3 build.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
D = os.path.dirname(os.path.abspath(__file__))
from gen import fig, B
AVANT, APRES, DATE = '81', '117', '9 novembre 2026'
body = f'''
<div class="head"><img src="logo.png"><div><div class="t">Cubage SBF · Ce qui change pour les techniciens</div>
<div class="s">Version {AVANT} (guide du 1er novembre) → version {APRES} · {DATE}</div></div></div>

<h2 class="top">À retenir</h2>
<table class="key"><tr><td class="k">1</td><td><b>Lots de cubage : on saisit le propriétaire, plus le chantier</b> (v117). Le champ Chantier a disparu ; le propriétaire sert de nom au lot. La liste des lots affiche le propriétaire et les essences, et la recherche les trouve.</td></tr>
<tr><td class="k">2</td><td><b>Saisie : le n° de grume est dans le bandeau vert</b> et les billons déjà saisis se replient en une ligne (v116). Pour corriger l'un d'eux, touchez <b>✎</b>.</td></tr>
<tr><td class="k">3</td><td><b>Commentaire à la voix : dites « gelé » pour gélivure</b> (« roulé » pour roulure, « échauffé » pour échauffure). Les anciens mots ne sont jamais reconnus. Vérifiez une fois votre téléphone : Paramètres › Mode vocal › <b>Vérifier que les mots vocaux sont connus du moteur</b>.</td></tr>
<tr><td class="k">4</td><td><b>Nouveaux outils</b> : reste à cuber (grume cubée en plusieurs fois), recoupe d'un billon depuis le listing (✂), liste commune de clients (<b>Liste ▾</b>), correction d'un effectif sur pied.</td></tr></table>
<p class="small">La mise à jour est automatique : ouvrez l'application avec du réseau, le bas de l'accueil doit afficher <b>Version {APRES}</b>. Rien à réinstaller, vos lots sont conservés. Le guide du technicien terrain version {APRES} décrit tout en détail (numéros de section entre parenthèses).</p>

<h1>1. Versions 116 et 117 : lots et saisie</h1>
{fig(['t19_liste_lots','t07_saisie_grume'], [
 ('a', '<b>Liste des lots</b> (v117) : n° Xylolink et <b>propriétaire</b>, essences présentes en couleur ; recherche par propriétaire ou essence (« HET »). Création d\'un lot : le champ <b>Propriétaire *</b> remplace « Chantier » (3.1, 3.2).'),
 ('b', '<b>Saisie</b> (v116) : « Grume n° 707 » dans le bandeau avec le volume du lot et le n° Xylolink ; les billons précédents sont repliés (qualité, dimensions, volume) et ne se modifient plus par erreur : <b>✎</b> les rouvre, ✕ les supprime (3.4).')], w=52, maxparts=1)}
<table><tr><th style="width:22%"></th><th style="width:39%">Avant</th><th>Maintenant</th></tr>
<tr><td><b>Fiche du lot</b></td><td>Chantier + Propriétaire (pour le bordereau)</td><td><b>Propriétaire</b> seul ; il sert de nom au lot partout (liste, bordereaux, Sheet)</td></tr>
<tr><td><b>Liste des lots</b></td><td>N° Xylolink · chantier</td><td>N° Xylolink · <b>propriétaire</b>, plus les <b>essences</b></td></tr>
<tr><td><b>Bandeau de saisie</b></td><td>« Saisie grumes »</td><td>« <b>Grume n° …</b> » + volume du lot + n° Xylolink</td></tr>
<tr><td><b>Billons précédents</b></td><td>Tous ouverts, modifiables directement</td><td>Repliés en une ligne ; <b>✎</b> pour modifier</td></tr></table>
<div class="tip"><b>Anciens lots sans propriétaire</b> : le champ Propriétaire de la fiche affiche le nom du chantier. Remplacez-le par le nom du propriétaire (il figurera sur le bordereau propriétaire).</div>

<h1>2. Cubage : nouveaux outils</h1>
<h3>Grume cubée en plusieurs fois : le reste à cuber (3.4)</h3>
<ul><li>Dans la saisie, {B('Grume cubée en plusieurs fois ? Longueur totale…')} : indiquez la longueur totale ; les billons saisis en sont déduits.</li>
<li>Le reste est signalé en tête du lot et dans le listing (« reste 4,00 m › ») ; un appui rouvre la grume avec un billon déjà rempli à la bonne longueur.</li>
<li>Reste jamais cubé : {B('Abandonner le reste (chute)')}. À la voix : « note longueur totale dix-huit », « note chute deux ».</li></ul>
<h3>Listing : recherche, filtres et recoupe (3.8)</h3>
{fig(['t47_recoupe'], [
 ('✂', 'Dans le listing, <b>✂</b> recoupe un billon : tronçon 1 avec le n° d\'origine, tronçons suivants avec le n° de la <b>nouvelle plaquette</b>, diamètre remesuré. Le billon d\'origine reste tracé (« 1013 (de 120.1) ») et la recoupe peut être annulée. Recoupe partielle : le reste est suivi ou passé en chute.'),
 ('🔎', 'Le listing a une barre de <b>recherche</b> (n° de grume, billon, plaquette, tronçon) et des filtres par <b>essence</b> et par <b>qualité</b>.')], w=52, maxparts=1)}
<h3>Petits changements</h3>
<ul><li>Un billon ajouté puis laissé vide n'empêche plus d'enregistrer la grume.</li>
<li>Bouton {B('+ N°')} sur un billon : nouveau n° de plaquette pour un billon recoupé, avec traçabilité (« ex 701.3 »).</li>
<li>Lot d'essai : {B('Passer en lot réel')} dans la fiche (n° Xylolink obligatoire).</li></ul>

<h1>3. Ventes : clients et prix (3.6, chapitre 4)</h1>
<ul><li><b>Liste commune de clients</b> tenue par le bureau : bouton {B('Liste ▾')} dans les sous-lots et les lots clients, un appui remplit le nom. Un client absent peut toujours être tapé : il est proposé au bureau.</li>
<li>Lot client : chaque billon affiche son prix au m³, son prix total et son origine ; le récapitulatif a une partie <b>par grume</b> avec sous-totaux et filtres (sur téléphone, faites glisser le tableau pour voir les prix).</li>
<li>Le bureau valide maintenant les ventes avec le <b>n° de facture Xylolink</b> : rien à faire de votre côté.</li></ul>

<h1>4. Estimation sur pied (5.2)</h1>
{fig(['t37_corriger_effectif'], [
 ('±', f'{B("Corriger un effectif")} : choisissez la classe, tapez le nouveau total (ici 12 au lieu de 14), {B("Appliquer")}. Plus besoin d\'annuler les tiges une à une.')], w=48, maxparts=1)}
<ul><li>Mode par classes avec effectifs : le champ « Nombre de tiges » est sous la grille, l'écran revient à la grille après chaque ajout ; en modification d'un pointage groupé, le nombre reste modifiable.</li>
<li>{B('+ Qualité')} fait défiler jusqu'au nouveau tronçon.</li></ul>

<h1>5. Mode vocal (3.5)</h1>
<table><tr><th style="width:42%">Vous dites</th><th>Résultat</th></tr>
<tr><td>« note commentaire gelé »</td><td>Commentaire « gélivure »</td></tr>
<tr><td>« note commentaire roulé » · « échauffé » · « pourri » · « fendu » · « noueux »</td><td>roulure · échauffure · pourriture · fente · nœuds</td></tr>
<tr><td>« note commentaire fente » · « fourche » · « aubier » · « creux » · « mitraille »…</td><td>Le mot tel quel (liste complète dans Paramètres)</td></tr>
<tr><td>« note longueur totale dix-huit » (ou « note origine dix-huit »)</td><td>Grume cubée en plusieurs fois : 18 m, reste suivi</td></tr>
<tr><td>« note chute deux »</td><td>2 m de la grume abandonnés en chute</td></tr></table>
<p class="small">Le champ des mots de commentaire accepte la forme « mot dit = texte enregistré » (ex. « gelé = gélivure »). L'aide affichée en haut du bloc vocal cite encore « note commentaire gélivure » : fiez-vous à cette note.</p>

<h1>6. Divers</h1>
<ul><li><b>Téléphone neuf ou réinstallé</b> : s'il n'a aucun lot, l'application propose d'elle-même de récupérer vos lots sauvegardés sur le Sheet.</li>
<li>L'accueil signale quand le bureau a modifié le référentiel (essences, qualités, clients, grilles) : faites {B('⟳ Mettre à jour depuis le Sheet')}.</li></ul>

<h1>7. Points d'attention</h1>
<div class="warn"><b>Ancienne liste de commentaires</b> : un téléphone mis en service avant la version 82 a pu garder l'ancienne liste (« gélivure, pourriture, roulure… »), où gélivure, roulure et échauffure ne sont jamais reconnus. Paramètres › Mode vocal › <b>Vérifier</b> ; si ces mots sont signalés, remplacez-les par « gelé = gélivure, roulé = roulure, échauffé = échauffure ».</div>
<div class="warn"><b>Toujours d'actualité</b> : en dictée <b>pied à pied numéroté</b>, quand on change d'essence à la voix, l'arbre garde le tarif Chaudé de l'essence précédente. Vérifiez le tarif affiché et dites « note tarif … » si besoin.</div>

<h1>8. Détail des versions</h1>
<table class="ver"><tr><th style="width:11%">Version</th><th>Changement (terrain)</th></tr>
<tr><td>82</td><td>Mots de commentaire « mot dit = texte » ; vérificateur des mots vocaux dans Paramètres.</td></tr>
<tr><td>85</td><td>Signal sur « Mettre à jour depuis le Sheet » quand le référentiel a changé.</td></tr>
<tr><td>86</td><td>Un billon ajouté mais vide n'empêche plus de valider la grume.</td></tr>
<tr><td>87-90</td><td>Longueur d'origine de la grume et reste à cuber (fiche, listing, vocal) ; « reste x m › » ; abandon en chute ; n° de plaquette tracé.</td></tr>
<tr><td>91-95</td><td>Recoupe d'un billon depuis le listing (✂), recoupe partielle, tronçons modifiables, recoupe annulable.</td></tr>
<tr><td>96</td><td>Passer un lot d'essai en lot réel.</td></tr>
<tr><td>97-100</td><td>Listing : recherche, barre fixe, filtres essence et qualité.</td></tr>
<tr><td>101-102</td><td>Sur pied : effectif sous la grille ; « + Qualité » défile jusqu'au tronçon.</td></tr>
<tr><td>103-104</td><td>Lot client : récapitulatif par grume avec prix, fiche en haut de page.</td></tr>
<tr><td>105-111</td><td>Liste commune de clients, bouton « Liste ▾ », clients proposés au bureau.</td></tr>
<tr><td>112-113</td><td>Sur pied : « Corriger un effectif » ; nombre de tiges toujours affiché en modification.</td></tr>
<tr><td>115</td><td>Récupération des lots proposée sur un téléphone sans lot.</td></tr>
<tr><td><b>116</b></td><td><b>Saisie : n° de grume dans le bandeau ; billons précédents repliés (✎ pour modifier).</b></td></tr>
<tr><td><b>117</b></td><td><b>Propriétaire à la place du chantier ; liste des lots avec propriétaire et essences.</b></td></tr></table>
<p class="small">Versions 83-84, 110 et 114 : améliorations de l'espace Bureau (filtres du stock, référentiel commun), sans effet sur le travail au téléphone.</p>
'''
html = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Cubage SBF — Ce qui change pour les techniciens (v{AVANT} → v{APRES})</title>
<link rel="stylesheet" href="style.css"><style>
.head {{ display:flex; align-items:center; gap:14px; border-bottom:2.5px solid #cd8a63; padding-bottom:8px; margin-bottom:8px; }}
.head img {{ width:58mm; }} .head .t {{ font-size:19pt; font-weight:bold; color:#37485a; }} .head .s {{ color:#cd8a63; font-size:11pt; }}
h2.top {{ margin-top:10px; }}
h1 {{ page-break-before: avoid !important; font-size:15pt; margin:18px 0 8px; }}
table {{ page-break-inside: auto !important; }} tr {{ page-break-inside: avoid; }}
table.key td {{ border-bottom:1px solid #e3e6e9; font-size:10.5pt; padding:6px; }}
table.key td.k {{ width:26px; }} table.key td.k {{ font-weight:bold; color:#fff; background:#d9480f; text-align:center; border-radius:4px; }}
</style></head><body>{body}</body></html>'''
open(os.path.join(D, 'nouveautes.html'), 'w').write(html)
print('nouveautes.html')
