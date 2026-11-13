// RM4-G12 — acteur de passe (PASS_TO_10) et SECURE_BALL : le moteur tranche, l'agent constate.
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { ActionExecutor } = require('../engine/ai/action-executor.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); } }
const copie = (x) => JSON.parse(JSON.stringify(x));
function scene() {
  const m = new MatchEngine(3, 4800);
  for (let i = 0; i < 2000 && !(m.phase === 'PORTE' && m.porteur && m.porteur.numero !== 10); i++) m.tick(0.1);
  const e = copie(m.getState()); return { m, e, eq: e.ball.carrierTeam, num: e.ball.carrierNumber };
}
test('moteur : une demande de passe n\'est acceptée que du porteur ; sans demande le jeu est identique', () => {
  const a = new MatchEngine(8, 4800), b = new MatchEngine(8, 4800);
  b.setAgentIntent('A', 5, { tx: 50, ty: 30, passe: 10 }); b.clearAgentIntent('A', 5);
  for (let i = 0; i < 3000; i++) { a.tick(0.1); b.tick(0.1); }
  assert.strictEqual(JSON.stringify(a.getState()), JSON.stringify(b.getState()));
  assert.strictEqual(b.setAgentIntent('A', 5, { tx: 1, ty: 1, passe: 99 }), true); // passe invalide ignorée, intention gardée
  assert.strictEqual(b._intentionsAgents.get('A5').passe, null);
});
test('PASS_TO_10 : succès SEULEMENT si le 10 est réellement porteur ; mêlée, interception et autre receveur = ACTION_FAILED', () => {
  const { e, eq, num } = scene();
  const x = (modif) => { const s = copie(e); const ex = new ActionExecutor({ team: eq, numero: num });
    const eqp = eq === 'A' ? s.equipeA : s.equipeB; const dix = eqp.find((j) => j.numero === 10); const moi = eqp.find((j) => j.numero === num);
    dix.x = moi.x - moi.sensAttaque * 4; dix.y = moi.y + 3; dix.auSol = 0; moi.auSol = 0;
    const r = ex.start('PASS_TO_10', s); if (!r.started) return { start: r }; assert.strictEqual(r.intent.passe, 10);
    const t = copie(s); t.tempsMatch += 0.2; modif(t, eq); return ex.step(t); };
  assert.strictEqual(x((t, q) => { t.ball.carrierTeam = q; t.ball.carrierNumber = 10; }).status, 'SUCCEEDED');
  const f = (modif) => x(modif);
  assert.strictEqual(f((t) => { t.phase = 'MELEE'; }).events[0].reason, 'FORWARD_PASS_OR_KNOCK_ON');
  assert.strictEqual(f((t, q) => { t.ball.carrierTeam = q === 'A' ? 'B' : 'A'; t.ball.carrierNumber = 7; }).events[0].reason, 'INTERCEPTED');
  assert.strictEqual(f((t, q) => { t.ball.carrierTeam = q; t.ball.carrierNumber = num === 12 ? 13 : 12; }).events[0].reason, 'WRONG_RECEIVER');
  assert.strictEqual(f(() => {}).status, 'RUNNING', 'sans événement réel rien n\'est conclu');
});
test('PASS_TO_10 : refusé au départ si l\'on n\'est pas porteur ou si le 10 est devant', () => {
  const { e, eq, num } = scene();
  const autre = (num % 15) + 1 === 10 ? 11 : (num % 15) + 1;
  assert.match(new ActionExecutor({ team: eq, numero: autre }).start('PASS_TO_10', e).events[0].reason, /NOT_CARRIER/);
  const s = copie(e); const eqp = eq === 'A' ? s.equipeA : s.equipeB; const dix = eqp.find((j) => j.numero === 10), moi = eqp.find((j) => j.numero === num);
  dix.x = moi.x + moi.sensAttaque * 5; dix.auSol = 0; moi.auSol = 0;
  assert.match(new ActionExecutor({ team: eq, numero: num }).start('PASS_TO_10', s).events[0].reason, /RECEIVER_AHEAD/);
});
test('dans le moteur (GOAP, 6 graines) : des passes d\'agents réussissent et chaque succès correspond à une vraie passe du moteur', () => {
  let ok = 0, tent = 0, faux = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const m = new MatchEngine(seed, 4800, configGOAP());
    const passes = []; const lg = m.log.bind(m); m.log = (t, team, msg, ...r) => { if (t === 'PASSE') passes.push(String(msg)); return lg(t, team, msg, ...r); };
    for (let i = 0; i < 4800; i++) m.tick(0.05);
    for (const a of m._pilote.agents) for (const ev of a.events) if (ev.action === 'PASS_TO_10') {
      if (ev.type === 'ACTION_STARTED') tent++;
      if (ev.type === 'ACTION_SUCCEEDED') { ok++; if (!passes.some((p) => new RegExp('n°' + a.agent.numero + ' au n°10').test(p))) faux++; }
    }
  }
  assert.ok(tent >= 5 && ok >= 3, `${tent} tentatives, ${ok} réussies`);
  assert.strictEqual(faux, 0, 'succès annoncé sans passe réelle du moteur');
});
test('PASS_TO_POD / PASS_TO_OUTSIDE : receveur choisi dans le monde réel, jamais devant ; chaque succès = vraie passe du moteur', () => {
  const { e, eq, num } = scene();
  const s = copie(e); const eqp = eq === 'A' ? s.equipeA : s.equipeB; const moi = eqp.find((j) => j.numero === num); moi.auSol = 0;
  for (const j of eqp) if (j !== moi) { j.x = moi.x + moi.sensAttaque * 6; } // tout le monde est DEVANT
  for (const nom of ['PASS_TO_POD', 'PASS_TO_OUTSIDE']) assert.match(new ActionExecutor({ team: eq, numero: num }).start(nom, s).events[0].reason, /NO_RECEIVER/);
  let ok = 0, faux = 0, tent = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const m = new MatchEngine(seed, 4800, configGOAP());
    const passes = []; const lg = m.log.bind(m); m.log = (t, team, msg, ...r) => { if (t === 'PASSE') passes.push(String(msg)); return lg(t, team, msg, ...r); };
    for (let i = 0; i < 4800; i++) m.tick(0.05);
    for (const a of m._pilote.agents) for (const ev of a.events) if (/PASS_TO_(POD|OUTSIDE)/.test(ev.action || '')) {
      if (ev.type === 'ACTION_STARTED') tent++;
      if (ev.type === 'ACTION_SUCCEEDED') { ok++; if (!passes.some((p) => new RegExp('n°' + a.agent.numero + ' au n°').test(p))) faux++; }
    }
  }
  assert.ok(tent >= 3 && ok >= 2, `${tent} tentatives, ${ok} réussies`);
  assert.strictEqual(faux, 0);
});
console.log(`\n${nb} test(s)`); if (ko) process.exit(1);
