// Audit P0-5 (TODO_AUDIT.md) : le site public (GitHub Pages) a été observé
// différent du contenu de "main" — cause trouvée : .github/workflows/
// deploy-pages.yml déclenchait un déploiement en production sur CHAQUE push
// vers une branche de session Claude, pas seulement "main" (aucune condition
// sur le job "deploy"). Ce script vérifie la VRAIE URL publique après
// déploiement (pas seulement les fichiers sources) : présence des onglets
// Équipe B / Monde, présence d'un identifiant de version (docs/version.json,
// généré pendant le déploiement), et chargement sans erreur des scripts
// principaux réellement référencés par index.html.
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
const urlArg = argv.find((a) => !a.startsWith('--'));
const BASE_URL = (urlArg || 'https://sebadiaz.github.io/Rugby.-Manager/').replace(/\/?$/, '/');
const idxExpect = argv.indexOf('--expect-commit');
const EXPECT_COMMIT = idxExpect >= 0 ? argv[idxExpect + 1] : null;

let nbTests = 0;
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

  await test('onglet "Équipe B" présent sur le site public', () => {
    assert.ok(/data-onglet="equipeb"/.test(indexHtml), 'bouton onglet Équipe B introuvable dans le HTML public');
    assert.ok(indexHtml.includes('Équipe B'), 'libellé "Équipe B" introuvable dans le HTML public');
  });

  await test('onglet "Monde" présent sur le site public', () => {
    assert.ok(/data-onglet="monde"/.test(indexHtml), 'bouton onglet Monde introuvable dans le HTML public');
    assert.ok(indexHtml.includes('>Monde<'), 'libellé "Monde" introuvable dans le HTML public');
  });

  await test('version.json présent et contient un commit exploitable', async () => {
    const { statut, corps } = await recupererTexte('version.json');
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
  if (process.exitCode) {
    console.error('ECHEC : le site public ne correspond pas à ce qui est attendu.');
  } else {
    console.log('OK : le site public correspond au commit attendu et charge correctement.');
  }
})();
