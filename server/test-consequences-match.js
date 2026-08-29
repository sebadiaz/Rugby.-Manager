// COUVERTURE — les conséquences d'un match du club du joueur.
//
// Cette chaîne (enregistrement du résultat, ultimatum, finances, statistiques
// d'équipe et de joueurs, fatigue, moral, frustration de temps de jeu,
// promesses de statut) vivait dans `clubUI.js`, à l'intérieur du callback
// `onResultat` : 77 lignes, 15 appels métier, sur le chemin le plus critique
// du jeu — et AUCUN test direct. Elle n'était exercée qu'en pilotant un
// navigateur, donc jamais vérifiée dans le détail.
//
// Extraite dans `club-jour-match.js` (N6), elle devient testable ici.
//
// Usage : node server/test-consequences-match.js
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

let graine = 20000;
function contexteMatch() {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Conséquences');
  RMClub.daterCalendrier(s);
  const slot = RMClub.assurerCompositionPourEquipe(s, 'pro');
  const c = s.clubJoueur;
  const f = (s.calendrier || []).find((x) => x.domicileId === c.id) ||
            (s.calendrier || []).find((x) => x.exterieurId === c.id);
  const lettre = f.domicileId === c.id ? 'A' : 'B';
  // Un état de match plausible, de la forme que produit le moteur.
  const etat = {
    score: { A: 27, B: 15 },
    stats: {
      A: { essais: 4, carries: 90, passes: 120, rucks: 60, kicks: 20, tacklesMade: 80,
           missedTackles: 10, turnovers: 5, knockOns: 3, penalitesConcedees: 8, mauls: 2,
           scrums: 8, lineouts: 12, metresGagnes: 500, cartonsJaunes: 0 },
      B: { essais: 2, carries: 80, passes: 100, rucks: 55, kicks: 18, tacklesMade: 75,
           missedTackles: 12, turnovers: 4, knockOns: 4, penalitesConcedees: 9, mauls: 1,
           scrums: 9, lineouts: 11, metresGagnes: 420, cartonsJaunes: 0 },
    },
    statsJoueurs: { A: {}, B: {} },
  };
  const compo = slot.compositionTitulaires;
  return { s, c, f, lettre, etat, compo, forme: lettre === 'A' ? 'v' : 'd' };
}
function appliquer(ctx, extra) {
  return RMClub.appliquerConsequencesMatchJoueur(ctx.s, Object.assign({
    fixture: ctx.f, etat: ctx.etat, lettreJoueur: ctx.lettre, forme: ctx.forme,
    compositionUtilisee: ctx.compo, compositionAvecRemplacants: ctx.compo,
    rng: creerRng(7),
  }, extra || null));
}

test('C1 — le résultat est réellement enregistré au calendrier', () => {
  const ctx = contexteMatch();
  assert.ok(!ctx.f.joue, 'la rencontre ne doit pas être déjà jouée');
  appliquer(ctx);
  assert.ok(ctx.f.joue, 'la rencontre doit être marquée jouée');
  assert.strictEqual(ctx.f.score.domicile, 27);
  assert.strictEqual(ctx.f.score.exterieur, 15);
});

test('C2 — les finances bougent, du bon côté', () => {
  const ctx = contexteMatch();
  const budgetAvant = ctx.c.budget;
  const r = appliquer(ctx);
  assert.ok(r.mouvement, 'un mouvement financier doit être produit');
  assert.notStrictEqual(ctx.c.budget, budgetAvant, 'le budget doit avoir bougé');
  const totaux = RMClub.totauxComptes(ctx.s);
  assert.ok(totaux.salaires < 0, 'les salaires sont décaissés');
  const domicile = ctx.f.domicileId === ctx.c.id;
  if (domicile) {
    assert.ok(totaux.billetterie > 0, 'à domicile, la billetterie entre');
    assert.strictEqual(r.mouvement.deplacement, 0, 'et aucun déplacement payé');
  } else {
    assert.strictEqual(r.mouvement.recette, 0, 'à l\'extérieur, aucune billetterie');
    assert.ok(r.mouvement.deplacement > 0, 'mais un déplacement payé');
  }
});

test('C3 — statistiques d\'équipe cumulées depuis le match RÉEL', () => {
  const ctx = contexteMatch();
  appliquer(ctx);
  const cum = ctx.c.statsCumulees;
  assert.ok(cum, 'des statistiques cumulées doivent exister');
  assert.strictEqual(cum.essais, ctx.etat.stats[ctx.lettre].essais,
    'les essais viennent du match, pas d\'une invention');
});

test('C4 — fatigue, moral et temps de jeu appliqués aux TITULAIRES', () => {
  const ctx = contexteMatch();
  const ids = Object.values(ctx.compo);
  const avant = ids.map((id) => {
    const j = ctx.c.effectif.find((x) => x.id === id);
    return { id, fatigue: j.fatigue || 0, matchs: j.matchsJoues || 0 };
  });
  appliquer(ctx);
  let fatigues = 0, joues = 0;
  for (const a of avant) {
    const j = ctx.c.effectif.find((x) => x.id === a.id);
    if ((j.fatigue || 0) > a.fatigue) fatigues++;
    if ((j.matchsJoues || 0) > a.matchs) joues++;
  }
  assert.ok(fatigues >= 12, `les titulaires doivent avoir fatigué (${fatigues}/15)`);
  assert.ok(joues >= 12, `et compter un match de plus (${joues}/15)`);
  // Un joueur NON sélectionné ne doit ni fatiguer ni compter un match.
  const hors = ctx.c.effectif.find((j) => !ids.includes(j.id));
  assert.ok(hors, 'il doit rester des joueurs hors feuille');
  assert.strictEqual(hors.matchsJoues || 0, 0, 'un non-sélectionné ne joue pas');
});

test('C5 — l\'ordre des opérations est respecté (promesses jugées APRÈS le match)', () => {
  // Le statut promis se juge sur `matchsJoues`, incrémenté par
  // appliquerEffetsMatch. Si l'évaluation passait avant, un cadre aligné
  // paraîtrait n'avoir jamais joué.
  const ctx = contexteMatch();
  const id = Object.values(ctx.compo)[0];
  const j = ctx.c.effectif.find((x) => x.id === id);
  RMClub.definirStatutPromis(ctx.s, id, 'cadre');
  appliquer(ctx);
  assert.ok((j.matchsJoues || 0) >= 1, 'le titulaire a bien joué');
  const bilan = RMClub.bilanPromesse(j);
  assert.ok(bilan, 'un bilan de promesse doit exister');
  assert.ok((bilan.matchs || 0) >= 1,
    `la promesse doit être jugée sur un match réellement joué (${JSON.stringify(bilan)})`);
});

test('C6 — l\'ultimatum est renvoyé à l\'interface, pas affiché ici', () => {
  const ctx = contexteMatch();
  const r = appliquer(ctx);
  assert.ok('ultimatum' in r,
    'la fonction doit RENVOYER l\'issue de l\'ultimatum : l\'affichage appartient à l\'interface');
  // Sans ultimatum en cours, rien à signaler.
  assert.ok(r.ultimatum === null || typeof r.ultimatum === 'object');
});

test('C7 — deux matchs cumulent, ils ne se remplacent pas', () => {
  const ctx = contexteMatch();
  appliquer(ctx);
  const essais1 = ctx.c.statsCumulees.essais;
  const budget1 = ctx.c.budget;
  const f2 = (ctx.s.calendrier || []).find((x) => !x.joue &&
    (x.domicileId === ctx.c.id || x.exterieurId === ctx.c.id));
  assert.ok(f2, 'il doit rester une rencontre à jouer');
  const lettre2 = f2.domicileId === ctx.c.id ? 'A' : 'B';
  RMClub.appliquerConsequencesMatchJoueur(ctx.s, {
    fixture: f2, etat: ctx.etat, lettreJoueur: lettre2, forme: 'v',
    compositionUtilisee: ctx.compo, compositionAvecRemplacants: ctx.compo,
    rng: creerRng(9),
  });
  assert.ok(ctx.c.statsCumulees.essais > essais1, 'les essais se cumulent');
  assert.notStrictEqual(ctx.c.budget, budget1, 'les finances aussi');
});

// --- BUG (chasse aux bugs) : les conséquences d'un match n'étaient pas
// idempotentes, alors que son RÉSULTAT l'était.
//
// `enregistrerResultat` refuse depuis toujours de recompter une rencontre
// déjà jouée — vérifié : deuxième appel, classement inchangé. Mais
// `appliquerConsequencesMatchJoueur`, qui l'englobe, n'avait AUCUNE garde.
// Mesuré en l'appelant deux fois sur la même rencontre :
//
//   avant       budget 448, finances 0, messages 1
//   1er appel   budget 483, finances 1, messages 2
//   2e appel    budget 518, finances 2, messages 3
//
// La recette du match était encaissée DEUX FOIS, une seconde ligne de
// finances empilée, un second message de résultat envoyé — et la fatigue,
// les blessures et les statistiques appliquées une seconde fois. Seul le
// classement était protégé.
//
// La protection reposait entièrement sur un drapeau d'interface
// (`journeeEnCours` dans clubUI.js). Une garde placée à un étage du code
// qu'elle protège finit toujours par être contournée : celle-ci vit
// désormais dans la fonction elle-même, au même endroit que celle du
// résultat.
test('IDEM1 — appliquer deux fois les conséquences d\'un match ne double RIEN', () => {
  const s = RMClub.nouvelleSaison(creerRng(9911), 'AS Idempotence');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  const c = s.clubJoueur;
  const f = (s.calendrier || []).find((x) => x.domicileId === c.id || x.exterieurId === c.id);
  assert.ok(f, 'prémisse : le club doit avoir une rencontre');
  const etat = { score: { A: 24, B: 17 }, stats: { A: { essais: 3 }, B: { essais: 2 } },
    statsJoueurs: { A: {}, B: {} } };
  const params = () => ({ fixture: f, etat, lettreJoueur: f.domicileId === c.id ? 'A' : 'B',
    compositionUtilisee: c.compositionTitulaires,
    compositionAvecRemplacants: c.compositionTitulaires,
    forme: 'V', nomA: c.nom, nomB: 'Adversaire', rng: creerRng(5) });
  const lire = () => ({ budget: c.budget, finances: (c.historiqueFinances || []).length,
    messages: (c.messages || []).length,
    pts: s.classement[f.domicileId].pts + s.classement[f.exterieurId].pts,
    j: s.classement[f.domicileId].j + s.classement[f.exterieurId].j });

  RMClub.appliquerConsequencesMatchJoueur(s, params());
  const apresUn = lire();
  assert.ok(f.joue, 'prémisse : la rencontre doit être marquée jouée');
  assert.strictEqual(apresUn.finances, 1, 'une seule ligne de finances après un match');

  RMClub.appliquerConsequencesMatchJoueur(s, params());
  const apresDeux = lire();
  assert.strictEqual(apresDeux.budget, apresUn.budget,
    `la recette du match ne doit pas être encaissée deux fois (${apresUn.budget} -> ${apresDeux.budget})`);
  assert.strictEqual(apresDeux.finances, apresUn.finances,
    `une seule ligne de finances par match (${apresUn.finances} -> ${apresDeux.finances})`);
  assert.strictEqual(apresDeux.messages, apresUn.messages,
    `un seul message de résultat (${apresUn.messages} -> ${apresDeux.messages})`);
  assert.strictEqual(apresDeux.pts, apresUn.pts, 'et le classement reste inchangé');
  assert.strictEqual(apresDeux.j, apresUn.j, 'comme le nombre de matchs joués');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
