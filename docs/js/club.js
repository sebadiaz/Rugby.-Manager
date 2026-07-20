// Mode Club : modèle de données pour gérer un club fictif à travers plusieurs
// saisons (effectif étendu, contrats, finances, marché des transferts,
// blessures, calendrier, classement), au-dessus du même moteur de match
// (engine/rugby-engine.js) que le mode « Match rapide ». Aucune règle de jeu
// ici — uniquement gestion de club et sa persistance (localStorage), séparées
// du rendu (cf. docs/js/clubUI.js).
(function (global) {
  'use strict';

  const { DEFAULT_CONFIG } = global.RugbyEngine;
  const CLE_CLUB = 'rugbyManager.club.v1';
  // Incrémenté à chaque changement de forme des données sauvegardées : une
  // sauvegarde d'une version différente est ignorée (repart à zéro) plutôt que
  // de faire planter le jeu sur des champs manquants.
  const VERSION_SAUVEGARDE = 2;

  // --- Génération de noms (club fictif, aucune référence à un club/joueur réel) ---
  const PRENOMS = ['Thomas', 'Lucas', 'Hugo', 'Louis', 'Jules', 'Nathan', 'Enzo', 'Léo',
    'Mathis', 'Gabriel', 'Raphaël', 'Arthur', 'Noah', 'Tom', 'Ethan', 'Clément',
    'Antoine', 'Baptiste', 'Maxime', 'Romain', 'Kevin', 'Alexandre', 'Julien', 'Paul'];
  const NOMS = ['Girard', 'Bernard', 'Dubois', 'Moreau', 'Lefèvre', 'Simon', 'Laurent',
    'Michel', 'Garcia', 'Roux', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier',
    'Blanc', 'Guerin', 'Boyer', 'Fontaine', 'Chevalier', 'François', 'Legrand', 'Gauthier', 'Perrin'];
  const NOMS_CLUB = ['Aiglons', 'Béliers', 'Ours', 'Loups', 'Faucons', 'Taureaux',
    'Lions', 'Sangliers', 'Étoiles', 'Dragons', 'Chamois', 'Guerriers'];
  const VILLES = ['Vallouse', 'Roquebrune', 'Montorel', 'Castelnau', 'Bellerive',
    'Fontclair', 'Hautecombe', 'Riverange', 'Solerac', 'Bourgnac', 'Aiglemont', 'Valfleur'];
  const COULEURS = ['#1565c0', '#c62828', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#ef6c00', '#37474f'];

  function choisir(rng, liste) { return liste[Math.floor(rng() * liste.length)]; }

  function genererNomJoueur(rng) {
    return `${choisir(rng, PRENOMS)} ${choisir(rng, NOMS)}`;
  }

  function genererNomClub(rng) {
    return `${choisir(rng, VILLES)} ${choisir(rng, NOMS_CLUB)}`;
  }

  // --- Postes : quel numéro de maillot exige quelle catégorie de poste ---
  const POSTE_REQUIS = {
    1: 'P', 2: 'T', 3: 'P', 4: '2L', 5: '2L', 6: '3L', 7: '3L', 8: '3L',
    9: 'DM', 10: 'OV', 11: 'AI', 12: 'CE', 13: 'CE', 14: 'AI', 15: 'AR',
  };
  // Gabarit de l'effectif étendu du club du joueur (24 joueurs, avec
  // profondeur à chaque poste) — dérivé de la répartition réelle d'une feuille
  // de match à XV plus quelques remplaçants par ligne.
  const GABARIT_EFFECTIF = [
    'P', 'P', 'P', 'T', 'T', '2L', '2L', '2L', '3L', '3L', '3L', '3L',
    'DM', 'DM', 'OV', 'OV', 'CE', 'CE', 'CE', 'AI', 'AI', 'AI', 'AR', 'AR',
  ];
  const TAILLE_EFFECTIF_CIBLE = GABARIT_EFFECTIF.length;

  // Archétype de base (vitesse/plaquage/tendance/couloir) par CATÉGORIE de
  // poste, dérivé de DEFAULT_CONFIG.joueurs (même baseline que le moteur) : on
  // prend le premier numéro rencontré pour chaque poste comme représentant.
  const ARCHETYPE_PAR_POSTE = {};
  for (const n of Object.keys(DEFAULT_CONFIG.joueurs)) {
    const j = DEFAULT_CONFIG.joueurs[n];
    if (!ARCHETYPE_PAR_POSTE[j.poste]) ARCHETYPE_PAR_POSTE[j.poste] = j;
  }

  let compteurJoueurId = 1;
  function borneStat(v) { return Math.max(30, Math.min(95, Math.round(v))); }
  // Adresse/attributs de profondeur : plage plus large que vitesse/plaquage
  // (un avant peut être un très mauvais buteur ou passeur, 10-20) — cf.
  // engine/rugby-engine.js (probaReussiteTir, forceMelee, forceTouche...).
  function borneAdresse(v) { return Math.max(10, Math.min(95, Math.round(v))); }
  const borneCompetence = borneAdresse;

  // Attributs de profondeur générés pour un joueur (0-100 chacun), dérivés de
  // l'archétype de poste (`base`, cf. ARCHETYPE_PAR_POSTE/DEFAULT_CONFIG.joueurs
  // — donc réellement différenciés avant/trois-quarts) + le niveau du club et
  // du bruit individuel, EXACTEMENT comme vitesse/plaquage/adresse ci-dessus.
  // Chacun a un effet réel et distinct dans engine/rugby-engine.js.
  function genererAttributsProfondeur(base, ecartNiveau, rng) {
    const bruit = () => (rng() * 12 - 6);
    const dep = (champ, defaut) => (base[champ] != null ? base[champ] : defaut);
    return {
      melee: borneCompetence(dep('melee', 40) + ecartNiveau * 0.6 + bruit()),
      touche: borneCompetence(dep('touche', 40) + ecartNiveau * 0.6 + bruit()),
      puissance: borneCompetence(dep('puissance', 55) + ecartNiveau * 0.7 + bruit()),
      endurance: borneCompetence(dep('endurance', 65) + ecartNiveau * 0.4 + bruit()),
      passe: borneCompetence(dep('passe', 50) + ecartNiveau * 0.6 + bruit()),
      jeuPied: borneCompetence(dep('jeuPied', 30) + ecartNiveau * 0.5 + bruit()),
      decision: borneCompetence(dep('decision', 55) + ecartNiveau * 0.6 + bruit()),
      discipline: borneCompetence(dep('discipline', 55) + ecartNiveau * 0.4 + bruit()),
    };
  }

  // Potentiel (0-99) : plafond de progression pour l'entraînement/le
  // vieillissement (cf. appliquerEntrainement/avancerSaison) — un jeune joueur
  // a une marge de progression réelle au-dessus de son niveau actuel, un
  // joueur déjà mûr est proche de son potentiel (plus rien à développer).
  function genererPotentiel(niveauActuel, age, rng) {
    const margeJeunesse = Math.max(0, 25 - age) * (0.9 + rng() * 1.6);
    // Math.round appliqué APRÈS le plafond/plancher (pas avant) : sinon
    // Math.max(niveauActuel, ...) pouvait renvoyer niveauActuel tel quel
    // (une moyenne d'attributs, donc pas forcément entière) quand il
    // dépassait l'estimation arrondie — potentiel affiché en fiche joueur
    // avec des décimales (ex. 54.285714285714285) au lieu d'un entier.
    return Math.round(Math.max(niveauActuel, Math.min(99, niveauActuel + margeJeunesse)));
  }

  // Attributs suivis pour la progression affichée en fiche joueur (cf.
  // snapshotAttributsDebutSaison/calculerProgression) — le même ensemble que
  // le vieillissement de fin de saison, pour rester cohérent.
  const ATTRIBUTS_PROGRESSION = ['vitesse', 'plaquage', 'melee', 'touche', 'puissance', 'endurance', 'passe', 'jeuPied', 'decision'];
  // Instantané RÉEL des attributs d'un joueur au début de la saison en cours —
  // sert uniquement à afficher une progression honnête (delta réel), jamais
  // à modifier le jeu. Pris une fois (nouvelleSaison/avancerSaison), jamais
  // recalculé en cours de saison.
  function snapshotAttributsDebutSaison(effectif) {
    for (const j of effectif) {
      const snap = {};
      for (const attr of ATTRIBUTS_PROGRESSION) if (j[attr] != null) snap[attr] = j[attr];
      j.attributsDebutSaison = snap;
    }
  }
  // Delta réel (actuel - début de saison) pour chaque attribut suivi — vide
  // si aucun instantané n'existe encore (ancienne sauvegarde).
  function calculerProgression(joueur) {
    const debut = joueur.attributsDebutSaison;
    if (!debut) return [];
    return ATTRIBUTS_PROGRESSION
      .filter((attr) => debut[attr] != null && joueur[attr] != null && joueur[attr] !== debut[attr])
      .map((attr) => ({ attr, avant: debut[attr], apres: joueur[attr], delta: joueur[attr] - debut[attr] }));
  }

  // Salaire annuel (k€, fictif) : proportionnel au niveau, avec une prime pour
  // les joueurs en pleine maturité (25-29 ans) — jeunes espoirs et joueurs
  // vieillissants coûtent moins cher, comme un vrai marché.
  function calculerSalaire(vitesse, plaquage, age) {
    const niveau = (vitesse + plaquage) / 2;
    const primeAge = (age >= 25 && age <= 29) ? 1.15 : (age <= 21 || age >= 33) ? 0.75 : 1;
    // Calibré pour qu'une masse salariale de 24 joueurs (~500-700 k€/saison,
    // donc ~50-70 k€/journée) reste du même ordre de grandeur que la recette
    // d'un match (cf. appliquerFinancesMatch) — sinon le club fait faillite
    // dès le premier match, quel que soit le résultat.
    return Math.round(niveau * 0.45 * primeAge);
  }

  // Génère un joueur pour une CATÉGORIE de poste (effectif étendu, club du
  // joueur) — pas de numéro fixe : c'est la composition du jour qui choisit
  // qui porte quel maillot (cf. meilleureComposition).
  function genererJoueurEtendu(poste, rng, niveauClub) {
    const base = ARCHETYPE_PAR_POSTE[poste];
    const ecartNiveau = (niveauClub - 0.5) * 20;
    const bruit = () => (rng() * 12 - 6);
    const age = 18 + Math.floor(rng() * 17);
    const vitesse = borneStat(base.vitesse + ecartNiveau + bruit());
    const plaquage = borneStat(base.plaquage + ecartNiveau + bruit());
    const adresse = borneAdresse((base.adresse != null ? base.adresse : 30) + ecartNiveau * 0.5 + bruit());
    const attributs = genererAttributsProfondeur(base, ecartNiveau, rng);
    const niveauActuel = (vitesse + plaquage + attributs.melee + attributs.touche
      + attributs.puissance + attributs.passe + attributs.jeuPied) / 7;
    return {
      id: 'j' + compteurJoueurId++,
      nom: genererNomJoueur(rng),
      poste, age, vitesse, plaquage, adresse,
      melee: attributs.melee, touche: attributs.touche, puissance: attributs.puissance,
      endurance: attributs.endurance, passe: attributs.passe, jeuPied: attributs.jeuPied,
      decision: attributs.decision, discipline: attributs.discipline,
      potentiel: genererPotentiel(niveauActuel, age, rng),
      tendance: base.tendance, couloir: base.couloir,
      contrat: 1 + Math.floor(rng() * 4), // saisons restantes (1-4)
      salaire: calculerSalaire(vitesse, plaquage, age),
      blessureJournees: 0, // >0 = indisponible pour ce nombre de journées
      fatigue: 0, // 0-100, cf. appliquerFatigue — répercutée sur les stats effectives en match
      moral: 60 + Math.round(rng() * 10), // 0-100, cf. appliquerMoral — répercuté sur les stats effectives en match
      pret: null, // {dureeRestante} : joueur prêté, indisponible pour la sélection (cf. preterJoueur)
      matchsJoues: 0, // compteur RÉEL de titularisations cette saison (fiche joueur)
      statsSaison: null, // cf. accumulerStatsJoueurs — jamais fabriqué, alimenté match après match
      attributsDebutSaison: null, // snapshot RÉEL (cf. snapshotAttributsDebutSaison) pour la progression affichée en fiche joueur
      entrainementIndividuel: null, // cf. appliquerEntrainement — remplace le programme collectif pour CE joueur si défini
    };
  }

  function genererEffectifEtendu(rng, niveauClub) {
    return GABARIT_EFFECTIF.map((poste) => genererJoueurEtendu(poste, rng, niveauClub));
  }

  // Génère un joueur d'effectif pour le numéro donné (club ADVERSAIRE, IA) :
  // toujours un effectif prêt à jouer de 15, sans gestion (pas de profondeur,
  // pas de contrats/finances) — seul le club du joueur est géré en détail.
  function genererJoueur(numero, rng, niveauClub) {
    const base = DEFAULT_CONFIG.joueurs[numero];
    const ecartNiveau = (niveauClub - 0.5) * 20;
    const bruit = () => (rng() * 12 - 6);
    const attributs = genererAttributsProfondeur(base, ecartNiveau, rng);
    return {
      numero,
      nom: genererNomJoueur(rng),
      poste: base.poste,
      age: 18 + Math.floor(rng() * 17),
      vitesse: borneStat(base.vitesse + ecartNiveau + bruit()),
      plaquage: borneStat(base.plaquage + ecartNiveau + bruit()),
      adresse: borneAdresse((base.adresse != null ? base.adresse : 30) + ecartNiveau * 0.5 + bruit()),
      melee: attributs.melee, touche: attributs.touche, puissance: attributs.puissance,
      endurance: attributs.endurance, passe: attributs.passe, jeuPied: attributs.jeuPied,
      decision: attributs.decision, discipline: attributs.discipline,
      tendance: base.tendance,
      couloir: base.couloir,
    };
  }

  function genererEffectif(rng, niveauClub) {
    const effectif = [];
    for (let n = 1; n <= 15; n++) effectif.push(genererJoueur(n, rng, niveauClub));
    return effectif;
  }

  let compteurId = 1;
  function genererClub(rng, { nom, niveauClub = 0.5 } = {}) {
    return {
      id: 'club' + (compteurId++),
      nom: nom || genererNomClub(rng),
      couleur: choisir(rng, COULEURS),
      niveauClub,
      effectif: genererEffectif(rng, niveauClub),
    };
  }

  // Budget de départ (k€, fictif) : les clubs plus huppés démarrent avec plus
  // de moyens — cohérent avec le niveauClub qui pilote déjà leur force sportive.
  function budgetInitial(niveauClub, rng) {
    return Math.round(150 + niveauClub * 500 + rng() * 100);
  }

  // Club du joueur : effectif ÉTENDU (24, avec profondeur) + budget + tactique.
  // C'est le seul club géré en détail (composition, transferts, finances,
  // tactique) — les adversaires (IA) restent un effectif de 15 prêt à jouer,
  // avec les réglages d'attaque/défense par défaut du moteur.
  function genererClubJoueur(rng, { nom, niveauClub = 0.5 } = {}) {
    return {
      id: 'club' + (compteurId++),
      nom: nom || genererNomClub(rng),
      couleur: choisir(rng, COULEURS),
      niveauClub,
      effectif: genererEffectifEtendu(rng, niveauClub),
      budget: budgetInitial(niveauClub, rng),
      // Sponsor : revenu récurrent réel par match (cf. appliquerFinancesMatch).
      // Personnel : organigramme vide au départ, à recruter sur marchePersonnel.
      sponsor: genererSponsor(rng, niveauClub),
      personnel: [],
      tactique: { style: 'equilibre', avants: 'equilibre', rythme: 'normal', ligneDef: 'normale', pied: 'normal', toucheMaul: 'equilibre' },
      // Historique financier (derniers mouvements, pour l'onglet Finances) et
      // statistiques cumulées de la saison (pour l'onglet Statistiques) — vides
      // au départ, alimentés au fil des matchs joués par le club du joueur.
      historiqueFinances: [],
      statsCumulees: null,
      // Composition du jour (titulaires 1-15 + banc 16-23, numéro -> id joueur)
      // et encadrement (capitaine, buteur, lanceur en touche) : null tant que
      // rien n'a été composé, complété/désigné automatiquement à la demande
      // (cf. completerComposition/autoDesignerEncadrement) — persistés dans la
      // saison pour survivre à un rechargement de page.
      compositionTitulaires: null,
      compositionBanc: null,
      capitaineId: null,
      buteurId: null,
      lanceurToucheId: null,
      // Programme d'entraînement choisi (cf. ENTRAINEMENTS) — 'physique' par
      // défaut (bénéficie à tout l'effectif), appliqué à chaque journée jouée.
      entrainementFocus: 'physique',
      // Historique RÉEL de fin de saison (classement, bilan, essais, budget) —
      // alimenté à chaque avancerSaison, jamais recalculé après coup. Sert
      // l'écran Bilan ("évolution sur plusieurs saisons").
      historiqueSaisons: [],
    };
  }

  // Champs conservés dans les statistiques cumulées de la saison — un
  // sous-ensemble lisible des stats de match (cf. state.stats côté moteur),
  // jamais inventé : toujours la somme d'actions réellement produites.
  const CHAMPS_STATS_CUMULEES = [
    'essais', 'passes', 'passesTentees', 'metresGagnes',
    'tacklesMade', 'tacklesAttempted', 'turnovers', 'penalitesConcedees', 'kicks',
  ];
  function accumulerStats(club, statsMatch) {
    if (!club.statsCumulees) {
      club.statsCumulees = { matchsJoues: 0 };
      for (const champ of CHAMPS_STATS_CUMULEES) club.statsCumulees[champ] = 0;
    }
    club.statsCumulees.matchsJoues++;
    for (const champ of CHAMPS_STATS_CUMULEES) {
      club.statsCumulees[champ] += statsMatch[champ] || 0;
    }
  }

  // Accumule les stats RÉELLES d'un joueur (essais, passes, plaquages, mètres)
  // sur la saison — alimenté depuis etat.statsJoueurs[team][numero] du moteur
  // (cf. engine/rugby-engine.js _statJoueur) via la composition du jour
  // (numéro -> id), jamais déduit ou estimé après coup. Sert le classement
  // des marqueurs et la fiche joueur (cf. onglet Bilan).
  function accumulerStatsJoueurs(effectif, composition, statsJoueursMatch) {
    if (!statsJoueursMatch || !composition) return;
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    for (const numero of Object.keys(composition)) {
      const joueur = parId[composition[numero]];
      const s = statsJoueursMatch[numero];
      if (!joueur || !s) continue;
      if (!joueur.statsSaison) {
        joueur.statsSaison = { matchsJoues: 0, essais: 0, passes: 0, tacklesMade: 0, tacklesAttempted: 0, metresGagnes: 0 };
      }
      joueur.statsSaison.matchsJoues++;
      joueur.statsSaison.essais += s.essais || 0;
      joueur.statsSaison.passes += s.passes || 0;
      joueur.statsSaison.tacklesMade += s.tacklesMade || 0;
      joueur.statsSaison.tacklesAttempted += s.tacklesAttempted || 0;
      joueur.statsSaison.metresGagnes += s.metresGagnes || 0;
    }
  }

  // Classement des marqueurs (et, plus largement, meilleurs joueurs par
  // critère) de la saison en cours — trié directement depuis statsSaison,
  // jamais une liste inventée.
  function classementMarqueurs(effectif, limite) {
    return effectif.filter((j) => j.statsSaison && j.statsSaison.essais > 0)
      .sort((a, b) => b.statsSaison.essais - a.statsSaison.essais)
      .slice(0, limite || 10);
  }

  // Ajoute un mouvement au journal financier (borné aux 15 derniers, pour
  // l'onglet Finances) — appelé après appliquerFinancesMatch avec son résultat.
  function enregistrerMouvementFinances(club, journee, mouvement) {
    if (!club.historiqueFinances) club.historiqueFinances = [];
    club.historiqueFinances.push({
      journee, recette: mouvement.recette, revenuSponsor: mouvement.revenuSponsor || 0,
      salaires: mouvement.salaires, salairesPersonnel: mouvement.salairesPersonnel || 0,
      budgetApres: club.budget,
    });
    if (club.historiqueFinances.length > 15) club.historiqueFinances.shift();
  }

  // Tactique = 6 réglages INDÉPENDANTS qui se combinent (comme les
  // instructions d'équipe FM — on ne choisit pas un "template" figé, on
  // compose), CHACUN traduit en un réglage RÉEL et DISTINCT du moteur (cf.
  // engine/rugby-engine.js, cfgAttaque/cfgDefense/cfgMelee/cfgTouche/cfgRuck
  // PAR ÉQUIPE). `null` = valeur par défaut du moteur pour cet axe.
  const AXES_TACTIQUE = {
    style: {
      label: 'Largeur du jeu', defaut: 'equilibre',
      options: {
        sol: { nom: 'Jeu au sol', description: 'Reste près du regroupement, limite les prises de risque au large.', compromis: 'Plus sûr (moins de turnovers au large), mais avance moins vite contre une défense qui monte.', attaque: { jeuLargeTaux: { pression: 1.1, calme: 0.9 } } },
        equilibre: { nom: 'Équilibré', description: 'Ni resserré, ni systématiquement porté au large.', compromis: 'Réglage neutre du moteur — aucun compromis appliqué.', attaque: null },
        large: { nom: 'Jeu au large', description: 'Cherche l\'espace au large à chaque occasion.', compromis: 'Plus d\'essais possibles en bout de ligne, mais plus de passes = plus de risques d\'en-avant.', attaque: { jeuLargeTaux: { pression: 2.3, calme: 2.0 } } },
      },
    },
    avants: {
      label: 'Jeu d\'avants', defaut: 'equilibre',
      options: {
        proche: { nom: 'Près du ruck', description: 'Le n°8 privilégie le pick-and-go au près plutôt qu\'une sortie rapide aux trois-quarts.', compromis: 'Conserve mieux le ballon près du regroupement, mais le jeu avance plus lentement (moins de rythme).', melee: { pickAndGoHuit: { dominant: 0.6, normal: 0.22 } } },
        equilibre: { nom: 'Équilibré', description: 'Sortie de mêlée standard, décision au cas par cas.', compromis: 'Réglage neutre du moteur — aucun compromis appliqué.', melee: null },
        large: { nom: 'Ouvert aux 3/4', description: 'Sort vite le ballon aux trois-quarts, peu de pick-and-go.', compromis: 'Exploite mieux la vitesse des trois-quarts, mais moins de temps de jeu conservé par les avants.', melee: { pickAndGoHuit: { dominant: 0.15, normal: 0.05 } } },
      },
    },
    rythme: {
      label: 'Rythme du jeu', defaut: 'normal',
      options: {
        lent: { nom: 'Contrôlé', description: 'Rucks plus longs : on ralentit le jeu et on garde le contrôle du ballon.', compromis: 'Réduit les prises de risque et la fatigue défensive adverse monte lentement, mais laisse à la défense le temps de se replacer.', ruck: { profil: [[0.55, 2.0, 2.0], [0.33, 4.0, 4.0], [0.12, 8.0, 2.6]] } },
        normal: { nom: 'Normal', description: 'Rythme de recyclage standard.', compromis: 'Réglage neutre du moteur — aucun compromis appliqué.', ruck: null },
        rapide: { nom: 'Rapide', description: 'Ballon recyclé au plus vite pour prendre la défense de vitesse.', compromis: 'Plus de phases de jeu et une défense prise de vitesse, mais plus de rucks = plus d\'occasions de faute.', ruck: { profil: [[0.55, 1.0, 1.0], [0.33, 2.0, 2.0], [0.12, 4.0, 1.4]] } },
      },
    },
    pied: {
      label: 'Occupation au pied', defaut: 'normal',
      options: {
        rare: { nom: 'Rare', description: 'Privilégie la conservation du ballon en main.', compromis: 'Garde le ballon (plus de possession), mais occupe moins le camp adverse.', attaque: { tauxJeuAuPied: 0.5 } },
        normal: { nom: 'Normal', description: 'Fréquence de coups de pied standard.', compromis: 'Réglage neutre du moteur — aucun compromis appliqué.', attaque: null },
        frequent: { nom: 'Fréquent', description: 'Beaucoup de coups de pied pour occuper le camp adverse.', compromis: 'Gagne du terrain et de l\'occupation, mais cède la possession à chaque coup de pied.', attaque: { tauxJeuAuPied: 2.5 } },
      },
    },
    ligneDef: {
      label: 'Défense', defaut: 'normale',
      options: {
        basse: { nom: 'Basse', description: 'Défense prudente et repliée, moins de risques à la montée, reste groupée au ruck.', compromis: 'Réduit le risque d\'être percée dans le dos, mais laisse plus d\'espace/de temps à l\'attaque adverse.', defense: { rampeMontee: 3.5, profondeurArriereJeu: 22, profondeurArriereMelee: 24, reculRuck: 4.5 } },
        normale: { nom: 'Normale', description: 'Hauteur de ligne standard.', compromis: 'Réglage neutre du moteur — aucun compromis appliqué.', defense: null },
        haute: { nom: 'Haute', description: 'Presse haut et vite, y compris au ruck — plus risqué si elle est percée.', compromis: 'Étouffe l\'attaque adverse plus tôt, mais une brèche se transforme plus souvent en franchissement.', defense: { rampeMontee: 1.5, profondeurArriereJeu: 15, profondeurArriereMelee: 17, reculRuck: 2 } },
      },
    },
    toucheMaul: {
      label: 'Touche & maul', defaut: 'equilibre',
      options: {
        sol: { nom: 'Jeu au sol', description: 'Sort vite le ballon de touche, évite le maul.', compromis: 'Ballon disponible plus vite pour le jeu au large, mais renonce à l\'avancée physique du maul.', touche: { tauxMaul: { proche: 0.15, loin: 0.02 } } },
        equilibre: { nom: 'Équilibré', description: 'Maul selon l\'opportunité, comme la moyenne.', compromis: 'Réglage neutre du moteur — aucun compromis appliqué.', touche: null },
        maul: { nom: 'Conquête (maul)', description: 'Cherche systématiquement le maul après une touche gagnée en zone proche.', compromis: 'Très efficace près de la ligne adverse (essais de maul), mais expose à l\'écroulement/pénalité si le pack est dominé.', touche: { tauxMaul: { proche: 0.85, loin: 0.15 } } },
      },
    },
  };

  // Config moteur (attaque/défense/mêlée/touche PAR ÉQUIPE) résultant de la
  // COMBINAISON des 6 axes — `tactique` peut être partiel ou absent, chaque
  // axe retombe sur son défaut (comportement du moteur inchangé si rien
  // n'est choisi, et compatible avec une ancienne sauvegarde à 3 axes).
  function tactiqueVersConfig(tactique) {
    const defauts = {};
    for (const axe of Object.keys(AXES_TACTIQUE)) defauts[axe] = AXES_TACTIQUE[axe].defaut;
    const t = Object.assign(defauts, (tactique && typeof tactique === 'object') ? tactique : {});
    function option(axe) {
      return AXES_TACTIQUE[axe].options[t[axe]] || AXES_TACTIQUE[axe].options[AXES_TACTIQUE[axe].defaut];
    }
    const optStyle = option('style'), optAvants = option('avants'), optRythme = option('rythme'),
      optPied = option('pied'), optLigne = option('ligneDef'), optToucheMaul = option('toucheMaul');
    const attaque = Object.assign({}, optStyle.attaque || null, optPied.attaque || null);
    const cfg = {};
    if (Object.keys(attaque).length) cfg.attaque = attaque;
    if (optLigne.defense) cfg.defense = optLigne.defense;
    if (optAvants.melee) cfg.melee = optAvants.melee;
    if (optRythme.ruck) cfg.ruck = optRythme.ruck;
    if (optToucheMaul.touche) cfg.touche = optToucheMaul.touche;
    return cfg;
  }

  // Convertit l'effectif d'un club ADVERSAIRE (15, un par numéro) en config
  // joueursA/joueursB consommée par MatchEngine (cf. engine/rugby-engine.js) :
  // {numero: {poste, vitesse, plaquage, tendance, couloir}}.
  function effectifVersJoueursCfg(club) {
    const cfg = {};
    for (const j of club.effectif) {
      cfg[j.numero] = {
        poste: j.poste, vitesse: j.vitesse, plaquage: j.plaquage, tendance: j.tendance, couloir: j.couloir,
        adresse: j.adresse, melee: j.melee, touche: j.touche, puissance: j.puissance,
        endurance: j.endurance, passe: j.passe, jeuPied: j.jeuPied, decision: j.decision, discipline: j.discipline,
      };
    }
    return cfg;
  }

  // Même conversion, mais pour le club du JOUEUR : `composition` associe
  // chaque numéro (1-15) à l'id du joueur de l'effectif étendu qui le porte
  // ce jour-là (cf. meilleureComposition / choix manuel dans l'UI). La fatigue
  // accumulée (cf. appliquerFatigue) réduit réellement la vitesse/le plaquage
  // effectifs transmis au moteur — pas un simple badge cosmétique.
  function compositionVersJoueursCfg(effectif, composition) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const cfg = {};
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const j = parId[composition[numero]];
      if (!j) continue;
      const malusFatigue = Math.round(((j.fatigue || 0) / 100) * 12);
      // Moral (0-100, neutre 60-70 à la génération) : un joueur au moral haut
      // joue légèrement au-dessus de son niveau, un joueur démoralisé en
      // dessous — petit effet borné, jamais décoratif (cf. appliquerMoral).
      const ajustMoral = Math.round((((j.moral != null ? j.moral : 65) - 60) / 100) * 8);
      const ajustement = ajustMoral - malusFatigue;
      cfg[numero] = {
        poste: POSTE_REQUIS[numero],
        vitesse: Math.max(20, j.vitesse + ajustement),
        plaquage: Math.max(20, j.plaquage + ajustement),
        tendance: j.tendance, couloir: j.couloir, adresse: j.adresse,
        melee: j.melee, touche: j.touche, puissance: j.puissance,
        endurance: j.endurance, passe: j.passe, jeuPied: j.jeuPied,
        decision: j.decision, discipline: j.discipline,
      };
    }
    return cfg;
  }

  // Compose automatiquement la meilleure équipe disponible : pour chaque
  // numéro, le joueur du bon poste, NON BLESSÉ, au meilleur niveau
  // (vitesse+plaquage) qui n'est pas déjà titularisé ailleurs. S'il ne reste
  // aucun joueur valide à un poste (tous blessés), on titularise quand même
  // le moins pire plutôt que de laisser un trou dans la composition.
  function meilleureComposition(effectif) {
    const utilises = new Set();
    const composition = {};
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const poste = POSTE_REQUIS[numero];
      // Un joueur prêté (cf. preterJoueur) est une exclusion DURE, contrairement
      // à une blessure : il n'est tout simplement pas dans l'effectif du jour.
      const candidats = effectif.filter((j) => j.poste === poste && !j.pret && !utilises.has(j.id));
      if (candidats.length === 0) continue;
      const disponibles = candidats.filter((j) => !j.blessureJournees);
      const pool = disponibles.length > 0 ? disponibles : candidats;
      pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
      composition[numero] = pool[0].id;
      utilises.add(pool[0].id);
    }
    return composition;
  }

  // Complète une composition PARTIELLE (choix déjà faits par le joueur, ou
  // chargée depuis une saison sauvegardée) sans écraser les choix valides :
  // ne remplace que les numéros vides ou invalides (joueur libéré, mauvais
  // poste, doublon) par le meilleur joueur disponible restant. Utilisé à
  // l'ouverture de l'écran de composition — la version "table rase" reste
  // meilleureComposition (bouton "meilleure équipe possible").
  function completerComposition(effectif, compositionPartielle) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const composition = {};
    const utilises = new Set();
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const id = compositionPartielle && compositionPartielle[numero];
      const j = id && parId[id];
      if (j && !j.pret && j.poste === POSTE_REQUIS[numero] && !utilises.has(id)) {
        composition[numero] = id;
        utilises.add(id);
      }
    }
    for (const numero of Object.keys(POSTE_REQUIS)) {
      if (composition[numero]) continue;
      const poste = POSTE_REQUIS[numero];
      const candidats = effectif.filter((j) => j.poste === poste && !j.pret && !utilises.has(j.id));
      if (candidats.length === 0) continue;
      const disponibles = candidats.filter((j) => !j.blessureJournees);
      const pool = disponibles.length > 0 ? disponibles : candidats;
      pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
      composition[numero] = pool[0].id;
      utilises.add(pool[0].id);
    }
    return composition;
  }

  // Banc de 8 remplaçants (numéros 16-23), choisis parmi les joueurs NON
  // titularisés. Un par catégorie de poste NON DÉJÀ ÉPUISÉE par les titulaires
  // (GABARIT_EFFECTIF ne prévoit qu'UN seul joueur de profondeur par poste,
  // sauf l'aile qui reste en réserve non convoquée ce jour-là — comme un vrai
  // groupe de 23 sur un effectif de 24-25). Même logique "complète sans
  // écraser" que completerComposition.
  const POSTE_REQUIS_BANC = { 16: 'P', 17: 'T', 18: '2L', 19: '3L', 20: 'DM', 21: 'OV', 22: 'CE', 23: 'AR' };

  function completerCompositionBanc(effectif, compositionTitulaires, bancPartiel) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const utilisesTitulaires = new Set(Object.values(compositionTitulaires || {}));
    const banc = {};
    const utilisesBanc = new Set();
    for (const numero of Object.keys(POSTE_REQUIS_BANC)) {
      const id = bancPartiel && bancPartiel[numero];
      const j = id && parId[id];
      if (j && !j.pret && j.poste === POSTE_REQUIS_BANC[numero] && !utilisesTitulaires.has(id) && !utilisesBanc.has(id)) {
        banc[numero] = id;
        utilisesBanc.add(id);
      }
    }
    for (const numero of Object.keys(POSTE_REQUIS_BANC)) {
      if (banc[numero]) continue;
      const poste = POSTE_REQUIS_BANC[numero];
      const candidats = effectif.filter((j) => j.poste === poste && !j.pret && !utilisesTitulaires.has(j.id) && !utilisesBanc.has(j.id));
      if (candidats.length === 0) continue;
      const disponibles = candidats.filter((j) => !j.blessureJournees);
      const pool = disponibles.length > 0 ? disponibles : candidats;
      pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
      banc[numero] = pool[0].id;
      utilisesBanc.add(pool[0].id);
    }
    return banc;
  }

  // Retrouve le numéro de maillot (titulaire) porté par un joueur donné dans
  // une composition — sert à convertir capitaineId/buteurId/lanceurToucheId
  // (id joueur) en numéro pour la config moteur (buteurA/toucheLanceurA).
  function numeroDuJoueurDansComposition(composition, joueurId) {
    if (!joueurId || !composition) return null;
    for (const numero of Object.keys(composition)) {
      if (composition[numero] === joueurId) return numero;
    }
    return null;
  }

  // Désigne automatiquement capitaine (meilleur niveau global), buteur
  // (meilleure adresse au pied) et lanceur en touche (le talonneur titulaire,
  // n°2, comme en match réel) parmi les 15 titulaires — utilisé tant que le
  // joueur n'a rien choisi lui-même, et comme filet de sécurité si son choix
  // précédent n'est plus titulaire (blessure, transfert...).
  function autoDesignerEncadrement(effectif, compositionTitulaires) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const titulaires = Object.values(compositionTitulaires || {}).map((id) => parId[id]).filter(Boolean);
    if (titulaires.length === 0) return { capitaineId: null, buteurId: null, lanceurToucheId: null };
    const capitaine = titulaires.slice().sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage))[0];
    const buteur = titulaires.slice().sort((a, b) => (b.adresse || 0) - (a.adresse || 0))[0];
    const lanceur = parId[compositionTitulaires['2']] || titulaires.find((j) => j.poste === 'T') || titulaires[0];
    return { capitaineId: capitaine.id, buteurId: buteur.id, lanceurToucheId: lanceur.id };
  }

  // Fatigue (Mode Club) : les titulaires du jour encaissent une charge de
  // match (répercutée sur leurs stats effectives au match suivant, cf.
  // compositionVersJoueursCfg), les autres récupèrent — appelé une fois par
  // journée jouée, comme faireProgresserBlessures. `matchsJoues` est le
  // compteur RÉEL de titularisations affiché dans la fiche joueur.
  // `facteurPreparateur` (défaut 1 = comportement historique inchangé) :
  // <1 réduit la fatigue encaissée et accélère la récupération, cf. le
  // préparateur physique dans le personnel (effetPersonnel).
  function appliquerFatigue(effectif, compositionTitulaires, facteurPreparateur) {
    const fp = facteurPreparateur != null ? facteurPreparateur : 1;
    const titulairesIds = new Set(Object.values(compositionTitulaires || {}));
    for (const j of effectif) {
      // Endurance (0-100, neutre 60 = comportement historique inchangé) :
      // un joueur endurant encaisse moins de fatigue et récupère plus vite,
      // un joueur peu endurant l'inverse — borné pour rester réaliste.
      const endurance = j.endurance != null ? j.endurance : 60;
      if (titulairesIds.has(j.id)) {
        const facteurGain = Math.max(0.5, Math.min(1.6, 1 + (60 - endurance) / 75)) * fp;
        j.fatigue = Math.min(100, (j.fatigue || 0) + Math.round(32 * facteurGain));
        j.matchsJoues = (j.matchsJoues || 0) + 1;
      } else {
        const facteurRecup = Math.max(0.5, Math.min(1.6, 1 + (endurance - 60) / 75)) / fp;
        j.fatigue = Math.max(0, (j.fatigue || 0) - Math.round(22 * facteurRecup));
      }
    }
  }

  // --- Moral (Mode Club) : monte pour les titulaires qui gagnent, baisse
  // légèrement en cas de défaite, dérive doucement vers la neutralité (65)
  // pour les non-sélectionnés — répercuté sur les stats effectives en match
  // (cf. compositionVersJoueursCfg), jamais un simple badge. ---
  function appliquerMoral(effectif, compositionTitulaires, forme) {
    const titulairesIds = new Set(Object.values(compositionTitulaires || {}));
    const variation = forme === 'v' ? 8 : forme === 'd' ? -6 : 1;
    for (const j of effectif) {
      const actuel = j.moral != null ? j.moral : 65;
      if (titulairesIds.has(j.id)) {
        j.moral = Math.max(0, Math.min(100, actuel + variation));
      } else {
        // Dérive lente vers la neutralité pour qui ne joue pas (ni euphorie
        // ni frustration durable sans y avoir participé).
        j.moral = actuel + Math.sign(65 - actuel) * Math.min(3, Math.abs(65 - actuel));
      }
    }
  }

  // --- Entraînement (Mode Club) : un programme choisi par le joueur nudge
  // réellement les attributs correspondants, borné par le potentiel de
  // chacun et sa fenêtre d'âge — appelé une fois par journée jouée, comme
  // appliquerFatigue/faireProgresserBlessures. Jamais un simple badge : les
  // valeurs affichées dans la fiche joueur bougent vraiment. ---
  const ENTRAINEMENTS = {
    melee: { label: 'Mêlée', description: 'Renforce la technique de poussée en mêlée des avants.', attributs: ['melee'], postes: ['P', 'T', '2L', '3L'] },
    touche: { label: 'Touche', description: 'Améliore la contestation en touche (sauteurs et soutiens).', attributs: ['touche'], postes: ['2L', '3L', 'T'] },
    physique: { label: 'Physique', description: "Développe puissance et endurance de tout l'effectif.", attributs: ['puissance', 'endurance'], postes: null },
    main: { label: 'Jeu de main', description: 'Travaille la passe et la prise de décision au contact.', attributs: ['passe', 'decision'], postes: ['DM', 'OV', 'CE', 'AI', 'AR'] },
    pied: { label: 'Jeu au pied', description: 'Perfectionne la précision au pied (buts et jeu courant).', attributs: ['jeuPied', 'adresse'], postes: ['DM', 'OV', 'AR'] },
    discipline: { label: 'Discipline', description: 'Réduit les fautes concédées, notamment en mêlée et au maul.', attributs: ['discipline'], postes: null },
  };
  // `facteurEntraineur` (défaut 1 = comportement historique inchangé) : >1
  // accélère la progression, cf. l'entraîneur adjoint dans le personnel.
  // Entraînement INDIVIDUEL (cf. j.entrainementIndividuel) : un joueur peut
  // suivre un programme différent du collectif — utile pour cibler la
  // faiblesse d'un joueur précis sans réorienter tout l'effectif.
  function appliquerEntrainement(rng, effectif, focus, facteurEntraineur) {
    const fe = facteurEntraineur != null ? facteurEntraineur : 1;
    const programmeCollectif = ENTRAINEMENTS[focus];
    for (const j of effectif) {
      const programme = (j.entrainementIndividuel && ENTRAINEMENTS[j.entrainementIndividuel]) || programmeCollectif;
      if (!programme) continue;
      if (programme.postes && !programme.postes.includes(j.poste)) continue;
      if (j.age >= 32) continue; // progression réservée aux joueurs encore en développement
      const potentiel = j.potentiel != null ? j.potentiel : 70;
      // Progression graduelle et probabiliste (pas à chaque journée pour
      // chaque joueur, sinon tout le monde plafonnerait en 3 semaines) —
      // jamais au-delà du potentiel individuel.
      if (rng() >= 0.35 * fe) continue;
      for (const attr of programme.attributs) {
        const actuel = j[attr] != null ? j[attr] : 60;
        if (actuel >= potentiel) continue;
        j[attr] = Math.min(potentiel, actuel + 1);
      }
    }
  }

  function masseSalariale(effectif) {
    return effectif.reduce((somme, j) => somme + j.salaire, 0);
  }

  // --- Personnel (Mode Club) : entraîneur adjoint, préparateur physique,
  // médecin, recruteur, analyste vidéo — un poste par rôle, chacun avec un
  // niveau (0-100) qui module RÉELLEMENT un mécanisme existant (cf.
  // effetPersonnel ci-dessous), et un salaire qui pèse sur les finances
  // comme celui des joueurs. Jamais décoratif : sans personnel, comportement
  // historique inchangé partout où il est branché. ---
  const POSTES_PERSONNEL = {
    entraineur: { label: 'Entraîneur adjoint', effet: "Accélère la progression à l'entraînement collectif." },
    preparateur: { label: 'Préparateur physique', effet: 'Réduit la fatigue accumulée et accélère la récupération.' },
    medecin: { label: 'Médecin', effet: 'Réduit la durée des blessures.' },
    recruteur: { label: 'Recruteur', effet: 'Réduit le coût du scouting et affine plus vite les rapports.' },
    analyste: { label: 'Analyste vidéo', effet: "Affine l'analyse de l'adversaire (écarts plus fins détectés)." },
  };
  let compteurPersonnelId = 1;
  function genererMembrePersonnel(rng, poste) {
    const niveau = 40 + Math.floor(rng() * 55); // 40-95
    return {
      id: 'staff' + compteurPersonnelId++,
      nom: genererNomJoueur(rng),
      poste,
      niveau,
      salaire: Math.round(10 + niveau * 0.35), // k€/saison, ordre de grandeur d'un joueur modeste
    };
  }
  function genererMarchePersonnel(rng, n) {
    const postes = Object.keys(POSTES_PERSONNEL);
    const marche = [];
    for (let i = 0; i < (n || 5); i++) marche.push(genererMembrePersonnel(rng, choisir(rng, postes)));
    return marche;
  }
  // Un seul membre par poste à la fois (comme un vrai organigramme) : engager
  // un nouvel entraîneur suppose d'abord licencier l'ancien.
  function embaucherPersonnel(saison, candidatId) {
    if (!saison.clubJoueur.personnel) saison.clubJoueur.personnel = [];
    const i = (saison.marchePersonnel || []).findIndex((p) => p.id === candidatId);
    if (i === -1) return { ok: false, motif: 'introuvable' };
    const candidat = saison.marchePersonnel[i];
    if (saison.clubJoueur.personnel.some((p) => p.poste === candidat.poste)) return { ok: false, motif: 'poste_pourvu' };
    saison.marchePersonnel.splice(i, 1);
    saison.clubJoueur.personnel.push(candidat);
    return { ok: true };
  }
  function licencierPersonnel(saison, staffId) {
    const personnel = saison.clubJoueur.personnel || [];
    const avant = personnel.length;
    saison.clubJoueur.personnel = personnel.filter((p) => p.id !== staffId);
    return { ok: saison.clubJoueur.personnel.length < avant };
  }
  function masseSalarialePersonnel(club) {
    return (club.personnel || []).reduce((s, p) => s + p.salaire, 0);
  }
  // Facteur d'effet (>=1, 1 = poste non pourvu, comportement historique
  // inchangé) dérivé du niveau du membre occupant ce poste — chaque
  // consommateur (appliquerEntrainement, faireProgresserBlessures,
  // scouterJoueur, analyserAdversaire, appliquerFatigue) l'applique selon
  // son propre sens (voir leurs commentaires respectifs).
  function effetPersonnel(saison, poste) {
    const membre = (saison.clubJoueur.personnel || []).find((p) => p.poste === poste);
    if (!membre) return 1;
    return 1 + membre.niveau / 130; // niveau 95 -> ~1.73x, niveau 40 -> ~1.31x
  }

  // --- Sponsor (Mode Club) : revenu récurrent réel par match, distinct de la
  // billetterie — proportionnel au standing du club, affiché séparément dans
  // le journal financier. ---
  const SPONSORS = ["RugbyCorp", 'Ovalie Assurances', 'Groupe Essai', "Touche d'Or", 'Maillot Plus', 'Ligue Ambre'];
  function genererSponsor(rng, niveauClub) {
    return { nom: choisir(rng, SPONSORS), revenuParMatch: Math.round(15 + niveauClub * 40 + rng() * 10) };
  }

  // Finances d'un jour de match (club du joueur uniquement) : recette de
  // billetterie (plus élevée pour un grand club, prime en cas de victoire),
  // revenu de sponsoring récurrent, et une part de la masse salariale
  // annuelle — joueurs ET personnel — répartie sur les 10 journées de la
  // saison — un budget qui bouge vraiment avec les résultats, sans simuler
  // des dizaines de lignes comptables.
  function appliquerFinancesMatch(club, forme) {
    const recette = Math.round(40 + club.niveauClub * 120 + (forme === 'v' ? 25 : forme === 'n' ? 10 : 0));
    const revenuSponsor = club.sponsor ? club.sponsor.revenuParMatch : 0;
    const salaires = Math.round(masseSalariale(club.effectif) / 10);
    const salairesPersonnel = Math.round(masseSalarialePersonnel(club) / 10);
    club.budget += recette + revenuSponsor - salaires - salairesPersonnel;
    return { recette, revenuSponsor, salaires, salairesPersonnel };
  }

  // Prévision financière RÉELLE : extrapole le solde net moyen des derniers
  // mouvements enregistrés (jamais une estimation fabriquée) sur N journées.
  function prevoirFinances(club, nJournees) {
    const hist = club.historiqueFinances || [];
    if (hist.length === 0) return null;
    const recents = hist.slice(-5);
    const soldeNetMoyen = recents.reduce((s, m) => s + (m.recette + (m.revenuSponsor || 0) - m.salaires - (m.salairesPersonnel || 0)), 0) / recents.length;
    return {
      soldeNetMoyen: Math.round(soldeNetMoyen),
      projection: Math.round(club.budget + soldeNetMoyen * nJournees),
      nJournees,
    };
  }

  // --- Marché des transferts (club du joueur uniquement) ---
  // Repérage façon "scouting" FM : un joueur libre n'est d'abord connu
  // qu'approximativement (connaissance basse, cf. statsApparentes) — un vrai
  // rapport de scout se précise avec l'investissement, il ne tombe pas tout
  // armé avec des statistiques exactes.
  const COUT_SCOUTING = 8; // k€ par action de repérage
  const SEUIL_CONNAISSANCE_COMPLETE = 90;

  function genererJoueurLibre(rng, niveauMoyen) {
    const poste = choisir(rng, GABARIT_EFFECTIF);
    const j = genererJoueurEtendu(poste, rng, niveauMoyen);
    j.prixTransfert = Math.round((j.vitesse + j.plaquage) * 3 + (30 - Math.min(j.age, 30)) * 5);
    // Premier repérage : connaissance faible (20-50 %) et incertitude fixe
    // sur chaque statistique (±15 au max), qui se résorbe avec la connaissance
    // — cf. statsApparentes. Fixée une fois pour toutes à la génération, pas
    // recalculée aléatoirement à chaque affichage (sinon le rapport "flotte").
    j.connaissance = 20 + Math.floor(rng() * 30);
    j.ecartVitesse = Math.round((rng() * 2 - 1) * 15);
    j.ecartPlaquage = Math.round((rng() * 2 - 1) * 15);
    return j;
  }
  function genererMarcheTransferts(rng, niveauMoyen, n) {
    const marche = [];
    for (let i = 0; i < (n || 6); i++) marche.push(genererJoueurLibre(rng, niveauMoyen));
    return marche;
  }

  // Ce que le RAPPORT DE SCOUT affiche pour ce joueur du marché — pas
  // forcément ses vraies statistiques tant qu'il n'est pas bien connu.
  // `complet` indique si on peut faire confiance aux valeurs affichées.
  function statsApparentes(joueur) {
    const fiabilite = Math.min(1, joueur.connaissance / SEUIL_CONNAISSANCE_COMPLETE);
    return {
      vitesse: Math.round(joueur.vitesse - joueur.ecartVitesse * (1 - fiabilite)),
      plaquage: Math.round(joueur.plaquage - joueur.ecartPlaquage * (1 - fiabilite)),
      complet: joueur.connaissance >= SEUIL_CONNAISSANCE_COMPLETE,
    };
  }
  // Étoiles (1-5) dérivées du rapport de scout ACTUEL (pas des vraies stats
  // si le joueur n'est pas encore bien connu) : ce que verrait vraiment un
  // manager, incertitude comprise.
  function estimationEtoiles(joueur) {
    const s = statsApparentes(joueur);
    const niveau = (s.vitesse + s.plaquage) / 2;
    return Math.max(1, Math.min(5, Math.round((niveau - 30) / 13)));
  }

  // Investit dans le repérage d'un joueur du marché : coûte un peu de budget,
  // fait progresser la connaissance vers un rapport fiable.
  // Le recruteur (personnel, cf. effetPersonnel) réduit le coût et augmente
  // le gain de connaissance par action de scouting — sans lui, comportement
  // historique inchangé (coût plein, +30 de connaissance).
  function scouterJoueur(saison, joueurId, facteurRecruteur) {
    const fr = facteurRecruteur != null ? facteurRecruteur : 1;
    const cout = Math.max(3, Math.round(COUT_SCOUTING / fr));
    const j = saison.marche.find((x) => x.id === joueurId);
    if (!j) return { ok: false, motif: 'introuvable' };
    if (j.connaissance >= 100) return { ok: false, motif: 'deja_complet' };
    if (saison.clubJoueur.budget < cout) return { ok: false, motif: 'budget' };
    saison.clubJoueur.budget -= cout;
    j.connaissance = Math.min(100, j.connaissance + Math.round(30 * fr));
    return { ok: true, connaissance: j.connaissance, cout };
  }

  // Prime de signature (Mode Club) : frais d'arrivée réels en plus de
  // l'indemnité de transfert (agent, prime à la signature), proportionnelle
  // au salaire — un transfert ne coûte pas QUE l'indemnité, comme en vrai.
  function calculerPrimeSignature(joueur) {
    return Math.round(joueur.salaire * 0.2);
  }
  function signerJoueur(saison, joueurId) {
    const i = saison.marche.findIndex((j) => j.id === joueurId);
    if (i === -1) return { ok: false, motif: 'introuvable' };
    const joueur = saison.marche[i];
    const primeSignature = calculerPrimeSignature(joueur);
    const coutTotal = joueur.prixTransfert + primeSignature;
    if (saison.clubJoueur.budget < coutTotal) return { ok: false, motif: 'budget' };
    saison.clubJoueur.budget -= coutTotal;
    // Une fois signé, c'est TON joueur : plus de brouillard de scouting, ses
    // vraies statistiques s'affichent directement dans l'effectif.
    delete joueur.connaissance; delete joueur.ecartVitesse; delete joueur.ecartPlaquage;
    saison.clubJoueur.effectif.push(joueur);
    saison.marche.splice(i, 1);
    // Un favori signé n'est plus "à scouter" : retiré de la liste (cf.
    // basculerFavori) pour ne pas laisser une entrée déjà recrutée dessus.
    if (saison.favoris) saison.favoris = saison.favoris.filter((j) => j.id !== joueurId);
    return { ok: true, primeSignature, coutTotal };
  }

  // Refuse de libérer un joueur si ça viderait complètement son poste (sinon
  // la composition automatique ne pourrait plus aligner une équipe complète).
  function libererJoueur(saison, joueurId) {
    const effectif = saison.clubJoueur.effectif;
    const joueur = effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const memePoste = effectif.filter((j) => j.poste === joueur.poste);
    if (memePoste.length <= 1) return { ok: false, motif: 'dernier_du_poste' };
    saison.clubJoueur.effectif = effectif.filter((j) => j.id !== joueurId);
    // Nettoie toute référence pendante vers ce joueur (composition, banc,
    // encadrement) : sinon la config moteur ou l'UI pointerait vers un id
    // qui n'existe plus (cf. completerComposition/completerCompositionBanc,
    // qui recomposent proprement autour des trous laissés ici).
    const c = saison.clubJoueur;
    if (c.capitaineId === joueurId) c.capitaineId = null;
    if (c.buteurId === joueurId) c.buteurId = null;
    if (c.lanceurToucheId === joueurId) c.lanceurToucheId = null;
    for (const compo of [c.compositionTitulaires, c.compositionBanc]) {
      if (!compo) continue;
      for (const numero of Object.keys(compo)) {
        if (compo[numero] === joueurId) delete compo[numero];
      }
    }
    return { ok: true };
  }

  // --- Prêt (Mode Club) : le joueur reste dans l'effectif (contrat/salaire
  // inchangés) mais devient INDISPONIBLE pour la sélection pendant la durée
  // du prêt (exclusion dure, cf. meilleureComposition/completerComposition),
  // en échange d'une indemnité de prêt immédiate — un vrai compromis
  // temps de jeu / finances, pas un simple badge. ---
  function preterJoueur(saison, joueurId, dureeJournees) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    if (joueur.pret) return { ok: false, motif: 'deja_prete' };
    const duree = Math.max(1, Math.min(10, dureeJournees || 3));
    const indemnite = Math.round(joueur.salaire * 0.3 * (duree / 10));
    joueur.pret = { dureeRestante: duree };
    saison.clubJoueur.budget += indemnite;
    const c = saison.clubJoueur;
    if (c.capitaineId === joueurId) c.capitaineId = null;
    if (c.buteurId === joueurId) c.buteurId = null;
    if (c.lanceurToucheId === joueurId) c.lanceurToucheId = null;
    for (const compo of [c.compositionTitulaires, c.compositionBanc]) {
      if (!compo) continue;
      for (const numero of Object.keys(compo)) {
        if (compo[numero] === joueurId) delete compo[numero];
      }
    }
    return { ok: true, indemnite };
  }
  function rappelerJoueur(saison, joueurId) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur || !joueur.pret) return { ok: false, motif: 'pas_prete' };
    joueur.pret = null;
    return { ok: true };
  }
  // Décompte la durée restante de chaque prêt en cours (une fois par journée
  // jouée, comme faireProgresserBlessures) et lève le prêt à échéance.
  function progresserPrets(effectif) {
    for (const j of effectif) {
      if (!j.pret) continue;
      j.pret.dureeRestante--;
      if (j.pret.dureeRestante <= 0) j.pret = null;
    }
  }

  // --- Renouvellement de contrat (Mode Club) : une offre RÉELLE calculée
  // depuis le niveau et l'âge actuels du joueur (pas un chiffre décoratif) ;
  // l'accepter modifie vraiment contrat/salaire, donc la masse salariale et
  // le budget dès la prochaine journée. ---
  function calculerOffreRenouvellement(joueur) {
    const dureeMax = joueur.age >= 32 ? 1 : joueur.age >= 29 ? 2 : 3;
    const salaire = calculerSalaire(joueur.vitesse, joueur.plaquage, joueur.age);
    return { dureeMax, salaire };
  }
  function renouvelerContrat(saison, joueurId, duree) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const offre = calculerOffreRenouvellement(joueur);
    const dureeFinale = Math.max(1, Math.min(offre.dureeMax, duree || offre.dureeMax));
    joueur.contrat = dureeFinale;
    joueur.salaire = offre.salaire;
    return { ok: true, contrat: joueur.contrat, salaire: joueur.salaire };
  }

  // --- Centre de scouting : liste de favoris (Mode Club) — les entrées du
  // marché sont régénérées à chaque rafraîchissement, donc un favori est une
  // COPIE conservée indépendamment (jamais une simple référence qui
  // disparaîtrait au prochain "Rafraîchir"). Nettoyé automatiquement si le
  // joueur est finalement signé (cf. signerJoueur). ---
  function basculerFavori(saison, joueur) {
    if (!saison.favoris) saison.favoris = [];
    const idx = saison.favoris.findIndex((j) => j.id === joueur.id);
    if (idx >= 0) { saison.favoris.splice(idx, 1); return { ok: true, favori: false }; }
    saison.favoris.push(joueur);
    return { ok: true, favori: true };
  }

  // --- Analyse du prochain adversaire (Mode Club) : moyennes d'attributs
  // RÉELLES (avants/ensemble de l'effectif) comparées aux tiennes, plus la
  // forme récente RÉELLE tirée du calendrier — jamais de note fabriquée. ---
  const POSTES_AVANTS = ['P', 'T', '2L', '3L'];
  function moyenneAttribut(effectif, attr, postes) {
    const pool = postes ? effectif.filter((j) => postes.includes(j.poste)) : effectif;
    if (pool.length === 0) return 0;
    return Math.round(pool.reduce((s, j) => s + (j[attr] != null ? j[attr] : 60), 0) / pool.length);
  }
  const ATTRIBUTS_ANALYSE = [
    { cle: 'melee', label: 'Mêlée', postes: POSTES_AVANTS },
    { cle: 'touche', label: 'Touche', postes: POSTES_AVANTS },
    { cle: 'puissance', label: 'Puissance en contact', postes: null },
    { cle: 'vitesse', label: 'Vitesse', postes: null },
    { cle: 'passe', label: 'Jeu de main', postes: null },
    { cle: 'jeuPied', label: 'Jeu au pied', postes: null },
    { cle: 'discipline', label: 'Discipline', postes: null },
  ];
  // Un analyste vidéo (personnel, cf. effetPersonnel) abaisse le seuil de
  // détection : il repère des écarts plus fins qu'un manager sans analyste
  // (seuil par défaut 6 points, comportement historique inchangé sans lui).
  function analyserAdversaire(saison, clubId, seuilAnalyste) {
    const adversaire = club(saison, clubId);
    if (!adversaire) return null;
    const seuil = seuilAnalyste != null ? seuilAnalyste : 6;
    const monEffectif = saison.clubJoueur.effectif;
    const comparaison = ATTRIBUTS_ANALYSE.map((a) => {
      const moi = moyenneAttribut(monEffectif, a.cle, a.postes);
      const eux = moyenneAttribut(adversaire.effectif, a.cle, a.postes);
      return { cle: a.cle, label: a.label, moi, eux, diff: eux - moi };
    });
    const forces = comparaison.filter((c) => c.diff >= seuil).sort((a, b) => b.diff - a.diff);
    const faiblesses = comparaison.filter((c) => c.diff <= -seuil).sort((a, b) => a.diff - b.diff);
    // Forme récente RÉELLE (5 derniers résultats de cet adversaire, tous
    // matchs confondus, y compris contre d'autres IA) — jamais fabriquée.
    const joues = saison.calendrier.filter((f) => f.joue && (f.domicileId === clubId || f.exterieurId === clubId));
    const forme = joues.slice(-5).map((f) => {
      const domicile = f.domicileId === clubId;
      const pour = domicile ? f.score.domicile : f.score.exterieur;
      const contre = domicile ? f.score.exterieur : f.score.domicile;
      return pour > contre ? 'v' : pour < contre ? 'd' : 'n';
    });
    const classement = classementTrie(saison);
    const position = classement.findIndex((r) => r.clubId === clubId) + 1;
    return { nom: adversaire.nom, comparaison, forces, faiblesses, forme, position, totalClubs: classement.length };
  }

  // Calendrier aller-retour complet (méthode du cercle, championnat classique) :
  // TOUS les clubs s'affrontent deux fois chacun (une fois à domicile, une
  // fois à l'extérieur), et chaque JOURNÉE fait jouer TOUS les clubs en même
  // temps (n/2 matchs simultanés) — pas seulement le club du joueur. Avec 6
  // clubs (le joueur + 5 adversaires) : 3 matchs/journée, 10 journées. Exige
  // un nombre pair de clubs (sinon un club serait au repos chaque journée).
  function genererCalendrier(clubs) {
    const n = clubs.length;
    const ids = clubs.map((c) => c.id);
    const fixe = ids[0];
    const tournant = ids.slice(1);
    const rondesAller = [];
    for (let r = 0; r < n - 1; r++) {
      const ordre = [fixe, ...tournant];
      const ronde = [];
      for (let i = 0; i < n / 2; i++) {
        const a = ordre[i], b = ordre[n - 1 - i];
        ronde.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rondesAller.push(ronde);
      tournant.push(tournant.shift());
    }
    const fixtures = [];
    let id = 0;
    rondesAller.forEach((ronde, r) => {
      for (const [domicileId, exterieurId] of ronde) {
        fixtures.push({ id: 'f' + id++, journee: r + 1, domicileId, exterieurId, joue: false, score: null });
      }
    });
    const decalage = rondesAller.length;
    rondesAller.forEach((ronde, r) => {
      for (const [domicileId, exterieurId] of ronde) {
        fixtures.push({ id: 'f' + id++, journee: decalage + r + 1, domicileId: exterieurId, exterieurId: domicileId, joue: false, score: null });
      }
    });
    return fixtures;
  }

  function classementInitial(clubs) {
    const table = {};
    for (const c of clubs) table[c.id] = { clubId: c.id, j: 0, g: 0, n: 0, p: 0, pts: 0, essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0 };
    return table;
  }

  // Points de classement classiques (rugby à XV) : victoire 4, nul 2, défaite 0.
  function enregistrerResultat(saison, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    const f = saison.calendrier.find((x) => x.id === fixtureId);
    if (!f || f.joue) return;
    f.joue = true;
    f.score = { domicile: scoreDomicile, exterieur: scoreExterieur };
    const td = saison.classement[f.domicileId];
    const te = saison.classement[f.exterieurId];
    td.j++; te.j++;
    td.pointsPour += scoreDomicile; td.pointsContre += scoreExterieur;
    te.pointsPour += scoreExterieur; te.pointsContre += scoreDomicile;
    td.essaisPour += essaisDomicile || 0; td.essaisContre += essaisExterieur || 0;
    te.essaisPour += essaisExterieur || 0; te.essaisContre += essaisDomicile || 0;
    if (scoreDomicile > scoreExterieur) { td.g++; td.pts += 4; te.p++; }
    else if (scoreDomicile < scoreExterieur) { te.g++; te.pts += 4; td.p++; }
    else { td.n++; te.n++; td.pts += 2; te.pts += 2; }
  }

  function classementTrie(saison) {
    return Object.values(saison.classement).sort((a, b) =>
      b.pts - a.pts || (b.pointsPour - b.pointsContre) - (a.pointsPour - a.pointsContre) || b.pointsPour - a.pointsPour);
  }

  function prochainesFixtures(saison) {
    const prochaine = saison.calendrier.find((f) => !f.joue);
    if (!prochaine) return [];
    return saison.calendrier.filter((f) => f.journee === prochaine.journee);
  }

  function club(saison, clubId) {
    if (saison.clubJoueur.id === clubId) return saison.clubJoueur;
    return saison.adversaires.find((c) => c.id === clubId) || null;
  }

  // Réduit les blessures d'une journée (appelé une fois par journée jouée) et
  // tire une petite chance de blessure pour chaque titulaire qui a joué.
  // `facteurMedecin` (défaut 1 = comportement historique inchangé) : >1
  // accélère la guérison (récupération plus rapide, nouvelles blessures plus
  // courtes) — cf. le médecin dans le personnel (effetPersonnel).
  function faireProgresserBlessures(rng, effectif, composition, facteurMedecin) {
    const fm = facteurMedecin != null ? facteurMedecin : 1;
    for (const j of effectif) {
      if (j.blessureJournees > 0) j.blessureJournees = Math.max(0, j.blessureJournees - Math.max(1, Math.round(fm)));
    }
    const titulairesIds = new Set(Object.values(composition || {}));
    for (const j of effectif) {
      if (!titulairesIds.has(j.id)) continue;
      if (rng() < 0.06) j.blessureJournees = Math.max(1, Math.round((1 + Math.floor(rng() * 3)) / fm)); // 1-3 journées, réduites par le médecin
    }
  }

  // Fin de saison (club du joueur) : vieillissement, fin de contrat, retraite,
  // recrutement de jeunes pour compenser les départs et garder l'effectif à sa
  // taille cible. Le budget et l'identité du club sont conservés ; calendrier
  // et classement repartent à zéro avec de nouveaux adversaires.
  function avancerSaison(rng, saison) {
    const effectif = saison.clubJoueur.effectif;
    const partis = [];
    const ATTRIBUTS_VIEILLISSEMENT = ['vitesse', 'plaquage', 'melee', 'touche', 'puissance', 'endurance', 'passe', 'jeuPied', 'decision'];
    let reste = effectif.map((j) => {
      // Nouvelle saison, nouvelle fraîcheur : la fatigue et le compteur de
      // matchs (statistique de LA saison) repartent à zéro, comme la vraie
      // préparation estivale d'un club. Les stats individuelles de la saison
      // précédente sont archivées ailleurs (historiqueSaisons), pas ici.
      const copie = Object.assign({}, j, { age: j.age + 1, contrat: j.contrat - 1, fatigue: 0, matchsJoues: 0, statsSaison: null });
      // Vieillissement RÉEL des attributs (pas seulement le compteur d'âge) :
      // déclin physique après 30 ans, développement estival vers le potentiel
      // pour les jeunes joueurs encore loin de leur plafond.
      if (copie.age >= 31) {
        const declin = 1 + Math.floor(rng() * 2);
        for (const attr of ATTRIBUTS_VIEILLISSEMENT) {
          if (copie[attr] == null) continue;
          copie[attr] = Math.max(20, copie[attr] - declin);
        }
      } else if (copie.age <= 23 && copie.potentiel != null) {
        const croissance = 1 + Math.floor(rng() * 3);
        for (const attr of ATTRIBUTS_VIEILLISSEMENT) {
          if (copie[attr] == null) continue;
          copie[attr] = Math.min(copie.potentiel, Math.min(99, copie[attr] + croissance));
        }
      }
      return copie;
    });
    reste = reste.filter((j) => {
      const retraite = j.age >= 37 || (j.age >= 34 && rng() < 0.25);
      const finDeContrat = j.contrat <= 0;
      if (retraite || finDeContrat) {
        const memePoste = reste.filter((x) => x.poste === j.poste).length;
        if (memePoste <= 1 && !retraite) { j.contrat = 1; return true; } // évite un poste à 0 joueur
        partis.push({ nom: j.nom, poste: j.poste, motif: retraite ? 'retraite' : 'fin de contrat' });
        return false;
      }
      return true;
    });
    const arrivees = [];
    while (reste.length < TAILLE_EFFECTIF_CIBLE) {
      const compte = {};
      for (const j of reste) compte[j.poste] = (compte[j.poste] || 0) + 1;
      const posteManquant = GABARIT_EFFECTIF.find((p) => (compte[p] || 0) < GABARIT_EFFECTIF.filter((x) => x === p).length)
        || choisir(rng, GABARIT_EFFECTIF);
      const jeune = genererJoueurEtendu(posteManquant, rng, saison.clubJoueur.niveauClub);
      jeune.age = 18 + Math.floor(rng() * 3); // jeunes espoirs, 18-20 ans
      jeune.contrat = 2 + Math.floor(rng() * 2);
      jeune.salaire = calculerSalaire(jeune.vitesse, jeune.plaquage, jeune.age);
      reste.push(jeune);
      arrivees.push({ nom: jeune.nom, poste: jeune.poste });
    }
    saison.clubJoueur.effectif = reste;

    // Archive un résumé RÉEL de la saison qui vient de s'achever (classement
    // final, bilan, essais, budget) AVANT de tout réinitialiser ci-dessous —
    // alimente l'écran Bilan "évolution sur plusieurs saisons", jamais une
    // valeur recalculée après coup.
    if (!saison.clubJoueur.historiqueSaisons) saison.clubJoueur.historiqueSaisons = [];
    const classementFinal = classementTrie(saison);
    const positionFinale = classementFinal.findIndex((r) => r.clubId === saison.clubJoueur.id) + 1;
    const bilanClub = saison.classement[saison.clubJoueur.id];
    saison.clubJoueur.historiqueSaisons.push({
      numero: saison.numero || 1,
      position: positionFinale,
      totalClubs: classementFinal.length,
      victoires: bilanClub.g, nuls: bilanClub.n, defaites: bilanClub.p,
      points: bilanClub.pts,
      essais: saison.clubJoueur.statsCumulees ? saison.clubJoueur.statsCumulees.essais : 0,
      budget: saison.clubJoueur.budget,
    });
    if (saison.clubJoueur.historiqueSaisons.length > 20) saison.clubJoueur.historiqueSaisons.shift();

    // Évolution RÉELLE des clubs adverses d'une saison à l'autre (pas un
    // tirage figé à chaque saison) : leur niveau dérive selon leur
    // classement final qu'on vient de calculer ci-dessus — finir dans le
    // haut du tableau les renforce légèrement, finir en bas les affaiblit.
    // L'identité du club (nom, couleur, id) persiste, seul l'effectif est
    // régénéré au nouveau niveau (renouvellement d'effectif normal).
    const adversaires = saison.adversaires.map((ancien) => {
      const rang = classementFinal.findIndex((r) => r.clubId === ancien.id) + 1;
      const total = classementFinal.length;
      const delta = rang <= 2 ? 0.05 : rang >= total - 1 ? -0.05 : 0;
      const niveauClub = Math.max(0.15, Math.min(0.9, (ancien.niveauClub != null ? ancien.niveauClub : 0.5) + delta));
      return { id: ancien.id, nom: ancien.nom, couleur: ancien.couleur, niveauClub, effectif: genererEffectif(rng, niveauClub) };
    });
    saison.adversaires = adversaires;
    const tousLesClubs = [saison.clubJoueur, ...adversaires];
    saison.calendrier = genererCalendrier(tousLesClubs);
    saison.classement = classementInitial(tousLesClubs);
    saison.marche = genererMarcheTransferts(rng, 0.5, 6);
    saison.marchePersonnel = genererMarchePersonnel(rng, 5);
    saison.numero = (saison.numero || 1) + 1;
    // Instantané des attributs en DÉBUT de cette nouvelle saison (progression
    // réelle affichée en fiche joueur, cf. calculerProgression) — pris APRÈS
    // vieillissement/départs/arrivées, donc reflète bien le point de départ
    // de la saison qui commence.
    snapshotAttributsDebutSaison(saison.clubJoueur.effectif);
    // Les stats cumulées repartent à zéro (nouvelle saison, nouveau compteur) ;
    // le journal financier, lui, garde son historique récent (utile pour voir
    // la transition entre deux saisons dans l'onglet Finances).
    saison.clubJoueur.statsCumulees = null;
    // Composition/banc/encadrement de l'an dernier n'ont plus de sens avec un
    // effectif qui a bougé (départs/arrivées) : repartent à zéro, recomposés
    // automatiquement à la prochaine ouverture de l'écran de composition.
    saison.clubJoueur.compositionTitulaires = null;
    saison.clubJoueur.compositionBanc = null;
    saison.clubJoueur.capitaineId = null;
    saison.clubJoueur.buteurId = null;
    saison.clubJoueur.lanceurToucheId = null;
    // Marché régénéré (ligne ci-dessus) : les anciens favoris n'y ont plus
    // cours, on repart d'une liste vierge pour la nouvelle saison.
    saison.favoris = [];
    return { partis, arrivees };
  }

  // Crée une nouvelle saison complète : le club du joueur (effectif étendu +
  // budget) + 5 adversaires IA de niveaux variés, calendrier aller-retour,
  // classement à zéro, marché des transferts initial.
  function nouvelleSaison(rng, nomClubJoueur) {
    const clubJoueur = genererClubJoueur(rng, { nom: nomClubJoueur, niveauClub: 0.5 });
    snapshotAttributsDebutSaison(clubJoueur.effectif);
    const adversaires = [];
    const niveaux = [0.25, 0.4, 0.5, 0.6, 0.75]; // du plus faible au plus fort
    for (const niveauClub of niveaux) adversaires.push(genererClub(rng, { niveauClub }));
    const tousLesClubs = [clubJoueur, ...adversaires];
    return {
      version: VERSION_SAUVEGARDE,
      numero: 1,
      clubJoueur,
      adversaires,
      calendrier: genererCalendrier(tousLesClubs),
      classement: classementInitial(tousLesClubs),
      marche: genererMarcheTransferts(rng, 0.5, 6),
      marchePersonnel: genererMarchePersonnel(rng, 5),
      favoris: [],
    };
  }

  function sauvegarderSaison(saison) {
    try { localStorage.setItem(CLE_CLUB, JSON.stringify(saison)); } catch (e) { /* stockage indisponible (file://, quota) : la saison reste en mémoire pour cette session */ }
  }
  function chargerSaison() {
    try {
      const brut = localStorage.getItem(CLE_CLUB);
      if (!brut) return null;
      const saison = JSON.parse(brut);
      if (saison.version !== VERSION_SAUVEGARDE) return null; // ancien format : on repart à zéro plutôt que de planter
      return saison;
    } catch (e) { return null; }
  }
  function effacerSaison() {
    try { localStorage.removeItem(CLE_CLUB); } catch (e) { /* ignore */ }
  }

  global.RMClub = {
    genererNomClub, genererClub, genererEffectif, effectifVersJoueursCfg,
    nouvelleSaison, genererCalendrier, classementInitial, enregistrerResultat,
    classementTrie, prochainesFixtures, club,
    sauvegarderSaison, chargerSaison, effacerSaison,
    POSTE_REQUIS, POSTE_REQUIS_BANC, TAILLE_EFFECTIF_CIBLE,
    compositionVersJoueursCfg, meilleureComposition,
    completerComposition, completerCompositionBanc,
    numeroDuJoueurDansComposition, autoDesignerEncadrement, appliquerFatigue,
    masseSalariale, appliquerFinancesMatch,
    genererMarcheTransferts, signerJoueur, libererJoueur,
    statsApparentes, estimationEtoiles, scouterJoueur, COUT_SCOUTING,
    faireProgresserBlessures, avancerSaison,
    AXES_TACTIQUE, tactiqueVersConfig,
    accumulerStats, enregistrerMouvementFinances,
    ENTRAINEMENTS, appliquerEntrainement,
    accumulerStatsJoueurs, classementMarqueurs,
    calculerOffreRenouvellement, renouvelerContrat, calculerPrimeSignature,
    basculerFavori, analyserAdversaire,
    appliquerMoral, preterJoueur, rappelerJoueur, progresserPrets,
    POSTES_PERSONNEL, genererMarchePersonnel, embaucherPersonnel, licencierPersonnel,
    effetPersonnel, masseSalarialePersonnel, prevoirFinances,
    calculerProgression,
  };
})(window);
