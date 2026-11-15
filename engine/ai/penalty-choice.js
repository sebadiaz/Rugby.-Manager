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

  // Jeu rapide : quand la défense perçue entre la marque et l'en-but, à moins de 15 m, est clairsemée
  // (défenseurs encore au sol, partis au ruck ou en repli), tant que la ligne n'est pas trop loin.
  const devant = Object.values(b.opponents).filter((o) => o.age <= 1.5 && (o.lastSeen.x - pen.x) * sens >= -2
    && Math.hypot(o.lastSeen.x - pen.x, o.lastSeen.y - pen.y) <= 15).length;
  const rapide = 0.6 + (devant <= 4 && dl <= 45 ? 1.6 : 0) - (dl > 60 ? 1 : 0);

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
