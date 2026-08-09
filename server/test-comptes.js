// TEST DE PREUVE — OÙ EST PASSÉ L'ARGENT ?
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré, pas supposé) : sur une carrière neuve,
// un repérage (8 k€) puis un chantier au centre médical (260 k€) font tomber
// le budget de 434 à 166 k€. Le journal financier (`historiqueFinances`)
// contient alors ZÉRO ligne. 268 k€ ont quitté la caisse sans laisser la
// moindre trace.
//
// La raison : `historiqueFinances` n'est alimenté que par
// `enregistrerMouvementFinances`, appelé uniquement après un match. Or ONZE
// endroits modifient `club.budget` — infrastructures (club-infrastructures.js:114),
// mercato (club-mercato.js:206/207/450), prêts (club-prets.js:31), transferts
// internationaux (club-transferts-internationaux.js:82), repérage et
// signatures (club-transferts.js:76/99/208), et les deux fonctions de match.
// Neuf d'entre eux n'écrivent nulle part.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : depuis que la direction impose
// un plancher de trésorerie (P1-46), le manager est jugé sur un chiffre dont
// il ne peut pas expliquer les variations. L'onglet Finances lui montre des
// recettes de billetterie et des salaires, pendant que l'essentiel des
// mouvements — transferts et travaux — reste invisible.
//
// FONCTION EXACTE RESPONSABLE : club.js, enregistrerMouvementFinances — seul
// point d'écriture du journal, appelé seulement depuis le déroulé d'un match.
//
// SCÉNARIO DE REPRODUCTION : voir le test C1 ci-dessous, qui reproduit
// exactement la mesure ci-dessus.
//
// CE QUE CE FICHIER EXIGE :
//   1. un grand livre où PASSE chaque mouvement de trésorerie ;
//   2. l'invariant : variation du budget == somme du grand livre, toujours ;
//   3. des catégories lisibles, avec un libellé qui nomme la cause ;
//   4. une ventilation exacte par catégorie ;
//   5. des totaux qui restent justes même quand la liste affichée est bornée ;
//   6. une remise à zéro annuelle avec archivage ;
//   7. une ancienne sauvegarde qui se migre sans rien perdre.
//
// Usage : node server/test-comptes.js
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

function carriere(graine) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'AS Comptes');
  RMClub.daterCalendrier(s);
  return s;
}

// Somme de TOUT ce que le grand livre déclare pour la saison en cours.
function sommeGrandLivre(saison) {
  const t = RMClub.totauxComptes(saison);
  return RMClub.CLES_CATEGORIE_COMPTE.reduce((s, cle) => s + (t[cle] || 0), 0);
}

test('C1 — PREUVE : la variation du budget est TOUJOURS expliquée par le grand livre', () => {
  const s = carriere(4242);
  const c = s.clubJoueur;
  const budgetAvant = c.budget;

  // Exactement la séquence mesurée dans l'en-tête de ce fichier.
  const cible = s.marche[0];
  assert.strictEqual(RMClub.scouterJoueur(s, cible.id).ok, true, 'le repérage doit aboutir');
  const travaux = RMClub.lancerTravaux(s, 'medical');
  assert.strictEqual(travaux.ok, true, 'les travaux doivent démarrer');

  const variation = c.budget - budgetAvant;
  assert.ok(variation < 0, 'le budget doit avoir baissé');
  assert.strictEqual(sommeGrandLivre(s), variation,
    `le grand livre doit expliquer les ${variation} k€ (il en explique ${sommeGrandLivre(s)})`);
});

test('C2 — les catégories existent et nomment la cause', () => {
  assert.ok(Array.isArray(RMClub.CLES_CATEGORIE_COMPTE) && RMClub.CLES_CATEGORIE_COMPTE.length >= 6,
    'au moins six catégories de mouvement');
  for (const cle of RMClub.CLES_CATEGORIE_COMPTE) {
    const def = RMClub.CATEGORIES_COMPTE[cle];
    assert.ok(def && def.libelle, `${cle} doit avoir un libellé`);
    assert.ok(def.sens === 'recette' || def.sens === 'depense',
      `${cle} doit être une recette ou une dépense (${def.sens})`);
  }
});

test('C3 — chaque nature de mouvement laisse une ligne nommée', () => {
  const s = carriere(4300);
  const c = s.clubJoueur;
  const cible = s.marche[0];
  RMClub.scouterJoueur(s, cible.id);
  RMClub.lancerTravaux(s, 'entrainement');
  const lignes = RMClub.lignesComptes(s);
  const parCategorie = {};
  for (const l of lignes) parCategorie[l.categorie] = l;
  assert.ok(parCategorie.scouting, 'le repérage doit apparaître');
  assert.ok(parCategorie.travaux, 'les travaux doivent apparaître');
  assert.ok(/entra/i.test(parCategorie.travaux.libelle),
    `le libellé doit dire QUELS travaux (« ${parCategorie.travaux.libelle} »)`);
  for (const l of lignes) {
    assert.ok(typeof l.montant === 'number' && l.montant !== 0, 'un montant réel');
    assert.ok(typeof l.budgetApres === 'number', 'le solde après opération');
    assert.ok(l.libelle && l.libelle.length > 3, 'un libellé lisible');
  }
});

test('C4 — un transfert entrant est enregistré, avec le nom du joueur', () => {
  const s = carriere(4400);
  const c = s.clubJoueur;
  // Budget suffisant pour signer : on ne teste pas le refus ici.
  c.budget = 5000;
  const cible = s.marche.find((j) => j.prixTransfert > 0);
  const res = RMClub.signerJoueur(s, cible.id);
  assert.strictEqual(res.ok, true, `signature attendue (${res.motif})`);
  const ligne = RMClub.lignesComptes(s).find((l) => l.categorie === 'transfertAchat');
  assert.ok(ligne, 'un achat doit apparaître au grand livre');
  assert.ok(ligne.libelle.includes(cible.nom), `le libellé doit nommer le joueur (« ${ligne.libelle} »)`);
  assert.ok(ligne.montant < 0, 'un achat est une dépense');
  assert.strictEqual(RMClub.totauxComptes(s).transfertAchat, ligne.montant);
});

test('C5 — une recette est enregistrée avec un montant positif', () => {
  const s = carriere(4500);
  const c = s.clubJoueur;
  const budgetAvant = c.budget;
  const mouvement = RMClub.appliquerFinancesMatch(c, 'v', 26);
  assert.ok(mouvement.recette > 0);
  const totaux = RMClub.totauxComptes(s);
  assert.strictEqual(totaux.billetterie, mouvement.recette, 'la billetterie doit être isolée');
  assert.strictEqual(totaux.salaires, -mouvement.salaires, 'les salaires sont une dépense');
  assert.strictEqual(sommeGrandLivre(s), c.budget - budgetAvant,
    'un match aussi doit rester entièrement expliqué');
});

test('C6 — la ventilation par catégorie est exacte', () => {
  const s = carriere(4600);
  const c = s.clubJoueur;
  c.budget = 5000;
  const budgetAvant = c.budget;
  RMClub.appliquerFinancesMatch(c, 'v', 26);
  RMClub.scouterJoueur(s, s.marche[0].id);
  RMClub.scouterJoueur(s, s.marche[1].id);
  RMClub.lancerTravaux(s, 'stade');
  const d = RMClub.dossierComptes(s);
  assert.ok(Array.isArray(d.categories) && d.categories.length >= 1);
  const total = d.categories.reduce((t, x) => t + x.montant, 0);
  assert.strictEqual(total, c.budget - budgetAvant, 'la ventilation doit couvrir toute la variation');
  const scouting = d.categories.find((x) => x.cle === 'scouting');
  assert.strictEqual(scouting.nbOperations, 2, 'deux repérages');
  assert.ok(d.recettes > 0 && d.depenses < 0, 'recettes et dépenses doivent être séparées');
  assert.strictEqual(d.solde, d.recettes + d.depenses);
});

test('C7 — les TOTAUX restent justes même quand la liste affichée est bornée', () => {
  const s = carriere(4700);
  const c = s.clubJoueur;
  c.budget = 100000;
  const budgetAvant = c.budget;
  for (let i = 0; i < 300; i++) RMClub.appliquerFinancesMatch(c, 'v', 26);
  const lignes = RMClub.lignesComptes(s);
  assert.ok(lignes.length < 300 * 4, `la liste doit être bornée (${lignes.length} lignes)`);
  assert.strictEqual(sommeGrandLivre(s), c.budget - budgetAvant,
    'borner l\'affichage ne doit JAMAIS fausser les totaux');
});

test('C8 — la bascule de saison archive puis remet les compteurs à zéro', () => {
  const s = carriere(4800);
  const c = s.clubJoueur;
  RMClub.appliquerFinancesMatch(c, 'v', 26);
  const totauxSaison1 = Object.assign({}, RMClub.totauxComptes(s));
  assert.ok(totauxSaison1.billetterie > 0);
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(7), s);
  const apres = RMClub.totauxComptes(s);
  assert.strictEqual(apres.billetterie, 0, 'la nouvelle saison repart à zéro');
  const archive = (s.clubJoueur.historiqueComptes || []);
  assert.ok(archive.length >= 1, 'la saison écoulée doit être archivée');
  assert.strictEqual(archive[archive.length - 1].billetterie, totauxSaison1.billetterie,
    'l\'archive doit conserver les vrais totaux');
});

test('C9 — le grand livre survit à une sauvegarde', () => {
  stockage = {};
  const s = carriere(4900);
  RMClub.scouterJoueur(s, s.marche[0].id);
  const avant = RMClub.totauxComptes(s).scouting;
  assert.strictEqual(RMClub.sauvegarderSaison(s), true);
  const r = RMClub.chargerSaison();
  assert.ok(r, 'rechargement attendu');
  assert.strictEqual(RMClub.totauxComptes(r).scouting, avant, 'les totaux doivent être persistés');
  assert.ok(RMClub.lignesComptes(r).length >= 1, 'les lignes doivent être persistées');
});

test('C10 — une ancienne sauvegarde sans grand livre se migre sans rien perdre', () => {
  const s = carriere(5000);
  const c = s.clubJoueur;
  const mouvement = RMClub.appliquerFinancesMatch(c, 'v', 26);
  RMClub.enregistrerMouvementFinances(c, 1, mouvement);
  // Simule une sauvegarde d'avant le grand livre : seul l'ancien journal
  // par journée existe.
  const journal = c.historiqueFinances.slice();
  delete c.comptes;
  assert.doesNotThrow(() => RMClub.assurerComptes(s));
  const totaux = RMClub.totauxComptes(s);
  assert.strictEqual(totaux.billetterie, journal.reduce((t, m) => t + m.recette, 0),
    'les recettes déjà encaissées doivent être reprises depuis l\'ancien journal');
  assert.ok(RMClub.lignesComptes(s).length >= 1, 'et redevenir consultables');
});

test('C11 — le prévisionnel ne compte JAMAIS deux fois un chantier déjà payé', () => {
  // Bug trouvé en pilotant le jeu : avec 401 k€ en caisse et un chantier de
  // 320 k€ DÉJÀ débité au lancement, la projection annonçait 736 k€ au lieu
  // de 1056 — elle retranchait une dépense déjà sortie du budget.
  const s = carriere(5100);
  const c = s.clubJoueur;
  c.budget = 5000;
  for (let i = 0; i < 4; i++) RMClub.appliquerFinancesMatch(c, 'v', 26);
  const sansChantier = RMClub.previsionTresorerie(s, 10);
  assert.ok(sansChantier && typeof sansChantier.projection === 'number');
  assert.strictEqual(sansChantier.chantier, null, 'aucun chantier au départ');

  const budgetAvant = c.budget;
  const travaux = RMClub.lancerTravaux(s, 'stade');
  assert.strictEqual(travaux.ok, true);
  assert.strictEqual(c.budget, budgetAvant - travaux.cout, 'les travaux se paient à la commande');

  const avecChantier = RMClub.previsionTresorerie(s, 10);
  assert.strictEqual(avecChantier.projection, sansChantier.projection - travaux.cout,
    `la projection doit baisser d'EXACTEMENT le coût déjà payé, pas du double ` +
    `(${avecChantier.projection} vs ${sansChantier.projection - travaux.cout})`);
  assert.strictEqual(avecChantier.engagements, 0,
    'rien ne reste à décaisser : les travaux sont payés à la commande');
  assert.ok(avecChantier.chantier && avecChantier.chantier.joursRestants > 0,
    'le chantier doit rester visible, avec son échéance');
  assert.strictEqual(avecChantier.chantier.cout, travaux.cout);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
