/*
 * Rugby Manager — V4, capteurs d'un agent (RM4-G04).
 *
 * observe(state, agent, params) : ce que CE joueur voit à cet instant, calculé
 * depuis getState() sans le modifier. Fonction PURE : même état + même agent
 * + mêmes paramètres => même observation. Zéro Date.now() / Math.random().
 *
 * Information PARTIELLE : un joueur ne voit que dans son champ de vision (cône
 * autour de son orientation) et à portée, plus un petit rayon de conscience
 * périphérique ; un paquet de joueurs entre lui et le ballon le lui cache.
 * `params.omniscient = true` (débogage, désactivé par défaut) voit tout.
 */
'use strict';

const DEFAUTS = Object.freeze({
  visionRange: 45,        // m : portée de la vue
  fovDeg: 200,            // champ de vision horizontal
  peripheralRadius: 6,    // m : on sent les joueurs tout proches, même dans le dos
  occlusionBodies: 3,     // nombre de joueurs alignés qui cachent le ballon
  occlusionWidth: 1.0,    // m : écart max à la ligne de vue pour « cacher »
  omniscient: false,
});

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function id(j) { return j.team + j.numero; }

function normaliserParams(params) {
  const p = Object.assign({}, DEFAUTS, params || {});
  for (const k of ['visionRange', 'fovDeg', 'peripheralRadius', 'occlusionBodies', 'occlusionWidth']) {
    if (!Number.isFinite(p[k]) || p[k] < 0) throw new RangeError('paramètre de perception invalide : ' + k);
  }
  if (p.fovDeg > 360) throw new RangeError('fovDeg > 360');
  return p;
}

function distSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

// Cible dans le cône de vue de `moi` (ou dans son rayon périphérique) ?
function dansLeChamp(moi, cible, p) {
  const d = dist(moi, cible);
  if (d > p.visionRange) return false;
  if (d <= p.peripheralRadius) return true;
  if (p.fovDeg >= 360) return true;
  const cap = Math.atan2(cible.y - moi.y, cible.x - moi.x);
  // Le REGARD (p.gaze, direction en radians) prime sur l'orientation du corps : un joueur tourne la tête
  // vers le ballon qu'il suit, même s'il court dans une autre direction.
  let ecart = Math.abs(cap - (Number.isFinite(p.gaze) ? p.gaze : (moi.orientation || 0)));
  ecart = Math.min(ecart, 2 * Math.PI - ecart);
  return ecart <= (p.fovDeg * Math.PI / 360);
}

// Ballon caché : au moins `occlusionBodies` autres joueurs sur la ligne de vue.
function ballonCache(moi, ballon, joueurs, p) {
  if (dist(moi, ballon) <= p.peripheralRadius) return false;
  let n = 0;
  for (const j of joueurs) {
    if (j === moi) continue;
    const s = distSegment(j, moi, ballon);
    if (s.d <= p.occlusionWidth && s.t > 0.05 && s.t < 0.98) n++;
  }
  return n >= p.occlusionBodies;
}

function observe(state, agent, params) {
  if (!state || !state.equipeA || !state.equipeB) throw new TypeError('état de match invalide');
  const p = normaliserParams(params);
  const tous = [...state.equipeA, ...state.equipeB];
  const moi = tous.find((j) => j.team === agent.team && j.numero === agent.numero);
  if (!moi) throw new RangeError(`agent introuvable : ${agent.team}${agent.numero}`);
  const t = state.tempsMatch;
  const vus = { teammates: {}, opponents: {}, ball: null };
  for (const j of tous) {
    if (j === moi) continue;
    if (!p.omniscient && !dansLeChamp(moi, j, p)) continue;
    const entree = { x: j.x, y: j.y, numero: j.numero };
    (j.team === moi.team ? vus.teammates : vus.opponents)[id(j)] = entree;
  }
  const b = state.ball || state.ballon;
  if (b && Number.isFinite(b.x)) {
    const visible = p.omniscient || (dansLeChamp(moi, b, p) && !ballonCache(moi, b, tous, p));
    if (visible) {
      vus.ball = {
        x: b.x, y: b.y, state: state.ball ? state.ball.state : null,
        owner: state.ball && state.ball.carrierTeam ? state.ball.carrierTeam + state.ball.carrierNumber : null,
      };
    }
  }
  // Le statut du ruck (ballon jouable ? défenseurs engagés ?) ne se lit que si l'on voit le ballon.
  vus.ruck = null;
  if (vus.ball && state.phase === 'RUCK' && state.ruck) {
    vus.ruck = { ballAvailable: !!state.ruck.ballAvailable, defendersCommitted: state.ruck.defendersCommitted || 0,
      attackersCommitted: state.ruck.attackersCommitted || 0 };
  }
  return {
    t, agent: { team: moi.team, numero: moi.numero },
    self: { x: moi.x, y: moi.y, orientation: moi.orientation || 0, vitesse: moi.vitesseCourante || 0,
      auSol: moi.auSol > 0, sinBin: moi.sinBin > 0, sensAttaque: moi.sensAttaque },
    phase: state.phase, possession: state.possession, score: state.score,
    vus,
  };
}

module.exports = { observe, normaliserParams, DEFAUTS, dansLeChamp, ballonCache };
