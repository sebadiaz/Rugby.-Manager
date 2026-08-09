// Mode Club : modèle de données pour gérer un club fictif à travers plusieurs
// saisons (effectif étendu, contrats, finances, marché des transferts,
// blessures, calendrier, classement), au-dessus du même moteur de match
// (engine/rugby-engine.js) que le mode « Match rapide ». Aucune règle de jeu
// ici — uniquement gestion de club et sa persistance (localStorage), séparées
// du rendu (cf. docs/js/clubUI.js).
(function (global) {
  'use strict';

  const { DEFAULT_CONFIG } = global.RugbyEngine;
  // Incrémenté à chaque changement de forme des données sauvegardées : une
  // sauvegarde d'une version différente est ignorée (repart à zéro) plutôt que
  // de faire planter le jeu sur des champs manquants.
  // 3 : introduction du temps calendaire (docs/js/club-temps.js) — chaque
  // rencontre porte désormais une VRAIE date et la saison une date courante
  // + une graine.
  // 4 : événements quotidiens (docs/js/club-evenements.js) — `blessureJournees`
  // et la durée des prêts comptent maintenant des JOURS et non plus des
  // journées de championnat, puisque le temps s'écoule jour par jour.
  // Chaque migration est appliquée sans perte (cf. docs/js/club-sauvegarde.js).
  const VERSION_SAUVEGARDE = 7;

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
  // Libellé complet d'un poste — dans la couche DONNÉES et non dans l'UI :
  // les modules sans DOM en ont besoin aussi (cf. club-a-traiter.js). Une
  // seule table, jamais deux listes à garder en phase.
  const POSTE_COMPLET = {
    P: 'Pilier', T: 'Talonneur', '2L': 'Deuxième ligne', '3L': 'Troisième ligne',
    DM: 'Demi de mêlée', OV: 'Ouverture', AI: 'Ailier', CE: 'Centre', AR: 'Arrière',
  };
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
  let compteurMessageId = 1;
  // Génère le prochain id de joueur ('j1', 'j2'...) — exporté pour que des
  // domaines extraits hors de club.js (ex. docs/js/club-transferts-
  // internationaux.js) puissent créer un joueur avec un id valide sans muter
  // directement compteurJoueurId, une variable de module hors de leur
  // fermeture (même logique que resynchroniserCompteurPersonnel en tranche 1).
  function genererProchainIdJoueur() { return 'j' + compteurJoueurId++; }
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

  // Valeur de transfert estimée (k€, fictive) : même formule pour un joueur
  // libre du marché et pour un joueur d'un club adverse (fiche joueur
  // adverse) — dérivée uniquement de vitesse/plaquage/âge, jamais un chiffre
  // décoratif distinct de ce qui est utilisé ailleurs pour ce même calcul.
  function estimerValeurTransfert(vitesse, plaquage, age) {
    return Math.round((vitesse + plaquage) * 3 + (30 - Math.min(age, 30)) * 5);
  }

  // --- Effectif étendu (club du joueur) : genererJoueurEtendu,
  // genererEffectifEtendu — déplacés dans docs/js/club-generation-joueurs.js
  // (TODO_AUDIT.md P2-10, tranche 9). Toujours accessibles via RMClub.*,
  // comportement strictement inchangé. ---

  // --- Centre de formation (Mode Club) : genererJeune,
  // completerCentreFormation, genererCentreFormation, assurerCentreFormation,
  // promouvoirJeune, progresserCentreFormation — déplacés dans
  // docs/js/club-centre-formation.js (TODO_AUDIT.md P2-10, tranche 10).
  // Toujours accessibles via RMClub.*, comportement strictement inchangé. ---

  // Génère un joueur d'effectif pour le numéro donné (club ADVERSAIRE, IA) :
  // un effectif prêt à jouer de 15, SANS gestion complète (pas de fatigue/
  // blessures en cours de saison, pas de progression via entraînement — seul
  // le club du joueur est géré en détail au jour le jour). Il porte quand
  // même des attributs de contexte RÉELS (contrat, salaire, potentiel, moral,
  // valeur estimée) — générés une fois, comme pour un joueur du marché des
  // transferts — pour permettre une fiche joueur adverse honnête (cf.
  // clubUI.js, ouvrirFicheJoueurAdversaire), sans prétendre à un suivi
  // journée par journée qui n'existe pas pour l'IA.
  function genererJoueur(numero, rng, niveauClub) {
    const base = DEFAULT_CONFIG.joueurs[numero];
    const ecartNiveau = (niveauClub - 0.5) * 20;
    const bruit = () => (rng() * 12 - 6);
    const attributs = genererAttributsProfondeur(base, ecartNiveau, rng);
    const age = 18 + Math.floor(rng() * 17);
    const vitesse = borneStat(base.vitesse + ecartNiveau + bruit());
    const plaquage = borneStat(base.plaquage + ecartNiveau + bruit());
    const niveauActuel = (vitesse + plaquage + attributs.melee + attributs.touche
      + attributs.puissance + attributs.passe + attributs.jeuPied) / 7;
    return {
      numero,
      nom: genererNomJoueur(rng),
      poste: base.poste,
      age, vitesse, plaquage,
      adresse: borneAdresse((base.adresse != null ? base.adresse : 30) + ecartNiveau * 0.5 + bruit()),
      melee: attributs.melee, touche: attributs.touche, puissance: attributs.puissance,
      endurance: attributs.endurance, passe: attributs.passe, jeuPied: attributs.jeuPied,
      decision: attributs.decision, discipline: attributs.discipline,
      tendance: base.tendance,
      couloir: base.couloir,
      potentiel: genererPotentiel(niveauActuel, age, rng),
      contrat: 1 + Math.floor(rng() * 4),
      salaire: calculerSalaire(vitesse, plaquage, age),
      moral: 60 + Math.round(rng() * 10),
      blessureJournees: 0,
      valeurEstimee: estimerValeurTransfert(vitesse, plaquage, age),
    };
  }

  function genererEffectif(rng, niveauClub) {
    const effectif = [];
    for (let n = 1; n <= 15; n++) effectif.push(genererJoueur(n, rng, niveauClub));
    return effectif;
  }

  // --- Transferts internationaux (Mode Club) : approcher directement un
  // joueur d'un club ADVERSE (pas seulement le marché des joueurs libres) —
  // cf. clubUI.js, fiche joueur adverse dans l'onglet Autres clubs. Un club
  // ne vend jamais à prix cassé : le prix demandé dépend de la valeur du
  // joueur ET de son importance dans son équipe (un titulaire clé, nettement
  // au-dessus de la moyenne de son club, coûte plus cher et refuse plus
  // souvent qu'un remplaçant). ---
  // --- Transferts internationaux : calculerPrixDemandeAdverse,
  // convertirJoueurAdverseEnEffectifEtendu, approcherJoueurAdverse —
  // déplacés dans docs/js/club-transferts-internationaux.js (TODO_AUDIT.md
  // P2-10, tranche 8). Toujours accessibles via RMClub.*, comportement
  // strictement inchangé. Dépendaient de compteurJoueurId (variable de
  // module) : accèdent maintenant à RMClub.genererProchainIdJoueur(). ---

  let compteurId = 1;
  // Génère le prochain id de club ('club1', 'club2'...) — exporté pour que
  // des domaines extraits hors de club.js (ex. docs/js/club-pyramide.js)
  // puissent créer un club avec un id valide sans muter directement
  // compteurId, une variable de module hors de leur fermeture (même logique
  // que genererProchainIdJoueur pour compteurJoueurId).
  function genererProchainIdClub() { return 'club' + compteurId++; }

  // --- Génération d'un club adverse (IA) et pyramide française : genererClub,
  // budgetInitial, PALIERS_PYRAMIDE_FRANCE, nomPalierFrance,
  // TAILLE_DIVISION_FRANCE, bandeNiveauPalier, niveauxAdversairesPourPalier —
  // déplacés dans docs/js/club-pyramide.js (TODO_AUDIT.md P2-10, tranche 13).
  // Toujours accessibles via RMClub.*, comportement strictement inchangé. ---

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
      effectif: global.RMClub.genererEffectifEtendu(rng, niveauClub),
      // +80 k€ de capital de départ (repreneur) par rapport à un club IA au
      // même niveau : garantit qu'un petit club de Ligue Régionale garde une
      // vraie marge de manœuvre sur le marché des transferts (cf.
      // genererMarcheTransferts, calibré sur ce même niveauClub) — sans quoi
      // le budget d'un tout petit club ne suivrait jamais le prix, même
      // modeste, d'un joueur libre du même niveau.
      budget: global.RMClub.budgetInitial(niveauClub, rng) + 80,
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
      // Historique des confrontations (Mode Club) : résultats RÉELS des
      // matchs déjà joués contre chaque adversaire, clé = id du club adverse
      // (cf. enregistrerResultatClubJoueur) — alimente la page de détail de
      // cet adversaire (onglet Autres clubs).
      historiqueConfrontations: {},
      // Boîte de réception (Mode Club) : messages RÉELS générés par les
      // événements déjà produits par la simulation (cf. ajouterMessage) —
      // jamais un texte fabriqué uniquement pour l'affichage.
      messages: [],
      // Confiance du président / objectif de la saison (cf. determinerObjectifSaison/
      // evaluerObjectifSaison) : donne un vrai enjeu à la saison, dérivé du
      // classement RÉEL en fin de saison — jamais un score fabriqué.
      confiancePresident: 60,
      objectifSaison: null,
      // Centre de formation : vivier d'espoirs (cf. genererCentreFormation),
      // séparé de l'effectif pro — promouvable à tout moment de la saison
      // (pas seulement en fin de saison) via promouvoirJeune.
      jeunes: global.RMClub.genererCentreFormation(rng, niveauClub),
      // Position RÉELLE dans la pyramide française (cf. PALIERS_PYRAMIDE_FRANCE) —
      // ajustée à chaque fin de saison selon le classement final
      // (promotion/relégation, cf. avancerSaison), jamais un statut fabriqué.
      palierPyramide: { pays: 'FRA', niveau: 3 },
      // Qualification européenne acquise la saison dernière (si le club
      // jouait alors en Ligue d'Excellence et a fini dans les places
      // qualificatives) — cf. avancerSaison. null = aucune.
      qualificationEuropeenne: null,
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
  const CHAMPS_STATS_JOUEUR = ['matchsJoues', 'essais', 'passes', 'tacklesMade', 'tacklesAttempted', 'metresGagnes'];
  const LIBELLE_COMPETITION = { pro: 'Championnat', b: 'Équipe B', jeunes: 'Espoirs' };

  function statsVides() {
    const s = {};
    for (const champ of CHAMPS_STATS_JOUEUR) s[champ] = 0;
    return s;
  }

  // `competition` ('pro' | 'b' | 'jeunes', défaut 'pro' — rétrocompatible avec
  // les appels existants) : les statistiques sont VENTILÉES par compétition
  // (TODO_AUDIT.md P1-30) en plus du total. Le total reste exactement la
  // somme des compétitions, jamais un chiffre calculé à part.
  function accumulerStatsJoueurs(effectif, composition, statsJoueursMatch, competition) {
    if (!statsJoueursMatch || !composition) return;
    const cle = LIBELLE_COMPETITION[competition] ? competition : 'pro';
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    for (const numero of Object.keys(composition)) {
      const joueur = parId[composition[numero]];
      const s = statsJoueursMatch[numero];
      if (!joueur || !s) continue;
      if (!joueur.statsSaison) joueur.statsSaison = statsVides();
      if (!joueur.statsSaison.parCompetition) joueur.statsSaison.parCompetition = {};
      // Une compétition n'apparaît QUE si le joueur y a réellement joué :
      // pas de ligne « Équipe B — 0 match » fabriquée pour faire joli.
      if (!joueur.statsSaison.parCompetition[cle]) joueur.statsSaison.parCompetition[cle] = statsVides();
      const detail = joueur.statsSaison.parCompetition[cle];
      const apports = {
        matchsJoues: 1,
        essais: s.essais || 0,
        passes: s.passes || 0,
        tacklesMade: s.tacklesMade || 0,
        tacklesAttempted: s.tacklesAttempted || 0,
        metresGagnes: s.metresGagnes || 0,
      };
      for (const champ of CHAMPS_STATS_JOUEUR) {
        joueur.statsSaison[champ] = (joueur.statsSaison[champ] || 0) + apports[champ];
        detail[champ] += apports[champ];
      }
    }
  }

  // Archive la saison écoulée dans l'historique PERSONNEL d'un joueur, puis
  // remet son compteur de saison à zéro (TODO_AUDIT.md P1-30). Appelée par
  // avancerSaison pour tous les effectifs suivis. Rien n'est archivé pour un
  // joueur qui n'a pas joué : une ligne « 0 match » n'apprend rien.
  function archiverSaisonJoueur(joueur, saisonNumero, nomClub) {
    const s = joueur.statsSaison;
    if (s && s.matchsJoues > 0) {
      if (!Array.isArray(joueur.historiqueSaisons)) joueur.historiqueSaisons = [];
      const ligne = { saisonNumero, club: nomClub, age: joueur.age };
      for (const champ of CHAMPS_STATS_JOUEUR) ligne[champ] = s[champ] || 0;
      ligne.parCompetition = s.parCompetition || {};
      joueur.historiqueSaisons.push(ligne);
      // Borné : une carrière de 20 saisons reste lisible et la sauvegarde
      // ne gonfle pas indéfiniment.
      if (joueur.historiqueSaisons.length > 25) joueur.historiqueSaisons.shift();
    }
    joueur.statsSaison = null;
    joueur.matchsJoues = 0;
    return joueur;
  }

  // Totaux de CARRIÈRE : toutes les saisons archivées + la saison en cours.
  // Purement dérivé — jamais un compteur parallèle qui pourrait diverger.
  function carriereJoueur(joueur) {
    const total = statsVides();
    total.saisons = 0;
    for (const h of (joueur.historiqueSaisons || [])) {
      total.saisons++;
      for (const champ of CHAMPS_STATS_JOUEUR) total[champ] += h[champ] || 0;
    }
    const s = joueur.statsSaison;
    if (s && s.matchsJoues > 0) {
      total.saisons++;
      for (const champ of CHAMPS_STATS_JOUEUR) total[champ] += s[champ] || 0;
    }
    return total;
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
      // Origine du mouvement (cf. appliquerFinancesMatchEquipeB) — permet à
      // l'onglet Finances de distinguer une recette de billetterie Équipe B
      // (pas de salaires associés, déjà comptés une fois via le premier XV)
      // d'un mouvement du championnat principal. null = championnat principal.
      source: mouvement.source || null,
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

  // --- Composition et tactique : tactiqueVersConfig, effectifVersJoueursCfg,
  // compositionVersJoueursCfg, meilleurCandidatPourNumero,
  // meilleureComposition, completerComposition, validerComposition,
  // POSTE_REQUIS_BANC, completerCompositionBanc, numeroDuJoueurDansComposition,
  // autoDesignerEncadrement — déplacés dans docs/js/club-composition.js
  // (TODO_AUDIT.md P2-10, tranche 11). Toujours accessibles via RMClub.*,
  // comportement strictement inchangé. ---

  // --- Fatigue, moral, entraînement, blessures : appliquerFatigue,
  // appliquerMoral, ENTRAINEMENTS, appliquerEntrainement,
  // faireProgresserBlessures (plus bas dans ce fichier) — déplacés dans
  // docs/js/club-condition-joueurs.js (TODO_AUDIT.md P2-10, tranche 12).
  // Toujours accessibles via RMClub.*, comportement strictement inchangé. ---

  function masseSalariale(effectif) {
    return effectif.reduce((somme, j) => somme + j.salaire, 0);
  }

  // --- Personnel (Mode Club) : POSTES_PERSONNEL, genererMembrePersonnel,
  // genererMarchePersonnel, embaucherPersonnel, licencierPersonnel,
  // masseSalarialePersonnel, effetPersonnel — déplacés dans
  // docs/js/club-personnel.js (TODO_AUDIT.md P2-10, tranche 1 : premier
  // domaine extrait de ce fichier, entièrement autonome à l'exception de
  // deux aides génériques désormais exportées ci-dessus, choisir et
  // genererNomJoueur). Toujours accessibles via RMClub.*, comportement
  // strictement inchangé.

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
  // annuelle — joueurs ET personnel — répartie sur le vrai nombre de
  // journées de la saison (cf. RMClub.nombreJourneesSaison — 26 pour la
  // division de départ à 14 clubs, PAS une constante figée) — un budget qui
  // bouge vraiment avec les résultats, sans simuler des dizaines de lignes
  // comptables.
  //
  // Audit "économie de saison" : divisait auparavant par 10 (constante
  // héritée d'un ancien championnat à 10 journées), alors que la division de
  // départ compte 26 journées depuis l'introduction de la pyramide française
  // — la masse salariale annuelle était donc prélevée ~2,6× par saison au
  // lieu d'une fois. `nbJournees` est maintenant fourni par l'appelant (qui
  // connaît la vraie taille du calendrier de CETTE saison, cf. clubUI.js) ;
  // le repli à 26 ne sert qu'en dernier recours (ne devrait jamais être
  // sollicité, le calendrier a toujours au moins une journée).
  function appliquerFinancesMatch(club, forme, nbJournees) {
    // Stade (P1-44) : le niveau des tribunes multiplie RÉELLEMENT la recette.
    // Niveau 1 = facteur 1, donc une carrière qui n'investit jamais encaisse
    // exactement comme avant. Lu depuis le club lui-même : cette fonction ne
    // reçoit pas la saison.
    const infraStade = club.infrastructures && club.infrastructures.stade
      ? club.infrastructures.stade.niveau : 1;
    const facteurStade = 1 + (Math.max(1, infraStade) - 1) * 0.18;
    const recette = Math.round((40 + club.niveauClub * 120 + (forme === 'v' ? 25 : forme === 'n' ? 10 : 0)) * facteurStade);
    const revenuSponsor = club.sponsor ? club.sponsor.revenuParMatch : 0;
    const jours = nbJournees > 0 ? nbJournees : 26;
    const salaires = Math.round(masseSalariale(club.effectif) / jours);
    const salairesPersonnel = Math.round(global.RMClub.masseSalarialePersonnel(club) / jours);
    club.budget += recette + revenuSponsor - salaires - salairesPersonnel;
    return { recette, revenuSponsor, salaires, salairesPersonnel };
  }

  // Recette d'un match d'Équipe B (cf. RMClub.determinerEligiblesEquipeB) :
  // une billetterie réelle mais nettement plus modeste qu'un match de
  // première équipe (affluence bien plus faible) — AUCUN salaire redéduit
  // ici, ils sont déjà comptés une fois par journée via appliquerFinancesMatch
  // (le club paie son effectif dans son ensemble, pas par match individuel).
  function appliquerFinancesMatchEquipeB(club, forme) {
    const recette = Math.round(10 + club.niveauClub * 30 + (forme === 'v' ? 8 : forme === 'n' ? 3 : 0));
    club.budget += recette;
    return { recette, revenuSponsor: 0, salaires: 0, salairesPersonnel: 0, source: 'equipeB' };
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

  // --- Marché des transferts national : genererJoueurLibre,
  // genererMarcheTransferts, statsApparentes, estimationEtoiles,
  // scouterJoueur, calculerPrimeSignature, signerJoueur, libererJoueur,
  // basculerFavori — déplacés dans docs/js/club-transferts.js (TODO_AUDIT.md
  // P2-10, tranche 7). Toujours accessibles via RMClub.*, comportement
  // strictement inchangé. ---

  // --- Prêt (Mode Club) : preterJoueur, rappelerJoueur, progresserPrets —
  // déplacés dans docs/js/club-prets.js (TODO_AUDIT.md P2-10, tranche 4).
  // Toujours accessibles via RMClub.*, comportement strictement inchangé. ---

  // --- Renouvellement/négociation de contrat : calculerOffreRenouvellement,
  // renouvelerContrat, negocierRenouvellement — déplacés dans
  // docs/js/club-contrats.js (TODO_AUDIT.md P2-10, tranche 5). Toujours
  // accessibles via RMClub.*, comportement strictement inchangé. ---

  // --- Analyse du prochain adversaire : POSTES_AVANTS, moyenneAttribut,
  // ATTRIBUTS_ANALYSE, analyserAdversaire — déplacés dans
  // docs/js/club-analyse.js (TODO_AUDIT.md P2-10, tranche 3). Toujours
  // accessibles via RMClub.*, comportement strictement inchangé. ---

  // Calendrier aller-retour complet (méthode du cercle, championnat classique) :
  // TOUS les clubs s'affrontent deux fois chacun (une fois à domicile, une
  // fois à l'extérieur), et chaque JOURNÉE fait jouer TOUS les clubs en même
  // temps (n/2 matchs simultanés) — pas seulement le club du joueur. Avec n
  // clubs : n/2 matchs/journée, 2*(n-1) journées (aller + retour) — pour la
  // division de départ à 14 clubs (Ligue Régionale, cf. club-pyramide.js) :
  // 7 matchs/journée, 26 journées. Exige un nombre pair de clubs (sinon un
  // club serait au repos chaque journée).
  // --- Calendrier/classement : genererCalendrier, classementInitial,
  // enregistrerResultatDans, enregistrerResultat, classementTrieDe,
  // classementTrie, prochainesFixtures, club — déplacés dans
  // docs/js/club-calendrier.js (TODO_AUDIT.md P2-10, tranche 14). Toujours
  // accessibles via RMClub.*, comportement strictement inchangé. ---

  // --- Équipe B : determinerEligiblesEquipeB, genererCompetitionB,
  // assurerCompetitionB, enregistrerResultatEquipeB, prochaineRondeEquipeB,
  // effectifDisponiblePourEquipeB, appliquerEffetsMatchEquipeB — déplacés
  // dans docs/js/club-equipe-b.js (TODO_AUDIT.md P2-10, tranche 6). Toujours
  // accessibles via RMClub.*, comportement strictement inchangé. ---

  // --- Boîte de réception (Mode Club) : messages RÉELS générés par des
  // événements déjà produits ailleurs (transferts, prêts, contrats,
  // blessures, résultats, changements de saison) — jamais un texte
  // fabriqué uniquement pour l'affichage. Plafonnée à 40 entrées (les plus
  // récentes en tête), comme les autres journaux (historiqueFinances...). ---
  // `decision` (optionnel, 5e paramètre, TODO_AUDIT.md P1-15) : quand fourni,
  // le message porte un vrai choix ({ type, joueurId, options: [{id,
  // libelle}], resolu: false }) que le joueur doit trancher directement
  // depuis la boîte de réception (cf. RMClub.resoudreDecisionMessage) — pas
  // seulement un texte informatif à marquer comme lu.
  function ajouterMessage(saison, categorie, titre, corps, decision) {
    const c = saison.clubJoueur;
    if (!c.messages) c.messages = [];
    c.messages.unshift({
      id: 'msg' + compteurMessageId++,
      categorie, titre, corps,
      saisonNumero: saison.numero || 1,
      lu: false,
      decision: decision || null,
    });
    if (c.messages.length > 40) c.messages.length = 40;
  }
  function marquerMessageLu(saison, messageId) {
    const m = (saison.clubJoueur.messages || []).find((x) => x.id === messageId);
    if (m) m.lu = true;
  }
  function marquerTousMessagesLus(saison) {
    for (const m of (saison.clubJoueur.messages || [])) m.lu = true;
  }

  // Historique des confrontations (Mode Club) : résultat RÉEL de chaque
  // match déjà joué par le club du joueur contre UN adversaire donné —
  // alimente sa page de détail (onglet Autres clubs) et génère le message
  // de résultat correspondant dans la boîte de réception.
  function enregistrerResultatClubJoueur(saison, adversaireId, scorePour, scoreContre, journee) {
    const c = saison.clubJoueur;
    if (!c.historiqueConfrontations) c.historiqueConfrontations = {};
    const liste = c.historiqueConfrontations[adversaireId] || (c.historiqueConfrontations[adversaireId] = []);
    const resultat = scorePour > scoreContre ? 'v' : scorePour < scoreContre ? 'd' : 'n';
    liste.push({ saisonNumero: saison.numero || 1, journee, scorePour, scoreContre, resultat });
    if (liste.length > 20) liste.shift();
    const adv = global.RMClub.club(saison, adversaireId);
    const nomAdv = adv ? adv.nom : 'Adversaire';
    const libelle = resultat === 'v' ? 'Victoire' : resultat === 'd' ? 'Défaite' : 'Match nul';
    ajouterMessage(saison, 'match', `${libelle} contre ${nomAdv}`, `${scorePour} - ${scoreContre}`);
  }


  // --- Objectif de saison / confiance du président : determinerObjectifSaison,
  // libelleObjectifSaison, evaluerObjectifSaison — déplacés dans
  // docs/js/club-objectif.js (TODO_AUDIT.md P2-10, tranche 2 : fonctions
  // pures, aucun état de module, le domaine le plus simple à extraire).
  // Toujours accessibles via RMClub.*, comportement strictement inchangé. ---

  // Fin de saison (club du joueur) : vieillissement, fin de contrat, retraite,
  // recrutement de jeunes pour compenser les départs et garder l'effectif à sa
  // taille cible. Le budget et l'identité du club sont conservés ; calendrier
  // et classement repartent à zéro avec de nouveaux adversaires.
  // Vieillissement d'un effectif d'une saison à l'autre (TODO_AUDIT.md
  // P1-43a). Extrait TEL QUEL d'avancerSaison, où il ne servait qu'au club du
  // joueur : les clubs IA repartaient chaque été avec 24 inconnus. Une seule
  // règle de vieillissement dans tout le jeu, appelée aux deux endroits —
  // surtout pas une seconde copie qui divergerait.
  //
  // L'ordre des tirages `rng()` est strictement celui d'origine : la
  // trajectoire d'une carrière existante ne bouge pas d'un pouce.
  const ATTRIBUTS_VIEILLISSEMENT = ['vitesse', 'plaquage', 'melee', 'touche', 'puissance', 'endurance', 'passe', 'jeuPied', 'decision'];
  function vieillirEffectif(rng, effectif, niveauClub) {
    let reste = effectif.map((j) => {
      // Nouvelle saison, nouvelle fraîcheur : la fatigue et le compteur de
      // matchs (statistique de LA saison) repartent à zéro, comme la vraie
      // préparation estivale d'un club.
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
    const partis = [];
    reste = reste.filter((j) => {
      const retraite = j.age >= 37 || (j.age >= 34 && rng() < 0.25);
      const finDeContrat = j.contrat <= 0;
      if (retraite || finDeContrat) {
        const memePoste = reste.filter((x) => x.poste === j.poste).length;
        if (memePoste <= 1 && !retraite) { j.contrat = 1; return true; } // évite un poste à 0 joueur
        // `joueur` est ajouté pour le mercato des clubs IA (P1-43a), qui a
        // besoin du joueur RÉEL pour le faire changer de club au lieu de le
        // faire disparaître. Champ additionnel : les appelants historiques ne
        // lisent que nom/poste/motif et ne changent pas de comportement.
        partis.push({ nom: j.nom, poste: j.poste, motif: retraite ? 'retraite' : 'fin de contrat', joueur: j });
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
      const jeune = global.RMClub.genererJoueurEtendu(posteManquant, rng, niveauClub);
      jeune.age = 18 + Math.floor(rng() * 3); // jeunes espoirs, 18-20 ans
      jeune.contrat = 2 + Math.floor(rng() * 2);
      jeune.salaire = calculerSalaire(jeune.vitesse, jeune.plaquage, jeune.age);
      reste.push(jeune);
      arrivees.push({ nom: jeune.nom, poste: jeune.poste });
    }
    return { reste, partis, arrivees };
  }

  function avancerSaison(rng, saison) {
    const effectif = saison.clubJoueur.effectif;
    // Archive la saison écoulée dans l'historique PERSONNEL de chaque joueur
    // AVANT de remettre ses compteurs à zéro (TODO_AUDIT.md P1-30) — pour
    // l'effectif pro ET le centre de formation. Sans ça, une carrière de dix
    // saisons ne laissait aucune trace : seul le total du club survivait.
    for (const j of effectif) archiverSaisonJoueur(j, saison.numero, saison.clubJoueur.nom);
    for (const j of (saison.clubJoueur.jeunes || [])) archiverSaisonJoueur(j, saison.numero, saison.clubJoueur.nom);
    const evolution = vieillirEffectif(rng, effectif, saison.clubJoueur.niveauClub);
    const reste = evolution.reste;
    const partis = evolution.partis;
    const arrivees = evolution.arrivees;
    saison.clubJoueur.effectif = reste;

    // Centre de formation : vieillit et se reconstitue indépendamment de
    // l'effectif pro (cf. progresserCentreFormation).
    global.RMClub.progresserCentreFormation(rng, saison);

    // Archive un résumé RÉEL de la saison qui vient de s'achever (classement
    // final, bilan, essais, budget) AVANT de tout réinitialiser ci-dessous —
    // alimente l'écran Bilan "évolution sur plusieurs saisons", jamais une
    // valeur recalculée après coup.
    if (!saison.clubJoueur.historiqueSaisons) saison.clubJoueur.historiqueSaisons = [];
    // Sauvegarde antérieure à cette fonctionnalité : pas d'objectif à évaluer
    // cette fois (evaluerObjectifSaison renverra null), mais initialise la
    // confiance pour que la saison suivante en ait bien une réelle à ajuster.
    if (saison.clubJoueur.confiancePresident == null) saison.clubJoueur.confiancePresident = 60;
    const classementFinal = global.RMClub.classementTrie(saison);
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
    ajouterMessage(saison, 'saison', `Fin de saison ${saison.numero || 1}`,
      `Classement final : ${positionFinale}e/${classementFinal.length}. ${arrivees.length} arrivée(s), ${partis.length} départ(s).`);

    // Bilan de l'objectif de la saison qui vient de s'achever (fixé au début
    // de CETTE saison, cf. plus bas pour la prochaine) et ajustement RÉEL de
    // la confiance du président — jamais un chiffre fabriqué, dérivé du
    // classement final qu'on vient de calculer.
    const confianceAvant = saison.clubJoueur.confiancePresident != null ? saison.clubJoueur.confiancePresident : 60;
    const bilanObjectif = global.RMClub.evaluerObjectifSaison(saison.clubJoueur.objectifSaison, positionFinale, confianceAvant);
    if (bilanObjectif) {
      saison.clubJoueur.confiancePresident = bilanObjectif.confiance;
      const verdict = bilanObjectif.reussi ? 'Objectif atteint' : 'Objectif manqué';
      ajouterMessage(saison, 'saison', `${verdict} : ${global.RMClub.libelleObjectifSaison(saison.clubJoueur.objectifSaison)}`,
        `Confiance du président : ${bilanObjectif.confiance}% (${bilanObjectif.delta >= 0 ? '+' : ''}${bilanObjectif.delta}).`);
    }

    // Promotion/relégation RÉELLE dans la pyramide française (cf.
    // PALIERS_PYRAMIDE_FRANCE) — dérivée du classement final qu'on vient de
    // calculer, jamais un tirage arbitraire. Rétrocompat : une sauvegarde
    // antérieure à cette fonctionnalité repart en Ligue d'Excellence (pas de
    // Régionale rétroactive qui pénaliserait une progression déjà acquise).
    if (!saison.clubJoueur.palierPyramide) saison.clubJoueur.palierPyramide = { pays: 'FRA', niveau: 1 };
    const palierAvant = saison.clubJoueur.palierPyramide;
    const totalClubsLigue = classementFinal.length;
    let nouveauNiveauPalier = palierAvant.niveau;
    let mouvementPalier = null;
    if (palierAvant.niveau > 1 && positionFinale <= 2) { nouveauNiveauPalier = palierAvant.niveau - 1; mouvementPalier = 'promotion'; }
    else if (palierAvant.niveau < 3 && positionFinale >= totalClubsLigue - 1) { nouveauNiveauPalier = palierAvant.niveau + 1; mouvementPalier = 'relegation'; }
    saison.clubJoueur.palierPyramide = { pays: 'FRA', niveau: nouveauNiveauPalier };
    if (mouvementPalier === 'promotion') {
      ajouterMessage(saison, 'saison', 'Promotion !',
        `${positionFinale}e place : le club monte en ${global.RMClub.nomPalierFrance(nouveauNiveauPalier)} la saison prochaine.`);
    } else if (mouvementPalier === 'relegation') {
      ajouterMessage(saison, 'saison', 'Relégation',
        `${positionFinale}e place : le club descend en ${global.RMClub.nomPalierFrance(nouveauNiveauPalier)} la saison prochaine.`);
    }

    // Carrière du manager (TODO_AUDIT.md P1-42) : on enregistre la saison qui
    // s'achève avec le bilan RÉEL déjà calculé ci-dessus — aucune donnée
    // recalculée — puis on en tire la conséquence sur son emploi. Appel
    // défensif, comme les autres domaines chargés après club.js.
    if (global.RMClub.enregistrerSaisonManager) {
      const budgetAvantSaison = (saison.clubJoueur.historiqueSaisons.length > 1)
        ? saison.clubJoueur.historiqueSaisons[saison.clubJoueur.historiqueSaisons.length - 2].budget
        : saison.clubJoueur.budget;
      global.RMClub.enregistrerSaisonManager(saison, {
        numeroSaison: saison.numero || 1,
        position: positionFinale, totalClubs: classementFinal.length,
        objectifAtteint: bilanObjectif ? bilanObjectif.reussi : null,
        mouvement: mouvementPalier,
        niveauDivision: palierAvant.niveau,
        budgetFin: saison.clubJoueur.budget,
        deltaBudget: saison.clubJoueur.budget - budgetAvantSaison,
      });
      const securite = global.RMClub.securiteEmploi(saison);
      if (securite.niveau === 'licenciement') {
        global.RMClub.licencierManager(saison, securite.explication);
      } else if (securite.niveau === 'avertissement') {
        saison.manager.avertissements.push({
          type: 'avertissement', saison: saison.numero || 1, raison: securite.explication,
        });
        ajouterMessage(saison, 'direction', 'Avertissement de la direction', securite.explication);
      }
    }
    // Qualification européenne (cf. docs/js/world.js, mêmes règles) :
    // seulement possible en jouant CETTE saison en Ligue d'Excellence
    // (palier 1), dérivée du classement final réel — jamais fabriquée.
    let qualificationEuropeenne = null;
    if (palierAvant.niveau === 1) {
      if (positionFinale <= 2) qualificationEuropeenne = 'continentale';
      else if (positionFinale <= 4) qualificationEuropeenne = 'challenge';
    }
    saison.clubJoueur.qualificationEuropeenne = qualificationEuropeenne;
    if (qualificationEuropeenne === 'continentale') {
      ajouterMessage(saison, 'saison', 'Qualification européenne !',
        'Le club valide sa place en Coupe des Champions Continentale la saison prochaine.');
    } else if (qualificationEuropeenne === 'challenge') {
      ajouterMessage(saison, 'saison', 'Qualification européenne',
        'Le club valide sa place en Coupe Challenge Continentale la saison prochaine.');
    }

    // Évolution des clubs adverses d'une saison à l'autre : si le palier du
    // joueur change, ce sont de NOUVEAUX rivaux (nouvelle division, cf.
    // niveauxAdversairesPourPalier) — sinon, évolution RÉELLE des mêmes
    // adversaires selon leur classement final (pas un tirage figé), comme
    // avant ce patch : finir dans le haut du tableau les renforce
    // légèrement, finir en bas les affaiblit. L'identité du club (nom,
    // couleur, id) persiste dans ce second cas, seul l'effectif est
    // régénéré au nouveau niveau (renouvellement d'effectif normal).
    const adversaires = mouvementPalier
      ? global.RMClub.niveauxAdversairesPourPalier(nouveauNiveauPalier).map((niveauClub) => global.RMClub.genererClub(rng, { niveauClub }))
      : saison.adversaires.map((ancien) => {
        const rang = classementFinal.findIndex((r) => r.clubId === ancien.id) + 1;
        const total = classementFinal.length;
        const delta = rang <= 2 ? 0.05 : rang >= total - 1 ? -0.05 : 0;
        const niveauClub = Math.max(0.15, Math.min(0.9, (ancien.niveauClub != null ? ancien.niveauClub : 0.5) + delta));
        // TODO_AUDIT.md P1-43a : on CONSERVE le club tel qu'il est — ses 24
        // joueurs réels (groupe), sa feuille de match, son budget. Avant, cette
        // ligne re-tirait `effectif` et abandonnait `groupe`/`banc` : mesuré,
        // 24 partis et 24 arrivées sur chaque club chaque été, donc aucun
        // joueur du monde ne gardait son identité. Le vieillissement, les
        // retraites et les transferts sont appliqués juste après, par
        // avancerIntersaisonClubsIA.
        return Object.assign({}, ancien, { niveauClub });
      });
    saison.adversaires = adversaires;
    // Intersaison des clubs IA (TODO_AUDIT.md P1-43a) : ils vieillissent,
    // perdent leurs anciens, comblent leurs trous et s'échangent réellement
    // des joueurs. Appel défensif comme les autres domaines chargés après
    // club.js — sans le module, le monde reste simplement figé comme avant.
    // En cas de promotion/relégation, les adversaires sont de NOUVEAUX clubs
    // tout juste générés : rien à faire vieillir cette année-là.
    if (!mouvementPalier && global.RMClub.avancerIntersaisonClubsIA) {
      const mercato = global.RMClub.avancerIntersaisonClubsIA(rng, saison);
      if (global.RMClub.messageMercato) global.RMClub.messageMercato(saison, mercato);
    } else {
      saison.mercato = { saison: (saison.numero || 1) + 1, transferts: [], retraites: [] };
    }
    const tousLesClubs = [saison.clubJoueur, ...adversaires];
    saison.calendrier = global.RMClub.genererCalendrier(tousLesClubs);
    saison.classement = global.RMClub.classementInitial(tousLesClubs);
    // Éligibilité à l'Équipe B réévaluée chaque saison (les budgets ont
    // bougé) — cf. determinerEligiblesEquipeB.
    saison.competitionB = global.RMClub.genererCompetitionB(tousLesClubs);
    // Amicaux de la saison écoulée (TODO_AUDIT.md P1-32) : le calendrier est
    // entièrement redaté, une rencontre programmée l'an dernier n'a plus de
    // date valable. On repart d'une feuille blanche.
    if (global.RMClub.reinitialiserAmicaux) global.RMClub.reinitialiserAmicaux(saison);
    // Coupes (TODO_AUDIT.md P1-34) : régénérées avec les nouveaux
    // adversaires et les nouvelles dates, comme le championnat espoirs.
    if (global.RMClub.reinitialiserCoupes) global.RMClub.reinitialiserCoupes(saison);
    // Championnat des espoirs : régénéré avec les nouveaux adversaires.
    saison.competitionEspoirs = null;
    // Marché des transferts calibré sur le NIVEAU RÉEL du club du joueur
    // (pas un 0.5 fixe) : un petit club de Ligue Régionale n'attire pas les
    // mêmes joueurs libres qu'un cador de Ligue d'Excellence.
    saison.marche = global.RMClub.genererMarcheTransferts(rng, saison.clubJoueur.niveauClub, 6);
    saison.marchePersonnel = global.RMClub.genererMarchePersonnel(rng, 5);
    saison.numero = (saison.numero || 1) + 1;
    // Nouvelle saison sportive = nouvelle année civile : le temps repart à
    // l'intersaison de l'année suivante et le calendrier tout neuf est daté
    // (cf. club-temps.js / club-agenda.js). Les matchs espoirs archivés
    // appartenaient à la saison écoulée : ils repartent à zéro comme les
    // autres compteurs de saison.
    saison.clubJoueur.matchsEspoirs = [];
    global.RMClub.reinitialiserTempsPourSaison(saison, saison.numero);
    global.RMClub.daterCalendrier(saison);
    // Groupe complet + feuille de match de chaque club adverse
    // (TODO_AUDIT.md P1-29) : ils vivent dès le premier jour. Appel défensif
    // (comme les autres domaines optionnels) : club.js ne doit jamais
    // dépendre DUREMENT d'un module chargé après lui — sans ce garde-fou,
    // une balise <script> manquante casserait la création d'une carrière au
    // lieu de simplement priver les adversaires de leur banc.
    if (global.RMClub.assurerEffectifsAdverses) global.RMClub.assurerEffectifsAdverses(saison);
    // Objectif de la saison qui COMMENCE, basé sur le classement RÉEL qu'on
    // vient d'archiver dans historiqueSaisons (donc y compris celui de la
    // saison qui vient de s'achever) — jamais une ambition fabriquée.
    saison.clubJoueur.objectifSaison = global.RMClub.determinerObjectifSaison(saison.clubJoueur.historiqueSaisons, tousLesClubs.length);
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
  function nouvelleSaison(rng, nomClubJoueur, nomManager) {
    // Débute tout en bas de la pyramide française (Ligue Régionale, cf.
    // PALIERS_PYRAMIDE_FRANCE) : un petit club modeste, comme les adversaires
    // qu'il affronte à ce palier — la progression vers le sommet se fait
    // ensuite réellement, saison après saison (cf. avancerSaison).
    const niveauDepart = global.RMClub.bandeNiveauPalier(3).min + (global.RMClub.bandeNiveauPalier(3).max - global.RMClub.bandeNiveauPalier(3).min) * 0.5;
    const clubJoueur = genererClubJoueur(rng, { nom: nomClubJoueur, niveauClub: niveauDepart });
    snapshotAttributsDebutSaison(clubJoueur.effectif);
    const adversaires = [];
    const niveaux = global.RMClub.niveauxAdversairesPourPalier(3); // du plus faible au plus fort, pour ce palier
    for (const niveauClub of niveaux) adversaires.push(global.RMClub.genererClub(rng, { niveauClub }));
    const tousLesClubs = [clubJoueur, ...adversaires];
    clubJoueur.objectifSaison = global.RMClub.determinerObjectifSaison(clubJoueur.historiqueSaisons, tousLesClubs.length);
    // Graine de la SAISON : rend toute la progression quotidienne
    // reproductible (cf. club-temps.js, grainePourJour) — deux carrières
    // créées avec la même graine de départ vivent exactement la même saison.
    // Tirée du rng fourni par l'appelant, jamais de Math.random.
    const graine = Math.floor(rng() * 0xffffffff) >>> 0;
    const saison = {
      version: VERSION_SAUVEGARDE,
      numero: 1,
      graine,
      clubJoueur,
      adversaires,
      calendrier: global.RMClub.genererCalendrier(tousLesClubs),
      classement: global.RMClub.classementInitial(tousLesClubs),
      competitionB: global.RMClub.genererCompetitionB(tousLesClubs),
      // Marché calibré sur le niveau réel du club (petit club = marché
      // modeste) — jamais un 0.5 fixe déconnecté de la pyramide.
      marche: global.RMClub.genererMarcheTransferts(rng, clubJoueur.niveauClub, 6),
      marchePersonnel: global.RMClub.genererMarchePersonnel(rng, 5),
      favoris: [],
    };
    // Temps calendaire : date de début d'intersaison + dates réelles sur
    // chaque rencontre (championnat le samedi, Équipe B le dimanche).
    global.RMClub.reinitialiserTempsPourSaison(saison, 1);
    global.RMClub.daterCalendrier(saison);
    // Groupe complet + feuille de match de chaque club adverse
    // (TODO_AUDIT.md P1-29) : ils vivent dès le premier jour. Appel défensif
    // (comme les autres domaines optionnels) : club.js ne doit jamais
    // dépendre DUREMENT d'un module chargé après lui — sans ce garde-fou,
    // une balise <script> manquante casserait la création d'une carrière au
    // lieu de simplement priver les adversaires de leur banc.
    if (global.RMClub.assurerEffectifsAdverses) global.RMClub.assurerEffectifsAdverses(saison);
    // Profil de manager (TODO_AUDIT.md P1-42) : créé À CÔTÉ du club, jamais
    // dedans — c'est ce qui permet d'en changer sans perdre la carrière.
    // Appel défensif, comme les autres domaines chargés après club.js.
    if (global.RMClub.assurerManager) global.RMClub.assurerManager(saison, nomManager);
    return saison;
  }

  // Audit P0-1 (TODO_AUDIT.md) : compteurJoueurId/compteurMessageId/
  // compteurPersonnelId/compteurId sont des variables de module réinitialisées
  // à CHAQUE chargement du script (donc à chaque rechargement de page) alors
  // que la sauvegarde, elle, contient déjà des identifiants avancés — sans
  // resynchronisation, toute création après un F5 (joueur signé, message,
  // personnel embauché, club adverse régénéré après une montée/descente)
  // repart d'un compteur à 1 et entre en collision avec un id déjà utilisé
  // (deux joueurs ou deux clubs partageant le même id, résolutions faussées
  // via `.find(j => j.id === id)` ou `club(saison, id)`). Recalcule chaque
  // compteur au-delà du plus grand id déjà présent dans la sauvegarde
  // rechargée, une seule fois, ici — jamais lors d'un simple appel de
  // fonction dans la même session (les compteurs y sont déjà à jour).
  function resynchroniserCompteurs(saison) {
    const idNumerique = global.RMClub.idNumerique;
    let maxJoueur = 0, maxMessage = 0, maxPersonnel = 0, maxClub = 0;
    const c = saison.clubJoueur;
    if (c) {
      maxClub = Math.max(maxClub, idNumerique(c.id, 'club'));
      for (const j of c.effectif || []) maxJoueur = Math.max(maxJoueur, idNumerique(j.id, 'j'));
      for (const j of c.jeunes || []) maxJoueur = Math.max(maxJoueur, idNumerique(j.id, 'j'));
      for (const m of c.messages || []) maxMessage = Math.max(maxMessage, idNumerique(m.id, 'msg'));
      for (const p of c.personnel || []) maxPersonnel = Math.max(maxPersonnel, idNumerique(p.id, 'staff'));
    }
    for (const a of saison.adversaires || []) maxClub = Math.max(maxClub, idNumerique(a.id, 'club'));
    for (const j of saison.marche || []) maxJoueur = Math.max(maxJoueur, idNumerique(j.id, 'j'));
    for (const j of saison.favoris || []) maxJoueur = Math.max(maxJoueur, idNumerique(j.id, 'j'));
    for (const p of saison.marchePersonnel || []) maxPersonnel = Math.max(maxPersonnel, idNumerique(p.id, 'staff'));
    compteurJoueurId = Math.max(compteurJoueurId, maxJoueur + 1);
    compteurMessageId = Math.max(compteurMessageId, maxMessage + 1);
    // compteurPersonnelId vit maintenant dans docs/js/club-personnel.js (cf.
    // TODO_AUDIT.md P2-10) : resynchronisé via cette fonction exportée plutôt
    // qu'une mutation directe, impossible depuis ce fichier (variable hors de
    // sa fermeture). Même logique de resynchronisation qu'avant, déplacée.
    global.RMClub.resynchroniserCompteurPersonnel(maxPersonnel);
    compteurId = Math.max(compteurId, maxClub + 1);
  }

  // --- Sauvegarde/migration : sauvegarderSaison, idNumerique,
  // saisonEstValide, migrerSaison, conserverSecours,
  // consulterAvertissementChargement, effacerAvertissementChargement,
  // chargerSaison, effacerSaison — déplacés dans docs/js/club-sauvegarde.js
  // (TODO_AUDIT.md P2-10, tranche 15). Toujours accessibles via RMClub.*,
  // comportement strictement inchangé. ---

  // Fusionne avec ce que docs/js/club-personnel.js (chargé avant ou après,
  // l'ordre n'importe pas) a déjà posé sur global.RMClub — jamais une simple
  // réaffectation, qui écraserait ses fonctions si son <script> était chargé
  // en premier (cf. TODO_AUDIT.md P2-10).
  global.RMClub = Object.assign(global.RMClub || {}, {
    choisir, genererNomJoueur, calculerSalaire,
    genererNomClub, genererEffectif, COULEURS, genererProchainIdClub, POSTE_COMPLET,
    nouvelleSaison,
    resynchroniserCompteurs, VERSION_SAUVEGARDE,
    POSTE_REQUIS, TAILLE_EFFECTIF_CIBLE,
    masseSalariale, appliquerFinancesMatch, appliquerFinancesMatchEquipeB,
    avancerSaison, vieillirEffectif,
    AXES_TACTIQUE,
    accumulerStats, enregistrerMouvementFinances,
    accumulerStatsJoueurs, classementMarqueurs,
    archiverSaisonJoueur, carriereJoueur, CHAMPS_STATS_JOUEUR, LIBELLE_COMPETITION,
    ajouterMessage,
    prevoirFinances,
    calculerProgression,
    enregistrerResultatClubJoueur, marquerMessageLu, marquerTousMessagesLus,
    estimerValeurTransfert,
    GABARIT_EFFECTIF, ARCHETYPE_PAR_POSTE,
    borneStat, borneAdresse, genererAttributsProfondeur, genererPotentiel,
    genererJoueur, genererProchainIdJoueur,
  });
})(window);
