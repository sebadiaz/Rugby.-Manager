// RM4-G10 — comparaison appariée : moteur seul vs moteur + 30 agents au placement individuel.
// Outil de mesure (pas un test) : node server/v4/compare-placement.js [graines=8] [secondes=1200]
'use strict';
const { MatchEngine } = require('../../engine/rugby-engine.js');
const { AgentScheduler, creerAgents } = require('../../engine/ai/agent-scheduler.js');

const N = Number(process.argv[2]) || 8, DUREE = Number(process.argv[3]) || 1200, DT = 0.05;
const copie = (e) => JSON.parse(JSON.stringify(e));
const CLES = ['essais', 'passes', 'carries', 'tacklesAttempted', 'tacklesMade', 'rucks', 'scrums', 'lineouts', 'kicks', 'turnovers', 'knockOns', 'penalitesConcedees', 'metresGagnes'];
const somme = (s, k) => s.stats.A[k] + s.stats.B[k];

function jouer(seed, avecAgents) {
  const m = new MatchEngine(seed, 4800);
  const sched = avecAgents ? new AgentScheduler(creerAgents({ placement: true, placementScope: process.env.SCOPE || 'all' })) : null;
  let ms = 0;
  for (let t = 0; t < DUREE; t += DT) {
    if (sched) { const t0 = process.hrtime.bigint(); const r = sched.tick(copie(m.getState()), null); ms += Number(process.hrtime.bigint() - t0) / 1e6; sched.appliquer(m, r); }
    m.tick(DT);
  }
  const s = m.getState();
  const out = { points: s.score.A + s.score.B, temps: s.tempsJeuEffectif / 60, possA: s.possessionPct.A, ms };
  for (const k of CLES) out[k] = somme(s, k);
  if (sched) { out.plans = sched.agents.reduce((n, a) => n + a.events.filter((e) => e.type === 'PLAN_CREATED').length, 0); out.decisions = sched.stats.decisions; }
  return out;
}
const lignes = { seul: [], agents: [] };
for (let seed = 1; seed <= N; seed++) { lignes.seul.push(jouer(seed, false)); lignes.agents.push(jouer(seed, true)); process.stderr.write('.'); }
process.stderr.write('\n');
const moy = (arr, k) => arr.reduce((s, x) => s + x[k], 0) / arr.length;
console.log(`graines 1..${N}, ${DUREE} s de jeu par match, pas ${DT} s`);
console.log('statistique'.padEnd(22), 'moteur seul'.padStart(12), '+30 agents'.padStart(12), 'écart %'.padStart(9));
for (const k of ['points', ...CLES, 'temps', 'possA']) {
  const a = moy(lignes.seul, k), b = moy(lignes.agents, k);
  console.log(k.padEnd(22), a.toFixed(1).padStart(12), b.toFixed(1).padStart(12), (a ? (100 * (b - a) / a).toFixed(0) : '-').padStart(9));
}
console.log('plans créés / match :', moy(lignes.agents, 'plans').toFixed(0), ' CPU agents (ms/tick) :', (moy(lignes.agents, 'ms') / (DUREE / DT)).toFixed(2));
