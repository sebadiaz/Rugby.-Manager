// TEST DE PREUVE — LE MANAGER N'A AUCUN LEVIER SUR LA MÊLÉE
//
// COMPORTEMENT ACTUEL OBSERVÉ : `_meleeCalculerDiff` (engine/rugby-engine.js,
// ~3845-3865) calcule l'issue de la mêlée à partir des JOUEURS (somme des
// forceMelee, bonus piliers, technique du talonneur), du score, des
// conditions et du hasard. Elle ne lit **aucune clé de `cfgMelee`** — la
// config de mêlée par équipe existe mais ne touche jamais la contestation.
//
// Vérifié en jouant : poser `meleeA.reculTroisQuarts = 12` donne exactement
// le même résultat que le défaut (81/94 mêlées gagnées dans les deux cas) —
// la clé traverse bien toute la chaîne de config, mais n'atteint pas le
// contest. Le seul réglage que le Mode Club peut poser sur la mêlée
// (`pickAndGoHuit`, axe « Jeu d'avants ») décide de ce qu'on fait du ballon
// UNE FOIS SORTI, jamais de la poussée.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : la mêlée est, avec la touche,
// l'une des deux phases où un entraîneur décide vraiment. Depuis P1-49 le
// manager recrute ses piliers sur leur `melee` (40 % de leur note au poste),
// et le moteur s'en sert — mais le manager, lui, ne peut RIEN choisir. La
// touche vient de recevoir son arbitrage (P1-50/50b) ; la mêlée n'en a aucun.
//
// FONCTION EXACTE RESPONSABLE : engine/rugby-engine.js, `_meleeCalculerDiff`.
//
// CE QUE CE FICHIER EXIGE :
//   1. une consigne de poussée réglable PAR ÉQUIPE ;
//   2. un effet RÉEL sur la contestation ;
//   3. un COÛT réel — dominer doit exposer aux fautes, sinon ce n'est pas
//      un choix (même erreur que celle corrigée en P1-50b) ;
//   4. le réglage neutre doit laisser le comportement historique INCHANGÉ ;
//   5. la consigne doit exister comme axe tactique du Mode Club et arriver
//      jusqu'au moteur ;
//   6. les mêlées doivent rester dans les ordres de grandeur d'un vrai match.
//
// Usage : node server/test-melee.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
const RugbyEngine = require('../docs/rugby-engine.js');
global.window.RugbyEngine = RugbyEngine;
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

function jouer(graine, cfg) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, cfg);
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  return m.getState().stats;
}

test('M1 — PREUVE : une consigne de poussée existe et agit sur la contestation', () => {
  const dominer = RugbyEngine.effetPousseeMelee('dominer');
  const equilibre = RugbyEngine.effetPousseeMelee('equilibre');
  const sortirVite = RugbyEngine.effetPousseeMelee('sortirVite');
  for (const e of [dominer, equilibre, sortirVite]) {
    assert.ok(e && typeof e.bonusDiff === 'number' && typeof e.bonusVol === 'number'
      && typeof e.facteurFaute === 'number',
      `chaque consigne doit produire un effet chiffré (${JSON.stringify(e)})`);
  }
  assert.ok(dominer.bonusDiff > equilibre.bonusDiff, 'pousser doit peser sur le différentiel');
  assert.ok(sortirVite.bonusDiff < equilibre.bonusDiff, 'renoncer à pousser doit coûter');
});

test('M1bis — l\'effet ne peut PAS passer par le seul différentiel (saturation)', () => {
  // Mesuré : `probaVol` vaut 0,05 - diff/300 borné à 0,02, et l'avantage
  // d'introduction (18) suffit déjà à coller la valeur au plancher. Un bonus
  // de différentiel seul n'y change donc RIEN. Première version de ce patch :
  // +10 de différentiel et rien d'autre -> le taux de mêlées gagnées passait
  // de 85,9 % à 79,6 %, l'effet était inerte et seul le coût s'appliquait.
  const probaVol = (diff) => Math.max(0.02, Math.min(0.35, 0.05 - diff / 300));
  assert.strictEqual(probaVol(18), 0.02, 'à packs égaux, on est déjà au plancher');
  assert.strictEqual(probaVol(28), 0.02, '+10 de différentiel n\'y change rien');
  // D'où un terme DÉDIÉ : un pack qui pousse contre l'introduction contre plus.
  assert.ok(RugbyEngine.effetPousseeMelee('dominer').bonusVol > 0,
    'dominer doit augmenter le contre quand on ne rentre pas le ballon');
  assert.ok(RugbyEngine.effetPousseeMelee('sortirVite').bonusVol < 0,
    'sortir vite doit réduire le risque de se faire contrer');
  // Et ce terme, lui, sort réellement du plancher.
  const avecPoussee = Math.max(0.02, Math.min(0.35,
    0.05 - 18 / 300 + RugbyEngine.effetPousseeMelee('dominer').bonusVol));
  assert.ok(avecPoussee > 0.02 * 2,
    `pousser contre l'introduction doit VRAIMENT augmenter le contre (${avecPoussee.toFixed(3)})`);
});

test('M2 — le réglage neutre laisse le comportement HISTORIQUE inchangé', () => {
  const e = RugbyEngine.effetPousseeMelee('equilibre');
  assert.strictEqual(e.bonusDiff, 0, 'aucun bonus au réglage neutre');
  assert.strictEqual(e.bonusVol, 0, 'aucun contre supplémentaire au réglage neutre');
  assert.strictEqual(e.facteurFaute, 1, 'aucun surcroît de faute au réglage neutre');
  // Une consigne inconnue ou absente doit retomber sur le neutre, jamais
  // planter ni inventer un effet.
  assert.deepStrictEqual(RugbyEngine.effetPousseeMelee(null), e);
  assert.deepStrictEqual(RugbyEngine.effetPousseeMelee('nimportequoi'), e);
});

test('M3 — dominer COÛTE : plus de risque de faute (sinon ce n\'est pas un choix)', () => {
  const dominer = RugbyEngine.effetPousseeMelee('dominer');
  const sortirVite = RugbyEngine.effetPousseeMelee('sortirVite');
  assert.ok(dominer.facteurFaute > 1,
    `pousser fort doit exposer aux fautes (${dominer.facteurFaute})`);
  assert.ok(sortirVite.facteurFaute < 1,
    `sortir vite doit réduire le risque (${sortirVite.facteurFaute})`);
});

test('M4 — la consigne arrive jusqu\'au moteur, par équipe', () => {
  const m = new RugbyEngine.MatchEngine(1, 60, { meleeA: { poussee: 'dominer' } });
  assert.strictEqual(m.cfgMelee.A.poussee, 'dominer', 'l\'équipe A doit avoir la consigne');
  assert.strictEqual(m.cfgMelee.B.poussee, 'equilibre',
    'l\'équipe B garde le réglage neutre par défaut');
});

test('M5 — la consigne est un AXE TACTIQUE du Mode Club', () => {
  const axe = RMClub.AXES_TACTIQUE.poussee;
  assert.ok(axe && axe.label, 'un axe « poussée » doit exister');
  assert.strictEqual(axe.defaut, 'equilibre', 'neutre par défaut');
  const cles = Object.keys(axe.options);
  assert.ok(cles.length >= 3, `au moins trois options (${cles.join(', ')})`);
  for (const cle of cles) {
    const o = axe.options[cle];
    assert.ok(o.nom && o.description && o.compromis,
      `${cle} doit annoncer son compromis au manager (${JSON.stringify(o)})`);
  }
});

test('M6 — l\'axe se traduit en config moteur, sans écraser l\'axe « avants »', () => {
  // Les deux axes écrivent dans `melee` : ils doivent FUSIONNER, pas se
  // remplacer — sinon choisir une poussée ferait perdre le réglage de
  // pick-and-go, et réciproquement.
  const cfg = RMClub.tactiqueVersConfig({ avants: 'proche', poussee: 'dominer' });
  assert.ok(cfg.melee, 'une config de mêlée doit être produite');
  assert.strictEqual(cfg.melee.poussee, 'dominer');
  assert.ok(cfg.melee.pickAndGoHuit, 'le réglage de l\'axe « avants » doit survivre');
  // Réglages neutres : rien d'imposé au moteur.
  const neutre = RMClub.tactiqueVersConfig({ avants: 'equilibre', poussee: 'equilibre' });
  assert.ok(!neutre.melee || !neutre.melee.poussee || neutre.melee.poussee === 'equilibre',
    'le neutre ne doit rien forcer');
});

test('M7 — en match, la consigne produit réellement un déroulé différent', () => {
  // Ce test vérifie le CÂBLAGE de bout en bout, pas l'ampleur de l'effet :
  // sur une dizaine de matchs, le nombre même de mêlées change (115 contre
  // 134 selon la consigne), donc les taux ne sont pas comparables. L'ampleur
  // est vérifiée sur la règle (M1bis, M3), pas sur une moyenne bruitée —
  // même méthode qu'en P1-50b pour la touche.
  let neutre = { s: 0, g: 0 }, pousse = { s: 0, g: 0 };
  for (let g = 1; g <= 8; g++) {
    const a = jouer(g, null);
    neutre.s += a.A.scrums; neutre.g += a.A.scrumsGagnes;
    const b = jouer(g, { meleeA: { poussee: 'dominer' } });
    pousse.s += b.A.scrums; pousse.g += b.A.scrumsGagnes;
  }
  assert.ok(neutre.s > 0 && pousse.s > 0, 'des mêlées doivent avoir lieu');
  assert.notDeepStrictEqual([pousse.g, pousse.s], [neutre.g, neutre.s],
    `la consigne doit produire un match différent (${pousse.g}/${pousse.s} vs ${neutre.g}/${neutre.s})`);
});

test('M8 — les mêlées restent dans les ordres de grandeur d\'un vrai match', () => {
  let total = 0;
  const n = 5;
  for (let g = 1; g <= n; g++) {
    const st = jouer(g, { meleeA: { poussee: 'dominer' }, meleeB: { poussee: 'sortirVite' } });
    total += st.A.scrums + st.B.scrums;
  }
  const moyenne = total / n;
  assert.ok(moyenne >= 6 && moyenne <= 30,
    `un match compte 8 à 25 mêlées (moyenne mesurée ${moyenne.toFixed(1)})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
