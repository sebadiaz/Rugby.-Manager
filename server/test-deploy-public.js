// Audit P0-5 (TODO_AUDIT.md) : le site public (GitHub Pages) a été observé
// différent du contenu de "main" — cause trouvée : .github/workflows/
// deploy-pages.yml déclenchait un déploiement en production sur CHAQUE push
// vers une branche de session Claude, pas seulement "main" (aucune condition
// sur le job "deploy"). Ce script vérifie la VRAIE URL publique après
// déploiement (pas seulement les fichiers sources) : présence du sélecteur
// d'équipe et de tous les onglets attendus, présence d'un identifiant de
// version (docs/version.json, généré pendant le déploiement), et chargement
// sans erreur des scripts principaux réellement référencés par index.html.
//
// Les onglets vérifiés doivent suivre la navigation RÉELLE : ce fichier a
// longtemps exigé un onglet « Équipe B » supprimé depuis P1-19, ce qui
// faisait échouer le job `verify` de CHAQUE déploiement alors que le site
// était correctement publié. Un test de déploiement périmé est pire qu'un
// test absent : il crie au loup à chaque mise en ligne, et on finit par ne
// plus regarder.
//
// Usage :
//   node server/test-deploy-public.js [URL] [--expect-commit <sha>]
// Sans argument : vérifie https://sebadiaz.github.io/Rugby.-Manager/ sans
// exiger de SHA précis (utile pour un contrôle manuel). Avec --expect-commit,
// exige que version.json corresponde exactement au commit déployé (utilisé
// par le job "verify" de la CI juste après un déploiement réel sur main).
'use strict';

const assert = require('assert');

// L'URL est le premier argument qui n'est ni une option, ni la VALEUR d'une
// option. Cette analyse a été fausse DEUX fois, dans les deux sens :
//   - avant G21 : `--expect-commit abc123` sans URL faisait prendre
//     « abc123 » pour l'adresse du site ; les six contrôles échouaient sur
//     une URL inventée en annonçant que le site public était cassé ;
//   - le correctif de G21 : sans `--expect-commit`, `indexOf` renvoie -1 et
//     l'indice exclu devenait 0, donc l'URL passée seule était ignorée en
//     silence et le script vérifiait le site de production à la place.
// La CI passe toujours les deux arguments : aucun des deux défauts ne s'est
// jamais montré là où on regardait. D'où la fonction pure ci-dessous, et les
// deux contrôles qui l'exercent en tête de la campagne (TODO_AUDIT.md G21).
function analyserArguments(argv) {
  const idxExpect = argv.indexOf('--expect-commit');
  const expectCommit = idxExpect >= 0 ? argv[idxExpect + 1] || null : null;
  // -1 quand l'option est absente : n'exclut alors AUCUN indice réel.
  const idxValeurOption = idxExpect >= 0 ? idxExpect + 1 : -1;
  const url = argv.find((a, i) => !a.startsWith('--') && i !== idxValeurOption) || null;
  return { url, expectCommit };
}

const { url: urlArg, expectCommit: EXPECT_COMMIT } = analyserArguments(process.argv.slice(2));
const BASE_URL = (urlArg || 'https://sebadiaz.github.io/Rugby.-Manager/').replace(/\/?$/, '/');

let nbTests = 0;
// Problèmes de CONFIGURATION du déploiement — signalés, pas transformés en
// échec de test : ils ne se corrigent pas dans le dépôt (cf. le cas
// version.json plus bas), et un garde-fou toujours rouge finit par n'être
// plus lu.
const configurationsASignaler = [];
async function test(nom, fn) {
  nbTests++;
  try {
    await fn();
    console.log(`OK   ${nom}`);
  } catch (e) {
    console.error(`FAIL ${nom}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// Le CDN de GitHub Pages répond 503 (avec un corps de page d'erreur) pendant
// qu'il propage un nouveau déploiement. Mesuré sur le run 32634140367 : `test`
// et `deploy` verts, version.json déjà à jour — donc l'étape d'attente sort
// aussitôt — mais `js/club-revenus-competition.js` répondait encore 503 vingt
// secondes après. `verify` a échoué sur un déploiement parfaitement bon.
//
// On réessaie donc les statuts TRANSITOIRES, et eux seuls : un fichier
// réellement absent répond 404, un script cassé répond 200 avec un mauvais
// contenu — aucun des deux n'est masqué ici. Les réessais sont affichés, pour
// qu'un CDN durablement instable reste visible au lieu d'être avalé.
const STATUTS_TRANSITOIRES = new Set([429, 500, 502, 503, 504]);
const REESSAIS_MAX = 5;
const ATTENTE_ENTRE_REESSAIS_MS = 3000;

async function recupererTexte(chemin) {
  let dernier = null;
  for (let essai = 0; essai <= REESSAIS_MAX; essai += 1) {
    const reponse = await fetch(new URL(chemin, BASE_URL));
    const corps = await reponse.text();
    dernier = { statut: reponse.status, corps };
    if (!STATUTS_TRANSITOIRES.has(reponse.status)) return dernier;
    if (essai < REESSAIS_MAX) {
      console.log(`     ... ${chemin} : HTTP ${reponse.status} (propagation du CDN ?), nouvel essai ${essai + 1}/${REESSAIS_MAX}`);
      await new Promise((r) => setTimeout(r, ATTENTE_ENTRE_REESSAIS_MS));
    }
  }
  return dernier;
}

(async () => {
  console.log(`Verification du site public : ${BASE_URL}`);

  // Contrôles purs, sans réseau : ils exercent l'analyse des arguments sur
  // les deux formes d'appel réellement utilisées. Ils sont en tête parce que,
  // si elle est fausse, TOUS les contrôles suivants portent sur le mauvais
  // site — et le disent avec aplomb.
  await test('l\'URL passée seule est bien celle qui est vérifiée', async () => {
    assert.deepStrictEqual(analyserArguments(['http://127.0.0.1:8099']),
      { url: 'http://127.0.0.1:8099', expectCommit: null },
      'une URL passée sans --expect-commit doit être retenue telle quelle');
    assert.deepStrictEqual(analyserArguments([]),
      { url: null, expectCommit: null },
      'sans argument, aucune URL : l\'appelant retombe sur le site de production');
  });

  await test('--expect-commit ne peut pas être pris pour l\'URL du site', async () => {
    assert.deepStrictEqual(analyserArguments(['--expect-commit', 'deadbeefcafe']),
      { url: null, expectCommit: 'deadbeefcafe' },
      'la valeur de --expect-commit ne doit jamais servir d\'adresse');
    assert.deepStrictEqual(
      analyserArguments(['http://127.0.0.1:8099', '--expect-commit', 'deadbeefcafe']),
      { url: 'http://127.0.0.1:8099', expectCommit: 'deadbeefcafe' },
      'forme utilisée par la CI : URL puis --expect-commit');
    assert.deepStrictEqual(
      analyserArguments(['--expect-commit', 'deadbeefcafe', 'http://127.0.0.1:8099']),
      { url: 'http://127.0.0.1:8099', expectCommit: 'deadbeefcafe' },
      'ordre inverse : le résultat doit être le même');
  });

  let indexHtml = '';
  await test('index.html se charge (HTTP 200, contenu non vide)', async () => {
    const { statut, corps } = await recupererTexte('index.html');
    assert.strictEqual(statut, 200, `attendu HTTP 200, obtenu ${statut}`);
    assert.ok(corps.length > 1000, 'index.html semble anormalement court');
    indexHtml = corps;
  });

  // Ce test cherchait `data-onglet="equipeb"` — un onglet SUPPRIMÉ depuis
  // P1-19 : l'Équipe B et les Espoirs ne sont plus des onglets séparés, ils
  // se choisissent dans le sélecteur d'équipe commun à tous les écrans. Le
  // test n'avait jamais été mis à jour, et faisait donc échouer le job
  // `verify` de CHAQUE déploiement — alors que `test` et `deploy`, eux,
  // passaient. On vérifie désormais ce qui existe réellement.
  await test('le sélecteur d\'équipe commun est présent sur le site public', () => {
    assert.ok(/id="selEquipeContexte"/.test(indexHtml),
      'sélecteur d\'équipe introuvable — c\'est LUI qui donne accès à l\'Équipe B et aux Espoirs depuis P1-19');
  });

  // Les onglets réellement attendus. Une régression de navigation (onglet
  // disparu d'un déploiement) doit se voir ici, sur le site public.
  const ONGLETS_ATTENDUS = [
    'dashboard', 'effectif', 'composition', 'tactique', 'entrainement',
    'transferts', 'personnel', 'classement', 'calendrier', 'monde',
    'finances', 'medical', 'stats',
  ];
  await test('tous les onglets attendus sont présents sur le site public', () => {
    const absents = ONGLETS_ATTENDUS.filter((o) => !indexHtml.includes(`data-onglet="${o}"`));
    assert.strictEqual(absents.length, 0, `onglet(s) absent(s) du HTML public : ${absents.join(', ')}`);
  });

  await test('Classement et Calendrier sont bien DEUX onglets distincts (P1-33)', () => {
    // Renommé « Compétitions » (plan A) : l'écran couvre désormais classement,
    // équipes, statistiques et règles de n'importe quel championnat.
    assert.ok(indexHtml.includes('>Compétitions<'), 'libellé "Compétitions" introuvable dans le HTML public');
    assert.ok(indexHtml.includes('>Calendrier<'), 'libellé "Calendrier" introuvable dans le HTML public');
    assert.ok(!/data-onglet="autresclubs"/.test(indexHtml),
      'l\'ancien onglet "Autres clubs" est encore là : le site public est en retard sur main');
  });

  // `version.json` n'est écrit QUE par le job « deploy » de
  // .github/workflows/deploy-pages.yml : il n'existe nulle part dans le dépôt.
  // Sa présence ou son absence dit donc QUI a publié la version en ligne.
  //
  // Mesuré (TODO_AUDIT.md G21) : DEUX publieurs visent le même site.
  //   1. le constructeur de branche de GitHub (workflow « dynamic »
  //      pages-build-deployment), déclenché par le push, en ligne en une
  //      minute, qui publie docs/ SANS attendre le moindre test ;
  //   2. l'artefact de ce workflow, publié après les tests (~8 min), et qui
  //      est le seul à contenir version.json.
  // Le dernier arrivé gagne. version.json absent = la version en ligne vient
  // du constructeur de branche, donc du code qui n'a pas été testé.
  //
  // Attention à ne pas relire ce contrôle à l'envers : version.json présent
  // prouve que l'artefact a gagné CETTE fois, pas que le constructeur de
  // branche a cessé de publier. C'est l'erreur de raisonnement corrigée le
  // 23/08 dans TODO_AUDIT.md G21.
  //
  // Ce cas est signalé comme une CONFIGURATION à corriger, pas comme un échec
  // de test : un garde-fou qui crie au loup à chaque exécution finit par
  // n'être plus lu (c'est déjà arrivé ici, cf. l'onglet « Équipe B » périmé
  // mentionné plus haut).
  //
  // En CI, avec --expect-commit, l'absence redevient un ÉCHEC DUR : à ce
  // moment-là on vient de déployer, l'artefact doit être en ligne.
  await test('version.json présent et contient un commit exploitable', async () => {
    const { statut, corps } = await recupererTexte('version.json');
    if (statut !== 200 && !EXPECT_COMMIT) {
      configurationsASignaler.push(
        `version.json absent du site public (HTTP ${statut}). Ce fichier n'est écrit que par le ` +
        'job « deploy » du workflow : son absence signifie que la version EN LIGNE ne vient pas ' +
        'de l\'artefact testé, mais du constructeur de branche de GitHub, qui publie docs/ une ' +
        'minute après le push SANS attendre les tests. À corriger dans Settings → Pages → Source, ' +
        'qui doit être « GitHub Actions » et non « Deploy from a branch » : tant que les deux ' +
        'publient, du code non testé peut rester en ligne dès que les tests échouent ou sont annulés.');
      return;
    }
    assert.strictEqual(statut, 200, `version.json absent du site public (HTTP ${statut}) — aucun moyen de savoir quel commit est réellement déployé`);
    const donnees = JSON.parse(corps);
    assert.ok(donnees && typeof donnees.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(donnees.commit),
      `version.json.commit absent ou invalide : ${JSON.stringify(donnees)}`);
    if (EXPECT_COMMIT) {
      assert.ok(donnees.commit === EXPECT_COMMIT || EXPECT_COMMIT.startsWith(donnees.commit) || donnees.commit.startsWith(EXPECT_COMMIT),
        `commit deployé (${donnees.commit}) ne correspond pas au commit attendu (${EXPECT_COMMIT})`);
    }
  });

  await test('les scripts principaux référencés par index.html se chargent sans erreur', async () => {
    assert.ok(indexHtml, 'index.html non chargé, impossible de lister ses scripts');
    const srcs = [...indexHtml.matchAll(/<script src="([^"]+\.js)"><\/script>/g)].map((m) => m[1]);
    assert.ok(srcs.length >= 10, `trop peu de balises <script src> détectées (${srcs.length}) — sélecteur probablement cassé`);
    const echecs = [];
    for (const src of srcs) {
      const { statut, corps } = await recupererTexte(src);
      if (statut !== 200 || corps.length < 20 || /^\s*<(!doctype|html)/i.test(corps)) {
        echecs.push(`${src} (HTTP ${statut}, ${corps.length} octets)`);
      }
    }
    assert.strictEqual(echecs.length, 0, `scripts en échec : ${echecs.join(', ')}`);
  });

  console.log(`\n${nbTests} test(s) exécuté(s) sur ${BASE_URL}.`);
  if (configurationsASignaler.length) {
    console.log('\nÀ CORRIGER HORS DU DÉPÔT (réglages, pas code) :');
    for (const c of configurationsASignaler) console.log(`  - ${c}`);
  }
  if (process.exitCode) {
    console.error('ECHEC : le site public ne correspond pas à ce qui est attendu.');
  } else if (configurationsASignaler.length) {
    console.log('OK : le site public charge correctement, mais un réglage de déploiement reste à corriger (ci-dessus).');
  } else {
    console.log('OK : le site public correspond au commit attendu et charge correctement.');
  }
})();
