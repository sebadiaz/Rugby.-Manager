// Archives des feuilles de match (Mode Club).
//
// Ce qui existait : `club-feuille-de-match.js` produit un vrai compte rendu —
// chronologie, marqueurs, statistiques comparées — mais à partir de l'état
// VIVANT du moteur (`getState()`), qui n'est jamais sauvegardé. Mesuré : d'un
// match joué, la sauvegarde ne garde que le score. Conséquence directe dans
// l'interface : cliquer une rencontre déjà jouée ne pouvait rien ouvrir, il
// n'y avait rien à ouvrir. Le compte rendu n'existait qu'une fois, sur
// l'écran de fin de match, et disparaissait dès qu'on le fermait.
//
// Ce module enregistre le STRICT nécessaire pour reconstruire cette feuille
// plus tard, et rien de plus :
//   - le score et les statistiques d'équipe déjà produites par le moteur ;
//   - la chronologie, réduite aux quatre champs que la feuille lit
//     réellement (minute, type, camp, message). `id` et `t` sont des détails
//     internes au moteur : les garder gonflerait la sauvegarde pour rien.
//
// Taille mesurée dans le navigateur sur un vrai match : ~6,3 Ko l'unité
// (47 événements de chronologie). D'où le plafond ci-dessous, et la purge de
// fin de saison : une carrière de dix saisons ne doit pas remplir le stockage
// du navigateur avec des comptes rendus que plus personne ne consulte.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Nombre de feuilles conservées. Mesuré dans le navigateur sur un vrai
  // match : ~6,3 Ko l'unité (47 événements de chronologie). Une saison du
  // joueur compte au plus ~26 journées de championnat, quelques tours de
  // coupe et quelques amicaux — ce plafond couvre donc la saison entière
  // (~250 Ko) sans jamais croître, et la purge de fin de saison
  // (purgerFeuillesAnciennes, appelée par avancerSaison) fait le reste.
  const MAX_FEUILLES = 40;

  function archives(saison) {
    if (!Array.isArray(saison.feuillesMatch)) saison.feuillesMatch = [];
    return saison.feuillesMatch;
  }

  // Clé STABLE d'une rencontre : la compétition où elle vit, et son
  // identifiant dans cette compétition. Deux compétitions peuvent numéroter
  // leurs rencontres pareil — la référence les sépare.
  function cleFeuille(refCompetition, rencontreId) {
    return `${refCompetition || 'joueur'}#${rencontreId}`;
  }

  // Réduit l'état du moteur à ce que la feuille de match lit vraiment.
  function compacterEtatMatch(etat) {
    const e = etat || {};
    const stats = e.stats || {};
    return {
      score: { A: (e.score && e.score.A) || 0, B: (e.score && e.score.B) || 0 },
      stats: { A: stats.A || {}, B: stats.B || {} },
      chronologie: (e.chronologie || []).map((x) => ({
        minute: x.minute, type: x.type, team: x.team, message: x.message,
      })),
    };
  }

  // Enregistre la feuille d'une rencontre. Rejoue-t-on la même rencontre ?
  // On remplace, on n'empile pas deux comptes rendus pour un seul match.
  function archiverFeuilleDeMatch(saison, params) {
    const p = params || {};
    if (!p.cle || !p.etat) return null;
    const liste = archives(saison);
    const entree = Object.assign({
      cle: p.cle,
      nomA: p.nomA || 'Équipe A',
      nomB: p.nomB || 'Équipe B',
      date: p.date || null,
      saisonNumero: saison.numero || 1,
      libelle: p.libelle || null,
    }, compacterEtatMatch(p.etat));
    const existant = liste.findIndex((f) => f.cle === p.cle);
    if (existant !== -1) liste.splice(existant, 1);
    liste.push(entree);
    // Éviction par la tête : la plus ancienne part en premier.
    while (liste.length > MAX_FEUILLES) liste.shift();
    return entree;
  }

  // La feuille archivée d'une rencontre, ou null. `null` est une réponse
  // normale : une rencontre jouée avant cette fonctionnalité, ou résolue de
  // façon abstraite (les rencontres entre clubs IA), n'a pas de compte rendu
  // — l'interface le dit au lieu d'en inventer un.
  function feuilleArchivee(saison, cle) {
    return archives(saison).find((f) => f.cle === cle) || null;
  }

  // La feuille COMPLÈTE, prête à afficher : on rejoue l'assemblage habituel
  // (club-feuille-de-match.js) sur les données archivées. Une seule mise en
  // forme dans le jeu, qu'on vienne de jouer le match ou qu'on le rouvre six
  // journées plus tard.
  function feuilleDeMatchArchivee(saison, cle) {
    const brute = feuilleArchivee(saison, cle);
    if (!brute) return null;
    const f = global.RMClub.feuilleDeMatch(brute, { nomA: brute.nomA, nomB: brute.nomB });
    f.date = brute.date;
    f.libelle = brute.libelle;
    f.saisonNumero = brute.saisonNumero;
    return f;
  }

  // Fin de saison : les comptes rendus de la saison écoulée ne servent plus
  // qu'à encombrer une sauvegarde qui, elle, doit rester chargeable.
  function purgerFeuillesAnciennes(saison) {
    const numero = saison.numero || 1;
    saison.feuillesMatch = archives(saison).filter((f) => (f.saisonNumero || 1) >= numero);
    return saison.feuillesMatch;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    cleFeuille, archiverFeuilleDeMatch, feuilleArchivee, feuilleDeMatchArchivee,
    purgerFeuillesAnciennes, compacterEtatMatch, MAX_FEUILLES_MATCH: MAX_FEUILLES,
  });
})(window);
