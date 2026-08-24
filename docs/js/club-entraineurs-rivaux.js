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
    if (opts.interim) reputation = Math.max(1, reputation - MALUS_INTERIM);
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
      e.parClub[club.id] = nouvelEntraineur(rng, niveau, pris, { interim: true });
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
    postesLibres,
    posteOuvert,
    resoudreEntraineursFinDeSaison,
    doitEtreLimoge,
    enDanger,
    REPUTATION_PAR_NIVEAU,
  });
})(window);
