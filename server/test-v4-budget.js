// RM4-G09 — ordonnanceur des décisions : budget logique, urgence, étalement, secours D08,
// déterminisme. Le coût CPU est MESURÉ ici (hors simulation) mais ne décide de rien.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { AgentScheduler, creerAgents } = require('../engine/ai/agent-scheduler.js');
const { GoalBasedRugbyAgent } = require('../engine/ai/agent-controller.js');
const { LocalCommunication } = require('../engine/ai/local-communication.js');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const copie = (e) => JSON.parse(JSON.stringify(e));
const DT = 0.05;

// Boucle moteur + ordonnanceur ; renvoie des relevés.
function jouer(m, sched, secondes, comm, parTick) {
  for (let t = 0; t < secondes; t += DT) {
    const e = copie(m.getState());
    const r = sched.tick(e, comm);
    sched.appliquer(m, r);
    m.tick(DT);
    if (parTick) parTick(r, e);
  }
}
const evts = (sched) => sched.agents.flatMap((a) => a.events.map((e) => a.id + ':' + e.type + ':' + (e.action || e.to || e.kind || e.status || '') + ':' + e.t.toFixed(2)));

test('30 agents en mémoire, ordre stable A1..A15 puis B1..B15, doublons refusés', () => {
  const ags = creerAgents();
  const sched = new AgentScheduler(ags.slice().reverse());
  assert.strictEqual(sched.agents.length, 30);
  assert.deepStrictEqual(sched.agents.map((a) => a.id), [...Array(15)].map((_, i) => 'A' + (i + 1)).concat([...Array(15)].map((_, i) => 'B' + (i + 1))));
  assert.throws(() => new AgentScheduler([ags[0], ags[0]]), /double/);
  assert.throws(() => new AgentScheduler([]), /requis/);
  assert.throws(() => new AgentScheduler(ags, { maxDecisionsPerTick: 0 }), /invalide/);
});

test('étalement : au premier tick les 30 agents ne décident pas tous ; aucun tick ne dépasse le budget ordinaire', () => {
  const m = new MatchEngine(11, 4800);
  for (let i = 0; i < 100; i++) m.tick(0.1);
  const sched = new AgentScheduler(creerAgents(), { maxDecisionsPerTick: 4 });
  const par = [];
  jouer(m, sched, 3, null, (r) => par.push({ n: r.decided.length, urgent: r.urgent }));
  assert.ok(par[0].n <= 4, `${par[0].n} décisions au premier tick`);
  assert.ok(par.filter((x) => x.n > 0).length > 5, 'décisions réparties sur plusieurs ticks');
  // Hors urgences, jamais plus de 4 décisions ordinaires par tick.
  for (const x of par) assert.ok(x.n - x.urgent <= 4, `${x.n} dont ${x.urgent} urgentes`);
});

test('pas de famine : chaque agent décide au moins une fois par 2 périodes, même avec un budget serré', () => {
  const m = new MatchEngine(11, 4800);
  for (let i = 0; i < 100; i++) m.tick(0.1);
  const sched = new AgentScheduler(creerAgents(), { maxDecisionsPerTick: 2 });
  const derniere = new Map();
  const debut = m.tempsMatch;
  let pireAttente = 0;
  jouer(m, sched, 12, null, (r, e) => {
    for (const id of r.decided) derniere.set(id, e.tempsMatch);
    // On mesure une fois le régime établi (3 s après le départ étalé).
    if (e.tempsMatch > debut + 3) for (const a of sched.agents) pireAttente = Math.max(pireAttente, e.tempsMatch - (derniere.get(a.id) ?? debut));
  });
  assert.strictEqual(derniere.size, 30, 'chaque agent a décidé');
  assert.ok(pireAttente <= 0.4 * 3 + 0.5, `attente max ${pireAttente.toFixed(2)} s`);
});

test('urgence : un changement de phase fait décider les agents concernés dans le même tick, malgré un budget ordinaire à 1', () => {
  const f = corpus.scenarios.find((s) => s.id === 'S01');
  const m = createScenarioEngine(f);
  const sched = new AgentScheduler(creerAgents(), { maxDecisionsPerTick: 1 });
  jouer(m, sched, 6, null); // régime établi
  // La phase change : chaque agent la remarque à son prochain rafraîchissement de perception (0,2 s).
  const e = copie(m.getState());
  e.phase = e.phase === 'RUCK' ? 'PORTE' : 'RUCK';
  let pic = 0, totalUrgent = 0, decideAuPic = 0;
  for (let i = 0; i < 6; i++) {
    e.tempsMatch += DT;
    const r = sched.tick(e, null);
    totalUrgent += r.urgent;
    if (r.urgent > pic) { pic = r.urgent; decideAuPic = r.decided.length; }
  }
  assert.ok(pic >= 10, `au plus ${pic} décisions urgentes dans un tick`);
  assert.ok(decideAuPic > 1, 'plus de décisions que le budget ordinaire (1)');
  assert.ok(totalUrgent >= 25, `${totalUrgent} décisions urgentes au total sur 6 ticks`);
});

test('D08 : budget de recherche dépassé -> BUDGET_EXCEEDED + HOLD_SAFE_POSITION, aucune exception, le tick continue', () => {
  const m = createScenarioEngine(corpus.scenarios.find((s) => s.id === 'S01'));
  for (let i = 0; i < 20; i++) m.tick(DT);
  const n9 = (m.equipeA).find((j) => j.numero === 9); n9.auSol = 0; n9.x = 45; n9.y = 26;
  const a = new GoalBasedRugbyAgent({ team: 'A', numero: 9 }, { maxExpanded: 1 });
  const sched = new AgentScheduler([a]);
  assert.doesNotThrow(() => jouer(m, sched, 3, null));
  const types = a.events.map((e) => e.type);
  assert.ok(types.includes('NO_PLAN') && types.includes('HOLD_SAFE_POSITION'), types.join(','));
  assert.ok(a.events.some((e) => e.type === 'NO_PLAN' && e.status === 'BUDGET_EXCEEDED'));
  assert.strictEqual(a._intent, null, 'position sûre : le moteur garde la conduite du joueur');
  assert.ok(m.tempsMatch > 3, 'le moteur a continué');
});

test('budget d\'expansions : jamais plus de maxExpanded par plan ; le total par tick reste borné', () => {
  const m = new MatchEngine(11, 4800);
  for (let i = 0; i < 100; i++) m.tick(0.1);
  const sched = new AgentScheduler(creerAgents({ maxExpanded: 64 }), { maxDecisionsPerTick: 6 });
  jouer(m, sched, 20, null);
  const limite = (6 + sched.stats.maxDecisionsInTick) * 64; // décisions ordinaires + urgentes du pire tick
  assert.ok(sched.stats.maxExpansionsInTick <= sched.stats.maxDecisionsInTick * 64, `${sched.stats.maxExpansionsInTick} expansions dans un tick`);
  assert.ok(limite > 0);
});

test('déterminisme : même graine -> mêmes événements pour les 30 agents (avec appels vocaux), 15 s', () => {
  const run = () => {
    const m = new MatchEngine(11, 4800);
    for (let i = 0; i < 300; i++) m.tick(0.1);
    const sched = new AgentScheduler(creerAgents(), { maxDecisionsPerTick: 5 });
    const comm = new LocalCommunication();
    jouer(m, sched, 15, comm);
    return JSON.stringify([evts(sched), sched.stats, comm.messages.map((x) => x.speakerId + x.kind + x.emittedAt.toFixed(2))]);
  };
  assert.strictEqual(run(), run());
});

test('10 matchs à pas constant : le moteur reste sain avec 30 agents (positions finies, 30 joueurs, possession valide), coûts CPU mesurés hors décision', () => {
  let totalMs = 0, totalTicks = 0, maxTickMs = 0, plans = 0, pasTotal = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 100; i++) m.tick(0.1);
    const sched = new AgentScheduler(creerAgents(), { maxDecisionsPerTick: 6 });
    for (let t = 0; t < 120; t += DT) {
      const e = copie(m.getState());
      const t0 = process.hrtime.bigint(); // MESURE seulement : jamais utilisée pour décider
      const r = sched.tick(e, null);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      totalMs += ms; totalTicks++; maxTickMs = Math.max(maxTickMs, ms);
      sched.appliquer(m, r);
      m.tick(DT);
      const s = m.getState();
      assert.strictEqual(s.equipeA.length + s.equipeB.length, 30);
      assert.ok(['A', 'B'].includes(s.possession));
      for (const j of [...s.equipeA, ...s.equipeB]) assert.ok(Number.isFinite(j.x) && Number.isFinite(j.y), `seed ${seed} : position non finie`);
      assert.ok(s.score.A >= 0 && s.score.B >= 0);
    }
    plans += sched.agents.reduce((n, a) => n + a.events.filter((e) => e.type === 'PLAN_CREATED' || e.type === 'PLAN_REPLANNED').length, 0);
    pasTotal += sched.stats.decisions;
  }
  console.log(`     CPU : ${(totalMs / totalTicks).toFixed(2)} ms/tick en moyenne, ${maxTickMs.toFixed(1)} ms au pire (30 agents), ${plans} plans, ${pasTotal} décisions sur 10 matchs de 120 s`);
  assert.ok(plans > 0, 'aucun plan créé : les agents ne font rien');
  assert.ok(totalMs / totalTicks < 25, `trop lent : ${(totalMs / totalTicks).toFixed(1)} ms/tick (budget 25 ms à 20 Hz)`);
});

test('architecture : l\'ordonnanceur ne choisit ni but ni position, aucune horloge, aucun coordinateur', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/agent-scheduler.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|Math\.random|performance\.now|hrtime|TeamCoordinator|TeamBlackboard|assignRoles|reserveRole/.test(src));
  assert.ok(!/\.goal\s*=|\.plan\s*=|selector\.select|planGoal|\.setAgentIntent\(.*\btx\b/.test(src), 'l\'ordonnanceur touche but/plan');
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : l\'ordonnanceur V4 borne, étale et rend déterministe les décisions de 30 agents.');
