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

// Ce que l'équipe sait de son buteur : portée de tir et gain d'un coup de pied en touche (mêmes formules que le moteur).
function porteesButeur(engine, team) {
  const eq = team === 'A' ? engine?.equipeA : engine?.equipeB;
  const b = eq && eq.find((j) => j.numero === engine?.buteurNumero?.[team]);
  const jp = b && typeof b.jeuPied === 'number' ? b.jeuPied : 60;
  return { porteeButeur: 40 + (jp - 60) * 0.25, gainTouche: 32 + (jp - 60) * 0.35 };
}

// Fabrique de pilote à passer dans config.agentDriver.
function creerPiloteGOAP(options = {}) {
  return function fabrique(engine) {
    const playbooks = {};
    for (const team of ['A', 'B']) {
      const attaque = engine?.cfgAttaque?.[team] || {};
      playbooks[team] = {
        attackStructure: attaque.structureAvants || '1331',
        attackWidth: attaque.ailiers === 'large' ? 1.4 : attaque.ailiers === 'repique' ? 0.7 : 1,
        sortieAvant: attaque.sortieAvant, passeCentres: attaque.passeCentres,
        tauxJeuAuPied: attaque.tauxJeuAuPied, piedOuvreur: attaque.piedOuvreur,
        // Consigne « maul en touche » du club (lecture seule) : le 9 la pèse dans SON choix d'appel.
        maulTouche: engine?.cfgTouche?.[team]?.tauxMaul?.proche,
        // Consigne de pénalité du club et portée connue du buteur désigné (lecture seule).
        choixPenalites: attaque.choixPenalites || null,
        ...porteesButeur(engine, team),
      };
    }
    const agents = creerAgents(Object.assign({ placement: true, openPlay: true, playbooks }, options.agent));
    const scheduler = new AgentScheduler(agents, options.scheduler);
    const comm = options.voix === false ? null : new LocalCommunication();
    return {
      agents, scheduler, comm,
      avantTick(engine) {
        const r = scheduler.tick(engine.getAgentState(), comm);
        scheduler.appliquer(engine, r);
        if (comm) comm.prune(engine.tempsMatch);
      },
    };
  };
}

// Configuration de match en mode GOAP (ne modifie pas `config`).
function configGOAP(config, options) {
  // Distance de déclenchement de la tentative : elle inclut le dernier pas
  // et l'allonge, dans le jeu courant des agents. La résolution reste au moteur.
  return Object.assign({ rayonPlaquage: 3.7 }, config || {}, { aiMode: 'GOAP', agentDriver: creerPiloteGOAP(options) });
}

module.exports = { creerPiloteGOAP, configGOAP };
