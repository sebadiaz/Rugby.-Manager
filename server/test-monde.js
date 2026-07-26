// Tests de l'écosystème mondial de compétitions (docs/js/world.js), même
// esprit que server/test-parcours-club.js — assertions ciblées, pas un
// framework de test. Usage : node server/test-monde.js
'use strict';

const assert = require('assert');

global.window = global;
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();

global.window.RugbyEngine = require('../docs/rugby-engine.js');
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-personnel.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-objectif.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-analyse.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-prets.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-contrats.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/world.js'), 'utf8'))(global.window);
const RMClub = global.window.RMClub;
const RMWorld = global.window.RMWorld;

function creerRng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try {
    fn();
    console.log(`OK   ${nom}`);
  } catch (e) {
    console.error(`FAIL ${nom}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// --- 1) Génération du monde ---
let monde;
test('génération : 12 pays, toutes les divisions ont des clubs, calendrier et classement valides', () => {
  monde = RMWorld.genererMonde(creerRng(10));
  assert.strictEqual(monde.pays.length, 12);
  let totalClubs = 0;
  for (const id of Object.keys(monde.divisions)) {
    const div = monde.divisions[id];
    assert.ok(div.clubs.length > 0, `division ${id} sans club`);
    assert.strictEqual(div.clubs.length % 2, 0, `division ${id} a un nombre impair de clubs (round-robin cassé)`);
    assert.strictEqual(div.calendrier.length, div.clubs.length * (div.clubs.length - 1), `calendrier aller-retour incomplet pour ${id}`);
    assert.strictEqual(Object.keys(div.classement).length, div.clubs.length);
    totalClubs += div.clubs.length;
  }
  assert.ok(totalClubs > 300, `un monde de rugby professionnel doit compter largement plus de 300 clubs (${totalClubs})`);
});

test('génération : les compétitions partagées (Alliance Australe / Pacific Franchise Series) ont la bonne répartition par pays', () => {
  const alliance = monde.divisions.alliance;
  assert.strictEqual(alliance.clubs.length, 16, 'Alliance Australe : 4 IRL + 4 GAL + 2 ECO + 2 ITA + 4 RSA = 16');
  const parPays = {};
  for (const c of alliance.clubs) parPays[c.pays] = (parPays[c.pays] || 0) + 1;
  assert.deepStrictEqual(parPays, { IRL: 4, GAL: 4, ECO: 2, ITA: 2, RSA: 4 });
  const pacifique = monde.divisions.pacifique;
  assert.strictEqual(pacifique.clubs.length, 12);
  const parPaysPac = {};
  for (const c of pacifique.clubs) parPaysPac[c.pays] = (parPaysPac[c.pays] || 0) + 1;
  assert.deepStrictEqual(parPaysPac, { NZL: 6, AUS: 6 });
});

test('génération : aucun nom de club dupliqué dans tout le monde (crédibilité)', () => {
  const noms = [];
  for (const id of Object.keys(monde.divisions)) for (const c of monde.divisions[id].clubs) noms.push(c.nom);
  assert.strictEqual(new Set(noms).size, noms.length, 'deux clubs ne devraient jamais porter exactement le même nom');
});

test('génération : la France respecte exactement les tailles de division demandées (14/16/14)', () => {
  assert.strictEqual(monde.divisions['FRA-N1'].clubs.length, 14);
  assert.strictEqual(monde.divisions['FRA-N2'].clubs.length, 16);
  assert.strictEqual(monde.divisions['FRA-N3'].clubs.length, 14);
});

test('génération : l\'Angleterre respecte la taille de sa division 1 demandée (10 clubs)', () => {
  assert.strictEqual(monde.divisions['ANG-N1'].clubs.length, 10);
});

// --- 2) Avancer une journée du monde ---
test('avancerJourneeMonde : chaque appel joue une ronde réelle (résultats et classement mis à jour)', () => {
  const div = monde.divisions['FRA-N1'];
  const journeesAvant = div.calendrier.filter((f) => f.joue).length;
  const rng = creerRng(11);
  RMWorld.avancerJourneeMonde(rng, monde, null);
  const journeesApres = div.calendrier.filter((f) => f.joue).length;
  assert.ok(journeesApres > journeesAvant, 'au moins une rencontre doit être jouée après avancerJourneeMonde');
  const classementNonVide = RMClub.classementTrieDe(div.classement).some((r) => r.j > 0);
  assert.ok(classementNonVide, 'le classement doit refléter les matchs réellement joués');
});

test('avancerJourneeMonde : une division exclue (idDivisionAIgnorer) n\'avance pas', () => {
  const div = monde.divisions['ANG-N1'];
  const journeesAvant = div.calendrier.filter((f) => f.joue).length;
  RMWorld.avancerJourneeMonde(creerRng(12), monde, 'ANG-N1');
  const journeesApres = div.calendrier.filter((f) => f.joue).length;
  assert.strictEqual(journeesApres, journeesAvant, 'la division du club du joueur (exclue) ne doit jamais être avancée par le monde');
});

test('avancerJourneeMonde : une division déjà entièrement jouée ne plante pas (no-op)', () => {
  const div = monde.divisions['USA-N3'];
  const rng = creerRng(13);
  while (div.calendrier.some((f) => !f.joue)) RMWorld.avancerJourneeMonde(rng, monde, null);
  assert.doesNotThrow(() => RMWorld.avancerJourneeMonde(rng, monde, null));
});

// --- 3) Fin de saison du monde : promotion/relégation, qualifications ---
test('nouvelleSaisonMonde : promotion/relégation réelle en France, tailles de division préservées, aucun club dupliqué ni perdu', () => {
  const rng = creerRng(20);
  const mondeTest = RMWorld.genererMonde(rng);
  for (const id of Object.keys(mondeTest.divisions)) {
    const div = mondeTest.divisions[id];
    while (div.calendrier.some((f) => !f.joue)) RMWorld.avancerJourneeMonde(rng, mondeTest, null);
  }
  const idsAvant = { N1: mondeTest.divisions['FRA-N1'].clubs.map((c) => c.id), N2: mondeTest.divisions['FRA-N2'].clubs.map((c) => c.id), N3: mondeTest.divisions['FRA-N3'].clubs.map((c) => c.id) };
  const classementN1Avant = RMClub.classementTrieDe(mondeTest.divisions['FRA-N1'].classement);
  const descendusAttendus = classementN1Avant.slice(-2).map((r) => r.clubId);
  const res = RMWorld.nouvelleSaisonMonde(rng, mondeTest);
  assert.ok(res.mouvements.some((m) => m.pays === 'France'));
  assert.strictEqual(mondeTest.divisions['FRA-N1'].clubs.length, 14);
  assert.strictEqual(mondeTest.divisions['FRA-N2'].clubs.length, 16);
  assert.strictEqual(mondeTest.divisions['FRA-N3'].clubs.length, 14);
  const idsApresN1 = new Set(mondeTest.divisions['FRA-N1'].clubs.map((c) => c.id));
  const idsApresN2 = new Set(mondeTest.divisions['FRA-N2'].clubs.map((c) => c.id));
  for (const id of descendusAttendus) assert.ok(!idsApresN1.has(id) && idsApresN2.has(id), 'les 2 derniers de N1 doivent bien être descendus en N2');
  const tousIdsApres = new Set([...idsApresN1, ...mondeTest.divisions['FRA-N2'].clubs.map((c) => c.id), ...mondeTest.divisions['FRA-N3'].clubs.map((c) => c.id)]);
  assert.strictEqual(tousIdsApres.size, idsAvant.N1.length + idsAvant.N2.length + idsAvant.N3.length, 'aucun club ne doit disparaître ni se dupliquer lors de la promotion/relégation');
});

test('nouvelleSaisonMonde : les pays à franchises (Nouvelle-Zélande/Australie) gardent une composition fixe (pas de promotion/relégation en Pacific Franchise Series)', () => {
  const rng = creerRng(21);
  const mondeTest = RMWorld.genererMonde(rng);
  const idsAvant = mondeTest.divisions.pacifique.clubs.map((c) => c.id).sort();
  for (const id of Object.keys(mondeTest.divisions)) {
    const div = mondeTest.divisions[id];
    while (div.calendrier.some((f) => !f.joue)) RMWorld.avancerJourneeMonde(rng, mondeTest, null);
  }
  RMWorld.nouvelleSaisonMonde(rng, mondeTest);
  const idsApres = mondeTest.divisions.pacifique.clubs.map((c) => c.id).sort();
  assert.deepStrictEqual(idsApres, idsAvant, 'une compétition de franchises ne doit jamais changer de composition d\'une saison à l\'autre');
});

test('nouvelleSaisonMonde : qualifications continentales/challenge dérivées du classement réel de chaque N1 européen', () => {
  const rng = creerRng(22);
  const mondeTest = RMWorld.genererMonde(rng);
  for (const id of Object.keys(mondeTest.divisions)) {
    const div = mondeTest.divisions[id];
    while (div.calendrier.some((f) => !f.joue)) RMWorld.avancerJourneeMonde(rng, mondeTest, null);
  }
  const classementFraN1 = RMClub.classementTrieDe(mondeTest.divisions['FRA-N1'].classement);
  const top4Fra = classementFraN1.slice(0, 4).map((r) => r.clubId);
  RMWorld.nouvelleSaisonMonde(rng, mondeTest);
  const qualifiesContinentale = mondeTest.internationales.continentale.qualifies;
  assert.ok(Array.isArray(qualifiesContinentale) && qualifiesContinentale.length > 0);
  for (const id of top4Fra) assert.ok(qualifiesContinentale.includes(id), 'le top 4 français doit être qualifié pour la Coupe des Champions Continentale');
  const qualifiesChallenge = mondeTest.internationales.challenge.qualifies;
  assert.ok(Array.isArray(qualifiesChallenge));
  assert.ok(!qualifiesChallenge.some((id) => top4Fra.includes(id)), 'un club qualifié en Continentale ne doit pas aussi apparaître en Challenge');
});

test('qualifications européennes : une division PARTAGÉE par plusieurs pays éligibles (Alliance Australe) n\'est comptée qu\'une seule fois', () => {
  const rng = creerRng(24);
  const mondeTest = RMWorld.genererMonde(rng);
  for (const id of Object.keys(mondeTest.divisions)) {
    const div = mondeTest.divisions[id];
    while (div.calendrier.some((f) => !f.joue)) RMWorld.avancerJourneeMonde(rng, mondeTest, null);
  }
  RMWorld.resoudreQualificationsEuropeennes(mondeTest);
  const continentale = mondeTest.internationales.continentale.qualifies;
  const challenge = mondeTest.internationales.challenge.qualifies;
  assert.strictEqual(new Set(continentale).size, continentale.length,
    'un club qualifié via une compétition partagée entre plusieurs pays éligibles (Irlande/Galles/Écosse/Italie) ne doit apparaître qu\'une fois en Continentale');
  assert.strictEqual(new Set(challenge).size, challenge.length, 'idem pour la Challenge');
});

test('nouvelleSaisonMonde : le Tournoi des Couronnes se joue chaque saison, la Coupe Mondiale seulement tous les 4 ans', () => {
  const rng = creerRng(23);
  const mondeTest = RMWorld.genererMonde(rng);
  for (const id of Object.keys(mondeTest.divisions)) {
    const div = mondeTest.divisions[id];
    while (div.calendrier.some((f) => !f.joue)) RMWorld.avancerJourneeMonde(rng, mondeTest, null);
  }
  const res1 = RMWorld.nouvelleSaisonMonde(rng, mondeTest); // saison 1 -> 2
  assert.ok(res1.resultatsNations.some((r) => r.cle === 'couronnes'), 'le Tournoi des Couronnes doit se jouer dès la 1re transition de saison');
  assert.ok(!res1.resultatsNations.some((r) => r.cle === 'mondiale'), 'la Coupe Mondiale ne doit pas se jouer une saison qui n\'est pas multiple de 4');
  assert.ok(['FRA', 'ANG', 'IRL', 'GAL', 'ECO', 'ITA'].includes(mondeTest.internationales.couronnes.dernierVainqueur));
});

// --- 4) Rétrocompatibilité ---
test('assurerMonde : une sauvegarde sans champ "monde" le génère à la première consultation', () => {
  const saison = { clubJoueur: { id: 'x' }, adversaires: [] };
  let m;
  assert.doesNotThrow(() => { m = RMWorld.assurerMonde(creerRng(30), saison); });
  assert.ok(m && m.pays.length === 12);
  assert.strictEqual(saison.monde, m, 'le monde généré doit être persisté sur saison.monde');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un test du monde a échoué.');
} else {
  console.log('OK : l\'écosystème mondial de compétitions fonctionne de bout en bout.');
}
