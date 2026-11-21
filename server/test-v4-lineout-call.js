// RM4-G20 / G32 (première tranche) — appel de touche INDIVIDUEL : le 9 demande l'avis du 10,
// tranche, annonce ; l'avant qui capte demande le maul ; le moteur ne le forme que si un
// partenaire est réellement lié. Tests STR-DIA-L01..L05 (10_DIALOGUES_TACTIQUES_DU_9.md).
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { LocalCommunication } = require('../engine/ai/local-communication.js');
const { LineoutMind, avisDuDix, choixDuNeuf } = require('../engine/ai/lineout-call.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

// Croyances minimales d'un agent A (attaque vers x = 100), ballon (marque de touche) en `marque`.
function croyances(numero, marque, { mates = {}, opps = {}, heard = [], t = 100, possession = 'A', phase = 'TOUCHE', moi } = {}) {
  const fiche = (n, x, y) => ({ numero: n, lastSeen: { x, y }, age: 0.2, confidence: 1 });
  return {
    t, agent: { team: 'A', numero }, phase, possession, score: { A: 0, B: 0 }, heard,
    self: Object.assign({ x: marque.x - 5, y: marque.y + 8, sensAttaque: 1 }, moi),
    ball: { lastSeen: { x: marque.x, y: marque.y }, age: 0.2, state: 'HELD', owner: 'A2' },
    teammates: Object.fromEntries(Object.entries(mates).map(([id, [n, x, y]]) => [id, fiche(n, x, y)])),
    opponents: Object.fromEntries(Object.entries(opps).map(([id, [n, x, y]]) => [id, fiche(n, x, y)])),
  };
}

test('avis du 10 : surnombre PERÇU au large -> LINEOUT_WIDE ; sinon milieu ; près de sa ligne -> devant', () => {
  const marque = { x: 50, y: 0.5 };
  const mates = { A12: [12, 47, 22], A13: [13, 46, 30], A14: [14, 45, 40] };
  const opps = { B12: [12, 53, 24], B13: [13, 54, 32] };
  assert.strictEqual(avisDuDix(croyances(10, marque, { mates, opps })), 'LINEOUT_WIDE');
  const opps2 = Object.assign({ B14: [14, 55, 40], B15: [15, 62, 35], B11: [11, 60, 50] }, opps);
  assert.strictEqual(avisDuDix(croyances(10, marque, { mates, opps: opps2 })), 'LINEOUT_MIDDLE');
  assert.strictEqual(avisDuDix(croyances(10, { x: 15, y: 0.5 }, { mates, opps })), 'LINEOUT_FRONT');
});

test('L03 : le 9 tranche lui-même et peut contredire le 10 (maul à 5 m malgré « au large ») ; jamais de maul dans son camp', () => {
  const pres = choixDuNeuf(croyances(9, { x: 95, y: 0.5 }), 'LINEOUT_WIDE', {}, 100);
  assert.strictEqual(pres.appel, 'LINEOUT_MAUL');
  for (let t = 0; t < 60; t += 0.5) {
    assert.notStrictEqual(choixDuNeuf(croyances(9, { x: 30, y: 0.5 }, { t }), 'LINEOUT_MIDDLE', {}, t).appel, 'LINEOUT_MAUL');
  }
  // Consigne du club lue (pas imposée) : un club « jeu au sol » joue moins le maul à 20 m qu'un club « maul ».
  let maulsClubMaul = 0, maulsClubSol = 0;
  for (let t = 0; t < 60; t += 0.5) {
    if (choixDuNeuf(croyances(9, { x: 82, y: 0.5 }, { t }), 'LINEOUT_MIDDLE', { maulTouche: 0.7 }, t).appel === 'LINEOUT_MAUL') maulsClubMaul++;
    if (choixDuNeuf(croyances(9, { x: 82, y: 0.5 }, { t }), 'LINEOUT_MIDDLE', { maulTouche: 0.25 }, t).appel === 'LINEOUT_MAUL') maulsClubSol++;
  }
  assert.ok(maulsClubMaul > maulsClubSol, `${maulsClubMaul} vs ${maulsClubSol}`);
});

test('L01/L02/L04 : question du 9 au 10, réponse liée, appel du 9 ; un avant hors de portée n\'entend rien', () => {
  const comm = new LocalCommunication();
  const marque = { x: 80, y: 0.5 };
  const pos = { A9: { x: 76, y: 8 }, A10: { x: 70, y: 14 }, A4: { x: 80, y: 9 }, A5: { x: 40, y: 40 } };
  const esprits = Object.fromEntries(Object.keys(pos).map((id) => [id, new LineoutMind({ team: 'A', numero: +id.slice(1) })]));
  const heard = Object.fromEntries(Object.keys(pos).map((id) => [id, []]));
  const ev = [];
  for (let t = 100; t < 106; t += 0.1) {
    for (const id of Object.keys(pos)) {
      for (const h of comm.hear({ listenerId: id, team: 'A', x: pos[id].x, y: pos[id].y, time: t })) heard[id].push(h);
      const b = croyances(+id.slice(1), marque, { t, heard: heard[id].map((h) => Object.assign({}, h, { age: t - h.heardAt })), moi: pos[id] });
      for (const e of esprits[id].etape(b, { tempsMatch: t }, comm, pos[id], {})) ev.push(Object.assign({ id, t }, e));
    }
  }
  assert.strictEqual(ev[0].type, 'LINEOUT_ASKED', 'le premier message stratégique est la question du 9');
  assert.strictEqual(ev[0].id, 'A9');
  const avis = ev.find((e) => e.type === 'LINEOUT_ADVICE');
  assert.ok(avis && avis.id === 'A10' && avis.to === 'A9', 'le 10 répond au 9');
  const appel = ev.find((e) => e.type === 'LINEOUT_CALLED');
  assert.ok(appel && appel.id === 'A9' && appel.avis === avis.avis, 'le 9 décide après avoir entendu l\'avis');
  assert.ok(ev.some((e) => e.type === 'LINEOUT_CALL_HEARD' && e.id === 'A4'), 'l\'avant de l\'alignement entend');
  assert.ok(!ev.some((e) => e.id === 'A5'), 'l\'avant à 40 m n\'entend rien');
  assert.strictEqual(esprits.A5.demandeMaul(), false);
  assert.strictEqual(esprits.A4.demandeMaul(), appel.appel === 'LINEOUT_MAUL');
});

// Moteur GOAP piloté à la main : seul le test pose (ou non) la demande du sauteur.
function matchPilote(graine, duree, { demander, delier }) {
  const compte = { gagnees: 0, maulsTouche: 0, appeles: 0, sansSoutien: 0, saquees: 0, au9: 0 };
  const m = new MatchEngine(graine, 4800, { aiMode: 'GOAP', agentDriver: () => ({
    avantTick(e) {
      const L = e.toucheLancer;
      if (!L || L.vole || L.pasDroit || !L.sauteur) return;
      if (demander) e.setAgentIntent(L.sauteur.team, L.sauteur.numero, { touche: 'MAUL' });
      // Manipulation de TEST : juste avant la réception, les partenaires sont écartés du sauteur.
      if (delier && L.timer + 0.1 >= L.duree) for (const j of (L.sauteur.team === 'A' ? e.equipeA : e.equipeB)) {
        if (j !== L.sauteur && Math.hypot(j.x - L.sauteur.x, j.y - L.sauteur.y) <= 4) j.x = L.sauteur.x + (j.x >= L.sauteur.x ? 5 : -5);
      }
    },
  }) });
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => {
    if (t === 'TOUCHE_BALLON_GAGNE') compte.gagnees++;
    if (t === 'TOUCHE_MAUL_APPELE') compte.appeles++;
    if (t === 'TOUCHE_MAUL_SANS_SOUTIEN') compte.sansSoutien++;
    if (t === 'TOUCHE_SAQUEE') compte.saquees++;
    return log(t, eq, msg, d);
  };
  const former = m._formerMaul.bind(m);
  m._formerMaul = (...a) => { if (m.phase === 'TOUCHE') compte.maulsTouche++; return former(...a); };
  const lancer = m._lancerPasseVisuelle.bind(m);
  m._lancerPasseVisuelle = (de, vers) => { if (m.phase === 'TOUCHE' && vers.numero === 9) compte.au9++; return lancer(de, vers); };
  for (let t = 0; t < duree; t += 0.1) m.tick(0.1);
  return compte;
}

test('L05 / moteur : sans demande du sauteur, AUCUN maul de touche en GOAP (plus de tirage) ; le ballon va au 9', () => {
  const c = matchPilote(4, 2400, { demander: false });
  assert.ok(c.gagnees >= 4, 'assez de touches : ' + c.gagnees);
  assert.strictEqual(c.maulsTouche, 0);
  assert.strictEqual(c.appeles + c.sansSoutien, 0);
  assert.ok(c.au9 >= c.gagnees - 1, `${c.au9} transmissions au 9 pour ${c.gagnees} touches`);
});

test('moteur : le sauteur qui capte et demande le maul l\'obtient si un partenaire est lié (ou la défense le saque)', () => {
  const c = matchPilote(4, 4800, { demander: true });
  assert.ok(c.appeles >= 4, 'mauls appelés : ' + c.appeles);
  // Dans un alignement les lifteurs sont au contact ; un sauteur isolé en bout de ligne reste possible et
  // le moteur refuse alors le maul (vérifié au test suivant).
  assert.ok(c.sansSoutien * 4 <= c.appeles, `${c.sansSoutien} refus pour ${c.appeles} mauls appelés`);
  assert.strictEqual(c.maulsTouche + c.saquees, c.appeles);
});

test('moteur : demande de maul sans partenaire lié -> pas de maul, ballon transmis au 9', () => {
  const c = matchPilote(4, 2400, { demander: true, delier: true });
  assert.ok(c.sansSoutien >= 4, 'refus : ' + c.sansSoutien);
  assert.strictEqual(c.maulsTouche, 0);
  assert.ok(c.au9 >= c.sansSoutien - 1);
});

test('LEGACY : une demande de maul est ignorée (setAgentIntent la refuse) et le jeu est identique', () => {
  const a = new MatchEngine(8, 4800), b = new MatchEngine(8, 4800);
  assert.strictEqual(b.setAgentIntent('A', 4, { touche: 'MAUL' }), false);
  for (let i = 0; i < 2000; i++) { a.tick(0.1); b.tick(0.1); }
  assert.strictEqual(JSON.stringify(a.getState()), JSON.stringify(b.getState()));
});

test('match GOAP réel : le 9 interroge, le 10 répond, le 9 appelle ; chaque maul de touche suit un appel « maul » entendu', () => {
  const m = new MatchEngine(1, 4800, configGOAP());
  let appeles = 0;
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => { if (t === 'TOUCHE_MAUL_APPELE') appeles++; return log(t, eq, msg, d); };
  for (let t = 0; t < 1500; t += 0.1) m.tick(0.1);
  const ev = m._pilote.agents.flatMap((a) => a.events);
  const de = (num, type) => ev.filter((e) => e.type === type && /^[AB]/.test(e.agent) && e.agent.slice(1) === String(num));
  const questions = de(9, 'LINEOUT_ASKED'), avis = de(10, 'LINEOUT_ADVICE'), appels = de(9, 'LINEOUT_CALLED');
  assert.ok(questions.length >= 4 && avis.length >= 3 && appels.length >= 4, `${questions.length}/${avis.length}/${appels.length}`);
  assert.ok(appels.every((a) => questions.some((q) => q.agent === a.agent && q.t <= a.t)), 'chaque appel suit une question du même 9');
  assert.ok(!ev.some((e) => (e.type === 'LINEOUT_ASKED' || e.type === 'LINEOUT_CALLED') && !/9$/.test(e.agent)), 'seul le 9 interroge et appelle');
  const appelsMaul = appels.filter((a) => a.appel === 'LINEOUT_MAUL').length;
  assert.ok(appeles <= appelsMaul, `${appeles} mauls de touche pour ${appelsMaul} appels « maul »`);
  assert.strictEqual(m._pilote.agents.reduce((s, a) => s + (a.errors || 0), 0), 0);
});

test('voix coupée : personne n\'entend d\'appel, donc aucun maul de touche', () => {
  const m = new MatchEngine(1, 4800, configGOAP(undefined, { voix: false }));
  let mauls = 0, gagnees = 0;
  const former = m._formerMaul.bind(m);
  m._formerMaul = (...a) => { if (m.phase === 'TOUCHE') mauls++; return former(...a); };
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => { if (t === 'TOUCHE_BALLON_GAGNE') gagnees++; return log(t, eq, msg, d); };
  for (let t = 0; t < 3000; t += 0.1) m.tick(0.1);
  assert.ok(gagnees >= 4, 'touches gagnées : ' + gagnees);
  assert.strictEqual(mauls, 0);
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
