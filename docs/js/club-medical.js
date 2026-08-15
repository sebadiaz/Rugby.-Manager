// Centre médical (Mode Club) — TODO_AUDIT.md P1-40.
//
// AVANT, une blessure était un entier nu : `j.blessureJournees`. Il ne portait
// ni type, ni zone, ni gravité, ni date, ni cause, ni antécédent. Le risque
// était un `rng() < 0.06` PLAT : un pilier de 34 ans cuit à 95 de fatigue et
// un ailier de 21 ans frais se blessaient exactement autant. Et le retour
// était instantané, à pleine puissance, sans le moindre risque de rechute.
//
// Ce module devient LA SOURCE DE VÉRITÉ de l'état médical d'un joueur :
//
//   j.blessure            — l'objet riche, ou null
//   j.historiqueBlessures — les antécédents, qui pèsent sur le risque futur
//   j.reprise             — le retour progressif, APRÈS la fin des soins
//
// `j.blessureJournees` est CONSERVÉ, mais comme simple MIROIR DÉRIVÉ : il est
// écrit par `synchroniserBlessure` et par personne d'autre. Les 77 sites de
// lecture existants (15 fichiers) continuent donc de fonctionner sans être
// modifiés, et il n'existe malgré tout qu'un seul endroit qui DÉCIDE de
// l'état médical. Réécrire ces 77 sites aurait été une refonte massive à
// risque de régression, ce que CLAUDE.md proscrit explicitement.
//
// Deux durées coexistent, et c'est volontaire :
//   - `joursReels`     : la vérité, tirée UNE FOIS à la blessure. Jamais
//                        re-tirée, donc stable après rechargement.
//   - `joursMin/Max`   : le DIAGNOSTIC, ce que le staff croit savoir. Un bon
//                        médecin resserre la fourchette autour de la vérité.
// Le joueur voit la fourchette ; le jeu applique la vérité.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // --- Catalogue des blessures -------------------------------------------
  // `base` = fourchette de jours pour une gravité 1. La gravité multiplie.
  const TYPES_BLESSURE = {
    contusion: {
      label: 'Contusion', zones: ['cuisse', 'côtes', 'épaule', 'mollet', 'hanche'],
      graviteMin: 1, graviteMax: 2, base: [3, 7], poids: 30,
    },
    entorse: {
      label: 'Entorse', zones: ['cheville', 'genou', 'poignet', 'pouce'],
      graviteMin: 1, graviteMax: 3, base: [7, 14], poids: 24,
    },
    dechirure: {
      label: 'Déchirure musculaire', zones: ['ischio-jambiers', 'quadriceps', 'mollet', 'adducteurs'],
      graviteMin: 2, graviteMax: 4, base: [10, 18], poids: 20,
    },
    commotion: {
      label: 'Commotion cérébrale', zones: ['tête'],
      graviteMin: 2, graviteMax: 3, base: [12, 16], poids: 10,
    },
    luxation: {
      label: 'Luxation', zones: ['épaule', 'doigt', 'coude'],
      graviteMin: 2, graviteMax: 4, base: [14, 22], poids: 9,
    },
    fracture: {
      label: 'Fracture', zones: ['clavicule', 'main', 'côtes', 'avant-bras', 'nez'],
      graviteMin: 3, graviteMax: 4, base: [22, 30], poids: 7,
    },
  };

  const LIBELLE_GRAVITE = { 1: 'Légère', 2: 'Modérée', 3: 'Sérieuse', 4: 'Grave' };
  const LIBELLE_CAUSE = { match: 'En match', entrainement: "À l'entraînement", fatigue: 'Surmenage' };

  // Les cinq étapes du retour, dans l'ordre. « soins » couvre l'arrêt
  // complet ; les quatre suivantes sont la reprise proprement dite.
  const ETAPES_REPRISE = ['soins', 'individuel', 'collectif', 'tempsDeJeuLimite', 'complet'];
  const LIBELLE_ETAPE = {
    soins: 'Soins et repos',
    individuel: 'Entraînement individuel réduit',
    collectif: 'Reprise collective, sans match',
    tempsDeJeuLimite: 'Temps de jeu limité (Équipe B / Espoirs)',
    complet: 'Retour complet',
  };
  // Part de la durée de la blessure consacrée à chaque étape de reprise.
  // Une reprise ne dure jamais moins de 1 jour par étape.
  const DUREE_ETAPE = { individuel: 0.22, collectif: 0.18, tempsDeJeuLimite: 0.15, complet: 0.10 };

  // --- Facteurs de risque -------------------------------------------------
  // Le rugby ne blesse pas tout le monde pareil : les postes de contact
  // encaissent bien davantage que les lignes arrière.
  const FACTEUR_POSTE = {
    P: 1.45, T: 1.35, '2L': 1.30, '3L': 1.40,   // avants : mêlée, rucks, mauls
    DM: 0.95, OV: 1.00, CE: 1.15, AI: 0.85, AR: 0.80, // trois-quarts
  };
  // Calibré par mesure (cf. compte rendu P1-40), pas choisi au jugé :
  // l'ancien modèle plat produisait 0,90 blessure par match quelle que soit
  // la situation. Cette base ramène le cas TYPIQUE (fatigue ~40) au même
  // niveau, tout en ouvrant un vrai écart entre un XV frais et un XV cuit.
  const RISQUE_MATCH_BASE = 0.030;

  // Multiplie un RISQUE de blessure : il CROÎT avec l'âge. À ne pas
  // confondre avec `facteurAgeProgression` (club-semaine-entrainement.js), qui
  // module un GAIN d'entraînement et DÉCROÎT — même nom, sens opposé.
  function facteurAgeRisque(age) {
    const a = age != null ? age : 26;
    if (a <= 21) return 0.92;      // jeunes : récupèrent vite, moins de casse
    if (a <= 28) return 1;
    if (a <= 31) return 1.18;
    if (a <= 34) return 1.42;
    return 1.65;
  }

  // Les antécédents pèsent, mais sans jamais condamner un joueur : plafonné.
  function facteurAntecedents(joueur) {
    const h = joueur.historiqueBlessures || [];
    if (!h.length) return 1;
    let charge = 0;
    for (const b of h) charge += 0.06 + (b.gravite || 1) * 0.035;
    return 1 + Math.min(0.75, charge);
  }

  function facteurFatigueRisque(fatigue) {
    return 1 + (Math.max(0, Math.min(100, fatigue || 0)) / 100) * 1.7;
  }

  // Probabilité RÉELLE de se blesser, toutes causes confondues. Chaque
  // facteur est mesurable séparément (cf. les tests de la tranche).
  function risqueBlessure(joueur, options) {
    const o = options || {};
    const base = o.risqueBase != null ? o.risqueBase : RISQUE_MATCH_BASE;
    const preparateur = o.facteurPreparateur != null ? o.facteurPreparateur : 1;
    const intensite = o.intensite != null ? o.intensite : 1;
    // Une rechute est nettement plus probable qu'une première blessure : un
    // joueur revenu trop tôt paie réellement l'impatience du manager.
    const rechute = joueur.reprise && joueur.reprise.risqueRechute
      ? 1 + joueur.reprise.risqueRechute * 2.5 : 1;
    return base
      * (FACTEUR_POSTE[joueur.poste] || 1)
      * facteurAgeRisque(joueur.age)
      * facteurFatigueRisque(joueur.fatigue)
      * facteurAntecedents(joueur)
      // Centre médical (P1-44) : un meilleur centre réduit RÉELLEMENT le
      // risque. Niveau 1 = diviseur 1, donc comportement inchangé sans
      // investissement.
      / (o.saison && RMClub.effetInfrastructure ? RMClub.effetInfrastructure(o.saison, 'medical') : 1)
      * rechute * preparateur * intensite;
  }

  function tirerBlessure(rng, joueur, options) {
    if (joueur.blessure) return false;       // déjà à l'infirmerie
    if (joueur.pret) return false;           // prêté : blessé chez son club d'accueil
    return rng() < risqueBlessure(joueur, options);
  }

  // --- Création d'une blessure -------------------------------------------
  function choisirType(rng, cause) {
    // Une blessure d'entraînement est rarement une fracture : on pondère
    // vers les atteintes musculaires et les contusions.
    const entrees = Object.keys(TYPES_BLESSURE).map((cle) => {
      let poids = TYPES_BLESSURE[cle].poids;
      if (cause !== 'match') {
        if (cle === 'fracture' || cle === 'luxation') poids *= 0.25;
        if (cle === 'commotion') poids *= 0.15;
        if (cle === 'dechirure') poids *= 1.6;
      }
      return { cle, poids };
    });
    const total = entrees.reduce((s, e) => s + e.poids, 0);
    let tirage = rng() * total;
    for (const e of entrees) { tirage -= e.poids; if (tirage <= 0) return e.cle; }
    return entrees[entrees.length - 1].cle;
  }

  function entierEntre(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  // `facteurMedecin` >= 1 : un bon médecin raccourcit la convalescence ET
  // resserre le diagnostic autour de la durée réelle.
  function infligerBlessure(saison, joueur, cause, rng, options) {
    const RMClub = global.RMClub;
    const o = options || {};
    const facteurMedecin = o.facteurMedecin != null
      ? o.facteurMedecin
      : (saison && RMClub.effetPersonnel ? RMClub.effetPersonnel(saison, 'medecin') : 1);

    const cleType = choisirType(rng, cause);
    const def = TYPES_BLESSURE[cleType];
    const gravite = entierEntre(rng, def.graviteMin, def.graviteMax);
    const zone = def.zones[Math.floor(rng() * def.zones.length)];

    // Durée RÉELLE : la fourchette du type, mise à l'échelle de la gravité,
    // puis raccourcie par le médecin. Tirée UNE FOIS — c'est ce qui rend le
    // diagnostic stable après un rechargement.
    const echelle = 0.7 + gravite * 0.42;
    const brut = entierEntre(rng, def.base[0], def.base[1]) * echelle;
    const joursReels = Math.max(2, Math.round(brut / Math.max(0.5, facteurMedecin)));

    // DIAGNOSTIC : une fourchette autour de la vérité. Sans médecin, elle est
    // large (le staff ne sait pas bien) ; avec un bon médecin, elle se
    // resserre. C'est ce que le joueur voit à l'écran.
    const impreciseion = Math.max(0.06, 0.42 / Math.max(0.5, facteurMedecin));
    const marge = Math.max(1, Math.round(joursReels * impreciseion));
    const joursMin = Math.max(1, joursReels - marge);
    const joursMax = joursReels + marge;

    const blessure = {
      id: 'bl' + (saison && saison.compteurBlessureId != null
        ? (saison.compteurBlessureId = (saison.compteurBlessureId || 0) + 1)
        : Math.round(rng() * 1e9)),
      type: cleType,
      libelle: def.label,
      zone,
      gravite,
      dateBlessure: saison && RMClub.dateISO ? RMClub.dateISO(RMClub.dateCourante(saison)) : null,
      joursReels,
      joursEcoules: 0,
      joursMin,
      joursMax,
      cause: cause || 'match',
      // Risque de rechute de base : croît avec la gravité, réduit par un bon
      // préparateur physique.
      risqueRechute: Math.min(0.9, Math.round((0.05 + gravite * 0.045) * (o.facteurPreparateur != null ? o.facteurPreparateur : 1) * 1000) / 1000),
      etape: 'soins',
      reprisePrecipitee: false,
    };
    joueur.blessure = blessure;
    if (!Array.isArray(joueur.historiqueBlessures)) joueur.historiqueBlessures = [];
    joueur.reprise = null;
    synchroniserBlessure(joueur);
    return blessure;
  }

  // --- Miroir dérivé ------------------------------------------------------
  // LA seule fonction autorisée à écrire `blessureJournees`. Tout le reste du
  // jeu le lit ; personne d'autre ne le décide.
  function synchroniserBlessure(joueur) {
    const b = joueur.blessure;
    joueur.blessureJournees = b ? Math.max(0, b.joursReels - b.joursEcoules) : 0;
    return joueur.blessureJournees;
  }

  function joursIndisponible(joueur) {
    const b = joueur.blessure;
    if (b) return Math.max(0, b.joursReels - b.joursEcoules);
    // Repli sur le compteur nu : les effectifs adverses n'ont pas de dossier
    // (abstraction volontaire), et une sauvegarde exotique pourrait en garder
    // un. Sans ce repli, l'écran Médical afficherait « effectif au complet »
    // pendant que le reste du jeu, qui lit `blessureJournees`, refuserait de
    // sélectionner le joueur — une contradiction silencieuse.
    return joueur.blessureJournees > 0 ? joueur.blessureJournees : 0;
  }


  // --- Reprise progressive ------------------------------------------------
  // Étape courante : « soins » tant que l'indisponibilité court, puis les
  // quatre paliers de reprise, puis null une fois totalement rétabli.
  function etapeReprise(joueur) {
    if (joursIndisponible(joueur) > 0) return 'soins';
    const r = joueur.reprise;
    if (!r) return null;
    return r.etape || null;
  }

  function dureeEtape(joursReels, etape) {
    return Math.max(1, Math.round(joursReels * (DUREE_ETAPE[etape] || 0.15)));
  }

  // Coefficient appliqué aux statistiques effectives transmises au moteur.
  // 1 = intact. Un joueur qui vient de sortir de l'infirmerie n'est PAS le
  // joueur d'avant : il remonte palier par palier.
  const COEFFICIENT_ETAPE = { individuel: 0.72, collectif: 0.82, tempsDeJeuLimite: 0.90, complet: 0.96 };
  function coefficientReprise(joueur) {
    const etape = etapeReprise(joueur);
    if (!etape || etape === 'soins') return etape === 'soins' ? 0 : 1;
    return COEFFICIENT_ETAPE[etape] != null ? COEFFICIENT_ETAPE[etape] : 1;
  }

  // Un joueur en reprise peut-il être aligné, et avec quelle équipe ? Le
  // palier « temps de jeu limité » passe explicitement par l'Équipe B ou les
  // Espoirs — c'est la demande, et c'est aussi la logique d'un vrai club.
  function peutJouer(joueur, equipe) {
    if (joursIndisponible(joueur) > 0) return false;
    const etape = etapeReprise(joueur);
    if (!etape || etape === 'complet') return true;
    if (etape === 'individuel' || etape === 'collectif') return false;
    if (etape === 'tempsDeJeuLimite') return equipe === 'b' || equipe === 'jeunes';
    return true;
  }

  // Fait avancer d'UN jour l'état médical d'un joueur : soins, puis reprise.
  // Renvoie un événement quand un palier est franchi, pour que l'appelant
  // puisse produire un vrai message (jamais fabriqué ici).
  function avancerJourMedical(saison, joueur) {
    const b = joueur.blessure;
    if (b && joursIndisponible(joueur) > 0) {
      b.joursEcoules += 1;
      synchroniserBlessure(joueur);
      if (joursIndisponible(joueur) > 0) return null;
      // Fin des soins : la blessure quitte l'infirmerie et devient un
      // ANTÉCÉDENT, puis la reprise commence à l'étape « individuel ».
      const antecedent = {
        type: b.type, libelle: b.libelle, zone: b.zone, gravite: b.gravite,
        cause: b.cause, dateBlessure: b.dateBlessure, joursReels: b.joursReels,
        reprisePrecipitee: !!b.reprisePrecipitee,
      };
      if (!Array.isArray(joueur.historiqueBlessures)) joueur.historiqueBlessures = [];
      joueur.historiqueBlessures.unshift(antecedent);
      joueur.reprise = {
        etape: 'individuel', joursRestants: dureeEtape(b.joursReels, 'individuel'),
        joursReels: b.joursReels,
        // Une reprise précipitée reste dangereuse APRÈS la sortie de
        // l'infirmerie : c'est là que la rechute se joue.
        risqueRechute: b.risqueRechute,
        precipitee: !!b.reprisePrecipitee,
      };
      joueur.blessure = null;
      synchroniserBlessure(joueur);
      return { type: 'finSoins', joueur, antecedent };
    }
    const r = joueur.reprise;
    if (!r) return null;
    r.joursRestants -= 1;
    if (r.joursRestants > 0) return null;
    const i = ETAPES_REPRISE.indexOf(r.etape);
    const suivante = ETAPES_REPRISE[i + 1];
    if (!suivante) { joueur.reprise = null; return { type: 'retabli', joueur }; }
    r.etape = suivante;
    r.joursRestants = dureeEtape(r.joursReels, suivante);
    // Le risque de rechute décroît à mesure que le joueur remonte.
    r.risqueRechute = Math.max(0, Math.round(r.risqueRechute * 0.6 * 1000) / 1000);
    return { type: 'etape', joueur, etape: suivante };
  }

  // --- Décision du manager : accélérer le retour --------------------------
  // Vrai choix, vraie conséquence : on gagne des jours, on paie en risque de
  // rechute. Jamais un bouton décoratif.
  const GAIN_ACCELERATION = 0.35;   // 35 % du temps restant
  const SURCOUT_RECHUTE = 2.2;      // le risque de rechute est plus que doublé

  function accelererRetour(saison, joueur) {
    const b = joueur.blessure;
    if (!b || joursIndisponible(joueur) <= 0) return false;
    const restant = joursIndisponible(joueur);
    const gagne = Math.max(1, Math.round(restant * GAIN_ACCELERATION));
    b.joursEcoules = Math.min(b.joursReels, b.joursEcoules + gagne);
    b.risqueRechute = Math.min(0.95, Math.round(b.risqueRechute * SURCOUT_RECHUTE * 1000) / 1000);
    b.reprisePrecipitee = true;
    synchroniserBlessure(joueur);
    return true;
  }

  // --- Lecture pour l'interface (aucun calcul caché côté UI) --------------
  function descriptionBlessure(joueur) {
    const b = joueur.blessure;
    // Joueur indisponible SANS dossier (cf. joursIndisponible) : on décrit ce
    // qu'on sait, et rien de plus. Mieux vaut « nature non précisée » qu'un
    // diagnostic inventé.
    if (!b) {
      const restant = joursIndisponible(joueur);
      if (!restant) return null;
      return {
        libelle: 'Blessure', zone: 'nature non précisée', gravite: 1,
        graviteLibelle: LIBELLE_GRAVITE[1], cause: 'match', causeLibelle: LIBELLE_CAUSE.match,
        dateBlessure: null, joursMin: restant, joursMax: restant,
        risqueRechute: 0, reprisePrecipitee: false, etape: 'soins', sansDossier: true,
      };
    }
    return {
      libelle: b.libelle, zone: b.zone, gravite: b.gravite,
      graviteLibelle: LIBELLE_GRAVITE[b.gravite] || '?',
      cause: b.cause, causeLibelle: LIBELLE_CAUSE[b.cause] || b.cause,
      dateBlessure: b.dateBlessure,
      joursMin: Math.max(0, b.joursMin - b.joursEcoules),
      joursMax: Math.max(0, b.joursMax - b.joursEcoules),
      risqueRechute: b.risqueRechute,
      reprisePrecipitee: !!b.reprisePrecipitee,
      etape: 'soins',
    };
  }

  // --- Migration d'un joueur v4 (compteur nu) -----------------------------
  // Une sauvegarde d'avant cette tranche n'a qu'un entier. On ne PEUT PAS
  // inventer rétroactivement le type et la zone d'une blessure qui n'a jamais
  // eu lieu sous cette forme : on crée une blessure honnête, générique, dont
  // la seule donnée certaine — le nombre de jours restants — est PRÉSERVÉE.
  function migrerJoueurV4(joueur) {
    if (!Array.isArray(joueur.historiqueBlessures)) joueur.historiqueBlessures = [];
    if (joueur.reprise === undefined) joueur.reprise = null;
    if (joueur.blessure !== undefined && joueur.blessure !== null) return joueur;
    const restant = joueur.blessureJournees > 0 ? joueur.blessureJournees : 0;
    if (!restant) { joueur.blessure = null; joueur.blessureJournees = 0; return joueur; }
    const gravite = restant >= 28 ? 4 : restant >= 14 ? 3 : restant >= 7 ? 2 : 1;
    joueur.blessure = {
      id: 'bl-migre-' + joueur.id,
      type: 'contusion', libelle: 'Blessure (dossier antérieur)', zone: 'non précisée',
      gravite,
      dateBlessure: null,
      joursReels: restant, joursEcoules: 0,
      // Aucun diagnostic n'avait été posé à l'époque : la fourchette affichée
      // le dit honnêtement plutôt que de faire semblant d'avoir su.
      joursMin: restant, joursMax: restant,
      cause: 'match',
      risqueRechute: Math.min(0.9, 0.05 + gravite * 0.045),
      etape: 'soins', reprisePrecipitee: false, migre: true,
    };
    synchroniserBlessure(joueur);
    return joueur;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    LIBELLE_GRAVITE, ETAPES_REPRISE, LIBELLE_ETAPE, risqueBlessure, tirerBlessure,
    infligerBlessure, joursIndisponible, etapeReprise, coefficientReprise,
    peutJouer, avancerJourMedical, accelererRetour, descriptionBlessure,
    migrerJoueurV4,
  });
})(window);
