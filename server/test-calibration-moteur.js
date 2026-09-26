// Calibration du moteur : le match doit produire des VOLUMES d'actions
// réalistes, pas seulement des actions.
//
// Ce test est la version testable du critère d'acceptation de
// server/simulate-batch.js. Il tourne sur un échantillon réduit (assez pour
// que les moyennes soient stables, assez court pour la CI) et exige qu'au
// moins 12 des 14 catégories tombent dans leur fourchette réaliste.
//
// Il ne remplace PAS `node server/simulate-batch.js` sur 50 matchs, qui reste
// la mesure de référence : il empêche seulement une régression de repasser.
'use strict';

const { MatchEngine } = require('../engine/rugby-engine.js');

const FOURCHETTES = {
  essais: [4, 8],
  points: [35, 65],
  carries: [170, 280],
  passes: [250, 420],
  kicks: [35, 70],
  tacklesAttempted: [220, 360],
  rucks: [110, 180],
  lineouts: [20, 35],
  scrums: [6, 15],
  mauls: [3, 10],
  penalitesConcedees: [16, 28],
  turnovers: [8, 18],
  knockOns: [8, 18],
  tempsJeuEffectifMin: [32, 42],
};
const LABELS = {
  essais: 'Essais', points: 'Points', carries: 'Courses', passes: 'Passes',
  kicks: 'Coups de pied', tacklesAttempted: 'Plaquages tentés', rucks: 'Rucks',
  lineouts: 'Touches', scrums: 'Mêlées', mauls: 'Mauls',
  penalitesConcedees: 'Pénalités concédées', turnovers: 'Turnovers',
  knockOns: 'En-avants', tempsJeuEffectifMin: 'Temps de jeu effectif (min)',
};
// 12 catégories sur 14 : le critère d'acceptation demandé.
const CATEGORIES_MINIMUM = 12;
const N = Number(process.env.RM_CALIBRATION_N) || 20;
const DUREE = 4800;
// LE PAS DE SIMULATION DU BANC DOIT ETRE CELUI DU JEU. Il valait 0,2 s alors
// que le navigateur fait tourner le moteur a 0,1 s (docs/js/constants.js,
// PAS_FIXE) : ce banc n'a donc jamais mesure la partie que le joueur joue.
// L'ecart n'est pas theorique — mesure sur 20 matchs, le meme moteur donne
// 47,6 coups de pied a 0,1 s contre 59,0 a 0,2 s, et 18,1 touches contre 21,3.
// Au pas reel, le moteur ECHOUAIT cette calibration (11/14, categorie
// essentielle « lineouts » hors fourchette) pendant que le banc annoncait
// 12/14. Cf. TODO_AUDIT.md P2-41. Un invariant verifie desormais que ces deux
// pas restent egaux.
const DT = 0.1;

function mesurer(n) {
  const totaux = {};
  for (const k of Object.keys(FOURCHETTES)) totaux[k] = 0;
  for (let i = 0; i < n; i++) {
    const m = new MatchEngine(1 + i, DUREE);
    for (let t = 0; t < DUREE; t += DT) m.tick(DT);
    const s = m.getState(); const a = s.stats.A, b = s.stats.B;
    totaux.essais += a.essais + b.essais;
    totaux.points += s.score.A + s.score.B;
    totaux.carries += a.carries + b.carries;
    totaux.passes += a.passes + b.passes;
    totaux.kicks += a.kicks + b.kicks;
    totaux.tacklesAttempted += a.tacklesAttempted + b.tacklesAttempted;
    totaux.rucks += a.rucks + b.rucks;
    totaux.lineouts += a.lineouts + b.lineouts;
    totaux.scrums += a.scrums + b.scrums;
    totaux.mauls += a.mauls + b.mauls;
    totaux.penalitesConcedees += a.penalitesConcedees + b.penalitesConcedees;
    totaux.turnovers += a.turnovers + b.turnovers;
    totaux.knockOns += a.knockOns + b.knockOns;
    totaux.tempsJeuEffectifMin += s.tempsJeuEffectif / 60;
  }
  const moyennes = {};
  for (const k of Object.keys(totaux)) moyennes[k] = totaux[k] / n;
  return moyennes;
}

const moyennes = mesurer(N);
let dansLaFourchette = 0;
const lignes = [];
for (const k of Object.keys(FOURCHETTES)) {
  const [min, max] = FOURCHETTES[k];
  const v = moyennes[k];
  const ok = v >= min && v <= max;
  if (ok) dansLaFourchette++;
  lignes.push(`${ok ? 'OK  ' : 'HORS'} ${LABELS[k].padEnd(28)} ${v.toFixed(1).padStart(7)}  attendu=[${min}-${max}]`);
}
console.log(`--- Calibration du moteur sur ${N} match(s) de 80 min ---\n`);
console.log(lignes.join('\n'));
console.log(`\n${dansLaFourchette}/14 catégorie(s) dans la fourchette (minimum exigé : ${CATEGORIES_MINIMUM}).`);

// Garde-fous qui ne doivent JAMAIS céder, même en recalibrant : un match sans
// essai, sans touche ou sans turnover ne serait plus du rugby.
const ESSENTIELS = ['essais', 'points', 'lineouts', 'turnovers'];
const essentielsHors = ESSENTIELS.filter((k) => {
  const [min, max] = FOURCHETTES[k];
  return moyennes[k] < min || moyennes[k] > max;
});
if (essentielsHors.length) {
  console.error(`\nECHEC : catégorie(s) essentielle(s) hors fourchette : ${essentielsHors.join(', ')}`);
  process.exit(1);
}
if (dansLaFourchette < CATEGORIES_MINIMUM) {
  console.error(`\nECHEC : ${dansLaFourchette}/14 seulement, il en faut ${CATEGORIES_MINIMUM}.`);
  process.exit(1);
}
console.log('\nOK : le moteur produit des volumes d\'actions réalistes.');
