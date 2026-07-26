// Audit P0-1 (TODO_AUDIT.md) : les compteurs d'identifiants (compteurJoueurId,
// compteurMessageId, compteurPersonnelId, compteurId) sont des variables de
// module (`let x = 1`) réinitialisées à CHAQUE exécution du script — donc à
// chaque rechargement de page (F5). Une sauvegarde existante, elle, PERSISTE
// dans localStorage avec des identifiants déjà élevés : après un rechargement,
// toute nouvelle création (joueur signé, message, personnel embauché, club
// adverse régénéré après une montée/descente) repart d'un compteur à 1 et
// peut donc entrer en collision avec un identifiant déjà utilisé.
//
// Ce fichier simule un VRAI rechargement de page : deux exécutions FRAÎCHES et
// INDÉPENDANTES de club.js (les variables de module repartent bien à zéro,
// contrairement à un simple appel de fonction dans le même processus) qui
// partagent le MÊME localStorage — exactement le scénario navigateur réel.
//
// Usage : node server/test-audit-p0-1.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const RugbyEngine = require('../docs/rugby-engine.js');
const clubSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club.js'), 'utf8');
// club-personnel.js (TODO_AUDIT.md P2-10) : domaine extrait de club.js
// (personnel/compteurPersonnelId) — doit être chargé dans le même contexte
// à chaque instance fraîche pour que embaucherPersonnel/resynchronisation
// fonctionnent, exactement comme dans docs/index.html.
const clubPersonnelSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-personnel.js'), 'utf8');
const clubObjectifSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-objectif.js'), 'utf8');
const clubAnalyseSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-analyse.js'), 'utf8');
const clubPretsSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-prets.js'), 'utf8');
const clubContratsSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-contrats.js'), 'utf8');
const clubEquipeBSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8');
const clubTransfertsSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-transferts.js'), 'utf8');
const clubTransfertsIntlSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8');
const clubGenerationJoueursSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-generation-joueurs.js'), 'utf8');
const clubCentreFormationSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-centre-formation.js'), 'utf8');
const clubCompositionSrc = fs.readFileSync(path.join(__dirname, '../docs/js/club-composition.js'), 'utf8');

// Charge une instance TOTALEMENT NEUVE de club.js (nouveau contexte JS, donc
// compteurJoueurId/compteurMessageId/compteurPersonnelId/compteurId repartent
// à 1) — c'est la seule façon fidèle de simuler un F5 en Node : un simple
// second appel de fonction dans le MÊME processus ne réinitialiserait pas les
// variables de module (`let` capturées par la closure de l'IIFE).
function chargerInstanceFraiche() {
  const ctx = {};
  ctx.window = ctx;
  ctx.RugbyEngine = RugbyEngine;
  new Function('window', clubSrc)(ctx);
  new Function('window', clubPersonnelSrc)(ctx);
  new Function('window', clubObjectifSrc)(ctx);
  new Function('window', clubAnalyseSrc)(ctx);
  new Function('window', clubPretsSrc)(ctx);
  new Function('window', clubContratsSrc)(ctx);
  new Function('window', clubEquipeBSrc)(ctx);
  new Function('window', clubTransfertsSrc)(ctx);
  new Function('window', clubTransfertsIntlSrc)(ctx);
  new Function('window', clubGenerationJoueursSrc)(ctx);
  new Function('window', clubCentreFormationSrc)(ctx);
  new Function('window', clubCompositionSrc)(ctx);
  return ctx.RMClub;
}

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

test('P0-1a : signer un joueur du marché après un rechargement ne doit jamais dupliquer un id de joueur existant', () => {
  for (const k of Object.keys(store)) delete store[k];
  const RMClub1 = chargerInstanceFraiche();
  const saison = RMClub1.nouvelleSaison(creerRng(42), 'Club Repro');
  assert.ok(RMClub1.sauvegarderSaison(saison));
  const idsJoueursAvant = new Set(saison.clubJoueur.effectif.map((j) => j.id));

  // "F5" : nouvelle instance de club.js, même localStorage.
  const RMClub2 = chargerInstanceFraiche();
  const saisonRechargee = RMClub2.chargerSaison();
  assert.ok(saisonRechargee, 'la sauvegarde doit être retrouvée après rechargement');
  saisonRechargee.clubJoueur.budget = 100000; // budget large : isole le bug d'id du budget
  saisonRechargee.marche = RMClub2.genererMarcheTransferts(creerRng(99), 0.5, 3);
  const cible = saisonRechargee.marche[0];
  const res = RMClub2.signerJoueur(saisonRechargee, cible.id);
  assert.strictEqual(res.ok, true);

  const occurrences = saisonRechargee.clubJoueur.effectif.filter((j) => j.id === cible.id);
  assert.strictEqual(occurrences.length, 1,
    `l'id "${cible.id}" du joueur signé après rechargement entre en collision avec un joueur déjà présent avant rechargement (${idsJoueursAvant.has(cible.id) ? 'collision confirmée' : 'pas de collision cette fois'}) : ${occurrences.length} joueur(s) partagent cet id au lieu d'1 seul.`);
  const idsApres = saisonRechargee.clubJoueur.effectif.map((j) => j.id);
  assert.strictEqual(new Set(idsApres).size, idsApres.length, 'deux joueurs distincts de l\'effectif ne doivent jamais partager le même id');
});

test('P0-1b : régénérer des adversaires après un rechargement (montée de palier) ne doit jamais réutiliser l\'id du club du joueur', () => {
  for (const k of Object.keys(store)) delete store[k];
  const RMClub1 = chargerInstanceFraiche();
  const saison = RMClub1.nouvelleSaison(creerRng(43), 'Club Repro 2');
  RMClub1.sauvegarderSaison(saison);
  const idClubJoueur = saison.clubJoueur.id;

  const RMClub2 = chargerInstanceFraiche();
  const saisonRechargee = RMClub2.chargerSaison();
  assert.ok(saisonRechargee);
  // Force la 1re place pour déclencher une VRAIE montée de palier, donc une
  // régénération complète des adversaires (nouveaux ids de club).
  for (const id of Object.keys(saisonRechargee.classement)) saisonRechargee.classement[id].pts = 0;
  saisonRechargee.classement[idClubJoueur].pts = 999;
  RMClub2.avancerSaison(creerRng(44), saisonRechargee);

  const idsAdversaires = saisonRechargee.adversaires.map((a) => a.id);
  assert.ok(!idsAdversaires.includes(idClubJoueur),
    `un nouvel adversaire réutilise l'id du club du joueur ("${idClubJoueur}") — RMClub.club(saison, "${idClubJoueur}") résoudrait alors TOUJOURS vers le club du joueur au lieu du bon adversaire.`);
  assert.strictEqual(new Set(idsAdversaires).size, idsAdversaires.length, 'deux adversaires distincts ne doivent jamais partager le même id');
  // Le bug, une fois confirmé, casse aussi la résolution des rencontres :
  // vérifie que RMClub.club() retourne bien CHAQUE adversaire, pas le club
  // du joueur, pour chacun de ses propres ids.
  for (const adv of saisonRechargee.adversaires) {
    const resolu = RMClub2.club(saisonRechargee, adv.id);
    assert.strictEqual(resolu && resolu.id, adv.id, `RMClub.club(saison, "${adv.id}") doit résoudre vers cet adversaire, pas vers un autre club`);
  }
});

test('P0-1c : ajouter un message après un rechargement ne doit jamais dupliquer un id de message existant', () => {
  for (const k of Object.keys(store)) delete store[k];
  const RMClub1 = chargerInstanceFraiche();
  const saison = RMClub1.nouvelleSaison(creerRng(45), 'Club Repro 3');
  // Génère plusieurs messages avant la sauvegarde (signatures/prêts...) pour
  // que le compteur de la 1re session soit déjà avancé.
  saison.marche = RMClub1.genererMarcheTransferts(creerRng(50), 0.5, 3);
  saison.clubJoueur.budget = 100000;
  RMClub1.signerJoueur(saison, saison.marche[0].id);
  RMClub1.sauvegarderSaison(saison);
  const idsMessagesAvant = new Set(saison.clubJoueur.messages.map((m) => m.id));

  const RMClub2 = chargerInstanceFraiche();
  const saisonRechargee = RMClub2.chargerSaison();
  saisonRechargee.clubJoueur.budget = 100000;
  saisonRechargee.marche = RMClub2.genererMarcheTransferts(creerRng(51), 0.5, 3);
  RMClub2.signerJoueur(saisonRechargee, saisonRechargee.marche[0].id); // ajoute un nouveau message

  const idsMessagesApres = saisonRechargee.clubJoueur.messages.map((m) => m.id);
  assert.strictEqual(new Set(idsMessagesApres).size, idsMessagesApres.length,
    `deux messages distincts partagent le même id après rechargement (avant : ${[...idsMessagesAvant].join(',')} / après : ${idsMessagesApres.join(',')})`);
});

test('P0-1d : embaucher du personnel après un rechargement ne doit jamais dupliquer un id de personnel existant', () => {
  for (const k of Object.keys(store)) delete store[k];
  const RMClub1 = chargerInstanceFraiche();
  const saison = RMClub1.nouvelleSaison(creerRng(46), 'Club Repro 4');
  // nouvelleSaison génère déjà un marchePersonnel initial (1er consommateur
  // de compteurPersonnelId dans CETTE session) : l'utiliser tel quel plutôt
  // que d'en régénérer un autre, pour rester au plus près du 1er id réel
  // ("staff1") consommé par la session.
  saison.clubJoueur.budget = 100000;
  const candidatSession1 = saison.marchePersonnel[0];
  RMClub1.embaucherPersonnel(saison, candidatSession1.id);
  const idsPersonnelAvant = new Set(saison.clubJoueur.personnel.map((p) => p.id));
  RMClub1.sauvegarderSaison(saison);

  const RMClub2 = chargerInstanceFraiche();
  const saisonRechargee = RMClub2.chargerSaison();
  saisonRechargee.clubJoueur.budget = 100000;
  // Après rechargement, le marchePersonnel déjà présent dans la sauvegarde
  // (généré lors de la session 1) reste affiché tel quel — mais toute
  // NOUVELLE génération (rafraîchir le marché) redémarre le compteur à 1
  // dans cette nouvelle session, ce qui est le cœur du bug : régénère donc
  // le marché comme le ferait un vrai clic sur "Rafraîchir" après un F5.
  saisonRechargee.marchePersonnel = RMClub2.genererMarchePersonnel(creerRng(61), 3);
  // Poste DIFFÉRENT de la session 1 (mais le compteur d'id repart quand
  // même à 1 dans cette nouvelle instance) : la règle métier "un seul par
  // poste" ne doit pas pouvoir masquer la collision d'id.
  const posteLibre = Object.keys(RMClub2.POSTES_PERSONNEL).find((p) => p !== candidatSession1.poste);
  saisonRechargee.marchePersonnel[0].poste = posteLibre;
  const cible = saisonRechargee.marchePersonnel[0];
  const res = RMClub2.embaucherPersonnel(saisonRechargee, cible.id);
  assert.strictEqual(res.ok, true);

  const idsPersonnelApres = saisonRechargee.clubJoueur.personnel.map((p) => p.id);
  assert.strictEqual(new Set(idsPersonnelApres).size, idsPersonnelApres.length,
    `deux membres du personnel distincts partagent le même id après rechargement (avant : ${[...idsPersonnelAvant].join(',')} / après : ${idsPersonnelApres.join(',')})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : P0-1 confirmé — les identifiants entrent en collision après un rechargement de page.');
} else {
  console.log('OK : aucune collision d\'identifiant après rechargement.');
}
