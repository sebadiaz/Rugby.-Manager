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
