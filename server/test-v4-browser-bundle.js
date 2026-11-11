// RM4-G07/G11 — le bundle navigateur docs/rugby-ai.js : à jour, chargeable sans Node, et GOAP joue un match.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
let ok = 0;
function test(nom, fn) { try { fn(); ok++; console.log('OK   ' + nom); } catch (e) { console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); process.exitCode = 1; } }
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('bundle à jour (docs/rugby-ai.js = engine/ai/*.js)', () => { execFileSync('node', [path.join(__dirname, 'build-ai-bundle.js'), '--check']); });

test('chargé comme un navigateur (sans require/module) : window.RugbyAI.configGOAP et un match GOAP de 30 s', () => {
  const sandbox = { console }; sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(lire('docs/rugby-engine.js'), sandbox);
  vm.runInContext(lire('docs/rugby-ai.js'), sandbox);
  assert.ok(sandbox.RugbyAI && typeof sandbox.RugbyAI.configGOAP === 'function');
  const m = new sandbox.RugbyEngine.MatchEngine(3, 4800, sandbox.RugbyAI.configGOAP(null));
  for (let i = 0; i < 600; i++) m.tick(0.05);
  assert.strictEqual(m.aiMode, 'GOAP');
  assert.strictEqual(m._pilote.agents.length, 30);
  assert.ok(m.getState().stats.A.rucks + m.getState().stats.B.rucks >= 0);
});

test('même résultat que sous Node (déterminisme navigateur / serveur)', () => {
  const sandbox = { console }; sandbox.window = sandbox; vm.createContext(sandbox);
  vm.runInContext(lire('docs/rugby-engine.js'), sandbox); vm.runInContext(lire('docs/rugby-ai.js'), sandbox);
  const nav = new sandbox.RugbyEngine.MatchEngine(5, 4800, sandbox.RugbyAI.configGOAP(null));
  const { MatchEngine } = require('../engine/rugby-engine.js'); const { configGOAP } = require('../engine/ai/goap-mode.js');
  const srv = new MatchEngine(5, 4800, configGOAP(null));
  for (let i = 0; i < 400; i++) { nav.tick(0.05); srv.tick(0.05); }
  const pos = (m) => JSON.stringify([...m.equipeA, ...m.equipeB].map((j) => [j.x.toFixed(4), j.y.toFixed(4)]));
  assert.strictEqual(pos(nav), pos(srv));
});

test('index.html charge le bundle ; main.js : LEGACY par défaut, GOAP seulement sur ?ai=goap ou réglage', () => {
  assert.ok(lire('docs/index.html').includes('<script src="rugby-ai.js"></script>'));
  const m = lire('docs/js/main.js');
  assert.ok(m.includes("get('ai')") && m.includes('cfgAvecIA(configMatch)') && m.includes("'rugbyManager.aiMode'"));
});
console.log(`\n${ok} test(s) OK`);
