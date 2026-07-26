// Mode Club : objectif de saison et confiance du président — un enjeu
// dérivé du classement RÉEL de la saison précédente (jamais une ambition
// fabriquée sans lien avec l'historique du club). Sans historique (saison
// 1), objectif neutre : finir dans la première moitié. Ensuite, l'ambition
// suit la forme du club — bien classé = objectif relevé, mal classé =
// objectif de maintien.
//
// Deuxième domaine extrait de docs/js/club.js (TODO_AUDIT.md P2-10, tranche
// 2) : les 3 fonctions sont pures (aucun état de module, aucune dépendance
// externe), le domaine le plus simple possible à extraire — aucune aide
// générique à exporter, aucun compteur à resynchroniser, contrairement à la
// tranche 1 (Personnel). Même mécanisme de fusion que club-personnel.js :
// l'ordre de chargement par rapport à club.js n'a pas d'importance.
(function (global) {
  'use strict';

  function determinerObjectifSaison(historiqueSaisons, totalClubs) {
    const derniere = historiqueSaisons && historiqueSaisons.length ? historiqueSaisons[historiqueSaisons.length - 1] : null;
    if (!derniere) return { position: Math.max(1, Math.ceil(totalClubs / 2)), totalClubs };
    const rang = derniere.position;
    if (rang <= 2) return { position: 2, totalClubs };
    if (rang <= Math.ceil(totalClubs / 2)) return { position: Math.max(1, Math.ceil(totalClubs / 2)), totalClubs };
    return { position: Math.max(1, totalClubs - 1), totalClubs };
  }
  function libelleObjectifSaison(objectif) {
    if (!objectif) return '';
    if (objectif.position === 1) return 'Remporter le championnat';
    if (objectif.position === 2) return 'Finir dans le top 2';
    if (objectif.position <= 3) return `Finir dans le top ${objectif.position}`;
    if (objectif.position >= objectif.totalClubs - 1) return 'Éviter la dernière place';
    return `Finir ${objectif.position}e ou mieux`;
  }
  // Compare le classement final RÉEL à l'objectif de la saison qui vient de
  // s'achever, et ajuste la confiance du président en conséquence (bornée
  // 0-100). Un objectif dépassé largement fait plus progresser la confiance
  // qu'un objectif tout juste atteint ; un échec sévère (loin de l'objectif)
  // pèse plus qu'un échec de peu.
  function evaluerObjectifSaison(objectif, positionFinale, confianceActuelle) {
    if (!objectif) return null;
    const reussi = positionFinale <= objectif.position;
    const ecart = objectif.position - positionFinale; // positif si dépassé, négatif si raté
    const delta = reussi ? Math.min(20, 8 + ecart * 3) : Math.max(-30, -8 + ecart * 4);
    const confiance = Math.max(0, Math.min(100, confianceActuelle + Math.round(delta)));
    return { reussi, delta: Math.round(delta), confiance };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    determinerObjectifSaison, libelleObjectifSaison, evaluerObjectifSaison,
  });
})(window);
