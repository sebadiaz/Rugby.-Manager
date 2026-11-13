/* GÉNÉRÉ par server/build-ai-bundle.js depuis engine/ai/*.js — ne pas éditer. */
(function (global) {
  'use strict';
  var defs = {}, cache = {};
  function req(nom) {
    var cle = nom.replace(/^\.\//, '');
    if (cache[cle]) return cache[cle].exports;
    if (!defs[cle]) throw new Error('module IA introuvable : ' + nom);
    var m = cache[cle] = { exports: {} };
    defs[cle](m, m.exports, req);
    return m.exports;
  }
  defs["action-cost.js"] = function (module, exports, require) {
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
    // Un adversaire collé au passeur (au contact) ne ferme pas le couloir : la balle part de l'autre côté.
    const libre = !adv.some((o) => dist(o.lastSeen, b.self) > 2.5 && distSegment(o.lastSeen, b.self, dix.lastSeen) < 1.2);
    const marque = adv.some((o) => dist(o.lastSeen, dix.lastSeen) < 3);
    f.PASS_LANE_10_OPEN = enArriere && libre;
    f.RECEIVER_OPEN = enArriere && libre && !marque;
  }
  // Autres options de passe (carrière du porteur) : un avant (pod) ou un trois-quarts « à l'extérieur », en retrait
  // ou à hauteur, couloir libre et receveur non marqué. Faits ABSENTS si je ne porte pas ou ne vois personne.
  if (s.aLeBallon) {
    const sens = s.sens;
    const adv2 = Object.values(b.opponents).filter((o) => o.confidence >= CONFIANCE_MIN);
    const ouvert = (m, dMax, ecartMin) => m.confidence >= CONFIANCE_MIN && (m.lastSeen.x - b.self.x) * sens <= 0.3
      && dist(m.lastSeen, b.self) <= dMax && Math.abs(m.lastSeen.y - b.self.y) >= ecartMin
      && !adv2.some((o) => dist(o.lastSeen, b.self) > 2.5 && distSegment(o.lastSeen, b.self, m.lastSeen) < 1.2)
      && !adv2.some((o) => dist(o.lastSeen, m.lastSeen) < 3);
    const mates = Object.values(b.teammates);
    f.PASS_LANE_POD_OPEN = mates.some((m) => m.numero <= 8 && ouvert(m, 12, 1.2));
    f.SAFE_SUPPORT_LANE = mates.some((m) => m.numero >= 11 && ouvert(m, 28, 6));
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

  };
  defs["action-executor.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, exécuteur physique d'actions (RM4-G07).
 *
 * Transforme UNE action de planification en INTENTION de mouvement bornée
 * ({tx, ty, vmaxFactor}) pour UN joueur, et juge son déroulement sur le MONDE
 * RÉEL (état du moteur) : startGuard avant, successGuard et abortGuard à chaque
 * pas. Un effet prédit n'est jamais appliqué au plan parce qu'il était prévu :
 * seulement s'il a eu lieu (événement ACTION_SUCCEEDED). Sinon ACTION_FAILED ou
 * ACTION_ABORTED, avec la raison.
 *
 * Ce module n'écrit JAMAIS dans le moteur : il renvoie des intentions que
 * l'appelant transmet à MatchEngine.setAgentIntent(). Le moteur, seul juge des
 * lois, déplace le joueur par avancer() (accélération, vitesse maximale).
 * Actions avec acteur physique aujourd'hui : A01–A05, A13–A15 (déplacements).
 * Les actions de ballon (A06–A12 : passe, plaquage, nettoyage...) n'ont pas encore
 * d'acteur dans le moteur : elles échouent EXPLICITEMENT (NO_ACTUATOR), jamais
 * un succès simulé.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { extractFacts, pointRegroupement } = require('./world-model.js');
const { PAR_NOM } = require('./actions.js');

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const joueur = (state, team, n) => (team === 'A' ? state.equipeA : state.equipeB).find((j) => j.numero === n) || null;

// Chaque acteur : startGuard(ctx) -> null | raison ; intent(ctx) -> {tx,ty,vmaxFactor}|null ;
// successGuard(ctx) -> bool ; abortGuard(ctx) -> null | raison ; maxSeconds.
// ctx = { state, me, facts (monde réel), pt (point de regroupement), sens, params }
const ACTEURS = {
  GET_ONSIDE: {
    maxSeconds: 8,
    startGuard: (c) => (c.facts.SELF_GROUNDED ? 'GROUNDED' : c.facts.SELF_ONSIDE ? 'ALREADY_ONSIDE' : null),
    intent: (c) => (c.pt ? { tx: c.pt.x - c.sens * 1.5, ty: c.me.y, vmaxFactor: 1 } : null),
    successGuard: (c) => c.facts.SELF_ONSIDE,
    abortGuard: (c) => (!c.pt ? 'NO_REGROUPEMENT' : null),
  },
  GET_UP: {
    maxSeconds: 6,
    startGuard: (c) => (c.facts.SELF_GROUNDED ? null : 'NOT_GROUNDED'),
    intent: () => null, // le moteur relève le joueur ; on ne le téléporte pas
    successGuard: (c) => !c.facts.SELF_GROUNDED,
    abortGuard: () => null,
  },
  MOVE_TO_RUCK: {
    maxSeconds: 10,
    startGuard: (c) => (!c.facts.SELF_AVAILABLE ? 'NOT_AVAILABLE' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : !c.facts.BALL_AT_RUCK ? 'NO_RUCK' : c.facts.SELF_AT_RUCK ? 'ALREADY_AT_RUCK' : null),
    intent: (c) => ({ tx: c.pt.x - c.sens * 1.2, ty: c.pt.y, vmaxFactor: 1 }),
    successGuard: (c) => c.facts.SELF_AT_RUCK,
    abortGuard: (c) => (c.state.phase !== 'RUCK' ? 'PHASE_CHANGED' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : null),
  },
  APPROACH_FROM_GATE: {
    maxSeconds: 12,
    startGuard: (c) => (!c.facts.SELF_AVAILABLE ? 'NOT_AVAILABLE' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : !c.facts.BALL_AT_RUCK ? 'NO_RUCK' : c.facts.SELF_AT_RUCK ? 'ALREADY_AT_RUCK' : null),
    // Par la porte : d'abord se placer dans l'axe du ruck, derrière, puis entrer par l'arrière.
    intent: (c) => {
      const derriere = c.pt.x - c.sens * 3.5;
      const dansAxe = Math.abs(c.me.y - c.pt.y) <= 1.5;
      return dansAxe ? { tx: c.pt.x - c.sens * 1.2, ty: c.pt.y, vmaxFactor: 1 } : { tx: derriere, ty: c.pt.y, vmaxFactor: 1 };
    },
    successGuard: (c) => c.facts.SELF_AT_RUCK,
    abortGuard: (c) => (c.state.phase !== 'RUCK' ? 'PHASE_CHANGED' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : null),
  },
  BIND_RUCK: {
    maxSeconds: 4,
    startGuard: (c) => (!c.facts.SELF_AT_RUCK ? 'NOT_AT_RUCK' : c.facts.SELF_BOUND ? 'ALREADY_BOUND' : null),
    intent: (c) => ({ tx: c.pt.x - c.sens * 0.8, ty: c.pt.y, vmaxFactor: 0.6 }),
    successGuard: (c) => c.facts.SELF_BOUND,
    abortGuard: (c) => (c.state.phase !== 'RUCK' && c.state.phase !== 'MAUL' ? 'PHASE_CHANGED' : null),
  },
  HOLD_WIDTH: {
    maxSeconds: 8,
    startGuard: (c) => (!c.facts.SELF_AVAILABLE ? 'NOT_AVAILABLE' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : !Number.isFinite(c.params.y) ? 'NO_TARGET' : null),
    intent: (c) => ({ tx: c.me.x, ty: c.params.y, vmaxFactor: 0.8 }),
    successGuard: (c) => Math.abs(c.me.y - c.params.y) <= 1.0,
    abortGuard: () => null,
  },
};
// Plaquage (A20) : le joueur va AU porteur ; c'est le moteur qui résout le contact (réussi ou manqué).
// Réussite = un plaquage réussi de plus à SON compteur ; un plaquage manqué de plus = ACTION_FAILED
// (TACKLE_MISSED) : l'intention n'est jamais prise pour le résultat (D03).
const mesStats = (c) => (c.state.statsJoueurs && c.state.statsJoueurs[c.me.team] && c.state.statsJoueurs[c.me.team][c.me.numero]) || { tacklesMade: 0, plaquagesManques: 0 };
const porteurAdverse = (c) => (c.state.ball && c.state.ball.carrierTeam && c.state.ball.carrierTeam !== c.me.team ? joueur(c.state, c.state.ball.carrierTeam, c.state.ball.carrierNumber) : null);
ACTEURS.TACKLE_CARRIER = {
  maxSeconds: 6,
  init: (c) => ({ faits: mesStats(c).tacklesMade || 0, manques: mesStats(c).plaquagesManques || 0 }),
  startGuard: (c) => (!c.facts.SELF_AVAILABLE ? 'NOT_AVAILABLE' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : !porteurAdverse(c) ? 'NO_CARRIER' : null),
  intent: (c) => { const p = porteurAdverse(c); return p ? { tx: p.x, ty: p.y, vmaxFactor: 1 } : null; },
  successGuard: (c) => (mesStats(c).tacklesMade || 0) > c.memo.faits,
  failGuard: (c) => ((mesStats(c).plaquagesManques || 0) > c.memo.manques ? 'TACKLE_MISSED' : null),
  abortGuard: (c) => (!porteurAdverse(c) ? 'NO_CARRIER' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : null),
};
// SECURE_BALL (A07) : le 9 est au ruck, le ballon est jouable ; le MOTEUR le lui remet (sortie de ruck).
// Réussite = il est réellement porteur ; la fin du ruck sans lui = abandon.
ACTEURS.SECURE_BALL = {
  maxSeconds: 4,
  startGuard: (c) => (!c.facts.SELF_AT_RUCK ? 'NOT_AT_RUCK' : !c.facts.BALL_AVAILABLE ? 'BALL_NOT_AVAILABLE' : c.facts.HAS_BALL ? 'ALREADY_CARRIER' : null),
  intent: (c) => (c.pt ? { tx: c.pt.x - c.sens * 0.8, ty: c.pt.y, vmaxFactor: 0.5 } : null),
  successGuard: (c) => c.facts.HAS_BALL,
  abortGuard: (c) => (c.state.phase !== 'RUCK' && !c.facts.HAS_BALL ? 'PHASE_CHANGED' : null),
};
// PASS_TO_10 (A08) : le porteur DEMANDE la passe (intention `passe`) ; le moteur résout légalité,
// couloir, interception. Réussite = le 10 est RÉELLEMENT porteur ; mêlée (en-avant), interception ou
// autre receveur = ACTION_FAILED avec la raison. Une passe ratée ne donne jamais un ballon reçu.
const receveurDe = (c, n) => joueur(c.state, c.me.team, n);
const carrierIs = (c, team, n) => c.state.ball && c.state.ball.carrierTeam === team && c.state.ball.carrierNumber === n;
function actPasse(vers) {
  return {
    maxSeconds: 2.5,
    startGuard: (c) => {
      const r = receveurDe(c, vers);
      return !c.facts.HAS_BALL ? 'NOT_CARRIER' : !r || r.auSol > 0 ? 'NO_RECEIVER' : (r.x - c.me.x) * c.sens > 0.3 ? 'RECEIVER_AHEAD' : null;
    },
    intent: (c) => ({ tx: c.me.x, ty: c.me.y, vmaxFactor: 0.5, passe: vers }),
    successGuard: (c) => carrierIs(c, c.me.team, vers),
    failGuard: (c) => (c.state.phase === 'MELEE' ? 'FORWARD_PASS_OR_KNOCK_ON'
      : c.state.ball && c.state.ball.carrierTeam && c.state.ball.carrierTeam !== c.me.team ? 'INTERCEPTED'
        : c.state.ball && c.state.ball.carrierTeam === c.me.team && c.state.ball.carrierNumber !== c.me.numero ? 'WRONG_RECEIVER' : null),
    abortGuard: () => null,
  };
}
ACTEURS.PASS_TO_10 = actPasse(10);
// PASS_TO_POD / PASS_TO_OUTSIDE : le receveur est choisi dans le MONDE RÉEL au départ (le meilleur candidat
// en retrait ou à hauteur, couloir libre, éloigné des adversaires) ; la suite est identique à PASS_TO_10.
function actPasseChoisie(familles, dMax, ecartMin) {
  const choisir = (c) => {
    const adv = (c.me.team === 'A' ? c.state.equipeB : c.state.equipeA).filter((j) => !(j.sinBin > 0));
    let meilleur = null, score = -Infinity;
    for (const r of (c.me.team === 'A' ? c.state.equipeA : c.state.equipeB)) {
      if (r.numero === c.me.numero || !familles(r.numero) || r.auSol > 0 || r.sinBin > 0) continue;
      const d = Math.hypot(r.x - c.me.x, r.y - c.me.y);
      if ((r.x - c.me.x) * c.sens > 0.3 || d > dMax || Math.abs(r.y - c.me.y) < ecartMin) continue;
      const proche = Math.min(...adv.map((o) => Math.hypot(o.x - r.x, o.y - r.y)));
      if (proche < 3) continue;
      const sc = proche - 0.3 * d;
      if (sc > score) { score = sc; meilleur = r.numero; }
    }
    return meilleur;
  };
  return {
    maxSeconds: 2.5,
    init: (c) => ({ vers: choisir(c) }),
    startGuard: (c) => (!c.facts.HAS_BALL ? 'NOT_CARRIER' : choisir(c) == null ? 'NO_RECEIVER' : null),
    intent: (c) => ({ tx: c.me.x, ty: c.me.y, vmaxFactor: 0.5, passe: c.memo ? c.memo.vers : choisir(c) }),
    successGuard: (c) => c.memo && c.memo.vers != null && carrierIs(c, c.me.team, c.memo.vers),
    failGuard: (c) => (c.state.phase === 'MELEE' ? 'FORWARD_PASS_OR_KNOCK_ON'
      : c.state.ball && c.state.ball.carrierTeam && c.state.ball.carrierTeam !== c.me.team ? 'INTERCEPTED'
        : c.state.ball && c.state.ball.carrierTeam === c.me.team && c.state.ball.carrierNumber !== c.me.numero && c.state.ball.carrierNumber !== (c.memo && c.memo.vers) ? 'WRONG_RECEIVER' : null),
    abortGuard: () => null,
  };
}
ACTEURS.PASS_TO_POD = actPasseChoisie((n) => n <= 8, 12, 1.2);
ACTEURS.PASS_TO_OUTSIDE = actPasseChoisie((n) => n >= 11, 28, 6);
for (const [nom, dy] of [['RUN_SUPPORT_INSIDE', -1], ['RUN_SUPPORT_OUTSIDE', 1]]) {
  ACTEURS[nom] = {
    maxSeconds: 10,
    startGuard: (c) => (!c.facts.SELF_AVAILABLE ? 'NOT_AVAILABLE' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : !c.facts.TEAM_POSSESSION ? 'NO_POSSESSION' : c.facts.HAS_BALL ? 'IS_CARRIER' : null),
    // Soutien : 5 m derrière le ballon, décalé vers l'intérieur ou l'extérieur du jeu (signe selon le côté du terrain).
    intent: (c) => { const cote = c.ballon.y < 35 ? 1 : -1; return { tx: c.ballon.x - c.sens * 5, ty: c.ballon.y + dy * cote * 5, vmaxFactor: 1 }; },
    successGuard: (c) => { const t = ACTEURS[nom].intent(c); return dist(c.me, { x: t.tx, y: t.ty }) <= 2 && c.facts.SELF_ONSIDE; },
    abortGuard: (c) => (!c.facts.TEAM_POSSESSION ? 'POSSESSION_LOST' : null),
  };
}

function contexte(state, agent, params) {
  const me = joueur(state, agent.team, agent.numero);
  if (!me) throw new RangeError('agent introuvable : ' + agent.team + agent.numero);
  const facts = extractFacts(state, agent).facts; // monde RÉEL (état moteur), pas des croyances
  const ballon = state.ball && Number.isFinite(state.ball.x) ? state.ball : state.ballon;
  return { state, me, facts, pt: pointRegroupement(state), sens: me.sensAttaque, params: params || {}, ballon };
}

class ActionExecutor {
  constructor(agent, options = {}) {
    if (!agent || (agent.team !== 'A' && agent.team !== 'B') || !Number.isInteger(agent.numero)) throw new TypeError('agent invalide');
    this.agent = { team: agent.team, numero: agent.numero };
    this.id = agent.team + agent.numero;
    this.deadlineFactor = options.deadlineFactor ?? 1;
    this.acteurs = ACTEURS; // remplaçable par des doublures de test pour les actions de ballon
    this.current = null;
  }
  get busy() { return !!this.current; }

  _event(type, reason, t) {
    return Object.freeze({ type, agent: this.id, action: this.current ? this.current.name : null, reason: reason || null, t });
  }

  // Démarre une action : renvoie { started, events, intent }.
  start(actionName, state, params) {
    const t = state.tempsMatch;
    if (this.current) return { started: false, events: [Object.freeze({ type: 'ACTION_FAILED', agent: this.id, action: actionName, reason: 'BUSY', t })], intent: null };
    if (!PAR_NOM[actionName]) throw new RangeError('action inconnue : ' + actionName);
    const acteur = this.acteurs[actionName];
    if (!acteur) return { started: false, events: [Object.freeze({ type: 'ACTION_FAILED', agent: this.id, action: actionName, reason: 'NO_ACTUATOR', t })], intent: null };
    const c = contexte(state, this.agent, params);
    const refus = acteur.startGuard(c);
    if (refus) return { started: false, events: [Object.freeze({ type: 'ACTION_FAILED', agent: this.id, action: actionName, reason: 'START_GUARD:' + refus, t })], intent: null };
    this.current = { name: actionName, acteur, params: params || {}, t0: t, deadline: t + acteur.maxSeconds * this.deadlineFactor, memo: acteur.init ? acteur.init(c) : null };
    const ev = this._event('ACTION_STARTED', null, t);
    return { started: true, events: [ev], intent: acteur.intent(c) };
  }

  // Un pas : juge le monde réel. status = RUNNING | SUCCEEDED | FAILED | ABORTED | IDLE.
  step(state) {
    const t = state.tempsMatch;
    if (!this.current) return { status: 'IDLE', events: [], intent: null };
    const cur = this.current;
    const c = contexte(state, this.agent, cur.params);
    c.memo = cur.memo;
    const fin = (status, type, reason) => { const ev = this._event(type, reason, t); this.current = null; return { status, events: [ev], intent: null }; };
    if (cur.acteur.successGuard(c)) return fin('SUCCEEDED', 'ACTION_SUCCEEDED', null);
    const echec = cur.acteur.failGuard ? cur.acteur.failGuard(c) : null;
    if (echec) return fin('FAILED', 'ACTION_FAILED', echec);
    const abandon = cur.acteur.abortGuard(c);
    if (abandon) return fin('ABORTED', 'ACTION_ABORTED', abandon);
    if (t > cur.deadline + 1e-9) return fin('FAILED', 'ACTION_FAILED', 'TIMEOUT');
    return { status: 'RUNNING', events: [], intent: cur.acteur.intent(c) };
  }

  cancel(state, reason) {
    if (!this.current) return { status: 'IDLE', events: [], intent: null };
    const ev = this._event('ACTION_ABORTED', reason || 'CANCELLED', state.tempsMatch);
    this.current = null;
    return { status: 'ABORTED', events: [ev], intent: null };
  }
}

// Exécute un plan étape par étape. Les effets prédits ne sont enregistrés
// (`confirmedEffects`) que si l'étape a RÉELLEMENT réussi ; une étape échouée
// arrête le plan (`status: 'FAILED'`) et demande une replanification.
class PlanRunner {
  constructor(agent, steps, options = {}) {
    this.executor = new ActionExecutor(agent, options);
    this.steps = steps.slice();
    this.index = 0;
    this.confirmedEffects = {};
    this.events = [];
    this.status = 'PENDING';
  }
  // Renvoie l'intention du pas courant (ou null) ; à transmettre au moteur.
  step(state) {
    if (this.status === 'DONE' || this.status === 'FAILED' || this.status === 'ABORTED') return null;
    let intent = null;
    for (let garde = 0; garde < 4; garde++) {
      if (!this.executor.busy) {
        if (this.index >= this.steps.length) { this.status = 'DONE'; return null; }
        const r = this.executor.start(this.steps[this.index], state);
        this.events.push(...r.events);
        if (!r.started) { this.status = 'FAILED'; return null; }
        intent = r.intent; this.status = 'RUNNING';
      }
      const s = this.executor.step(state);
      this.events.push(...s.events);
      if (s.status === 'RUNNING') return s.intent || intent;
      if (s.status === 'SUCCEEDED') {
        Object.assign(this.confirmedEffects, PAR_NOM[this.steps[this.index]].effects);
        this.index++;
        continue; // enchaîne l'étape suivante dans le même pas
      }
      this.status = s.status === 'ABORTED' ? 'ABORTED' : 'FAILED';
      return null;
    }
    return intent;
  }
}

module.exports = { ActionExecutor, PlanRunner, ACTEURS };

  };
  defs["actions.js"] = function (module, exports, require) {
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
  // A16–A19 ne sont pas encore codées ; A20 est ajoutée avec son acteur physique (RM4-G11).
  A('A20', 'TACKLE_CARRIER', { SELF_AVAILABLE: true, SELF_ONSIDE: true, OPPONENT_POSSESSION: true }, { TRY_PREVENTED: true, BREAKDOWN_CONTEST_ACTIVE: true },
    { meters: 'ballon', fatigue: 0.35, loss: 0, fault: 0.08 }, 'loi 9/14 : plaquage légal, jamais hors-jeu', 'plaquage RÉUSSI compté par le moteur pour ce joueur'),
]);

const PAR_NOM = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.name, a])));
const FAITS_VALIDES = new Set(FACT_NAMES);

module.exports = { ACTIONS, PAR_NOM, FAITS_VALIDES };

  };
  defs["agent-context.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, croyances locales d'UN agent (RM4-G04).
 *
 * AgentContext tient la mémoire d'un seul joueur : ce qu'il a vu, quand, et ce
 * qu'il a entendu de ses partenaires. Il ne lit l'état du match que par
 * observe() (vue partielle) et ne le modifie jamais. Deux agents ont donc des
 * croyances différentes dès que leurs positions diffèrent. Aucune mémoire
 * partagée entre agents, aucun coordinateur.
 *
 *  - délai de réaction : l'observation n'est rafraîchie que tous les
 *    `reactionDelay` secondes ; entre deux rafraîchissements, l'agent agit sur
 *    sa dernière observation (son âge grandit) ;
 *  - mémoire : une entité non vue garde sa dernière position, avec son âge et une
 *    confiance qui décroît ; au-delà de `memorySeconds` elle est oubliée ;
 *  - appels adressés : via LocalCommunication.hear() (auteur, âge, confiance).
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { observe, normaliserParams } = require('./perception.js');

const DEFAUTS_CONTEXTE = Object.freeze({ reactionDelay: 0.2, memorySeconds: 6 });

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

class AgentContext {
  constructor(agent, params = {}) {
    if (!agent || (agent.team !== 'A' && agent.team !== 'B') || !Number.isInteger(agent.numero)) throw new TypeError('agent invalide');
    this.agent = { team: agent.team, numero: agent.numero };
    this.id = agent.team + agent.numero;
    this.params = Object.assign({}, DEFAUTS_CONTEXTE, normaliserParams(params));
    for (const k of ['reactionDelay', 'memorySeconds']) {
      const v = params[k] === undefined ? this.params[k] : params[k];
      if (!Number.isFinite(v) || v < 0) throw new RangeError('paramètre invalide : ' + k);
      this.params[k] = v;
    }
    this.lastObsT = null;
    this.mem = { ball: null, teammates: {}, opponents: {}, phase: null, possession: null, score: null, ruck: null };
    this.heard = [];
  }

  // Met à jour les croyances à partir de l'état (lecture seule) puis renvoie
  // une photo gelée. `comm` (LocalCommunication) est facultatif.
  update(state, comm) {
    const t = state.tempsMatch;
    const doitObserver = this.lastObsT === null || t - this.lastObsT >= this.params.reactionDelay - 1e-9;
    let obs = null;
    if (doitObserver) {
      // Regard : vers le dernier ballon connu (trace récente), sinon dans l'axe du corps.
      let gaze;
      if (this.mem.ball && t - this.mem.ball.seenAt <= 2) {
        const moiG = [...state.equipeA, ...state.equipeB].find((j) => j.team === this.agent.team && j.numero === this.agent.numero);
        if (moiG) gaze = Math.atan2(this.mem.ball.y - moiG.y, this.mem.ball.x - moiG.x);
      }
      // Un PORTEUR balaie le terrain avant de jouer (têtes levées) : champ de vision complet.
      const porteur = this.mem.ball && this.mem.ball.owner === this.id && t - this.mem.ball.seenAt <= 1;
      const pv = Object.assign({}, this.params, gaze === undefined ? {} : { gaze }, porteur ? { fovDeg: 360 } : {});
      obs = observe(state, this.agent, pv);
      this.lastObsT = t;
      const m = this.mem;
      if (obs.vus.ball) m.ball = Object.assign({}, obs.vus.ball, { seenAt: t });
      // Une entité vue est rafraîchie ; une entité non vue garde sa dernière trace.
      for (const [id, e] of Object.entries(obs.vus.teammates)) m.teammates[id] = Object.assign({}, e, { seenAt: t });
      for (const [id, e] of Object.entries(obs.vus.opponents)) m.opponents[id] = Object.assign({}, e, { seenAt: t });
      if (obs.vus.ruck) m.ruck = Object.assign({}, obs.vus.ruck, { seenAt: t }); else if (obs.phase !== 'RUCK') m.ruck = null;
      m.phase = obs.phase; m.possession = obs.possession; m.score = obs.score ? { A: obs.score.A, B: obs.score.B } : null;
    }
    // Proprioception : on connaît toujours sa propre position exacte.
    const moi = [...state.equipeA, ...state.equipeB].find((j) => j.team === this.agent.team && j.numero === this.agent.numero);
    if (!moi) throw new RangeError('agent introuvable : ' + this.id);
    if (comm) {
      const entendus = comm.hear({ listenerId: this.id, team: this.agent.team, x: moi.x, y: moi.y, time: t,
        available: !(moi.auSol > 0) && !(moi.sinBin > 0) });
      for (const h of entendus) this.heard.push(h);
    }
    const mem = this.params.memorySeconds;
    const vieux = (seenAt) => t - seenAt > mem + 1e-9;
    for (const k of ['teammates', 'opponents']) for (const id of Object.keys(this.mem[k])) if (vieux(this.mem[k][id].seenAt)) delete this.mem[k][id];
    if (this.mem.ball && vieux(this.mem.ball.seenAt)) this.mem.ball = null;
    if (this.mem.ruck && vieux(this.mem.ruck.seenAt)) this.mem.ruck = null;
    this.heard = this.heard.filter((h) => t - h.heardAt <= mem);

    const fiche = (e) => ({ lastSeen: { x: e.x, y: e.y }, age: +(t - e.seenAt).toFixed(3), confidence: +clamp01(1 - (t - e.seenAt) / mem).toFixed(3) });
    const ballon = this.mem.ball
      ? Object.assign(fiche(this.mem.ball), { state: this.mem.ball.state, owner: this.mem.ball.owner })
      : { lastSeen: null, age: null, confidence: 0, state: null, owner: null };
    const mates = {}, adv = {};
    for (const [id, e] of Object.entries(this.mem.teammates)) mates[id] = Object.assign(fiche(e), { numero: e.numero });
    for (const [id, e] of Object.entries(this.mem.opponents)) {
      const b = this.mem.ball;
      const dBalle = b ? Math.hypot(e.x - b.x, e.y - b.y) : 40;
      adv[id] = Object.assign(fiche(e), { numero: e.numero, threat: +clamp01(1 - dBalle / 40).toFixed(3) });
    }
    return deepFreeze({
      t, agent: this.agent, observedAt: this.lastObsT, refreshed: doitObserver,
      self: { x: moi.x, y: moi.y, orientation: moi.orientation || 0, grounded: moi.auSol > 0, available: !(moi.auSol > 0) && !(moi.sinBin > 0),
        sensAttaque: moi.sensAttaque, kickOffside: moi.horsJeuKick > 0 },
      ball: ballon, teammates: mates, opponents: adv,
      ruck: this.mem.ruck ? { ballAvailable: this.mem.ruck.ballAvailable, defendersCommitted: this.mem.ruck.defendersCommitted,
        age: +(t - this.mem.ruck.seenAt).toFixed(3), confidence: +clamp01(1 - (t - this.mem.ruck.seenAt) / mem).toFixed(3) } : null,
      phase: this.mem.phase, possession: this.mem.possession, score: this.mem.score,
      heard: this.heard.map((h) => ({ from: h.from, kind: h.kind, age: +(t - h.heardAt).toFixed(3), confidence: h.confidence, replyTo: h.replyTo })),
      omniscient: !!this.params.omniscient,
    });
  }
}

module.exports = { AgentContext, DEFAUTS_CONTEXTE };

  };
  defs["agent-controller.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, contrôleur d'UN joueur : GoalBasedRugbyAgent (RM4-G08).
 *
 * Boucle PERCEIVE → UPDATE → SELECT_GOAL → PLAN → ACT → MONITOR, à l'échelle
 * d'un SEUL joueur. Aucun accès aux autres agents, aucun état partagé, aucun
 * coordinateur : le contrôleur ne connaît que ses croyances (AgentContext), son
 * profil et le plan de jeu en lecture seule.
 *
 *  - la décision (but + plan) est évaluée toutes les `decisionPeriod` secondes
 *    et sur événement urgent (changement de phase ou de possession, action
 *    terminée, appel entendu, précondition invalidée) ; l'exécution est suivie
 *    à chaque tick ;
 *  - replanification depuis les faits ACTUELS : un agent déjà au ruck ne
 *    recommence pas par MOVE_TO_RUCK ;
 *  - une action sans acteur ou échouée est écartée un moment (`banDuration`)
 *    pour ne pas boucler ; le but est alors tenu sans plan (HOLD) ;
 *  - tick() renvoie une INTENTION de mouvement ; c'est l'appelant qui la
 *    transmet au moteur (MatchEngine.setAgentIntent).
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { AgentContext } = require('./agent-context.js');
const { GoalSelector } = require('./goal-selector.js');
const { ActionExecutor } = require('./action-executor.js');
const { planGoal, satisfies } = require('./goal-planner.js');
const { factsFromBeliefs, buildPlannerActions, feasibleActions } = require('./action-cost.js');
const { deriveSituation, profilePour } = require('./goals.js');
const { PAR_NOM } = require('./actions.js');
const { individualPlacement } = require('./individual-placement.js');

// Condition de succès (faits désirés) de chaque but planifiable. Les autres
// buts (DEFEND, COVER_BACKFIELD...) n'ont pas encore d'actions A16+ : le but est
// tenu sans plan (HOLD).
const BUTS_PLANIFIABLES = Object.freeze({
  RECOVER_AND_REJOIN: { SELF_GROUNDED: false, SELF_AVAILABLE: true },
  BECOME_ONSIDE: { SELF_ONSIDE: true },
  CONTEST_BREAKDOWN: { SELF_AT_RUCK: true },
  SECURE_RUCK: { HAS_BALL: true },
  DISTRIBUTE_BALL: { DISTRIBUTED: true },
  SUPPORT_CARRIER: { SAFE_SUPPORT_LANE: true },
  BE_PASS_OPTION: { RECEIVER_OPEN: true },
  PREVENT_TRY: { TRY_PREVENTED: true },
});

// Appels que le joueur lance de lui-même selon son but (jamais un ordre).
const PAROLES_PAR_BUT = Object.freeze({ SUPPORT_CARRIER: 'SUPPORT', CONTEST_AERIAL_BALL: 'MINE', PREVENT_TRY: 'COVER' });

class GoalBasedRugbyAgent {
  constructor(agent, options = {}) {
    if (!agent || (agent.team !== 'A' && agent.team !== 'B') || !Number.isInteger(agent.numero)) throw new TypeError('agent invalide');
    this.agent = { team: agent.team, numero: agent.numero };
    this.id = agent.team + agent.numero;
    this.profile = profilePour(agent.numero, options.profile);
    this.context = new AgentContext(agent, Object.assign({ reactionDelay: 0.2 }, options.perception));
    this.selector = new GoalSelector(agent, Object.assign({ profile: options.profile }, options.selector));
    this.executor = new ActionExecutor(agent, options.executor);
    if (options.acteurs) this.executor.acteurs = options.acteurs; // doublures de test (acteurs de ballon)
    this.playbook = Object.freeze(Object.assign({}, options.playbook));
    this.decisionPeriod = options.decisionPeriod ?? 0.4;
    this.banDuration = options.banDuration ?? 3;
    this.extraFacts = options.extraFacts || null; // (beliefs, facts) => faits perçus en plus (ex. couloir du pod)
    if (!(this.decisionPeriod > 0) || !(this.banDuration >= 0)) throw new RangeError('options invalides');
    this.goal = null;
    this.plan = null;            // { steps, index, cost, goal }
    this.lastDecisionT = null;
    this.lastKey = null;
    this.bans = new Map();       // nom d'action -> t de fin
    this.heardSeen = new Set();
    this.events = [];
    this.decisions = 0;
    this.spoke = new Set();
    this.replanRaison = null;
    this.pending = null;          // décision due non encore jouée : { since, urgent }
    this._forceDecision = false;
    this._intent = null; this._beliefs = null; this._sit = null;
    this.usePlacement = options.placement === true; // opt-in : le placement individuel conduit le joueur hors plan
    this.placement = null;
    this.placementScope = options.placementScope || 'all'; // 'all' | 'defense' | 'attack' : quelles situations le placement conduit
    this.maxExpanded = options.maxExpanded ?? 128;
    this.lastExpansions = 0;
  }

  _push(type, t, extra) { const e = Object.freeze(Object.assign({ type, agent: this.id, t }, extra || {})); this.events.push(e); return e; }

  hear() { return this.context.heard; } // ce qui a été entendu ; informe la perception, n'impose aucun plan

  _faits(beliefs, sit) {
    const f = factsFromBeliefs(beliefs, sit);
    return this.extraFacts ? Object.assign({}, f, this.extraFacts(beliefs, f)) : f;
  }

  _planifier(beliefs, sit, raison) {
    const t = beliefs.t;
    const cible = BUTS_PLANIFIABLES[this.goal];
    if (!cible) { this.plan = null; return false; }
    const faits = this._faits(beliefs, sit);
    const base = Object.assign({}, faits);
    for (const k of Object.keys(cible)) if (!(k in base)) base[k] = false;
    if (satisfies(base, cible)) { this.plan = null; return false; }
    const actions = feasibleActions(base, buildPlannerActions(beliefs, this.profile, { situation: sit }))
      .filter((a) => !(this.bans.get(a.id) > t));
    const r = planGoal(base, cible, actions, { maxExpanded: this.maxExpanded });
    this.lastExpansions += r.expanded || 0;
    if (r.status !== 'OK') {
      this.plan = null;
      this._push('NO_PLAN', t, { goal: this.goal, status: r.status });
      // D08 : budget dépassé ou aucun plan -> position sûre (le moteur garde la conduite du joueur), jamais d'exception.
      if (r.status === 'BUDGET_EXCEEDED' || r.status === 'DEPTH_LIMIT') this._push('HOLD_SAFE_POSITION', t, { goal: this.goal, status: r.status });
      return false;
    }
    this.plan = { steps: r.steps, index: 0, cost: r.cost, goal: this.goal };
    this._push(raison === 'NEW' ? 'PLAN_CREATED' : 'PLAN_REPLANNED', t, { goal: this.goal, steps: r.steps.slice(), cost: +r.cost.toFixed(3), reason: raison });
    return true;
  }

  // Une étape est-elle encore possible dans les faits actuels ? (un fait connu et contredit l'invalide)
  // `enCours` : pour une action DÉJÀ démarrée, les faits qu'elle a pour effet de changer
  // (ex. SELF_AT_RUCK=faux avant MOVE_TO_RUCK) ne comptent plus : les atteindre, c'est réussir.
  _etapeValide(nom, faits, enCours) {
    const act = PAR_NOM[nom];
    return Object.entries(act.preconditions).every(([k, v]) => (enCours && k in act.effects) || !(k in faits) || faits[k] === v);
  }

  // Un pas complet de la boucle (usage d'un agent seul) ; un scheduler utilise plutôt
  // observe() puis, s'il accorde la décision, decide() puis act() (voir agent-scheduler.js).
  // opts.decide === false : la décision due est reportée (pending) au lieu d'être jouée.
  tick(state, comm, opts = {}) {
    const mark = this.events.length;
    this.observe(state, comm);
    if (this.pending && opts.decide !== false) this.decide(state);
    this.act(state);
    if (comm) this.maybeSpeak(comm, state, this._beliefs);
    return { intent: this._intent, goal: this.goal, plan: this.plan ? { steps: this.plan.steps.slice(), index: this.plan.index } : null,
      events: this.events.slice(mark), beliefs: this._beliefs, pending: this.pending };
  }

  // PERCEIVE + UPDATE + MONITOR (peu coûteux, à chaque tick). Marque une décision due (`pending`).
  observe(state, comm) {
    const t = state.tempsMatch;
    this._intent = null;
    const beliefs = this.context.update(state, comm);
    const sit = deriveSituation(beliefs);
    this._beliefs = beliefs; this._sit = sit;
    // Appels reçus nouveaux : événement « urgent » pour réévaluer (sans imposer de plan).
    let appelNouveau = false;
    for (const h of beliefs.heard) {
      const cle = h.from + ':' + h.kind + ':' + (t - h.age).toFixed(2);
      if (!this.heardSeen.has(cle)) { this.heardSeen.add(cle); appelNouveau = true; }
    }
    const cle = beliefs.phase + '|' + beliefs.possession;
    const urgent = (this.lastKey !== null && cle !== this.lastKey) || appelNouveau || this._forceDecision;
    this.lastKey = cle;

    // MONITOR de l'action en cours (chaque tick, sur le monde réel)
    // Précondition invalidée PENDANT l'action (ex. le 10 est désormais couvert) : on l'abandonne et on replanifie.
    if (this.executor.busy && this.plan && this.executor.current && this.executor.current.name === this.plan.steps[this.plan.index]
      && !this._etapeValide(this.executor.current.name, this._faits(beliefs, sit), true)) {
      for (const e of this.executor.cancel(state, 'PRECONDITION_INVALID').events) this.events.push(e);
      this.plan = null;
      this.replanRaison = 'PRECONDITION_INVALID';
      this._forceDecision = true;
    }
    if (this.executor.busy) {
      const s = this.executor.step(state);
      for (const e of s.events) this.events.push(e);
      this._intent = s.intent;
      if (s.status === 'SUCCEEDED' && this.plan) {
        this.plan.index++;
        if (this.plan.index >= this.plan.steps.length) { this._push('PLAN_COMPLETED', t, { goal: this.goal }); this.plan = null; }
        this._forceDecision = true; // décision fraîche après une action terminée
      } else if (s.status === 'FAILED' || s.status === 'ABORTED') {
        this.bans.set(s.events[0].action, t + this.banDuration);
        this.plan = null;
        this._forceDecision = true;
      }
    }
    const due = this.lastDecisionT === null || this._forceDecision || urgent || t - this.lastDecisionT >= this.decisionPeriod - 1e-9;
    if (due) {
      const dejaUrgent = this.pending ? this.pending.urgent : false;
      this.pending = { since: this.pending ? this.pending.since : t, urgent: dejaUrgent || urgent || this._forceDecision || this.lastDecisionT === null };
    }
    return this.pending;
  }

  // SELECT_GOAL + PLAN (coûteux : accordé par le scheduler ou par tick()).
  decide(state) {
    // D08 : une erreur de décision ne bloque jamais le tick, mais elle est JOURNALISÉE (DECISION_ERROR)
    // et comptée : les tests de match exigent zéro DECISION_ERROR.
    try { this._decide(state); } catch (err) {
      this.pending = null; this._forceDecision = false; this.plan = null; this.lastDecisionT = state.tempsMatch;
      this._push('DECISION_ERROR', state.tempsMatch, { message: String(err && err.message) });
      this.errors = (this.errors || 0) + 1;
    }
  }
  _decide(state) {
    const t = state.tempsMatch, beliefs = this._beliefs, sit = this._sit;
    this.decisions++;
    this.lastDecisionT = t;
    this.pending = null;
    this._forceDecision = false;
    this.lastExpansions = 0;
    const choix = this.selector.select(beliefs, this.playbook);
    for (const e of choix.events) this.events.push(e);
    const but = choix.goal;
    const butChange = but !== this.goal;
    this.goal = but;
    if (butChange) {
      // Un plaquage engagé n'est pas lâché parce que le but défensif change de nom (DEFEND <-> PREVENT_TRY...) :
      // seuls un but de sécurité personnelle ou la fin de la possession adverse l'interrompent.
      const plaquageEnCours = this.executor.busy && this.executor.current.name === 'TACKLE_CARRIER'
        && but !== 'BECOME_ONSIDE' && but !== 'RECOVER_AND_REJOIN' && this._sit.advPoss;
      // Une passe demandée au moteur n'est pas retirée parce que le but passe de DISTRIBUTE à RETAIN : tant que
      // je porte encore le ballon, la demande va à son terme (réussie, interceptée ou en-avant : le moteur tranche).
      const passeEnCours = this.executor.busy && /^PASS_TO/.test(this.executor.current.name) // le ballon est en l'air pendant la passe : plus « porteur », la demande va à son terme
        && but !== 'RECOVER_AND_REJOIN' && but !== 'BECOME_ONSIDE';
      if (this.executor.busy && !plaquageEnCours && !passeEnCours) { for (const e of this.executor.cancel(state, 'GOAL_CHANGED').events) this.events.push(e); this._intent = null; }
      this.plan = null;
    }
    if (this.usePlacement) {
      this.placement = individualPlacement(beliefs, this.goal, this.playbook, this.profile);
      if (this.placement) this._push('PLACEMENT_CHOSEN', t, { goal: this.goal, placement: this.placement.placementGoal, target: this.placement.target });
    }
    const faits = this._faits(beliefs, sit);
    if (!this.plan) { const r = this.replanRaison || 'NEW'; this.replanRaison = null; this._planifier(beliefs, sit, r); }
    else if (!this.executor.busy && !this._etapeValide(this.plan.steps[this.plan.index], faits)) {
      // Précondition invalidée AVANT de démarrer l'étape : replanification depuis les faits actuels.
      this._planifier(beliefs, sit, 'PRECONDITION_INVALID');
    }
  }

  // ACT : démarrer l'étape courante si rien n'est en cours ; renvoie l'intention courante.
  act(state) {
    const t = state.tempsMatch;
    if (!this.executor.busy && this.plan) {
      const nom = this.plan.steps[this.plan.index];
      const r = this.executor.start(nom, state);
      for (const e of r.events) this.events.push(e);
      if (r.started) this._intent = r.intent;
      else { this.bans.set(nom, t + this.banDuration); this.plan = null; this._forceDecision = true; }
    }
    // Sans action en cours, c'est SON placement individuel qui le conduit (jamais celui d'un autre).
    // Presser le porteur = l'action TACKLE_CARRIER (acteur réel, événements réussi/manqué), pas une simple course.
    if (this.usePlacement && !this.executor.busy && !this.plan && this.placement && this.placement.placementGoal === 'PRESS_CARRIER'
      && state.phase === 'PORTE' && !(this.bans.get('TACKLE_CARRIER') > t)) {
      const r = this.executor.start('TACKLE_CARRIER', state);
      for (const e of r.events) this.events.push(e);
      if (r.started) this._intent = r.intent; else this.bans.set('TACKLE_CARRIER', t + 1);
    }
    // Le moteur garde la main sur le porteur (aucun acteur de ballon) et sur les phases arrêtées
    // (mêlée, touche, maul, ruck, coups de pied) : le placement individuel ne conduit qu'en jeu courant.
    const porteur = state.ball && state.ball.carrierTeam === this.agent.team && state.ball.carrierNumber === this.agent.numero;
    const enDefense = state.possession !== this.agent.team;
    const dansPortee = this.placementScope === 'all' || (this.placementScope === 'defense') === enDefense;
    if (this.usePlacement && !this._intent && !this.executor.busy && !this.plan && this.placement && state.phase === 'PORTE' && !porteur && dansPortee) {
      this._intent = { tx: this.placement.target.x, ty: this.placement.target.y, vmaxFactor: this.placement.vmaxFactor };
    }
    return this._intent;
  }

  // Décide LOCALEMENT de parler selon son but ; renvoie le type d'appel émis ou null.
  maybeSpeak(comm, state, beliefs) {
    const kind = PAROLES_PAR_BUT[this.goal];
    if (!kind) return null;
    const cle = this.goal + ':' + Math.floor(state.tempsMatch / 3);
    if (this.spoke.has(cle)) return null;
    const me = (this.agent.team === 'A' ? state.equipeA : state.equipeB).find((j) => j.numero === this.agent.numero);
    if (!me || me.auSol > 0) return null;
    const r = comm.emit({ speakerId: this.id, team: this.agent.team, kind, x: me.x, y: me.y, time: state.tempsMatch });
    if (r.accepted) { this.spoke.add(cle); this._push('SPOKE', state.tempsMatch, { kind }); return kind; }
    return null;
  }
}

module.exports = { GoalBasedRugbyAgent, BUTS_PLANIFIABLES, PAROLES_PAR_BUT };

  };
  defs["agent-scheduler.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, ordonnanceur des décisions d'agents (RM4-G09).
 *
 * Ce module ne choisit NI but, NI plan, NI position : il décide seulement
 * QUAND chaque agent a le droit de décider, pour borner le travail par tick.
 * Chaque agent reste seul maître de son but et de son plan (GoalBasedRugbyAgent) ;
 * il n'y a aucune affectation de rôle, aucun état d'équipe partagé.
 *
 *  - observation et suivi d'exécution : à CHAQUE tick pour chaque agent (bon marché) ;
 *  - décision (but + plan, coûteuse) : accordée dans la limite de `maxDecisionsPerTick`
 *    pour les décisions ordinaires, triées par ancienneté puis identifiant (aucune
 *    famine) ; les décisions URGENTES (phase, possession, appel entendu, action
 *    terminée) sont accordées sans attendre, jusqu'à `maxUrgentPerTick` ;
 *  - départs étalés : au premier tick, l'agent d'indice i décide à l'offset
 *    (i / n) × période, pour ne pas faire décider 30 joueurs dans le même tick ;
 *  - ordre stable A1..A15, B1..B15 pour les décisions ET pour les appels vocaux ;
 *  - budget LOGIQUE (décisions, expansions de recherche) : jamais de Date.now() ni
 *    d'horloge pour décider ; le coût CPU se mesure hors simulation (tests).
 */
'use strict';

const { GoalBasedRugbyAgent } = require('./agent-controller.js');

const cleOrdre = (a) => (a.agent.team === 'A' ? 0 : 100) + a.agent.numero;

class AgentScheduler {
  constructor(agents, options = {}) {
    if (!Array.isArray(agents) || !agents.length) throw new TypeError('agents requis');
    this.agents = agents.slice().sort((a, b) => cleOrdre(a) - cleOrdre(b));
    if (new Set(this.agents.map((a) => a.id)).size !== this.agents.length) throw new RangeError('agent en double');
    this.maxDecisionsPerTick = options.maxDecisionsPerTick ?? 6;
    this.maxUrgentPerTick = options.maxUrgentPerTick ?? this.agents.length;
    this.period = options.period ?? this.agents[0].decisionPeriod;
    for (const k of ['maxDecisionsPerTick', 'maxUrgentPerTick']) if (!Number.isInteger(this[k]) || this[k] < 1) throw new RangeError('option invalide : ' + k);
    if (!(this.period > 0)) throw new RangeError('période invalide');
    this.stats = { ticks: 0, decisions: 0, urgent: 0, deferred: 0, maxDecisionsInTick: 0, expansions: 0, maxExpansionsInTick: 0, maxWait: 0 };
    this.t0 = null;
    this.offset = new Map(this.agents.map((a, i) => [a.id, (i / this.agents.length) * this.period]));
  }

  // Un tick d'ordonnancement. Renvoie { intents: [{team,numero,intent}], events }.
  tick(state, comm) {
    const t = state.tempsMatch;
    if (this.t0 === null) this.t0 = t;
    this.stats.ticks++;
    // 1) observation + suivi pour tous, dans l'ordre stable ; les décisions sont reportées.
    for (const a of this.agents) a.observe(state, comm);
    // 2) attribution des décisions : urgentes sans attendre, ordinaires dans le budget.
    const candidats = this.agents.filter((a) => {
      if (!a.pending) return false;
      // Étalement : une décision ORDINAIRE n'est pas accordée avant l'offset de l'agent.
      return a.pending.urgent && a.lastDecisionT !== null || t - this.t0 >= this.offset.get(a.id) - 1e-9;
    });
    candidats.sort((x, y) => (y.pending.urgent - x.pending.urgent) || (x.pending.since - y.pending.since) || (cleOrdre(x) - cleOrdre(y)));
    let ordinaires = 0, urgentes = 0, expansions = 0;
    const accordes = [];
    for (const a of candidats) {
      const urgent = a.pending.urgent && a.lastDecisionT !== null; // la 1re décision n'est pas « urgente »
      if (urgent) { if (urgentes >= this.maxUrgentPerTick) continue; urgentes++; }
      else { if (ordinaires >= this.maxDecisionsPerTick) continue; ordinaires++; }
      this.stats.maxWait = Math.max(this.stats.maxWait, t - a.pending.since);
      a.decide(state);
      expansions += a.lastExpansions;
      accordes.push(a);
    }
    const reportees = this.agents.filter((a) => a.pending).length; // décisions encore en attente après ce tick
    // 3) actions et paroles dans l'ordre stable (les appels vocaux suivent cet ordre).
    const intents = [];
    for (const a of this.agents) {
      a.act(state);
      if (comm) a.maybeSpeak(comm, state, a._beliefs);
      intents.push({ team: a.agent.team, numero: a.agent.numero, intent: a._intent });
    }
    const s = this.stats;
    s.decisions += accordes.length; s.urgent += urgentes; s.deferred += reportees;
    s.maxDecisionsInTick = Math.max(s.maxDecisionsInTick, accordes.length);
    s.expansions += expansions; s.maxExpansionsInTick = Math.max(s.maxExpansionsInTick, expansions);
    return { intents, decided: accordes.map((a) => a.id), urgent: urgentes, deferred: reportees };
  }

  // Applique les intentions au moteur (une intention nulle libère le joueur : le moteur le conduit).
  appliquer(engine, resultat) {
    for (const r of resultat.intents) {
      if (r.intent) engine.setAgentIntent(r.team, r.numero, r.intent); else engine.clearAgentIntent(r.team, r.numero);
    }
  }
}

// Fabrique les 30 agents d'un match (A1..A15, B1..B15) avec les mêmes options.
function creerAgents(options = {}, equipes = ['A', 'B']) {
  const out = [];
  for (const team of equipes) for (let numero = 1; numero <= 15; numero++) out.push(new GoalBasedRugbyAgent({ team, numero }, options));
  return out;
}

module.exports = { AgentScheduler, creerAgents };

  };
  defs["facts.js"] = function (module, exports, require) {
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

  };
  defs["goal-planner.js"] = function (module, exports, require) {
/*
 * Rugby Manager — GOAP symbolique V4 (socle déterministe).
 *
 * NE JOUE PAS le match : calcule un plan à coût minimal dans un espace
 * abstrait de faits. La physique et les lois sont validées séparément par
 * le moteur autoritatif au moment de l'exécution (future RM4-G07).
 * Zéro Date.now(), Math.random() ou état partagé.
 */
'use strict';

function isRecord(o) {
  return o !== null && typeof o === 'object' && !Array.isArray(o);
}
function isFactValue(v) {
  return v === null || typeof v === 'string' || typeof v === 'boolean'
    || (typeof v === 'number' && Number.isFinite(v));
}
function validateFacts(facts, label) {
  if (!isRecord(facts)) throw new TypeError(label + ' doit être un objet de faits');
  for (const [k, v] of Object.entries(facts)) {
    if (!k || !isFactValue(v)) throw new TypeError(label + ': fait invalide ' + k);
  }
}
function stableKey(facts) {
  validateFacts(facts, 'state');
  return JSON.stringify(Object.keys(facts).sort().map(k => [k, facts[k]]));
}
function satisfies(facts, required) {
  return Object.entries(required).every(([k, v]) => Object.prototype.hasOwnProperty.call(facts, k)
    && facts[k] === v);
}
function applyEffects(facts, effects) {
  return Object.assign({}, facts, effects);
}
function normalizeActions(actions) {
  if (!Array.isArray(actions)) throw new TypeError('actions doit être un tableau');
  const result = actions.map(a => {
    if (!a || typeof a.id !== 'string' || !a.id) throw new TypeError('action.id invalide');
    validateFacts(a.preconditions || {}, a.id + '.preconditions');
    validateFacts(a.effects || {}, a.id + '.effects');
    if (!Object.keys(a.effects || {}).length) throw new TypeError(a.id + ': aucun effet');
    if (!Number.isFinite(a.cost) || a.cost <= 0) throw new TypeError(a.id + ': coût strictement positif requis');
    return { id: a.id, preconditions: a.preconditions || {}, effects: a.effects, cost: a.cost };
  });
  if (new Set(result.map(a => a.id)).size !== result.length) throw new TypeError('identifiant action dupliqué');
  return result.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
/*
 * Dijkstra avant, à coût positif, dans un espace symbolique borné.
 *
 * Ce planner propose une SÉQUENCE d'actions et des effets ATTENDUS ; il
 * n'exécute aucune action ni ne modifie les faits sources.
 * Le simulateur doit vérifier physiquement chaque étape avant de valider
 * les effets ou de poursuivre le plan.
 */
function planGoal(initialFacts, desiredFacts, actions, options = {}) {
  validateFacts(initialFacts, 'initialFacts');
  validateFacts(desiredFacts, 'desiredFacts');
  const sortedActions = normalizeActions(actions);
  const maxExpanded = options.maxExpanded == null ? 128 : options.maxExpanded;
  const maxDepth = options.maxDepth == null ? 8 : options.maxDepth;
  if (!Number.isInteger(maxExpanded) || maxExpanded < 1 || !Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError('budgets de recherche invalides');
  }
  const initial = { ...initialFacts };
  if (satisfies(initial, desiredFacts)) {
    return { status: 'ALREADY_SATISFIED', steps: [], cost: 0, expanded: 0, finalFacts: initial };
  }
  let insertion = 0;
  const frontier = [{ facts: initial, key: stableKey(initial), cost: 0, steps: [], depth: 0, order: insertion++ }];
  const bestCost = new Map([[frontier[0].key, 0]]);
  let expanded = 0;
  let depthLimited = false;
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost || a.depth - b.depth || a.order - b.order);
    const node = frontier.shift();
    if (node.cost > bestCost.get(node.key) + 1e-9) continue;
    if (satisfies(node.facts, desiredFacts)) {
      return { status: 'OK', steps: node.steps, cost: node.cost, expanded, finalFacts: node.facts };
    }
    if (expanded >= maxExpanded) {
      return { status: 'BUDGET_EXCEEDED', steps: [], cost: null, expanded, finalFacts: null };
    }
    expanded++;
    if (node.depth >= maxDepth) {
      depthLimited = true;
      continue;
    }
    for (const action of sortedActions) {
      if (!satisfies(node.facts, action.preconditions)) continue;
      const nextFacts = applyEffects(node.facts, action.effects);
      const key = stableKey(nextFacts);
      const cost = node.cost + action.cost;
      if (cost + 1e-9 >= (bestCost.get(key) ?? Infinity)) continue;
      bestCost.set(key, cost);
      frontier.push({
        facts: nextFacts, key, cost, depth: node.depth + 1,
        steps: [...node.steps, action.id], order: insertion++,
      });
    }
  }
  return { status: depthLimited ? 'DEPTH_LIMIT' : 'NO_PLAN',
    steps: [], cost: null, expanded, finalFacts: null };
}
/*
 * Sélectionne le but de priorité maximale pour lequel existe un plan.
 * Il n'y a PAS de choix aléatoire ni de script du type "si 9, passe à 10".
 * La stabilisation des buts, engagements et replanifications appartient
 * à l'AgentController (future RM4-G07).
 */
function selectFeasibleGoal(initialFacts, goals, actions, options = {}) {
  validateFacts(initialFacts, 'initialFacts');
  if (!Array.isArray(goals)) throw new TypeError('goals doit être un tableau');
  const sorted = goals.map(g => {
    if (!g || !g.id || !Number.isFinite(g.priority)) throw new TypeError('goal invalide');
    validateFacts(g.desiredFacts, g.id + '.desiredFacts');
    return g;
  }).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id, 'en'));
  let satisfied = 0;
  for (const goal of sorted) {
    // Un but déjà atteint ne doit pas monopoliser l'agent et bloquer
    // les autres objectifs encore actifs sous prétexte de priorité.
    if (satisfies(initialFacts, goal.desiredFacts)) {
      satisfied++;
      continue;
    }
    const result = planGoal(initialFacts, goal.desiredFacts, actions, options);
    if (result.status === 'OK') {
      return { goalId: goal.id, ...result };
    }
  }
  return { goalId: null,
    status: satisfied === sorted.length ? 'ALL_GOALS_SATISFIED' : 'NO_FEASIBLE_GOAL',
    steps: [], cost: null };
}

module.exports = { stableKey, satisfies, planGoal, selectFeasibleGoal };

  };
  defs["goal-selector.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, sélecteur de buts d'UN agent (RM4-G05).
 *
 * select(beliefs, profile, playbook) renvoie le but choisi, la liste des buts
 * applicables avec leur priorité et, si le but change, un événement
 * d'explication. Engagement anti-oscillation : un but gardé reste actif au
 * moins `minCommit` secondes, et un challenger doit le dépasser de `margin`
 * points ; seules exceptions : un but SAFETY vital (priorité >= vitalThreshold),
 * ou un but courant devenu inapplicable / satisfait.
 * Pure vis-à-vis des croyances (gelées) ; seul l'objet sélecteur garde
 * l'engagement courant. Zéro Date.now() / Math.random().
 */
'use strict';

const { GOALS, profilePour, deriveSituation } = require('./goals.js');

class GoalSelector {
  constructor(agent, options = {}) {
    if (!agent || (agent.team !== 'A' && agent.team !== 'B') || !Number.isInteger(agent.numero)) throw new TypeError('agent invalide');
    this.agent = { team: agent.team, numero: agent.numero };
    this.minCommit = options.minCommit ?? 1.0;
    this.margin = options.margin ?? 12;
    this.vitalThreshold = options.vitalThreshold ?? 80;
    for (const k of ['minCommit', 'margin', 'vitalThreshold']) if (!Number.isFinite(this[k]) || this[k] < 0) throw new RangeError('option invalide : ' + k);
    this.profile = profilePour(agent.numero, options.profile);
    this.current = null; // { id, since, priority }
  }

  select(beliefs, playbook = {}) {
    const t = beliefs.t;
    const s = deriveSituation(beliefs);
    const candidats = [];
    for (const g of GOALS) {
      if (!g.applicable(s, this.profile, playbook)) continue;
      const p = Math.max(0, +g.priority(s, this.profile, playbook).toFixed(3));
      candidats.push({ id: g.id, priority: p, interrupt: g.interrupt });
    }
    // Tri stable : priorité décroissante, puis ordre du catalogue.
    const ordre = new Map(GOALS.map((g, i) => [g.id, i]));
    candidats.sort((a, b) => b.priority - a.priority || ordre.get(a.id) - ordre.get(b.id));
    const meilleur = candidats[0];
    if (!meilleur) throw new Error('aucun but applicable : ' + this.agent.team + this.agent.numero);

    let choix = meilleur, raison = this.current ? 'KEPT_BEST' : 'FIRST_CHOICE';
    const actuel = this.current ? candidats.find((c) => c.id === this.current.id) : null;
    const goalActuel = this.current ? GOALS.find((g) => g.id === this.current.id) : null;
    if (this.current) {
      const vital = meilleur.interrupt === 'SAFETY' && meilleur.priority >= this.vitalThreshold;
      const fini = !actuel || (goalActuel && goalActuel.satisfied(s, this.profile));
      if (actuel && meilleur.id === actuel.id && !fini) { choix = actuel; raison = 'KEPT_BEST'; }
      // Un but vital de sécurité préempte tout engagement non vital (D05), même si
      // l'ancien but est devenu inapplicable à cause de ce danger.
      else if (vital && (!actuel || actuel.interrupt !== 'SAFETY' || meilleur.priority > actuel.priority)) raison = 'PREEMPTED_BY_SAFETY';
      else if (fini) raison = actuel ? 'GOAL_SATISFIED' : 'GOAL_NO_LONGER_APPLICABLE';
      else if (t - this.current.since < this.minCommit) { choix = actuel; raison = 'COMMITTED'; }
      else if (meilleur.priority < actuel.priority + this.margin) { choix = actuel; raison = 'HYSTERESIS'; }
      else raison = 'BETTER_GOAL';
    }
    const from = this.current ? this.current.id : null;
    const change = from !== choix.id;
    if (change) this.current = { id: choix.id, since: t, priority: choix.priority };
    else this.current.priority = choix.priority;
    const events = change ? [{ t, type: 'GOAL_CHANGED', agent: this.agent.team + this.agent.numero, from, to: choix.id, reason: raison, priority: choix.priority }] : [];
    return Object.freeze({ t, goal: choix.id, priority: choix.priority, reason: raison, switched: change, since: this.current.since,
      candidates: Object.freeze(candidats.map((c) => Object.freeze(Object.assign({}, c)))), events: Object.freeze(events),
      situation: Object.freeze(Object.assign({}, s)) });
  }
}

module.exports = { GoalSelector };

  };
  defs["goals.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, catalogue des buts INDIVIDUELS et situation locale (RM4-G05).
 *
 * Un but est une CONDITION à atteindre, évaluée à partir des CROYANCES d'un
 * agent (AgentContext), jamais de l'état complet du match. Les numéros de poste
 * ne sont que des PROFILS (poids de préférence), jamais des scripts exclusifs :
 * n'importe quel joueur peut choisir n'importe quel but applicable si les
 * circonstances le justifient. Aucun coordinateur, aucune affectation globale.
 *
 * Les poids et seuils ci-dessous sont des HYPOTHÈSES D'INGÉNIERIE à calibrer
 * (RM4-G28/G36), pas des mesures de rugby réel.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const REGROUPEMENTS = new Set(['RUCK', 'MAUL', 'MELEE']);
const TOLERANCE_LIGNE = 0.3;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Profils : poids [0..1] d'un poste pour chaque famille de buts. Pas un rôle imposé.
const PROFILS_PAR_NUMERO = {
  1: { ruck: 0.9, contest: 0.5, defendTry: 0.5, cover: 0.05, aerial: 0.1, distribute: 0.05, option: 0.1, kick: 0.05, scrum: 1, lineout: 0.6 },
  2: { ruck: 0.9, contest: 0.5, defendTry: 0.5, cover: 0.05, aerial: 0.1, distribute: 0.1, option: 0.15, kick: 0.05, scrum: 1, lineout: 1 },
  3: { ruck: 0.9, contest: 0.5, defendTry: 0.5, cover: 0.05, aerial: 0.1, distribute: 0.05, option: 0.1, kick: 0.05, scrum: 1, lineout: 0.6 },
  4: { ruck: 0.85, contest: 0.6, defendTry: 0.55, cover: 0.05, aerial: 0.15, distribute: 0.05, option: 0.15, kick: 0.05, scrum: 1, lineout: 1 },
  5: { ruck: 0.85, contest: 0.6, defendTry: 0.55, cover: 0.05, aerial: 0.15, distribute: 0.05, option: 0.15, kick: 0.05, scrum: 1, lineout: 1 },
  6: { ruck: 0.85, contest: 0.8, defendTry: 0.6, cover: 0.1, aerial: 0.2, distribute: 0.05, option: 0.25, kick: 0.05, scrum: 1, lineout: 0.9 },
  7: { ruck: 0.8, contest: 1.0, defendTry: 0.6, cover: 0.1, aerial: 0.2, distribute: 0.05, option: 0.25, kick: 0.05, scrum: 1, lineout: 0.9 },
  8: { ruck: 0.85, contest: 0.8, defendTry: 0.6, cover: 0.1, aerial: 0.2, distribute: 0.2, option: 0.3, kick: 0.1, scrum: 1, lineout: 0.9 },
  9: { ruck: 0.2, contest: 0.2, defendTry: 0.7, cover: 0.35, aerial: 0.5, distribute: 1.0, option: 0.4, kick: 0.5, scrum: 1, lineout: 0.4 },
  10: { ruck: 0.1, contest: 0.1, defendTry: 0.75, cover: 0.4, aerial: 0.6, distribute: 0.5, option: 1.0, kick: 0.8, scrum: 0.5, lineout: 0.3 },
  11: { ruck: 0.05, contest: 0.05, defendTry: 0.85, cover: 0.8, aerial: 0.9, distribute: 0.1, option: 0.9, kick: 0.3, scrum: 0.2, lineout: 0.2 },
  12: { ruck: 0.1, contest: 0.1, defendTry: 0.8, cover: 0.3, aerial: 0.5, distribute: 0.3, option: 0.9, kick: 0.3, scrum: 0.3, lineout: 0.2 },
  13: { ruck: 0.1, contest: 0.1, defendTry: 0.85, cover: 0.3, aerial: 0.5, distribute: 0.2, option: 0.9, kick: 0.3, scrum: 0.3, lineout: 0.2 },
  14: { ruck: 0.05, contest: 0.05, defendTry: 0.85, cover: 0.8, aerial: 0.9, distribute: 0.1, option: 0.9, kick: 0.3, scrum: 0.2, lineout: 0.2 },
  15: { ruck: 0.05, contest: 0.05, defendTry: 1.0, cover: 1.0, aerial: 1.0, distribute: 0.1, option: 0.7, kick: 0.6, scrum: 0.1, lineout: 0.1 },
};
function profilePour(numero, extra) {
  const base = PROFILS_PAR_NUMERO[numero];
  if (!base) throw new RangeError('numéro de poste invalide : ' + numero);
  return Object.assign({ numero, fatigue: 0 }, base, extra || {});
}

// --- Situation locale, dérivée UNIQUEMENT des croyances ----------------------
function deriveSituation(b) {
  const self = b.self;
  const team = b.agent.team;
  const sens = self.sensAttaque || (team === 'A' ? 1 : -1);
  const phase = b.phase;
  const ball = b.ball && b.ball.lastSeen ? b.ball : null;
  const adv = team === 'A' ? 'B' : 'A';
  const maPoss = b.possession === team;
  const advPoss = b.possession === adv;
  const pt = ball && REGROUPEMENTS.has(phase) ? ball.lastSeen : null;
  const onside = self.kickOffside ? false : (pt ? (self.x - pt.x) * sens <= TOLERANCE_LIGNE : true);
  const distBalle = ball ? dist(self, ball.lastSeen) : Infinity;
  const moiId = team + b.agent.numero;
  const aLeBallon = !!(ball && ball.owner === moiId);
  const ligneDeFondX = team === 'A' ? 0 : 100; // la ligne que JE défends
  // Danger d'essai : porteur adverse proche de MA ligne, peu de défenseurs entre lui et elle.
  let danger = 0;
  const porteurAdv = ball && ball.owner && ball.owner[0] === adv
    ? (b.opponents[ball.owner] ? b.opponents[ball.owner].lastSeen : ball.lastSeen) : null;
  if (porteurAdv) {
    const d = Math.abs(porteurAdv.x - ligneDeFondX);
    const entre = (p) => (p.x - ligneDeFondX) * sens >= 0 && (porteurAdv.x - p.x) * sens >= -0.5 // entre la ligne et le porteur
      && Math.abs(p.y - porteurAdv.y) <= 14;
    // Je ne compte pas dans les défenseurs qui me rassurent : c'est à moi d'agir.
    let defenseurs = 0;
    for (const m of Object.values(b.teammates)) if (entre(m.lastSeen)) defenseurs++;
    danger = clamp01(1 - d / 40) * (defenseurs >= 2 ? 0.3 : defenseurs === 1 ? 0.65 : 1);
  }
  const partenairesPlusPres = Object.values(b.teammates).filter((m) => ball && dist(m.lastSeen, ball.lastSeen) < distBalle - 0.5).length;
  const neuf = Object.entries(b.teammates).find(([, m]) => m.numero === 9);
  const neufAuBallon = !!(neuf && ball && dist(neuf[1].lastSeen, ball.lastSeen) <= 4);
  const pression = Object.values(b.opponents).filter((o) => o.age <= 1 && dist(o.lastSeen, self) <= 5).length;
  const score = b.score ? (team === 'A' ? b.score.A - b.score.B : b.score.B - b.score.A) : 0;
  const finDeMatch = b.t > 4800 * 0.8;
  return { team, sens, phase, ball, maPoss, advPoss, pt, onside, distBalle, aLeBallon, danger,
    partenairesPlusPres, neufAuBallon, pression, score, finDeMatch, grounded: self.grounded, available: self.available,
    enVol: !!(ball && ball.state === 'AIR') || phase === 'COUP_DE_PIED_JEU' };
}

// --- Catalogue ---------------------------------------------------------------
// interrupt : 'SAFETY' (préempte un engagement), 'OPPORTUNITY', 'COMMIT'.
const G = (id, interrupt, applicable, priority, satisfied) => Object.freeze({ id, scope: 'PLAYER', interrupt, applicable, priority, satisfied: satisfied || (() => false) });

const GOALS = Object.freeze([
  G('RECOVER_AND_REJOIN', 'SAFETY', (s) => s.grounded, () => 95, (s) => !s.grounded),
  G('BECOME_ONSIDE', 'SAFETY', (s) => !s.grounded && !s.onside && (REGROUPEMENTS.has(s.phase) || s.phase === 'COUP_DE_PIED_JEU'), () => 90, (s) => s.onside),
  G('PREVENT_TRY', 'SAFETY', (s, p) => s.available && s.onside && s.danger >= 0.35, (s, p) => 55 + 45 * s.danger * p.defendTry, (s) => s.danger < 0.2),
  G('CONTEST_AERIAL_BALL', 'OPPORTUNITY', (s) => s.enVol && s.available && s.onside, (s, p) => 70 * p.aerial * clamp01(1.2 - s.distBalle / 35)),
  // L'arrière (profil cover >= 0,9) garde sa profondeur même quand son équipe attaque (menace de pied).
  G('COVER_BACKFIELD', 'COMMIT', (s, p) => s.available && s.onside && s.danger < 0.35 && (s.advPoss || s.enVol || (s.maPoss && p.cover >= 0.9)),
    (s, p) => (s.advPoss || s.enVol ? 60 : 38) * p.cover),
  G('DEFEND', 'COMMIT', (s) => s.available && s.onside && s.advPoss && !REGROUPEMENTS.has(s.phase), (s, p) => 50 + 10 * clamp01(1 - s.distBalle / 40) - 25 * p.fatigue),
  G('CONTEST_BREAKDOWN', 'OPPORTUNITY', (s) => s.phase === 'RUCK' && s.advPoss && s.available && s.onside, (s, p) => 62 * p.contest - 18 * Math.min(2, s.partenairesPlusPres) - 20 * p.fatigue),
  G('SECURE_RUCK', 'COMMIT', (s) => s.phase === 'RUCK' && s.maPoss && s.available && s.onside, (s, p) => 66 * p.ruck - 18 * Math.min(2, s.partenairesPlusPres) - 20 * p.fatigue),
  G('DISTRIBUTE_BALL', 'COMMIT', (s, profile) => (s.phase === 'RUCK' && s.maPoss && s.available && s.onside && s.distBalle <= 6 && !s.neufAuBallon) || (s.aLeBallon && s.phase === 'PORTE' && (s.pression > 0 || (profile.distribute ?? 0) >= 0.3)),
    // Personne n'est à la base du ruck : le plus proche prend la distribution (même un 10 ou un 8).
    (s, p) => 78 * p.distribute + (s.distBalle <= 3 && !s.neufAuBallon ? (p.distribute >= 0.3 ? 20 : 10) : 0)),
  G('RETAIN_POSSESSION', 'COMMIT', (s) => s.aLeBallon && s.phase === 'PORTE', (s) => 62 + 8 * Math.min(3, s.pression) + (s.finDeMatch && s.score > 0 ? 12 : 0)),
  G('GAIN_TERRITORY', 'OPPORTUNITY', (s) => s.aLeBallon && s.phase === 'PORTE', (s, p) => 50 + 25 * p.kick + (s.finDeMatch && s.score < 0 ? 12 : 0) - 8 * Math.min(3, s.pression)),
  G('SUPPORT_CARRIER', 'COMMIT', (s) => s.maPoss && s.phase === 'PORTE' && !s.aLeBallon && s.available && s.distBalle <= 30, (s, p) => 44 * (0.4 + 0.6 * p.ruck) * clamp01(1.1 - s.distBalle / 30)),
  G('BE_PASS_OPTION', 'COMMIT', (s) => s.maPoss && s.available && s.onside && (s.phase === 'PORTE' || s.phase === 'RUCK') && !s.aLeBallon, (s, p) => 46 * p.option),
  G('FORM_SCRUM_LEGALLY', 'COMMIT', (s) => s.phase === 'MELEE' && s.available, (s, p) => 80 * p.scrum),
  G('FORM_LINEOUT_LEGALLY', 'COMMIT', (s) => s.phase === 'TOUCHE' && s.available, (s, p) => 78 * p.lineout),
  // Toujours applicable : filet de sécurité (joueur en récupération, exclu temporaire...) — jamais « aucun but ».
  G('RETURN_TO_PLAYBOOK', 'COMMIT', () => true, () => 5),
]);
const GOAL_IDS = Object.freeze(GOALS.map((g) => g.id));

module.exports = { GOALS, GOAL_IDS, PROFILS_PAR_NUMERO, profilePour, deriveSituation, REGROUPEMENTS };

  };
  defs["goap-mode.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, mode GOAP du moteur (RM4-G11).
 *
 * Le moteur ne contient pas l'IA : en `aiMode: 'GOAP'` il appelle, avant chaque
 * tick physique, un PILOTE fourni par l'appelant. Ce fichier fabrique ce pilote :
 * 30 agents individuels (GoalBasedRugbyAgent) et leur ordonnanceur. Le pilote ne
 * fait que relayer : chaque agent décide seul, puis son intention de mouvement
 * est transmise au moteur (setAgentIntent). `aiMode: 'LEGACY'` reste le défaut.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { AgentScheduler, creerAgents } = require('./agent-scheduler.js');
const { LocalCommunication } = require('./local-communication.js');

// Fabrique de pilote à passer dans config.agentDriver.
function creerPiloteGOAP(options = {}) {
  return function fabrique() {
    const agents = creerAgents(Object.assign({ placement: true }, options.agent));
    const scheduler = new AgentScheduler(agents, options.scheduler);
    const comm = options.voix === false ? null : new LocalCommunication();
    return {
      agents, scheduler, comm,
      avantTick(engine) {
        const r = scheduler.tick(engine.getState(), comm);
        scheduler.appliquer(engine, r);
        if (comm) comm.prune(engine.tempsMatch);
      },
    };
  };
}

// Configuration de match en mode GOAP (ne modifie pas `config`).
function configGOAP(config, options) {
  // Rayon de contact du plaquage en mode GOAP : 3,5 m (mesuré : 2,2 m laissait passer le porteur entre deux défenseurs
  // espacés de 4 m ; 4 m supprimait presque tous les essais).
  return Object.assign({ rayonPlaquage: 3.5 }, config || {}, { aiMode: 'GOAP', agentDriver: creerPiloteGOAP(options) });
}

module.exports = { creerPiloteGOAP, configGOAP };

  };
  defs["individual-placement.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, placement INDIVIDUEL (RM4-G10).
 *
 * individualPlacement(beliefs, goalId, playbook, profile) : un joueur compare
 * ses propres candidats de placement à partir de ses croyances et du plan de jeu
 * en lecture seule, puis choisit le meilleur. Rien n'est calculé pour un autre
 * joueur ; la formation qui apparaît est la somme de décisions locales.
 *
 * Buts de placement évalués : HOLD_LINE, CLOSE_GAP, MARK_OPPONENT, PRESS_CARRIER
 * (seulement le défenseur observé le plus proche), COVER_BACKFIELD,
 * SUPPORT_CARRIER, BE_PASS_OPTION, PRESERVE_WIDTH, RETURN_TO_PLAYBOOK.
 * Un joueur hors-jeu n'est JAMAIS orienté vers un plaquage : la cible d'un
 * placement ne dépasse pas la ligne de hors-jeu qu'il connaît.
 * Pure, déterministe. Zéro Date.now() / Math.random().
 */
'use strict';

const P = require('./position-goals.js');
const { deriveSituation } = require('./goals.js');

const GAP_MIN = 11; // m : un intervalle observé plus large est « dangereux »

function voisinsDeLigne(b, ligneX, sens) {
  // Partenaires OBSERVÉS proches de la ligne défensive (±8 m de profondeur), triés par y.
  return Object.entries(b.teammates)
    .filter(([, m]) => m.confidence >= 0.3 && Math.abs(m.lastSeen.x - ligneX) <= 8)
    .map(([id, m]) => ({ id, x: m.lastSeen.x, y: m.lastSeen.y, numero: m.numero }))
    .sort((a, c) => a.y - c.y || a.id.localeCompare(c.id, 'en'));
}

function candidatsDefense(b, s, pb, profile) {
  const me = b.self, bal = s.ball && s.ball.lastSeen;
  const sens = s.sens, num = b.agent.numero;
  const out = [];
  if (!bal) return [{ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: P.referenceDefense(num, sens, { x: me.x, y: me.y }, pb), vmax: 0.8, reason: 'ballon inconnu : retour au poste' }];
  // La profondeur de ligne du plan de jeu vaut pour une phase ARRÊTÉE (hors-jeu au ruck, au maul,
  // à la mêlée). En jeu courant, la ligne MONTE sur le porteur : la garder 5 m derrière le ballon
  // la faisait reculer à la vitesse du porteur — plus aucun contact (mesuré : −45 % de plaquages).
  const arretee = s.phase === 'RUCK' || s.phase === 'MAUL' || s.phase === 'MELEE' || s.phase === 'TOUCHE';
  const ligneX = arretee ? P.ligneDefensive(sens, bal, pb) : P.clamp(bal.x - sens * 3, 0, 100);
  const ref = { x: num === 15 ? P.referenceDefense(num, sens, bal, pb).x : ligneX, y: P.referenceDefense(num, sens, bal, pb).y };
  // HOLD_LINE : aligné sur les voisins observés, jamais en avance sur eux (on retient sa montée).
  const voisins = voisinsDeLigne(b, ligneX, sens).filter((v) => Math.abs(v.y - ref.y) <= 15);
  const xVoisins = voisins.length ? voisins.map((v) => v.x).sort((a, c) => a - c)[Math.floor(voisins.length / 2)] : ligneX;
  // On monte ENSEMBLE : jamais plus de 3 m devant ses voisins observés (1 m sur phase arrêtée). Avec 1 m en jeu
  // courant, une ligne en retard retenait tout le monde et le porteur gagnait 20 m sans opposition.
  const avance = arretee ? 1 : 3;
  const xTenu = sens > 0 ? Math.min(ligneX, xVoisins + avance) : Math.max(ligneX, xVoisins - avance);
  // Glissement : en jeu courant la ligne se resserre vers le ballon (60 % de l'écart latéral ; à 35 % il restait 5,7 défenseurs devant le porteur contre 7,8 en LEGACY).
  const yTenu = arretee ? ref.y : ref.y + (bal.y - ref.y) * 0.6;
  out.push({ id: 'HOLD_LINE', priority: 60, target: { x: xTenu, y: yTenu }, vmax: Math.abs(bal.y - ref.y) <= 15 ? 1 : 0.85, reason: 'ligne alignée sur ' + voisins.length + ' voisin(s) observé(s)' });
  // CLOSE_GAP : plus grand intervalle observé près de moi, si je suis le mieux placé parmi ceux que je vois.
  const ligne = voisins.concat([{ id: 'moi', x: me.x, y: me.y, numero: num }]).sort((a, c) => a.y - c.y);
  let meilleur = null;
  for (let i = 0; i + 1 < ligne.length; i++) {
    const g = ligne[i + 1].y - ligne[i].y;
    if (g > GAP_MIN) {
      const centre = { x: ligneX, y: (ligne[i].y + ligne[i + 1].y) / 2 };
      const dMoi = P.dist(me, centre);
      const plusProche = Object.values(b.teammates).every((m) => P.dist(m.lastSeen, centre) >= dMoi - 0.01);
      if (plusProche && (!meilleur || g > meilleur.g)) meilleur = { g, centre };
    }
  }
  if (meilleur) out.push({ id: 'CLOSE_GAP', priority: Math.min(85, 62 + (meilleur.g - GAP_MIN) * 3), target: meilleur.centre, vmax: 1, reason: 'intervalle de ' + meilleur.g.toFixed(1) + ' m, je suis le plus proche' });
  // MARK_OPPONENT : adversaire observé menaçant dans mon canal, sans partenaire visiblement plus proche.
  const menaces = Object.entries(b.opponents).filter(([, o]) => o.confidence >= 0.3 && o.threat > 0.15 && Math.abs(o.lastSeen.y - ref.y) <= 10 && P.dist(o.lastSeen, me) <= 14)
    .sort((a, c) => c[1].threat - a[1].threat || a[0].localeCompare(c[0], 'en'));
  for (const [id, o] of menaces) {
    const dMoi = P.dist(o.lastSeen, me);
    if (Object.values(b.teammates).some((m) => P.dist(m.lastSeen, o.lastSeen) < dMoi - 1)) continue;
    out.push({ id: 'MARK_OPPONENT', priority: 58 + 20 * o.threat, target: { x: o.lastSeen.x - sens * 1.5, y: o.lastSeen.y }, vmax: 1, reason: 'marque ' + id });
    break;
  }
  // PRESS_CARRIER : seulement si je suis le défenseur observé le plus proche du porteur, à moins de 7 m.
  const porteur = s.ball.owner && s.ball.owner[0] !== s.team ? (b.opponents[s.ball.owner] ? b.opponents[s.ball.owner].lastSeen : bal) : null;
  if (porteur && s.onside) {
    const dMoi = P.dist(me, porteur);
    // Le plaqueur ET son assistant : je presse si, parmi les partenaires que je vois, un seul au plus est
    // plus près du porteur que moi, et que le porteur est à moins de 10 m. Jamais une ruée.
    const plusPres = Object.values(b.teammates).filter((m) => P.dist(m.lastSeen, porteur) < dMoi).length;
    if (dMoi <= 12 && plusPres <= 1) out.push({ id: 'PRESS_CARRIER', priority: plusPres === 0 ? 74 : 68,
      // Interception : on vise DEVANT le porteur (il court vers ma ligne), pas sa position actuelle.
      target: { x: P.clamp(porteur.x - sens * Math.min(4, dMoi * 0.4), 0, 100), y: porteur.y }, vmax: 1, reason: plusPres === 0 ? 'plus proche défenseur observé du porteur' : 'second défenseur observé : assiste le plaqueur' });
  }
  out.push({ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: ref, vmax: 0.8, reason: 'poste nominal en défense' });
  return out;
}

function candidatsAttaque(b, s, pb, profile) {
  const me = b.self, bal = s.ball && s.ball.lastSeen, sens = s.sens, num = b.agent.numero;
  if (!bal) return [{ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: { x: me.x, y: me.y }, vmax: 0.6, reason: 'ballon inconnu' }];
  const ref = P.referenceAttaque(num, sens, bal, pb);
  const out = [];
  out.push({ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: ref, vmax: 0.85, reason: 'poste nominal en attaque' });
  // BE_PASS_OPTION : profondeur et angle recevables derrière le porteur.
  out.push({ id: 'BE_PASS_OPTION', priority: 46 * (profile.option ?? 0.5) + 20, target: ref, vmax: 1, reason: 'option de passe à ma profondeur de poste' });
  // PRESERVE_WIDTH : un canal très large reste tenu même si le ballon est loin.
  if (Math.abs(ref.y - P.LARGEUR / 2) >= 22) out.push({ id: 'PRESERVE_WIDTH', priority: 64, target: { x: ref.x, y: ref.y }, vmax: 0.9, reason: 'canal large tenu (' + ref.y.toFixed(0) + ' m)' });
  // SUPPORT_CARRIER : 5 m derrière le ballon, du côté où je vois le moins de partenaires.
  const mates = Object.values(b.teammates).filter((m) => P.dist(m.lastSeen, bal) <= 12);
  const gauche = mates.filter((m) => m.lastSeen.y < bal.y).length, droite = mates.length - gauche;
  const cote = gauche > droite ? 1 : gauche < droite ? -1 : (bal.y < P.LARGEUR / 2 ? 1 : -1);
  const proche = P.dist(me, bal);
  if (proche <= 25) out.push({ id: 'SUPPORT_CARRIER', priority: 44 * (0.4 + 0.6 * (profile.ruck ?? 0.5)) * Math.max(0.1, 1.1 - proche / 25) + 10,
    target: { x: P.clamp(bal.x - sens * 5, 0, 100), y: P.clamp(bal.y + cote * 5, 1, P.LARGEUR - 1) }, vmax: 1, reason: 'soutien côté le moins occupé (' + (cote > 0 ? '+y' : '-y') + ')' });
  return out;
}

// Choisit son placement. `goalId` = but retenu par le sélecteur (il restreint les familles).
function individualPlacement(beliefs, goalId, playbook, profile = {}) {
  const pb = P.lirePlaybook(playbook);
  const s = deriveSituation(beliefs);
  let cands;
  if (goalId === 'COVER_BACKFIELD' || goalId === 'PREVENT_TRY') {
    const bal = s.ball && s.ball.lastSeen;
    cands = [{ id: goalId === 'PREVENT_TRY' ? 'PREVENT_TRY' : 'COVER_BACKFIELD', priority: 60,
      target: bal ? (goalId === 'PREVENT_TRY' ? { x: P.clamp(bal.x - s.sens * 6, 0, 100), y: bal.y } : P.referenceFond(s.sens, bal, pb)) : { x: beliefs.self.x, y: beliefs.self.y },
      vmax: goalId === 'PREVENT_TRY' ? 1 : 0.75, reason: goalId === 'PREVENT_TRY' ? 'intercepte entre le porteur et la ligne' : 'profondeur conservée' }];
  } else if (goalId === 'DEFEND') cands = candidatsDefense(beliefs, s, pb, profile);
  else if (goalId === 'SUPPORT_CARRIER' || goalId === 'BE_PASS_OPTION' || goalId === 'RETURN_TO_PLAYBOOK' || goalId === 'GAIN_TERRITORY' || goalId === 'RETAIN_POSSESSION') {
    cands = s.maPoss || s.aLeBallon ? candidatsAttaque(beliefs, s, pb, profile) : candidatsDefense(beliefs, s, pb, profile);
    if (goalId === 'SUPPORT_CARRIER') cands = cands.filter((c) => c.id === 'SUPPORT_CARRIER' || c.id === 'RETURN_TO_PLAYBOOK');
    if (goalId === 'BE_PASS_OPTION') cands = cands.filter((c) => c.id !== 'SUPPORT_CARRIER');
    if (goalId === 'RETURN_TO_PLAYBOOK') cands = cands.filter((c) => c.id === 'RETURN_TO_PLAYBOOK');
  } else return null; // les autres buts (plan GOAP, mêlée, touche) conduisent le joueur autrement
  // Coût de déplacement : temps estimé + pénalité hors-jeu (un candidat hors-jeu est INVALIDE).
  const sens = s.sens;
  const evalues = cands.map((c) => {
    const d = P.dist(beliefs.self, c.target);
    const v = Math.max(3, (profile.vitesseMs || 6.5) * (1 - 0.3 * (profile.fatigue || 0)));
    const t = d / v;
    const pt = s.pt;
    const horsJeu = pt && c.id !== 'PRESS_CARRIER' ? (c.target.x - pt.x) * sens > 0.3 && (s.phase === 'RUCK' || s.phase === 'MAUL') : false;
    return Object.assign({}, c, { travel: +t.toFixed(2), valide: !horsJeu, score: c.priority - 2.5 * t });
  });
  const valides = evalues.filter((c) => c.valide);
  valides.sort((a, c) => c.score - a.score || a.id.localeCompare(c.id, 'en'));
  const choix = valides[0] || evalues.sort((a, c) => c.score - a.score)[0];
  return Object.freeze({ placementGoal: choix.id, target: Object.freeze({ x: +P.clamp(choix.target.x, 0, 100).toFixed(3), y: +P.clamp(choix.target.y, 0, P.LARGEUR).toFixed(3) }),
    vmaxFactor: choix.vmax, reason: choix.reason, candidates: Object.freeze(evalues.map((c) => Object.freeze({ id: c.id, score: +c.score.toFixed(2), valide: c.valide }))) });
}

module.exports = { individualPlacement, GAP_MIN };

  };
  defs["local-communication.js"] = function (module, exports, require) {
/*
 * Rugby Manager V4 — communication vocale locale (prototype autonome).
 *
 * TRANSPORT DE SIGNAUX SEULEMENT : aucune selection de but, aucun ordre de
 * placement, aucune connaissance globale ni mutation du moteur physique.
 * Chaque joueur decide lui-meme s'il parle puis interprete ce qu'il entend.
 * Le moteur pourra raccorder ce transport lors de RM4-G04/G08.
 *
 * Toutes les durees sont exprimees en secondes de TEMPS SIMULE.
 * Determinisme strict : pas de Math.random(), de timer ni de Date.now().
 */
'use strict';

const CALLS = Object.freeze({
  MINE: Object.freeze({ label: "J'ai !", radiusM: 14, ttlSeconds: 1.2 }),
  BALL: Object.freeze({ label: 'Ballon !', radiusM: 17, ttlSeconds: 1.4 }),
  INSIDE: Object.freeze({ label: 'Intérieur !', radiusM: 18, ttlSeconds: 1.5 }),
  OUTSIDE: Object.freeze({ label: 'Extérieur !', radiusM: 18, ttlSeconds: 1.5 }),
  SUPPORT: Object.freeze({ label: 'Soutien !', radiusM: 16, ttlSeconds: 1.4 }),
  HOLD: Object.freeze({ label: 'Tiens !', radiusM: 16, ttlSeconds: 1.2 }),
  UP: Object.freeze({ label: 'Monte !', radiusM: 19, ttlSeconds: 1.3 }),
  SLIDE: Object.freeze({ label: 'Glisse !', radiusM: 19, ttlSeconds: 1.3 }),
  COVER: Object.freeze({ label: 'Je couvre !', radiusM: 18, ttlSeconds: 1.5 }),
  KICK: Object.freeze({ label: 'Pied !', radiusM: 22, ttlSeconds: 1.5 }),
  LEAVE: Object.freeze({ label: 'Laisse !', radiusM: 15, ttlSeconds: 1.0 }),
  // Dialogues courts 9 ↔ 10 puis demandes du 9 aux partenaires.
  LINEOUT_ASK: Object.freeze({ label: 'Touche, on joue quoi ?', radiusM: 24, ttlSeconds: 2.5 }),
  LINEOUT_FRONT: Object.freeze({ label: 'Touche devant !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_MIDDLE: Object.freeze({ label: 'Touche milieu !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_BACK: Object.freeze({ label: 'Touche fond !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_MAUL: Object.freeze({ label: 'Touche, maul !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_WIDE: Object.freeze({ label: 'Touche au large !', radiusM: 22, ttlSeconds: 2.2 }),
  SCRUM_8_ASK: Object.freeze({ label: 'Huit, tu peux partir ?', radiusM: 18, ttlSeconds: 2.4 }),
  SCRUM_8_READY: Object.freeze({ label: 'Je peux partir !', radiusM: 18, ttlSeconds: 2.1 }),
  SCRUM_8_BLOCKED: Object.freeze({ label: 'Non, je garde !', radiusM: 18, ttlSeconds: 2.1 }),
  SCRUM_8_BREAK: Object.freeze({ label: 'Départ du huit !', radiusM: 19, ttlSeconds: 2.2 }),
  // "Prêt" = possibilité. "J'y vais" = prise imminente : le 9 peut réagir.
  SCRUM_8_GOING: Object.freeze({ label: "Neuf, j'y vais !", radiusM: 12, ttlSeconds: 0.9 }),
  SCRUM_8_ABORT: Object.freeze({ label: 'Neuf, je laisse !', radiusM: 12, ttlSeconds: 0.9 }),
  SCRUM_9_ACK: Object.freeze({ label: "Reçu, j'te suis !", radiusM: 12, ttlSeconds: 0.9 }),
  SCRUM_OPTIONS_ASK: Object.freeze({ label: 'On joue au près, au large ou on avance ?', radiusM: 25, ttlSeconds: 2.5 }),
  SCRUM_NEAR: Object.freeze({ label: 'Au près !', radiusM: 24, ttlSeconds: 2.2 }),
  SCRUM_WIDE: Object.freeze({ label: 'Au large !', radiusM: 25, ttlSeconds: 2.2 }),
  SCRUM_ADVANCE: Object.freeze({ label: 'On avance !', radiusM: 22, ttlSeconds: 2.2 }),
  SCRUM_ASK: Object.freeze({ label: 'Mêlée, comment ça tient ?', radiusM: 20, ttlSeconds: 2.5 }),
  SCRUM_STEADY: Object.freeze({ label: 'Stables !', radiusM: 19, ttlSeconds: 1.8 }),
  SCRUM_DRIVE: Object.freeze({ label: 'Poussée forte !', radiusM: 19, ttlSeconds: 1.8 }),
  SCRUM_PRESSURE: Object.freeze({ label: 'Ça tourne !', radiusM: 19, ttlSeconds: 1.7 }),
  SCRUM_UNSTABLE: Object.freeze({ label: 'Ça lâche !', radiusM: 19, ttlSeconds: 1.7 }),
  KICK_HIGH: Object.freeze({ label: 'Chandelle !', radiusM: 28, ttlSeconds: 2.3 }),
  KICK_CHASE: Object.freeze({ label: 'Chasse !', radiusM: 28, ttlSeconds: 1.9 }),
});

function validNumber(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new TypeError(name + ' doit être fini');
  }
}
function checkActor(id, team, x, y, time) {
  if (team !== 'A' && team !== 'B') throw new TypeError('équipe invalide');
  if (typeof id !== 'string' || !new RegExp('^' + team + '(?:[1-9]|1[0-5])$').test(id)) {
    throw new TypeError('identifiant joueur invalide');
  }
  validNumber(x, 'x');
  validNumber(y, 'y');
  validNumber(time, 'time');
  if (time < 0) throw new RangeError('temps négatif');
}
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/*
 * Une petite file d'événements acoustiques est nécessaire pour simuler le
 * délai et la portée. Ce n'est PAS une IA d'équipe : elle ne contient aucune
 * attribution, position-cible, goal, plan, ordre de mouvement ou décision.
 */
class LocalCommunication {
  constructor(options = {}) {
    this.baseLatencySeconds = options.baseLatencySeconds ?? 0.12;
    this.soundSpeedMps = options.soundSpeedMps ?? 343;
    this.cooldownSeconds = options.cooldownSeconds ?? 0.7;
    this.maxPending = options.maxPending ?? 256;
    this.enabled = options.enabled !== false;
    for (const k of ['baseLatencySeconds', 'soundSpeedMps', 'cooldownSeconds', 'maxPending']) {
      validNumber(this[k], k);
    }
    if (this.baseLatencySeconds < 0 || this.soundSpeedMps <= 0 ||
        this.cooldownSeconds < 0 || !Number.isInteger(this.maxPending) || this.maxPending < 1) {
      throw new RangeError('paramètres de communication invalides');
    }
    this.messages = [];
    this.lastBySpeaker = new Map();
    this.sequence = 0;
  }

  emit({ speakerId, team, kind, x, y, time, available = true,
         toId = null, replyTo = null, phaseId = null }) {
    checkActor(speakerId, team, x, y, time);
    if (!Object.prototype.hasOwnProperty.call(CALLS, kind)) {
      throw new TypeError('appel inconnu : ' + kind);
    }
    if (toId !== null) {
      if (typeof toId !== 'string' ||
          !new RegExp('^' + team + '(?:[1-9]|1[0-5])' + '$').test(toId) ||
          toId === speakerId) {
        throw new TypeError('destinataire invalide');
      }
    }
    if (replyTo !== null &&
        (typeof replyTo !== 'string' || !/^CALL-[1-9][0-9]*$/.test(replyTo))) {
      throw new TypeError('réponse à un appel invalide');
    }
    if (phaseId !== null && (typeof phaseId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(phaseId))) {
      throw new TypeError('phaseId invalide');
    }
    if ((kind === 'SCRUM_8_GOING' || kind === 'SCRUM_8_ABORT') &&
        speakerId !== team + '8') {
      throw new TypeError('seul le numéro 8 peut annoncer son départ/abandon');
    }
    if (kind === 'SCRUM_9_ACK' && speakerId !== team + '9') {
      throw new TypeError('seul le numéro 9 peut accuser réception');
    }
    if ((kind === 'SCRUM_8_GOING' || kind === 'SCRUM_8_ABORT') &&
        toId !== team + '9') {
      throw new TypeError('le 8 doit prévenir directement le 9');
    }
    if (kind === 'SCRUM_9_ACK' && toId !== team + '8') {
      throw new TypeError('le 9 doit répondre directement au 8');
    }
    if (!this.enabled || !available) return { accepted: false, reason: 'UNAVAILABLE' };
    // Une réponse n'est possible que si le joueur a EFFECTIVEMENT entendu
    // la question et peut encore en discuter ; pas de télépathie.
    if (replyTo !== null) {
      const original = this.messages.find(msg => msg.id === replyTo);
      if (!original || original.team !== team ||
          original.speakerId !== toId ||
          (original.toId !== null && original.toId !== speakerId) ||
          (phaseId !== null && original.phaseId !== phaseId) ||
          !original.receivedBy.has(speakerId) ||
          time < original.emittedAt || time > original.expiresAt) {
        throw new TypeError('réponse sans demande réellement entendue');
      }
    }
    const previous = this.lastBySpeaker.get(speakerId);
    if (previous != null && time < previous) throw new RangeError('temps non monotone pour ' + speakerId);
    // Un "je pars" ne doit pas être bloqué par le "je suis prêt" dit
    // quelques instants avant : c'est le message le plus important pour le 9.
    // On conserve toutefois une émission maximum de chaque alerte par phase.
    const critical = kind === 'SCRUM_8_GOING' || kind === 'SCRUM_8_ABORT' ||
      kind === 'SCRUM_9_ACK';
    if (critical && phaseId === null) {
      throw new TypeError('phaseId obligatoire pour une alerte de mêlée');
    }
    if (previous != null && time - previous < this.cooldownSeconds && !critical) {
      return { accepted: false, reason: 'COOLDOWN' };
    }
    this.prune(time);
    if (critical && this.messages.some(m => m.speakerId === speakerId &&
        m.kind === kind && m.phaseId === phaseId)) {
      return { accepted: false, reason: 'DUPLICATE_PHASE_CALL' };
    }
    if (this.messages.length >= this.maxPending) {
      return { accepted: false, reason: 'QUEUE_FULL' };
    }
    const id = 'CALL-' + (++this.sequence);
    const spec = CALLS[kind];
    this.messages.push({
      id, speakerId, team, kind, x, y, toId, replyTo, phaseId, emittedAt: time,
      expiresAt: time + spec.ttlSeconds, receivedBy: new Set(),
    });
    this.lastBySpeaker.set(speakerId, time);
    return { accepted: true, id };
  }

  hear({ listenerId, team, x, y, time, available = true, hearing = 1,
         phaseId = null }) {
    checkActor(listenerId, team, x, y, time);
    validNumber(hearing, 'hearing');
    if (hearing < 0 || hearing > 1) throw new RangeError('hearing hors [0,1]');
    if (phaseId !== null && (typeof phaseId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(phaseId))) {
      throw new TypeError('phaseId invalide');
    }
    if (!this.enabled || !available || hearing === 0) return [];
    const result = [];
    for (const msg of this.messages) {
      if (msg.team !== team || msg.speakerId === listenerId ||
          (msg.toId !== null && msg.toId !== listenerId) ||
          (phaseId !== null && phaseId !== msg.phaseId) ||
          msg.receivedBy.has(listenerId)) continue;
      const spec = CALLS[msg.kind];
      const meters = distance(x, y, msg.x, msg.y);
      if (meters > spec.radiusM * hearing) continue;
      const arrival = msg.emittedAt + this.baseLatencySeconds +
        meters / this.soundSpeedMps;
      if (time + 1e-9 < arrival || time > msg.expiresAt + 1e-9) continue;
      msg.receivedBy.add(listenerId);
      result.push(Object.freeze({
        id: msg.id, from: msg.speakerId, kind: msg.kind, label: spec.label,
        toId: msg.toId, replyTo: msg.replyTo, phaseId: msg.phaseId,
        spokenAt: msg.emittedAt, heardAt: time,
        // Confiance de compréhension uniquement, ni ordre ni fait certain.
        confidence: Math.max(0.1, Math.min(1, hearing * (1 - 0.55 * meters / spec.radiusM))),
      }));
    }
    return result;
  }

  prune(time) {
    validNumber(time, 'time');
    const before = this.messages.length;
    this.messages = this.messages.filter(m => m.expiresAt + 1e-9 >= time);
    return before - this.messages.length;
  }

  pendingCount() {
    return this.messages.length;
  }
}
module.exports = { CALLS, LocalCommunication };

  };
  defs["perception.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, capteurs d'un agent (RM4-G04).
 *
 * observe(state, agent, params) : ce que CE joueur voit à cet instant, calculé
 * depuis getState() sans le modifier. Fonction PURE : même état + même agent
 * + mêmes paramètres => même observation. Zéro Date.now() / Math.random().
 *
 * Information PARTIELLE : un joueur ne voit que dans son champ de vision (cône
 * autour de son orientation) et à portée, plus un petit rayon de conscience
 * périphérique ; un paquet de joueurs entre lui et le ballon le lui cache.
 * `params.omniscient = true` (débogage, désactivé par défaut) voit tout.
 */
'use strict';

const DEFAUTS = Object.freeze({
  visionRange: 45,        // m : portée de la vue
  fovDeg: 200,            // champ de vision horizontal
  peripheralRadius: 6,    // m : on sent les joueurs tout proches, même dans le dos
  occlusionBodies: 3,     // nombre de joueurs alignés qui cachent le ballon
  occlusionWidth: 1.0,    // m : écart max à la ligne de vue pour « cacher »
  omniscient: false,
});

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function id(j) { return j.team + j.numero; }

function normaliserParams(params) {
  const p = Object.assign({}, DEFAUTS, params || {});
  for (const k of ['visionRange', 'fovDeg', 'peripheralRadius', 'occlusionBodies', 'occlusionWidth']) {
    if (!Number.isFinite(p[k]) || p[k] < 0) throw new RangeError('paramètre de perception invalide : ' + k);
  }
  if (p.fovDeg > 360) throw new RangeError('fovDeg > 360');
  return p;
}

function distSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

// Cible dans le cône de vue de `moi` (ou dans son rayon périphérique) ?
function dansLeChamp(moi, cible, p) {
  const d = dist(moi, cible);
  if (d > p.visionRange) return false;
  if (d <= p.peripheralRadius) return true;
  if (p.fovDeg >= 360) return true;
  const cap = Math.atan2(cible.y - moi.y, cible.x - moi.x);
  // Le REGARD (p.gaze, direction en radians) prime sur l'orientation du corps : un joueur tourne la tête
  // vers le ballon qu'il suit, même s'il court dans une autre direction.
  let ecart = Math.abs(cap - (Number.isFinite(p.gaze) ? p.gaze : (moi.orientation || 0)));
  ecart = Math.min(ecart, 2 * Math.PI - ecart);
  return ecart <= (p.fovDeg * Math.PI / 360);
}

// Ballon caché : au moins `occlusionBodies` autres joueurs sur la ligne de vue.
function ballonCache(moi, ballon, joueurs, p) {
  if (dist(moi, ballon) <= p.peripheralRadius) return false;
  let n = 0;
  for (const j of joueurs) {
    if (j === moi) continue;
    const s = distSegment(j, moi, ballon);
    if (s.d <= p.occlusionWidth && s.t > 0.05 && s.t < 0.98) n++;
  }
  return n >= p.occlusionBodies;
}

function observe(state, agent, params) {
  if (!state || !state.equipeA || !state.equipeB) throw new TypeError('état de match invalide');
  const p = normaliserParams(params);
  const tous = [...state.equipeA, ...state.equipeB];
  const moi = tous.find((j) => j.team === agent.team && j.numero === agent.numero);
  if (!moi) throw new RangeError(`agent introuvable : ${agent.team}${agent.numero}`);
  const t = state.tempsMatch;
  const vus = { teammates: {}, opponents: {}, ball: null };
  for (const j of tous) {
    if (j === moi) continue;
    if (!p.omniscient && !dansLeChamp(moi, j, p)) continue;
    const entree = { x: j.x, y: j.y, numero: j.numero };
    (j.team === moi.team ? vus.teammates : vus.opponents)[id(j)] = entree;
  }
  const b = state.ball || state.ballon;
  if (b && Number.isFinite(b.x)) {
    const visible = p.omniscient || (dansLeChamp(moi, b, p) && !ballonCache(moi, b, tous, p));
    if (visible) {
      vus.ball = {
        x: b.x, y: b.y, state: state.ball ? state.ball.state : null,
        owner: state.ball && state.ball.carrierTeam ? state.ball.carrierTeam + state.ball.carrierNumber : null,
      };
    }
  }
  // Le statut du ruck (ballon jouable ? défenseurs engagés ?) ne se lit que si l'on voit le ballon.
  vus.ruck = null;
  if (vus.ball && state.phase === 'RUCK' && state.ruck) {
    vus.ruck = { ballAvailable: !!state.ruck.ballAvailable, defendersCommitted: state.ruck.defendersCommitted || 0,
      attackersCommitted: state.ruck.attackersCommitted || 0 };
  }
  return {
    t, agent: { team: moi.team, numero: moi.numero },
    self: { x: moi.x, y: moi.y, orientation: moi.orientation || 0, vitesse: moi.vitesseCourante || 0,
      auSol: moi.auSol > 0, sinBin: moi.sinBin > 0, sensAttaque: moi.sensAttaque },
    phase: state.phase, possession: state.possession, score: state.score,
    vus,
  };
}

module.exports = { observe, normaliserParams, DEFAUTS, dansLeChamp, ballonCache };

  };
  defs["position-goals.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, références de placement et buts de placement (RM4-G10).
 *
 * Tout ce fichier est LECTURE SEULE et par JOUEUR : à partir d'un plan de jeu
 * commun (passif) et des CROYANCES d'UN agent, il fabrique les emplacements
 * candidats de ce joueur. Jamais de fonction qui calcule les cibles de plusieurs
 * joueurs à la fois : pas de TeamCoordinator, pas de réservation, pas d'enchère.
 * Les distances, profondeurs et priorités sont des HYPOTHÈSES d'ingénierie à
 * calibrer (RM4-G28/G36). Terrain : x 0..100, y 0..70 ; A attaque vers x croissant.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const LARGEUR = 70;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const PLAYBOOK_DEFAUT = Object.freeze({
  attackStructure: '1331', attackWidth: 1, defenseStyle: 'PRESS', defensiveLineDepth: 5, backfieldCoverage: 'ONE',
});
const lirePlaybook = (p) => Object.assign({}, PLAYBOOK_DEFAUT, p || {});

// Canaux défensifs nominaux (de gauche à droite) : un canal par défenseur de ligne.
const ORDRE_CANAUX = Object.freeze([11, 6, 12, 4, 1, 2, 3, 5, 7, 10, 9, 8, 13, 14]);
function canalDefensif(numero) {
  const i = ORDRE_CANAUX.indexOf(numero);
  return i < 0 ? 35 : 5 + i * (60 / (ORDRE_CANAUX.length - 1));
}

// Créneaux d'avants (décalage latéral à la balle) selon la structure d'attaque connue de tous.
const CRENEAUX_AVANTS = Object.freeze({
  '1331': { 1: -9, 2: -6, 3: -3, 4: 3, 5: 6, 6: 9, 7: -14, 8: 14 },
  '242': { 1: -10, 2: -7, 3: 7, 4: -4, 5: 4, 6: 10, 7: -16, 8: 16 },
});

// Point de référence en ATTAQUE du poste `numero` (son emplacement nominal, pas un ordre).
function referenceAttaque(numero, sens, balle, playbook) {
  const pb = lirePlaybook(playbook);
  const cote = balle.y < LARGEUR / 2 ? 1 : -1; // côté ouvert : vers le centre du terrain
  const x = (profondeur) => clamp(balle.x - sens * profondeur, 0, 100);
  if (numero <= 8) {
    const dy = (CRENEAUX_AVANTS[pb.attackStructure] || CRENEAUX_AVANTS['1331'])[numero];
    return { x: x(4), y: clamp(balle.y + dy, 2, LARGEUR - 2) };
  }
  switch (numero) {
    case 9: return { x: x(1), y: clamp(balle.y + cote * 1.5, 1, LARGEUR - 1) };
    case 10: return { x: x(10), y: clamp(balle.y + cote * 8, 2, LARGEUR - 2) };
    case 12: return { x: x(12), y: clamp(balle.y + cote * 16, 2, LARGEUR - 2) };
    case 13: return { x: x(14), y: clamp(balle.y + cote * 25, 2, LARGEUR - 2) };
    case 11: return { x: x(15), y: clamp(6 + (pb.attackWidth - 1) * 3, 2, 20) };
    case 14: return { x: x(15), y: clamp(LARGEUR - 6 - (pb.attackWidth - 1) * 3, LARGEUR - 20, LARGEUR - 2) };
    default: return { x: x(28), y: clamp(LARGEUR / 2 + (balle.y - LARGEUR / 2) * 0.4, 5, LARGEUR - 5) }; // 15
  }
}

// Ligne défensive : en retrait de la balle vers MA ligne de but, profondeur selon le plan de jeu.
function ligneDefensive(sens, balle, playbook) {
  const pb = lirePlaybook(playbook);
  const style = { PRESS: 1, DRIFT: 1.3, CONSERVATIVE: 1.6 }[pb.defenseStyle] || 1;
  return clamp(balle.x - sens * pb.defensiveLineDepth * style, 0, 100);
}
// Référence en DÉFENSE : sur la ligne, dans son canal nominal (le 15 couvre le fond).
function referenceDefense(numero, sens, balle, playbook) {
  if (numero === 15) return referenceFond(sens, balle, playbook);
  return { x: ligneDefensive(sens, balle, playbook), y: canalDefensif(numero) };
}
// Couverture du fond : 22 m derrière la ligne, latéralement à 40 % vers la balle.
function referenceFond(sens, balle, playbook) {
  const l = ligneDefensive(sens, balle, playbook);
  return { x: clamp(l - sens * 22, 2, 98), y: clamp(LARGEUR / 2 + (balle.y - LARGEUR / 2) * 0.4, 5, LARGEUR - 5) };
}

module.exports = { lirePlaybook, PLAYBOOK_DEFAUT, canalDefensif, referenceAttaque, referenceDefense, referenceFond, ligneDefensive, ORDRE_CANAUX, CRENEAUX_AVANTS, dist, clamp, LARGEUR };

  };
  defs["world-model.js"] = function (module, exports, require) {
/*
 * Rugby Manager — V4, extraction PURE des faits depuis getState() (RM4-G03).
 *
 * Aucune possession n'est recalculée ici : `TEAM_POSSESSION` /
 * `OPPONENT_POSSESSION` ne font que relire `state.possession`. Rien n'est
 * stocké, rien n'est modifié : même état + même agent => même résultat, le
 * résultat est gelé (instantané immuable). Zéro Date.now() ou Math.random().
 *
 * extractFacts(state, agent, options) renvoie
 *   { schemaVersion, t, agent, authoritative, self, perceived, facts, absent }
 * - authoritative : faits lus dans le moteur (phase, ballon, mêlée, ruck...) ;
 * - self          : faits sur le joueur `agent` ({team, numero}) ;
 * - perceived     : { NOM: { value, t } } estimations géométriques horodatées ;
 * - facts         : fusion à plat des trois (booléens) — l'entrée du planificateur ;
 * - absent        : faits du catalogue NON calculables ici (jamais renvoyés comme faux).
 */
'use strict';

const { FACT_SCHEMA_VERSION, FACTS, FACT_NAMES, assertNoConflicts } = require('./facts.js');

const TOLERANCE_LIGNE = 0.3;   // m : marge sur la ligne du ballon
const RAYON_RUCK = 3.0;        // m : « au ruck » = dans ce rayon du point de regroupement
const RAYON_LIE = 2.0;         // m : « lié » = au contact du regroupement
const COULOIR_PASSE = 1.5;     // m : un adversaire plus près que ça de la trajectoire la ferme
const MARQUAGE = 3.0;          // m : receveur « marqué » si un adversaire est plus près
const TOLERANCE_CIBLE = 1.0;   // m : SELF_AT_TARGET

const ETATS_MELEE_BALLON_ENTRE = new Set(['MELEE_INTRODUCTION', 'MELEE_CONTESTATION', 'MELEE_SORTIE']);
const ETATS_MELEE_EN_PLACE = new Set(['MELEE_SET', 'MELEE_INTRODUCTION', 'MELEE_CONTESTATION', 'MELEE_SORTIE']);

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function joueur(state, team, numero) {
  const eq = team === 'A' ? state.equipeA : state.equipeB;
  return (eq || []).find((j) => j.numero === numero) || null;
}

// Point du regroupement courant (ruck, maul ou mêlée) ou null.
function pointRegroupement(state) {
  if (state.phase === 'RUCK' && state.ruck) return { x: state.ruck.x, y: state.ruck.y };
  if (state.phase === 'MAUL' && state.maul) return { x: state.maul.x, y: state.maul.y };
  if (state.phase === 'MELEE' && state.melee) return { x: state.melee.x, y: state.melee.y };
  return null;
}

// Faits lus dans le moteur, communs à tous les agents.
function faitsAutoritatifs(state, team) {
  const ball = state.ball || {};
  const f = {};
  // `ball.state` fait foi. Le drapeau de rendu `ballon.enVol` reste vrai pendant
  // l'introduction en mêlée (ballon à 3 cm du sol dans le tunnel) : constat RM4-G03.
  f.BALL_IN_FLIGHT = ball.state === 'AIR';
  f.BALL_AT_RUCK = state.phase === 'RUCK' && ball.state === 'RUCK';
  f.BALL_AVAILABLE = !!(state.phase === 'RUCK' && state.ruck && state.ruck.ballAvailable)
    || (state.phase === 'MAUL' && !!state.maul && state.maul.etat === 'MAUL_USE_IT');
  f.TEAM_POSSESSION = state.possession === team;
  f.OPPONENT_POSSESSION = state.possession !== team && (state.possession === 'A' || state.possession === 'B');
  f.BREAKDOWN_CONTEST_ACTIVE = state.phase === 'RUCK' && !!state.ruck && state.ruck.defendersCommitted > 0 && !state.ruck.ballAvailable;
  const mel = state.phase === 'MELEE' ? state.melee : null;
  f.SCRUM_SET = !!(mel && ETATS_MELEE_EN_PLACE.has(mel.etat));
  f.SCRUM_BALL_IN = !!(mel && ETATS_MELEE_BALLON_ENTRE.has(mel.etat) && mel.balle && mel.balle.etat !== 'MAINS_9');
  f.TRY_SCORED = state.phase === 'ESSAI';
  return f;
}

// Hors-jeu (loi 10/11/16/19, version simplifiée DOCUMENTÉE) : au ruck, au maul
// et en mêlée, on est en jeu derrière la ligne du ballon (selon son sens
// d'attaque) ; après un coup de pied, tant que `horsJeuKick` court on ne l'est pas ;
// ailleurs (jeu ouvert) la notion ne s'applique pas.
function enJeu(state, j, pt) {
  if (j.horsJeuKick > 0) return false;
  if (pt) return (j.x - pt.x) * j.sensAttaque <= TOLERANCE_LIGNE;
  return true;
}

function faitsPersonnels(state, agent, options) {
  const j = joueur(state, agent.team, agent.numero);
  if (!j) throw new RangeError(`agent introuvable : ${agent.team}${agent.numero}`);
  const pt = pointRegroupement(state);
  const f = {};
  f.SELF_GROUNDED = j.auSol > 0;
  f.SELF_AVAILABLE = !(j.auSol > 0) && !(j.sinBin > 0) && !(j.ruckRecovery > 0);
  f.SELF_ONSIDE = enJeu(state, j, pt);
  const proche = pt ? dist(j, pt) : Infinity;
  f.SELF_BOUND = !f.SELF_GROUNDED && !!pt && (
    ((state.phase === 'RUCK' || state.phase === 'MAUL') && proche <= RAYON_LIE)
    || (state.phase === 'MELEE' && j.numero <= 8 && proche <= 12));
  f.SELF_AT_RUCK = !f.SELF_GROUNDED && !!pt && (state.phase === 'RUCK' || state.phase === 'MAUL')
    && proche <= RAYON_RUCK && enJeu(state, j, pt);
  // Un joueur au sol n'a plus le ballon EN JEU, même si le moteur le désigne encore porteur le temps du plaquage
  // (constat RM4-G17 : sinon « au sol et porteur », exception en plein tick GOAP).
  f.HAS_BALL = !f.SELF_GROUNDED && !!state.ball && state.ball.carrierTeam === j.team && state.ball.carrierNumber === j.numero;
  f.KICK_CHASE_ONSIDE = state.phase === 'COUP_DE_PIED_JEU' && !(j.horsJeuKick > 0) && state.possession === j.team;
  if (options && options.target) f.SELF_AT_TARGET = dist(j, options.target) <= TOLERANCE_CIBLE;
  return f;
}

// Distance d'un point à un segment, et appartenance au segment.
function distSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Estimations géométriques de l'agent (couloir de passe vers le n°10 de son équipe).
function faitsPercus(state, agent) {
  const me = joueur(state, agent.team, agent.numero);
  const dix = joueur(state, agent.team, 10);
  const t = state.tempsMatch;
  const out = {};
  if (!me || !dix || me.numero === 10) return out;
  const adversaires = (agent.team === 'A' ? state.equipeB : state.equipeA).filter((j) => !(j.sinBin > 0));
  // Passe légale : jamais vers l'avant (le receveur n'est pas plus avancé que le passeur).
  const enArriere = (dix.x - me.x) * me.sensAttaque <= 0.5;
  const couloirLibre = !adversaires.some((j) => distSegment(j, me, dix) < COULOIR_PASSE);
  out.PASS_LANE_10_OPEN = { value: enArriere && couloirLibre, t };
  const marque = adversaires.some((j) => dist(j, dix) < MARQUAGE);
  out.RECEIVER_OPEN = { value: enArriere && couloirLibre && !marque, t };
  return out;
}

function extractFacts(state, agent, options = {}) {
  if (!state || !state.equipeA || !state.equipeB) throw new TypeError('état de match invalide');
  if (!agent || (agent.team !== 'A' && agent.team !== 'B') || !Number.isInteger(agent.numero)) throw new TypeError('agent invalide');
  const authoritative = faitsAutoritatifs(state, agent.team);
  const self = faitsPersonnels(state, agent, options);
  const perceived = faitsPercus(state, agent);
  const facts = Object.assign({}, authoritative, self);
  for (const [k, v] of Object.entries(perceived)) facts[k] = v.value;
  assertNoConflicts(facts);
  const absent = FACT_NAMES.filter((n) => !(n in facts));
  return deepFreeze({
    schemaVersion: FACT_SCHEMA_VERSION,
    t: state.tempsMatch,
    agent: { team: agent.team, numero: agent.numero },
    authoritative, self, perceived, facts, absent,
  });
}

module.exports = { extractFacts, pointRegroupement, FACTS };

  };
  var mode = req('goap-mode.js');
  global.RugbyAI = { configGOAP: mode.configGOAP, creerPiloteGOAP: mode.creerPiloteGOAP };
})(typeof window !== 'undefined' ? window : globalThis);
