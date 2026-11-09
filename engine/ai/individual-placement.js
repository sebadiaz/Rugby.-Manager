/*
 * Rugby Manager — V4, placement INDIVIDUEL (RM4-G10).
 *
 * individualPlacement(beliefs, goalId, playbook, profile) : un joueur compare
 * ses propres candidats de placement à partir de ses croyances et du plan de jeu
 * en lecture seule, puis choisit le meilleur. Rien n'est calculé pour un autre
 * joueur ; la formation qui apparaît est la somme de décisions locales.
 *
 * Buts de placement évalués : HOLD_LINE, CLOSE_GAP, MARK_OPPONENT, PRESS_CARRIER
 * (seulement le défenseur observé le plus proche), COVER_BACKFIELD,
 * SUPPORT_CARRIER, BE_PASS_OPTION, PRESERVE_WIDTH, RETURN_TO_PLAYBOOK.
 * Un joueur hors-jeu n'est JAMAIS orienté vers un plaquage : la cible d'un
 * placement ne dépasse pas la ligne de hors-jeu qu'il connaît.
 * Pure, déterministe. Zéro Date.now() / Math.random().
 */
'use strict';

const P = require('./position-goals.js');
const { deriveSituation } = require('./goals.js');

const GAP_MIN = 11; // m : un intervalle observé plus large est « dangereux »

function voisinsDeLigne(b, ligneX, sens) {
  // Partenaires OBSERVÉS proches de la ligne défensive (±8 m de profondeur), triés par y.
  return Object.entries(b.teammates)
    .filter(([, m]) => m.confidence >= 0.3 && Math.abs(m.lastSeen.x - ligneX) <= 8)
    .map(([id, m]) => ({ id, x: m.lastSeen.x, y: m.lastSeen.y, numero: m.numero }))
    .sort((a, c) => a.y - c.y || a.id.localeCompare(c.id, 'en'));
}

function candidatsDefense(b, s, pb, profile) {
  const me = b.self, bal = s.ball && s.ball.lastSeen;
  const sens = s.sens, num = b.agent.numero;
  const out = [];
  if (!bal) return [{ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: P.referenceDefense(num, sens, { x: me.x, y: me.y }, pb), vmax: 0.8, reason: 'ballon inconnu : retour au poste' }];
  const ligneX = P.ligneDefensive(sens, bal, pb);
  const ref = P.referenceDefense(num, sens, bal, pb);
  // HOLD_LINE : aligné sur les voisins observés, jamais en avance sur eux (on retient sa montée).
  const voisins = voisinsDeLigne(b, ligneX, sens).filter((v) => Math.abs(v.y - ref.y) <= 15);
  const xVoisins = voisins.length ? voisins.map((v) => v.x).sort((a, c) => a - c)[Math.floor(voisins.length / 2)] : ligneX;
  const xTenu = sens > 0 ? Math.min(ligneX, xVoisins + 1) : Math.max(ligneX, xVoisins - 1);
  out.push({ id: 'HOLD_LINE', priority: 60, target: { x: xTenu, y: ref.y }, vmax: 0.85, reason: 'ligne alignée sur ' + voisins.length + ' voisin(s) observé(s)' });
  // CLOSE_GAP : plus grand intervalle observé près de moi, si je suis le mieux placé parmi ceux que je vois.
  const ligne = voisins.concat([{ id: 'moi', x: me.x, y: me.y, numero: num }]).sort((a, c) => a.y - c.y);
  let meilleur = null;
  for (let i = 0; i + 1 < ligne.length; i++) {
    const g = ligne[i + 1].y - ligne[i].y;
    if (g > GAP_MIN) {
      const centre = { x: ligneX, y: (ligne[i].y + ligne[i + 1].y) / 2 };
      const dMoi = P.dist(me, centre);
      const plusProche = Object.values(b.teammates).every((m) => P.dist(m.lastSeen, centre) >= dMoi - 0.01);
      if (plusProche && (!meilleur || g > meilleur.g)) meilleur = { g, centre };
    }
  }
  if (meilleur) out.push({ id: 'CLOSE_GAP', priority: Math.min(85, 62 + (meilleur.g - GAP_MIN) * 3), target: meilleur.centre, vmax: 1, reason: 'intervalle de ' + meilleur.g.toFixed(1) + ' m, je suis le plus proche' });
  // MARK_OPPONENT : adversaire observé menaçant dans mon canal, sans partenaire visiblement plus proche.
  const menaces = Object.entries(b.opponents).filter(([, o]) => o.confidence >= 0.3 && o.threat > 0.15 && Math.abs(o.lastSeen.y - ref.y) <= 10 && P.dist(o.lastSeen, me) <= 14)
    .sort((a, c) => c[1].threat - a[1].threat || a[0].localeCompare(c[0], 'en'));
  for (const [id, o] of menaces) {
    const dMoi = P.dist(o.lastSeen, me);
    if (Object.values(b.teammates).some((m) => P.dist(m.lastSeen, o.lastSeen) < dMoi - 1)) continue;
    out.push({ id: 'MARK_OPPONENT', priority: 58 + 20 * o.threat, target: { x: o.lastSeen.x - sens * 1.5, y: o.lastSeen.y }, vmax: 1, reason: 'marque ' + id });
    break;
  }
  // PRESS_CARRIER : seulement si je suis le défenseur observé le plus proche du porteur, à moins de 7 m.
  const porteur = s.ball.owner && s.ball.owner[0] !== s.team ? (b.opponents[s.ball.owner] ? b.opponents[s.ball.owner].lastSeen : bal) : null;
  if (porteur && s.onside) {
    const dMoi = P.dist(me, porteur);
    const autrePlusProche = Object.values(b.teammates).some((m) => P.dist(m.lastSeen, porteur) < dMoi);
    if (dMoi <= 7 && !autrePlusProche) out.push({ id: 'PRESS_CARRIER', priority: 70, target: { x: porteur.x, y: porteur.y }, vmax: 1, reason: 'plus proche défenseur observé du porteur' });
  }
  out.push({ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: ref, vmax: 0.8, reason: 'poste nominal en défense' });
  return out;
}

function candidatsAttaque(b, s, pb, profile) {
  const me = b.self, bal = s.ball && s.ball.lastSeen, sens = s.sens, num = b.agent.numero;
  if (!bal) return [{ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: { x: me.x, y: me.y }, vmax: 0.6, reason: 'ballon inconnu' }];
  const ref = P.referenceAttaque(num, sens, bal, pb);
  const out = [];
  out.push({ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: ref, vmax: 0.85, reason: 'poste nominal en attaque' });
  // BE_PASS_OPTION : profondeur et angle recevables derrière le porteur.
  out.push({ id: 'BE_PASS_OPTION', priority: 46 * (profile.option ?? 0.5) + 20, target: ref, vmax: 1, reason: 'option de passe à ma profondeur de poste' });
  // PRESERVE_WIDTH : un canal très large reste tenu même si le ballon est loin.
  if (Math.abs(ref.y - P.LARGEUR / 2) >= 22) out.push({ id: 'PRESERVE_WIDTH', priority: 64, target: { x: ref.x, y: ref.y }, vmax: 0.9, reason: 'canal large tenu (' + ref.y.toFixed(0) + ' m)' });
  // SUPPORT_CARRIER : 5 m derrière le ballon, du côté où je vois le moins de partenaires.
  const mates = Object.values(b.teammates).filter((m) => P.dist(m.lastSeen, bal) <= 12);
  const gauche = mates.filter((m) => m.lastSeen.y < bal.y).length, droite = mates.length - gauche;
  const cote = gauche > droite ? 1 : gauche < droite ? -1 : (bal.y < P.LARGEUR / 2 ? 1 : -1);
  const proche = P.dist(me, bal);
  if (proche <= 25) out.push({ id: 'SUPPORT_CARRIER', priority: 44 * (0.4 + 0.6 * (profile.ruck ?? 0.5)) * Math.max(0.1, 1.1 - proche / 25) + 10,
    target: { x: P.clamp(bal.x - sens * 5, 0, 100), y: P.clamp(bal.y + cote * 5, 1, P.LARGEUR - 1) }, vmax: 1, reason: 'soutien côté le moins occupé (' + (cote > 0 ? '+y' : '-y') + ')' });
  return out;
}

// Choisit son placement. `goalId` = but retenu par le sélecteur (il restreint les familles).
function individualPlacement(beliefs, goalId, playbook, profile = {}) {
  const pb = P.lirePlaybook(playbook);
  const s = deriveSituation(beliefs);
  let cands;
  if (goalId === 'COVER_BACKFIELD' || goalId === 'PREVENT_TRY') {
    const bal = s.ball && s.ball.lastSeen;
    cands = [{ id: goalId === 'PREVENT_TRY' ? 'PREVENT_TRY' : 'COVER_BACKFIELD', priority: 60,
      target: bal ? (goalId === 'PREVENT_TRY' ? { x: P.clamp(bal.x - s.sens * 6, 0, 100), y: bal.y } : P.referenceFond(s.sens, bal, pb)) : { x: beliefs.self.x, y: beliefs.self.y },
      vmax: goalId === 'PREVENT_TRY' ? 1 : 0.75, reason: goalId === 'PREVENT_TRY' ? 'intercepte entre le porteur et la ligne' : 'profondeur conservée' }];
  } else if (goalId === 'DEFEND') cands = candidatsDefense(beliefs, s, pb, profile);
  else if (goalId === 'SUPPORT_CARRIER' || goalId === 'BE_PASS_OPTION' || goalId === 'RETURN_TO_PLAYBOOK' || goalId === 'GAIN_TERRITORY' || goalId === 'RETAIN_POSSESSION') {
    cands = s.maPoss || s.aLeBallon ? candidatsAttaque(beliefs, s, pb, profile) : candidatsDefense(beliefs, s, pb, profile);
    if (goalId === 'SUPPORT_CARRIER') cands = cands.filter((c) => c.id === 'SUPPORT_CARRIER' || c.id === 'RETURN_TO_PLAYBOOK');
    if (goalId === 'BE_PASS_OPTION') cands = cands.filter((c) => c.id !== 'SUPPORT_CARRIER');
    if (goalId === 'RETURN_TO_PLAYBOOK') cands = cands.filter((c) => c.id === 'RETURN_TO_PLAYBOOK');
  } else return null; // les autres buts (plan GOAP, mêlée, touche) conduisent le joueur autrement
  // Coût de déplacement : temps estimé + pénalité hors-jeu (un candidat hors-jeu est INVALIDE).
  const sens = s.sens;
  const evalues = cands.map((c) => {
    const d = P.dist(beliefs.self, c.target);
    const v = Math.max(3, (profile.vitesseMs || 6.5) * (1 - 0.3 * (profile.fatigue || 0)));
    const t = d / v;
    const pt = s.pt;
    const horsJeu = pt && c.id !== 'PRESS_CARRIER' ? (c.target.x - pt.x) * sens > 0.3 && (s.phase === 'RUCK' || s.phase === 'MAUL') : false;
    return Object.assign({}, c, { travel: +t.toFixed(2), valide: !horsJeu, score: c.priority - 2.5 * t });
  });
  const valides = evalues.filter((c) => c.valide);
  valides.sort((a, c) => c.score - a.score || a.id.localeCompare(c.id, 'en'));
  const choix = valides[0] || evalues.sort((a, c) => c.score - a.score)[0];
  return Object.freeze({ placementGoal: choix.id, target: Object.freeze({ x: +P.clamp(choix.target.x, 0, 100).toFixed(3), y: +P.clamp(choix.target.y, 0, P.LARGEUR).toFixed(3) }),
    vmaxFactor: choix.vmax, reason: choix.reason, candidates: Object.freeze(evalues.map((c) => Object.freeze({ id: c.id, score: +c.score.toFixed(2), valide: c.valide }))) });
}

module.exports = { individualPlacement, GAP_MIN };
