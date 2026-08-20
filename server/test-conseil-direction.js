// COUVERTURE — les décisions qui viennent de LA DIRECTION.
//
// Audit mesuré avant cette tranche, sur 12 saisons simulées (4 carrières × 3) :
//
//   offreAchat            117   (9,8 / saison)
//   propositionVente       37   (3,1 / saison)
//   ------------------------------------------
//   TOTAL                 154   — et rien d'autre.
//
// Sept types de décision existent dans le code (tempsDeJeu, vestiaire,
// statut, offreAchat, negociationContrat, offreSortante, propositionVente),
// mais trois d'entre eux sont des RÉPONSES à une action du manager : ils
// n'existent que s'il a déjà proposé un contrat, fait une offre ou promis un
// statut. En pratique, la boîte de réception ne propose donc au manager que
// des mouvements de joueurs.
//
// La direction, elle, ne lui demande JAMAIS rien : son point d'étape est un
// message avec un chiffre (« Confiance −4 (31 %) »), et son ultimatum est
// imposé, pas arbitré. Aucune décision du jeu ne touche à la confiance du
// président ni à la trajectoire de la carrière.
//
// Cette tranche ajoute les deux arbitrages que le conseil pose vraiment à un
// manager : « on met de l'argent, mais on relève l'objectif » et « les
// comptes ne suivent plus, il faut vendre ».
//
// Usage : node server/test-conseil-direction.js
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

let graine = 310000;
// Une carrière dont la saison a RÉELLEMENT commencé : un conseil
// d'administration ne se prononce pas avant d'avoir vu jouer son équipe.
const MATCHS_JOUES = 4;
function carriere(matchsJoues) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Conseil');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  const id = s.clubJoueur.id;
  const miennes = (s.calendrier || []).filter((f) => f.domicileId === id || f.exterieurId === id);
  const n = matchsJoues != null ? matchsJoues : MATCHS_JOUES;
  for (let i = 0; i < n && i < miennes.length; i++) miennes[i].joue = true;
  return s;
}
// Met le club dans la situation exacte où le conseil propose une rallonge :
// la direction a confiance et l'objectif laisse de la marge.
function clubEnConfiance() {
  const s = carriere();
  s.clubJoueur.confiancePresident = 80;
  s.clubJoueur.objectifSaison = { position: 7, totalClubs: 14 };
  return s;
}
// Et celle où elle exige des économies : le budget ne couvre plus la masse
// salariale.
function clubEnDifficulte() {
  const s = carriere();
  s.clubJoueur.confiancePresident = 55;
  s.clubJoueur.objectifSaison = { position: 7, totalClubs: 14 };
  s.clubJoueur.budget = Math.round(RMClub.masseSalariale(s.clubJoueur.effectif) * 0.2);
  return s;
}
function proposer(s) {
  return RMClub.propositionConseilDuJour(s, RMClub.dateCourante(s));
}
function messageDecision(s, type) {
  return (s.clubJoueur.messages || []).find((m) => m.decision && m.decision.type === type
    && !m.decision.resolu);
}

test('C1 — la direction PROPOSE enfin quelque chose au manager', () => {
  const s = clubEnConfiance();
  const p = proposer(s);
  assert.ok(p, 'le conseil doit pouvoir faire une proposition');
  const m = messageDecision(s, 'conseil');
  assert.ok(m, 'et elle doit arriver dans la boîte de réception');
  assert.ok(m.corps && m.corps.length > 40, 'avec un texte qui explique la situation');
  assert.ok(m.decision.options.length >= 2, 'et au moins deux issues');
  assert.ok(m.decision.dateLimite, 'avec une échéance, comme toute décision');
});

test('C2 — la rallonge n\'est proposée QUE si la direction a confiance', () => {
  const s = clubEnConfiance();
  s.clubJoueur.confiancePresident = 25;
  const p = proposer(s);
  assert.ok(!p || p.variante !== 'rallonge',
    'une direction méfiante ne met pas d\'argent sur la table');
  const ok = clubEnConfiance();
  assert.strictEqual(proposer(ok).variante, 'rallonge',
    'une direction confiante, elle, le fait');
});

test('C3 — PREUVE : accepter la rallonge CRÉDITE vraiment le budget', () => {
  const s = clubEnConfiance();
  const p = proposer(s);
  const budgetAvant = s.clubJoueur.budget;
  const m = messageDecision(s, 'conseil');
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, m.id, 'accepter'), true);
  assert.strictEqual(s.clubJoueur.budget, budgetAvant + p.montant,
    `le budget doit monter de ${p.montant} k€`);
  const t = RMClub.totauxComptes(s);
  assert.strictEqual(Math.round(t.direction), p.montant,
    `et la ligne doit apparaître au grand livre (${JSON.stringify(t.direction)})`);
  assert.ok(m.decision.resultat && m.decision.resultat.length > 15,
    'le manager doit lire ce qui a été décidé');
});

test('C4 — et RELÈVE réellement l\'objectif, jugé en fin de saison', () => {
  const s = clubEnConfiance();
  const avant = s.clubJoueur.objectifSaison.position;
  const p = proposer(s);
  const m = messageDecision(s, 'conseil');
  RMClub.resoudreDecisionMessage(s, m.id, 'accepter');
  const apres = s.clubJoueur.objectifSaison.position;
  assert.ok(apres < avant, `l'objectif doit devenir plus dur (${avant}e -> ${apres}e)`);
  assert.strictEqual(apres, p.objectifVise, 'et correspondre à ce qui était annoncé');
  // Conséquence RÉELLE de carrière : finir à l'ancienne position ne suffit
  // plus. Même barème que la fin de saison, aucune règle parallèle.
  const eval1 = RMClub.evaluerObjectifSaison({ position: avant, totalClubs: 14 }, avant, 60);
  const eval2 = RMClub.evaluerObjectifSaison(s.clubJoueur.objectifSaison, avant, 60);
  assert.strictEqual(eval1.reussi, true, 'l\'ancien objectif était atteint à cette place');
  assert.strictEqual(eval2.reussi, false, 'le nouveau ne l\'est plus');
});

test('C5 — refuser la rallonge ne coûte rien, sauf un peu de confiance', () => {
  const s = clubEnConfiance();
  proposer(s);
  const budgetAvant = s.clubJoueur.budget;
  const objectifAvant = s.clubJoueur.objectifSaison.position;
  const confianceAvant = s.clubJoueur.confiancePresident;
  const m = messageDecision(s, 'conseil');
  RMClub.resoudreDecisionMessage(s, m.id, 'refuser');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant, 'aucun mouvement d\'argent');
  assert.strictEqual(s.clubJoueur.objectifSaison.position, objectifAvant, 'objectif inchangé');
  assert.ok(s.clubJoueur.confiancePresident < confianceAvant,
    `refuser une ambition se paie en confiance (${confianceAvant} -> ${s.clubJoueur.confiancePresident})`);
});

test('C6 — l\'exigence d\'économies n\'arrive que si les comptes le justifient', () => {
  const sain = clubEnConfiance();
  const p1 = proposer(sain);
  assert.ok(!p1 || p1.variante !== 'economies',
    'un club qui paie ses salaires n\'a pas à vendre');
  const s = clubEnDifficulte();
  const p2 = proposer(s);
  assert.ok(p2 && p2.variante === 'economies',
    'un club qui ne couvre plus sa masse salariale, si');
  assert.ok(p2.joueurNom, 'et le conseil dit QUI il veut vendre');
  assert.ok(p2.montant > 0, 'pour combien');
});

test('C7 — PREUVE : accepter l\'exigence VEND le joueur et renfloue le club', () => {
  const s = clubEnDifficulte();
  const p = proposer(s);
  const budgetAvant = s.clubJoueur.budget;
  const effectifAvant = s.clubJoueur.effectif.length;
  const m = messageDecision(s, 'conseil');
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, m.id, 'accepter'), true);
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant - 1,
    'le joueur doit vraiment quitter l\'effectif');
  assert.strictEqual(s.clubJoueur.effectif.some((j) => j.id === p.joueurId), false,
    `${p.joueurNom} ne doit plus être là`);
  assert.ok(s.clubJoueur.budget > budgetAvant,
    `et le club doit encaisser (${budgetAvant} -> ${s.clubJoueur.budget})`);
  // Le joueur rejoint RÉELLEMENT son nouveau club : il ne disparaît pas du
  // monde. Un club adverse a deux listes — `groupe`, son effectif complet, et
  // `effectif`, les quinze prêts à jouer (cf. club-mercato.js) : une recrue
  // arrive dans le groupe, pas d'office dans le XV.
  const acheteur = (s.adversaires || []).find((a) => a.id === p.acheteurId);
  assert.ok(acheteur, 'le club acheteur doit exister');
  assert.ok((acheteur.groupe || acheteur.effectif || []).some((j) => j.id === p.joueurId),
    `${p.joueurNom} doit se retrouver dans le groupe de ${p.acheteurNom}`);
  // Et il a PAYÉ : l'argent ne sort pas de nulle part.
  assert.ok(acheteur.budget >= 0, 'le club acheteur ne doit pas finir à découvert');
});

test('C8 — refuser l\'exigence garde le joueur, mais coûte cher en confiance', () => {
  const s = clubEnDifficulte();
  const p = proposer(s);
  const confianceAvant = s.clubJoueur.confiancePresident;
  const effectifAvant = s.clubJoueur.effectif.length;
  const m = messageDecision(s, 'conseil');
  RMClub.resoudreDecisionMessage(s, m.id, 'refuser');
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant, 'personne ne part');
  assert.ok(s.clubJoueur.effectif.some((j) => j.id === p.joueurId), 'le joueur reste');
  const perte = confianceAvant - s.clubJoueur.confiancePresident;
  assert.ok(perte > 0, 'tenir tête au conseil se paie');
  // Et plus cher que de refuser une simple ambition : ici les comptes sont
  // en jeu, pas une envie de la direction.
  const sr = clubEnConfiance();
  proposer(sr);
  const cAvant = sr.clubJoueur.confiancePresident;
  RMClub.resoudreDecisionMessage(sr, messageDecision(sr, 'conseil').id, 'refuser');
  assert.ok(perte > cAvant - sr.clubJoueur.confiancePresident,
    'refuser des économies doit coûter plus que refuser une rallonge');
});

test('C9 — une seule proposition ouverte, et un délai entre deux', () => {
  const s = clubEnConfiance();
  assert.ok(proposer(s), 'la première passe');
  assert.strictEqual(proposer(s), null, 'la deuxième ne double pas la première');
  const m = messageDecision(s, 'conseil');
  RMClub.resoudreDecisionMessage(s, m.id, 'refuser');
  assert.strictEqual(proposer(s), null,
    'et même résolue, le conseil ne revient pas le lendemain');
});

test('C10 — le silence vaut refus, par le chemin GÉNÉRIQUE des décisions', () => {
  const s = clubEnConfiance();
  proposer(s);
  const m = messageDecision(s, 'conseil');
  const budgetAvant = s.clubJoueur.budget;
  const objectifAvant = s.clubJoueur.objectifSaison.position;
  const limite = RMClub.dateDepuisISO(m.decision.dateLimite);
  const expirees = RMClub.resoudreDecisionsExpirees(s, RMClub.ajouterJours(limite, 1));
  assert.ok(expirees.length >= 1, 'la décision non tranchée doit expirer');
  assert.strictEqual(m.decision.resolu, true, 'et être marquée résolue');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant, 'sans argent versé');
  assert.strictEqual(s.clubJoueur.objectifSaison.position, objectifAvant, 'sans objectif relevé');
});

test('C11 — répondre deux fois ne double aucun effet', () => {
  const s = clubEnConfiance();
  const p = proposer(s);
  const m = messageDecision(s, 'conseil');
  const budgetAvant = s.clubJoueur.budget;
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, m.id, 'accepter'), true);
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, m.id, 'accepter'), false,
    'le second appel doit être refusé');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant + p.montant,
    'et le budget ne doit être crédité qu\'une fois');
});

test('C12 — la proposition survit à une sauvegarde/rechargement', () => {
  const s = clubEnConfiance();
  const p = proposer(s);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const m = (rechargee.clubJoueur.messages || []).find((x) => x.decision
    && x.decision.type === 'conseil' && !x.decision.resolu);
  assert.ok(m, 'la proposition doit toujours être là');
  const budgetAvant = rechargee.clubJoueur.budget;
  assert.strictEqual(RMClub.resoudreDecisionMessage(rechargee, m.id, 'accepter'), true,
    'et rester tranchable après rechargement');
  assert.strictEqual(rechargee.clubJoueur.budget, budgetAvant + p.montant);
});

test('C0 — le conseil ne dit RIEN avant que la saison ait commencé', () => {
  // Mesuré en branchant la tranche : sans cette borne, la proposition tombait
  // dès le PREMIER jour d'une carrière neuve — un conseil qui parle d'objectif
  // avant le premier match n'a rien à juger. Deux garanties déjà en place
  // (test-parcours-club) l'ont attrapé avant moi.
  const s = carriere(0);
  s.clubJoueur.confiancePresident = 80;
  s.clubJoueur.objectifSaison = { position: 7, totalClubs: 14 };
  assert.strictEqual(proposer(s), null, 'aucune journée jouée : le conseil se tait');
  const s2 = carriere(2);
  s2.clubJoueur.confiancePresident = 80;
  s2.clubJoueur.objectifSaison = { position: 7, totalClubs: 14 };
  assert.strictEqual(proposer(s2), null, 'deux journées ne suffisent pas non plus');
  const s3 = carriere(3);
  s3.clubJoueur.confiancePresident = 80;
  s3.clubJoueur.objectifSaison = { position: 7, totalClubs: 14 };
  assert.ok(proposer(s3), 'à partir de trois journées, il peut se prononcer');
});

test('C13 — aucune proposition sans situation réelle : rien n\'est inventé', () => {
  const s = carriere();
  // Club neutre, sans objectif défini : le conseil n'a rien à arbitrer.
  s.clubJoueur.objectifSaison = null;
  assert.strictEqual(proposer(s), null,
    'sans objectif, aucune ambition à relever ni à refuser');
  // Confiance moyenne, comptes sains : rien non plus.
  const s2 = carriere();
  s2.clubJoueur.confiancePresident = 45;
  s2.clubJoueur.objectifSaison = { position: 7, totalClubs: 14 };
  assert.strictEqual(proposer(s2), null,
    'ni rallonge (confiance insuffisante) ni économies (comptes sains)');
});

test('C14 — le conseil arrive TOUT SEUL au fil des jours, sans appel manuel', () => {
  const s = clubEnConfiance();
  let vue = null;
  for (let i = 0; i < 60 && !vue; i++) {
    RMClub.avancerUnJour(s);
    vue = messageDecision(s, 'conseil');
  }
  assert.ok(vue, 'la proposition doit surgir dans la boucle de jeu normale');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
