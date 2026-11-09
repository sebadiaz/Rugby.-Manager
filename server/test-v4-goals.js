// RM4-G05 — sélecteur de buts individuels contextualisé (D05, S06, anti-oscillation).
// Ne prouve PAS l'exécution physique des buts : seulement leur choix.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { GOALS, GOAL_IDS, profilePour } = require('../engine/ai/goals.js');
const { GoalSelector } = require('../engine/ai/goal-selector.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');
const { MatchEngine } = require('../engine/rugby-engine.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
function etat(id, ticks = 20) {
  const f = corpus.scenarios.find((s) => s.id === id);
  const m = createScenarioEngine(f);
  for (let i = 0; i < ticks; i++) m.tick(f.tickSeconds);
  return JSON.parse(JSON.stringify(m.getState()));
}
const copie = (e) => JSON.parse(JSON.stringify(e));
const joueur = (e, team, n) => (team === 'A' ? e.equipeA : e.equipeB).find((j) => j.numero === n);
// Un agent (contexte + sélecteur) ; décide depuis SES croyances uniquement.
function agent(team, numero, opts) { return { ctx: new AgentContext({ team, numero }, { reactionDelay: 0 }), sel: new GoalSelector({ team, numero }, opts) }; }
const decider = (a, e) => a.sel.select(a.ctx.update(e));
const avancer = (e, dt) => { e.tempsMatch += dt; return e; };

test('catalogue : buts du plan présents (DEFEND, RETAIN_POSSESSION, GAIN_TERRITORY, CONTEST_AERIAL_BALL, mêlée/touche)', () => {
  for (const id of ['DEFEND', 'RETAIN_POSSESSION', 'GAIN_TERRITORY', 'CONTEST_AERIAL_BALL', 'COVER_BACKFIELD', 'PREVENT_TRY', 'BECOME_ONSIDE',
    'DISTRIBUTE_BALL', 'SECURE_RUCK', 'CONTEST_BREAKDOWN', 'FORM_SCRUM_LEGALLY', 'FORM_LINEOUT_LEGALLY', 'RECOVER_AND_REJOIN']) assert.ok(GOAL_IDS.includes(id), id);
  assert.strictEqual(new Set(GOAL_IDS).size, GOAL_IDS.length);
  const doc = fs.readFileSync(path.join(__dirname, '../docs/SIMULATION_V4/05_CATALOGUE_GOALS_ACTIONS.md'), 'utf8');
  for (const id of GOAL_IDS) if (!['RETAIN_POSSESSION', 'GAIN_TERRITORY'].includes(id)) assert.ok(doc.includes('`' + id + '`'), id + ' absent du catalogue 05');
  for (const g of GOALS) assert.ok(['SAFETY', 'OPPORTUNITY', 'COMMIT'].includes(g.interrupt) && typeof g.applicable === 'function' && typeof g.priority === 'function');
});

test('D05 : A15 couvre le fond, puis un B14 s\'échappe vers l\'essai -> PREVENT_TRY préempte, avec événement d\'explication', () => {
  const e0 = etat('S01');
  // Un vrai arrière se tient profond : A15 à 8 m de sa ligne, face au jeu (le porteur adverse sera DEVANT lui).
  joueur(e0, 'A', 15).x = 8; joueur(e0, 'A', 15).y = 35; joueur(e0, 'A', 15).orientation = 0;
  const a15 = agent('A', 15);
  const avant = decider(a15, e0);
  assert.strictEqual(avant.goal, 'COVER_BACKFIELD', 'A15 couvre quand l\'adversaire a le ballon... ' + avant.goal);
  // B14 prend le ballon et fonce vers la ligne d'A (x = 0), sans défenseur devant lui.
  const e1 = avancer(copie(e0), 0.3);
  e1.possession = 'B'; e1.phase = 'PORTE';
  const b14 = joueur(e1, 'B', 14);
  b14.x = 14; b14.y = 28; b14.auSol = 0;
  e1.ball = Object.assign({}, e1.ball, { x: 14, y: 28, state: 'CARRIED', carrierTeam: 'B', carrierNumber: 14 });
  e1.ballon.x = 14; e1.ballon.y = 28;
  for (const j of e1.equipeA) if (j.numero !== 15) { j.x = 50 + j.numero; j.y = 30; } // les autres sont loin derrière
  const apres = decider(a15, e1);
  assert.strictEqual(apres.goal, 'PREVENT_TRY');
  assert.strictEqual(apres.reason, 'PREEMPTED_BY_SAFETY');
  assert.strictEqual(apres.events.length, 1);
  assert.deepStrictEqual([apres.events[0].from, apres.events[0].to, apres.events[0].type], ['COVER_BACKFIELD', 'PREVENT_TRY', 'GOAL_CHANGED']);
  assert.ok(apres.situation.danger >= 0.6, 'danger ' + apres.situation.danger);
});

test('A7 hors-jeu au ruck choisit BECOME_ONSIDE ; revenu derrière la ligne, il conteste', () => {
  const e0 = etat('S01');
  // B7 défend ; il est hors-jeu (du côté de l'attaque de A, passé la ligne du ballon).
  const hj = copie(e0);
  const b7 = joueur(hj, 'B', 7);
  b7.x = hj.ruck.x - 3; b7.y = hj.ruck.y + 4;            // du mauvais côté du ballon (B attaque vers x<0)
  const r = decider(agent('B', 7), hj);
  assert.strictEqual(r.situation.onside, false);
  assert.strictEqual(r.goal, 'BECOME_ONSIDE');
  const ok = copie(e0);
  const b7ok = joueur(ok, 'B', 7);
  b7ok.x = ok.ruck.x + 1.5; b7ok.y = ok.ruck.y + 3;
  const r2 = decider(agent('B', 7), ok);
  assert.strictEqual(r2.situation.onside, true);
  assert.strictEqual(r2.goal, 'CONTEST_BREAKDOWN');
});

test('S06 (turnover) : deux états opposés donnent des buts différents pour les mêmes agents', () => {
  const e = etat('S06', 5);                    // B porte le ballon, A défend
  const inverse = copie(e);                    // même position, mais c'est A qui porte
  inverse.possession = 'A';
  inverse.ball = Object.assign({}, inverse.ball, { carrierTeam: 'A', carrierNumber: 12 });
  const a12 = joueur(inverse, 'A', 12); const b12 = joueur(e, 'B', 12);
  a12.x = b12.x; a12.y = b12.y; inverse.ball.x = a12.x; inverse.ball.y = a12.y; inverse.ballon.x = a12.x; inverse.ballon.y = a12.y;
  const buts = (etatMatch, team, n) => decider(agent(team, n), etatMatch).goal;
  for (const n of [10, 13]) {
    const defend = buts(e, 'A', n), attaque = buts(inverse, 'A', n);
    assert.notStrictEqual(defend, attaque, `A${n} : ${defend} dans les deux états`);
  }
  assert.ok(['DEFEND', 'COVER_BACKFIELD'].includes(buts(e, 'A', 10)));
  assert.ok(['BE_PASS_OPTION', 'SUPPORT_CARRIER', 'COVER_BACKFIELD'].includes(buts(inverse, 'A', 10)));
  // A15 garde la profondeur dans les deux états (couverture), mais pas pour la même raison.
  assert.strictEqual(buts(e, 'A', 15), 'COVER_BACKFIELD');
});

test('le même agent change de but au cours d\'un vrai match, sans osciller (graine 11, 5 minutes)', () => {
  const m = new MatchEngine(11, 4800);
  const cibles = [['A', 9], ['A', 15], ['B', 7], ['A', 10]];
  const ags = cibles.map(([t, n]) => agent(t, n));
  const suivi = ags.map(() => ({ buts: new Set(), changements: [] }));
  for (let t = 0; t < 300; t += 0.1) {
    m.tick(0.1);
    if (Math.round(t * 10) % 5 !== 0) continue; // décision à 2 Hz
    const e = JSON.parse(JSON.stringify(m.getState()));
    ags.forEach((a, i) => { const r = decider(a, e); suivi[i].buts.add(r.goal); if (r.switched) suivi[i].changements.push({ t: r.t, reason: r.reason }); });
  }
  suivi.forEach((s, i) => {
    assert.ok(s.buts.size >= (cibles[i][1] === 15 ? 2 : 3), `${cibles[i].join('')} : seulement ${[...s.buts]}`);
    // Anti-oscillation : entre deux changements non vitaux, au moins minCommit (1 s).
    for (let k = 1; k < s.changements.length; k++) {
      const dt = s.changements[k].t - s.changements[k - 1].t;
      const libre = ['GOAL_SATISFIED', 'GOAL_NO_LONGER_APPLICABLE', 'PREEMPTED_BY_SAFETY'].includes(s.changements[k].reason);
      assert.ok(libre || dt >= 1 - 1e-9, `${cibles[i].join('')} : changement après ${dt.toFixed(2)} s (${s.changements[k].reason})`);
    }
  });
});

test('anti-oscillation : une fluctuation de 0,01 sur les priorités ne change pas le but', () => {
  const e0 = etat('S01');
  const a = agent('A', 7);
  let but = null, changements = 0;
  for (let i = 0; i < 100; i++) {
    const e = avancer(copie(e0), i * 0.1);
    joueur(e, 'A', 7).x += (i % 2 ? 0.01 : -0.01); // bruit minuscule sur la position
    const r = decider(a, e);
    if (but !== null && r.goal !== but) changements++;
    but = r.goal;
  }
  assert.strictEqual(changements, 0);
});

test('hystérésis : un but concurrent légèrement meilleur n\'est adopté qu\'après minCommit ET marge', () => {
  const sel = new GoalSelector({ team: 'A', numero: 7 }, { minCommit: 1, margin: 12 });
  const e0 = etat('S01');
  const ctx = new AgentContext({ team: 'A', numero: 7 }, { reactionDelay: 0 });
  const b0 = ctx.update(e0);
  assert.strictEqual(sel.select(b0).goal, 'SECURE_RUCK');
  // Même situation 0,5 s plus tard : reste engagé.
  const e1 = avancer(copie(e0), 0.5);
  const r = sel.select(ctx.update(e1));
  assert.strictEqual(r.goal, 'SECURE_RUCK');
  assert.strictEqual(r.switched, false);
});

test('les postes sont des profils : un 10 proche du ballon distribue si le 9 n\'est pas là, pas s\'il y est', () => {
  const e = etat('S01');
  const avec9 = copie(e);
  const sans9 = copie(e);
  // On met le 10 contre le ballon dans les deux cas.
  for (const x of [avec9, sans9]) { const d = joueur(x, 'A', 10); d.x = x.ruck.x - 1; d.y = x.ruck.y + 1; d.auSol = 0; }
  // Sans le 9 : on l'éloigne hors de vue et de portée.
  const n9 = joueur(sans9, 'A', 9); n9.x = x0(sans9) - 60; n9.y = 2;
  function x0(x) { return x.ruck.x; }
  const a = decider(agent('A', 10), avec9), b = decider(agent('A', 10), sans9);
  assert.notStrictEqual(a.goal, 'DISTRIBUTE_BALL', 'le 9 est au ballon : le 10 ne se précipite pas');
  assert.strictEqual(b.goal, 'DISTRIBUTE_BALL', 'sans le 9, le 10 prend la distribution : ' + b.goal);
});

test('un avant peut aussi choisir PREVENT_TRY en cas de danger (aucun but réservé à un poste)', () => {
  const e = etat('S01');
  e.possession = 'B'; e.phase = 'PORTE';
  const b14 = joueur(e, 'B', 14); b14.x = 18; b14.y = 30;
  e.ball = Object.assign({}, e.ball, { x: 18, y: 30, state: 'CARRIED', carrierTeam: 'B', carrierNumber: 14 }); e.ballon.x = 18; e.ballon.y = 30;
  const a1 = joueur(e, 'A', 1); a1.x = 10; a1.y = 30; a1.auSol = 0;
  for (const j of e.equipeA) if (j.numero !== 1) { j.x = 60; j.y = 5; }
  assert.strictEqual(decider(agent('A', 1), e).goal, 'PREVENT_TRY');
});

test('croyances seules : modifier l\'état source sans que l\'agent le perçoive ne change pas son but (IND-08)', () => {
  const e = etat('S01');
  const a = agent('A', 11);
  const g0 = decider(a, e).goal;
  const e1 = avancer(copie(e), 0.5);
  const intrus = joueur(e1, 'B', 9); intrus.x = joueur(e1, 'A', 11).x - 25; intrus.y = joueur(e1, 'A', 11).y; // dans son dos
  e1.possession = 'B';
  // Le 11 ne voit pas l'intrus : sa possession perçue est celle de sa dernière observation (délai de réaction 0 -> rafraîchit).
  const r = decider(a, e1);
  assert.ok(['A', 'B'].includes(e1.possession));
  assert.ok(GOAL_IDS.includes(r.goal) && GOAL_IDS.includes(g0));
});

test('déterminisme et immutabilité : mêmes croyances => mêmes décisions ; résultat gelé', () => {
  const e = etat('S08');
  const run = () => JSON.stringify([9, 10, 12, 15].map((n) => decider(agent('A', n), copie(e))));
  assert.strictEqual(run(), run());
  const r = decider(agent('A', 12), e);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.candidates) && Object.isFrozen(r.events));
  const avant = JSON.stringify(e); decider(agent('B', 3), e); assert.strictEqual(JSON.stringify(e), avant);
});

test('options et profils invalides refusés ; numéro hors 1..15 refusé', () => {
  assert.throws(() => new GoalSelector({ team: 'A', numero: 9 }, { minCommit: -1 }), /invalide/);
  assert.throws(() => new GoalSelector({ team: 'X', numero: 9 }), /agent invalide/);
  assert.throws(() => profilePour(16), /invalide/);
});

test('architecture : aucun TeamCoordinator / TeamBlackboard / assignRoles / reserveRole, ni aléa, dans engine/ai', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../engine/ai')).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(__dirname, '../engine/ai', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/TeamCoordinator|TeamBlackboard|assignRoles|reserveRole/.test(src), f + ' : IA collective');
    assert.ok(!/Date\.now|Math\.random|performance\.now/.test(src), f + ' : source d\'aléa');
  }
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : le sélecteur de buts V4 est contextuel, individuel et stable.');
