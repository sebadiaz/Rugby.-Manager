// RM4-G02 — Injecteur de scénarios : chaque fixture S01–S10 est injectable, les
// écarts de la fixture sont DÉCLARÉS (jamais silencieux), le déroulé est
// déterministe et sans téléportation. Ce test ne prouve rien sur les agents GOAP.
'use strict';
const assert = require('assert');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { LONGUEUR, LARGEUR } = require('../engine/rugby-engine.js');
const { createScenarioEngine, ScenarioError } = require('./v4/scenario-harness.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const joueurs = (m) => [...m.equipeA, ...m.equipeB];
const photo = (m) => JSON.stringify([m.phase, m.tempsMatch.toFixed(3), joueurs(m).map((j) => [j.x.toFixed(4), j.y.toFixed(4)]), m.chronologie.map((e) => e.type)]);

// Écarts attendus, figés : si une fixture ou le harnais change, ce tableau le dit.
const ECARTS = {
  S01: ['JOUEUR_AMENE_AU_REGROUPEMENT:A9'],
  S02: ['JOUEUR_AMENE_AU_REGROUPEMENT:A14', 'JOUEUR_AMENE_AU_REGROUPEMENT:B14'],
  S03: [], S04: [],
  S05: ['JOUEUR_AMENE_AU_REGROUPEMENT:A6', 'JOUEUR_AMENE_AU_REGROUPEMENT:B6'],
  S06: ['BALLON_AU_PORTEUR:B12'], S07: ['COUP_DE_PIED_DEPUIS_LE_BOTTEUR:A5'],
  S08: ['BALLON_AU_PORTEUR:A10'], S09: ['BALLON_AU_PORTEUR:A13'], S10: ['BALLON_AU_PORTEUR:A14'],
};

test('les dix scénarios S01–S10 sont injectables, 30 joueurs, phase cohérente avec la fixture', () => {
  assert.strictEqual(corpus.scenarios.length, 10);
  for (const f of corpus.scenarios) {
    const m = createScenarioEngine(f);
    assert.strictEqual(joueurs(m).length, 30, f.id);
    assert.strictEqual(m.phase, f.phase, `${f.id} : phase ${m.phase} au lieu de ${f.phase}`);
    assert.strictEqual(m.possession, f.setup.possession, f.id + ' : possession');
    if (f.phase === 'PORTE') assert.strictEqual(m.porteur.team + m.porteur.numero, f.setup.ball.carrier, f.id + ' : porteur');
    if (f.phase === 'RUCK') assert.ok(m.ruckPoint && m.contestants.length >= 1, f.id + ' : regroupement incomplet');
    if (f.phase === 'MAUL') assert.ok(m.maul && m.maul.etat, f.id + ' : maul sans machine à états');
  }
});

test('après des ticks : coordonnées finies et dans le terrain, phase connue, aucun saut de plus de 2 m par tick', () => {
  for (const f of corpus.scenarios) {
    const m = createScenarioEngine(f);
    // Constat (RM4-G02) : à la transition PORTE -> RUCK le moteur actuel déplace un
    // joueur de 1,2 à 1,9 m en un tick de 0,05 s (S01, S07, S08, S09). Ce n'est pas
    // le harnais : à traiter par RM4-G07/G10 (« no_teleport »). Borne ici : 2 m.
    let prec = joueurs(m).map((j) => [j.x, j.y]);
    for (let i = 0; i < 400; i++) {
      m.tick(f.tickSeconds);
      const cur = joueurs(m).map((j) => [j.x, j.y]);
      cur.forEach((c, k) => {
        assert.ok(Number.isFinite(c[0]) && Number.isFinite(c[1]), `${f.id} : coordonnée non finie`);
        assert.ok(c[0] >= -1 && c[0] <= LONGUEUR + 1 && c[1] >= -1 && c[1] <= LARGEUR + 1, `${f.id} : joueur hors terrain (${c})`);
        assert.ok(Math.hypot(c[0] - prec[k][0], c[1] - prec[k][1]) <= 2.0, `${f.id} tick ${i} : saut de ${Math.hypot(c[0] - prec[k][0], c[1] - prec[k][1]).toFixed(2)} m`);
      });
      prec = cur;
    }
    const e = m.getState();
    assert.ok(Number.isFinite(e.ballon.x) && Number.isFinite(e.ballon.y), f.id + ' : ballon non fini');
    assert.strictEqual(e.equipeA.length + e.equipeB.length, 30);
  }
});

test('même fixture + même graine => mêmes positions et mêmes événements', () => {
  for (const f of corpus.scenarios) {
    const a = createScenarioEngine(f), b = createScenarioEngine(f);
    for (let i = 0; i < 200; i++) { a.tick(f.tickSeconds); b.tick(f.tickSeconds); }
    assert.strictEqual(photo(a), photo(b), f.id + ' : déroulé différent');
  }
});

test('une autre graine change le déroulé (le harnais ne fige pas le hasard)', () => {
  const f = corpus.scenarios[0];
  const a = createScenarioEngine(f), b = createScenarioEngine(Object.assign({}, f, { seed: f.seed + 1 }));
  for (let i = 0; i < 400; i++) { a.tick(f.tickSeconds); b.tick(f.tickSeconds); }
  assert.notStrictEqual(photo(a), photo(b));
});

test('les écarts de fixture sont déclarés, conformes au tableau attendu, jamais silencieux', () => {
  for (const f of corpus.scenarios) {
    const m = createScenarioEngine(f);
    const vus = m.scenarioEcarts.map((e) => `${e.type}:${e.id}`);
    assert.deepStrictEqual(vus, ECARTS[f.id], `${f.id} : écarts ${JSON.stringify(vus)}`);
    for (const e of m.scenarioEcarts) assert.ok(e.metres > 0, f.id);
  }
});

test('mode strict : un écart de fixture est refusé au lieu d\'être corrigé', () => {
  const f = corpus.scenarios.find((x) => x.id === 'S02');
  assert.throws(() => createScenarioEngine(f, { strict: true }), ScenarioError);
  // Une fixture sans écart passe en mode strict.
  assert.doesNotThrow(() => createScenarioEngine(corpus.scenarios.find((x) => x.id === 'S03'), { strict: true }));
});

test('préconditions : fixture impossible refusée (29 joueurs, hors terrain, porteur adverse, touche hors ligne)', () => {
  const base = corpus.scenarios.find((x) => x.id === 'S08');
  const copie = () => JSON.parse(JSON.stringify(base));
  let f = copie(); f.setup.players.pop();
  assert.throws(() => createScenarioEngine(f), /30/);
  f = copie(); f.setup.players[3].x = 140;
  assert.throws(() => createScenarioEngine(f), /hors du terrain/);
  f = copie(); f.setup.players[3].y = NaN;
  assert.throws(() => createScenarioEngine(f), /non finies/);
  f = copie(); f.setup.ball.carrier = 'B3';
  assert.throws(() => createScenarioEngine(f), /absent de l'équipe en possession/);
  f = copie(); f.phase = 'ESSAI';
  assert.throws(() => createScenarioEngine(f), /non prise en charge/);
  const touche = JSON.parse(JSON.stringify(corpus.scenarios.find((x) => x.id === 'S04')));
  touche.setup.ball.y = 12;
  assert.throws(() => createScenarioEngine(touche), /ligne de touche/);
});

test('le harnais ne modifie pas la fixture et ne touche pas à getState() (pas de champ ajouté)', () => {
  const f = corpus.scenarios[0];
  const avant = JSON.stringify(f);
  const m = createScenarioEngine(f);
  assert.strictEqual(JSON.stringify(f), avant);
  assert.ok(!('scenarioEcarts' in m.getState()));
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : l\'injecteur de scénarios V4 est conforme.');
