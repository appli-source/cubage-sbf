# Génère technicien.html et bureau.html (sources des guides PDF) avec captures d'écran (dossier img/).
# Usage : python3 gen.py && python3 build.py  (PDF via Chromium/Playwright)
import os, re, html
D = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(D, 'img')
VERSION, SCRIPT, DATE = '117', '3.8', 'Novembre 2026'

def parts(n):
    """Nom d'image -> liste des volets existants (n_p1, n_p2…) ou [n]."""
    p = sorted([f[:-4] for f in os.listdir(IMG) if re.fullmatch(re.escape(n) + r'_p\d+\.jpg', f)])
    if p: return p
    assert os.path.exists(os.path.join(IMG, n + '.jpg')), n
    return [n]

def fig(imgs, legend=None, cap=None, w=56, maxparts=None, side=True):
    """Figure : captures (volets côte à côte) + légende numérotée."""
    names = []
    for n in imgs:
        ps = parts(n)
        names += ps[:maxparts] if maxparts else ps
    cells = ''.join(f'<td class="shot"><img src="img/{n}.jpg" style="width:{w}mm"></td>' for n in names)
    leg = ''
    if legend:
        leg = '<table class="leg">' + ''.join(f'<tr><td class="num"><span>{k}</span></td><td>{t}</td></tr>' for k, t in legend) + '</table>'
    capt = f'<div class="cap">{cap}</div>' if cap else ''
    if legend and side and len(names) * w <= 112:
        return f'<table class="fig"><tr>{cells}<td class="legcell">{leg}</td></tr></table>{capt}'
    return f'<table class="fig"><tr>{cells}</tr></table>{capt}{leg}'

def pdfpage(n, cap):
    return f'<table class="fig"><tr><td class="shot"><img class="doc" src="img/{n}.jpg" style="width:150mm"></td></tr></table><div class="cap">{cap}</div>'

B = lambda t: f'<span class="btn">{t}</span>'
NUM = lambda k: f'<span class="n">{k}</span>'

def page(title, sub, meta, toc, body):
    tocl = ''.join(f'<li>{t}</li>' for t in toc)
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="style.css"></head><body>
<div class="cover"><img src="logo.png"><h1>Cubage SBF<br>{title.split("—")[1].strip()}</h1><div class="sub">{sub}</div>
<div class="meta">{meta}<br>Services Bois et Forêts SAS · Loirecopark 1 · 72500 Vaas</div></div>
<h1 class="first">Sommaire</h1><ol class="toc">{tocl}</ol>
{body}
<p class="small" style="margin-top:20px">Services Bois et Forêts SAS · Loirecopark 1 · 72500 Vaas · SIRET 900 809 633 00010 — Cubage SBF, logiciel libre.
Captures réalisées sur un jeu de données de démonstration (chantiers, propriétaires et clients fictifs) ; le fond de carte est illustratif.</p>
</body></html>'''

# =====================================================================================================
#                                     GUIDE TECHNICIEN TERRAIN
# =====================================================================================================
T = []
T.append(f'''
<h1 class="first">L'essentiel en une page</h1>
<table class="day"><tr><th style="width:24%">Quand</th><th>Geste</th><th style="width:30%">Où</th></tr>
<tr><td><b>Avant de partir</b> (réseau)</td><td>Recevoir les essences, qualités, grilles de prix et le statut de vos ventes.</td><td>Accueil › {B('⟳ Mettre à jour depuis le Sheet')}</td></tr>
<tr><td><b>Sur le chantier</b> (sans réseau)</td><td>Créer le lot (n° Xylolink obligatoire), relever le point GPS, saisir les grumes au clavier ou à la voix.</td><td>Cubage bord de route › {B('+ Ajouter un lot')} › {B('Saisir')}</td></tr>
<tr><td><b>Fin de journée</b> (réseau)</td><td>Envoyer les lots sur le Sheet SBF : tant que ce n'est pas fait, ils n'existent que sur votre téléphone.</td><td>Accueil › {B('☁ Sauvegarder les lots')}</td></tr>
<tr><td><b>Remise des documents</b></td><td>Bordereau propriétaire (achat) ou bordereau client (vente), avec ou sans prix HT.</td><td>Écran du lot › Sorties</td></tr>
<tr><td><b>Vente de billons</b></td><td>Regrouper des billons dans un lot client, chiffrer, transmettre au bureau.</td><td>Cubage bord de route › {B('Lots clients')}</td></tr>
</table>
<div class="tip"><b>Rien à craindre sans réseau.</b> L'application fonctionne entièrement hors connexion une fois installée. Le réseau ne sert qu'à
sauvegarder sur le Sheet, recevoir le référentiel, afficher le fond de carte et, la première fois, télécharger le mode vocal.</div>
<div class="warn">Une pastille orange <b>« n à sauvegarder »</b> sur l'accueil signale des lots qui ne sont encore que sur le téléphone. Ne désinstallez jamais l'application et ne changez pas de téléphone tant qu'elle est affichée.</div>
<h2>Les nouveautés de cette version (117)</h2>
<p>Le détail, avec ce qui change dans vos gestes, est dans le document <b>« Cubage SBF · Ce qui change »</b>. En bref :</p>
<ul>
<li><b>Lots de cubage</b> : le <b>propriétaire</b> remplace le champ Chantier ; la liste des lots affiche le propriétaire et les essences (3.1, 3.2).</li>
<li><b>Saisie</b> : le n° de grume est dans le bandeau ; les billons déjà saisis se replient en une ligne (✎ pour les rouvrir) ; grume cubée en plusieurs fois avec suivi du <b>reste à cuber</b> (3.4).</li>
<li><b>Listing</b> : recherche par numéro, filtres essence et qualité, <b>recoupe d'un billon</b> (✂) avec traçabilité (3.8).</li>
<li><b>Ventes</b> : liste commune de <b>clients</b> ({B('Liste ▾')}), récapitulatif par grume avec prix (3.6, chapitre 4).</li>
<li><b>Sur pied</b> : {B('Corriger un effectif')} ; saisie des effectifs sous la grille (5.2).</li>
<li><b>Mode vocal</b> : nouveaux mots de commentaire (« gelé » pour gélivure…), « longueur totale » et « chute » (3.5, 7).</li>
<li>Téléphone neuf : la récupération des lots est proposée d'elle-même (1) ; signal quand le référentiel du Sheet a changé (2).</li>
</ul>

<h1>1. Installer l'application</h1>
<ol class="steps">
<li>Le bureau vous envoie un <b>lien de configuration</b> (mail, WhatsApp…). Il contient l'adresse de l'application et <b>votre clé personnelle</b> : ne le transférez à personne.</li>
<li>Ouvrez ce lien dans <b>Safari</b> (iPhone) ou <b>Chrome</b> (Android). Sur iPhone, si l'application s'ouvre sans configuration : copiez le lien, ouvrez {B('⚙ Paramètres')} et collez-le dans « Coller le lien de configuration », puis {B('Valider')}.</li>
<li>Ajoutez l'application à l'écran d'accueil : <b>Partager › Sur l'écran d'accueil</b> (iPhone) ou <b>⋮ › Ajouter à l'écran d'accueil</b> (Android). Lancez-la ensuite <b>toujours depuis cette icône</b>.</li>
<li>Première ouverture <b>avec du réseau</b> : l'application se met en mémoire et charge le référentiel du Sheet. Votre nom d'opérateur s'affiche sous le titre (il est défini par votre clé).</li>
<li>Si le téléphone n'a encore aucun lot, l'application propose d'elle-même de <b>récupérer vos lots</b> sauvegardés sur le Sheet (voir 6.2).</li>
</ol>
<div class="tip">Les mises à jour arrivent toutes seules à l'ouverture avec du réseau. Le numéro de version figure en bas de l'accueil (repère {NUM(6)} ci-dessous) : donnez-le au bureau en cas de problème.</div>

<h1>2. L'écran d'accueil</h1>
{fig(['t01_accueil'], [
 (1, f'<b>Cubage bord de route</b> : lots de grumes cubées (billons, qualités, réductions), sous-lots, lots clients, bordereaux. Le nombre de lots est indiqué.'),
 (2, '<b>Estimation sur pied</b> : inventaires de bois sur pied, barème Chaudé, hauteurs et tronçons de qualité.'),
 (3, '<b>Paramètres</b> : qualité par défaut, mode vocal, synchronisation, changement de téléphone, copie de secours (chapitre 7).'),
 (4, '<b>Sauvegarder les lots</b> : envoie sur le Sheet SBF tous les lots modifiés depuis la dernière sauvegarde. Le nombre en attente est affiché en orange.'),
 (5, '<b>Mettre à jour depuis le Sheet</b> : reçoit essences, qualités, clients, grilles de prix communes et statuts de vos lots clients. Quand le bureau a modifié le référentiel, l\'application le signale : faites cette mise à jour.'),
 (6, '<b>Version</b> de l\'application installée.')])}
{fig(['t18_sauvegarde'], [( '✓', 'Après une sauvegarde réussie, une fenêtre indique le nombre de lots envoyés. Sans réseau, les lots restent « à sauvegarder » et repartiront au prochain essai.')], w=50)}

<h1>3. Cubage bord de route</h1>
<h2>3.1 Le module</h2>
{fig(['t03_module'], [
 (1, f'{B("+ Ajouter un lot")} : nouveau lot de cubage (voir 3.2).'),
 (2, f'{B("Liste des lots")} : tous vos lots (voir ci-dessous) ; les lots archivés sont regroupés en bas.'),
 (3, f'{B("Lots clients")} : ventes de billons (chapitre 4).'),
 (4, f'{B("Grilles de prix")} : grilles communes reçues du bureau et grilles créées sur le téléphone.')])}

{fig(['t19_liste_lots'], [
 (1, 'Recherche : n° Xylolink, <b>propriétaire</b>, <b>essence</b> (« CH », « HET »), commune ou date.'),
 (2, 'Chaque lot affiche son n° Xylolink et son <b>propriétaire</b>, les <b>essences</b> présentes (en couleur), la date, la commune, le nombre de grumes, l\'état de sauvegarde et le volume.')], maxparts=1)}

<h2>3.2 Créer un lot</h2>
<p>Module Cubage › {B('+ Ajouter un lot')}. Remplissez la fiche puis {B('Créer le lot')} en bas d'écran.</p>
{fig(['t04_nouveau_lot'], [
 (1, '<b>N° chantier Xylolink</b> : obligatoire (sauf lot d\'essai). C\'est lui qui relie le cubage au dossier.'),
 (2, '<b>Propriétaire</b> : il <b>remplace le champ Chantier</b> et sert de nom au lot (liste des lots, bordereaux, Sheet). Nom seul, tel qu\'il doit figurer sur le bordereau propriétaire (pas d\'adresse).'),
 (3, f'<b>Point GPS</b> : {B("📍 Relever la position")} (GPS du téléphone, sans réseau) ou {B("🗺 Placer sur la carte")} (réseau nécessaire). Voir 3.9.'),
 (4, '<b>Premier n° de grume</b> (n° de la première plaquette) : la numérotation continue ensuite toute seule.'),
 (5, '<b>Essences et qualités du lot</b> : touchez celles du chantier (vert = cochée). Seules celles-ci apparaîtront à la saisie. Le bouton <b>+</b> crée un code absent de la liste (voir ci-dessous).'),
 (6, '<b>Grille propriétaire</b> (prix d\'achat) : choisie dans le catalogue, ou « Aucune » pour la régler plus tard.'),
 (7, '<b>Grille client</b> (prix de vente par défaut du lot). Les deux grilles restent modifiables à tout moment (3.7).'),
 (8, '<b>Lot d\'essai / formation</b> : jamais envoyé sur le Sheet, à supprimer ensuite.')], side=False, w=62)}

<h3>Ajouter une essence ou une qualité</h3>
{fig(['t36_nouvelle_essence'], [
 ('+', 'Le bouton <b>+</b> (pointillés) des essences ou des qualités ouvre cette fenêtre : tapez le <b>code</b> (ex. CHR, AUL, C+) puis {0}. Il est coché aussitôt dans le lot et reste disponible sur votre téléphone.'.format(B('Ajouter'))),
 ('→', 'Le même bouton existe dans la fiche « Essences et qualités » du lot, sur l\'écran de saisie et dans la recoupe d\'un lot client.'),
 ('✓', 'À la sauvegarde du lot, le code est <b>proposé au bureau</b>. S\'il le valide, il entre dans le référentiel commun et tous les téléphones le reçoivent avec {0}.'.format(B('⟳ Mettre à jour depuis le Sheet')))], w=50)}
<div class="tip">Utilisez de préférence les codes existants : un code créé par erreur (faute de frappe) est lui aussi proposé au bureau, qui le refusera.</div>

<h2>3.3 L'écran du lot</h2>
<p>C'est le tableau de bord du chantier : volumes en tête, actions, sorties, puis la fiche du lot (modifiable).</p>
{fig(['t08_lot_rempli'], [
 (1, f'{B("Saisir")} : saisie des grumes (3.4).'),
 (2, f'{B("Listing")} : tous les billons, recherche, recoupe, corrections (3.8).'),
 (3, f'{B("Récapitulatif")} : volumes par essence/qualité, achat, vente, marge (3.8).'),
 (4, f'{B("Sous-lots")} : destinations client et affectation des grumes (3.6).'),
 (5, f'{B("Grilles")} : grille propriétaire et grille client du lot (3.7).'),
 (6, f'{B("Bordereau propriétaire")} : document de cubage pour le propriétaire (3.10).'),
 (7, f'{B("Bordereau client")} : bordereau de réception pour un sous-lot ou tout le lot.'),
 (8, f'{B("PDF interne")} / {B("Excel")} : documents de travail SBF.'),
 (9, f'{B("Envoyer à un collègue")} : partage du lot avec un autre téléphone (3.11).'),
 (10, f'{B("Sauvegarder sur le Sheet SBF")} : envoie ce lot seul. Une fois envoyé, le bouton devient « Sauvegardé sur le Sheet · renvoyer » avec la date de la dernière sauvegarde.'),
 (11, '<b>Propriétaire</b> (nom du lot), modifiable ici.'),
 (12, '<b>Point GPS</b> : relever à nouveau, corriger sur la carte, ouvrir dans Google Maps.'),
 (13, '<b>Longueur des billons</b> : « Saisie à chaque billon » ou « Fixe » (3.4).')], side=False, w=62)}
{fig(['t45_alerte_reste'], [('!', 'Si une grume a encore un <b>reste à cuber</b> (3.4), une alerte en tête de l\'écran du lot le rappelle, avec le n° de grume et la longueur restante.')], w=52, maxparts=1)}
<div class="tip"><b>Lot d'essai devenu lot réel</b> : dans la fiche d'un lot d'essai, {B('Passer en lot réel')} (n° Xylolink obligatoire) ; il sera ensuite sauvegardé sur le Sheet comme les autres.</div>
<p>Le bloc <b>Stock et ventes</b> (entre les sorties et la fiche) indique combien de billons du lot sont en stock, vendus (lots clients) ou recoupés : un billon vendu ou recoupé ne peut plus être supprimé.</p>
<div class="tip">{B('Importer un inventaire (Excel / CSV d\'un bûcheron)')} ajoute au lot les grumes d'un fichier de bûcheron : format au 3.12.</div>

<h2>3.4 Saisir les grumes</h2>
<p>Une grume = un numéro, une essence et un ou plusieurs billons (12.1, 12.2…), chacun avec sa <b>qualité</b>, sa <b>longueur en mètres</b> (8,20) et son <b>diamètre médian en cm</b>. Le volume s'affiche aussitôt (cubage au diamètre médian, sur écorce).</p>
{fig(['t07_saisie_grume'], [
 (1, '<b>N° de la grume en cours</b>, dans le bandeau, avec le volume du lot et le n° Xylolink. Le n° reste modifiable dans le champ N° grume (plaquettes).'),
 (2, '<b>Billon déjà saisi</b> : replié en une ligne (qualité, dimensions, volume) pour éviter une modification par erreur.'),
 (3, '<b>✎</b> rouvre ce billon pour le corriger ; ✕ le supprime.'),
 (4, '<b>Billon en cours</b> : qualité, longueur (m), diamètre (cm). {0} réfaction, {1} commentaire, {2} nouveau n° de plaquette pour un billon recoupé (le n° d\'origine reste tracé : « ex 701.3 »).'.format(B('+ Réduction'),B('+ Note'),B('+ N°'))),
 (5, f'{B("Grume cubée en plusieurs fois ?")} : longueur totale de la grume et suivi du reste à cuber (voir ci-dessous).'),
 (6, f'{B("+ Billon")} : ajoute un billon à la même grume ; le précédent se replie.'),
 (7, f'{B("Grume suivante ›")} : <b>enregistre</b> la grume et passe au numéro suivant. Un billon ajouté mais resté vide n\'empêche plus d\'enregistrer.')], side=False, w=62, maxparts=1)}
<p>Les autres éléments ne changent pas : essence de la grume (le <b>+</b> ajoute un code absent), sous-lot s'il y en a, {B('🎤 Mode vocal')} (3.5), {B('Terminer')} pour quitter.
Réduction : en <b>cm</b> sur la longueur et/ou le diamètre (« 100 » sur un 8 m × 52 → cubé 7,00 m × Ø52) ; le listing et les bordereaux gardent la vraie dimension et affichent la réduction.</p>
<h3>Grume cubée en plusieurs fois (reste à cuber)</h3>
<p>Quand une grume ne peut pas être cubée en une fois (grume trop longue, une partie encore en forêt), indiquez sa <b>longueur totale</b> : l'application suit ce qui reste à cuber.</p>
{fig(['t44_longueur_totale','t46_cuber_reste'], [
 ('a', f'{B("Grume cubée en plusieurs fois ? Longueur totale…")} puis la <b>longueur totale</b> (18 m). Les billons saisis en sont déduits ; il reste ici 4 m, signalé sur le lot et dans le listing.'),
 ('b', 'Plus tard : dans le {0}, touchez <b>« reste 4,00 m › »</b> sous le n° de la grume. Elle se rouvre avec un billon déjà rempli à la longueur restante : choisissez la qualité, mesurez le diamètre, enregistrez. « Grume entièrement cubée » confirme.'.format(B('Listing'))),
 ('c', f'Si le reste ne sera jamais cubé : {B("Abandonner le reste (chute)")} dans le bloc longueur totale ; {B("Annuler l’abandon")} le rétablit.')], w=52, maxparts=1)}
<h3>Longueur fixe</h3>
<p>Pour un lot de billons tous de même longueur (bois de chauffage, billons 2 m, 4 m…), choisissez dans la fiche du lot <b>Longueur des billons › Fixe</b>
(repère {NUM(12)} de l'écran du lot). La dernière longueur enregistrée est reprise à chaque billon et le curseur va directement au diamètre.
Il suffit de corriger la longueur une fois pour qu'elle serve aux billons suivants.</p>
<h3>Corriger ou supprimer</h3>
<p>{B('Listing')} › ✎ sur la ligne pour rouvrir la grume, ✕ pour la supprimer. Un billon vendu ou recoupé dans un lot client ne peut plus être supprimé.</p>

<h2>3.5 Mode vocal (cubage)</h2>
{fig(['t40_vocal_grumes'], [
 (1, f'{B("🎤 Mode vocal")} lance l\'écoute (point rouge clignotant) ; l\'essence, la qualité et le n° de grume en cours sont rappelés. {B("Pause")} / {B("Arrêter")}. <b>Première fois</b> : avec du réseau, téléchargement du modèle de reconnaissance (42 Mo, une seule fois) ; ensuite tout fonctionne <b>sans réseau</b> et aucun son ne quitte le téléphone.'),
 (2, 'Aide-mémoire des phrases (tableau ci-dessous).'),
 (3, '« Mots reconnus » : la façon de dire les essences et qualités du lot.')], maxparts=1)}
<h3>Le principe : dicter, vérifier, puis « billon suivant »</h3>
<ol class="steps">
<li>Dictez le billon d'une traite : <b>« note chêne, cé a, dix par cinquante »</b> (essence, qualité, longueur, diamètre). Il apparaît à l'écran comme <b>billon en cours</b>, rien n'est encore enregistré.</li>
<li>Vérifiez sur l'écran (ou à l'écoute du bip). Corrigez si besoin : « note diamètre quarante-huit », « note longueur huit vingt ». Ajoutez si besoin une réduction ou un commentaire.</li>
<li>Dites <b>« billon suivant »</b> : le billon est enregistré, le téléphone le relit (« cé a, dix mètres, cinquante ») et un nouveau billon de la même grume s'ouvre.</li>
<li>Pour changer de grume, dites <b>« grume suivante »</b> : le billon en cours est enregistré, la grume est close et la suivante s'ouvre avec le numéro suivant.</li>
</ol>
{fig(['t42_vocal_billon_en_cours'], [
 (1, 'Le bloc vocal affiche le <b>billon en cours</b> et rappelle de dire « billon suivant » pour l\'enregistrer.'),
 (2, 'Le billon se remplit à l\'écran au fur et à mesure : qualité, longueur, diamètre, réduction (ici « note réduction longueur cinquante ») et commentaire (« note commentaire gelé », enregistré « gélivure »).')], maxparts=1)}
<p><b>Chaque phrase commence par « note »</b> (mot de départ, réglable dans Paramètres) : tout le reste est ignoré, vous pouvez parler avec le bûcheron sans rien enregistrer.
Exception : les commandes d'enregistrement et de navigation se disent <b>seules</b>, sans « note ».</p>
<table><tr><th style="width:46%">Vous dites</th><th>L'application fait</th></tr>
<tr><td colspan="2" class="grp">Dicter un billon</td></tr>
<tr><td>« note chêne, cé a, dix par cinquante »</td><td>Billon en cours : chêne, CA, 10 m, Ø 50</td></tr>
<tr><td>« note huit vingt par quarante-deux »</td><td>8,20 m × Ø 42, essence et qualité du billon précédent</td></tr>
<tr><td>« note cé bé, quatre et demi par quarante-quatre »</td><td>Qualité CB, 4,50 m × Ø 44 (essence conservée)</td></tr>
<tr><td>« note diamètre quarante-huit » · « note longueur neuf »</td><td>Corrige un seul champ du billon en cours</td></tr>
<tr><td>« note réduction longueur cinquante » · « note réduction diamètre deux »</td><td>Réduction de 50 cm sur la longueur / 2 cm sur le diamètre</td></tr>
<tr><td>« note commentaire gelé »</td><td>Commentaire « gélivure » : on dit un mot de la liste, l'application écrit le texte associé (voir ci-dessous)</td></tr>
<tr><td>« note commentaire » … puis la phrase</td><td>Commentaire libre : dictez la phrase dans les 12 secondes</td></tr>
<tr><td>« note longueur totale dix-huit » (ou « note origine dix-huit »)</td><td>Grume cubée en plusieurs fois : longueur totale 18 m, le reste à cuber est suivi <span class="pill new">nouveau</span></td></tr>
<tr><td>« note chute deux »</td><td>Abandonne 2 m de la grume en chute <span class="pill new">nouveau</span></td></tr>
<tr><td colspan="2" class="grp">Enregistrer et naviguer (sans « note »)</td></tr>
<tr><td>« billon suivant » ou « suivant »</td><td><b>Enregistre</b> le billon en cours et ouvre le billon suivant de la même grume</td></tr>
<tr><td>« grume suivante » ou « suivante » ou « arbre suivant »</td><td>Enregistre le billon en cours, clôt la grume, passe au numéro suivant</td></tr>
<tr><td>« précédent »</td><td>Rouvre le dernier billon enregistré pour le corriger (puis « suivant » pour le réenregistrer)</td></tr>
<tr><td>« terminé »</td><td>Quitte l'écran de saisie (refusé si un billon est entamé)</td></tr>
<tr><td colspan="2" class="grp">Annuler et autres commandes</td></tr>
<tr><td>« note annule »</td><td>Efface le billon en cours ; s'il est vide, retire le dernier billon enregistré de la grume</td></tr>
<tr><td>« note annule commentaire » · « note annule réduction »</td><td>Retire le commentaire / la réduction du billon en cours</td></tr>
<tr><td>« note annule grume »</td><td>Vide la grume en cours ; si elle est déjà vide, rouvre la grume précédente</td></tr>
<tr><td>« note numéro cent douze »</td><td>Change le n° de la grume en cours (112)</td></tr>
<tr><td>« note pause » / « note reprise »</td><td>Suspend / reprend l'écoute</td></tr></table>
<ul><li>« par » sépare la longueur du diamètre. Sans « par », le dernier nombre est le diamètre. Longueurs : « huit » = 8 m, « huit vingt » = 8,20, « huit et demi », « huit virgule vingt-cinq ».</li>
<li>Qualités lettre par lettre : CA « cé a », CB « cé bé », CX « cé ixe », CXX « cé double ixe », ST « esse té », PA « pé a » ; « avivé » se dit « avive ». Le merrain n'est pas encore reconnu.</li>
<li>Avec la <b>longueur fixe</b> (3.4), la longueur est reprise : il suffit de dicter « note quarante-six » puis « suivant ».</li>
<li><b>Mots de commentaire</b> : certains mots ne sont pas connus du moteur de reconnaissance (gélivure, roulure, échauffure…). On dit donc un mot reconnu et l'application écrit le terme exact : <b>gelé → gélivure</b>, roulé → roulure, échauffé → échauffure, pourri → pourriture, fendu → fente, noueux → nœuds, courbé → courbure, mort → bois mort, piqué → piqûres… Les mots dits tels quels : pourriture, fente, nœuds, courbure, fourche, aubier, creux, mitraille, fissure, chancre, cicatrice, bois de réserve… (liste complète dans Paramètres › Mode vocal).</li>
<li>Écran allumé (verrouillé, le micro se coupe) ; par vent fort, une oreillette ou un micro Bluetooth aide beaucoup.</li></ul>
<div class="warn"><b>Téléphone mis en service avant la version 82</b> : il peut avoir gardé l'ancienne liste de commentaires (« gélivure, pourriture, roulure… ») où « gélivure », « roulure » et « échauffure » ne sont <b>jamais reconnus</b>. Vérifiez une fois : Paramètres › Mode vocal › {B('Vérifier que les mots vocaux sont connus du moteur')}. Si ces mots sont signalés, remplacez-les dans le champ des mots de commentaire par « gelé = gélivure, roulé = roulure, échauffé = échauffure ».</div>
<div class="warn">Un billon dicté mais jamais suivi de « billon suivant » ou « grume suivante » n'est <b>pas enregistré</b>. Avant de quitter, vérifiez que le bloc vocal n'affiche plus « Billon en cours » (« terminé » refuse de quitter dans ce cas).</div>

<h2>3.6 Sous-lots (destinations client)</h2>
<p>Un sous-lot = une destination (nom, client, grille client éventuelle). On affecte les grumes pendant la saisie ou après coup.</p>
{fig(['t48_liste_clients','t09_sous_lots'], [
 ('a', f'<b>Nouveau sous-lot</b> : {B("Liste ▾")} ouvre la <b>liste commune de clients</b> (tenue par le bureau) ; un appui remplit le nom. Vous pouvez aussi taper un autre nom (destination, « Merranderie »…). Un client absent de la liste sera proposé au bureau à la sauvegarde.'),
 ('b', 'Écran <b>Sous-lots</b> : chaque sous-lot avec son volume, sa grille client (« Grille client du lot » par défaut, une grille du catalogue, ou une grille propre au sous-lot) et le bouton <b>Affecter des grumes</b> ; « Non affecté » compte le reste.')], w=52, maxparts=1)}
{fig(['t10_affecter'], [('↔', 'Écran <b>Affecter</b> : par plage de numéros (du 101 au 118) ou en touchant les grumes une à une (coche verte). Toucher à nouveau retire la grume.')], w=50, maxparts=1)}

<h2>3.7 Grilles de prix du lot</h2>
{fig(['t11_grilles_lot'], [
 ('P', '<b>Grille propriétaire</b> (achat) : utilisée pour le bordereau propriétaire et la colonne « Achat » du récapitulatif.'),
 ('C', '<b>Grille client</b> (vente) : prix de vente par défaut du lot ; un sous-lot peut avoir la sienne.'),
 ('✎', f'Chaque grille : une grille du catalogue, ou {B("Copier … dans le lot")} pour l\'ajuster (prix négocié, client qui change son prix lot par lot), ou {B("Créer une grille propre au lot")}.')])}
<p>Une ligne de grille = essence, qualité, Ø min, Ø max (bornes incluses, ex. 30 à 49 puis 50 et +), prix €/m³. Champ vide = toutes. La ligne la plus précise l'emporte.
Le propriétaire ne voit jamais la grille client et inversement : chaque bordereau n'utilise que la grille de son destinataire.</p>

<h2>3.8 Listing, recoupe et récapitulatif</h2>
{fig(['t12_listing'], [
 (1, '<b>Recherche</b> par n° de grume, de billon, de plaquette ou de tronçon (« 704 », « 1012 »). La barre reste visible en faisant défiler.'),
 (2, '<b>Filtres</b> par qualité, et par essence quand le lot en a plusieurs ; sous-lot si le lot en a.'),
 (3, '<b>✂ Recouper</b> le billon (voir ci-dessous).'),
 (4, '<b>✎</b> rouvre la grume, <b>✕</b> la supprime. Un billon vendu ou recoupé ne peut plus être supprimé.'),
 (5, 'Billon recoupé : barré, avec ses tronçons en dessous (↳ 704, ↳ 1012) modifiables ou supprimables, et {0}.'.format(B('↶ Annuler la recoupe')))], maxparts=1)}
<h3>Recouper un billon (✂)</h3>
<p>Quand un billon est recoupé au chargement ou à la scierie, recoupez-le dans le lot : chaque tronçon devient un billon à part entière (stock, ventes, bordereaux), et le billon d'origine reste tracé.</p>
{fig(['t47_recoupe'], [
 (1, '<b>Tronçon 1 (bas)</b> : il garde le n° d\'origine (modifiable). Longueur, diamètre médian <b>remesuré</b>, qualité.'),
 (2, '<b>Tronçons suivants</b> : n° de la <b>nouvelle plaquette</b> (un n° déjà utilisé est refusé).'),
 (3, f'{B("+ Ajouter un tronçon")} : un seul tronçon est proposé au départ.'),
 (4, '<b>Écart de recoupe</b> (volume) et <b>reste</b> en longueur. Des tronçons plus longs que le billon demandent une confirmation.')], maxparts=1)}
<ul><li><b>Recoupe partielle</b> : si les tronçons ne couvrent pas tout le billon, l'application propose {B('Enregistrer, cuber le reste plus tard')} (le reste est suivi et signalé sur le lot, {B('Compléter la recoupe')} plus tard) ou {B('Le reste est une chute (abandonné)')}.</li>
<li>La recoupe est possible sur chaque billon, y compris dans un lot d'essai, et un sous-lot peut être choisi par tronçon.</li>
<li>La recoupe depuis un <b>lot client</b> (chapitre 4) existe toujours.</li></ul>
{fig(['t13_recap'], [('R', '<b>Récapitulatif</b> : par essence et qualité (billons, Ø moyen, longueur moyenne, m³), montants <b>achat</b>, <b>vente</b> et <b>marge bois</b> HT, puis prix par tranche de diamètre de chaque grille. Filtre par sous-lot en haut ; PDF et Excel en bas.')], w=52, maxparts=1)}

<h2>3.9 Point GPS du lot</h2>
{fig(['t14_carte'], [
 ('📍', f'{B("Relever la position")} : position du téléphone, <b>sans réseau</b>. La précision s\'affiche (± 6 m) ; réessayez à découvert si elle est mauvaise.'),
 ('🗺', f'{B("Corriger sur la carte")} : touchez la carte pour poser le repère, faites-le glisser, ou saisissez latitude/longitude. {B("Ma position")} recentre sur le téléphone ; {B("Valider")} enregistre. Le fond de carte (OpenStreetMap) demande du réseau.'),
 ('↗', 'Le point figure dans les bordereaux et l\'Excel sous forme de <b>lien Google Maps cliquable</b>.')])}

<h2>3.10 Sorties : bordereaux et documents</h2>
{fig(['t15_choix_bordereau','t16_choix_client'], [
 ('a', f'{B("Bordereau propriétaire")} : choisir {B("Sans prix")} ou {B("Avec prix HT")} (grille propriétaire).'),
 ('b', f'{B("Bordereau client")} : choisir d\'abord le sous-lot (ou « Tout le lot » s\'il n\'y a qu\'un client), puis sans ou avec prix HT (grille client).')], w=50)}
<p>Le PDF est enregistré dans les Téléchargements du téléphone et peut être ouvert, envoyé par mail ou WhatsApp. Chaque page porte le logo, le numéro du bordereau
et les mentions légales de SBF ; le point GPS est un lien cliquable ; une zone de signature termine le document.</p>
{pdfpage('bordereau_proprietaire-1', 'Bordereau de cubage propriétaire (BC-…), avec prix HT : cartouche, récapitulatif par essence et qualité, prix par tranche de diamètre, listing des billons avec réductions et notes.')}
{pdfpage('bordereau_client-1', 'Bordereau de réception client (BR-…) du sous-lot « Merranderie », avec prix HT de la grille client.')}
<table><tr><th style="width:30%">Bouton</th><th>Contenu</th></tr>
<tr><td>{B('PDF interne')}</td><td>Document de travail SBF : récapitulatifs achat et vente, listing complet, sous-lots. Tout le lot, un sous-lot, ou un fichier par sous-lot.</td></tr>
<tr><td>{B('Excel')}</td><td>Mêmes données en tableur (une ligne par billon, avec lien GPS).</td></tr></table>

<h2>3.11 Sauvegarder, archiver, partager</h2>
<ul>
<li><b>Sauvegarder</b> : accueil {B('☁ Sauvegarder les lots')} (tous les lots en attente) ou bouton du lot (ce lot seul). Le lot complet (grumes, billons, prix, sous-lots, notes) part sur le Sheet. Renvoyer après modification remplace la version précédente.</li>
<li><b>Archiver</b> (une fois sauvegardé) : le lot reste sur le téléphone, dans la liste « lots archivés », sans encombrer la liste courante.</li>
<li><b>Envoyer à un collègue</b> : produit un fichier du lot (.json) à partager (mail, WhatsApp, AirDrop). Votre copie peut passer en <b>lecture seule</b> pour que deux téléphones ne modifient pas le même lot ; {B('Reprendre la main')} la rend modifiable.</li>
<li><b>Recevoir un lot</b> : Cubage › Liste des lots › {B('Importer un lot reçu ou un inventaire')}. L'application propose de l'ajouter comme nouveau lot ou de le <b>fusionner</b> dans un de vos lots (chantier cubé à plusieurs téléphones) ; les numéros déjà présents sont signalés.</li>
</ul>

<h2>3.12 Importer un inventaire de bûcheron (Excel / CSV)</h2>
<p>Deux entrées : sur l'écran d'un lot, {B("Importer un inventaire (Excel / CSV d'un bûcheron)")} (ajoute au lot ouvert), ou Cubage › {B('Importer un lot reçu ou un inventaire')}
qui propose <b>Nouveau lot</b> (la fiche s'ouvre : n° Xylolink, essences, qualités) ou l'un de vos lots en cours. Formats acceptés : <b>.xlsx</b>, <b>.xls</b>, <b>.csv</b>.</p>
<h3>Colonnes reconnues</h3>
<p>Le fichier doit contenir une <b>ligne d'en-tête</b> (dans les 30 premières lignes de l'onglet, titres et lignes vides au-dessus acceptés), puis <b>une ligne par grume</b>.
Majuscules, accents, espaces et ponctuation des titres sont ignorés (« N° grume », « Diamètre (cm) », « longueur_m » sont reconnus). Les colonnes peuvent être dans n'importe quel ordre ; les autres colonnes sont ignorées.</p>
<table><tr><th style="width:20%">Donnée</th><th style="width:10%">Statut</th><th style="width:36%">Titres de colonne acceptés</th><th>Contenu</th></tr>
<tr><td><b>Numéro</b></td><td>obligatoire</td><td>Numéro, Num, N, No, N grume, Grume, Numéro grume</td><td>N° de plaquette (112). Une ligne sans numéro est ignorée.</td></tr>
<tr><td><b>Longueur</b></td><td>obligatoire</td><td>Longueur, Longueur m, Long, L, Lg, Lg m</td><td><b>En mètres</b> : 8,20 ou 8.20 (arrondi au cm).</td></tr>
<tr><td><b>Diamètre</b></td><td>obligatoire</td><td>Diamètre, Diamètre cm, Diam, D, Ø, Diamètre médian</td><td><b>En cm</b>, diamètre médian ; les décimales sont tronquées (52,7 → 52).</td></tr>
<tr><td>Qualité</td><td>facultatif</td><td>Qualité, Qual, Q, Classe</td><td>Code (CA, CB, ST…), converti en majuscules.</td></tr>
<tr><td>Essence</td><td>facultatif</td><td>Essence, Ess, Esp, Espèce</td><td>Code (CH, HET…), converti en majuscules.</td></tr>
<tr><td>Réduction L</td><td>facultatif</td><td>Réduction L, Réduction longueur, Red L</td><td>Réfaction en <b>cm</b> sur la longueur (100 = 1 m).</td></tr>
<tr><td>Réduction Ø</td><td>facultatif</td><td>Réduction D, Réduction diamètre, Red D, Réduction Ø</td><td>Réfaction en <b>cm</b> sur le diamètre.</td></tr>
<tr><td>Note</td><td>facultatif</td><td>Note, Commentaire, Observation, Obs, Remarque, Rem</td><td>Commentaire du billon (gélivure, pourriture au pied…), repris dans le listing, les exports, le Sheet et les bordereaux.</td></tr></table>
<h3>Exemple (fichier modèle <code>modele-import-inventaire.xlsx</code>, dossier <code>manuels/</code> du dépôt GitHub)</h3>
<table style="width:auto"><tr><th>numero</th><th>essence</th><th>qualite</th><th>longueur_m</th><th>diametre_cm</th><th>reduction_l</th><th>reduction_d</th><th>note</th></tr>
<tr><td>101</td><td>CH</td><td>CA</td><td class="r">8,20</td><td class="r">52</td><td></td><td></td><td></td></tr>
<tr><td>102</td><td>CH</td><td>CB</td><td class="r">6,40</td><td class="r">47</td><td class="r">100</td><td></td><td>gélivure</td></tr>
<tr><td>103</td><td>HET</td><td>CX</td><td class="r">10,00</td><td class="r">61</td><td></td><td></td><td></td></tr>
<tr><td>104</td><td>CH</td><td>ST</td><td class="r">4,50</td><td class="r">31</td><td></td><td></td><td></td></tr></table>
<div class="tip"><b>Excel ou CSV.</b> Un CSV enregistré par Excel en français (séparateur point-virgule, virgule décimale « 8,20 », accents) est lu correctement, de même qu'un CSV à point décimal (8.20). Contrôlez toujours le volume total annoncé à la fin de l'import.</div>
<h3>Règles à connaître</h3>
<ul><li><b>Une ligne = une grume d'un seul billon.</b> Une grume en plusieurs billons doit être complétée ensuite à la saisie ({B('Listing')} › ✎ › {B('+ Billon')}).</li>
<li>Lignes ignorées : sans numéro, ou longueur / diamètre vides ou nuls. Numéros <b>déjà présents</b> dans le lot : ignorés et comptés dans le message final.</li>
<li>Sans colonne Essence ou Qualité (ou cellule vide), l'application demande à l'import l'essence et la qualité à appliquer à ces lignes.</li>
<li>Une essence ou une qualité inconnue du lot y est ajoutée automatiquement (vérifiez l'orthographe des codes dans le fichier).</li>
<li>Tous les onglets du classeur sont lus : chaque onglet qui contient la ligne d'en-tête est importé.</li>
<li>Si un sous-lot est sélectionné dans la saisie, les grumes importées y sont affectées.</li>
<li>Le lot reste <b>à sauvegarder</b> : pensez à l'envoyer sur le Sheet.</li></ul>
<div class="warn">Si l'application répond « Aucune grume trouvée », la ligne d'en-tête n'a pas été reconnue : vérifiez qu'il existe bien trois colonnes intitulées Numéro, Longueur et Diamètre.</div>

<h1>4. Lots clients (vente de billons)</h1>
<p>Un lot client regroupe des billons d'un ou plusieurs lots du téléphone pour un client. <b>Un billon ne peut appartenir qu'à un seul client.</b></p>
{fig(['t21_nouveau_lot_client'], [
 (1, '<b>Client</b> (obligatoire).'),
 (2, f'{B("Liste ▾")} : liste commune de clients, un appui remplit le champ. Un client absent de la liste sera proposé au bureau à l\'envoi.'),
 (3, '<b>Référence</b> du contrat ou du bon.'),
 (4, f'<b>Grille de prix</b> du client. Puis {B("Créer le lot client")}.')], maxparts=1)}
{fig(['t22_ajout_billons'], [
 (1, 'Tapez un numéro (« 112 », « 112.2 ») ou une <b>plage</b> (« 113-118 ») ; « Coller une liste de numéros » accepte un bordereau de chargement entier.'),
 (2, f'{B("Ajouter les n billons disponibles")} : tout ajouter d\'un coup, ou {B("Ajouter")} billon par billon. Les billons déjà vendus ou recoupés sont signalés.'),
 (3, f'{B("Recouper")} : tronçons du bas vers le haut avec un nouveau diamètre médian chacun ; le premier garde le n° d\'origine, les suivants prennent le n° de la nouvelle plaquette.')], maxparts=1)}
{fig(['t23_lot_client'], [
 (1, 'Ajouter des billons (numéros, plages, liste collée).'),
 (2, '<b>Prix de vente</b> : la grille choisie est copiée dans le lot et complétée d\'une ligne par essence × qualité présente ; renseignez les prix manquants.'),
 (3, f'{B("Récapitulatif")} : par essence et qualité, par tranche de prix, et <b>par grume</b> (voir ci-dessous).'),
 (4, f'{B("Bordereau de réception (PDF client)")}, sans ou avec prix HT.'),
 (5, '<b>Fiche du lot client</b> : client ({0}), date, référence, grille, remarques, statut.'.format(B('Liste ▾'))),
 (6, f'{B("Transmettre au bureau")} : le lot passe « Transmis » et devient en lecture seule ; les lots d\'origine sont sauvegardés automatiquement. Le bureau valide la vente avec le <b>n° de facture Xylolink</b>.')], side=False, w=58, maxparts=1)}
<p>La liste des billons du lot client affiche maintenant pour chacun le prix au m³, le prix total et l'<b>origine</b> (n° Xylolink et propriétaire du lot).</p>
{fig(['t49_recap_par_grume'], [('Σ', 'Récapitulatif <b>par grume</b> : chaque billon avec son prix unitaire et son prix total, un sous-total par grume, filtres par chantier, n° de grume, essence ou qualité (sous-totaux et total suivent). Sur téléphone, faites glisser le tableau vers la gauche pour voir les colonnes de prix.')], w=56, maxparts=1)}
{fig(['t24_prix_vente','t26_lots_clients_statuts'], [
 ('€', 'Prix de vente propres au lot client : une ligne par essence/qualité, Ø min/max facultatifs. « Tous les billons ont un prix » confirme qu\'aucun billon n\'est oublié.'),
 ('✓', f'Liste des lots clients avec leur statut : <b>brouillon</b>, <b>transmis</b>, <b>vente validée</b> par le bureau ou <b>annulé</b>. Le statut se met à jour avec {B("⟳ Mettre à jour depuis le Sheet")}.')], w=52, maxparts=1)}
<div class="warn">Un lot client supprimé après transmission prévient le Sheet (réseau nécessaire) : ses billons repassent en stock.</div>

<h1>5. Estimation de bois sur pied</h1>
<h2>5.1 Créer un lot</h2>
{fig(['t30_nouveau_pied'], [
 (1, '<b>Tarif Chaudé par défaut</b> (1 à 20), modifiable ensuite par essence et par classe.'),
 (2, '<b>Mode d\'inventaire</b> : « pied à pied, diamètre seul » (hauteurs données ensuite par classe), « par classes avec effectifs », ou « pied à pied numéroté » (diamètre + hauteur par tige).'),
 (3, '<b>Grille de prix</b> sur pied (facultative).')], maxparts=1)}
<p>Le lot sur pied garde le champ <b>Chantier</b> (nom de la parcelle) ; comme pour le cubage : commune, point GPS, essences et qualités du lot (au moins une qualité doit être cochée).</p>
<h2>5.2 Pointer les tiges</h2>
{fig(['t32_saisie_pied'], [
 (1, 'Choisissez l\'<b>essence</b> (pastilles) ; le compteur indique les tiges du lot et de l\'essence. Le tarif Chaudé de l\'essence se règle avec − / +.'),
 (2, 'Un appui sur une <b>classe de diamètre</b> (à 1,30 m, pas de 5 cm par défaut) = une tige. La pastille indique le nombre de tiges de la classe.'),
 (3, f'{B("Corriger un effectif")} <span class="pill new">nouveau</span> : remplace le nombre de tiges d\'une classe d\'un coup (voir ci-dessous).'),
 (4, f'{B("Annuler dernière")} retire la dernière tige pointée.')], maxparts=1)}
{fig(['t37_corriger_effectif'], [
 (1, 'Choisissez la classe à corriger (le nombre actuel est rappelé).'),
 (2, 'Tapez le <b>nouveau total</b> (ou − / +) : ici 12 au lieu de 14.'),
 (3, f'{B("Appliquer")} : les tiges sont ajoutées ou retirées pour atteindre ce total, pour l\'essence en cours.')], w=56, maxparts=1)}
<p>En mode <b>par classes avec effectifs</b>, le champ <b>Nombre de tiges</b> est sous la grille : touchez la classe, tapez le nombre, ajoutez ; l'écran revient à la grille pour la classe suivante. En modification d'un pointage groupé, le nombre de tiges reste affiché et modifiable.</p>
<h3>Mode vocal (pointage par classes)</h3>
<p>Même principe que le cubage, chaque phrase commence par « note ». Ici, <b>chaque phrase compte une tige aussitôt</b> (pas de « suivant »).</p>
<table><tr><th style="width:46%">Vous dites</th><th>L'application fait</th></tr>
<tr><td>« note chêne quarante »</td><td>Une tige de chêne en classe 40</td></tr>
<tr><td>« note trente-cinq »</td><td>Une tige en classe 35, essence conservée</td></tr>
<tr><td>« note chêne »</td><td>Change l'essence sans compter (le téléphone l'annonce)</td></tr>
<tr><td>« note tarif onze »</td><td>Tarif Chaudé 11 pour l'essence en cours (1 à 20) <span class="pill new">nouveau</span></td></tr>
<tr><td>« note annule »</td><td>Retire la dernière tige</td></tr>
<tr><td>« terminé » (sans « note »)</td><td>Quitte l'écran de saisie <span class="pill new">nouveau</span></td></tr></table>
{fig(['t41_vocal_pied'], [('🎤','Mode vocal en pointage par classes : rappel des phrases et des essences reconnues.')], w=50)}

<h2>5.3 Pied à pied numéroté (et sa dictée)</h2>
<p>En mode <b>pied à pied numéroté</b>, chaque arbre porte un numéro, son diamètre à 1,30 m, sa hauteur, son tarif et, si besoin, ses tronçons de qualité du bas vers le haut ; le reste de la tige est compté en « BI ». Au clavier : remplir les champs puis {B('Ajouter ›')}.
Le <b>mode vocal</b> y est désormais disponible <span class="pill new">nouveau</span> et fonctionne comme le cubage : l'arbre se remplit à l'écran, puis <b>« suivant »</b> l'enregistre.</p>
{fig(['t43_vocal_pied_a_pied'], [
 (1, 'Le bloc vocal affiche l\'<b>arbre en cours</b> et rappelle de dire « suivant » pour l\'enregistrer.'),
 (2, '<b>Diamètre</b> à 1,30 m (cm).'),
 (3, '<b>Hauteur</b> (m).'),
 (4, '<b>Tronçons de qualité</b> dictés (ici 6 m en CA) ; le reste jusqu\'à la hauteur est compté en « BI ».')], maxparts=1)}
<table><tr><th style="width:46%">Vous dites</th><th>L'application fait</th></tr>
<tr><td>« note chêne quarante-cinq par seize »</td><td>Arbre en cours : chêne, Ø 45 cm, hauteur 16 m</td></tr>
<tr><td>« note hauteur dix-huit virgule cinq » · « note diamètre cinquante »</td><td>Corrige un seul champ</td></tr>
<tr><td>« note tarif dix »</td><td>Tarif Chaudé 10 pour l'essence</td></tr>
<tr><td>« note tronçon six cé a » (ou « note cé a six »)</td><td>Tronçon de 6 m en CA, à la suite des précédents (du bas vers le haut)</td></tr>
<tr><td>« note tronçon quatre » puis « note cé bé »</td><td>Tronçon de 4 m, qualité donnée juste après</td></tr>
<tr><td>« note annule tronçon »</td><td>Retire le dernier tronçon</td></tr>
<tr><td>« suivant » (sans « note »)</td><td><b>Enregistre</b> l'arbre (le téléphone annonce son numéro et le suivant)</td></tr>
<tr><td>« précédent »</td><td>Rouvre le dernier arbre enregistré pour le corriger</td></tr>
<tr><td>« note annule »</td><td>Efface l'arbre en cours (s'il est vide : supprime le dernier enregistré)</td></tr>
<tr><td>« note annule arbre »</td><td>Supprime le dernier arbre enregistré</td></tr>
<tr><td>« note numéro deux cents »</td><td>Change le n° de l'arbre en cours</td></tr>
<tr><td>« terminé »</td><td>Quitte l'écran (refusé si un arbre est entamé)</td></tr></table>
<div class="warn">En dictée pied à pied, quand vous changez d'essence (« note hêtre trente par quatorze »), vérifiez le tarif affiché : l'arbre garde actuellement le tarif de l'essence précédente. Dites « note tarif … » si besoin.</div>
<h2>5.4 Hauteurs par classe et tronçons de qualité</h2>
{fig(['t33_hauteurs'], [
 ('H', 'Pour chaque essence × classe : la <b>hauteur</b> (m) appliquée aux tiges sans hauteur propre.'),
 ('T', f'{B("+ Ajouter un tronçon")} : tronçons de qualité du bas vers le haut (hauteur + qualité). Le reste jusqu\'à la hauteur totale est compté en « BI » (code réglable).'),
 ('!', 'La somme des tronçons ne peut pas dépasser la hauteur : un message rouge s\'affiche et la ligne n\'est pas enregistrée.')], w=50, maxparts=2)}
<div class="tip">Les tiges sans hauteur apparaissent « sans H » dans le récapitulatif et ne sont pas cubées : renseignez toutes les classes.</div>
<h2>5.5 Récapitulatif et tarifs</h2>
{fig(['t34_recap_pied','t35_tarifs'], [
 ('R', 'Récapitulatif : par essence et classe (tiges, hauteur moyenne, m³), par essence et qualité, par tranche de prix de la grille, puis par essence, qualité et classe. PDF et Excel en bas.'),
 ('T', f'{B("Tarifs Chaudé")} : tarif de toute l\'essence ou classe par classe (affichage en classes de diamètre ou de circonférence). Le tarif choisi devient celui proposé pour les tiges suivantes de l\'essence.')], w=50, maxparts=1)}

<h1>6. Sauvegarde, changement de téléphone, problèmes courants</h1>
<h2>6.1 Les bons réflexes</h2>
<ul><li><b>Sauvegarder</b> dès qu'il y a du réseau (accueil › ☁). Le Sheet est la copie de référence du bureau.</li>
<li><b>Mettre à jour depuis le Sheet</b> régulièrement : grilles de prix et statuts des ventes.</li>
<li><b>Paramètres › Exporter tout (JSON)</b> : copie de secours complète du téléphone, à déposer sur le Drive.</li></ul>
<h2>6.2 Changement de téléphone</h2>
<ol class="steps"><li>Demandez un nouveau lien au bureau en cas de téléphone perdu (une nouvelle clé remplace l'ancienne) ; sinon le même lien suffit.</li>
<li>Ouvrez le lien sur le nouveau téléphone, ajoutez l'application à l'écran d'accueil.</li>
<li>{B('⚙ Paramètres')} › {B('Récupérer mes lots depuis le Sheet')} : vos lots sauvegardés reviennent (les lots déjà présents ne sont pas modifiés).</li></ol>
<h2>6.3 Problèmes courants</h2>
<table><tr><th style="width:38%">Situation</th><th>Que faire</th></tr>
<tr><td>« Module PDF (ou Excel) non chargé »</td><td>Ouvrir une fois l'application avec du réseau : les modules se mettent en mémoire.</td></tr>
<tr><td>« Fond de carte non chargé »</td><td>La carte demande du réseau ; sans réseau, utilisez {B('📍 Relever la position')}.</td></tr>
<tr><td>« Accès à la position refusé »</td><td>Réglages du téléphone › Safari / Chrome › Position : autoriser.</td></tr>
<tr><td>Le mode vocal ne réagit pas</td><td>Commencez chaque phrase par « note ». Vérifiez le point rouge (pas en pause), l'accès au micro, et parlez plus près du téléphone.</td></tr>
<tr><td>Billon dicté absent du listing</td><td>Il n'a pas été enregistré : en cubage, il faut dire « billon suivant » (ou « suivant », « grume suivante ») après chaque billon.</td></tr>
<tr><td>Commentaire mal compris ou « commentaire libre indisponible »</td><td>Dites un mot de la liste (« note commentaire gelé » pour gélivure). Paramètres › Mode vocal › {B('Vérifier que les mots vocaux sont connus du moteur')} signale les mots jamais reconnus (voir 3.5).</td></tr>
<tr><td>« Reste à cuber » affiché sur le lot</td><td>Une grume cubée en plusieurs fois n'est pas terminée : Listing › « reste … m › » pour cuber le reste, ou abandonner le reste en chute (3.4).</td></tr>
<tr><td>Billon impossible à recouper ou à supprimer</td><td>Il est déjà vendu (lot client) ou recoupé : voir la colonne Statut du listing.</td></tr>
<tr><td>Client absent de la {B('Liste ▾')}</td><td>Tapez son nom : il sera proposé au bureau à l'envoi. Une fois validé, faites « Mettre à jour depuis le Sheet ».</td></tr>
<tr><td>Mot d'essence non reconnu</td><td>Seuls les mots du vocabulaire français du modèle passent (aulne → « aune », robinier → « acacia », laricio → « pin corse »). Ajouter des mots : Paramètres › Mode vocal, ou demander au bureau (colonne mots_vocaux du Sheet).</td></tr>
<tr><td>Le n° Xylolink manque (bordure rouge)</td><td>Le renseigner dans la fiche du lot avant de sauvegarder.</td></tr>
<tr><td>Lot en lecture seule</td><td>Lot envoyé à un collègue ou copie du Sheet : {B('Reprendre la main')} si c'est bien vous qui devez le modifier.</td></tr>
<tr><td>Échec de sauvegarde</td><td>Vérifier le réseau ; en cas de « clé refusée », redemander le lien de configuration au bureau. Le lot reste « à sauvegarder ».</td></tr>
<tr><td>Grille absente de la liste</td><td>Mettre à jour depuis le Sheet ; sinon demander au bureau de la publier comme grille commune.</td></tr>
<tr><td>Application affichée dans une ancienne version</td><td>Fermer complètement l'application puis la rouvrir avec du réseau ; comparer le numéro de version en bas de l'accueil.</td></tr></table>

<h1>7. Paramètres</h1>
{fig(['t50_parametres'], [
 ('a', '<b>Référentiel</b> : essences, qualités, pas et bornes des classes (reçus du Sheet).'),
 ('b', '<b>Saisie</b> : qualité du 1<sup>er</sup> billon (reprise ou vide), saisie du diamètre sur pied (boutons de classes ou au cm), code du reste de tige (BI).'),
 ('c', '<b>Mode vocal</b> : mots pour les essences et les qualités ; <b>mots de commentaire</b> sous la forme « mot dit = texte enregistré » (ex. « gelé = gélivure ») ou un mot seul ; <b>mot de départ</b> (« note » ; vide = aucun) ; rejet des phrases mal comprises (recommandé) ; annonce de l\'essence. {0} contrôle que tous ces mots sont connus du moteur.'.format(B('Vérifier que les mots vocaux sont connus du moteur'))),
 ('d', '<b>Synchronisation</b> : opérateur, adresse du script et clé (remplis par le lien de configuration), « Coller le lien de configuration ».'),
 ('e', '<b>Changement de téléphone</b>, <b>remise à zéro</b> du téléphone (supprime les lots du téléphone, pas ceux du Sheet), <b>copie de secours</b> (Exporter / Importer JSON).')], w=56, side=False)}
''')

tech = page('Cubage SBF — Guide du technicien terrain',
            'Cubage bord de route · Estimation sur pied · Lots clients · Mode vocal',
            f'Application version {VERSION} · {DATE}',
            ["L'essentiel en une page", "Installer l'application", "L'écran d'accueil", "Cubage bord de route (saisie, vocal, sous-lots, grilles, bordereaux, import d'inventaire)",
             "Lots clients (vente de billons)", "Estimation de bois sur pied", "Sauvegarde, changement de téléphone, problèmes courants", "Paramètres"],
            ''.join(T))
open(os.path.join(D, 'technicien.html'), 'w').write(tech)
print('technicien.html')

# =====================================================================================================
#                                     GUIDE ADMINISTRATIF BUREAU
# =====================================================================================================
U = []
U.append(f'''
<h1 class="first">L'essentiel en une page</h1>
<p>Le bureau ne cube pas : il <b>équipe</b> les téléphones, <b>diffuse</b> le référentiel (essences, qualités, grilles de prix), <b>consulte</b> les lots des techniciens, <b>valide</b> les ventes et édite les <b>bordereaux</b>. Tout passe par le même lien que les techniciens, ouvert avec une <b>clé bureau</b> sur un ordinateur (Chrome, Edge ou Safari).</p>
<table class="day"><tr><th style="width:30%">Besoin</th><th>Où dans l'application</th></tr>
<tr><td>Équiper un nouveau technicien</td><td>Bureau › {B('Clés d’accès et liens de configuration')} › créer la clé, envoyer le lien (chapitre 4)</td></tr>
<tr><td>Voir ce qui est cubé bord de route</td><td>Bureau › {B('Actualiser le stock')} puis {B('Stock bord de route')} (5.2)</td></tr>
<tr><td>Valider une vente proposée par un technicien</td><td>Bureau › {B('Ventes transmises par les téléphones')} › ouvrir › n° de facture Xylolink › {B('Valider la vente')} (5.3)</td></tr>
<tr><td>Éditer un bordereau propriétaire ou client</td><td>Bureau › {B('Lots des techniciens')} › ouvrir le lot › Sorties (5.4)</td></tr>
<tr><td>Vendre des billons de plusieurs techniciens</td><td>Bureau › {B('Lot client multi-techniciens')} (5.5)</td></tr>
<tr><td>Valider une essence, une qualité ou un client créé sur le terrain</td><td>Bureau › {B('Essences, qualités et clients proposés')} (5.7)</td></tr>
<tr><td>Tenir la liste des essences, qualités et clients</td><td>Bureau › {B('Référentiel commun')} (5.8)</td></tr>
<tr><td>Publier ou modifier une grille de prix</td><td>Bureau › {B('Grilles de prix communes')} (5.6)</td></tr>
<tr><td>Contrôle, rapprochement Xylolink</td><td>Google Sheet, onglet <code>BILLON</code> (chapitre 8)</td></tr></table>
<h2>Nouveautés des versions 82 à 117 (script 3.8)</h2>
<ul>
<li><b>Script du Sheet 3.8 à installer</b> (3.2) : 3.4 signal de référentiel modifié, 3.5 n° de facture, 3.6 liste commune de clients (onglet CLIENTS), 3.7 clients proposés, 3.8 gestion du référentiel depuis le Bureau.</li>
<li><b>Ventes</b> : tuile « Ventes transmises par les téléphones » ; le <b>n° de facture Xylolink</b> est obligatoire pour valider une vente (5.3).</li>
<li><b>Stock bord de route</b> : filtres par technicien, par lot et par plage de n° de grumes (5.2).</li>
<li><b>Référentiel commun</b> : essences, qualités et clients consultables, ajoutables, renommables et supprimables depuis le Bureau (5.8) ; les clients créés sur les téléphones sont proposés (5.7).</li>
<li><b>Terrain</b> : propriétaire à la place du chantier (colonne <code>chantier</code> du Sheet = propriétaire pour les lots de cubage), reste à cuber (longueur d'origine), recoupe depuis le listing (nouveau n° de plaquette tracé « ex n° grume.rang »), récapitulatif par grume des lots clients. Voir le guide technicien et le document « Ce qui change ».</li>
</ul>
<h3>Rappel des versions 63 à 81</h3>
<ul>
<li><b>Commentaire par billon</b> saisi au téléphone : nouvelle colonne <code>commentaire</code> dans l'onglet <code>BILLON</code> (créée d'elle-même), repris dans le listing, les exports et les bordereaux (colonne « Réduction »).</li>
<li><b>Longueur fixe par lot</b> (billons de même longueur) : réglage du lot, sans effet sur le Sheet.</li>
<li><b>Mode vocal</b> : mot de départ « note » et rejet des phrases mal comprises, réglables par téléphone.</li>
<li><b>Hors ligne</b> : les téléphones ouvrent leur propre copie de l'application si GitHub est en panne, supprimé ou lent ; une fois installée, l'application demande un stockage persistant (lots et application non effacés en cas de manque de place).</li>
<li><b>Import d'inventaire</b> : colonne Note/Commentaire reprise, CSV d'Excel français (virgule décimale) correctement lus.</li>
<li><b>Essences et qualités proposées</b> (v81, script 3.2) : les codes créés par les techniciens arrivent dans l'onglet PROPOSITIONS et se valident depuis l'espace Bureau (5.7).</li>
<li><b>Script 3.1</b> : numéros de grumes et de billons écrits en texte (le Sheet ne les transforme plus en dates). <b>Script 3.3</b> : la colonne « mots_vocaux » est reconnue ; à défaut, la colonne « libellé » des onglets ESSENCES / QUALITES sert de mot vocal.</li>
<li>Script du Sheet à installer : <b>version {SCRIPT}</b> (3.2).</li></ul>

<h1>1. Comment c'est construit</h1>
<table><tr><th style="width:22%">Élément</th><th style="width:26%">Où</th><th>Rôle</th></tr>
<tr><td>Application (PWA)</td><td>GitHub Pages, dépôt <code>appli-source/cubage-sbf</code></td><td>Fichiers statiques : <code>index.html</code>, <code>app.js</code> (écrans, métier), <code>docs.js</code> (bordereaux PDF, logo, mentions légales), <code>calc.js</code> (cubage, barème Chaudé), <code>voice.js</code> (mode vocal), <code>sw.js</code> (copie hors ligne), <code>sync.gs</code> (script du Sheet).</td></tr>
<tr><td>Google Sheet « Cubage SBF - Référentiel et lots »</td><td>Drive du compte <code>appli@sbforets.fr</code></td><td>Référentiel commun et copie de tous les lots, billons, ventes et clés.</td></tr>
<tr><td>Script Apps Script (<code>sync.gs</code>)</td><td>Extensions › Apps Script du Sheet, déployé en application web</td><td>Point d'entrée des téléphones : référentiel, sauvegarde des lots, ventes, clés, stock.</td></tr>
<tr><td>Téléphones et postes</td><td>Mémoire du navigateur (IndexedDB)</td><td>Chaque téléphone travaille hors ligne ; un lot appartient au téléphone qui l'a créé, le Sheet en reçoit une copie à chaque sauvegarde.</td></tr></table>
<div class="tip"><b>Principe :</b> le téléphone est maître de ses lots, le Sheet est la copie de référence du bureau. Le bureau lit, valide les ventes et diffuse le référentiel, mais ne modifie pas un lot de technicien (sauf son point GPS, 5.4).</div>
<div class="tip">Si GitHub est indisponible, les téléphones déjà installés continuent de fonctionner sur leur copie ; seules les nouvelles installations, les mises à jour et le premier téléchargement du modèle vocal en dépendent.</div>

<h1>2. Le poste bureau</h1>
{fig(['b01_accueil'], [
 (1, f'La tuile <b>Bureau</b> apparaît sur l\'accueil dès qu\'une <b>clé bureau</b> est configurée (lien de configuration de rôle « bureau »).'),
 (2, f'{B("⚙ Paramètres")} : adresse du script, clé bureau, maintenance du Sheet (clé maître uniquement).')], w=140, side=False)}
<p>Le poste bureau peut aussi cuber et créer des lots comme un téléphone ; en pratique on l'utilise pour l'espace Bureau.</p>
{fig(['b02_bureau'], [
 (1, f'{B("Actualiser le stock")} : lit le Sheet (réseau). La date de la dernière lecture est affichée ; la lecture est conservée sur le poste.'),
 (2, f'<b>Stock bord de route</b> : tous les billons connus, en stock, proposés, vendus, recoupés (5.2).'),
 (3, f'<b>Ventes transmises par les téléphones</b> : lots clients à valider (n° de facture) et historique (5.3).'),
 (4, f'<b>Lots des techniciens</b> : copies en lecture seule des lots, bordereaux (5.4).'),
 (5, f'<b>Lot client multi-techniciens</b> : vente regroupant plusieurs téléphones et chantiers (5.5).'),
 (6, f'<b>Référentiel commun</b> : essences, qualités et clients (5.8).'),
 (7, f'<b>Essences, qualités et clients proposés</b> par les téléphones (5.7).'),
 (8, f'<b>Clés d\'accès et liens de configuration</b> (chapitre 4).'),
 (9, f'<b>Grilles de prix communes</b> (5.6).')], w=140, side=False)}

<h1>3. Mise en place et mise à jour du script du Sheet</h1>
<h2>3.1 Première installation</h2>
<ol class="steps"><li>Dans le Sheet : <b>Extensions › Apps Script</b>, coller le contenu de <code>sync.gs</code>, renseigner les constantes <code>CLE</code> (clé terrain maître) et <code>CLE_BUREAU</code> (clé bureau maître) avec des valeurs longues et secrètes.</li>
<li><b>Déployer › Nouveau déploiement › Application web</b> : exécuter en tant que <b>moi</b>, accès <b>Tout le monde</b>. Copier l'URL qui se termine par <code>/exec</code>.</li>
<li>Sur le poste bureau : ouvrir l'application, {B('⚙ Paramètres')} › <b>URL du script</b> et <b>Clé bureau</b>, puis {B('Charger le référentiel du Sheet')}.</li></ol>
<h2>3.2 Mettre à jour le script</h2>
<ol class="steps"><li>Récupérer <code>sync.gs</code> sur GitHub (la première ligne indique la version), remplacer le code dans Apps Script en <b>conservant vos constantes</b> <code>CLE</code> / <code>CLE_BUREAU</code>.</li>
<li><b>Déployer › Gérer les déploiements › crayon › Version : Nouvelle version › Déployer</b>. L'adresse <code>/exec</code> ne change pas : rien à refaire sur les téléphones.</li></ol>
<p>Version {SCRIPT} : gestion du référentiel commun (essences, qualités, clients), n° de facture des ventes, liste de clients, propositions, signal de référentiel modifié ; actions <code>setLotGps</code> (point GPS placé depuis le bureau), <code>propositions</code> / <code>setProposition</code> (codes proposés, 5.7) ; identifiants écrits en texte. Les colonnes ajoutées par l'application (<code>proprietaire</code>, <code>grille_client</code>, <code>prix_vente_m3</code>, <code>montant_vente</code>, <code>commentaire</code>…) se créent d'elles-mêmes à la première sauvegarde.</p>
<h2>3.3 Mettre à jour l'application</h2>
<p>Une modification sur la branche <code>main</code> du dépôt est en ligne en une à deux minutes. Les téléphones la prennent à la prochaine ouverture avec du réseau ; le numéro de version est en bas de l'accueil (actuellement {VERSION}). Le mode vocal (<code>vendor/</code>, <code>models/</code>) n'est téléchargé qu'à la première activation.</p>

<h1>4. Clés d'accès et équipement des téléphones</h1>
<p>Une clé = un technicien (rôle <b>terrain</b>) ou un poste bureau (rôle <b>bureau</b> : valide les ventes, voit tout le stock). L'opérateur attaché à la clé est <b>imposé</b> sur toutes les lignes que ce téléphone envoie : c'est lui qui identifie l'auteur d'un lot.</p>
{fig(['b09_cles'], [
 ('a', '<b>Nouvelle clé</b> : opérateur (prénom ou initiales), rôle terrain ou bureau, {0}. Chaque clé existante est listée avec son état, sa date et sa note.'.format(B('Créer la clé et le lien'))),
 ('b', f'(capture suivante) Le <b>lien de configuration</b> s\'affiche aussitôt : {B("Copier")} puis l\'envoyer au technicien (mail, WhatsApp). Il l\'ouvre une fois dans Safari/Chrome puis ajoute l\'application à l\'écran d\'accueil ; sur iPhone il peut devoir coller le lien dans Paramètres.')], w=140, side=False)}
{fig(['b11_cle_creee'], None, 'Fenêtre affichée après la création d\'une clé : le lien de configuration à copier et envoyer.', w=120)}
<table><tr><th style="width:28%">Bouton</th><th>Effet</th></tr>
<tr><td>{B('Lien de configuration')}</td><td>Réaffiche le lien d'une clé (technicien qui réinstalle).</td></tr>
<tr><td>{B('Remplacer (tél. perdu)')}</td><td>Crée une nouvelle clé pour le même opérateur et désactive l'ancienne ; envoyer le nouveau lien. Sur le nouveau téléphone : Paramètres › « Récupérer mes lots depuis le Sheet ».</td></tr>
<tr><td>{B('Désactiver')}</td><td>La clé ne permet plus ni sauvegarde ni mise à jour ; les données déjà sur le Sheet restent.</td></tr></table>
<div class="warn">Les clés maîtres du script (<code>CLE</code>, <code>CLE_BUREAU</code>) fonctionnent toujours et ne figurent pas dans l'onglet CLES : ne les diffusez pas. Seule la clé bureau maître peut vider les lots du Sheet.</div>

<h1>5. L'espace Bureau</h1>
<h2>5.1 Actualiser</h2>
<p>Commencez toujours par {B('Actualiser le stock')} : l'espace Bureau travaille sur la dernière lecture du Sheet, conservée sur le poste (consultation possible hors ligne).</p>
<h2>5.2 Stock bord de route</h2>
{fig(['b03_stock'], [
 (1, '<b>Technicien</b> : billons d\'un seul opérateur.'),
 (2, '<b>Lot</b> : un lot précis (n° Xylolink, propriétaire, date, opérateur, nombre de billons).'),
 (3, '<b>Plage de n° de grumes</b> (de … à …) ; {0} remet les filtres à zéro.'.format(B('Effacer')))], w=140, side=False)}
<p>Restent disponibles la <b>recherche</b> libre, le <b>statut</b> (en stock, proposés, vendus, recoupés, tous) et l'<b>essence</b>. Un tronçon de recoupe apparaît avec son origine (« 704 (de 704.1) »).</p>
<p>Les billons sont groupés par chantier avec volume et montant (grilles propriétaire des lots). Le total filtré s'affiche au-dessus du tableau.</p>
<h2>5.3 Valider les ventes (ventes transmises par les téléphones)</h2>
{fig(['b05_lot_client_detail'], [
 (1, '<b>N° de facture Xylolink</b> : <b>obligatoire</b> pour valider la vente ; il est enregistré sur le Sheet (onglet LOT_CLIENT, script 3.5 ou plus).'),
 (2, f'{B("Valider la vente")}.'),
 (3, f'{B("Annuler ce lot client")} : ses billons repassent en stock.')], w=140, side=False)}
{fig(['b04_lots_clients'], [
 ('✓', f'Liste des ventes transmises (client, date, référence, opérateur, volume, montant). Ouvrez un lot « transmis au bureau » : volumes, prix, récapitulatif et billons avec leur origine (n° Xylolink, propriétaire). {B("Valider la vente")} le passe en <b>vente validée</b> ; {B("Annuler ce lot client")} l\x27annule (ses billons repassent en stock).')], w=140, side=False)}
<ul><li>Le technicien voit le nouveau statut à sa prochaine « Mise à jour depuis le Sheet ».</li>
<li>Un billon vendu ne peut plus être proposé à un autre client ni supprimé sur le téléphone ; dans le stock il passe en « vendus ».</li></ul>
<h2>5.4 Lots des techniciens et bordereaux</h2>
{fig(['b07_lots_techniciens'], [
 ('↻', f'{B("Charger / Actualiser les lots depuis le Sheet")} : copies en <b>lecture seule</b> des lots de tous les téléphones, avec l\'opérateur, le type (cubage, sur pied), la commune et le volume. Recherche par opérateur, n° Xylolink, chantier, commune, date.')], w=140, side=False)}
{fig(['b08_lot_technicien'], [
 (1, f'{B("Bordereau propriétaire")} : sans prix ou avec prix HT de la grille propriétaire.'),
 (2, f'{B("Bordereau client")} : choisir le sous-lot (ou tout le lot), sans ou avec prix HT de la grille client.'),
 (3, f'Point GPS : le placer ou le corriger sur la carte depuis le bureau ; il est écrit sur le Sheet (script {SCRIPT}).')], w=140, side=False)}
<p>Listing, récapitulatif (achat / vente / marge), PDF interne et Excel sont aussi disponibles. Les modèles de bordereaux sont présentés au chapitre 7.</p>
<div class="warn">Un point GPS placé depuis le bureau est écrasé si le technicien renvoie ensuite ce lot depuis son téléphone (qui n'a pas le point). À faire sur des lots terminés, ou demander au technicien de le placer lui-même.</div>
<h2>5.5 Lot client multi-techniciens (ramasse)</h2>
<p>Après chargement des lots des techniciens : Bureau › {B('Lot client multi-techniciens')} › {B('+ Nouveau lot client')}. Même fonctionnement qu'au téléphone : client, référence, grille, puis billons par numéro, plage ou liste collée, recoupes et prix de vente. Les billons peuvent venir de <b>plusieurs téléphones et plusieurs chantiers</b> ; le lot est validé directement avec la clé bureau.</p>
{fig(['b14_ramasse_lot'], [
 ('⇄', 'Lot « Scierie du Perche » : billons 501 à 506 du lot de QS (Forêt de Bercé) et 125 à 130 du lot de JCF (Bois de la Touche). La colonne <b>Origine</b> indique le chantier de chaque billon.')], w=140, side=False)}
{pdfpage('bordereau_ramasse-1', 'Bordereau de réception d\'une ramasse : le chantier d\'origine de chaque billon et un lien GPS par chantier figurent sur le document.')}
<h2>5.6 Grilles de prix communes</h2>
{fig(['b10_grilles_communes'], None, None, w=140)}
{fig(['b12_grille_commune'], [
 ('a', f'Liste des grilles (type grumes ou sur pied, nombre de lignes). {B("+ Grille commune grumes")} ou {B("+ Grille commune sur pied")} pour en créer une.'),
 ('b', f'Édition : nom, puis une ligne par règle ({B("+ Ligne")}) — essence, qualité, Ø min, Ø max, prix €/m³. {B("Enregistrer sur le Sheet")} publie la grille (onglet GRILLES) ; les techniciens la reçoivent à leur prochaine mise à jour.')], w=140, side=False)}
<p>Une grille commune supprimée disparaît des téléphones ; les copies faites dans les lots sont conservées. Convention de nommage conseillée : « Achat … » pour les grilles propriétaire, « Vente … » pour les grilles client, avec l'année ou la saison.</p>

<h2>5.7 Essences, qualités et clients proposés</h2>
<p>Un technicien peut créer un code d'essence ou de qualité sur son téléphone (bouton + du lot) ou taper un <b>client</b> absent de la liste commune (sous-lot, lot client). À la sauvegarde ou à l'envoi, la proposition est inscrite dans l'onglet <code>PROPOSITIONS</code> du Sheet et apparaît ici.</p>
{fig(['b15_propositions'], [
 (1, 'Mot(s) pour le mode vocal (facultatif) : la façon de dire le code (ex. « chêne rouge » pour CHR).'),
 (2, f'{B("Valider (ajouter au Sheet)")} : le code entre dans l\'onglet ESSENCES ou QUALITES ; tous les téléphones le reçoivent à leur prochaine mise à jour. {B("Refuser")} le laisse propre au téléphone qui l\'a créé (faute de frappe, doublon).')], w=140, side=False)}

<h2>5.8 Référentiel commun</h2>
{fig(['b16_referentiel'], [
 (1, 'Onglets <b>Essences</b>, <b>Qualités</b>, <b>Clients</b> (avec leur nombre).'),
 (2, '<b>Ajouter</b> : code (ou nom du client) et, pour les essences et qualités, les mots du mode vocal.'),
 (3, f'{B("Ajouter")} : écrit directement dans l\'onglet du Sheet.'),
 (4, '<b>Rechercher</b> dans la liste ; chaque ligne se renomme ou se modifie (✓) ou se supprime (✕).')], w=140, side=False)}
<ul><li>Renommer ou supprimer un code ne modifie pas les lots déjà saisis.</li>
<li>Les téléphones reçoivent les changements avec « Mettre à jour depuis le Sheet » ; l'accueil des téléphones signale qu'une mise à jour est disponible.</li>
<li>Mots vocaux : uniquement des mots connus du moteur de reconnaissance (les téléphones ont un bouton de vérification dans Paramètres › Mode vocal).</li></ul>

<h1>6. Grilles de prix : propriétaire, client, catalogue et copies</h1>
<table><tr><th style="width:24%">Niveau</th><th>Grille propriétaire (achat)</th><th>Grille client (vente)</th></tr>
<tr><td>Lot de cubage</td><td>Une grille : catalogue ou copie propre au lot</td><td>Une grille par défaut : catalogue ou copie propre au lot</td></tr>
<tr><td>Sous-lot</td><td>—</td><td>Facultative, l'emporte sur celle du lot</td></tr>
<tr><td>Lot client</td><td>—</td><td>Grille du client, copiée dans le lot et complétée</td></tr></table>
<ul><li><b>Catalogue</b> = grilles communes du Sheet ou créées sur le téléphone. Modifier une grille du catalogue change tous les lots qui l'utilisent sans copie.</li>
<li><b>Copie</b> = grille figée dans le lot (ou le sous-lot), modifiable pour ce lot seul : prix négocié, client qui change son prix lot par lot.</li>
<li><b>Règles</b> : essence, qualité, Ø min / Ø max (bornes incluses, sur le diamètre cubé), prix €/m³ ; champ vide = toutes ; la ligne la plus précise l'emporte. Un billon sans règle apparaît « sans prix » et n'entre pas dans les montants.</li></ul>

<h1>7. Bordereaux propriétaire et client</h1>
<table><tr><th style="width:18%"></th><th>Bordereau de cubage propriétaire</th><th>Bordereau de réception client</th></tr>
<tr><td>Depuis</td><td>Un lot de cubage (téléphone ou Bureau › Lots des techniciens)</td><td>Un sous-lot, tout le lot, ou un lot client</td></tr>
<tr><td>Numéro</td><td>BC-AAAAMMJJ-xxxx</td><td>BR-AAAAMMJJ-xxxx</td></tr>
<tr><td>Cartouche</td><td>Propriétaire, chantier, n° chantier, commune, date, opérateur, GPS (lien), grille</td><td>Client, sous-lot ou référence, chantier(s), date, suivi SBF, grille, GPS (lien)</td></tr>
<tr><td>Contenu</td><td colspan="2">Récapitulatif par essence et qualité (billons, Ø moyen, longueur moyenne, m³) ; prix par tranche de diamètre si la grille distingue les grosseurs ; listing des billons avec réductions et commentaires ; signatures.</td></tr>
<tr><td>Prix</td><td>Sans prix, ou prix HT de la grille propriétaire</td><td>Sans prix, ou prix HT de la grille client</td></tr></table>
{pdfpage('bordereau_proprietaire-1', 'Bordereau de cubage propriétaire avec prix HT (page 1).')}
<p>Chaque page porte le logo, le titre, le numéro et, en pied, les mentions légales (SAS au capital de 75 000 €, Loirecopark 1, 72500 Vaas, RCS Le Mans 900 809 633, SIRET 900 809 633 00010, TVA FR84 900 809 633). Textes, logo et mise en page : <code>docs.js</code> (constante <code>SBF</code>, image <code>SBF_LOGO</code>). Les bordereaux ne valent pas facture ; les prix sont hors taxes ; le cubage est sur écorce.</p>

<h1>8. Les données dans le Sheet</h1>
<p>Chaque sauvegarde d'un lot remplace toutes ses lignes (clé <code>lot_id</code>) dans les onglets ci-dessous. Les en-têtes sont créés automatiquement : <b>ne pas renommer les colonnes</b>.</p>
<table><tr><th style="width:26%">Onglet</th><th>Contenu</th></tr>
<tr><td><code>ESSENCES</code>, <code>QUALITES</code></td><td>Codes (colonne A) ; colonne <code>mots_vocaux</code> facultative pour le mode vocal (« chêne, chêne rouge »).</td></tr>
<tr><td><code>CLASSES</code></td><td>Pas des classes de diamètre (5 cm), bornes, pas particulier par essence.</td></tr>
<tr><td><code>GRILLES</code></td><td>code, nom, type (grumes / pied), essence, qualité, Ø min, Ø max, prix €/m³ — une ligne par règle.</td></tr>
<tr><td><code>DMM</code></td><td>Barème Chaudé (facultatif ; sinon barème intégré).</td></tr>
<tr><td><code>PROPOSITIONS</code></td><td>Codes et clients créés sur le terrain : type, code, operateur, lot, date, statut (propose / valide / refuse), traite_le.</td></tr>
<tr><td><code>CLIENTS</code></td><td>Liste commune des clients (nom), proposée aux téléphones (bouton « Liste ▾ »).</td></tr>
<tr><td><code>CLES</code></td><td>cle, operateur, role, actif, cree_le, note (géré depuis Bureau › Clés).</td></tr>
<tr><td><code>LOT</code>, <code>SOUS_LOT</code></td><td>Une ligne par lot (type, n° Xylolink, chantier, propriétaire, commune, GPS, date, opérateur, grilles, volume) ; sous-lots.</td></tr>
<tr><td><code>GRUME</code> / <code>BILLON</code></td><td>Une ligne par billon : n°, essence, qualité, longueur, diamètre, réductions, dimensions cubées, volume, sous-lot, client, prix propriétaire et client, <b>commentaire</b>, date et heure de saisie.</td></tr>
<tr><td><code>ARBRE</code> / <code>TRONCON</code></td><td>Estimation sur pied : tiges et tronçons de qualité.</td></tr>
<tr><td><code>RECOUPE</code></td><td>Billons recoupés dans un lot client.</td></tr>
<tr><td><code>LOT_JSON</code></td><td>Copie intégrale de chaque lot (sert à « Récupérer mes lots » et « Lots des techniciens »). <b>Ne pas modifier.</b></td></tr>
<tr><td><code>LOT_CLIENT</code> / <code>LOT_CLIENT_LIGNE</code></td><td>Lots clients (client, date, référence, statut, validation, volume, montant) et une ligne par billon vendu.</td></tr></table>
<div class="tip">Pour un contrôle ou un rapprochement Xylolink, l'onglet <code>BILLON</code> suffit : une ligne par billon avec n° de chantier, volume et prix.</div>

<h1>9. Maintenance et dépannage</h1>
<h2>9.1 Sauvegardes</h2>
<ul><li>Le Sheet est sauvegardé avec le Drive SBF (historique des versions + sauvegarde journalière). Faire une copie du Sheet avant toute purge.</li>
<li>Chaque téléphone peut produire une copie de secours complète : Paramètres › <b>Exporter tout (JSON)</b> ; <b>Importer un fichier JSON</b> la restaure.</li></ul>
<h2>9.2 Vider les lots du Sheet (fin de saison, test)</h2>
<p>Paramètres du poste bureau (clé bureau <b>maître</b> uniquement) › Maintenance du Sheet › <b>Vider les lots du Sheet…</b>, confirmation par le mot VIDER. Supprime lots, billons et lots clients de tous les téléphones sur le Sheet ; essences, qualités, grilles et clés sont conservées. Les téléphones gardent leurs lots et les renverront à leur prochaine sauvegarde : les archiver ou les supprimer sur les téléphones avant.</p>
<h2>9.3 Dépannage</h2>
<table><tr><th style="width:36%">Situation</th><th>Vérification / action</th></tr>
<tr><td>« clé refusée »</td><td>Clé désactivée ou mal copiée : Bureau › Clés d'accès ; renvoyer le lien de configuration.</td></tr>
<tr><td>« Script du Sheet à mettre à jour »</td><td>Le script déployé est plus ancien que l'application : 3.2.</td></tr>
<tr><td>Un technicien ne voit pas une grille commune</td><td>Vérifier l'onglet GRILLES (type, code identique sur toutes les lignes) ; lui faire « Mettre à jour depuis le Sheet ».</td></tr>
<tr><td>Lot en double ou écrasé</td><td>Lot envoyé à un collègue puis modifié sur les deux téléphones : le dernier sauvegardé écrase l'autre (même <code>lot_id</code>). Décider qui a la main (« Reprendre la main »), ou fusionner le lot reçu.</td></tr>
<tr><td>Billon « indisponible » lors d'une vente</td><td>Déjà vendu ou recoupé dans un autre lot client : Stock bord de route › Vendus / Recoupés.</td></tr>
<tr><td>Bordereau sans la grille attendue</td><td>Le bordereau propriétaire ignore les grilles client (et inversement) : vérifier les grilles du lot ou du sous-lot.</td></tr>
<tr><td>Point GPS absent d'un bordereau</td><td>Le placer sur la carte (téléphone ou Bureau › Lots des techniciens).</td></tr>
<tr><td>Téléphone sur une ancienne version</td><td>Le faire ouvrir avec du réseau puis fermer/rouvrir ; comparer le numéro en bas de l'accueil (actuellement {VERSION}).</td></tr>
<tr><td>Mode vocal qui n'enregistre rien</td><td>Chaque phrase doit commencer par le mot de départ (« note » par défaut, Paramètres du téléphone).</td></tr>
<tr><td>Modifier le logo ou les mentions légales</td><td><code>docs.js</code> du dépôt : constante <code>SBF</code> (textes) et <code>SBF_LOGO</code> (image).</td></tr></table>
''')
bur = page('Cubage SBF — Guide administratif bureau',
           'Clés d’accès · Espace Bureau · Ventes · Bordereaux · Référentiel · Maintenance',
           f'Application version {VERSION} · Script Sheet version {SCRIPT} · {DATE}',
           ["L'essentiel en une page", "Comment c'est construit", "Le poste bureau", "Mise en place et mise à jour du script du Sheet",
            "Clés d'accès et équipement des téléphones", "L'espace Bureau (stock, ventes, lots des techniciens, ramasse, grilles)",
            "Grilles de prix : propriétaire, client, catalogue et copies", "Bordereaux propriétaire et client", "Les données dans le Sheet", "Maintenance et dépannage"],
           ''.join(U))
open(os.path.join(D, 'bureau.html'), 'w').write(bur)
print('bureau.html')
