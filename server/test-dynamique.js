// TEST DE PREUVE — DYNAMIQUE DE VESTIAIRE : le statut promis à un joueur
//
// ---------------------------------------------------------------------------
// PARTIE A — incohérence RÉELLE introduite par le correctif P0-composition
// ---------------------------------------------------------------------------
// COMPORTEMENT ACTUEL OBSERVÉ : depuis le correctif P0-composition, la
// sélection automatique classe les joueurs avec `noteAuPoste` (mêlée pour un
// pilier, touche pour un deuxième ligne, passe pour un demi de mêlée...).
// Mais `estCandidatSelectionAttendue` (club-decisions.js) est restée sur
// l'ancien critère `vitesse + plaquage`, et son commentaire affirme encore
// suivre "le même critère que meilleurCandidatPourNumero".
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : le jeu se contredit lui-même.
// Le pilier athlétique mais nul en mêlée n'est (correctement) plus aligné,
// et vient pourtant réclamer sa place tous les trois matchs ; le vrai
// deuxième pilier du poste, lui, ne se plaint jamais. Le manager est puni
// (moral en baisse, demande de transfert) pour avoir fait le BON choix.
//
// FONCTION EXACTE RESPONSABLE : club-decisions.js, estCandidatSelectionAttendue.
//
// SCÉNARIO DE REPRODUCTION : trois piliers, dont un rapide/plaqueur mais nul
// en mêlée. Il figure dans les deux "candidats attendus" alors que la
// composition automatique ne le retient jamais.
//
// ---------------------------------------------------------------------------
// PARTIE B — ce qui MANQUE : le statut promis
// ---------------------------------------------------------------------------
// COMPORTEMENT ACTUEL OBSERVÉ : le manager ne peut RIEN promettre à un
// joueur. La seule dynamique existante est subie : au bout de trois journées
// sans sélection, un joueur du top 2 de son poste vient réclamer du temps de
// jeu (appliquerFrustrationTempsDeJeu). Le manager ne peut ni annoncer à un
// cadre qu'il comptera sur lui, ni dire à un jeune qu'il devra patienter.
// `grep statutPromis docs/js` ne renvoie rien.
//
// POURQUOI C'EST INSUFFISANT : sans engagement, il n'y a pas de rupture
// d'engagement — donc aucune tension de vestiaire. Un effectif de 30 joueurs
// se pilote en promettant des rôles et en les tenant ou non ; c'est ce qui
// donne du poids à une feuille de match. Aujourd'hui, aligner ou non un
// joueur n'engage le manager sur rien.
//
// CE QUE CE FICHIER EXIGE :
//   1. un statut promis PERSISTANT par joueur (cadre / rotation / espoir) ;
//   2. une conséquence IMMÉDIATE sur le moral au moment de la promesse ;
//   3. une évaluation fondée sur les SÉLECTIONS RÉELLES, pas sur un compteur
//      décoratif ;
//   4. une promesse tenue qui ne déclenche RIEN (sinon le système punirait
//      un manager irréprochable) ;
//   5. une promesse rompue qui déclenche une VRAIE décision, avec trois
//      issues réellement différentes ;
//   6. un état qui survit à une sauvegarde/rechargement.
//
// Usage : node server/test-dynamique.js
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
  const s = RMClub.nouvelleSaison(creerRng(graine), 'Vestiaire');
  RMClub.daterCalendrier(s);
  return s;
}

// Pilier fabriqué de toutes pièces : on veut un classement SANS ambiguïté,
// pas un tirage aléatoire à interpréter.
function pilier(id, nom, attrs) {
  return Object.assign({
    id, nom, poste: 'P', age: 26, numero: 1,
    vitesse: 60, plaquage: 60, adresse: 40, melee: 60, touche: 40,
    puissance: 70, endurance: 60, passe: 45, jeuPied: 30,
    decision: 55, discipline: 60, potentiel: 75,
    fatigue: 0, moral: 65, contrat: 3, salaire: 120,
    blessureJournees: 0, pret: null, matchsJoues: 0, statsSaison: null,
  }, attrs);
}

// ---------------------------------------------------------------------------
// PARTIE A
// ---------------------------------------------------------------------------

test("A — le prétendant légitime est jugé AU POSTE, pas sur vitesse+plaquage", () => {
  // Athlète : excellent en vitesse/plaquage, catastrophique en mêlée.
  // Specialiste1/2 : moyens partout mais bons en mêlée — les vrais piliers.
  const athlete = pilier('pA', 'Athlète', { vitesse: 95, plaquage: 95, melee: 20, puissance: 60 });
  const spe1 = pilier('pB', 'Spécialiste 1', { vitesse: 58, plaquage: 62, melee: 90, puissance: 85 });
  const spe2 = pilier('pC', 'Spécialiste 2', { vitesse: 55, plaquage: 60, melee: 86, puissance: 82 });
  const effectif = [athlete, spe1, spe2];

  // Ce que dit la sélection automatique (référence).
  const nA = RMClub.noteAuPoste(athlete, 'P');
  const nB = RMClub.noteAuPoste(spe1, 'P');
  const nC = RMClub.noteAuPoste(spe2, 'P');
  assert.ok(nB > nA && nC > nA,
    `les deux spécialistes doivent primer au poste (athlète ${nA}, spé ${nB}/${nC})`);

  // Ce que doit dire la frustration : les MÊMES deux joueurs.
  assert.strictEqual(RMClub.estCandidatSelectionAttendue(effectif, spe1), true,
    'le meilleur pilier de mêlée doit être un prétendant légitime');
  assert.strictEqual(RMClub.estCandidatSelectionAttendue(effectif, spe2), true,
    'le deuxième pilier de mêlée doit être un prétendant légitime');
  assert.strictEqual(RMClub.estCandidatSelectionAttendue(effectif, athlete), false,
    "un pilier incapable de tenir une mêlée ne peut pas réclamer la place d'un spécialiste");
});

// ---------------------------------------------------------------------------
// PARTIE B
// ---------------------------------------------------------------------------

test('B1 — les statuts promis existent et sont hiérarchisés', () => {
  assert.ok(Array.isArray(RMClub.CLES_STATUT) && RMClub.CLES_STATUT.length >= 3,
    'RMClub.CLES_STATUT doit lister au moins trois statuts');
  for (const cle of RMClub.CLES_STATUT) {
    const def = RMClub.STATUTS[cle];
    assert.ok(def && def.libelle, `${cle} doit avoir un libellé`);
    assert.ok(typeof def.rang === 'number', `${cle} doit avoir un rang comparable`);
    assert.ok(typeof def.tauxTitulaireAttendu === 'number',
      `${cle} doit dire ce qu'il PROMET en temps de jeu`);
  }
  const rangs = RMClub.CLES_STATUT.map((c) => RMClub.STATUTS[c].rang);
  assert.strictEqual(new Set(rangs).size, rangs.length, 'les rangs doivent être distincts');
});

test('B2 — promettre un statut a une conséquence IMMÉDIATE sur le moral', () => {
  const s = carriere(7001);
  const j = s.clubJoueur.effectif.find((x) => x.age >= 24);
  j.moral = 60;
  const promu = RMClub.definirStatutPromis(s, j.id, 'cadre');
  assert.strictEqual(promu.ok, true, 'la promesse doit aboutir');
  assert.strictEqual(j.statutPromis, 'cadre', 'le statut doit être écrit sur le joueur');
  assert.ok(j.moral > 60, `être nommé cadre doit flatter (moral ${j.moral})`);

  const moralAvantRetro = j.moral;
  const retro = RMClub.definirStatutPromis(s, j.id, 'espoir');
  assert.strictEqual(retro.ok, true);
  assert.ok(j.moral < moralAvantRetro,
    `rétrograder un cadre de 26 ans en espoir doit le vexer (moral ${j.moral})`);
});

test("B3 — une promesse TENUE ne déclenche aucune réclamation", () => {
  const s = carriere(7002);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  const messagesAvant = (c.messages || []).length;
  // Dix journées où il est titulaire : la promesse est parfaitement tenue.
  for (let i = 0; i < 10; i++) {
    c.statsCumulees = c.statsCumulees || { matchsJoues: 0 };
    c.statsCumulees.matchsJoues++;
    j.matchsJoues++;
    RMClub.evaluerPromessesStatut(s, { 1: j.id }, {});
  }
  const nouveaux = (c.messages || []).slice(0, (c.messages || []).length - messagesAvant);
  assert.strictEqual(nouveaux.filter((m) => m.decision && m.decision.type === 'statut').length, 0,
    'un manager qui tient parole ne doit recevoir aucune plainte');
});

test('B4 — une promesse ROMPUE déclenche une vraie décision, datée', () => {
  const s = carriere(7003);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  // Dix journées SANS lui : la promesse de cadre est manifestement rompue.
  for (let i = 0; i < 10; i++) {
    c.statsCumulees = c.statsCumulees || { matchsJoues: 0 };
    c.statsCumulees.matchsJoues++;
    RMClub.evaluerPromessesStatut(s, {}, {});
  }
  const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'statut');
  assert.ok(msg, 'le joueur doit venir demander des comptes');
  assert.strictEqual(msg.decision.joueurId, j.id);
  assert.ok(msg.decision.dateLimite, 'la décision doit être datée (le silence a un coût)');
  const ids = msg.decision.options.map((o) => o.id).sort();
  assert.deepStrictEqual(ids, ['ignorer', 'maintenir', 'revoir'],
    'trois issues réellement différentes doivent être proposées');
  // Pas de harcèlement : une seule demande tant qu'elle n'est pas tranchée.
  const nb = (c.messages || []).filter((m) => m.decision && m.decision.type === 'statut'
    && m.decision.joueurId === j.id).length;
  assert.strictEqual(nb, 1, `une seule demande en attente à la fois (${nb})`);
});

test('B5 — les trois issues ont des conséquences RÉELLEMENT différentes', () => {
  function scenario(choix) {
    const s = carriere(7100 + choix.length);
    const c = s.clubJoueur;
    const j = c.effectif[0];
    RMClub.definirStatutPromis(s, j.id, 'cadre');
    j.moral = 70;
    for (let i = 0; i < 10; i++) {
      c.statsCumulees = c.statsCumulees || { matchsJoues: 0 };
      c.statsCumulees.matchsJoues++;
      RMClub.evaluerPromessesStatut(s, {}, {});
    }
    const msg = (c.messages || []).find((m) => m.decision && m.decision.type === 'statut');
    assert.ok(msg, 'demande attendue');
    assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, choix), true,
      `l'option ${choix} doit être acceptée`);
    return { joueur: j, saison: s, decision: msg.decision };
  }

  const revoir = scenario('revoir');
  assert.notStrictEqual(revoir.joueur.statutPromis, 'cadre',
    "« revoir son statut » doit RÉELLEMENT déclasser le joueur, pas seulement afficher un texte");
  assert.ok(revoir.joueur.moral < 70, 'être déclassé fait mal');
  assert.strictEqual(revoir.joueur.veutPartir !== true, true,
    'un manager honnête ne doit pas provoquer un départ');

  const maintenir = scenario('maintenir');
  assert.strictEqual(maintenir.joueur.statutPromis, 'cadre', 'le statut est confirmé');
  assert.ok(maintenir.joueur.moral > 70, `être rassuré remonte le moral (${maintenir.joueur.moral})`);

  const ignorer = scenario('ignorer');
  assert.strictEqual(ignorer.joueur.statutPromis, 'cadre', 'le statut promis reste affiché tel quel');
  assert.ok(ignorer.joueur.moral < revoir.joueur.moral,
    `ignorer doit coûter plus cher que revoir honnêtement (${ignorer.joueur.moral} vs ${revoir.joueur.moral})`);

  assert.ok(revoir.decision.resultat && maintenir.decision.resultat && ignorer.decision.resultat,
    'chaque issue doit produire un compte rendu lisible');
  assert.notStrictEqual(revoir.decision.resultat, ignorer.decision.resultat);
});

test('B6 — une promesse maintenue puis rompue une seconde fois casse la relation', () => {
  const s = carriere(7200);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  function ignorerDixJournees() {
    for (let i = 0; i < 10; i++) {
      c.statsCumulees = c.statsCumulees || { matchsJoues: 0 };
      c.statsCumulees.matchsJoues++;
      RMClub.evaluerPromessesStatut(s, {}, {});
    }
    return (c.messages || []).find((m) => m.decision && m.decision.type === 'statut' && !m.decision.resolu);
  }
  const m1 = ignorerDixJournees();
  RMClub.resoudreDecisionMessage(s, m1.id, 'maintenir');
  assert.strictEqual(j.veutPartir !== true, true, 'pas encore de rupture après une promesse maintenue');
  const m2 = ignorerDixJournees();
  assert.ok(m2, 'le joueur revient si la promesse renouvelée est rompue à son tour');
  RMClub.resoudreDecisionMessage(s, m2.id, 'ignorer');
  assert.strictEqual(j.veutPartir, true,
    'une promesse renouvelée puis trahie doit provoquer une demande de transfert');
});

test('B7 — le statut promis survit à une sauvegarde et un rechargement', () => {
  stockage = {};
  const s = carriere(7300);
  const j = s.clubJoueur.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'rotation');
  s.clubJoueur.statsCumulees = { matchsJoues: 12 };
  assert.strictEqual(RMClub.sauvegarderSaison(s), true, 'sauvegarde attendue');
  const recharge = RMClub.chargerSaison();
  assert.ok(recharge, 'rechargement attendu');
  const jr = recharge.clubJoueur.effectif.find((x) => x.id === j.id);
  assert.strictEqual(jr.statutPromis, 'rotation', 'le statut doit être persisté');
  assert.strictEqual(jr.statutRefMatchs, j.statutRefMatchs,
    'la référence de suivi doit être persistée, sinon la promesse repart à zéro à chaque chargement');
});

test('B8 — le dossier de dynamique est dérivé des sélections RÉELLES', () => {
  const s = carriere(7400);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  for (let i = 0; i < 8; i++) {
    c.statsCumulees = c.statsCumulees || { matchsJoues: 0 };
    c.statsCumulees.matchsJoues++;
    if (i % 4 === 0) j.matchsJoues++;
    RMClub.evaluerPromessesStatut(s, i % 4 === 0 ? { 1: j.id } : {}, {});
  }
  const dossier = RMClub.dossierDynamique(s);
  assert.ok(Array.isArray(dossier.lignes) && dossier.lignes.length === c.effectif.length,
    'une ligne par joueur de l’effectif');
  const ligne = dossier.lignes.find((l) => l.id === j.id);
  assert.strictEqual(ligne.statut, 'cadre');
  assert.strictEqual(ligne.matchsDepuisPromesse, 8, 'le dénominateur vient des matchs du club');
  assert.strictEqual(ligne.titularisationsDepuisPromesse, 2, 'le numérateur vient de matchsJoues');
  assert.strictEqual(ligne.promesseTenue, false, '2/8 ne tient pas une promesse de cadre');
});

test("B9bis — un remplaçant entré en jeu n'est JAMAIS compté deux fois", () => {
  // Bug trouvé en pilotant le jeu dans le navigateur : après UN seul match, un
  // joueur affichait 1 titularisation ET 1 entrée en jeu, soit 1,5 match pour
  // une seule feuille. `matchsJoues` est incrémenté par appliquerFatigue avec
  // le XV APRÈS remplacements ; c'est donc ce même XV qui doit arriver ici.
  const s = carriere(7600);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  // Le joueur est entré en jeu : il figure dans le banc de départ ET dans le
  // XV transmis (celui d'après remplacements), et matchsJoues a été incrémenté.
  j.matchsJoues++;
  RMClub.evaluerPromessesStatut(s, { 20: j.id }, { 20: j.id });
  const b = RMClub.bilanPromesse(j);
  assert.strictEqual(b.titulaire, 1, 'il a bien joué');
  assert.strictEqual(b.banc, 0, `il ne doit pas compter EN PLUS comme remplaçant (${b.banc})`);
  assert.strictEqual(b.matchs, 1);
  assert.strictEqual(b.part, 1, `un match joué en entier vaut 1, pas 1,5 (${b.part})`);
});

test('B9ter — un remplaçant NON utilisé compte pour une demi-participation', () => {
  const s = carriere(7601);
  const c = s.clubJoueur;
  const j = c.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  RMClub.evaluerPromessesStatut(s, {}, { 20: j.id });
  const b = RMClub.bilanPromesse(j);
  assert.strictEqual(b.titulaire, 0);
  assert.strictEqual(b.banc, 1, 'il était bien sur la feuille de match');
  assert.strictEqual(b.part, 0.5, `présent sans jouer = une demi-participation (${b.part})`);
});

test('B9quater — un joueur blessé PENDANT le match compte quand même ce match', () => {
  // Deuxième bug trouvé en pilotant le jeu : les blessures sont appliquées
  // avant l'évaluation. Un titulaire sorti sur blessure voyait matchsJoues
  // passer à 1 pendant que matchsDisponibles restait à 0 — bilan absurde
  // (2 titularisations sur 0 match) et promesse jamais jugeable.
  const s = carriere(7700);
  const j = s.clubJoueur.effectif[0];
  RMClub.definirStatutPromis(s, j.id, 'cadre');
  j.matchsJoues++;
  j.blessureJournees = 7; // il est sorti sur blessure pendant ce match
  RMClub.evaluerPromessesStatut(s, { 5: j.id }, {});
  const b = RMClub.bilanPromesse(j);
  assert.strictEqual(b.matchs, 1, 'le match où il a joué doit compter');
  assert.strictEqual(b.part, 1, `1 titularisation sur 1 match = 100 % (${b.part})`);
  // Les matchs SUIVANTS, où il est indisponible, ne comptent pas contre le manager.
  RMClub.evaluerPromessesStatut(s, {}, {});
  RMClub.evaluerPromessesStatut(s, {}, {});
  assert.strictEqual(RMClub.bilanPromesse(j).matchs, 1,
    'une blessure longue ne doit pas transformer la promesse en trahison');
});

test("B9 — un joueur sans statut promis n'est jamais évalué (aucun bruit)", () => {
  const s = carriere(7500);
  const c = s.clubJoueur;
  const avant = (c.messages || []).length;
  for (let i = 0; i < 15; i++) {
    c.statsCumulees = c.statsCumulees || { matchsJoues: 0 };
    c.statsCumulees.matchsJoues++;
    RMClub.evaluerPromessesStatut(s, {}, {});
  }
  const apres = (c.messages || []).filter((m) => m.decision && m.decision.type === 'statut').length;
  assert.strictEqual(apres, 0, 'sans promesse, pas de reproche');
  assert.strictEqual((c.messages || []).length, avant, 'aucun message parasite');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
