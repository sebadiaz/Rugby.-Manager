// RM4-G17 (mesure) : géométrie défensive en jeu courant, LEGACY vs GOAP (défense conduite).
// node server/v4/compare-defense.js [graines=4] [secondes=600]
'use strict';
const { MatchEngine } = require('../../engine/rugby-engine.js');
const { configGOAP } = require('../../engine/ai/goap-mode.js');
const N = +process.argv[2] || 4, D = +process.argv[3] || 600, DT = 0.05;
function mesurer(goap) {
  const a = { n: 0, d1: 0, pres5: 0, devant: 0, gap: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const m = new MatchEngine(seed, 4800, goap ? configGOAP(null, { agent: { placementScope: 'defense' } }) : null);
    for (let i = 0; i < D / DT; i++) {
      m.tick(DT);
      if (i % 10 || m.phase !== 'PORTE' || !m.porteur) continue;
      const p = m.porteur, def = (p.team === 'A' ? m.equipeB : m.equipeA).filter((j) => !(j.auSol > 0) && !(j.sinBin > 0) && j.numero !== 15);
      const ds = def.map((j) => Math.hypot(j.x - p.x, j.y - p.y)).sort((x, y) => x - y);
      // défenseurs ENTRE le porteur et leur ligne (devant lui), dans un couloir de 15 m
      const dev = def.filter((j) => (p.x - j.x) * j.sensAttaque < 0 === false && Math.abs(j.y - p.y) <= 15);
      const ys = dev.map((j) => j.y).concat([p.y - 15, p.y + 15]).sort((x, y) => x - y);
      let g = 0; for (let k = 1; k < ys.length; k++) g = Math.max(g, ys[k] - ys[k - 1]);
      a.n++; a.d1 += ds[0]; a.pres5 += ds.filter((x) => x <= 5).length; a.devant += dev.length; a.gap += g;
    }
  }
  return { echantillons: a.n, premierDefenseurM: (a.d1 / a.n).toFixed(1), aMoinsDe5m: (a.pres5 / a.n).toFixed(2), devantDansCouloir: (a.devant / a.n).toFixed(1), plusGrandTrouM: (a.gap / a.n).toFixed(1) };
}
console.log('LEGACY', JSON.stringify(mesurer(false)));
console.log('GOAP  ', JSON.stringify(mesurer(true)));
