/*
 * Rugby Manager — V4, personnalité des agents : fonctions PURES de lecture et de décalage (RM4-G45).
 * Spécification : docs/SIMULATION_V4/16_PERSONNALITE_DES_AGENTS.md.
 *
 * RIEN N'EST SCRIPTÉ (règle permanente de CLAUDE.md) : une personnalité règle la FAÇON de décider (décalages bornés sur des
 * choix qui existent déjà). Ce module ne choisit aucun but, n'attribue aucun rôle, ne connaît ni numéro de poste ni étiquette
 * (« audacieux », « meneur »…), et ne lit que les caractéristiques de l'agent LUI-MÊME (beliefs.self.car).
 *
 * Valeur neutre = 50 = AUCUN effet (décalage 0, multiplicateur 1, bruit 0) : un joueur sans trait explicite se comporte
 * exactement comme avant. Les constantes de réglage (k, c, amplitudes) sont des hypothèses à calibrer par tendances.
 * Zéro Date.now() / Math.random() : le bruit est une fonction pure de (graine, agent, instant).
 */
'use strict';

// Même liste que TRAITS_PERSONNALITE dans engine/rugby-engine.js (comparée par server/test-v4-personnalite.js).
const TRAITS = Object.freeze(['priseDeRisque', 'altruisme', 'egoisme', 'agressivite', 'courage', 'sangFroid', 'concentration',
  'confianceSoi', 'resilience', 'regularite', 'espritEquipe', 'leadership', 'communication', 'constance']);
const NEUTRE = 50;
const K_MAX = 3;        // décalage de score maximal d'un trait (points de l'échelle des options)
const C_MAX = 0.35;     // variation relative maximale d'un poids de préférence
const POIDS_MIN = 0.05, POIDS_MAX = 1;
const AMPLITUDE_BRUIT_MAX = 2.5; // points de score, pour un trait au plus bas

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Lit les traits dans les caractéristiques de l'agent (`beliefs.self.car`) : toute valeur absente ou invalide vaut 50.
function lireTraits(car) {
  const out = {};
  for (const t of TRAITS) {
    const v = car ? nombre(car[t]) : null;
    out[t] = v === null ? NEUTRE : clamp(v, 0, 100);
  }
  return Object.freeze(out);
}

// Écart normalisé à la valeur neutre, dans [-1, 1].
const ecart = (valeur) => {
  const v = nombre(valeur);
  return v === null ? 0 : clamp((v - NEUTRE) / NEUTRE, -1, 1);
};

// Décalage de score : k × écart. 0 si le trait est neutre.
function decalage(valeur, k) {
  const kk = nombre(k);
  return kk === null ? 0 : clamp(kk, -K_MAX, K_MAX) * ecart(valeur);
}

// Multiplicateur de préférence : 1 + c × écart. 1 si le trait est neutre.
function multiplicateur(valeur, c) {
  const cc = nombre(c);
  return 1 + (cc === null ? 0 : clamp(cc, -C_MAX, C_MAX)) * ecart(valeur);
}

// Poids de préférence déformé par la personnalité, borné ; inchangé si le trait est neutre.
function ponderer(poids, valeur, c) {
  const p = nombre(poids);
  if (p === null) return 0;
  const m = multiplicateur(valeur, c);
  return m === 1 ? p : clamp(p * m, POIDS_MIN, POIDS_MAX);
}

// Amplitude du bruit de jugement : nulle pour un trait neutre ou élevé (le joueur est posé), croissante quand le trait est
// BAS (le joueur hésite sous pression). Un seul sens volontairement : un trait neutre ne change rien au comportement actuel.
function amplitudeBruit(valeur, calme = 1) {
  const manque = Math.max(0, -ecart(valeur));
  const c = nombre(calme) === null ? 1 : clamp(calme, 0, 1);
  return AMPLITUDE_BRUIT_MAX * manque * (1 - 0.5 * c);
}

// Bruit déterministe dans [-amplitude, +amplitude] : fonction pure de (graine, agent, instant quantifié à 0,2 s).
function bruit(graine, agentId, t, amplitude) {
  const a = nombre(amplitude);
  if (a === null || a <= 0) return 0;
  let h = 0x811c9dc5;
  const s = String(graine) + '|' + String(agentId) + '|' + Math.round((nombre(t) ?? 0) * 5);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  const u = (h >>> 0) / 4294967296;
  return (u - 0.5) * 2 * a;
}

module.exports = { TRAITS, NEUTRE, K_MAX, C_MAX, POIDS_MIN, POIDS_MAX, AMPLITUDE_BRUIT_MAX, lireTraits, ecart, decalage, multiplicateur, ponderer, amplitudeBruit, bruit };
