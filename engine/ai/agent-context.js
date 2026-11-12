/*
 * Rugby Manager — V4, croyances locales d'UN agent (RM4-G04).
 *
 * AgentContext tient la mémoire d'un seul joueur : ce qu'il a vu, quand, et ce
 * qu'il a entendu de ses partenaires. Il ne lit l'état du match que par
 * observe() (vue partielle) et ne le modifie jamais. Deux agents ont donc des
 * croyances différentes dès que leurs positions diffèrent. Aucune mémoire
 * partagée entre agents, aucun coordinateur.
 *
 *  - délai de réaction : l'observation n'est rafraîchie que tous les
 *    `reactionDelay` secondes ; entre deux rafraîchissements, l'agent agit sur
 *    sa dernière observation (son âge grandit) ;
 *  - mémoire : une entité non vue garde sa dernière position, avec son âge et une
 *    confiance qui décroît ; au-delà de `memorySeconds` elle est oubliée ;
 *  - appels adressés : via LocalCommunication.hear() (auteur, âge, confiance).
 * Zéro Date.now() / Math.random().
 */
'use strict';

const { observe, normaliserParams } = require('./perception.js');

const DEFAUTS_CONTEXTE = Object.freeze({ reactionDelay: 0.2, memorySeconds: 6 });

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

class AgentContext {
  constructor(agent, params = {}) {
    if (!agent || (agent.team !== 'A' && agent.team !== 'B') || !Number.isInteger(agent.numero)) throw new TypeError('agent invalide');
    this.agent = { team: agent.team, numero: agent.numero };
    this.id = agent.team + agent.numero;
    this.params = Object.assign({}, DEFAUTS_CONTEXTE, normaliserParams(params));
    for (const k of ['reactionDelay', 'memorySeconds']) {
      const v = params[k] === undefined ? this.params[k] : params[k];
      if (!Number.isFinite(v) || v < 0) throw new RangeError('paramètre invalide : ' + k);
      this.params[k] = v;
    }
    this.lastObsT = null;
    this.mem = { ball: null, teammates: {}, opponents: {}, phase: null, possession: null, score: null, ruck: null };
    this.heard = [];
  }

  // Met à jour les croyances à partir de l'état (lecture seule) puis renvoie
  // une photo gelée. `comm` (LocalCommunication) est facultatif.
  update(state, comm) {
    const t = state.tempsMatch;
    const doitObserver = this.lastObsT === null || t - this.lastObsT >= this.params.reactionDelay - 1e-9;
    let obs = null;
    if (doitObserver) {
      // Regard : vers le dernier ballon connu (trace récente), sinon dans l'axe du corps.
      let gaze;
      if (this.mem.ball && t - this.mem.ball.seenAt <= 2) {
        const moiG = [...state.equipeA, ...state.equipeB].find((j) => j.team === this.agent.team && j.numero === this.agent.numero);
        if (moiG) gaze = Math.atan2(this.mem.ball.y - moiG.y, this.mem.ball.x - moiG.x);
      }
      // Un PORTEUR balaie le terrain avant de jouer (têtes levées) : champ de vision complet.
      const porteur = this.mem.ball && this.mem.ball.owner === this.id && t - this.mem.ball.seenAt <= 1;
      const pv = Object.assign({}, this.params, gaze === undefined ? {} : { gaze }, porteur ? { fovDeg: 360 } : {});
      obs = observe(state, this.agent, pv);
      this.lastObsT = t;
      const m = this.mem;
      if (obs.vus.ball) m.ball = Object.assign({}, obs.vus.ball, { seenAt: t });
      // Une entité vue est rafraîchie ; une entité non vue garde sa dernière trace.
      for (const [id, e] of Object.entries(obs.vus.teammates)) m.teammates[id] = Object.assign({}, e, { seenAt: t });
      for (const [id, e] of Object.entries(obs.vus.opponents)) m.opponents[id] = Object.assign({}, e, { seenAt: t });
      if (obs.vus.ruck) m.ruck = Object.assign({}, obs.vus.ruck, { seenAt: t }); else if (obs.phase !== 'RUCK') m.ruck = null;
      m.phase = obs.phase; m.possession = obs.possession; m.score = obs.score ? { A: obs.score.A, B: obs.score.B } : null;
    }
    // Proprioception : on connaît toujours sa propre position exacte.
    const moi = [...state.equipeA, ...state.equipeB].find((j) => j.team === this.agent.team && j.numero === this.agent.numero);
    if (!moi) throw new RangeError('agent introuvable : ' + this.id);
    if (comm) {
      const entendus = comm.hear({ listenerId: this.id, team: this.agent.team, x: moi.x, y: moi.y, time: t,
        available: !(moi.auSol > 0) && !(moi.sinBin > 0) });
      for (const h of entendus) this.heard.push(h);
    }
    const mem = this.params.memorySeconds;
    const vieux = (seenAt) => t - seenAt > mem + 1e-9;
    for (const k of ['teammates', 'opponents']) for (const id of Object.keys(this.mem[k])) if (vieux(this.mem[k][id].seenAt)) delete this.mem[k][id];
    if (this.mem.ball && vieux(this.mem.ball.seenAt)) this.mem.ball = null;
    if (this.mem.ruck && vieux(this.mem.ruck.seenAt)) this.mem.ruck = null;
    this.heard = this.heard.filter((h) => t - h.heardAt <= mem);

    const fiche = (e) => ({ lastSeen: { x: e.x, y: e.y }, age: +(t - e.seenAt).toFixed(3), confidence: +clamp01(1 - (t - e.seenAt) / mem).toFixed(3) });
    const ballon = this.mem.ball
      ? Object.assign(fiche(this.mem.ball), { state: this.mem.ball.state, owner: this.mem.ball.owner })
      : { lastSeen: null, age: null, confidence: 0, state: null, owner: null };
    const mates = {}, adv = {};
    for (const [id, e] of Object.entries(this.mem.teammates)) mates[id] = Object.assign(fiche(e), { numero: e.numero });
    for (const [id, e] of Object.entries(this.mem.opponents)) {
      const b = this.mem.ball;
      const dBalle = b ? Math.hypot(e.x - b.x, e.y - b.y) : 40;
      adv[id] = Object.assign(fiche(e), { numero: e.numero, threat: +clamp01(1 - dBalle / 40).toFixed(3) });
    }
    return deepFreeze({
      t, agent: this.agent, observedAt: this.lastObsT, refreshed: doitObserver,
      self: { x: moi.x, y: moi.y, orientation: moi.orientation || 0, grounded: moi.auSol > 0, available: !(moi.auSol > 0) && !(moi.sinBin > 0),
        sensAttaque: moi.sensAttaque, kickOffside: moi.horsJeuKick > 0 },
      ball: ballon, teammates: mates, opponents: adv,
      ruck: this.mem.ruck ? { ballAvailable: this.mem.ruck.ballAvailable, defendersCommitted: this.mem.ruck.defendersCommitted,
        age: +(t - this.mem.ruck.seenAt).toFixed(3), confidence: +clamp01(1 - (t - this.mem.ruck.seenAt) / mem).toFixed(3) } : null,
      phase: this.mem.phase, possession: this.mem.possession, score: this.mem.score,
      heard: this.heard.map((h) => ({ from: h.from, kind: h.kind, age: +(t - h.heardAt).toFixed(3), confidence: h.confidence, replyTo: h.replyTo })),
      omniscient: !!this.params.omniscient,
    });
  }
}

module.exports = { AgentContext, DEFAUTS_CONTEXTE };
