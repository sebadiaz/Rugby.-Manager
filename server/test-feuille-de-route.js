// TEST DE PREUVE — LA DIRECTION NE JUGE QUE LE CLASSEMENT
//
// COMPORTEMENT ACTUEL OBSERVÉ : `confiancePresident` n'est modifiée qu'à deux
// endroits, et les deux ne regardent QUE la position au classement —
// `resoudrePointEtape` (club-direction.js) en cours de saison et le bilan de
// fin de saison (club.js, avancerSaison), tous deux via
// `evaluerObjectifSaison(objectif, positionFinale, confiance)`. Vérifiable :
// `grep -n "confiancePresident\s*=" docs/js/*.js`.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : tous les arbitrages de gestion
// construits jusqu'ici — infrastructures, centre de formation, mercato,
// statuts promis — n'ont AUCUN poids sur la seule chose qui décide si le
// manager garde son poste. Un manager qui vide la caisse et ne fait jamais
// jouer un seul joueur formé au club finit la saison avec exactement la même
// confiance qu'un manager irréprochable, à classement égal. Et surtout : le
// manager ne sait pas sur quoi il est jugé, en dehors du classement.
//
// FONCTION EXACTE RESPONSABLE : club.js, avancerSaison (bilan de fin de
// saison) — seule `evaluerObjectifSaison` y est consultée.
//
// SCÉNARIO DE REPRODUCTION : deux carrières identiques, même classement
// final. L'une dilapide son budget et n'aligne aucun joueur formé au club,
// l'autre fait l'inverse. Les deux terminent avec la même confiance.
//
// CE QUE CE FICHIER EXIGE :
//   1. une feuille de route PERSISTANTE, annoncée au manager ;
//   2. des cibles dérivées de données réelles du club, pas d'un barème fixe ;
//   3. une mesure prise sur ce que la simulation a réellement produit ;
//   4. un effet RÉEL sur la confiance du président en fin de saison ;
//   5. deux gestions différentes à classement égal => deux confiances
//      différentes ;
//   6. un état qui survit à une sauvegarde.
//
// Usage : node server/test-feuille-de-route.js
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

function carriere(graine) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'AS Direction');
  RMClub.daterCalendrier(s);
  return s;
}

// Termine le championnat en écrivant un classement RÉEL où le club finit à la
// place demandée — c'est l'entrée du bilan de fin de saison, pas une
// confiance forcée à la main.
function terminerSaisonALaPlace(s, place) {
  for (const f of s.calendrier) f.joue = true;
  const ids = Object.keys(s.classement);
  const monId = s.clubJoueur.id;
  const autres = ids.filter((id) => id !== monId);
  // Points décroissants : le club vise exactement `place`.
  autres.forEach((id, i) => {
    const rang = i < place - 1 ? i : i + 1; // laisse le trou de `place`
    Object.assign(s.classement[id], { pts: 200 - rang * 10, g: 0, n: 0, p: 0, pointsPour: 0, pointsContre: 0 });
  });
  Object.assign(s.classement[monId], { pts: 200 - (place - 1) * 10, g: 0, n: 0, p: 0, pointsPour: 0, pointsContre: 0 });
  const classement = RMClub.classementTrie(s);
  const positionObtenue = classement.findIndex((r) => r.clubId === monId) + 1;
  assert.strictEqual(positionObtenue, place, `le montage du classement doit placer le club ${place}e (obtenu ${positionObtenue}e)`);
}

test('D1 — la feuille de route existe, avec des axes distincts et lisibles', () => {
  assert.ok(Array.isArray(RMClub.CLES_AXE_DIRECTION) && RMClub.CLES_AXE_DIRECTION.length >= 3,
    'RMClub.CLES_AXE_DIRECTION doit lister au moins trois axes');
  for (const cle of RMClub.CLES_AXE_DIRECTION) {
    const def = RMClub.AXES_DIRECTION[cle];
    assert.ok(def && def.libelle, `${cle} doit avoir un libellé`);
    assert.ok(def.description, `${cle} doit dire au manager ce qui est attendu`);
  }
});

test('D2 — les cibles sont DÉRIVÉES du club, jamais un barème fixe', () => {
  const s = carriere(8001);
  const f = RMClub.assurerFeuilleDeRoute(s);
  assert.ok(f, 'saison.clubJoueur.feuilleDeRoute doit exister');
  assert.strictEqual(f.saisonNumero, s.numero || 1);
  const parCle = {};
  for (const a of f.axes) parCle[a.cle] = a;
  // Résultats : exactement l'objectif de saison déjà existant — pas une
  // seconde règle qui divergerait.
  assert.strictEqual(parCle.resultats.cible, s.clubJoueur.objectifSaison.position,
    'l\'axe résultats doit réutiliser objectifSaison, pas en inventer un autre');
  // Finances : un plancher tiré du budget RÉEL du club à cet instant.
  assert.ok(parCle.finances.cible > 0 && parCle.finances.cible < s.clubJoueur.budget,
    `le plancher financier doit être sous le budget de départ (${parCle.finances.cible} vs ${s.clubJoueur.budget})`);
  assert.strictEqual(f.budgetDepart, s.clubJoueur.budget);
  assert.ok(parCle.formation.cible >= 1, 'l\'axe formation doit demander quelque chose de concret');
});

test('D3 — la feuille de route est ANNONCÉE au manager', () => {
  const s = carriere(8002);
  RMClub.assurerFeuilleDeRoute(s);
  RMClub.annoncerFeuilleDeRoute(s);
  const msg = (s.clubJoueur.messages || []).find((m) => /feuille de route|direction/i.test(m.titre));
  assert.ok(msg, 'le manager doit apprendre sur quoi il est jugé');
  for (const cle of RMClub.CLES_AXE_DIRECTION) {
    assert.ok(msg.corps.includes(RMClub.AXES_DIRECTION[cle].libelle),
      `l'annonce doit citer l'axe ${cle}`);
  }
});

test('D4 — la formation se mesure sur des titularisations RÉELLES de joueurs formés au club', () => {
  const s = carriere(8003);
  RMClub.assurerFeuilleDeRoute(s);
  assert.strictEqual(RMClub.mesurerAxeDirection(s, 'formation').mesure, 0,
    'aucun joueur formé au club n\'a encore joué');
  const jeune = s.clubJoueur.jeunes[0];
  const promu = RMClub.promouvoirJeune(s, jeune.id);
  assert.strictEqual(promu.ok, true, 'la promotion doit aboutir');
  const enPro = s.clubJoueur.effectif.find((j) => j.id === jeune.id);
  assert.strictEqual(enPro.issuDuCentre, true,
    'un joueur promu doit rester identifiable comme formé au club');
  enPro.matchsJoues = 7;
  assert.strictEqual(RMClub.mesurerAxeDirection(s, 'formation').mesure, 7,
    'la mesure doit venir de matchsJoues, pas d\'un compteur parallèle');
  // Une recrue de 19 ans achetée ailleurs ne compte PAS comme formation.
  const achete = s.clubJoueur.effectif.find((j) => !j.issuDuCentre && j.matchsJoues === 0);
  achete.age = 19; achete.matchsJoues = 20;
  assert.strictEqual(RMClub.mesurerAxeDirection(s, 'formation').mesure, 7,
    'acheter un jeune n\'est pas le former');
});

test('D5 — les finances se mesurent sur le budget réel', () => {
  const s = carriere(8004);
  const f = RMClub.assurerFeuilleDeRoute(s);
  const plancher = f.axes.find((a) => a.cle === 'finances').cible;
  assert.strictEqual(RMClub.mesurerAxeDirection(s, 'finances').atteint, true,
    'au départ, le budget est au-dessus du plancher');
  s.clubJoueur.budget = plancher - 1;
  assert.strictEqual(RMClub.mesurerAxeDirection(s, 'finances').atteint, false,
    'passer sous le plancher doit être constaté');
  assert.strictEqual(RMClub.mesurerAxeDirection(s, 'finances').mesure, plancher - 1);
});

test('D6 — PREUVE : à classement égal, deux gestions différentes donnent deux confiances différentes', () => {
  function saisonAvecGestion({ exemplaire }) {
    const s = carriere(8100);
    const f = RMClub.assurerFeuilleDeRoute(s);
    s.clubJoueur.confiancePresident = 60;
    const cibleFormation = f.axes.find((a) => a.cle === 'formation').cible;
    const plancher = f.axes.find((a) => a.cle === 'finances').cible;
    if (exemplaire) {
      const jeune = s.clubJoueur.jeunes[0];
      RMClub.promouvoirJeune(s, jeune.id);
      s.clubJoueur.effectif.find((j) => j.id === jeune.id).matchsJoues = cibleFormation + 2;
      s.clubJoueur.budget = plancher + 500;
    } else {
      s.clubJoueur.budget = Math.round(plancher / 2);
    }
    // MÊME classement final dans les deux cas : seule la gestion diffère.
    terminerSaisonALaPlace(s, s.clubJoueur.objectifSaison.position);
    RMClub.avancerSaison(creerRng(999), s);
    return s.clubJoueur.confiancePresident;
  }
  const bon = saisonAvecGestion({ exemplaire: true });
  const mauvais = saisonAvecGestion({ exemplaire: false });
  assert.ok(bon > mauvais,
    `à classement identique, la gestion doit peser sur la confiance (exemplaire ${bon} vs dilapidée ${mauvais})`);
});

test('D7 — le bilan de fin de saison explique chaque axe', () => {
  const s = carriere(8200);
  RMClub.assurerFeuilleDeRoute(s);
  s.clubJoueur.confiancePresident = 60;
  terminerSaisonALaPlace(s, s.clubJoueur.objectifSaison.position);
  const bilan = RMClub.evaluerFeuilleDeRoute(s);
  assert.ok(bilan && Array.isArray(bilan.axes), 'un bilan structuré est attendu');
  // L'axe résultats n'est PAS recompté ici : il est déjà traité par
  // evaluerObjectifSaison, le doubler punirait ou récompenserait deux fois.
  const cles = bilan.axes.map((a) => a.cle);
  assert.ok(cles.includes('formation') && cles.includes('finances'), cles.join(','));
  assert.ok(!bilan.axes.some((a) => a.cle === 'resultats' && a.delta !== 0),
    'le classement ne doit pas être compté deux fois');
  for (const a of bilan.axes) {
    assert.ok(typeof a.atteint === 'boolean', `${a.cle} doit avoir un verdict`);
    assert.ok(a.explication, `${a.cle} doit être expliqué au manager`);
  }
  const msg = (s.clubJoueur.messages || []).find((m) => /feuille de route/i.test(m.titre));
  assert.ok(msg, 'le manager doit recevoir le bilan de sa feuille de route');
});

test('D8 — une nouvelle feuille de route est fixée à chaque saison', () => {
  const s = carriere(8300);
  const f1 = RMClub.assurerFeuilleDeRoute(s);
  assert.strictEqual(f1.saisonNumero, 1);
  terminerSaisonALaPlace(s, 3);
  RMClub.avancerSaison(creerRng(1234), s);
  const f2 = s.clubJoueur.feuilleDeRoute;
  assert.ok(f2, 'une feuille de route doit exister pour la nouvelle saison');
  assert.strictEqual(f2.saisonNumero, s.numero,
    `la feuille doit être celle de la saison en cours (${f2.saisonNumero} vs ${s.numero})`);
  assert.strictEqual(f2.axes.find((a) => a.cle === 'resultats').cible,
    s.clubJoueur.objectifSaison.position, 'elle doit suivre le nouvel objectif');
});

test('D9 — le dossier d’écran donne l’avancement CHIFFRÉ de chaque axe', () => {
  const s = carriere(8400);
  RMClub.assurerFeuilleDeRoute(s);
  const d = RMClub.dossierFeuilleDeRoute(s);
  assert.strictEqual(d.axes.length, RMClub.CLES_AXE_DIRECTION.length);
  for (const a of d.axes) {
    assert.ok(a.libelle && a.detail, `${a.cle} doit être lisible à l'écran`);
    assert.ok(typeof a.mesure === 'number' && typeof a.cible === 'number',
      `${a.cle} doit afficher un chiffre réel et sa cible`);
  }
  assert.ok(typeof d.atteints === 'number' && d.atteints <= d.axes.length);
});

test('D10 — la feuille de route survit à une sauvegarde', () => {
  stockage = {};
  const s = carriere(8500);
  RMClub.assurerFeuilleDeRoute(s);
  const jeune = s.clubJoueur.jeunes[0];
  RMClub.promouvoirJeune(s, jeune.id);
  assert.strictEqual(RMClub.sauvegarderSaison(s), true);
  const r = RMClub.chargerSaison();
  assert.ok(r && r.clubJoueur.feuilleDeRoute, 'la feuille doit être persistée');
  assert.strictEqual(r.clubJoueur.feuilleDeRoute.budgetDepart, s.clubJoueur.feuilleDeRoute.budgetDepart);
  assert.strictEqual(r.clubJoueur.effectif.find((j) => j.id === jeune.id).issuDuCentre, true,
    'le marqueur « formé au club » doit être persisté');
});

test('D11 — une ancienne sauvegarde sans feuille de route ne plante pas', () => {
  const s = carriere(8600);
  delete s.clubJoueur.feuilleDeRoute;
  assert.doesNotThrow(() => RMClub.dossierFeuilleDeRoute(s));
  assert.doesNotThrow(() => RMClub.evaluerFeuilleDeRoute(s));
  const f = RMClub.assurerFeuilleDeRoute(s);
  assert.ok(f, 'la feuille doit être créée à la volée');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
