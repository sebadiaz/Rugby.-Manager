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
