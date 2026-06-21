// Outil de calibration : simule N matchs complets (80 min) sans rendu et compare
// les moyennes cumulées (équipe A + équipe B) aux fourchettes réalistes attendues,
// pour calibrer le comportement du moteur (server/simulate-batch.js [n] [seedDepart]).
'use strict';

const { MatchEngine } = require('../engine/rugby-engine.js');

const n = Number(process.argv[2]) || 50;
const seedDepart = Number(process.argv[3]) || 1;
const dureeSecondes = 4800; // 80 minutes
const dt = 0.2;

// Fourchettes réalistes demandées (cumul des deux équipes, sur un match complet).
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

const cles = Object.keys(FOURCHETTES);
const totaux = {};
for (const k of cles) totaux[k] = 0;

let matchsOk = 0;
for (let i = 0; i < n; i++) {
  const seed = seedDepart + i;
  const m = new MatchEngine(seed, dureeSecondes);
  for (let t = 0; t < dureeSecondes; t += dt) m.tick(dt);

  const s = m.getState();
  const sa = s.stats.A, sb = s.stats.B;
  totaux.essais += sa.essais + sb.essais;
  totaux.points += s.score.A + s.score.B;
  totaux.carries += sa.carries + sb.carries;
  totaux.passes += sa.passes + sb.passes;
  totaux.kicks += sa.kicks + sb.kicks;
  totaux.tacklesAttempted += sa.tacklesAttempted + sb.tacklesAttempted;
  totaux.rucks += sa.rucks + sb.rucks;
  totaux.lineouts += sa.lineouts + sb.lineouts;
  totaux.scrums += sa.scrums + sb.scrums;
  totaux.mauls += sa.mauls + sb.mauls;
  totaux.penalitesConcedees += sa.penalitesConcedees + sb.penalitesConcedees;
  totaux.turnovers += sa.turnovers + sb.turnovers;
  totaux.knockOns += sa.knockOns + sb.knockOns;
  totaux.tempsJeuEffectifMin += s.tempsJeuEffectif / 60;
  matchsOk++;
}

console.log(`--- Calibration sur ${matchsOk} match(s) simulé(s) (graines ${seedDepart} à ${seedDepart + n - 1}) ---\n`);

const LABELS = {
  essais: 'Essais',
  points: 'Points (total)',
  carries: 'Courses (ballon en main)',
  passes: 'Passes',
  kicks: 'Coups de pied',
  tacklesAttempted: 'Plaquages tentés',
  rucks: 'Rucks',
  lineouts: 'Touches (lineouts)',
  scrums: 'Mêlées (scrums)',
  mauls: 'Mauls',
  penalitesConcedees: 'Pénalités concédées',
  turnovers: 'Turnovers',
  knockOns: 'En-avants (knock-ons)',
  tempsJeuEffectifMin: 'Temps de jeu effectif (min)',
};

let nbHorsFourchette = 0;
for (const k of cles) {
  const [min, max] = FOURCHETTES[k];
  const moyenne = totaux[k] / matchsOk;
  let statut;
  if (moyenne < min) { statut = 'TROP BAS'; nbHorsFourchette++; }
  else if (moyenne > max) { statut = 'TROP HAUT'; nbHorsFourchette++; }
  else statut = 'OK';
  console.log(
    `${LABELS[k].padEnd(28)} moyenne=${moyenne.toFixed(1).padStart(7)}  attendu=[${min}-${max}]  ${statut}`
  );
}

console.log(`\n${cles.length - nbHorsFourchette}/${cles.length} catégories dans la fourchette attendue.`);
if (nbHorsFourchette > 0) process.exitCode = 1;
