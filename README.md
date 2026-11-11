# Cubage SBF — application terrain

Fichiers à déposer tels quels sur un hébergement HTTPS statique (OVH, GitHub Pages…) :
index.html, app.js, docs.js, calc.js, voice.js, voice-worklet.js, manifest.json, sw.js, plus les dossiers vendor/ et models/
(mode vocal : moteur de reconnaissance et modèle français, chargés seulement à la première activation).

Installation sur téléphone : ouvrir l'URL dans Safari (iPhone) ou Chrome (Android), puis
« Partager > Sur l'écran d'accueil » / « Ajouter à l'écran d'accueil ». Ouvrir l'application une
première fois en ligne : elle se met ensuite en cache et fonctionne sans réseau.
Elle ne dépend plus alors de l'hébergement : si GitHub est en panne, supprimé ou lent (plus de 3 s), le téléphone
ouvre sa propre copie (sw.js) ; GitHub ne sert qu'aux mises à jour, aux nouvelles installations et au premier
téléchargement du modèle vocal. Le numéro « Version » en bas de l'accueil est celui de app.js?v= dans index.html.

Synchronisation Google Sheet : coller sync.gs dans Extensions > Apps Script du Sheet cible,
déployer en application web (Exécuter en tant que moi, accès tout le monde), copier l'URL /exec
dans Paramètres > URL du script. Onglets de référentiel : ESSENCES, QUALITES, CLASSES, GRILLES, DMM.
Script version 3.0 : action setLotGps (point GPS d'un lot placé depuis le bureau) ; les colonnes
proprietaire, grille_client (LOT), prix_vente_m3, montant_vente (BILLON) s'ajoutent d'elles-mêmes.

## Interface bureau (v119, script 3.9)

Sur un ordinateur (écran de 900 px et plus), l'application s'élargit : tuiles en grille, listes sur deux colonnes, champs plus compacts.
Avec une clé bureau, **Bureau › Lots des techniciens** charge tous les lots du Sheet ; un lot s'ouvre en consultation, puis
**« Modifier depuis le bureau »** le rend modifiable sur ce poste (fiche du lot, sous-lots, grilles, saisie grume par grume) et ouvre le
**Tableau de saisie** : une ligne par billon (n° grume, essence, qualité, L en m, Ø en cm, réductions, sous-lot, commentaire, m³),
modification directe, Entrée = ligne suivante, « + Nouvelle grume », « + billon », suppression ; billons vendus ou recoupés verrouillés.
Lots sur pied (v120) : **Tableau de saisie sur pied** avec deux tableaux — les tiges (n° si pied à pied, essence, Ø à 1,30 m, classe,
effectif, tarif Chaudé, hauteur, tronçons « 4 CA + 6 CB », sous-lot, m³) et les hauteurs par classe (hauteur et tronçons par défaut
des tiges sans hauteur propre). Une ligne sans diamètre bloque l'enregistrement sur le Sheet.
« Enregistrer sur le Sheet » envoie la correction ; l'opérateur du lot reste celui du technicien. Le tableau existe aussi sur les lots
du poste lui-même dès que l'écran est large.

Révisions : chaque lot porte un numéro de révision (colonnes rev, modifie_par, modifie_le, edit_bureau de l'onglet LOT). Un envoi parti
d'une révision dépassée est refusé avec la version du Sheet ; l'application fusionne alors les deux versions élément par élément
(grumes, tiges, recoupes, sous-lots, champs du lot) : ce qui n'a changé que d'un côté est repris, et si le même élément a changé des deux
côtés la version du bureau l'emporte. À l'ouverture avec du réseau, le téléphone du technicien reprend les corrections du bureau
(et fusionne s'il a lui-même des saisies non sauvegardées). Une application antérieure à la v119 ne peut plus écraser un lot corrigé
au bureau : le Sheet lui demande de se mettre à jour. La correction depuis le bureau est refusée tant que le script n'est pas en 3.9.

## Prix et bordereaux (docs.js)

Un lot de cubage porte deux grilles : la grille **propriétaire** (achat) et la grille **client** (vente) ;
chacune est une grille du catalogue (Sheet) ou une copie propre au lot, modifiable. Un sous-lot peut avoir sa propre
grille client. Le récapitulatif affiche achat, vente et marge ; les documents n'utilisent que la grille de leur destinataire :

- **Bordereau de cubage propriétaire** (bouton du lot) : récap essence/qualité, prix par tranche de diamètre si la
  grille en a, listing des billons, signatures ; avec ou sans prix HT.
- **Bordereau de réception client** : depuis un sous-lot du lot de cubage ou depuis un lot client du bureau ; même contenu,
  grille client ; avec ou sans prix HT.

Logo et mentions légales (SIRET, TVA) sont intégrés dans docs.js (en-tête et pied de chaque page). Le point GPS du lot
se relève au téléphone ou se place sur la carte (fond OpenStreetMap, réseau nécessaire, aussi depuis le bureau sur un lot
de technicien) ; il figure dans les bordereaux sous forme de lien Google Maps cliquable.

## Mode vocal

Bouton « 🎤 Mode vocal » sur les écrans de saisie ; « pause » / « reprise » ; bip aigu = enregistré, bip grave = non compris.

- Estimation sur pied, mode « pied à pied, diamètre seul » avec les boutons de classes : « chêne quarante »
  (essence + classe), « trente-cinq » (classe seule, essence précédente conservée), « chêne » seul (change
  l'essence sans compter), « annule » (retire la dernière tige).
- Cubage bord de route : un billon se dicte d'une traite, dans l'ordre essence, qualité, longueur, diamètre :
  « chêne, cé a, dix par cinquante » = chêne, CA, 10 m, Ø 50 ; « huit vingt par quarante-deux » = 8,20 m, Ø 42.
  Essence et qualité omises = celles du billon précédent. « par » sépare longueur et diamètre ; sans « par », le
  dernier nombre est le diamètre et ce qui précède la longueur (« huit » = 8 m, « huit vingt » = 8,20, « huit et demi »,
  « huit virgule vingt-cinq » ; « mètres » accepté). Une longueur dictée seule (« neuf par ») attend son diamètre.
  Chaque billon dicté s'ajoute à la grume en cours ; « suivante » passe à la grume suivante (numéro automatique),
  « numéro cent douze » force un numéro, « annule » retire le dernier billon (ou rouvre la grume qu'on vient de clore).
  Le téléphone relit chaque billon à voix haute. Les qualités se disent lettre par lettre (CA → « cé a »,
  CXX → « cé double ixe », ST → « esse té », PA → « pé a ») ; « avivé » se dit tel quel (le modèle entend « avive ») ;
  colonne « mots_vocaux » de l'onglet QUALITES ou Paramètres pour d'autres mots.

- Reconnaissance 100 % locale (logiciel libre Vosk/Kaldi en WebAssembly, licence Apache 2.0) : aucun son
  n'est envoyé sur Internet. Première activation avec du réseau : téléchargement du modèle (42 Mo), conservé
  ensuite sur le téléphone.
- Noms parlés des essences : codes courants déjà connus (voice.js) ; pour les autres, ajouter dans l'onglet
  ESSENCES du Sheet une colonne « mots_vocaux » (ex. « chêne, chêne rouge »), ou renseigner le champ
  Paramètres > Mode vocal. Seuls les mots du vocabulaire du modèle sont reconnus (aulne → « aune »,
  robinier → « acacia », laricio → « pin corse »).
- Conseils terrain : écran laissé allumé (verrouillé, le micro coupe), oreillette ou micro Bluetooth
  recommandé par vent fort, essence courante affichée en permanence.
