// RM4-G02 — Injecteur de scénarios déterministes (docs/SIMULATION_V4/PLAN_CLAUDE_CODE.md).
//
// API RÉSERVÉE AUX TESTS : ce fichier n'est chargé par aucune page du jeu et
// n'ajoute rien à getState(). Il construit un MatchEngine à partir d'une
// fixture de `docs/SIMULATION_V4/fixtures/scenarios.json` : les 30 joueurs
// sont posés aux coordonnées de la fixture, puis la phase est ENTRÉE par la
// porte légale du moteur (`_plaquerSurPlace`, `_formerMelee`, `_accorderTouche`,
// `_formerMaul`, `_executerCoupDePiedJeu`), jamais en écrivant des champs
// dérivés à la main (`ruckPoint`, `contestants`, `maul`, `melee`, ...).
//
// PRÉCONDITIONS (refus avec ScenarioError, jamais de correction silencieuse) :
//   1. exactement 30 joueurs, A1..A15 et B1..B15, identifiants uniques ;
//   2. coordonnées finies, dans le terrain (0..100 × 0..70) ;
//   3. possession 'A' ou 'B' ; phase prise en charge (RUCK, MELEE, TOUCHE,
//      MAUL, PORTE, COUP_DE_PIED_JEU) ;
//   4. PORTE : le porteur désigné appartient à l'équipe en possession ;
//   5. TOUCHE : le ballon est sur une ligne de touche (y = 0 ou y = 70) ;
//   6. COUP_DE_PIED_JEU : l'équipe en possession a un botteur (joueur le plus
//      proche du ballon).
//
// ÉCARTS DE LA FIXTURE, DÉCLARÉS (jamais silencieux). Les fixtures V4 sont des
// données SYNTHÉTIQUES dont le ballon est parfois à 10-50 m de son porteur
// (S02, S05–S10). Le harnais les rend légales en déplaçant UN seul élément,
// toujours listé dans `moteur.scenarioEcarts` ([{id, type, metres, ...}]) :
//   - PORTE : le ballon est mis aux pieds du porteur désigné (ce sont les
//     joueurs de la fixture qui font foi) ;
//   - RUCK / MAUL : le joueur en possession le plus proche du ballon (le
//     plaqué / le porteur du maul) et le défenseur le plus proche (le plaqueur)
//     sont amenés au point de regroupement s'ils en sont à plus de 2 m / 3 m ;
//   - COUP_DE_PIED_JEU : le coup de pied part du botteur (le point « en vol »
//     de la fixture n'est pas reproduit : le moteur calcule son propre vol).
// Avec `{ strict: true }` le moindre écart est refusé (ScenarioError). Les
// tests figent la liste des écarts attendus pour chaque fixture.
//
// Le harnais ne déplace aucun joueur PENDANT le match : seul l'état initial
// est posé, puis le moteur déroule ses propres ticks (vitesse bornée, inertie).
'use strict';

const { MatchEngine, LONGUEUR, LARGEUR } = require('../../engine/rugby-engine.js');

class ScenarioError extends Error {}

const PHASES = ['RUCK', 'MELEE', 'TOUCHE', 'MAUL', 'PORTE', 'COUP_DE_PIED_JEU'];
const DUREE_MATCH = 4800;

function exiger(cond, message) { if (!cond) throw new ScenarioError(message); }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function valider(fixture) {
  exiger(fixture && fixture.setup && Array.isArray(fixture.setup.players), 'fixture sans setup.players');
  const { setup } = fixture;
  exiger(Number.isInteger(fixture.seed) && fixture.seed > 0, `${fixture.id} : graine invalide`);
  exiger(setup.players.length === 30, `${fixture.id} : ${setup.players.length} joueurs au lieu de 30`);
  const vus = new Set();
  for (const j of setup.players) {
    exiger(j.team === 'A' || j.team === 'B', `${fixture.id} : équipe invalide ${j.id}`);
    exiger(Number.isInteger(j.number) && j.number >= 1 && j.number <= 15, `${fixture.id} : numéro invalide ${j.id}`);
    exiger(j.id === j.team + j.number && !vus.has(j.id), `${fixture.id} : identifiant incohérent ou en double ${j.id}`);
    vus.add(j.id);
    exiger(Number.isFinite(j.x) && Number.isFinite(j.y), `${fixture.id} : coordonnées non finies ${j.id}`);
    exiger(j.x >= 0 && j.x <= LONGUEUR && j.y >= 0 && j.y <= LARGEUR, `${fixture.id} : ${j.id} hors du terrain`);
  }
  exiger(PHASES.includes(fixture.phase), `${fixture.id} : phase non prise en charge (${fixture.phase})`);
  exiger(setup.possession === 'A' || setup.possession === 'B', `${fixture.id} : possession invalide`);
  const b = setup.ball;
  exiger(b && Number.isFinite(b.x) && Number.isFinite(b.y), `${fixture.id} : ballon invalide`);
}

// Le joueur de `equipe` le plus proche de `p`.
function plusProche(joueurs, p) {
  return joueurs.reduce((m, j) => (!m || dist(j, p) < dist(m, p) ? j : m), null);
}

function createScenarioEngine(fixture, options = {}) {
  valider(fixture);
  const ecarts = [];
  const ecart = (type, id, metres, detail) => {
    if (options.strict) throw new ScenarioError(`${fixture.id} : écart ${type} (${id}, ${metres.toFixed(1)} m) refusé en mode strict`);
    ecarts.push(Object.assign({ type, id, metres: +metres.toFixed(1) }, detail || {}));
  };
  const { setup } = fixture;
  const m = new MatchEngine(fixture.seed, options.duree || DUREE_MATCH, Object.assign({ blessures: false }, options.config || {}));

  // 1) Poser les 30 joueurs ; vitesse nulle, personne au sol, pas d'exclusion.
  for (const f of setup.players) {
    const j = (f.team === 'A' ? m.equipeA : m.equipeB).find((x) => x.numero === f.number);
    j.x = f.x; j.y = f.y;
    j.auSol = 0; j.ruckRecovery = 0; j.sinBin = 0; j.horsJeuKick = 0;
    j.channelY = f.y;
  }
  // 2) Sortir proprement de l'état de coup d'envoi du moteur (ballon en l'air).
  m.ballonEnVol = false; m.ballonVolHauteur = 0; m._rouleBallon = null;
  m.possession = setup.possession;
  const eqPoss = setup.possession === 'A' ? m.equipeA : m.equipeB;
  const eqAdv = setup.possession === 'A' ? m.equipeB : m.equipeA;
  const bp = { x: setup.ball.x, y: setup.ball.y };

  // 3) Entrer dans la phase par la porte légale du moteur.
  switch (fixture.phase) {
    case 'PORTE': {
      const id = setup.ball.carrier;
      const porteur = eqPoss.find((j) => j.team + j.numero === id);
      exiger(porteur, `${fixture.id} : porteur ${id} absent de l'équipe en possession`);
      if (dist(porteur, bp) > 0.5) ecart('BALLON_AU_PORTEUR', id, dist(porteur, bp));
      m.porteur = porteur; m.phase = 'PORTE'; m.timerPhase = 0;
      break;
    }
    case 'RUCK': case 'MAUL': {
      const porteur = plusProche(eqPoss, bp), adversaire = plusProche(eqAdv, bp);
      if (dist(porteur, bp) > 2) { ecart('JOUEUR_AMENE_AU_REGROUPEMENT', porteur.team + porteur.numero, dist(porteur, bp)); porteur.x = bp.x; porteur.y = bp.y; porteur.channelY = bp.y; }
      if (dist(adversaire, bp) > 3) {
        ecart('JOUEUR_AMENE_AU_REGROUPEMENT', adversaire.team + adversaire.numero, dist(adversaire, bp));
        // Du côté défendu : en avant du ballon par rapport au sens d'attaque.
        adversaire.x = Math.max(0, Math.min(LONGUEUR, bp.x + porteur.sensAttaque * 1.2)); adversaire.y = bp.y; adversaire.channelY = bp.y;
      }
      m.porteur = porteur;
      if (fixture.phase === 'RUCK') m._plaquerSurPlace(porteur, adversaire);
      else m._formerMaul(porteur, adversaire);
      break;
    }
    case 'MELEE':
      exiger(bp.x >= 0 && bp.x <= LONGUEUR && bp.y >= 0 && bp.y <= LARGEUR, `${fixture.id} : mêlée hors terrain`);
      // L'équipe qui introduit est celle en possession : la fautive est l'autre.
      m._accorderMelee(setup.possession === 'A' ? 'B' : 'A', bp);
      break;
    case 'TOUCHE':
      exiger(bp.y === 0 || bp.y === LARGEUR, `${fixture.id} : le ballon n'est pas sur une ligne de touche`);
      // La possession finale est celle de l'équipe qui lance : la sortante est l'autre.
      m._accorderTouche(setup.possession === 'A' ? 'B' : 'A', bp, 'COUP_DE_PIED');
      break;
    case 'COUP_DE_PIED_JEU': {
      const botteur = plusProche(eqPoss, bp);
      if (dist(botteur, bp) > 2) ecart('COUP_DE_PIED_DEPUIS_LE_BOTTEUR', botteur.team + botteur.numero, dist(botteur, bp));
      m.porteur = botteur; m.phase = 'PORTE';
      m._tenterCoupDePiedJeu(botteur, options.typeCoupDePied || 'CHANDELLE');
      exiger(m.phase === 'COUP_DE_PIED_JEU', `${fixture.id} : le moteur n'a pas lancé le coup de pied`);
      break;
    }
    default:
      throw new ScenarioError(`${fixture.id} : phase ${fixture.phase}`);
  }
  m.scenarioEcarts = ecarts;
  return m;
}

module.exports = { createScenarioEngine, ScenarioError, PHASES };
