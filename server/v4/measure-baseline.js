// RM4-G00 — Geler et mesurer le moteur existant (docs/SIMULATION_V4/PLAN_CLAUDE_CODE.md).
// Lecture seule : le script ne modifie ni le moteur ni ses fichiers ; il simule
// des matchs complets sur graines fixes et écrit, avec --ecrire, la baseline
// (docs/SIMULATION_V4/BASELINE.md + fixtures/baseline_30_graines.json).
//
//   node server/v4/measure-baseline.js [nbGraines=30] [--ecrire]
//
// Toutes les valeurs viennent de getState() (stats du match) : rien n'est estimé.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { MatchEngine } = require('../../engine/rugby-engine.js');

const N = Number(process.argv.find((a) => /^\d+$/.test(a))) || 30;
const ECRIRE = process.argv.includes('--ecrire');
const DUREE = 4800;
const DT = 0.1;
const RACINE = path.join(__dirname, '..', '..');

const git = (cmd) => { try { return execSync('git ' + cmd, { cwd: RACINE }).toString().trim(); } catch (e) { return 'inconnu'; } };

// Un cumul des deux équipes par match, sauf la possession (équipe A).
const METRIQUES = [
  ['essais', (s) => s.stats.A.essais + s.stats.B.essais],
  ['points', (s) => s.score.A + s.score.B],
  ['passes', (s) => s.stats.A.passes + s.stats.B.passes],
  ['passesTentees', (s) => s.stats.A.passesTentees + s.stats.B.passesTentees],
  ['courses', (s) => s.stats.A.carries + s.stats.B.carries],
  ['metresGagnes', (s) => s.stats.A.metresGagnes + s.stats.B.metresGagnes],
  ['coupsDePied', (s) => s.stats.A.kicks + s.stats.B.kicks],
  ['plaquagesTentes', (s) => s.stats.A.tacklesAttempted + s.stats.B.tacklesAttempted],
  ['plaquagesReussis', (s) => s.stats.A.tacklesMade + s.stats.B.tacklesMade],
  ['rucks', (s) => s.stats.A.rucks + s.stats.B.rucks],
  ['melees', (s) => s.stats.A.scrums + s.stats.B.scrums],
  ['touches', (s) => s.stats.A.lineouts + s.stats.B.lineouts],
  ['mauls', (s) => s.stats.A.mauls + s.stats.B.mauls],
  ['penalitesConcedees', (s) => s.stats.A.penalitesConcedees + s.stats.B.penalitesConcedees],
  ['turnovers', (s) => s.stats.A.turnovers + s.stats.B.turnovers],
  ['enAvants', (s) => s.stats.A.knockOns + s.stats.B.knockOns],
  ['cartonsJaunes', (s) => s.stats.A.cartonsJaunes + s.stats.B.cartonsJaunes],
  ['tempsJeuEffectifMin', (s) => s.tempsJeuEffectif / 60],
  ['possessionA', (s) => s.possessionPct.A],
  ['essaisDuN15', (s) => (s.chronologie || []).filter((e) => e.type === 'ESSAI' && e.marqueur === 15).length],
];

const moyenne = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ecartType = (a) => { const m = moyenne(a); return Math.sqrt(moyenne(a.map((v) => (v - m) ** 2))); };

// Captures de positions (8) : un instantané des 30 joueurs et du ballon par
// phase de jeu, pour comparer plus tard le placement individuel des agents.
const PHASES_CAPTURE = ['RUCK', 'MELEE', 'TOUCHE', 'MAUL', 'COUP_ENVOI', 'PORTE', 'RUCK', 'MELEE'];
function capturer(seed, phaseVoulue) {
  const m = new MatchEngine(seed, DUREE);
  let duree = 0, derniere = null;
  for (let t = 0; t < DUREE && m.phase !== 'TERMINE'; t += DT) {
    m.tick(DT);
    // Phase tenue au moins 1,5 s (la mêlée et le maul n'ont pas de minuteur commun).
    duree = m.phase === derniere ? duree + DT : 0; derniere = m.phase;
    if (m.tempsMatch > 300 && m.phase === phaseVoulue && duree >= 1.5) {
      const s = m.getState();
      const j = (x) => ({ eq: x.team, n: x.numero, x: +x.x.toFixed(2), y: +x.y.toFixed(2) });
      return { seed, phase: m.phase, temps: +m.tempsMatch.toFixed(1), joueurs: [...s.equipeA, ...s.equipeB].map(j),
        ballon: { x: +s.ballon.x.toFixed(2), y: +s.ballon.y.toFixed(2) }, possession: s.possession };
    }
  }
  return null;
}

const parGraine = [];
const t0 = Date.now();
for (let seed = 1; seed <= N; seed++) {
  const m = new MatchEngine(seed, DUREE);
  m.jouerJusquAuSifflet(DT);
  const s = m.getState();
  const ligne = { seed };
  for (const [nom, f] of METRIQUES) ligne[nom] = +f(s).toFixed(3);
  parGraine.push(ligne);
}
const resume = {};
for (const [nom] of METRIQUES) {
  const v = parGraine.map((l) => l[nom]);
  resume[nom] = { moyenne: +moyenne(v).toFixed(2), ecartType: +ecartType(v).toFixed(2), min: Math.min(...v), max: Math.max(...v) };
}
const captures = [];
if (ECRIRE) PHASES_CAPTURE.forEach((ph, i) => {
  // Graine i+1, puis les suivantes si la phase ne se présente pas.
  for (let k = 0; k < 6; k++) { const c = capturer(i + 1 + 8 * k, ph); if (c) { captures.push(c); break; } }
});

const entete = { sha: git('rev-parse HEAD'), shaMain: git('rev-parse origin/main'), branche: git('rev-parse --abbrev-ref HEAD'),
  graines: `1..${N}`, dureeSecondes: DUREE, dt: DT, node: process.version, dureeCalculS: +((Date.now() - t0) / 1000).toFixed(0) };

console.log(JSON.stringify(entete));
console.log('métrique'.padEnd(22), 'moyenne'.padStart(9), 'écart-type'.padStart(11), 'min'.padStart(8), 'max'.padStart(8));
for (const [nom] of METRIQUES) {
  const r = resume[nom];
  console.log(nom.padEnd(22), String(r.moyenne).padStart(9), String(r.ecartType).padStart(11), String(r.min).padStart(8), String(r.max).padStart(8));
}

if (ECRIRE) {
  const dossier = path.join(RACINE, 'docs', 'SIMULATION_V4');
  fs.writeFileSync(path.join(dossier, 'fixtures', 'baseline_30_graines.json'),
    JSON.stringify({ entete, resume, parGraine, captures }, null, 1) + '\n');
  const lignes = [];
  lignes.push('# BASELINE — moteur existant (RM4-G00)', '',
    `Mesurée par \`node server/v4/measure-baseline.js ${N} --ecrire\` (lecture seule, aucune modification du moteur).`, '',
    '## Paramètres', '',
    `- SHA mesuré : \`${entete.sha}\` (branche \`${entete.branche}\`) ; \`origin/main\` au moment de la mesure : \`${entete.shaMain}\``,
    `- Graines ${entete.graines}, durée ${DUREE} s, pas fixe dt = ${DT} s, \`jouerJusquAuSifflet\`, ${entete.node}.`,
    '- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).', '',
    '## Résultats', '', '| Métrique | Moyenne | Écart-type | Min | Max |', '|---|---:|---:|---:|---:|');
  for (const [nom] of METRIQUES) { const r = resume[nom]; lignes.push(`| ${nom} | ${r.moyenne} | ${r.ecartType} | ${r.min} | ${r.max} |`); }
  lignes.push('', '## Données brutes', '',
    '`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et ' + captures.length +
    ' captures de positions des 30 joueurs (`captures`, phases ' + captures.map((c) => c.phase).join(', ') + ').', '',
    '## Limites', '',
    '- Ce sont les statistiques du moteur tel qu\'il est (placements par rôles, pas encore d\'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.',
    '- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.');
  fs.writeFileSync(path.join(dossier, 'BASELINE.md'), lignes.join('\n') + '\n');
  console.log('écrit : BASELINE.md et fixtures/baseline_30_graines.json (' + captures.length + ' captures)');
}
