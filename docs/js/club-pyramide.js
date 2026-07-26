// Génération d'un club adverse (IA) et pyramide française (Mode Club) —
// domaine extrait de club.js (TODO_AUDIT.md P2-10, tranche 13) : un club
// adverse "prêt à jouer" (effectif de 15, budget, pas de gestion détaillée
// — contrairement au club du joueur, resté dans club.js via
// genererClubJoueur) + la pyramide à 3 paliers (Ligue d'Excellence/
// Nationale/Régionale) dans laquelle le club du joueur progresse d'une
// saison à l'autre.
//
// Dépendance cachée trouvée en analysant le domaine AVANT de couper (comme
// compteurJoueurId en tranches 8/9/10) : genererClub attribuait un id via
// `'club' + compteurId++`, remplacé par RMClub.genererProchainIdClub()
// (déjà exportée de club.js).
(function (global) {
  'use strict';

  function genererClub(rng, { nom, niveauClub = 0.5 } = {}) {
    const RMClub = global.RMClub;
    return {
      id: RMClub.genererProchainIdClub(),
      nom: nom || RMClub.genererNomClub(rng),
      couleur: RMClub.choisir(rng, RMClub.COULEURS),
      niveauClub,
      effectif: RMClub.genererEffectif(rng, niveauClub),
      // Budget estimé (rapport de scouting) : même formule que le budget de
      // départ du club du joueur — régénéré avec l'effectif à chaque saison
      // (cf. avancerSaison), jamais un chiffre suivi match par match.
      budget: budgetInitial(niveauClub, rng),
    };
  }

  // Budget de départ (k€, fictif) : les clubs plus huppés démarrent avec plus
  // de moyens — cohérent avec le niveauClub qui pilote déjà leur force sportive.
  function budgetInitial(niveauClub, rng) {
    return Math.round(150 + niveauClub * 500 + rng() * 100);
  }

  // --- Pyramide française (Mode Club) : le club du joueur DÉBUTE en petite
  // division et peut progresser réellement (montée/descente selon le
  // classement final, cf. avancerSaison) jusqu'à la plus haute — même
  // principe de pyramide à 3 niveaux que l'écosystème mondial (cf.
  // docs/js/world.js), dupliqué ici en tout petit pour que club.js reste
  // autonome (aucune dépendance à world.js, qui lui dépend de club.js). ---
  const PALIERS_PYRAMIDE_FRANCE = {
    1: 'Ligue d\'Excellence', 2: 'Ligue Nationale', 3: 'Ligue Régionale',
  };
  function nomPalierFrance(niveau) { return PALIERS_PYRAMIDE_FRANCE[niveau] || 'Ligue Régionale'; }
  // Taille RÉELLE de chaque division française (cf. docs/js/world.js, mêmes
  // chiffres) — le club du joueur occupe UNE de ces places, le reste est
  // composé d'adversaires IA (donc TAILLE_DIVISION_FRANCE[niveau] - 1
  // adversaires). Toujours un nombre PAIR au total : genererCalendrier
  // suppose un appariement par paires, sans "bye".
  const TAILLE_DIVISION_FRANCE = { 1: 14, 2: 16, 3: 14 };
  // Bande de niveau (0-1) des clubs qu'on affronte à ce palier — plus la
  // division est basse, plus l'opposition (et le club du joueur lui-même,
  // cf. nouvelleSaison) est modeste.
  function bandeNiveauPalier(niveau) {
    if (niveau <= 1) return { min: 0.55, max: 0.85 };
    if (niveau === 2) return { min: 0.35, max: 0.6 };
    return { min: 0.15, max: 0.45 };
  }
  // `n` niveaux d'adversaires étalés sur toute la bande du palier (comme le
  // tirage [0.25, 0.4, 0.5, 0.6, 0.75] historique à 5 adversaires, mais
  // recentré sur la bande de CE palier et étalé sur autant d'adversaires que
  // la vraie taille de division l'exige) — jamais des clones du même niveau.
  function niveauxAdversairesPourPalier(niveau, n) {
    const bande = bandeNiveauPalier(niveau);
    const nb = n || (TAILLE_DIVISION_FRANCE[niveau] - 1);
    const niveaux = [];
    for (let i = 0; i < nb; i++) niveaux.push(bande.min + (bande.max - bande.min) * (i / Math.max(1, nb - 1)));
    return niveaux;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    genererClub, budgetInitial, nomPalierFrance, TAILLE_DIVISION_FRANCE,
    bandeNiveauPalier, niveauxAdversairesPourPalier,
  });
})(window);
