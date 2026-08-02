// Effectifs complets des clubs adverses (Mode Club) — TODO_AUDIT.md P1-29.
//
// Avant : un club adverse possédait exactement QUINZE joueurs, un par numéro
// de maillot, générés une fois pour toutes. Aucun banc (l'écran de
// composition adverse affichait un banc vide), aucune fatigue, aucune
// blessure, aucune rotation — le même XV descendait sur le terrain toutes
// les semaines, indéfiniment frais, pendant que le joueur gérait 24 hommes
// avec leurs contraintes. Une asymétrie de gestion, et un adversaire qui ne
// vivait pas.
//
// Maintenant : un GROUPE de 24 joueurs (le même gabarit que le club du
// joueur, cf. GABARIT_EFFECTIF), avec fatigue et blessures réellement
// suivies, et un XV du jour choisi par rotation.
//
// --- Choix d'architecture : extension ADDITIVE ---------------------------
// `club.effectif` (15 joueurs indexés par numéro) est lu par de nombreux
// consommateurs déjà en place : effectifVersJoueursCfg (config moteur),
// analyserAdversaire (comparaison d'attributs), approcherJoueurAdverse
// (transferts internationaux), slotAdverse (écran de composition). Le
// changer de forme aurait demandé de tous les toucher.
//
// On garde donc `effectif` EXACTEMENT tel qu'il était — c'est désormais la
// FEUILLE DE MATCH du jour, dérivée du groupe — et on ajoute `groupe` à
// côté. Aucun consommateur existant ne change ; ils voient simplement un XV
// qui évolue d'une journée à l'autre, ce qui est précisément l'objectif.
//
// Aucune dépendance au DOM, aucun Math.random : le rng vient de l'appelant.
(function (global) {
  'use strict';

  // Charge de match d'un club adverse : même ordre de grandeur que pour le
  // club du joueur (cf. appliquerFatigue), pour que les deux camps subissent
  // la même chose. Un remplaçant entre en cours de match : il en prend moins.
  const FATIGUE_MATCH_TITULAIRE = 32;
  const FATIGUE_MATCH_REMPLACANT = 14;
  // Risque de blessure par match et par titulaire — même valeur que le club
  // du joueur (cf. faireProgresserBlessures), pour ne favoriser personne.
  const RISQUE_BLESSURE_MATCH = 0.06;
  // Au-delà de ce seuil, un club adverse préfère laisser souffler un cadre
  // et aligner un remplaçant frais : c'est ce qui produit la rotation.
  const SEUIL_ROTATION_FATIGUE = 70;

  // Un club « léger » (autre palier français, club du monde) n'a pas
  // d'effectif simulé du tout : on ne lui en invente pas un (cf. P1-28).
  function aUnEffectifSimule(club) {
    return !!(club && (club.groupe || (club.effectif && club.effectif.length)));
  }

  // Groupe complet d'un club adverse, créé au premier besoin.
  //
  // Rétrocompatibilité : une sauvegarde antérieure n'a que ses 15 joueurs par
  // numéro. On les CONSERVE (ce sont les joueurs que le manager a déjà vus,
  // analysés, peut-être approchés au marché des transferts) en les convertis-
  // sant au format étendu, et on complète le groupe jusqu'au gabarit complet.
  function groupeAdverse(saison, club) {
    if (club.groupe && club.groupe.length) return club.groupe;
    const RMClub = global.RMClub;
    // Graine dérivée de l'identité du club et de la saison : deux chargements
    // de la même sauvegarde produisent le même groupe (cf. club-temps.js).
    const rng = global.RugbyEngine.creerRng(
      grainePourClub(saison, club) >>> 0
    );
    const groupe = [];
    for (const j of (club.effectif || [])) {
      groupe.push(Object.assign({}, j, {
        id: j.id || ('adv-' + club.id + '-' + j.numero),
        fatigue: j.fatigue || 0,
        blessureJournees: j.blessureJournees || 0,
        moral: j.moral != null ? j.moral : 65,
        pret: null,
        matchsJoues: j.matchsJoues || 0,
      }));
    }
    // Complète jusqu'au gabarit d'un vrai groupe (24), en respectant la
    // répartition par poste — un club de rugby n'a pas trois demis de mêlée
    // et zéro pilier de réserve.
    const manquants = posteManquants(groupe);
    for (const poste of manquants) {
      const j = RMClub.genererJoueurEtendu(poste, rng, club.niveauClub != null ? club.niveauClub : 0.5);
      j.id = 'adv-' + club.id + '-r' + groupe.length;
      groupe.push(j);
    }
    club.groupe = groupe;
    return groupe;
  }

  // Graine stable d'un club : dérivée de la graine de la saison et de son
  // identifiant, jamais d'un tirage libre — le même club regénère toujours
  // les mêmes remplaçants.
  function grainePourClub(saison, club) {
    const base = Number.isFinite(saison.graine) ? saison.graine : 1;
    let h = base >>> 0;
    const cle = String(club.id || '');
    for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
    return h || 1;
  }

  // Postes qu'il manque au groupe pour atteindre le gabarit complet.
  function posteManquants(groupe) {
    const GABARIT = global.RMClub.GABARIT_EFFECTIF;
    const compte = {};
    for (const j of groupe) compte[j.poste] = (compte[j.poste] || 0) + 1;
    const manquants = [];
    const cible = {};
    for (const p of GABARIT) cible[p] = (cible[p] || 0) + 1;
    for (const poste of Object.keys(cible)) {
      for (let i = compte[poste] || 0; i < cible[poste]; i++) manquants.push(poste);
    }
    return manquants;
  }

  // --- Le XV du jour, choisi par ROTATION ---------------------------------
  // Réutilise exactement la logique du club du joueur (meilleureComposition
  // + completerCompositionBanc) : un blessé n'est jamais aligné, un joueur
  // épuisé cède sa place à un remplaçant frais. Aucune règle parallèle.
  function choisirXVAdverse(club, groupe) {
    const RMClub = global.RMClub;
    // Un club fait tourner : on écarte temporairement les joueurs cuits, sauf
    // s'il ne reste plus assez de monde à leur poste (comme un vrai club, qui
    // fait alors jouer un cadre fatigué plutôt que de descendre à 14).
    const disponibles = groupe.filter((j) => !(j.blessureJournees > 0));
    // Classement par valeur EFFECTIVE, fatigue comprise — exactement comme
    // les stats réellement transmises au moteur pour le club du joueur (cf.
    // compositionVersJoueursCfg). Un cadre cuit passe donc derrière un
    // remplaçant frais, ce qui produit une vraie rotation au lieu d'aligner
    // éternellement les 15 meilleurs sur le papier. Le malus est volontai-
    // rement plus marqué que celui du moteur (jusqu'à -25 contre -12) : il
    // exprime ici un CHOIX d'entraîneur, pas la baisse de rendement en match.
    const evalues = disponibles.map((j) => Object.assign({}, j, {
      vitesse: Math.max(20, j.vitesse - Math.round(((j.fatigue || 0) / 100) * 25)),
      plaquage: Math.max(20, j.plaquage - Math.round(((j.fatigue || 0) / 100) * 25)),
    }));
    const composition = RMClub.meilleureComposition(evalues);
    // Filet de sécurité : si un poste reste vide (groupe décimé), on
    // complète avec l'ensemble du groupe disponible plutôt que de jouer à 14.
    const manquants = RMClub.validerComposition(composition);
    if (manquants.length) {
      return RMClub.completerComposition(disponibles.length ? disponibles : groupe, composition);
    }
    return composition;
  }

  // Reconstruit `effectif` (la feuille de match, 15 par numéro) et `banc`
  // (8 remplaçants, numéros 16 à 23) à partir du groupe. C'est ici que la
  // rotation devient VISIBLE : l'écran de composition adverse, l'analyse
  // d'avant-match et la config envoyée au moteur lisent tous `effectif`.
  function rafraichirEffectifAdverse(saison, club) {
    const RMClub = global.RMClub;
    const groupe = groupeAdverse(saison, club);
    const composition = choisirXVAdverse(club, groupe);
    const parId = {};
    for (const j of groupe) parId[j.id] = j;

    const effectif = [];
    for (const numero of Object.keys(RMClub.POSTE_REQUIS)) {
      const j = parId[composition[numero]];
      if (!j) continue;
      // Copie portant le NUMÉRO du jour : c'est la forme attendue par tous
      // les consommateurs existants (effectifVersJoueursCfg, analyse...).
      effectif.push(Object.assign({}, j, { numero: Number(numero) }));
    }
    club.effectif = effectif;

    const banc = RMClub.completerCompositionBanc(groupe, composition, {});
    club.banc = Object.keys(banc).map((numeroBanc) => {
      const j = parId[banc[numeroBanc]];
      return j ? Object.assign({}, j, { numero: Number(numeroBanc) }) : null;
    }).filter(Boolean);
    return club;
  }

  // --- Conséquences réelles d'un match ------------------------------------
  // Fatigue des joueurs alignés (titulaires et remplaçants entrés), blessures
  // tirées sur les titulaires, temps de jeu compté. Rien de décoratif : ce
  // sont les valeurs du GROUPE qui bougent, donc la sélection de la semaine
  // suivante change réellement.
  function appliquerEffetsMatchAdverse(saison, club, slot, rng) {
    if (!aUnEffectifSimule(club)) return { fatigues: 0, blesses: [] };
    const groupe = groupeAdverse(saison, club);
    const parId = {};
    for (const j of groupe) parId[j.id] = j;
    const titulaires = Object.values((slot && slot.compositionTitulaires) || {});
    const remplacants = Object.values((slot && slot.compositionBanc) || {});
    const tirage = rng || global.RugbyEngine.creerRng(grainePourClub(saison, club));
    const blesses = [];
    let fatigues = 0;
    for (const id of titulaires) {
      const j = parId[id];
      if (!j) continue;
      j.fatigue = Math.min(100, (j.fatigue || 0) + FATIGUE_MATCH_TITULAIRE);
      j.matchsJoues = (j.matchsJoues || 0) + 1;
      fatigues++;
      if (tirage() < RISQUE_BLESSURE_MATCH) {
        j.blessureJournees = 7 + Math.floor(tirage() * 22);
        blesses.push({ id: j.id, nom: j.nom, jours: j.blessureJournees });
      }
    }
    for (const id of remplacants) {
      const j = parId[id];
      if (!j) continue;
      j.fatigue = Math.min(100, (j.fatigue || 0) + FATIGUE_MATCH_REMPLACANT);
    }
    return { fatigues, blesses };
  }

  // Récupération et guérison QUOTIDIENNES des clubs adverses, au même rythme
  // que celles du club du joueur (cf. club-evenements.js) — sans quoi leur
  // fatigue ne redescendrait jamais et la rotation s'emballerait.
  // Garantit que TOUS les clubs adverses ont un groupe et une feuille de
  // match. Appelée à la création d'une saison, au chargement (sauvegarde
  // antérieure sans groupe) et chaque jour — idempotente et peu coûteuse :
  // elle ne reconstruit que ce qui manque.
  function assurerEffectifsAdverses(saison) {
    for (const club of (saison.adversaires || [])) {
      if (!aUnEffectifSimule(club)) continue;
      if (!club.groupe || !club.groupe.length || !club.banc || !club.banc.length) {
        rafraichirEffectifAdverse(saison, club);
      }
    }
    return saison;
  }

  // Rotation de TOUS les clubs adverses : appelée une fois par journée de
  // championnat réellement jouée, jamais chaque jour — un club ne change pas
  // son XV le mardi.
  function rotationClubsAdverses(saison) {
    for (const club of (saison.adversaires || [])) {
      if (!aUnEffectifSimule(club)) continue;
      rafraichirEffectifAdverse(saison, club);
    }
    return saison;
  }

  function avancerJourClubsAdverses(saison) {
    assurerEffectifsAdverses(saison);
    const RMClub = global.RMClub;
    let soignes = 0;
    for (const club of (saison.adversaires || [])) {
      if (!aUnEffectifSimule(club)) continue;
      const groupe = groupeAdverse(saison, club);
      RMClub.recupererFatigueDuJour(groupe, 1);
      soignes += RMClub.soignerBlessuresDuJour(groupe, 1).length;
    }
    return soignes;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    FATIGUE_MATCH_TITULAIRE, FATIGUE_MATCH_REMPLACANT, SEUIL_ROTATION_FATIGUE,
    groupeAdverse, rafraichirEffectifAdverse, appliquerEffetsMatchAdverse,
    avancerJourClubsAdverses, aUnEffectifSimule,
    assurerEffectifsAdverses, rotationClubsAdverses,
  });
})(window);
