// TEST DE PREUVE — LE MATCH NE RACONTE RIEN
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré) :
//
//   engine/rugby-engine.js, log() :
//       this.events.push({...});
//       if (this.events.length > 30) this.events.shift();
//
//   Sur un match complet (graine 7), `getState().events` contient 30 entrées,
//   TOUTES situées après la 78e minute. Tout le reste du match a été jeté.
//   L'interface, elle, n'en affiche que 5 (docs/js/ui.js, « les 5 derniers »).
//
//   Et après un match SIMULÉ en Mode Club, le panneau de résultat affiche un
//   badge, un score et une ligne de détail — aucune chronologie, aucun
//   marqueur, aucun compte rendu.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : le match est le cœur du jeu, et
// il ne dit rien de ce qu'il s'est passé. Qui a marqué ? Quand ? Le match
// s'est-il joué en première ou en seconde période ? Y a-t-il eu un carton ?
// Le manager ne peut ni comprendre le résultat, ni juger sa tactique, ni
// raconter sa saison. Un score seul n'est pas un match.
//
// FONCTIONS EXACTES RESPONSABLES : engine/rugby-engine.js `log()` (fenêtre
// glissante de 30) et docs/js/main.js (panneau de résultat).
//
// CE QUE CE FICHIER EXIGE :
//   1. une CHRONOLOGIE des faits marquants de TOUT le match ;
//   2. chaque fait daté à la minute, avec son équipe et un texte lisible ;
//   3. toutes les actions de score présentes, sans exception ;
//   4. une liste bornée (pas de croissance infinie en mémoire) ;
//   5. une feuille de match assemblée pour l'écran, avec marqueurs et
//      statistiques comparées ;
//   6. le fil « live » des 30 derniers événements doit continuer de marcher.
//
// Usage : node server/test-feuille-de-match.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
const RugbyEngine = require('../docs/rugby-engine.js');
global.window.RugbyEngine = RugbyEngine;
const { chargerRMClub } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

// UN SEUL match joué pour toute la suite : chaque match complet coûte
// plusieurs secondes, les rejouer par test rendrait la suite inutilisable.
function jouerUnMatch(graine) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, null);
  let n = 0;
  while (m.getState().phase !== 'TERMINE' && n < 400000) { m.tick(1 / 20); n++; }
  return m.getState();
}
const ETAT = jouerUnMatch(7);

test('E1 — PREUVE : le fil live ne garde que la fin du match', () => {
  // Ce comportement est VOULU pour l'affichage temps réel (fenêtre glissante,
  // 5 lignes à l'écran). Ce qu'il ne peut pas faire, c'est servir de compte
  // rendu — et c'est exactement ce qui manquait.
  assert.ok(ETAT.events.length <= 30,
    `le fil live reste borné (${ETAT.events.length})`);
  const debutsDeMatch = ETAT.events.filter((e) => e.t < 2400);
  assert.strictEqual(debutsDeMatch.length, 0,
    'la première période a bien disparu du fil live — il ne peut donc pas raconter le match');
});

test('E2 — une chronologie couvre TOUT le match', () => {
  const chrono = ETAT.chronologie;
  assert.ok(Array.isArray(chrono) && chrono.length > 0, 'une chronologie doit exister');
  const premiere = chrono[0], derniere = chrono[chrono.length - 1];
  assert.ok(premiere.t < 2400,
    `la chronologie doit commencer en première période (${Math.round(premiere.t)}s)`);
  assert.ok(derniere.t > 3600,
    `et aller jusqu'à la fin (${Math.round(derniere.t)}s)`);
  // Triée par ordre d'arrivée : c'est un récit, pas un tas.
  for (let i = 1; i < chrono.length; i++) {
    assert.ok(chrono[i].t >= chrono[i - 1].t, 'la chronologie doit être ordonnée');
  }
});

test('E3 — TOUTES les actions de score y figurent', () => {
  const chrono = ETAT.chronologie;
  const essais = chrono.filter((e) => e.type === 'ESSAI' || e.type === 'ESSAI_PENALITE');
  const essaisReels = ETAT.stats.A.essais + ETAT.stats.B.essais;
  assert.strictEqual(essais.length, essaisReels,
    `chaque essai doit apparaître (${essais.length} dans la chronologie, ${essaisReels} au compteur)`);
  // Le coup d'envoi et la fin de match sont des repères de lecture.
  assert.ok(chrono.some((e) => e.type === 'FIN_MATCH'), 'la fin du match doit être marquée');
  assert.ok(chrono.some((e) => e.type === 'MI_TEMPS'), 'la mi-temps doit être marquée');
});

test('E4 — chaque fait porte sa minute, son équipe et un texte lisible', () => {
  for (const e of ETAT.chronologie) {
    assert.ok(typeof e.minute === 'number' && e.minute >= 0 && e.minute <= 100,
      `minute plausible attendue (${JSON.stringify(e)})`);
    assert.ok(typeof e.type === 'string' && e.type.length > 2, 'un type');
    assert.ok(typeof e.message === 'string' && e.message.length > 3,
      `un texte lisible (${JSON.stringify(e)})`);
    if (e.team != null) {
      assert.ok(e.team === 'A' || e.team === 'B', `équipe valide (${e.team})`);
    }
  }
});

test('E5 — la chronologie reste BORNÉE (pas de fuite mémoire)', () => {
  assert.ok(ETAT.chronologie.length <= RugbyEngine.CHRONOLOGIE_MAX,
    `bornée à ${RugbyEngine.CHRONOLOGIE_MAX} (${ETAT.chronologie.length})`);
  // Mais assez large pour contenir un vrai match : un match produit une
  // vingtaine de faits marquants, jamais des milliers.
  assert.ok(RugbyEngine.CHRONOLOGIE_MAX >= 100, 'assez large pour un match complet');
});

test('E6 — la feuille de match assemble un compte rendu utilisable', () => {
  const f = RMClub.feuilleDeMatch(ETAT, { nomA: 'AS Test', nomB: 'RC Adverse' });
  assert.ok(f, 'une feuille de match doit être produite');
  assert.strictEqual(f.score.A, ETAT.score.A);
  assert.strictEqual(f.score.B, ETAT.score.B);
  assert.strictEqual(f.nomA, 'AS Test');
  assert.ok(Array.isArray(f.chronologie) && f.chronologie.length > 0);
  for (const l of f.chronologie) {
    assert.ok(typeof l.minute === 'number' && l.libelle && l.camp !== undefined,
      `chaque ligne doit être affichable (${JSON.stringify(l)})`);
  }
  // Statistiques comparées : les deux équipes, côte à côte, avec un libellé.
  assert.ok(Array.isArray(f.statistiques) && f.statistiques.length >= 5);
  for (const s of f.statistiques) {
    assert.ok(s.libelle && s.a !== undefined && s.b !== undefined, JSON.stringify(s));
  }
});

test('E7 — les marqueurs sont extraits, par équipe', () => {
  const f = RMClub.feuilleDeMatch(ETAT, { nomA: 'AS Test', nomB: 'RC Adverse' });
  assert.ok(f.marqueurs && Array.isArray(f.marqueurs.A) && Array.isArray(f.marqueurs.B),
    'les marqueurs doivent être séparés par équipe');
  const total = f.marqueurs.A.length + f.marqueurs.B.length;
  assert.strictEqual(total, ETAT.stats.A.essais + ETAT.stats.B.essais,
    `un marqueur par essai (${total})`);
  for (const m of [...f.marqueurs.A, ...f.marqueurs.B]) {
    assert.ok(typeof m.minute === 'number', `minute attendue (${JSON.stringify(m)})`);
  }
});

test('E8 — un match sans essai ne produit pas une feuille cassée', () => {
  const vide = { score: { A: 0, B: 0 }, stats: { A: {}, B: {} }, chronologie: [], events: [] };
  assert.doesNotThrow(() => RMClub.feuilleDeMatch(vide, { nomA: 'X', nomB: 'Y' }));
  const f = RMClub.feuilleDeMatch(vide, { nomA: 'X', nomB: 'Y' });
  assert.deepStrictEqual(f.marqueurs, { A: [], B: [] });
  assert.deepStrictEqual(f.chronologie, []);
});

test('E9 — le fil live des 30 derniers événements continue de marcher', () => {
  assert.ok(ETAT.events.length > 0, 'le fil live doit rester alimenté');
  const dernier = ETAT.events[ETAT.events.length - 1];
  assert.ok(dernier.id && dernier.type && typeof dernier.t === 'number',
    'sa forme ne doit pas changer (l\'affichage temps réel en dépend)');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
