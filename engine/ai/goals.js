/*
 * Rugby Manager — V4, catalogue des buts INDIVIDUELS et situation locale (RM4-G05).
 *
 * Un but est une CONDITION à atteindre, évaluée à partir des CROYANCES d'un
 * agent (AgentContext), jamais de l'état complet du match. Les numéros de poste
 * ne sont que des PROFILS (poids de préférence), jamais des scripts exclusifs :
 * n'importe quel joueur peut choisir n'importe quel but applicable si les
 * circonstances le justifient. Aucun coordinateur, aucune affectation globale.
 *
 * Les poids et seuils ci-dessous sont des HYPOTHÈSES D'INGÉNIERIE à calibrer
 * (RM4-G28/G36), pas des mesures de rugby réel.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const REGROUPEMENTS = new Set(['RUCK', 'MAUL', 'MELEE']);
const TOLERANCE_LIGNE = 0.3;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Profils : poids [0..1] d'un poste pour chaque famille de buts. Pas un rôle imposé.
const PROFILS_PAR_NUMERO = {
  1: { ruck: 0.9, contest: 0.5, defendTry: 0.5, cover: 0.05, aerial: 0.1, distribute: 0.05, option: 0.1, kick: 0.05, scrum: 1, lineout: 0.6 },
  2: { ruck: 0.9, contest: 0.5, defendTry: 0.5, cover: 0.05, aerial: 0.1, distribute: 0.1, option: 0.15, kick: 0.05, scrum: 1, lineout: 1 },
  3: { ruck: 0.9, contest: 0.5, defendTry: 0.5, cover: 0.05, aerial: 0.1, distribute: 0.05, option: 0.1, kick: 0.05, scrum: 1, lineout: 0.6 },
  4: { ruck: 0.85, contest: 0.6, defendTry: 0.55, cover: 0.05, aerial: 0.15, distribute: 0.05, option: 0.15, kick: 0.05, scrum: 1, lineout: 1 },
  5: { ruck: 0.85, contest: 0.6, defendTry: 0.55, cover: 0.05, aerial: 0.15, distribute: 0.05, option: 0.15, kick: 0.05, scrum: 1, lineout: 1 },
  6: { ruck: 0.85, contest: 0.8, defendTry: 0.6, cover: 0.1, aerial: 0.2, distribute: 0.05, option: 0.25, kick: 0.05, scrum: 1, lineout: 0.9 },
  7: { ruck: 0.8, contest: 1.0, defendTry: 0.6, cover: 0.1, aerial: 0.2, distribute: 0.05, option: 0.25, kick: 0.05, scrum: 1, lineout: 0.9 },
  8: { ruck: 0.85, contest: 0.8, defendTry: 0.6, cover: 0.1, aerial: 0.2, distribute: 0.2, option: 0.3, kick: 0.1, scrum: 1, lineout: 0.9 },
  9: { ruck: 0.2, contest: 0.2, defendTry: 0.7, cover: 0.35, aerial: 0.5, distribute: 1.0, option: 0.4, kick: 0.5, scrum: 1, lineout: 0.4 },
  10: { ruck: 0.1, contest: 0.1, defendTry: 0.75, cover: 0.4, aerial: 0.6, distribute: 0.5, option: 1.0, kick: 0.8, scrum: 0.5, lineout: 0.3 },
  11: { ruck: 0.05, contest: 0.05, defendTry: 0.85, cover: 0.8, aerial: 0.9, distribute: 0.1, option: 0.9, kick: 0.3, scrum: 0.2, lineout: 0.2 },
  12: { ruck: 0.1, contest: 0.1, defendTry: 0.8, cover: 0.3, aerial: 0.5, distribute: 0.3, option: 0.9, kick: 0.3, scrum: 0.3, lineout: 0.2 },
  13: { ruck: 0.1, contest: 0.1, defendTry: 0.85, cover: 0.3, aerial: 0.5, distribute: 0.2, option: 0.9, kick: 0.3, scrum: 0.3, lineout: 0.2 },
  14: { ruck: 0.05, contest: 0.05, defendTry: 0.85, cover: 0.8, aerial: 0.9, distribute: 0.1, option: 0.9, kick: 0.3, scrum: 0.2, lineout: 0.2 },
  15: { ruck: 0.05, contest: 0.05, defendTry: 1.0, cover: 1.0, aerial: 1.0, distribute: 0.1, option: 0.7, kick: 0.6, scrum: 0.1, lineout: 0.1 },
};
function profilePour(numero, extra) {
  const base = PROFILS_PAR_NUMERO[numero];
  if (!base) throw new RangeError('numéro de poste invalide : ' + numero);
  return Object.assign({ numero, fatigue: 0 }, base, extra || {});
}

// --- Situation locale, dérivée UNIQUEMENT des croyances ----------------------
function deriveSituation(b) {
  const self = b.self;
  const team = b.agent.team;
  const sens = self.sensAttaque || (team === 'A' ? 1 : -1);
  const phase = b.phase;
  const ball = b.ball && b.ball.lastSeen ? b.ball : null;
  const adv = team === 'A' ? 'B' : 'A';
  const maPoss = b.possession === team;
  const advPoss = b.possession === adv;
  const pt = ball && REGROUPEMENTS.has(phase) ? ball.lastSeen : null;
  const onside = self.kickOffside ? false : (pt ? (self.x - pt.x) * sens <= TOLERANCE_LIGNE : true);
  const distBalle = ball ? dist(self, ball.lastSeen) : Infinity;
  const moiId = team + b.agent.numero;
  const aLeBallon = !!(ball && ball.owner === moiId);
  const ligneDeFondX = team === 'A' ? 0 : 100; // la ligne que JE défends
  // Danger d'essai : porteur adverse proche de MA ligne, peu de défenseurs entre lui et elle.
  let danger = 0;
  const porteurAdv = ball && ball.owner && ball.owner[0] === adv
    ? (b.opponents[ball.owner] ? b.opponents[ball.owner].lastSeen : ball.lastSeen) : null;
  if (porteurAdv) {
    const d = Math.abs(porteurAdv.x - ligneDeFondX);
    const entre = (p) => (p.x - ligneDeFondX) * sens >= 0 && (porteurAdv.x - p.x) * sens >= -0.5 // entre la ligne et le porteur
      && Math.abs(p.y - porteurAdv.y) <= 14;
    // Je ne compte pas dans les défenseurs qui me rassurent : c'est à moi d'agir.
    let defenseurs = 0;
    for (const m of Object.values(b.teammates)) if (entre(m.lastSeen)) defenseurs++;
    danger = clamp01(1 - d / 40) * (defenseurs >= 2 ? 0.3 : defenseurs === 1 ? 0.65 : 1);
  }
  const partenairesPlusPres = Object.values(b.teammates).filter((m) => ball && dist(m.lastSeen, ball.lastSeen) < distBalle - 0.5).length;
  const neuf = Object.entries(b.teammates).find(([, m]) => m.numero === 9);
  const neufAuBallon = !!(neuf && ball && dist(neuf[1].lastSeen, ball.lastSeen) <= 4);
  const pression = Object.values(b.opponents).filter((o) => o.age <= 1 && dist(o.lastSeen, self) <= 5).length;
  const score = b.score ? (team === 'A' ? b.score.A - b.score.B : b.score.B - b.score.A) : 0;
  const finDeMatch = b.t > 4800 * 0.8;
  return { team, sens, phase, ball, maPoss, advPoss, pt, onside, distBalle, aLeBallon, danger,
    partenairesPlusPres, neufAuBallon, pression, score, finDeMatch, grounded: self.grounded, available: self.available,
    enVol: !!(ball && ball.state === 'AIR') || phase === 'COUP_DE_PIED_JEU' };
}

// --- Catalogue ---------------------------------------------------------------
// interrupt : 'SAFETY' (préempte un engagement), 'OPPORTUNITY', 'COMMIT'.
const G = (id, interrupt, applicable, priority, satisfied) => Object.freeze({ id, scope: 'PLAYER', interrupt, applicable, priority, satisfied: satisfied || (() => false) });

const GOALS = Object.freeze([
  G('RECOVER_AND_REJOIN', 'SAFETY', (s) => s.grounded, () => 95, (s) => !s.grounded),
  G('BECOME_ONSIDE', 'SAFETY', (s) => !s.grounded && !s.onside && (REGROUPEMENTS.has(s.phase) || s.phase === 'COUP_DE_PIED_JEU'), () => 90, (s) => s.onside),
  G('PREVENT_TRY', 'SAFETY', (s, p) => s.available && s.onside && s.danger >= 0.35, (s, p) => 55 + 45 * s.danger * p.defendTry, (s) => s.danger < 0.2),
  G('CONTEST_AERIAL_BALL', 'OPPORTUNITY', (s) => s.enVol && s.available && s.onside, (s, p) => 70 * p.aerial * clamp01(1.2 - s.distBalle / 35)),
  // L'arrière (profil cover >= 0,9) garde sa profondeur même quand son équipe attaque (menace de pied).
  G('COVER_BACKFIELD', 'COMMIT', (s, p) => s.available && s.onside && s.danger < 0.35 && (s.advPoss || s.enVol || (s.maPoss && p.cover >= 0.9)),
    (s, p) => (s.advPoss || s.enVol ? 60 : 38) * p.cover),
  G('DEFEND', 'COMMIT', (s) => s.available && s.onside && s.advPoss && !REGROUPEMENTS.has(s.phase), (s, p) => 50 + 10 * clamp01(1 - s.distBalle / 40) - 25 * p.fatigue),
  G('CONTEST_BREAKDOWN', 'OPPORTUNITY', (s) => s.phase === 'RUCK' && s.advPoss && s.available && s.onside, (s, p) => 62 * p.contest - 18 * Math.min(2, s.partenairesPlusPres) - 20 * p.fatigue),
  G('SECURE_RUCK', 'COMMIT', (s) => s.phase === 'RUCK' && s.maPoss && s.available && s.onside, (s, p) => 66 * p.ruck - 18 * Math.min(2, s.partenairesPlusPres) - 20 * p.fatigue),
  G('DISTRIBUTE_BALL', 'COMMIT', (s) => (s.phase === 'RUCK' && s.maPoss && s.available && s.onside && s.distBalle <= 6 && !s.neufAuBallon) || (s.aLeBallon && s.phase === 'PORTE' && s.pression > 0),
    // Personne n'est à la base du ruck : le plus proche prend la distribution (même un 10 ou un 8).
    (s, p) => 78 * p.distribute + (s.distBalle <= 3 && !s.neufAuBallon ? (p.distribute >= 0.3 ? 20 : 10) : 0)),
  G('RETAIN_POSSESSION', 'COMMIT', (s) => s.aLeBallon && s.phase === 'PORTE', (s) => 62 + 8 * Math.min(3, s.pression) + (s.finDeMatch && s.score > 0 ? 12 : 0)),
  G('GAIN_TERRITORY', 'OPPORTUNITY', (s) => s.aLeBallon && s.phase === 'PORTE', (s, p) => 50 + 25 * p.kick + (s.finDeMatch && s.score < 0 ? 12 : 0) - 8 * Math.min(3, s.pression)),
  G('SUPPORT_CARRIER', 'COMMIT', (s) => s.maPoss && s.phase === 'PORTE' && !s.aLeBallon && s.available && s.distBalle <= 30, (s, p) => 44 * (0.4 + 0.6 * p.ruck) * clamp01(1.1 - s.distBalle / 30)),
  G('BE_PASS_OPTION', 'COMMIT', (s) => s.maPoss && s.available && s.onside && (s.phase === 'PORTE' || s.phase === 'RUCK') && !s.aLeBallon, (s, p) => 46 * p.option),
  G('FORM_SCRUM_LEGALLY', 'COMMIT', (s) => s.phase === 'MELEE' && s.available, (s, p) => 80 * p.scrum),
  G('FORM_LINEOUT_LEGALLY', 'COMMIT', (s) => s.phase === 'TOUCHE' && s.available, (s, p) => 78 * p.lineout),
  // Toujours applicable : filet de sécurité (joueur en récupération, exclu temporaire...) — jamais « aucun but ».
  G('RETURN_TO_PLAYBOOK', 'COMMIT', () => true, () => 5),
]);
const GOAL_IDS = Object.freeze(GOALS.map((g) => g.id));

module.exports = { GOALS, GOAL_IDS, PROFILS_PAR_NUMERO, profilePour, deriveSituation, REGROUPEMENTS };
