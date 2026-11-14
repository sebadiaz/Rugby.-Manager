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
  return Object.assign({ rayonPlaquage: 3.5, pieds: 'AGENTS' }, config || {}, { aiMode: 'GOAP', agentDriver: creerPiloteGOAP(options) });
}

module.exports = { creerPiloteGOAP, configGOAP };
