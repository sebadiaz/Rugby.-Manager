// COUVERTURE — les infrastructures doivent avoir un effet RÉEL.
//
// Audit mesuré avant cette tranche, niveau 1 contre niveau 3 :
//
//   stade         effet déclaré ×1,36   recette d'un match  56 → 75   BRANCHÉ
//   medical       effet déclaré ×1,18   risque de blessure divisé     BRANCHÉ
//   formation     effet déclaré ×1,40   AUCUN consommateur            décoratif
//   entrainement  effet déclaré ×1,24   AUCUN consommateur            décoratif
//
// Deux installations sur quatre affichaient donc un gain, coûtaient un
// chantier (300 k€ / 60 jours pour la formation, 220 k€ / 30 jours pour les
// terrains) et un entretien à chaque journée — sans rien changer au jeu.
// C'est précisément le « bonus décoratif » qu'un jeu de gestion ne doit pas
// avoir : le manager payait pour rien.
//
// Usage : node server/test-infrastructures-effets.js
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

let graine = 81000;
function carriere(niveaux) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'AS Infra');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  for (const cle of Object.keys(niveaux || {})) {
    s.clubJoueur.infrastructures[cle].niveau = niveaux[cle];
  }
  return s;
}

// Compte les progressions produites par N séances identiques, à graine
// identique : la SEULE différence entre les deux mesures est le niveau
// d'infrastructure.
function progressionsSurSeances(niveauTerrains, nbSeances) {
  const s = carriere({ entrainement: niveauTerrains });
  // Marge de progression RÉELLE : sans elle la mesure sature. Mesuré, un
  // effectif de départ atteint son potentiel après 3 séances utiles, et le
  // compte reste bloqué à 3 quel que soit le nombre de séances — un joueur
  // ne progresse jamais au-delà de son potentiel (`actuel >= potentiel`).
  for (const j of s.clubJoueur.effectif) {
    j.potentiel = 99;
    j.age = 23;             // pleine période de développement
    j.matchsJoues = 5;
  }
  let total = 0;
  for (let i = 0; i < nbSeances; i++) {
    const r = RMClub.appliquerSeance(creerRng(1000 + i), s.clubJoueur.effectif,
      'attaque', 1, 1, s);
    total += (r || []).length;
    // On remet la fatigue à zéro : on mesure l'effet des terrains, pas
    // l'accumulation de fatigue.
    for (const j of s.clubJoueur.effectif) j.fatigue = 0;
  }
  return total;
}

test('F1 — l\'installation « terrains » change RÉELLEMENT la progression', () => {
  const bas = progressionsSurSeances(1, 60);
  const haut = progressionsSurSeances(3, 60);
  assert.ok(bas > 0, `des progressions doivent survenir au niveau 1 (${bas})`);
  assert.ok(haut > bas,
    `des terrains de niveau 3 doivent produire plus de progressions (${bas} → ${haut})`);
});

test('F2 — l\'installation « centre de formation » change RÉELLEMENT les jeunes', () => {
  // Le centre de formation doit peser sur la qualité des jeunes qui y entrent
  // et sur leur progression. On compare la même intersaison, même graine,
  // avec deux niveaux de centre.
  function niveauMoyenJeunes(niveauCentre) {
    const s = carriere({ formation: niveauCentre });
    RMClub.assurerCentreFormation(creerRng(7), s);
    RMClub.progresserCentreFormation(creerRng(11), s);
    const jeunes = s.clubJoueur.jeunes || [];
    assert.ok(jeunes.length, 'le centre doit contenir des jeunes');
    return jeunes.reduce((t, j) => t + (j.potentiel || 0), 0) / jeunes.length;
  }
  const bas = niveauMoyenJeunes(1);
  const haut = niveauMoyenJeunes(3);
  assert.ok(haut > bas,
    `un centre de niveau 3 doit produire de meilleurs potentiels (${bas.toFixed(1)} → ${haut.toFixed(1)})`);
});

test('F3 — les deux installations déjà branchées le restent', () => {
  // Non-régression : cette tranche ne doit rien casser de ce qui marchait.
  const bas = carriere({ stade: 1 });
  const haut = carriere({ stade: 3 });
  const r1 = RMClub.appliquerFinancesMatch(bas.clubJoueur, 'v', 26, { domicile: true });
  const r3 = RMClub.appliquerFinancesMatch(haut.clubJoueur, 'v', 26, { domicile: true });
  assert.ok(r3.recette > r1.recette,
    `le stade doit toujours rapporter davantage (${r1.recette} → ${r3.recette})`);
  const sMed1 = carriere({ medical: 1 });
  const sMed3 = carriere({ medical: 3 });
  assert.ok(RMClub.effetInfrastructure(sMed3, 'medical') > RMClub.effetInfrastructure(sMed1, 'medical'),
    'le centre médical doit toujours réduire le risque');
});

test('F4 — CHAQUE installation a un consommateur réel dans le code', () => {
  // Le test qui empêche la régression de fond : une installation qui affiche
  // un gain doit être LUE quelque part en dehors de son propre module.
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '../docs/js');
  const fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'club-infrastructures.js');
  const source = fichiers.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  for (const cle of ['stade', 'medical', 'formation', 'entrainement']) {
    const lu = new RegExp(`effetInfrastructure\\([^)]*['"]${cle}['"]`).test(source)
      || new RegExp(`infrastructures\\.${cle}`).test(source);
    assert.ok(lu, `l'installation « ${cle} » n'est lue par aucun autre module : son gain est décoratif`);
  }
});

test('F5 — le gain annoncé à l\'écran correspond au gain appliqué', () => {
  const s = carriere({ entrainement: 3 });
  const dossier = RMClub.dossierInfrastructures(s);
  const terrains = dossier.lignes.find((i) => i.cle === 'entrainement');
  assert.ok(terrains, 'les terrains doivent figurer au dossier');
  const attendu = Math.round((RMClub.effetInfrastructure(s, 'entrainement') - 1) * 100);
  assert.strictEqual(terrains.gainActuel, attendu,
    'l\'écran doit annoncer exactement le facteur réellement appliqué');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
