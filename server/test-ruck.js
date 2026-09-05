// TEST DE PREUVE — LE PROFIL DE RUCK ANNONCÉ N'EST PAS CELUI QUI SE JOUE
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré sur 5 matchs complets, graines
// 7/11/23/42/99, 3100 rucks) :
//
//   Durée TIRÉE (profil DEFAULT_CONFIG.ruck) : moyenne 3,57 s
//        < 3 s : 54,8 %  |  3-6 s : 33,2 %  |  > 6 s : 12,0 %
//   Durée RÉELLEMENT jouée                    : moyenne 2,52 s
//        < 3 s : 72,2 %  |  3-6 s : 26,1 %  |  > 6 s :  1,7 %
//
//   71,1 % des rucks sont raccourcis en cours de phase, et les rucks tirés
//   LENTS (cible >= 6 s, le ballon disputé) sont joués en 4,29 s de moyenne.
//   Le palier « ballon lent » du profil est donc détruit : 12 % annoncés,
//   1,7 % joués.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : le commentaire de
// DEFAULT_CONFIG.ruck promet « exactement la distribution mesurée au
// France-Irlande 2026 » (52-63 % / 21-33 % / le reste au-delà de 6 s), et
// ANALYSE_MATCH_REEL.md enregistre cette calibration comme acquise. Ce n'est
// pas ce que le joueur voit : le ballon lent n'existe pratiquement plus. Or
// c'est lui qui fait respirer un match — un ruck disputé, une défense qui a le
// temps de se replacer, une attaque obligée de changer de solution. Sans lui,
// tous les rucks se ressemblent, le match s'emballe (620 rucks par match au
// lieu des 70-180 d'un vrai match) et les temps forts n'existent plus.
//
// FONCTION EXACTE RESPONSABLE : engine/rugby-engine.js, `_tickRuck`, le
// raccourci « service rapide » :
//     const dureeEffective = serviceRapide
//       ? Math.min(dureeCible, Math.max(1.6 * this._echelleArret, dureeCible * 0.55))
//       : dureeCible;
// Ce facteur 0,55 s'applique à la durée DÉJÀ tirée, alors que le profil
// contient déjà son palier de ballon rapide (55 % en 1,5-3 s) : la vitesse est
// comptée deux fois, et un ballon tiré lent (7 s) ressort servi en 3,85 s.
//
// SCÉNARIO DE REPRODUCTION : jouer un match complet en instrumentant l'entrée
// et la sortie de la phase RUCK, comparer à `ruckDureeCible`.
//
// CE QUE CE FICHIER EXIGE :
//   1. une règle de sortie de ruck EXPLICITE et testable directement (l'effet
//      est trop petit devant le bruit d'un match pour être jugé sur une
//      moyenne — même méthode qu'en P1-50b/P1-51) ;
//   2. le service rapide reste RÉCOMPENSÉ (on ne supprime pas une mécanique) ;
//   3. mais il ne peut pas transformer un ballon lent en ballon rapide ;
//   4. la distribution RÉELLEMENT jouée doit tomber dans la fourchette d'un
//      vrai match ;
//   5. le ballon lent (> 6 s) doit réellement exister ;
//   6. le match doit rester dans ses ordres de grandeur (score, essais).
//
// Usage : node server/test-ruck.js
'use strict';

const assert = require('assert');
global.window = global;
const RugbyEngine = require('../docs/rugby-engine.js');

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

// Instrumentation : durée RÉELLE de chaque ruck (entrée en phase RUCK jusqu'à
// la sortie) confrontée à la durée CIBLE tirée du profil.
function mesurerRucks(graine) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, null);
  const rucks = [];
  let enRuck = false, t0 = 0, cible = 0, n = 0;
  while (m.getState().phase !== 'TERMINE' && n < 400000) {
    m.tick(1 / 20); n++;
    if (m.phase === 'RUCK' && !enRuck) { enRuck = true; t0 = m.tempsMatch; cible = m.ruckDureeCible; }
    else if (m.phase !== 'RUCK' && enRuck) { enRuck = false; rucks.push({ reelle: m.tempsMatch - t0, cible }); }
  }
  return { rucks, stats: m.getState().stats, score: m.getState().score };
}

// UNE SEULE campagne de matchs pour toute la suite (chaque match coûte
// plusieurs secondes).
const GRAINES = [7, 11, 23, 42, 99];
const CAMPAGNE = GRAINES.map(mesurerRucks);
const RUCKS = CAMPAGNE.flatMap((c) => c.rucks);
const part = (a, f) => 100 * a.filter(f).length / a.length;
const moy = (a) => a.reduce((s, x) => s + x, 0) / a.length;

test('R1 — la règle de sortie de ruck est explicite et testable', () => {
  assert.strictEqual(typeof RugbyEngine.dureeSortieRuck, 'function',
    'le moteur doit exposer la règle de sortie de ruck');
  // Sans service rapide, la durée tirée s'applique telle quelle.
  assert.strictEqual(RugbyEngine.dureeSortieRuck({ dureeCible: 5, serviceRapide: false }), 5,
    'sans service rapide, la durée tirée du profil est la durée jouée');
  assert.strictEqual(RugbyEngine.dureeSortieRuck({ dureeCible: 1.8, serviceRapide: false }), 1.8);
});

test('R2 — le service rapide reste RÉCOMPENSÉ (la mécanique n\'est pas supprimée)', () => {
  const lent = RugbyEngine.dureeSortieRuck({ dureeCible: 5, serviceRapide: false });
  const rapide = RugbyEngine.dureeSortieRuck({ dureeCible: 5, serviceRapide: true });
  assert.ok(rapide < lent,
    `le 9 déjà à la base doit sortir le ballon plus tôt (${rapide} vs ${lent})`);
  // Et il doit rester assez tôt pour ouvrir la fenêtre « défense pas replacée »
  // sur les ballons déjà rapides du profil (palier 1,5-3 s).
  assert.ok(RugbyEngine.dureeSortieRuck({ dureeCible: 2.4, serviceRapide: true }) < 1.8,
    'un ballon déjà rapide servi vite doit passer sous le seuil de défense en retard (1,8 s)');
});

test('R3 — PREUVE : le service rapide ne peut PAS transformer un ballon lent en ballon rapide', () => {
  // C'est le défaut mesuré : cible 7 s -> 3,85 s joués (facteur 0,55).
  const servi = RugbyEngine.dureeSortieRuck({ dureeCible: 7, serviceRapide: true });
  assert.ok(servi >= 6,
    `un ruck tiré à 7 s reste un ballon lent même bien servi (${servi.toFixed(2)}s)`);
  const servi4 = RugbyEngine.dureeSortieRuck({ dureeCible: 4, serviceRapide: true });
  assert.ok(servi4 >= 3,
    `un ruck tiré à 4 s ne devient pas un ballon éclair (${servi4.toFixed(2)}s)`);
  // Le gain est borné : jamais plus d'environ une seconde.
  for (const c of [2, 3, 4, 5, 6, 7, 8]) {
    const gain = c - RugbyEngine.dureeSortieRuck({ dureeCible: c, serviceRapide: true });
    assert.ok(gain <= 1.05, `gain borné (cible ${c}s -> gain ${gain.toFixed(2)}s)`);
  }
});

test('R4 — la durée jouée ne descend jamais sous le plancher du profil', () => {
  // Le palier le plus rapide du profil par défaut commence à 1,5 s : rien ne
  // doit sortir plus vite qu'un ballon rapide du profil lui-même.
  const plancher = RugbyEngine.DEFAULT_CONFIG.ruck.profil[0][1];
  for (const c of [1.5, 1.8, 2.2, 3]) {
    const d = RugbyEngine.dureeSortieRuck({ dureeCible: c, serviceRapide: true, plancher });
    assert.ok(d >= plancher - 1e-9,
      `cible ${c}s servie vite : ${d.toFixed(2)}s, plancher ${plancher}s`);
  }
});

test('R5 — PREUVE EN MATCH : la distribution JOUÉE suit celle qui est TIRÉE', () => {
  const reelles = RUCKS.map((r) => r.reelle), cibles = RUCKS.map((r) => r.cible);
  const detail = (a) => `${part(a, v => v < 3).toFixed(1)}/${part(a, v => v >= 3 && v < 6).toFixed(1)}/${part(a, v => v >= 6).toFixed(1)} %`;
  const msg = `tirée ${moy(cibles).toFixed(2)}s ${detail(cibles)} | jouée ${moy(reelles).toFixed(2)}s ${detail(reelles)}`;
  // La moyenne jouée ne doit pas s'effondrer sous la moyenne tirée.
  assert.ok(moy(reelles) >= moy(cibles) - 0.75,
    `la durée jouée doit rester proche de la durée tirée (${msg})`);
  // Aucun palier ne doit être écrasé de plus de 10 points.
  for (const [nom, f] of [['< 3 s', v => v < 3], ['3-6 s', v => v >= 3 && v < 6], ['> 6 s', v => v >= 6]]) {
    assert.ok(Math.abs(part(reelles, f) - part(cibles, f)) <= 10,
      `palier ${nom} déformé (${msg})`);
  }
});

test('R6 — le ballon LENT existe vraiment en match', () => {
  const reelles = RUCKS.map((r) => r.reelle);
  const lents = part(reelles, (v) => v >= 6);
  // Référence réelle (France-Irlande 2026) : ~10 % des rucks au-delà de 6 s.
  assert.ok(lents >= 6,
    `un vrai match compte ~10 % de ballons lents (mesuré ${lents.toFixed(1)} %)`);
  // Et les rucks TIRÉS lents doivent être JOUÉS lents.
  const tiresLents = RUCKS.filter((r) => r.cible >= 6);
  assert.ok(tiresLents.length > 0, 'le profil doit tirer des ballons lents');
  const moyenneJouee = moy(tiresLents.map((r) => r.reelle));
  assert.ok(moyenneJouee >= 5.5,
    `un ruck tiré lent doit être joué lent (tirés ${moy(tiresLents.map(r => r.cible)).toFixed(2)}s, joués ${moyenneJouee.toFixed(2)}s)`);
});

test('R7 — le match reste dans ses ordres de grandeur', () => {
  const scores = CAMPAGNE.map((c) => c.score.A + c.score.B);
  const essais = CAMPAGNE.map((c) => c.stats.A.essais + c.stats.B.essais);
  const moyScore = moy(scores), moyEssais = moy(essais);
  assert.ok(moyScore >= 20 && moyScore <= 85,
    `score total moyen crédible (${moyScore.toFixed(1)} : ${scores.join(', ')})`);
  assert.ok(moyEssais >= 2 && moyEssais <= 11,
    `essais totaux moyens crédibles (${moyEssais.toFixed(1)} : ${essais.join(', ')})`);
  // Le nombre de rucks doit BAISSER vers un vrai match, jamais monter.
  const rucksParMatch = RUCKS.length / GRAINES.length;
  assert.ok(rucksParMatch < 620,
    `le volume de rucks doit se rapprocher d'un vrai match (${rucksParMatch.toFixed(0)}/match, 620 avant correction)`);
});

// --- Loi 15 : LE REGROUPEMENT DOIT ETRE ARBITRE ----------------------------
//
// Le ruck est, dans un vrai match, la premiere source de penalites : mains
// dans le ruck, non-liberation du ballon par le plaque, entree sur le cote,
// joueur qui ne se retire pas. Un match de rugby a XV concede 16 a 28
// penalites au total (CLAUDE.md Role 6) ; le moteur n'en produisait que 7,5
// parce que le regroupement n'etait quasiment jamais sanctionne.
//
// Consequence directe pour le joueur : la discipline ne coute rien, l'arbitre
// est invisible au contact, et le match ne connait pas les temps morts qui
// font respirer une rencontre (marque, tir au but, coup de pied en touche).
test('loi 15 : le regroupement est arbitre — il produit de vraies penalites', () => {
  const GRAINES = [1, 2, 3, 4, 5];
  let penalites = 0;
  const motifs = new Set();
  for (const seed of GRAINES) {
    const m = new RugbyEngine.MatchEngine(seed, 4800, null);
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
    const s = m.getState();
    penalites += s.stats.A.penalitesConcedees + s.stats.B.penalitesConcedees;
    for (const e of (s.chronologie || [])) {
      if (e.type === 'PENALITE_RUCK') motifs.add(e.message);
    }
  }
  const parMatch = penalites / GRAINES.length;
  assert.ok(parMatch >= 14,
    `un match doit concéder au moins 14 pénalités (mesuré ${parMatch.toFixed(1)})`);
  assert.ok(motifs.size >= 2,
    `le regroupement doit produire plusieurs motifs de pénalité distincts (mesuré ${motifs.size} : ${[...motifs].join(' / ')})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
