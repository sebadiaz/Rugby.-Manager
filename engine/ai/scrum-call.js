/*
 * Rugby Manager — V4, dialogue de MÊLÉE individuel (RM4-G19 / G37, première tranche).
 *
 * Le n°9 de l'équipe qui a (ou va avoir) le ballon interroge le 10 sur ce qu'il voit de la défense
 * (SCRUM_OPTIONS_ASK), demande au 8 s'il peut partir (SCRUM_8_ASK), puis TRANCHE LUI-MÊME
 * (SCRUM_8_BREAK ou SCRUM_NEAR / WIDE / ADVANCE). Le 8 qui entend « Départ du huit ! » relit sa situation
 * quand le ballon est à ses pieds : s'il part, il l'ANNONCE au 9 (SCRUM_8_GOING, « Neuf, j'y vais ! »)
 * AVANT de ramasser ; sinon il prévient qu'il laisse (SCRUM_8_ABORT). Le 9 qui entend le départ accuse
 * réception (SCRUM_9_ACK) et se retire : un seul porteur. Le moteur reste seul juge : il n'exécute le
 * départ du 8 que si le 8 l'a demandé après l'avoir annoncé, et seulement quand le ballon est contrôlé à sa
 * base. Aucun message ne déplace un joueur ni ne crée un ballon. Fonctions et classe sans aucun hasard.
 * Les seuils sont des hypothèses d'ingénierie à calibrer (G36/G41).
 */
'use strict';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Ce que le 10 voit de la défense autour de la mêlée : avis NEAR / WIDE / ADVANCE.
function avisDuDix(b, melee) {
  const adv = Object.values(b.opponents).filter((o) => o.age <= 2);
  const mates = Object.values(b.teammates).filter((m) => m.age <= 2);
  const proche = adv.filter((o) => dist(o.lastSeen, melee) <= 8).length;
  const large = (p) => Math.abs(p.y - melee.y) >= 12 && Math.abs(p.y - melee.y) <= 32 && Math.abs(p.x - melee.x) <= 14;
  const defLarge = adv.filter((o) => large(o.lastSeen)).length;
  const attLarge = mates.filter((m) => m.numero >= 10 && large(m.lastSeen)).length + 1; // lui compris
  if (attLarge > defLarge) return 'SCRUM_WIDE';
  return proche <= 2 ? 'SCRUM_NEAR' : 'SCRUM_ADVANCE';
}

// Le 8 peut-il partir ? Sa lecture : qualité du ballon gagné (dominant, propre, sous pression), sa propre
// puissance, les adversaires détachés qu'il voit près de la base (flankers et demi), et une fluctuation
// individuelle déterministe (±12 : deux 8 ne lisent pas pareil, un même 8 pas toujours pareil).
function huitPeutPartir(b, melee, me) {
  if (!me || me.auSol > 0) return { ok: false, raison: 'AU_SOL' };
  if (melee.qualite === 'VOLE') return { ok: false, raison: 'BALLON_PERDU' };
  if (melee.qualite === 'PRESSION') return { ok: false, raison: 'SOUS_PRESSION' };
  const base = { x: melee.x, y: melee.y };
  const colles = Object.values(b.opponents).filter((o) => o.age <= 1.5 && [6, 7, 8, 9].includes(o.numero) && dist(o.lastSeen, base) <= 4.5).length;
  const bruit = (((me.numero * 37 + (melee.id || 0) * 101) % 25) - 12);
  const score = (melee.qualite === 'DOMINANT' ? 25 : 0) + 0.4 * ((me.puissance ?? 60) - 60) - 3 * colles + bruit;
  return score >= 0 ? { ok: true, colles, score: +score.toFixed(1) } : { ok: false, raison: 'PEU_SUR:' + colles, score: +score.toFixed(1) };
}

// Pick-and-go ou pick-and-pass. Près de la ligne adverse (≤ 15 m) on PORTE ; ailleurs il passe s'il voit le 10
// démarqué et s'il passe assez bien (sa qualité de passe après contact) ; un 8 qui passe mal porte.
function huitChoix(b, melee, me) {
  const sens = me.sensAttaque || 1;
  const versLigne = sens > 0 ? 100 - me.x : me.x;
  if (versLigne <= 15) return 'GO';
  const dix = Object.values(b.teammates).find((m) => m.numero === 10 && m.age <= 1.5);
  if (!dix || (me.x - dix.lastSeen.x) * sens < 0 || dist(me, dix.lastSeen) > 16) return 'GO';
  const surDix = Object.values(b.opponents).filter((o) => o.age <= 1.5 && dist(o.lastSeen, dix.lastSeen) <= 3).length;
  if (surDix > 0) return 'GO';
  const qualitePasse = me.car && typeof me.car.passeApresContact === 'number' ? me.car.passeApresContact : (me.passe ?? 50);
  const bruit = (((me.numero * 53 + (melee.id || 0) * 97) % 11) - 5);
  return (qualitePasse - 50) * 0.3 + bruit >= 0 ? 'PASSE' : 'GO';
}

class ScrumMind {
  constructor(agent) {
    this.agent = agent;
    this.id = agent.team + agent.numero;
    this.reset(null);
  }

  reset(phaseId) {
    this.phaseId = phaseId;
    this.vus = new Set();
    this.askDix = null; this.askHuit = null; this.dernierEmis = -Infinity;
    this.avis = null; this.reponseHuit = null;
    this.decision = null;       // 9 : décision finale annoncée
    this.demandeDuNeuf = false; // 8 : le 9 a demandé le départ
    this.annonce = null;        // 8 : 'GO' | 'PASSE' (annoncé), 'ABORT'
    this.cede = false;          // 9 : le 8 part, je me retire
  }

  // Intention transmise au moteur : seul le 8 qui a ANNONCÉ son départ peut le demander.
  demandeMoteur() { return this.agent.numero === 8 && (this.annonce === 'GO' || this.annonce === 'PASSE') ? this.annonce : null; }

  _emet(comm, me, t, kind, extra) {
    const msg = Object.assign({ speakerId: this.id, team: this.agent.team, kind, x: me.x, y: me.y, time: t, phaseId: this.phaseId }, extra);
    const r = extra && extra.replyTo ? comm.emitReponse(msg) : comm.emit(msg);
    if (r.accepted) this.dernierEmis = t;
    return r;
  }

  etape(b, state, comm, me, playbook) {
    const out = [];
    const t = state.tempsMatch;
    const m = state.melee;
    if (b.phase !== 'MELEE' || !m || m.simulee || m.id == null) { if (this.phaseId !== null) this.reset(null); return out; }
    const phaseId = 'M' + m.id;
    if (this.phaseId !== phaseId) this.reset(phaseId);
    const equipe = this.agent.team;
    // Mon équipe a le ballon : elle l'introduit (et le gagne en général) ou l'a effectivement gagné.
    const monBallon = m.vainqueur ? m.vainqueur === equipe
      : (m.equipeIntroduction === equipe && (m.etat === 'MELEE_INTRODUCTION' || m.etat === 'MELEE_CONTESTATION'));
    if (!monBallon || !comm || !me || me.auSol > 0) return out;
    const sortie = m.etat === 'MELEE_SORTIE';
    const num = this.agent.numero;

    for (const h of b.heard) {
      const cle = h.id || (h.from + ':' + h.kind + ':' + h.age);
      if (this.vus.has(cle)) continue;
      if (h.phaseId && h.phaseId !== this.phaseId) continue;
      this.vus.add(cle);
      const du = (n) => h.from === equipe + n;
      if (num === 10 && h.kind === 'SCRUM_OPTIONS_ASK' && du(9) && h.toId === this.id) {
        const avis = avisDuDix(b, m);
        const r = this._emet(comm, me, t, avis, { toId: h.from, replyTo: h.id });
        if (r.accepted) out.push({ type: 'SCRUM_ADVICE', avis, to: h.from });
      } else if (num === 8 && h.kind === 'SCRUM_8_ASK' && du(9) && h.toId === this.id) {
        const v = huitPeutPartir(b, m, me);
        const r = this._emet(comm, me, t, v.ok ? 'SCRUM_8_READY' : 'SCRUM_8_BLOCKED', { toId: h.from, replyTo: h.id });
        if (r.accepted) out.push({ type: v.ok ? 'SCRUM_8_READY_SAID' : 'SCRUM_8_BLOCKED_SAID', raison: v.raison || null, to: h.from });
      } else if (num === 9 && du(10) && h.replyTo && h.replyTo === this.askDix) {
        this.avis = h.kind; out.push({ type: 'SCRUM_ADVICE_HEARD', avis: h.kind });
      } else if (num === 9 && du(8) && h.replyTo && h.replyTo === this.askHuit) {
        this.reponseHuit = h.kind; out.push({ type: 'SCRUM_8_ANSWER_HEARD', reponse: h.kind });
      } else if (num === 8 && h.kind === 'SCRUM_8_BREAK' && du(9)) {
        this.demandeDuNeuf = true; out.push({ type: 'SCRUM_BREAK_HEARD' });
      } else if (num === 9 && h.kind === 'SCRUM_8_GOING' && du(8)) {
        this.cede = true;
        const r = this._emet(comm, me, t, 'SCRUM_9_ACK', { toId: h.from });
        out.push({ type: 'SCRUM_9_REPLANS', accuse: r.accepted, vers: 'SOUTIEN' });
      }
    }

    if (num === 9) {
      const pasPlus = t - this.dernierEmis >= 0.75;
      if (this.askDix === null && pasPlus) {
        const r = this._emet(comm, me, t, 'SCRUM_OPTIONS_ASK', { toId: equipe + '10' });
        if (r.accepted) { this.askDix = r.id; this.tAsk = t; out.push({ type: 'SCRUM_ASKED', to: equipe + '10' }); }
      } else if (this.askHuit === null && this.askDix !== null && pasPlus) {
        const r = this._emet(comm, me, t, 'SCRUM_8_ASK', { toId: equipe + '8' });
        if (r.accepted) { this.askHuit = r.id; out.push({ type: 'SCRUM_ASKED', to: equipe + '8' }); }
      } else if (this.decision === null && this.askHuit !== null && pasPlus && (this.reponseHuit || t - this.tAsk >= 2.4)) {
        // Le 9 tranche : départ du 8 s'il peut, que le 10 ne voit pas un large ouvert ; sinon il joue lui-même.
        const huitPret = this.reponseHuit === 'SCRUM_8_READY';
        const kind = huitPret && this.avis !== 'SCRUM_WIDE' ? 'SCRUM_8_BREAK' : (this.avis || 'SCRUM_NEAR');
        const r = this._emet(comm, me, t, kind, {});
        if (r.accepted) { this.decision = kind; out.push({ type: 'SCRUM_CALLED', appel: kind, avis: this.avis, huit: this.reponseHuit }); }
      }
    }

    if (num === 8 && this.demandeDuNeuf && this.annonce === null && sortie) {
      // Le ballon est à mes pieds : je relis ma situation, puis je l'annonce AVANT de le ramasser.
      const v = huitPeutPartir(b, m, me);
      if (v.ok) {
        const choix = huitChoix(b, m, me);
        const r = this._emet(comm, me, t, 'SCRUM_8_GOING', { toId: equipe + '9' });
        if (r.accepted) { this.annonce = choix; out.push({ type: 'SCRUM_8_GOING_SAID', choix }); }
      } else {
        const r = this._emet(comm, me, t, 'SCRUM_8_ABORT', { toId: equipe + '9' });
        this.annonce = 'ABORT';
        out.push({ type: 'SCRUM_8_ABORT_SAID', raison: v.raison, accuse: r.accepted });
      }
    }
    return out;
  }
}

module.exports = { ScrumMind, avisDuDix, huitPeutPartir, huitChoix };
