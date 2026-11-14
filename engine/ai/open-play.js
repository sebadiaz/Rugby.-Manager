// Lecture locale du jeu courant. Les vitesses et espaces sont estimés à partir
// des joueurs récemment vus. Un couloir hors du champ de vision reste inconnu.
'use strict';

const { clamp, dist, LARGEUR } = require('./position-goals.js');

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

function lirePorteur(b, s, profile, playbook) {
  if (s.phase !== 'PORTE' || !s.aLeBallon || !s.available || !s.onside || s.ball.age > 0.35) return null;
  const me = b.self, sens = s.sens;
  const adv = Object.values(b.opponents).filter(visibleJouable);
  if (adv.length < 2) return null;
  const pression = adv.reduce((min, d) => Math.min(min, dist(me, d.lastSeen)), Infinity);
  const distanceBut = sens > 0 ? 100 - me.x : me.x;
  const territoire = 100 - distanceBut;
  const course = espaceDevant(me, sens, adv, 17, 0.35);
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
    const couvre = fond.some(d => Math.abs(d.lastSeen.y - me.y) <= 13);
    const type = territoire <= 22 && couvre ? 'TOUCHE' : 'DEGAGEMENT';
    options.push({ action: 'KICK', kick: type, score: (territoire <= 22 ? 9.5 : 6) + (couvre ? 0 : 2) + (me.jeuPied - 55) * 0.09 + clamp(consignePied - 1.5, -1.5, 1.5) * 2 });
  }
  options.sort((a, c) => c.score - a.score || (a.vers || 0) - (c.vers || 0));
  const choix = options[0];
  if (choix.action === 'PASS' && (pression < 2.5 || pression > 7 || course >= 7 || choix.score < course + 6 || choix.score < 9)) return null;
  if (choix.action === 'KICK' && (choix.score < course + 3 || choix.score < (options[1]?.score ?? 0) + 2)) return null;
  // Laisser le jeu de phase et ses consignes décider dans les lectures serrées.
  if (choix.action === 'RUN' && (choix.decalage == null || pression < 6 || distanceBut > 25)) return null;
  return { ...choix, options, pression, course, age: s.ball.age };
}

module.exports = { lirePorteur, intercepter, visibleJouable, espaceDevant };
