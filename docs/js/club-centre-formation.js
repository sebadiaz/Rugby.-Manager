// Centre de formation (Mode Club) — domaine extrait de club.js (TODO_AUDIT.md
// P2-10, tranche 10) : un vivier d'espoirs (16-18 ans), séparé de l'effectif
// professionnel, qu'on peut promouvoir en équipe première (cf.
// promouvoirJeune) quand l'effectif senior n'a plus assez de joueurs
// disponibles à un poste (blessures/prêts cumulés en cours de saison) — ou
// aligner tel quel pour un match d'Équipe B (cf. effectifDisponiblePourEquipeB
// dans club-equipe-b.js) sans les promouvoir. Assez d'espoirs par ligne de
// poste pour aligner une équipe B complète à lui seul (cf.
// QUOTA_CENTRE_FORMATION), même les jours où l'effectif pro senior est
// utilisé à 100% (titulaires + banc). Mêmes attributs qu'un joueur pro (donc
// utilisable normalement en composition une fois promu), avec un net déficit
// de niveau actuel — leur POTENTIEL, lui, n'est pas pénalisé (la marge de
// progression d'un très jeune joueur est réelle et large), donc certains
// deviendront meilleurs que ce que suggère leur niveau d'aujourd'hui.
//
// Dépendance cachée trouvée en analysant le domaine AVANT de couper (comme
// compteurJoueurId en tranches 8/9) : genererJeune attribuait un id via
// `'j' + compteurJoueurId++`, remplacé par RMClub.genererProchainIdJoueur().
// QUOTA_CENTRE_FORMATION dérive de RMClub.POSTE_REQUIS (déjà exporté de
// club.js) — calculé une fois au chargement de ce fichier, donc club.js doit
// être chargé AVANT celui-ci (déjà garanti par l'ordre des <script> dans
// docs/index.html, comme pour tous les domaines extraits).
(function (global) {
  'use strict';

  const RMClub = global.RMClub;
  const POSTES_CATEGORIES = ['P', 'T', '2L', '3L', 'DM', 'OV', 'CE', 'AI', 'AR'];
  // Nombre d'espoirs requis PAR LIGNE DE POSTE pour que le centre de
  // formation puisse à lui seul aligner une équipe B complète (15 postes),
  // même quand l'effectif pro senior est utilisé à 100% (titulaires + banc) —
  // dérivé directement de POSTE_REQUIS (2 piliers, 2 deuxième ligne, 3
  // troisième ligne, 2 centres, 2 ailiers...), jamais un chiffre arbitraire.
  const QUOTA_CENTRE_FORMATION = {};
  for (const numero of Object.keys(RMClub.POSTE_REQUIS)) {
    const poste = RMClub.POSTE_REQUIS[numero];
    QUOTA_CENTRE_FORMATION[poste] = (QUOTA_CENTRE_FORMATION[poste] || 0) + 1;
  }

  function genererJeune(poste, rng, niveauClub) {
    const base = RMClub.ARCHETYPE_PAR_POSTE[poste];
    const ecartNiveau = (niveauClub - 0.5) * 20;
    const bruit = () => (rng() * 12 - 6);
    const age = 16 + Math.floor(rng() * 3); // 16-18 ans
    const malusJeunesse = -14; // pas encore le niveau professionnel
    const vitesse = RMClub.borneStat(base.vitesse + ecartNiveau + malusJeunesse + bruit());
    const plaquage = RMClub.borneStat(base.plaquage + ecartNiveau + malusJeunesse + bruit());
    const adresse = RMClub.borneAdresse((base.adresse != null ? base.adresse : 30) + ecartNiveau * 0.5 + malusJeunesse + bruit());
    const attributs = RMClub.genererAttributsProfondeur(base, ecartNiveau + malusJeunesse, rng);
    const niveauActuel = (vitesse + plaquage + attributs.melee + attributs.touche
      + attributs.puissance + attributs.passe + attributs.jeuPied) / 7;
    return {
      id: RMClub.genererProchainIdJoueur(),
      nom: RMClub.genererNomJoueur(rng),
      poste, age, vitesse, plaquage, adresse,
      melee: attributs.melee, touche: attributs.touche, puissance: attributs.puissance,
      endurance: attributs.endurance, passe: attributs.passe, jeuPied: attributs.jeuPied,
      decision: attributs.decision, discipline: attributs.discipline,
      potentiel: RMClub.genererPotentiel(niveauActuel, age, rng),
      tendance: base.tendance, couloir: base.couloir,
      contrat: 2 + Math.floor(rng() * 2), // contrat espoir (formation)
      salaire: Math.max(3, Math.round(RMClub.calculerSalaire(vitesse, plaquage, age) * 0.4)),
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
    RMClub.ajouterMessage(saison, 'jeunes', 'Promotion en équipe première',
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
      RMClub.ajouterMessage(saison, 'jeunes', 'Centre de formation',
        `${partis.join(', ')} quitte(nt) le centre de formation sans avoir été promu(s) en équipe première.`);
    }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    genererJeune, completerCentreFormation, genererCentreFormation,
    assurerCentreFormation, promouvoirJeune, progresserCentreFormation,
  });
})(window);
