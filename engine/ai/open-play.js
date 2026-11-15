// Lecture locale du jeu courant. Les vitesses et espaces sont estimés à partir
// des joueurs récemment vus. Un couloir hors du champ de vision reste inconnu.
'use strict';

const { clamp, dist, LARGEUR } = require('./position-goals.js');

function espaceDegagement(me, sens, adversaires) {
  // Le botteur observe la couverture dans la zone où son dégagement peut
  // tomber. Les deux cibles restent à portée latérale depuis son poste.
  const profondeur = clamp(me.x + sens * 41, 0, 100);
  const couloirs = [-18, 18].map(decalage => {
    const y = clamp(me.y + decalage, 9, LARGEUR - 9);
    const cible = { x: profondeur, y };
    const distance = adversaires.reduce((proche, d) => Math.min(proche, dist(cible, projeter(d, d.age + 0.5))), Infinity);
    return { y, distance };
  });
  return couloirs.sort((a, b) => b.distance - a.distance || Math.abs(a.y - me.y) - Math.abs(b.y - me.y))[0];
}

function visibleJouable(fiche) {
  return fiche.age <= 0.55 && fiche.available !== false && !fiche.kickOffside;
}

function projeter(fiche, delai) {
  const point = fiche.lastSeen;
  return {
    x: clamp(point.x + (fiche.vx || 0) * delai, 0, 100),
    y: clamp(point.y + (fiche.vy || 0) * delai, 0, LARGEUR),
  };
}

// Le plaqueur vise un point atteignable sur la course adverse. On rapproche
// la cible quand le contact est imminent et on borne l'extrapolation.
function intercepter(me, porteur, vitesse) {
  const delai = clamp((dist(me, porteur.lastSeen) - 2) / vitesse, 0, 0.8);
  return projeter(porteur, delai * 0.65 + porteur.age);
}

// Dernier rideau : l'arrière cherche un rendez-vous atteignable sur la
// course observée et coupe l'angle avant la ligne. Les estimations restent
// bornées : il réajuste sa course à la prochaine observation.
function lireCouverture(b, s) {
  if (b.agent.numero !== 15 || s.phase !== 'PORTE' || !s.advPoss || !s.available || !s.onside) return null;
  const porteur = b.opponents[s.ball?.owner];
  if (!porteur || !visibleJouable(porteur)) return null;
  const balle = porteur.lastSeen, me = b.self, sens = s.sens;
  const ligne = sens > 0 ? 0 : 100;
  const distanceEnBut = (balle.x - ligne) * sens;
  // Sortie du dernier rideau sur les percées d'aile. Au centre, l'arrière
  // reste dans l'axe avec la couverture habituelle et ferme au contact.
  const distanceTouche = Math.min(balle.y, LARGEUR - balle.y);
  if (distanceTouche > 16 || distanceEnBut < 22 || distanceEnBut > 48) return null;
  const profondeur = (balle.x - me.x) * sens;
  if (profondeur < 8 || profondeur > 26 || dist(me, balle) > 32) return null;

  const vx = porteur.vx || 0, vy = porteur.vy || 0;
  if (-vx * sens < 3.5) return null;
  const enCours = projeter(porteur, porteur.age + 0.65);
  const rideau = Object.values(b.teammates).some(j => {
    if (!visibleJouable(j) || j.recovery) return false;
    const jx = j.lastSeen.x;
    // Un partenaire encore à hauteur peut fermer l'intérieur. Sa position
    // projetée permet de distinguer sa montée d'un retour trop tardif.
    const avance = (balle.x - jx) * sens;
    const projete = projeter(j, j.age + 0.45);
    return avance >= -1 && (jx - me.x) * sens > 2
      && (enCours.x - projete.x) * sens >= -3
      && Math.abs(projete.y - enCours.y) <= 8;
  });
  if (rideau) return null;

  const avantLigne = Math.max(0, (balle.x - ligne) / -vx - porteur.age);
  const horizon = Math.min(3.2, avantLigne);
  const vitesse = 3 + clamp(me.vitesse ?? 65, 0, 100) * 0.05;
  for (let t = 0.25; t < horizon; t += 0.25) {
    const cible = projeter(porteur, porteur.age + t);
    if (dist(me, cible) <= 1 + vitesse * t) return cible;
  }
  return projeter(porteur, porteur.age + horizon);
}

function espaceDevant(point, sens, adv, profondeur, horizon) {
  let libre = profondeur;
  for (const d of adv) {
    const p = projeter(d, horizon + d.age);
    const avant = (p.x - point.x) * sens;
    const lateral = Math.abs(p.y - point.y);
    if (avant >= -1.5 && lateral < 6) libre = Math.min(libre, Math.max(0, avant) + 1.1 * lateral);
  }
  return libre;
}

function risqueCouloir(de, vers, adv) {
  const dx = vers.x - de.x, dy = vers.y - de.y;
  const d2 = dx * dx + dy * dy;
  return adv.some((d) => {
    const p = projeter(d, 0.18 + d.age);
    const u = ((p.x - de.x) * dx + (p.y - de.y) * dy) / d2;
    return u > 0.12 && u < 0.94 && Math.hypot(p.x - de.x - u * dx, p.y - de.y - u * dy) < 2;
  });
}

function lirePassePied(b, s, me, sens, adv, distanceBut, course) {
  const n = b.agent.numero;
  if ((n !== 10 && n !== 12 && n !== 15) || (me.jeuPied ?? 0) < 65 || distanceBut > 45 || distanceBut < 8 || course >= 8) return null;
  let meilleur = null;
  for (const m of Object.values(b.teammates)) {
    if (!visibleJouable(m)) continue;
    const p = projeter(m, m.age + 0.3);
    const bord = Math.min(p.y, LARGEUR - p.y);
    if (Math.abs(p.y - me.y) < 18 || bord > 16 || (me.x - p.x) * sens < 0.5) continue; // excentré, près de la touche, en retrait
    const avance = Math.min(12, distanceBut - 3);
    if (avance < 5) continue;
    const cible = { x: clamp(me.x + sens * avance, 1, 99), y: clamp(p.y + Math.sign(p.y - LARGEUR / 2) * 2, 3, LARGEUR - 3) };
    const vol = clamp(dist(me, cible) / 16, 1.3, 2.4);
    const tMoi = dist(p, cible) / 8.5;                       // l'ailier lancé
    const tDef = adv.reduce((t, d) => Math.min(t, dist(projeter(d, d.age + 0.3), cible) / 8), Infinity);
    const arrivee = Math.max(tMoi, vol);
    if (tDef < arrivee + 0.4) continue;                      // un défenseur y sera avant ou en même temps
    const score = 9 + 2.2 * Math.min(4, tDef - arrivee) + (distanceBut <= 22 ? 3 : 0) + ((me.jeuPied ?? 65) - 65) * 0.08;
    if (!meilleur || score > meilleur.score) meilleur = { action: 'KICK_PASS', vers: m.numero, cibleX: cible.x, cibleY: cible.y, score };
  }
  return meilleur;
}

// Chistera : le plaqueur est sur moi ; un soutien tout proche, légèrement en retrait, à l'opposé du plaqueur,
// reçoit dans un espace libre. Le moteur décide de la réussite (en-avant possible selon mes mains).
function lireChistera(b, me, sens, adv, pression) {
  if (pression >= 4) return null; // dans la zone de contact (plaquage déclenché vers 3,7 m)
  const plaqueur = adv.reduce((p, d) => (!p || dist(me, d.lastSeen) < dist(me, p.lastSeen) ? d : p), null);
  if (!plaqueur) return null;
  const cotePlaqueur = Math.sign(plaqueur.lastSeen.y - me.y) || 1;
  let meilleur = null;
  for (const m of Object.values(b.teammates)) {
    if (!visibleJouable(m)) continue;
    const p = projeter(m, m.age + 0.15);
    const recul = (me.x - p.x) * sens, d = dist(me, p);
    if (recul < 0.45 || recul > 4 || d < 2 || d > 6 || Math.sign(p.y - me.y) === cotePlaqueur) continue;
    const libre = adv.reduce((t, o) => Math.min(t, dist(projeter(o, o.age + 0.3), p)), Infinity);
    if (libre < 3) continue;
    const score = 10 + Math.min(6, libre) + Math.max(0, (m.vx || 0) * sens) * 0.4;
    if (!meilleur || score > meilleur.score) meilleur = { action: 'PASS', vers: m.numero, chistera: true, score };
  }
  return meilleur;
}

function lirePorteur(b, s, profile, playbook) {
  if (s.phase !== 'PORTE' || !s.aLeBallon || !s.available || !s.onside || s.ball.age > 0.35) return null;
  const me = b.self, sens = s.sens;
  const adv = Object.values(b.opponents).filter(visibleJouable);
  if (adv.length < 2) return null;
  const pression = adv.reduce((min, d) => Math.min(min, dist(me, d.lastSeen)), Infinity);
  const distanceBut = sens > 0 ? 100 - me.x : me.x;
  const territoire = 100 - distanceBut;
  const course = espaceDevant(me, sens, adv, 17, 0.35);
  const chistera = lireChistera(b, me, sens, adv, pression);
  if (chistera && chistera.score >= course + 6) return { ...chistera, options: [chistera], pression, course, age: s.ball.age };
  const options = [{ action: 'RUN', score: course + (distanceBut < 7 ? 5 : 0) }];
  if (course >= 8 && distanceBut <= 35) for (const decalage of [-3, 3]) {
    const y = me.y + decalage;
    if (y < 3 || y > LARGEUR - 3) continue;
    const air = espaceDevant({ x: me.x, y }, sens, adv, 17, 0.35);
    const score = air + (distanceBut < 7 ? 5 : 0) - 1;
    if (air >= course + 3 && score > options[0].score) options[0] = { action: 'RUN', decalage, score };
  }
  for (const m of Object.values(b.teammates)) {
    if (!visibleJouable(m)) continue;
    const p = m.lastSeen;
    const recul = (me.x - p.x) * sens;
    const longueur = dist(me, p);
    if (recul < 0.45 || recul > 11 || longueur < 3 || longueur > 21 || Math.abs(p.y - me.y) < 2) continue;
    const enCourse = Math.max(0, (m.vx || 0) * sens);
    const reception = projeter(m, longueur / 20 + m.age);
    const air = espaceDevant(reception, sens, adv, 17, longueur / 20);
    const proche = adv.reduce((min, d) => Math.min(min, dist(reception, projeter(d, longueur / 20 + d.age))), Infinity);
    const bord = Math.min(reception.y, LARGEUR - reception.y);
    const risque = risqueCouloir(me, reception, adv);
    // Le gain attendu rétribue une réception lancée et un défenseur fixé.
    // Le plein large a un coût si l'ailier manque de place ou si la passe est longue.
    const score = 0.76 * air + 0.36 * Math.min(12, proche) + 0.55 * enCourse
      - 0.32 * recul - 0.16 * longueur - Math.max(0, 5 - bord) - (risque ? 12 : 0)
      + (course < 8 && pression < 9 ? 3 : 0)
      + (m.numero === 10 ? 1.4 * profile.distribute : 0)
      + (m.numero <= 8 && b.agent.numero === 9 ? ((playbook.sortieAvant ?? 0.34) - 0.34) * 8 : 0)
      + (b.agent.numero === 12 || b.agent.numero === 13 ? clamp((playbook.passeCentres ?? 1) - 1, -1, 1) * 2 : 0)
      + clamp((playbook.attackWidth || 1) - 1, -0.5, 0.5) * Math.abs(p.y - me.y) * 0.25;
    options.push({ action: 'PASS', vers: m.numero, score });
  }
  // Sortie de camp quand la ligne monte et que les soutiens disponibles sont
  // couverts. La cible est une demande : le moteur applique ses lois et son vol.
  const consignePied = (playbook.tauxJeuAuPied ?? 1.5) * (b.agent.numero === 10 ? (playbook.piedOuvreur ?? 1) : 1);
  if (consignePied > 0 && territoire < 30 && pression >= 3.2 && pression <= 10 && (me.jeuPied ?? 0) >= 55 && distanceBut > 68) {
    const fond = adv.filter(d => (d.lastSeen.x - me.x) * sens >= 15);
    const couloir = espaceDegagement(me, sens, fond);
    // Les deux sorties ont un coût : trouver la touche rend le lancer et
    // botter dans un fond couvert expose à une relance immédiate.
    const touche = territoire <= 22 && couloir.distance < 12 && pression <= 6;
    const score = (territoire <= 22 ? 9.5 : 6) + (couloir.distance >= 12 ? 2 : 0)
      + (me.jeuPied - 55) * 0.09 + clamp(consignePied - 1.5, -1.5, 1.5) * 2;
    options.push({ action: 'KICK', kick: touche ? 'TOUCHE' : 'DEGAGEMENT', cibleY: touche ? null : couloir.y, score });
  }
  // Passe au pied (cross-kick) : un bon botteur dans le camp adverse voit un partenaire excentré, en retrait
  // (donc en jeu), qui arrivera au point de chute avant tout défenseur qu'il voit. Le moteur fait voler le
  // ballon avec son erreur propre et résout la réception disputée.
  const passePied = lirePassePied(b, s, me, sens, adv, distanceBut, course);
  if (passePied) options.push(passePied);
  options.sort((a, c) => c.score - a.score || (a.vers || 0) - (c.vers || 0));
  const choix = options[0];
  if (choix.action === 'PASS' && (pression < 2.5 || pression > 7 || course >= 7 || choix.score < course + 6 || choix.score < 9)) return null;
  if (choix.action === 'KICK' && (choix.score < course + 3 || choix.score < (options[1]?.score ?? 0) + 2)) return null;
  if (choix.action === 'KICK_PASS') return { action: 'KICK', kick: 'PASSE_PIED', cibleX: choix.cibleX, cibleY: choix.cibleY, vers: choix.vers,
    options, pression, course, age: s.ball.age, score: choix.score };
  // Laisser le jeu de phase et ses consignes décider dans les lectures serrées.
  if (choix.action === 'RUN' && (choix.decalage == null || pression < 6 || distanceBut > 25)) return null;
  return { ...choix, options, pression, course, age: s.ball.age };
}

module.exports = { lirePorteur, lirePassePied, lireChistera, intercepter, visibleJouable, espaceDevant, lireCouverture };
