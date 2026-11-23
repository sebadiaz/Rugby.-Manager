// RM4-G45 — personnalité des agents : fonctions pures, trait neutre = aucun effet (PERS-01), déterminisme (PERS-08),
// lecture par l'agent de SES propres traits, garde statique « rien n'est scripté » (PERS-11, partie lecture).
// Spécification : docs/SIMULATION_V4/16_PERSONNALITE_DES_AGENTS.md. G45 : lecture et fonctions pures ; G46 : choix du porteur (open-play.js).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../engine/rugby-engine.js');
const { MatchEngine } = E;
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const P = require('../engine/ai/personality.js');
const { lirePorteur } = require('../engine/ai/open-play.js');
const { deriveSituation } = require('../engine/ai/goals.js');
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

// --- RM4-G46 : le porteur décide selon SA personnalité (altruisme, égoïsme, prise de risque) -----------------------------------
// Situations générées de façon déterministe (générateur congruentiel, aucune source d'aléa cachée) : un porteur, quatre partenaires,
// cinq défenseurs, à des positions variées. Seules changent les valeurs de trait du porteur.
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const fiche = (n, x, y, vx = 0) => ({ numero: n, lastSeen: { x, y }, age: 0.1, confidence: 1, vx, vy: 0, available: true });
const GESTES = { chistera: 2, passeAuPied: 2, petitPied: 2, passeLongue: 2 };
function situationAleatoire(rng, car, gestes) {
  const x = 35 + rng() * 35, y = 12 + rng() * 46, numero = [9, 10, 12, 13, 15][Math.floor(rng() * 5)];
  const mates = {}, opps = {};
  [1, 2, 3, 4].forEach((k) => { mates['A' + (k + 8)] = fiche(k + 8, x - 1.5 - rng() * 8, y + (rng() < 0.5 ? -1 : 1) * (3 + rng() * 13), rng() * 3); });
  [[2.2 + rng() * 7, (rng() - 0.5) * 3], [4 + rng() * 5, (rng() - 0.5) * 18], [5 + rng() * 6, (rng() - 0.5) * 26], [6 + rng() * 8, (rng() - 0.5) * 30], [10 + rng() * 10, (rng() - 0.5) * 20]]
    .forEach((d, i) => { opps['B' + (i + 1)] = fiche(i + 1, Math.min(99, x + d[0]), Math.max(2, Math.min(68, y + d[1])), -rng() * 4); });
  return { t: 900, agent: { team: 'A', numero }, phase: 'PORTE', possession: 'A', score: { A: 0, B: 0 }, heard: [],
    self: { x, y, sensAttaque: 1, vitesse: 70, jeuPied: 80, available: true, grounded: false, car, gestes },
    ball: { lastSeen: { x, y }, age: 0.1, state: 'HELD', owner: 'A' + numero }, teammates: mates, opponents: opps, ruck: null };
}
function decisions(car, N = 600, gestes = GESTES) {
  const rng = lcg(12345), out = [];
  for (let i = 0; i < N; i++) {
    const b = situationAleatoire(rng, car, gestes);
    const d = lirePorteur(b, deriveSituation(b), { distribute: 0.6 }, {});
    out.push(!d ? 'AUTRE' : d.chistera ? 'CHISTERA' : d.action === 'PASS' ? 'PASSE' : d.action === 'KICK' ? 'PIED' : 'AUTRE');
  }
  return out;
}
const nPasses = (d) => d.filter((x) => x === 'PASSE' || x === 'CHISTERA').length;

test('PERS-01 (décisions) : tous traits à 50 = mêmes décisions que sans trait, sur 600 situations', () => {
  const neutres = Object.fromEntries(P.TRAITS.map((k) => [k, 50]));
  assert.deepStrictEqual(decisions(neutres), decisions({}));
  assert.deepStrictEqual(decisions({ altruisme: 50, egoisme: 50, priseDeRisque: 50 }), decisions(undefined));
});

test('PERS-02 : plus d\'altruisme, plus de passes ; plus d\'égoïsme, moins de passes (mêmes 600 situations, mêmes compétences)', () => {
  const a = [10, 50, 90].map((v) => nPasses(decisions({ altruisme: v })));
  const e = [10, 50, 90].map((v) => nPasses(decisions({ egoisme: v })));
  assert.ok(a[0] < a[1] && a[1] < a[2], `altruisme 10/50/90 : ${a}`);
  assert.ok(e[0] > e[1] && e[1] > e[2], `égoïsme 10/50/90 : ${e}`);
  assert.ok(a[2] - a[0] >= 30, `écart trop faible : ${a}`);
  // Un joueur à la fois très altruiste et peu égoïste passe nettement plus que son contraire.
  const pour = nPasses(decisions({ altruisme: 90, egoisme: 10 })), contre = nPasses(decisions({ altruisme: 10, egoisme: 90 }));
  assert.ok(pour > contre + 100, `${pour} contre ${contre}`);
});

test('PERS-02 (pas de script) : même numéro, mêmes compétences, même situation : des personnalités différentes choisissent parfois autrement', () => {
  const x = decisions({ altruisme: 10, egoisme: 90 }), y = decisions({ altruisme: 90, egoisme: 10 });
  const different = x.filter((v, i) => v !== y[i]).length;
  assert.ok(different >= 50, `${different} situations sur 600 où les deux joueurs choisissent autrement`);
  assert.ok(different < 600, 'et la plupart du temps ils choisissent pareil : on ne bascule pas le jeu');
});

test('PERS-03 : plus de goût du risque, la chistera est tentée dans un espace plus étroit ; un geste NON maîtrisé reste hors des options', () => {
  const b = (L, car, gestes = { chistera: 2, passeAuPied: 0, petitPied: 0, passeLongue: 2 }) => ({
    t: 900, agent: { team: 'A', numero: 12 }, phase: 'PORTE', possession: 'A', score: { A: 0, B: 0 }, heard: [],
    self: { x: 60, y: 35, sensAttaque: 1, vitesse: 70, jeuPied: 60, available: true, grounded: false, car, gestes },
    ball: { lastSeen: { x: 60, y: 35 }, age: 0.1, state: 'HELD', owner: 'A12' }, teammates: { A11: fiche(11, 58.5, 40) },
    opponents: { B1: fiche(1, 63, 33), B7: fiche(7, 58.4, 40 + L), B8: fiche(8, 75, 20), B9: fiche(9, 75, 50) }, ruck: null });
  const ensemble = (v, gestes) => { const r = []; for (let L = 1; L <= 5.01; L += 0.25) { const bb = b(L, { priseDeRisque: v }, gestes); const d = lirePorteur(bb, deriveSituation(bb), { distribute: 0.6 }, {}); if (d && d.chistera) r.push(L); } return r; };
  const [prudent, neutre, audacieux] = [10, 50, 90].map((v) => ensemble(v));
  assert.ok(prudent.length < neutre.length && neutre.length < audacieux.length, `${prudent.length}/${neutre.length}/${audacieux.length} espaces acceptés`);
  assert.ok(Math.min(...audacieux) < Math.min(...neutre) && Math.min(...neutre) < Math.min(...prudent), 'marge d\'espace exigée décroissante avec le risque');
  assert.ok(prudent.every((l) => neutre.includes(l)) && neutre.every((l) => audacieux.includes(l)), 'inclusion : qui tente prudent tente aussi audacieux');
  assert.deepStrictEqual(ensemble(100, { chistera: 0, passeAuPied: 0, petitPied: 0, passeLongue: 2 }), [], 'jamais de chistera sans maîtriser le geste, même à risque 100');
  assert.deepStrictEqual(ensemble(0, { chistera: 0, passeAuPied: 0, petitPied: 0, passeLongue: 2 }), []);
});

// --- RM4-G47 : sang-froid — le jugement du porteur se brouille sous pression quand le trait est BAS ---------------------------------
function decisionsBruitees(car, graine, N = 600) {
  const rng = lcg(12345), out = [];
  for (let i = 0; i < N; i++) {
    const b = situationAleatoire(rng, car, GESTES);
    const d = lirePorteur(b, deriveSituation(b), { distribute: 0.6, graine }, {});
    const pression = Object.values(b.opponents).reduce((m, o) => Math.min(m, Math.hypot(o.lastSeen.x - b.self.x, o.lastSeen.y - b.self.y)), Infinity);
    out.push({ choix: !d ? 'AUTRE' : d.chistera ? 'CHISTERA' : d.action === 'PASS' ? 'PASSE:' + d.vers : d.action === 'KICK' ? 'PIED' : 'AUTRE', pression });
  }
  return out;
}
const ecartAuNeutre = (car, graine, filtre = () => true) => {
  const ref = decisionsBruitees({}, graine), x = decisionsBruitees(car, graine);
  let n = 0, diff = 0;
  ref.forEach((r, i) => { if (!filtre(r)) return; n++; if (r.choix !== x[i].choix) diff++; });
  return { n, diff, taux: diff / Math.max(1, n) };
};

test('PERS-04 : le sang-froid au neutre ou au-dessus ne change aucune décision ; plus il est bas, plus le jugement s\'écarte', () => {
  for (const v of [50, 70, 100]) assert.strictEqual(ecartAuNeutre({ sangFroid: v }, 5).diff, 0, 'sang-froid ' + v);
  const t = [40, 25, 10, 0].map((v) => ecartAuNeutre({ sangFroid: v }, 5).taux);
  assert.ok(t[0] < t[1] && t[1] < t[2] && t[2] <= t[3] + 1e-9, 'écart croissant quand le sang-froid baisse : ' + t.map((x) => x.toFixed(3)));
  assert.ok(t[2] >= 0.05, 'l\'effet doit exister : ' + t[2].toFixed(3));
  assert.ok(t[3] < 0.6, 'sans basculer le jeu : ' + t[3].toFixed(3));
});

test('PERS-04 (pression) : le brouillage est plus fort quand le défenseur est proche que lorsqu\'il est loin', () => {
  const proche = ecartAuNeutre({ sangFroid: 5 }, 5, (r) => r.pression < 4.5), loin = ecartAuNeutre({ sangFroid: 5 }, 5, (r) => r.pression >= 7);
  assert.ok(proche.n >= 60 && loin.n >= 60, `échantillons ${proche.n}/${loin.n}`);
  assert.ok(proche.taux > loin.taux, `proche ${proche.taux.toFixed(3)} contre loin ${loin.taux.toFixed(3)}`);
});

test('PERS-08 (décisions) : même graine, mêmes décisions ; une autre graine brouille autrement ; le bruit ne dépend pas du numéro de poste', () => {
  const a = decisionsBruitees({ sangFroid: 5 }, 5).map((d) => d.choix), b = decisionsBruitees({ sangFroid: 5 }, 5).map((d) => d.choix), c = decisionsBruitees({ sangFroid: 5 }, 6).map((d) => d.choix);
  assert.deepStrictEqual(a, b);
  assert.ok(a.some((v, i) => v !== c[i]), 'deux graines identiques : le bruit ignore la graine');
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (ko) { console.error(`ECHEC : ${ko} test(s) en échec.`); process.exit(1); }
console.log('OK : personnalité des agents (neutre = aucun effet, déterminisme, G46 : altruisme, égoïsme, prise de risque du porteur).');
