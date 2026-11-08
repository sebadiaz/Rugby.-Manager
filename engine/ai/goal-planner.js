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
