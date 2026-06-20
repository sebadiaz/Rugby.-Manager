// Harnais de test "côté serveur" : exécute le moteur en Node, sans rendu,
// et vérifie que le comportement est réellement cohérent (pas seulement
// que le fichier se parse). Usage : node server/simulate.js [seed] [secondes]
'use strict';

const { MatchEngine, LONGUEUR, LARGEUR } = require('../engine/rugby-engine.js');

const seed = Number(process.argv[2]) || 42;
const dureeSecondes = Number(process.argv[3]) || 600;
const dt = 0.2;

const match = new MatchEngine(seed);
let erreurs = 0;
const idsVus = new Set();
const compteurs = {};

function verifierInvariants(t) {
  for (const j of [...match.equipeA, ...match.equipeB]) {
    if (Number.isNaN(j.x) || Number.isNaN(j.y)) {
      console.error(`t=${t.toFixed(1)}s position NaN pour ${j.team}${j.numero}`);
      erreurs++;
    }
    if (j.x < -1 || j.x > LONGUEUR + 1 || j.y < -1 || j.y > LARGEUR + 1) {
      console.error(`t=${t.toFixed(1)}s ${j.team}${j.numero} hors terrain (${j.x.toFixed(1)}, ${j.y.toFixed(1)})`);
      erreurs++;
    }
  }
  // Le score n'est plus forcément multiple de 5 : essai (5), transformation (+2),
  // pénalité au but (+3) s'additionnent, comme dans les vraies règles du rugby.
  if (!Number.isInteger(match.score.A) || !Number.isInteger(match.score.B) || match.score.A < 0 || match.score.B < 0) {
    console.error(`t=${t.toFixed(1)}s score invalide : A=${match.score.A} B=${match.score.B}`);
    erreurs++;
  }
}

for (let t = 0; t < dureeSecondes; t += dt) {
  match.tick(dt);
  verifierInvariants(t);

  for (const e of match.events) {
    if (idsVus.has(e.id)) continue;
    idsVus.add(e.id);
    compteurs[e.type] = (compteurs[e.type] || 0) + 1;
  }
}

const nbEssais = compteurs.ESSAI || 0;
const nbMelees = (compteurs.MELEE_AVANT || 0) + (compteurs.MELEE_ENAVANT || 0);
const nbTouches = compteurs.TOUCHE || 0;
const nbTransformationsTentees = (compteurs.TRANSFORMATION_REUSSIE || 0) + (compteurs.TRANSFORMATION_RATEE || 0);
const nbPenalitesAuButTentees = (compteurs.PENALITE_REUSSIE || 0) + (compteurs.PENALITE_RATEE || 0);

const state = match.getState();
console.log('--- Résultat simulation ---');
console.log(`Score final : Equipe A ${state.score.A} - ${state.score.B} Equipe B`);
console.log(`Essais : ${nbEssais} | Transformations tentées : ${nbTransformationsTentees} | Pénalités au but tentées : ${nbPenalitesAuButTentees}`);
console.log(`Mêlées (passe en avant / en-avant) : ${nbMelees} | Touches (ballon porté en touche) : ${nbTouches}`);
console.log(`Derniers événements : ${state.events.map(e => e.message).join(' | ')}`);

if (erreurs > 0) {
  console.error(`ECHEC : ${erreurs} invariant(s) violé(s).`);
  process.exit(1);
}
if (nbEssais === 0) {
  console.error('ECHEC : aucun essai marqué sur la durée simulée, comportement suspect.');
  process.exit(1);
}
if (nbMelees === 0) {
  console.error("ECHEC : aucune mêlée déclenchée (passe en avant / en-avant), l'arbitre ne semble jamais intervenir.");
  process.exit(1);
}
if (nbTransformationsTentees === 0) {
  console.error('ECHEC : aucune transformation tentée après un essai, la règle ne semble pas appliquée.');
  process.exit(1);
}
if (nbPenalitesAuButTentees === 0) {
  console.error("ECHEC : aucun coup de pied de pénalité au but tenté, la règle ne semble pas appliquée.");
  process.exit(1);
}
console.log('OK : invariants respectés, essais, mêlées, transformations et pénalités au but observés.');
