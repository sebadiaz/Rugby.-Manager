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
    return {
      id: 'j' + compteurJoueurId++,
      nom: genererNomJoueur(rng),
      poste, age, vitesse, plaquage,
      tendance: base.tendance, couloir: base.couloir,
      contrat: 1 + Math.floor(rng() * 4), // saisons restantes (1-4)
      salaire: calculerSalaire(vitesse, plaquage, age),
      blessureJournees: 0, // >0 = indisponible pour ce nombre de journées
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
    return {
      numero,
      nom: genererNomJoueur(rng),
      poste: base.poste,
      age: 18 + Math.floor(rng() * 17),
      vitesse: borneStat(base.vitesse + ecartNiveau + bruit()),
      plaquage: borneStat(base.plaquage + ecartNiveau + bruit()),
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
      tactique: { style: 'equilibre', pied: 'normal', ligneDef: 'normale' },
    };
  }

  // Tactique = 3 réglages INDÉPENDANTS qui se combinent (comme les
  // instructions d'équipe FM — on ne choisit pas un "template" figé, on
  // compose : style de jeu × usage du pied × hauteur de ligne défensive),
  // traduits en réglages concrets du moteur (cf. engine/rugby-engine.js,
  // cfgAttaque/cfgDefense PAR ÉQUIPE). `null` = valeur par défaut du moteur.
  const AXES_TACTIQUE = {
    style: {
      label: 'Style de jeu', defaut: 'equilibre',
      options: {
        sol: { nom: 'Jeu au sol', description: 'Reste près du regroupement, limite les prises de risque au large.', attaque: { jeuLargeTaux: { pression: 1.1, calme: 0.9 } } },
        equilibre: { nom: 'Équilibré', description: 'Ni resserré, ni systématiquement porté au large.', attaque: null },
        large: { nom: 'Jeu au large', description: 'Cherche l\'espace au large à chaque occasion.', attaque: { jeuLargeTaux: { pression: 2.3, calme: 2.0 } } },
      },
    },
    pied: {
      label: 'Jeu au pied', defaut: 'normal',
      options: {
        rare: { nom: 'Rare', description: 'Privilégie la conservation du ballon en main.', attaque: { tauxJeuAuPied: 0.5 } },
        normal: { nom: 'Normal', description: 'Fréquence de coups de pied standard.', attaque: null },
        frequent: { nom: 'Fréquent', description: 'Beaucoup de coups de pied pour occuper le camp adverse.', attaque: { tauxJeuAuPied: 2.5 } },
      },
    },
    ligneDef: {
      label: 'Ligne défensive', defaut: 'normale',
      options: {
        basse: { nom: 'Basse', description: 'Défense prudente et repliée, moins de risques à la montée.', defense: { rampeMontee: 3.5, profondeurArriereJeu: 22, profondeurArriereMelee: 24 } },
        normale: { nom: 'Normale', description: 'Hauteur de ligne standard.', defense: null },
        haute: { nom: 'Haute', description: 'Presse haut et vite, plus risqué si elle est percée.', defense: { rampeMontee: 1.5, profondeurArriereJeu: 15, profondeurArriereMelee: 17 } },
      },
    },
  };

  // Config moteur (attaque/défense PAR ÉQUIPE) résultant de la COMBINAISON
  // des 3 axes — `tactique` peut être partiel ou absent, chaque axe retombe
  // sur son défaut (comportement du moteur inchangé si rien n'est choisi).
  function tactiqueVersConfig(tactique) {
    const t = Object.assign(
      { style: AXES_TACTIQUE.style.defaut, pied: AXES_TACTIQUE.pied.defaut, ligneDef: AXES_TACTIQUE.ligneDef.defaut },
      (tactique && typeof tactique === 'object') ? tactique : {}
    );
    const optStyle = AXES_TACTIQUE.style.options[t.style] || AXES_TACTIQUE.style.options[AXES_TACTIQUE.style.defaut];
    const optPied = AXES_TACTIQUE.pied.options[t.pied] || AXES_TACTIQUE.pied.options[AXES_TACTIQUE.pied.defaut];
    const optLigne = AXES_TACTIQUE.ligneDef.options[t.ligneDef] || AXES_TACTIQUE.ligneDef.options[AXES_TACTIQUE.ligneDef.defaut];
    const attaque = Object.assign({}, optStyle.attaque || null, optPied.attaque || null);
    const cfg = {};
    if (Object.keys(attaque).length) cfg.attaque = attaque;
    if (optLigne.defense) cfg.defense = optLigne.defense;
    return cfg;
  }

  // Convertit l'effectif d'un club ADVERSAIRE (15, un par numéro) en config
  // joueursA/joueursB consommée par MatchEngine (cf. engine/rugby-engine.js) :
  // {numero: {poste, vitesse, plaquage, tendance, couloir}}.
  function effectifVersJoueursCfg(club) {
    const cfg = {};
    for (const j of club.effectif) {
      cfg[j.numero] = { poste: j.poste, vitesse: j.vitesse, plaquage: j.plaquage, tendance: j.tendance, couloir: j.couloir };
    }
    return cfg;
  }

  // Même conversion, mais pour le club du JOUEUR : `composition` associe
  // chaque numéro (1-15) à l'id du joueur de l'effectif étendu qui le porte
  // ce jour-là (cf. meilleureComposition / choix manuel dans l'UI).
  function compositionVersJoueursCfg(effectif, composition) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const cfg = {};
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const j = parId[composition[numero]];
      if (!j) continue;
      cfg[numero] = { poste: POSTE_REQUIS[numero], vitesse: j.vitesse, plaquage: j.plaquage, tendance: j.tendance, couloir: j.couloir };
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
      const candidats = effectif.filter((j) => j.poste === poste && !utilises.has(j.id));
      if (candidats.length === 0) continue;
      const disponibles = candidats.filter((j) => !j.blessureJournees);
      const pool = disponibles.length > 0 ? disponibles : candidats;
      pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
      composition[numero] = pool[0].id;
      utilises.add(pool[0].id);
    }
    return composition;
  }

  function masseSalariale(effectif) {
    return effectif.reduce((somme, j) => somme + j.salaire, 0);
  }

  // Finances d'un jour de match (club du joueur uniquement) : recette de
  // billetterie (plus élevée pour un grand club, prime en cas de victoire) et
  // une part de la masse salariale annuelle (répartie sur les 10 journées de
  // la saison) — un budget qui bouge vraiment avec les résultats, sans
  // simuler des dizaines de lignes comptables.
  function appliquerFinancesMatch(club, forme) {
    const recette = Math.round(40 + club.niveauClub * 120 + (forme === 'v' ? 25 : forme === 'n' ? 10 : 0));
    const salaires = Math.round(masseSalariale(club.effectif) / 10);
    club.budget += recette - salaires;
    return { recette, salaires };
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
  function scouterJoueur(saison, joueurId) {
    const j = saison.marche.find((x) => x.id === joueurId);
    if (!j) return { ok: false, motif: 'introuvable' };
    if (j.connaissance >= 100) return { ok: false, motif: 'deja_complet' };
    if (saison.clubJoueur.budget < COUT_SCOUTING) return { ok: false, motif: 'budget' };
    saison.clubJoueur.budget -= COUT_SCOUTING;
    j.connaissance = Math.min(100, j.connaissance + 30);
    return { ok: true, connaissance: j.connaissance };
  }

  function signerJoueur(saison, joueurId) {
    const i = saison.marche.findIndex((j) => j.id === joueurId);
    if (i === -1) return { ok: false, motif: 'introuvable' };
    const joueur = saison.marche[i];
    if (saison.clubJoueur.budget < joueur.prixTransfert) return { ok: false, motif: 'budget' };
    saison.clubJoueur.budget -= joueur.prixTransfert;
    // Une fois signé, c'est TON joueur : plus de brouillard de scouting, ses
    // vraies statistiques s'affichent directement dans l'effectif.
    delete joueur.connaissance; delete joueur.ecartVitesse; delete joueur.ecartPlaquage;
    saison.clubJoueur.effectif.push(joueur);
    saison.marche.splice(i, 1);
    return { ok: true };
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
    return { ok: true };
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
  function faireProgresserBlessures(rng, effectif, composition) {
    for (const j of effectif) {
      if (j.blessureJournees > 0) j.blessureJournees--;
    }
    const titulairesIds = new Set(Object.values(composition || {}));
    for (const j of effectif) {
      if (!titulairesIds.has(j.id)) continue;
      if (rng() < 0.06) j.blessureJournees = 1 + Math.floor(rng() * 3); // 1-3 journées
    }
  }

  // Fin de saison (club du joueur) : vieillissement, fin de contrat, retraite,
  // recrutement de jeunes pour compenser les départs et garder l'effectif à sa
  // taille cible. Le budget et l'identité du club sont conservés ; calendrier
  // et classement repartent à zéro avec de nouveaux adversaires.
  function avancerSaison(rng, saison) {
    const effectif = saison.clubJoueur.effectif;
    const partis = [];
    let reste = effectif.map((j) => {
      const copie = Object.assign({}, j, { age: j.age + 1, contrat: j.contrat - 1 });
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

    const adversaires = [];
    const niveaux = [0.25, 0.4, 0.5, 0.6, 0.75];
    for (const niveauClub of niveaux) adversaires.push(genererClub(rng, { niveauClub }));
    saison.adversaires = adversaires;
    const tousLesClubs = [saison.clubJoueur, ...adversaires];
    saison.calendrier = genererCalendrier(tousLesClubs);
    saison.classement = classementInitial(tousLesClubs);
    saison.marche = genererMarcheTransferts(rng, 0.5, 6);
    saison.numero = (saison.numero || 1) + 1;
    return { partis, arrivees };
  }

  // Crée une nouvelle saison complète : le club du joueur (effectif étendu +
  // budget) + 5 adversaires IA de niveaux variés, calendrier aller-retour,
  // classement à zéro, marché des transferts initial.
  function nouvelleSaison(rng, nomClubJoueur) {
    const clubJoueur = genererClubJoueur(rng, { nom: nomClubJoueur, niveauClub: 0.5 });
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
    POSTE_REQUIS, TAILLE_EFFECTIF_CIBLE,
    compositionVersJoueursCfg, meilleureComposition,
    masseSalariale, appliquerFinancesMatch,
    genererMarcheTransferts, signerJoueur, libererJoueur,
    statsApparentes, estimationEtoiles, scouterJoueur, COUT_SCOUTING,
    faireProgresserBlessures, avancerSaison,
    AXES_TACTIQUE, tactiqueVersConfig,
  };
})(window);
