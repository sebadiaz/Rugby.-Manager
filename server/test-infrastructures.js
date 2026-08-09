// TEST DE PREUVE — le budget peut-il servir à AUTRE CHOSE qu'acheter un joueur ?
//
// COMPORTEMENT ACTUEL OBSERVÉ : `clubJoueur.budget` n'est débité que par des
// transferts (club-transferts.js, club-transferts-internationaux.js) et par
// les salaires (appliquerFinancesMatch). Il n'existe aucune structure
// d'infrastructures, aucun investissement, aucune projection.
//
// POURQUOI C'EST INSUFFISANT : dépenser 500 k€ sur un joueur ou 500 k€ dans le
// centre de formation devrait être un ARBITRAGE — un gain immédiat contre un
// gain durable. Aujourd'hui le second terme n'existe pas, donc il n'y a pas de
// choix : tout l'argent va au recrutement, faute d'alternative.
//
// CE QUE CE FICHIER EXIGE :
//   1. des infrastructures persistantes, avec des niveaux ;
//   2. un coût RÉEL et une DURÉE réelle de travaux ;
//   3. un seul chantier à la fois — c'est ce qui rend le choix contraignant ;
//   4. des travaux qui avancent avec les jours et se terminent vraiment ;
//   5. un effet MESURABLE sur le jeu une fois terminés ;
//   6. une sauvegarde ancienne qui se migre sans rien perdre.
//
// Usage : node server/test-infrastructures.js
'use strict';

const assert = require('assert');
global.window = global;
global.localStorage = (() => { let st = {}; return {
  getItem: (k) => (k in st ? st[k] : null), setItem: () => {}, removeItem: () => {} }; })();
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

function carriere(graine) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'Infra');
  RMClub.daterCalendrier(s);
  return s;
}

test('infrastructures : chaque club en a, à un niveau de départ réel', () => {
  const s = carriere(6001);
  const infra = RMClub.assurerInfrastructures(s);
  assert.ok(infra, 'saison.clubJoueur.infrastructures doit exister');
  const cles = RMClub.CLES_INFRASTRUCTURE;
  assert.ok(Array.isArray(cles) && cles.length >= 3, 'au moins trois infrastructures');
  for (const cle of cles) {
    const n = RMClub.niveauInfrastructure(s, cle);
    assert.ok(n >= 1, `${cle} doit avoir un niveau de départ (${n})`);
  }
});

test('infrastructures : améliorer a un COÛT et une DURÉE, croissants avec le niveau', () => {
  const s = carriere(6002);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  const c1 = RMClub.coutAmelioration(s, cle);
  const d1 = RMClub.dureeAmelioration(s, cle);
  assert.ok(c1 > 0, 'le coût doit être réel');
  assert.ok(d1 > 0, 'les travaux doivent prendre du temps');
  // Monter d'un niveau doit rendre le suivant plus cher.
  s.clubJoueur.infrastructures[cle].niveau += 1;
  assert.ok(RMClub.coutAmelioration(s, cle) > c1,
    'le niveau suivant doit coûter plus cher');
});

test('infrastructures : lancer des travaux DÉBITE réellement le budget', () => {
  const s = carriere(6003);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  s.clubJoueur.budget = 100000;
  const cout = RMClub.coutAmelioration(s, cle);
  const avant = s.clubJoueur.budget;
  const res = RMClub.lancerTravaux(s, cle);
  assert.strictEqual(res.ok, true, `les travaux doivent démarrer (${res.motif})`);
  assert.strictEqual(s.clubJoueur.budget, avant - cout, 'le budget doit être débité du coût exact');
});

test('infrastructures : budget insuffisant -> travaux refusés, budget intact', () => {
  const s = carriere(6004);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  s.clubJoueur.budget = 1;
  const res = RMClub.lancerTravaux(s, cle);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motif, 'budget');
  assert.strictEqual(s.clubJoueur.budget, 1, 'un refus ne débite rien');
});

test('infrastructures : UN SEUL chantier à la fois — c\'est ce qui rend le choix contraignant', () => {
  const s = carriere(6005);
  const [a, b] = RMClub.CLES_INFRASTRUCTURE;
  s.clubJoueur.budget = 100000;
  assert.strictEqual(RMClub.lancerTravaux(s, a).ok, true);
  const budgetApres = s.clubJoueur.budget;
  const second = RMClub.lancerTravaux(s, b);
  assert.strictEqual(second.ok, false, 'on ne lance pas deux chantiers en parallèle');
  assert.strictEqual(second.motif, 'chantierEnCours');
  assert.strictEqual(s.clubJoueur.budget, budgetApres, 'un refus ne débite rien');
});

test('infrastructures : les travaux avancent avec les JOURS et se terminent vraiment', () => {
  const s = carriere(6006);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  s.clubJoueur.budget = 100000;
  const niveauAvant = RMClub.niveauInfrastructure(s, cle);
  const duree = RMClub.dureeAmelioration(s, cle);
  RMClub.lancerTravaux(s, cle);
  assert.ok(RMClub.chantierEnCours(s), 'un chantier doit être en cours');
  // La veille de la fin : toujours en cours, niveau inchangé.
  for (let i = 0; i < duree - 1; i++) RMClub.avancerJourInfrastructures(s);
  assert.ok(RMClub.chantierEnCours(s), 'les travaux ne finissent pas avant terme');
  assert.strictEqual(RMClub.niveauInfrastructure(s, cle), niveauAvant);
  // Le jour dit : terminé, niveau réellement gagné.
  const fin = RMClub.avancerJourInfrastructures(s);
  assert.ok(fin && fin.termine, 'le dernier jour doit livrer les travaux');
  assert.strictEqual(RMClub.chantierEnCours(s), null);
  assert.strictEqual(RMClub.niveauInfrastructure(s, cle), niveauAvant + 1);
});

test('infrastructures : le manager est PRÉVENU de la livraison', () => {
  const s = carriere(6007);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  s.clubJoueur.budget = 100000;
  RMClub.lancerTravaux(s, cle);
  const duree = RMClub.dureeAmelioration(s, cle);
  for (let i = 0; i < duree; i++) RMClub.avancerJourInfrastructures(s);
  const msg = (s.clubJoueur.messages || []).find((m) => /travaux|infrastructure/i.test(m.titre));
  assert.ok(msg, 'un message doit annoncer la fin des travaux');
});

// --- L'effet doit être MESURABLE, sinon c'est décoratif -------------------
test('stade : un meilleur stade rapporte RÉELLEMENT plus à chaque match', () => {
  const s = carriere(6008);
  const club = s.clubJoueur;
  RMClub.assurerInfrastructures(s);
  const budgetDepart = club.budget;
  club.budget = 0;
  RMClub.appliquerFinancesMatch(club, 'v', 26);
  const gainNiveau1 = club.budget;
  // Même match, stade amélioré.
  club.infrastructures.stade.niveau = 4;
  club.budget = 0;
  RMClub.appliquerFinancesMatch(club, 'v', 26);
  const gainNiveau4 = club.budget;
  assert.ok(gainNiveau4 > gainNiveau1,
    `un stade de niveau 4 doit rapporter plus qu'un niveau 1 (${gainNiveau1} -> ${gainNiveau4})`);
  club.budget = budgetDepart;
});

test('centre médical : un meilleur centre RÉDUIT réellement le risque de blessure', () => {
  const s = carriere(6009);
  RMClub.assurerInfrastructures(s);
  const j = s.clubJoueur.effectif[0];
  j.fatigue = 60;
  const r1 = RMClub.risqueBlessure(j, { intensite: 1, saison: s });
  s.clubJoueur.infrastructures.medical.niveau = 5;
  const r5 = RMClub.risqueBlessure(j, { intensite: 1, saison: s });
  assert.ok(r5 < r1, `un centre médical de niveau 5 doit réduire le risque (${r1} -> ${r5})`);
});

test('infrastructures : tout survit à un rechargement de sauvegarde', () => {
  const s = carriere(6010);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  s.clubJoueur.budget = 100000;
  RMClub.lancerTravaux(s, cle);
  RMClub.avancerJourInfrastructures(s);
  const recharge = JSON.parse(JSON.stringify(s));
  assert.deepStrictEqual(recharge.clubJoueur.infrastructures, s.clubJoueur.infrastructures);
  assert.ok(RMClub.chantierEnCours(recharge), 'le chantier doit survivre au rechargement');
});

test('infrastructures : une sauvegarde ANCIENNE se migre sans rien perdre', () => {
  const s = carriere(6011);
  const budget = s.clubJoueur.budget;
  const nbJoueurs = s.clubJoueur.effectif.length;
  // Sauvegarde d'avant les infrastructures.
  delete s.clubJoueur.infrastructures;
  s.version = 6;
  const migree = RMClub.migrerSauvegarde
    ? RMClub.migrerSauvegarde(s)
    : (RMClub.assurerInfrastructures(s), s);
  assert.ok(migree.clubJoueur.infrastructures, 'la migration doit créer les infrastructures');
  assert.strictEqual(migree.clubJoueur.budget, budget, 'le budget ne doit pas bouger');
  assert.strictEqual(migree.clubJoueur.effectif.length, nbJoueurs, 'l\'effectif ne doit pas bouger');
});

test('infrastructures : aucun aléatoire — deux clubs identiques donnent le même coût', () => {
  const a = carriere(6012), b = carriere(6012);
  const cle = RMClub.CLES_INFRASTRUCTURE[0];
  assert.strictEqual(RMClub.coutAmelioration(a, cle), RMClub.coutAmelioration(b, cle));
  assert.strictEqual(RMClub.dureeAmelioration(a, cle), RMClub.dureeAmelioration(b, cle));
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) console.error('ECHEC : le budget ne permet pas encore d\'investir.');
else console.log('OK : investir dans le club est une vraie décision, avec une vraie conséquence.');
