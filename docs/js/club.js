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

  // --- Centre de formation (Mode Club) : un vivier d'espoirs (16-18 ans),
  // séparé de l'effectif professionnel, qu'on peut promouvoir en équipe
  // première (cf. promouvoirJeune) quand l'effectif senior n'a plus assez de
  // joueurs disponibles à un poste (blessures/prêts cumulés en cours de
  // saison) — ou aligner tel quel pour un match d'Équipe B (cf.
  // effectifDisponiblePourEquipeB) sans les promouvoir. Assez d'espoirs par
  // ligne de poste pour aligner une équipe B complète à lui seul (cf.
  // QUOTA_CENTRE_FORMATION), même les jours où l'effectif pro senior est
  // utilisé à 100% (titulaires + banc). Mêmes attributs qu'un joueur pro
  // (donc utilisable normalement en composition une fois promu), avec un net
  // déficit de niveau actuel — leur POTENTIEL, lui, n'est pas pénalisé (cf.
  // genererPotentiel : la marge de progression d'un très jeune joueur est
  // réelle et large), donc certains deviendront meilleurs que ce que suggère
  // leur niveau d'aujourd'hui. ---
  const POSTES_CATEGORIES = ['P', 'T', '2L', '3L', 'DM', 'OV', 'CE', 'AI', 'AR'];
  // Nombre d'espoirs requis PAR LIGNE DE POSTE pour que le centre de
  // formation puisse à lui seul aligner une équipe B complète (15 postes),
  // même quand l'effectif pro senior est utilisé à 100% (titulaires + banc) —
  // dérivé directement de POSTE_REQUIS (2 piliers, 2 deuxième ligne, 3
  // troisième ligne, 2 centres, 2 ailiers...), jamais un chiffre arbitraire.
  const QUOTA_CENTRE_FORMATION = {};
  for (const numero of Object.keys(POSTE_REQUIS)) {
    const poste = POSTE_REQUIS[numero];
    QUOTA_CENTRE_FORMATION[poste] = (QUOTA_CENTRE_FORMATION[poste] || 0) + 1;
  }
  function genererJeune(poste, rng, niveauClub) {
    const base = ARCHETYPE_PAR_POSTE[poste];
    const ecartNiveau = (niveauClub - 0.5) * 20;
    const bruit = () => (rng() * 12 - 6);
    const age = 16 + Math.floor(rng() * 3); // 16-18 ans
    const malusJeunesse = -14; // pas encore le niveau professionnel
    const vitesse = borneStat(base.vitesse + ecartNiveau + malusJeunesse + bruit());
    const plaquage = borneStat(base.plaquage + ecartNiveau + malusJeunesse + bruit());
    const adresse = borneAdresse((base.adresse != null ? base.adresse : 30) + ecartNiveau * 0.5 + malusJeunesse + bruit());
    const attributs = genererAttributsProfondeur(base, ecartNiveau + malusJeunesse, rng);
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
      contrat: 2 + Math.floor(rng() * 2), // contrat espoir (formation)
      salaire: Math.max(3, Math.round(calculerSalaire(vitesse, plaquage, age) * 0.4)),
      blessureJournees: 0, fatigue: 0, moral: 65 + Math.round(rng() * 10),
      pret: null, matchsJoues: 0, statsSaison: null, attributsDebutSaison: null, entrainementIndividuel: null,
    };
  }
  // Complète un vivier existant jusqu'au quota par ligne de poste (cf.
  // QUOTA_CENTRE_FORMATION) — utilisé aussi bien à la création du club qu'au
  // renouvellement annuel du centre de formation. Le quota (et pas seulement
  // "au moins un") est essentiel : une équipe B doit pouvoir être alignée
  // par le centre de formation SEUL un jour où l'effectif pro senior est
  // utilisé à 100% (titulaires + banc), donc sans aucune réserve pro
  // disponible à certaines lignes (2e/3e ligne, centres, ailiers...).
  function completerCentreFormation(rng, jeunes, niveauClub) {
    for (const poste of POSTES_CATEGORIES) {
      const present = jeunes.filter((j) => j.poste === poste).length;
      const requis = QUOTA_CENTRE_FORMATION[poste] || 1;
      for (let i = present; i < requis; i++) jeunes.push(genererJeune(poste, rng, niveauClub));
    }
    return jeunes;
  }
  function genererCentreFormation(rng, niveauClub) {
    return completerCentreFormation(rng, [], niveauClub);
  }
  // Backward-compat : une sauvegarde antérieure à cette fonctionnalité n'a
  // pas de champ `jeunes` — le crée à la première consultation plutôt que
  // d'attendre la prochaine fin de saison (cf. clubUI.js).
  function assurerCentreFormation(rng, saison) {
    const c = saison.clubJoueur;
    if (!c.jeunes) c.jeunes = completerCentreFormation(rng, [], c.niveauClub);
    return c.jeunes;
  }
  // Promotion définitive d'un espoir vers l'effectif professionnel — il
  // quitte le centre de formation et devient sélectionnable normalement en
  // composition, comme n'importe quel joueur pro (cf. clubUI.js, onglet
  // Effectif : "Centre de formation").
  function promouvoirJeune(saison, jeuneId) {
    const c = saison.clubJoueur;
    if (!c.jeunes) c.jeunes = [];
    const idx = c.jeunes.findIndex((j) => j.id === jeuneId);
    if (idx === -1) return { ok: false, motif: 'introuvable' };
    const jeune = c.jeunes.splice(idx, 1)[0];
    c.effectif.push(jeune);
    ajouterMessage(saison, 'jeunes', 'Promotion en équipe première',
      `${jeune.nom} (${jeune.age} ans, ${jeune.poste}) quitte le centre de formation pour rejoindre le groupe professionnel.`);
    return { ok: true, joueur: jeune };
  }
  // Progression annuelle du centre de formation (fin de saison, cf.
  // avancerSaison) : les espoirs non promus vieillissent comme le reste de
  // l'effectif ; au-delà de 19 ans, un espoir non promu part poursuivre sa
  // carrière ailleurs (rien à voir avec l'effectif pro, qui a son propre
  // cycle de fin de contrat/retraite) — le centre est ensuite reconstitué à
  // une couverture complète pour la saison qui commence.
  function progresserCentreFormation(rng, saison) {
    const c = saison.clubJoueur;
    if (!c.jeunes) c.jeunes = [];
    const partis = [];
    c.jeunes = c.jeunes.filter((j) => {
      j.age += 1;
      if (j.age > 19) { partis.push(j.nom); return false; }
      return true;
    });
    completerCentreFormation(rng, c.jeunes, c.niveauClub);
    if (partis.length) {
      ajouterMessage(saison, 'jeunes', 'Centre de formation',
        `${partis.join(', ')} quitte(nt) le centre de formation sans avoir été promu(s) en équipe première.`);
    }
  }

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
  function genererClub(rng, { nom, niveauClub = 0.5 } = {}) {
    return {
      id: 'club' + (compteurId++),
      nom: nom || genererNomClub(rng),
      couleur: choisir(rng, COULEURS),
      niveauClub,
      effectif: genererEffectif(rng, niveauClub),
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
      budget: budgetInitial(niveauClub, rng) + 80,
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
      jeunes: genererCentreFormation(rng, niveauClub),
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

  // Meilleur candidat dispo pour un NUMÉRO donné (donc un poste requis) :
  // priorité aux joueurs de ce poste naturel, mais un joueur d'un autre poste
  // peut dépanner si le poste naturel n'a plus personne de disponible (cf.
  // rafraichirTerrain/rafraichirBanc côté UI, qui offre le même choix
  // manuellement — un vrai effectif de rugby fait tourner ses polyvalents
  // plutôt que de jouer à 14). Un joueur prêté (cf. preterJoueur) reste une
  // exclusion DURE : il n'est tout simplement pas dans l'effectif du jour.
  function meilleurCandidatPourNumero(effectif, poste, utilises) {
    let candidats = effectif.filter((j) => j.poste === poste && !j.pret && !utilises.has(j.id));
    if (candidats.length === 0) candidats = effectif.filter((j) => !j.pret && !utilises.has(j.id));
    if (candidats.length === 0) return null;
    const disponibles = candidats.filter((j) => !j.blessureJournees);
    const pool = disponibles.length > 0 ? disponibles : candidats;
    pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
    return pool[0];
  }

  // Compose automatiquement la meilleure équipe disponible : pour chaque
  // numéro, le meilleur candidat dispo (cf. meilleurCandidatPourNumero),
  // NON BLESSÉ de préférence, qui n'est pas déjà titularisé ailleurs.
  function meilleureComposition(effectif) {
    const utilises = new Set();
    const composition = {};
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const meilleur = meilleurCandidatPourNumero(effectif, POSTE_REQUIS[numero], utilises);
      if (!meilleur) continue;
      composition[numero] = meilleur.id;
      utilises.add(meilleur.id);
    }
    return composition;
  }

  // Complète une composition PARTIELLE (choix déjà faits par le joueur, ou
  // chargée depuis une saison sauvegardée) sans écraser les choix valides :
  // ne remplace que les numéros vides ou invalides (joueur libéré, doublon)
  // par le meilleur joueur disponible restant. N'importe quel joueur peut
  // occuper n'importe quel poste (polyvalence assumée, cf.
  // meilleurCandidatPourNumero) — un choix manuel hors poste naturel doit
  // donc survivre au rafraîchissement, pas être écrasé au tour suivant.
  // Utilisé à l'ouverture de l'écran de composition — la version "table
  // rase" reste meilleureComposition (bouton "meilleure équipe possible").
  function completerComposition(effectif, compositionPartielle) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const composition = {};
    const utilises = new Set();
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const id = compositionPartielle && compositionPartielle[numero];
      const j = id && parId[id];
      if (j && !j.pret && !utilises.has(id)) {
        composition[numero] = id;
        utilises.add(id);
      }
    }
    for (const numero of Object.keys(POSTE_REQUIS)) {
      if (composition[numero]) continue;
      const meilleur = meilleurCandidatPourNumero(effectif, POSTE_REQUIS[numero], utilises);
      if (!meilleur) continue;
      composition[numero] = meilleur.id;
      utilises.add(meilleur.id);
    }
    return composition;
  }

  // Vérifie qu'un numéro a bien un joueur assigné à CHAQUE poste avant de
  // lancer un match — completerComposition peut laisser un numéro vide si
  // aucun joueur de ce poste n'est disponible (tous prêtés/partis), ce qui
  // enverrait une config incomplète au moteur. Retourne les postes manquants
  // (liste vide = composition valide).
  function validerComposition(composition) {
    const manquants = [];
    for (const numero of Object.keys(POSTE_REQUIS)) {
      if (!composition || !composition[numero]) manquants.push({ numero: Number(numero), poste: POSTE_REQUIS[numero] });
    }
    return manquants;
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
      if (j && !j.pret && !utilisesTitulaires.has(id) && !utilisesBanc.has(id)) {
        banc[numero] = id;
        utilisesBanc.add(id);
      }
    }
    for (const numero of Object.keys(POSTE_REQUIS_BANC)) {
      if (banc[numero]) continue;
      const exclus = new Set([...utilisesTitulaires, ...utilisesBanc]);
      const meilleur = meilleurCandidatPourNumero(effectif, POSTE_REQUIS_BANC[numero], exclus);
      if (!meilleur) continue;
      banc[numero] = meilleur.id;
      utilisesBanc.add(meilleur.id);
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
  // annuelle — joueurs ET personnel — répartie sur les 10 journées de la
  // saison — un budget qui bouge vraiment avec les résultats, sans simuler
  // des dizaines de lignes comptables.
  function appliquerFinancesMatch(club, forme) {
    const recette = Math.round(40 + club.niveauClub * 120 + (forme === 'v' ? 25 : forme === 'n' ? 10 : 0));
    const revenuSponsor = club.sponsor ? club.sponsor.revenuParMatch : 0;
    const salaires = Math.round(masseSalariale(club.effectif) / 10);
    const salairesPersonnel = Math.round(global.RMClub.masseSalarialePersonnel(club) / 10);
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
    for (const c of clubs) table[c.id] = {
      clubId: c.id, j: 0, g: 0, n: 0, p: 0, pts: 0, essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0,
      // Points de bonus RÉELLEMENT comptés séparément (cf. enregistrerResultatDans) —
      // affichables dans le classement pour que le joueur comprenne d'où vient
      // chaque point, jamais fondus silencieusement dans `pts`.
      bonusOffensifs: 0, bonusDefensifs: 0,
    };
    return table;
  }

  // Points de classement classiques (rugby à XV) : victoire 4, nul 2, défaite 0.
  // Version générique (calendrier/classement explicites, pas seulement ceux
  // du championnat principal) — réutilisée par l'Équipe B (cf. plus bas) sans
  // dupliquer la logique de points. enregistrerResultat (championnat
  // principal) délègue simplement à cette version avec saison.calendrier/
  // saison.classement, comportement strictement inchangé.
  // Points de classement RUGBY (pas juste victoire/nul/défaite) : victoire 4,
  // nul 2, défaite 0, + bonus offensif (+1, 4 essais marqués ou plus, quel
  // que soit le résultat) + bonus défensif (+1, défaite par 7 points ou
  // moins) — la règle standard du rugby à XV professionnel (Top 14, Six
  // Nations, Coupe du monde...), pas une invention. Les essais nécessaires
  // au bonus offensif sont déjà transmis par l'appelant (résultat RÉEL du
  // match simulé), jamais fabriqués ici.
  function enregistrerResultatDans(calendrier, classement, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    const f = calendrier.find((x) => x.id === fixtureId);
    if (!f || f.joue) return;
    f.joue = true;
    f.score = { domicile: scoreDomicile, exterieur: scoreExterieur };
    const td = classement[f.domicileId];
    const te = classement[f.exterieurId];
    // Rétrocompat : une sauvegarde antérieure au bonus de classement n'a pas
    // ces deux champs sur ses lignes existantes — les initialise plutôt que
    // de les corrompre en NaN au premier += sur `undefined`.
    if (td.bonusOffensifs == null) td.bonusOffensifs = 0;
    if (td.bonusDefensifs == null) td.bonusDefensifs = 0;
    if (te.bonusOffensifs == null) te.bonusOffensifs = 0;
    if (te.bonusDefensifs == null) te.bonusDefensifs = 0;
    td.j++; te.j++;
    td.pointsPour += scoreDomicile; td.pointsContre += scoreExterieur;
    te.pointsPour += scoreExterieur; te.pointsContre += scoreDomicile;
    td.essaisPour += essaisDomicile || 0; td.essaisContre += essaisExterieur || 0;
    te.essaisPour += essaisExterieur || 0; te.essaisContre += essaisDomicile || 0;
    const ecart = Math.abs(scoreDomicile - scoreExterieur);
    const bonusOffDom = (essaisDomicile || 0) >= 4 ? 1 : 0;
    const bonusOffExt = (essaisExterieur || 0) >= 4 ? 1 : 0;
    td.bonusOffensifs += bonusOffDom; te.bonusOffensifs += bonusOffExt;
    if (scoreDomicile > scoreExterieur) {
      td.g++; td.pts += 4 + bonusOffDom; te.p++;
      const bonusDefExt = ecart <= 7 ? 1 : 0;
      te.bonusDefensifs += bonusDefExt;
      te.pts += bonusOffExt + bonusDefExt;
    } else if (scoreDomicile < scoreExterieur) {
      te.g++; te.pts += 4 + bonusOffExt; td.p++;
      const bonusDefDom = ecart <= 7 ? 1 : 0;
      td.bonusDefensifs += bonusDefDom;
      td.pts += bonusOffDom + bonusDefDom;
    } else {
      td.n++; te.n++; td.pts += 2 + bonusOffDom; te.pts += 2 + bonusOffExt;
    }
  }
  function enregistrerResultat(saison, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    enregistrerResultatDans(saison.calendrier, saison.classement, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur);
  }

  // Idem : version générique + championnat principal qui délègue (cf.
  // enregistrerResultatDans ci-dessus pour le même principe).
  function classementTrieDe(classement) {
    return Object.values(classement).sort((a, b) =>
      b.pts - a.pts || (b.pointsPour - b.pointsContre) - (a.pointsPour - a.pointsContre) || b.pointsPour - a.pointsPour);
  }
  function classementTrie(saison) {
    return classementTrieDe(saison.classement);
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
  function ajouterMessage(saison, categorie, titre, corps) {
    const c = saison.clubJoueur;
    if (!c.messages) c.messages = [];
    c.messages.unshift({
      id: 'msg' + compteurMessageId++,
      categorie, titre, corps,
      saisonNumero: saison.numero || 1,
      lu: false,
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
    const adv = club(saison, adversaireId);
    const nomAdv = adv ? adv.nom : 'Adversaire';
    const libelle = resultat === 'v' ? 'Victoire' : resultat === 'd' ? 'Défaite' : 'Match nul';
    ajouterMessage(saison, 'match', `${libelle} contre ${nomAdv}`, `${scorePour} - ${scoreContre}`);
  }

  // Réduit les blessures d'une journée (appelé une fois par journée jouée) et
  // tire une petite chance de blessure pour chaque titulaire qui a joué.
  // `facteurMedecin` (défaut 1 = comportement historique inchangé) : >1
  // accélère la guérison (récupération plus rapide, nouvelles blessures plus
  // courtes) — cf. le médecin dans le personnel (effetPersonnel).
  // `saison` (optionnel, 5e paramètre) : si fourni, une nouvelle blessure
  // génère un message RÉEL dans la boîte de réception — omis dans les
  // scripts/tests qui n'ont pas de saison complète sous la main.
  function faireProgresserBlessures(rng, effectif, composition, facteurMedecin, saison) {
    const fm = facteurMedecin != null ? facteurMedecin : 1;
    for (const j of effectif) {
      if (j.blessureJournees > 0) j.blessureJournees = Math.max(0, j.blessureJournees - Math.max(1, Math.round(fm)));
    }
    const titulairesIds = new Set(Object.values(composition || {}));
    for (const j of effectif) {
      if (!titulairesIds.has(j.id)) continue;
      if (rng() < 0.06) {
        j.blessureJournees = Math.max(1, Math.round((1 + Math.floor(rng() * 3)) / fm)); // 1-3 journées, réduites par le médecin
        if (saison) ajouterMessage(saison, 'blessure', 'Blessure', `${j.nom} est blessé pour ${j.blessureJournees} journée(s).`);
      }
    }
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
      const jeune = global.RMClub.genererJoueurEtendu(posteManquant, rng, saison.clubJoueur.niveauClub);
      jeune.age = 18 + Math.floor(rng() * 3); // jeunes espoirs, 18-20 ans
      jeune.contrat = 2 + Math.floor(rng() * 2);
      jeune.salaire = calculerSalaire(jeune.vitesse, jeune.plaquage, jeune.age);
      reste.push(jeune);
      arrivees.push({ nom: jeune.nom, poste: jeune.poste });
    }
    saison.clubJoueur.effectif = reste;

    // Centre de formation : vieillit et se reconstitue indépendamment de
    // l'effectif pro (cf. progresserCentreFormation).
    progresserCentreFormation(rng, saison);

    // Archive un résumé RÉEL de la saison qui vient de s'achever (classement
    // final, bilan, essais, budget) AVANT de tout réinitialiser ci-dessous —
    // alimente l'écran Bilan "évolution sur plusieurs saisons", jamais une
    // valeur recalculée après coup.
    if (!saison.clubJoueur.historiqueSaisons) saison.clubJoueur.historiqueSaisons = [];
    // Sauvegarde antérieure à cette fonctionnalité : pas d'objectif à évaluer
    // cette fois (evaluerObjectifSaison renverra null), mais initialise la
    // confiance pour que la saison suivante en ait bien une réelle à ajuster.
    if (saison.clubJoueur.confiancePresident == null) saison.clubJoueur.confiancePresident = 60;
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
        `${positionFinale}e place : le club monte en ${nomPalierFrance(nouveauNiveauPalier)} la saison prochaine.`);
    } else if (mouvementPalier === 'relegation') {
      ajouterMessage(saison, 'saison', 'Relégation',
        `${positionFinale}e place : le club descend en ${nomPalierFrance(nouveauNiveauPalier)} la saison prochaine.`);
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
      ? niveauxAdversairesPourPalier(nouveauNiveauPalier).map((niveauClub) => genererClub(rng, { niveauClub }))
      : saison.adversaires.map((ancien) => {
        const rang = classementFinal.findIndex((r) => r.clubId === ancien.id) + 1;
        const total = classementFinal.length;
        const delta = rang <= 2 ? 0.05 : rang >= total - 1 ? -0.05 : 0;
        const niveauClub = Math.max(0.15, Math.min(0.9, (ancien.niveauClub != null ? ancien.niveauClub : 0.5) + delta));
        return { id: ancien.id, nom: ancien.nom, couleur: ancien.couleur, niveauClub, effectif: genererEffectif(rng, niveauClub), budget: budgetInitial(niveauClub, rng) };
      });
    saison.adversaires = adversaires;
    const tousLesClubs = [saison.clubJoueur, ...adversaires];
    saison.calendrier = genererCalendrier(tousLesClubs);
    saison.classement = classementInitial(tousLesClubs);
    // Éligibilité à l'Équipe B réévaluée chaque saison (les budgets ont
    // bougé) — cf. determinerEligiblesEquipeB.
    saison.competitionB = global.RMClub.genererCompetitionB(tousLesClubs);
    // Marché des transferts calibré sur le NIVEAU RÉEL du club du joueur
    // (pas un 0.5 fixe) : un petit club de Ligue Régionale n'attire pas les
    // mêmes joueurs libres qu'un cador de Ligue d'Excellence.
    saison.marche = global.RMClub.genererMarcheTransferts(rng, saison.clubJoueur.niveauClub, 6);
    saison.marchePersonnel = global.RMClub.genererMarchePersonnel(rng, 5);
    saison.numero = (saison.numero || 1) + 1;
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
  function nouvelleSaison(rng, nomClubJoueur) {
    // Débute tout en bas de la pyramide française (Ligue Régionale, cf.
    // PALIERS_PYRAMIDE_FRANCE) : un petit club modeste, comme les adversaires
    // qu'il affronte à ce palier — la progression vers le sommet se fait
    // ensuite réellement, saison après saison (cf. avancerSaison).
    const niveauDepart = bandeNiveauPalier(3).min + (bandeNiveauPalier(3).max - bandeNiveauPalier(3).min) * 0.5;
    const clubJoueur = genererClubJoueur(rng, { nom: nomClubJoueur, niveauClub: niveauDepart });
    snapshotAttributsDebutSaison(clubJoueur.effectif);
    const adversaires = [];
    const niveaux = niveauxAdversairesPourPalier(3); // du plus faible au plus fort, pour ce palier
    for (const niveauClub of niveaux) adversaires.push(genererClub(rng, { niveauClub }));
    const tousLesClubs = [clubJoueur, ...adversaires];
    clubJoueur.objectifSaison = global.RMClub.determinerObjectifSaison(clubJoueur.historiqueSaisons, tousLesClubs.length);
    return {
      version: VERSION_SAUVEGARDE,
      numero: 1,
      clubJoueur,
      adversaires,
      calendrier: genererCalendrier(tousLesClubs),
      classement: classementInitial(tousLesClubs),
      competitionB: global.RMClub.genererCompetitionB(tousLesClubs),
      // Marché calibré sur le niveau réel du club (petit club = marché
      // modeste) — jamais un 0.5 fixe déconnecté de la pyramide.
      marche: global.RMClub.genererMarcheTransferts(rng, clubJoueur.niveauClub, 6),
      marchePersonnel: global.RMClub.genererMarchePersonnel(rng, 5),
      favoris: [],
    };
  }

  // Retourne true/false (au lieu d'avaler silencieusement l'erreur) : permet
  // à l'UI de prévenir le joueur UNE FOIS si le stockage est indisponible
  // (navigation privée, quota dépassé) au lieu de perdre sa progression sans
  // aucun signal — cf. clubUI.js.
  function sauvegarderSaison(saison) {
    try { localStorage.setItem(CLE_CLUB, JSON.stringify(saison)); return true; } catch (e) { return false; }
  }
  // Extrait le suffixe numérique d'un id préfixé ("j42" -> 42) — 0 si l'id
  // n'a pas ce préfixe ou n'a pas de suffixe numérique exploitable.
  function idNumerique(id, prefixe) {
    if (typeof id !== 'string' || id.slice(0, prefixe.length) !== prefixe) return 0;
    const n = Number(id.slice(prefixe.length));
    return Number.isFinite(n) ? n : 0;
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
  // Audit P0-2 (TODO_AUDIT.md) : avant ce correctif, une sauvegarde dont la
  // version ne correspondait plus à VERSION_SAUVEGARDE était silencieusement
  // traitée comme "aucune carrière" — aucun message, aucune sauvegarde de
  // secours. Le joueur, ne voyant "rien", créait alors une nouvelle carrière
  // qui écrasait (même clé localStorage) l'ancienne, PERTE IRRÉCUPÉRABLE
  // démontrée avec une vraie carrière de plusieurs saisons.
  //
  // Registre de migrations versionnées : clé = version de DÉPART, valeur =
  // fonction qui transforme une sauvegarde de cette version vers la
  // suivante. Vide aujourd'hui — VERSION_SAUVEGARDE n'a jamais eu besoin
  // d'être incrémentée depuis la création du jeu (chaque nouveau champ a été
  // ajouté avec une valeur par défaut défensive dans le code, jamais en
  // cassant le format) — mais prêt à recevoir une vraie migration le jour où
  // une évolution du format l'exigera, au lieu de perdre les sauvegardes.
  const MIGRATIONS = {};

  // Validation minimale du schéma : uniquement les champs structurels SANS
  // LESQUELS le jeu ne peut pas fonctionner (le moteur a besoin d'un
  // effectif, d'un calendrier, d'un classement). Ne valide pas chaque champ
  // optionnel un par un : ceux-là ont déjà leur propre valeur par défaut
  // défensive disséminée dans le code (cf. assurerCentreFormation,
  // assurerCompetitionB, palierPyramide dans avancerSaison...).
  function saisonEstValide(saison) {
    return !!(saison && typeof saison === 'object'
      && saison.clubJoueur && typeof saison.clubJoueur === 'object'
      && Array.isArray(saison.clubJoueur.effectif) && saison.clubJoueur.effectif.length > 0
      && Array.isArray(saison.adversaires)
      && Array.isArray(saison.calendrier)
      && saison.classement && typeof saison.classement === 'object');
  }

  // Applique les migrations disponibles jusqu'à VERSION_SAUVEGARDE.
  // { ok:true, saison } si une version valide et à jour est atteinte,
  // { ok:false, raison } si la sauvegarde est irrécupérable en l'état
  // (version sans migration connue, boucle anormale, ou schéma invalide
  // même après migration) — jamais un plantage, jamais un silence.
  function migrerSaison(saisonBrute) {
    if (!saisonBrute || typeof saisonBrute !== 'object' || typeof saisonBrute.version !== 'number') {
      return { ok: false, raison: 'schema_invalide' };
    }
    let saison = saisonBrute;
    let garde = 0;
    while (saison.version < VERSION_SAUVEGARDE) {
      const migrer = MIGRATIONS[saison.version];
      if (!migrer) return { ok: false, raison: 'version_sans_migration', version: saison.version };
      saison = migrer(saison);
      if (++garde > 50) return { ok: false, raison: 'boucle_migration' }; // garde-fou, ne devrait jamais arriver
    }
    if (saison.version !== VERSION_SAUVEGARDE) return { ok: false, raison: 'version_incoherente' };
    if (!saisonEstValide(saison)) return { ok: false, raison: 'schema_invalide' };
    return { ok: true, saison };
  }

  // Sauvegarde de secours : CLÉ DISTINCTE de CLE_CLUB, jamais touchée par
  // sauvegarderSaison/nouvelleSaison — une carrière créée ensuite n'écrase
  // donc jamais ce secours. + un avertissement qu'affiche l'UI une seule
  // fois (cf. clubUI.js) plutôt que de laisser le joueur croire qu'il n'a
  // simplement jamais eu de carrière.
  const CLE_SECOURS = 'rugbyManager.club.secours.v1';
  const CLE_AVERTISSEMENT = 'rugbyManager.club.avertissement.v1';
  function conserverSecours(brut, raison) {
    try {
      localStorage.setItem(CLE_SECOURS, brut);
      localStorage.setItem(CLE_AVERTISSEMENT, JSON.stringify({ raison, quand: Date.now() }));
    } catch (e) { /* stockage indisponible : rien de plus à faire */ }
  }
  function consulterAvertissementChargement() {
    try {
      const brut = localStorage.getItem(CLE_AVERTISSEMENT);
      return brut ? JSON.parse(brut) : null;
    } catch (e) { return null; }
  }
  function effacerAvertissementChargement() {
    try { localStorage.removeItem(CLE_AVERTISSEMENT); } catch (e) { /* ignore */ }
  }

  function chargerSaison() {
    try {
      const brut = localStorage.getItem(CLE_CLUB);
      if (!brut) return null; // pas de sauvegarde : cas normal (1re visite), rien à signaler
      let saisonBrute;
      try {
        saisonBrute = JSON.parse(brut);
      } catch (e) {
        conserverSecours(brut, 'json_invalide');
        return null;
      }
      const resultat = migrerSaison(saisonBrute);
      if (!resultat.ok) {
        conserverSecours(brut, resultat.raison);
        return null;
      }
      resynchroniserCompteurs(resultat.saison);
      return resultat.saison;
    } catch (e) { return null; }
  }
  function effacerSaison() {
    try { localStorage.removeItem(CLE_CLUB); } catch (e) { /* ignore */ }
  }

  // Fusionne avec ce que docs/js/club-personnel.js (chargé avant ou après,
  // l'ordre n'importe pas) a déjà posé sur global.RMClub — jamais une simple
  // réaffectation, qui écraserait ses fonctions si son <script> était chargé
  // en premier (cf. TODO_AUDIT.md P2-10).
  global.RMClub = Object.assign(global.RMClub || {}, {
    choisir, genererNomJoueur, calculerSalaire,
    genererNomClub, genererClub, genererEffectif, effectifVersJoueursCfg,
    nouvelleSaison, genererCalendrier, classementInitial, enregistrerResultat,
    classementTrie, classementTrieDe, enregistrerResultatDans, prochainesFixtures, club,
    sauvegarderSaison, chargerSaison, effacerSaison,
    migrerSaison, saisonEstValide, consulterAvertissementChargement, effacerAvertissementChargement,
    POSTE_REQUIS, POSTE_REQUIS_BANC, TAILLE_EFFECTIF_CIBLE,
    compositionVersJoueursCfg, meilleureComposition,
    completerComposition, completerCompositionBanc,
    numeroDuJoueurDansComposition, autoDesignerEncadrement, appliquerFatigue,
    masseSalariale, appliquerFinancesMatch, appliquerFinancesMatchEquipeB,
    faireProgresserBlessures, avancerSaison,
    AXES_TACTIQUE, tactiqueVersConfig,
    accumulerStats, enregistrerMouvementFinances,
    ENTRAINEMENTS, appliquerEntrainement,
    accumulerStatsJoueurs, classementMarqueurs,
    assurerCentreFormation, promouvoirJeune, ajouterMessage, nomPalierFrance, TAILLE_DIVISION_FRANCE,
    appliquerMoral,
    prevoirFinances,
    calculerProgression,
    enregistrerResultatClubJoueur, marquerMessageLu, marquerTousMessagesLus,
    estimerValeurTransfert, validerComposition,
    GABARIT_EFFECTIF, ARCHETYPE_PAR_POSTE,
    borneStat, borneAdresse, genererAttributsProfondeur, genererPotentiel,
    genererJoueur, genererProchainIdJoueur,
  });
})(window);
