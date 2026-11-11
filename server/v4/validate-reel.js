// Validation de GOAP contre des repères RÉELS (World Rugby, Six Nations 2023 : ~314 passes, 185 rucks,
// 55 coups de pied, 26 touches, 11 mêlées par match). Jamais contre LEGACY. node server/v4/validate-reel.js [graines=2]
'use strict';
const { MatchEngine } = require('../../engine/rugby-engine.js');
const { configGOAP } = require('../../engine/ai/goap-mode.js');
const N = +process.argv[2] || 2, REEL = { passes: 314, rucks: 185, kicks: 55, lineouts: 26, scrums: 11 };
const tot = {};
for (let seed = 1; seed <= N; seed++) {
  const m = new MatchEngine(seed, 4800, configGOAP());
  while (m.phase !== 'TERMINE' && m.tempsMatch < 5400) m.tick(0.1);
  const s = m.getState(); process.stderr.write('.');
  for (const k of ['passes', 'rucks', 'kicks', 'lineouts', 'scrums', 'tacklesMade', 'tacklesAttempted', 'essais', 'penalitesConcedees', 'knockOns', 'turnovers'])
    tot[k] = (tot[k] || 0) + s.stats.A[k] + s.stats.B[k];
  tot.points = (tot.points || 0) + s.score.A + s.score.B;
}
console.log('\nGOAP, match complet, moyenne sur', N, 'graines (pas 0,1 s)');
for (const [k, v] of Object.entries(tot)) console.log(k.padEnd(20), (v / N).toFixed(1).padStart(8), REEL[k] ? '  repère réel ~' + REEL[k] : '');
