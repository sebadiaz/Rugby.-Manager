// Réseau de recrutement (Mode Club) — ZONES géographiques, MISSIONS d'un
// recruteur, DÉCOUVERTE progressive de joueurs.
//
// Audit mesuré avant : le marché des transferts affichait 6 joueurs,
// VISIBLES DÈS LE PREMIER JOUR, gratuitement, sans rien décider. Le scouting
// existant (club-transferts.js, 8 k€) ne fait que PRÉCISER un rapport sur un
// joueur DÉJÀ affiché — il n'a jamais fait découvrir personne. « zone de
// recrutement », « mission », « réseau » : zéro occurrence dans docs/js.
//
// Conséquence en jeu : aucune décision de réseau à prendre, aucune raison
// d'avoir un recruteur, et un marché identique pour tous les managers.
//
// Ce module ajoute la décision manquante : « j'envoie mon recruteur OÙ,
// combien de TEMPS, pour combien ? » — un seul recruteur, donc un vrai
// arbitrage, et un budget réellement engagé. Ce qu'il ramène n'existe que
// pour ce club : des joueurs que le marché national n'aurait jamais montrés.
//
// Trois garde-fous de conception :
//   - AUCUNE information parfaite : un joueur ramené arrive avec un rapport
//     incomplet, comme n'importe quelle recrue (cf. statsApparentes) ;
//   - la connaissance d'une zone se CONSTRUIT : y retourner paie, ce n'est
//     pas un interrupteur ;
//   - un manager qui n'envoie jamais personne retrouve exactement le jeu
//     d'avant — le marché national continue de vivre tout seul.
//
// Aucune dépendance au DOM. Aucune dépendance à world.js (qui dépend, lui,
// de club.js) : le catalogue de zones est défini ici, avec les MÊMES codes
// pays que docs/js/world.js pour rester cohérent à l'écran.
(function (global) {
  'use strict';

  // Canal de tirage DÉDIÉ. Les canaux déjà pris : 7 (flux quotidien),
  // 23 (rafraîchissement du marché), 31 et 43 (mercato rival), 37 (ventes),
  // 41 (négociations), 47 (propositions reçues). En greffer un sur un canal
  // existant décalerait tous les tirages déjà en place.
  const CANAL_RESEAU = 53;

  // Catalogue des zones. `eloignement` pilote le coût (un déplacement au bout
  // du monde n'a pas le prix d'un aller-retour régional), `talent` le niveau
  // des joueurs qu'on y trouve, `postes` ce que la zone produit vraiment —
  // c'est ce triangle qui fait la décision : la zone la plus riche est aussi
  // la plus chère et la moins connue.
  const ZONES = {
    FRA: { nom: 'France', eloignement: 0, talent: 1.0, connaissance: 55,
      postes: [], reputation: 'Marché domestique : peu de surprises, mais des joueurs immédiatement opérationnels.' },
    ANG: { nom: 'Angleterre', eloignement: 1, talent: 1.15, connaissance: 28,
      postes: ['3L', '2L', 'CE'], reputation: 'Championnat physique : troisièmes lignes et centres taillés pour le combat.' },
    IRL: { nom: 'Irlande', eloignement: 1, talent: 1.12, connaissance: 26,
      postes: ['OV', 'DM', '2L'], reputation: 'École de demis : des joueurs qui gèrent le jeu au pied et l\'occupation.' },
    GAL: { nom: 'Pays de Galles', eloignement: 1, talent: 1.05, connaissance: 24,
      postes: ['AI', 'AR', '3L'], reputation: 'Formation de finisseurs : des ailiers et des arrières qui jouent debout.' },
    ECO: { nom: 'Écosse', eloignement: 1, talent: 1.0, connaissance: 22,
      postes: ['DM', 'AI', 'CE'], reputation: 'Jeu de mouvement : des trois-quarts rapides, souvent sous-évalués.' },
    ITA: { nom: 'Italie', eloignement: 1, talent: 1.0, connaissance: 20,
      postes: ['P', 'T', '2L'], reputation: 'Vivier de première ligne : des piliers et des talonneurs formés en mêlée.' },
    RSA: { nom: 'Afrique du Sud', eloignement: 2, talent: 1.2, connaissance: 12,
      postes: ['P', '2L', '3L'], reputation: 'Avants puissants : le meilleur endroit pour renforcer une mêlée.' },
    ARG: { nom: 'Argentine', eloignement: 2, talent: 1.1, connaissance: 12,
      postes: ['P', 'T', '3L'], reputation: 'Culture de la mêlée fermée : des premières lignes rugueuses et endurantes.' },
    JAP: { nom: 'Japon', eloignement: 2, talent: 0.95, connaissance: 10,
      postes: ['DM', 'AI', 'OV'], reputation: 'Jeu rapide et discipliné : des joueurs mobiles, rarement chers.' },
    USA: { nom: 'États-Unis', eloignement: 2, talent: 0.9, connaissance: 10,
      postes: ['AI', 'AR', 'CE'], reputation: 'Marché neuf : des athlètes bruts, à fort potentiel et à faible prix.' },
    NZL: { nom: 'Nouvelle-Zélande', eloignement: 3, talent: 1.25, connaissance: 8,
      postes: ['AR', 'AI', 'OV', '3L'], reputation: 'Le vivier le plus dense du jeu — et le plus disputé.' },
    AUS: { nom: 'Australie', eloignement: 3, talent: 1.15, connaissance: 8,
      postes: ['CE', 'AR', 'DM'], reputation: 'Trois-quarts créatifs, formés à attaquer les intervalles.' },
  };
  const CODES_ZONE = Object.keys(ZONES);

  // Noms des joueurs ramenés d'une zone. Sans ça, mesuré : une mission en
  // Nouvelle-Zélande revenait avec « Paul Dubois » et « Louis Guerin » — le
  // mécanisme était juste, mais rien à l'écran ne disait qu'on avait payé
  // 135 k€ pour aller à l'autre bout du monde. Les zones sans pool (la
  // France) gardent le générateur national de club.js.
  const NOMS_PAR_ZONE = {
    ANG: { prenoms: ['Oliver', 'Harry', 'George', 'Jack', 'Charlie', 'Alfie', 'Freddie', 'Toby'],
      noms: ['Whitfield', 'Ashworth', 'Rowley', 'Hargreaves', 'Bramley', 'Fenwick', 'OKeefe', 'Stanton'] },
    IRL: { prenoms: ['Cian', 'Ronan', 'Declan', 'Eoin', 'Fionn', 'Padraig', 'Niall', 'Cormac'],
      noms: ['OSullivan', 'Doherty', 'McGrath', 'Kavanagh', 'ODriscoll', 'Fitzgerald', 'Brennan', 'Molloy'] },
    GAL: { prenoms: ['Rhys', 'Dylan', 'Owain', 'Gareth', 'Ieuan', 'Morgan', 'Emrys', 'Caradog'],
      noms: ['Llewellyn', 'Pritchard', 'Vaughan', 'Meredith', 'Hopkin', 'Gwilym', 'Bevan', 'Maddock'] },
    ECO: { prenoms: ['Callum', 'Fraser', 'Hamish', 'Struan', 'Angus', 'Duncan', 'Rory', 'Iain'],
      noms: ['MacLeod', 'Cunningham', 'Armstrong', 'Buchanan', 'Kerrigan', 'Nairn', 'Strachan', 'Blackwood'] },
    ITA: { prenoms: ['Marco', 'Lorenzo', 'Matteo', 'Federico', 'Alessio', 'Tommaso', 'Riccardo', 'Davide'],
      noms: ['Bertolini', 'Zanetti', 'Fabbri', 'Moretti', 'Rinaldi', 'Cattaneo', 'Vitale', 'Sartori'] },
    RSA: { prenoms: ['Ruan', 'Pieter', 'Siya', 'Johan', 'Thabo', 'Willem', 'Lukhanyo', 'Deon'],
      noms: ['van Rensburg', 'Botha', 'Mtshali', 'Steenkamp', 'Nkosi', 'du Plessis', 'Vermeulen', 'Mabaso'] },
    ARG: { prenoms: ['Santiago', 'Facundo', 'Joaquin', 'Bautista', 'Tomas', 'Agustin', 'Ignacio', 'Julian'],
      noms: ['Ferrari', 'Sanchez', 'Quiroga', 'Medina', 'Bustos', 'Peralta', 'Ledesma', 'Aguirre'] },
    JAP: { prenoms: ['Kenji', 'Haruto', 'Sota', 'Yuto', 'Riku', 'Kaito', 'Daichi', 'Ren'],
      noms: ['Nakamura', 'Yoshida', 'Tanabe', 'Kurosawa', 'Hasegawa', 'Fujimoto', 'Okada', 'Shimizu'] },
    USA: { prenoms: ['Tyler', 'Brandon', 'Cody', 'Mason', 'Colton', 'Bryce', 'Dalton', 'Jaylen'],
      noms: ['Whitaker', 'Sullivan', 'Redding', 'Callahan', 'Barnes', 'Hollis', 'Duncan', 'Marsh'] },
    NZL: { prenoms: ['Tane', 'Ari', 'Manaia', 'Wiremu', 'Kahu', 'Nikau', 'Rewi', 'Tama'],
      noms: ['Ngata', 'Waititi', 'Rangi', 'Te Whare', 'Kahukura', 'Pohatu', 'Maniapoto', 'Rewiti'] },
    AUS: { prenoms: ['Jayden', 'Lachlan', 'Blake', 'Hayden', 'Kaine', 'Brodie', 'Darcy', 'Riley'],
      noms: ['Carmody', 'Hollingworth', 'Beattie', 'Danaher', 'Trundle', 'Warwick', 'Mullane', 'Kirkby'] },
  };
  function nomDeLaZone(rng, code) {
    const pool = NOMS_PAR_ZONE[code];
    if (!pool) return null;
    const RMClub = global.RMClub;
    return `${RMClub.choisir(rng, pool.prenoms)} ${RMClub.choisir(rng, pool.noms)}`;
  }

  // Coût JOURNALIER d'une mission, en k€. Un déplacement lointain immobilise
  // le recruteur et coûte plus cher — c'est ce qui empêche d'envoyer tout le
  // monde en Nouvelle-Zélande en boucle.
  const COUT_JOUR_BASE = 1.2;
  const COUT_JOUR_PAR_ELOIGNEMENT = 1.1;
  // Bornes de durée : sous 15 jours un scout n'a le temps de rien voir, au-delà
  // de 90 il manque toute une phase de la saison.
  const DUREE_MIN = 15;
  const DUREE_MAX = 90;
  // Connaissance gagnée sur la zone par mission, proportionnelle à la durée —
  // plafonnée pour qu'une zone ne devienne jamais « transparente ».
  const CONNAISSANCE_MAX_ZONE = 95;
  const GAIN_CONNAISSANCE_PAR_JOUR = 0.55;
  // Joueurs ramenés : une mission courte ramène un nom, une longue en ramène
  // plusieurs. Jamais zéro — une mission payée doit toujours produire.
  const JOURS_PAR_DECOUVERTE = 25;
  const DECOUVERTES_MAX = 4;
  const MAX_RAPPORTS = 20;

  function coutJournalierZone(code) {
    const z = ZONES[code];
    if (!z) return 0;
    return COUT_JOUR_BASE + z.eloignement * COUT_JOUR_PAR_ELOIGNEMENT;
  }

  // État du réseau, créé à la volée. Une carrière commencée avant cette
  // tranche n'en a pas : elle démarre avec un réseau VIERGE (aucune mission
  // fantôme, aucun rapport inventé rétroactivement), exactement comme un
  // club qui n'aurait jamais envoyé personne.
  function assurerReseauScouting(saison) {
    if (!saison.reseauScouting || typeof saison.reseauScouting !== 'object') {
      saison.reseauScouting = { zones: {}, mission: null, rapports: [] };
    }
    const r = saison.reseauScouting;
    if (!r.zones || typeof r.zones !== 'object') r.zones = {};
    if (!Array.isArray(r.rapports)) r.rapports = [];
    if (r.mission === undefined) r.mission = null;
    for (const code of CODES_ZONE) {
      if (typeof r.zones[code] !== 'number') r.zones[code] = ZONES[code].connaissance;
    }
    return r;
  }

  function connaissanceZone(saison, code) {
    return assurerReseauScouting(saison).zones[code] || 0;
  }

  // Le recruteur du club (club-personnel.js) : jusqu'ici son effet promis
  // — « réduit le coût du scouting » — ne portait que sur une action à 8 k€.
  // Il pilote maintenant une dépense réelle ET le rendement des missions.
  function facteurRecruteur(saison) {
    const RMClub = global.RMClub;
    return RMClub.effetPersonnel ? RMClub.effetPersonnel(saison, 'recruteur') : 1;
  }

  function coutMission(saison, code, jours) {
    const j = Math.max(DUREE_MIN, Math.min(DUREE_MAX, Math.round(Number(jours) || 0)));
    return Math.max(1, Math.round(coutJournalierZone(code) * j / facteurRecruteur(saison)));
  }

  // Catalogue présenté au manager : ce qu'il connaît de chaque zone, ce qu'on
  // y trouve, et ce que ça lui coûterait — de quoi décider sans ouvrir le code.
  function zonesScouting(saison, joursSimules) {
    const reseau = assurerReseauScouting(saison);
    const jours = Math.max(DUREE_MIN, Math.min(DUREE_MAX, Math.round(Number(joursSimules) || 30)));
    return CODES_ZONE.map((code) => {
      const z = ZONES[code];
      return {
        code,
        nom: z.nom,
        eloignement: z.eloignement,
        talent: z.talent,
        postes: z.postes.slice(),
        reputation: z.reputation,
        connaissance: Math.round(reseau.zones[code] || 0),
        coutParJour: Math.round(coutJournalierZone(code) / facteurRecruteur(saison) * 10) / 10,
        coutMission: coutMission(saison, code, jours),
      };
    });
  }

  function missionScoutingEnCours(saison) {
    return assurerReseauScouting(saison).mission || null;
  }

  const DUREES_PROPOSEES = [15, 30, 60, 90];

  // Envoie le recruteur. Un seul à la fois, payé d'avance : c'est ce qui en
  // fait un arbitrage et pas un bouton gratuit.
  function lancerMissionScouting(saison, code, jours) {
    const RMClub = global.RMClub;
    const reseau = assurerReseauScouting(saison);
    if (!ZONES[code]) {
      return { ok: false, motif: 'zone', message: 'Cette zone de recrutement n\'existe pas.' };
    }
    if (reseau.mission) {
      const m = reseau.mission;
      return { ok: false, motif: 'mission_en_cours',
        message: `Ton recruteur est déjà en mission en ${ZONES[m.zone].nom} — il rentre dans ${m.joursRestants} jour(s). Tu n'en as qu'un.` };
    }
    const duree = Math.max(DUREE_MIN, Math.min(DUREE_MAX, Math.round(Number(jours) || 30)));
    const cout = coutMission(saison, code, duree);
    if ((saison.clubJoueur.budget || 0) < cout) {
      return { ok: false, motif: 'budget',
        message: `Cette mission coûte ${cout} k€ et le club n'a que ${Math.round(saison.clubJoueur.budget || 0)} k€.` };
    }
    RMClub.mouvementTresorerie(saison, 'scouting',
      `Mission de recrutement — ${ZONES[code].nom} (${duree} j)`, -cout);
    reseau.mission = {
      zone: code,
      duree,
      joursRestants: duree,
      cout,
      depuis: RMClub.dateISO ? RMClub.dateISO(RMClub.dateCourante(saison)) : null,
    };
    return { ok: true, cout, duree, zone: code, mission: reseau.mission };
  }

  // Rappelle le recruteur avant terme. La mission déjà payée n'est PAS
  // remboursée — sinon annuler serait toujours gratuit — mais le manager
  // récupère son recruteur pour l'envoyer ailleurs.
  function rappelerRecruteur(saison) {
    const reseau = assurerReseauScouting(saison);
    if (!reseau.mission) return { ok: false, motif: 'aucune' };
    const zone = reseau.mission.zone;
    // Le travail déjà fait compte : la connaissance acquise reste acquise.
    const faits = reseau.mission.duree - reseau.mission.joursRestants;
    reseau.zones[zone] = Math.min(CONNAISSANCE_MAX_ZONE,
      (reseau.zones[zone] || 0) + faits * GAIN_CONNAISSANCE_PAR_JOUR * 0.5);
    reseau.mission = null;
    return { ok: true, zone, joursEffectues: faits };
  }

  // Tire `n` joueurs de la zone : on privilégie les postes que la zone
  // produit réellement, sans jamais l'y enfermer (un vivier n'est pas une
  // usine à un seul poste).
  function tirerJoueursDeLaZone(rng, saison, code, n) {
    const RMClub = global.RMClub;
    const z = ZONES[code];
    const niveau = Math.max(0.1, Math.min(0.95, (saison.clubJoueur.niveauClub || 0.5) * z.talent));
    // Un vivier plus large que le besoin, puis on garde en priorité ce que la
    // zone est censée produire — le tri est déterministe, l'aléa est en amont.
    const vivier = RMClub.genererMarcheTransferts(rng, niveau, n * 3);
    const prioritaires = vivier.filter((j) => z.postes.indexOf(j.poste) !== -1);
    const autres = vivier.filter((j) => z.postes.indexOf(j.poste) === -1);
    return prioritaires.concat(autres).slice(0, n);
  }

  // Ce qu'un scout SUR PLACE sait d'un joueur : nettement plus qu'une rumeur
  // de marché (20-50 %), et d'autant plus que la zone est bien connue — mais
  // jamais tout. Le rapport reste à préciser, comme n'importe quelle recrue.
  const CONNAISSANCE_BASE_MISSION = 25;
  const CONNAISSANCE_PART_ZONE = 0.55;
  const CONNAISSANCE_MAX_JOUEUR = 88;
  function connaissanceDecouverte(rng, connaissanceDeLaZone) {
    const valeur = CONNAISSANCE_BASE_MISSION
      + connaissanceDeLaZone * CONNAISSANCE_PART_ZONE
      + rng() * 10;
    return Math.max(15, Math.min(CONNAISSANCE_MAX_JOUEUR, Math.round(valeur)));
  }

  // Rapport rédigé : ce que le scout a vu, dans les mots d'un rapport, pas
  // une liste de chiffres. Les joueurs cités sont ceux qu'il ramène vraiment.
  function redigerRapport(code, connaissanceApres, joueurs) {
    const z = ZONES[code];
    const niveauLecture = connaissanceApres >= 70 ? 'Le réseau est maintenant solide sur place'
      : connaissanceApres >= 40 ? 'Les contacts commencent à répondre'
        : 'Première approche du terrain, les portes s\'ouvrent lentement';
    const noms = joueurs.map((j) => `${j.nom} (${j.poste}, ${j.age} ans)`).join(', ');
    return `${z.reputation} ${niveauLecture} : ${z.nom} est connue à ${Math.round(connaissanceApres)} %. `
      + (joueurs.length
        ? `Profils ramenés — ${noms}. Les rapports restent à préciser sur place.`
        : 'Aucun profil exploitable cette fois.');
  }

  // Un jour de mission. Appelée par la boucle quotidienne (club-evenements.js)
  // comme les travaux d'infrastructure : la mission avance et se livre
  // d'elle-même, sans que le manager ait à cliquer.
  function avancerJourReseauScouting(saison, date) {
    const RMClub = global.RMClub;
    const reseau = assurerReseauScouting(saison);
    const mission = reseau.mission;
    if (!mission) return null;
    mission.joursRestants -= 1;
    if (mission.joursRestants > 0) return null;

    const code = mission.zone;
    const graine = Number.isFinite(saison.graine) ? saison.graine : 1;
    const rng = global.RugbyEngine.creerRng(RMClub.grainePourJour(graine, date, CANAL_RESEAU));

    // La zone est mieux connue : c'est l'acquis qui rend la prochaine mission
    // au même endroit plus rentable.
    reseau.zones[code] = Math.min(CONNAISSANCE_MAX_ZONE,
      (reseau.zones[code] || 0) + mission.duree * GAIN_CONNAISSANCE_PAR_JOUR);
    const connaissanceApres = reseau.zones[code];

    // Un bon recruteur ne fait pas que coûter moins cher : il ramène plus.
    const fr = facteurRecruteur(saison);
    const nb = Math.max(1, Math.min(DECOUVERTES_MAX,
      Math.round(mission.duree / JOURS_PAR_DECOUVERTE * fr)));
    const joueurs = tirerJoueursDeLaZone(rng, saison, code, nb);
    for (const j of joueurs) {
      j.zoneDecouverte = code;
      j.nationalite = code;
      const nom = nomDeLaZone(rng, code);
      if (nom) j.nom = nom;
      j.connaissance = connaissanceDecouverte(rng, connaissanceApres);
    }
    // En tête du marché : ce sont les joueurs que le manager vient de payer
    // pour voir, il ne doit pas avoir à les chercher.
    if (!Array.isArray(saison.marche)) saison.marche = [];
    saison.marche.unshift(...joueurs);

    const rapport = {
      zone: code,
      nomZone: ZONES[code].nom,
      date: RMClub.dateISO ? RMClub.dateISO(date) : null,
      duree: mission.duree,
      cout: mission.cout,
      connaissance: Math.round(connaissanceApres),
      texte: redigerRapport(code, connaissanceApres, joueurs),
      joueurs: joueurs.map((j) => ({ id: j.id, nom: j.nom, poste: j.poste, age: j.age })),
    };
    reseau.rapports.unshift(rapport);
    if (reseau.rapports.length > MAX_RAPPORTS) reseau.rapports.length = MAX_RAPPORTS;
    reseau.mission = null;

    RMClub.ajouterMessage(saison, 'transfert',
      `Retour de mission — réseau de recrutement (${ZONES[code].nom})`, rapport.texte);
    return rapport;
  }

  function rapportsReseau(saison) {
    return assurerReseauScouting(saison).rapports;
  }

  // Dossier complet pour l'écran : le catalogue, la mission en cours et
  // l'historique, en une seule lecture.
  function dossierReseau(saison, joursSimules) {
    const mission = missionScoutingEnCours(saison);
    return {
      zones: zonesScouting(saison, joursSimules),
      mission: mission ? Object.assign({ nomZone: ZONES[mission.zone].nom }, mission) : null,
      rapports: rapportsReseau(saison).slice(0, 8),
      durees: DUREES_PROPOSEES.slice(),
      recruteur: facteurRecruteur(saison) > 1,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    ZONES_SCOUTING: ZONES, DUREES_MISSION: DUREES_PROPOSEES,
    assurerReseauScouting, zonesScouting, connaissanceZone,
    coutMission, lancerMissionScouting, rappelerRecruteur,
    missionScoutingEnCours, avancerJourReseauScouting, rapportsReseau,
    dossierReseau,
  });
})(window);
