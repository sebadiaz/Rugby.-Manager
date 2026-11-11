/*
 * Rugby Manager — V4, coûts d'actions et faits issus des CROYANCES (RM4-G06).
 *
 * coût (strictement positif) = temps prédit + fatigue + risque de perte
 *                              + risque de faute + pénalité d'abandon d'engagement.
 * Unités : le temps en secondes ; fatigue, perte et faute sont des poids
 * sans dimension convertis en « secondes équivalentes » (COEF_*). TOUS CES
 * COEFFICIENTS SONT DES HYPOTHÈSES D'INGÉNIERIE à calibrer (RM4-G28/G36).
 *
 * factsFromBeliefs : faits symboliques d'UN agent, calculés sur ses croyances
 * seules (jamais l'état complet). Un fait non connaissable est ABSENT.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { ACTIONS } = require('./actions.js');
const { deriveSituation } = require('./goals.js');

const COEF_FATIGUE = 2.0;
const COEF_PERTE = 4.0;
const COEF_FAUTE = 6.0;
const COEF_ABANDON = 1.5;
const VITESSE_MIN = 3.0;     // m/s plancher
const CONFIANCE_MIN = 0.3;   // en dessous, une observation n'est plus fiable

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function distSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Faits d'un agent à partir de SES croyances. `sit` = deriveSituation(beliefs).
function factsFromBeliefs(b, sit) {
  const s = sit || deriveSituation(b);
  const f = {};
  f.SELF_GROUNDED = !!s.grounded;
  f.SELF_AVAILABLE = !!s.available;
  f.SELF_ONSIDE = !!s.onside;
  f.TEAM_POSSESSION = !!s.maPoss;
  f.OPPONENT_POSSESSION = !!s.advPoss;
  f.HAS_BALL = !!s.aLeBallon;
  const balle = s.ball && s.ball.confidence >= CONFIANCE_MIN ? s.ball : null;
  if (balle) {
    f.BALL_IN_FLIGHT = balle.state === 'AIR';
    f.BALL_AT_RUCK = s.phase === 'RUCK' && balle.state === 'RUCK';
    if (s.pt) {
      const d = dist(b.self, s.pt);
      f.SELF_AT_RUCK = !s.grounded && d <= 3 && s.onside;
      f.SELF_BOUND = !s.grounded && d <= 2 && (s.phase === 'RUCK' || s.phase === 'MAUL');
    }
  }
  if (b.ruck && b.ruck.confidence >= CONFIANCE_MIN) {
    f.BALL_AVAILABLE = !!b.ruck.ballAvailable;
    f.BREAKDOWN_CONTEST_ACTIVE = b.ruck.defendersCommitted > 0 && !b.ruck.ballAvailable;
    f.RUCK_WON = !!(s.maPoss && b.ruck.ballAvailable);
  }
  // Couloir de passe vers le 10 : seulement si le 10 est connu et sa trace récente.
  const dix = Object.values(b.teammates).find((m) => m.numero === 10);
  if (dix && dix.confidence >= CONFIANCE_MIN && b.agent.numero !== 10) {
    const sens = s.sens;
    const enArriere = (dix.lastSeen.x - b.self.x) * sens <= 0.5;
    const adv = Object.values(b.opponents).filter((o) => o.confidence >= CONFIANCE_MIN);
    const libre = !adv.some((o) => distSegment(o.lastSeen, b.self, dix.lastSeen) < 1.5);
    const marque = adv.some((o) => dist(o.lastSeen, dix.lastSeen) < 3);
    f.PASS_LANE_10_OPEN = enArriere && libre;
    f.RECEIVER_OPEN = enArriere && libre && !marque;
  }
  return f;
}

// Coût et durée d'une action pour un agent donné (profil + situation).
function estimateAction(action, sit, profile, beliefs, abandon = 0) {
  const v = Math.max(VITESSE_MIN, (profile.vitesseMs || 6.5) * (1 - 0.3 * (profile.fatigue || 0)));
  const b = action.base;
  let metres = 0;
  if (b.meters === 'ruck' && sit.pt) metres = dist(beliefs.self, sit.pt);
  else if (b.meters === 'ballon' && sit.ball) metres = dist(beliefs.self, sit.ball.lastSeen);
  else if (b.meters === 'ligne' && sit.pt) metres = Math.max(0.5, Math.abs((beliefs.self.x - sit.pt.x) * sit.sens) + 0.5);
  else if (b.meters === 'gap') metres = 8;
  const temps = (b.fixed || 0) + metres / v;
  const fatigue = (b.fatigue || 0) * (1 + (profile.fatigue || 0));
  const cout = temps + COEF_FATIGUE * fatigue + COEF_PERTE * (b.loss || 0) + COEF_FAUTE * (b.fault || 0) + (b.extra || 0) + COEF_ABANDON * abandon;
  return { duration: +temps.toFixed(3), cost: +Math.max(0.05, cout).toFixed(3) };
}

// Actions prêtes pour planGoal : id, préconditions, effets, coût > 0 (+ durée pour l'exécuteur).
function buildPlannerActions(beliefs, profile, options = {}) {
  const sit = options.situation || deriveSituation(beliefs);
  return ACTIONS.map((a) => {
    // options.abandon : { NOM_ACTION: 0..1 } pénalité d'abandon d'un engagement en cours.
    const e = estimateAction(a, sit, profile || {}, beliefs, (options.abandon && options.abandon[a.name]) || 0);
    return { id: a.name, preconditions: a.preconditions, effects: a.effects, cost: e.cost, duration: e.duration, docId: a.id };
  });
}

// Faisabilité AVANT recherche : écarte les actions dont une précondition est
// CONTREDITE par un fait connu qu'aucune autre action du catalogue ne peut
// changer. Ici : les faits d'équipe/de phase (possession, ballon en vol...).
const FAITS_FIXES = new Set(['TEAM_POSSESSION', 'OPPONENT_POSSESSION', 'BALL_IN_FLIGHT', 'BALL_AT_RUCK', 'BALL_AVAILABLE', 'RUCK_WON']);
function feasibleActions(facts, actions) {
  return actions.filter((a) => Object.entries(a.preconditions).every(([k, v]) => !FAITS_FIXES.has(k) || !(k in facts) || facts[k] === v));
}

module.exports = { factsFromBeliefs, estimateAction, buildPlannerActions, feasibleActions, COEF_FATIGUE, COEF_PERTE, COEF_FAUTE, COEF_ABANDON };
