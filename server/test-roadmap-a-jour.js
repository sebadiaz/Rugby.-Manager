// COUVERTURE — la feuille de route ne doit pas mentir sur ce qui MANQUE.
//
// `ROADMAP_FOOTBALL_MANAGER.md` sert à choisir la tranche suivante. Une ligne
// marquée 🔴 (« absent ») alors que la fonctionnalité existe et marche envoie
// donc le travail au mauvais endroit — et fait courir le risque de
// reconstruire ce qui est déjà là.
//
// Audit mesuré : sur les QUATRE lignes 🔴 du document, TROIS étaient fausses.
//
//   « Concurrence avec les clubs IA : aucun club IA ne recrute en parallèle »
//     -> mesuré : 5 des 6 joueurs du marché signés par des rivaux en 200
//        jours, `avancerJourMercato` et `avancerIntersaisonClubsIA` exportées.
//        Faux depuis P1-43b.
//
//   « Amélioration stade/centre : aucun mécanisme d'investissement — niveaux
//     fixes, jamais améliorables »
//     -> mesuré : 4 installations améliorables (220 à 320 k€, 30 à 60 jours),
//        `lancerTravaux` débite le budget et ouvre un chantier. Faux depuis
//        P1-44, et G9 y a branché des effets réels.
//
//   « Changements tactiques en cours de rencontre : aucun hook d'interaction ;
//     tactique figée pour tout le match »
//     -> mesuré : quatre consignes de mi-temps qui écrivent dans les VRAIES
//        clés du moteur, plus un mode « consigne en cours de jeu », couverts
//        par server/test-match-interactif.js.
//
// Seule la quatrième (« Marché des entraîneurs : aucune entité manager IA »)
// était exacte.
//
// Ce fichier vérifie donc, pour chaque affirmation d'ABSENCE, que la chose
// est réellement absente. Le jour où l'une est construite sans que le
// document soit mis à jour, ce test le dit.
//
// Usage : node server/test-roadmap-a-jour.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

const ROADMAP = fs.readFileSync(path.join(__dirname, '../ROADMAP_FOOTBALL_MANAGER.md'), 'utf8');
const mainJs = fs.readFileSync(path.join(__dirname, '../docs/js/main.js'), 'utf8');
const clubUiJs = fs.readFileSync(path.join(__dirname, '../docs/js/clubUI.js'), 'utf8');

// Les lignes du tableau marquées 🔴, c'est-à-dire « rien n'existe ».
function lignesRouges() {
  return ROADMAP.split('\n')
    .filter((l) => l.trim().startsWith('|') && l.includes('🔴'))
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 5)
    .map((c) => ({ fonctionnalite: c[1], fichiers: c[3], detail: c[4] }));
}

// Pour chaque affirmation d'absence, ce qui la DÉMENTIRAIT si ça existait.
// Volontairement explicite : une liste qu'on tient à la main, qu'on lit, et
// qui oblige à trancher — plutôt qu'une heuristique qui laisserait passer.
const DEMENTIS = [
  {
    motif: /concurrence avec les clubs ia/i,
    preuve: 'un mercato des clubs IA',
    existe: () => typeof RMClub.avancerJourMercato === 'function'
      || typeof RMClub.avancerIntersaisonClubsIA === 'function',
  },
  {
    motif: /am[ée]lioration stade|investissement/i,
    preuve: 'des travaux d\'infrastructure réellement lançables',
    existe: () => typeof RMClub.lancerTravaux === 'function'
      && typeof RMClub.dossierInfrastructures === 'function',
  },
  {
    motif: /changements tactiques en cours de rencontre/i,
    preuve: 'des consignes de mi-temps branchées sur le moteur',
    existe: () => /CONSIGNES_MI_TEMPS/.test(mainJs) && /panneauMiTemps/.test(mainJs),
  },
  {
    motif: /march[ée] des entra[îi]neurs|managers? ia/i,
    preuve: 'une entité « manager » sur les clubs adverses',
    existe: () => {
      const s = RMClub.nouvelleSaison(creerRng(4242), 'AS Contrôle');
      return (s.adversaires || []).some((c) => c.manager || c.entraineur);
    },
  },
];

test('R1 — chaque ligne 🔴 est reconnue : aucune affirmation d\'absence non vérifiée', () => {
  const rouges = lignesRouges();
  assert.ok(rouges.length > 0, 'le tableau doit contenir des lignes de statut');
  const inconnues = rouges.filter((r) =>
    !DEMENTIS.some((d) => d.motif.test(r.fonctionnalite) || d.motif.test(r.detail)));
  assert.deepStrictEqual(inconnues.map((r) => r.fonctionnalite), [],
    'ligne(s) 🔴 sans contrôle associé — ajoute son démenti dans DEMENTIS, ' +
    'sans quoi elle peut devenir fausse sans que personne ne le voie');
});

test('R2 — PREUVE : rien de ce que la feuille de route dit ABSENT n\'existe', () => {
  const rouges = lignesRouges();
  const mensonges = [];
  for (const r of rouges) {
    const d = DEMENTIS.find((x) => x.motif.test(r.fonctionnalite) || x.motif.test(r.detail));
    if (!d) continue;
    if (d.existe()) mensonges.push(`« ${r.fonctionnalite} » est marquée 🔴 alors qu'il existe ${d.preuve}`);
  }
  assert.deepStrictEqual(mensonges, [],
    'la feuille de route annonce comme absent ce qui est déjà construit :\n     - ' + mensonges.join('\n     - '));
});

test('R3 — et le document ne prétend pas non plus qu\'un module inexistant est livré', () => {
  // Symétrique du précédent : une ligne 🟢 qui cite un fichier absent du
  // dépôt annoncerait une fonctionnalité livrée qui n'existe pas.
  const cites = new Set();
  for (const ligne of ROADMAP.split('\n')) {
    if (!ligne.trim().startsWith('|')) continue;
    for (const m of ligne.matchAll(/`([a-zA-Z0-9_-]+\.js)`/g)) cites.add(m[1]);
  }
  assert.ok(cites.size >= 10, `trop peu de fichiers cités (${cites.size}) — extraction probablement cassée`);
  const racines = ['docs/js', 'server', 'engine', 'docs'];
  const absents = [...cites].filter((f) =>
    !racines.some((r) => fs.existsSync(path.join(__dirname, '..', r, f))));
  assert.deepStrictEqual(absents, [],
    `fichier(s) cité(s) par la feuille de route mais introuvable(s) : ${absents.join(', ')}`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
