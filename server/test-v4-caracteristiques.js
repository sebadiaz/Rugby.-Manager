// Caractéristiques individuelles (docs/SIMULATION_V4/15_CARACTERISTIQUES_INDIVIDUELLES.md) : migration sans perte,
// valeurs explicites prioritaires, gestes maîtrisés et TESTS DE TENDANCE (vrais à tout niveau de jeu).
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { lireChistera, lirePorteur } = require('../engine/ai/open-play.js');
const { deriveSituation } = require('../engine/ai/goals.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

test('migration : sans caractéristiques détaillées, elles sont dérivées des 12 attributs (aucune perte, aucun trou)', () => {
  const m = new MatchEngine(1, 4800);
  for (const j of m.equipeA.concat(m.equipeB)) {
    for (const k of ['lectureJeu', 'vision', 'receptionPasse', 'passeApresContact', 'longueurPasse', 'precisionPied', 'piedRasant', 'distancePied']) {
      assert.ok(Number.isFinite(j.car[k]) && j.car[k] >= 0 && j.car[k] <= 100, `${j.team}${j.numero}.${k}`);
    }
    for (const g of ['chistera', 'passeAuPied', 'petitPied', 'passeLongue']) assert.ok([0, 1, 2, 3].includes(j.gestes[g]));
  }
  assert.strictEqual(m.equipeA.find((j) => j.numero === 9).car.lectureJeu, m.equipeA.find((j) => j.numero === 9).decision);
});

test('valeurs explicites prioritaires : un pilier qui sait faire la chistera, un 10 qui ne sait pas', () => {
  const m = new MatchEngine(1, 4800, { joueursA: { 1: { gestes: { chistera: 2 } }, 10: { gestes: { chistera: 0 }, caracteristiques: { lectureJeu: 95 } } } });
  const a = (n) => m.equipeA.find((j) => j.numero === n);
  assert.strictEqual(a(1).gestes.chistera, 2);
  assert.strictEqual(a(10).gestes.chistera, 0);
  assert.strictEqual(a(10).car.lectureJeu, 95);
  assert.strictEqual(m.equipeB.find((j) => j.numero === 1).gestes.chistera, 0, 'le pilier par défaut ne sait pas');
});

test('tendance : meilleure lecture du jeu -> réaction plus rapide (délai de perception individuel)', () => {
  const m = new MatchEngine(2, 4800, { joueursA: { 12: { caracteristiques: { lectureJeu: 90 } }, 13: { caracteristiques: { lectureJeu: 30 } } } });
  const etat = m.getAgentState();
  const ctx = (n) => { const c = new AgentContext({ team: 'A', numero: n }); c.params.lectureAuto = true; c.update(etat); return c.params.reactionDelay; };
  assert.ok(ctx(12) < ctx(13), `${ctx(12)} < ${ctx(13)}`);
  assert.ok(ctx(12) <= 0.15 && ctx(13) >= 0.25);
});

test('geste non maîtrisé : jamais une option (chistera impossible pour qui ne sait pas, même en situation idéale)', () => {
  const fiche = (n, x, y, vx = 0) => ({ numero: n, lastSeen: { x, y }, age: 0.1, confidence: 1, vx, vy: 0, available: true });
  const b = (gestes) => ({ agent: { team: 'A', numero: 12 }, self: { x: 60, y: 30, sensAttaque: 1, gestes },
    teammates: { A13: fiche(13, 57, 33, 6) }, opponents: { B12: fiche(12, 62, 28.5), B10: fiche(10, 66, 20) } });
  const adv = (x) => Object.values(x.opponents);
  const sait = b({ chistera: 2 }), saitPas = b({ chistera: 0 });
  assert.ok(lireChistera(sait, sait.self, 1, adv(sait), 2.5), 'qui sait la tente');
  assert.strictEqual(lireChistera(saitPas, saitPas.self, 1, adv(saitPas), 2.5), null, 'qui ne sait pas ne la tente jamais');
});

test('tendance : sans maîtrise de la passe longue, aucun receveur au-delà de 12 m n\'est une option', () => {
  const fiche = (n, x, y) => ({ numero: n, lastSeen: { x, y }, age: 0.1, confidence: 1, vx: 0, vy: 0, available: true });
  const croy = (gestes) => ({ t: 500, agent: { team: 'A', numero: 4 }, phase: 'PORTE', possession: 'A', score: { A: 0, B: 0 }, heard: [],
    self: { x: 60, y: 20, sensAttaque: 1, gestes, available: true, grounded: false }, ruck: null,
    ball: { lastSeen: { x: 60, y: 20 }, age: 0.1, state: 'HELD', owner: 'A4' },
    teammates: { A12: fiche(12, 57, 37) }, opponents: { B4: fiche(4, 64, 20), B6: fiche(6, 64, 24), B10: fiche(10, 66, 30) } });
  const loin = (g) => { const b = croy(g); const d = lirePorteur(b, deriveSituation(b), { distribute: 0.3 }, {}); return (d ? d.options : []).some((o) => o.action === 'PASS' && o.vers === 12); };
  assert.strictEqual(loin({ passeLongue: 0, chistera: 0, passeAuPied: 0, petitPied: 0 }), false, 'avant sans passe longue : pas de passe à 17 m');
  assert.strictEqual(loin({ passeLongue: 2, chistera: 0, passeAuPied: 0, petitPied: 0 }), true, 'joueur qui maîtrise : option présente');
});

test('match GOAP : une équipe dont personne ne sait faire la chistera n\'en tente aucune ; l\'autre en tente', () => {
  const sansChistera = Object.fromEntries([...Array(15)].map((_, i) => [i + 1, { gestes: { chistera: 0 } }]));
  const parEquipe = { A: 0, B: 0 };
  // Plusieurs graines : la chistera est rare (un geste maîtrisé que le porteur choisit à un moment précis).
  for (const graine of [5, 6, 7]) {
    const m = new MatchEngine(graine, 4800, configGOAP({ joueursA: sansChistera }));
    const log = m.log.bind(m);
    m.log = (t, eq, msg, d) => { if (t === 'CHISTERA' || t === 'CHISTERA_RATEE') parEquipe[eq]++; return log(t, eq, msg, d); };
    m.jouerJusquAuSifflet(0.1);
  }
  assert.strictEqual(parEquipe.A, 0, 'aucune chistera pour A');
  assert.ok(parEquipe.B >= 1, 'B (gestes par défaut) en tente : ' + parEquipe.B);
});

test('remplacement : le joueur entrant apporte SES caractéristiques et SES gestes', () => {
  const m = new MatchEngine(4, 4800, configGOAP());
  const dix = () => m.equipeA.find((j) => j.numero === 10);
  assert.ok(dix().gestes.passeAuPied >= 1, 'le 10 titulaire sait faire la passe au pied');
  assert.ok(m.remplacerJoueurEnCours('A', 10, { jeuPied: 40, adresse: 40, gestes: { passeAuPied: 0 }, caracteristiques: { lectureJeu: 35 } }));
  for (let t = 0; t < 1200 && dix().gestes.passeAuPied !== 0; t += 0.1) m.tick(0.1);
  assert.strictEqual(dix().gestes.passeAuPied, 0, 'l\'entrant ne la sait pas');
  assert.strictEqual(dix().car.lectureJeu, 35);
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
