#!/bin/sh
# Copie de test du mode vocal, à déposer dans main sous test/ sans toucher à l'application en service :
# base de données, cache et nom d'application distincts pour cohabiter avec la version en service sur un même téléphone.
set -e
cd "$(dirname "$0")"
rm -rf test && mkdir -p test/vendor/vosk-browser test/models
cp index.html app.js docs.js calc.js voice.js voice-worklet.js manifest.json sw.js test/
cp vendor/vosk-browser/vosk.js vendor/vosk-browser/LICENSE-NOTICE.md test/vendor/vosk-browser/
cp models/vosk-model-small-fr-0.22.tar.gz models/README.md test/models/
sed -i "s/indexedDB.open('cubage-sbf',1)/indexedDB.open('cubage-sbf-test',1)/" test/app.js
sed -i "s/const PREFIX='cubage-sbf-v';/const PREFIX='cubage-sbf-test-v';/" test/sw.js
sed -i 's/"name": "Cubage SBF"/"name": "Cubage SBF — test vocal"/; s/"short_name": "Cubage"/"short_name": "Cubage test"/' test/manifest.json
sed -i 's#<title>Cubage SBF</title>#<title>Cubage SBF — test vocal</title>#' test/index.html
echo "test/ généré"
