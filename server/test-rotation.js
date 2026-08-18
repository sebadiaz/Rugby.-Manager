// COUVERTURE — aide à la rotation de l'effectif.
//
// Audit mesuré avant cette tranche : toute la donnée existe (fatigue,
// endurance, matchsJoues, statut promis, gabarit de 24 places sur 9 postes,
// règle de récupération de 5 points/jour) mais RIEN ne l'agrège :
//   profondeurEffectif   -> undefined
//   suggestionRotation   -> undefined
//   recuperationPrevue   -> undefined
//
// Le manager voyait donc une barre de fatigue par joueur, et devait faire
// lui-même le calcul de qui reposer, qui est doublure à quel poste, et dans
// combien de jours un titulaire cuit redevient alignable.
//
// Règle absolue de cette tranche : SUGGESTION uniquement. Aucune fonction ne
// modifie une composition — le manager garde la décision.
//
// Usage : node server/test-rotation.js
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

let graine = 91000;
function carriere() {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Rotation');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  return s;
}

test('R1 — la profondeur est calculée POSTE PAR POSTE, avec une hiérarchie', () => {
  const s = carriere();
  const p = RMClub.profondeurEffectif(s, 'pro');
  assert.ok(Array.isArray(p.postes) && p.postes.length, 'une liste de postes');
  for (const ligne of p.postes) {
    assert.ok(ligne.poste, 'chaque ligne nomme son poste');
    assert.ok(typeof ligne.requis === 'number', 'et le nombre de places du gabarit');
    assert.ok(Array.isArray(ligne.joueurs), 'et ses joueurs classés');
    // La hiérarchie est réelle : rang 1 = titulaire, 2 = doublure, 3 = 3e choix.
    ligne.joueurs.forEach((j, i) => {
      assert.strictEqual(j.rang, i + 1, 'les rangs se suivent');
      assert.ok(j.role, `${j.nom} doit avoir un rôle nommé`);
    });
    if (ligne.joueurs.length) {
      assert.strictEqual(ligne.joueurs[0].role, 'titulaire');
      if (ligne.joueurs[1]) assert.strictEqual(ligne.joueurs[1].role, 'doublure');
      if (ligne.joueurs[2]) assert.strictEqual(ligne.joueurs[2].role, 'troisieme');
    }
  }
});

test('R2 — un poste sans doublure est signalé comme fragile', () => {
  const s = carriere();
  const p0 = RMClub.profondeurEffectif(s, 'pro');
  const ligne = p0.postes.find((l) => l.joueurs.length >= 2);
  assert.ok(ligne, 'il faut un poste avec au moins deux joueurs');
  // On retire tout le monde sauf le titulaire à ce poste.
  const garder = ligne.joueurs[0].id;
  s.clubJoueur.effectif = s.clubJoueur.effectif.filter(
    (j) => j.poste !== ligne.poste || j.id === garder);
  const p1 = RMClub.profondeurEffectif(s, 'pro');
  const apres = p1.postes.find((l) => l.poste === ligne.poste);
  assert.strictEqual(apres.joueurs.length, 1);
  assert.strictEqual(apres.fragile, true, 'un poste sans doublure est fragile');
  assert.ok(p1.postesFragiles.indexOf(ligne.poste) !== -1,
    'et il remonte dans la liste des postes fragiles');
});

test('R3 — la récupération prévue suit la MÊME règle que le jeu', () => {
  // Source unique : la projection affichée doit être exactement ce que le
  // moteur applique jour après jour, jamais une seconde formule.
  const s = carriere();
  const j = s.clubJoueur.effectif[0];
  j.fatigue = 70;
  const prevu = RMClub.recuperationPrevue(j, 4, 1);
  assert.strictEqual(typeof prevu.dans, 'object', 'une projection par jour');
  assert.strictEqual(prevu.dans.length, 4, 'quatre jours demandés');
  // On rejoue les 4 vrais jours de récupération sur une copie.
  const copie = JSON.parse(JSON.stringify(j));
  for (let i = 0; i < 4; i++) RMClub.recupererFatigueDuJour([copie], 1);
  assert.strictEqual(prevu.dans[3], copie.fatigue,
    `la projection (${prevu.dans[3]}) doit égaler la simulation réelle (${copie.fatigue})`);
  assert.strictEqual(j.fatigue, 70, 'et la projection ne modifie RIEN');
});

test('R4 — la surcharge et la sous-utilisation sont détectées', () => {
  const s = carriere();
  const eff = s.clubJoueur.effectif;
  // Saison déjà entamée : sans matchs joués dans le groupe, la moyenne est
  // nulle et personne ne peut être « sous-utilisé » — c'est voulu, on ne
  // signale pas 24 remplaçants au coup d'envoi de la saison.
  for (const j of eff) { j.matchsJoues = 8; j.fatigue = 40; }
  eff[0].fatigue = 85; eff[0].matchsJoues = 14;
  eff[1].fatigue = 10; eff[1].matchsJoues = 0;
  const c = RMClub.chargeEffectif(s, 'pro');
  assert.ok(c.surcharges.some((x) => x.id === eff[0].id),
    'un joueur très fatigué et très utilisé doit être signalé en surcharge');
  assert.ok(c.sousUtilises.some((x) => x.id === eff[1].id),
    'un joueur frais qui ne joue jamais doit être signalé');
  for (const x of c.surcharges) assert.ok(x.motif, 'chaque alerte porte un motif');
});

test('R5 — la suggestion propose un XV COMPLET et valide', () => {
  const s = carriere();
  const sug = RMClub.suggestionRotation(s, 'pro');
  assert.ok(sug, 'une suggestion doit exister');
  assert.strictEqual(Object.keys(sug.composition).length, 15, 'quinze postes');
  assert.deepStrictEqual(RMClub.validerComposition(sug.composition), [],
    'la composition suggérée doit être valide');
  const ids = Object.values(sug.composition);
  assert.strictEqual(new Set(ids).size, 15, 'aucun joueur en double');
});

test('R6 — la suggestion repose RÉELLEMENT les joueurs cuits', () => {
  const s = carriere();
  const actuelle = RMClub.slotCompositionPourEquipe(s, 'pro').compositionTitulaires;
  // On épuise cinq titulaires.
  const cuits = Object.values(actuelle).slice(0, 5);
  for (const id of cuits) {
    const j = s.clubJoueur.effectif.find((x) => x.id === id);
    j.fatigue = 90; j.matchsJoues = 15;
  }
  const sug = RMClub.suggestionRotation(s, 'pro');
  const proposes = new Set(Object.values(sug.composition));
  const encoreAlignes = cuits.filter((id) => proposes.has(id));
  assert.ok(encoreAlignes.length < cuits.length,
    `des joueurs à 90 de fatigue doivent sortir du XV (${encoreAlignes.length}/5 encore alignés)`);
  assert.ok(sug.changements.length > 0, 'et les changements doivent être listés');
  for (const ch of sug.changements) {
    assert.ok(ch.sort && ch.entre, 'chaque changement nomme qui sort et qui entre');
    assert.ok(ch.raison, 'et pourquoi');
  }
});

test('R7 — un blessé n\'est JAMAIS suggéré', () => {
  const s = carriere();
  const j = s.clubJoueur.effectif[0];
  j.blessureJournees = 20;
  const sug = RMClub.suggestionRotation(s, 'pro');
  assert.ok(!Object.values(sug.composition).includes(j.id),
    'un joueur blessé ne peut pas être proposé');
});

test('R8 — SUGGESTION seulement : rien n\'est modifié', () => {
  const s = carriere();
  const slot = RMClub.slotCompositionPourEquipe(s, 'pro');
  const avant = JSON.stringify(slot.compositionTitulaires);
  const fatigueAvant = s.clubJoueur.effectif.map((j) => j.fatigue || 0).join(',');
  RMClub.profondeurEffectif(s, 'pro');
  RMClub.chargeEffectif(s, 'pro');
  RMClub.suggestionRotation(s, 'pro');
  assert.strictEqual(JSON.stringify(slot.compositionTitulaires), avant,
    'la composition du manager ne doit pas bouger');
  assert.strictEqual(s.clubJoueur.effectif.map((j) => j.fatigue || 0).join(','), fatigueAvant,
    'ni la fatigue');
});

test('R9 — le dossier marche pour les TROIS équipes, sans branche par équipe', () => {
  const s = carriere();
  RMClub.assurerCompetitionB(s);
  RMClub.assurerCentreFormation(creerRng(3), s);
  for (const equipe of ['pro', 'b', 'jeunes']) {
    const d = RMClub.dossierRotation(s, equipe);
    assert.ok(d, `${equipe} doit avoir un dossier`);
    assert.ok(d.profondeur && d.charge, `${equipe} : profondeur et charge`);
    assert.strictEqual(d.equipe, equipe);
  }
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
