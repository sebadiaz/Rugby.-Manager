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
      const passeEnCours = this.executor.busy && /^PASS_TO/.test(this.executor.current.name) && this._sit.aLeBallon
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
