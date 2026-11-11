/*
 * Rugby Manager — V4, ontologie canonique des faits (RM4-G03).
 *
 * Source de la liste : docs/SIMULATION_V4/05_CATALOGUE_GOALS_ACTIONS.md §1
 * (le test server/test-v4-facts.js vérifie qu'elle est identique). Ce module ne
 * porte AUCUN état de match : il décrit les faits, valide un ensemble de faits
 * et détecte ses contradictions. Zéro Date.now(), Math.random() ou état partagé.
 *
 * `authority` :
 *   - 'authoritative' : lu tel quel dans le moteur (phase, possession, ballon...) ;
 *   - 'self'          : état du joueur lui-même (position, au sol, lié...) ;
 *   - 'perceived'     : estimation GÉOMÉTRIQUE d'un agent à un instant (horodatée) ;
 *   - 'event'         : nécessite le journal d'événements (pas un instantané) ;
 *   - 'future'        : pas encore calculable (tâches RM4 suivantes) : JAMAIS
 *                       renvoyé comme faux, il est simplement absent.
 */
'use strict';

const FACT_SCHEMA_VERSION = '1.0.0';

// nom -> { scope, authority, implemented }
const FACTS = Object.freeze({
  SELF_ONSIDE: { scope: 'individuel', authority: 'self', implemented: true },
  SELF_AVAILABLE: { scope: 'individuel', authority: 'self', implemented: true },
  SELF_GROUNDED: { scope: 'individuel', authority: 'self', implemented: true },
  SELF_BOUND: { scope: 'individuel', authority: 'self', implemented: true },
  SELF_AT_RUCK: { scope: 'individuel', authority: 'self', implemented: true },
  SELF_AT_TARGET: { scope: 'individuel', authority: 'self', implemented: true }, // seulement si une cible est fournie
  HAS_BALL: { scope: 'individuel', authority: 'self', implemented: true },
  BALL_IN_FLIGHT: { scope: 'partagé', authority: 'authoritative', implemented: true },
  BALL_AT_RUCK: { scope: 'partagé', authority: 'authoritative', implemented: true },
  RUCK_WON: { scope: 'équipe', authority: 'future', implemented: false },
  BALL_AVAILABLE: { scope: 'partagé', authority: 'authoritative', implemented: true },
  PASS_LANE_10_OPEN: { scope: 'agent', authority: 'perceived', implemented: true },
  PASS_LANE_POD_OPEN: { scope: 'agent', authority: 'future', implemented: false },
  SAFE_SUPPORT_LANE: { scope: 'agent', authority: 'future', implemented: false },
  GAP_NEARBY: { scope: 'agent', authority: 'future', implemented: false },
  DEFENSIVE_GAP_CLOSED: { scope: 'équipe', authority: 'future', implemented: false },
  TEAM_POSSESSION: { scope: 'équipe', authority: 'authoritative', implemented: true },
  OPPONENT_POSSESSION: { scope: 'équipe', authority: 'authoritative', implemented: true },
  BREAKDOWN_CONTEST_ACTIVE: { scope: 'phase', authority: 'authoritative', implemented: true },
  LINEOUT_READY: { scope: 'phase', authority: 'future', implemented: false },
  SCRUM_SET: { scope: 'phase', authority: 'authoritative', implemented: true },
  SCRUM_BALL_IN: { scope: 'phase', authority: 'authoritative', implemented: true },
  MAUL_BIND_LEGAL: { scope: 'phase', authority: 'future', implemented: false },
  KICK_CHASE_ONSIDE: { scope: 'individuel', authority: 'self', implemented: true },
  RECEIVER_OPEN: { scope: 'individuel', authority: 'perceived', implemented: true },
  DISTRIBUTED: { scope: 'résultat', authority: 'event', implemented: false },
  POSSESSION_SECURED: { scope: 'équipe', authority: 'future', implemented: false },
  TRY_PREVENTED: { scope: 'résultat', authority: 'event', implemented: false },
  TRY_SCORED: { scope: 'résultat', authority: 'authoritative', implemented: true },
});
const FACT_NAMES = Object.freeze(Object.keys(FACTS));

// Paires de faits qui ne peuvent PAS être vraies ensemble (ballon en vol et
// porté, au sol et lié, deux possessions...). [a, b, raison]
const CONFLICTS = Object.freeze([
  ['BALL_IN_FLIGHT', 'HAS_BALL', 'ballon en vol et porté'],
  ['BALL_IN_FLIGHT', 'BALL_AT_RUCK', 'ballon en vol et au ruck'],
  ['BALL_IN_FLIGHT', 'SCRUM_BALL_IN', 'ballon en vol et dans la mêlée'],
  ['SELF_GROUNDED', 'SELF_BOUND', 'joueur au sol et lié'],
  ['SELF_GROUNDED', 'SELF_AVAILABLE', 'joueur au sol et disponible'],
  ['SELF_GROUNDED', 'HAS_BALL', 'joueur au sol et porteur'],
  ['SELF_GROUNDED', 'SELF_AT_RUCK', 'joueur au sol et accès au ruck'],
  ['TEAM_POSSESSION', 'OPPONENT_POSSESSION', 'deux possessions'],
  ['HAS_BALL', 'OPPONENT_POSSESSION', 'porteur dans l\'équipe qui n\'a pas la possession'],
]);
// Implications : si `si` est vrai, `alors` doit l'être aussi (sinon conflit).
const IMPLICATIONS = Object.freeze([
  ['SCRUM_BALL_IN', 'SCRUM_SET'],
  ['HAS_BALL', 'TEAM_POSSESSION'],
]);

function estBool(v) { return v === true || v === false; }

// Valide un ensemble de faits à plat : noms canoniques, valeurs booléennes.
function validateFactSet(facts, label = 'facts') {
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) throw new TypeError(label + ' doit être un objet');
  for (const [k, v] of Object.entries(facts)) {
    if (!Object.prototype.hasOwnProperty.call(FACTS, k)) throw new TypeError(`${label} : fait inconnu ${k}`);
    if (!estBool(v)) throw new TypeError(`${label} : ${k} doit être booléen`);
  }
  return true;
}

// Liste des contradictions d'un ensemble de faits (vide = cohérent).
function detectConflicts(facts) {
  const out = [];
  for (const [a, b, raison] of CONFLICTS) if (facts[a] === true && facts[b] === true) out.push({ faits: [a, b], raison });
  for (const [si, alors] of IMPLICATIONS) if (facts[si] === true && facts[alors] === false) out.push({ faits: [si, alors], raison: `${si} implique ${alors}` });
  return out;
}
function assertNoConflicts(facts) {
  const c = detectConflicts(facts);
  if (c.length) throw new Error('faits contradictoires : ' + c.map((x) => x.raison).join(' ; '));
  return true;
}

module.exports = { FACT_SCHEMA_VERSION, FACTS, FACT_NAMES, CONFLICTS, IMPLICATIONS, validateFactSet, detectConflicts, assertNoConflicts };
