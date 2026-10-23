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
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-analyse.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-prets.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-contrats.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-generation-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-centre-formation.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-composition.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-condition-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-competitions.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-effectif-adverse.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-sauvegarde.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-temps.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-agenda.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-semaine-entrainement.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-jour-match.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-direction.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-evenements.js'), 'utf8'))(global.window);
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

// --- BUG-RM-002 : deux onglets sur la même carrière -----------------------
// Deux chargements de la même sauvegarde = deux onglets : chacun a son objet
// saison et la révision lue avec lui.
test('BUG-RM-002 : un onglet resté sur un état ancien n\'écrase plus la progression d\'un autre', () => {
  store = {};
  const depart = RMClub.nouvelleSaison(creerRng(21), 'Club Deux Onglets');
  depart.clubJoueur.budget = 401000;
  assert.ok(RMClub.sauvegarderSaison(depart));
  const ongletA = RMClub.chargerSaison();
  const ongletB = RMClub.chargerSaison();
  ongletA.clubJoueur.budget = 501000;
  assert.ok(RMClub.sauvegarderSaison(ongletA), 'le premier onglet enregistre normalement');
  assert.ok(RMClub.sauvegardeModifieeAilleurs(ongletB), 'l\'onglet B doit savoir que la carrière a changé ailleurs');
  assert.ok(!RMClub.sauvegardeModifieeAilleurs(ongletA));
  ongletB.clubJoueur.budget = 391000;
  assert.strictEqual(RMClub.sauvegarderSaison(ongletB), false, 'l\'état périmé de B doit être refusé');
  assert.strictEqual(RMClub.raisonEchecSauvegarde(), 'conflit');
  assert.strictEqual(JSON.parse(store['rugbyManager.club.v1']).clubJoueur.budget, 501000,
    'la progression de A est intacte');
  // A continue de jouer et d'enregistrer : aucune gêne pour l'onglet à jour.
  ongletA.clubJoueur.budget = 520000;
  assert.ok(RMClub.sauvegarderSaison(ongletA));
  assert.strictEqual(RMClub.raisonEchecSauvegarde(), null);
  // B rechargé (la page recharge sur la version récente) reprend la main.
  const ongletB2 = RMClub.chargerSaison();
  assert.strictEqual(ongletB2.clubJoueur.budget, 520000);
  assert.ok(RMClub.sauvegarderSaison(ongletB2));
  assert.strictEqual(RMClub.sauvegarderSaison(ongletA), false, 'A est à son tour périmé');
});

test('BUG-RM-002 : sauvegardes existantes, nouvelle carrière et stockage plein', () => {
  // Sauvegarde d'avant la révision : elle se charge et s'enregistre.
  store = {};
  const ancienne = RMClub.nouvelleSaison(creerRng(22), 'Club Ancien');
  store['rugbyManager.club.v1'] = JSON.stringify(ancienne);
  const chargee = RMClub.chargerSaison();
  assert.ok(chargee, 'une sauvegarde sans révision reste chargeable');
  assert.ok(RMClub.sauvegarderSaison(chargee));
  // Une nouvelle carrière créée volontairement s'enregistre sans condition.
  const neuve = RMClub.nouvelleSaison(creerRng(23), 'Club Neuf');
  assert.ok(RMClub.sauvegarderSaison(neuve));
  assert.strictEqual(RMClub.sauvegarderSaison(chargee), false, 'l\'ancienne carrière ne remplace pas la nouvelle');
  // Stockage plein : échec distinct d'un conflit, révision inchangée.
  const setItem = global.localStorage.setItem;
  global.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    assert.strictEqual(RMClub.sauvegarderSaison(neuve), false);
    assert.strictEqual(RMClub.raisonEchecSauvegarde(), 'stockage');
  } finally { global.localStorage.setItem = setItem; }
  assert.ok(RMClub.sauvegarderSaison(neuve), 'le stockage revenu, la même session enregistre de nouveau');
});

// --- BUG-RM-003 : incidents successifs ---------------------------------------
test('BUG-RM-003 : un second incident ne remplace plus le secours du premier', () => {
  store = {};
  const premiere = RMClub.nouvelleSaison(creerRng(31), 'Premiere Carriere');
  RMClub.sauvegarderSaison(premiere);
  const brut1 = JSON.parse(store['rugbyManager.club.v1']);
  brut1.version = 99; // format futur
  store['rugbyManager.club.v1'] = JSON.stringify(brut1);
  assert.strictEqual(RMClub.chargerSaison(), null);
  assert.ok(RMClub.consulterAvertissementChargement().secoursConserve);
  // Recharger la même sauvegarde illisible ne crée pas de doublon.
  RMClub.chargerSaison();
  assert.strictEqual(RMClub.listerSecours().length, 1);

  const seconde = RMClub.nouvelleSaison(creerRng(32), 'Seconde Carriere');
  RMClub.sauvegarderSaison(seconde);
  store['rugbyManager.club.v1'] = store['rugbyManager.club.v1'].slice(0, 500); // JSON tronqué
  assert.strictEqual(RMClub.chargerSaison(), null);

  const copies = RMClub.listerSecours();
  assert.strictEqual(copies.length, 2, 'deux incidents, deux copies');
  assert.strictEqual(copies[0].club, 'Premiere Carriere');
  assert.strictEqual(copies[0].raison, 'version_incoherente'); // format plus récent que le jeu
  assert.strictEqual(copies[1].raison, 'json_invalide');
  assert.strictEqual(JSON.parse(RMClub.lireSecours(copies[0].cle)).clubJoueur.nom, 'Premiere Carriere',
    'la première copie reste lisible et intacte');
  assert.ok(RMClub.lireSecours(copies[1].cle).includes('Seconde Carriere'));
  assert.strictEqual(RMClub.lireSecours('rugbyManager.club.v1'), null, 'seules les copies listées se lisent');
});

test('BUG-RM-003 : une copie non écrite n\'est jamais annoncée comme conservée', () => {
  store = {};
  store['rugbyManager.club.v1'] = '{"version": 3, "clubJoueur": ';
  const setItem = global.localStorage.setItem;
  global.localStorage.setItem = (k, v) => {
    if (k.indexOf('secours') !== -1) throw new Error('QuotaExceededError');
    setItem(k, v);
  };
  try { assert.strictEqual(RMClub.chargerSaison(), null); } finally { global.localStorage.setItem = setItem; }
  const avert = RMClub.consulterAvertissementChargement();
  assert.strictEqual(avert.secoursConserve, false, 'stockage plein : la copie n\'existe pas, on ne le cache pas');
  assert.strictEqual(RMClub.listerSecours().length, 0);
  // Copies au maximum : aucune n'est écrasée, l'échec est dit.
  store = {};
  for (let i = 0; i < 6; i++) {
    store['rugbyManager.club.v1'] = `{"incident": ${i}`;
    RMClub.chargerSaison();
  }
  const copies = RMClub.listerSecours();
  assert.strictEqual(copies.length, 5);
  assert.strictEqual(RMClub.lireSecours(copies[0].cle), '{"incident": 0', 'la plus ancienne copie est intacte');
  assert.strictEqual(RMClub.consulterAvertissementChargement().secoursConserve, false);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : P0-2 confirmé — une sauvegarde peut être silencieusement perdue.');
} else {
  console.log('OK : aucune sauvegarde n\'est perdue sans copie de secours ni avertissement.');
}
