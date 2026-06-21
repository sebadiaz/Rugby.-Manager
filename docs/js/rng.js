// RNG seedé pour l'interface (ex. tirage d'une nouvelle graine de match au
// clic sur "Nouveau match"). La simulation elle-même a déjà son propre RNG
// interne et entièrement seedé (creerRng dans engine/rugby-engine.js,
// exporté par RugbyEngine.creerRng) : un match avec la même graine produit
// toujours le même déroulé. Ce module ne remplace pas ce RNG-là, il sert
// uniquement à des besoins côté UI qui n'ont pas besoin d'être rejouables
// (ex. générer une graine aléatoire affichée à l'écran).
(function (global) {
  'use strict';

  // mulberry32 : même famille de générateur que le moteur, pour rester
  // cohérent, mais instance indépendante (ne consomme pas le RNG de match).
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let etat = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

  function setSeed(seed) {
    etat = mulberry32((Number(seed) >>> 0) || 1);
  }

  function random() {
    return etat();
  }

  function randomRange(min, max) {
    return min + random() * (max - min);
  }

  function chance(probabilite) {
    return random() < probabilite;
  }

  global.RMRng = { setSeed, random, randomRange, chance };
})(window);
