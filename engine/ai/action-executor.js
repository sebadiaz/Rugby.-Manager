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
// KICK_FOR_TERRITORY (A23) : le porteur DEMANDE le pied (intention `botte`), le moteur le frappe (portée, hors-jeu des
// chasseurs, touche, réception). Type choisi selon SA zone : touche depuis ses 22, occupation dans son camp,
// chandelle dans le camp adverse. Succès = coup de pied réellement parti (phase COUP_DE_PIED_JEU, ballon en l'air).
const typePied = (c) => { const d = c.sens > 0 ? c.me.x : 100 - c.me.x; return d < 22 ? 'TOUCHE' : d < 50 ? 'OCCUPATION' : 'CHANDELLE'; };
ACTEURS.KICK_FOR_TERRITORY = {
  maxSeconds: 2,
  startGuard: (c) => (!c.facts.HAS_BALL ? 'NOT_CARRIER' : !c.facts.SELF_ONSIDE ? 'OFFSIDE' : c.state.phase !== 'PORTE' ? 'NOT_OPEN_PLAY' : null),
  intent: (c) => ({ tx: c.me.x, ty: c.me.y, vmaxFactor: 0.4, botte: typePied(c) }),
  successGuard: (c) => c.state.phase === 'COUP_DE_PIED_JEU' && !!(c.state.ball && c.state.ball.state === 'AIR'),
  failGuard: (c) => (c.state.phase === 'RUCK' || c.state.phase === 'MELEE' ? 'CARRIER_LOST_BALL' : null),
  abortGuard: () => null,
};
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
