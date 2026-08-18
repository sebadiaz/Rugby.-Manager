// COUVERTURE — les revenus liés aux RÉSULTATS sportifs.
//
// Audit mesuré avant cette tranche, sur une saison complète de Ligue
// Régionale (26 journées, 13 à domicile) :
//
//   billetterie   728 k€  (65 %)
//   sponsor       390 k€  (35 %)
//   droits TV       0     — aucune occurrence dans tout docs/js
//   primes          0     — aucune occurrence dans tout docs/js
//   ----------------------------------------------------------
//   total        1118 k€
//
// Conséquence directe : finir 1er ou 14e ne changeait RIEN au budget, gagner
// une coupe ne rapportait RIEN, et monter d'un palier n'apportait aucune
// ressource. Le manager n'avait donc aucune raison financière de viser haut,
// et aucun arbitrage « je vise le titre » contre « je gère ma trésorerie ».
//
// Usage : node server/test-finances-competition.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

let graine = 101000;
function carriere(niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Finances');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  return s;
}
// Termine la saison avec le club du joueur à la position voulue.
function terminerSaisonALaPosition(s, position) {
  const c = s.clubJoueur;
  const ids = [c.id].concat((s.adversaires || []).map((a) => a.id));
  // Les (position - 1) premiers rivaux devant, le reste derrière.
  const rivaux = ids.filter((id) => id !== c.id);
  s.classement[c.id].pts = 50;
  rivaux.forEach((id, i) => { s.classement[id].pts = i < position - 1 ? 90 : 10; });
  const rang = RMClub.classementTrieDe(s.classement).findIndex((l) => l.clubId === c.id) + 1;
  assert.strictEqual(rang, position, `le club doit être ${position}e (il est ${rang}e)`);
  for (const f of s.calendrier) f.joue = true;
}

test('D1 — les droits TV existent et dépendent du PALIER', () => {
  assert.strictEqual(typeof RMClub.droitsTVParJournee, 'function',
    'la règle des droits TV doit exister');
  const excellence = RMClub.droitsTVParJournee(1);
  const nationale = RMClub.droitsTVParJournee(2);
  const regionale = RMClub.droitsTVParJournee(3);
  assert.ok(excellence > nationale && nationale > regionale,
    `plus le palier est haut, plus les droits sont élevés (${excellence} / ${nationale} / ${regionale})`);
  assert.ok(regionale > 0, 'même le petit palier touche quelque chose');
});

test('D2 — les droits TV entrent RÉELLEMENT à chaque journée', () => {
  const s = carriere(3);
  const c = s.clubJoueur;
  const budgetAvant = c.budget;
  const n = RMClub.nombreJourneesSaison(s.calendrier);
  const m = RMClub.appliquerFinancesMatch(c, 'v', n, { domicile: false, saison: s });
  assert.ok(m.droitsTV > 0, `un mouvement de match doit porter des droits TV (${JSON.stringify(m)})`);
  assert.strictEqual(m.droitsTV, RMClub.droitsTVParJournee(3),
    'et exactement le montant du palier');
  assert.ok(c.budget > budgetAvant - (m.salaires + m.deplacement + m.entretien),
    'le budget doit en bénéficier');
});

test('D3 — la prime de classement récompense le RANG réel', () => {
  assert.strictEqual(typeof RMClub.primeClassement, 'function');
  const champion = RMClub.primeClassement(3, 1, 14);
  const milieu = RMClub.primeClassement(3, 7, 14);
  const dernier = RMClub.primeClassement(3, 14, 14);
  assert.ok(champion > milieu && milieu >= dernier,
    `la prime décroît avec le rang (${champion} / ${milieu} / ${dernier})`);
  assert.strictEqual(dernier, 0, 'le dernier ne touche rien');
  // Le palier compte aussi : champion d'Excellence > champion de Régionale.
  assert.ok(RMClub.primeClassement(1, 1, 14) > RMClub.primeClassement(3, 1, 14),
    'un titre au palier supérieur rapporte davantage');
});

test('D4 — finir 3e rapporte PLUS que finir 12e, en fin de saison réelle', () => {
  const bon = carriere(3);
  terminerSaisonALaPosition(bon, 3);
  const budgetBon = bon.clubJoueur.budget;
  RMClub.avancerSaison(creerRng(5), bon);
  const gainBon = bon.clubJoueur.budget - budgetBon;

  const mauvais = carriere(3);
  terminerSaisonALaPosition(mauvais, 12);
  const budgetMauvais = mauvais.clubJoueur.budget;
  RMClub.avancerSaison(creerRng(5), mauvais);
  const gainMauvais = mauvais.clubJoueur.budget - budgetMauvais;

  assert.ok(gainBon > gainMauvais,
    `terminer 3e doit rapporter plus que 12e (${gainBon} contre ${gainMauvais})`);
});

test('D5 — un parcours en coupe rapporte, tour par tour', () => {
  assert.strictEqual(typeof RMClub.primeCoupe, 'function');
  const s = carriere(3);
  RMClub.assurerCoupes(s);
  const coupe = s.coupes.nationale;
  const premier = RMClub.primeCoupe(coupe, 0, false);
  const finale = RMClub.primeCoupe(coupe, coupe.tours.length - 1, false);
  const vainqueur = RMClub.primeCoupe(coupe, coupe.tours.length - 1, true);
  assert.ok(finale > premier, `aller en finale rapporte plus qu'un premier tour (${premier} → ${finale})`);
  assert.ok(vainqueur > finale, 'et la gagner rapporte plus encore');
});

test('D6 — les primes sont INSCRITES au grand livre, pas ajoutées en douce', () => {
  const s = carriere(3);
  terminerSaisonALaPosition(s, 1);
  RMClub.avancerSaison(creerRng(7), s);
  const totaux = RMClub.totauxComptes(s);
  assert.ok(totaux.primes > 0,
    `les primes doivent apparaître au grand livre (${JSON.stringify(totaux)})`);
  const lignes = RMClub.lignesComptes(s).filter((l) => l.categorie === 'primes');
  assert.ok(lignes.length, 'avec au moins une ligne détaillée');
  assert.ok(lignes[0].libelle && lignes[0].libelle.length > 5,
    'et un libellé qui dit d\'où vient l\'argent');
});

test('D7 — une sauvegarde ANTÉRIEURE ne produit pas de NaN', () => {
  // Piège réel : `assurerComptes` sort tôt si les comptes existent déjà. Une
  // sauvegarde d'avant cette tranche n'a donc ni `droitsTV` ni `primes` dans
  // ses totaux, et `totaux[categorie] += montant` sur `undefined` donne NaN.
  const s = carriere(3);
  RMClub.assurerComptes(s);
  delete s.clubJoueur.comptes.totaux.droitsTV;
  delete s.clubJoueur.comptes.totaux.primes;
  RMClub.mouvementTresorerie(s, 'droitsTV', 'Droits TV', 40);
  RMClub.mouvementTresorerie(s, 'primes', 'Prime', 100);
  const totaux = RMClub.totauxComptes(s);
  assert.strictEqual(totaux.droitsTV, 40, `droits TV corrompus : ${totaux.droitsTV}`);
  assert.strictEqual(totaux.primes, 100, `primes corrompues : ${totaux.primes}`);
  assert.ok(Number.isFinite(s.clubJoueur.budget), 'et le budget reste un nombre');
});

test('D8 — l\'économie reste tenable : pas de club subitement riche', () => {
  // Garde-fou de calibration. Sur une saison complète, les nouveaux revenus
  // ne doivent pas écraser les anciens ni rendre le club insubmersible.
  const s = carriere(3);
  const c = s.clubJoueur;
  const n = RMClub.nombreJourneesSaison(s.calendrier);
  let recettes = 0, depenses = 0, tv = 0;
  for (let i = 0; i < n; i++) {
    const m = RMClub.appliquerFinancesMatch(c, 'v', n, { domicile: i % 2 === 0, saison: s });
    recettes += (m.recette || 0) + (m.revenuSponsor || 0) + (m.droitsTV || 0);
    depenses += (m.salaires || 0) + (m.salairesPersonnel || 0) + (m.deplacement || 0) + (m.entretien || 0);
    tv += m.droitsTV || 0;
  }
  const part = tv / recettes;
  assert.ok(part > 0.05 && part < 0.45,
    `les droits TV doivent compter sans tout écraser (${Math.round(part * 100)} % des recettes)`);
  assert.ok(recettes < depenses * 2.2,
    `le club ne doit pas devenir trivialement riche (recettes ${recettes} contre dépenses ${depenses})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
