// RM4-G11 — première instanciation des 30 agents derrière un drapeau aiMode.
// LEGACY (défaut) doit rester EXACTEMENT le moteur historique ; GOAP est expérimental.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP, creerPiloteGOAP } = require('../engine/ai/goap-mode.js');
const base = require('../docs/SIMULATION_V4/fixtures/baseline_30_graines.json');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const photo = (m) => { const s = m.getState(); return JSON.stringify([s.score, s.stats, s.phase, s.equipeA.map((j) => [j.x, j.y]), s.equipeB.map((j) => [j.x, j.y]), s.chronologie]); };
function goap(seed, secondes, options) {
  const m = new MatchEngine(seed, 4800, configGOAP(null, options));
  for (let t = 0; t < secondes; t += 0.05) m.tick(0.05);
  return m;
}
const evenements = (m) => m._pilote.agents.flatMap((a) => a.events);

test('LEGACY par défaut : sans option, avec aiMode LEGACY explicite, le match est identique au tick près', () => {
  const a = new MatchEngine(9, 4800), b = new MatchEngine(9, 4800, { aiMode: 'LEGACY' });
  assert.strictEqual(a.aiMode, 'LEGACY');
  for (let i = 0; i < 6000; i++) { a.tick(0.1); b.tick(0.1); }
  assert.strictEqual(photo(a), photo(b));
});

test('LEGACY produit exactement les statistiques de la baseline RM4-G00 (graines 1 à 3, match complet)', () => {
  for (const ligne of base.parGraine.slice(0, 3)) {
    const m = new MatchEngine(ligne.seed, 4800);
    m.jouerJusquAuSifflet(0.1);
    const s = m.getState();
    assert.strictEqual(s.stats.A.essais + s.stats.B.essais, ligne.essais, 'essais graine ' + ligne.seed);
    assert.strictEqual(s.score.A + s.score.B, ligne.points, 'points graine ' + ligne.seed);
    assert.strictEqual(s.stats.A.passes + s.stats.B.passes, ligne.passes, 'passes graine ' + ligne.seed);
    assert.strictEqual(s.stats.A.rucks + s.stats.B.rucks, ligne.rucks, 'rucks graine ' + ligne.seed);
    assert.strictEqual(s.stats.A.tacklesAttempted + s.stats.B.tacklesAttempted, ligne.plaquagesTentes, 'plaquages graine ' + ligne.seed);
  }
});

test('drapeau : aiMode inconnu refusé ; GOAP sans pilote refusé (pas de repli silencieux)', () => {
  assert.throws(() => new MatchEngine(1, 4800, { aiMode: 'MAGIE' }), /inconnu/);
  assert.throws(() => new MatchEngine(1, 4800, { aiMode: 'GOAP' }), /agentDriver/);
  assert.strictEqual(new MatchEngine(1, 4800, configGOAP()).aiMode, 'GOAP');
});

test('GOAP : 30 contrôleurs, 30 contextes distincts, aucun joueur sans contrôleur, chacun a un but', () => {
  const m = goap(4, 20);
  const ags = m._pilote.agents;
  assert.strictEqual(ags.length, 30);
  assert.strictEqual(new Set(ags.map((a) => a.id)).size, 30);
  assert.strictEqual(new Set(ags.map((a) => a.context)).size, 30);
  assert.strictEqual(new Set(ags.map((a) => a.selector)).size, 30);
  assert.strictEqual(new Set(ags.map((a) => a.executor)).size, 30);
  for (const j of [...m.equipeA, ...m.equipeB]) assert.ok(ags.some((a) => a.agent.team === j.team && a.agent.numero === j.numero), j.team + j.numero + ' sans contrôleur');
  for (const a of ags) assert.ok(a.goal, a.id + ' sans but');
  const butsVus = new Set(ags.flatMap((a) => a.events.filter((e) => e.type === 'GOAL_CHANGED').map((e) => e.to)));
  assert.ok(butsVus.size >= 4, 'buts variés sur 20 s : ' + [...butsVus]);
});

test('GOAP : déterminisme sur 10 graines (60 s) — mêmes positions, scores, statistiques et événements d\'agents', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const a = goap(seed, 60), b = goap(seed, 60);
    assert.strictEqual(photo(a), photo(b), 'graine ' + seed);
    assert.strictEqual(JSON.stringify(evenements(a)), JSON.stringify(evenements(b)), 'événements graine ' + seed);
  }
});

test('GOAP : le match reste sain sur 6 graines × 240 s (positions finies, 30 joueurs, aucune DECISION_ERROR, le jeu produit des actions)', () => {
  let plaquages = 0, rucks = 0, passes = 0, erreurs = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const m = goap(seed, 240);
    const s = m.getState();
    assert.strictEqual(s.equipeA.length + s.equipeB.length, 30);
    for (const j of [...s.equipeA, ...s.equipeB]) assert.ok(Number.isFinite(j.x) && Number.isFinite(j.y) && j.x >= -1 && j.x <= 101 && j.y >= -1 && j.y <= 71, 'graine ' + seed);
    plaquages += s.stats.A.tacklesMade + s.stats.B.tacklesMade; rucks += s.stats.A.rucks + s.stats.B.rucks; passes += s.stats.A.passes + s.stats.B.passes;
    erreurs += m._pilote.agents.reduce((n, a) => n + (a.errors || 0), 0);
  }
  assert.strictEqual(erreurs, 0);
  assert.ok(plaquages > 20 && rucks > 10 && passes > 30, `plaquages ${plaquages}, rucks ${rucks}, passes ${passes}`);
});

test('D03 dans le moteur : TACKLE_CARRIER — un plaquage réussi est constaté sur le compteur réel ; un manqué donne ACTION_FAILED, jamais un succès', () => {
  let reussis = 0, manques = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const m = goap(seed, 240);
    const ev = evenements(m).filter((e) => e.action === 'TACKLE_CARRIER');
    reussis += ev.filter((e) => e.type === 'ACTION_SUCCEEDED').length;
    manques += ev.filter((e) => e.type === 'ACTION_FAILED' && e.reason === 'TACKLE_MISSED').length;
    // Chaque succès annoncé correspond à un vrai plaquage réussi du moteur pour CE joueur.
    const s = m.getState();
    for (const a of m._pilote.agents) {
      const n = a.events.filter((e) => e.action === 'TACKLE_CARRIER' && e.type === 'ACTION_SUCCEEDED').length;
      const reel = (s.statsJoueurs[a.agent.team][a.agent.numero] || {}).tacklesMade || 0;
      assert.ok(n <= reel, `${a.id} : ${n} succès annoncés pour ${reel} plaquages réels`);
    }
  }
  assert.ok(reussis >= 3, `${reussis} plaquages d'agents réussis`);
  console.log(`     plaquages d'agents : ${reussis} réussis, ${manques} manqués (ACTION_FAILED TACKLE_MISSED) sur 8 × 240 s`);
});

test('D03 (acteur seul) : plaquage MANQUÉ -> ACTION_FAILED TACKLE_MISSED ; réussi -> ACTION_SUCCEEDED ; porteur disparu -> abandon', () => {
  const { ActionExecutor } = require('../engine/ai/action-executor.js');
  const m = new MatchEngine(3, 4800);
  for (let i = 0; i < 400 && !(m.phase === 'PORTE' && m.porteur); i++) m.tick(0.1);
  const etat = () => { const e = JSON.parse(JSON.stringify(m.getState())); e.phase = 'PORTE'; return e; };
  const e0 = etat();
  const adv = e0.ball.carrierTeam === 'A' ? 'B' : 'A';
  assert.ok(e0.ball.carrierTeam, 'un porteur existe');
  const stat = (e) => { e.statsJoueurs[adv][7] = e.statsJoueurs[adv][7] || { tacklesMade: 0, plaquagesManques: 0 }; return e.statsJoueurs[adv][7]; };
  const lance = (modif) => {
    const x = new ActionExecutor({ team: adv, numero: 7 });
    const d = etat(); stat(d);
    const j = (adv === 'A' ? d.equipeA : d.equipeB).find((q) => q.numero === 7); j.auSol = 0; j.horsJeuKick = 0; j.sinBin = 0; j.ruckRecovery = 0;
    const r = x.start('TACKLE_CARRIER', d);
    assert.strictEqual(r.started, true, JSON.stringify(r.events));
    assert.ok(r.intent && Number.isFinite(r.intent.tx));
    const apres = JSON.parse(JSON.stringify(d)); apres.tempsMatch += 0.1; modif(apres, stat(apres));
    return x.step(apres);
  };
  const manque = lance((e, st) => { st.plaquagesManques = (st.plaquagesManques || 0) + 1; });
  assert.strictEqual(manque.status, 'FAILED'); assert.strictEqual(manque.events[0].reason, 'TACKLE_MISSED');
  const reussi = lance((e, st) => { st.tacklesMade = (st.tacklesMade || 0) + 1; });
  assert.strictEqual(reussi.status, 'SUCCEEDED');
  const perdu = lance((e) => { e.ball.carrierTeam = null; e.ball.carrierNumber = null; });
  assert.strictEqual(perdu.status, 'ABORTED'); assert.strictEqual(perdu.events[0].reason, 'NO_CARRIER');
  const rien = lance(() => {});
  assert.strictEqual(rien.status, 'RUNNING', 'sans événement réel, rien n\'est conclu');
});

test('GOAP : aucun agent n\'écrit l\'intention d\'un partenaire (une intention par joueur, clé = son identité)', () => {
  const m = goap(2, 30);
  for (const [cle, it] of m._intentionsAgents) assert.strictEqual(cle, it.equipe + it.numero);
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/goap-mode.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/TeamCoordinator|TeamBlackboard|assignRoles|reserveRole|Date\.now|Math\.random|\.goal\s*=|\.plan\s*=/.test(src));
});

test('sauvegarde / relecture : getState() en mode GOAP reste sérialisable et garde les champs historiques', () => {
  const m = goap(5, 30), l = new MatchEngine(5, 4800);
  for (let i = 0; i < 600; i++) l.tick(0.05);
  const g = JSON.parse(JSON.stringify(m.getState())), h = JSON.parse(JSON.stringify(l.getState()));
  assert.deepStrictEqual(Object.keys(g).sort(), Object.keys(h).sort());
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '../docs/rugby-engine.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../engine/rugby-engine.js'), 'utf8'));
  assert.ok(typeof creerPiloteGOAP === 'function');
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : 30 agents instanciés derrière aiMode ; LEGACY inchangé.');
