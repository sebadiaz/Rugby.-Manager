/*
 * Rugby Manager — V4, catalogue d'actions de PLANIFICATION A01–A15 (RM4-G06).
 *
 * Source : docs/SIMULATION_V4/05_CATALOGUE_GOALS_ACTIONS.md §3 (le test
 * server/test-v4-actions.js vérifie identifiants et noms). Les effets sont des
 * effets PRÉDITS, jamais une écriture dans le moteur : l'exécuteur (RM4-G07)
 * valide chaque étape par un événement réel. Une action « illégale mais
 * rentable » n'existe pas : l'illégalité est exclue par les PRÉCONDITIONS.
 * Les faits utilisés sont ceux de l'ontologie canonique (facts.js).
 *
 * `base` : paramètres de coût (voir action-cost.js) — HYPOTHÈSES à calibrer.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { FACT_NAMES } = require('./facts.js');

// Le couloir de soutien appartient à un PORTEUR : quand je prends le ballon (A07) il
// n'est plus connu (SAFE_SUPPORT_LANE=false) et un soutien (A13/A14) n'est jamais
// planifié pour moi-même quand je porte déjà (HAS_BALL=false exigé).
// id doc, nom, préconditions, effets prédits, coût de base, loi/vérification physique.
const A = (id, name, preconditions, effects, base, law, verify) =>
  Object.freeze({ id, name, preconditions: Object.freeze(preconditions), effects: Object.freeze(effects), base: Object.freeze(base), law, verify });

const ACTIONS = Object.freeze([
  A('A01', 'GET_ONSIDE', { SELF_GROUNDED: false, SELF_ONSIDE: false }, { SELF_ONSIDE: true },
    { meters: 'ligne', fatigue: 0.1, loss: 0, fault: 0.05 }, 'loi 11/16 : retour derrière la ligne du ballon', 'coordonnées franchissent la ligne légale'),
  A('A02', 'GET_UP', { SELF_GROUNDED: true }, { SELF_GROUNDED: false, SELF_AVAILABLE: true },
    { fixed: 1.2, fatigue: 0.15, loss: 0, fault: 0.02 }, 'loi 14 : le joueur au sol se relève', 'auSol === 0'),
  A('A03', 'MOVE_TO_RUCK', { SELF_AVAILABLE: true, SELF_BOUND: false, SELF_ONSIDE: true, SELF_AT_RUCK: false, BALL_AT_RUCK: true }, { SELF_AT_RUCK: true },
    { meters: 'ruck', fatigue: 0.2, loss: 0, fault: 0.04 }, 'loi 15 : arrivée par la porte', 'distance <= tolérance, chemin légal'),
  A('A04', 'APPROACH_FROM_GATE', { SELF_AVAILABLE: true, SELF_ONSIDE: true, SELF_AT_RUCK: false, BALL_AT_RUCK: true, SELF_BOUND: false }, { SELF_AT_RUCK: true },
    { meters: 'ruck', fatigue: 0.25, loss: 0, fault: 0.01, extra: 0.6 }, 'loi 15 : entrée par la porte, jamais de côté', 'trajectoire respecte la porte d\'entrée'),
  A('A05', 'BIND_RUCK', { SELF_AT_RUCK: true, SELF_ONSIDE: true, SELF_GROUNDED: false, SELF_BOUND: false }, { SELF_BOUND: true },
    { fixed: 0.8, fatigue: 0.2, loss: 0, fault: 0.06 }, 'loi 15 : liaison à un coéquipier ou à un adversaire', 'événement de liaison valide'),
  A('A06', 'CLEAR_OUT_LEGALLY', { SELF_BOUND: true, BREAKDOWN_CONTEST_ACTIVE: true }, { BREAKDOWN_CONTEST_ACTIVE: false },
    { fixed: 1.5, fatigue: 0.35, loss: 0.15, fault: 0.1 }, 'loi 15 : nettoyage sans jeu dangereux', 'contest moteur résolu'),
  A('A07', 'SECURE_BALL', { SELF_AT_RUCK: true, BALL_AVAILABLE: true, TEAM_POSSESSION: true, SELF_GROUNDED: false }, { HAS_BALL: true, POSSESSION_SECURED: true, SAFE_SUPPORT_LANE: false },
    { fixed: 0.8, fatigue: 0.1, loss: 0.1, fault: 0.03 }, 'loi 15 : ballon jouable seulement', 'carrierId exact'),
  A('A08', 'PASS_TO_10', { HAS_BALL: true, PASS_LANE_10_OPEN: true, RECEIVER_OPEN: true }, { DISTRIBUTED: true, HAS_BALL: false },
    { fixed: 0.7, fatigue: 0.05, loss: 0.06, fault: 0.03 }, 'loi 11 : passe en arrière ou latérale', 'trajectoire et réception du 10'),
  A('A09', 'PASS_TO_POD', { HAS_BALL: true, PASS_LANE_POD_OPEN: true }, { DISTRIBUTED: true, HAS_BALL: false },
    { fixed: 0.7, fatigue: 0.05, loss: 0.1, fault: 0.03, extra: 0.8 }, 'loi 11 : passe en arrière ou latérale', 'réception par un joueur du pod'),
  A('A10', 'PASS_TO_OUTSIDE', { HAS_BALL: true, SAFE_SUPPORT_LANE: true }, { DISTRIBUTED: true, HAS_BALL: false },
    { fixed: 0.9, fatigue: 0.05, loss: 0.12, fault: 0.03, extra: 0.5 }, 'loi 11 : passe en arrière ou latérale', 'réception légale à l\'extérieur'),
  A('A11', 'RUN_INTO_GAP', { HAS_BALL: true, GAP_NEARBY: true }, { GAP_NEARBY: false },
    { meters: 'gap', fatigue: 0.3, loss: 0.2, fault: 0.02 }, 'loi 9 : plaquage légal attendu', 'métrique de franchissement'),
  A('A12', 'FIX_DEFENDER', { HAS_BALL: true }, { GAP_NEARBY: true },
    { fixed: 1.0, fatigue: 0.2, loss: 0.15, fault: 0.0 }, null, 'direction et engagement du défenseur observés'),
  A('A13', 'RUN_SUPPORT_INSIDE', { SELF_AVAILABLE: true, SELF_ONSIDE: true, TEAM_POSSESSION: true, HAS_BALL: false }, { SAFE_SUPPORT_LANE: true },
    { meters: 'ballon', fatigue: 0.25, loss: 0, fault: 0.02 }, 'loi 10 : rester en jeu derrière le porteur', 'position au temps du contact'),
  A('A14', 'RUN_SUPPORT_OUTSIDE', { SELF_AVAILABLE: true, SELF_ONSIDE: true, TEAM_POSSESSION: true, HAS_BALL: false }, { SAFE_SUPPORT_LANE: true },
    { meters: 'ballon', fatigue: 0.3, loss: 0, fault: 0.02, extra: 0.4 }, 'loi 10 : rester en jeu derrière le porteur', 'position au temps de la passe'),
  A('A15', 'HOLD_WIDTH', { SELF_AVAILABLE: true, SELF_ONSIDE: true }, { RECEIVER_OPEN: true },
    { fixed: 0.6, fatigue: 0.05, loss: 0, fault: 0.0 }, null, 'bande latérale tenue'),
  A('A23', 'KICK_FOR_TERRITORY', { HAS_BALL: true, SELF_ONSIDE: true, SELF_GROUNDED: false }, { BALL_IN_FLIGHT: true, HAS_BALL: false },
    { fixed: 0.9, fatigue: 0.1, loss: 0.35, fault: 0.02 }, 'loi 10/18 : pied légal, touche directe seulement des 22 m', 'coup de pied réel du moteur, ballon en vol'),
  // A16–A19 ne sont pas encore codées ; A20 est ajoutée avec son acteur physique (RM4-G11).
  A('A20', 'TACKLE_CARRIER', { SELF_AVAILABLE: true, SELF_ONSIDE: true, OPPONENT_POSSESSION: true }, { TRY_PREVENTED: true, BREAKDOWN_CONTEST_ACTIVE: true },
    { meters: 'ballon', fatigue: 0.35, loss: 0, fault: 0.08 }, 'loi 9/14 : plaquage légal, jamais hors-jeu', 'plaquage RÉUSSI compté par le moteur pour ce joueur'),
]);

const PAR_NOM = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.name, a])));
const FAITS_VALIDES = new Set(FACT_NAMES);

module.exports = { ACTIONS, PAR_NOM, FAITS_VALIDES };
