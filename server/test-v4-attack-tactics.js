// Tactiques d'attaque INDIVIDUELLES : passe au pied (cross-kick), chistera dans le contact, course croisée.
// Chaque geste est une lecture du joueur ; le moteur résout vol, réception, en-avant et légalité.
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { lirePorteur, lireChistera } = require('../engine/ai/open-play.js');
const { lireCroisee } = require('../engine/ai/individual-placement.js');
const { deriveSituation } = require('../engine/ai/goals.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

// Croyances d'un agent A (attaque vers x = 100). mates/opps : { id: [numero, x, y, vx?, vy?] }.
function croyances(numero, moi, { owner = 'A' + numero, mates = {}, opps = {}, jeuPied = 80 } = {}) {
  const fiche = ([n, x, y, vx = 0, vy = 0]) => ({ numero: n, lastSeen: { x, y }, age: 0.1, confidence: 1, vx, vy, available: true });
  const porteur = owner === 'A' + numero ? moi : (mates[owner] ? { x: mates[owner][1], y: mates[owner][2] } : moi);
  return {
    t: 900, agent: { team: 'A', numero }, phase: 'PORTE', possession: 'A', score: { A: 0, B: 0 }, heard: [],
    self: { x: moi.x, y: moi.y, sensAttaque: 1, vitesse: 70, jeuPied, available: true, grounded: false },
    ball: { lastSeen: { x: porteur.x, y: porteur.y }, age: 0.1, state: 'HELD', owner },
    teammates: Object.fromEntries(Object.entries(mates).map(([id, v]) => [id, fiche(v)])),
    opponents: Object.fromEntries(Object.entries(opps).map(([id, v]) => [id, fiche(v)])), ruck: null,
  };
}
const profil = { distribute: 0.6 };

test('passe au pied : le 10 voit son ailier libre sur l\'aile opposée, en retrait -> PASSE_PIED vers lui', () => {
  const mates = { A14: [14, 72, 64], A12: [12, 74, 30] };
  const opps = { B10: [10, 82, 22], B12: [12, 82, 28], B13: [13, 83, 36], B7: [7, 80, 18], B15: [15, 95, 30] };
  const d = lirePorteur(croyances(10, { x: 78, y: 22 }, { mates, opps }), deriveSituation(croyances(10, { x: 78, y: 22 }, { mates, opps })), profil, {});
  assert.ok(d && d.action === 'KICK' && d.kick === 'PASSE_PIED', JSON.stringify(d && { a: d.action, k: d.kick }));
  assert.strictEqual(d.vers, 14);
  assert.ok(d.cibleY > 60 && d.cibleX > 78, 'devant l\'ailier, près de sa touche');
});

test('passe au pied refusée : un défenseur couvre le point de chute, ou le botteur est mauvais', () => {
  const mates = { A14: [14, 72, 64], A12: [12, 74, 30] };
  const opps = { B10: [10, 82, 22], B12: [12, 82, 28], B13: [13, 83, 36], B7: [7, 80, 18], B11: [11, 88, 63] };
  const b = croyances(10, { x: 78, y: 22 }, { mates, opps });
  const d = lirePorteur(b, deriveSituation(b), profil, {});
  assert.ok(!d || d.kick !== 'PASSE_PIED');
  const b2 = croyances(10, { x: 78, y: 22 }, { mates, opps: { B10: [10, 82, 22], B12: [12, 82, 28], B13: [13, 83, 36] }, jeuPied: 50 });
  const d2 = lirePorteur(b2, deriveSituation(b2), profil, {});
  assert.ok(!d2 || d2.kick !== 'PASSE_PIED');
});

test('chistera : plaqueur sur moi, soutien à 3 m en retrait de l\'autre côté, espace libre -> passe chistera', () => {
  const b = croyances(12, { x: 60, y: 30 }, { mates: { A13: [13, 57, 33, 6, 0] }, opps: { B12: [12, 62, 28.5], B10: [10, 66, 20] } });
  const c = lireChistera(b, b.self, 1, Object.values(b.opponents), 2.5);
  assert.ok(c && c.chistera && c.vers === 13);
  // Soutien du même côté que le plaqueur, ou défenseur sur le receveur : pas de chistera.
  const b2 = croyances(12, { x: 60, y: 30 }, { mates: { A13: [13, 58.5, 27] }, opps: { B12: [12, 62, 28.5] } });
  assert.strictEqual(lireChistera(b2, b2.self, 1, Object.values(b2.opponents), 2.5), null);
  const b3 = croyances(12, { x: 60, y: 30 }, { mates: { A13: [13, 58.5, 33] }, opps: { B12: [12, 62, 28.5], B13: [13, 59.5, 34.5] } });
  assert.strictEqual(lireChistera(b3, b3.self, 1, Object.values(b3.opponents), 2.5), null);
});

test('course croisée : le 13 voit le 12 dériver et la défense glisser avec lui -> repique derrière, à contre-sens', () => {
  const mates = { A12: [12, 60, 30, 1, 4] };
  const opps = { B12: [12, 66, 33, 0, 3], B13: [13, 67, 40, 0, 3], B10: [10, 66, 26, 0, 2] };
  const b = croyances(13, { x: 58, y: 37 }, { owner: 'A12', mates, opps });
  const c = lireCroisee(b, deriveSituation(b));
  assert.ok(c && c.id === 'CROSS_RUN');
  assert.ok(c.target.y < 30 && c.target.x < 60, 'derrière le porteur, côté opposé à sa dérive : ' + JSON.stringify(c.target));
  // Défense qui ne glisse pas : pas de croisée.
  const fixes = { B12: [12, 66, 33], B13: [13, 67, 40], B10: [10, 66, 26] };
  const b2 = croyances(13, { x: 58, y: 37 }, { owner: 'A12', mates, opps: fixes });
  assert.strictEqual(lireCroisee(b2, deriveSituation(b2)), null);
});

// Moteur GOAP piloté à la main : le test pose les demandes du porteur.
function matchPilote(graine, duree, demande) {
  const log = [];
  const m = new MatchEngine(graine, 4800, { aiMode: 'GOAP', agentDriver: () => ({ avantTick(e) { demande(e); } }) });
  const l = m.log.bind(m);
  m.log = (t, eq, msg, d) => { log.push({ t, d, phase: m.phase, x: m.cibleCoupDePiedX, y: m.cibleCoupDePiedY }); return l(t, eq, msg, d); };
  for (let t = 0; t < duree; t += 0.1) m.tick(0.1);
  return { m, log };
}

test('moteur : une passe au pied demandée vole vers la cible (erreur bornée) et la réception est résolue', () => {
  const { log } = matchPilote(5, 900, (e) => {
    const p = e.porteur;
    if (e.phase !== 'PORTE' || !p || p.numero !== 10 || e.penaliteRecul || e.penaliteChoix) return;
    const sens = p.sensAttaque, cy = p.y < 35 ? 64 : 6;
    e.setAgentIntent(p.team, 10, { jeu: { action: 'KICK', type: 'PASSE_PIED', cibleX: p.x + sens * 12, cibleY: cy } });
  });
  const pp = log.filter((x) => x.t === 'PASSE_AU_PIED');
  assert.ok(pp.length >= 2, 'passes au pied : ' + pp.length);
  for (const x of pp) assert.ok(x.d.erreur <= 0.14 * Math.hypot(30, 60), 'erreur bornée');
  assert.ok(log.filter((x) => x.t === 'COUP_DE_PIED').length >= pp.length);
});

test('moteur : une chistera demandée dans le contact donne une passe ou un en-avant, jamais une passe en avant', () => {
  let chist = 0;
  const { log } = matchPilote(6, 1200, (e) => {
    const p = e.porteur;
    if (e.phase !== 'PORTE' || !p || e.penaliteRecul || e.penaliteChoix) return;
    const att = (p.team === 'A' ? e.equipeA : e.equipeB).filter((j) => j !== p && j.auSol === 0 && (j.x - p.x) * p.sensAttaque < -0.5 && Math.hypot(j.x - p.x, j.y - p.y) <= 6);
    if (!att.length) return;
    e.setAgentIntent(p.team, p.numero, { jeu: { action: 'PASS', vers: att[0].numero, chistera: true } });
    chist++;
  });
  const ok = log.filter((x) => x.t === 'CHISTERA').length, rate = log.filter((x) => x.t === 'CHISTERA_RATEE').length;
  assert.ok(chist > 0 && ok + rate >= 3, `${ok} chisteras, ${rate} ratées`);
  assert.ok(ok > rate, 'la plupart réussissent');
});

test('LEGACY : passe au pied et chistera refusées (setAgentIntent), jeu identique', () => {
  const a = new MatchEngine(8, 4800), b = new MatchEngine(8, 4800);
  assert.strictEqual(b.setAgentIntent('A', 10, { jeu: { action: 'KICK', type: 'PASSE_PIED', cibleX: 60, cibleY: 60 } }), false);
  assert.strictEqual(b.setAgentIntent('A', 12, { jeu: { action: 'PASS', vers: 13, chistera: true } }), false);
  for (let i = 0; i < 1500; i++) { a.tick(0.1); b.tick(0.1); }
  assert.strictEqual(JSON.stringify(a.getState()), JSON.stringify(b.getState()));
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
