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

const argv = process.argv.slice(2);
const idxExpect = argv.indexOf('--expect-commit');
const EXPECT_COMMIT = idxExpect >= 0 ? argv[idxExpect + 1] : null;
// L'URL est le premier argument qui n'est ni une option, ni la VALEUR d'une
// option. Sans cette seconde condition, `--expect-commit abc123` sans URL
// faisait prendre « abc123 » pour l'adresse du site : les six contrôles
// échouaient alors sur une URL inventée, en annonçant que le site public
// était cassé. La CI passe toujours les deux arguments, donc le défaut ne
// s'était jamais montré (TODO_AUDIT.md G21).
const urlArg = argv.find((a, i) => !a.startsWith('--') && i !== idxExpect + 1);
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

async function recupererTexte(chemin) {
  const reponse = await fetch(new URL(chemin, BASE_URL));
  const corps = await reponse.text();
  return { statut: reponse.status, corps };
}

(async () => {
  console.log(`Verification du site public : ${BASE_URL}`);

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
  // Son absence ne veut donc pas dire « le site est cassé », elle veut dire
  // « ce site n'est pas servi par ce workflow » — typiquement, GitHub Pages
  // est configuré sur « Deploy from a branch » plutôt que « GitHub Actions ».
  //
  // Mesuré (TODO_AUDIT.md G21) : le site public sert bien le contenu de main,
  // y compris des commits dont le déploiement a été ANNULÉ — donc l'artefact
  // produit par la CI est ignoré. Ce cas est signalé comme une CONFIGURATION
  // à corriger, pas comme un échec de test : un garde-fou qui crie au loup à
  // chaque exécution finit par n'être plus lu (c'est déjà arrivé ici, cf.
  // l'onglet « Équipe B » périmé mentionné plus haut).
  //
  // En CI, avec --expect-commit, l'absence redevient un ÉCHEC DUR : à ce
  // moment-là on vient de déployer, l'artefact doit être en ligne.
  await test('version.json présent et contient un commit exploitable', async () => {
    const { statut, corps } = await recupererTexte('version.json');
    if (statut !== 200 && !EXPECT_COMMIT) {
      configurationsASignaler.push(
        `version.json absent du site public (HTTP ${statut}). Ce fichier est généré par le job ` +
        '« deploy » du workflow : son absence signifie que GitHub Pages ne sert PAS l\'artefact ' +
        'de la CI. À vérifier dans Settings → Pages → Source, qui doit être « GitHub Actions » ' +
        'et non « Deploy from a branch ». Tant que ce réglage n\'est pas corrigé, aucun ' +
        'déploiement de la CI n\'atteint le public et rien ne permet de savoir quel commit est en ligne.');
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
