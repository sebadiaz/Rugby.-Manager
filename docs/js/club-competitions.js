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
  // Les compétitions PROPRES au club du joueur (Équipe B, Espoirs) viennent
  // s'ajouter à celles de son pays (TODO_AUDIT.md P1-33) : elles n'ont pas
  // d'autre endroit où vivre, et les écrans Classement et Calendrier doivent
  // pouvoir les afficher par le MÊME chemin que n'importe quel championnat.
  const PREFIXE_COUPE = 'coupe:';
  const REF_EQUIPE_B = 'equipeB';
  const REF_ESPOIRS = 'espoirs';

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
    // Les deux autres compétitions du club du joueur, à la suite de sa
    // pyramide — uniquement si elles existent réellement.
    const compB = saison.competitionB;
    if (compB && compB.calendrier && compB.calendrier.length) {
      liste.push({ ref: REF_EQUIPE_B, nom: 'Championnat Équipe B', niveau: null, estCelleDuJoueur: true });
    }
    const compEsp = RMClub.assurerCompetitionEspoirs ? RMClub.assurerCompetitionEspoirs(saison) : null;
    if (compEsp && compEsp.calendrier && compEsp.calendrier.length) {
      liste.push({ ref: REF_ESPOIRS, nom: 'Championnat des espoirs', niveau: null, estCelleDuJoueur: true });
    }
    // Les coupes (TODO_AUDIT.md P1-34) rejoignent la même navigation : un
    // tableau à élimination directe n'a pas de classement, mais il a un
    // calendrier — et il n'existe qu'UN écran Calendrier dans le jeu.
    const coupes = saison.coupes || {};
    for (const cle of Object.keys(coupes)) {
      const coupe = coupes[cle];
      if (!coupe || !coupe.tours || !coupe.tours.length) continue;
      const engage = coupe.clubs.some((c) => c.id === saison.clubJoueur.id);
      liste.push({ ref: PREFIXE_COUPE + cle, nom: coupe.nom, niveau: null, estCelleDuJoueur: engage, coupe: true });
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
        // Montées et descentes RÉELLES du palier, lues à la règle du moteur
        // (club-pyramide.js) — celle-là même qu'applique avancerSaison.
        places: RMClub.placesPyramideFrance(niveauPalierJoueur(saison)),
      }, clubs);
    }

    if (ref === REF_EQUIPE_B) {
      const compB = saison.competitionB;
      if (!compB || !compB.calendrier || !compB.calendrier.length) return null;
      const ids = new Set(compB.eligibles || []);
      const clubs = [saison.clubJoueur].concat(saison.adversaires || []).filter((c) => ids.has(c.id));
      return assembler({
        ref, nom: 'Championnat Équipe B', pays: 'FRA', clubs,
        classementBrut: compB.classement, calendrier: compB.calendrier,
        estCelleDuJoueur: true, promus: 0, relegues: 0,
      }, clubs);
    }

    if (ref === REF_ESPOIRS) {
      const compEsp = global.RMClub.assurerCompetitionEspoirs(saison);
      if (!compEsp || !compEsp.calendrier.length) return null;
      return assembler({
        ref, nom: 'Championnat des espoirs', pays: 'FRA', clubs: compEsp.clubs,
        classementBrut: compEsp.classement, calendrier: compEsp.calendrier,
        estCelleDuJoueur: true, promus: 0, relegues: 0,
      }, compEsp.clubs);
    }

    // Une COUPE (TODO_AUDIT.md P1-34) : pas de classement (l'élimination
    // directe n'en produit pas), mais un calendrier bien réel — chaque tour
    // devient une « journée », avec sa date et ses rencontres. Le classement
    // renvoyé est vide : l'écran Classement le dit au lieu d'inventer une
    // table de points qui n'existe pas dans une coupe.
    if (ref.indexOf(PREFIXE_COUPE) === 0) {
      const coupe = (saison.coupes || {})[ref.slice(PREFIXE_COUPE.length)];
      if (!coupe || !coupe.tours.length) return null;
      const calendrier = [];
      for (const t of coupe.tours) {
        for (const r of t.rencontres) {
          if (!r.domicileId || !r.exterieurId) continue;
          calendrier.push({
            id: r.id, journee: t.index + 1, nomTour: t.nom, date: t.date,
            domicileId: r.domicileId, exterieurId: r.exterieurId,
            joue: r.joue,
            score: r.joue ? { domicile: r.score.domicile, exterieur: r.score.exterieur } : null,
          });
        }
      }
      return {
        ref, nom: coupe.nom, pays: null, partagee: true,
        estCelleDuJoueur: coupe.clubs.some((c) => c.id === saison.clubJoueur.id),
        promus: 0, relegues: 0, estCoupe: true,
        vainqueurId: global.RMClub.vainqueurCoupe(coupe),
        clubs: coupe.clubs.slice(),
        classement: [],
        calendrier,
      };
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
    // `places` (montées/descentes) vient de la règle du moteur quand la
    // compétition en a une ; les compétitions sans pyramide (Équipe B,
    // espoirs) n'en passent pas, et valent donc zéro — ce qui est vrai.
    const places = base.places || { promus: base.promus || 0, relegues: base.relegues || 0 };
    const parId = {};
    for (const c of clubs) parId[c.id] = c;
    const classement = RMClub.classementTrieDe(base.classementBrut || {})
      .map((ligne, i) => Object.assign({}, ligne, { rang: i + 1, club: parId[ligne.clubId] || null }));
    return {
      ref: base.ref, nom: base.nom, pays: base.pays || null,
      partagee: !!base.partagee,
      estCelleDuJoueur: !!base.estCelleDuJoueur,
      promus: places.promus || 0, relegues: places.relegues || 0,
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

  // --- Les compétitions D'UNE ÉQUIPE --------------------------------------
  //
  // Audit mesuré : pour ouvrir le championnat de son Équipe B, le manager
  // devait choisir dans une liste PLATE de 21 entrées mélangeant 12 pays, les
  // 3 paliers français, ses deux championnats de club et les 4 coupes. Rien
  // ne disait « voici les compétitions de ton Équipe B ». Le sélecteur
  // Première / B / Espoirs existait pourtant déjà — mais seulement dans
  // l'écran Calendrier.
  //
  // Cette fonction répond à la seule question qui compte pour ce parcours :
  // « à quoi CETTE équipe participe-t-elle ? ». Une seule logique, aucune
  // branche par équipe dans l'interface. Elle ne liste que des compétitions
  // qui EXISTENT réellement dans les données.
  function competitionsDeLEquipe(saison, equipe) {
    const RMClub = global.RMClub;
    const type = equipe || 'pro';
    const liste = [];
    const ajouter = (ref) => {
      const comp = competition(saison, ref);
      if (comp) liste.push({ ref, nom: comp.nom, estCoupe: !!comp.estCoupe });
    };
    if (type === 'pro') ajouter(REF_JOUEUR);
    else if (type === 'b') ajouter(REF_EQUIPE_B);
    else if (type === 'jeunes') ajouter(REF_ESPOIRS);

    // Les coupes suivent la MÊME règle que les matchs : celle qui décide
    // quelle équipe les dispute (cf. club-coupes.js, equipePourCoupe). Le
    // manager ne peut donc pas voir sa Coupe des Espoirs classée avec les
    // compétitions de son équipe première.
    const coupes = saison.coupes || {};
    for (const cle of Object.keys(coupes)) {
      const coupe = coupes[cle];
      if (!coupe || !coupe.tours || !coupe.tours.length) continue;
      if (!(coupe.clubs || []).some((c) => c.id === saison.clubJoueur.id)) continue;
      if (RMClub.equipePourCoupe(cle) !== type) continue;
      ajouter(PREFIXE_COUPE + cle);
    }
    return liste;
  }

  // --- Le résumé d'une compétition POUR UN CLUB ----------------------------
  //
  // Tout est dérivé des données réelles (classement enregistré, calendrier
  // daté, scores produits par le moteur) : aucune valeur n'est fabriquée. Un
  // champ vaut `null` quand la donnée n'existe pas encore — l'écran dit alors
  // qu'il n'y a rien, il n'invente pas un zéro.
  //
  // Même fonction pour un championnat et pour une coupe : `estCoupe` change
  // ce qui est renseigné, pas la façon de l'obtenir.
  function resumeCompetition(saison, ref, clubId) {
    const comp = competition(saison, ref);
    if (!comp) return null;
    const id = clubId || saison.clubJoueur.id;
    const nomDe = (cid) => {
      const cl = (comp.clubs || []).find((c) => c.id === cid);
      return cl ? cl.nom : null;
    };
    const rencontres = (comp.calendrier || []).filter(
      (f) => f.domicileId === id || f.exterieurId === id);
    const jouees = rencontres.filter((f) => f.joue && f.score);
    const aVenir = rencontres.filter((f) => !f.joue);

    // Forme : les 5 dernières rencontres RÉELLEMENT jouées, dans l'ordre du
    // calendrier. Un nul est impossible en coupe, la lettre s'en moque.
    const issue = (f) => {
      const dom = f.domicileId === id;
      const pour = dom ? f.score.domicile : f.score.exterieur;
      const contre = dom ? f.score.exterieur : f.score.domicile;
      return { pour, contre, lettre: pour > contre ? 'V' : pour < contre ? 'D' : 'N',
               adversaireId: dom ? f.exterieurId : f.domicileId, domicile: dom };
    };
    const forme = jouees.slice(-5).map((f) => issue(f).lettre);
    const dernier = jouees.length ? (() => {
      const f = jouees[jouees.length - 1];
      const r = issue(f);
      return { lettre: r.lettre, pour: r.pour, contre: r.contre,
               adversaire: nomDe(r.adversaireId), domicile: r.domicile,
               date: f.date || null, tour: f.nomTour || null };
    })() : null;
    const prochain = aVenir.length ? (() => {
      const f = aVenir[0];
      const dom = f.domicileId === id;
      return { adversaire: nomDe(dom ? f.exterieurId : f.domicileId),
               domicile: dom, date: f.date || null, tour: f.nomTour || null,
               journee: f.journee != null ? f.journee : null };
    })() : null;

    const base = {
      ref: comp.ref, nom: comp.nom, estCoupe: !!comp.estCoupe,
      nbClubs: (comp.clubs || []).length,
      engage: (comp.clubs || []).some((c) => c.id === id),
      joueesParLeClub: jouees.length, restantesPourLeClub: aVenir.length,
      forme, dernier, prochain,
    };

    if (comp.estCoupe) {
      // Une coupe n'a pas de classement : ce qui compte, c'est le tour atteint
      // et si l'on est encore en lice.
      const derniereJouee = jouees.length ? jouees[jouees.length - 1] : null;
      const elimine = !!(derniereJouee && issue(derniereJouee).lettre === 'D');
      return Object.assign(base, {
        tourActuel: prochain ? prochain.tour : (derniereJouee ? derniereJouee.nomTour : null),
        encoreEnLice: base.engage && !elimine && !comp.vainqueurId,
        elimine,
        vainqueur: comp.vainqueurId ? nomDe(comp.vainqueurId) : null,
        encoreQualifies: (comp.calendrier || [])
          .filter((f) => !f.joue).reduce((set, f) => {
            set.add(f.domicileId); set.add(f.exterieurId); return set;
          }, new Set()).size || null,
      });
    }

    const ligne = (comp.classement || []).find((l) => l.clubId === id) || null;
    const leader = (comp.classement || [])[0] || null;
    const journees = (comp.calendrier || []).reduce(
      (m, f) => Math.max(m, f.journee || 0), 0);
    const journeeCourante = (comp.calendrier || [])
      .filter((f) => f.joue).reduce((m, f) => Math.max(m, f.journee || 0), 0);
    return Object.assign(base, {
      rang: ligne ? ligne.rang : null,
      pts: ligne ? ligne.pts : null,
      j: ligne ? ligne.j : null, g: ligne ? ligne.g : null,
      n: ligne ? ligne.n : null, p: ligne ? ligne.p : null,
      pointsPour: ligne ? ligne.pointsPour : null,
      pointsContre: ligne ? ligne.pointsContre : null,
      difference: ligne ? (ligne.pointsPour || 0) - (ligne.pointsContre || 0) : null,
      bonusOffensifs: ligne ? (ligne.bonusOffensifs || 0) : null,
      bonusDefensifs: ligne ? (ligne.bonusDefensifs || 0) : null,
      leader: leader ? { nom: nomDe(leader.clubId), pts: leader.pts,
                         estLeClub: leader.clubId === id } : null,
      journees, journeeCourante,
      journeesRestantes: Math.max(0, journees - journeeCourante),
      promus: comp.promus || 0, relegues: comp.relegues || 0,
    });
  }

  // --- Les journées d'une compétition -------------------------------------
  //
  // Défaut mesuré : le sous-onglet « Calendrier » empilait TOUTES les
  // journées d'un coup — 182 rencontres pour un championnat à 14 clubs en
  // aller-retour. Impossible à parcourir, et rien ne disait où l'on en est.
  //
  // Une journée porte son numéro, sa date, son nom quand la compétition en
  // donne un (une coupe dit « Quarts de finale », pas « Journée 3 »), et son
  // état réel. Aucune numérotation inventée : tout vient du calendrier.
  function journeesDe(comp) {
    if (!comp || !comp.calendrier) return [];
    const par = new Map();
    for (const f of comp.calendrier) {
      const n = f.journee != null ? f.journee : 1;
      if (!par.has(n)) par.set(n, []);
      par.get(n).push(f);
    }
    return [...par.keys()].sort((a, b) => a - b).map((numero) => {
      const rencontres = par.get(numero);
      const dates = new Set(rencontres.map((f) => f.date).filter(Boolean));
      const jouees = rencontres.filter((f) => f.joue).length;
      return {
        numero,
        nom: rencontres[0].nomTour || `Journée ${numero}`,
        // Une date n'est affichable que si toute la journée la partage :
        // sinon on préfère ne rien dire plutôt qu'annoncer une date fausse.
        date: dates.size === 1 ? rencontres[0].date : null,
        rencontres,
        jouees,
        total: rencontres.length,
        terminee: jouees === rencontres.length,
        commencee: jouees > 0,
      };
    });
  }

  // La journée sur laquelle OUVRIR l'écran : la première non terminée, sinon
  // la dernière (compétition finie). C'est « où en est la compétition », pas
  // un numéro arbitraire.
  function journeeCouranteDe(comp) {
    const journees = journeesDe(comp);
    if (!journees.length) return null;
    return (journees.find((j) => !j.terminee) || journees[journees.length - 1]).numero;
  }

  // --- Statistiques d'une compétition -------------------------------------
  //
  // Deux parties, et deux portées DIFFÉRENTES — c'est la mesure qui l'impose,
  // pas un choix de présentation :
  //
  //   ÉQUIPES  : toute la compétition. Chaque ligne de classement porte déjà
  //              points pour/contre, essais pour/contre et bonus, pour TOUS
  //              les clubs — ce sont de vraies données, enregistrées match
  //              après match.
  //   JOUEURS  : le club du joueur SEULEMENT. Mesuré : après trois journées,
  //              15 de ses joueurs ont des statistiques individuelles, et
  //              ZÉRO joueur adverse en a. Les rencontres entre clubs IA sont
  //              résolues de façon abstraite (un score, pas un match simulé) :
  //              il n'existe aucune statistique individuelle à leur sujet.
  //              Classer « les meilleurs marqueurs de la compétition » serait
  //              donc inventer les trois quarts du tableau. On annonce la
  //              portée réelle au lieu de fabriquer un classement.
  //
  // `limites` porte ces réserves pour que l'écran les affiche au lieu de les
  // taire.
  const COMPETITION_STATS_JOUEUR = { joueur: 'pro', equipeB: 'b', espoirs: 'jeunes' };

  // Un classement RENVOIE des copies : plusieurs classements partagent les
  // mêmes joueurs et les mêmes clubs, et écrire `valeur` sur l'objet d'origine
  // faisait que le dernier appel écrasait la valeur de tous les précédents
  // (mesuré : « meilleure attaque · 0 point » alors que le club en avait 75).
  function classer(liste, champ, croissant) {
    return liste
      .map((x) => Object.assign({}, x, { valeur: Number(x[champ]) || 0 }))
      .sort((a, b) => (croissant ? a.valeur - b.valeur : b.valeur - a.valeur))
      .slice(0, 5);
  }

  function statistiquesCompetition(saison, ref) {
    const comp = competition(saison, ref);
    if (!comp) return null;
    const parId = {};
    for (const c of (comp.clubs || [])) parId[c.id] = c;
    const nomDe = (id) => (parId[id] ? parId[id].nom : null);

    // --- Équipes : sur toute la compétition, depuis le classement réel.
    const lignes = (comp.classement || []).filter((l) => l.j > 0).map((l) => ({
      clubId: l.clubId, nom: nomDe(l.clubId),
      pointsPour: l.pointsPour || 0, pointsContre: l.pointsContre || 0,
      essaisPour: l.essaisPour || 0, essaisContre: l.essaisContre || 0,
      difference: (l.pointsPour || 0) - (l.pointsContre || 0),
      bonusOffensifs: l.bonusOffensifs || 0, bonusDefensifs: l.bonusDefensifs || 0,
      j: l.j || 0,
    }));
    const joues = (comp.calendrier || []).filter((f) => f.joue).length;
    const totalPoints = lignes.reduce((t, l) => t + l.pointsPour, 0);
    const equipes = lignes.length ? {
      meilleureAttaque: classer(lignes, 'pointsPour'),
      meilleureDefense: classer(lignes, 'pointsContre', true),
      plusDEssais: classer(lignes, 'essaisPour'),
      meilleureDifference: classer(lignes, 'difference'),
      plusDeBonusOffensifs: classer(lignes, 'bonusOffensifs'),
      rencontresJouees: joues,
      pointsParRencontre: joues ? Math.round(totalPoints / joues) : 0,
    } : null;

    // --- Joueurs : uniquement ceux dont les statistiques EXISTENT.
    const cleStats = COMPETITION_STATS_JOUEUR[ref] || null;
    let joueurs = null;
    const limites = [];
    if (cleStats) {
      const effectif = global.RMClub.effectifPourEquipe(saison,
        cleStats === 'b' ? 'b' : cleStats === 'jeunes' ? 'jeunes' : 'pro');
      const suivis = (effectif || [])
        .filter((j) => j.statsSaison && j.statsSaison.parCompetition && j.statsSaison.parCompetition[cleStats])
        .map((j) => Object.assign({ id: j.id, nom: j.nom, poste: j.poste },
          j.statsSaison.parCompetition[cleStats]));
      if (suivis.length) {
        joueurs = {
          marqueurs: classer(suivis.filter((j) => j.essais > 0), 'essais'),
          plaqueurs: classer(suivis, 'tacklesMade'),
          metres: classer(suivis, 'metresGagnes'),
          passeurs: classer(suivis, 'passes'),
          nbSuivis: suivis.length,
        };
      }
      limites.push('Seuls les joueurs de ton club sont suivis individuellement : '
        + 'les rencontres entre clubs adverses sont résolues sans simulation détaillée.');
      limites.push('Les rencontres de coupe comptent dans le total de l\'équipe concernée.');
    } else if (comp.estCoupe) {
      limites.push('Les statistiques individuelles d\'une coupe sont comptées avec '
        + 'celles du championnat de l\'équipe qui la dispute.');
    }

    return { ref: comp.ref, nom: comp.nom, estCoupe: !!comp.estCoupe, equipes, joueurs, limites };
  }

  // --- Historique d'une compétition ---------------------------------------
  //
  // Les saisons précédentes du club dans CETTE compétition. Tout vient de
  // `historiqueSaisons`, enregistré à chaque fin de saison — rien n'est
  // reconstitué après coup.
  //
  // Deux réserves honnêtes, portées par `limites` :
  //   - une saison antérieure à cette fonctionnalité n'a ni palier, ni
  //     champion, ni parcours de coupe : ses champs valent null et l'écran
  //     affiche « — » plutôt qu'une valeur fabriquée ;
  //   - le championnat Équipe B et celui des espoirs ne sont pas archivés en
  //     fin de saison (seul le championnat du premier XV l'est). On le dit au
  //     lieu d'afficher une page vide sans explication.
  function historiqueCompetition(saison, ref) {
    const comp = competition(saison, ref);
    if (!comp) return null;
    const saisons = (saison.clubJoueur.historiqueSaisons || []).slice().reverse();
    const limites = [];

    if (ref === REF_JOUEUR) {
      const lignes = saisons.map((h) => ({
        numero: h.numero,
        palier: h.palierNom || null,
        position: h.position, totalClubs: h.totalClubs,
        bilan: `${h.victoires}V ${h.nuls}N ${h.defaites}D`,
        points: h.points,
        champion: h.champion || null,
        titre: !!h.titre,
      }));
      if (lignes.some((l) => !l.palier)) {
        limites.push('Les saisons jouées avant cette version n\'ont pas gardé leur palier ni le champion.');
      }
      return { ref, nom: comp.nom, type: 'championnat', lignes,
               titres: lignes.filter((l) => l.titre).length, limites };
    }

    if (ref.indexOf(PREFIXE_COUPE) === 0) {
      const cle = ref.slice(PREFIXE_COUPE.length);
      const lignes = [];
      for (const h of saisons) {
        const c = (h.coupes || []).find((x) => x.cle === cle);
        if (!c) continue;
        lignes.push({ numero: h.numero, tourAtteint: c.tourAtteint,
                      gagnee: !!c.gagnee, vainqueur: c.vainqueur || null });
      }
      if (!lignes.length && saisons.length) {
        limites.push('Aucune saison archivée ne garde de parcours pour cette coupe.');
      }
      return { ref, nom: comp.nom, type: 'coupe', lignes,
               titres: lignes.filter((l) => l.gagnee).length, limites };
    }

    limites.push('Le championnat de cette équipe n\'est pas archivé en fin de saison : '
      + 'seul celui de l\'équipe première l\'est.');
    return { ref, nom: comp.nom, type: 'aucun', lignes: [], titres: 0, limites };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    competitionsParPays, competition, clubPartout, competitionDuClub,
    historiqueCompetition,
    statistiquesCompetition,
    competitionsDeLEquipe, resumeCompetition, journeesDe, journeeCouranteDe,
    REF_COMPETITION_JOUEUR: REF_JOUEUR, REF_COMPETITION_EQUIPE_B: REF_EQUIPE_B, REF_COMPETITION_ESPOIRS: REF_ESPOIRS,
  });
})(window);
