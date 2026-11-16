// Dialogue de MÊLÉE individuel (RM4-G19 / G37, première tranche) : le 9 interroge le 10 puis le 8 et tranche ;
// le 8 ANNONCE « Neuf, j'y vais ! » avant de ramasser ; le moteur n'exécute le départ du 8 que s'il a été annoncé.
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { LocalCommunication } = require('../engine/ai/local-communication.js');
const { ScrumMind, avisDuDix, huitPeutPartir, huitChoix } = require('../engine/ai/scrum-call.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

const fiche = (n, x, y) => ({ numero: n, lastSeen: { x, y }, age: 0.2, confidence: 1, vx: 0, vy: 0 });
// Croyances d'un agent A ; mêlée en (50, 35) ; `heard` : appels entendus.
function croyances(numero, { mates = {}, opps = {}, heard = [], t = 100 } = {}) {
  return { t, agent: { team: 'A', numero }, phase: 'MELEE', possession: 'A', heard,
    teammates: Object.fromEntries(Object.entries(mates).map(([id, [n, x, y]]) => [id, fiche(n, x, y)])),
    opponents: Object.fromEntries(Object.entries(opps).map(([id, [n, x, y]]) => [id, fiche(n, x, y)])),
    self: { sensAttaque: 1 } };
}
const melee = (extra) => Object.assign({ id: 7, etat: 'MELEE_CONTESTATION', equipeIntroduction: 'A', vainqueur: null, qualite: null, x: 50, y: 35, simulee: false }, extra);

test('avis du 10 : large plus nombreux côté attaque -> WIDE ; défense proche clairsemée -> NEAR ; sinon ADVANCE', () => {
  const large = { A12: [12, 46, 50], A13: [13, 46, 58] };
  assert.strictEqual(avisDuDix(croyances(10, { mates: large, opps: { B12: [12, 55, 52] } }), melee()), 'SCRUM_WIDE');
  const dense = { B1: [1, 51, 35], B2: [2, 52, 36], B3: [3, 53, 34], B12: [12, 54, 48], B13: [13, 54, 55], B11: [11, 55, 60] };
  assert.strictEqual(avisDuDix(croyances(10, { opps: dense }), melee()), 'SCRUM_ADVANCE');
  // Défense large mieux fournie que l'attaque, mais personne près de la mêlée : le jeu au près est ouvert.
  assert.strictEqual(avisDuDix(croyances(10, { opps: { B12: [12, 55, 52], B13: [13, 55, 58] } }), melee()), 'SCRUM_NEAR');
});

test('le 8 lit la qualité du ballon : sous pression ou volé = il ne part pas ; dominant = il part', () => {
  const me = { numero: 8, puissance: 70, auSol: 0, x: 49, y: 35, sensAttaque: 1 };
  assert.strictEqual(huitPeutPartir(croyances(8), melee({ qualite: 'PRESSION', vainqueur: 'A' }), me).ok, false);
  assert.strictEqual(huitPeutPartir(croyances(8), melee({ qualite: 'VOLE', vainqueur: 'B' }), me).ok, false);
  assert.strictEqual(huitPeutPartir(croyances(8), melee({ qualite: 'DOMINANT', vainqueur: 'A' }), me).ok, true);
  assert.strictEqual(huitPeutPartir(croyances(8), melee({ qualite: 'DOMINANT', vainqueur: 'A' }), Object.assign({}, me, { auSol: 1 })).ok, false);
});

test('choix du 8 : près de la ligne adverse il PORTE ; loin, 10 démarqué et bonne passe -> il PASSE ; sinon il porte', () => {
  const dix = { A10: [10, 40, 45] };
  const proche = { numero: 8, x: 90, y: 35, sensAttaque: 1, car: { passeApresContact: 80 } };
  assert.strictEqual(huitChoix(croyances(8, { mates: { A10: [10, 80, 45] } }), melee(), proche), 'GO');
  const loin = { numero: 8, x: 49, y: 35, sensAttaque: 1, car: { passeApresContact: 85 } };
  assert.strictEqual(huitChoix(croyances(8, { mates: dix }), melee(), loin), 'PASSE');
  assert.strictEqual(huitChoix(croyances(8, { mates: dix, opps: { B12: [12, 41, 45] } }), melee(), loin), 'GO', 'défenseur sur le 10');
  assert.strictEqual(huitChoix(croyances(8, { mates: dix }), melee(), Object.assign({}, loin, { car: { passeApresContact: 20 } })), 'GO', 'passe mal : il porte');
});

// Dialogue complet entre les trois esprits, à travers le vrai transport de voix.
function jouerDialogue({ qualite = 'DOMINANT', puissance8 = 90, largeOuvert = false } = {}) {
  const comm = new LocalCommunication();
  const pos = { A9: { x: 48, y: 36 }, A10: { x: 42, y: 45 }, A8: { x: 51, y: 35 } };
  const joueurs = { A9: { numero: 9, auSol: 0, puissance: 40, x: 48, y: 36 }, A10: { numero: 10, auSol: 0, puissance: 40, x: 42, y: 45 },
    A8: { numero: 8, auSol: 0, puissance: puissance8, x: 51, y: 35, sensAttaque: 1, car: { passeApresContact: 40 } } };
  const esprits = Object.fromEntries(Object.keys(pos).map((id) => [id, new ScrumMind({ team: 'A', numero: +id.slice(1) })]));
  const heard = Object.fromEntries(Object.keys(pos).map((id) => [id, []]));
  const ev = [];
  const mates = Object.assign({ A9: [9, 48, 36], A10: [10, 42, 45], A8: [8, 51, 35] }, largeOuvert ? { A12: [12, 44, 52], A13: [13, 44, 58] } : {});
  for (let t = 100; t < 110; t += 0.1) {
    const etat = t < 103 ? 'MELEE_CONTESTATION' : 'MELEE_SORTIE';
    const m = melee({ etat, qualite, vainqueur: t < 103 ? null : 'A' });
    for (const id of Object.keys(pos)) {
      for (const h of comm.hear({ listenerId: id, team: 'A', x: pos[id].x, y: pos[id].y, time: t })) heard[id].push(h);
      const autres = Object.fromEntries(Object.entries(mates).filter(([k]) => k !== id));
      const b = croyances(+id.slice(1), { mates: autres, opps: { B12: [12, 56, 48], B13: [13, 56, 55] }, t,
        heard: heard[id].map((h) => Object.assign({}, h, { age: t - h.heardAt })) });
      for (const e of esprits[id].etape(b, { tempsMatch: t, melee: m }, comm, joueurs[id], {})) ev.push(Object.assign({ id, t: +t.toFixed(1) }, e));
    }
  }
  return { ev, esprits };
}

test('dialogue : le 9 questionne le 10 puis le 8, tranche ; le 8 annonce « j\'y vais » AVANT de partir ; le 9 accuse et se retire', () => {
  const { ev, esprits } = jouerDialogue();
  const types = ev.map((e) => e.id + ':' + e.type);
  assert.ok(types.indexOf('A9:SCRUM_ASKED') >= 0, 'le 9 pose la première question');
  assert.strictEqual(ev[0].id, 'A9');
  assert.ok(ev.some((e) => e.id === 'A10' && e.type === 'SCRUM_ADVICE'), 'le 10 répond');
  assert.ok(ev.some((e) => e.id === 'A8' && e.type === 'SCRUM_8_READY_SAID'), 'le 8 répond qu\'il peut partir');
  const appel = ev.find((e) => e.type === 'SCRUM_CALLED');
  assert.ok(appel && appel.huit === 'SCRUM_8_READY', 'le 9 décide après les deux réponses');
  const going = ev.find((e) => e.type === 'SCRUM_8_GOING_SAID');
  const replan = ev.find((e) => e.type === 'SCRUM_9_REPLANS');
  assert.ok(going && replan && going.t <= replan.t, 'annonce du 8 puis réaction du 9');
  assert.ok(going.t >= 103, 'annoncé seulement quand le ballon est à la base (SORTIE)');
  assert.ok(['GO', 'PASSE'].includes(esprits.A8.demandeMoteur()));
  assert.strictEqual(esprits.A9.cede, true);
  assert.strictEqual(esprits.A9.demandeMoteur(), null, 'le 9 ne demande rien : un seul porteur');
});

test('le 10 voit un large ouvert -> conseil « au large » : le 9 sert lui-même, le 8 n\'est pas lancé', () => {
  const { ev, esprits } = jouerDialogue({ largeOuvert: true });
  const appel = ev.find((e) => e.type === 'SCRUM_CALLED');
  assert.ok(appel && appel.appel === 'SCRUM_WIDE', JSON.stringify(appel));
  assert.ok(!ev.some((e) => e.type === 'SCRUM_8_GOING_SAID'));
  assert.strictEqual(esprits.A8.demandeMoteur(), null);
});

test('le 8 ne PEUT PAS demander le départ sans l\'avoir annoncé : ballon sous pression -> « je laisse » et aucune demande', () => {
  const { ev, esprits } = jouerDialogue({ qualite: 'PRESSION' });
  assert.ok(!ev.some((e) => e.type === 'SCRUM_8_GOING_SAID'));
  assert.strictEqual(esprits.A8.demandeMoteur(), null);
  assert.ok(ev.some((e) => e.type === 'SCRUM_8_BLOCKED_SAID'), 'il avait répondu qu\'il ne pouvait pas');
});

test('un joueur trop loin pour entendre ne reçoit aucun appel (pas de télépathie)', () => {
  const comm = new LocalCommunication();
  const loin = new ScrumMind({ team: 'A', numero: 8 });
  const m = melee({ etat: 'MELEE_SORTIE', vainqueur: 'A', qualite: 'DOMINANT' });
  comm.emit({ speakerId: 'A9', team: 'A', kind: 'SCRUM_8_BREAK', x: 48, y: 36, time: 100, phaseId: 'M7' });
  const entendus = comm.hear({ listenerId: 'A8', team: 'A', x: 90, y: 5, time: 100.5 });
  assert.strictEqual(entendus.length, 0);
  assert.strictEqual(loin.demandeMoteur(), null);
});

// Moteur : le départ du 8 n'a lieu que sur demande annoncée ; le dialogue tourne en vrai match.
test('moteur : sans demande du 8, le 9 ramasse toujours ; un départ n\'est jamais tiré au sort en GOAP', () => {
  const m = new MatchEngine(2, 4800, { aiMode: 'GOAP', agentDriver: () => ({ avantTick() {} }) });
  const sorties = {};
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => { if (/^MELEE_(PICK_AND_GO|PASSE_HUIT|BALLON_SORTI)$/.test(t)) sorties[t] = (sorties[t] || 0) + 1; return log(t, eq, msg, d); };
  for (let t = 0; t < 2400; t += 0.1) m.tick(0.1);
  assert.ok((sorties.MELEE_BALLON_SORTI || 0) >= 4, JSON.stringify(sorties));
  assert.strictEqual((sorties.MELEE_PICK_AND_GO || 0) + (sorties.MELEE_PASSE_HUIT || 0), 0, JSON.stringify(sorties));
});

test('moteur : une demande du 8 est exécutée à la sortie (départ ou passe) ; celle d\'un autre joueur est ignorée', () => {
  let demandeur = 8;
  const m = new MatchEngine(2, 4800, { aiMode: 'GOAP', agentDriver: () => ({
    avantTick(e) { const me = e.melee; if (me && me.etat === 'MELEE_SORTIE' && me.vainqueur) { e.setAgentIntent(me.vainqueur, demandeur, { melee: 'GO' }); } } }) });
  const sorties = {};
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => { if (/^MELEE_(PICK_AND_GO|PASSE_HUIT|BALLON_SORTI)$/.test(t)) sorties[t] = (sorties[t] || 0) + 1; return log(t, eq, msg, d); };
  for (let t = 0; t < 2400; t += 0.1) m.tick(0.1);
  assert.ok((sorties.MELEE_PICK_AND_GO || 0) >= 3, 'départs du 8 : ' + JSON.stringify(sorties));
  demandeur = 6;
  const m2 = new MatchEngine(2, 4800, { aiMode: 'GOAP', agentDriver: () => ({
    avantTick(e) { const me = e.melee; if (me && me.etat === 'MELEE_SORTIE' && me.vainqueur) e.setAgentIntent(me.vainqueur, demandeur, { melee: 'GO' }); } }) });
  const s2 = {};
  const l2 = m2.log.bind(m2);
  m2.log = (t, eq, msg, d) => { if (t === 'MELEE_PICK_AND_GO') s2[t] = (s2[t] || 0) + 1; return l2(t, eq, msg, d); };
  for (let t = 0; t < 2400; t += 0.1) m2.tick(0.1);
  assert.strictEqual(s2.MELEE_PICK_AND_GO || 0, 0, 'un autre joueur ne peut pas déclencher le départ du 8');
});

test('LEGACY : le départ du 8 reste tiré par le moteur et la demande est refusée', () => {
  const a = new MatchEngine(8, 4800);
  assert.strictEqual(a.setAgentIntent('A', 8, { melee: 'GO' }), false);
  const sorties = {};
  const log = a.log.bind(a);
  a.log = (t, eq, msg, d) => { if (t === 'MELEE_PICK_AND_GO' || t === 'MELEE_PASSE_HUIT') sorties[t] = (sorties[t] || 0) + 1; return log(t, eq, msg, d); };
  for (let t = 0; t < 4800; t += 0.1) a.tick(0.1);
  assert.ok((sorties.MELEE_PICK_AND_GO || 0) + (sorties.MELEE_PASSE_HUIT || 0) >= 1, JSON.stringify(sorties));
});

test('match GOAP réel : tout départ du 8 suit une annonce « Neuf, j\'y vais ! » du même 8 dans la même mêlée', () => {
  const m = new MatchEngine(1, 4800, configGOAP());
  const departs = [];
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => { if (t === 'MELEE_PICK_AND_GO' || t === 'MELEE_PASSE_HUIT') departs.push({ eq, t: m.tempsMatch, id: m._seqMelee }); return log(t, eq, msg, d); };
  m.jouerJusquAuSifflet(0.1);
  const annonces = m._pilote.agents.flatMap((a) => a.events.filter((e) => e.type === 'SCRUM_8_GOING_SAID').map((e) => ({ agent: a.id, t: e.t })));
  const cmpt = (n) => m._pilote.agents.reduce((s, a) => s + a.events.filter((e) => e.type === n).length, 0);
  assert.ok(departs.length >= 1 && annonces.length >= departs.length, `${annonces.length} annonces pour ${departs.length} départs`);
  for (const d of departs) assert.ok(annonces.some((a) => a.agent === d.eq + '8' && a.t <= d.t + 1e-9 && d.t - a.t <= 6), 'départ sans annonce préalable à ' + d.t);
  assert.ok(cmpt('SCRUM_ASKED') >= 2 * cmpt('SCRUM_CALLED') - 4, 'le 9 interroge avant de décider');
  assert.strictEqual(m._pilote.agents.reduce((s, a) => s + (a.errors || 0), 0), 0);
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
