// COUVERTURE — la pyramide française cesse d'effacer son monde.
//
// Audit mesuré avant cette tranche, sur une carrière où les trois divisions
// françaises sont réellement simulées dans la même sauvegarde :
//
//   saison SANS changement de palier   clubs conservés  14/14, 16/16, 13/13
//   saison AVEC promotion (3 -> 2)     clubs conservés   0/14,  0/16,  0/13
//
//   « mes nouveaux adversaires qui existaient déjà en Ligue Nationale : 0/15 »
//   « mes anciens rivaux de Régionale encore présents : 0/13 »
//
// Autrement dit : **monter d'un palier effaçait 43 clubs et en créait 43
// autres**. La Ligue Nationale qu'on regardait toute la saison n'était pas
// celle qu'on rejoignait ; le club qui vous avait battu l'an dernier
// n'existait plus ; et les deux autres divisions étaient régénérées elles
// aussi, parce que `assurerAutresDivisionsFrance` repart de zéro dès que le
// palier du joueur change.
//
// Usage : node server/test-monde-persistant.js
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

let graine = 510000;
function carriere(niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Monde');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  RMClub.assurerAutresDivisionsFrance(creerRng(graine++), s);
  return s;
}
function niveauDe(s) { return (s.clubJoueur.palierPyramide || {}).niveau; }
// Toutes les divisions françaises, y compris celle du joueur, sous la même
// forme : { niveau: [clubs] }.
function mondeFrancais(s) {
  const out = {};
  out[niveauDe(s)] = [s.clubJoueur].concat(s.adversaires || []);
  const autres = (s.autresDivisionsFrance || {}).divisions || {};
  for (const cle of Object.keys(autres)) out[cle] = (autres[cle].clubs || []).slice();
  return out;
}
function ids(liste) { return new Set((liste || []).map((c) => c.id)); }
function finir(s, position) {
  const c = s.clubJoueur;
  const rivaux = Object.keys(s.classement).filter((id) => id !== c.id);
  s.classement[c.id].pts = 50;
  rivaux.forEach((id, i) => { s.classement[id].pts = i < (position - 1) ? 90 : 10; });
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(graine++), s);
}

// G24 — depuis le marché des entraîneurs, une offre suppose un POSTE LIBRE.
// Ce contrôle porte sur ce que devient le MONDE quand on change de division,
// pas sur l'existence d'une offre : on ouvre donc les postes par le mécanisme
// du jeu (une fin de saison où chaque club finit dernier), jamais en écrivant
// dans l'état à la main.
function ouvrirTousLesPostes(s) {
  if (!RMClub.resoudreEntraineursFinDeSaison) return s;
  const bilans = {};
  const ajouter = (clubs) => { for (const c of clubs || []) bilans[c.id] = { position: 14, total: 14 }; };
  ajouter(s.adversaires);
  const autres = (s.autresDivisionsFrance || {}).divisions || {};
  for (const cle of Object.keys(autres)) ajouter(autres[cle].clubs);
  RMClub.resoudreEntraineursFinDeSaison(creerRng(9871), s, { bilans });
  return s;
}

test('M1 — PREUVE : la division qu\'on REJOINT est celle qu\'on regardait', () => {
  const s = carriere(3);
  const avant = mondeFrancais(s);
  const cibles = ids(avant[2]);
  assert.ok(cibles.size >= 10, 'la Ligue Nationale doit être peuplée avant la montée');
  finir(s, 1); // champion : promotion
  assert.strictEqual(niveauDe(s), 2, 'le club doit être monté');
  const nouveaux = (s.adversaires || []).map((a) => a.id);
  const connus = nouveaux.filter((id) => cibles.has(id));
  assert.ok(connus.length >= nouveaux.length - 1,
    `mes nouveaux adversaires doivent être ceux que je regardais (${connus.length}/${nouveaux.length})`);
});

test('M2 — et la division qu\'on QUITTE ne disparaît pas', () => {
  const s = carriere(3);
  const anciensRivaux = ids(s.adversaires);
  finir(s, 1);
  const monde = mondeFrancais(s);
  const regionale = ids(monde[3]);
  const survivants = [...anciensRivaux].filter((id) => regionale.has(id));
  assert.strictEqual(survivants.length, anciensRivaux.size,
    `mes anciens rivaux doivent rester en Régionale (${survivants.length}/${anciensRivaux.size})`);
});

test('M3 — les tailles de division restent exactes après un mouvement', () => {
  const s = carriere(3);
  finir(s, 1);
  const monde = mondeFrancais(s);
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `la division ${niveau} doit compter ${RMClub.TAILLE_DIVISION_FRANCE[niveau]} clubs ` +
      `(elle en a ${(monde[niveau] || []).length})`);
  }
});

test('M4 — un club prend la place laissée : il descend vraiment', () => {
  const s = carriere(3);
  const avant = mondeFrancais(s);
  const nationaleAvant = ids(avant[2]);
  finir(s, 1);
  const monde = mondeFrancais(s);
  const descendus = (monde[3] || []).filter((c) => nationaleAvant.has(c.id));
  assert.strictEqual(descendus.length, 1,
    `exactement un club doit descendre de Nationale en Régionale (${descendus.length})`);
  assert.ok(descendus[0].nom, 'et garder son nom');
});

test('M5 — la relégation fonctionne symétriquement', () => {
  const s = carriere(2);
  const avant = mondeFrancais(s);
  const regionaleAvant = ids(avant[3]);
  const mesRivaux = ids(s.adversaires);
  finir(s, RMClub.TAILLE_DIVISION_FRANCE[2]); // dernier : relégation
  assert.strictEqual(niveauDe(s), 3, 'le club doit être descendu');
  const nouveaux = (s.adversaires || []).map((a) => a.id);
  const connus = nouveaux.filter((id) => regionaleAvant.has(id));
  assert.ok(connus.length >= nouveaux.length - 1,
    `je dois retrouver les clubs de Régionale (${connus.length}/${nouveaux.length})`);
  const monde = mondeFrancais(s);
  const nationale = ids(monde[2]);
  const restes = [...mesRivaux].filter((id) => nationale.has(id));
  assert.strictEqual(restes.length, mesRivaux.size,
    `mes anciens rivaux doivent rester en Nationale (${restes.length}/${mesRivaux.size})`);
});

test('M6 — les clubs rejoints gardent leur identité', () => {
  const s = carriere(3);
  const avant = {};
  for (const c of mondeFrancais(s)[2]) avant[c.id] = { nom: c.nom, niveauClub: c.niveauClub, budget: c.budget };
  finir(s, 1);
  let verifies = 0;
  for (const a of (s.adversaires || [])) {
    if (!avant[a.id]) continue;
    verifies++;
    assert.strictEqual(a.nom, avant[a.id].nom, `${a.id} doit garder son nom`);
    assert.strictEqual(a.niveauClub, avant[a.id].niveauClub, `${a.nom} doit garder son niveau`);
  }
  assert.ok(verifies >= 10, `il faut vérifier de vrais clubs (${verifies})`);
});

test('M7 — un club rejoint arrive avec un effectif JOUABLE', () => {
  const s = carriere(3);
  finir(s, 1);
  for (const a of (s.adversaires || [])) {
    assert.ok(Array.isArray(a.effectif) && a.effectif.length >= 15,
      `${a.nom} doit pouvoir aligner une équipe (${a.effectif ? a.effectif.length : 'aucun effectif'})`);
  }
});

test('M8 — aucun doublon d\'identifiant dans tout le monde français', () => {
  const s = carriere(3);
  finir(s, 1);
  const monde = mondeFrancais(s);
  const vus = new Map();
  for (const niveau of Object.keys(monde)) {
    for (const c of monde[niveau]) {
      assert.ok(!vus.has(c.id),
        `${c.nom} (${c.id}) apparaît en division ${vus.get(c.id)} ET ${niveau}`);
      vus.set(c.id, niveau);
    }
  }
});

test('M9 — sans mouvement de palier, rien ne change (non-régression)', () => {
  const s = carriere(3);
  const avant = mondeFrancais(s);
  const attendus = {};
  for (const n of Object.keys(avant)) attendus[n] = ids(avant[n]);
  finir(s, 7);
  const apres = mondeFrancais(s);
  for (const n of Object.keys(attendus)) {
    const restants = [...attendus[n]].filter((id) => ids(apres[n]).has(id));
    assert.strictEqual(restants.length, attendus[n].size,
      `la division ${n} doit être intacte (${restants.length}/${attendus[n].size})`);
  }
});

test('M10 — trois saisons, deux mouvements : le monde reste cohérent', () => {
  const s = carriere(3);
  finir(s, 1);                                   // montée en Nationale
  finir(s, RMClub.TAILLE_DIVISION_FRANCE[2]);    // redescente en Régionale
  assert.strictEqual(niveauDe(s), 3);
  const monde = mondeFrancais(s);
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `division ${niveau} : ${(monde[niveau] || []).length} clubs`);
  }
  const vus = new Set();
  for (const n of Object.keys(monde)) for (const c of monde[n]) {
    assert.ok(!vus.has(c.id), `${c.nom} en double après deux mouvements`);
    vus.add(c.id);
  }
});

test('M11 — le monde survit à une sauvegarde/rechargement', () => {
  const s = carriere(3);
  finir(s, 1);
  const avant = mondeFrancais(s);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const apres = mondeFrancais(rechargee);
  for (const n of Object.keys(avant)) {
    assert.deepStrictEqual([...ids(apres[n])].sort(), [...ids(avant[n])].sort(),
      `la division ${n} doit être identique après rechargement`);
  }
});

test('M12 — un changement d\'entraîneur vers une autre division garde le monde', () => {
  const s = carriere(3);
  RMClub.assurerManager(s, 'Testeur');
  s.manager.reputation = 95;
  ouvrirTousLesPostes(s);
  const offre = RMClub.offresDisponibles(s).find((o) => !o.immediat);
  assert.ok(offre, 'il faut une offre d\'une autre division');
  const ancienClubId = s.clubJoueur.id;
  const anciensRivaux = ids(s.adversaires);
  RMClub.accepterOffre(s, offre.id);
  finir(s, 7);
  assert.strictEqual(s.clubJoueur.id, offre.clubId, 'le manager doit avoir changé de club');
  const monde = mondeFrancais(s);
  // Son ancien club existe toujours, dans son ancienne division.
  const ancienne = ids(monde[3]);
  assert.ok(ancienne.has(ancienClubId),
    'le club qu\'il a quitté doit continuer d\'exister en Régionale');
  const survivants = [...anciensRivaux].filter((id) => ancienne.has(id));
  assert.strictEqual(survivants.length, anciensRivaux.size,
    `et ses anciens rivaux aussi (${survivants.length}/${anciensRivaux.size})`);
  for (const niveau of [1, 2, 3]) {
    assert.strictEqual((monde[niveau] || []).length, RMClub.TAILLE_DIVISION_FRANCE[niveau],
      `division ${niveau} : ${(monde[niveau] || []).length} clubs`);
  }
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
