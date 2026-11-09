// RM4-G04 — perception partielle et mémoire locale d'un agent (test D07 inclus).
// Ne prouve PAS l'intégration au match : seulement des croyances individuelles.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { observe } = require('../engine/ai/perception.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { LocalCommunication } = require('../engine/ai/local-communication.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
function etat(id, ticks = 20) {
  const f = corpus.scenarios.find((s) => s.id === id);
  const m = createScenarioEngine(f);
  for (let i = 0; i < ticks; i++) m.tick(f.tickSeconds);
  return JSON.parse(JSON.stringify(m.getState())); // copie : on peut la modifier sans toucher au moteur
}
const joueur = (e, team, n) => (team === 'A' ? e.equipeA : e.equipeB).find((j) => j.numero === n);
const avancer = (e, dt) => { e.tempsMatch += dt; return e; };

test('deux agents à positions distinctes ont des croyances distinctes (S01)', () => {
  const e = etat('S01');
  const proche = new AgentContext({ team: 'A', numero: 8 }).update(e);
  const loin = new AgentContext({ team: 'A', numero: 14 }).update(e);
  assert.notDeepStrictEqual(Object.keys(proche.teammates).sort(), Object.keys(loin.teammates).sort());
  assert.notDeepStrictEqual(Object.keys(proche.opponents).sort(), Object.keys(loin.opponents).sort());
  assert.ok(Object.keys(loin.opponents).length < 15, 'un ailier ne voit pas les 15 adversaires');
});

test('D07 : ballon caché derrière un paquet — l\'agent garde l\'ancienne position (âge > 0) ; sans paquet il le voit', () => {
  // A13 est à ~31 m du ballon, dans son champ de vision : seul le paquet peut le lui cacher.
  const e0 = etat('S01');
  const bouge = (cache) => {
    const e1 = avancer(JSON.parse(JSON.stringify(e0)), 0.5);
    const me = joueur(e1, 'A', 13);
    e1.ball.x += 3; e1.ball.y -= 2; e1.ballon.x = e1.ball.x; e1.ballon.y = e1.ball.y;
    if (cache) [joueur(e1, 'B', 6), joueur(e1, 'B', 7), joueur(e1, 'B', 8)].forEach((j, i) => {
      const t = 0.35 + 0.15 * i; j.x = me.x + (e1.ball.x - me.x) * t; j.y = me.y + (e1.ball.y - me.y) * t;
    });
    return e1;
  };
  const suivre = (cache, params) => {
    const c = new AgentContext({ team: 'A', numero: 13 }, params);
    const b0 = c.update(e0);
    assert.ok(b0.ball.lastSeen, 'le 13 voit d\'abord le ballon');
    return { b0, b1: c.update(bouge(cache)), e1: bouge(cache) };
  };
  const cache = suivre(true);
  assert.deepStrictEqual(cache.b1.ball.lastSeen, cache.b0.ball.lastSeen, 'position du ballon non rafraîchie : caché');
  assert.ok(cache.b1.ball.age >= 0.5 - 1e-9, `âge ${cache.b1.ball.age}`);
  assert.ok(cache.b1.ball.confidence < cache.b0.ball.confidence);
  const libre = suivre(false);
  assert.deepStrictEqual(libre.b1.ball.lastSeen, { x: libre.e1.ball.x, y: libre.e1.ball.y }, 'sans paquet, le ballon est vu à sa nouvelle place');
  const om = suivre(true, { omniscient: true });
  assert.deepStrictEqual(om.b1.ball.lastSeen, { x: om.e1.ball.x, y: om.e1.ball.y }, 'le mode omniscient voit la vraie position');
  assert.strictEqual(om.b1.omniscient, true);
});

test('hors du champ de vision (dos tourné) : un nouvel adversaire n\'est pas connu instantanément', () => {
  const e0 = etat('S01');
  const me = joueur(e0, 'A', 11); // à l'aile gauche, regarde vers x croissant
  const c = new AgentContext({ team: 'A', numero: 11 });
  const avant = c.update(e0);
  const e1 = avancer(JSON.parse(JSON.stringify(e0)), 0.5);
  const intrus = joueur(e1, 'B', 9);
  // 20 m DERRIÈRE le 11 (hors cône 200°), au-delà du rayon périphérique.
  intrus.x = me.x - 20; intrus.y = me.y;
  const apres = c.update(e1);
  assert.notDeepStrictEqual(apres.opponents.B9 && apres.opponents.B9.lastSeen, { x: intrus.x, y: intrus.y });
  const om = new AgentContext({ team: 'A', numero: 11 }, { omniscient: true }).update(e1);
  assert.deepStrictEqual(om.opponents.B9.lastSeen, { x: intrus.x, y: intrus.y });
  assert.ok(avant && apres);
});

test('délai de réaction : entre deux rafraîchissements l\'agent agit sur sa dernière observation', () => {
  const e0 = etat('S01');
  const c = new AgentContext({ team: 'A', numero: 8 }, { reactionDelay: 0.3 });
  const a = c.update(e0);
  assert.strictEqual(a.refreshed, true);
  const e1 = avancer(JSON.parse(JSON.stringify(e0)), 0.1);
  joueur(e1, 'B', 2).x += 2;
  const b = c.update(e1);
  assert.strictEqual(b.refreshed, false, 'pas encore de nouvelle observation');
  assert.deepStrictEqual(b.opponents.B2.lastSeen, a.opponents.B2.lastSeen);
  assert.ok(b.opponents.B2.age > 0 || b.opponents.B2.age === 0.1);
  const e2 = avancer(JSON.parse(JSON.stringify(e1)), 0.25);
  const cc = c.update(e2);
  assert.strictEqual(cc.refreshed, true);
  assert.strictEqual(cc.opponents.B2.lastSeen.x, joueur(e2, 'B', 2).x);
});

test('mémoire : une entité vue puis hors de vue vieillit, perd sa confiance, puis est oubliée', () => {
  const e0 = etat('S01');
  const c = new AgentContext({ team: 'A', numero: 11 }, { memorySeconds: 2, reactionDelay: 0.1 });
  const v0 = c.update(e0);
  assert.ok(v0.opponents.B9 || Object.keys(v0.opponents).length > 0);
  const cible = Object.keys(v0.opponents)[0];
  // On éloigne l'adversaire hors de portée de vue (80 m).
  let e = JSON.parse(JSON.stringify(e0));
  const adv = joueur(e, cible[0], Number(cible.slice(1)));
  const pos0 = { x: adv.x, y: adv.y };
  adv.x = (pos0.x + 80) % 100; adv.y = pos0.y; adv.x = pos0.x < 50 ? 99 : 1;
  e = avancer(e, 1.0);
  const v1 = c.update(e);
  assert.deepStrictEqual(v1.opponents[cible].lastSeen, pos0, 'dernière position connue conservée');
  assert.ok(v1.opponents[cible].age >= 1 - 1e-9);
  assert.ok(v1.opponents[cible].confidence < 1 && v1.opponents[cible].confidence > 0);
  e = avancer(e, 1.5);
  const v2 = c.update(e);
  assert.ok(!(cible in v2.opponents), 'oublié après memorySeconds');
});

test('appels adressés : LocalCommunication.hear() donne auteur, âge, confiance ; hors portée = rien', () => {
  const e = etat('S01');
  const comm = new LocalCommunication();
  const a10 = joueur(e, 'A', 10), a14 = joueur(e, 'A', 14);
  assert.ok(comm.emit({ speakerId: 'A10', team: 'A', kind: 'BALL', x: a10.x, y: a10.y, time: e.tempsMatch }).accepted);
  const proche = new AgentContext({ team: 'A', numero: 12 });
  const sans = proche.update(e, comm);
  assert.strictEqual(sans.heard.length, 0, 'délai de propagation : pas encore reçu');
  const e1 = avancer(JSON.parse(JSON.stringify(e)), 0.4);
  const b = proche.update(e1, comm);
  assert.strictEqual(b.heard.length, 1);
  assert.strictEqual(b.heard[0].from, 'A10');
  assert.strictEqual(b.heard[0].kind, 'BALL');
  assert.ok(b.heard[0].confidence > 0 && b.heard[0].confidence <= 1);
  // Un coéquipier hors du rayon de 17 m n'entend rien, un adversaire non plus.
  a14.x = a10.x + 60; a14.y = a10.y;
  const loin = new AgentContext({ team: 'A', numero: 14 }).update(e1, comm);
  assert.strictEqual(loin.heard.length, 0);
  const adv = new AgentContext({ team: 'B', numero: 6 }).update(e1, comm);
  assert.strictEqual(adv.heard.length, 0);
});

test('état physique source non muté ; résultat gelé ; observe() pure et déterministe', () => {
  const e = etat('S06');
  const avant = JSON.stringify(e);
  const c = new AgentContext({ team: 'A', numero: 9 });
  const b = c.update(e);
  new AgentContext({ team: 'B', numero: 4 }, { omniscient: true }).update(e);
  assert.strictEqual(JSON.stringify(e), avant);
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.ball) && Object.isFrozen(b.teammates));
  assert.deepStrictEqual(observe(e, { team: 'A', numero: 9 }), observe(e, { team: 'A', numero: 9 }));
  for (const f of ['perception.js', 'agent-context.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../engine/ai', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Date\.now|Math\.random|performance\.now/.test(src), f + ' : source d\'aléa');
  }
});

test('omniscient désactivé par défaut ; paramètres invalides refusés ; agent inconnu refusé', () => {
  const e = etat('S01');
  assert.strictEqual(new AgentContext({ team: 'A', numero: 14 }).update(e).omniscient, false);
  assert.throws(() => new AgentContext({ team: 'A', numero: 14 }, { visionRange: -1 }), /invalide/);
  assert.throws(() => new AgentContext({ team: 'A', numero: 14 }, { reactionDelay: NaN }), /invalide/);
  assert.throws(() => new AgentContext({ team: 'C', numero: 1 }), /agent invalide/);
  assert.throws(() => observe(e, { team: 'A', numero: 99 }), /introuvable/);
});

test('déterminisme : deux contextes identiques sur le même match donnent les mêmes croyances', () => {
  const f = corpus.scenarios.find((s) => s.id === 'S08');
  const run = () => {
    const m = createScenarioEngine(f);
    const c = new AgentContext({ team: 'B', numero: 15 }, { reactionDelay: 0.2 });
    let derniere = null;
    for (let i = 0; i < 200; i++) { m.tick(f.tickSeconds); derniere = c.update(m.getState()); }
    return JSON.stringify(derniere);
  };
  assert.strictEqual(run(), run());
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : la perception V4 est partielle, mémorisée, déterministe et sans mutation.');
