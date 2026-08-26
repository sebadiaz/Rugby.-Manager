// Marché des entraîneurs — les clubs adverses ont un manager, et une offre
// de carrière devient la CONSÉQUENCE d'un poste qui s'est libéré.
//
// Défaut mesuré avant cette tranche (TODO_AUDIT.md G24) : sur une carrière où
// les trois divisions françaises vivent dans la même sauvegarde,
//
//   clubs simulés                                    43
//   clubs portant un entraîneur                       0
//   offres reçues à 85 de réputation                  6
//   offres liées à un poste réellement libre          0 / 6
//
// `clubsRecruteurs` retenait TOUS les clubs sans condition : une offre
// arrivait parce que la réputation du joueur dépassait l'exigence du club,
// jamais parce que ce club cherchait quelqu'un. Les offres étaient un tirage.
//
// Le modèle retenu : un club a TOUJOURS un entraîneur — sinon il ne pourrait
// pas jouer, et l'écran des autres divisions aurait des trous. Ce qui varie,
// c'est que son poste soit OUVERT ou non. Un entraîneur limogé est remplacé
// par un intérimaire, et le club cherche : c'est ce poste ouvert, et lui
// seul, qui peut produire une offre.
//
// Le jugement ne s'invente pas : il lit la ligne que `enregistrerSaisonClubsFrance`
// vient d'écrire dans l'historique du club (position réelle dans SA division).
// Une seule source de vérité pour « comment s'est passée la saison ».
(function (global) {
  'use strict';

  // Réputation de départ par palier. Un club de l'élite n'engage pas le même
  // homme qu'un club de Régionale — c'est ce qui rend une offre de division 1
  // désirable, et ce qui explique qu'on n'y arrive pas d'un coup.
  const REPUTATION_PAR_NIVEAU = {
    1: { min: 62, max: 88 },
    2: { min: 50, max: 72 },
    3: { min: 38, max: 60 },
  };

  // Un intérimaire est moins coté que celui qu'il remplace : c'est ce qui
  // rend le poste attirant pour un manager mieux placé.
  const MALUS_INTERIM = 12;

  // Seuils de limogeage, exprimés en PART du classement (une division de 14
  // et une de 12 doivent se juger pareil).
  const PART_ZONE_ROUGE = 0.8;      // les 20 % du bas : le couperet
  const PART_MEDIOCRE = 0.6;        // moitié basse : toléré, sauf sur la durée
  const ANCIENNETE_USURE = 5;       // au-delà, la lassitude s'installe

  // Ancienneté de départ. Sans elle, une carrière qui commence peuple le pays
  // d'entraîneurs tous nommés le même jour : plus personne ne « s'en va après
  // N saisons sans progrès », et le monde a l'air de naître avec le joueur.
  const ANCIENNETE_INITIALE_MAX = 6;

  function choisirEntre(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function tousLesClubsRivaux(saison) {
    const liste = [];
    for (const club of (saison.adversaires || [])) liste.push({ club, niveau: niveauDuJoueur(saison) });
    const autres = (saison.autresDivisionsFrance || {}).divisions || {};
    for (const cle of Object.keys(autres)) {
      const division = autres[cle];
      if (!division || !division.clubs) continue;
      const niveau = Number(division.niveau) || Number(cle);
      for (const club of division.clubs) liste.push({ club, niveau });
    }
    return liste;
  }

  function niveauDuJoueur(saison) {
    return (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
  }

  function nomLibre(rng, pris) {
    // Les noms doivent être distincts : deux « Paul Dubois » à la tête de deux
    // clubs de la même division rendraient l'écran incompréhensible.
    for (let i = 0; i < 40; i++) {
      const nom = global.RMClub.genererNomJoueur(rng);
      if (!pris.has(nom)) { pris.add(nom); return nom; }
    }
    // Dernier recours : on désambiguïse plutôt que de rendre un doublon.
    let n = 2;
    let base = global.RMClub.genererNomJoueur(rng);
    while (pris.has(`${base} ${n}`)) n++;
    const nom = `${base} ${n}`;
    pris.add(nom);
    return nom;
  }

  function nouvelEntraineur(rng, niveau, pris, options) {
    const bornes = REPUTATION_PAR_NIVEAU[niveau] || REPUTATION_PAR_NIVEAU[3];
    const opts = options || {};
    let reputation = choisirEntre(rng, bornes.min, bornes.max);
    if (opts.interim) {
      // GARANTI moins bon que celui qu'il remplace. Retrancher le malus d'un
      // tirage neuf ne suffisait pas : l'intérimaire pouvait sortir mieux
      // coté que le limogé, et un club gagnait à échouer. On part donc du
      // plus faible des deux — le tirage ou le sortant — avant le malus.
      const plafond = opts.reputationSortant != null
        ? Math.min(reputation, opts.reputationSortant)
        : reputation;
      reputation = Math.max(1, plafond - MALUS_INTERIM);
    }
    return {
      nom: nomLibre(rng, pris),
      reputation,
      saisonsAuClub: opts.interim ? 0 : (opts.ancienneteMax ? choisirEntre(rng, 0, opts.ancienneteMax) : 0),
      interim: !!opts.interim,
    };
  }

  function etat(saison) {
    if (!saison.entraineursRivaux || typeof saison.entraineursRivaux !== 'object') {
      saison.entraineursRivaux = { parClub: {}, postes: [] };
    }
    const e = saison.entraineursRivaux;
    if (!e.parClub || typeof e.parClub !== 'object') e.parClub = {};
    if (!Array.isArray(e.postes)) e.postes = [];
    return e;
  }

  function nomsPris(saison) {
    const e = etat(saison);
    const pris = new Set();
    for (const cle of Object.keys(e.parClub)) {
      const v = e.parClub[cle];
      if (v && v.nom) pris.add(v.nom);
    }
    return pris;
  }

  // Peuple les clubs qui n'ont pas encore d'entraîneur. Idempotent : appelé à
  // chaque chargement d'écran sans rien réécrire de ce qui existe. Les clubs
  // qui APPARAISSENT plus tard (montée, descente, nouvelle division simulée)
  // sont donc servis au passage, sans traitement particulier.
  function assurerEntraineursRivaux(rng, saison) {
    const e = etat(saison);
    const pris = nomsPris(saison);
    for (const { club, niveau } of tousLesClubsRivaux(saison)) {
      if (!club || !club.id) continue;
      if (e.parClub[club.id]) continue;
      e.parClub[club.id] = nouvelEntraineur(rng, niveau, pris,
        { ancienneteMax: ANCIENNETE_INITIALE_MAX });
    }
    return e;
  }

  // --- Ce que l'entraîneur PÈSE sur le jeu de son club ---------------------
  //
  // Avant (G25) le nom sur le banc était une étiquette : ni les résultats des
  // autres divisions ni les matchs IA de la division du joueur ne le
  // lisaient. Limoger quelqu'un ne changeait rien sur le terrain, et choisir
  // un poste plutôt qu'un autre n'avait aucune conséquence sportive.
  //
  // L'effet se juge DANS SA DIVISION, jamais sur une échelle absolue. Un
  // entraîneur coté 63 est le maillon faible de l'élite ; coté 59 il est la
  // référence de la Régionale. Sur une échelle absolue le premier passerait
  // pour le meilleur des deux, ce qui est faux, et surtout : tous les bancs
  // de Régionale deviendraient des handicaps, ce qui n'a aucun sens.
  //
  // Amplitude calibrée par la mesure, pas choisie (TODO_AUDIT.md G25). Sur
  // 400 saisons d'une division de 14 clubs aux niveaux réalistes :
  //
  //   delta ±0,02  ->  1,35 place d'écart entre le meilleur et le pire banc
  //   delta ±0,03  ->  2,03
  //   delta ±0,04  ->  ~2,6   <- retenu
  //   delta ±0,05  ->  3,32
  //   delta ±0,12  ->  7,58   (l'entraîneur écraserait l'effectif)
  //
  // L'étendue réelle des niveaux d'effectif dans une division est de 0,25 à
  // 0,30. Une amplitude de ±0,04, soit 0,08 d'étendue, fait donc peser le
  // banc pour environ un tiers de l'écart entre le meilleur et le pire
  // effectif : il compte, il ne remplace pas le recrutement.
  const AMPLITUDE_EFFET_ENTRAINEUR = 0.04;

  function effetEntraineur(entraineur, niveau) {
    if (!entraineur || entraineur.reputation == null) return 0;
    const bornes = REPUTATION_PAR_NIVEAU[niveau] || REPUTATION_PAR_NIVEAU[3];
    const milieu = (bornes.min + bornes.max) / 2;
    const demiEtendue = (bornes.max - bornes.min) / 2;
    if (!demiEtendue) return 0;
    const relatif = (entraineur.reputation - milieu) / demiEtendue;
    // Borné : une réputation hors fourchette (intérimaire très mal coté,
    // entraîneur qui suit son club dans une division inférieure) ne doit pas
    // faire exploser l'échelle.
    const borne = Math.max(-1, Math.min(1, relatif));
    return borne * AMPLITUDE_EFFET_ENTRAINEUR;
  }

  function niveauDeDivisionDuClub(saison, clubId) {
    for (const { club, niveau } of tousLesClubsRivaux(saison)) {
      if (club.id === clubId) return niveau;
    }
    return niveauDuJoueur(saison);
  }

  function effetEntraineurDuClub(saison, clubId) {
    return effetEntraineur(entraineurDuClub(saison, clubId), niveauDeDivisionDuClub(saison, clubId));
  }

  // Le niveau d'un club, banc compris. UN SEUL endroit : les deux chemins qui
  // produisent des résultats (les divisions abstraites et les matchs IA de la
  // division du joueur) appellent celui-ci, jamais leur propre barème.
  function niveauAvecEntraineur(saison, club, niveauDeBase) {
    if (!club || !club.id) return niveauDeBase != null ? niveauDeBase : 0.5;
    const base = niveauDeBase != null
      ? niveauDeBase
      : (club.niveauClub != null ? club.niveauClub : 0.5);
    return Math.max(0.02, Math.min(0.98, base + effetEntraineurDuClub(saison, club.id)));
  }

  function entraineurDuClub(saison, clubId) {
    const e = etat(saison);
    return e.parClub[clubId] || null;
  }

  // Les postes ouverts : les clubs qui cherchent réellement quelqu'un.
  function postesLibres(saison) {
    return etat(saison).postes.slice();
  }

  function posteOuvert(saison, clubId) {
    return etat(saison).postes.find((p) => p.clubId === clubId) || null;
  }

  // Bilan de la saison écoulée, LU dans l'historique que la pyramide vient
  // d'écrire — jamais recalculé ici. Si le club n'a pas de ligne pour cette
  // saison, c'est que sa division n'a pas été disputée : on ne juge personne
  // sur une saison qui n'a pas eu lieu.
  function bilanDuClub(saison, club, numeroSaison) {
    const h = Array.isArray(club.historiqueSaisons) ? club.historiqueSaisons : [];
    const ligne = h.find((x) => x.numero === numeroSaison) || h[h.length - 1];
    if (!ligne || !ligne.position || !ligne.totalClubs) return null;
    return { position: ligne.position, total: ligne.totalClubs };
  }

  // La règle, isolée et pure : elle se teste sans monter une carrière.
  function doitEtreLimoge(bilan, entraineur) {
    if (!bilan || !bilan.total) return false;
    const part = bilan.position / bilan.total;
    const anciennete = (entraineur && entraineur.saisonsAuClub) || 0;
    // Champion : intouchable, quelle que soit l'ancienneté.
    if (bilan.position === 1) return false;
    // Zone rouge : le couperet, sans sursis. Le sursis « on laisse un an »
    // avait l'air raisonnable et rendait la règle INERTE au démarrage d'une
    // carrière, où tous les entraîneurs ont zéro saison : aucun poste ne se
    // libérait jamais la première année.
    if (part >= PART_ZONE_ROUGE) return true;
    // Médiocrité installée : la lassitude finit par l'emporter.
    if (part >= PART_MEDIOCRE && anciennete >= ANCIENNETE_USURE) return true;
    // Un intérimaire qui n'a pas convaincu ne s'installe pas.
    if (entraineur && entraineur.interim && part >= PART_MEDIOCRE) return true;
    return false;
  }
  // Pour l'écran : « si la saison s'arrêtait maintenant ». C'est la MÊME
  // règle appliquée au classement provisoire — pas un second barème qui
  // finirait par diverger de celui qui décide vraiment.
  function enDanger(positionActuelle, total, entraineur) {
    return doitEtreLimoge({ position: positionActuelle, total }, entraineur);
  }

  // Fin de saison. Deux temps, dans cet ordre :
  //   1. les postes restés ouverts depuis l'an dernier sont POURVUS — le
  //      joueur n'a pas saisi sa chance, un autre l'a fait ;
  //   2. la saison écoulée est jugée, ce qui ouvre de NOUVEAUX postes.
  // Sans le premier temps, les postes s'accumuleraient et la moitié du pays
  // finirait sans entraîneur en titre.
  function resoudreEntraineursFinDeSaison(rng, saison, options) {
    const opts = options || {};
    const numeroSaison = opts.numeroSaison != null ? opts.numeroSaison : (saison.numero || 1);
    const e = etat(saison);
    assurerEntraineursRivaux(rng, saison);
    const pris = nomsPris(saison);
    const index = {};
    for (const { club, niveau } of tousLesClubsRivaux(saison)) index[club.id] = { club, niveau };

    // 1. On pourvoit les postes de l'an dernier.
    for (const poste of e.postes) {
      const entree = index[poste.clubId];
      if (!entree) continue;
      const titulaire = e.parClub[poste.clubId];
      // Un intérimaire qui a tenu la boutique peut être confirmé : c'est le
      // cas le plus fréquent dans la vraie vie, et ça évite un défilé de
      // noms inconnus à chaque saison.
      if (titulaire && titulaire.interim && rng() < 0.4) {
        titulaire.interim = false;
      } else {
        e.parClub[poste.clubId] = nouvelEntraineur(rng, entree.niveau, pris);
      }
    }
    e.postes = [];

    // 2. On juge la saison écoulée.
    const nouveaux = [];
    for (const cle of Object.keys(index)) {
      const { club, niveau } = index[cle];
      const entraineur = e.parClub[club.id];
      if (!entraineur) continue;
      const bilan = opts.bilans && opts.bilans[club.id]
        ? opts.bilans[club.id]
        : bilanDuClub(saison, club, numeroSaison);
      if (!bilan) continue; // division non disputée : personne n'est jugé
      if (!doitEtreLimoge(bilan, entraineur)) {
        entraineur.saisonsAuClub = (entraineur.saisonsAuClub || 0) + 1;
        continue;
      }
      const partant = entraineur.nom;
      e.parClub[club.id] = nouvelEntraineur(rng, niveau, pris,
        { interim: true, reputationSortant: entraineur.reputation });
      nouveaux.push({
        clubId: club.id,
        clubNom: club.nom,
        niveau,
        raison: raisonDuDepart(partant, bilan, entraineur),
        entraineurParti: partant,
        interim: e.parClub[club.id].nom,
        depuisSaison: numeroSaison,
      });
    }
    e.postes = nouveaux;
    return nouveaux;
  }

  // --- Limogeage EN COURS DE SAISON (G26) ---------------------------------
  //
  // Avant : `resoudreEntraineursFinDeSaison` n'était appelée que par
  // `avancerSaison`. Un club pouvait sombrer pendant six mois sans que rien
  // ne bouge, et le marché ne s'agitait qu'une fois l'an, d'un bloc. La règle
  // de jugement existait pourtant déjà et lisait le classement du moment —
  // rien ne la déclenchait.
  //
  // Le verdict est le MÊME qu'en fin de saison (`doitEtreLimoge` via
  // `enDanger`) : un second barème finirait par diverger, et le « sur la
  // sellette » affiché au joueur ne prédirait plus rien.
  //
  // Deux garde-fous :
  //   - il faut un ÉCHANTILLON. Condamner sur deux journées serait absurde,
  //     et le classement d'un début de saison ne veut rien dire.
  //   - ce n'est jamais une certitude à date fixe : un club au fond craque un
  //     jour ou un autre, jamais le jour même. D'où un tirage quotidien.
  const JOURNEES_MIN_AVANT_COUPERET = 6;
  // Combien de jours un club supporte de rester en zone de limogeage avant
  // que le banc saute. Une PATIENCE qui s'épuise, pas un tirage à pile ou
  // face — trois raisons, toutes vérifiées :
  //
  //   1. le premier jet était un tirage quotidien à 2 % ; mesuré sur douze
  //      saisons réellement jouées, il produisait **15 limogeages par saison**
  //      sur 43 clubs. Le marché aurait été en convulsion permanente et
  //      presque chaque club aurait fini avec un intérimaire ;
  //   2. un tirage rend les contrôles instables : ils passent ou non selon le
  //      nombre de jours qu'on veut bien leur laisser ;
  //   3. et surtout, une patience se RACONTE. Le joueur voit « sur la
  //      sellette » puis le couperet tomber, au lieu d'un coup de dé.
  //
  // Le compteur repart à zéro dès que le club sort de la zone : gagner deux
  // matchs sauve réellement un entraîneur.
  const JOURS_DE_SURSIS = 45;
  // Nombre de places, en partant du bas, qui déclenchent une crise en cours
  // de saison. Calibré par la mesure ci-dessous.
  const PLACES_CRITIQUES = 2;

  function journeesJouees(calendrier, nbClubs) {
    const jouees = (calendrier || []).filter((f) => f.joue).length;
    const parJournee = Math.max(1, Math.floor((nbClubs || 2) / 2));
    return Math.floor(jouees / parJournee);
  }

  // Position actuelle de chaque club rival, division par division, avec le
  // nombre de journées réellement disputées. Lu, jamais reconstitué.
  function positionsDuMoment(saison) {
    const RMClub = global.RMClub;
    const liste = [];
    const maDivision = RMClub.classementTrie ? RMClub.classementTrie(saison) : [];
    const nbMien = (saison.adversaires || []).length + 1;
    const journeesMien = journeesJouees(saison.calendrier, nbMien);
    maDivision.forEach((ligne, i) => {
      const club = (saison.adversaires || []).find((a) => a.id === ligne.clubId);
      if (!club) return; // le club du joueur : ce n'est pas lui qu'on limoge
      liste.push({ club, niveau: niveauDuJoueur(saison),
        position: i + 1, total: maDivision.length, journees: journeesMien });
    });
    const autres = (saison.autresDivisionsFrance || {}).divisions || {};
    for (const cle of Object.keys(autres)) {
      const div = autres[cle];
      if (!div || !div.clubs) continue;
      const niveau = Number(div.niveau) || Number(cle);
      const trie = RMClub.classementTrieDe ? RMClub.classementTrieDe(div.classement || {}) : [];
      const j = journeesJouees(div.calendrier, div.clubs.length);
      trie.forEach((ligne, i) => {
        const club = div.clubs.find((c) => c.id === ligne.clubId);
        if (!club) return;
        liste.push({ club, niveau, position: i + 1, total: trie.length, journees: j });
      });
    }
    return liste;
  }

  function resoudreLimogeagesEnCours(rng, saison, date) {
    const e = etat(saison);
    const pris = nomsPris(saison);
    const partants = [];
    for (const { club, niveau, position, total, journees } of positionsDuMoment(saison)) {
      if (journees < JOURNEES_MIN_AVANT_COUPERET) continue;
      const entraineur = e.parClub[club.id];
      if (!entraineur) continue;
      // Un poste déjà ouvert ne se rouvre pas : l'intérimaire a le temps de
      // faire ses preuves jusqu'à la fin de la saison.
      if (e.postes.some((p) => p.clubId === club.id)) continue;
      if (!enDanger(position, total, entraineur)) {
        // Sorti de la zone : la patience se reconstitue entièrement.
        entraineur.joursEnDanger = 0;
        continue;
      }
      // Mi-saison, la barre est PLUS HAUTE qu'à la fin. Ce n'est pas un
      // second barème — le verdict reste `enDanger`, donc `doitEtreLimoge` —
      // mais une condition supplémentaire par-dessus : être 12e sur 14 en
      // novembre ne coûte pas un poste, être dans les places qui descendent,
      // oui. Sans ce resserrement, mesuré sur douze saisons réellement
      // jouées : 15 limogeages par saison sur 43 clubs.
      if (position < total - (PLACES_CRITIQUES - 1)) { entraineur.joursEnDanger = 0; continue; }
      entraineur.joursEnDanger = (entraineur.joursEnDanger || 0) + 1;
      if (entraineur.joursEnDanger < JOURS_DE_SURSIS) continue;
      const partant = entraineur.nom;
      e.parClub[club.id] = nouvelEntraineur(rng, niveau, pris,
        { interim: true, reputationSortant: entraineur.reputation });
      const poste = {
        clubId: club.id,
        clubNom: club.nom,
        niveau,
        raison: `${partant} a été limogé en cours de saison : ${position}e sur ${total} après ${journees} journées.`,
        joursEnDanger: entraineur.joursEnDanger,
        entraineurParti: partant,
        interim: e.parClub[club.id].nom,
        depuisSaison: saison.numero || 1,
        enCoursDeSaison: true,
      };
      e.postes.push(poste);
      partants.push(poste);
      // Le manager doit l'apprendre : un marché qui bouge dans son dos ne
      // lui sert à rien.
      if (global.RMClub.ajouterMessage) {
        global.RMClub.ajouterMessage(saison, 'carriere', 'Un banc se libère',
          `${poste.raison} ${poste.interim} assure l'intérim.`);
      }
    }
    return partants;
  }

  // Les bancs qui chauffent, toutes divisions confondues (G27).
  //
  // Le compteur `joursEnDanger` existait déjà et s'affichait — mais sur la
  // fiche d'UN club à la fois. Pour savoir quels bancs étaient menacés dans
  // le pays, il fallait ouvrir les 43 fiches une par une : la donnée était
  // là, elle n'était pas atteignable.
  //
  // Rien n'est recalculé ici. On relit `positionsDuMoment` — la même source
  // que le couperet — et le compteur porté par l'entraîneur lui-même. La
  // liste ne peut donc pas dire autre chose que la fiche.
  function bancsQuiChauffent(saison) {
    const e = etat(saison);
    const ouverts = new Set(e.postes.map((p) => p.clubId));
    const liste = [];
    for (const { club, niveau, position, total, journees } of positionsDuMoment(saison)) {
      // Un poste déjà vacant n'est plus un banc qui chauffe : c'est une offre,
      // et elle a son propre écran.
      if (ouverts.has(club.id)) continue;
      const entraineur = e.parClub[club.id];
      if (!entraineur || !entraineur.joursEnDanger) continue;
      liste.push({
        clubId: club.id,
        clubNom: club.nom,
        niveau,
        entraineur: entraineur.nom,
        reputation: entraineur.reputation,
        interim: !!entraineur.interim,
        jours: entraineur.joursEnDanger,
        sursis: JOURS_DE_SURSIS,
        position,
        total,
        journees,
      });
    }
    // Le plus menacé d'abord : c'est celui dont le poste se libérera le plus
    // tôt, donc celui sur lequel le manager doit se décider.
    return liste.sort((a, b) => b.jours - a.jours);
  }

  function raisonDuDepart(partant, bilan, entraineur) {
    const part = bilan.position / bilan.total;
    const anciennete = (entraineur && entraineur.saisonsAuClub) || 0;
    if (part >= PART_ZONE_ROUGE) {
      return `${partant} a été limogé après une ${bilan.position}e place sur ${bilan.total}.`;
    }
    if (entraineur && entraineur.interim) {
      return `${partant}, intérimaire, n'a pas été confirmé (${bilan.position}e sur ${bilan.total}).`;
    }
    return `${partant} s'en va après ${anciennete} saisons sans progrès (${bilan.position}e sur ${bilan.total}).`;
  }

  Object.assign(global.RMClub = global.RMClub || {}, {
    assurerEntraineursRivaux,
    entraineurDuClub,
    effetEntraineur,
    effetEntraineurDuClub,
    niveauAvecEntraineur,
    AMPLITUDE_EFFET_ENTRAINEUR,
    postesLibres,
    posteOuvert,
    resoudreEntraineursFinDeSaison,
    resoudreLimogeagesEnCours,
    bancsQuiChauffent,
    JOURNEES_MIN_AVANT_COUPERET,
    JOURS_DE_SURSIS,
    doitEtreLimoge,
    enDanger,
    REPUTATION_PAR_NIVEAU,
  });
})(window);
