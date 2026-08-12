// TEST DE PREUVE — LE CLUB ENCAISSE SA BILLETTERIE À L'EXTÉRIEUR
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré, saison complète, graine 2026) :
//
//   docs/js/club.js, `appliquerFinancesMatch(club, forme, nbJournees)` :
//   la signature ne reçoit PAS le côté du match. La recette de billetterie
//   est donc créditée aux 26 journées, les 13 déplacements compris.
//
//   Décomposition d'une saison de championnat (le MÊME appel que le jeu) :
//       billetterie      + 2 341 k€   (26 matchs)
//       sponsor          +   728 k€
//       salaires joueurs -   598 k€
//       ---------------------------
//       solde            + 2 471 k€   pour un budget de départ de 390 k€
//
//   Le club multiplie sa trésorerie par 7,3 en une saison, et les salaires ne
//   pèsent que 19 % des recettes (un vrai club : 55-60 %).
//
//   Et le jeu se contredit lui-même : le chantier « Stade » annonce au manager
//   « Recette de billetterie à chaque match À DOMICILE »
//   (docs/js/club-infrastructures.js). Le code, lui, la crédite partout.
//
//   Le site d'appel SAIT pourtant de quel côté joue le club : clubUI.js
//   calcule `estClubJoueur(matchJoueur.domicileId)` deux lignes plus haut pour
//   choisir la lettre d'équipe du moteur. L'information existe, elle n'est
//   simplement jamais transmise.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : la trésorerie n'est jamais une
// contrainte. Un budget qui monte tout seul de 2,5 M€ par saison rend sans
// enjeu tout ce qui touche à l'argent — le mercato, les ventes (P1-48), les
// chantiers d'infrastructures (320 k€ le stade, 260 k€ le centre médical), la
// prévision de trésorerie (P1-47) qui n'affiche jamais que du vert. Et le
// calendrier perd un de ses reliefs : une série à l'extérieur devrait serrer
// les comptes, une série à domicile les desserrer.
//
// FONCTION EXACTE RESPONSABLE : docs/js/club.js, `appliquerFinancesMatch`.
//
// SCÉNARIO DE REPRODUCTION : jouer une saison de championnat en appelant
// `appliquerFinancesMatch` une fois par rencontre du club, comme le fait
// clubUI.js, et lire le grand livre.
//
// CE QUE CE FICHIER EXIGE :
//   1. la billetterie n'est encaissée QU'À DOMICILE ;
//   2. un déplacement COÛTE réellement (c'est la contrepartie : sur la route,
//      on ne vend pas de billets et on paie le voyage) ;
//   3. le sponsor et les salaires, eux, courent à chaque journée ;
//   4. le grand livre reste exact (invariant budget = somme des totaux) ;
//   5. le solde de saison cesse d'être un enrichissement automatique ;
//   6. l'appelant réel transmet bien le côté du match.
//
// Usage : node server/test-recettes-domicile.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

function nouveauClub(graine) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'AS Recettes');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  return s;
}

// Joue une saison de championnat en appelant appliquerFinancesMatch UNE FOIS
// par rencontre du club, exactement comme clubUI.js le fait.
function jouerSaisonFinanciere(s) {
  const c = s.clubJoueur;
  const cal = s.calendrier || [];
  const nb = RMClub.nombreJourneesSaison(cal);
  const miennes = cal.filter((f) => f.domicileId === c.id || f.exterieurId === c.id);
  const rng = creerRng(11);
  let domiciles = 0, exterieurs = 0;
  for (const f of miennes) {
    const domicile = f.domicileId === c.id;
    if (domicile) domiciles++; else exterieurs++;
    const forme = rng() < 0.45 ? 'v' : rng() < 0.6 ? 'n' : 'd';
    RMClub.appliquerFinancesMatch(c, forme, nb, { domicile });
  }
  return { domiciles, exterieurs, journees: miennes.length };
}

test('R1 — la billetterie n\'est encaissée QU\'À DOMICILE', () => {
  const dom = nouveauClub(2026), ext = nouveauClub(2026);
  const nb = RMClub.nombreJourneesSaison(dom.calendrier);
  const aDomicile = RMClub.appliquerFinancesMatch(dom.clubJoueur, 'v', nb, { domicile: true });
  const aExterieur = RMClub.appliquerFinancesMatch(ext.clubJoueur, 'v', nb, { domicile: false });
  assert.ok(aDomicile.recette > 0,
    `un match à domicile rapporte une billetterie (${aDomicile.recette})`);
  assert.strictEqual(aExterieur.recette, 0,
    `un déplacement ne rapporte AUCUNE billetterie (${aExterieur.recette})`);
});

test('R2 — un déplacement COÛTE réellement', () => {
  const s = nouveauClub(2026);
  const nb = RMClub.nombreJourneesSaison(s.calendrier);
  const ext = RMClub.appliquerFinancesMatch(s.clubJoueur, 'v', nb, { domicile: false });
  assert.ok(typeof ext.deplacement === 'number' && ext.deplacement > 0,
    `un déplacement doit avoir un coût chiffré (${JSON.stringify(ext)})`);
  const s2 = nouveauClub(2026);
  const dom = RMClub.appliquerFinancesMatch(s2.clubJoueur, 'v', nb, { domicile: true });
  assert.strictEqual(dom.deplacement, 0,
    `recevoir ne coûte pas de déplacement (${dom.deplacement})`);
  // Il doit être inscrit au grand livre, dans sa propre catégorie — pas noyé
  // dans une autre ligne, sinon le manager ne peut pas le lire.
  const totaux = RMClub.totauxComptes(s);
  assert.ok(totaux.deplacement < 0,
    `le déplacement doit apparaître au grand livre (${JSON.stringify(totaux)})`);
});

test('R3 — sponsor et salaires courent à CHAQUE journée', () => {
  const s = nouveauClub(2026);
  const nb = RMClub.nombreJourneesSaison(s.calendrier);
  const ext = RMClub.appliquerFinancesMatch(s.clubJoueur, 'v', nb, { domicile: false });
  assert.ok(ext.revenuSponsor > 0, 'le partenaire paie aussi les jours de déplacement');
  assert.ok(ext.salaires > 0, 'les joueurs sont payés aussi les jours de déplacement');
});

test('R4 — PREUVE EN SAISON : le solde est divisé par deux (et ce qu\'il en reste)', () => {
  const s = nouveauClub(2026);
  const budgetDepart = s.clubJoueur.budget;
  const { domiciles, exterieurs, journees } = jouerSaisonFinanciere(s);
  assert.strictEqual(journees, 26, `une saison de championnat compte 26 rencontres (${journees})`);
  assert.ok(domiciles > 0 && exterieurs > 0,
    `le calendrier alterne domicile et extérieur (${domiciles}/${exterieurs})`);
  const totaux = RMClub.totauxComptes(s);
  const solde = s.clubJoueur.budget - budgetDepart;
  const detail = `billetterie ${totaux.billetterie}, sponsor ${totaux.sponsor}, ` +
    `salaires ${totaux.salaires}, déplacements ${totaux.deplacement}, solde ${Math.round(solde)}`;
  // La billetterie ne porte plus que les 13 réceptions : mesuré 2 341 k€ avant,
  // 1 213 k€ après.
  assert.ok(totaux.billetterie < 1600,
    `la billetterie ne porte plus que les matchs à domicile (${detail})`);
  // Et les déplacements pèsent réellement sur la saison.
  assert.ok(totaux.deplacement <= -100,
    `les 13 déplacements doivent coûter une somme visible (${detail})`);
  // Solde : 2 471 k€ avant, 1 174 k€ après — divisé par 2,1.
  assert.ok(solde < 1400,
    `le solde de saison doit être nettement réduit (${detail})`);

  // CE QUE CE PATCH NE CORRIGE PAS, ET IL FAUT LE DIRE.
  //
  // Le club gagne ENCORE +1 174 k€ sur une saison, soit trois fois son budget
  // de départ (390 k€). La trésorerie n'est donc toujours pas une contrainte.
  // La cause restante n'est plus le côté du match, c'est l'ÉCHELLE : sur une
  // saison, recettes 1 941 k€ contre 767 k€ de charges — les salaires ne
  // pèsent que 31 % des recettes, quand un vrai club est à 55-60 %. Il faudrait
  // des recettes de l'ordre de 900 k€ à 1,1 M€ pour un effectif payé 598 k€.
  //
  // Ce n'est pas corrigé ici parce que ce serait un autre patch : il touche la
  // base de billetterie, la génération du sponsor (donc les sauvegardes) et la
  // rentabilité des chantiers d'infrastructures. Cette assertion VERROUILLE
  // l'écart constaté pour qu'il ne s'aggrave pas en silence, et pour que le
  // jour où l'échelle sera reprise, ce test le signale.
  assert.ok(solde > 0,
    `état connu : la saison reste bénéficiaire, l'échelle recettes/salaires ` +
    `reste à reprendre (${detail})`);
});

test('R5 — le grand livre reste EXACT (invariant du budget)', () => {
  const s = nouveauClub(2026);
  const budgetDepart = s.clubJoueur.budget;
  jouerSaisonFinanciere(s);
  const totaux = RMClub.totauxComptes(s);
  const somme = Object.values(totaux).reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(s.clubJoueur.budget - budgetDepart), Math.round(somme),
    `budget_final − budget_initial doit égaler la somme des totaux ` +
    `(${Math.round(s.clubJoueur.budget - budgetDepart)} vs ${Math.round(somme)})`);
});

test('R6 — le calendrier a un relief financier', () => {
  // Une série à domicile doit desserrer les comptes, une série à l'extérieur
  // les serrer. Sans ça, le côté du match resterait un détail comptable.
  const nb = 26;
  const sDom = nouveauClub(2026), sExt = nouveauClub(2026);
  for (let i = 0; i < 5; i++) {
    RMClub.appliquerFinancesMatch(sDom.clubJoueur, 'n', nb, { domicile: true });
    RMClub.appliquerFinancesMatch(sExt.clubJoueur, 'n', nb, { domicile: false });
  }
  const ecart = sDom.clubJoueur.budget - sExt.clubJoueur.budget;
  assert.ok(ecart > 100,
    `cinq réceptions doivent peser nettement plus que cinq déplacements (${ecart} k€)`);
});

test('R7 — l\'appelant RÉEL transmet bien le côté du match', () => {
  // Sans ça, la règle serait juste mais jamais appliquée en jeu (défaut de
  // câblage, cf. P1-51 où la consigne de mêlée n'atteignait pas le contest).
  const src = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'clubUI.js'), 'utf8');
  const i = src.indexOf('appliquerFinancesMatch(');
  assert.ok(i !== -1, 'clubUI.js doit appeler appliquerFinancesMatch');
  const appel = src.slice(i, i + 260);
  assert.ok(/domicile/.test(appel),
    `l'appel doit transmettre le côté du match :\n     ${appel.split('\n')[0]}`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
