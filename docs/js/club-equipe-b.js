// Mode Club : Équipe B — championnat réservé aux clubs au budget le plus
// élevé de la ligue (recalculé chaque saison depuis les budgets RÉELS,
// jamais un seuil fixe déconnecté de l'économie simulée) — un second
// calendrier/classement en parallèle du championnat principal, RÉUTILISANT
// le même moteur de calendrier round-robin et les mêmes règles de points
// (genererCalendrier/classementInitial/enregistrerResultatDans, restés dans
// docs/js/club.js). La composition de l'équipe B du club du joueur, elle,
// est puisée dans ses remplaçants du jour non convoqués en premier XV + son
// centre de formation — une vraie utilité de jeu pour les joueurs qui ne
// jouent pas le week-end.
//
// Sixième domaine extrait de docs/js/club.js (TODO_AUDIT.md P2-10, tranche
// 6) : dépend de 3 fonctions du domaine calendrier/classement, restées dans
// club.js, appelées ici via RMClub.* — aucun état de module ici non plus.
// Même mécanisme de fusion que les tranches précédentes.
(function (global) {
  'use strict';

  function determinerEligiblesEquipeB(tousLesClubs) {
    const tries = tousLesClubs.slice().sort((a, b) => b.budget - a.budget);
    // genererCalendrier suppose un nombre PAIR de clubs (appariement par
    // paires, sans "bye") : arrondit au nombre pair supérieur, jamais moins
    // de 2, jamais plus que le total (toujours pair dans ce jeu : 6 clubs).
    let nbEligibles = Math.max(2, Math.ceil(tousLesClubs.length / 2));
    if (nbEligibles % 2 === 1) nbEligibles = Math.min(nbEligibles + 1, tousLesClubs.length);
    return tries.slice(0, nbEligibles);
  }
  function genererCompetitionB(tousLesClubs) {
    const clubsEligibles = determinerEligiblesEquipeB(tousLesClubs);
    return {
      eligibles: clubsEligibles.map((c) => c.id),
      calendrier: clubsEligibles.length >= 2 ? global.RMClub.genererCalendrier(clubsEligibles) : [],
      classement: clubsEligibles.length >= 2 ? global.RMClub.classementInitial(clubsEligibles) : {},
    };
  }
  // Backward-compat : une sauvegarde antérieure à cette fonctionnalité n'a
  // pas de champ `competitionB` — le crée à la première consultation plutôt
  // que d'attendre la prochaine fin de saison (même principe que
  // assurerCentreFormation).
  function assurerCompetitionB(saison) {
    if (!saison.competitionB) {
      saison.competitionB = genererCompetitionB([saison.clubJoueur, ...saison.adversaires]);
    }
    return saison.competitionB;
  }
  function enregistrerResultatEquipeB(saison, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    if (!saison.competitionB) return;
    global.RMClub.enregistrerResultatDans(saison.competitionB.calendrier, saison.competitionB.classement, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur);
  }
  // Prochaine RONDE (toutes les rencontres de la plus proche journée non
  // jouée) du championnat B — même principe que prochainesFixtures, pour
  // simuler une journée B complète en une fois (comme les autres rencontres
  // du championnat principal), pas seulement celle du club du joueur.
  function prochaineRondeEquipeB(saison) {
    const compB = saison.competitionB;
    if (!compB || !compB.calendrier.length) return [];
    const prochaine = compB.calendrier.find((f) => !f.joue);
    if (!prochaine) return [];
    return compB.calendrier.filter((f) => f.journee === prochaine.journee);
  }
  // Réserves disponibles pour une rencontre d'équipe B : effectif pro non
  // convoqué en premier XV aujourd'hui (ni titulaire ni banc), non blessé,
  // non prêté, complété par le centre de formation — jamais un effectif
  // fabriqué séparément, toujours les vrais joueurs du club.
  function effectifDisponiblePourEquipeB(saison) {
    const c = saison.clubJoueur;
    const convoquesAujourdhui = new Set([
      ...Object.values(c.compositionTitulaires || {}),
      ...Object.values(c.compositionBanc || {}),
    ]);
    const reservistes = c.effectif.filter((j) => !convoquesAujourdhui.has(j.id) && !j.pret && !j.blessureJournees);
    return [...reservistes, ...(c.jeunes || [])];
  }
  // Conséquences RÉELLES d'un match d'équipe B pour les joueurs alignés
  // (réservistes ET espoirs du centre de formation partagent le même champ
  // matchsJoues/fatigue/moral que l'effectif pro) : du temps de jeu, donc de
  // la fatigue, et un léger regain de moral — jamais un effet décoratif.
  function appliquerEffetsMatchEquipeB(saison, composition) {
    const c = saison.clubJoueur;
    const parId = {};
    for (const j of c.effectif) parId[j.id] = j;
    for (const j of (c.jeunes || [])) parId[j.id] = j;
    for (const id of Object.values(composition)) {
      const j = parId[id];
      if (!j) continue;
      j.matchsJoues = (j.matchsJoues || 0) + 1;
      j.fatigue = Math.min(100, (j.fatigue || 0) + 15);
      j.moral = Math.min(100, (j.moral != null ? j.moral : 65) + 2);
    }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    determinerEligiblesEquipeB, genererCompetitionB, assurerCompetitionB,
    enregistrerResultatEquipeB, prochaineRondeEquipeB,
    effectifDisponiblePourEquipeB, appliquerEffetsMatchEquipeB,
  });
})(window);
