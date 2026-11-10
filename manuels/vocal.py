# Mode d'emploi des commandes vocales (cubage bord de route, estimation sur pied).
# Usage : python3 vocal.py && python3 build.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
D = os.path.dirname(os.path.abspath(__file__))
from gen import fig, B
VERSION, DATE = '118', '10 novembre 2026'

def tab(rows, h1='Vous dites', h2="L'application fait", w='46%'):
    out = f'<table class="vc"><tr><th style="width:{w}">{h1}</th><th>{h2}</th></tr>'
    for r in rows:
        if isinstance(r, str): out += f'<tr><td colspan="2" class="grp">{r}</td></tr>'
        else: out += f'<tr><td class="say">{r[0]}</td><td>{r[1]}</td></tr>'
    return out + '</table>'

COMM = [('gelé, gel', 'gélivure'), ('pourri', 'pourriture'), ('roulé', 'roulure'), ('fendu', 'fente'),
        ('noueux', 'nœuds'), ('échauffé', 'échauffure'), ('mort', 'bois mort'), ('sec', 'bois sec'),
        ('piqué', 'piqûres'), ('gourmand', 'gourmands'), ('insecte', 'insectes'), ('double', 'double cœur'),
        ('résine', 'poche de résine')]
TELS = ('pourriture, pourriture de cœur, fente, nœuds, courbure, fourche, aubier, creux, mitraille, éclaté, cassé, tordu, '
        'cannelure, gouttière, chancre, trou, blessure, cicatrice, fissure, tache, champignon, bois de réserve, brûlé, sain')

body = f'''
<div class="head"><img src="logo.png"><div><div class="t">Cubage SBF · Mode d'emploi des commandes vocales</div>
<div class="s">Cubage bord de route · Estimation sur pied · Application version {VERSION} · {DATE}</div></div></div>
<p>Le mode vocal permet de cuber et d'inventorier <b>sans toucher l'écran</b> : on dicte, le téléphone remplit, on vérifie d'un coup d'œil, on enregistre à la voix.
Il fonctionne <b>sans réseau</b> et aucun son ne quitte le téléphone. Une <b>carte aide-mémoire</b> à imprimer se trouve en dernière page.</p>

<h1>1. Avant de commencer</h1>
<ul>
<li><b>Première activation</b> : avec du réseau, le téléphone télécharge le modèle de reconnaissance (42 Mo, une seule fois). Faites-le au bureau ou à la maison.</li>
<li><b>Micro</b> : acceptez l'accès au micro la première fois. Gardez l'<b>écran allumé</b> : téléphone verrouillé, le micro se coupe.</li>
<li><b>Bruit et vent</b> : une oreillette ou un micro Bluetooth change tout. Parlez à 20-30 cm du téléphone, d'une voix normale, sans couper les mots.</li>
<li><b>Vérification une fois pour toutes</b> : Paramètres › Mode vocal › {B('Vérifier que les mots vocaux sont connus du moteur')} (voir 9).</li>
</ul>
{fig(['v01_vocal_ecoute'], [
 (1, f'Sur l\'écran de saisie, {B("🎤 Mode vocal")} lance l\'écoute : point rouge clignotant, essence, qualité et n° de grume en cours.'),
 (2, f'{B("Pause")} (ou « note pause ») suspend l\'écoute pendant une discussion ; {B("Arrêter")} coupe le mode vocal.'),
 (3, 'Aide-mémoire des phrases (attention : il cite encore « commentaire gélivure », dites « commentaire gelé », voir 6).'),
 (4, '« Mots reconnus » : comment dire les essences et qualités <b>de ce lot</b>.')], maxparts=1)}
<table class="vc"><tr><th style="width:30%">Ce que vous entendez</th><th>Signification</th></tr>
<tr><td><b>Bip aigu</b></td><td>Compris (la valeur est à l'écran)</td></tr>
<tr><td><b>Bip grave</b></td><td>Pas compris ou refusé : rien n'a changé, redites la phrase</td></tr>
<tr><td><b>Le téléphone parle</b></td><td>Il relit ce qui vient d'être enregistré (« cé a, huit mètres vingt, quarante-six ») ou annonce l'essence quand elle change</td></tr></table>

<h1>2. Les quatre règles</h1>
<table class="key">
<tr><td class="k">1</td><td><b>Chaque phrase commence par « note ».</b> Tout ce qui ne commence pas par « note » est ignoré : vous pouvez parler avec le bûcheron sans rien enregistrer. Exceptions, dites seules : <b>« suivant », « billon suivant », « grume suivante », « suivante », « arbre suivant », « précédent », « terminé »</b>.</td></tr>
<tr><td class="k">2</td><td><b>En cubage et en pied à pied, la phrase remplit, « suivant » enregistre.</b> Le billon (ou l'arbre) dicté reste « en cours » tant qu'on n'a pas dit « suivant ». En <b>pointage par classes</b>, chaque phrase compte une tige aussitôt.</td></tr>
<tr><td class="k">3</td><td><b>Ordre : essence, qualité, longueur, diamètre</b> (en cubage). Ce qui n'est pas redit est repris du billon précédent : souvent, « note huit vingt par quarante-deux » suffit.</td></tr>
<tr><td class="k">4</td><td><b>Un œil sur l'écran, une oreille sur le bip.</b> En cas de doute, corrigez un seul champ (« note diamètre quarante-huit ») plutôt que de tout redicter.</td></tr></table>

<h1>3. Dire les nombres</h1>
<p>Dites les nombres comme d'habitude. Les <b>longueurs</b> sont en mètres, les <b>diamètres</b> en centimètres. « par » sépare la longueur du diamètre.</p>
{tab([
 ('« dix »', 'Longueur 10 m'),
 ('« huit vingt »', '8,20 m'),
 ('« huit et demi »', '8,50 m'),
 ('« huit virgule vingt-cinq »', '8,25 m'),
 ('« douze cinquante » · « un cinquante »', '12,50 m · 1,50 m'),
 ('« quarante-et-un » · « soixante-et-onze » · « quatre-vingt-dix-neuf » · « cent cinq »', 'Diamètre 41 · 71 · 99 · 105 cm (dites-les normalement)'),
 ('« note huit vingt par quarante-deux »', '8,20 m × Ø 42'),
 ('« note quatre trente-cinq » (sans « par »)', '4 m × Ø 35 : sans « par », le dernier nombre est le diamètre')], 'Vous dites', 'Valeur')}

<h1>4. Dire les essences et les qualités</h1>
<ul>
<li><b>Essences</b> : par leur nom (« chêne », « hêtre », « châtaignier », « pin », « douglas »…). La liste exacte du lot est dans « Mots reconnus ».</li>
<li><b>Qualités</b> : <b>lettre par lettre</b>, sauf celles qui ont un mot :</li></ul>
{tab([('« cé a » · « cé bé » · « cé ixe » · « cé double ixe »', 'CA · CB · CX · CXX'),
 ('« esse té » · « pé a » · « pé bé »', 'ST · PA · PB'),
 ('« bé a »', 'BA'),
 ('« avive »', 'Avivé (le mot « avivé » n\'existe pas pour le moteur)')], 'Vous dites', 'Qualité')}
<div class="warn">Seules les essences et qualités <b>cochées dans le lot</b> sont reconnues : une qualité dite mais absente du lot est ignorée. Ajoutez-la d'abord au lot (bouton +). Le <b>merrain</b> n'est pas reconnu à la voix (pas de mot dans le modèle) : saisissez-le au doigt.</div>

<h1>5. Cubage bord de route</h1>
<h2>5.1 Le déroulé</h2>
<table class="vc"><tr><th style="width:8%">#</th><th style="width:44%">Vous dites</th><th>Ce qui se passe</th></tr>
<tr><td>1</td><td class="say">« note chêne, cé a, huit vingt par quarante-six »</td><td>Billon <b>en cours</b> : CH, CA, 8,20 m, Ø 46 (rien d'enregistré)</td></tr>
<tr><td>2</td><td class="say">« note réduction longueur cinquante »</td><td>Réfaction de 50 cm sur la longueur</td></tr>
<tr><td>3</td><td class="say">« note commentaire gelé »</td><td>Commentaire « gélivure »</td></tr>
<tr><td>4</td><td class="say">« billon suivant »</td><td><b>Billon 707.1 enregistré</b>, relu à voix haute ; le billon 707.2 s'ouvre</td></tr>
<tr><td>5</td><td class="say">« note cé bé, six par quarante »</td><td>Billon en cours : CB, 6 m, Ø 40 (essence reprise)</td></tr>
<tr><td>6</td><td class="say">« grume suivante »</td><td>Billon 707.2 enregistré, grume 707 close, grume 708 ouverte</td></tr></table>
{fig(['v02_billon_en_cours','v03_billon_enregistre'], [
 ('a', 'Après les étapes 1 à 3 : le bloc vocal affiche le <b>billon en cours</b> et rappelle de dire « billon suivant » ; le billon se remplit à l\'écran (qualité, longueur, diamètre, réduction, commentaire).'),
 ('b', 'Après « billon suivant » : <b>707.1 enregistré</b> avec tout son détail, le billon 707.2 est prêt.')], w=52, maxparts=1)}
<h2>5.2 Toutes les commandes du cubage</h2>
{tab([
 'Dicter un billon',
 ('« note chêne, cé a, dix par cinquante »', 'Billon en cours : essence, qualité, longueur, diamètre'),
 ('« note huit vingt par quarante-deux »', 'Longueur et diamètre ; essence et qualité reprises'),
 ('« note cé bé, quatre et demi par quarante-quatre »', 'Qualité, longueur et diamètre ; essence reprise'),
 ('« note quarante-six »', 'Diamètre seul (pratique avec la <b>longueur fixe</b> du lot)'),
 ('« note diamètre quarante-huit » · « note longueur neuf »', 'Corrige un seul champ du billon en cours'),
 ('« note réduction longueur cinquante » · « note réduction diamètre deux »', 'Réfaction en cm sur la longueur / le diamètre'),
 ('« note commentaire gelé »', 'Commentaire (voir 6)'),
 'Enregistrer et naviguer (sans « note »)',
 ('« billon suivant » ou « suivant »', '<b>Enregistre</b> le billon et ouvre le suivant de la même grume'),
 ('« grume suivante », « suivante » ou « arbre suivant »', 'Enregistre le billon en cours, clôt la grume, passe au n° suivant'),
 ('« précédent »', 'Rouvre le dernier billon enregistré pour le corriger, puis « suivant »'),
 ('« terminé »', 'Quitte la saisie ; refusé tant qu\'un billon est en cours'),
 'Annuler',
 ('« note annule »', 'Efface le billon en cours ; s\'il est vide, retire le dernier billon enregistré'),
 ('« note annule commentaire » · « note annule réduction »', 'Retire le commentaire / la réduction du billon en cours'),
 ('« note annule grume »', 'Vide la grume en cours ; si elle est déjà vide, rouvre la grume précédente'),
 'Divers',
 ('« note numéro cent douze »', 'N° de la grume en cours : 112'),
 ('« note longueur totale douze » (ou « note origine douze »)', 'Seulement pour une grume <b>cubée en plusieurs fois</b> : suit le reste à cuber (facultatif, jamais dans le cas courant)'),
 ('« note chute deux »', 'Abandonne 2 m de cette grume en chute'),
 ('« note pause » / « note reprise »', 'Suspend / reprend l\'écoute')])}
<div class="warn">Un billon dicté mais jamais suivi de « billon suivant » ou « grume suivante » <b>n'est pas enregistré</b>. Avant de quitter, le bloc vocal ne doit plus afficher « Billon en cours » (« terminé » refuse de quitter dans ce cas).</div>

<h1>6. Les commentaires</h1>
<p><b>Toujours « note commentaire » suivi du mot</b> (version 118) : « note commentaire gelé ». Un mot de commentaire dit sans « commentaire » est ignoré (bip grave), pour éviter qu'un mot mal entendu (« courbé » au lieu de « cé bé ») finisse dans le commentaire.</p>
<ul><li>Plusieurs mots en une phrase : « note commentaire roulé fendu » → « roulure fente ».</li>
<li>Phrase libre : « note commentaire », puis dictez la phrase dans les 12 secondes (moins fiable que les mots de la liste).</li>
<li>« note annule commentaire » efface le commentaire du billon en cours.</li></ul>
<p>Certains mots du métier sont inconnus du moteur de reconnaissance : on dit un mot proche et l'application écrit le terme exact.</p>
<table class="vc"><tr><th style="width:46%">Dites « note commentaire … »</th><th>Commentaire enregistré</th></tr>
{''.join(f'<tr><td class="say">« {a} »</td><td>{b}</td></tr>' for a, b in COMM)}
<tr><td class="say">Dits tels quels</td><td>{TELS}</td></tr></table>
<p class="small">Liste par défaut de la version 118, modifiable dans Paramètres › Mode vocal (forme « mot dit = texte enregistré »).</p>
<div class="warn"><b>Téléphone mis en service avant la version 82</b> : il a pu garder l'ancienne liste où « gélivure », « roulure », « échauffure » ne sont jamais reconnus. Faites la vérification du chapitre 9 ; si ces mots sont signalés, remplacez-les par « gelé = gélivure, roulé = roulure, échauffé = échauffure ».</div>

<h1>7. Estimation sur pied : pointage par classes</h1>
<p>Ici, <b>chaque phrase compte une tige</b> aussitôt : pas de « suivant ».</p>
{tab([('« note chêne quarante »', 'Une tige de chêne en classe 40'),
 ('« note trente-cinq »', 'Une tige en classe 35, essence conservée'),
 ('« note hêtre »', 'Change l\'essence sans compter (le téléphone l\'annonce)'),
 ('« note tarif onze »', 'Tarif Chaudé 11 pour l\'essence en cours (1 à 20)'),
 ('« note annule »', 'Retire la dernière tige'),
 ('« terminé »', 'Quitte la saisie')])}
<p class="small">Dites la <b>valeur de la classe</b> (pas de 5 cm par défaut : 20, 25, 30…) : un diamètre hors classe (« trente-trois ») est refusé (bip grave).</p>
{fig(['t41_vocal_pied'], [('🎤', 'Pointage par classes à la voix : rappel des phrases et des essences reconnues.')], w=50, maxparts=1)}

<h1>8. Estimation sur pied : pied à pied numéroté</h1>
<p>Même principe que le cubage : l'arbre se remplit, puis <b>« suivant »</b> l'enregistre. Ordre : essence, <b>diamètre à 1,30 m</b>, « par », <b>hauteur</b>.</p>
{tab([
 ('« note chêne quarante-cinq par seize »', 'Arbre en cours : CH, Ø 45 cm, hauteur 16 m'),
 ('« note hauteur dix-huit virgule cinq » · « note diamètre cinquante »', 'Corrige un seul champ'),
 ('« note tarif dix »', 'Tarif Chaudé 10'),
 ('« note tronçon six cé a » (ou « note cé a six »)', 'Tronçon de 6 m en CA, à la suite des précédents (du bas vers le haut)'),
 ('« note tronçon quatre » puis « note cé bé »', 'Tronçon de 4 m, qualité donnée juste après'),
 ('« note annule tronçon »', 'Retire le dernier tronçon'),
 ('« suivant » (sans « note »)', '<b>Enregistre</b> l\'arbre ; le téléphone annonce son n° et le suivant'),
 ('« précédent »', 'Rouvre le dernier arbre enregistré'),
 ('« note annule » · « note annule arbre »', 'Efface l\'arbre en cours · supprime le dernier arbre enregistré'),
 ('« note numéro trois cents »', 'N° de l\'arbre en cours : 300'),
 ('« terminé »', 'Quitte la saisie ; refusé tant qu\'un arbre est en cours')])}
<p class="small">Le reste de la tige au-dessus des tronçons est compté en « BI ».</p>
<div class="warn"><b>Deux pièges</b> : 1) dans une même phrase, le 2<sup>e</sup> nombre est la <b>hauteur</b> (« note quarante » puis « note trente-cinq » donne Ø 40 et H 35 m) ; 2) quand on change d'essence à la voix, l'arbre garde le <b>tarif Chaudé de l'essence précédente</b> : vérifiez le tarif affiché et dites « note tarif … » si besoin.</div>
{fig(['t43_vocal_pied_a_pied'], [('🌲', 'Arbre en cours dicté : Ø 48, H 17 m, tronçon 6 m CA ; « suivant » l\'enregistre.')], w=50, maxparts=1)}

<h1>9. Réglages (Paramètres › Mode vocal)</h1>
{fig(['v05_parametres_vocal'], [
 ('a', '<b>Mots pour les essences / les qualités</b> : facultatif, pour un code sans mot (« CHR: chêne rouge »). Les codes courants ont déjà leurs mots.'),
 ('b', '<b>Mots de commentaire</b> : la liste du chapitre 6, sous la forme « mot dit = texte enregistré ».'),
 ('c', f'{B("Vérifier que les mots vocaux sont connus du moteur")} : signale les mots qui ne seront jamais reconnus. À faire une fois, et après chaque modification de la liste.'),
 ('d', '<b>Mot de départ</b> : « note » (vide = aucun mot de départ, déconseillé).'),
 ('e', '<b>Ignorer les phrases mal comprises</b> : Oui (recommandé). <b>Annonce de l\'essence</b> à voix haute : Oui.')], w=54, maxparts=1)}

<div style="page-break-before:always"></div><h1>10. Problèmes fréquents</h1>
<table class="vc"><tr><th style="width:38%">Situation</th><th>Que faire</th></tr>
<tr><td>Rien ne se passe</td><td>La phrase commence-t-elle par « note » ? Le point rouge clignote-t-il (pas en pause) ? Micro autorisé ? Rapprochez le téléphone.</td></tr>
<tr><td>Billon dicté absent du listing</td><td>Il n'a pas été enregistré : dites « billon suivant » (ou « grume suivante ») après chaque billon.</td></tr>
<tr><td>Bip grave sur une qualité</td><td>Qualité non cochée dans le lot : ajoutez-la (bouton +), ou dites-la lettre par lettre (« cé bé »).</td></tr>
<tr><td>« … ignoré : dites « commentaire … » »</td><td>Un mot de commentaire a été dit sans « commentaire » : redites « note commentaire … ».</td></tr>
<tr><td>« commentaire libre indisponible »</td><td>Le mot n'est pas dans la liste du téléphone : vérification du chapitre 9.</td></tr>
<tr><td>Une valeur fausse</td><td>Corrigez le champ (« note diamètre … », « note longueur … ») ou « note annule » et redictez ; déjà enregistré : « précédent ».</td></tr>
<tr><td>« saisie en cours : dites « suivant » ou « annule » avant « terminé » »</td><td>Un billon ou un arbre est entamé : enregistrez-le (« suivant ») ou effacez-le (« note annule »).</td></tr>
<tr><td>Le téléphone se met en veille</td><td>Réglez la mise en veille automatique sur 5 min ou plus pendant le cubage.</td></tr>
<tr><td>Beaucoup d'erreurs par vent ou près d'un engin</td><td>Oreillette ou micro Bluetooth ; « note pause » le temps du bruit.</td></tr></table>

<div class="card-page">
<h1 class="cardt">Aide-mémoire vocal · Cubage SBF v{VERSION}</h1>
<p class="small">À imprimer et plastifier. Chaque phrase commence par <b>« note »</b>, sauf les commandes en gras sans guillemets « note ».</p>
<table class="mem"><tr><td>
<h3>Cubage bord de route</h3>
<p><span class="say">note chêne, cé a, dix par cinquante</span><br>essence · qualité · longueur · diamètre</p>
<p><span class="say">note huit vingt par quarante-deux</span><br>essence et qualité reprises</p>
<p><span class="say">note diamètre …</span> · <span class="say">note longueur …</span><br>corriger un champ</p>
<p><span class="say">note réduction longueur cinquante</span><br><span class="say">note commentaire gelé</span></p>
<p><b>billon suivant</b> → enregistre le billon<br><b>grume suivante</b> → enregistre et passe à la grume suivante<br><b>précédent</b> → rouvre le dernier billon<br><b>terminé</b> → quitter</p>
<p><span class="say">note annule</span> · <span class="say">note annule grume</span><br><span class="say">note annule commentaire</span> · <span class="say">… réduction</span></p>
<p><span class="say">note numéro cent douze</span> · <span class="say">note pause</span> / <span class="say">note reprise</span></p>
<p class="small">Grume cubée en plusieurs fois seulement : <span class="say">note longueur totale douze</span> · <span class="say">note chute deux</span></p>
</td><td>
<h3>Nombres</h3>
<p>huit vingt = 8,20 · huit et demi = 8,50<br>huit virgule vingt-cinq = 8,25<br>« par » sépare longueur et diamètre</p>
<h3>Qualités</h3>
<p>cé a CA · cé bé CB · cé ixe CX<br>cé double ixe CXX · esse té ST<br>pé a PA · pé bé PB · bé a BA · avive Avivé</p>
<h3>Commentaires</h3>
<p>gelé → gélivure · roulé → roulure<br>échauffé → échauffure · pourri → pourriture<br>fendu → fente · noueux → nœuds<br>fourche · aubier · courbure · creux…</p>
<h3>Sur pied · classes</h3>
<p><span class="say">note chêne quarante</span> (1 tige) · <span class="say">note trente-cinq</span><br><span class="say">note hêtre</span> · <span class="say">note tarif onze</span> · <span class="say">note annule</span></p>
<h3>Sur pied · pied à pied</h3>
<p><span class="say">note chêne quarante-cinq par seize</span> (Ø · H)<br><span class="say">note tronçon six cé a</span> · <span class="say">note tarif dix</span><br><b>suivant</b> · <b>précédent</b> · <span class="say">note annule arbre</span></p>
</td></tr></table>
<p class="small">Bip aigu = compris · bip grave = non compris, redire. Un billon (ou un arbre) n'est enregistré qu'avec <b>« suivant »</b>.</p>
</div>
'''
html = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Cubage SBF — Commandes vocales</title>
<link rel="stylesheet" href="style.css"><style>
.head {{ display:flex; align-items:center; gap:14px; border-bottom:2.5px solid #cd8a63; padding-bottom:8px; margin-bottom:8px; }}
.head img {{ width:58mm; }} .head .t {{ font-size:18pt; font-weight:bold; color:#37485a; }} .head .s {{ color:#cd8a63; font-size:10.5pt; }}
h1 {{ page-break-before: avoid !important; font-size:15pt; margin:18px 0 8px; }}
table {{ page-break-inside: auto !important; }} tr {{ page-break-inside: avoid; }}
table.key td {{ border-bottom:1px solid #e3e6e9; font-size:10.3pt; padding:6px; }}
table.key td.k {{ width:26px; font-weight:bold; color:#fff; background:#d9480f; text-align:center; }}
td.say, span.say {{ font-style: italic; color:#1f4d36; }}
.card-page {{ page-break-before: always; border:2px dashed #9aa5ae; border-radius:10px; padding:10px 14px; }}
h1.cardt {{ margin-top:0; font-size:14pt; }}
table.mem td {{ vertical-align:top; width:50%; border:0; padding:0 10px 0 0; font-size:9.6pt; }}
table.mem h3 {{ margin:8px 0 3px; color:#d9480f; font-size:10.5pt; }} table.mem p {{ margin:0 0 6px; }}
</style></head><body>{body}</body></html>'''
open(os.path.join(D, 'vocal.html'), 'w').write(html)
print('vocal.html')
