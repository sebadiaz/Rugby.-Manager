// Semaine d'entraînement (Mode Club) — une activité par jour, avec des
// effets RÉELS et différenciés joueur par joueur.
//
// Avant : un unique « programme collectif » s'appliquait une fois par match,
// à tout l'effectif, de la même façon — un joueur de 19 ans très en dessous
// de son potentiel progressait exactement comme un cadre de 30 ans frais ou
// épuisé. Depuis la carrière quotidienne (TODO_AUDIT.md P1-21/P1-22), chaque
// jour peut porter sa propre séance, et c'est ce module qui décide de ses
// conséquences.
//
// Ce qui rend la semaine intéressante à composer, c'est l'ARBITRAGE : une
// séance intense fait progresser mais fatigue, le repos rafraîchit mais ne
// développe rien. Il n'existe donc pas de semaine optimale universelle — elle
// dépend du calendrier, de l'état de l'effectif et du moment de la saison.
//
// Aucune dépendance au DOM, aucun `Math.random` : le rng est fourni par
// l'appelant (dérivé de la graine de la saison et de la date).
(function (global) {
  'use strict';

  // `intensite` : coût de fatigue de la séance (0 = aucun).
  // `recuperation` : multiplicateur appliqué à la récupération quotidienne
  //   (1 = récupération normale, >1 = séance qui régénère réellement).
  // `attributs` : ce que la séance développe RÉELLEMENT (les valeurs de la
  //   fiche joueur bougent), `postes` : qui est concerné (null = tout le monde).
  const ACTIVITES_ENTRAINEMENT = {
    repos: {
      label: 'Repos', icone: '😴',
      description: 'Journée off. Aucune progression, mais la récupération est maximale.',
      attributs: [], postes: null, intensite: 0, recuperation: 2.2,
    },
    recuperation: {
      label: 'Récupération', icone: '🧊',
      description: 'Séance légère (soins, décrassage). Progression nulle, récupération renforcée.',
      attributs: [], postes: null, intensite: 0, recuperation: 1.6,
    },
    physique: {
      label: 'Physique', icone: '🏋️',
      description: "Développe puissance et endurance de tout l'effectif.",
      attributs: ['puissance', 'endurance'], postes: null, intensite: 6, recuperation: 0.4,
    },
    melee: {
      label: 'Mêlée', icone: '🐗',
      description: 'Renforce la poussée en mêlée des avants.',
      attributs: ['melee'], postes: ['P', 'T', '2L', '3L'], intensite: 5, recuperation: 0.6,
    },
    touche: {
      label: 'Touche', icone: '🙌',
      description: 'Travaille la conquête en touche (sauteurs et soutiens).',
      attributs: ['touche'], postes: ['2L', '3L', 'T'], intensite: 4, recuperation: 0.7,
    },
    defense: {
      label: 'Défense', icone: '🛡️',
      description: 'Plaquage et discipline défensive, pour tout le groupe.',
      attributs: ['plaquage', 'discipline'], postes: null, intensite: 5, recuperation: 0.6,
    },
    attaque: {
      label: 'Attaque', icone: '⚡',
      description: 'Jeu de main : passe et prise de décision au contact.',
      attributs: ['passe', 'decision'], postes: ['DM', 'OV', 'CE', 'AI', 'AR'], intensite: 4, recuperation: 0.7,
    },
    pied: {
      label: 'Jeu au pied', icone: '🎯',
      description: 'Précision au pied (buts et jeu courant).',
      attributs: ['jeuPied', 'adresse'], postes: ['DM', 'OV', 'AR'], intensite: 3, recuperation: 0.8,
    },
  };

  // Semaine par défaut, calée sur le calendrier réel du club (cf.
  // club-temps.js) : championnat le samedi, Équipe B le dimanche, espoirs le
  // mercredi. On récupère donc en début de semaine, on charge au milieu, on
  // relâche avant le match — comme une vraie semaine de club.
  // Index = jour de la semaine (0 = dimanche … 6 = samedi).
  const SEMAINE_PAR_DEFAUT = {
    0: 'repos', // dimanche — match Équipe B
    1: 'recuperation', // lundi — lendemain de match
    2: 'physique', // mardi
    3: 'defense', // mercredi
    4: 'attaque', // jeudi
    5: 'recuperation', // vendredi — veille de match, on relâche
    6: 'repos', // samedi — jour de match
  };

  // Rétrocompatible : une sauvegarde antérieure n'a pas de semaine. On la
  // construit à partir du programme collectif qu'elle portait déjà
  // (`entrainementFocus`), pour que le choix historique du joueur ne soit pas
  // perdu — il devient la séance des deux jours de charge de la semaine.
  const CORRESPONDANCE_ANCIEN_FOCUS = {
    physique: 'physique', melee: 'melee', touche: 'touche',
    main: 'attaque', pied: 'pied', discipline: 'defense',
  };

  function assurerSemaineEntrainement(saison) {
    const c = saison.clubJoueur;
    if (!c.semaineEntrainement || typeof c.semaineEntrainement !== 'object') {
      const semaine = Object.assign({}, SEMAINE_PAR_DEFAUT);
      const ancien = CORRESPONDANCE_ANCIEN_FOCUS[c.entrainementFocus];
      if (ancien) { semaine[2] = ancien; semaine[4] = ancien; }
      c.semaineEntrainement = semaine;
    }
    // Une clé inconnue (sauvegarde bricolée, activité retirée) retombe sur le
    // défaut plutôt que de faire disparaître la séance.
    for (let jour = 0; jour <= 6; jour++) {
      if (!ACTIVITES_ENTRAINEMENT[c.semaineEntrainement[jour]]) c.semaineEntrainement[jour] = SEMAINE_PAR_DEFAUT[jour];
    }
    return c.semaineEntrainement;
  }

  function definirSeance(saison, jourSemaine, activite) {
    const semaine = assurerSemaineEntrainement(saison);
    if (!ACTIVITES_ENTRAINEMENT[activite]) return semaine;
    if (!(jourSemaine >= 0 && jourSemaine <= 6)) return semaine;
    semaine[jourSemaine] = activite;
    return semaine;
  }

  // Séance prévue à une date donnée. Un jour de match du premier XV n'a PAS
  // de séance : le match EST la charge du jour (il applique déjà la sienne,
  // cf. appliquerFatigue) — y ajouter un entraînement compterait deux fois.
  function seancePourDate(saison, date) {
    const RMClub = global.RMClub;
    const semaine = assurerSemaineEntrainement(saison);
    if (RMClub.typeDArret(saison, date) === 'pro') return null;
    return semaine[RMClub.jourSemaine(date)] || null;
  }

  // --- Effets différenciés ------------------------------------------------
  // Deux joueurs ne progressent JAMAIS de la même façon : l'âge, la marge qui
  // reste jusqu'au potentiel, la fatigue du jour, le temps de jeu réel et la
  // qualité de l'entraîneur pèsent tous, et se combinent.
  function facteurAge(age) {
    if (age >= 32) return 0; // plus de développement, seulement de l'entretien
    if (age <= 21) return 1.5; // les jeunes emmagasinent vite
    if (age <= 25) return 1.2;
    if (age <= 29) return 1;
    return 0.6;
  }
  function facteurFatigue(fatigue) {
    const f = fatigue || 0;
    if (f >= 80) return 0.25; // un joueur cuit ne retient rien de la séance
    if (f >= 60) return 0.6;
    if (f >= 40) return 0.85;
    return 1;
  }
  // Le temps de jeu RÉEL compte : un joueur qui enchaîne les matchs progresse
  // plus vite qu'un joueur qui ne joue jamais, même à l'entraînement.
  function facteurTempsDeJeu(matchsJoues) {
    const m = matchsJoues || 0;
    if (m >= 8) return 1.25;
    if (m >= 3) return 1.1;
    if (m >= 1) return 1;
    return 0.8;
  }

  const CHANCE_BASE_PROGRESSION = 0.16;

  // Applique la séance du jour à UN effectif. Retourne la liste des
  // progressions RÉELLEMENT survenues — jamais un effet annoncé sans
  // changement de valeur derrière.
  function appliquerSeance(rng, effectif, cleActivite, facteurEntraineur, facteurPreparateur) {
    const activite = ACTIVITES_ENTRAINEMENT[cleActivite];
    if (!activite) return [];
    const fe = facteurEntraineur != null ? facteurEntraineur : 1;
    const fp = facteurPreparateur != null ? facteurPreparateur : 1;
    const progressions = [];
    for (const j of effectif) {
      // Un blessé ne s'entraîne pas : il se soigne (cf. club-evenements.js).
      if (j.blessureJournees > 0) continue;
      // Charge de la séance : elle fatigue RÉELLEMENT, y compris ceux qui
      // n'en tirent aucune progression (un pilier court aussi au physique).
      if (activite.intensite > 0) {
        const endurance = j.endurance != null ? j.endurance : 60;
        const resistance = Math.max(0.6, Math.min(1.5, 1 + (60 - endurance) / 90));
        j.fatigue = Math.min(100, (j.fatigue || 0) + Math.round(activite.intensite * resistance * fp));
      }
      if (!activite.attributs.length) continue;
      if (activite.postes && activite.postes.indexOf(j.poste) === -1) continue;
      if (j.veutPartir) continue; // un joueur qui veut partir ne se donne plus
      const chance = CHANCE_BASE_PROGRESSION * fe
        * facteurAge(j.age)
        * facteurFatigue(j.fatigue)
        * facteurTempsDeJeu(j.matchsJoues);
      if (chance <= 0 || rng() >= chance) continue;
      const potentiel = j.potentiel != null ? j.potentiel : 70;
      const gagnes = [];
      for (const attr of activite.attributs) {
        const actuel = j[attr] != null ? j[attr] : 60;
        if (actuel >= potentiel) continue; // jamais au-delà du potentiel individuel
        j[attr] = Math.min(potentiel, actuel + 1);
        gagnes.push(attr);
      }
      if (gagnes.length) progressions.push({ id: j.id, nom: j.nom, attributs: gagnes, activite: cleActivite });
    }
    return progressions;
  }

  // --- Blessures à l'entraînement (TODO_AUDIT.md P1-26) ---
  // Jusqu'ici, SEUL un match pouvait blesser (cf. faireProgresserBlessures,
  // appelé une fois le match résolu). Une semaine d'entraînement n'avait donc
  // aucun risque : choisir « physique » tous les jours ne coûtait que de la
  // fatigue, jamais un joueur. C'est ce qui donne enfin un vrai prix à une
  // semaine intense — et la seule chose qui pouvait réellement survenir
  // entre deux matchs.
  //
  // Le risque suit deux choses réelles : l'INTENSITÉ de la séance (le repos
  // et la récupération ne blessent jamais) et la FATIGUE du joueur (un
  // effectif épuisé qu'on pousse quand même se blesse trois fois plus). Le
  // préparateur physique réduit réellement ce risque.
  // Calibré pour rester nettement sous le risque d'un match : un effectif de
  // 24 encaisse de l'ordre de 5 à 10 blessures d'entraînement sur une saison
  // complète, contre une vingtaine côté matchs (15 titulaires, 6 % par match).
  // L'entraînement doit peser sur les choix du manager, pas décimer le groupe.
  const RISQUE_BLESSURE_PAR_INTENSITE = 0.00037;

  function blessuresDeSeance(rng, effectif, cleActivite, facteurPreparateur, facteurMedecin, saison) {
    const activite = ACTIVITES_ENTRAINEMENT[cleActivite];
    if (!activite || activite.intensite <= 0) return [];
    const fp = facteurPreparateur != null ? facteurPreparateur : 1;
    const fm = facteurMedecin != null ? facteurMedecin : 1;
    const blesses = [];
    const RMClub = global.RMClub;
    for (const j of effectif) {
      if (j.blessure) continue; // déjà à l'infirmerie
      if (j.pret) continue; // prêté ailleurs : il s'entraîne dans son club d'accueil
      // Le risque de séance passe désormais par le MÊME modèle que les
      // blessures de match (TODO_AUDIT.md P1-40) : poste, âge, fatigue et
      // antécédents comptent ici aussi. L'intensité de la séance module la
      // base, comme avant — une séance de repos ne blesse jamais.
      // La base reste EXACTEMENT celle calibrée en P1-26 (7 à 10 blessures
      // d'entraînement par saison, mesuré) : le modèle P1-40 n'ajoute que la
      // modulation par poste, âge et antécédents, il ne relève pas le niveau
      // général. La fatigue, elle, est désormais portée par risqueBlessure.
      const base = RISQUE_BLESSURE_PAR_INTENSITE * activite.intensite;
      if (!RMClub.tirerBlessure(rng, j, {
        // `saison` : le niveau du centre médical (P1-44) doit peser sur le
        // TIRAGE, sinon son effet ne serait qu'un chiffre affiché.
        cause: 'entrainement', risqueBase: base, facteurPreparateur: fp, saison,
      })) continue;
      const b = RMClub.infligerBlessure(saison, j, 'entrainement', rng, {
        facteurMedecin: fm, facteurPreparateur: fp,
      });
      blesses.push({ id: j.id, nom: j.nom, jours: RMClub.joursIndisponible(j),
        activite: cleActivite, libelle: b.libelle, zone: b.zone, gravite: b.gravite });
    }
    return blesses;
  }

  // Un joueur peut suivre un programme individuel : il travaille alors SON
  // activité au lieu de celle du jour (sauf les jours de repos, qui restent
  // du repos pour tout le monde). Regroupe l'effectif par activité effective.
  function repartirParActivite(effectif, cleActiviteDuJour) {
    const groupes = {};
    const activiteDuJour = ACTIVITES_ENTRAINEMENT[cleActiviteDuJour];
    const jourSansCharge = activiteDuJour && !activiteDuJour.attributs.length;
    for (const j of effectif) {
      const individuel = j.entrainementIndividuel;
      const cle = (!jourSansCharge && individuel && ACTIVITES_ENTRAINEMENT[individuel]) ? individuel : cleActiviteDuJour;
      (groupes[cle] = groupes[cle] || []).push(j);
    }
    return groupes;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    ACTIVITES_ENTRAINEMENT, SEMAINE_PAR_DEFAUT, CORRESPONDANCE_ANCIEN_FOCUS,
    assurerSemaineEntrainement, definirSeance, seancePourDate,
    facteurAge, facteurFatigue, facteurTempsDeJeu, CHANCE_BASE_PROGRESSION,
    appliquerSeance, repartirParActivite,
    RISQUE_BLESSURE_PAR_INTENSITE, blessuresDeSeance,
  });
})(window);
