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
const { lireTraits, decalage, ecart } = require('./personality.js');

const P = require('./position-goals.js');
const { deriveSituation } = require('./goals.js');
const { intercepter, visibleJouable, espaceDevant, lireCouverture } = require('./open-play.js');

const GAP_MIN = 11; // m : un intervalle observé plus large est « dangereux »

function voisinsDeLigne(b, ligneX, sens) {
  // Partenaires OBSERVÉS proches de la ligne défensive (±8 m de profondeur), triés par y.
  return Object.entries(b.teammates)
    .filter(([, m]) => m.confidence >= 0.3 && Math.abs(m.lastSeen.x - ligneX) <= 8)
    .map(([id, m]) => ({ id, x: m.lastSeen.x, y: m.lastSeen.y, numero: m.numero }))
    .sort((a, c) => a.y - c.y || a.id.localeCompare(c.id, 'en'));
}

// PRESS_CARRIER : le défenseur que je vois le PLUS PROCHE du porteur adverse tente de le plaquer, quel que soit son but du
// moment (tenir la ligne, empêcher l'essai, couvrir le fond) : la priorité en défense est le plaquage. Ne compte comme « plus
// près » qu'un coéquipier OBSERVÉ disponible. Le second le plus proche vient en soutien. Chacun décide pour lui seul.
function candidatPresse(b, s, jeuCourant) {
  if (!s.ball || !s.ball.owner || s.ball.owner[0] === s.team || !s.onside) return null;
  const me = b.self, sens = s.sens;
  const fiche = b.opponents[s.ball.owner];
  const porteur = fiche?.lastSeen || s.ball.lastSeen;
  const dMoi = P.dist(me, porteur);
  const plusPres = Object.values(b.teammates).filter((m) => m.available !== false && !m.recovery && P.dist(m.lastSeen, porteur) < dMoi - 0.3).length;
  // Agressivité (RM4-G48) : un défenseur agressif s'engage de plus loin (12 m ± 3) et, quand un partenaire est plus proche que lui,
  // vient davantage en soutien du plaqueur (priorité 68 ± 8). Le plus proche du porteur plaque TOUJOURS (96), quelle que soit sa personnalité.
  const agr = lireTraits(me.car).agressivite;
  if (dMoi > 12 + 3 * ecart(agr) || plusPres > 1) return null;
  // Je suis DEVANT le porteur (entre lui et ma ligne) : je l'attends sur sa route, juste devant lui. Le poursuivre par le
  // côté ne sert à rien quand il court aussi vite que moi (il longe la touche et marque).
  const devant = (porteur.x - me.x) * sens > 0 && dMoi > 3;
  const predit = jeuCourant && dMoi > 4.5 && fiche && visibleJouable(fiche);
  const cible = devant ? { x: P.clamp(porteur.x - sens * Math.min(6, dMoi * 0.5), 0, 100), y: porteur.y }
    : predit ? intercepter(me, fiche, 3 + (me.vitesse ?? 65) * 0.05)
    : { x: P.clamp(porteur.x - sens * Math.min(4, dMoi * 0.4), 0, 100), y: porteur.y };
  return { id: 'PRESS_CARRIER', priority: plusPres === 0 ? 96 : 68 + decalage(agr, 8), target: cible, vmax: 1, reason: plusPres === 0 ? 'je suis le plus proche du porteur : je plaque' : 'soutien au plaqueur' };
}

// MARK_OPPONENT : un attaquant menaçant (le porteur exclu : c'est le rôle du plaqueur) dans mon canal, sans partenaire
// visiblement plus proche de lui que moi.
function candidatMarquage(b, s, ref) {
  const me = b.self, sens = s.sens;
  const menaces = Object.entries(b.opponents).filter(([id, o]) => id !== s.ball?.owner && o.confidence >= 0.3 && o.threat > 0.15
    && Math.abs(o.lastSeen.y - ref.y) <= 10 && P.dist(o.lastSeen, me) <= 14)
    .sort((a, c) => c[1].threat - a[1].threat || a[0].localeCompare(c[0], 'en'));
  for (const [id, o] of menaces) {
    const dMoi = P.dist(o.lastSeen, me);
    if (Object.values(b.teammates).some((m) => P.dist(m.lastSeen, o.lastSeen) < dMoi - 1)) continue;
    return { id: 'MARK_OPPONENT', priority: 58 + 20 * o.threat, target: { x: o.lastSeen.x - sens * 1.5, y: o.lastSeen.y }, vmax: 1, reason: 'marque ' + id };
  }
  return null;
}

function candidatsDefense(b, s, pb, jeuCourant) {
  const me = b.self, bal = s.ball && s.ball.lastSeen;
  const sens = s.sens, num = b.agent.numero;
  const out = [];
  if (!bal) return [{ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: P.referenceDefense(num, sens, { x: me.x, y: me.y }, pb), vmax: 0.8, reason: 'ballon inconnu : retour au poste' }];
  // La profondeur de ligne du plan de jeu vaut pour une phase ARRÊTÉE (hors-jeu au ruck, au maul,
  // à la mêlée). En jeu courant, la ligne MONTE sur le porteur : la garder 5 m derrière le ballon
  // la faisait reculer à la vitesse du porteur — plus aucun contact (mesuré : −45 % de plaquages).
  const arretee = s.phase === 'RUCK' || s.phase === 'MAUL' || s.phase === 'MELEE' || s.phase === 'TOUCHE';
  const ligneX = arretee ? P.ligneDefensive(sens, bal, pb) : P.clamp(bal.x - sens * 3, 0, 100);
  const ref = { x: num === 15 ? P.referenceDefense(num, sens, bal, pb).x : ligneX, y: P.referenceDefense(num, sens, bal, pb).y };
  // HOLD_LINE : aligné sur les voisins observés, jamais en avance sur eux (on retient sa montée).
  // Au ruck la ligne couvre TOUTE la largeur : un trou n'importe où doit être comblé, par celui que je vois le mieux placé.
  const voisins = voisinsDeLigne(b, ligneX, sens).filter((v) => arretee || Math.abs(v.y - ref.y) <= 15);
  const xVoisins = voisins.length ? voisins.map((v) => v.x).sort((a, c) => a - c)[Math.floor(voisins.length / 2)] : ligneX;
  // On monte ENSEMBLE : jamais plus de 3 m devant ses voisins observés (1 m sur phase arrêtée). Avec 1 m en jeu
  // courant, une ligne en retard retenait tout le monde et le porteur gagnait 20 m sans opposition.
  // Agressivité : un défenseur agressif monte davantage devant ses voisins (3 m ± 1,5), un prudent reste en retrait ; aux phases arrêtées la loi borne (1 m).
  const avance = arretee ? 1 : 3 + decalage(lireTraits(me.car).agressivite, 1.5);
  const xTenu = sens > 0 ? Math.min(ligneX, xVoisins + avance) : Math.max(ligneX, xVoisins - avance);
  // Glissement : en jeu courant la ligne se resserre vers le ballon (60 % de l'écart latéral ; à 35 % il restait 5,7 défenseurs devant le porteur contre 7,8 en LEGACY).
  // Je glisse vers le ballon d'autant moins que je vois d'attaquants non marqués À MON EXTÉRIEUR (du côté opposé au
  // ballon) : s'ils sont là, c'est à moi de tenir cette largeur, sinon ils passent derrière moi dès que le jeu change
  // de côté. Aucun poste n'est désigné : l'ailier tient son bord parce qu'il VOIT du monde au-delà de lui, et
  // glisse librement quand il n'y voit personne.
  const coteExterieur = Math.sign(me.y - bal.y) || 1;
  const exposition = Object.values(b.opponents).filter((o) => o.confidence >= 0.3
    && (o.lastSeen.y - me.y) * coteExterieur > 1 && Math.abs(o.lastSeen.x - me.x) <= 15
    && !Object.values(b.teammates).some((m) => (m.lastSeen.y - o.lastSeen.y) * coteExterieur > 0
      && P.dist(m.lastSeen, o.lastSeen) < P.dist(me, o.lastSeen))).length;
  const glisse = (bal.y - ref.y) * 0.6 / (1 + 1.5 * exposition);
  const yTenu = arretee ? ref.y : ref.y + glisse;
  out.push({ id: 'HOLD_LINE', priority: 60, target: { x: xTenu, y: yTenu }, vmax: Math.abs(bal.y - ref.y) <= 15 ? 1 : 0.85, reason: 'ligne alignée sur ' + voisins.length + ' voisin(s) observé(s)' });
  // CLOSE_GAP : plus grand intervalle observé près de moi, si je suis le mieux placé parmi ceux que je vois.
  const bords = arretee ? [{ id: 'touche0', x: ligneX, y: 0, numero: 0 }, { id: 'touche70', x: ligneX, y: P.LARGEUR, numero: 0 }] : [];
  const ligne = voisins.concat(bords, [{ id: 'moi', x: me.x, y: me.y, numero: num }]).sort((a, c) => a.y - c.y);
  let meilleur = null;
  for (let i = 0; i + 1 < ligne.length; i++) {
    const g = ligne[i + 1].y - ligne[i].y;
    if (g > (arretee ? 12 : GAP_MIN)) {
      const centre = { x: ligneX, y: (ligne[i].y + ligne[i + 1].y) / 2 };
      const dMoi = P.dist(me, centre);
      const plusProche = Object.values(b.teammates).every((m) => P.dist(m.lastSeen, centre) >= dMoi - 0.01);
      // Quitter mon poste pour boucher un trou lointain a un COÛT qui croît avec la distance (pas d'interdiction) :
      // seul un gros trou dont je suis le plus proche l'emporte sur ma tâche de ligne.
      const cout = Math.max(0, Math.abs(centre.y - ref.y) - 8) * 0.8;
      if (plusProche && (!meilleur || g - cout / 2 > meilleur.g - meilleur.cout / 2)) meilleur = { g, centre, cout };
    }
  }
  if (meilleur) out.push({ id: 'CLOSE_GAP', priority: Math.min(88, (arretee ? 74 : 62) + (meilleur.g - GAP_MIN) * 2 - meilleur.cout), target: meilleur.centre, vmax: 1, reason: 'intervalle de ' + meilleur.g.toFixed(1) + ' m, je suis le plus proche' });
  const marque = candidatMarquage(b, s, ref);
  if (marque) out.push(marque);
  const presse = candidatPresse(b, s, jeuCourant);
  if (presse) out.push(presse);
  // Lecture des courses croisées adverses (READ_CROSS) : voir plus bas.
  const fiche = b.opponents[s.ball.owner];
  const porteur = s.ball.owner && s.ball.owner[0] !== s.team ? (fiche?.lastSeen || bal) : null;
  if (jeuCourant && porteur && s.onside) for (const c of lireAttaqueAdverse(b, s, me, porteur, fiche, sens)) out.push(c);
  out.push({ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: ref, vmax: 0.8, reason: 'poste nominal en défense' });
  return out;
}

// Lecture INDIVIDUELLE d'une course croisée adverse (READ_CROSS) : je vois un attaquant courir à contre-sens
// de la dérive du porteur, juste derrière lui et vers moi ; je coupe sa course plutôt que de glisser. La
// lecture peut être fausse ou tardive. (Une lecture « je prends l'homme en plus à mon extérieur » a été
// essayée et retirée : sur 12 graines, la ligne se vidait et la défense encaissait 7,1 à 7,8 essais au lieu de 5,7.)
function lireAttaqueAdverse(b, s, me, porteur, fiche, sens) {
  const out = [];
  const vyP = fiche && visibleJouable(fiche) ? fiche.vy || 0 : 0;
  if (Math.abs(vyP) >= 2.5) {
    for (const [id, o] of Object.entries(b.opponents)) {
      if (id === s.ball.owner || !visibleJouable(o) || (o.vy || 0) * vyP > -6.25) continue; // |vy| ≥ 2,5 à contre-sens
      const derriere = (o.lastSeen.x - porteur.x) * sens >= -0.5 && P.dist(o.lastSeen, porteur) <= 8;
      const futur = { x: o.lastSeen.x + (o.vx || 0) * (o.age + 0.6), y: o.lastSeen.y + (o.vy || 0) * (o.age + 0.6) };
      if (!derriere || Math.abs(futur.y - me.y) > 6 || P.dist(me, futur) > 10) continue;
      out.push({ id: 'READ_CROSS', priority: 72, target: { x: P.clamp(futur.x - sens * 1.5, 0, 100), y: P.clamp(futur.y, 1, P.LARGEUR - 1) }, vmax: 1,
        reason: `croisée lue : ${id} repique derrière le porteur` });
      break;
    }
  }
  return out;
}

function candidatsAttaque(b, s, pb, profile, jeuCourant) {
  const me = b.self, bal = s.ball && s.ball.lastSeen, sens = s.sens, num = b.agent.numero;
  if (!bal) return [{ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: { x: me.x, y: me.y }, vmax: 0.6, reason: 'ballon inconnu' }];
  const ref = P.referenceAttaque(num, sens, bal, pb);
  const out = [];
  out.push({ id: 'RETURN_TO_PLAYBOOK', priority: 30, target: ref, vmax: 0.85, reason: 'poste nominal en attaque' });
  // BE_PASS_OPTION : profondeur et angle recevables derrière le porteur.
  out.push({ id: 'BE_PASS_OPTION', priority: 46 * (profile.option ?? 0.5) + 20, target: ref, vmax: 1, reason: 'option de passe à ma profondeur de poste' });
  // PRESERVE_WIDTH : un canal très large reste tenu même si le ballon est loin.
  // Une aile FERMÉE trop étroite (≤ 15 m entre le ballon et la touche) ne se joue pas : la tenir vaut peu.
  const fermeeEtroite = Math.sign(ref.y - bal.y) !== (bal.y < P.LARGEUR / 2 ? 1 : -1) && Math.min(bal.y, P.LARGEUR - bal.y) <= 15;
  if (Math.abs(ref.y - P.LARGEUR / 2) >= 22) out.push({ id: 'PRESERVE_WIDTH', priority: fermeeEtroite ? 40 : 64, target: { x: ref.x, y: ref.y }, vmax: 0.9, reason: 'canal large tenu (' + ref.y.toFixed(0) + ' m)' });
  // SUPPORT_CARRIER : 5 m derrière le ballon, du côté où je vois le moins de partenaires.
  const mates = Object.values(b.teammates).filter((m) => P.dist(m.lastSeen, bal) <= 12);
  const gauche = mates.filter((m) => m.lastSeen.y < bal.y).length, droite = mates.length - gauche;
  const cote = gauche > droite ? 1 : gauche < droite ? -1 : (bal.y < P.LARGEUR / 2 ? 1 : -1);
  const proche = P.dist(me, bal);
  if (proche <= 25) out.push({ id: 'SUPPORT_CARRIER', priority: 44 * (0.4 + 0.6 * (profile.ruck ?? 0.5)) * Math.max(0.1, 1.1 - proche / 25) + 10,
    target: { x: P.clamp(bal.x - sens * 5, 0, 100), y: P.clamp(bal.y + cote * 5, 1, P.LARGEUR - 1) }, vmax: 1, reason: 'soutien côté le moins occupé (' + (cote > 0 ? '+y' : '-y') + ')' });
  if (jeuCourant && !s.aLeBallon && s.phase === 'PORTE' && s.ball.owner && s.ball.age <= 0.45 && proche <= 16
    && ((num >= 4 && num <= 8) || num === 10 || num === 12 || num === 13)) {
    const adversaires = Object.values(b.opponents).filter(visibleJouable);
    const coequipiers = Object.values(b.teammates).filter(visibleJouable);
    const coteNominal = Math.sign(ref.y - bal.y) || (bal.y < 35 ? 1 : -1);
    const decalage = P.clamp(Math.abs(ref.y - bal.y), 3.5, num <= 8 ? 9 : 17);
    for (const dy of adversaires.length ? [-3.5, 0, 3.5] : []) {
      const cible = { x: P.clamp(bal.x - sens * (num <= 8 ? 1.8 : 2.8), 0, 100),
        y: P.clamp(bal.y + coteNominal * decalage + dy, 3, P.LARGEUR - 3) };
      if (Math.abs(cible.y - bal.y) < 3) continue;
      const air = espaceDevant(cible, sens, adversaires, 13, 0.55);
      const voisin = coequipiers.some(m => P.dist(m.lastSeen, cible) < 3);
      if (air < 4 || voisin) continue;
      const soutien = { id: 'ATTACK_GAP', priority: 47 + air * 1.4 - Math.abs(dy),
        target: cible, vmax: 1, reason: 'course à hauteur dans un intervalle observé' };
      out.push(soutien);
    }
  }
  const croisee = jeuCourant ? lireCroisee(b, s) : null;
  if (croisee) out.push(croisee);
  return out;
}

// Course croisée : je suis à l'extérieur d'un porteur qui dérive latéralement, et je VOIS les défenseurs
// glisser avec lui. Je repique à contre-sens, derrière lui, pour une passe croisée possible. Le porteur reste
// seul juge de me la donner (open-play.js) ; aucun défenseur n'est « fixé » par script.
function lireCroisee(b, s) {
  const num = b.agent.numero;
  if (s.phase !== 'PORTE' || s.aLeBallon || !s.ball.owner || s.ball.owner[0] !== s.team || s.ball.age > 0.45) return null;
  if (![10, 12, 13, 15, 11, 14].includes(num)) return null;
  const fiche = b.teammates[s.ball.owner];
  if (!fiche || !visibleJouable(fiche)) return null;
  const sens = s.sens, me = b.self, p = fiche.lastSeen;
  const vy = fiche.vy || 0;
  if (Math.abs(vy) < 2.5) return null;                              // le porteur ne dérive pas
  const derive = Math.sign(vy);
  const dy = (me.y - p.y) * derive, recul = (p.x - me.x) * sens;
  if (dy < 3 || dy > 12 || recul < -0.5 || recul > 8) return null;  // je suis à l'extérieur, à hauteur ou en retrait
  const def = Object.values(b.opponents).filter((o) => visibleJouable(o) && Math.abs(o.lastSeen.y - p.y) <= 15 && (o.lastSeen.x - p.x) * sens >= -2 && (o.lastSeen.x - p.x) * sens <= 12);
  if (def.length < 2) return null;
  const glissent = def.filter((o) => (o.vy || 0) * derive >= 1.5).length;
  if (glissent * 2 < def.length) return null;                       // la défense ne glisse pas avec lui
  const cible = { x: P.clamp(p.x - sens * 2.5, 0, 100), y: P.clamp(p.y - derive * 3.5, 2, P.LARGEUR - 2) };
  return { id: 'CROSS_RUN', priority: 66 + Math.min(4, glissent), target: cible, vmax: 1,
    reason: `croisée : ${glissent}/${def.length} défenseurs glissent avec le porteur` };
}

// Renforts d'attaque décidés par le joueur lui-même, d'après ce QU'IL voit côté ouvert :
//  - JOIN_LINE : l'arrière s'intercale entre le 13 et l'aile quand il compte autant ou plus d'attaquants
//    (lui compris) que de défenseurs côté ouvert, que la largeur le permet et que son camp n'est pas menacé ;
//  - SWITCH_WING : l'ailier du côté fermé (trop étroit pour être joué) quitte son aile et vient en renfort
//    côté ouvert. Aucun n'est désigné : chacun compare ce renfort à ses autres placements.
function profondeurIntercale(b, s, treize, bal, sens) {
  const x13 = (treize ? treize.lastSeen.x : bal.x - sens * 12) - sens * 2.5;
  const porteur = s.ball.owner && s.ball.owner[0] === s.team ? b.teammates[s.ball.owner] : null;
  if (!porteur || s.phase !== 'PORTE') return x13;
  const xPorteur = porteur.lastSeen.x - sens * 4;
  return sens > 0 ? Math.min(x13, xPorteur) : Math.max(x13, xPorteur); // la plus profonde des deux
}

function candidatsRenfort(b, s) {
  const num = b.agent.numero, bal = s.ball && s.ball.lastSeen;
  if (!bal || !s.maPoss || s.aLeBallon || (s.phase !== 'PORTE' && s.phase !== 'RUCK')) return [];
  if (num !== 15 && num !== 11 && num !== 14) return [];
  const sens = s.sens;
  const ouvert = bal.y < P.LARGEUR / 2 ? 1 : -1; // le côté ouvert est vers le centre du terrain
  const largeurOuverte = ouvert > 0 ? P.LARGEUR - bal.y : bal.y;
  const largeurFermee = P.LARGEUR - largeurOuverte;
  const coteOuvert = (p) => (p.y - bal.y) * ouvert > 4;
  const att = Object.values(b.teammates).filter((m) => m.age <= 1.5 && coteOuvert(m.lastSeen)
    && (bal.x - m.lastSeen.x) * sens >= -1 && (bal.x - m.lastSeen.x) * sens <= 18).length;
  const def = Object.values(b.opponents).filter((o) => o.age <= 1.5 && coteOuvert(o.lastSeen)
    && (o.lastSeen.x - bal.x) * sens >= -3 && (o.lastSeen.x - bal.x) * sens <= 20).length;
  const dMaLigne = Math.abs(bal.x - (s.team === 'A' ? 0 : 100));
  const me = b.self;
  const out = [];
  // Engagement : un arrière déjà monté dans la ligne (≤ 16 m derrière le ballon) y reste tant que la
  // défense n'est pas nettement plus nombreuse ; sans cela il hésitait à chaque décision sans jamais arriver.
  const dejaDansLaLigne = num === 15 && (bal.x - me.x) * sens <= 16 && (me.y - bal.y) * ouvert > 4;
  if (num === 15 && dMaLigne >= (dejaDansLaLigne ? 30 : 40) && largeurOuverte >= 25) {
    const surnombre = att + 1 - def;
    if (surnombre >= (dejaDansLaLigne ? -1 : 0)) {
      const treize = Object.values(b.teammates).find((m) => m.numero === 13 && m.age <= 1.5);
      const y13 = treize ? treize.lastSeen.y : bal.y + ouvert * 22;
      out.push({ id: 'JOIN_LINE', priority: Math.min(72, 63 + 3 * surnombre) + (dejaDansLaLigne ? 6 : 0),
        // Profondeur prise sur le 13 vu (2,5 m en retrait) : sinon l'arrière arrivait à hauteur des passeurs
        // et n'était jamais une option de passe légale (mesuré : 13,5 ballons reçus contre 20,7 avant).
        // Lancé : au moins 4 m de recul sur le porteur vu (mesuré : il arrivait à 0-2 m, à plat, sans élan).
        target: { x: P.clamp(profondeurIntercale(b, s, treize, bal, sens), 0, 100), y: P.clamp(y13 + ouvert * 5, 3, P.LARGEUR - 3) }, vmax: 1,
        reason: `intercalé : ${att + 1} attaquants contre ${def} défenseurs vus côté ouvert` });
    }
  }
  const fermeIci = (num === 11 && ouvert > 0) || (num === 14 && ouvert < 0);
  // Engagement de l'ailier : déjà passé côté ouvert, il ne repart pas sur son aile au moindre écart.
  const dejaPasse = fermeIci && (me.y - bal.y) * ouvert > 2;
  if (fermeIci && largeurFermee <= (dejaPasse ? 22 : 15) && largeurOuverte >= (dejaPasse ? 30 : 40)) {
    out.push({ id: 'SWITCH_WING', priority: 68 + (def <= att ? 2 : 0) + (dejaPasse ? 6 : 0),
      // Il entre comme coureur au milieu, derrière le 10, puis relit le jeu à chaque décision.
      target: (() => {
        const dix = Object.values(b.teammates).find((m) => m.numero === 10 && m.age <= 1.5);
        return dix ? { x: P.clamp(dix.lastSeen.x - sens * 3, 0, 100), y: P.clamp(dix.lastSeen.y + ouvert * 5, 3, P.LARGEUR - 3) }
          : { x: P.clamp(bal.x - sens * 13, 0, 100), y: P.clamp(bal.y + ouvert * 13, 3, P.LARGEUR - 3) };
      })(), vmax: 1,
      reason: `aile fermée de ${largeurFermee.toFixed(0)} m : renfort côté ouvert` });
  }
  return out;
}

// « Imaginer le jeu du coéquipier » (aucune IA collective, aucune parole imposée) : l'agent suppose que chaque
// coéquipier qu'il VOIT viendra occuper l'endroit où il est déjà ou vers lequel il court, et que celui qui est
// plus près d'un point l'atteindra avant lui. S'il convoite le même point, il lui laisse la place et se décale
// latéralement (≥ 2,2 m), du côté où il a déjà le plus de champ. Sa décision reste la sienne.
const ESPACE_COEQUIPIER = 2.2;
function imaginerLeJeuDesCoequipiers(b, cible) {
  const moi = b.self;
  let t = { x: cible.x, y: cible.y };
  for (let tour = 0; tour < 3; tour++) {
    let gene = null, dMin = Infinity;
    for (const m of Object.values(b.teammates)) {
      if (!m.lastSeen || m.numero === moi.numero) continue;
      const dm = P.dist(m.lastSeen, t);
      if (dm >= ESPACE_COEQUIPIER) continue;
      const dMoi = P.dist(moi, t);
      // Il y sera avant moi (ou à égalité : le numéro le plus bas garde la place, convention locale connue de tous).
      if (dm < dMoi - 0.3 || (Math.abs(dm - dMoi) <= 0.3 && m.numero < moi.numero)) { if (dm < dMin) { dMin = dm; gene = m; } }
    }
    if (!gene) break;
    const cote = Math.abs(t.y - gene.lastSeen.y) > 0.2 ? Math.sign(t.y - gene.lastSeen.y) : (moi.y >= gene.lastSeen.y ? 1 : -1);
    const ny = gene.lastSeen.y + cote * ESPACE_COEQUIPIER;
    t = { x: t.x, y: P.clamp(ny, 2, P.LARGEUR - 2) };
    if (Math.abs(t.y - ny) > 0.01) t.y = P.clamp(gene.lastSeen.y - cote * ESPACE_COEQUIPIER, 2, P.LARGEUR - 2); // bord de touche : de l'autre côté
  }
  return t;
}

// Choisit son placement. `goalId` = but retenu par le sélecteur (il restreint les familles).
function individualPlacement(beliefs, goalId, playbook, profile = {}, jeuCourant = false) {
  const pb = P.lirePlaybook(playbook);
  const s = deriveSituation(beliefs);
  const couverture = jeuCourant && lireCouverture(beliefs, s);
  let cands;
  const pressePlaq = s.advPoss ? candidatPresse(beliefs, s, jeuCourant) : null;
  if (couverture) {
    cands = [{ id: 'COVER_BREAK', priority: 85, target: couverture, vmax: 1, reason: 'dernier rideau : coupe la course vers l’en-but' }];
    // Le dernier rideau garde son plan (COVER_BREAK déclenche déjà le plaquage) : pas de PRESS_CARRIER superposé.
  } else if (goalId === 'COVER_BACKFIELD' || goalId === 'PREVENT_TRY') {
    const bal = s.ball && s.ball.lastSeen;
    cands = [{ id: goalId === 'PREVENT_TRY' ? 'PREVENT_TRY' : 'COVER_BACKFIELD', priority: goalId === 'PREVENT_TRY' ? 56 : 60,
      target: bal ? (goalId === 'PREVENT_TRY' ? { x: P.clamp(bal.x - s.sens * 6, 0, 100), y: bal.y } : P.referenceFond(s.sens, bal, pb)) : { x: beliefs.self.x, y: beliefs.self.y },
      vmax: goalId === 'PREVENT_TRY' ? 1 : 0.75, reason: goalId === 'PREVENT_TRY' ? 'intercepte entre le porteur et la ligne' : 'profondeur conservée' }];
    // En attaque, l'arrière met en balance sa profondeur et un renfort dans la ligne.
    if (goalId === 'COVER_BACKFIELD' && jeuCourant) cands = cands.concat(candidatsRenfort(beliefs, s));
    // Le plus proche du porteur le plaque ; les autres, au lieu de converger tous vers le même point devant le porteur,
    // marquent un attaquant menaçant qu'aucun partenaire ne tient.
    if (s.advPoss) {
      if (pressePlaq) cands.push(pressePlaq);
      const m = candidatMarquage(beliefs, s, P.referenceDefense(s.numero, s.sens, bal || { x: beliefs.self.x, y: beliefs.self.y }, pb));
      if (m && goalId === 'PREVENT_TRY') { m.priority += 6; cands.push(m); }
    }
  } else if (goalId === 'CONTEST_AERIAL_BALL') {
    // BALLON AU SOL (coup de pied retombé, ballon échappé) : le joueur qui a choisi de le disputer court DESSUS, là où il
    // l'a vu. Ballon encore en l'air : pas de cible ici (la lecture de trajectoire n'est pas encore modélisée).
    const bal = s.ball && s.ball.lastSeen;
    if (!bal || s.ball.state !== 'LOOSE') return null;
    cands = [{ id: 'RECOVER_LOOSE_BALL', priority: 80, target: { x: bal.x, y: bal.y }, vmax: 1, reason: 'ballon au sol : je vais le ramasser' }];
  } else if (goalId === 'DEFEND') cands = candidatsDefense(beliefs, s, pb, jeuCourant);
  else if (goalId === 'SUPPORT_CARRIER' || goalId === 'BE_PASS_OPTION' || goalId === 'RETURN_TO_PLAYBOOK' || goalId === 'GAIN_TERRITORY' || goalId === 'RETAIN_POSSESSION') {
    cands = s.maPoss || s.aLeBallon ? candidatsAttaque(beliefs, s, pb, profile, jeuCourant) : candidatsDefense(beliefs, s, pb, jeuCourant);
    if (goalId === 'SUPPORT_CARRIER') cands = cands.filter((c) => c.id === 'SUPPORT_CARRIER' || c.id === 'ATTACK_GAP' || c.id === 'CROSS_RUN' || c.id === 'RETURN_TO_PLAYBOOK');
    if (goalId === 'BE_PASS_OPTION') cands = cands.filter((c) => c.id !== 'SUPPORT_CARRIER');
    if (jeuCourant && (goalId === 'BE_PASS_OPTION' || goalId === 'RETURN_TO_PLAYBOOK')) cands = cands.concat(candidatsRenfort(beliefs, s));
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
  const cible = choix.id === 'PRESS_CARRIER' ? choix.target : imaginerLeJeuDesCoequipiers(beliefs, choix.target);
  return Object.freeze({ placementGoal: choix.id, target: Object.freeze({ x: +P.clamp(cible.x, 0, 100).toFixed(3), y: +P.clamp(cible.y, 0, P.LARGEUR).toFixed(3) }),
    vmaxFactor: choix.vmax, reason: choix.reason, candidates: Object.freeze(evalues.map((c) => Object.freeze({ id: c.id, score: +c.score.toFixed(2), valide: c.valide }))) });
}

module.exports = { individualPlacement, candidatPresse, candidatsDefense, candidatsRenfort, lireCroisee, lireAttaqueAdverse, GAP_MIN };
