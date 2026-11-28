/*
 * Rugby Manager — V4, APTITUDES : ce que les caractéristiques INDIVIDUELLES d'un joueur changent à ses préférences de buts.
 * Spécification : docs/SIMULATION_V4/17_TROISIEMES_LIGNES.md (et 15_CARACTERISTIQUES_INDIVIDUELLES.md, § 3.8).
 *
 * RIEN N'EST SCRIPTÉ (CLAUDE.md) : on ne lit que `beliefs.self.car` (les caractéristiques du joueur LUI-MÊME), jamais son
 * numéro. Un 7 conteste plus souvent au sol PARCE QUE son grattage est élevé ; un pilier qui gratte aussi bien en ferait
 * autant. Valeur de référence 60 = préférence de poste inchangée ; caractéristique absente = inchangée.
 * Les coefficients sont des hypothèses à calibrer (tendances), jamais des réglages de statistiques.
 */
'use strict';

const REFERENCE = 60;
const C_GRATTAGE = 0.6;      // envie de contester au sol : × (1 ± 0,6 × écart)
const C_ARRIVEE_RUCK = 0.4;  // engagement au ruck offensif
const C_SOUTIEN = 0.5;       // soutien du porteur
const BORNES = [0.4, 1.6];

const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const facteur = (v, c) => {
  const n = nombre(v);
  if (n === null) return 1;
  const e = Math.max(-1, Math.min(1, (n - REFERENCE) / 40));
  return Math.max(BORNES[0], Math.min(BORNES[1], 1 + c * e));
};

// Profil de préférences déformé par les aptitudes du joueur. Renvoie le MÊME objet si rien ne change.
function appliquerAptitudes(profil, car) {
  if (!profil || !car) return profil;
  const fg = facteur(car.grattage, C_GRATTAGE), fa = facteur(car.arriveeRuck, C_ARRIVEE_RUCK), fs = facteur(car.courseSoutien, C_SOUTIEN);
  if (fg === 1 && fa === 1 && fs === 1) return profil;
  const out = Object.assign({}, profil);
  if (typeof profil.contest === 'number') out.contest = profil.contest * fg;
  if (typeof profil.ruck === 'number') out.ruck = profil.ruck * fa;
  out.soutien = (profil.soutien ?? 1) * fs;
  return out;
}

module.exports = { appliquerAptitudes, facteur, REFERENCE, C_GRATTAGE, C_ARRIVEE_RUCK, C_SOUTIEN };
