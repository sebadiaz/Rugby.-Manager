// COUVERTURE — la pyramide vit toute seule : montées et descentes partout.
//
// Audit mesuré avant cette tranche, sur huit saisons réellement simulées
// dans les trois divisions françaises :
//
//   clubs ayant connu une montée ou une descente : 0
//
// Les clubs persistaient (G15) et se souvenaient de leurs saisons (G16),
// mais leur destin sportif ne dépendait QUE des mouvements du joueur : quand
// il montait, un seul club faisait le chemin inverse pour garder les tailles
// justes ; quand il restait, personne ne bougeait. Un club pouvait finir
// dernier de Ligue d'Excellence dix saisons de suite sans jamais descendre.
//
// La règle, elle, existait déjà et était même affichée au manager :
// `placesPyramideFrance` — deux montées et deux descentes par palier, sauf le
// sommet (aucune montée) et la base (aucune descente).
//
// Usage : node server/test-montees-descentes.js
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

let graine = 710000;
function carriere(niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Pyramide');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  RMClub.assurerAutresDivisionsFrance(creerRng(graine++), s);
  return s;
}
function niveauDe(s) { return (s.clubJoueur.palierPyramide || {}).niveau; }
function mondeFrancais(s) {
  const out = {};
  out[niveauDe(s)] = [s.clubJoueur].concat(s.adversaires || []);
  const autres = (s.autresDivisionsFrance || {}).divisions || {};
  for (const cle of Object.keys(autres)) out[cle] = (autres[cle].clubs || []).slice();
  return out;
}
function divisionDe(s, clubId) {
  const monde = mondeFrancais(s);
  for (const n of Object.keys(monde)) {
    if (monde[n].some((c) => c.id === clubId)) return Number(n);
  }
  return null;
}
// Fait jouer une saison COMPLÈTE aux deux autres divisions, comme le jeu le
// fait (une journée par journée réellement disputée par le manager).
function jouerLesAutresDivisions(s) {
  for (let j = 0; j < 30; j++) {
    RMClub.avancerJourneeAutresDivisionsFrance(creerRng(graine++), s.autresDivisionsFrance);
  }
}
// Classement final d'une autre division, du premier au dernier.
function classementDivision(s, niveau) {
  const d = ((s.autresDivisionsFrance || {}).divisions || {})[niveau];
  if (!d) return [];
  const trie = RMClub.classementTrieDe(d.classement || {});
  return trie.map((r) => (d.clubs || []).find((c) => c.id === r.clubId)).filter(Boolean);
}
function finir(s, position) {
  const c = s.clubJoueur;
  const rivaux = Object.keys(s.classement).filter((id) => id !== c.id);
  s.classement[c.id].pts = 50;
  rivaux.forEach((id, i) => { s.classement[id].pts = i < (position - 1) ? 90 : 10; });
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(graine++), s);
}

test('Q1 — PREUVE : des clubs changent de division sans que le joueur bouge', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const avant = mondeFrancais(s);
  const positions = {};
  for (const n of Object.keys(avant)) for (const c of avant[n]) positions[c.id] = Number(n);
  finir(s, 7); // milieu de tableau : le joueur ne bouge pas
  assert.strictEqual(niveauDe(s), 3, 'le joueur doit rester en Régionale');
  const apres = mondeFrancais(s);
  let bouges = 0;
  for (const n of Object.keys(apres)) {
    for (const c of apres[n]) if (positions[c.id] != null && positions[c.id] !== Number(n)) bouges++;
  }
  assert.ok(bouges > 0, `des clubs doivent avoir changé de division (${bouges})`);
});

test('Q2 — le nombre de mouvements suit la RÈGLE, pas un chiffre en dur', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const avant = mondeFrancais(s);
  const positions = {};
  for (const n of Object.keys(avant)) for (const c of avant[n]) positions[c.id] = Number(n);
  finir(s, 7);
  const apres = mondeFrancais(s);
  const montees = {}, descentes = {};
  for (const n of Object.keys(apres)) {
    for (const c of apres[n]) {
      const depart = positions[c.id];
      if (depart == null || depart === Number(n)) continue;
      if (Number(n) < depart) montees[depart] = (montees[depart] || 0) + 1;
      else descentes[depart] = (descentes[depart] || 0) + 1;
    }
  }
  for (const niveau of [1, 2, 3]) {
    const regle = RMClub.placesPyramideFrance(niveau);
    assert.strictEqual(montees[niveau] || 0, regle.promus,
      `division ${niveau} : ${montees[niveau] || 0} montée(s) au lieu de ${regle.promus}`);
    assert.strictEqual(descentes[niveau] || 0, regle.relegues,
      `division ${niveau} : ${descentes[niveau] || 0} descente(s) au lieu de ${regle.relegues}`);
  }
});

test('Q3 — les tailles de division restent exactes', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  finir(s, 7);
  const monde = mondeFrancais(s);
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `division ${niveau} : ${(monde[niveau] || []).length} clubs`);
  }
});

test('Q4 — ce sont les PREMIERS qui montent et les DERNIERS qui descendent', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const nationale = classementDivision(s, 2);
  assert.ok(nationale.length >= 10, 'la Ligue Nationale doit avoir un classement');
  const regle = RMClub.placesPyramideFrance(2);
  const promus = nationale.slice(0, regle.promus).map((c) => c.id);
  const relegues = nationale.slice(nationale.length - regle.relegues).map((c) => c.id);
  finir(s, 7);
  for (const id of promus) {
    assert.strictEqual(divisionDe(s, id), 1,
      `le club ${id}, premier de Nationale, doit monter en Excellence`);
  }
  for (const id of relegues) {
    assert.strictEqual(divisionDe(s, id), 3,
      `le club ${id}, dernier de Nationale, doit descendre en Régionale`);
  }
});

test('Q5 — le sommet ne promeut personne, la base ne relègue personne', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const excellence = classementDivision(s, 1);
  const premierExcellence = excellence[0] ? excellence[0].id : null;
  assert.ok(premierExcellence, 'la Ligue d\'Excellence doit avoir un classement');
  finir(s, 7);
  assert.strictEqual(divisionDe(s, premierExcellence), 1,
    'le champion de l\'élite reste dans l\'élite : il n\'y a rien au-dessus');
  // Et personne ne descend de Régionale : c'est le dernier échelon simulé.
  const monde = mondeFrancais(s);
  assert.strictEqual((monde[3] || []).length, RMClub.TAILLE_DIVISION_FRANCE[3],
    'la Régionale garde sa taille : personne n\'en sort par le bas');
});

test('Q6 — le club du joueur suit exactement la même règle', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const regle = RMClub.placesPyramideFrance(3);
  assert.ok(regle.promus > 0, 'la Régionale doit permettre de monter');
  finir(s, 1); // champion
  assert.strictEqual(niveauDe(s), 2, 'le champion de Régionale monte');
  assert.strictEqual(divisionDe(s, s.clubJoueur.id), 2, 'et il est bien dans sa nouvelle division');
  const monde = mondeFrancais(s);
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `division ${niveau} : ${(monde[niveau] || []).length} clubs`);
  }
});

test('Q7 — aucun club perdu, aucun doublon', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const avant = mondeFrancais(s);
  const idsAvant = new Set();
  for (const n of Object.keys(avant)) for (const c of avant[n]) idsAvant.add(c.id);
  finir(s, 7);
  const apres = mondeFrancais(s);
  const idsApres = [];
  for (const n of Object.keys(apres)) for (const c of apres[n]) idsApres.push(c.id);
  assert.strictEqual(new Set(idsApres).size, idsApres.length, 'aucun club en double');
  const perdus = [...idsAvant].filter((id) => idsApres.indexOf(id) === -1);
  assert.deepStrictEqual(perdus, [], `aucun club ne doit disparaître (${perdus.length})`);
});

test('Q8 — le palmarès d\'un club IA enregistre enfin ses montées', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  const nationale = classementDivision(s, 2);
  const promu = nationale[0];
  assert.ok(promu, 'il faut un premier de Nationale');
  finir(s, 7);
  jouerLesAutresDivisions(s);
  finir(s, 7);
  const p = RMClub.palmaresClub(s, promu.id);
  assert.ok(p.saisons >= 2, `il faut deux saisons enregistrées (${p.saisons})`);
  assert.ok(p.montees >= 1,
    `${promu.nom} doit avoir une montée à son palmarès (${p.montees})`);
  assert.ok(p.paliers.length >= 2, 'et deux divisions fréquentées');
});

test('Q9 — tout survit à une sauvegarde/rechargement', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  finir(s, 7);
  const avant = mondeFrancais(s);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const apres = mondeFrancais(rechargee);
  for (const n of Object.keys(avant)) {
    assert.deepStrictEqual(apres[n].map((c) => c.id).sort(), avant[n].map((c) => c.id).sort(),
      `la division ${n} doit être identique après rechargement`);
  }
});

test('Q10 — une division qui n\'a PAS joué n\'envoie personne nulle part', () => {
  // Rien n'est inventé : sans saison disputée, une division n'a ni champion
  // ni relégué, et son classement à zéro donnerait un ordre arbitraire. Même
  // principe que P14 pour l'historique.
  //
  // Attention : le championnat DU JOUEUR, lui, est bel et bien joué — ses
  // deux premiers montent normalement. Ce test porte donc sur les clubs des
  // divisions restées au repos : aucun ne doit en SORTIR (en revanche, en
  // recevoir des promus du palier inférieur est parfaitement normal).
  const s = carriere(3);
  const niveauJoueur = niveauDe(s);
  const avant = mondeFrancais(s);
  const auRepos = {};
  for (const n of Object.keys(avant)) {
    if (Number(n) === niveauJoueur) continue;
    for (const c of avant[n]) auRepos[c.id] = Number(n);
  }
  assert.ok(Object.keys(auRepos).length >= 20, 'il faut deux divisions au repos');
  finir(s, 7); // les autres divisions n'ont disputé aucune rencontre
  const apres = mondeFrancais(s);
  const partis = [];
  for (const n of Object.keys(apres)) {
    for (const c of apres[n]) {
      if (auRepos[c.id] != null && auRepos[c.id] !== Number(n)) partis.push(`${c.nom} ${auRepos[c.id]}→${n}`);
    }
  }
  assert.deepStrictEqual(partis, [],
    `aucun club d'une division au repos ne doit bouger (${partis.join(', ')})`);
});

test('Q11 — un changement d\'entraîneur reste compatible', () => {
  const s = carriere(3);
  jouerLesAutresDivisions(s);
  RMClub.assurerManager(s, 'Testeur');
  s.manager.reputation = 95;
  const offre = RMClub.offresDisponibles(s).find((o) => !o.immediat);
  assert.ok(offre, 'il faut une offre d\'une autre division');
  RMClub.accepterOffre(s, offre.id);
  finir(s, 7);
  assert.strictEqual(s.clubJoueur.id, offre.clubId, 'le manager doit avoir changé de club');
  const monde = mondeFrancais(s);
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `division ${niveau} : ${(monde[niveau] || []).length} clubs`);
  }
  const ids = [];
  for (const n of Object.keys(monde)) for (const c of monde[n]) ids.push(c.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'aucun club en double');
});

test('Q12 — trois saisons d\'affilée : la pyramide reste saine', () => {
  const s = carriere(3);
  for (let n = 0; n < 3; n++) { jouerLesAutresDivisions(s); finir(s, 7); }
  const monde = mondeFrancais(s);
  const ids = [];
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `division ${niveau} : ${(monde[niveau] || []).length} clubs`);
    for (const c of monde[niveau]) ids.push(c.id);
  }
  assert.strictEqual(new Set(ids).size, ids.length, 'aucun club en double après trois saisons');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
