// TEST DE PREUVE — L'EFFECTIF DEVIENT UNE POUPONNIÈRE, DÉFINITIVEMENT
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré, carrière de 8 saisons, graine 2026) :
//
//   Saison │ âge moyen │ âge max │ < 23 ans │ > 29 ans │ niveau moyen
//   ───────┼───────────┼─────────┼──────────┼──────────┼─────────────
//      1   │   26,8    │   34    │   5/24   │   8/24   │    55,1
//      3   │   25,3    │   34    │  10/24   │   8/24   │    52,5
//      5   │   19,4    │   21    │  24/24   │   0/24   │    51,4
//      8   │   19,8    │   21    │  24/24   │   0/24   │    48,7
//
//   Au bout de quatre saisons il ne reste plus UN SEUL joueur de plus de
//   22 ans, et l'effectif ne s'en relève jamais.
//
//   Le monde entier suit, par la même fonction (les clubs IA vieillissent avec
//   `vieillirEffectif`, cf. club-mercato.js vieillirClubIA) — 13 clubs, ~325
//   joueurs suivis :
//
//   Saison │ âge moyen IA │ joueurs de plus de 29 ans
//   ───────┼──────────────┼──────────────────────────
//      1   │     25,5     │        79
//      5   │     24,0     │        68
//      8   │     20,5     │         9
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : un effectif de rugby à XV, c'est
// une pyramide — quelques espoirs, un gros bloc de joueurs confirmés, quelques
// cadres de 30-34 ans qui tiennent la mêlée et le vestiaire. Ici, au bout de
// quatre saisons, le manager dirige une équipe de juniors et affronte des
// équipes de juniors. Plus de cadres, plus de leaders, plus de hiérarchie : le
// statut promis (cadre/rotation/espoir, P1-45) n'a plus de sens quand tout le
// monde a 19 ans, la masse salariale s'effondre (594 → 477 k€) et avec elle
// tout arbitrage financier, et le mercato perd son objet. La carrière longue
// — la raison d'être d'un jeu de gestion — se vide.
//
// FONCTION EXACTE RESPONSABLE : docs/js/club.js, `vieillirEffectif`, la boucle
// de remplacement :
//
//     while (reste.length < TAILLE_EFFECTIF_CIBLE) {
//       const jeune = global.RMClub.genererJoueurEtendu(posteManquant, rng, niveauClub);
//       jeune.age = 18 + Math.floor(rng() * 3); // jeunes espoirs, 18-20 ans
//       jeune.contrat = 2 + Math.floor(rng() * 2);
//       ...
//     }
//
// TOUS les départs — retraites ET fins de contrat, à tout âge — sont remplacés
// par des joueurs de 18 à 20 ans. La pyramide ne peut que s'effondrer.
//
// Effet de bord de la même ligne : `genererJoueurEtendu` a déjà calculé
// `potentiel` à partir de l'âge qu'il avait tiré (18-35). Écraser l'âge APRÈS
// coup laisse un espoir de 18 ans avec le potentiel d'un joueur de 30 ans.
//
// SCÉNARIO DE REPRODUCTION : jouer huit saisons complètes et relever la
// répartition des âges de l'effectif à chaque intersaison.
//
// CE QUE CE FICHIER EXIGE :
//   1. une règle de pyramide EXPLICITE et testable directement ;
//   2. les remplacements comblent la tranche d'âge qui MANQUE ;
//   3. sur une carrière longue, l'effectif garde une pyramide plausible ;
//   4. des cadres expérimentés existent toujours ;
//   5. le potentiel d'une recrue est cohérent avec son âge RÉEL ;
//   6. les contrats ne expirent pas tous en même temps ;
//   7. le monde (clubs IA) ne rajeunit pas non plus ;
//   8. taille d'effectif et couverture des postes restent intactes.
//
// Usage : node server/test-pyramide-ages.js
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

// UNE SEULE carrière longue pour toute la suite : huit saisons complètes
// coûtent plusieurs secondes, les rejouer par test rendrait la suite
// inutilisable.
const NB_SAISONS = 8;
function jouerCarriere() {
  const s = RMClub.nouvelleSaison(creerRng(2026), 'AS Pyramide');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const parSaison = [];
  for (let n = 1; n <= NB_SAISONS; n++) {
    const rng = creerRng(9000 + n);
    let fixtures = RMClub.prochainesFixtures(s), garde = 0;
    while (fixtures.length && garde++ < 60) {
      for (const f of fixtures) {
        const adv = f.domicileId === s.clubJoueur.id ? f.exterieurId : f.domicileId;
        RMClub.enregistrerResultatClubJoueur(s, adv,
          15 + Math.floor(rng() * 25), 10 + Math.floor(rng() * 25), f.journee);
      }
      fixtures = RMClub.prochainesFixtures(s);
    }
    const effectif = s.clubJoueur.effectif || [];
    const agesIA = [];
    for (const c of (s.adversaires || [])) {
      for (const j of (c.groupe || c.effectif || [])) if (j && j.age != null) agesIA.push(j.age);
    }
    parSaison.push({
      n,
      ages: effectif.map((j) => j.age),
      contrats: effectif.map((j) => j.contrat),
      postes: effectif.map((j) => j.poste),
      taille: effectif.length,
      masse: effectif.reduce((a, j) => a + (j.salaire || 0), 0),
      agesIA,
    });
    RMClub.avancerSaison(creerRng(3000 + n), s);
  }
  return { saison: s, parSaison };
}
const CARRIERE = jouerCarriere();
const DERNIERE = CARRIERE.parSaison[CARRIERE.parSaison.length - 1];
const moy = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const resume = (p) => `S${p.n} : ${moy(p.ages).toFixed(1)} ans, max ${Math.max(...p.ages)}, ` +
  `${p.ages.filter((a) => a > 29).length} de plus de 29`;

test('Y1 — la pyramide des âges est une règle EXPLICITE et testable', () => {
  assert.ok(Array.isArray(RMClub.PYRAMIDE_AGES) && RMClub.PYRAMIDE_AGES.length >= 3,
    'une pyramide cible doit exister');
  let total = 0, precedentMax = 17;
  for (const t of RMClub.PYRAMIDE_AGES) {
    assert.ok(typeof t.min === 'number' && typeof t.max === 'number' && typeof t.part === 'number',
      `chaque tranche doit être chiffrée (${JSON.stringify(t)})`);
    assert.strictEqual(t.min, precedentMax + 1, 'les tranches doivent être contiguës, sans trou');
    precedentMax = t.max;
    total += t.part;
  }
  assert.ok(Math.abs(total - 1) < 1e-6, `les parts doivent totaliser 100 % (${total})`);
  assert.ok(precedentMax >= 33, `la pyramide doit aller jusqu'aux cadres (max ${precedentMax})`);
  assert.strictEqual(typeof RMClub.ageRecrueIntersaison, 'function',
    'la règle de choix de l\'âge d\'une recrue doit être exportée');
});

test('Y2 — PREUVE : une recrue comble la tranche qui MANQUE', () => {
  const rng = creerRng(1);
  // Effectif entièrement composé d'espoirs : la recrue ne doit surtout pas
  // être un espoir de plus — c'est exactement le cas mesuré en saison 5.
  const quePetits = Array.from({ length: 24 }, () => ({ age: 19 }));
  for (let i = 0; i < 20; i++) {
    const age = RMClub.ageRecrueIntersaison(quePetits, rng);
    assert.ok(age > 21, `un effectif de juniors doit recruter plus vieux (âge tiré ${age})`);
  }
  // Effectif entièrement vétéran : à l'inverse, il faut du sang neuf.
  const queVieux = Array.from({ length: 24 }, () => ({ age: 32 }));
  for (let i = 0; i < 20; i++) {
    const age = RMClub.ageRecrueIntersaison(queVieux, rng);
    assert.ok(age < 30, `un effectif vieillissant doit rajeunir (âge tiré ${age})`);
  }
  // Effectif vide : jamais de plantage, jamais d'âge absurde.
  const age = RMClub.ageRecrueIntersaison([], rng);
  assert.ok(age >= 18 && age <= 34, `âge plausible sur effectif vide (${age})`);
});

test('Y3 — PREUVE EN CARRIÈRE : l\'effectif garde une pyramide plausible', () => {
  const detail = CARRIERE.parSaison.map(resume).join(' | ');
  for (const p of CARRIERE.parSaison) {
    const m = moy(p.ages);
    assert.ok(m >= 23 && m <= 29,
      `l'âge moyen d'un effectif pro tient entre 23 et 29 ans (${detail})`);
  }
});

test('Y4 — des CADRES expérimentés existent toujours', () => {
  const detail = CARRIERE.parSaison.map(resume).join(' | ');
  for (const p of CARRIERE.parSaison) {
    const cadres = p.ages.filter((a) => a >= 30).length;
    assert.ok(cadres >= 2,
      `un effectif de 24 compte au moins deux joueurs de 30 ans et plus (${detail})`);
    assert.ok(Math.max(...p.ages) >= 30,
      `le doyen doit avoir au moins 30 ans (${detail})`);
  }
  // Et des jeunes aussi : la pyramide marche dans les deux sens.
  for (const p of CARRIERE.parSaison) {
    assert.ok(p.ages.filter((a) => a <= 22).length >= 2,
      `un effectif compte aussi des espoirs (${resume(p)})`);
  }
});

test('Y5 — le potentiel d\'une recrue est cohérent avec son âge RÉEL', () => {
  // Défaut mesuré : genererJoueurEtendu calcule `potentiel` à partir de l'âge
  // qu'il a tiré lui-même, puis vieillirEffectif écrase l'âge. Un espoir de
  // 18 ans pouvait donc hériter du potentiel d'un joueur de 30 ans (aucune
  // marge de progression).
  const rng = creerRng(77);
  const effectif = RMClub.genererEffectifEtendu(creerRng(5), 0.5);
  const evolution = RMClub.vieillirEffectif(rng, effectif, 0.5);
  const recrues = evolution.reste.filter((j) => j.matchsJoues === 0 && j.contrat >= 1
    && !effectif.some((v) => v.id === j.id));
  assert.ok(recrues.length > 0, 'l\'intersaison doit produire des recrues');
  // Le niveau se mesure sur EXACTEMENT les sept attributs que `genererPotentiel`
  // utilise (cf. club-generation-joueurs.js, `niveauActuel`). Une moyenne ad hoc
  // sur quatre attributs n'est pas comparable au potentiel : un trois-quarts a
  // des valeurs de mêlée/touche basses qui tirent la moyenne des sept vers le
  // bas sans rien dire de sa marge de progression.
  const niveauDe = (j) => (j.vitesse + j.plaquage + j.melee + j.touche
    + j.puissance + j.passe + j.jeuPied) / 7;
  for (const r of recrues) {
    const niveau = niveauDe(r);
    if (r.age <= 21) {
      assert.ok(r.potentiel > niveau,
        `un joueur de ${r.age} ans doit avoir une marge de progression ` +
        `(potentiel ${r.potentiel}, niveau ${niveau.toFixed(1)})`);
    }
    // Un joueur de 30 ans et plus n'a plus de marge : son potentiel colle à
    // son niveau. C'est ce que garantit genererPotentiel (margeJeunesse nulle
    // au-delà de 25 ans) — et c'est ce qui était FAUX avant, quand l'âge était
    // écrasé après coup.
    if (r.age >= 30) {
      assert.ok(Math.abs(r.potentiel - niveau) <= 1,
        `un joueur de ${r.age} ans est à son plafond ` +
        `(potentiel ${r.potentiel}, niveau ${niveau.toFixed(1)})`);
    }
    assert.ok(r.potentiel >= 20 && r.potentiel <= 99, `potentiel plausible (${r.potentiel})`);
  }
});

test('Y6 — les contrats n\'expirent pas tous en même temps', () => {
  // Défaut mesuré : toutes les recrues signaient 2 ou 3 saisons, ce qui
  // produisait des vagues de départs (13 partants d'un coup sur 24).
  for (const p of CARRIERE.parSaison) {
    const compte = {};
    for (const c of p.contrats) compte[c] = (compte[c] || 0) + 1;
    const pire = Math.max(...Object.values(compte));
    assert.ok(pire <= p.taille * 0.6,
      `pas plus de 60 % de l'effectif sur la même échéance ` +
      `(S${p.n} : ${JSON.stringify(compte)})`);
  }
});

test('Y7 — le MONDE ne rajeunit pas non plus', () => {
  const detail = CARRIERE.parSaison
    .map((p) => `S${p.n} ${moy(p.agesIA).toFixed(1)}`).join(' | ');
  for (const p of CARRIERE.parSaison) {
    assert.ok(p.agesIA.length > 100, `les clubs IA doivent être suivis (S${p.n} : ${p.agesIA.length})`);
    const m = moy(p.agesIA);
    assert.ok(m >= 23 && m <= 29,
      `les clubs adverses gardent eux aussi une pyramide (${detail})`);
    const cadres = p.agesIA.filter((a) => a >= 30).length;
    assert.ok(cadres / p.agesIA.length >= 0.08,
      `au moins 8 % de joueurs de 30 ans et plus dans le monde ` +
      `(S${p.n} : ${cadres}/${p.agesIA.length})`);
  }
});

test('Y8 — taille d\'effectif et couverture des postes intactes', () => {
  for (const p of CARRIERE.parSaison) {
    assert.strictEqual(p.taille, RMClub.GABARIT_EFFECTIF.length,
      `l'effectif garde sa taille cible (S${p.n} : ${p.taille})`);
    for (const poste of new Set(RMClub.GABARIT_EFFECTIF)) {
      assert.ok(p.postes.indexOf(poste) !== -1,
        `aucun poste ne doit tomber à zéro (S${p.n}, poste ${poste})`);
    }
  }
  // La masse salariale doit rester du même ordre : un effectif de juniors
  // coûtait 20 % de moins, ce qui vidait tout arbitrage financier.
  const masses = CARRIERE.parSaison.map((p) => p.masse);
  assert.ok(Math.min(...masses) >= masses[0] * 0.8,
    `la masse salariale ne doit pas s'effondrer (${masses.join(', ')})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
