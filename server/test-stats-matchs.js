// Audit P2-11 (TODO_AUDIT.md) : simule plusieurs centaines de matchs complets
// (moteur seul, sans Mode Club) et vérifie que les statistiques cumulées
// ressemblent à un vrai match de rugby — jamais des chiffres fabriqués,
// toujours dérivés des événements réellement produits par le moteur
// (engine/rugby-engine.js), comme l'exige CLAUDE.md (Rôle 6 — Analyste
// statistiques).
//
// Les deux équipes sont générées à un NIVEAU DE CLUB différent à chaque
// match (docs/js/club.js, genererEffectif(rng, niveauClub), la même
// génération que le Mode Club réel — pas des joueurs symétriques par
// défaut) : niveauClub tiré indépendamment pour A et B dans [0.15, 0.85],
// la fourchette réellement couverte par la pyramide française (Ligue
// Régionale à Ligue d'Excellence, cf. docs/js/club-pyramide.js). Sert à
// vérifier la "diversité des vainqueurs" (le niveau doit peser sur le
// résultat, sans le rendre déterministe) en plus des statistiques brutes.
//
// Deux catégories d'assertions, volontairement séparées :
//
// 1) DUR (fait échouer le script) : les critères de refus EXPLICITES de
//    CLAUDE.md — jamais 0 mêlée/touche/essai en moyenne, au moins 20 passes
//    et 20 rucks par match, des coups de pied présents, des scores qui
//    varient d'un match à l'autre (pas des clones), une possession qui
//    reste raisonnablement équilibrée en moyenne agrégée (les niveaux de A
//    et B sont tirés de la même distribution, donc aucun biais structurel
//    ne doit apparaître sur 500 matchs), les avants qui ne jouent PAS comme
//    les trois-quarts (différence de passes/mètres gagnés par joueur,
//    mesurée, pas supposée), et l'équipe du niveau le plus élevé qui gagne
//    plus souvent SANS que le résultat soit jamais déterministe.
//
// 2) OBSERVATION (avertissement seulement, n'échoue jamais le script) : la
//    comparaison aux ordres de grandeur RÉELS de rugby indiqués par
//    CLAUDE.md (points, essais, mêlées, touches, rucks, plaquages, coups de
//    pied, pénalités, turnovers) — CLAUDE.md le dit lui-même, "ces valeurs
//    sont des repères, pas des règles fixes". Une calibration a été trouvée
//    très éloignée de ces repères (voir TODO_AUDIT.md P2-11/P2-13 pour le
//    constat complet et les incréments de recalibrage du moteur qui en
//    découlent, délibérément hors du périmètre de CE patch — écrire les
//    tests n'est pas rééquilibrer 4900 lignes de moteur au risque de tout
//    casser).
//
// Pour chaque statistique suivie : moyenne, médiane et une distribution
// simplifiée (percentiles 10/50/90) — pas seulement une moyenne qui peut
// masquer des valeurs aberrantes.
//
// Usage : node server/test-stats-matchs.js [n] [seedDepart]
// Avec le nombre par défaut (500 matchs de 80 minutes, niveaux de club
// variés), compter environ 20-25 minutes d'exécution (mesuré ~2.5s/match
// dans cet environnement, génération d'effectif incluse).
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = global;
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { MatchEngine } = global.window.RugbyEngine;
new Function('window', fs.readFileSync(path.join(__dirname, '../docs/js/club.js'), 'utf8'))(global.window);
new Function('window', fs.readFileSync(path.join(__dirname, '../docs/js/club-composition.js'), 'utf8'))(global.window);
const RMClub = global.window.RMClub;

function creerRng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const N_MATCHS = Number(process.argv[2]) || 500;
const SEED_DEPART = Number(process.argv[3]) || 1;
const DUREE_SECONDES = 4800; // 80 minutes
const DT = 0.2;
const FORWARDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BACKS = [9, 10, 11, 12, 13, 14, 15];
// Fourchette réellement couverte par la pyramide française (cf.
// docs/js/club-pyramide.js, bandeNiveauPalier : 0.15-0.45 Régionale,
// 0.35-0.6 Nationale, 0.55-0.85 Excellence) — bout à bout, [0.15, 0.85].
const NIVEAU_MIN = 0.15, NIVEAU_MAX = 0.85;

const totaux = {
  essais: 0, points: 0, scrums: 0, lineouts: 0, rucks: 0, tacklesAttempted: 0,
  kicks: 0, penalitesConcedees: 0, carries: 0, passes: 0, turnovers: 0,
};
// Séries complètes (pas seulement les totaux) pour calculer médiane et
// distribution, pas uniquement une moyenne.
const series = {
  essais: [], points: [], scrums: [], lineouts: [], rucks: [], tacklesAttempted: [],
  kicks: [], penalitesConcedees: [], carries: [], passes: [], turnovers: [],
};
const possessionA = [];
let passesJoueursForwards = 0, passesJoueursBacks = 0;
let metresJoueursForwards = 0, metresJoueursBacks = 0;
let victoiresNiveauFort = 0, victoiresNiveauFaible = 0, nuls = 0, ecartsNiveauNul = 0;
// Distribution des scores (G20) : les tests ne contrôlaient que des
// moyennes, donc rien ne surveillait les queues.
const ecartsScore = [], scoresEquipe = [];
let blanchissages = 0;

console.log(`--- Simulation de ${N_MATCHS} match(s) de 80 min (graines ${SEED_DEPART} à ${SEED_DEPART + N_MATCHS - 1}, niveaux de club variés [${NIVEAU_MIN}-${NIVEAU_MAX}]) — patientez, ~20-25 minutes ---\n`);

const debut = process.hrtime.bigint();
for (let i = 0; i < N_MATCHS; i++) {
  const seed = SEED_DEPART + i;
  const rngNiveaux = creerRng(seed * 2 + 1);
  const niveauA = NIVEAU_MIN + rngNiveaux() * (NIVEAU_MAX - NIVEAU_MIN);
  const niveauB = NIVEAU_MIN + rngNiveaux() * (NIVEAU_MAX - NIVEAU_MIN);
  const rngEffectif = creerRng(seed * 2 + 2);
  const effectifA = RMClub.genererEffectif(rngEffectif, niveauA);
  const effectifB = RMClub.genererEffectif(rngEffectif, niveauB);
  const joueursA = RMClub.effectifVersJoueursCfg({ effectif: effectifA });
  const joueursB = RMClub.effectifVersJoueursCfg({ effectif: effectifB });

  const m = new MatchEngine(seed, DUREE_SECONDES, { joueursA, joueursB });
  for (let t = 0; t < DUREE_SECONDES; t += DT) m.tick(DT);
  const s = m.getState();
  const sa = s.stats.A, sb = s.stats.B;

  const valeurs = {
    essais: sa.essais + sb.essais, points: s.score.A + s.score.B,
    scrums: sa.scrums + sb.scrums, lineouts: sa.lineouts + sb.lineouts,
    rucks: sa.rucks + sb.rucks, tacklesAttempted: sa.tacklesAttempted + sb.tacklesAttempted,
    kicks: sa.kicks + sb.kicks, penalitesConcedees: sa.penalitesConcedees + sb.penalitesConcedees,
    carries: sa.carries + sb.carries, passes: sa.passes + sb.passes,
    turnovers: sa.turnovers + sb.turnovers,
  };
  for (const cle of Object.keys(valeurs)) { totaux[cle] += valeurs[cle]; series[cle].push(valeurs[cle]); }

  possessionA.push(s.possessionPct.A);
  // Distribution des SCORES, pas seulement leur moyenne (G20) : écart entre
  // les deux équipes, score de chaque équipe, et blanchissages. Une moyenne
  // ne dit rien des queues — un moteur qui produirait un match sur dix à
  // 80 points d'écart garderait exactement la même moyenne.
  ecartsScore.push(Math.abs(s.score.A - s.score.B));
  scoresEquipe.push(s.score.A, s.score.B);
  if (s.score.A === 0 || s.score.B === 0) blanchissages++;

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

  // Diversité des vainqueurs : le niveau le plus élevé doit peser sur le
  // résultat (l'équipe la plus forte gagne PLUS SOUVENT) sans jamais être
  // déterministe (l'équipe la plus faible doit pouvoir gagner aussi).
  if (Math.abs(niveauA - niveauB) < 0.03) {
    ecartsNiveauNul++; // niveaux quasi identiques : n'apporte rien à la mesure, exclu
  } else {
    const forte = niveauA > niveauB ? 'A' : 'B';
    if (s.score.A === s.score.B) nuls++;
    else if ((forte === 'A' && s.score.A > s.score.B) || (forte === 'B' && s.score.B > s.score.A)) victoiresNiveauFort++;
    else victoiresNiveauFaible++;
  }

  if ((i + 1) % 20 === 0) console.log(`  ... ${i + 1}/${N_MATCHS} matchs simulés`);
}
const dureeCalcul = Number(process.hrtime.bigint() - debut) / 1e9;

function moyenne(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function mediane(arr) {
  const tri = [...arr].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 ? tri[milieu] : (tri[milieu - 1] + tri[milieu]) / 2;
}
function percentile(arr, p) {
  const tri = [...arr].sort((a, b) => a - b);
  const idx = Math.min(tri.length - 1, Math.max(0, Math.round((p / 100) * (tri.length - 1))));
  return tri[idx];
}

const M = {};
for (const cle of Object.keys(totaux)) M[cle] = moyenne(series[cle]);
const possessionMoyA = moyenne(possessionA);
const nbJoueurMatchsForwards = N_MATCHS * 2 * FORWARDS.length;
const nbJoueurMatchsBacks = N_MATCHS * 2 * BACKS.length;
const passesParJoueurForward = passesJoueursForwards / nbJoueurMatchsForwards;
const passesParJoueurBack = passesJoueursBacks / nbJoueurMatchsBacks;
const metresParJoueurForward = metresJoueursForwards / nbJoueurMatchsForwards;
const metresParJoueurBack = metresJoueursBacks / nbJoueurMatchsBacks;

console.log(`\n--- Moyenne / médiane / distribution (P10-P90) sur ${N_MATCHS} matchs (calcul : ${dureeCalcul.toFixed(0)}s) ---\n`);
const LIBELLES = {
  points: 'Points (total)', essais: 'Essais (total)', scrums: 'Mêlées (scrums)', lineouts: 'Touches (lineouts)',
  rucks: 'Rucks', tacklesAttempted: 'Plaquages tentés', kicks: 'Coups de pied', penalitesConcedees: 'Pénalités concédées',
  carries: 'Courses (carries)', passes: 'Passes', turnovers: 'Turnovers',
};
for (const cle of Object.keys(totaux)) {
  console.log(`${LIBELLES[cle].padEnd(22)} moyenne=${M[cle].toFixed(1).padStart(7)}  médiane=${mediane(series[cle]).toFixed(1).padStart(7)}  P10=${percentile(series[cle], 10).toFixed(0).padStart(5)}  P90=${percentile(series[cle], 90).toFixed(0).padStart(5)}`);
}
console.log(`Possession équipe A    moyenne=${possessionMoyA.toFixed(1)}%`);
console.log(`Passes/joueur avant    moyenne=${passesParJoueurForward.toFixed(2)}`);
console.log(`Passes/joueur 3/4      moyenne=${passesParJoueurBack.toFixed(2)}`);
console.log(`Mètres/joueur avant    moyenne=${metresParJoueurForward.toFixed(1)}`);
console.log(`Mètres/joueur 3/4      moyenne=${metresParJoueurBack.toFixed(1)}`);
const totalDecisif = victoiresNiveauFort + victoiresNiveauFaible + nuls;
console.log(`\nDiversité des vainqueurs (matchs avec écart de niveau ≥0.03, ${totalDecisif}/${N_MATCHS}, ${ecartsNiveauNul} exclu(s) niveaux quasi identiques) :`);
console.log(`  équipe la plus forte gagne   ${victoiresNiveauFort} (${(100 * victoiresNiveauFort / totalDecisif).toFixed(1)}%)`);
console.log(`  équipe la plus faible gagne  ${victoiresNiveauFaible} (${(100 * victoiresNiveauFaible / totalDecisif).toFixed(1)}%)`);
console.log(`  match nul                    ${nuls} (${(100 * nuls / totalDecisif).toFixed(1)}%)`);

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
test('turnovers : jamais 0 en moyenne', () => assert.ok(M.turnovers > 1, `moyenne=${M.turnovers}`));

test('scores : ne sont jamais toujours identiques d\'un match à l\'autre', () => {
  const distincts = new Set(series.points).size;
  assert.ok(distincts > 1, `${distincts} score(s) total(aux) distinct(s) sur ${N_MATCHS} matchs`);
});
test('essais : le nombre total varie aussi d\'un match à l\'autre (pas une action figée)', () => {
  const distincts = new Set(series.essais).size;
  assert.ok(distincts > 1, `${distincts} valeur(s) distincte(s) sur ${N_MATCHS} matchs`);
});

// --- Distribution des scores (G20) ---------------------------------------
//
// Jusqu'ici, TOUTES les assertions de score portaient sur une moyenne. Or une
// moyenne ne dit rien des queues : un moteur qui produirait un match sur dix
// à 80 points d'écart garderait exactement la même moyenne de 43 points. Le
// contrôle manquant, ce sont les extrêmes — c'est là qu'un déséquilibre se
// voit d'abord, et c'est ce que le joueur remarque en premier.
//
// Bornes MESURÉES sur ce même harnais (500 matchs, niveaux tirés sur toute la
// pyramide [0,15-0,85], donc appariements volontairement plus déséquilibrés
// qu'un vrai championnat) :
//
//   total du match     moyenne 43,5 · médiane 43 · P90 63 · P99 76 · max 91
//   score d'une équipe moyenne 21,7 · P99 67 · max 84
//   écart              moyenne 22,0 · P90 46 · P99 71 · max 77
//
// Les bornes ci-dessous laissent de la marge au-dessus de ces valeurs : elles
// servent à détecter une DÉRIVE, pas à figer la calibration au point près.
//
// À titre de repère, avec des appariements RÉELS (deux clubs d'une même
// division, cf. bandeNiveauPalier), la distribution est nettement plus sage :
// 1 % des matchs au-dessus de 70 points, 12 % avec plus de 30 points d'écart,
// 0 % au-dessus de 50, et 3,8 % de blanchissages — des ordres de grandeur
// crédibles pour du rugby de club. Le déséquilibre visible ci-dessus vient
// donc surtout du tirage du harnais, pas du moteur.
test('scores : la QUEUE de distribution reste bornée, pas seulement la moyenne', () => {
  const p99 = percentile(series.points, 99);
  const max = Math.max.apply(null, series.points);
  assert.ok(p99 <= 95, `P99 du total d'un match = ${p99} (borne 95)`);
  assert.ok(max <= 130, `match le plus prolifique = ${max} points (borne 130)`);
  const maxEquipe = Math.max.apply(null, scoresEquipe);
  assert.ok(maxEquipe <= 110, `score d'équipe le plus élevé = ${maxEquipe} (borne 110)`);
});

test('écarts : un match sur deux ne se joue pas à sens unique', () => {
  const moyEcart = moyenne(ecartsScore);
  assert.ok(moyEcart <= 30,
    `écart moyen entre les deux équipes = ${moyEcart.toFixed(1)} points (borne 30)`);
  const p99 = percentile(ecartsScore, 99);
  assert.ok(p99 <= 90, `P99 de l'écart = ${p99} points (borne 90)`);
  // Et le suspense existe : une part notable des matchs se joue de peu.
  const serres = ecartsScore.filter((e) => e <= 7).length / ecartsScore.length;
  assert.ok(serres >= 0.1,
    `seulement ${Math.round(serres * 100)} % des matchs se jouent à 7 points ou moins`);
});

test('blanchissages : être tenu à zéro reste l\'exception', () => {
  const part = blanchissages / N_MATCHS;
  assert.ok(part <= 0.15,
    `${Math.round(part * 100)} % des matchs voient une équipe à zéro point (borne 15 %)`);
});

test('possession : aucune équipe ne garde ~95% sans raison en moyenne agrégée (niveaux de A/B tirés de la même distribution, aucun biais structurel attendu)', () => {
  assert.ok(possessionMoyA >= 30 && possessionMoyA <= 70, `possession moyenne équipe A=${possessionMoyA.toFixed(1)}%`);
});

console.log(`\ndistribution des scores : écart moyen=${moyenne(ecartsScore).toFixed(1)}  P90=${percentile(ecartsScore, 90).toFixed(0)}  P99=${percentile(ecartsScore, 99).toFixed(0)}  max=${Math.max.apply(null, ecartsScore)}`);
console.log(`total du match          : P99=${percentile(series.points, 99).toFixed(0)}  max=${Math.max.apply(null, series.points)}  ·  blanchissages=${Math.round(1000 * blanchissages / N_MATCHS) / 10} %`);
console.log(`matchs serrés (≤ 7 pts) : ${Math.round(1000 * ecartsScore.filter((e) => e <= 7).length / ecartsScore.length) / 10} %\n`);

test('avants et trois-quarts ne jouent PAS pareil : les trois-quarts passent nettement plus que les avants', () => {
  assert.ok(passesParJoueurBack > passesParJoueurForward * 3,
    `passes/joueur avant=${passesParJoueurForward.toFixed(2)} vs trois-quarts=${passesParJoueurBack.toFixed(2)}`);
});
test('avants et trois-quarts ne jouent PAS pareil : les trois-quarts gagnent nettement plus de mètres ballon en main', () => {
  assert.ok(metresParJoueurBack > metresParJoueurForward * 2,
    `mètres/joueur avant=${metresParJoueurForward.toFixed(1)} vs trois-quarts=${metresParJoueurBack.toFixed(1)}`);
});

test('diversité des vainqueurs : l\'équipe du niveau le plus élevé gagne PLUS SOUVENT que l\'inverse (le niveau doit peser sur le résultat)', () => {
  assert.ok(victoiresNiveauFort > victoiresNiveauFaible,
    `plus fort gagne ${victoiresNiveauFort}, plus faible gagne ${victoiresNiveauFaible}`);
});
test('diversité des vainqueurs : l\'équipe du niveau le plus faible gagne AUSSI, pas jamais (le résultat n\'est jamais déterministe)', () => {
  assert.ok(victoiresNiveauFaible > 0, `plus faible gagne ${victoiresNiveauFaible} fois sur ${totalDecisif}`);
});
test('diversité des vainqueurs : le niveau le plus élevé ne gagne pas systématiquement non plus (pas >95%, le hasard du match doit rester réel)', () => {
  const tauxFort = victoiresNiveauFort / totalDecisif;
  assert.ok(tauxFort < 0.95, `taux de victoire du niveau le plus élevé=${(100 * tauxFort).toFixed(1)}%`);
});

// --- 2) Observation par rapport aux repères RÉELS de rugby de CLAUDE.md —
// avertissement seulement (voir en-tête de fichier et TODO_AUDIT.md P2-11/
// P2-13 pour le constat détaillé : un écart important a été mesuré ici, qui
// nécessite une tâche de recalibrage du moteur à part entière). ---
const REPERES = {
  points: [25, 70], essais: [2, 8], scrums: [8, 25], lineouts: [15, 35],
  rucks: [70, 180], tacklesAttempted: [120, 250], kicks: [30, 80], penalitesConcedees: [12, 30],
  turnovers: [12, 18],
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
