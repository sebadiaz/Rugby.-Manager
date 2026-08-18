// Revenus liés aux RÉSULTATS sportifs (Mode Club).
//
// Audit mesuré avant : sur une saison complète de Ligue Régionale, le club
// encaissait 1 118 k€ — 728 de billetterie (65 %) et 390 de sponsor (35 %).
// Aucun droit TV, aucune prime : zéro occurrence dans tout docs/js.
//
// Conséquence directe en jeu : finir 1er ou 14e ne changeait RIEN au budget,
// gagner une coupe ne rapportait RIEN, monter d'un palier n'apportait aucune
// ressource. Le manager n'avait donc aucune raison financière de viser haut,
// et aucun arbitrage entre « je vise le titre » et « je gère ma trésorerie ».
//
// Ce module apporte les deux sources qui relient le sportif à l'argent :
//   - les DROITS TV, versés à chaque journée, selon le palier ;
//   - les PRIMES, versées en fin de saison, selon le classement final et le
//     parcours réel en coupe.
//
// Calibration : les droits TV pèsent volontairement moins que la billetterie
// (sinon le stade et le remplissage ne serviraient plus à rien) mais assez
// pour qu'une montée change l'échelle du club. Les primes, elles, sont
// ponctuelles et récompensent la saison, pas la régularité.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Droits TV par JOURNÉE de championnat, en k€, selon le palier. Un rapport
  // d'environ 1 à 3 entre la base et le sommet : monter d'un palier augmente
  // nettement cette ressource, ce qui donne un vrai enjeu financier à la
  // promotion — sans écraser la billetterie, qui reste de loin la première
  // recette (mesuré sur une saison : TV 130 k€ en Régionale, 364 en
  // Excellence, contre 674 de billetterie, soit 10 % à 24 % des recettes).
  const DROITS_TV_PAR_PALIER = { 1: 14, 2: 9, 3: 5 };

  function droitsTVParJournee(niveauPalier) {
    const n = Number(niveauPalier) || 3;
    return DROITS_TV_PAR_PALIER[n] != null ? DROITS_TV_PAR_PALIER[n] : DROITS_TV_PAR_PALIER[3];
  }

  // Prime de classement, versée UNE FOIS en fin de saison. Décroît avec le
  // rang et s'annule dans la seconde moitié du tableau : une saison réussie
  // finance la suivante, une saison quelconque ne rapporte rien.
  //
  // L'échelle suit le palier, comme les droits TV — un titre en Ligue
  // d'Excellence n'a pas la valeur d'un titre en Régionale.
  const PRIME_TITRE_PAR_PALIER = { 1: 240, 2: 140, 3: 85 };

  function primeClassement(niveauPalier, position, totalClubs) {
    const n = Number(niveauPalier) || 3;
    const base = PRIME_TITRE_PAR_PALIER[n] != null ? PRIME_TITRE_PAR_PALIER[n] : PRIME_TITRE_PAR_PALIER[3];
    const total = Math.max(2, Number(totalClubs) || 14);
    const rang = Math.max(1, Number(position) || total);
    // Rien au-delà de la moitié du tableau.
    const limite = Math.floor(total / 2);
    if (rang > limite) return 0;
    // Décroissance linéaire du titre jusqu'à la dernière place primée.
    const part = (limite - rang + 1) / limite;
    return Math.round(base * part);
  }

  // Prime de coupe, selon le TOUR atteint. `indexTour` est celui de la
  // dernière rencontre disputée (0 = premier tour). Une finale rapporte
  // nettement plus qu'un premier tour, et la gagner davantage encore.
  const PRIME_COUPE_BASE = 12;
  const PRIME_COUPE_VICTOIRE = 100;

  function primeCoupe(coupe, indexTour, gagnee) {
    if (!coupe || !coupe.tours || !coupe.tours.length) return 0;
    const dernier = coupe.tours.length - 1;
    const tour = Math.max(0, Math.min(dernier, Number(indexTour) || 0));
    // Chaque tour franchi multiplie la mise par 1,7 : un parcours long paie
    // vraiment. Mesuré sur la Coupe Nationale (3 tours) : 12 k€ en quarts,
    // 20 en demies, 35 en finale, 135 en la gagnant.
    const montant = Math.round(PRIME_COUPE_BASE * Math.pow(1.7, tour));
    return montant + (gagnee ? PRIME_COUPE_VICTOIRE : 0);
  }

  // Verse les primes de FIN DE SAISON — classement puis coupes — et les
  // inscrit au grand livre avec un libellé qui dit d'où vient l'argent.
  //
  // Placement dans avancerSaison, les deux contraintes ayant chacune coûté un
  // test rouge : le parcours en coupe doit être CAPTURÉ avant
  // reinitialiserCoupes (qui vide les tableaux), mais les primes doivent être
  // VERSÉES après archiverComptesSaison (qui remet le grand livre à zéro).
  // D'où le paramètre `coupes` : le parcours arrive déjà lu.
  function verserPrimesDeFinDeSaison(saison, params) {
    const RMClub = global.RMClub;
    const p = params || {};
    const c = saison.clubJoueur;
    const niveau = (c.palierPyramide || { niveau: 3 }).niveau;
    const versements = [];

    const primeRang = primeClassement(niveau, p.position, p.totalClubs);
    if (primeRang > 0) {
      RMClub.mouvementTresorerie(saison, 'primes',
        `Prime de classement — ${p.position}e de ${RMClub.nomPalierFrance(niveau)}`, primeRang);
      versements.push({ source: 'classement', montant: primeRang });
    }

    for (const parcours of (p.coupes || [])) {
      if (!parcours || !parcours.tourAtteint) continue;
      const coupe = (saison.coupes || {})[parcours.cle];
      if (!coupe) continue;
      // Index du tour réellement atteint, retrouvé par son nom.
      const index = coupe.tours.findIndex((t) => t.nom === parcours.tourAtteint);
      const montant = primeCoupe(coupe, index === -1 ? 0 : index, parcours.gagnee);
      if (montant <= 0) continue;
      const libelle = parcours.gagnee
        ? `Prime — vainqueur de ${parcours.nom}`
        : `Prime — ${parcours.nom}, ${String(parcours.tourAtteint).toLowerCase()}`;
      RMClub.mouvementTresorerie(saison, 'primes', libelle, montant);
      versements.push({ source: 'coupe', cle: parcours.cle, montant });
    }
    return versements;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    droitsTVParJournee, primeClassement, primeCoupe, verserPrimesDeFinDeSaison,
  });
})(window);
