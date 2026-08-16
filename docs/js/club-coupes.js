// Moteur GÉNÉRIQUE de coupes à élimination directe (Mode Club) —
// TODO_AUDIT.md P1-34.
//
// Le jeu ne connaissait que des championnats : des poules où tout le monde
// rencontre tout le monde et où un classement départage. Aucune compétition
// à élimination directe — donc aucun match couperet, aucun parcours, aucun
// trophée à soulever.
//
// Ce module ne connaît AUCUNE coupe en particulier. Il sait construire un
// tableau à partir d'une liste de clubs et d'une liste de dates, faire
// avancer les vainqueurs, et désigner un lauréat. Les quatre coupes réelles
// (nationale, continentale principale, continentale secondaire, espoirs) ne
// sont que des CONFIGURATIONS passées à ce moteur — ajouter une cinquième ne
// demandera pas une ligne de logique supplémentaire.
//
// Deux règles propres à l'élimination directe, absentes des championnats :
//   - il n'y a JAMAIS de match nul : une prolongation départage ;
//   - un club éliminé ne rejoue plus, le tableau se resserre à chaque tour.
//
// Aucune dépendance au DOM, aucun Math.random.
(function (global) {
  'use strict';

  // Nom d'un tour selon le nombre de rencontres qu'il comporte.
  const NOMS_TOURS = {
    1: 'Finale', 2: 'Demi-finales', 4: 'Quarts de finale',
    8: 'Huitièmes de finale', 16: 'Seizièmes de finale',
  };

  function nomDuTour(nbRencontres) {
    return NOMS_TOURS[nbRencontres] || `Tour à ${nbRencontres * 2} clubs`;
  }

  // Plus grande puissance de 2 tenant dans `n` : un tableau à élimination
  // directe n'accepte pas 13 clubs. Plutôt que d'inventer des tours
  // préliminaires ou des exemptions, on QUALIFIE les meilleurs — c'est ce
  // que fait une vraie coupe dont les places sont attribuées au mérite.
  function puissanceDeDeuxInferieure(n) {
    let p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
  }

  // Construit un tableau complet. `clubs` : [{id, nom, niveauClub}].
  // `dates` : une date ISO par tour, du premier au dernier (la finale).
  // Les tours au-delà du premier naissent VIDES (domicileId/exterieurId à
  // null) et se remplissent au fur et à mesure des résultats : le tableau
  // reflète toujours l'état réel de la compétition, jamais une projection.
  function genererCoupe(config) {
    const clubs = (config.clubs || []).slice();
    const dates = config.dates || [];
    const taille = puissanceDeDeuxInferieure(clubs.length);
    if (taille < 2 || dates.length === 0) {
      return { cle: config.cle, nom: config.nom, clubs: [], tours: [], vainqueurId: null };
    }
    // Qualification au mérite : les `taille` meilleurs clubs — SAUF les
    // clubs `obligatoires`, engagés d'office quel que soit leur niveau. Le
    // club du joueur ne peut pas être spectateur de sa propre coupe
    // nationale : c'est le seul cas où le mérite ne décide pas.
    const obligatoires = config.obligatoires || [];
    const qualifies = clubs.slice().sort((a, b) => {
      const oa = obligatoires.indexOf(a.id) !== -1 ? 1 : 0;
      const ob = obligatoires.indexOf(b.id) !== -1 ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return (b.niveauClub || 0) - (a.niveauClub || 0);
    }).slice(0, taille);
    // Tête de série : le meilleur affronte le moins bien classé des
    // qualifiés, comme un vrai tableau — pas deux favoris au premier tour.
    const ordonnes = [];
    for (let i = 0; i < taille / 2; i++) {
      ordonnes.push(qualifies[i], qualifies[taille - 1 - i]);
    }

    const tours = [];
    let nbRencontres = taille / 2;
    let indexTour = 0;
    let compteur = 0;
    while (nbRencontres >= 1) {
      const rencontres = [];
      for (let i = 0; i < nbRencontres; i++) {
        const domicile = indexTour === 0 ? ordonnes[i * 2] : null;
        const exterieur = indexTour === 0 ? ordonnes[i * 2 + 1] : null;
        rencontres.push({
          id: `${config.cle}-t${indexTour}-${compteur++}`,
          tour: indexTour,
          domicileId: domicile ? domicile.id : null,
          exterieurId: exterieur ? exterieur.id : null,
          joue: false,
          score: null,
          vainqueurId: null,
          apresProlongation: false,
        });
      }
      tours.push({
        index: indexTour,
        nom: nomDuTour(nbRencontres),
        // Le dernier tour disponible sert de date à la finale : une coupe
        // dont il manque des dates s'arrête proprement plutôt que de poser
        // des rencontres sans date.
        date: dates[Math.min(indexTour, dates.length - 1)] || null,
        rencontres,
      });
      if (nbRencontres === 1) break;
      nbRencontres /= 2;
      indexTour++;
    }
    return {
      cle: config.cle, nom: config.nom,
      clubs: qualifies.map((c) => ({ id: c.id, nom: c.nom, niveauClub: c.niveauClub })),
      tours,
      vainqueurId: null,
    };
  }

  function rencontreCoupe(coupe, id) {
    for (const t of coupe.tours) {
      const r = t.rencontres.find((x) => x.id === id);
      if (r) return r;
    }
    return null;
  }

  // Enregistre un résultat et fait AVANCER le vainqueur. Un nul est
  // impossible en coupe : on départage (prolongation), et c'est annoncé.
  // Le départage est DÉTERMINISTE, dérivé des identifiants — deux
  // chargements de la même sauvegarde donnent le même vainqueur.
  function enregistrerResultatCoupe(coupe, id, scoreDomicile, scoreExterieur) {
    const r = rencontreCoupe(coupe, id);
    if (!r || r.joue) return null;
    r.joue = true;
    r.score = { domicile: scoreDomicile, exterieur: scoreExterieur };
    if (scoreDomicile > scoreExterieur) r.vainqueurId = r.domicileId;
    else if (scoreExterieur > scoreDomicile) r.vainqueurId = r.exterieurId;
    else {
      r.apresProlongation = true;
      // Départage stable : l'équipe qui reçoit a l'avantage du terrain, sauf
      // si l'identifiant de l'adversaire est « supérieur » — une règle
      // arbitraire mais REPRODUCTIBLE, jamais un tirage relancé à chaque
      // affichage.
      const somme = (String(r.domicileId) + String(r.exterieurId))
        .split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
      r.vainqueurId = (somme % 2 === 0) ? r.domicileId : r.exterieurId;
    }
    // Report au tour suivant : la i-ème rencontre du tour N alimente la
    // (i/2)-ème du tour N+1, à domicile si i est pair.
    const tourSuivant = coupe.tours[r.tour + 1];
    if (tourSuivant) {
      const position = coupe.tours[r.tour].rencontres.indexOf(r);
      const cible = tourSuivant.rencontres[Math.floor(position / 2)];
      if (cible) {
        if (position % 2 === 0) cible.domicileId = r.vainqueurId;
        else cible.exterieurId = r.vainqueurId;
      }
    } else {
      coupe.vainqueurId = r.vainqueurId;
    }
    return r;
  }

  // Vainqueur de la coupe : uniquement une fois la FINALE jouée.
  function vainqueurCoupe(coupe) {
    if (!coupe.tours.length) return null;
    const finale = coupe.tours[coupe.tours.length - 1].rencontres[0];
    return finale && finale.joue ? finale.vainqueurId : null;
  }

  // Rencontres d'une coupe programmées à une date donnée et encore à jouer.
  function rencontresCoupeDuJour(coupe, iso) {
    const tour = coupe.tours.find((t) => t.date === iso);
    if (!tour) return [];
    return tour.rencontres.filter((r) => !r.joue && r.domicileId && r.exterieurId);
  }

  // --- Les quatre coupes réelles ------------------------------------------
  // Ce ne sont que des CONFIGURATIONS du moteur ci-dessus. Chacune dit d'où
  // viennent ses participants ; rien d'autre ne les distingue.
  const DEFINITIONS_COUPES = {
    nationale: {
      nom: 'Coupe Nationale',
      // Tous les clubs français réellement simulés : la division du joueur
      // et les deux autres paliers de la pyramide.
      participants(saison) {
        const RMClub = global.RMClub;
        const clubs = [saison.clubJoueur].concat(saison.adversaires || []);
        const autres = saison.autresDivisionsFrance && saison.autresDivisionsFrance.divisions;
        if (autres) {
          for (const niveau of Object.keys(autres)) {
            for (const c of (autres[niveau].clubs || [])) clubs.push(c);
          }
        }
        // Le club du joueur est TOUJOURS qualifié : c'est sa coupe nationale,
        // il n'est pas spectateur de son propre pays.
        return { clubs, obligatoires: [saison.clubJoueur.id] };
      },
    },
    continentale: {
      nom: 'Coupe des Champions',
      // L'élite continentale : les meilleurs clubs des divisions de niveau 1
      // de l'écosystème mondial, plus l'élite française.
      participants(saison) {
        return { clubs: clubsMondiauxParNiveau(saison, 1).concat(elitesFrancaises(saison)), obligatoires: [] };
      },
    },
    continentaleSecondaire: {
      nom: 'Coupe Challenge',
      // Le deuxième échelon continental : les divisions de niveau 2.
      participants(saison) {
        return { clubs: clubsMondiauxParNiveau(saison, 2), obligatoires: [] };
      },
    },
    espoirs: {
      nom: 'Coupe des Espoirs',
      participants(saison) {
        const comp = global.RMClub.assurerCompetitionEspoirs(saison);
        return { clubs: (comp.clubs || []).slice(), obligatoires: [saison.clubJoueur.id] };
      },
    },
  };

  function clubsMondiauxParNiveau(saison, niveau) {
    const divisions = saison.monde && saison.monde.divisions;
    if (!divisions) return [];
    const clubs = [];
    for (const ref of Object.keys(divisions)) {
      const div = divisions[ref];
      if (div.niveau !== niveau) continue;
      // Les deux meilleurs de chaque division : une coupe continentale ne
      // prend pas tout le monde.
      const tries = (div.clubs || []).slice().sort((a, b) => (b.niveauClub || 0) - (a.niveauClub || 0));
      for (const c of tries.slice(0, 2)) clubs.push(c);
    }
    return clubs;
  }

  function elitesFrancaises(saison) {
    const autres = saison.autresDivisionsFrance && saison.autresDivisionsFrance.divisions;
    const clubs = [];
    if (autres && autres[1]) {
      const tries = (autres[1].clubs || []).slice().sort((a, b) => (b.niveauClub || 0) - (a.niveauClub || 0));
      for (const c of tries.slice(0, 2)) clubs.push(c);
    }
    return clubs;
  }

  // --- Dates des tours ----------------------------------------------------
  // Une coupe se joue EN SEMAINE, sur des dates où le club du joueur n'a pas
  // de match de championnat — sinon il devrait jouer deux fois le même jour.
  // On répartit les tours sur toute la saison, du plus tôt au plus tard.
  function datesDeCoupe(saison, nbTours, decalageJour) {
    const RMClub = global.RMClub;
    const debut = RMClub.dateDeJournee(saison.numero || 1, 1, 'pro');
    const dates = [];
    // Un tour toutes les ~4 semaines, décalé pour ne pas empiler les quatre
    // coupes le même jour.
    for (let i = 0; i < nbTours; i++) {
      let date = RMClub.ajouterJours(debut, 21 + i * 28 + (decalageJour || 0));
      // Décale d'un jour tant que la date porte déjà une échéance du club.
      let garde = 0;
      while (RMClub.typeDArret(saison, date) && garde++ < 6) {
        date = RMClub.ajouterJours(date, 1);
      }
      dates.push(RMClub.dateISO(date));
    }
    return dates;
  }

  function nbToursPour(nbClubs) {
    const taille = puissanceDeDeuxInferieure(nbClubs);
    let tours = 0;
    for (let n = taille; n >= 2; n /= 2) tours++;
    return tours;
  }

  // Crée les quatre coupes si elles n'existent pas encore — jamais deux fois,
  // et sans jamais écraser une compétition en cours.
  function assurerCoupes(saison) {
    if (!saison.coupes || typeof saison.coupes !== 'object') saison.coupes = {};
    const decalages = { nationale: 0, continentale: 2, continentaleSecondaire: 3, espoirs: -2 };
    for (const cle of Object.keys(DEFINITIONS_COUPES)) {
      if (saison.coupes[cle] && saison.coupes[cle].tours && saison.coupes[cle].tours.length) continue;
      const def = DEFINITIONS_COUPES[cle];
      const { clubs, obligatoires } = def.participants(saison);
      if (clubs.length < 2) continue;
      // Les clubs « obligatoires » (le club du joueur dans ses propres
      // coupes) sont hissés en tête du classement de qualification : ils
      // sont engagés quel que soit leur niveau.
      const ordonnes = clubs.slice().sort((a, b) => {
        const oa = obligatoires.indexOf(a.id) !== -1 ? 1 : 0;
        const ob = obligatoires.indexOf(b.id) !== -1 ? 1 : 0;
        if (oa !== ob) return ob - oa;
        return (b.niveauClub || 0) - (a.niveauClub || 0);
      });
      const nbTours = nbToursPour(ordonnes.length);
      saison.coupes[cle] = genererCoupe({
        cle, nom: def.nom, clubs: ordonnes, obligatoires,
        dates: datesDeCoupe(saison, nbTours, decalages[cle]),
      });
    }
    return saison.coupes;
  }

  // La rencontre de coupe du CLUB DU JOUEUR à une date donnée, s'il y en a
  // une. Sert au calendrier (une échéance de plus) et à la résolution.
  function rencontreCoupeDuJoueur(saison, date) {
    const RMClub = global.RMClub;
    const coupes = saison.coupes;
    if (!coupes) return null;
    const iso = RMClub.dateISO(date);
    const idJoueur = saison.clubJoueur.id;
    for (const cle of Object.keys(coupes)) {
      for (const r of rencontresCoupeDuJour(coupes[cle], iso)) {
        if (r.domicileId === idJoueur || r.exterieurId === idJoueur) {
          return { cle, coupe: coupes[cle], rencontre: r };
        }
      }
    }
    return null;
  }

  // Résout, de façon ABSTRAITE, toutes les rencontres de coupe programmées
  // ce jour-là qui NE concernent pas le club du joueur — même principe que
  // le championnat et l'Équipe B : le tableau vit réellement sans payer le
  // moteur complet pour des matchs jamais regardés.
  function resoudreCoupesAbstraites(saison, date, rng, exclureRencontreId) {
    const RMClub = global.RMClub;
    const coupes = saison.coupes;
    if (!coupes) return 0;
    const iso = RMClub.dateISO(date);
    const idJoueur = saison.clubJoueur.id;
    let resolues = 0;
    for (const cle of Object.keys(coupes)) {
      const coupe = coupes[cle];
      for (const r of rencontresCoupeDuJour(coupe, iso).slice()) {
        if (r.id === exclureRencontreId) continue;
        if (r.domicileId === idJoueur || r.exterieurId === idJoueur) continue;
        const a = coupe.clubs.find((c) => c.id === r.domicileId);
        const b = coupe.clubs.find((c) => c.id === r.exterieurId);
        const res = global.RMWorld.simulerResultatAbstrait(rng,
          (a && a.niveauClub) || 0.5, (b && b.niveauClub) || 0.5);
        enregistrerResultatCoupe(coupe, r.id, res.scoreA, res.scoreB);
        resolues++;
      }
    }
    return resolues;
  }

  function reinitialiserCoupes(saison) {
    saison.coupes = {};
    return saison.coupes;
  }

  // À QUELLE équipe une coupe s'adresse. La Coupe des Espoirs oppose des
  // ACADÉMIES (cf. genererCompetitionEspoirs) : le tableau inscrivait déjà le
  // club du joueur à un niveau dérivé de jeunes — 0,105 mesuré contre 0,300
  // pour son équipe première — mais l'interface faisait quand même jouer le
  // XV pro. Résultat mesuré (graine 4242) : 451 points de fatigue et 15 matchs
  // sur des joueurs de 26,6 ans de moyenne face à une académie de 17 ans,
  // pendant que les espoirs ne jouaient jamais leur propre coupe.
  //
  // Source UNIQUE de cette règle : personne ne redécide ailleurs.
  const EQUIPE_PAR_COUPE = { espoirs: 'jeunes' };
  function equipePourCoupe(cle) {
    return EQUIPE_PAR_COUPE[cle] || 'pro';
  }

  // Toutes les conséquences d'un match de coupe DISPUTÉ par le joueur, dans
  // l'ordre exact où elles doivent s'appliquer. Cette chaîne vivait dans le
  // callback `onResultat` de l'interface : elle n'y avait rien à faire — pas
  // une ligne de DOM, mais l'enregistrement du résultat, la résolution du
  // reste du tour, la fatigue, le moral et le message du fil d'actualité.
  //
  // L'ordre n'est pas décoratif : `enregistrerResultatCoupe` désigne le
  // vainqueur, donc il doit précéder la lecture de `vainqueurId` qui décide
  // du moral et du texte. Les autres rencontres du tour se résolvent ensuite,
  // avec leur propre générateur — jamais celui du match du joueur.
  //
  // Aucune dépendance au DOM : l'interface ne garde que l'affichage.
  function appliquerConsequencesMatchCoupe(saison, params) {
    const RMClub = global.RMClub;
    const p = params || {};
    const c = saison.clubJoueur;
    const etat = p.etat;
    const lettre = p.lettreJoueur;
    const rencontre = p.rencontre;
    // L'équipe qui vient de jouer — le premier XV pour les coupes des grands,
    // les espoirs pour la leur (cf. equipePourCoupe).
    const equipe = p.equipe || 'pro';
    const effectif = RMClub.effectifPourEquipe(saison, equipe);

    enregistrerResultatCoupe(p.coupe, rencontre.id, etat.score.A, etat.score.B);
    // Les autres rencontres du même tour, en arrière-plan.
    resoudreCoupesAbstraites(saison, p.date, p.rngCoupes, rencontre.id);

    // Point d'entrée UNIQUE (P1-40) : fatigue + blessures + reprise, avec
    // le facteur préparateur, que la coupe et l'amical oubliaient.
    RMClub.appliquerEffetsMatch(saison, effectif, p.compositionUtilisee,
      p.rng, { equipe });
    const gagne = rencontre.vainqueurId === c.id;
    RMClub.appliquerMoral(effectif, p.compositionUtilisee, gagne ? 'v' : 'd');
    RMClub.accumulerStatsJoueurs(effectif, p.compositionUtilisee,
      etat.statsJoueurs && etat.statsJoueurs[lettre], equipe);

    const tourNom = p.coupe.tours[rencontre.tour].nom;
    const prolongation = rencontre.apresProlongation ? ' après prolongation' : '';
    const adversaireNom = (p.adversaire && p.adversaire.nom) || 'son adversaire';
    // Qui a joué doit se lire dans le message : sans ça, le manager croyait que
    // son équipe première venait de disputer un match d'académie.
    // « Tes espoirs » : la même voix que le championnat espoirs (cf.
    // simulerMatchEspoirs), et pas de « de AS Mesure » bancal.
    const nomEquipe = equipe === 'jeunes' ? 'Tes espoirs' : c.nom;
    const verbe = gagne
      ? (equipe === 'jeunes' ? 'éliminent' : 'élimine')
      : (equipe === 'jeunes' ? "s'inclinent face à" : "s'incline face à");
    const texte = gagne
      ? `Qualifié ! ${nomEquipe} ${verbe} ${adversaireNom} (${etat.score.A} - ${etat.score.B})${prolongation} en ${tourNom.toLowerCase()}.`
      : `Éliminé. ${nomEquipe} ${verbe} ${adversaireNom} (${etat.score.A} - ${etat.score.B})${prolongation} en ${tourNom.toLowerCase()}.`;
    RMClub.ajouterMessage(saison, 'match', p.coupe.nom, texte);

    // Compte rendu archivé (C4) — même chemin que le championnat.
    RMClub.archiverFeuilleDeMatch(saison, {
      cle: RMClub.cleFeuille('coupe:' + (p.coupe.cle || ''), rencontre.id),
      etat, date: p.coupe.tours[rencontre.tour].date || null,
      nomA: lettre === 'A' ? c.nom : adversaireNom,
      nomB: lettre === 'A' ? adversaireNom : c.nom,
      libelle: tourNom,
    });

    return { gagne, tourNom, message: texte };
  }

  // Le club ne peut PAS aligner l'équipe que cette coupe réclame (typiquement :
  // un centre de formation trop dégarni pour sortir quinze espoirs). La
  // rencontre se résout alors comme les autres du tour — formule abstraite sur
  // les niveaux RÉELS du tableau, jamais un forfait inventé qui bloquerait le
  // calendrier. Sans ça, le jour ne s'écoulait plus : l'interface refusait de
  // jouer, et personne ne résolvait la rencontre.
  function resoudreCoupeSansEquipe(saison, params) {
    const RMClub = global.RMClub;
    const p = params || {};
    const c = saison.clubJoueur;
    const rencontre = p.rencontre;
    const parId = {};
    for (const cl of (p.coupe.clubs || [])) parId[cl.id] = cl;
    const dom = parId[rencontre.domicileId] || { niveauClub: 0.5 };
    const ext = parId[rencontre.exterieurId] || { niveauClub: 0.5 };
    const res = global.RMWorld.simulerResultatAbstrait(p.rng,
      dom.niveauClub || 0.5, ext.niveauClub || 0.5);
    enregistrerResultatCoupe(p.coupe, rencontre.id, res.scoreA, res.scoreB);
    resoudreCoupesAbstraites(saison, p.date, p.rngCoupes, rencontre.id);

    const gagne = rencontre.vainqueurId === c.id;
    const tourNom = p.coupe.tours[rencontre.tour].nom;
    const adversaireNom = (p.adversaire && p.adversaire.nom) || 'son adversaire';
    const texte = `Faute d'un XV alignable, ${c.nom} n'a pas pu présenter d'équipe`
      + ` face à ${adversaireNom} en ${tourNom.toLowerCase()} : la rencontre a été jouée sans toi`
      + ` (${res.scoreA} - ${res.scoreB}). ${gagne ? 'Le tableau continue.' : 'Le parcours s\'arrête là.'}`;
    RMClub.ajouterMessage(saison, 'match', p.coupe.nom, texte);
    return { gagne, tourNom, message: texte, score: { A: res.scoreA, B: res.scoreB } };
  }

  // Parcours du club du joueur dans CHAQUE coupe de la saison qui s'achève :
  // le tour où il s'est arrêté, et le vainqueur si la finale a été jouée.
  // Appelé par avancerSaison AVANT reinitialiserCoupes — les tableaux sont
  // donc encore intacts. Rien n'est déduit : le tour vient de la dernière
  // rencontre réellement disputée par le club.
  function palmaresCoupesDeLaSaison(saison) {
    const RMClub = global.RMClub;
    const idJoueur = saison.clubJoueur.id;
    const resultat = [];
    for (const cle of Object.keys(saison.coupes || {})) {
      const coupe = saison.coupes[cle];
      if (!coupe || !coupe.tours || !coupe.tours.length) continue;
      const engage = (coupe.clubs || []).some((c) => c.id === idJoueur);
      if (!engage) continue;
      let dernierTour = null, elimine = false;
      for (const tour of coupe.tours) {
        for (const r of (tour.rencontres || [])) {
          if (!r.joue) continue;
          if (r.domicileId !== idJoueur && r.exterieurId !== idJoueur) continue;
          dernierTour = tour.nom;
          elimine = r.vainqueurId !== idJoueur;
        }
      }
      const vainqueurId = vainqueurCoupe(coupe);
      const vainqueur = vainqueurId
        ? (coupe.clubs.find((c) => c.id === vainqueurId) || {}).nom || null : null;
      resultat.push({
        cle, nom: coupe.nom,
        equipe: equipePourCoupe(cle),
        tourAtteint: dernierTour,
        elimine,
        gagnee: vainqueurId === idJoueur,
        vainqueur,
      });
    }
    return resultat;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    genererCoupe, enregistrerResultatCoupe, vainqueurCoupe, assurerCoupes,
    palmaresCoupesDeLaSaison,
    reinitialiserCoupes, rencontreCoupeDuJoueur, resoudreCoupesAbstraites,
    appliquerConsequencesMatchCoupe, equipePourCoupe, resoudreCoupeSansEquipe,
  });
})(window);
