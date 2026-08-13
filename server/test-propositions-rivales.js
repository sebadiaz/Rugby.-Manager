// TEST DE PREUVE — LE MARCHÉ NE VA QUE DANS UN SENS
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré, 300 jours simulés, graine 1234) :
//
//   19 × Retour de blessure
//   16 × Blessure à l'entraînement
//    3 × Offre reçue            <- un rival veut MON joueur
//    2 × Transfert dans la division
//
//   décisions proposées : offreAchat, offreAchat, offreAchat
//   un club m'a-t-il PROPOSÉ un joueur ? NON
//
//   Le manager peut aller chercher un joueur chez un rival (G4) et les clubs
//   adverses viennent lui acheter les siens (P1-48). Mais aucun club ne lui
//   propose jamais spontanément un joueur dont il veut se défaire — alors
//   qu'ils en ont : `cessiblesDe` en trouve à tous les postes, et c'est
//   exactement ce qu'ils s'échangent entre eux depuis G5.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : le manager doit tout initier.
// Un vrai marché vient aussi vers lui — un club qui veut dégraisser, un agent
// qui appelle. Sans ça, l'onglet Recrutement est un catalogue qu'on consulte,
// jamais une place de marché où il se passe quelque chose. Et le manager n'a
// aucune occasion de saisir une opportunité qu'il n'aurait pas cherchée.
//
// FONCTION EXACTE RESPONSABLE : docs/js/club-mercato.js, `avancerJourMercato`
// — elle fait signer les rivaux sur le marché des libres, réapprovisionne, et
// depuis G5 fait vivre les transferts entre eux. Rien ne remonte vers le
// manager.
//
// SCÉNARIO DE REPRODUCTION : simuler 300 jours et lister les messages reçus.
//
// CE QUE CE FICHIER EXIGE :
//   1. des clubs qui PROPOSENT un joueur au manager ;
//   2. une proposition motivée : un joueur qu'ils veulent céder, à un poste où
//      le manager a un besoin réel ;
//   3. un prix identique à celui qu'il verrait en parcourant leur effectif —
//      une seule grille tarifaire ;
//   4. une vraie décision : acheter, négocier à la baisse, refuser ;
//   5. un achat qui déplace réellement le joueur ET l'argent ;
//   6. un refus EXPLIQUÉ si le budget ne suit pas ;
//   7. des volumes crédibles, et rien hors fenêtre de transfert.
//
// Usage : node server/test-propositions-rivales.js
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

let graine = 12000;
function nouvelleSaison(nom) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), nom || 'AS Propositions');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  return s;
}
function propositions(s) {
  return (s.clubJoueur.messages || [])
    .filter((m) => m.decision && m.decision.type === 'propositionVente');
}

// UNE saison simulée jour par jour pour toute la suite.
const SAISON = nouvelleSaison();
SAISON.clubJoueur.budget = 3000; // de quoi pouvoir dire oui, sinon rien ne se voit
for (let i = 0; i < 300; i++) RMClub.avancerUnJour(SAISON);
const RECUES = propositions(SAISON);

test('P1 — PREUVE : des clubs PROPOSENT un joueur au manager', () => {
  assert.ok(RECUES.length > 0,
    `sur 300 jours, des clubs doivent venir proposer un joueur (${RECUES.length})`);
});

test('P2 — la proposition est MOTIVÉE : leur surplus, mon besoin', () => {
  assert.strictEqual(typeof RMClub.propositionVenteRivaleDuJour, 'function',
    'la règle doit être explicite et exportée');
  for (const m of RECUES) {
    const d = m.decision;
    assert.ok(d.joueurId && d.clubId && d.joueurNom && d.clubNom,
      `chaque proposition doit désigner un joueur et un club (${JSON.stringify(d)})`);
    assert.ok(d.poste, 'et le poste concerné');
    assert.ok(typeof d.montant === 'number' && d.montant > 0,
      `avec un prix (${d.montant})`);
    assert.ok(/\d+ k€/.test(m.corps), 'le message doit annoncer le prix au manager');
  }
});

test('P3 — le prix est celui de la MÊME grille que le catalogue', () => {
  const s = nouvelleSaison();
  const cible = RMClub.joueursDesClubsAdverses(s, { limite: 1 })[0];
  const club = s.adversaires.find((c) => c.id === cible.clubId);
  const joueur = (club.groupe || club.effectif).find((j) => j.id === cible.joueurId);
  assert.strictEqual(typeof RMClub.prixDemandeAuManager, 'function',
    'une seule fonction doit fixer le prix demandé au manager');
  assert.strictEqual(RMClub.prixDemandeAuManager(s, club, joueur), cible.prixDemande,
    'le prix proposé spontanément doit être celui du catalogue');
});

test('P4 — une VRAIE décision : acheter, négocier, refuser', () => {
  assert.ok(RECUES.length > 0, 'il faut au moins une proposition pour ce test');
  const d = RECUES[0].decision;
  assert.deepStrictEqual(d.options.map((o) => o.id), ['acheter', 'negocier', 'refuser'],
    `trois suites possibles (${JSON.stringify(d.options.map((o) => o.id))})`);
  for (const o of d.options) assert.ok(o.libelle, `chaque option doit être lisible (${JSON.stringify(o)})`);
  assert.ok(d.dateLimite, 'une proposition doit expirer, comme dans un vrai marché');
});

test('P5 — ACHETER déplace réellement le joueur ET l\'argent', () => {
  const s = nouvelleSaison();
  s.clubJoueur.budget = 3000;
  let msg = null;
  for (let i = 0; i < 400 && !msg; i++) {
    RMClub.propositionVenteRivaleDuJour(creerRng(1000 + i), s, RMClub.dateCourante(s));
    msg = propositions(s)[0] || null;
  }
  assert.ok(msg, 'une proposition doit pouvoir être produite');
  const d = msg.decision;
  const club = s.adversaires.find((c) => c.id === d.clubId);
  const effectifAvant = s.clubJoueur.effectif.length;
  const budgetAvant = s.clubJoueur.budget;
  const budgetVendeurAvant = club.budget;
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, 'acheter'), true);
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant + 1, 'le joueur arrive');
  assert.ok(s.clubJoueur.effectif.some((j) => j.id === d.joueurId), 'et c\'est bien lui');
  assert.ok(!(club.groupe || club.effectif).some((j) => j.id === d.joueurId),
    'il a quitté son club');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant - d.montant, 'j\'ai payé');
  assert.strictEqual(club.budget, budgetVendeurAvant + d.montant, 'le vendeur a encaissé');
  assert.ok(RMClub.totauxComptes(s).transfertAchat < 0, 'et le grand livre le trace');
});

test('P6 — NÉGOCIER ouvre une vraie discussion, à un prix plus bas', () => {
  const s = nouvelleSaison();
  s.clubJoueur.budget = 3000;
  let msg = null;
  for (let i = 0; i < 400 && !msg; i++) {
    RMClub.propositionVenteRivaleDuJour(creerRng(2000 + i), s, RMClub.dateCourante(s));
    msg = propositions(s)[0] || null;
  }
  assert.ok(msg, 'une proposition doit pouvoir être produite');
  const d = msg.decision;
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, 'negocier'), true);
  const offre = (s.offresSortantes || []).find((o) => o.joueurId === d.joueurId);
  assert.ok(offre, 'une offre sortante doit avoir été déposée');
  assert.ok(offre.montant < d.montant,
    `et à un montant plus bas que le prix demandé (${offre.montant} < ${d.montant})`);
  assert.strictEqual(s.clubJoueur.effectif.some((j) => j.id === d.joueurId), false,
    'rien n\'est acquis tant que le club n\'a pas répondu');
});

test('P7 — BUDGET INSUFFISANT : refus EXPLIQUÉ, rien de débité', () => {
  const s = nouvelleSaison();
  s.clubJoueur.budget = 3000;
  let msg = null;
  for (let i = 0; i < 400 && !msg; i++) {
    RMClub.propositionVenteRivaleDuJour(creerRng(3000 + i), s, RMClub.dateCourante(s));
    msg = propositions(s)[0] || null;
  }
  assert.ok(msg, 'une proposition doit pouvoir être produite');
  s.clubJoueur.budget = 1;
  const effectifAvant = s.clubJoueur.effectif.length;
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, 'acheter'), true);
  assert.strictEqual(s.clubJoueur.budget, 1, 'rien ne doit être débité');
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant, 'et personne ne doit arriver');
  assert.ok(/manque|insuffisant/i.test(msg.decision.resultat || ''),
    `le refus doit être expliqué (${msg.decision.resultat})`);
});

test('P8 — volumes crédibles, et rien hors fenêtre de transfert', () => {
  assert.ok(RECUES.length <= 15,
    `un marché vivant, pas du harcèlement (${RECUES.length} propositions sur une saison)`);
  const s = nouvelleSaison();
  s.clubJoueur.budget = 3000;
  const dateFermee = RMClub.ajouterJours(RMClub.dateCourante(s), 120);
  if (!RMClub.etatFenetreTransfert(s, dateFermee).ouverte) {
    for (let i = 0; i < 300; i++) {
      assert.strictEqual(RMClub.propositionVenteRivaleDuJour(creerRng(i), s, dateFermee), null,
        'aucune proposition ne doit arriver hors fenêtre');
    }
  }
  // Et jamais deux propositions en même temps sur le même joueur.
  const ids = RECUES.map((m) => m.decision.joueurId);
  assert.strictEqual(new Set(ids).size, ids.length,
    `jamais deux propositions pour le même joueur (${ids.join(', ')})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
