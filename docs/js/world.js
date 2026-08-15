// Écosystème mondial de compétitions (Mode Club) : pyramides nationales de
// rugby (12 pays), compétitions partagées entre plusieurs pays (franchises),
// et compétitions internationales (nations + clubs), au-dessus du même
// club.js (réutilise RMClub.genererCalendrier/classementInitial/
// classementTrieDe/enregistrerResultatDans — même moteur de points/calendrier
// round-robin que le championnat du club du joueur, jamais dupliqué).
//
// Comme le reste du jeu : noms de pays RÉELS (simple géographie, pas une
// marque), mais noms de compétitions et de clubs ENTIÈREMENT FICTIFS —
// aucune référence à une compétition ou à un club professionnel réel.
//
// Module ADDITIF et indépendant : une sauvegarde existante n'a pas de champ
// `monde` tant qu'on n'a pas ouvert l'onglet "🌍 Monde" (cf.
// clubUI.js/assurerMonde) — aucun impact sur le parcours Mode Club existant.
(function (global) {
  'use strict';

  const RMClub = global.RMClub;

  // Tirage dans une liste : la fonction du jeu (club.js), pas une copie.
  const choisir = (rng, liste) => global.RMClub.choisir(rng, liste);
  function melanger(rng, liste) {
    const copie = liste.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  let compteurClubMondeId = 1;

  // --- Pyramides nationales : 12 pays, chacun avec 1 à 3 niveaux, un
  // système RÉEL (promotion/relégation, franchises, provinces/régions, ou
  // mixte) et le nombre de clubs par niveau — dérivé de la structure
  // demandée. Un niveau peut pointer vers une `competitionPartagee` (id)
  // plutôt que définir ses propres clubs : plusieurs pays y jouent ALORS
  // LA MÊME compétition (ex. les 4 provinces irlandaises, les 4 régions
  // galloises, etc. jouent tous dans la même ligue de haut niveau).
  const PAYS = [
    { code: 'FRA', nom: 'France', systeme: 'promotion-relegation', divisions: [
      { niveau: 1, nom: 'Ligue d\'Excellence', nbClubs: 14, promus: 2, relegues: 2 },
      { niveau: 2, nom: 'Ligue Nationale', nbClubs: 16, promus: 2, relegues: 2 },
      { niveau: 3, nom: 'Ligue Régionale', nbClubs: 14, promus: 2, relegues: 0 },
    ] },
    { code: 'ANG', nom: 'Angleterre', systeme: 'promotion-relegation', divisions: [
      { niveau: 1, nom: 'Elite League', nbClubs: 10, promus: 1, relegues: 1 },
      { niveau: 2, nom: 'Championship Trophy', nbClubs: 12, promus: 1, relegues: 1 },
      { niveau: 3, nom: 'Regional One', nbClubs: 14, promus: 2, relegues: 0 },
    ] },
    { code: 'NZL', nom: 'Nouvelle-Zélande', systeme: 'franchises-provinces', divisions: [
      { niveau: 1, nom: 'Pacific Franchise Series', competitionPartagee: 'pacifique' },
      { niveau: 2, nom: 'Provincial Championship', nbClubs: 14, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'Regional Cup', nbClubs: 10, promus: 0, relegues: 0 },
    ] },
    { code: 'AUS', nom: 'Australie', systeme: 'franchises', divisions: [
      { niveau: 1, nom: 'Pacific Franchise Series', competitionPartagee: 'pacifique' },
      { niveau: 2, nom: 'Shute Heritage Cup', nbClubs: 10, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'Hospital Trophy', nbClubs: 10, promus: 0, relegues: 0 },
    ] },
    { code: 'RSA', nom: 'Afrique du Sud', systeme: 'franchises-provinces', divisions: [
      { niveau: 1, nom: 'Alliance Australe', competitionPartagee: 'alliance' },
      { niveau: 2, nom: 'Provincial Trophy', nbClubs: 8, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'Regional Series', nbClubs: 8, promus: 0, relegues: 0 },
    ] },
    { code: 'IRL', nom: 'Irlande', systeme: 'provinces', divisions: [
      { niveau: 1, nom: 'Alliance Australe', competitionPartagee: 'alliance' },
      { niveau: 2, nom: 'All-Isles League', nbClubs: 10, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'Provincial Series', nbClubs: 8, promus: 0, relegues: 0 },
    ] },
    { code: 'GAL', nom: 'Pays de Galles', systeme: 'regions', divisions: [
      { niveau: 1, nom: 'Alliance Australe', competitionPartagee: 'alliance' },
      { niveau: 2, nom: 'Principality League', nbClubs: 8, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'Regional Trophy', nbClubs: 8, promus: 0, relegues: 0 },
    ] },
    { code: 'ECO', nom: 'Écosse', systeme: 'franchises', divisions: [
      { niveau: 1, nom: 'Alliance Australe', competitionPartagee: 'alliance' },
      { niveau: 2, nom: 'Caledonian Series', nbClubs: 8, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'National League', nbClubs: 10, promus: 0, relegues: 0 },
    ] },
    { code: 'ITA', nom: 'Italie', systeme: 'mixte', divisions: [
      { niveau: 1, nom: 'Alliance Australe', competitionPartagee: 'alliance' },
      { niveau: 2, nom: 'Serie Elite', nbClubs: 10, promus: 2, relegues: 2 },
      { niveau: 3, nom: 'Serie Regionale', nbClubs: 12, promus: 2, relegues: 0 },
    ] },
    { code: 'JAP', nom: 'Japon', systeme: 'promotion-relegation', divisions: [
      { niveau: 1, nom: 'Rising Sun League', nbClubs: 12, promus: 2, relegues: 2 },
      { niveau: 2, nom: 'Challenger Division', nbClubs: 12, promus: 2, relegues: 2 },
      { niveau: 3, nom: 'Prefecture League', nbClubs: 10, promus: 2, relegues: 0 },
    ] },
    { code: 'ARG', nom: 'Argentine', systeme: 'promotion-relegation', divisions: [
      { niveau: 1, nom: 'Torneo de Elite', nbClubs: 12, promus: 2, relegues: 2 },
      { niveau: 2, nom: 'Torneo Regional', nbClubs: 12, promus: 2, relegues: 2 },
      { niveau: 3, nom: 'Torneo Provincial', nbClubs: 10, promus: 2, relegues: 0 },
    ] },
    { code: 'USA', nom: 'États-Unis', systeme: 'franchises', divisions: [
      { niveau: 1, nom: 'Continental Rugby League', nbClubs: 10, promus: 0, relegues: 0 },
      { niveau: 2, nom: 'American Amateur Circuit', nbClubs: 12, promus: 0, relegues: 0 },
      { niveau: 3, nom: 'Regional Conference', nbClubs: 12, promus: 0, relegues: 0 },
    ] },
  ];

  // --- Compétitions partagées entre plusieurs pays (niveau 1 "franchise") :
  // une seule compétition, des clubs venant de plusieurs pays à la fois —
  // répartition inspirée des vraies proportions (ex. l'Alliance Australe a
  // plus de clubs irlandais/gallois que écossais/italiens, comme la vraie
  // United Rugby Championship). ---
  const COMPETITIONS_PARTAGEES = {
    pacifique: { nom: 'Pacific Franchise Series', repartition: [['NZL', 6], ['AUS', 6]] },
    alliance: { nom: 'Alliance Australe', repartition: [['IRL', 4], ['GAL', 4], ['ECO', 2], ['ITA', 2], ['RSA', 4]] },
  };

  // --- Compétitions internationales additionnelles (au-dessus des
  // pyramides nationales) : équipes nationales (Couronnes/Hémisphère/
  // Mondiale) ou clubs qualifiés depuis le haut des championnats domestiques
  // européens (Continentale/Challenge). ---
  const COMPETITIONS_INTERNATIONALES = {
    couronnes: { nom: 'Tournoi des Couronnes', type: 'nations', pays: ['FRA', 'ANG', 'IRL', 'GAL', 'ECO', 'ITA'], fenetreJournees: [5, 9] },
    hemisphere: { nom: 'Trophée de l\'Hémisphère', type: 'nations', pays: ['NZL', 'AUS', 'RSA', 'ARG'], fenetreJournees: [15, 18] },
    mondiale: { nom: 'Coupe Mondiale des Nations', type: 'nations', pays: ['FRA', 'ANG', 'IRL', 'GAL', 'ECO', 'ITA', 'NZL', 'AUS', 'RSA', 'ARG', 'JAP', 'USA'], fenetreJournees: [20, 24], frequence: 4 },
    continentale: { nom: 'Coupe des Champions Continentale', type: 'clubs-qualification', paysEligibles: ['FRA', 'ANG', 'IRL', 'GAL', 'ECO', 'ITA'], qualifiesParDivisionN1: 4 },
    challenge: { nom: 'Coupe Challenge Continentale', type: 'clubs-qualification', paysEligibles: ['FRA', 'ANG', 'IRL', 'GAL', 'ECO', 'ITA'], qualifiesParDivisionN1RangDebut: 5, qualifiesParDivisionN1RangFin: 8 },
  };

  // --- Saveur locale des noms de clubs (fictifs) : préfixes de ville +
  // suffixes de club distincts par pays, pour que chaque championnat ait
  // une identité propre plutôt que des noms interchangeables. ---
  const NOMS_PAR_PAYS = {
    FRA: { villes: ['Vallouse', 'Roquebrune', 'Montorel', 'Castelnau', 'Bellerive', 'Fontclair', 'Hautecombe', 'Riverange', 'Solerac', 'Bourgnac', 'Aiglemont', 'Valfleur', 'Cordessac', 'Brivelle', 'Maurignan', 'Sartelou'], suffixes: ['RC', 'Olympique', 'Stade', 'Racing', 'Union', 'AS'] },
    ANG: { villes: ['Hawksmoor', 'Ravensworth', 'Blackmoor', 'Ashcombe', 'Thornbury', 'Elmsworth', 'Rookford', 'Cliftonshire', 'Wexbury', 'Marsden', 'Bramwell', 'Oakhurst', 'Stanmore', 'Fenwick'], suffixes: ['RFC', 'Lions', 'Saxons', 'Knights', 'Wanderers'] },
    NZL: { villes: ['Whareora', 'Pounamu', 'Kaimana', 'Rotoake', 'Tairawa', 'Manuka', 'Kowhai', 'Ngahere', 'Waitaki', 'Aoraki', 'Karekare', 'Tuiora'], suffixes: ['Rugby', 'Falcons', 'Blacks', 'Warriors'] },
    AUS: { villes: ['Coralbay', 'Redgum', 'Brindabella', 'Yallara', 'Kanangra', 'Warratah', 'Boronia', 'Kimberly Point', 'Nullawa', 'Illira'], suffixes: ['Sharks', 'Reds', 'Force', 'Rays'] },
    RSA: { villes: ['Kalahoek', 'Drakensrand', 'Vaalburg', 'Zulukop', 'Nkomazi', 'Karoovlei', 'Bushveld', 'Umlanga Rand'], suffixes: ['Bulls', 'Cheetahs', 'Kings', 'Stormers-like Rovers'] },
    IRL: { villes: ['Kilbrennan', 'Glenmara', 'Ballyowen', 'Doonmore', 'Ardglass', 'Rathlinn', 'Clonavon', 'Inisheer'], suffixes: ['RFC', 'Rovers', 'Celtic', 'Gaels'] },
    GAL: { villes: ['Cwmrian', 'Llanbryde', 'Pentregar', 'Bryncoed', 'Aberllyn', 'Glynmor', 'Tredaron', 'Pontfawr'], suffixes: ['RFC', 'Dragons', 'Valley', 'Reds'] },
    ECO: { villes: ['Glenross', 'Kirkallan', 'Braemuir', 'Dunwallace', 'Strathorn', 'Ardnamurra', 'Cairnbeath', 'Lochgorm'], suffixes: ['RFC', 'Thistle', 'Highlanders', 'Warriors'] },
    ITA: { villes: ['Montefalco', 'Riovento', 'Castelbruno', 'Solferrata', 'Portorenzo', 'Val di Serra', 'Lagoscuro', 'Trevalle'], suffixes: ['Rugby', 'Leoni', 'Aquile', 'Zebre-like Lupi'] },
    JAP: { villes: ['Kurotani', 'Shirahama', 'Aokaze', 'Momijigawa', 'Sakuraba', 'Tsukikage', 'Hinodemori', 'Yamabuki'], suffixes: ['Blaze', 'Wildknights', 'Sungoliath', 'Dynaboars'] },
    ARG: { villes: ['Rionegro', 'Altamira', 'Vallecruz', 'Portoseco', 'Sierraverde', 'Correntoso', 'Paloverde', 'Bahiazul'], suffixes: ['Rugby Club', 'Jaguares-like Cóndores', 'Pumas Norte', 'Leones'] },
    USA: { villes: ['Redwood Falls', 'Stonebridge', 'Eagle Rapids', 'Ironpoint', 'Silverlake', 'Prairiewood', 'Cascade Bay', 'Granite Hollow'], suffixes: ['Rugby', 'Eagles', 'Freedom', 'Patriots'] },
  };

  // `nomsUtilises` évite les doublons de nom de club À TRAVERS TOUT LE MONDE
  // (pas seulement dans une division) — un pool ville×suffixe est fini, deux
  // clubs identiques dans des divisions différentes casseraient la
  // crédibilité (impossible dans un vrai championnat). Après quelques essais
  // infructueux (pool épuisé), un numéro distinctif est ajouté plutôt que de
  // boucler indéfiniment.
  function genererNomClubPays(rng, codePays, nomsUtilises) {
    const noms = NOMS_PAR_PAYS[codePays];
    for (let essai = 0; essai < 20; essai++) {
      const nom = `${choisir(rng, noms.villes)} ${choisir(rng, noms.suffixes)}`;
      if (!nomsUtilises.has(nom)) { nomsUtilises.add(nom); return nom; }
    }
    let nom, n = 2;
    do { nom = `${choisir(rng, noms.villes)} ${choisir(rng, noms.suffixes)} ${n++}`; } while (nomsUtilises.has(nom));
    nomsUtilises.add(nom);
    return nom;
  }

  // Niveau de jeu (0-1, même échelle que RMClub.genererClub) selon le
  // niveau de la division : plus haut niveau = plus fort en moyenne, avec
  // un chevauchement réaliste entre le bas d'une division et le haut de la
  // suivante (le premier de N2 est parfois plus fort que le dernier de N1).
  function niveauBaseParNiveauDivision(niveau) {
    if (niveau === 1) return 0.62;
    if (niveau === 2) return 0.42;
    return 0.28;
  }

  function genererClubMonde(rng, codePays, niveauDivision, nomsUtilises) {
    const base = niveauBaseParNiveauDivision(niveauDivision);
    const niveauClub = Math.max(0.05, Math.min(0.95, base + (rng() * 0.3 - 0.15)));
    return {
      id: 'wc' + (compteurClubMondeId++),
      nom: genererNomClubPays(rng, codePays, nomsUtilises),
      pays: codePays,
      niveauClub,
      budget: Math.round(100 + niveauClub * 600 + rng() * 80),
    };
  }

  // --- Construit UNE division (clubs + calendrier + classement) — que ses
  // clubs viennent d'un seul pays ou d'une compétition partagée entre
  // plusieurs (répartition RÉELLE, cf. COMPETITIONS_PARTAGEES). Réutilise
  // RMClub.genererCalendrier/classementInitial (round-robin aller-retour,
  // même moteur que le championnat du club du joueur) — jamais dupliqué. ---
  function genererDivisionMonde(rng, def, codePaysSeul, nomsUtilises) {
    let clubs;
    if (def.competitionPartagee) {
      const part = COMPETITIONS_PARTAGEES[def.competitionPartagee];
      clubs = [];
      for (const [codePays, nb] of part.repartition) {
        for (let i = 0; i < nb; i++) clubs.push(genererClubMonde(rng, codePays, 1, nomsUtilises));
      }
      clubs = melanger(rng, clubs);
    } else {
      clubs = [];
      for (let i = 0; i < def.nbClubs; i++) clubs.push(genererClubMonde(rng, codePaysSeul, def.niveau, nomsUtilises));
    }
    return {
      id: def.competitionPartagee || `${codePaysSeul}-N${def.niveau}`,
      nom: def.nom, niveau: def.niveau,
      competitionPartagee: def.competitionPartagee || null,
      promus: def.promus || 0, relegues: def.relegues || 0,
      clubs,
      calendrier: RMClub.genererCalendrier(clubs),
      classement: RMClub.classementInitial(clubs),
    };
  }

  // --- Génère le monde complet : chaque pays, chaque niveau (une seule
  // fois pour une compétition partagée, référencée par plusieurs pays),
  // + les compétitions internationales (structure + qualifications, pas
  // encore de résultats — remplis par avancerJourneeMonde). ---
  function genererMonde(rng) {
    const nomsUtilises = new Set();
    const divisionsPartagees = {};
    const paysMonde = PAYS.map((pays) => ({
      code: pays.code, nom: pays.nom, systeme: pays.systeme,
      divisions: pays.divisions.map((def) => {
        if (def.competitionPartagee) {
          if (!divisionsPartagees[def.competitionPartagee]) {
            divisionsPartagees[def.competitionPartagee] = genererDivisionMonde(rng, def, null, nomsUtilises);
          }
          return { ref: def.competitionPartagee, niveau: def.niveau, nom: def.nom };
        }
        return { ref: `${pays.code}-N${def.niveau}`, niveau: def.niveau, nom: def.nom };
      }),
    }));
    const divisions = Object.assign({}, divisionsPartagees);
    for (const pays of PAYS) {
      for (const def of pays.divisions) {
        if (def.competitionPartagee) continue;
        divisions[`${pays.code}-N${def.niveau}`] = genererDivisionMonde(rng, def, pays.code, nomsUtilises);
      }
    }
    return {
      saisonMonde: 1,
      pays: paysMonde,
      divisions,
      // Compétitions internationales : rien de joué encore, juste la
      // structure + d'éventuels qualifiés (calculés à la première fin de
      // saison du monde, cf. resoudreCompetitionsInternationales).
      internationales: Object.keys(COMPETITIONS_INTERNATIONALES).reduce((acc, cle) => {
        const def = COMPETITIONS_INTERNATIONALES[cle];
        acc[cle] = { cle, nom: def.nom, type: def.type, dernierVainqueur: null, qualifies: null };
        return acc;
      }, {}),
    };
  }

  function assurerMonde(rng, saison) {
    if (!saison.monde) saison.monde = genererMonde(rng);
    return saison.monde;
  }

  // --- Résultat ABSTRAIT (statistique, pas le moteur physique — un monde de
  // ~380 clubs ne peut pas tous être simulés match par match avec le moteur
  // complet à chaque journée) : score dérivé du niveauClub RÉEL de chaque
  // club + aléa borné, jamais un résultat fabriqué sans base. Calibré pour
  // rester dans les ordres de grandeur d'un vrai match (15-45 points). ---
  function simulerResultatAbstrait(rng, niveauA, niveauB) {
    const base = 18 + (niveauA + niveauB) * 14;
    const ecartForce = (niveauA - niveauB) * 22;
    const bruitA = (rng() - 0.5) * 20;
    const bruitB = (rng() - 0.5) * 20;
    const scoreA = Math.max(0, Math.round(base / 2 + ecartForce / 2 + bruitA));
    const scoreB = Math.max(0, Math.round(base / 2 - ecartForce / 2 + bruitB));
    const essaisA = Math.max(0, Math.round(scoreA / 6.5));
    const essaisB = Math.max(0, Math.round(scoreB / 6.5));
    return { scoreA, scoreB, essaisA, essaisB };
  }

  // Avance TOUTES les divisions du monde d'une journée (prochaine ronde non
  // jouée de chacune) — jamais la division du club du joueur si elle en
  // fait partie : cf. clubUI.js, qui appelle avancerJourneeMonde SEULEMENT
  // pour les divisions autres que la sienne, déjà gérée par le vrai moteur.
  function avancerJourneeMonde(rng, monde, idDivisionAIgnorer) {
    for (const id of Object.keys(monde.divisions)) {
      if (id === idDivisionAIgnorer) continue;
      const div = monde.divisions[id];
      const prochaine = div.calendrier.find((f) => !f.joue);
      if (!prochaine) continue;
      const ronde = div.calendrier.filter((f) => f.journee === prochaine.journee);
      const parId = {};
      for (const c of div.clubs) parId[c.id] = c;
      for (const f of ronde) {
        const a = parId[f.domicileId], b = parId[f.exterieurId];
        if (!a || !b) continue;
        const r = simulerResultatAbstrait(rng, a.niveauClub, b.niveauClub);
        RMClub.enregistrerResultatDans(div.calendrier, div.classement, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
      }
    }
  }

  // --- Fin de saison du monde : promotion/relégation RÉELLE (dérivée du
  // classement final RÉELLEMENT joué, jamais un tirage) pour chaque paire de
  // divisions consécutives d'un même pays en système "promotion-relegation"
  // (ou avec des postes promus/relegues > 0, cf. Italie "mixte"). Les pays à
  // franchises/provinces gardent une composition fixe (pas de mécanisme de
  // promotion/relégation dans la vraie vie non plus). ---
  function resoudrePromotionRelegation(monde) {
    const mouvements = [];
    for (const pays of PAYS) {
      for (let i = 0; i < pays.divisions.length - 1; i++) {
        const haut = pays.divisions[i], bas = pays.divisions[i + 1];
        if (haut.competitionPartagee || bas.competitionPartagee) continue; // pas de prom/rel entre compétitions partagées
        if (!haut.relegues && !bas.promus) continue;
        const divHaut = monde.divisions[`${pays.code}-N${haut.niveau}`];
        const divBas = monde.divisions[`${pays.code}-N${bas.niveau}`];
        if (!divHaut || !divBas) continue;
        const classHaut = RMClub.classementTrieDe(divHaut.classement);
        const classBas = RMClub.classementTrieDe(divBas.classement);
        const descendent = classHaut.slice(-1 * (haut.relegues || 0)).map((r) => r.clubId);
        const montent = classBas.slice(0, bas.promus || 0).map((r) => r.clubId);
        if (!descendent.length && !montent.length) continue;
        const clubsHautRestants = divHaut.clubs.filter((c) => !descendent.includes(c.id));
        const clubsBasRestants = divBas.clubs.filter((c) => !montent.includes(c.id));
        const clubsDescendus = divHaut.clubs.filter((c) => descendent.includes(c.id));
        const clubsMontes = divBas.clubs.filter((c) => montent.includes(c.id));
        divHaut.clubs = [...clubsHautRestants, ...clubsMontes];
        divBas.clubs = [...clubsBasRestants, ...clubsDescendus];
        mouvements.push({ pays: pays.nom, monte: clubsMontes.map((c) => c.nom), descend: clubsDescendus.map((c) => c.nom) });
      }
    }
    return mouvements;
  }

  // --- Qualifications européennes (Continentale/Challenge) : dérivées du
  // classement RÉEL de fin de saison de chaque division de niveau 1
  // éligible (pays "européens" du Tournoi des Couronnes) — jamais une
  // liste fabriquée. ---
  function resoudreQualificationsEuropeennes(monde) {
    const continentale = [], challenge = [];
    const defC = COMPETITIONS_INTERNATIONALES.continentale;
    const defH = COMPETITIONS_INTERNATIONALES.challenge;
    // Plusieurs pays éligibles (Irlande/Galles/Écosse/Italie) partagent la
    // MÊME division de niveau 1 (Alliance Australe) : dédoublonne par division
    // AVANT de calculer les qualifiés, sinon ses qualifiés seraient comptés
    // une fois par pays participant (doublons dans continentale/challenge).
    const idsDivisionsVues = new Set();
    for (const codePays of defC.paysEligibles) {
      const pays = PAYS.find((p) => p.code === codePays);
      const n1 = pays.divisions.find((d) => d.niveau === 1);
      const idDiv = n1.competitionPartagee || `${codePays}-N1`;
      if (idsDivisionsVues.has(idDiv)) continue;
      idsDivisionsVues.add(idDiv);
      const div = monde.divisions[idDiv];
      if (!div) continue;
      const classement = RMClub.classementTrieDe(div.classement);
      continentale.push(...classement.slice(0, defC.qualifiesParDivisionN1).map((r) => r.clubId));
      challenge.push(...classement.slice(defH.qualifiesParDivisionN1RangDebut - 1, defH.qualifiesParDivisionN1RangFin).map((r) => r.clubId));
    }
    monde.internationales.continentale.qualifies = continentale;
    monde.internationales.challenge.qualifies = challenge;
  }

  // --- Compétitions de nations (Couronnes/Hémisphère/Mondiale) : force
  // d'une "sélection nationale" dérivée du niveau moyen RÉEL des clubs du
  // haut de la pyramide de ce pays (les meilleurs joueurs du pays sortent
  // des meilleurs clubs) — jamais un chiffre inventé indépendamment de la
  // pyramide simulée. Simulation abstraite (mini-championnat) pour désigner
  // un vainqueur réel de la fenêtre internationale. ---
  function niveauSelectionNationale(monde, codePays) {
    const pays = PAYS.find((p) => p.code === codePays);
    const n1 = pays.divisions.find((d) => d.niveau === 1);
    const idDiv = n1.competitionPartagee || `${codePays}-N1`;
    const div = monde.divisions[idDiv];
    if (!div) return 0.5;
    const clubsDuPays = div.clubs.filter((c) => c.pays === codePays || !div.competitionPartagee);
    const pool = clubsDuPays.length ? clubsDuPays : div.clubs;
    return pool.reduce((s, c) => s + c.niveauClub, 0) / pool.length;
  }

  function resoudreCompetitionInternationaleNations(rng, monde, cle) {
    const def = COMPETITIONS_INTERNATIONALES[cle];
    const equipes = def.pays.map((codePays) => ({
      id: codePays, nom: PAYS.find((p) => p.code === codePays).nom,
      niveauClub: niveauSelectionNationale(monde, codePays),
    }));
    const calendrier = RMClub.genererCalendrier(equipes);
    const classement = RMClub.classementInitial(equipes);
    for (const f of calendrier) {
      const a = equipes.find((e) => e.id === f.domicileId), b = equipes.find((e) => e.id === f.exterieurId);
      const r = simulerResultatAbstrait(rng, a.niveauClub, b.niveauClub);
      RMClub.enregistrerResultatDans(calendrier, classement, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
    }
    const classementTrie = RMClub.classementTrieDe(classement);
    monde.internationales[cle].dernierVainqueur = classementTrie[0] ? classementTrie[0].clubId : null;
    monde.internationales[cle].classement = classementTrie.map((r) => ({ pays: r.clubId, pts: r.pts, j: r.j }));
  }

  // Les divisions du monde ont des tailles très différentes de la ligue du
  // club du joueur (ex. 14 clubs = 26 journées en France N1, contre 10
  // journées pour une ligue de 6 clubs) : le monde ne termine donc PAS sa
  // saison au même rythme que le joueur. On ne déclenche nouvelleSaisonMonde
  // que lorsque TOUTES les divisions ont fini leur calendrier — sinon on
  // continue simplement à avancer journée après journée, y compris à
  // cheval sur plusieurs saisons du joueur.
  function mondeEstTermine(monde) {
    return Object.keys(monde.divisions).every((id) => monde.divisions[id].calendrier.every((f) => f.joue));
  }

  // --- Nouvelle saison du monde : promotion/relégation, qualifications
  // européennes, résolution des compétitions de nations dont la fenêtre
  // tombe cette saison-là (Couronnes/Hémisphère chaque saison, Mondiale
  // tous les `frequence` saisons), puis régénère calendrier/classement de
  // toutes les divisions pour la saison suivante (mêmes clubs, forme
  // remise à zéro — comme RMClub.avancerSaison pour les adversaires IA). ---
  function nouvelleSaisonMonde(rng, monde) {
    const mouvements = resoudrePromotionRelegation(monde);
    resoudreQualificationsEuropeennes(monde);
    const resultatsNations = [];
    for (const cle of Object.keys(COMPETITIONS_INTERNATIONALES)) {
      const def = COMPETITIONS_INTERNATIONALES[cle];
      if (def.type !== 'nations') continue;
      if (def.frequence && (monde.saisonMonde % def.frequence) !== 0) continue;
      resoudreCompetitionInternationaleNations(rng, monde, cle);
      resultatsNations.push({ cle, nom: def.nom, vainqueur: monde.internationales[cle].dernierVainqueur });
    }
    for (const id of Object.keys(monde.divisions)) {
      const div = monde.divisions[id];
      div.calendrier = RMClub.genererCalendrier(div.clubs);
      div.classement = RMClub.classementInitial(div.clubs);
    }
    monde.saisonMonde = (monde.saisonMonde || 1) + 1;
    return { mouvements, resultatsNations };
  }

  global.RMWorld = {
    PAYS, COMPETITIONS_PARTAGEES, COMPETITIONS_INTERNATIONALES,
    genererMonde, assurerMonde, avancerJourneeMonde, mondeEstTermine,
    resoudrePromotionRelegation, resoudreQualificationsEuropeennes, nouvelleSaisonMonde,
    simulerResultatAbstrait, niveauSelectionNationale,
  };
})(window);
