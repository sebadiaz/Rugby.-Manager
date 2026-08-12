// TEST DE PREUVE — L'ARGENT NE CONTRAINT JAMAIS RIEN
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré, saison complète, graine 2026, après
// la correction G2 qui a déjà supprimé la billetterie à l'extérieur) :
//
//   billetterie      + 1 213 k€   (13 réceptions)
//   sponsor          +   728 k€
//   salaires joueurs -   598 k€
//   déplacements     -   169 k€
//   ------------------------------
//   solde            + 1 174 k€   pour un budget de départ de 390 k€
//
//   Les salaires pèsent 31 % des recettes ; un vrai club est à 55-60 %. Le
//   club triple donc sa trésorerie chaque saison, sans rien décider.
//
//   Deuxième défaut, indépendant mais de même famille : les infrastructures
//   (docs/js/club-infrastructures.js — stade, centre médical, centre de
//   formation, terrains d'entraînement, cinq niveaux chacune) sont du PUR
//   BÉNÉFICE. On paie le chantier une fois, le gain est acquis pour toujours
//   et ne coûte plus jamais rien. Aucun club ne fonctionne comme ça : un
//   stade, un centre de formation et un centre médical, ça s'exploite.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : il n'y a aucun arbitrage
// financier. Monter une infrastructure est toujours le bon choix puisqu'elle
// ne coûte rien à faire tourner ; vendre un joueur ne sert à rien puisque
// l'argent arrive seul ; la prévision de trésorerie (P1-47) n'affiche jamais
// que du vert. Le budget est un décor, pas une contrainte — donc il n'y a pas
// de gestion.
//
// FONCTIONS EXACTES RESPONSABLES : docs/js/club.js `appliquerFinancesMatch`
// (échelle des recettes) et `genererSponsor` ; docs/js/club-infrastructures.js
// (aucun coût récurrent nulle part).
//
// SCÉNARIO DE REPRODUCTION : jouer une saison de championnat en appelant
// `appliquerFinancesMatch` une fois par rencontre, puis monter une
// infrastructure et constater que la charge d'exploitation ne bouge pas.
//
// CE QUE CE FICHIER EXIGE :
//   1. les salaires pèsent 55-60 % des recettes, comme un vrai club ;
//   2. une saison sans décision ne triple plus la trésorerie ;
//   3. les infrastructures COÛTENT à l'exploitation, chaque journée ;
//   4. monter un niveau augmente le coût récurrent — c'est le prix du gain ;
//   5. le stade reste rentable (sinon personne ne le monterait) mais les
//      infrastructures purement sportives, elles, se paient ;
//   6. le club ne fait pas faillite en jouant normalement ;
//   7. le grand livre reste exact et le nouveau poste est lisible ;
//   8. une sauvegarde antérieure est migrée, pas cassée.
//
// Usage : node server/test-economie-club.js
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

function nouveauClub(graine) {
  const s = RMClub.nouvelleSaison(creerRng(graine || 2026), 'AS Economie');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  return s;
}

// Une saison de championnat, appelée comme clubUI.js le fait : une fois par
// rencontre du club, avec le côté réel du match.
function jouerSaisonFinanciere(s, graine) {
  const c = s.clubJoueur;
  const cal = s.calendrier || [];
  const nb = RMClub.nombreJourneesSaison(cal);
  const miennes = cal.filter((f) => f.domicileId === c.id || f.exterieurId === c.id);
  const rng = creerRng(graine || 11);
  for (const f of miennes) {
    const forme = rng() < 0.4 ? 'v' : rng() < 0.6 ? 'n' : 'd';
    RMClub.appliquerFinancesMatch(c, forme, nb, { domicile: f.domicileId === c.id });
  }
  return RMClub.totauxComptes(s);
}
const detail = (t) => Object.entries(t).filter(([, v]) => v)
  .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');

test('E1 — les salaires pèsent 55-60 % des recettes, comme un vrai club', () => {
  const s = nouveauClub();
  const t = jouerSaisonFinanciere(s);
  const recettes = t.billetterie + t.sponsor;
  const part = 100 * (-t.salaires - t.salairesPersonnel) / recettes;
  assert.ok(part >= 50 && part <= 68,
    `masse salariale = ${part.toFixed(0)} % des recettes, attendu 55-60 % (${detail(t)})`);
});

test('E2 — PREUVE : une saison sans décision ne triple plus la trésorerie', () => {
  const s = nouveauClub();
  const depart = s.clubJoueur.budget;
  const t = jouerSaisonFinanciere(s);
  const solde = s.clubJoueur.budget - depart;
  // Mesuré avant : +1 174 k€ pour 390 k€ de budget de départ.
  assert.ok(solde < depart * 0.9,
    `un exercice sans décision ne doit pas quasi doubler la trésorerie ` +
    `(départ ${depart} k€, solde ${Math.round(solde)} k€ ; ${detail(t)})`);
  // Mais il ne doit pas non plus condamner le club : une saison normale reste
  // viable, sinon le jeu devient une punition.
  assert.ok(solde > -depart * 0.5,
    `une saison normale ne doit pas ruiner le club (solde ${Math.round(solde)} k€)`);
});

test('E3 — PREUVE : les infrastructures COÛTENT à l\'exploitation', () => {
  assert.strictEqual(typeof RMClub.coutEntretienInfrastructures, 'function',
    'le coût d\'exploitation doit être une règle explicite et exportée');
  const s = nouveauClub();
  const cout = RMClub.coutEntretienInfrastructures(s.clubJoueur);
  assert.ok(cout > 0,
    `un club a un stade, un centre médical, un centre de formation et des ` +
    `terrains : ça s'exploite (${cout} k€/journée)`);
  const nb = RMClub.nombreJourneesSaison(s.calendrier);
  const m = RMClub.appliquerFinancesMatch(s.clubJoueur, 'v', nb, { domicile: true });
  assert.strictEqual(m.entretien, cout,
    `chaque journée doit porter la charge d'exploitation (${JSON.stringify(m)})`);
  const t = RMClub.totauxComptes(s);
  assert.ok(t.entretien < 0,
    `l'exploitation doit apparaître au grand livre, dans son propre poste (${detail(t)})`);
});

test('E4 — monter un niveau augmente le coût récurrent', () => {
  const s = nouveauClub();
  const avant = RMClub.coutEntretienInfrastructures(s.clubJoueur);
  s.clubJoueur.infrastructures.stade.niveau = 3;
  const apres = RMClub.coutEntretienInfrastructures(s.clubJoueur);
  assert.ok(apres > avant,
    `un stade plus grand coûte plus cher à faire tourner (${avant} -> ${apres} k€/journée)`);
  // Et l'effet doit être proportionné : pas un doublement pour un niveau.
  assert.ok(apres < avant * 3,
    `l'exploitation ne doit pas exploser (${avant} -> ${apres})`);
});

test('E5 — le stade reste rentable, les infrastructures sportives se paient', () => {
  const nb = 26;
  // Stade au niveau 5 : la recette supplémentaire doit dépasser l'entretien
  // supplémentaire, sinon personne ne le monterait jamais.
  const base = nouveauClub(), haut = nouveauClub();
  haut.clubJoueur.infrastructures.stade.niveau = 5;
  const mBase = RMClub.appliquerFinancesMatch(base.clubJoueur, 'n', nb, { domicile: true });
  const mHaut = RMClub.appliquerFinancesMatch(haut.clubJoueur, 'n', nb, { domicile: true });
  const gain = mHaut.recette - mBase.recette;
  const surcout = mHaut.entretien - mBase.entretien;
  assert.ok(gain > surcout,
    `un stade de niveau 5 doit rester rentable (recette +${gain}, entretien +${surcout} par réception)`);

  // RENTABLE NE SUFFIT PAS : il faut que ce soit un investissement RAISONNABLE.
  // Première calibration de ce patch : entretien à 1,7 k€ par niveau, comme la
  // charge de base. Le stade niveau 2 rapportait +104 k€/saison de recette pour
  // +44 k€ d'entretien, soit un retour sur investissement de 6,2 saisons sur un
  // chantier à 320 k€ — techniquement « rentable », concrètement un piège que
  // personne n'aurait construit. Seule la mesure l'a montré. D'où un surcoût
  // par niveau (0,7 k€) volontairement plus faible que la charge de base.
  const n2 = nouveauClub();
  n2.clubJoueur.infrastructures.stade.niveau = 2;
  const m2 = RMClub.appliquerFinancesMatch(n2.clubJoueur, 'n', nb, { domicile: true });
  // 13 réceptions rapportent la recette ; les 26 journées portent l'entretien.
  const gainSaison = (m2.recette - mBase.recette) * 13 - (m2.entretien - mBase.entretien) * 26;
  // Le coût se lit sur un club encore au niveau 1 : `coutAmelioration` donne le
  // prix du PROCHAIN palier, donc sur `n2` (déjà au niveau 2) il renverrait le
  // prix du niveau 3.
  const cout = RMClub.coutAmelioration(nouveauClub(), 'stade');
  const retour = cout / gainSaison;
  assert.ok(gainSaison > 0 && retour <= 5,
    `monter le stade doit se rembourser en moins de cinq saisons ` +
    `(gain net ${gainSaison} k€/saison, chantier ${cout} k€, retour ${retour.toFixed(1)} saisons)`);
  // Le centre de formation, lui, ne rapporte AUCUNE recette : il doit donc
  // coûter réellement. C'est l'arbitrage sportif contre l'argent.
  const form = nouveauClub();
  form.clubJoueur.infrastructures.formation.niveau = 5;
  const mForm = RMClub.appliquerFinancesMatch(form.clubJoueur, 'n', nb, { domicile: true });
  assert.strictEqual(mForm.recette, mBase.recette,
    'le centre de formation ne rapporte pas de billetterie');
  assert.ok(mForm.entretien > mBase.entretien,
    `un centre de formation de niveau 5 doit peser sur les comptes ` +
    `(${mBase.entretien} -> ${mForm.entretien} k€/journée)`);
});

test('E6 — le club ne fait pas faillite en jouant normalement', () => {
  // Huit saisons sans aucune décision de gestion : le club doit rester
  // solvable. Un modèle qui ruine un manager passif serait une punition, pas
  // une contrainte.
  const s = nouveauClub();
  const soldes = [];
  for (let n = 1; n <= 8; n++) {
    const avant = s.clubJoueur.budget;
    jouerSaisonFinanciere(s, 100 + n);
    soldes.push(Math.round(s.clubJoueur.budget - avant));
    let f = RMClub.prochainesFixtures(s), g = 0;
    const rng = creerRng(700 + n);
    while (f.length && g++ < 60) {
      for (const x of f) {
        const adv = x.domicileId === s.clubJoueur.id ? x.exterieurId : x.domicileId;
        RMClub.enregistrerResultatClubJoueur(s, adv,
          15 + Math.floor(rng() * 25), 10 + Math.floor(rng() * 25), x.journee);
      }
      f = RMClub.prochainesFixtures(s);
    }
    RMClub.avancerSaison(creerRng(3000 + n), s);
  }
  assert.ok(s.clubJoueur.budget > 0,
    `le club doit rester solvable sur huit saisons (budget ${Math.round(s.clubJoueur.budget)} k€ ; soldes ${soldes.join(', ')})`);
  // Et la trésorerie ne doit pas non plus s'envoler : c'est tout le sujet.
  assert.ok(s.clubJoueur.budget < 6000,
    `la trésorerie ne doit pas exploser sur huit saisons (${Math.round(s.clubJoueur.budget)} k€ ; soldes ${soldes.join(', ')})`);
});

test('E7 — le grand livre reste EXACT et le nouveau poste est lisible', () => {
  const s = nouveauClub();
  const depart = s.clubJoueur.budget;
  jouerSaisonFinanciere(s);
  const t = RMClub.totauxComptes(s);
  const somme = Object.values(t).reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(s.clubJoueur.budget - depart), Math.round(somme),
    `budget_final − budget_initial = somme des totaux (${Math.round(s.clubJoueur.budget - depart)} vs ${Math.round(somme)})`);
  // Le manager doit pouvoir LIRE le poste, avec un libellé et une explication.
  const cat = RMClub.CATEGORIES_COMPTE.entretien;
  assert.ok(cat && cat.libelle && cat.description && cat.sens === 'depense',
    `l'exploitation doit être une catégorie affichable (${JSON.stringify(cat)})`);
  const dossier = RMClub.dossierComptes(s);
  assert.ok(dossier.categories.some((x) => x.cle === 'entretien'),
    `le poste doit apparaître dans la ventilation montrée au manager ` +
    `(${dossier.categories.map((x) => x.cle).join(', ')})`);
});

test('E8 — une sauvegarde antérieure est MIGRÉE, pas cassée', () => {
  // Le sponsor est tiré une seule fois et stocké : une carrière déjà commencée
  // garderait sinon un revenu à l'ancienne échelle, et resterait riche.
  assert.ok(RMClub.VERSION_SAUVEGARDE >= 8,
    `un changement d'échelle du sponsor impose une migration (version ${RMClub.VERSION_SAUVEGARDE})`);
  const ancienne = nouveauClub();
  ancienne.version = 7;
  ancienne.clubJoueur.sponsor = { nom: 'Groupe Essai', revenuParMatch: 28 };
  stockage = {};
  global.localStorage.setItem('rugbyManager.club.v1', JSON.stringify(ancienne));
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit être rechargeable, jamais rejetée');
  assert.strictEqual(rechargee.version, RMClub.VERSION_SAUVEGARDE,
    'la migration doit amener la sauvegarde à la version courante');
  assert.ok(rechargee.clubJoueur.sponsor.revenuParMatch < 28,
    `le revenu sponsor doit être ramené à la nouvelle échelle ` +
    `(${rechargee.clubJoueur.sponsor.revenuParMatch} k€/match)`);
  assert.ok(rechargee.clubJoueur.sponsor.revenuParMatch > 0,
    'mais jamais annulé : le partenaire existe toujours');
  assert.strictEqual(rechargee.clubJoueur.sponsor.nom, 'Groupe Essai',
    'le partenaire lui-même ne change pas');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
