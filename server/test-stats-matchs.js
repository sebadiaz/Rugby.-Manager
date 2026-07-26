// Audit P2-11 (TODO_AUDIT.md) : simule plusieurs centaines de matchs complets
// (moteur seul, sans Mode Club) et vérifie que les statistiques cumulées
// ressemblent à un vrai match de rugby — jamais des chiffres fabriqués,
// toujours dérivés des événements réellement produits par le moteur
// (engine/rugby-engine.js), comme l'exige CLAUDE.md (Rôle 6 — Analyste
// statistiques).
//
// Deux catégories d'assertions, volontairement séparées :
//
// 1) DUR (fait échouer le script) : les critères de refus EXPLICITES de
//    CLAUDE.md — jamais 0 mêlée/touche/essai en moyenne, au moins 20 passes
//    et 20 rucks par match, des coups de pied présents, des scores qui
//    varient d'un match à l'autre (pas des clones), une possession qui
//    reste raisonnablement équilibrée (moteur symétrique par défaut), et
//    les avants qui ne jouent PAS comme les trois-quarts (différence de
//    passes/mètres gagnés par joueur, mesurée, pas supposée).
//
// 2) OBSERVATION (avertissement seulement, n'échoue jamais le script) : la
//    comparaison aux ordres de grandeur RÉELS de rugby indiqués par
//    CLAUDE.md (points, essais, mêlées, touches, rucks, plaquages, coups de
//    pied, pénalités) — CLAUDE.md le dit lui-même, "ces valeurs sont des
//    repères, pas des règles fixes". Une calibration a été trouvée très
//    éloignée de ces repères (voir TODO_AUDIT.md P2-11 pour le constat
//    complet et la tâche de recalibrage du moteur qui en découle,
//    délibérément hors du périmètre de CE patch — écrire les tests n'est
//    pas rééquilibrer 4900 lignes de moteur au risque de tout casser).
//
// Usage : node server/test-stats-matchs.js [n] [seedDepart]
// Avec le nombre par défaut (200 matchs de 80 minutes), compter environ
// 6 à 8 minutes d'exécution (mesuré ~2.2s/match dans cet environnement).
'use strict';

const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');

const N_MATCHS = Number(process.argv[2]) || 200;
const SEED_DEPART = Number(process.argv[3]) || 1;
const DUREE_SECONDES = 4800; // 80 minutes
const DT = 0.2;
const FORWARDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BACKS = [9, 10, 11, 12, 13, 14, 15];

const totaux = {
  essais: 0, points: 0, scrums: 0, lineouts: 0, rucks: 0, tacklesAttempted: 0,
  kicks: 0, penalitesConcedees: 0, carries: 0, passes: 0,
};
const scoresParMatch = [];
const essaisParMatch = [];
const possessionA = [];
let passesJoueursForwards = 0, passesJoueursBacks = 0;
let metresJoueursForwards = 0, metresJoueursBacks = 0;

console.log(`--- Simulation de ${N_MATCHS} match(s) de 80 min (graines ${SEED_DEPART} à ${SEED_DEPART + N_MATCHS - 1}) — patientez, plusieurs minutes ---\n`);

const debut = process.hrtime.bigint();
for (let i = 0; i < N_MATCHS; i++) {
  const seed = SEED_DEPART + i;
  const m = new MatchEngine(seed, DUREE_SECONDES);
  for (let t = 0; t < DUREE_SECONDES; t += DT) m.tick(DT);
  const s = m.getState();
  const sa = s.stats.A, sb = s.stats.B;

  totaux.essais += sa.essais + sb.essais;
  totaux.points += s.score.A + s.score.B;
  totaux.scrums += sa.scrums + sb.scrums;
  totaux.lineouts += sa.lineouts + sb.lineouts;
  totaux.rucks += sa.rucks + sb.rucks;
  totaux.tacklesAttempted += sa.tacklesAttempted + sb.tacklesAttempted;
  totaux.kicks += sa.kicks + sb.kicks;
  totaux.penalitesConcedees += sa.penalitesConcedees + sb.penalitesConcedees;
  totaux.carries += sa.carries + sb.carries;
  totaux.passes += sa.passes + sb.passes;

  scoresParMatch.push(s.score.A + s.score.B);
  essaisParMatch.push(sa.essais + sb.essais);
  possessionA.push(s.possessionPct.A);

  for (const equipe of ['A', 'B']) {
    for (const n of FORWARDS) {
      const p = s.statsJoueurs[equipe][n];
      if (p) { passesJoueursForwards += (p.passes || 0); metresJoueursForwards += (p.metresGagnes || 0); }
    }
    for (const n of BACKS) {
      const p = s.statsJoueurs[equipe][n];
      if (p) { passesJoueursBacks += (p.passes || 0); metresJoueursBacks += (p.metresGagnes || 0); }
    }
  }

  if ((i + 1) % 20 === 0) console.log(`  ... ${i + 1}/${N_MATCHS} matchs simulés`);
}
const dureeCalcul = Number(process.hrtime.bigint() - debut) / 1e9;

const moy = (total) => total / N_MATCHS;
const M = {
  essais: moy(totaux.essais), points: moy(totaux.points), scrums: moy(totaux.scrums),
  lineouts: moy(totaux.lineouts), rucks: moy(totaux.rucks), tacklesAttempted: moy(totaux.tacklesAttempted),
  kicks: moy(totaux.kicks), penalitesConcedees: moy(totaux.penalitesConcedees),
  carries: moy(totaux.carries), passes: moy(totaux.passes),
};
const possessionMoyA = possessionA.reduce((a, b) => a + b, 0) / N_MATCHS;
// 8 avants et 7 trois-quarts par équipe et par match ; nombre total de
// "joueur-matchs" observés pour chaque groupe (moyenne PAR JOUEUR, pas par
// équipe, pour comparer des grandeurs homogènes).
const nbJoueurMatchsForwards = N_MATCHS * 2 * FORWARDS.length;
const nbJoueurMatchsBacks = N_MATCHS * 2 * BACKS.length;
const passesParJoueurForward = passesJoueursForwards / nbJoueurMatchsForwards;
const passesParJoueurBack = passesJoueursBacks / nbJoueurMatchsBacks;
const metresParJoueurForward = metresJoueursForwards / nbJoueurMatchsForwards;
const metresParJoueurBack = metresJoueursBacks / nbJoueurMatchsBacks;

console.log(`\n--- Moyennes sur ${N_MATCHS} matchs (calcul : ${dureeCalcul.toFixed(0)}s) ---\n`);
console.log(`Points (total)         moyenne=${M.points.toFixed(1)}`);
console.log(`Essais (total)         moyenne=${M.essais.toFixed(1)}`);
console.log(`Mêlées (scrums)        moyenne=${M.scrums.toFixed(1)}`);
console.log(`Touches (lineouts)     moyenne=${M.lineouts.toFixed(1)}`);
console.log(`Rucks                  moyenne=${M.rucks.toFixed(1)}`);
console.log(`Plaquages tentés       moyenne=${M.tacklesAttempted.toFixed(1)}`);
console.log(`Coups de pied          moyenne=${M.kicks.toFixed(1)}`);
console.log(`Pénalités concédées    moyenne=${M.penalitesConcedees.toFixed(1)}`);
console.log(`Possession équipe A    moyenne=${possessionMoyA.toFixed(1)}%`);
console.log(`Passes/joueur avant    moyenne=${passesParJoueurForward.toFixed(2)}`);
console.log(`Passes/joueur 3/4      moyenne=${passesParJoueurBack.toFixed(2)}`);
console.log(`Mètres/joueur avant    moyenne=${metresParJoueurForward.toFixed(1)}`);
console.log(`Mètres/joueur 3/4      moyenne=${metresParJoueurBack.toFixed(1)}`);

let nbTests = 0, nbEchecs = 0;
function test(nom, fn) {
  nbTests++;
  try {
    fn();
    console.log(`\nOK   ${nom}`);
  } catch (e) {
    nbEchecs++;
    console.error(`\nFAIL ${nom}`);
    console.error(e.message || e);
  }
}

// --- 1) Critères de refus explicites de CLAUDE.md (jamais fabriqués : tous
// dérivés des accumulateurs ci-dessus, jamais 0 sauf si le moteur produit
// vraiment 0). ---
test('essais : jamais 0 en moyenne', () => assert.ok(M.essais > 1, `moyenne=${M.essais}`));
test('points : un vrai match se joue, pas 0-0 systématique', () => assert.ok(M.points > 10, `moyenne=${M.points}`));
test('mêlées : jamais 0 en moyenne', () => assert.ok(M.scrums > 2, `moyenne=${M.scrums}`));
test('touches : jamais 0 en moyenne', () => assert.ok(M.lineouts > 2, `moyenne=${M.lineouts}`));
test('passes : au moins 20 par match en moyenne (seuil explicite CLAUDE.md)', () => assert.ok(M.passes >= 20, `moyenne=${M.passes}`));
test('rucks : au moins 20 par match en moyenne (seuil explicite CLAUDE.md)', () => assert.ok(M.rucks >= 20, `moyenne=${M.rucks}`));
test('coups de pied : présents, pas quasi absents', () => assert.ok(M.kicks > 5, `moyenne=${M.kicks}`));

test('scores : ne sont jamais toujours identiques d\'un match à l\'autre', () => {
  const distincts = new Set(scoresParMatch).size;
  assert.ok(distincts > 1, `${distincts} score(s) total(aux) distinct(s) sur ${N_MATCHS} matchs`);
});
test('essais : le nombre total varie aussi d\'un match à l\'autre (pas une action figée)', () => {
  const distincts = new Set(essaisParMatch).size;
  assert.ok(distincts > 1, `${distincts} valeur(s) distincte(s) sur ${N_MATCHS} matchs`);
});

test('possession : aucune équipe ne garde ~95% sans raison (moteur symétrique par défaut)', () => {
  assert.ok(possessionMoyA >= 30 && possessionMoyA <= 70, `possession moyenne équipe A=${possessionMoyA.toFixed(1)}%`);
});

test('avants et trois-quarts ne jouent PAS pareil : les trois-quarts passent nettement plus que les avants', () => {
  assert.ok(passesParJoueurBack > passesParJoueurForward * 3,
    `passes/joueur avant=${passesParJoueurForward.toFixed(2)} vs trois-quarts=${passesParJoueurBack.toFixed(2)}`);
});
test('avants et trois-quarts ne jouent PAS pareil : les trois-quarts gagnent nettement plus de mètres ballon en main', () => {
  assert.ok(metresParJoueurBack > metresParJoueurForward * 2,
    `mètres/joueur avant=${metresParJoueurForward.toFixed(1)} vs trois-quarts=${metresParJoueurBack.toFixed(1)}`);
});

// --- 2) Observation par rapport aux repères RÉELS de rugby de CLAUDE.md —
// avertissement seulement (voir en-tête de fichier et TODO_AUDIT.md P2-11
// pour le constat détaillé : un écart important a été mesuré ici, qui
// nécessite une tâche de recalibrage du moteur à part entière). ---
const REPERES = {
  points: [25, 70], essais: [2, 8], scrums: [8, 25], lineouts: [15, 35],
  rucks: [70, 180], tacklesAttempted: [120, 250], kicks: [30, 80], penalitesConcedees: [12, 30],
};
console.log('\n--- Comparaison aux repères réalistes de CLAUDE.md (avertissement seulement) ---');
let horsRepere = 0;
for (const cle of Object.keys(REPERES)) {
  const [min, max] = REPERES[cle];
  const valeur = M[cle];
  const dans = valeur >= min && valeur <= max;
  if (!dans) horsRepere++;
  console.log(`${cle.padEnd(20)} moyenne=${valeur.toFixed(1).padStart(7)}  repère=[${min}-${max}]  ${dans ? 'OK' : 'HORS REPÈRE'}`);
}
if (horsRepere > 0) {
  console.log(`\nAVERTISSEMENT : ${horsRepere}/${Object.keys(REPERES).length} catégories hors repère — recalibrage du moteur à envisager séparément (cf. TODO_AUDIT.md).`);
}

console.log(`\n${nbTests} test(s) exécuté(s), ${nbEchecs} échec(s).`);
if (nbEchecs > 0) {
  console.error('ECHEC : au moins un critère de refus explicite de CLAUDE.md est déclenché.');
  process.exitCode = 1;
} else {
  console.log('OK : aucun critère de refus explicite de CLAUDE.md n\'est déclenché (voir avertissements de calibration ci-dessus, non bloquants).');
}
