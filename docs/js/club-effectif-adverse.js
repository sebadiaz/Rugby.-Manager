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
  // La clé est le NOM du club, pas son id (TODO_AUDIT.md P1-49). Les ids
  // viennent d'un compteur GLOBAL au module : deux carrières créées à la
  // suite dans la même session reçoivent des ids différents, et donnaient
  // donc des effectifs adverses différents À GRAINE IDENTIQUE — ce qui
  // contredit la promesse du jeu (« deux carrières créées avec la même graine
  // vivent exactement la même saison », cf. club.js). Le nom, lui, est dérivé
  // de la graine : il est stable d'une construction à l'autre.
  //
  // Mesuré : deux saisons de graine 613 construites à la suite donnaient des
  // budgets adverses divergents après dix jours, parce que ce n'était pas le
  // même club qui recrutait sur le marché.
  function grainePourClub(saison, club) {
    const base = Number.isFinite(saison.graine) ? saison.graine : 1;
    let h = base >>> 0;
    const cle = String(club.nom || club.id || '');
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

  // --- Les matchs entre clubs IA arrivent enfin à leurs joueurs (G18) -----
  //
  // Mesuré avant, sur une saison complète : 156 rencontres disputées entre
  // clubs adverses, 312 joueurs dans leurs groupes, et sur ces 312 joueurs
  // ZÉRO fatigue accumulée, ZÉRO blessure, ZÉRO match au compteur. Ces 26
  // journées ne laissaient aucune trace. Le résultat d'un match IA-IA ne
  // dépendait que de `niveauClub` — ni de qui était disponible, ni de qui
  // était blessé, ni de qui venait d'enchaîner trois matchs.
  //
  // Autrement dit, les groupes de 24 joueurs, la fatigue, les blessures et la
  // rotation que le jeu entretient pour chaque club adverse ne servaient QUE
  // lors de son unique match contre le club du joueur.
  //
  // Ce qui a été mesuré et ÉCARTÉ : remplacer la simulation abstraite par le
  // vrai moteur pour ces 156 matchs. La corrélation de rang entre
  // `niveauClub` et la force réelle des groupes reste de 0,80 à 0,91 sur sept
  // saisons — le coût serait élevé pour un écart marginal. Ce qui manquait
  // n'était pas la finesse du calcul, c'était que ces matchs arrivent
  // vraiment aux joueurs.

  const ATTRIBUTS_FORCE = ['vitesse', 'plaquage', 'puissance', 'endurance'];
  // Combien un point d'attribut perdu pèse sur le niveau employé par la
  // simulation. `simulerResultatAbstrait` traduit un écart de niveau en
  // points au marquoir (× 22) : 4 points d'attribut en moins valent donc
  // environ 4,4 points de retard, l'ordre de grandeur d'un XV amoindri.
  const ECHELLE_ATTRIBUT_VERS_NIVEAU = 20;
  // Même barème que celui appliqué au club du joueur quand ses stats partent
  // au moteur (cf. club-composition.js).
  const MALUS_FATIGUE_MOTEUR = 12;

  function moyenneForce(joueurs) {
    if (!joueurs || !joueurs.length) return null;
    let total = 0;
    for (const j of joueurs) {
      let somme = 0;
      for (const a of ATTRIBUTS_FORCE) somme += (j[a] || 0);
      total += somme / ATTRIBUTS_FORCE.length;
    }
    return total / joueurs.length;
  }

  // Niveau RÉELLEMENT employé pour une rencontre : celui du club, corrigé par
  // l'état de son groupe. Exprimé comme un ÉCART au nominal plutôt qu'en
  // valeur absolue — ainsi, un club au complet retrouve exactement son
  // `niveauClub` et le comportement d'avant cette tranche est conservé au
  // point près, sans constante d'étalonnage à deviner.
  // Le banc de touche compte (G25) : `niveauAvecEntraineur` est la SEULE
  // fonction qui applique l'effet de l'entraîneur, ici comme dans les
  // divisions abstraites. Appel défensif — un banc d'essai partiel qui ne
  // charge pas ce module retombe sur le niveau nu.
  function avecBanc(saison, club, niveau) {
    const RMClub = global.RMClub;
    return RMClub.niveauAvecEntraineur
      ? RMClub.niveauAvecEntraineur(saison, club, niveau)
      : niveau;
  }

  function niveauEffectifDuJour(saison, club) {
    const RMClub = global.RMClub;
    const base = club && club.niveauClub != null ? club.niveauClub : 0.5;
    if (!aUnEffectifSimule(club)) return avecBanc(saison, club, base);
    const groupe = groupeAdverse(saison, club);
    if (!groupe || groupe.length < 15) return avecBanc(saison, club, base);
    // Nominal : le MEILLEUR XV que ce club puisse aligner, tout le monde
    // disponible et frais. Attention, ce n'est pas « les quinze meilleurs
    // joueurs » : une composition doit couvrir chaque poste, et un talonneur
    // moyen y entre là où un troisième ligne supérieur reste dehors. Prendre
    // les quinze meilleurs comme référence rabaissait TOUS les clubs — mesuré,
    // un club au complet tombait de 0,15 à 0,06 de niveau, et les scores
    // moyens des matchs IA à 9 points.
    const parIdNominal = {};
    for (const j of groupe) parIdNominal[j.id] = j;
    const compositionNominale = RMClub.meilleureComposition(groupe);
    const nominalXV = Object.keys(compositionNominale)
      .map((numero) => parIdNominal[compositionNominale[numero]]).filter(Boolean);
    const nominal = moyenneForce(nominalXV);
    // Réel : le XV que le club peut réellement aligner aujourd'hui, avec la
    // même pénalité de fatigue que celle qui pilote déjà sa rotation.
    const composition = choisirXVAdverse(club, groupe);
    const parId = {};
    for (const j of groupe) parId[j.id] = j;
    const alignes = Object.keys(composition).map((numero) => parId[composition[numero]]).filter(Boolean);
    if (!alignes.length) return base;
    // Malus de fatigue à l'échelle du MOTEUR (12 points au maximum, cf.
    // club-composition.js), pas à celle de la sélection (25). Les deux ne
    // disent pas la même chose : 25 exprime le choix d'un entraîneur qui
    // préfère un remplaçant frais, 12 la baisse de rendement réelle sur le
    // terrain. Employer 25 ici revenait à compter deux fois la fatigue —
    // mesuré, les scores moyens des matchs IA tombaient à 9 points.
    const penalises = alignes.map((j) => {
      const copie = { };
      for (const a of ATTRIBUTS_FORCE) {
        copie[a] = Math.max(20, (j[a] || 0) - Math.round(((j.fatigue || 0) / 100) * MALUS_FATIGUE_MOTEUR));
      }
      return copie;
    });
    const reel = moyenneForce(penalises);
    if (nominal == null || reel == null) return avecBanc(saison, club, base);
    const ecart = (reel - nominal) / ECHELLE_ATTRIBUT_VERS_NIVEAU;
    // Le banc s'ajoute à l'état réel de l'effectif : un bon entraîneur ne
    // remplace pas les joueurs qui manquent, il pèse à côté.
    return Math.max(0.05, Math.min(0.95, avecBanc(saison, club, base + ecart)));
  }

  // Le « slot » de composition attendu par appliquerEffetsMatchAdverse :
  // le XV du jour et son banc, tirés du groupe réel.
  function slotDuJour(club, groupe) {
    const RMClub = global.RMClub;
    const composition = choisirXVAdverse(club, groupe);
    return {
      compositionTitulaires: composition,
      compositionBanc: RMClub.completerCompositionBanc(groupe, composition, {}),
    };
  }

  // Résout les rencontres d'une journée qui n'impliquent PAS le club du
  // joueur. Deux choses à la fois, et c'est le point de la tranche :
  //   - le résultat dépend du groupe réellement disponible de chaque club ;
  //   - le match LAISSE UNE TRACE (fatigue, blessures, temps de jeu).
  function resoudreMatchsAdverses(rng, saison, fixtures) {
    const RMClub = global.RMClub;
    const tirage = rng || global.RugbyEngine.creerRng(1);
    const resolus = [];
    for (const f of (fixtures || [])) {
      if (!f || f.joue) continue;
      const domicile = RMClub.clubPartout ? RMClub.clubPartout(saison, f.domicileId) : null;
      const exterieur = RMClub.clubPartout ? RMClub.clubPartout(saison, f.exterieurId) : null;
      if (!domicile || !exterieur) continue;
      const r = global.window.RMWorld.simulerResultatAbstrait(tirage,
        niveauEffectifDuJour(saison, domicile), niveauEffectifDuJour(saison, exterieur));
      RMClub.enregistrerResultat(saison, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
      // Le match a eu lieu : il doit se voir dans les deux groupes.
      for (const club of [domicile, exterieur]) {
        if (!aUnEffectifSimule(club)) continue;
        const groupe = groupeAdverse(saison, club);
        appliquerEffetsMatchAdverse(saison, club, slotDuJour(club, groupe), tirage);
        // La feuille de match du club suit sa rotation réelle.
        rafraichirEffectifAdverse(saison, club);
      }
      resolus.push({ id: f.id, scoreA: r.scoreA, scoreB: r.scoreB });
    }
    return resolus;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    groupeAdverse, rafraichirEffectifAdverse, appliquerEffetsMatchAdverse,
    avancerJourClubsAdverses, aUnEffectifSimule, assurerEffectifsAdverses,
    rotationClubsAdverses, niveauEffectifDuJour, resoudreMatchsAdverses,
  });
})(window);
