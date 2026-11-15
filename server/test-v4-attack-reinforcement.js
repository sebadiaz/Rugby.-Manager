// Renforts d'attaque INDIVIDUELS : l'arrière qui s'intercale (JOIN_LINE) et l'ailier du côté fermé qui vient
// en renfort côté ouvert (SWITCH_WING). Chacun décide d'après ce qu'il voit ; personne n'est désigné.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { individualPlacement, candidatsRenfort } = require('../engine/ai/individual-placement.js');
const { deriveSituation } = require('../engine/ai/goals.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

// Agent de A (attaque vers x = 100) ; ballon en `bal` porté par A9. mates/opps : { id: [numero, x, y] }.
function croyances(numero, moi, bal, { mates = {}, opps = {}, phase = 'PORTE', possession = 'A' } = {}) {
  const fiche = (n, x, y) => ({ numero: n, lastSeen: { x, y }, age: 0.2, confidence: 1, vx: 0, vy: 0 });
  return {
    t: 500, agent: { team: 'A', numero }, phase, possession, score: { A: 0, B: 0 }, heard: [],
    self: { x: moi.x, y: moi.y, sensAttaque: 1, vitesse: 70, available: true, grounded: false },
    ball: { lastSeen: { x: bal.x, y: bal.y }, age: 0.1, state: 'HELD', owner: 'A9' },
    teammates: Object.fromEntries(Object.entries(mates).map(([id, [n, x, y]]) => [id, fiche(n, x, y)])),
    opponents: Object.fromEntries(Object.entries(opps).map(([id, [n, x, y]]) => [id, fiche(n, x, y)])),
    ruck: null,
  };
}
const bal = { x: 55, y: 15 }; // côté ouvert vers y = 70 (55 m de large), côté fermé 15 m
const lignaAtt = { A10: [10, 48, 22], A12: [12, 46, 30], A13: [13, 45, 38], A14: [14, 44, 55] };
const defPeu = { B10: [10, 60, 24], B12: [12, 60, 32], B13: [13, 60, 42] };
const defNombreux = Object.assign({ B14: [14, 61, 52], B11: [11, 62, 60], B7: [7, 59, 28], B6: [6, 59, 36], B8: [8, 60, 46] }, defPeu);

test('JOIN_LINE : l\'arrière s\'intercale quand il voit le surnombre côté ouvert, au milieu du terrain', () => {
  const b = croyances(15, { x: 30, y: 35 }, bal, { mates: lignaAtt, opps: defPeu });
  const c = candidatsRenfort(b, deriveSituation(b)).find((x) => x.id === 'JOIN_LINE');
  assert.ok(c, 'candidat attendu');
  assert.ok(c.target.y > 38 && c.target.y < 50, 'entre le 13 et l\'aile : ' + c.target.y);
  assert.ok(c.target.x < bal.x - 8, 'en retrait du ballon (passe possible)');
  const p = individualPlacement(b, 'COVER_BACKFIELD', {}, { vitesseMs: 7 }, true);
  assert.strictEqual(p.placementGoal, 'JOIN_LINE');
});

test('JOIN_LINE refusé : défense plus nombreuse vue côté ouvert, ou son camp menacé (près de sa ligne)', () => {
  const b1 = croyances(15, { x: 30, y: 35 }, bal, { mates: lignaAtt, opps: defNombreux });
  assert.ok(!candidatsRenfort(b1, deriveSituation(b1)).some((x) => x.id === 'JOIN_LINE'));
  assert.strictEqual(individualPlacement(b1, 'COVER_BACKFIELD', {}, { vitesseMs: 7 }, true).placementGoal, 'COVER_BACKFIELD');
  const b2 = croyances(15, { x: 10, y: 35 }, { x: 25, y: 15 }, { mates: lignaAtt, opps: defPeu });
  assert.ok(!candidatsRenfort(b2, deriveSituation(b2)).some((x) => x.id === 'JOIN_LINE'));
});

test('SWITCH_WING : l\'ailier du côté fermé (15 m) vient en renfort côté ouvert ; celui du côté ouvert garde sa largeur', () => {
  const b11 = croyances(11, { x: 45, y: 4 }, bal, { mates: lignaAtt, opps: defPeu });
  const p11 = individualPlacement(b11, 'BE_PASS_OPTION', {}, { vitesseMs: 7, option: 0.6 }, true);
  assert.strictEqual(p11.placementGoal, 'SWITCH_WING');
  assert.ok(p11.target.y > bal.y + 8, 'traverse vers le côté ouvert : ' + p11.target.y);
  const b14 = croyances(14, { x: 44, y: 64 }, bal, { mates: lignaAtt, opps: defPeu });
  assert.ok(!candidatsRenfort(b14, deriveSituation(b14)).some((x) => x.id === 'SWITCH_WING'));
});

test('pas de renfort en défense, ni pour le porteur, ni pour un avant', () => {
  const def = croyances(15, { x: 30, y: 35 }, bal, { mates: lignaAtt, opps: defPeu, possession: 'B' });
  def.ball.owner = 'B9';
  assert.strictEqual(candidatsRenfort(def, deriveSituation(def)).length, 0);
  const avant = croyances(6, { x: 50, y: 20 }, bal, { mates: lignaAtt, opps: defPeu });
  assert.strictEqual(candidatsRenfort(avant, deriveSituation(avant)).length, 0);
});

test('architecture : aucun renfort désigné par un tiers (pas de coordinateur, aucune cible écrite pour un autre)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/individual-placement.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/TeamCoordinator|TeamBlackboard|assignRoles|reserveRole|Math\.random|Date\.now/.test(src));
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
