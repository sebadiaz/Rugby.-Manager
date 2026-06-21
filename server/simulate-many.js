// Test de vivacité visuelle : simule 10 matchs complets (80 min) sans rendu et
// vérifie que les actions qui rendent la simulation lisible à l'écran (passes,
// coups de pied, mêlées, touches, rucks) se produisent assez souvent en
// moyenne. Contrairement à server/simulate-batch.js (fourchettes réalistes
// précises sur 14 catégories), ce script ne pose que des seuils MINIMUMS sur
// les catégories visées par la demande "simulation morte visuellement".
// Usage : node server/simulate-many.js
'use strict';

const { MatchEngine } = require('../engine/rugby-engine.js');

const N_MATCHS = 10;
const SEED_DEPART = 1;
const DUREE_SECONDES = 4800; // 80 minutes
const DT = 0.2;

const SEUILS_MIN = {
  passes: 80,
  kicks: 10,
  scrums: 3,
  lineouts: 8,
  rucks: 50,
};

const LABELS = {
  passes: 'Passes',
  kicks: 'Coups de pied',
  scrums: 'Mêlées (scrums)',
  lineouts: 'Touches (lineouts)',
  rucks: 'Rucks',
};

const cles = Object.keys(SEUILS_MIN);
const totaux = {};
for (const k of cles) totaux[k] = 0;

console.log(`--- Simulation de ${N_MATCHS} match(s) de 80 min (graines ${SEED_DEPART} à ${SEED_DEPART + N_MATCHS - 1}) ---\n`);

for (let i = 0; i < N_MATCHS; i++) {
  const seed = SEED_DEPART + i;
  const m = new MatchEngine(seed, DUREE_SECONDES);
  for (let t = 0; t < DUREE_SECONDES; t += DT) m.tick(DT);

  const s = m.getState();
  const sa = s.stats.A, sb = s.stats.B;
  const parMatch = {
    passes: sa.passes + sb.passes,
    kicks: sa.kicks + sb.kicks,
    scrums: sa.scrums + sb.scrums,
    lineouts: sa.lineouts + sb.lineouts,
    rucks: sa.rucks + sb.rucks,
  };
  for (const k of cles) totaux[k] += parMatch[k];
  console.log(
    `Match ${i + 1} (graine ${seed}) : ` +
    cles.map(k => `${LABELS[k]}=${parMatch[k]}`).join('  ')
  );
}

console.log('\n--- Moyennes sur les 10 matchs ---\n');

let nbEnDessous = 0;
for (const k of cles) {
  const moyenne = totaux[k] / N_MATCHS;
  const seuil = SEUILS_MIN[k];
  const statut = moyenne >= seuil ? 'OK' : 'TROP BAS';
  if (moyenne < seuil) nbEnDessous++;
  console.log(`${LABELS[k].padEnd(20)} moyenne=${moyenne.toFixed(1).padStart(7)}  minimum=${seuil}  ${statut}`);
}

console.log(`\n${cles.length - nbEnDessous}/${cles.length} catégories au-dessus du minimum attendu.`);
if (nbEnDessous > 0) {
  console.error('\nECHEC : la simulation reste trop pauvre visuellement sur au moins une catégorie.');
  process.exitCode = 1;
} else {
  console.log('\nOK : la simulation est suffisamment vivante sur toutes les catégories ciblées.');
}
