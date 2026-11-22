// RM4-G45 — personnalité des agents : fonctions pures, trait neutre = aucun effet (PERS-01), déterminisme (PERS-08),
// lecture par l'agent de SES propres traits, garde statique « rien n'est scripté » (PERS-11, partie lecture).
// Spécification : docs/SIMULATION_V4/16_PERSONNALITE_DES_AGENTS.md. AUCUN comportement n'est encore raccordé.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../engine/rugby-engine.js');
const { MatchEngine } = E;
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const P = require('../engine/ai/personality.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); } }

test('la liste des traits du moteur et celle des agents sont identiques (14 traits, sans doublon)', () => {
  assert.deepStrictEqual([...P.TRAITS], [...E.TRAITS_PERSONNALITE]);
  assert.strictEqual(new Set(P.TRAITS).size, P.TRAITS.length);
});

test('PERS-01 (fonctions) : trait neutre ou absent = aucun effet (décalage 0, multiplicateur 1, poids inchangé, bruit 0)', () => {
  for (const v of [50, undefined, null, NaN, 'x', Infinity]) {
    assert.strictEqual(P.decalage(v, 2.5), 0, 'décalage ' + v);
    assert.strictEqual(P.multiplicateur(v, 0.3), 1, 'multiplicateur ' + v);
    assert.strictEqual(P.ponderer(0.6, v, 0.3), 0.6, 'poids ' + v);
    assert.strictEqual(P.amplitudeBruit(v), 0, 'amplitude ' + v);
    assert.strictEqual(P.bruit(7, 'A9', 12.3, P.amplitudeBruit(v)), 0, 'bruit ' + v);
  }
  const t = P.lireTraits(null), t2 = P.lireTraits({ lectureJeu: 80 });
  for (const k of P.TRAITS) { assert.strictEqual(t[k], 50); assert.strictEqual(t2[k], 50); }
  assert.ok(Object.isFrozen(t));
});

test('décalage et multiplicateur : monotones, bornés, symétriques autour de 50', () => {
  let prec = -Infinity;
  for (let v = 0; v <= 100; v += 10) { const d = P.decalage(v, 2); assert.ok(d >= prec); prec = d; }
  assert.strictEqual(P.decalage(100, 2), 2); assert.strictEqual(P.decalage(0, 2), -2);
  assert.strictEqual(P.decalage(100, 99), P.K_MAX, 'k borné');
  assert.ok(Math.abs(P.decalage(75, 2) + P.decalage(25, 2)) < 1e-12);
  assert.ok(P.multiplicateur(100, 5) <= 1 + P.C_MAX + 1e-12 && P.multiplicateur(0, 5) >= 1 - P.C_MAX - 1e-12);
  assert.ok(P.ponderer(1, 100, 0.35) <= P.POIDS_MAX && P.ponderer(0.05, 0, 0.35) >= P.POIDS_MIN);
  assert.ok(P.ponderer(0.5, 80, 0.3) > 0.5 && P.ponderer(0.5, 20, 0.3) < 0.5);
});

test('bruit de jugement : nul au-dessus du neutre, croissant quand le trait baisse, calme du moment le réduit', () => {
  assert.strictEqual(P.amplitudeBruit(80), 0);
  assert.ok(P.amplitudeBruit(30) > 0 && P.amplitudeBruit(10) > P.amplitudeBruit(30));
  assert.ok(P.amplitudeBruit(10, 1) < P.amplitudeBruit(10, 0), 'plus calme, moins de bruit');
  assert.ok(P.amplitudeBruit(0, 0) <= P.AMPLITUDE_BRUIT_MAX + 1e-12);
});

test('PERS-08 : le bruit est déterministe (graine, agent, instant), borné, sans aléa caché', () => {
  const a = P.amplitudeBruit(20);
  assert.strictEqual(P.bruit(5, 'A9', 100, a), P.bruit(5, 'A9', 100, a));
  const valeurs = new Set();
  for (let i = 0; i < 200; i++) { const b = P.bruit(5, 'A9', i * 0.2, a); assert.ok(Math.abs(b) <= a + 1e-12); valeurs.add(b.toFixed(6)); }
  assert.ok(valeurs.size > 150, 'le bruit varie dans le temps');
  assert.notStrictEqual(P.bruit(5, 'A9', 100, a), P.bruit(5, 'B9', 100, a));
  assert.notStrictEqual(P.bruit(5, 'A9', 100, a), P.bruit(6, 'A9', 100, a));
  const moyenne = [...Array(2000).keys()].reduce((s, i) => s + P.bruit(1, 'A1', i * 0.2, 1), 0) / 2000;
  assert.ok(Math.abs(moyenne) < 0.06, 'bruit centré : ' + moyenne.toFixed(3));
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/personality.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src), 'source d\'aléa');
});

test('PERS-11 (lecture) : le module ne connaît ni numéro de poste, ni table par poste, ni étiquette', () => {
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/personality.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/numero|switch\s*\(|PROFILS|audacieux|prudent|meneur|tete.?brulee/i.test(src), 'script déguisé');
});

test('le moteur ne crée un trait que s\'il est fourni explicitement ; la valeur est bornée ; aucun trait dérivé du poste', () => {
  const m = new MatchEngine(1, 4800, { joueursA: { 10: { caracteristiques: { priseDeRisque: 85, sangFroid: 250, altruisme: -4 } } } });
  const a = (n) => m.equipeA.find((j) => j.numero === n);
  assert.strictEqual(a(10).car.priseDeRisque, 85);
  assert.strictEqual(a(10).car.sangFroid, 100, 'borné à 100');
  assert.strictEqual(a(10).car.altruisme, 0, 'borné à 0');
  assert.strictEqual('egoisme' in a(10).car, false, 'non fourni : absent (donc neutre pour l\'agent)');
  for (const j of m.equipeA.concat(m.equipeB)) if (j !== a(10)) for (const k of P.TRAITS) assert.strictEqual(k in j.car, false, `${j.team}${j.numero}.${k} ne doit pas exister`);
});

test('l\'agent lit SES propres traits dans ses croyances ; les autres joueurs restent neutres', () => {
  const m = new MatchEngine(1, 4800, { joueursA: { 9: { caracteristiques: { altruisme: 90, agressivite: 20 } } } });
  const e = JSON.parse(JSON.stringify(m.getAgentState ? m.getAgentState() : m.getState()));
  const b9 = new AgentContext({ team: 'A', numero: 9 }, { reactionDelay: 0 }).update(e);
  const t9 = P.lireTraits(b9.self.car);
  assert.strictEqual(t9.altruisme, 90); assert.strictEqual(t9.agressivite, 20); assert.strictEqual(t9.priseDeRisque, 50);
  const b10 = new AgentContext({ team: 'A', numero: 10 }, { reactionDelay: 0 }).update(e);
  for (const k of P.TRAITS) assert.strictEqual(P.lireTraits(b10.self.car)[k], 50);
  // Aucun accès aux traits d'un coéquipier ou d'un adversaire par les croyances.
  assert.ok(Object.values(b9.teammates).concat(Object.values(b9.opponents)).every((f) => !('car' in f)));
});

test('PERS-01 (matchs) : des traits explicitement NEUTRES (50) rejouent exactement le même match que la même configuration sans trait', () => {
  // Le témoin porte la MÊME configuration de joueurs (une configuration `joueursA` change déjà d'autres comportements du
  // moteur) : seule la présence des 14 traits à 50 diffère.
  const neutres = Object.fromEntries(P.TRAITS.map((k) => [k, 50]));
  const cfg = (car) => Object.fromEntries([...Array(15).keys()].map((i) => [i + 1, { caracteristiques: car }]));
  const sig = (m) => JSON.stringify([m.score, m.stats, [...m.equipeA, ...m.equipeB].map((j) => [+j.x.toFixed(3), +j.y.toFixed(3)])]);
  for (const seed of [1, 2, 3]) {
    const a = new MatchEngine(seed, 4800, { joueursA: cfg({}), joueursB: cfg({}) }); a.jouerJusquAuSifflet(0.1);
    const b = new MatchEngine(seed, 4800, { joueursA: cfg(neutres), joueursB: cfg(neutres) }); b.jouerJusquAuSifflet(0.1);
    assert.strictEqual(sig(a), sig(b), 'LEGACY graine ' + seed);
  }
  const g1 = new MatchEngine(3, 4800, configGOAP({ joueursA: cfg({}), joueursB: cfg({}) }));
  const g2 = new MatchEngine(3, 4800, configGOAP({ joueursA: cfg(neutres), joueursB: cfg(neutres) }));
  for (let i = 0; i < 3000; i++) { g1.tick(0.1); g2.tick(0.1); }
  assert.strictEqual(sig(g1), sig(g2), 'GOAP 300 s');
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (ko) { console.error(`ECHEC : ${ko} test(s) en échec.`); process.exit(1); }
console.log('OK : personnalité des agents (fonctions pures, neutre = aucun effet, déterminisme) ; aucun comportement raccordé.');
