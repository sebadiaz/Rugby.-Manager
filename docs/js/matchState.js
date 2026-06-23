// Adaptateur d'état de match : prend l'état brut renvoyé par
// MatchEngine.getState() (engine/rugby-engine.js) et l'expose sous une forme
// normalisée, plus simple à consommer par le rendu/l'UI.
//
// Important : ceci est un adaptateur de lecture, pas le moteur lui-même. Le
// moteur (engine/rugby-engine.js) reste l'unique source de vérité pour les
// règles et la simulation ; ce module ne fait que ranger les mêmes données
// sous des clés plus explicites (teams.A/teams.B, clock, ball, eventLog...).
// La séparation complète models/teams/rules/simulation décrite dans la cible
// de refonte est une étape ultérieure : le moteur actuel est une classe
// unique cohérente et testée (server/simulate.js), la découper en plusieurs
// fichiers est un chantier à part, à faire avec sa propre vérification de
// non-régression plutôt que dans le même geste que l'extraction de l'UI.
(function (global) {
  'use strict';

  function normalizeMatchState(rawState) {
    return {
      teams: { A: rawState.equipeA, B: rawState.equipeB },
      score: rawState.score,
      clock: {
        time: rawState.tempsMatch,
        duration: rawState.dureeMatch,
        period: rawState.periode,
      },
      phase: rawState.phase,
      possession: rawState.possession,
      // % de possession réel (temps de jeu effectif par équipe), pas une
      // valeur fixe : cf. MatchEngine.getState().
      possessionPct: rawState.possessionPct,
      // Objet ballon normalisé { x, y, vx, vy, state, carrierTeam, carrierNumber }
      // exposé directement par le moteur (cf. MatchEngine.getState()).
      ball: rawState.ball,
      currentEvent: rawState.events.length ? rawState.events[rawState.events.length - 1] : null,
      eventLog: rawState.events,
      ruck: rawState.ruck,
      maul: rawState.maul,
      // Pas encore modélisé séparément côté moteur (mêlée/touche/pénalité sont
      // des phases à part entière plutôt qu'un sous-objet `setPiece` dédié) :
      // exposé à null pour ne pas mentir sur ce qui existe vraiment.
      setPiece: null,
      // Idem : pas encore extrait du flux d'événements en tant que champ dédié.
      lastScorer: null,
      // Conservés pour compatibilité avec le rendu existant pendant la
      // migration (porteur direct, forme historique du ballon).
      porteur: rawState.porteur,
      ballon: rawState.ballon,
      arbitre: rawState.arbitre,
    };
  }

  global.RMMatchState = { normalizeMatchState };
})(window);
