/*
 * Rugby Manager — V4, choix de pénalité par le CAPITAINE (décision individuelle).
 *
 * L'arbitre a sifflé (signal public : marque, bénéficiaire, capitaine). Le
 * capitaine compare lui-même trois options avec ce qu'il sait : distance et
 * angle des poteaux, portée de son buteur, gain d'un coup de pied en touche,
 * score, minute de jeu, consigne du club (lecture seule), défense perçue
 * autour de la marque. Il DEMANDE son option ; le moteur l'exécute selon ses
 * lois (portée, touche, recul des fautifs). Fonctions pures, aucun hasard.
 * Les poids sont des hypothèses d'ingénierie à calibrer (G36/G41).
 */
'use strict';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// `pen` = { x, y } (marque) ; renvoie { choix, utilites, raison }.
function choixPenalite(b, pen, playbook = {}) {
  const team = b.agent.team;
  const sens = b.self.sensAttaque || (team === 'A' ? 1 : -1);
  const dl = sens > 0 ? 100 - pen.x : pen.x;                      // distance à la ligne adverse
  const dTir = Math.hypot(dl, Math.abs(pen.y - 35) * 0.6);       // l'angle pèse moins que la distance
  const portee = playbook.porteeButeur ?? 45;
  const tirPossible = dl >= 5 && dl <= 45;
  const pTir = !tirPossible || dTir > portee + 3 ? 0 : dTir <= 25 ? 0.9 : clamp(0.9 - 0.35 * (dTir - 25) / Math.max(5, portee - 25), 0.05, 0.9);

  // Coup de pied en touche : point de lancer estimé avec la portée connue du buteur.
  const gain = playbook.gainTouche ?? 32;
  const lancer = Math.max(5, dl - gain);
  const prefMaul = clamp((playbook.maulTouche ?? 0.45) / 0.45, 0.6, 1.5);
  // Valeur espérée d'une touche : à 5 m, ~35 % d'essai (≈ 2,2 points) moins le risque de perdre le lancer ; décroît avec la distance.
  const toucheValeur = lancer <= 7 ? 1.9 * prefMaul : lancer <= 15 ? 1.4 * prefMaul : lancer <= 22 ? 1.0 * prefMaul
    : 0.5 + 0.025 * Math.min(gain, dl - 5);

  // Jeu rapide : on joue tout de suite quand la défense N'EST PAS EN PLACE — peu de défenseurs déjà repliés à leur
  // distance (7 à 22 m devant la marque) et répartis sur la largeur (à 25 m de part et d'autre) : les autres sont encore
  // collés au regroupement, au sol ou en train de reculer, et on les prend de vitesse. Le joueur le plus proche de la
  // marque (souvent le 9) tape (moteur). N'importe où sur le terrain, c'est même surtout une arme du milieu de terrain ;
  // dans sa propre moitié, jouer vite expose à une contre-attaque près de sa ligne : malus croissant (jusqu'à -1,2 dans
  // ses 22 m). Avant, l'option exigeait d'être à moins de 45 m de l'en-but, où les poteaux l'emportaient presque
  // toujours : aucune pénalité n'était jouée vite (0 en 240 min de jeu GOAP).
  const enPlace = Object.values(b.opponents).filter((o) => {
    if (o.age > 1.5) return false;
    const devantM = (o.lastSeen.x - pen.x) * sens;
    return devantM >= 7 && devantM <= 22 && Math.abs(o.lastSeen.y - pen.y) <= 25;
  }).length;
  const chezSoi = Math.max(0, Math.min(1, (dl - 50) / 30));
  // Bonus seulement si presque PERSONNE n'est replacé (0 ou 1), et seulement dans la moitié adverse : au coup de sifflet,
  // la défense est presque toujours encore autour du regroupement, et un bonus plus large faisait jouer vite plus d'une
  // pénalité sur deux (54 %) — invraisemblable ; ordre de grandeur supposé en pratique : de l'ordre d'une sur dix (hypothèse non sourcée,
  // à vérifier sur les matchs des docs 11-14).
  const rapide = 0.6 + (enPlace <= 1 && dl <= 50 ? 1.2 : 0) - 1.2 * chezSoi;

  const ecart = b.score ? (team === 'A' ? b.score.A - b.score.B : b.score.B - b.score.A) : 0;
  const fin = b.t > 4800 * 0.75;
  let poteaux = 3 * pTir, touche = toucheValeur;
  if (fin && ecart < -3) { poteaux *= 0.35; touche += 0.5; }      // 3 points ne suffisent pas
  if (fin && ecart >= 0) poteaux *= 1.4;                          // on prend les points qui sont là
  // Fluctuation individuelle déterministe (±0,3) : deux capitaines ne lisent pas pareil.
  const bruit = (((b.agent.numero * 53 + Math.round(pen.x * 7 + pen.y * 3)) % 13) - 6) * 0.05;
  touche += bruit;

  const utilites = { POTEAUX: +poteaux.toFixed(3), TOUCHE: +touche.toFixed(3), RAPIDE: +rapide.toFixed(3) };
  const consigne = playbook.choixPenalites;
  if (consigne === 'touche' && tirPossible) return { choix: 'TOUCHE', utilites, raison: 'CONSIGNE_CLUB' };
  if (consigne === 'points' && tirPossible && pTir > 0) return { choix: 'POTEAUX', utilites, raison: 'CONSIGNE_CLUB' };
  const ordre = ['POTEAUX', 'TOUCHE', 'RAPIDE'].filter((k) => k !== 'POTEAUX' || pTir > 0);
  const choix = ordre.reduce((m, k) => (utilites[k] > utilites[m] ? k : m), ordre[0]);
  return { choix, utilites, raison: 'UTILITE' };
}

module.exports = { choixPenalite };
