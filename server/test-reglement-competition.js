// COUVERTURE — le règlement affiché doit être celui que le MOTEUR applique.
//
// Défaut mesuré : l'écran Compétitions → Règles affichait « Montées aucune /
// Descentes aucune » pour la Ligue Régionale du joueur, alors que
// `avancerSaison` promeut réellement les 2 premiers et relègue les 2 derniers
// (docs/js/club.js). L'interface lisait `promus: 0, relegues: 0`, écrit en
// dur dans club-competitions.js — une seconde source de vérité, fausse.
//
// Usage : node server/test-reglement-competition.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

let graine = 51000;
function carriere(niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Règlement');
  RMClub.daterCalendrier(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  return s;
}

test('R1 — la règle des places est exportée, une seule fois', () => {
  assert.strictEqual(typeof RMClub.placesPyramideFrance, 'function',
    'la règle doit exister comme fonction, pas être recopiée dans deux fichiers');
  // Palier 1 (sommet) : on ne monte plus, on peut descendre.
  assert.deepStrictEqual(RMClub.placesPyramideFrance(1), { promus: 0, relegues: 2 });
  // Palier intermédiaire : les deux.
  assert.deepStrictEqual(RMClub.placesPyramideFrance(2), { promus: 2, relegues: 2 });
  // Palier 3 (base) : on monte, on ne descend plus.
  assert.deepStrictEqual(RMClub.placesPyramideFrance(3), { promus: 2, relegues: 0 });
});

test('R2 — le règlement affiché correspond au palier RÉEL du club', () => {
  for (const niveau of [1, 2, 3]) {
    const s = carriere(niveau);
    const comp = RMClub.competition(s, 'joueur');
    const attendu = RMClub.placesPyramideFrance(niveau);
    assert.strictEqual(comp.promus, attendu.promus,
      `palier ${niveau} : montées annoncées ${comp.promus}, réelles ${attendu.promus}`);
    assert.strictEqual(comp.relegues, attendu.relegues,
      `palier ${niveau} : descentes annoncées ${comp.relegues}, réelles ${attendu.relegues}`);
  }
});

test('R3 — le moteur applique EXACTEMENT ce que le règlement annonce', () => {
  // Le seul test qui compte : on finit à la place annoncée comme promue, et
  // on vérifie que la saison suivante monte réellement d'un palier.
  const s = carriere(3);
  const places = RMClub.placesPyramideFrance(3);
  assert.ok(places.promus >= 1, 'le palier 3 doit promouvoir');
  const c = s.clubJoueur;
  // Termine 2e (dernière place promue annoncée).
  const ids = [c.id].concat((s.adversaires || []).map((a) => a.id));
  for (const id of ids) {
    s.classement[id].pts = id === c.id ? 90 : 100;   // un club devant, tous les autres derrière
  }
  s.classement[ids[1]].pts = 100;
  for (const id of ids.slice(2)) s.classement[id].pts = 10;
  const rang = RMClub.classementTrieDe(s.classement).findIndex((l) => l.clubId === c.id) + 1;
  assert.strictEqual(rang, places.promus, `le club doit être ${places.promus}e`);
  for (const f of s.calendrier) f.joue = true;
  const niveauAvant = c.palierPyramide.niveau;
  RMClub.avancerSaison(creerRng(7), s);
  assert.strictEqual(s.clubJoueur.palierPyramide.niveau, niveauAvant - 1,
    `finir ${rang}e doit faire monter, comme le règlement l'annonce`);
});

test('R4 — au sommet, le règlement n\'annonce aucune montée et le moteur n\'en fait aucune', () => {
  const s = carriere(1);
  const c = s.clubJoueur;
  assert.strictEqual(RMClub.competition(s, 'joueur').promus, 0,
    'aucune montée annoncée depuis le palier 1');
  for (const id of Object.keys(s.classement)) s.classement[id].pts = id === c.id ? 100 : 10;
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(9), s);
  assert.strictEqual(s.clubJoueur.palierPyramide.niveau, 1,
    'et le champion du palier 1 y reste');
});

test('R5 — Équipe B et espoirs n\'ont ni montée ni descente, et le disent', () => {
  const s = carriere(3);
  RMClub.assurerCompetitionB(s);
  RMClub.assurerCompetitionEspoirs(s);
  for (const ref of ['equipeB', 'espoirs']) {
    const comp = RMClub.competition(s, ref);
    if (!comp) continue;
    assert.strictEqual(comp.promus, 0, `${ref} : aucune montée`);
    assert.strictEqual(comp.relegues, 0, `${ref} : aucune descente`);
  }
});

test('R6 — la règle n\'est plus écrite en dur dans le fichier de navigation', () => {
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../docs/js/club-competitions.js', 'utf8');
  const bloc = src.slice(src.indexOf('if (ref === REF_JOUEUR)'));
  const fin = bloc.indexOf('if (ref === REF_EQUIPE_B)');
  const corps = bloc.slice(0, fin === -1 ? 400 : fin);
  assert.ok(corps.indexOf('placesPyramideFrance') !== -1,
    'le championnat du joueur doit demander ses places à la règle du moteur');
  assert.ok(!/promus:\s*0,\s*relegues:\s*0/.test(corps),
    'et ne plus annoncer zéro montée en dur');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
