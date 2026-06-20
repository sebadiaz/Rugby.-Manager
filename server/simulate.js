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
let nbEssais = 0;
let nbPasses = 0;
let nbMelees = 0;
let nbPenalites = 0;
let dernierePhase = match.phase;

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
  if (match.score.A % 5 !== 0 || match.score.B % 5 !== 0) {
    console.error(`t=${t.toFixed(1)}s score non multiple de 5 : A=${match.score.A} B=${match.score.B}`);
    erreurs++;
  }
}

for (let t = 0; t < dureeSecondes; t += dt) {
  match.tick(dt);
  verifierInvariants(t);

  if (match.phase !== dernierePhase) {
    if (match.phase === 'ESSAI') nbEssais++;
    if (match.phase === 'MELEE') nbMelees++;
    dernierePhase = match.phase;
  }
  for (const e of match.events) {
    if (e.includes('Penalite')) nbPenalites++;
  }
}

const state = match.getState();
console.log('--- Résultat simulation ---');
console.log(`Score final : Equipe A ${state.score.A} - ${state.score.B} Equipe B`);
console.log(`Transitions vers ESSAI : ${nbEssais}`);
console.log(`Transitions vers MELEE (passe en avant / en-avant) : ${nbMelees}`);
console.log(`Derniers événements : ${state.events.join(' | ')}`);

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
console.log('OK : invariants respectés, essais et mêlées observés.');
