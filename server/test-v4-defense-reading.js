// Lecture INDIVIDUELLE des attaques adverses par un défenseur : surnombre vu à l'extérieur (MARK_EXTRA_MAN)
// et course croisée lue (READ_CROSS). Aucune consigne d'équipe : chacun compte ce qu'il voit.
'use strict';
const assert = require('assert');
const { lireAttaqueAdverse, individualPlacement } = require('../engine/ai/individual-placement.js');
const { deriveSituation } = require('../engine/ai/goals.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

// Défenseur de A (A attaque vers x = 100, donc défend la ligne x = 0) ; B porte le ballon vers x = 0.
function croyances(numero, moi, porteur, { mates = {}, opps = {} } = {}) {
  const fiche = ([n, x, y, vx = 0, vy = 0]) => ({ numero: n, lastSeen: { x, y }, age: 0.1, confidence: 1, vx, vy, available: true, threat: 0.5 });
  return {
    t: 700, agent: { team: 'A', numero }, phase: 'PORTE', possession: 'B', score: { A: 0, B: 0 }, heard: [],
    self: { x: moi.x, y: moi.y, sensAttaque: 1, vitesse: 70, available: true, grounded: false },
    ball: { lastSeen: { x: porteur[1], y: porteur[2] }, age: 0.1, state: 'HELD', owner: 'B12' },
    teammates: Object.fromEntries(Object.entries(mates).map(([id, v]) => [id, fiche(v)])),
    opponents: Object.fromEntries(Object.entries(Object.assign({ B12: porteur }, opps)).map(([id, v]) => [id, fiche(v)])), ruck: null,
  };
}
const lire = (b) => { const s = deriveSituation(b); return lireAttaqueAdverse(b, s, b.self, s.ball.lastSeen, b.opponents[s.ball.owner], s.sens); };

test('MARK_EXTRA_MAN : trois attaquants vus à mon extérieur contre un partenaire -> je glisse sur l\'attaquant libre le plus proche', () => {
  const b = croyances(13, { x: 40, y: 38 }, [12, 46, 30], {
    mates: { A14: [14, 40, 52] },
    opps: { B13: [13, 47, 42], B15: [15, 48, 48], B14: [14, 48, 58] },
  });
  const c = lire(b).find((x) => x.id === 'MARK_EXTRA_MAN');
  assert.ok(c, 'candidat attendu');
  assert.ok(Math.abs(c.target.y - 42) < 0.01, 'le plus proche des attaquants libres : B13 (y=42), cible ' + c.target.y);
  assert.ok(c.target.x < 47, 'entre l\'attaquant et ma ligne');
});

test('MARK_EXTRA_MAN absent quand nous sommes en nombre à l\'extérieur', () => {
  const b = croyances(13, { x: 40, y: 38 }, [12, 46, 30], {
    mates: { A14: [14, 40, 52], A15: [15, 38, 46], A11: [11, 40, 60] },
    opps: { B13: [13, 47, 42], B14: [14, 48, 58] },
  });
  assert.ok(!lire(b).some((x) => x.id === 'MARK_EXTRA_MAN'));
});

test('READ_CROSS : un attaquant repique à contre-sens juste derrière un porteur qui dérive -> je coupe sa course', () => {
  // Le porteur dérive vers +y (vy=4) ; B13 arrive derrière lui en courant vers -y (vy=-4), dans mon couloir.
  const b = croyances(12, { x: 40, y: 28 }, [12, 46, 30, -1, 4], { opps: { B13: [13, 48, 33, -1, -4] } });
  const c = lire(b).find((x) => x.id === 'READ_CROSS');
  assert.ok(c, 'croisée lue');
  assert.ok(c.target.y < 33, 'je vise sa course future, pas sa position : ' + c.target.y);
  // Sans dérive du porteur, rien à lire.
  const b2 = croyances(12, { x: 40, y: 28 }, [12, 46, 30, -1, 0], { opps: { B13: [13, 48, 33, -1, -4] } });
  assert.ok(!lire(b2).some((x) => x.id === 'READ_CROSS'));
});

test('ces lectures restent des candidats : le défenseur les compare à ses autres placements', () => {
  const b = croyances(13, { x: 40, y: 38 }, [12, 46, 30], {
    mates: { A14: [14, 40, 52] }, opps: { B13: [13, 47, 42], B15: [15, 48, 48], B14: [14, 48, 58] } });
  const p = individualPlacement(b, 'DEFEND', {}, { vitesseMs: 7 }, true);
  assert.ok(p.candidates.some((c) => c.id === 'MARK_EXTRA_MAN'));
  assert.ok(p.candidates.length >= 3);
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
