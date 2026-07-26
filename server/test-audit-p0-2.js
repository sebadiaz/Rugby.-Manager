// Audit P0-2 (TODO_AUDIT.md) : chargerSaison() traitait toute sauvegarde
// dont le "version" ne correspondait plus à VERSION_SAUVEGARDE (ou dont le
// JSON était corrompu) comme "aucune carrière" — sans message, sans copie de
// secours. Le joueur, voyant un écran de création vierge, créait alors une
// nouvelle carrière qui écrasait irrémédiablement l'ancienne sauvegarde
// (même clé localStorage). Démontré avec une vraie carrière de plusieurs
// saisons (server/test-audit-p0-2.js, scénario "avant correctif" reproduit
// ci-dessous puis vérifié corrigé).
//
// Usage : node server/test-audit-p0-2.js
'use strict';

const assert = require('assert');

let store;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

global.window = global;
global.window.RugbyEngine = require('../docs/rugby-engine.js');
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-personnel.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-objectif.js'), 'utf8'))(global.window);
const RMClub = global.window.RMClub;

function creerRng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try {
    fn();
    console.log(`OK   ${nom}`);
  } catch (e) {
    console.error(`FAIL ${nom}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const CLE_CLUB = 'rugbyManager.club.v1';
const CLE_SECOURS = 'rugbyManager.club.secours.v1';
const CLE_AVERTISSEMENT = 'rugbyManager.club.avertissement.v1';

test('P0-2a : une sauvegarde de version différente n\'est jamais perdue — une copie de secours est conservée', () => {
  store = {};
  const saison = RMClub.nouvelleSaison(creerRng(1), 'Ma Carriere Precieuse');
  RMClub.avancerSaison(creerRng(2), saison);
  RMClub.avancerSaison(creerRng(3), saison);
  RMClub.sauvegarderSaison(saison);
  const brutOriginal = store[CLE_CLUB];
  assert.ok(brutOriginal.length > 1000, 'scénario de test : la carrière doit contenir de vraies données');

  // Simule une sauvegarde d'un format différent (avant ou après une future
  // évolution du format) : le symptôme est le même quel que soit le sens.
  const brut = JSON.parse(store[CLE_CLUB]);
  brut.version = 1;
  store[CLE_CLUB] = JSON.stringify(brut);

  const resultat = RMClub.chargerSaison();
  assert.strictEqual(resultat, null, 'sans migration connue depuis la version 1, chargerSaison doit rester prudent (pas de données à moitié migrées)');

  // La preuve du correctif : les données ne sont pas perdues, elles sont
  // sauvegardées à part.
  assert.ok(store[CLE_SECOURS], 'une copie de secours doit être conservée sous une clé DISTINCTE de la sauvegarde principale');
  const secours = JSON.parse(store[CLE_SECOURS]);
  assert.strictEqual(secours.clubJoueur.nom, 'Ma Carriere Precieuse', 'la copie de secours doit contenir les vraies données de la carrière perdue');
  assert.strictEqual(secours.numero, 3, 'la copie de secours doit refléter la progression réelle (3 saisons), pas une carrière vierge');

  const avert = RMClub.consulterAvertissementChargement();
  assert.ok(avert, 'un avertissement exploitable par l\'UI doit être disponible');
  assert.strictEqual(avert.raison, 'version_sans_migration');

  // Preuve finale : créer une "nouvelle" carrière après cet échec ne doit
  // JAMAIS écraser la copie de secours (clé distincte).
  const nouvelleCarriere = RMClub.nouvelleSaison(creerRng(9), 'Nouvelle Carriere');
  RMClub.sauvegarderSaison(nouvelleCarriere);
  const secoursApres = JSON.parse(store[CLE_SECOURS]);
  assert.strictEqual(secoursApres.clubJoueur.nom, 'Ma Carriere Precieuse',
    'créer une nouvelle carrière ne doit jamais écraser la copie de secours de l\'ancienne');
});

test('P0-2b : un JSON corrompu en localStorage est aussi sauvegardé en secours plutôt que silencieusement perdu', () => {
  store = {};
  store[CLE_CLUB] = '{ "version": 2, "clubJoueur": { "nom": "Cassé"'; // JSON tronqué
  const resultat = RMClub.chargerSaison();
  assert.strictEqual(resultat, null);
  assert.ok(store[CLE_SECOURS] && store[CLE_SECOURS].includes('Cassé'), 'le JSON brut (même invalide) doit être conservé tel quel en secours');
  const avert = RMClub.consulterAvertissementChargement();
  assert.strictEqual(avert.raison, 'json_invalide');
});

test('P0-2c : une sauvegarde de la bonne version mais au schéma incomplet (effectif manquant) est détectée, pas silencieusement acceptée', () => {
  store = {};
  const saison = RMClub.nouvelleSaison(creerRng(2), 'Club Corrompu');
  delete saison.clubJoueur.effectif; // schéma structurellement invalide
  RMClub.sauvegarderSaison(saison);
  const resultat = RMClub.chargerSaison();
  assert.strictEqual(resultat, null, 'un schéma structurellement invalide ne doit jamais être retourné comme une saison jouable');
  assert.ok(store[CLE_SECOURS], 'une copie de secours doit être conservée même pour un schéma invalide');
  assert.strictEqual(RMClub.consulterAvertissementChargement().raison, 'schema_invalide');
});

test('P0-2d : une sauvegarde valide et à jour continue de se charger normalement (aucune régression)', () => {
  store = {};
  const saison = RMClub.nouvelleSaison(creerRng(3), 'Club Normal');
  RMClub.sauvegarderSaison(saison);
  const resultat = RMClub.chargerSaison();
  assert.ok(resultat);
  assert.strictEqual(resultat.clubJoueur.nom, 'Club Normal');
  assert.strictEqual(store[CLE_SECOURS], undefined, 'un chargement réussi ne doit jamais générer de copie de secours ni d\'avertissement');
  assert.strictEqual(RMClub.consulterAvertissementChargement(), null);
});

test('P0-2e : effacerAvertissementChargement permet à l\'UI de ne montrer le message qu\'une seule fois', () => {
  store = {};
  store[CLE_CLUB] = 'pas du JSON valide {{{';
  RMClub.chargerSaison();
  assert.ok(RMClub.consulterAvertissementChargement());
  RMClub.effacerAvertissementChargement();
  assert.strictEqual(RMClub.consulterAvertissementChargement(), null);
});

test('P0-2f : saisonEstValide rejette une structure incohérente et accepte une saison réelle', () => {
  store = {};
  const saison = RMClub.nouvelleSaison(creerRng(4), 'Club Valide');
  assert.strictEqual(RMClub.saisonEstValide(saison), true);
  assert.strictEqual(RMClub.saisonEstValide(null), false);
  assert.strictEqual(RMClub.saisonEstValide({}), false);
  assert.strictEqual(RMClub.saisonEstValide({ clubJoueur: { effectif: [] }, adversaires: [], calendrier: [], classement: {} }), false, 'un effectif vide ne doit pas être considéré valide');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : P0-2 confirmé — une sauvegarde peut être silencieusement perdue.');
} else {
  console.log('OK : aucune sauvegarde n\'est perdue sans copie de secours ni avertissement.');
}
