/*
 * Rugby Manager — V4, références de placement et buts de placement (RM4-G10).
 *
 * Tout ce fichier est LECTURE SEULE et par JOUEUR : à partir d'un plan de jeu
 * commun (passif) et des CROYANCES d'UN agent, il fabrique les emplacements
 * candidats de ce joueur. Jamais de fonction qui calcule les cibles de plusieurs
 * joueurs à la fois : pas de TeamCoordinator, pas de réservation, pas d'enchère.
 * Les distances, profondeurs et priorités sont des HYPOTHÈSES d'ingénierie à
 * calibrer (RM4-G28/G36). Terrain : x 0..100, y 0..70 ; A attaque vers x croissant.
 * Zéro Date.now() / Math.random().
 */
'use strict';

const LARGEUR = 70;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const PLAYBOOK_DEFAUT = Object.freeze({
  attackStructure: '1331', attackWidth: 1, defenseStyle: 'PRESS', defensiveLineDepth: 5, backfieldCoverage: 'ONE',
});
const lirePlaybook = (p) => Object.assign({}, PLAYBOOK_DEFAUT, p || {});

// Canaux défensifs nominaux (de gauche à droite) : un canal par défenseur de ligne.
const ORDRE_CANAUX = Object.freeze([11, 6, 12, 4, 1, 2, 3, 5, 7, 10, 9, 8, 13, 14]);
function canalDefensif(numero) {
  const i = ORDRE_CANAUX.indexOf(numero);
  return i < 0 ? 35 : 5 + i * (60 / (ORDRE_CANAUX.length - 1));
}

// Créneaux d'avants (décalage latéral à la balle) selon la structure d'attaque connue de tous.
const CRENEAUX_AVANTS = Object.freeze({
  '1331': { 1: -9, 2: -6, 3: -3, 4: 3, 5: 6, 6: 9, 7: -14, 8: 14 },
  '242': { 1: -10, 2: -7, 3: 7, 4: -4, 5: 4, 6: 10, 7: -16, 8: 16 },
});

// Point de référence en ATTAQUE du poste `numero` (son emplacement nominal, pas un ordre).
function referenceAttaque(numero, sens, balle, playbook) {
  const pb = lirePlaybook(playbook);
  const cote = balle.y < LARGEUR / 2 ? 1 : -1; // côté ouvert : vers le centre du terrain
  const x = (profondeur) => clamp(balle.x - sens * profondeur, 0, 100);
  if (numero <= 8) {
    const dy = (CRENEAUX_AVANTS[pb.attackStructure] || CRENEAUX_AVANTS['1331'])[numero];
    return { x: x(4), y: clamp(balle.y + dy, 2, LARGEUR - 2) };
  }
  switch (numero) {
    case 9: return { x: x(1), y: clamp(balle.y + cote * 1.5, 1, LARGEUR - 1) };
    case 10: return { x: x(10), y: clamp(balle.y + cote * 8, 2, LARGEUR - 2) };
    case 12: return { x: x(12), y: clamp(balle.y + cote * 16, 2, LARGEUR - 2) };
    case 13: return { x: x(14), y: clamp(balle.y + cote * 25, 2, LARGEUR - 2) };
    case 11: return { x: x(15), y: clamp(6 + (pb.attackWidth - 1) * 3, 2, 20) };
    case 14: return { x: x(15), y: clamp(LARGEUR - 6 - (pb.attackWidth - 1) * 3, LARGEUR - 20, LARGEUR - 2) };
    default: return { x: x(28), y: clamp(LARGEUR / 2 + (balle.y - LARGEUR / 2) * 0.4, 5, LARGEUR - 5) }; // 15
  }
}

// Ligne défensive : en retrait de la balle vers MA ligne de but, profondeur selon le plan de jeu.
function ligneDefensive(sens, balle, playbook) {
  const pb = lirePlaybook(playbook);
  const style = { PRESS: 1, DRIFT: 1.3, CONSERVATIVE: 1.6 }[pb.defenseStyle] || 1;
  return clamp(balle.x - sens * pb.defensiveLineDepth * style, 0, 100);
}
// Référence en DÉFENSE : sur la ligne, dans son canal nominal (le 15 couvre le fond).
function referenceDefense(numero, sens, balle, playbook) {
  if (numero === 15) return referenceFond(sens, balle, playbook);
  return { x: ligneDefensive(sens, balle, playbook), y: canalDefensif(numero) };
}
// Couverture du fond : 22 m derrière la ligne, latéralement à 40 % vers la balle.
function referenceFond(sens, balle, playbook) {
  const l = ligneDefensive(sens, balle, playbook);
  return { x: clamp(l - sens * 22, 2, 98), y: clamp(LARGEUR / 2 + (balle.y - LARGEUR / 2) * 0.4, 5, LARGEUR - 5) };
}

module.exports = { lirePlaybook, PLAYBOOK_DEFAUT, canalDefensif, referenceAttaque, referenceDefense, referenceFond, ligneDefensive, ORDRE_CANAUX, CRENEAUX_AVANTS, dist, clamp, LARGEUR };
