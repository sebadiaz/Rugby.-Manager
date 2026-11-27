// Choix de pénalité par le CAPITAINE (GOAP) : il lit la situation, demande touche / poteaux / jeu rapide ;
// le moteur exécute avec ses lois. Sans demande dans le délai, choix du moteur (journalisé).
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { choixPenalite } = require('../engine/ai/penalty-choice.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

// Capitaine A (attaque vers x = 100). `opps` : { id: [x, y] } adversaires perçus.
function croyances({ t = 1000, score = { A: 0, B: 0 }, opps = {} } = {}) {
  return { t, agent: { team: 'A', numero: 10 }, score, self: { x: 50, y: 35, sensAttaque: 1 }, teammates: {},
    opponents: Object.fromEntries(Object.entries(opps).map(([id, [x, y]]) => [id, { lastSeen: { x, y }, age: 0.3, confidence: 1 }])) };
}
// Défense organisée : une ligne de 8 joueurs 10 m devant la marque.
const ligne = (x) => Object.fromEntries([...Array(8)].map((_, i) => ['B' + (i + 2), [x + 10, 8 + i * 7]]));
const pb = { porteeButeur: 46, gainTouche: 38, maulTouche: 0.45 };

test('poteaux face aux perches à 20 m ; touche dans son camp (hors de portée) ; jamais de tir à plus de 45 m', () => {
  assert.strictEqual(choixPenalite(croyances({ opps: ligne(80) }), { x: 80, y: 35 }, pb).choix, 'POTEAUX');
  const loin = choixPenalite(croyances({ opps: ligne(35) }), { x: 35, y: 30 }, pb);
  assert.strictEqual(loin.choix, 'TOUCHE');
  assert.strictEqual(loin.utilites.POTEAUX, 0);
});

test('le score et la minute changent la décision : mené de 7 en fin de match, le capitaine renonce aux 3 points', () => {
  const pen = { x: 68, y: 35 };
  const debut = choixPenalite(croyances({ opps: ligne(68) }), pen, pb);
  const mene = choixPenalite(croyances({ t: 4400, score: { A: 10, B: 17 }, opps: ligne(68) }), pen, pb);
  assert.strictEqual(debut.choix, 'POTEAUX');
  assert.strictEqual(mene.choix, 'TOUCHE');
});

test('jeu rapide seulement si la défense perçue devant la marque est clairsemée', () => {
  const pen = { x: 75, y: 30 };
  assert.notStrictEqual(choixPenalite(croyances({ opps: ligne(75) }), pen, pb).choix, 'RAPIDE');
  // Aucun défenseur perçu devant la marque à moins de 15 m (deux derrière, un à 28 m) ; tir hors de portée du buteur.
  const desorganisee = { B4: [80, 10], B7: [55, 40], B9: [50, 20] };
  const r = choixPenalite(croyances({ opps: desorganisee }), { x: 60, y: 30 }, Object.assign({}, pb, { porteeButeur: 30 }));
  assert.strictEqual(r.choix, 'RAPIDE', JSON.stringify(r.utilites));
});

test('la consigne du club est lue : « touche » ou « points » à portée', () => {
  const pen = { x: 80, y: 35 };
  assert.strictEqual(choixPenalite(croyances({ opps: ligne(80) }), pen, Object.assign({}, pb, { choixPenalites: 'touche' })).choix, 'TOUCHE');
  assert.strictEqual(choixPenalite(croyances({ opps: ligne(60) }), { x: 60, y: 35 }, Object.assign({}, pb, { choixPenalites: 'points' })).choix, 'POTEAUX');
});

// Moteur GOAP piloté à la main : seul le test pose (ou non) la demande du capitaine.
function matchPilote(graine, duree, demande) {
  const c = { sifflees: 0, capitaine: 0, defaut: 0, tirs: 0, touches: 0, rapides: 0, choix: [], horsCapitaine: 0 };
  // Pilote factice : il ne déplace aucun joueur. Les ballons au sol gardent donc la désignation du moteur (sinon personne
  // n'irait les ramasser, faute d'agents) ; ce test ne porte que sur le choix de pénalité.
  const m = new MatchEngine(graine, 4800, { aiMode: 'GOAP', ballonsAuSol: 'MOTEUR', agentDriver: () => ({
    avantTick(e) {
      const P = e.penaliteChoix;
      if (!P || !demande) return;
      // Un autre joueur que le capitaine demande : ignoré par le moteur.
      const autre = P.capitaine === 9 ? 8 : 9;
      e.setAgentIntent(P.equipe, autre, { penalite: 'RAPIDE' });
      e.setAgentIntent(P.equipe, P.capitaine, { penalite: demande });
    },
  }) });
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => {
    if (t === 'PENALITE_SIFFLEE') c.sifflees++;
    if (t === 'PENALITE_CHOIX_CAPITAINE') { c.capitaine++; c.choix.push(d.choix); }
    if (t === 'PENALITE_CHOIX_DEFAUT') c.defaut++;
    if (t === 'PENALITE' && /au but/.test(msg)) c.tirs++;
    if (t === 'PENALITE' && /rapidement/.test(msg)) c.rapides++;
    if (t === 'PENALITE_TOUCHE_FRAPPE') c.touches++;
    return log(t, eq, msg, d);
  };
  for (let t = 0; t < duree; t += 0.1) m.tick(0.1);
  return c;
}

test('moteur : la demande du capitaine est exécutée (touche) ; celle d\'un autre joueur est ignorée', () => {
  const c = matchPilote(3, 1500, 'TOUCHE');
  assert.ok(c.sifflees >= 3, 'pénalités : ' + c.sifflees);
  assert.strictEqual(c.defaut, 0);
  assert.ok(c.capitaine >= c.sifflees - 1, `${c.capitaine} choix pour ${c.sifflees} pénalités`); // la dernière peut être en attente
  assert.ok(c.choix.every((x) => x === 'TOUCHE'));
  assert.strictEqual(c.rapides, 0, 'la demande RAPIDE du non-capitaine n\'a aucun effet');
  assert.ok(c.touches >= c.capitaine - 1, `${c.touches} coups de pied en touche pour ${c.capitaine} choix`);
});

test('moteur : sans demande du capitaine, choix par défaut après le délai (journalisé), jamais de blocage', () => {
  const c = matchPilote(3, 1500, null);
  assert.ok(c.sifflees >= 3);
  assert.strictEqual(c.capitaine, 0);
  assert.ok(c.defaut >= c.sifflees - 1, `${c.defaut} défauts pour ${c.sifflees} pénalités`);
});

test('moteur : POTEAUX hors de portée (> 45 m) n\'est pas exécuté : choix par défaut', () => {
  const c = matchPilote(3, 1500, 'POTEAUX');
  assert.ok(c.capitaine + c.defaut >= c.sifflees - 1);
  assert.ok(c.tirs >= c.capitaine - 1);
});

test('LEGACY : le choix du moteur est inchangé (pas d\'attente, demande refusée)', () => {
  const a = new MatchEngine(8, 4800);
  assert.strictEqual(a.setAgentIntent('A', 10, { penalite: 'TOUCHE' }), false);
  let attente = 0;
  const log = a.log.bind(a);
  a.log = (t, ...r) => { if (t === 'PENALITE_SIFFLEE') attente++; return log(t, ...r); };
  for (let i = 0; i < 6000; i++) a.tick(0.1);
  assert.strictEqual(attente, 0);
  assert.strictEqual(a.penaliteChoix, null);
});

test('match GOAP réel : chaque pénalité est décidée par le capitaine présent, sans erreur', () => {
  const m = new MatchEngine(2, 4800, configGOAP());
  const choix = [], defaut = [];
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => {
    if (t === 'PENALITE_CHOIX_CAPITAINE') choix.push({ eq, d, brassard: m._brassard[eq] });
    if (t === 'PENALITE_CHOIX_DEFAUT') defaut.push(d);
    return log(t, eq, msg, d);
  };
  for (let t = 0; t < 2400; t += 0.1) m.tick(0.1);
  assert.ok(choix.length >= 3, 'choix : ' + choix.length);
  assert.ok(defaut.length * 5 <= choix.length, `${defaut.length} défauts pour ${choix.length} choix`);
  assert.ok(choix.every((c) => c.d.capitaine === c.brassard), 'seul le capitaine décide');
  const ev = m._pilote.agents.flatMap((a) => a.events.filter((e) => e.type === 'PENALTY_CHOSEN'));
  assert.ok(ev.length >= choix.length && ev.every((e) => e.utilites && e.choix));
  assert.strictEqual(m._pilote.agents.reduce((s, a) => s + (a.errors || 0), 0), 0);
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
