// TEST DE PREUVE — la sélection automatique comprend-elle le RUGBY ?
//
// COMPORTEMENT ACTUEL OBSERVÉ (docs/js/club-composition.js) :
//   meilleurCandidatPourNumero() classe les candidats avec
//     pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
//   Deux attributs, les mêmes pour les quinze postes. Mêlée, touche,
//   puissance, endurance, passe, jeu au pied, décision et discipline ne pèsent
//   RIEN dans le choix du XV — alors qu'ils existent sur chaque joueur et que
//   le moteur, lui, les utilise réellement.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : le manager qui recrute un
// pilier de mêlée voit la sélection automatique lui préférer un pilier rapide
// et bon plaqueur mais incapable de tenir une mêlée. Son travail de
// recrutement et de formation ne se traduit pas dans l'équipe alignée, et
// aucun choix de profil n'a de conséquence.
//
// FONCTION EXACTE RESPONSABLE : meilleurCandidatPourNumero(), et par
// conséquent meilleureComposition() et completerComposition() qui s'appuient
// dessus.
//
// SCÉNARIO DE REPRODUCTION : deux piliers, l'un 90 vitesse / 90 plaquage /
// 25 mêlée, l'autre 60 / 65 / 85. La sélection choisit le premier.
//
// Usage : node server/test-composition-postes.js
'use strict';

const assert = require('assert');
global.window = global;
global.localStorage = (() => { let st = {}; return {
  getItem: (k) => (k in st ? st[k] : null), setItem: () => {}, removeItem: () => {} }; })();
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error(e.message); }
}

let compteur = 0;
// Joueur neutre : tous les attributs à 60, on ne surcharge QUE ce qu'on veut
// tester. Sans ça, un attribut oublié rendrait le résultat illisible.
function joueur(poste, sur) {
  compteur++;
  return Object.assign({
    id: 'j' + compteur, nom: 'Joueur ' + compteur, poste,
    age: 26, contrat: 3, salaire: 20,
    vitesse: 60, plaquage: 60, adresse: 60, melee: 60, touche: 60,
    puissance: 60, endurance: 60, passe: 60, jeuPied: 60, decision: 60,
    discipline: 60, potentiel: 75,
    fatigue: 0, moral: 65, blessureJournees: 0, pret: null,
  }, sur || {});
}

// --- LE test demandé : un pilier n'est pas un ailier -----------------------
test('pilier : un rapide/bon plaqueur SANS mêlée ne passe PAS devant un vrai pilier de mêlée', () => {
  const athlete = joueur('P', { nom: 'Athlète', vitesse: 90, plaquage: 90, melee: 25 });
  const pilier = joueur('P', { nom: 'Pilier', vitesse: 60, plaquage: 65, melee: 85 });
  const choisi = RMClub.meilleurCandidatPourNumero([athlete, pilier], 'P', new Set());
  assert.strictEqual(choisi.nom, 'Pilier',
    `pour le poste de pilier, la mêlée doit primer (choisi : ${choisi.nom})`);
});

test('pilier : entre deux profils de mêlée proches, la puissance départage', () => {
  const a = joueur('P', { nom: 'Faible', melee: 80, puissance: 45 });
  const b = joueur('P', { nom: 'Puissant', melee: 80, puissance: 85 });
  const choisi = RMClub.meilleurCandidatPourNumero([a, b], 'P', new Set());
  assert.strictEqual(choisi.nom, 'Puissant');
});

test('ailier : le RAISONNEMENT est différent — la vitesse prime, la mêlée ne compte pas', () => {
  const athlete = joueur('AI', { nom: 'Rapide', vitesse: 90, plaquage: 90, melee: 25 });
  const pilierType = joueur('AI', { nom: 'Lourd', vitesse: 60, plaquage: 65, melee: 85 });
  const choisi = RMClub.meilleurCandidatPourNumero([athlete, pilierType], 'AI', new Set());
  assert.strictEqual(choisi.nom, 'Rapide',
    `pour un ailier, c'est la vitesse qui doit primer (choisi : ${choisi.nom})`);
});

test('talonneur : la touche pèse réellement (ce n\'est pas un pilier)', () => {
  const a = joueur('T', { nom: 'Sans touche', touche: 30, vitesse: 75, plaquage: 75 });
  const b = joueur('T', { nom: 'Lanceur', touche: 90, vitesse: 60, plaquage: 60 });
  const choisi = RMClub.meilleurCandidatPourNumero([a, b], 'T', new Set());
  assert.strictEqual(choisi.nom, 'Lanceur');
});

test('deuxième ligne : touche et puissance priment sur la vitesse pure', () => {
  const a = joueur('2L', { nom: 'Sprinteur', vitesse: 90, touche: 35, puissance: 50 });
  const b = joueur('2L', { nom: 'Sauteur', vitesse: 55, touche: 88, puissance: 82 });
  const choisi = RMClub.meilleurCandidatPourNumero([a, b], '2L', new Set());
  assert.strictEqual(choisi.nom, 'Sauteur');
});

test('demi de mêlée : la passe est décisive', () => {
  const a = joueur('DM', { nom: 'Sans passe', passe: 35, vitesse: 85, plaquage: 80 });
  const b = joueur('DM', { nom: 'Passeur', passe: 92, vitesse: 65, plaquage: 60 });
  const choisi = RMClub.meilleurCandidatPourNumero([a, b], 'DM', new Set());
  assert.strictEqual(choisi.nom, 'Passeur');
});

test('ouvreur : jeu au pied et décision priment sur le plaquage', () => {
  const a = joueur('OV', { nom: 'Plaqueur', plaquage: 92, jeuPied: 35, decision: 45 });
  const b = joueur('OV', { nom: 'Ouvreur', plaquage: 55, jeuPied: 88, decision: 86 });
  const choisi = RMClub.meilleurCandidatPourNumero([a, b], 'OV', new Set());
  assert.strictEqual(choisi.nom, 'Ouvreur');
});

test('arrière : le jeu au pied compte, contrairement à un centre', () => {
  const a = joueur('AR', { nom: 'Sans pied', jeuPied: 30, vitesse: 80 });
  const b = joueur('AR', { nom: 'Buteur', jeuPied: 90, vitesse: 74 });
  const arriere = RMClub.meilleurCandidatPourNumero([a, b], 'AR', new Set());
  assert.strictEqual(arriere.nom, 'Buteur');
  // Le MÊME duo jugé au centre doit pouvoir donner un autre gagnant : c'est la
  // preuve que l'évaluation dépend réellement du poste.
  const c = joueur('CE', { nom: 'Sans pied CE', jeuPied: 30, vitesse: 80, puissance: 85, plaquage: 82 });
  const d = joueur('CE', { nom: 'Buteur CE', jeuPied: 90, vitesse: 74, puissance: 50, plaquage: 55 });
  const centre = RMClub.meilleurCandidatPourNumero([c, d], 'CE', new Set());
  assert.strictEqual(centre.nom, 'Sans pied CE',
    'au centre, puissance et plaquage doivent primer sur le jeu au pied');
});

// --- Hors poste : une vraie pénalité --------------------------------------
test('hors poste : à niveau égal, un joueur DU poste passe devant un joueur d\'un autre poste', () => {
  const duPoste = joueur('P', { nom: 'Vrai pilier', melee: 70, puissance: 70 });
  const horsPoste = joueur('AI', { nom: 'Ailier bricolé', melee: 70, puissance: 70, vitesse: 95 });
  // Aucun pilier libre : le pool retombe sur tout l'effectif (comportement
  // existant), mais le joueur du poste doit rester devant.
  const choisi = RMClub.meilleurCandidatPourNumero([horsPoste, duPoste], 'P', new Set());
  assert.strictEqual(choisi.nom, 'Vrai pilier');
});

test('hors poste : la pénalité est RÉELLE et mesurable, pas symbolique', () => {
  assert.strictEqual(typeof RMClub.noteAuPoste, 'function',
    'une note par poste doit être exposée et testable');
  const j = joueur('P', { melee: 80, puissance: 80 });
  const auPoste = RMClub.noteAuPoste(j, 'P');
  const horsPoste = RMClub.noteAuPoste(j, 'AI');
  assert.ok(auPoste > horsPoste,
    `le même joueur doit valoir moins hors de son poste (${auPoste} vs ${horsPoste})`);
  assert.ok(auPoste - horsPoste >= 5,
    `la pénalité doit être significative, pas cosmétique (écart ${auPoste - horsPoste})`);
});

test('hors poste : un joueur EXCELLENT ailleurs peut quand même dépanner s\'il n\'y a personne', () => {
  const seul = joueur('AI', { nom: 'Dépanneur', vitesse: 95, plaquage: 90 });
  const choisi = RMClub.meilleurCandidatPourNumero([seul], 'P', new Set());
  assert.ok(choisi, 'un poste ne doit jamais rester vide s\'il reste quelqu\'un');
  assert.strictEqual(choisi.nom, 'Dépanneur');
});

// --- La composition complète reste cohérente ------------------------------
test('composition complète : les 15 numéros sont pourvus, sans doublon', () => {
  const effectif = [];
  for (const p of RMClub.GABARIT_EFFECTIF) effectif.push(joueur(p));
  const compo = RMClub.meilleureComposition(effectif);
  const numeros = Object.keys(compo);
  assert.strictEqual(numeros.length, 15, `15 numéros attendus, ${numeros.length} obtenus`);
  const ids = numeros.map((n) => compo[n]);
  assert.strictEqual(new Set(ids).size, 15, 'aucun joueur ne peut occuper deux postes');
});

test('composition complète : chaque numéro reçoit un joueur DE son poste quand l\'effectif le permet', () => {
  const effectif = [];
  for (const p of RMClub.GABARIT_EFFECTIF) effectif.push(joueur(p));
  const compo = RMClub.meilleureComposition(effectif);
  const parId = {};
  for (const j of effectif) parId[j.id] = j;
  for (const numero of Object.keys(compo)) {
    const attendu = RMClub.POSTE_REQUIS[numero];
    assert.strictEqual(parId[compo[numero]].poste, attendu,
      `le n°${numero} doit être un ${attendu}`);
  }
});

test('un blessé n\'est jamais préféré à un joueur disponible du même poste', () => {
  const blesse = joueur('OV', { nom: 'Blessé', jeuPied: 99, decision: 99, blessureJournees: 5 });
  const valide = joueur('OV', { nom: 'Valide', jeuPied: 50, decision: 50 });
  const choisi = RMClub.meilleurCandidatPourNumero([blesse, valide], 'OV', new Set());
  assert.strictEqual(choisi.nom, 'Valide');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) console.error('ECHEC : la sélection automatique ne raisonne pas par poste.');
else console.log('OK : chaque poste est évalué avec les attributs qui comptent pour lui.');
