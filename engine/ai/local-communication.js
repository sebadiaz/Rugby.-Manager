/*
 * Rugby Manager V4 — communication vocale locale (prototype autonome).
 *
 * TRANSPORT DE SIGNAUX SEULEMENT : aucune selection de but, aucun ordre de
 * placement, aucune connaissance globale ni mutation du moteur physique.
 * Chaque joueur decide lui-meme s'il parle puis interprete ce qu'il entend.
 * Le moteur pourra raccorder ce transport lors de RM4-G04/G08.
 *
 * Toutes les durees sont exprimees en secondes de TEMPS SIMULE.
 * Determinisme strict : pas de Math.random(), de timer ni de Date.now().
 */
'use strict';

const CALLS = Object.freeze({
  MINE: Object.freeze({ label: "J'ai !", radiusM: 14, ttlSeconds: 1.2 }),
  BALL: Object.freeze({ label: 'Ballon !', radiusM: 17, ttlSeconds: 1.4 }),
  INSIDE: Object.freeze({ label: 'Intérieur !', radiusM: 18, ttlSeconds: 1.5 }),
  OUTSIDE: Object.freeze({ label: 'Extérieur !', radiusM: 18, ttlSeconds: 1.5 }),
  SUPPORT: Object.freeze({ label: 'Soutien !', radiusM: 16, ttlSeconds: 1.4 }),
  HOLD: Object.freeze({ label: 'Tiens !', radiusM: 16, ttlSeconds: 1.2 }),
  UP: Object.freeze({ label: 'Monte !', radiusM: 19, ttlSeconds: 1.3 }),
  SLIDE: Object.freeze({ label: 'Glisse !', radiusM: 19, ttlSeconds: 1.3 }),
  COVER: Object.freeze({ label: 'Je couvre !', radiusM: 18, ttlSeconds: 1.5 }),
  KICK: Object.freeze({ label: 'Pied !', radiusM: 22, ttlSeconds: 1.5 }),
  LEAVE: Object.freeze({ label: 'Laisse !', radiusM: 15, ttlSeconds: 1.0 }),
  // Dialogues courts 9 ↔ 10 puis demandes du 9 aux partenaires.
  LINEOUT_ASK: Object.freeze({ label: 'Touche, on joue quoi ?', radiusM: 24, ttlSeconds: 2.5 }),
  LINEOUT_FRONT: Object.freeze({ label: 'Touche devant !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_MIDDLE: Object.freeze({ label: 'Touche milieu !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_BACK: Object.freeze({ label: 'Touche fond !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_MAUL: Object.freeze({ label: 'Touche, maul !', radiusM: 22, ttlSeconds: 2.2 }),
  LINEOUT_WIDE: Object.freeze({ label: 'Touche au large !', radiusM: 22, ttlSeconds: 2.2 }),
  SCRUM_8_ASK: Object.freeze({ label: 'Huit, tu peux partir ?', radiusM: 18, ttlSeconds: 2.4 }),
  SCRUM_8_READY: Object.freeze({ label: 'Je peux partir !', radiusM: 18, ttlSeconds: 2.1 }),
  SCRUM_8_BLOCKED: Object.freeze({ label: 'Non, je garde !', radiusM: 18, ttlSeconds: 2.1 }),
  SCRUM_8_BREAK: Object.freeze({ label: 'Départ du huit !', radiusM: 19, ttlSeconds: 2.2 }),
  // "Prêt" = possibilité. "J'y vais" = prise imminente : le 9 peut réagir.
  SCRUM_8_GOING: Object.freeze({ label: "Neuf, j'y vais !", radiusM: 12, ttlSeconds: 0.9 }),
  SCRUM_8_ABORT: Object.freeze({ label: 'Neuf, je laisse !', radiusM: 12, ttlSeconds: 0.9 }),
  SCRUM_9_ACK: Object.freeze({ label: "Reçu, j'te suis !", radiusM: 12, ttlSeconds: 0.9 }),
  SCRUM_OPTIONS_ASK: Object.freeze({ label: 'On joue au près, au large ou on avance ?', radiusM: 25, ttlSeconds: 2.5 }),
  SCRUM_NEAR: Object.freeze({ label: 'Au près !', radiusM: 24, ttlSeconds: 2.2 }),
  SCRUM_WIDE: Object.freeze({ label: 'Au large !', radiusM: 25, ttlSeconds: 2.2 }),
  SCRUM_ADVANCE: Object.freeze({ label: 'On avance !', radiusM: 22, ttlSeconds: 2.2 }),
  SCRUM_ASK: Object.freeze({ label: 'Mêlée, comment ça tient ?', radiusM: 20, ttlSeconds: 2.5 }),
  SCRUM_STEADY: Object.freeze({ label: 'Stables !', radiusM: 19, ttlSeconds: 1.8 }),
  SCRUM_DRIVE: Object.freeze({ label: 'Poussée forte !', radiusM: 19, ttlSeconds: 1.8 }),
  SCRUM_PRESSURE: Object.freeze({ label: 'Ça tourne !', radiusM: 19, ttlSeconds: 1.7 }),
  SCRUM_UNSTABLE: Object.freeze({ label: 'Ça lâche !', radiusM: 19, ttlSeconds: 1.7 }),
  KICK_HIGH: Object.freeze({ label: 'Chandelle !', radiusM: 28, ttlSeconds: 2.3 }),
  KICK_CHASE: Object.freeze({ label: 'Chasse !', radiusM: 28, ttlSeconds: 1.9 }),
});

function validNumber(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new TypeError(name + ' doit être fini');
  }
}
function checkActor(id, team, x, y, time) {
  if (team !== 'A' && team !== 'B') throw new TypeError('équipe invalide');
  if (typeof id !== 'string' || !new RegExp('^' + team + '(?:[1-9]|1[0-5])$').test(id)) {
    throw new TypeError('identifiant joueur invalide');
  }
  validNumber(x, 'x');
  validNumber(y, 'y');
  validNumber(time, 'time');
  if (time < 0) throw new RangeError('temps négatif');
}
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/*
 * Une petite file d'événements acoustiques est nécessaire pour simuler le
 * délai et la portée. Ce n'est PAS une IA d'équipe : elle ne contient aucune
 * attribution, position-cible, goal, plan, ordre de mouvement ou décision.
 */
class LocalCommunication {
  constructor(options = {}) {
    this.baseLatencySeconds = options.baseLatencySeconds ?? 0.12;
    this.soundSpeedMps = options.soundSpeedMps ?? 343;
    this.cooldownSeconds = options.cooldownSeconds ?? 0.7;
    this.maxPending = options.maxPending ?? 256;
    this.enabled = options.enabled !== false;
    for (const k of ['baseLatencySeconds', 'soundSpeedMps', 'cooldownSeconds', 'maxPending']) {
      validNumber(this[k], k);
    }
    if (this.baseLatencySeconds < 0 || this.soundSpeedMps <= 0 ||
        this.cooldownSeconds < 0 || !Number.isInteger(this.maxPending) || this.maxPending < 1) {
      throw new RangeError('paramètres de communication invalides');
    }
    this.messages = [];
    this.lastBySpeaker = new Map();
    this.sequence = 0;
  }

  emit({ speakerId, team, kind, x, y, time, available = true,
         toId = null, replyTo = null, phaseId = null }) {
    checkActor(speakerId, team, x, y, time);
    if (!Object.prototype.hasOwnProperty.call(CALLS, kind)) {
      throw new TypeError('appel inconnu : ' + kind);
    }
    if (toId !== null) {
      if (typeof toId !== 'string' ||
          !new RegExp('^' + team + '(?:[1-9]|1[0-5])' + '$').test(toId) ||
          toId === speakerId) {
        throw new TypeError('destinataire invalide');
      }
    }
    if (replyTo !== null &&
        (typeof replyTo !== 'string' || !/^CALL-[1-9][0-9]*$/.test(replyTo))) {
      throw new TypeError('réponse à un appel invalide');
    }
    if (phaseId !== null && (typeof phaseId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(phaseId))) {
      throw new TypeError('phaseId invalide');
    }
    if ((kind === 'SCRUM_8_GOING' || kind === 'SCRUM_8_ABORT') &&
        speakerId !== team + '8') {
      throw new TypeError('seul le numéro 8 peut annoncer son départ/abandon');
    }
    if (kind === 'SCRUM_9_ACK' && speakerId !== team + '9') {
      throw new TypeError('seul le numéro 9 peut accuser réception');
    }
    if (!this.enabled || !available) return { accepted: false, reason: 'UNAVAILABLE' };
    // Une réponse n'est possible que si le joueur a EFFECTIVEMENT entendu
    // la question et peut encore en discuter ; pas de télépathie.
    if (replyTo !== null) {
      const original = this.messages.find(msg => msg.id === replyTo);
      if (!original || original.team !== team ||
          original.speakerId !== toId ||
          (original.toId !== null && original.toId !== speakerId) ||
          !original.receivedBy.has(speakerId) ||
          time < original.emittedAt || time > original.expiresAt) {
        throw new TypeError('réponse sans demande réellement entendue');
      }
    }
    const previous = this.lastBySpeaker.get(speakerId);
    if (previous != null && time < previous) throw new RangeError('temps non monotone pour ' + speakerId);
    if (previous != null && time - previous < this.cooldownSeconds) {
      return { accepted: false, reason: 'COOLDOWN' };
    }
    this.prune(time);
    if (this.messages.length >= this.maxPending) {
      return { accepted: false, reason: 'QUEUE_FULL' };
    }
    const id = 'CALL-' + (++this.sequence);
    const spec = CALLS[kind];
    this.messages.push({
      id, speakerId, team, kind, x, y, toId, replyTo, phaseId, emittedAt: time,
      expiresAt: time + spec.ttlSeconds, receivedBy: new Set(),
    });
    this.lastBySpeaker.set(speakerId, time);
    return { accepted: true, id };
  }

  hear({ listenerId, team, x, y, time, available = true, hearing = 1,
         phaseId = null }) {
    checkActor(listenerId, team, x, y, time);
    validNumber(hearing, 'hearing');
    if (hearing < 0 || hearing > 1) throw new RangeError('hearing hors [0,1]');
    if (phaseId !== null && (typeof phaseId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(phaseId))) {
      throw new TypeError('phaseId invalide');
    }
    if (!this.enabled || !available || hearing === 0) return [];
    const result = [];
    for (const msg of this.messages) {
      if (msg.team !== team || msg.speakerId === listenerId ||
          (msg.toId !== null && msg.toId !== listenerId) ||
          (phaseId !== null && phaseId !== msg.phaseId) ||
          msg.receivedBy.has(listenerId)) continue;
      const spec = CALLS[msg.kind];
      const meters = distance(x, y, msg.x, msg.y);
      if (meters > spec.radiusM * hearing) continue;
      const arrival = msg.emittedAt + this.baseLatencySeconds +
        meters / this.soundSpeedMps;
      if (time + 1e-9 < arrival || time > msg.expiresAt + 1e-9) continue;
      msg.receivedBy.add(listenerId);
      result.push(Object.freeze({
        id: msg.id, from: msg.speakerId, kind: msg.kind, label: spec.label,
        toId: msg.toId, replyTo: msg.replyTo, phaseId: msg.phaseId,
        spokenAt: msg.emittedAt, heardAt: time,
        // Confiance de compréhension uniquement, ni ordre ni fait certain.
        confidence: Math.max(0.1, Math.min(1, hearing * (1 - 0.55 * meters / spec.radiusM))),
      }));
    }
    return result;
  }

  prune(time) {
    validNumber(time, 'time');
    const before = this.messages.length;
    this.messages = this.messages.filter(m => m.expiresAt + 1e-9 >= time);
    return before - this.messages.length;
  }

  pendingCount() {
    return this.messages.length;
  }
}
module.exports = { CALLS, LocalCommunication };
