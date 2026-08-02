// Navigation par PAYS puis CHAMPIONNAT (Mode Club) — TODO_AUDIT.md P1-28.
//
// Le jeu contenait déjà tout le nécessaire, mais éparpillé en trois endroits
// qui ne se parlaient pas :
//   - le championnat du joueur (`saison.calendrier` / `saison.classement`) ;
//   - les deux autres paliers français (`saison.autresDivisionsFrance`) ;
//   - les 12 pays de l'écosystème mondial (`saison.monde`).
// Résultat : l'écran « Autres clubs » ne montrait que les adversaires directs
// du joueur, l'onglet Monde montrait des classements dont les noms de clubs
// n'étaient PAS cliquables, et aucun des deux n'affichait de calendrier.
//
// Ce module donne UNE vue unique sur les trois sources, sous la même forme :
// un pays, ses championnats, et pour chaque championnat des clubs, un
// classement et un calendrier. Il ne DUPLIQUE aucune donnée — il lit celles
// qui existent déjà et les présente sous une forme commune, exactement comme
// club-equipes.js le fait pour les équipes d'un club.
//
// Règle de navigation inchangée (P1-20) : on ne choisit jamais un CLUB dans
// une liste, on ouvre un club en cliquant son nom. Choisir un pays puis un
// championnat n'est pas choisir un club — c'est se déplacer entre
// compétitions, ce qui reste indispensable pour que des noms de clubs
// apparaissent quelque part où on puisse les cliquer.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Référence d'un championnat : une chaîne unique et stable, qui dit aussi
  // d'où viennent ses données. Trois familles :
  //   'joueur'          -> le championnat du club du joueur
  //   'fra:<niveau>'    -> un autre palier de la pyramide française
  //   'monde:<ref>'     -> une division de l'écosystème mondial
  const PREFIXE_FRANCE = 'fra:';
  const PREFIXE_MONDE = 'monde:';
  const REF_JOUEUR = 'joueur';

  function niveauPalierJoueur(saison) {
    return (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
  }

  // --- Les championnats français ------------------------------------------
  // Le palier du joueur vient de sa propre saison (données complètes, avec
  // dates) ; les deux autres de `autresDivisionsFrance` (simulés de façon
  // abstraite). On les présente dans le même ordre que la vraie pyramide.
  function championnatsFrance(saison) {
    const RMClub = global.RMClub;
    const niveauJoueur = niveauPalierJoueur(saison);
    const autres = saison.autresDivisionsFrance && saison.autresDivisionsFrance.divisions
      ? saison.autresDivisionsFrance.divisions : {};
    const liste = [];
    for (const niveau of [1, 2, 3]) {
      if (niveau === niveauJoueur) {
        liste.push({
          ref: REF_JOUEUR,
          nom: RMClub.nomPalierFrance(niveau),
          niveau,
          estCelleDuJoueur: true,
        });
      } else if (autres[niveau]) {
        liste.push({
          ref: PREFIXE_FRANCE + niveau,
          nom: autres[niveau].nom || RMClub.nomPalierFrance(niveau),
          niveau,
          estCelleDuJoueur: false,
        });
      }
    }
    return liste;
  }

  // --- Tous les pays, France en tête --------------------------------------
  // La France du joueur remplace celle de l'écosystème mondial : c'est le
  // même pays, mais ses données réelles vivent dans la saison du joueur. On
  // n'affiche donc jamais deux Frances.
  function competitionsParPays(saison) {
    const monde = saison.monde;
    const pays = [];
    pays.push({
      code: 'FRA',
      nom: 'France',
      systeme: 'promotion-relegation',
      championnats: championnatsFrance(saison),
    });
    for (const p of (monde && monde.pays ? monde.pays : [])) {
      if (p.code === 'FRA') continue;
      pays.push({
        code: p.code,
        nom: p.nom,
        systeme: p.systeme,
        championnats: (p.divisions || []).map((d) => ({
          ref: PREFIXE_MONDE + d.ref,
          nom: d.nom,
          niveau: d.niveau,
          estCelleDuJoueur: false,
        })),
      });
    }
    return pays;
  }

  // --- Une compétition, sous une forme unique -----------------------------
  // Toujours la même : { ref, nom, clubs, classement, calendrier, ... }.
  // `classement` est DÉJÀ trié (le rang est l'index + 1) et chaque ligne
  // porte son club, pour que l'écran n'ait plus rien à recouper.
  function competition(saison, ref) {
    const RMClub = global.RMClub;
    if (!ref) return null;

    if (ref === REF_JOUEUR) {
      const clubs = [saison.clubJoueur].concat(saison.adversaires || []);
      return assembler({
        ref, nom: RMClub.nomPalierFrance(niveauPalierJoueur(saison)),
        pays: 'FRA', clubs,
        classementBrut: saison.classement,
        calendrier: saison.calendrier || [],
        estCelleDuJoueur: true,
        promus: 0, relegues: 0,
      }, clubs);
    }

    if (ref.indexOf(PREFIXE_FRANCE) === 0) {
      const niveau = Number(ref.slice(PREFIXE_FRANCE.length));
      const div = saison.autresDivisionsFrance && saison.autresDivisionsFrance.divisions
        ? saison.autresDivisionsFrance.divisions[niveau] : null;
      if (!div) return null;
      return assembler({
        ref, nom: div.nom, pays: 'FRA', clubs: div.clubs,
        classementBrut: div.classement, calendrier: div.calendrier || [],
        estCelleDuJoueur: false,
        promus: div.promus || 0, relegues: div.relegues || 0,
      }, div.clubs);
    }

    if (ref.indexOf(PREFIXE_MONDE) === 0) {
      const refMonde = ref.slice(PREFIXE_MONDE.length);
      const div = saison.monde && saison.monde.divisions ? saison.monde.divisions[refMonde] : null;
      if (!div) return null;
      return assembler({
        ref, nom: div.nom, pays: null, clubs: div.clubs,
        classementBrut: div.classement, calendrier: div.calendrier || [],
        estCelleDuJoueur: false,
        partagee: !!div.competitionPartagee,
        promus: div.promus || 0, relegues: div.relegues || 0,
      }, div.clubs);
    }
    return null;
  }

  function assembler(base, clubs) {
    const RMClub = global.RMClub;
    const parId = {};
    for (const c of clubs) parId[c.id] = c;
    const classement = RMClub.classementTrieDe(base.classementBrut || {})
      .map((ligne, i) => Object.assign({}, ligne, { rang: i + 1, club: parId[ligne.clubId] || null }));
    return {
      ref: base.ref, nom: base.nom, pays: base.pays || null,
      partagee: !!base.partagee,
      estCelleDuJoueur: !!base.estCelleDuJoueur,
      promus: base.promus || 0, relegues: base.relegues || 0,
      clubs: clubs.slice(),
      classement,
      calendrier: base.calendrier,
    };
  }

  // --- Retrouver N'IMPORTE QUEL club --------------------------------------
  // `RMClub.club()` ne connaît que le championnat du joueur : c'est
  // volontaire (c'est le seul endroit où un club a un effectif complet et
  // peut jouer un match), et cette fonction reste inchangée pour ne rien
  // risquer sur les chemins de résolution de match.
  //
  // Mais un NOM affiché doit être cliquable partout, y compris dans un
  // classement japonais ou dans un autre palier français — d'où cette
  // recherche large, utilisée uniquement par la navigation.
  function clubPartout(saison, clubId) {
    if (!clubId) return null;
    const direct = global.RMClub.club(saison, clubId);
    if (direct) return direct;
    const autres = saison.autresDivisionsFrance && saison.autresDivisionsFrance.divisions;
    if (autres) {
      for (const niveau of Object.keys(autres)) {
        const trouve = (autres[niveau].clubs || []).find((c) => c.id === clubId);
        if (trouve) return trouve;
      }
    }
    const divisions = saison.monde && saison.monde.divisions;
    if (divisions) {
      for (const ref of Object.keys(divisions)) {
        const trouve = (divisions[ref].clubs || []).find((c) => c.id === clubId);
        if (trouve) return trouve;
      }
    }
    return null;
  }

  // Compétition à laquelle appartient un club — sert à ouvrir directement le
  // bon championnat quand on revient d'une fiche de club.
  function competitionDuClub(saison, clubId) {
    for (const p of competitionsParPays(saison)) {
      for (const ch of p.championnats) {
        const comp = competition(saison, ch.ref);
        if (comp && comp.clubs.some((c) => c.id === clubId)) return comp;
      }
    }
    return null;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    competitionsParPays, competition, clubPartout, competitionDuClub,
    REF_COMPETITION_JOUEUR: REF_JOUEUR,
  });
})(window);
