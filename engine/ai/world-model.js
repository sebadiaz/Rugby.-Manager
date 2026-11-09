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
  f.HAS_BALL = !!state.ball && state.ball.carrierTeam === j.team && state.ball.carrierNumber === j.numero;
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
