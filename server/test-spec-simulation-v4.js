// Contrat exécutable des fixtures V4. Ce test NE prétend pas que les
// comportements décrits sont déjà implémentés : le scénario injecteur viendra
// avec RM4-002, et les assertions moteur avec les tâches suivantes.
'use strict';
const assert = require('assert');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { LONGUEUR, LARGEUR } = require('../engine/rugby-engine.js');

const PHASES = new Set(['RUCK', 'PORTE', 'MELEE', 'TOUCHE', 'MAUL', 'COUP_DE_PIED_JEU']);
const BALL = new Set(['OUT', 'CARRIED', 'AIR', 'LOOSE', 'RUCK', 'MAUL']);
const KIND = new Set([
  'ruck_legal_exit', 'support_arrival', 'attack_width', 'time_window',
  'referee_inside', 'no_offfield_players', 'scrum_sequence',
  'scrum_no_push_early', 'scrum_halfback_law', 'scrum_release',
  'lineout_lanes', 'assistant_signal', 'throw_contestable', 'lineout_restarts',
  'maul_attachment', 'maul_foul', 'referee_reason',
  'no_teleport', 'defense_connectivity', 'cover_15',
  'kick_offside', 'kick_chasers', 'advantage_decision', 'advantage_recall',
  'referee_signal', 'sub_eligibility', 'roster_integrity', 'save_compat',
  'try_grounded', 'tmo_optional',
]);

function validePosition(p, contexte) {
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
    contexte + ': coordonnées non numériques');
  assert.ok(p.x >= 0 && p.x <= LONGUEUR && p.y >= 0 && p.y <= LARGEUR,
    contexte + ': coordonnées hors terrain');
}
assert.strictEqual(corpus.schemaVersion, '1.0.0');
assert.strictEqual(corpus.scenarios.length, 10, 'le corpus contient exactement 10 scénarios documentés');
const ids = new Set();
for (const f of corpus.scenarios) {
  assert.match(f.id, /^S\d{2}$/);
  assert.ok(!ids.has(f.id), f.id + ' dupliqué');
  ids.add(f.id);
  assert.ok(PHASES.has(f.phase), f.id + ' phase invalide');
  assert.ok(Number.isInteger(f.seed) && f.seed > 0);
  assert.ok(f.tickSeconds > 0 && f.tickSeconds <= 0.2);
  const setup = f.setup;
  assert.strictEqual(setup.players.length, 30, f.id + ': pas 30 joueurs');
  assert.ok(['A', 'B'].includes(setup.possession));
  assert.ok(BALL.has(setup.ball.state));
  validePosition(setup.ball, f.id + ' ballon');
  if (setup.ball.state === 'CARRIED') {
    assert.match(setup.ball.carrier, /^[AB](?:[1-9]|1[0-5])$/);
    assert.strictEqual(setup.ball.carrier[0], setup.possession,
      f.id + ' : porteur incohérent avec la possession');
  } else {
    assert.strictEqual(setup.ball.carrier, null,
      f.id + ' : ballon au sol/en vol ne doit pas avoir de porteur');
  }
  const joueurs = new Set();
  for (const j of setup.players) {
    assert.ok(['A', 'B'].includes(j.team));
    assert.ok(Number.isInteger(j.number) && j.number >= 1 && j.number <= 15);
    assert.strictEqual(j.id, j.team + j.number);
    assert.ok(!joueurs.has(j.id), f.id + ': joueur en double ' + j.id);
    joueurs.add(j.id);
    assert.strictEqual(j.available, true);
    validePosition(j, f.id + ' ' + j.id);
  }
  for (const team of ['A', 'B']) {
    assert.strictEqual(setup.players.filter(j => j.team === team).length, 15);
    for (let n = 1; n <= 15; n++) assert.ok(joueurs.has(team + n), f.id + ' manque ' + team + n);
  }
  assert.ok(setup.referee);
  validePosition(setup.referee, f.id + ' arbitre');
  assert.strictEqual(setup.assistants.length, 2);
  const ar1 = setup.assistants.find(a => a.id === 'AR1');
  const ar2 = setup.assistants.find(a => a.id === 'AR2');
  assert.ok(ar1 && ar2);
  assert.strictEqual(ar1.y, 0);
  assert.strictEqual(ar2.y, LARGEUR);
  setup.assistants.forEach(a => validePosition(a, f.id + ' ' + a.id));
  assert.ok(Array.isArray(setup.tags) && setup.tags.length);
  assert.ok(Array.isArray(setup.given) && setup.given.length);
  assert.ok(typeof f.when === 'string' && f.when.length > 15);
  assert.ok(Array.isArray(f.then) && f.then.length >= 2);
  for (const a of f.then) {
    assert.ok(KIND.has(a.kind), f.id + ' kind inconnu ' + a.kind);
    assert.ok(a.description && a.description.length >= 20);
  }
  if (f.calibration) {
    const [min, max] = f.calibration.expectedPhaseSeconds;
    assert.ok(min >= 0 && max > min);
    assert.strictEqual(f.calibration.source, 'hypothese_a_calibrer');
  }
  console.log('OK ' + f.id + ' (' + f.phase + ') : 30 joueurs, arbitres, contrat');
}
console.log('OK 10 fixtures V4 testables structurellement — comportements à implémenter par RM4-002 et suivants');
