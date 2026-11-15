/*
 * Rugby Manager — V4, appel de touche INDIVIDUEL (RM4-G20 / G32, première tranche).
 *
 * Le n°9 de l'équipe qui lance prend l'initiative : il demande l'avis du 10
 * (LINEOUT_ASK), le 10 répond selon ce QU'IL voit (LINEOUT_WIDE / MIDDLE /
 * FRONT), puis le 9 tranche lui-même et annonce son option (LINEOUT_MAUL ou
 * ballon sorti). Les avants qui ENTENDENT l'appel décident chacun de le suivre :
 * s'ils captent le lancer, ils demandent le maul au moteur. Le moteur reste seul
 * juge : le maul n'existe que si le sauteur capte réellement et que des soutiens
 * sont réellement liés autour de lui (loi 16). Aucun message ne déplace un
 * joueur ni ne crée un ballon ; un avant hors de portée de voix n'apprend rien.
 *
 * Fonctions pures (aucun état partagé, aucun Date.now()/Math.random()).
 * Les poids sont des hypothèses d'ingénierie, à calibrer (G36/G41).
 */
'use strict';

const LARGEUR = 70;
const OPTIONS_SORTIE = Object.freeze(['LINEOUT_FRONT', 'LINEOUT_MIDDLE', 'LINEOUT_BACK', 'LINEOUT_WIDE']);
const APPELS_DU_NEUF = Object.freeze(['LINEOUT_MAUL', ...OPTIONS_SORTIE]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Distance (m) du ballon perçu à la ligne d'essai adverse, du point de vue de l'équipe `team`.
function distanceEssai(b) {
  const p = b.ball && b.ball.lastSeen;
  if (!p) return null;
  const sens = b.self.sensAttaque || (b.agent.team === 'A' ? 1 : -1);
  return sens > 0 ? 100 - p.x : p.x;
}

// Avis du 10 : il compte les joueurs QU'IL voit au large (plus de 16 m de la
// touche du lancer, à moins de 25 m de la marque en longueur). Surnombre perçu
// -> au large ; près de sa propre ligne -> devant (lancer le plus sûr) ; sinon milieu.
function avisDuDix(b) {
  const p = b.ball && b.ball.lastSeen;
  if (!p) return 'LINEOUT_MIDDLE';
  const versCentre = p.y <= LARGEUR / 2 ? 1 : -1;
  const auLarge = (q) => (q.y - p.y) * versCentre > 16 && Math.abs(q.x - p.x) <= 25;
  let att = 1; // lui-même
  for (const m of Object.values(b.teammates)) if (m.age <= 2 && auLarge(m.lastSeen)) att++;
  let def = 0;
  for (const o of Object.values(b.opponents)) if (o.age <= 2 && auLarge(o.lastSeen)) def++;
  const de = distanceEssai(b);
  if (de != null && de >= 78) return 'LINEOUT_FRONT';
  return att - def >= 1 ? 'LINEOUT_WIDE' : 'LINEOUT_MIDDLE';
}

// Décision du 9 après avoir (ou non) reçu l'avis du 10. Renvoie l'appel et les
// utilités comparées (pour l'explicabilité). `t` sert à une fluctuation
// individuelle déterministe : un même 9 ne joue pas toujours la même touche.
function choixDuNeuf(b, avis, playbook, t) {
  const de = distanceEssai(b);
  const d = de == null ? 50 : de;
  // Attrait du maul selon la distance à l'en-but adverse (près de la ligne, le
  // maul porté est l'arme principale ; loin, il sert surtout à fixer).
  const zone = d <= 10 ? 1 : d <= 22 ? 0.78 : d <= 50 ? 0.4 : d <= 65 ? 0.15 : 0;
  // Consigne de club « maul en touche » (lecture seule) : 0,45 = référence.
  const pref = clamp((playbook && playbook.maulTouche != null ? playbook.maulTouche : 0.45) / 0.45, 0.2, 2);
  const score = b.score ? (b.agent.team === 'A' ? b.score.A - b.score.B : b.score.B - b.score.A) : 0;
  const finDeMatch = b.t > 4800 * 0.8;
  const maul = 10 * zone * pref + (finDeMatch && score < 0 && d <= 22 ? 2 : 0);
  const bruit = (((b.agent.numero * 37 + Math.floor(t * 2) * 101) % 17) - 8) * 0.25; // ±2
  const sortie = 5 + bruit + (avis === 'LINEOUT_WIDE' ? 2.5 : 0);
  if (maul > sortie) return { appel: 'LINEOUT_MAUL', maul, sortie };
  return { appel: avis && OPTIONS_SORTIE.includes(avis) ? avis : 'LINEOUT_MIDDLE', maul, sortie };
}

/*
 * Mémoire de touche d'UN agent. `etape(b, state, comm, me)` est appelée à chaque
 * tick de parole ; elle renvoie la liste des événements de l'agent (explicabilité).
 * `demandeMaul()` dit si CET agent, ayant entendu l'appel, demandera le maul s'il capte.
 */
class LineoutMind {
  constructor(agent) {
    this.agent = agent; // { team, numero }
    this.id = agent.team + agent.numero;
    this.reset(null);
  }

  reset(debut) {
    this.debut = debut;          // t d'entrée en phase TOUCHE (null hors touche)
    this.question = null;        // id de LINEOUT_ASK émis (9)
    this.questionT = null;
    this.avis = null;            // avis du 10 entendu par le 9
    this.appel = null;           // option annoncée par le 9 (9) ou entendue (autres)
    this.repondu = new Set();    // questions auxquelles ce 10 a répondu
    this.vus = new Set();        // appels déjà traités
  }

  demandeMaul() { return this.debut !== null && this.agent.numero <= 8 && this.appel === 'LINEOUT_MAUL'; }

  etape(b, state, comm, me, playbook) {
    const out = [];
    const t = state.tempsMatch;
    if (b.phase !== 'TOUCHE') { if (this.debut !== null) this.reset(null); return out; }
    if (this.debut === null) this.reset(t);
    const lance = b.possession === this.agent.team;
    if (!lance) return out; // la défense de touche n'a pas encore de dialogue (G20 suite)

    // Ce que j'entends des partenaires (traité une seule fois).
    for (const h of b.heard) {
      const cle = h.id || (h.from + ':' + h.kind + ':' + h.age);
      if (this.vus.has(cle)) continue;
      this.vus.add(cle);
      const du9 = h.from === this.agent.team + '9';
      if (this.agent.numero === 10 && h.kind === 'LINEOUT_ASK' && du9 && h.toId === this.id && !this.repondu.has(h.id) && comm && me) {
        const avis = avisDuDix(b);
        const r = comm.emit({ speakerId: this.id, team: this.agent.team, kind: avis, x: me.x, y: me.y, time: t, toId: h.from, replyTo: h.id });
        if (r.accepted) { this.repondu.add(h.id); out.push({ type: 'LINEOUT_ADVICE', avis, to: h.from }); }
      } else if (this.agent.numero === 9 && h.from === this.agent.team + '10' && h.replyTo && h.replyTo === this.question) {
        this.avis = h.kind;
        out.push({ type: 'LINEOUT_ADVICE_HEARD', avis: h.kind });
      } else if (du9 && APPELS_DU_NEUF.includes(h.kind) && this.agent.numero !== 9 && h.confidence >= 0.25) {
        this.appel = h.kind;
        out.push({ type: 'LINEOUT_CALL_HEARD', appel: h.kind, confidence: h.confidence });
      }
    }

    // Initiative du 9 : question au 10 dès qu'il est près de l'alignement, puis décision.
    if (this.agent.numero === 9 && comm && me && !this.appel) {
      const p = b.ball && b.ball.lastSeen;
      const pret = p && b.ball.state !== 'AIR' && Math.hypot(me.x - p.x, me.y - p.y) <= 18;
      if (pret && this.question === null) {
        const r = comm.emit({ speakerId: this.id, team: this.agent.team, kind: 'LINEOUT_ASK', x: me.x, y: me.y, time: t, toId: this.agent.team + '10' });
        if (r.accepted) { this.question = r.id; this.questionT = t; out.push({ type: 'LINEOUT_ASKED', to: this.agent.team + '10' }); }
      } else if (this.question !== null && (this.avis || t - this.questionT >= 3)) {
        // Le 9 tranche, avec ou sans avis (un 10 trop loin ne répond pas).
        const c = choixDuNeuf(b, this.avis, playbook, t);
        const r = comm.emit({ speakerId: this.id, team: this.agent.team, kind: c.appel, x: me.x, y: me.y, time: t });
        if (r.accepted) {
          this.appel = c.appel;
          out.push({ type: 'LINEOUT_CALLED', appel: c.appel, avis: this.avis, maul: +c.maul.toFixed(2), sortie: +c.sortie.toFixed(2) });
        }
      }
    }
    return out;
  }
}

module.exports = { LineoutMind, avisDuDix, choixDuNeuf, distanceEssai, APPELS_DU_NEUF };
