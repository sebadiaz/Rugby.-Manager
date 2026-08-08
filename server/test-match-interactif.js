// TEST DE PREUVE — le match doit-il être JOUÉ, ou est-il déjà écrit ?
//
// COMPORTEMENT ACTUEL OBSERVÉ (docs/js/main.js) :
//   genererMatchEnArrierePlan() fait tourner un moteur JETABLE jusqu'au coup
//   de sifflet final, puis appelle onResultat(etatFinal). Le Mode Club
//   enregistre alors le score, la fatigue, les finances, les statistiques —
//   le match est ACQUIS. « Voir le match » construit ENSUITE un second
//   MatchEngine avec la MÊME graine et la MÊME config, qui rejoue à
//   l'identique ce qui est déjà décidé.
//
// POURQUOI C'EST INSUFFISANT : le manager regarde un film. Rien de ce qu'il
// fait pendant la rencontre ne peut changer quoi que ce soit, puisque le
// résultat est déjà écrit dans la sauvegarde avant la première image.
//
// FONCTION EXACTE RESPONSABLE : lancerNouveauMatchAvecGeneration() dans
// docs/js/main.js — elle appelle onResultat AVANT demarrerLectureReelle.
//
// CE QUE CE FICHIER PROUVE, au niveau du MOTEUR (sans navigateur) :
//   1. contrôle  : même graine, aucune intervention -> les deux matchs sont
//                  strictement identiques du début à la fin ;
//   2. exigence  : même graine, jusqu'à la mi-temps -> strictement identiques ;
//   3. exigence  : une décision tactique PRISE À LA MI-TEMPS doit faire
//                  diverger la seconde période.
//
// Si (3) échoue alors que (1) et (2) passent, c'est que la décision du
// manager n'a aucun effet : le problème n'est PAS corrigé.
//
// Usage : node server/test-match-interactif.js
'use strict';

const assert = require('assert');
const RugbyEngine = require('../docs/rugby-engine.js');

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error(e); }
}

const PAS = 1 / 60;
const DUREE = 600; // 10 minutes de jeu : assez d'actions pour observer une divergence

// Deux effectifs distincts et réalistes, dérivés d'une graine, pour que les
// tactiques aient de la matière (un ouvreur qui botte bien, des avants
// puissants, etc.).
function joueurs(base) {
  const l = [];
  for (let n = 1; n <= 15; n++) {
    l.push({
      numero: n,
      vitesse: 55 + ((base + n * 7) % 25),
      plaquage: 55 + ((base + n * 11) % 25),
      adresse: 55 + ((base + n * 13) % 25),
      endurance: 60 + ((base + n * 3) % 20),
      puissance: 55 + ((base + n * 5) % 25),
      passe: 55 + ((base + n * 17) % 25),
      jeuPied: 50 + ((base + n * 19) % 30),
      decision: 55 + ((base + n * 23) % 25),
      discipline: 60 + ((base + n * 29) % 20),
      melee: 55 + ((base + n * 31) % 25),
      touche: 55 + ((base + n * 37) % 25),
    });
  }
  return l;
}

function config() {
  return { joueursA: joueurs(1), joueursB: joueurs(2) };
}

function creer(graine) {
  return new RugbyEngine.MatchEngine(graine, DUREE, config());
}

// Empreinte de l'état : ce qui décrit RÉELLEMENT le déroulé (score, phase,
// position du ballon, possession), pas des détails de rendu.
function empreinte(m) {
  const e = m.getState();
  const b = e.ballon || {};
  return [
    Math.round(e.tempsMatch * 60),
    e.score.A, e.score.B, e.phase,
    Math.round((b.x || 0) * 100) / 100,
    Math.round((b.y || 0) * 100) / 100,
    e.possession,
  ].join('|');
}

function avancerJusqua(m, tempsCible) {
  const traces = [];
  let garde = 0;
  while (m.tempsMatch < tempsCible && m.phase !== 'TERMINE' && garde < 200000) {
    m.tick(PAS);
    traces.push(empreinte(m));
    garde++;
  }
  return traces;
}

// --- 1. Contrôle : le moteur EST déterministe ------------------------------
test('contrôle : même graine et aucune intervention -> deux matchs strictement identiques', () => {
  const a = creer(12345), b = creer(12345);
  const ta = avancerJusqua(a, DUREE), tb = avancerJusqua(b, DUREE);
  assert.strictEqual(ta.length, tb.length, 'même nombre de pas simulés');
  assert.deepStrictEqual(ta, tb, 'le moteur doit être parfaitement déterministe');
  assert.ok(ta.length > 100, 'le scénario doit réellement simuler un match');
});

// --- 2. Exigence : identiques jusqu'à la mi-temps --------------------------
test('exigence 1 : même graine -> strictement identiques JUSQU\'À la mi-temps', () => {
  const a = creer(12345), b = creer(12345);
  const miTemps = DUREE / 2;
  const ta = avancerJusqua(a, miTemps), tb = avancerJusqua(b, miTemps);
  assert.deepStrictEqual(ta, tb, 'la première période doit être identique');
  assert.ok(a.tempsMatch >= miTemps, 'la mi-temps doit être atteinte');
});

// --- 3. Exigence : une décision à la mi-temps fait diverger ----------------
test('exigence 2 : une DÉCISION tactique à la mi-temps fait diverger la seconde période', () => {
  const miTemps = DUREE / 2;
  const a = creer(12345), b = creer(12345);
  avancerJusqua(a, miTemps);
  avancerJusqua(b, miTemps);
  assert.strictEqual(empreinte(a), empreinte(b), 'même état à la mi-temps (pré-requis)');

  // LA décision du manager. Deux consignes opposées, appliquées EN COURS de
  // match par le point d'entrée que le jeu doit fournir.
  assert.strictEqual(typeof a.appliquerTactiqueEnCours, 'function',
    'le moteur doit exposer un point d\'entrée pour changer de tactique EN COURS de match');
  // Consigne A : « on occupe au pied et on monte vite ».
  a.appliquerTactiqueEnCours('A', {
    attaque: { tauxJeuAuPied: 6, jeuLargeTaux: { pression: 0.6, calme: 0.5 } },
    defense: { rampeMontee: 0.2 },
  });
  // Consigne B : « on garde le ballon à la main et on défend en retrait ».
  b.appliquerTactiqueEnCours('A', {
    attaque: { tauxJeuAuPied: 0.2, jeuLargeTaux: { pression: 2.6, calme: 2.2 } },
    defense: { rampeMontee: 5 },
  });

  const ta = avancerJusqua(a, DUREE), tb = avancerJusqua(b, DUREE);
  assert.notDeepStrictEqual(ta, tb,
    'deux consignes opposées à la mi-temps DOIVENT produire deux secondes périodes différentes');
});

test('exigence 3 : un remplacement décidé en cours de match change RÉELLEMENT la suite', () => {
  const miTemps = DUREE / 2;
  const a = creer(999), b = creer(999);
  avancerJusqua(a, miTemps);
  avancerJusqua(b, miTemps);
  assert.strictEqual(empreinte(a), empreinte(b), 'même état à la mi-temps (pré-requis)');
  assert.strictEqual(typeof a.remplacerJoueurEnCours, 'function',
    'le moteur doit exposer un point d\'entrée de remplacement EN COURS de match');
  // On fait entrer un joueur nettement plus rapide sur le numéro 11 (ailier).
  a.remplacerJoueurEnCours('A', 11, {
    numero: 11, vitesse: 95, plaquage: 80, adresse: 80, endurance: 90, puissance: 80,
    passe: 80, jeuPied: 70, decision: 80, discipline: 80, melee: 60, touche: 60,
  });
  const ta = avancerJusqua(a, DUREE), tb = avancerJusqua(b, DUREE);
  assert.notDeepStrictEqual(ta, tb,
    'faire entrer un joueur très différent DOIT changer la suite du match');
});

test('exigence 4 : SANS décision, la seconde période reste identique (la divergence vient bien du choix)', () => {
  const miTemps = DUREE / 2;
  const a = creer(12345), b = creer(12345);
  avancerJusqua(a, miTemps);
  avancerJusqua(b, miTemps);
  const ta = avancerJusqua(a, DUREE), tb = avancerJusqua(b, DUREE);
  assert.deepStrictEqual(ta, tb,
    'sans intervention, les deux secondes périodes doivent rester identiques');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) console.error('ECHEC : le match n\'est pas réellement jouable.');
else console.log('OK : une décision prise pendant le match change réellement la suite.');
