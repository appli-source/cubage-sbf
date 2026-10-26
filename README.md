# Cubage SBF — application terrain

Fichiers à déposer tels quels sur un hébergement HTTPS statique (OVH, GitHub Pages…) :
index.html, app.js, calc.js, voice.js, voice-worklet.js, manifest.json, sw.js, plus les dossiers vendor/ et models/
(mode vocal : moteur de reconnaissance et modèle français, chargés seulement à la première activation).

Installation sur téléphone : ouvrir l'URL dans Safari (iPhone) ou Chrome (Android), puis
« Partager > Sur l'écran d'accueil » / « Ajouter à l'écran d'accueil ». Ouvrir l'application une
première fois en ligne : elle se met ensuite en cache et fonctionne sans réseau.

Synchronisation Google Sheet : coller sync.gs dans Extensions > Apps Script du Sheet cible,
déployer en application web (Exécuter en tant que moi, accès tout le monde), copier l'URL /exec
dans Paramètres > URL du script. Onglets de référentiel : ESSENCES, QUALITES, CLASSES, GRILLES, DMM.

## Mode vocal (estimation sur pied, pointage par classes de diamètre)

Sur l'écran de saisie en mode « pied à pied, diamètre seul » avec les boutons de classes, le bouton
« 🎤 Mode vocal » lance la reconnaissance : « chêne quarante » (essence + classe), « trente-cinq »
(classe seule, essence précédente conservée), « chêne » seul (change l'essence sans compter),
« annule » (retire la dernière tige), « pause » / « reprise ». Bip aigu = tige comptée, bip grave = non compris.

- Reconnaissance 100 % locale (logiciel libre Vosk/Kaldi en WebAssembly, licence Apache 2.0) : aucun son
  n'est envoyé sur Internet. Première activation avec du réseau : téléchargement du modèle (42 Mo), conservé
  ensuite sur le téléphone.
- Noms parlés des essences : codes courants déjà connus (voice.js) ; pour les autres, ajouter dans l'onglet
  ESSENCES du Sheet une colonne « mots_vocaux » (ex. « chêne, chêne rouge »), ou renseigner le champ
  Paramètres > Mode vocal. Seuls les mots du vocabulaire du modèle sont reconnus (aulne → « aune »,
  robinier → « acacia », laricio → « pin corse »).
- Conseils terrain : écran laissé allumé (verrouillé, le micro coupe), oreillette ou micro Bluetooth
  recommandé par vent fort, essence courante affichée en permanence.
