// Moteur de simulation de match, en JavaScript pur (aucune dépendance DOM).
// Même fichier utilisé côté serveur (Node, via require) et côté client
// (navigateur, via <script src="...">) grâce à l'enveloppe UMD ci-dessous.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RugbyEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LONGUEUR = 100; // m, en-but à en-but
  const LARGEUR = 70;   // m, touche à touche

  // --- RNG seedé (mulberry32) pour des matchs reproductibles ---
  function creerRng(seed) {
    let etat = seed >>> 0;
    return function alea() {
      etat |= 0; etat = (etat + 0x6D2B79F5) | 0;
      let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // Probabilité de réussite d'un coup de pied au but (transformation ou pénalité),
  // fonction de la distance perpendiculaire aux poteaux et de l'angle d'attaque :
  // un tir long ou très excentré est nettement moins fiable, conformément à la réalité.
  function probaReussiteTir(distanceM, offsetLateralM) {
    const distanceReelle = Math.hypot(distanceM, offsetLateralM);
    const angleDeg = Math.abs(Math.atan2(offsetLateralM, Math.max(distanceM, 0.01))) * 180 / Math.PI;
    // Taux de réussite calibrés sur les BUTEURS PROFESSIONNELS (cf. données
    // réelles transientlunatic/Rugby-Data : ~48,5 pts/match, dont une grande part
    // au pied). L'ancienne formule (base 0.97, dist/90, angle/110) donnait ~27 %
    // de réussite en moyenne — bien trop sévère : la sim marquait ~32 pts/match
    // au lieu de ~48. Un vrai buteur réussit ~90 % d'un tir central court, ~72 %
    // à 40 m dans l'axe, ~45 % d'une transformation grand large.
    return Math.max(0.3, Math.min(0.96, 1.05 - distanceReelle / 150 - angleDeg / 160));
  }

  // --- Profils d'attributs par numéro de maillot (1-15) ---
  // tendance : tendance de proximité au ballon (suiveur de jeu vs tenant de station).
  const PROFILS = {
    1: { vitesse: 45, plaquage: 70, tendance: 85, label: 'P' },
    2: { vitesse: 48, plaquage: 70, tendance: 85, label: 'T' },
    3: { vitesse: 45, plaquage: 70, tendance: 85, label: 'P' },
    4: { vitesse: 50, plaquage: 65, tendance: 80, label: '2L' },
    5: { vitesse: 50, plaquage: 65, tendance: 80, label: '2L' },
    6: { vitesse: 60, plaquage: 75, tendance: 75, label: '3L' },
    7: { vitesse: 62, plaquage: 78, tendance: 75, label: '3L' },
    8: { vitesse: 60, plaquage: 72, tendance: 75, label: '3L' },
    9: { vitesse: 65, plaquage: 55, tendance: 90, label: 'DM' },
    10: { vitesse: 70, plaquage: 50, tendance: 55, label: 'OV' },
    11: { vitesse: 90, plaquage: 45, tendance: 15, label: 'AI' },
    12: { vitesse: 72, plaquage: 65, tendance: 45, label: 'CE' },
    13: { vitesse: 74, plaquage: 60, tendance: 45, label: 'CE' },
    14: { vitesse: 90, plaquage: 45, tendance: 15, label: 'AI' },
    15: { vitesse: 80, plaquage: 50, tendance: 20, label: 'AR' },
  };

  // Couloir latéral "au repos" par numéro de maillot : forme un vrai plan de
  // jeu (avants groupés au centre, 9/8 au cœur du ballon, 10 légèrement
  // excentré, centres écartés de part et d'autre, ailiers sur les couloirs,
  // arrière au centre en couverture) plutôt qu'une répartition linéaire par
  // numéro (qui plaçait à tort le n°1 et le n°15 près des touches).
  const COULOIR_BASE = {
    1: 26, 2: 32, 3: 38, 4: 24, 5: 42, 6: 20, 7: 48, 8: 35,
    9: 35, 10: 31, 11: 7, 12: 26, 13: 44, 14: 63, 15: 35,
  };

  // === Configuration paramétrable avant le match ============================
  // Toutes les valeurs réglables (caractéristiques des joueurs, combinaisons de
  // touche, sorties de mêlée, organisation attaque/défense) sont regroupées ici
  // sous forme d'objet simple. Le moteur lit CETTE config (this.cfg), pas des
  // constantes en dur : on peut donc la surcharger avant le match via
  // `new MatchEngine(seed, duree, config)` (cf. docs/rugby-config.json chargé par
  // l'interface). Les valeurs par défaut ci-dessous reproduisent exactement le
  // comportement historique.
  const DEFAULT_CONFIG = {
    // Caractéristiques de chaque joueur (par numéro de maillot) : poste, vitesse,
    // plaquage (proxy de puissance), tendance (proximité au ballon), couloir
    // latéral au repos (0-70). Dérivées des profils/couloirs historiques.
    joueurs: (() => {
      const j = {};
      for (let n = 1; n <= 15; n++) {
        j[n] = {
          poste: PROFILS[n].label,
          vitesse: PROFILS[n].vitesse,
          plaquage: PROFILS[n].plaquage,
          tendance: PROFILS[n].tendance,
          couloir: COULOIR_BASE[n],
        };
      }
      return j;
    })(),
    // Touche (loi 18) : qui lance, quels sauteurs sont dans les appels possibles,
    // espacement de l'alignement, recul du receveur (n°9), et probabilité de
    // former un maul (catch-and-drive) selon la zone.
    touche: {
      lanceur: 2,
      sauteurs: [4, 5, 6, 7, 8],
      espacementSauteurs: 1.4,
      reculReceveur: 4,
      offsideNonParticipants: 10,
      tauxMaul: { proche: 0.45, loin: 0.08 },
    },
    // Mêlée (loi 19) : recul réglementaire des trois-quarts, et probabilité que
    // le n°8 sorte le ballon au pied (pick-and-go) plutôt que le 9, selon la
    // domination de la poussée.
    melee: {
      reculTroisQuarts: 7.5,
      pickAndGoHuit: { dominant: 0.35, normal: 0.12 },
    },
    // Organisation d'attaque : taux de jeu au large (écarter vers le centre en
    // espace) sous pression / au calme.
    attaque: {
      jeuLargeTaux: { pression: 0.55, calme: 0.3 },
    },
    // Organisation de défense : profondeur de couverture de l'arrière (n°15) en
    // jeu courant et à la mêlée, recul de la ligne au ruck.
    defense: {
      profondeurArriereJeu: 18,
      profondeurArriereMelee: 20,
      reculRuck: 3,
    },
    // COMBINAISONS (playbook) : mouvements scriptés joués sur une sortie de
    // regroupement (mêlée / touche). Chaque combinaison est une SUITE D'ÉTAPES,
    // chaque étape = une passe d'un joueur (numéro) à un autre, avec un type de
    // ligne du RECEVEUR :
    //   - "droit"  : le receveur continue tout droit ;
    //   - "croise" : le receveur CHANGE de direction et croise en sens inverse
    //                (mouvement de "une-deux" croisé, ex. le 12 revient à
    //                l'intérieur derrière l'ouvreur) ;
    //   - "saute"  : passe sautée (on saute un joueur pour aller plus au large).
    // `proba` = probabilité qu'une combinaison soit jouée à la sortie (sinon jeu
    // libre) ; chaque combinaison a un `poids` pour le tirage pondéré.
    combinaisons: {
      proba: 0.5,
      // Listes PARTAGÉES (défaut pour les deux équipes). On peut aussi définir
      // un playbook propre à une équipe via une clé "A" / "B" (cf. exemple A
      // ci-dessous) : { A: { melee: [...], touche: [...] } }.
      melee: [
        {
          nom: '9-10-croise-12',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 12, ligne: 'croise' },
          ],
        },
        {
          nom: '9-10-large-13',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 12 },
            { action: 'passe', de: 12, vers: 13 },
          ],
        },
        {
          // Combinaison de ZONE : seulement dans les 22 m adverses. Le 10 tape une
          // chandelle par-dessus la défense (à récupérer par les chasseurs).
          nom: '9-10-chandelle-22',
          poids: 1,
          zone: ['OPP_22', 'CINQ_M'],
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'pied', de: 10, type: 'CHANDELLE' },
          ],
        },
      ],
      touche: [
        {
          nom: '9-10-saute-13',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 13, ligne: 'saute' },
          ],
        },
        {
          // Boucle : le 10 donne au 12 qui repart à l'extérieur (le 10 boucle).
          nom: '9-10-boucle-12',
          poids: 1,
          etapes: [
            { action: 'passe', de: 9, vers: 10 },
            { action: 'passe', de: 10, vers: 12, ligne: 'boucle' },
          ],
        },
      ],
      // Playbook SPÉCIFIQUE à l'équipe A (exemple) : à la mêlée, A privilégie une
      // sortie 8->9->10->13 sautée. Si une clé d'équipe existe pour un type, elle
      // REMPLACE la liste partagée pour cette équipe.
      A: {
        melee: [
          {
            nom: 'A-9-10-saute-13',
            poids: 1,
            etapes: [
              { action: 'passe', de: 9, vers: 10 },
              { action: 'passe', de: 10, vers: 13, ligne: 'saute' },
            ],
          },
        ],
      },
    },
  };

  // Fusion profonde d'une config partielle par-dessus les valeurs par défaut :
  // l'utilisateur ne fournit que ce qu'il veut changer, le reste garde le défaut.
  function fusionnerConfig(base, surcharge) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!surcharge || typeof surcharge !== 'object') return out;
    for (const k of Object.keys(surcharge)) {
      const v = surcharge[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k]))
        ? fusionnerConfig(base[k], v)
        : v;
    }
    return out;
  }

  function creerJoueur(numero, team, sensAttaque, rng, joueursCfg) {
    const c = (joueursCfg && joueursCfg[numero]) || {};
    const p = PROFILS[numero];
    const couloir = c.couloir != null ? c.couloir : COULOIR_BASE[numero];
    const channelY = couloir * (LARGEUR / 70);
    return {
      team, numero, label: c.poste || p.label,
      vitesse: (c.vitesse != null ? c.vitesse : p.vitesse) + (rng() * 10 - 5),
      plaquage: (c.plaquage != null ? c.plaquage : p.plaquage) + (rng() * 10 - 5),
      tendance: c.tendance != null ? c.tendance : p.tendance,
      channelY,
      x: 0, y: channelY,
      auSol: 0,
      // Délai pendant lequel un défenseur qui vient de rater un plaquage ne
      // peut pas retenter immédiatement (sinon le même contact serait rejoué
      // à chaque tick jusqu'à réussite, ce qui annule statistiquement tout
      // raté de plaquage). Décrémenté dans tick(), comme auSol.
      missCooldown: 0,
      // Délai de récupération après avoir été lié dans un regroupement (ruck/maul/
      // mêlée/touche) : représente le temps pour se relever et rejoindre l'aligne-
      // ment, pendant lequel ce joueur ne peut pas être le prochain plaqueur — sans
      // quoi le défenseur qui vient de sortir du ruck, resté au même endroit, plaque
      // le porteur suivant dès la première fraction de seconde de jeu courant.
      ruckRecovery: 0,
      // Temps restant au "bin" après un carton jaune : tant qu'il est > 0, ce
      // joueur est exclu de attaquants()/defenseurs() (son équipe joue à 14),
      // conformément à la sanction réelle plutôt qu'un carton purement
      // cosmétique sans effet sur le jeu.
      sinBin: 0,
      sensAttaque,
    };
  }

  function creerEquipe(team, sensAttaque, rng, joueursCfg) {
    const joueurs = [];
    for (let n = 1; n <= 15; n++) joueurs.push(creerJoueur(n, team, sensAttaque, rng, joueursCfg));
    return joueurs;
  }

  function vitesseMs(j) {
    return 3.0 + (Math.max(0, Math.min(100, j.vitesse)) / 100) * 5.0;
  }

  function avancer(j, dx, dy, dt, vmax) {
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const pas = Math.min(d, vmax * dt);
    j.x += (dx / d) * pas;
    j.y += (dy / d) * pas;
    j.x = Math.max(0, Math.min(LONGUEUR, j.x));
    j.y = Math.max(0, Math.min(LARGEUR, j.y));
  }

  function joueurLePlusProche(liste, x, y) {
    let meilleur = null, meilleureDist = Infinity;
    for (const j of liste) {
      const d = Math.hypot(j.x - x, j.y - y);
      if (d < meilleureDist) { meilleureDist = d; meilleur = j; }
    }
    return { joueur: meilleur, distance: meilleureDist };
  }

  // --- Maul (loi 16) : machine à états ---------------------------------------
  // Le maul traverse une suite d'états bien définis, de sa formation à sa fin,
  // exactement comme l'arbitrage réel d'un maul (formation, avancée, arrêts
  // successifs, « use it », ballon injouable, écroulement). L'état est porté par
  // `engine.maul.etat`, la phase moteur restant 'MAUL'.
  const ETATS_MAUL = {
    AUCUN: 'NO_MAUL',
    FORMATION: 'MAUL_FORMING',
    ACTIF: 'MAUL_ACTIVE',
    AVANCE: 'MAUL_MOVING',
    PREMIER_ARRET: 'MAUL_FIRST_STOP',
    SECOND_ARRET: 'MAUL_SECOND_STOP',
    USE_IT: 'MAUL_USE_IT',
    ECROULE: 'MAUL_COLLAPSED',
    INJOUABLE: 'MAUL_UNPLAYABLE',
    TERMINE: 'MAUL_ENDED',
  };

  // Force de poussée d'un joueur dans le maul : les avants (1-8) poussent
  // nettement plus fort que les arrières ; modulée par l'attribut de plaquage
  // (proxy de puissance physique).
  function forceMaul(j) {
    const base = j.numero <= 8 ? 80 : 40;
    return base + (j.plaquage - 60) * 0.3;
  }

  // --- Mêlée (lois 19/20) : machine à états -----------------------------------
  // Comme le maul (ETATS_MAUL ci-dessus), la mêlée traverse une vraie séquence
  // arbitrale (placement, "Crouch"/"Bind"/"Set", introduction, contestation,
  // sortie de balle) au lieu d'un tirage aléatoire instantané. L'état est porté
  // par `engine.melee.etat`, la phase moteur restant 'MELEE'.
  const ETATS_MELEE = {
    FORMATION: 'MELEE_FORMATION',
    CROUCH: 'MELEE_CROUCH',
    BIND: 'MELEE_BIND',
    SET: 'MELEE_SET',
    INTRODUCTION: 'MELEE_INTRODUCTION',
    CONTESTATION: 'MELEE_CONTESTATION',
    SORTIE: 'MELEE_SORTIE',
  };

  // --- Arbitre : applique de vraies règles plutôt que de laisser le jeu continuer
  // sans contrainte. Chaque méthode renvoie une infraction ou null. ---
  const Referee = {
    // Une passe est en-avant si le ballon avance vers la ligne d'en-but adverse
    // (relativement au sens d'attaque de l'équipe du passeur), tolérance 0.3m.
    passeEnAvant(sensAttaque, depuis, vers) {
      const deltaAttaque = (vers.x - depuis.x) * sensAttaque;
      return deltaAttaque > 0.3;
    },
    // Un en-avant se produit quand une réception échoue et que le ballon
    // continue dans le sens de l'attaque au moment du contact.
    enAvant(sensAttaque, depuis, vers) {
      return this.passeEnAvant(sensAttaque, depuis, vers);
    },
    // Hors-jeu de ruck : un défenseur qui ne participe pas au ruck ne doit pas
    // franchir la ligne de hors-jeu (le point de ruck) avant la sortie du ballon.
    horsJeuRuck(defenseur, ruckPoint, sensAttaqueAdverse) {
      const marge = 0.5;
      if (sensAttaqueAdverse > 0) return defenseur.x < ruckPoint.x - marge;
      return defenseur.x > ruckPoint.x + marge;
    },
    // Décision : un maul est-il valablement formé (loi 16) ? Il faut le porteur
    // debout, au moins un adversaire lié et debout, au moins un coéquipier lié,
    // le ballon en main (pas au sol) et l'action dans le champ de jeu.
    maulForme(porteur, adversaireLie, coequipierLie) {
      if (!porteur || porteur.auSol > 0) return false;
      if (!coequipierLie) return false;
      if (!adversaireLie || adversaireLie.auSol > 0) return false;
      if (porteur.x <= 0 || porteur.x >= LONGUEUR) return false;
      if (porteur.y <= 0 || porteur.y >= LARGEUR) return false;
      return true;
    },
    // Hors-jeu au maul : la ligne de hors-jeu passe par le dernier pied de
    // chaque équipe engagée dans le maul. Un défenseur NON lié qui se retrouve
    // du côté de la sortie du ballon (derrière le maul dans le sens d'attaque)
    // est hors-jeu — typiquement le défenseur qui contourne pour bloquer le
    // ballon. `sensAttaque` est celui de l'équipe en possession.
    horsJeuMaul(defenseur, centreMaul, sensAttaque) {
      const marge = 1.2;
      if (sensAttaque > 0) return defenseur.x < centreMaul.x - marge;
      return defenseur.x > centreMaul.x + marge;
    },
  };

  class MatchEngine {
    // dureeMatch (secondes de jeu simulées) optionnel : Infinity par défaut pour ne
    // pas casser les usages existants (tests headless, qui veulent un flux continu).
    constructor(seed, dureeMatch = Infinity, config = null) {
      // Config paramétrable avant le match (caractéristiques joueurs, touche,
      // mêlée, attaque, défense) fusionnée par-dessus les défauts : cf.
      // DEFAULT_CONFIG. `null` => comportement historique exact.
      this.cfg = fusionnerConfig(DEFAULT_CONFIG, config);
      this.rng = creerRng(seed >>> 0 || 1);
      this.score = { A: 0, B: 0 };
      this.events = [];
      this.tempsMatch = 0;
      this.dureeMatch = dureeMatch;
      // Échelle des temps d'arrêt (essai/transformation/pénalité au but) : ces
      // durées sont calibrées sur un vrai match (80 min = 4800 s). Appliquées
      // telles quelles à un format démo très raccourci (5 min), elles
      // dévorent l'essentiel du temps de jeu visible (placement, recul,
      // frappe...) et laissent trop peu de place au jeu courant (passes,
      // coups de pied, mêlées) — ce qui donne l'impression d'une simulation
      // morte. On les compresse proportionnellement à la durée du match,
      // sans jamais descendre sous un minimum qui resterait lisible à l'écran.
      this._echelleArret = Math.max(0.15, Math.min(1, dureeMatch / 4800));
      // Mi-temps (loi 12) : "les adversaires de l'équipe qui a donné le coup
      // d'envoi en début de match donnent le coup d'envoi de la 2e période."
      this.dureeMiTemps = dureeMatch / 2;
      this.miTempsJouee = false;
      // Ballon en vol : pendant un coup d'envoi/une remise en jeu, le ballon est
      // botté en cloche et vole seul vers sa zone de chute (personne ne le
      // "porte"). En dehors de ces phases, il est tenu par le porteur.
      this.ballonEnVol = false;
      this.ballonVolX = LONGUEUR / 2;
      this.ballonVolY = LARGEUR / 2;
      this.ballonVolHauteur = 0;
      // Ballon au sol après un coup de pied tactique, pas encore récupéré :
      // les chasseurs/receveurs doivent réellement courir jusqu'au point de
      // chute (cf. _tickReceptionCoupDePied) avant qu'un joueur ne soit
      // déclaré porteur, jamais une téléportation instantanée.
      this._receptionEnAttente = false;
      this.timerReceptionAuSol = 0;
      // Lancer de touche en cours (loi 18) : pendant que le ballon vole du
      // lanceur vers le sauteur, on stocke ici la cible et l'issue déjà
      // décidée ; null hors lancer. Évite que le ballon "saute" instantanément
      // de la ligne de touche jusque dans l'alignement (cf. _tickToucheLancer).
      this.toucheLancer = null;
      // Vol visuel d'une passe en jeu courant : le ballon décrit un court arc
      // du passeur au receveur au lieu de "sauter" instantanément. Purement
      // visuel (la possession change tout de suite côté logique), null hors
      // passe. Cf. _lancerPasseVisuelle / getState.
      this.passeVisuelle = null;
      // Coups de pied au but (pénalité / transformation) : passe à true une fois
      // que TOUS les joueurs ont fini de se replacer. Tant que c'est false, la
      // frappe n'est pas armée (on ne peut pas botter tant que le replacement
      // n'est pas terminé) ; une fois true, les joueurs ne bougent plus —
      // notamment au moment du tir. Remis à false à chaque nouveau coup de pied.
      this.tirEnPlace = false;
      this.transfoEnPlace = false;
      // Maul (loi 16) : objet d'état courant (null hors maul), et indicateur
      // « le ballon vient d'une réception directe d'un coup de pied adverse »
      // (exception loi 19 sur l'attribution de la mêlée en cas de ballon injouable).
      this.maul = null;
      this._receptionDirecte = false;
      // Avantage (loi 8) : objet d'état courant (null hors avantage). Quand une
      // équipe commet une faute, l'arbitre laisse jouer l'équipe non fautive et
      // ne siffle la sanction que si celle-ci n'en tire rien. Stocke la sanction
      // en attente, le bénéficiaire, la marque et le repère de progression.
      this.avantage = null;
      // Position courante de l'arbitre (entité qui se déplace, jamais
      // téléportée) : il court vers sa cible chaque tick (cf. _majArbitre).
      this.arbitrePos = { x: LONGUEUR / 2, y: LARGEUR / 2 };
      // Compteur d'infractions de maul par équipe sur l'ensemble du match
      // (persiste d'un maul à l'autre) : sert à siffler un carton jaune pour
      // fautes répétées, comme l'arbitrage réel.
      this._maulPenalitesMatch = { A: 0, B: 0 };
      // Mêlée (lois 19/20) : objet d'état courant (null hors mêlée), et même
      // compteur d'infractions répétées par équipe que le maul ci-dessus.
      this.melee = null;
      this._meleePenalitesMatch = { A: 0, B: 0 };
      this._sequenceEvenement = 0;
      // Statistiques agrégées du match, calibrage du jeu (pas un affichage
      // décoratif) : chaque compteur n'est incrémenté qu'au moment réel où
      // l'action correspondante se produit dans la simulation, jamais déduit
      // ou estimé après coup. Persiste sur tout le match (PAS réinitialisé par
      // _nouvelleManche, qui ne fait que relancer une mancha de jeu).
      this.stats = {
        A: this._statsVierges(), B: this._statsVierges(),
      };
      this.tempsJeuEffectif = 0;
      // Temps de possession réel par équipe (ballon vivant uniquement, même
      // condition que tempsJeuEffectif) : sert à calculer un % de possession
      // basé sur le temps de jeu effectif, pas sur un compteur d'événements.
      this.tempsPossession = { A: 0, B: 0 };
      // Occupation territoriale (où se joue le match), distincte de la
      // possession (qui porte le ballon) : cf. tick().
      this.tempsOccupation = { A: 0, B: 0 };
      this._nouvelleManche('A');
      this.equipeKickPremiereMiTemps = this._dernierEquipeKick;
    }

    // Statistiques de match, alignées sur les définitions officielles World Rugby
    // (game analysis). Toutes dérivées d'ACTIONS RÉELLES de la simulation, jamais
    // fabriquées. Correspondance documentée dans docs/REGLES_RUGBY.md.
    //  - carries          : ballons portés AU CONTACT (le porteur engage le contact) ;
    //  - passes / passesTentees / offloads : passes réussies / tentées / dans le plaquage ;
    //  - tacklesMade / missedTackles       : plaquages réussis / manqués (côté défense) ;
    //  - defenseursBattus : défenseurs BATTUS (côté attaque = plaquage manqué subi par la défense) ;
    //  - turnovers / turnoversConcedes      : ballons GAGNÉS / PERDUS (perte de possession en jeu) ;
    //  - phases           : phases jouées (nombre de rucks + mauls de la possession) ;
    //  - kicks            : coups de pied en jeu ; metresGagnes : mètres gagnés ballon en main.
    _statsVierges() {
      return {
        essais: 0, carries: 0, passes: 0, passesTentees: 0, offloads: 0, kicks: 0,
        tacklesAttempted: 0, tacklesMade: 0, missedTackles: 0, defenseursBattus: 0,
        rucks: 0, lineouts: 0, lineoutsGagnes: 0, scrums: 0, scrumsGagnes: 0, mauls: 0, phases: 0,
        penalitesConcedees: 0, turnovers: 0, turnoversConcedes: 0, knockOns: 0, cartonsJaunes: 0, metresGagnes: 0,
        // Motifs de jeu discriminants (d'apres l'etude rorybunker/rugby-sequences,
        // qui identifie franchissements, touches gagnees, coups de pied regagnes,
        // jeu multi-phases et sorties de camp comme les motifs qui distinguent le
        // mieux marquer vs encaisser). Tous derives d'actions reelles.
        franchissements: 0, kicksRegagnes: 0, exits: 0, exitsRates: 0,
      };
    }

    // type : catégorie machine-lisible de l'événement (ESSAI, PENALITE, ...) pour que
    // l'interface puisse réagir (icône, bannière) sans reparser le message en français.
    // id : identifiant croissant, pour détecter côté client "un nouvel événement vient
    // d'arriver" même après que le tableau ait été tronqué (shift) à 30 entrées.
    log(type, team, message) {
      this.events.push({ id: ++this._sequenceEvenement, type, team, message, t: this.tempsMatch });
      if (this.events.length > 30) this.events.shift();
    }

    // Coup d'envoi / remise en jeu (loi 12) : l'équipe "equipeReceptrice" est
    // celle qui RECOIT le coup de pied (par ex. l'équipe qui vient de marquer,
    // ou qui vient de rater une pénalité au but) ; l'adversaire (equipeKick)
    // est celle qui botte depuis xCentre (50 = mi-terrain, ou la ligne des 22m
    // défendue par l'équipe qui botte pour une remise en 22m). L'équipe qui
    // botte doit rester derrière le ballon, l'équipe receptrice à 10m minimum :
    // le ballon est donc réellement botté et contestable, pas remis en main.
    _nouvelleManche(equipeReceptrice, xCentre = LONGUEUR / 2) {
      const sens = { A: 1, B: -1 };
      this.maul = null;
      this.melee = null;
      this.penaliteRecul = null;
      this.ruckDominant = false;
      this.combinaison = null;
      this._receptionDirecte = false;
      // Toute reprise (coup d'envoi après essai/pénalité/22 m) annule un avantage
      // éventuellement en cours : on repart sur une nouvelle séquence de jeu.
      this.avantage = null;
      // Un carton jaune en cours (sinBin > 0) doit survivre au redémarrage de
      // manche : sans ce report, l'exclusion de 10 min (loi 9.29) serait
      // effacée dès le prochain essai/pénalité/mi-temps, ce qui annule la
      // sanction au lieu de l'appliquer.
      const sinBinRestant = new Map();
      for (const j of (this.equipeA || []).concat(this.equipeB || [])) {
        if (j.sinBin > 0) sinBinRestant.set(j.team + '-' + j.numero, j.sinBin);
      }
      this.equipeA = creerEquipe('A', sens.A, this.rng, this.cfg.joueurs);
      this.equipeB = creerEquipe('B', sens.B, this.rng, this.cfg.joueurs);
      for (const j of [...this.equipeA, ...this.equipeB]) {
        const restant = sinBinRestant.get(j.team + '-' + j.numero);
        if (restant) j.sinBin = restant;
      }
      const equipeKick = equipeReceptrice === 'A' ? 'B' : 'A';
      this._dernierEquipeKick = equipeKick;
      const dirKick = sens[equipeKick];
      // Réception du coup d'envoi : défense ÉTAGÉE en profondeur (loi 12), pas
      // une seule ligne massée sur les 10 m. Sans étagement, un coup d'envoi long
      // tombait derrière tout le monde, personne pour le réceptionner.
      //  - Avants (1-8) : 1ʳᵉ ligne sur la ligne des 10 m (capter/contester les
      //    coups courts, monter au plaquage).
      //  - 9,10,12,13 : 2ᵉ rideau ~18 m.
      //  - Ailiers (11,14) : autour de la ligne des 22 m (~30 m du centre),
      //    écartés sur les bords.
      //  - Arrière (15) : couverture PROFONDE, ENTRE LES 22 M ET L'EN-BUT
      //    (~38 m du centre), au milieu — le dernier rideau qui cueille les
      //    longs coups de pied. (La ligne des 22 m est à 28 m du centre.)
      const profondeurReception = (n) => {
        if (n <= 8) return 10;
        if (n === 15) return 38;
        if (n === 11 || n === 14) return 30;
        return 18;
      };
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j.team === equipeKick) {
          j.x = Math.max(0, Math.min(LONGUEUR, xCentre - dirKick * (j.numero <= 8 ? 2 : 6)));
        } else {
          j.x = Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * profondeurReception(j.numero)));
        }
        j.y = j.channelY;
      }
      const kickeur = (equipeKick === 'A' ? this.equipeA : this.equipeB)[9]; // ouvreur, n.10
      kickeur.x = xCentre;
      kickeur.y = LARGEUR / 2;
      this.possession = equipeKick;
      this.porteur = kickeur;
      this.equipeReceptriceAttendue = equipeReceptrice;
      this.xCoupEnvoi = xCentre;
      this.dirCoupEnvoi = dirKick;
      // Cible : au-delà de la ligne des 10m adverses (obligation légale), assez
      // loin pour rendre le ballon réellement contestable à la réception.
      // Exception (loi 12) : un coup d'envoi mal frappé qui ne franchit pas les
      // 10m est sanctionné par une mêlée au centre pour l'équipe qui n'a pas
      // botté (cf. _tickCoupEnvoi). Simplifié : pas d'option de retaper.
      this.coupEnvoiCourt = this.rng() < 0.06;
      // Coup d'envoi profond : botté loin vers les 22 m adverses pour mettre la
      // pression sur la réception (au prix d'une chasse plus difficile). C'est
      // le seul cas où le receveur capte le ballon dans son propre en-deçà des
      // 22 m et peut donc demander une marque (loi 17).
      this.coupEnvoiProfond = !this.coupEnvoiCourt && this.rng() < 0.18;
      this.ballonCibleX = this.coupEnvoiCourt
        ? Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (3 + this.rng() * 6)))
        : this.coupEnvoiProfond
          ? Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (28 + this.rng() * 9)))
          : Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (12 + this.rng() * 15)));
      this.ballonCibleY = Math.max(5, Math.min(LARGEUR - 5, LARGEUR / 2 + (this.rng() * 30 - 15)));
      this.phase = 'COUP_ENVOI';
      this.timerPhase = 0;
      this.ruckPoint = { x: xCentre, y: LARGEUR / 2 };
      this.contestants = [];
      // Le ballon part en cloche depuis le point de coup d'envoi : il vole seul,
      // le botteur reste sur place (suivi de jeu), il n'est pas "porté".
      this.ballonEnVol = true;
      this.ballonVolX = xCentre;
      this.ballonVolY = LARGEUR / 2;
      this.ballonVolHauteur = 0;
      this.log('COUP_ENVOI', equipeKick, `Coup d'envoi botte par l'equipe ${equipeKick}, l'equipe ${equipeReceptrice} doit rester a 10m`);
    }

    // Réception du coup d'envoi : le ballon, en l'air pendant le vol, peut être
    // récupéré par l'une ou l'autre équipe (contest aérien), pas systématiquement
    // par l'équipe "attendue" — conformément au fait qu'un coup d'envoi est
    // réellement disputé en l'air, pas une simple remise en main.
    _tickCoupEnvoi(dt) {
      this.timerPhase += dt;
      // Le ballon est botté : il file nettement plus vite qu'un joueur ne court
      // (~18 m/s contre ~7-9 m/s), c'est tout l'intérêt du coup de pied. La durée
      // de vol découle donc de la distance bottée et d'une vitesse de ballon
      // élevée (bornée pour garder un minimum de temps de chandelle visible).
      const dxVol = this.ballonCibleX - this.xCoupEnvoi;
      const dyVol = this.ballonCibleY - LARGEUR / 2;
      const distVol = Math.hypot(dxVol, dyVol);
      const VITESSE_BALLON = 18;
      const duree = Math.max(0.9, Math.min(2.0, distVol / VITESSE_BALLON));
      const t = Math.min(1, this.timerPhase / duree);
      // Le ballon vole seul du point de coup d'envoi vers sa cible, en cloche :
      // hauteur en sinus (0 au départ, maximale à mi-parcours, 0 à la chute).
      this.ballonVolX = this.xCoupEnvoi + dxVol * t;
      this.ballonVolY = LARGEUR / 2 + dyVol * t;
      this.ballonVolHauteur = Math.sin(Math.PI * t);

      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        if (j.team === this.possession) {
          // L'équipe qui botte chasse en remontant le terrain : elle part de
          // derrière le ballon et n'a pas une course directe, d'où une vitesse
          // de poursuite réduite (elle arrive rarement la première en pratique).
          avancer(j, this.ballonCibleX - j.x, this.ballonCibleY - j.y, dt, vitesseMs(j) * 0.75);
        } else {
          // L'équipe receveuse part déjà positionnée dans sa zone de réception
          // (au-delà de sa ligne des 10m) : elle converge à pleine vitesse sur
          // le point de chute pour s'organiser et capter le ballon.
          avancer(j, this.ballonCibleX - j.x, this.ballonCibleY - j.y, dt, vitesseMs(j));
        }
      }

      if (this.timerPhase >= duree) {
        // Le ballon retombe et est capté (ou contré) : fin du vol, il est de
        // nouveau tenu par un joueur.
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        // Coup d'envoi trop court (loi 12) : le ballon n'a pas franchi la
        // ligne des 10m adverses -> mêlée au centre pour l'équipe qui n'a pas
        // botté, qu'il ait été repris ou non par un chasseur.
        if (this.coupEnvoiCourt) {
          const equipeKick = this._dernierEquipeKick;
          this.log('COUP_ENVOI_COURT', equipeKick, `Coup d'envoi trop court par l'equipe ${equipeKick}, melee au centre pour l'equipe adverse`);
          this._accorderMelee(equipeKick, { x: this.xCoupEnvoi, y: LARGEUR / 2 });
          return;
        }
        // En pratique, l'équipe receveuse contrôle l'immense majorité des
        // coups d'envoi (elle est déjà positionnée pour réceptionner) ; un
        // ballon contré par les chasseurs (charge-down, erreur de réception)
        // reste l'exception, pas une course à égalité de chances.
        const receveurs = this.equipeReceptriceAttendue === 'A' ? this.equipeA : this.equipeB;
        const chasseurs = this.equipeReceptriceAttendue === 'A' ? this.equipeB : this.equipeA;
        const { joueur: receveurProche } = joueurLePlusProche(receveurs, this.ballonCibleX, this.ballonCibleY);
        const { joueur: chasseurProche, distance: distChasseur } = joueurLePlusProche(chasseurs, this.ballonCibleX, this.ballonCibleY);
        const chasseurGagne = distChasseur < 3 && this.rng() < 0.15;
        const joueur = chasseurGagne ? chasseurProche : receveurProche;
        // Le réceptionneur capte le ballon là où il retombe : on le place au
        // point de chute (sinon, avec un vol court et rapide, il pourrait ne pas
        // l'avoir encore rejoint, ce qui fausserait notamment la zone de marque).
        joueur.x = this.ballonCibleX;
        joueur.y = this.ballonCibleY;
        this.porteur = joueur;
        this.possession = joueur.team;
        this.ruckPoint = { x: joueur.x, y: joueur.y };
        if (joueur.team !== this.equipeReceptriceAttendue) {
          this.phase = 'PORTE';
          this.timerPhase = 0;
          this.log('CONTRE_COUP_ENVOI', joueur.team, `Coup d'envoi contre, equipe ${joueur.team} recupere le ballon`);
          return;
        }
        // Marque (loi 17) : un joueur qui réceptionne proprement le ballon dans
        // son propre en-deçà des 22 m peut crier « marque » et obtenir un coup
        // franc (pas de tir au but possible), pour dégager la pression.
        const sensReceveur = joueur.team === 'A' ? 1 : -1;
        const distPropreLigne = sensReceveur > 0 ? joueur.x : (LONGUEUR - joueur.x);
        if (distPropreLigne <= 22 && this.rng() < 0.5) {
          this._traiterCoupFranc(joueur.team, { x: joueur.x, y: joueur.y });
          return;
        }
        // Réception directe d'un coup de pied adverse : si un maul se forme dans
        // la foulée, l'exception de la loi 19 attribuera la mêlée (ballon
        // injouable) à l'équipe du réceptionneur, pas à la défense.
        this._receptionDirecte = true;
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    // Coup franc (loi 20) : sanction plus légère qu'une pénalité, sans
    // possibilité de tir au but ni de touche directe avec gain de terrain par
    // le pied. L'équipe joue rapidement à la main et avance un peu.
    _traiterCoupFranc(equipe, position, porteurImpose = null) {
      this.possession = equipe;
      const eq = equipe === 'A' ? this.equipeA : this.equipeB;
      if (porteurImpose) {
        // Joueur déjà en place (demi de mêlée à la base de la mêlée) : il tape
        // le ballon et part en courant depuis sa position, sans téléportation
        // sur la marque.
        this.porteur = porteurImpose;
      } else {
        // Le tapeur (joueur le plus proche de la marque) REJOINT la marque en
        // courant pendant la mise en place (cf. _tickJeuRapidePenalite), il n'y
        // est plus téléporté.
        const { joueur } = joueurLePlusProche(eq.filter(j => j.auSol === 0), position.x, position.y);
        this.porteur = joueur;
      }
      this.log('COUP_FRANC', equipe, `Marque, equipe ${equipe} obtient un coup franc et joue rapidement`);
      // Loi 20.12 : l'équipe non bénéficiaire recule de 10 m, comme sur pénalité.
      this._lancerJeuRapidePenalite(equipe, position);
    }

    // Met à jour la position de l'arbitre : il COURT vers sa cible (suivre le
    // jeu, se placer au ruck/à la mêlée), il n'y est jamais téléporté. Sa
    // vitesse est un peu supérieure à celle des joueurs pour qu'il reste au
    // contact du jeu ; sur un changement brusque (passe au large, coup de pied
    // long) il rejoint sa nouvelle place en courant, comme un vrai arbitre.
    _majArbitre(dt) {
      const cible = this._positionArbitre();
      const dx = cible.x - this.arbitrePos.x;
      const dy = cible.y - this.arbitrePos.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01) return;
      const pas = Math.min(d, 9 * dt); // ~9 m/s
      this.arbitrePos.x += (dx / d) * pas;
      this.arbitrePos.y += (dy / d) * pas;
    }

    // Cible de placement de l'arbitre : suit le point de ruck/mêlée pendant les
    // phases statiques, sinon reste juste derrière le porteur du ballon.
    _positionArbitre() {
      if (this.phase === 'RUCK' || this.phase === 'MAUL' || this.phase === 'MELEE') {
        return { x: this.ruckPoint.x, y: Math.max(0, Math.min(LARGEUR, this.ruckPoint.y - 5)) };
      }
      // Touche : l'arbitre ne se tient PAS sur la ligne de touche (place du juge
      // de touche) mais EN RETRAIT dans le terrain, derrière l'alignement et un
      // peu en arrière de la ligne de lancer, pour surveiller le couloir d'un
      // mètre, la rectitude du lancer et le hors-jeu des arrières. ruckPoint.y
      // est ici le bord (marque de touche) : on rentre de ~11 m vers le centre.
      if (this.phase === 'TOUCHE') {
        const versCentre = this.ruckPoint.y <= LARGEUR / 2 ? 1 : -1;
        return {
          x: this.ruckPoint.x,
          y: Math.max(0, Math.min(LARGEUR, this.ruckPoint.y + versCentre * 11)),
        };
      }
      if (this.phase === 'PENALITE_TIR' && this.positionTir) {
        return { x: this.positionTir.x, y: Math.max(0, Math.min(LARGEUR, this.positionTir.y + 5)) };
      }
      if (this.phase === 'TRANSFORMATION') {
        return { x: this.essaiX, y: Math.max(0, Math.min(LARGEUR, this.essaiY)) };
      }
      const p = this.porteur;
      return { x: p.x, y: Math.max(0, Math.min(LARGEUR, p.y - 6)) };
    }

    // Un joueur au bin (carton jaune) est retiré de la feuille de match active :
    // son équipe joue réellement à 14, au lieu d'un carton purement visuel.
    attaquants() {
      const eq = this.possession === 'A' ? this.equipeA : this.equipeB;
      return eq.filter(j => j.sinBin <= 0);
    }
    defenseurs() {
      const eq = this.possession === 'A' ? this.equipeB : this.equipeA;
      return eq.filter(j => j.sinBin <= 0);
    }

    // À la sortie d'un regroupement (mêlée, touche, ruck, maul), le 9
    // introduit ou récupère le ballon mais le transmet presque toujours
    // immédiatement à l'ouvreur (n°10), qui prend la décision tactique
    // (jouer au contact, écarter au large, botter) plutôt que de la
    // prendre lui-même. Si le 10 est indisponible (plaqué, hors du jeu),
    // le 9 garde le ballon.
    _neufVersDix(equipe, neuf) {
      // Recherche par numéro, pas par index : `equipe` est parfois la feuille
      // complète (15), parfois attaquants() déjà filtré du joueur au bin, où
      // l'index 9 ne correspond plus forcément au n°10.
      const dix = equipe.find(j => j.numero === 10);
      return (dix && dix.auSol === 0) ? dix : neuf;
    }

    // --- Mêlée suite à infraction (passe en avant / en-avant) : avantage + relance
    // pour l'équipe non fautive, conformément à la loi (knock-on / forward pass). ---
    _accorderMelee(equipeFautive, position) {
      this._formerMelee(equipeFautive === 'A' ? 'B' : 'A', position);
    }

    // --- Touche : un ballon porté en touche donne une touche (lancer) à l'équipe
    // adverse de celle qui l'a porté en touche, à l'endroit où il a franchi la ligne. ---
    _accorderTouche(equipeQuiSort, position) {
      this.log('TOUCHE', equipeQuiSort, `Ballon porte en touche par l'equipe ${equipeQuiSort}, touche pour l'equipe adverse`);
      this.ruckPoint = { x: position.x, y: position.y };
      this.possession = equipeQuiSort === 'A' ? 'B' : 'A';
      const equipe = this.possession === 'A' ? this.equipeA : this.equipeB;
      // Loi 18 : c'est le talonneur (n°2) qui lance en touche en match reel,
      // jamais le demi de melee ni l'ouvreur - _neufVersDix (9->10) sert a la
      // sortie de balle d'un regroupement, pas au lancer de touche.
      this.porteur = equipe.find(j => j.numero === this.cfg.touche.lanceur && j.sinBin <= 0) || equipe[8];
      this.phase = 'TOUCHE';
      this.timerPhase = 0;
      this.toucheLancer = null;
      // Position des deux lignes de touche (loi 18) : avants au centre dans le
      // couloir, le reste écarté, comme préparation à un vrai contest (résolu
      // dans _tickTouche) plutôt qu'un simple timer sans enjeu.
      // Loi 18.22 : le lanceur se tient SUR la ligne de touche (les deux pieds
      // hors du terrain), pas à 5 m à l'intérieur au milieu des sauteurs. On le
      // place donc au bord du terrain ; l'alignement des sauteurs commence lui
      // à 5 m de la touche (cf. _touchePlacerLignes), laissant un vrai couloir
      // entre le lanceur et le premier sauteur.
      this.toucheLanceurY = position.y <= LARGEUR / 2 ? 0.5 : LARGEUR - 0.5;
      // Cible du lanceur (loi 18.22 : sur la marque de touche) — il doit s'y
      // rendre en courant (cf. _touchePlacerLignes), jamais y être téléporté,
      // même quand c'est l'ouvreur qui s'y trouve déjà sans rapport avec la
      // marque de touche.
      this.toucheLanceurX = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      // Comme à la mêlée (cf. _capFormationMelee) : le lancer n'a lieu que
      // lorsque les avants ET le lanceur sont réellement alignés (cf.
      // _tickTouche), avec un plafond pour ne jamais bloquer le match si un
      // joueur est très excentré.
      this.toucheCapFormation = this._capFormationTouche(this.toucheLanceurX);
    }

    // Même logique que _capFormationMelee : temps réel nécessaire à l'avant le
    // plus excentré pour rallier en courant la ligne de touche (couloir
    // perpendiculaire à la ligne de touche, à l'abscisse px), borné pour ne
    // jamais bloquer le match.
    _capFormationTouche(px) {
      // Le plafond doit couvrir le trajet RÉEL (2D) de l'avant le plus éloigné
      // jusqu'à la zone d'alignement, pas seulement son décalage en profondeur
      // (x) : un avant déjà à la bonne abscisse mais encore loin sur la largeur
      // (y) mettait sinon le cap à ~3 s et le lancer partait pendant qu'il
      // courait encore vers la bande des 5-15 m, le laissant au-delà des 15 m.
      // On vise le milieu de cette bande (≈10 m de la touche), côté terrain.
      const yT = this.toucheLanceurY;
      const versCentre = (yT != null && yT <= LARGEUR / 2) ? 1 : -1;
      const cible = { x: px, y: (yT != null ? yT : LARGEUR / 2) + versCentre * 10 };
      const avants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
      let pireDistance = 0;
      for (const j of avants) {
        const d = distance(j, cible);
        if (d > pireDistance) pireDistance = d;
      }
      // Le lanceur peut être bien plus loin de la marque que les avants
      // (ex. l'ouvreur qui couvrait en profondeur) : sans ce terme, le lancer
      // pourrait être autorisé avant même qu'il ait fini de courir jusqu'à
      // la touche.
      if (this.porteur) {
        const dLanceur = distance(this.porteur, { x: px, y: yT != null ? yT : LARGEUR / 2 });
        if (dLanceur > pireDistance) pireDistance = dLanceur;
      }
      const vitessePackMin = 2.5;
      return Math.min(12, Math.max(3, pireDistance / vitessePackMin));
    }

    // --- Avantage (loi 8) : au lieu de siffler la faute tout de suite, l'arbitre
    // laisse l'équipe non fautive (bénéficiaire) jouer. Si elle progresse
    // nettement ou garde le ballon, l'avantage est « joué » et le match continue
    // (la sanction est effacée). Si elle perd le ballon au profit de l'équipe
    // fautive sans contrepartie, l'arbitre revient à la marque et applique la
    // sanction en attente. Le jeu n'est PAS arrêté au moment de la faute. ---
    _jouerAvantage(type, equipeFautive, equipeBeneficiaire, position) {
      // Un seul avantage à la fois : si un est déjà en cours, on n'en réarme pas.
      if (this.avantage) return;
      this.avantage = {
        type, // 'PENALITE' ou 'MELEE'
        equipeFautive, equipeBeneficiaire,
        position: { x: position.x, y: position.y },
        timer: 0,
        // Repère de progression : abscisse du porteur au moment de la faute.
        xDepart: this.porteur ? this.porteur.x : position.x,
      };
      this.log('AVANTAGE', equipeBeneficiaire, `Avantage joue pour l'equipe ${equipeBeneficiaire} (faute de ${equipeFautive})`);
    }

    // Suivi de l'avantage à chaque tick : décide s'il est joué (jeu continue) ou
    // s'il faut revenir à la sanction.
    _tickAvantage(dt) {
      const a = this.avantage;
      a.timer += dt;
      // L'équipe bénéficiaire a tapé au pied (jeu territorial) ou marqué : elle a
      // utilisé son avantage. On le considère joué même si le ballon change
      // ensuite de camp sur la réception — sinon on reviendrait à la pénalité
      // alors qu'elle a délibérément choisi de jouer (et on téléporterait le
      // buteur sur la marque en plein vol de balle).
      if (this.phase === 'COUP_DE_PIED_JEU' || this.ballonEnVol
        || this.phase === 'ESSAI' || this.phase === 'TRANSFORMATION' || this.phase === 'PENALITE_TIR') {
        this.avantage = null;
        this.log('AVANTAGE_JOUE', a.equipeBeneficiaire, `Avantage joue pour l'equipe ${a.equipeBeneficiaire}`);
        return;
      }
      // Avantage non concrétisé : le ballon est passé à l'équipe fautive sans que
      // le bénéficiaire en tire profit -> retour à la marque, sanction appliquée.
      if (this.possession === a.equipeFautive) {
        this.avantage = null;
        this.log('AVANTAGE_REVIENT', a.equipeBeneficiaire, `Pas d'avantage : retour a la sanction pour l'equipe ${a.equipeBeneficiaire}`);
        if (a.type === 'PENALITE') this._traiterPenalite(a.equipeBeneficiaire, a.position);
        else this._accorderMelee(a.equipeFautive, a.position);
        return;
      }
      // Avantage obtenu : gain de terrain net (>= 12 m) ou ballon conservé assez
      // longtemps (l'équipe a fait au moins aussi bien qu'avec la pénalité). Le
      // jeu continue, la sanction est effacée.
      const sens = a.equipeBeneficiaire === 'A' ? 1 : -1;
      const gain = this.porteur ? (this.porteur.x - a.xDepart) * sens : 0;
      if (gain >= 12 || a.timer >= 5) {
        this.avantage = null;
        this.log('AVANTAGE_JOUE', a.equipeBeneficiaire, `Avantage obtenu, le jeu continue pour l'equipe ${a.equipeBeneficiaire}`);
      }
    }

    // --- Pénalité : selon la distance aux poteaux, l'équipe non fautive tente un
    // coup de pied au but (3 points) ou joue rapidement et avance (touche de pénalité
    // simplifiée), conformément aux options réelles de la loi sur les pénalités. ---
    _traiterPenalite(equipeBeneficiaire, position) {
      this.stats[equipeBeneficiaire === 'A' ? 'B' : 'A'].penalitesConcedees++;
      const sensAttaque = equipeBeneficiaire === 'A' ? 1 : -1;
      const distanceButs = sensAttaque > 0 ? (LONGUEUR - position.x) : position.x;
      // Essai de pénalité : quand la faute est commise tout près de la ligne
      // d'en-but adverse, elle a empêché un essai quasi certain. L'équipe non
      // fautive marque directement 7 points, sans tir ni jeu rapide. Loi 19 :
      // une faute délibérée qui empêche un essai quasi certain est aussi
      // sanctionnée d'un carton (jaune au minimum) pour l'auteur, pas
      // seulement les 7 points — sinon l'essai de pénalité n'a aucun coût pour
      // l'équipe fautive au-delà de la possession perdue.
      if (distanceButs <= 5 && this.rng() < 0.25) {
        this.score[equipeBeneficiaire] += 7;
        this.stats[equipeBeneficiaire].essais++;
        this.log('ESSAI_PENALITE', equipeBeneficiaire, `Essai de penalite, equipe ${equipeBeneficiaire} +7`);
        const fautive = equipeBeneficiaire === 'A' ? 'B' : 'A';
        const eqFautive = fautive === 'A' ? this.equipeA : this.equipeB;
        const { joueur: fautif } = joueurLePlusProche(eqFautive, position.x, position.y);
        fautif.sinBin = 600 * this._echelleArret;
        this.stats[fautive].cartonsJaunes++;
        this.log('CARTON_JAUNE', fautive, `Carton jaune pour l'equipe ${fautive} (n°${fautif.numero}) : faute deliberee empechant un essai - a 14 pendant ${Math.round(fautif.sinBin)}s`);
        this._nouvelleManche(equipeBeneficiaire);
        return;
      }
      // Pénalité en touche : contrairement à une touche en jeu courant, c'est
      // ici l'équipe qui a botté qui conserve le lancer (loi 20). Utilisée pour
      // gagner du terrain quand le but est hors de portée, ou pour chercher un
      // maul tout près de la ligne adverse plutôt que 3 points — deux tactiques
      // réelles très fréquentes que seul le jeu rapide à la main ne représentait
      // pas jusqu'ici.
      const tropLoinPourTir = distanceButs > 45;
      const procheLigneAdverse = distanceButs >= 5 && distanceButs <= 22;
      if ((tropLoinPourTir && this.rng() < 0.35) || (procheLigneAdverse && this.rng() < 0.15)) {
        this._accorderPenaliteTouche(equipeBeneficiaire, position);
        return;
      }
      // Tir au but : une équipe à portée tape au but bien plus souvent qu'à la
      // main (calibré sur ~48,5 pts/match réels, dont ~4-6 pénalités au but).
      // L'ancien taux 0.55 ne donnait que ~1,4 tir/match ; ~0.85 rapproche des
      // ~5 tentatives réelles.
      const enZoneDeTir = distanceButs >= 5 && distanceButs <= 45;
      if (enZoneDeTir && this.rng() < 0.85) {
        this.equipeAuTir = equipeBeneficiaire;
        this.positionTir = { x: position.x, y: position.y, distanceButs };
        // Place le buteur (l'ouvreur) sur le point de pénalité : sans ça, le
        // porteur reste figé là où la faute a été commise et rien ne montre
        // visuellement qu'un coup de pied au but va être tenté.
        const eqTir = equipeBeneficiaire === 'A' ? this.equipeA : this.equipeB;
        // Le buteur (l'ouvreur) REJOINT le tee en courant pendant la mise en
        // place (cf. _penaliteTirPlacerJoueurs), il n'y est plus téléporté ; le
        // ballon est posé sur le tee (cf. getState, ballon sur la marque en
        // PENALITE_TIR).
        this.porteur = eqTir[9];
        this.phase = 'PENALITE_TIR';
        this.timerPhase = 0;
        this.tirEnPlace = false;
        this.log('PENALITE', equipeBeneficiaire, `Penalite, equipe ${equipeBeneficiaire} tente un coup de pied au but`);
        return;
      }
      // Jeu rapide (tap-and-go). Loi 20 : le ballon revient à l'équipe NON
      // fautive — avant ce correctif, la possession et le porteur restaient ceux
      // de l'équipe FAUTIVE (mesuré : bénéficiaire A → possession B), si bien que
      // la pénalité ne donnait même pas le ballon au bon camp. On donne donc le
      // ballon au bénéficiaire (son n°9 tape) et on arme la mise en place.
      this.possession = equipeBeneficiaire;
      const eqBen = equipeBeneficiaire === 'A' ? this.equipeA : this.equipeB;
      const neuf = eqBen.find(j => j.numero === 9 && j.auSol === 0);
      this.porteur = neuf || joueurLePlusProche(eqBen.filter(j => j.auSol === 0), position.x, position.y).joueur;
      this.log('PENALITE', equipeBeneficiaire, `Penalite, equipe ${equipeBeneficiaire} joue rapidement et avance`);
      this._lancerJeuRapidePenalite(equipeBeneficiaire, position);
    }

    // Mise en place d'une pénalité/coup franc joué rapidement à la main (loi
    // 20.12). Le tapeur (possession/porteur déjà fixés par l'appelant) REJOINT la
    // marque en courant et l'équipe fautive RECULE de 10 m vers son en-but, le
    // tout EN COURANT pendant une brève phase de mise en place (cf.
    // _tickJeuRapidePenalite) — jamais une téléportation. Le jeu courant ne
    // reprend qu'une fois le tapeur sur la marque et les fautifs repliés : c'est
    // ce qui crée enfin l'espace réel de la pénalité (sans lui, le tapeur se
    // faisait plaquer aussitôt par un défenseur resté sur la marque).
    _lancerJeuRapidePenalite(equipeBeneficiaire, position) {
      const sens = equipeBeneficiaire === 'A' ? 1 : -1;
      const eqDef = equipeBeneficiaire === 'A' ? this.equipeB : this.equipeA;
      // Ligne des 10 m, bornée à l'en-but des fautifs (équivalent loi 19.32 :
      // marque à moins de 10 m de leur ligne → recul jusqu'à la ligne d'en-but).
      const ligne = Math.max(0, Math.min(LONGUEUR, position.x + sens * 10));
      this.penaliteRecul = { sens, eqDef, ligne, markX: position.x, markY: position.y, timer: 2.5 };
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Phase de mise en place du jeu rapide : tapeur vers la marque, fautifs vers
    // la ligne des 10 m, tout en course. Se termine (le ballon est « tapé », jeu
    // courant normal) dès que tapeur en place ET fautifs repliés, ou au délai.
    _tickJeuRapidePenalite(dt) {
      const R = this.penaliteRecul;
      R.timer -= dt;
      let pret = true;
      if (this.porteur) {
        avancer(this.porteur, R.markX - this.porteur.x, R.markY - this.porteur.y, dt, vitesseMs(this.porteur));
        if (distance(this.porteur, { x: R.markX, y: R.markY }) > 1) pret = false;
      }
      for (const j of R.eqDef) {
        if (j.auSol > 0) continue;
        // En deçà de la ligne des 10 m (entre la marque et la ligne) → se replie
        // en reculant (x vers la ligne), en gardant sa largeur (y inchangé).
        if ((j.x - R.ligne) * R.sens < -0.5) {
          avancer(j, R.ligne - j.x, 0, dt, vitesseMs(j));
          pret = false;
        }
      }
      if (R.timer <= 0 || pret) this.penaliteRecul = null;
    }

    // Pénalité jouée en touche : l'équipe qui a botté conserve le lancer
    // (à l'inverse d'une touche en jeu courant), avec un gain de terrain
    // réaliste borné au terrain.
    _accorderPenaliteTouche(equipe, position) {
      this.log('PENALITE', equipe, `Penalite, equipe ${equipe} joue en touche et conserve le lancer`);
      this.possession = equipe;
      const sensAttaque = equipe === 'A' ? 1 : -1;
      const gain = 10 + this.rng() * 10;
      const xTouche = Math.max(0, Math.min(LONGUEUR, position.x + sensAttaque * gain));
      const eqLanceur = equipe === 'A' ? this.equipeA : this.equipeB;
      // Loi 18 : le talonneur (n°2) lance, comme a la touche en jeu courant
      // (cf. _accorderTouche).
      this.porteur = eqLanceur.find(j => j.numero === this.cfg.touche.lanceur && j.sinBin <= 0) || eqLanceur[8];
      const xLanceur = Math.max(5, Math.min(LONGUEUR - 5, xTouche));
      // Loi 18.22 : le lanceur sur la ligne de touche (cf. _accorderTouche),
      // pas à 5 m à l'intérieur.
      const yLanceur = position.y <= LARGEUR / 2 ? 0.5 : LARGEUR - 0.5;
      this.ruckPoint = { x: xLanceur, y: yLanceur };
      this.phase = 'TOUCHE';
      this.timerPhase = 0;
      this.toucheLancer = null;
      this.toucheLanceurY = yLanceur;
      // Cible à rejoindre en courant (cf. _touchePlacerLignes), jamais une
      // téléportation : le lanceur peut être loin du point de pénalité si le
      // gain de terrain du coup de pied est important.
      this.toucheLanceurX = xLanceur;
      this.toucheCapFormation = this._capFormationTouche(xLanceur);
    }

    // À la sortie d'un regroupement (ruck/maul/mêlée/touche), les joueurs qui
    // étaient liés tout près du point de regroupement ont besoin d'un instant
    // pour se relever et rejoindre l'alignement : sans ce délai, le défenseur
    // qui vient juste d'être contestant au ruck, resté au même endroit, devient
    // mécaniquement le défenseur le plus proche et plaque le porteur suivant dès
    // la première fraction de seconde de jeu courant (cf. _tickPorte).
    _imposerRecuperationRuck(pt, rayon = 6, duree = 2) {
      // Tout près de sa propre ligne d'en-but, la défense est naturellement
      // massée sur un espace réduit (peu de place pour se replier) : un rayon
      // d'exclusion large y évacue mécaniquement TOUTE la couverture proche du
      // point de regroupement, laissant le couloir vers l'essai grand ouvert
      // dès la sortie suivante. On réduit donc le rayon près des lignes
      // d'en-but pour ne lever que les contestants immédiats, pas tout le
      // rideau défensif du point de marque.
      const pres = pt.x <= 8 || pt.x >= LONGUEUR - 8;
      const rayonEffectif = pres ? Math.min(rayon, 3) : rayon;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (distance(j, pt) < rayonEffectif) j.ruckRecovery = duree;
      }
    }

    // Zone du terrain du point de vue de l'équipe en possession (distance à
    // FRANCHIR pour aplatir) : détermine le registre tactique réel (kick très
    // fréquent dans son 22, jeu au sol/maul tout près de la ligne adverse...)
    // plutôt qu'un comportement uniforme sur tout le terrain.
    _zoneTerrain(porteur) {
      const distButs = porteur.sensAttaque > 0 ? (LONGUEUR - porteur.x) : porteur.x;
      if (distButs <= 5) return 'CINQ_M';
      if (distButs <= 22) return 'OPP_22';
      if (distButs <= 50) return 'OPP_HALF';
      if (distButs < 78) return 'OWN_HALF';
      return 'OWN_22';
    }

    _tickPorte(dt) {
      const porteur = this.porteur;
      const def = this.defenseurs();
      // Pour la détermination du plaqueur potentiel, on exclut les défenseurs en
      // récupération post-regroupement (cf. _imposerRecuperationRuck) : sinon le
      // contestant qui vient de sortir du ruck, resté au même endroit, redevient
      // mécaniquement le défenseur le plus proche et plaque dès la fraction de
      // seconde suivante. S'ils sont tous en récupération (cas rare), on retombe
      // sur la liste complète plutôt que de ne désigner aucun plaqueur.
      const defDisponibles = def.filter(j => j.ruckRecovery <= 0);
      const { joueur: defenseurProche, distance: distDef } = joueurLePlusProche(
        defDisponibles.length > 0 ? defDisponibles : def, porteur.x, porteur.y
      );
      this.timerPhase += dt;

      // Combinaison scriptée en cours (sortie de mêlée/touche, cf. playbook) :
      // elle PILOTE les passes ; le porteur ne décide pas librement (kick/passe
      // libre) tant qu'elle dure. Si une passe scriptée est jouée ce tick, le
      // tick s'arrête là ; entre deux passes, le porteur court (RUN) et reste
      // plaquable ci-dessous — la défense peut donc contrer la combinaison.
      if (this.combinaison && this._tickCombinaison(dt)) return;

      // Décision tactique du porteur (botter, passer, jouer au large, foncer au
      // contact) : tranchée AVANT la résolution du plaquage ci-dessous, sur la
      // base de la zone, de la pression défensive, du soutien disponible, du
      // numéro du porteur et du score (cf. choisirActionPorteur). Le coup de
      // pied peut survenir même défenseur tout proche (dégagement sous
      // pression) ; la passe suppose de ne pas être déjà au contact.
      const action = this.combinaison ? 'RUN' : this.choisirActionPorteur(porteur, defenseurProche, distDef, dt);
      if (action === 'KICK') { this._executerCoupDePiedJeu(porteur); return; }
      if (distDef >= 2.2 && (action === 'PASS' || action === 'JEU_LARGE') && this._tenterPasse(porteur, action === 'JEU_LARGE')) return;

      // Plaquage / contact : résolu AVANT le déplacement de ce tick, sur la
      // base de la distance déjà mesurée. Sinon, un porteur déjà à portée de
      // plaquage avançait quand même ce tick et pouvait franchir la ligne
      // d'en-but (ou la ligne de touche) avant que le contact ne soit jamais
      // résolu — un défenseur collé au porteur ne l'arrêtait jamais. Le
      // cooldown posé sur un plaquage manqué empêche de re-tirer au tick
      // suivant contre le même défenseur (sinon le raté n'aurait aucune
      // conséquence : il serait rejoué jusqu'à réussite quelques dixièmes de
      // seconde plus tard).
      if (distDef < 2.2 && defenseurProche.missCooldown <= 0) {
        const att0 = this.attaquants();
        this.stats[this.possession].carries++;
        this.stats[defenseurProche.team].tacklesAttempted++;
        // Réussite de plaquage ~86-88 % (réel ~85-88 %) : l'ancienne base 0.83
        // donnait ~80 % de réussite et ~128 plaquages manqués/match (réel ~15 %
        // d'échec), donc trop de défenseurs battus et de franchissements.
        const probaPlaquage = Math.max(0.80, Math.min(0.95, 0.88 + (defenseurProche.plaquage - this.porteur.vitesse) / 250));
        if (this.rng() >= probaPlaquage) {
          // Plaquage manqué : le défenseur reste hors-jeu de contact un court
          // instant, le porteur poursuit sa course sans être inquiété par lui.
          defenseurProche.missCooldown = 1.0;
          this.stats[defenseurProche.team].missedTackles++;
          this.stats[this.possession].defenseursBattus++; // le porteur a battu un défenseur
          // FRANCHISSEMENT (line break) : le porteur bat le plaqueur ET se
          // retrouve en ESPACE — le motif clé de l'étude. Seuil de 7 m vers le
          // prochain défenseur : c'est la distance au-delà de laquelle un
          // défenseur ne peut plus intervenir immédiatement, ce qui correspond à
          // un vrai « clean break » (World Rugby). Un seuil de 12 m ne comptait
          // presque jamais (0,1/match) alors qu'un match réel en montre ~8-20 ;
          // 6 m ramène le compteur au cœur de cette fourchette sans rien changer
          // au jeu (score et essais strictement identiques : pur comptage).
          const autres = def.filter((d) => d !== defenseurProche && d.auSol === 0);
          if (joueurLePlusProche(autres, porteur.x, porteur.y).distance > 6) {
            this.stats[this.possession].franchissements++;
          }
          this.log('PLAQUAGE_MANQUE', this.possession, `Plaquage manque, l'equipe ${this.possession} poursuit sa course`);
          return;
        }
        this.stats[defenseurProche.team].tacklesMade++;
        // Définition officielle du plaquage (World Rugby) : le plaqueur amène le
        // porteur au sol ET va LUI-MÊME au sol. On le montre donc brièvement
        // couché À L'ÉCRAN (marqueur PUREMENT VISUEL solVisuel, cf. renderer),
        // SANS le figer côté jeu : le figer, même 0,3 s, le retirait de la
        // défense et faisait monter les essais (4,8 -> 5,9 mesuré). Ce marqueur
        // n'a AUCUN effet sur la simulation — il illustre juste la définition.
        defenseurProche.solVisuel = 0.9;
        this.timerPhase = 0;
        // En-avant au contact : conséquence directe et distincte du plaquage
        // réussi, pas seulement un succès/échec binaire ruck-ou-rien. Taux
        // volontairement bas (~1 contact sur 75) : à 0.045 il produisait à lui
        // seul ~25 mêlées/match, très au-dessus du repère réel (8-25 mêlées
        // TOTALES par match, cf. CLAUDE.md Rôle 6).
        if (this.rng() < 0.012) {
          this.stats[this.possession].knockOns++;
          this.log('MELEE_ENAVANT', this.possession, `En-avant au contact, equipe ${this.possession} - melee adverse`);
          this._accorderMelee(this.possession, porteur);
          return;
        }
        // Plaquage DOMINANT : le défenseur gagne nettement le duel (gros
        // plaqueur, lecture parfaite, porteur lent). Le porteur est REPOUSSÉ — la
        // défense AVANCE au lieu de subir : le contact recule la ligne de gain
        // (~1,2 m côté attaque) et la défense récupère un ballon « sur l'avancée »
        // (contest bien plus probable au ruck qui suit, cf. _tickRuck). C'est ce
        // qui rend un bon plaquage payant au lieu de toujours céder du terrain.
        const margePlaquage = defenseurProche.plaquage - this.porteur.vitesse;
        this.ruckDominant = margePlaquage > 12 && this.rng() < 0.3;
        if (this.ruckDominant) this.porteur.x -= this.porteur.sensAttaque * 1.2;
        this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
        this.contestants = [defenseurProche.numero];
        // Offload : le porteur plaqué mais pas encore au sol transmet à un
        // soutien tout proche plutôt que de finir au ruck — garde le ballon vivant.
        // Le soutien doit être À HAUTEUR OU EN RETRAIT (loi 11) : un offload reste
        // une passe, il ne peut pas aller vers l'avant. Sans ce filtre, l'offload
        // était la seule voie de passe qui contournait le contrôle de la passe en
        // avant (jusqu'à ~3 m vers l'avant non sifflés, ~5/match mesurés).
        const soutiens = att0.filter(j => j !== porteur && distance(j, porteur) < 4 && j.auSol === 0
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.3);
        if (soutiens.length > 0 && this.rng() < 0.10) {
          const { joueur: receveurOffload } = joueurLePlusProche(soutiens, porteur.x, porteur.y);
          this.stats[this.possession].passes++;
          this.stats[this.possession].offloads++;
          this.log('OFFLOAD', this.possession, `Offload de l'equipe ${this.possession} dans le plaquage`);
          this._lancerPasseVisuelle(porteur, receveurOffload);
          this.porteur = receveurOffload;
          this._receptionDirecte = false;
          return;
        }
        // Maul (loi 16) : voie secondaire (rare en plein champ), nettement plus
        // probable tout près de la ligne adverse (pick-and-go qui se transforme
        // en maul) — la voie PRINCIPALE de formation reste la touche gagnée
        // dans les 22 m adverses (cf. _tickTouche).
        const zone0 = this._zoneTerrain(porteur);
        const tauxMaul = (zone0 === 'OPP_22' || zone0 === 'CINQ_M') ? 0.05 : 0.012;
        if (soutiens.length > 0 && this.rng() < tauxMaul && Referee.maulForme(porteur, defenseurProche, soutiens.length > 0)) {
          this._formerMaul(porteur, defenseurProche);
        } else {
          // Plaqué : à terre, il ne se relèvera pas tout de suite (cf. _tickRuck
          // qui maintient cet état pendant le ruck et impose un temps de relève).
          // On mémorise l'endroit EXACT de la chute : tant qu'il est au sol, le
          // joueur y est figé (cf. tick(), gel global des joueurs au sol) et ne
          // se déplace plus du tout jusqu'à s'être relevé.
          this.porteur.auSol = 2.0;
          this.porteur._solX = this.porteur.x; this.porteur._solY = this.porteur.y;
          this.stats[this.possession].rucks++; this.stats[this.possession].phases++;
          const tierRuck = this.rng();
          // Durée de recyclage du ruck, réaliste : ballon rapide ~1,5-3 s,
          // normal ~3-5 s, lent ~5-7 s. Un vrai ruck se recycle en quelques
          // secondes (loi 15.16, « use it » ~5 s) — l'ancien palier lent allait
          // jusqu'à 11 s, ce qui faisait « traîner » les rucks à l'écran.
          this.ruckDureeCible = (tierRuck < 0.55 ? 1.5 + this.rng() * 1.5
            : tierRuck < 0.85 ? 3 + this.rng() * 2
              : 5 + this.rng() * 2) * this._echelleArret;
          this.ruckTempsSansSoutien = 0;
          this.phase = 'RUCK';
          this._receptionDirecte = false;
        }
        return;
      }

      const dx = porteur.sensAttaque * 6;
      // Amplitude du crochet selon le PROFIL : un joueur rapide (ailier ~90)
      // crochète franchement pour éliminer le défenseur, un avant (~45) court
      // quasi droit et va au contact. Donne une évasion individuelle visible au
      // lieu d'un même pas de côté pour tous.
      const amplEvite = 1.0 + Math.max(0, (porteur.vitesse - 45)) / 45 * 2.5;
      let evite = ((porteur.y - defenseurProche.y) > 0 ? 1 : -1) * amplEvite;
      // Ligne CROISÉE (issue d'une combinaison, cf. _tickCombinaison) : le
      // receveur vient de prendre le ballon sur un croisé, il change de direction
      // et repique de l'autre côté un court instant, au lieu du crochet habituel.
      if (porteur._croiseTimer > 0) evite = (porteur._croiseDir || 1) * amplEvite;
      // Près d'une ligne de touche, le porteur ne crochète JAMAIS vers la touche
      // (ce qui le faisait sortir gratuitement, gonflant le nombre de touches dès
      // qu'on écartait le jeu) : il coupe à l'intérieur, comme un vrai ailier/
      // centre qui rentre chercher du soutien plutôt que de mourir sur la ligne.
      if (porteur.y < 8) evite = Math.abs(evite);
      else if (porteur.y > LARGEUR - 8) evite = -Math.abs(evite);
      const xAvantCourse = porteur.x;
      avancer(porteur, dx, evite, dt, vitesseMs(porteur));
      // Mètres gagnés : uniquement le terrain réellement parcouru ballon en
      // main dans le sens d'attaque (pas les passes ni le jeu au pied), comme
      // la statistique "metres gained" d'un relevé de match réel.
      this.stats[this.possession].metresGagnes += (porteur.x - xAvantCourse) * porteur.sensAttaque;

      // Touche : le ballon porté au-delà de la ligne de touche est mort, jeu arrêté.
      if (porteur.y <= 0.01 || porteur.y >= LARGEUR - 0.01) {
        this._accorderTouche(this.possession, porteur);
        return;
      }

      // Soutien et organisation de l'attaque : seuls les 2 coéquipiers les PLUS
      // PROCHES du porteur (quel que soit leur poste) viennent réellement le
      // soutenir. Tous les autres NE courent PAS après le ballon : ils tiennent
      // leur couloir du plan de jeu (avants au centre, ligne de trois-quarts
      // écartée, ailiers sur les bords), légèrement en retrait pour rester
      // onside, et OCCUPENT la largeur du terrain — prêts à recevoir une passe
      // au large. Avant, toute l'équipe dérivait vers le ballon et se compactait.
      const att = this.attaquants();
      const soutienDirect = new Set(
        att.filter(j => j !== porteur && j.auSol === 0)
          .sort((a, b) => distance(a, porteur) - distance(b, porteur))
          .slice(0, 2)
      );
      for (const j of att) {
        if (j === porteur) continue;
        // L'OUVREUR (10) ne se place JAMAIS dans le dos direct du 9 : quand le 9
        // a le ballon (sortie), le 10 se décale sur un CÔTÉ (le grand côté, plus
        // d'espace) et EN RETRAIT, pour recevoir lancé et avec un angle et amorcer
        // l'attaque — pas à l'arrêt collé au regroupement. C'est ce premier
        // receveur décalé qui donne une vraie ligne d'attaque.
        if (j.numero === 10 && porteur.numero === 9 && j.auSol === 0) {
          // Décalé sur le côté ouvert (~6 m) et légèrement en retrait (~4 m) :
          // clairement SUR UN CÔTÉ et non dans le dos du 9, mais assez proche
          // pour rester le premier relais de l'attaque (un décalage trop large
          // sortait le 10 de la structure et effondrait les essais — mesuré).
          const coteOuvert = porteur.y <= LARGEUR / 2 ? 1 : -1;
          const cibleY10 = Math.max(6, Math.min(LARGEUR - 6, porteur.y + coteOuvert * 6));
          const cibleX10 = porteur.x - porteur.sensAttaque * 4;
          avancer(j, cibleX10 - j.x, cibleY10 - j.y, dt, vitesseMs(j) * 0.9);
          continue;
        }
        if (soutienDirect.has(j)) {
          // Soutien rapproché, toujours légèrement en retrait du porteur en
          // profondeur (jamais devant, sinon passe en avant) : il attend le
          // ballon dans son dos.
          const angle = (j.numero % 5) - 2;
          const cibleX = porteur.x - porteur.sensAttaque * 1.5;
          avancer(j, cibleX - j.x, (porteur.y - j.y) + angle * 0.5, dt, vitesseMs(j) * 0.9);
        } else {
          // AUTONOMIE par le profil : chaque joueur suit le ballon selon SA
          // tendance individuelle (proximité au ballon, cf. modèle) plutôt qu'un
          // binaire avant/back. Un joueur « tenant du ballon » (n°9, piliers,
          // tendance ~90) dérive franchement vers le jeu pour soutenir ; un ailier
          // (tendance ~15) tient son large. Idem pour la profondeur : les suiveurs
          // se placent plus à plat (soutien proche), les arrières plus en
          // profondeur (lecture et espace). Le placement émerge ainsi des profils.
          const t = j.tendance / 100; // 0.15 (ailier) .. 0.90 (9/pilier)
          const driftBallon = 0.04 + t * 0.20;
          const cibleY = j.channelY * (1 - driftBallon) + porteur.y * driftBallon;
          const profondeur = (10 - t * 4) + Math.abs(j.channelY - porteur.y) * (0.14 - t * 0.1);
          const cibleX = porteur.x - porteur.sensAttaque * profondeur;
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * (j.numero <= 8 ? 0.7 : 0.8));
        }
      }

      for (const j of def) {
        if (j === defenseurProche) {
          // Le plaqueur désigné vise un point d'interception légèrement
          // devant le porteur (dans son sens de course), pas sa position
          // actuelle : une poursuite "pure" qui vise toujours le talon du
          // porteur ne converge jamais contre un porteur de vitesse égale qui
          // jute latéralement (chaque tick, le défenseur réoriente en retard
          // d'un cran) — un vrai plaqueur lit la trajectoire et coupe l'angle.
          const cibleInterceptX = porteur.x + porteur.sensAttaque * 1.5;
          avancer(j, cibleInterceptX - j.x, porteur.y - j.y, dt, vitesseMs(j));
          continue;
        }
        // L'ARRIÈRE (n°15) ne monte PAS dans la ligne : il SWEEPE en couverture
        // ~18 m derrière, au centre, pour parer le jeu au pied et les
        // débordements (dernier rideau). Il ne court jamais vers le ballon.
        if (j.numero === 15) {
          const cibleX = porteur.x + porteur.sensAttaque * this.cfg.defense.profondeurArriereJeu;
          const cibleY = j.channelY * 0.7 + porteur.y * 0.3;
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.8);
          continue;
        }
        // AILE CÔTÉ FERMÉ (à l'opposé du ballon) : elle ne monte PAS dans la
        // ligne mais RECULE en couverture (~10 m derrière la ligne d'avantage),
        // formant le rideau arrière avec le n°15 (back-three) — prête à cueillir
        // un coup de pied ou un débordement au large. L'aile côté OUVERT (près du
        // ballon) reste, elle, dans la ligne pour défendre le large. La défense
        // couvre ainsi la PROFONDEUR sans dégarnir le côté où l'attaque se
        // développe.
        if (j.numero === 11 || j.numero === 14) {
          const coteAile = Math.sign(j.channelY - LARGEUR / 2) || 1;
          const coteBallon = Math.sign(porteur.y - LARGEUR / 2) || 1;
          // Seulement LOIN de la ligne défendue (>40 m) : là, la menace est le
          // coup de pied/le territoire, donc on décroche l'aile fermée en
          // couverture. PRÈS de l'en-but défendu (zone rouge), la menace est
          // l'essai : l'aile RESTE dans la ligne, on ne dégarnit pas la défense
          // là où se marquent les essais (sinon on en concède davantage).
          const ligneDef = porteur.sensAttaque > 0 ? LONGUEUR : 0;
          const distLigneDef = Math.abs(ligneDef - porteur.x);
          if (coteAile !== coteBallon && distLigneDef > 40) {
            const cibleXcouv = porteur.x + porteur.sensAttaque * 12;
            avancer(j, cibleXcouv - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.85);
            continue;
          }
        }
        // Les autres défenseurs (avants + 9/10/12/13 + AILIER côté ouvert) montent
        // en LIGNE à plat sur la ligne d'avantage et tiennent leur couloir pour
        // OCCUPER toute la largeur, avec une glissade vers le ballon (défense en
        // glissement). Les AILIERS tiennent FERMEMENT leur bord (dérive minime) :
        // ils ne se font pas aspirer vers le ballon, donc les ailes restent
        // couvertes. Tous restent côté en-but adverse au porteur (couloir fermé).
        const estAvant = j.numero <= 8;
        const ailier = j.numero === 11 || j.numero === 14;
        const avance = porteur.sensAttaque > 0 ? (estAvant ? 1 : 2.5) : -(estAvant ? 1 : 2.5);
        const cibleX = porteur.x + avance;
        const drift = ailier ? 0.06 : 0.2;
        const cibleY = j.channelY * (1 - drift) + porteur.y * drift;
        avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.85);
      }

      // Essai
      if ((porteur.sensAttaque > 0 && porteur.x >= LONGUEUR) || (porteur.sensAttaque < 0 && porteur.x <= 0)) {
        // Plaquage de sauvetage in extremis : le contrôle de contact en début
        // de tick utilisait la distance d'AVANT le déplacement ; un défenseur
        // qui a comblé l'écart pendant ce même tick (donc invisible à ce
        // contrôle initial) doit quand même avoir sa chance d'arrêter l'essai
        // au ras de la ligne, comme un vrai plaquage de couverture désespéré.
        const { joueur: sauveteur, distance: distSauvetage } = joueurLePlusProche(def, porteur.x, porteur.y);
        if (distSauvetage < 2.2 && sauveteur.missCooldown <= 0) {
          this.stats[this.possession].carries++;
          this.stats[sauveteur.team].tacklesAttempted++;
          const probaSauvetage = Math.max(0.55, Math.min(0.85, 0.68 + (sauveteur.plaquage - porteur.vitesse) / 250));
          if (this.rng() < probaSauvetage) {
            this.stats[sauveteur.team].tacklesMade++;
            porteur.x = porteur.sensAttaque > 0 ? LONGUEUR - 0.5 : 0.5;
            this.ruckPoint = { x: porteur.x, y: porteur.y };
            this.contestants = [sauveteur.numero];
            porteur.auSol = 2.0;
            porteur._solX = porteur.x; porteur._solY = porteur.y;
            this.stats[this.possession].rucks++; this.stats[this.possession].phases++;
            const tierRuck = this.rng();
            // Recyclage réaliste (cf. l'autre site de création de ruck) : max ~7 s
            // au lieu de 11 s, pour que les rucks ne traînent plus à l'écran.
            this.ruckDureeCible = (tierRuck < 0.55 ? 1.5 + this.rng() * 1.5
              : tierRuck < 0.85 ? 3 + this.rng() * 2
                : 5 + this.rng() * 2) * this._echelleArret;
            this.ruckTempsSansSoutien = 0;
            this.ruckDominant = false; // plaquage de sauvetage in extremis, pas un ballon sur l'avancée
            this.phase = 'RUCK';
            this._receptionDirecte = false;
            this.timerPhase = 0;
            return;
          }
          sauveteur.missCooldown = 1.0;
          this.stats[sauveteur.team].missedTackles++;
          this.stats[this.possession].defenseursBattus++;
          // Battre le dernier défenseur (plaquage de sauvetage) EST un
          // franchissement — le porteur file vers l'en-but.
          this.stats[this.possession].franchissements++;
          this.log('PLAQUAGE_MANQUE', this.possession, `Plaquage de sauvetage manque, l'equipe ${this.possession} aplatit`);
        }
        porteur.x = porteur.sensAttaque > 0 ? LONGUEUR : 0;
        this.score[this.possession] += 5;
        this.stats[this.possession].essais++;
        this.stats[this.possession].carries++;
        this.essaiX = porteur.x;
        this.essaiY = porteur.y;
        this.essaiEquipe = this.possession;
        this.log('ESSAI', this.possession, `Essai equipe ${this.possession} !`);
        this.phase = 'ESSAI';
        this.timerPhase = 0;
        return;
      }

      // Drop-goal (loi 9.A) : dans la zone de tir (8–38 m), l'équipe en
      // possession peut choisir de travailler le ballon pour son ouvreur, qui
      // tente un drop en jeu courant (ballon lâché qui rebondit puis botté entre
      // les poteaux). Choix tactique rare ; la réussite est calculée comme un
      // tir au but mais minorée, car botté en pleine action et sous pression.
      {
        const sensAttaqueDrop = porteur.sensAttaque;
        const distanceButsDrop = sensAttaqueDrop > 0 ? (LONGUEUR - porteur.x) : porteur.x;
        // Réservé aux joueurs qui tirent réellement au but en match (ouvreur,
        // centres, arrière) : sans ce filtre, un pilier porteur du ballon à
        // 30 m pouvait tenter un drop-goal, ce qu'on ne voit jamais en match.
        if (porteur.tendance <= 55 && distanceButsDrop >= 8 && distanceButsDrop <= 38 && this.rng() < 0.012 * dt) {
          const offsetLateralDrop = Math.abs(porteur.y - LARGEUR / 2);
          const equipe = this.possession;
          this.stats[equipe].kicks++;
          if (this.rng() < probaReussiteTir(distanceButsDrop, offsetLateralDrop) * 0.7) {
            this.score[equipe] += 3;
            this.log('DROP_GOAL_REUSSI', equipe, `Drop-goal reussi, equipe ${equipe} +3`);
            this._nouvelleManche(equipe);
          } else {
            this.log('DROP_GOAL_RATE', equipe, `Drop-goal rate, equipe ${equipe}`);
            // Comme une pénalité au but ratée : le ballon part au-delà de la
            // ligne d'en-but adverse, remise en 22m pour l'équipe défenseure.
            const sens = { A: 1, B: -1 };
            const sensEquipe = sens[equipe];
            const ligneEssaiAdverse = sensEquipe > 0 ? LONGUEUR : 0;
            const x22 = ligneEssaiAdverse - sensEquipe * 22;
            this._nouvelleManche(equipe, x22);
          }
          return;
        }
      }
    }

    // Botte en jeu courant : choix du type et de la cible selon la zone et la
    // pression. Renvoie true si un coup de pied a été déclenché ce tick (dans
    // ce cas, _tickPorte ne fait rien d'autre pour ce tick).
    // Décision tactique centrale du porteur, prise AVANT toute résolution de
    // plaquage : zone du terrain, pression défensive immédiate, numéro du
    // porteur (avants vs demi de mêlée/ouvreur vs trois-quarts/arrières),
    // soutien disponible et score au tableau. Ne fait que choisir l'intention
    // (aucun effet de bord) ; c'est _tickPorte qui exécute l'action retournée.
    choisirActionPorteur(porteur, defenseurProche, distDef, dt) {
      const zone = this._zoneTerrain(porteur);
      const pression = distDef < 5;
      const att = this.attaquants();
      const soutiens = att.filter(j => j !== porteur && j.auSol === 0 && distance(j, porteur) < 15)
        .sort((a, b) => distance(a, porteur) - distance(b, porteur));
      const soutienDisponible = soutiens.length > 0;
      const avant = porteur.numero <= 8;
      const enMene = this.score[porteur.team] > this.score[porteur.team === 'A' ? 'B' : 'A'];

      // 0. DEMI DE MÊLÉE LIBRE à la sortie (ruck/mêlée/touche où il n'était pas
      // au contact) : en plus du lancement classique 9→10 et du jeu au pied déjà
      // gérés plus bas (sections 1 et 2b, calibrés), on ajoute ici les deux seules
      // options qui manquaient au 9, et RAREMENT pour ne pas casser la structure
      // d'attaque (un 9 qui snipe/tape à chaque ruck effondre les essais) :
      //   - PERCÉE : s'il y a un vrai trou devant lui (aucun défenseur dans un
      //     large cône proche), il part seul ;
      //   - AVANT LANCÉ : il sert un avant tout près (ballon porté / pick).
      // Sinon (cas courant) il tombe dans le jeu au pied calibré (touche/dégagement
      // dans ses 22, chandelle plus haut) puis le lancement vers l'ouvreur.
      if (porteur.numero === 9 && this._neufLibre) {
        if (this.timerPhase < 0.3) return null; // le ballon finit d'arriver de la base
        this._neufLibre = false;
        const sens = porteur.sensAttaque;
        const r = this.rng();
        // PERCÉE du 9 : uniquement dans le camp adverse (là où un 9 stoppé laisse
        // un ruck en bonne position au lieu de sacrifier une possession dans son
        // propre camp) et seulement si le CHANNEL immédiat devant lui est vide
        // (aucun défenseur dans un cône serré) — c'est le vrai trou près du ruck.
        const enCampAdverse = zone === 'OPP_HALF' || zone === 'OPP_22' || zone === 'CINQ_M';
        const channelVide = !this.defenseurs().some(d => d.auSol === 0
          && (d.x - porteur.x) * sens > -0.5 && (d.x - porteur.x) * sens < 6
          && Math.abs(d.y - porteur.y) < 3);
        if (channelVide && enCampAdverse && r < 0.45) return 'RUN'; // trou net près de la ligne → il part seul
        // AVANT LANCÉ tout près (ballon porté / pick) : une option de temps en
        // temps, pas à chaque sortie (sinon le 9 ne lance plus jamais sa ligne).
        const avantLance = att.find(j => j.numero <= 8 && j.auSol === 0
          && distance(j, porteur) < 6 && (j.x - porteur.x) * sens <= 0.3 && (j.x - porteur.x) * sens > -5);
        if (avantLance && r < 0.12) { this._passeCibleForcee = avantLance; return 'PASS'; }
        // sinon : jeu au pied calibré (section 1) puis lancement 9→10 (section 2b).
      }

      // 1. Botter en jeu courant : très fréquent dans son propre 22 (surtout
      // sous pression), de plus en plus rare en remontant le terrain. Une
      // équipe qui mène botte un peu plus pour la touche/le territoire.
      if (this.timerPhase > 0.4 && zone !== 'CINQ_M') {
        // Taux abaissés (~ -35 %) : le jeu au pied était trop fréquent (~64
        // coups de pied/match, réel ~25-40). On botte toujours surtout depuis
        // son propre camp (dégagement/occupation) mais on garde davantage le
        // ballon en main pour faire vivre le jeu.
        let pParSeconde;
        if (zone === 'OWN_22') pParSeconde = 0.26 + (pression ? 0.16 : 0);
        else if (zone === 'OWN_HALF') pParSeconde = 0.075 + (pression ? 0.05 : 0);
        else if (zone === 'OPP_HALF') pParSeconde = 0.02 + (pression ? 0.012 : 0);
        else pParSeconde = 0.01; // OPP_22 : on privilégie le jeu au sol/pick-and-go.
        if (enMene) pParSeconde *= 1.15; else pParSeconde *= 0.9;
        if (this.rng() < pParSeconde * dt) return 'KICK';
      }

      // 2. Pick-and-go : un avant tout près de la ligne adverse sous pression
      // préfère relancer au contact plutôt que chercher le large.
      if (avant && (zone === 'CINQ_M' || zone === 'OPP_22') && pression && this.rng() < 0.55 * dt) {
        return 'PICK_GO';
      }

      // 2b. Sortie de regroupement : le demi de mêlée (9) ÉCARTE le ballon de la
      // congestion. À la sortie d'un ruck/d'une mêlée, les deux paquets sont
      // massés autour du ballon et la défense ne laisse pas passer le porteur ;
      // le 9 ne doit donc PAS foncer dedans, il donne à l'ouvreur (10) ou à un
      // trois-quarts placé EN ESPACE derrière/à hauteur. C'est ce qui sort
      // réellement le ballon du regroupement et permet d'avancer. Très probable
      // dès qu'une option existe (encore plus sous pression immédiate).
      if (porteur.numero === 9) {
        // Sortie classique 9->10 : le 9 donne à l'ouvreur dégagé à hauteur/léger
        // retrait. (Varier ce destinataire déstabilise l'alignement et effondre
        // les essais — cf. _tenterPasse, branche passeurNeuf. La largeur vient du
        // 10 qui écarte ensuite le long de la ligne.)
        const dix = att.find(j => j.numero === 10 && j.auSol === 0
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.3
          && distance(j, porteur) < 16
          && joueurLePlusProche(this.defenseurs(), j.x, j.y).distance > 3);
        if (dix && this.rng() < (pression ? 0.6 : 0.3) * dt) return 'PASS';
      }

      // 2c. Trois-quarts qui FAIT VIVRE LA LIGNE : un back (10-13) qui a un
      // partenaire EXTÉRIEUR (plus près de la touche ouverte) et EN ESPACE écarte
      // le ballon vers le large plutôt que de rentrer au centre. C'est ce qui
      // exploite la largeur du terrain (10->12->13->aile) au lieu de figer le jeu
      // sur l'axe central 9-10. On vise le joueur SUIVANT de la ligne (passe
      // courte, <22 m), jamais un saut direct vers l'ailier collé à la touche
      // (marge de bord), et on évite de fixer un partenaire déjà sous pression.
      if (porteur.numero >= 10 && porteur.numero <= 13 && zone !== 'CINQ_M') {
        const versLarge = att.find(j => j !== porteur && j.auSol === 0
          && (j.x - porteur.x) * porteur.sensAttaque <= 0.3
          && Math.abs(j.y - LARGEUR / 2) > Math.abs(porteur.y - LARGEUR / 2) + 3
          && Math.abs(j.y - LARGEUR / 2) < 24 // zone mi-large, pas collé à la touche
          && distance(j, porteur) < 22
          && joueurLePlusProche(this.defenseurs(), j.x, j.y).distance > 4);
        if (versLarge && this.rng() < (pression ? this.cfg.attaque.jeuLargeTaux.pression : this.cfg.attaque.jeuLargeTaux.calme) * dt) return 'PASS';
      }

      // 3. Passe avant contact, modulée par le PROFIL du porteur (autonomie) :
      // un AVANT (tendance haute) va au CONTACT pour avancer et fixer plutôt que
      // de lâcher ; un FINISSEUR rapide (ailier/arrière, vitesse élevée) se fie à
      // sa vitesse et PERCE plutôt que de passer ; un DISTRIBUTEUR (ouvreur/centre)
      // lâche volontiers le ballon avant le choc. Même situation, choix différent
      // selon le joueur — au lieu d'un taux unique pour tous.
      let pPasse = 0.7;
      if (porteur.numero <= 8) pPasse = 0.45;
      else if (porteur.vitesse > 80) pPasse = 0.45;
      else if (porteur.numero === 10 || porteur.numero === 12 || porteur.numero === 13) pPasse = 0.9;
      if (distDef < 5.5 && soutienDisponible && this.rng() < pPasse * dt) {
        return 'PASS';
      }

      // 4. Jeu au large : occasionnellement, même sans pression immédiate,
      // l'attaque écarte délibérément vers un trois-quarts/arrière (numéro
      // de tendance basse) plutôt que de jouer le ballon près du regroupement.
      if (!pression && zone !== 'CINQ_M' && this.timerPhase > 1.0) {
        // Les ailiers/arrière tiennent leur couloir, donc à 20-30 m du
        // regroupement la plupart du temps : chercher l'option large dans le
        // même rayon de 15 m que le soutien rapproché ne trouve quasiment
        // jamais qu'un centre, jamais un ailier. D'où un rayon dédié, plus
        // large, pour cette détection (la passe elle-même reste risquée sur
        // la distance via probaReussite dans _tenterPasse).
        const soutienLarge = att.find(j => j !== porteur && j.auSol === 0
          && j.tendance <= 50 && distance(j, porteur) < 45);
        if (soutienLarge && this.rng() < 0.22 * dt) return 'JEU_LARGE';
      }

      // 5. Hors de portée de plaquage et aucune décision ci-dessus : on
      // continue de courir (cf. logique d'évitement existante).
      if (distDef >= 2.2) return 'RUN';
      return 'CONTACT';
    }

    // Exécute une passe (courte ou jeu au large) vers le meilleur soutien
    // disponible. Retourne true si la tentative a consommé le tick (passe
    // réussie, en-avant ou passe ratée -> mêlée), false s'il n'y avait aucun
    // candidat valable (le tick retombe alors sur la logique de course/contact).
    // Déclenche le vol visuel d'une passe : le ballon part du passeur et
    // décrit un court arc jusqu'au receveur (cf. getState), au lieu de "sauter"
    // instantanément. La possession (this.porteur) change tout de suite côté
    // logique — c'est purement de l'affichage —, donc aucun impact sur le jeu,
    // les statistiques ou les invariants ; seul le dernier saut instantané du
    // ballon lors d'une passe disparaît à l'écran. Durée proportionnelle à la
    // distance (passe courte ~0,15 s, jeu au large ~0,5 s).
    _lancerPasseVisuelle(passeur, cible) {
      // Point de départ du vol : normalement les mains du passeur. MAIS si une
      // passe est déjà en vol (ballon pas encore arrivé au receveur précédent),
      // on démarre la nouvelle passe depuis la position ACTUELLE du ballon en
      // vol, pas depuis le passeur : sinon, sur les passes enchaînées le long de
      // la ligne (9->10->12->13...), chaque nouvelle passe faisait "sauter" le
      // ballon depuis son vol en cours jusqu'au passeur suivant — la balle qui
      // apparaît puis disparaît pour réapparaître ailleurs. Ainsi le ballon
      // glisse de façon continue d'un receveur au suivant.
      let fromX = passeur.x, fromY = passeur.y;
      if (this.passeVisuelle) {
        const P = this.passeVisuelle;
        const t = P.duree > 0 ? Math.min(1, P.timer / P.duree) : 1;
        fromX = P.fromX + (P.cible.x - P.fromX) * t;
        fromY = P.fromY + (P.cible.y - P.fromY) * t;
      }
      const d = distance({ x: fromX, y: fromY }, cible);
      this.passeVisuelle = {
        fromX, fromY, cible,
        timer: 0,
        // Durée proportionnelle à la distance, plafonnée plus haut pour les
        // passes au large (sinon le ballon "saute" ~5 m/tick et paraît
        // téléporté) : une passe longue prend ~1 s comme en vrai.
        duree: Math.max(0.12, Math.min(1.0, d / 20)),
      };
    }

    _tenterPasse(porteur, jeuLarge) {
      const att = this.attaquants();
      // Rayon de recherche du destinataire : un jeu au large vise précisément
      // un ailier/arrière qui tient son couloir à 20-30 m du regroupement, le
      // plafond de 25 m utilisé pour la passe courte l'exclurait presque
      // toujours — la distance reste pénalisée via probaReussite ci-dessous.
      const rayon = jeuLarge ? 45 : 25;
      let candidats = att.filter(j => j !== porteur && j.auSol === 0 && distance(j, porteur) <= rayon);
      if (jeuLarge) candidats = candidats.filter(j => j.tendance <= 50);
      // Un vrai joueur ne cherche pas un soutien placé devant lui dans le sens
      // d'attaque : il sait que ce serait une passe en avant, donc il regarde
      // les options à hauteur ou en retrait avant de lâcher le ballon. Sans ce
      // filtre, le meilleur candidat au score (proximité/tendance) était
      // parfois légèrement devant le porteur, transformant une simple passe en
      // mêlée pour passe en avant bien plus souvent qu'en match réel. On garde
      // un repli sur la liste complète si aucune option à hauteur/en retrait
      // n'existe, comme un joueur sous pression qui tente quand même sa chance.
      const memesTolerance = 0.3;
      const candidatsOnside = candidats.filter(j => (j.x - porteur.x) * porteur.sensAttaque <= memesTolerance);
      if (candidatsOnside.length > 0) candidats = candidatsOnside;
      if (candidats.length === 0) return false;

      // Le demi de mêlée (9) qui sort le ballon cherche à l'ÉCARTER de la
      // congestion : il vise l'ouvreur (10) en priorité, puis un trois-quarts
      // EN ESPACE (défenseur le plus proche loin), pas un avant collé au
      // regroupement. Pour les autres passeurs, on garde la logique « soutien
      // le plus proche ».
      const passeurNeuf = porteur.numero === 9;
      const passeurBack = porteur.numero >= 10 && porteur.numero <= 13;
      let cible = candidats[0], meilleurScore = -Infinity;
      // Cible imposée par une décision du porteur (ex. le 9 libre qui sert un
      // avant lancé tout près à la sortie, cf. choisirActionPorteur) : on
      // court-circuite le scoring si elle est bien une option légale (onside).
      const cibleForcee = this._passeCibleForcee; this._passeCibleForcee = null;
      if (cibleForcee && candidats.includes(cibleForcee)) {
        cible = cibleForcee;
      } else
      for (const c of candidats) {
        const d = distance(c, porteur);
        let score;
        if (jeuLarge) {
          score = Math.abs(c.channelY - LARGEUR / 2) - d * 0.3;
        } else if (passeurNeuf) {
          // Le 9 vise l'ouvreur (10) en priorité, puis le soutien dégagé le plus
          // proche — sans aller chercher le joueur le plus profond (ce qui ferait
          // reculer le ballon et tuerait l'avancée). L'attaque du moteur démarre
          // structurellement par cette sortie 9->10 ; varier le destinataire du 9
          // (back plus large/profond) déstabilise l'alignement et effondre les
          // essais (testé). La VARIÉTÉ vient ensuite du 10 qui écarte le long de la
          // ligne (cf. branche passeurBack).
          const espace = joueurLePlusProche(this.defenseurs(), c.x, c.y).distance;
          score = (c.numero === 10 ? 80 : 0) + espace * 0.5 - d * 0.4 - c.tendance * 0.1;
        } else if (passeurBack) {
          // Trois-quarts qui fait vivre la ligne : il vise un partenaire EN ESPACE
          // dans la zone MI-LARGE (couloirs des centres/arrière), pas le soutien
          // le plus proche (souvent un avant central) NI l'ailier collé à la
          // touche. « largeurUtile » récompense l'écartement jusqu'à ~22 m du
          // centre PUIS REDESCEND vers la touche (offset 35) : ainsi le ballon va
          // au large sans s'entonner dans le coin (ce qui envoyait l'ailier en
          // touche). La pénalité de distance garde la passe sur le joueur suivant.
          const espace = joueurLePlusProche(this.defenseurs(), c.x, c.y).distance;
          const offset = Math.abs(c.y - LARGEUR / 2);
          const largeurUtile = offset > 22 ? Math.max(0, LARGEUR / 2 - offset) : offset;
          score = largeurUtile * 2 + espace * 0.7 - d * 0.5;
        } else {
          score = (100 - d) + c.tendance * 0.1;
        }
        if (score > meilleurScore) { meilleurScore = score; cible = c; }
      }

      this.stats[this.possession].passesTentees++;
      if (Referee.passeEnAvant(porteur.sensAttaque, porteur, cible)) {
        this.log('MELEE_AVANT', this.possession, `Passe en avant, equipe ${this.possession} - melee adverse`);
        this._accorderMelee(this.possession, porteur);
        return true;
      }
      const distancePasse = distance(porteur, cible);
      // Réussite de passe réaliste : en match réel une passe se complète à
      // ~95-98 %, y compris au large. L'ancien plancher 0.65 faisait rater 35 %
      // des passes longues, ce qui produisait ~19 mêlées/match sur passe ratée
      // (bien trop : cf. repère 8-25 mêlées TOTALES, CLAUDE.md Rôle 6). On
      // relève le plancher et on adoucit la pénalité de distance.
      const probaReussite = Math.max(0.96, Math.min(0.99, 0.995 - distancePasse / 150));
      if (this.rng() < probaReussite) {
        this.stats[this.possession].passes++;
        this.log(jeuLarge ? 'JEU_LARGE' : 'PASSE', this.possession, `${jeuLarge ? 'Jeu au large' : 'Passe'} de l'equipe ${this.possession}`);
        this._lancerPasseVisuelle(porteur, cible);
        this.porteur = cible;
        this._receptionDirecte = false;
        this._neufLibre = false; // le ballon a quitté le 9 : la fenêtre de décision de sortie est close
      } else {
        this.stats[this.possession].knockOns++;
        this.log('PASSE_RATEE', this.possession, `Passe ratee, equipe ${this.possession} - melee adverse`);
        this._accorderMelee(this.possession, cible);
      }
      return true;
    }

    // Sélectionne le type de coup de pied tactique selon la zone (déjà
    // décidé par choisirActionPorteur) puis l'exécute via _tenterCoupDePiedJeu.
    _executerCoupDePiedJeu(porteur) {
      const zone = this._zoneTerrain(porteur);
      let type;
      const r = this.rng();
      if (zone === 'OWN_22') {
        type = r < 0.55 ? 'DEGAGEMENT' : r < 0.85 ? 'TOUCHE' : 'CHANDELLE';
      } else if (zone === 'OWN_HALF') {
        type = r < 0.50 ? 'OCCUPATION' : r < 0.80 ? 'CHANDELLE' : 'TOUCHE';
      } else if (zone === 'OPP_HALF') {
        type = r < 0.60 ? 'CHANDELLE' : 'CHIP';
      } else {
        type = 'CHIP';
      }
      this._tenterCoupDePiedJeu(porteur, type);
    }

    // Lance le ballon en vol pour un coup de pied tactique en jeu courant
    // (dégagement, occupation, chandelle contestable, touche directe ou chip) :
    // même mécanique de vol que le coup d'envoi, résolue dans _tickCoupDePiedJeu.
    _tenterCoupDePiedJeu(porteur, type) {
      const equipe = this.possession;
      this.stats[equipe].kicks++;
      const sens = porteur.sensAttaque;
      let portee, etale;
      if (type === 'DEGAGEMENT') { portee = 35 + this.rng() * 20; etale = true; }
      else if (type === 'OCCUPATION') { portee = 20 + this.rng() * 15; etale = false; }
      else if (type === 'TOUCHE') { portee = 15 + this.rng() * 15; etale = true; }
      else if (type === 'CHANDELLE') { portee = 10 + this.rng() * 10; etale = false; }
      else { portee = 8 + this.rng() * 7; etale = false; } // CHIP

      const cibleX = Math.max(0, Math.min(LONGUEUR, porteur.x + sens * portee));
      let cibleY;
      if (type === 'TOUCHE') {
        cibleY = porteur.y <= LARGEUR / 2 ? -2 : LARGEUR + 2;
      } else if (etale) {
        cibleY = porteur.y <= LARGEUR / 2
          ? Math.max(-2, porteur.y - 10 - this.rng() * 15)
          : Math.min(LARGEUR + 2, porteur.y + 10 + this.rng() * 15);
      } else {
        cibleY = Math.max(3, Math.min(LARGEUR - 3, porteur.y + (this.rng() * 8 - 4)));
      }

      // SORTIE DE CAMP (exit play) : coup de pied depuis son propre 22 m pour se
      // dégager (motif discriminant de l'étude). Ratée si le ballon ne dégage pas
      // au-delà de la ligne des 22 m (reste dans la zone de danger) — hors touche,
      // qui trouve la ligne et dégage toujours.
      if (this._zoneTerrain(porteur) === 'OWN_22') {
        this.stats[equipe].exits++;
        const ligne22 = sens > 0 ? 22 : LONGUEUR - 22;
        if (type !== 'TOUCHE' && (cibleX - ligne22) * sens < 0) {
          this.stats[equipe].exitsRates++;
        }
      }

      this.typeCoupDePiedJeu = type;
      this.equipeCoupDePiedJeu = equipe;
      this.xCoupDePiedJeu = porteur.x;
      this.yCoupDePiedJeu = porteur.y;
      this.cibleCoupDePiedX = cibleX;
      this.cibleCoupDePiedY = cibleY;
      this.log('COUP_DE_PIED', equipe, `Coup de pied (${type.toLowerCase()}) de l'equipe ${equipe}`);
      this.ballonEnVol = true;
      this.ballonVolX = porteur.x;
      this.ballonVolY = porteur.y;
      this.ballonVolHauteur = 0;
      this.phase = 'COUP_DE_PIED_JEU';
      this.timerPhase = 0;
    }

    // Vol d'un coup de pied tactique : sortie en touche (avec l'exception loi
    // 19.2 du 22 m) dès la chute si hors-terrain, sinon le ballon retombe au
    // sol et c'est _tickReceptionCoupDePied qui gère la course jusqu'à lui.
    _tickCoupDePiedJeu(dt) {
      this.timerPhase += dt;
      if (!this.ballonEnVol) { this._tickReceptionCoupDePied(dt); return; }

      const dxVol = this.cibleCoupDePiedX - this.xCoupDePiedJeu;
      const dyVol = this.cibleCoupDePiedY - this.yCoupDePiedJeu;
      const distVol = Math.hypot(dxVol, dyVol);
      const VITESSE_BALLON = 16;
      const duree = Math.max(0.7, Math.min(2.2, distVol / VITESSE_BALLON));
      const t = Math.min(1, this.timerPhase / duree);
      this.ballonVolX = this.xCoupDePiedJeu + dxVol * t;
      this.ballonVolY = this.yCoupDePiedJeu + dyVol * t;
      this.ballonVolHauteur = Math.sin(Math.PI * t);

      const equipeKick = this.equipeCoupDePiedJeu;
      const chasseurs = equipeKick === 'A' ? this.equipeA : this.equipeB;
      const receveurs = equipeKick === 'A' ? this.equipeB : this.equipeA;
      for (const j of [...chasseurs, ...receveurs]) {
        avancer(j, this.ballonVolX - j.x, this.ballonVolY - j.y, dt, vitesseMs(j) * 0.85);
      }

      if (this.timerPhase < duree) return;
      this.ballonEnVol = false;
      this.ballonVolHauteur = 0;
      const cibleX = Math.max(0, Math.min(LONGUEUR, this.cibleCoupDePiedX));
      const cibleY = Math.max(0, Math.min(LARGEUR, this.cibleCoupDePiedY));
      const horsTerrain = this.cibleCoupDePiedY <= 0.01 || this.cibleCoupDePiedY >= LARGEUR - 0.01;

      if (horsTerrain) {
        // Touche : un coup de pied direct en touche depuis son propre 22
        // conserve le lancer pour l'équipe qui a botté (loi 18.10) ; sinon la
        // touche revient à l'équipe adverse, comme pour toute sortie en touche.
        const zoneKickeur = this._zoneTerrain({ x: this.xCoupDePiedJeu, sensAttaque: equipeKick === 'A' ? 1 : -1 });
        const conserveTouche = zoneKickeur === 'OWN_22';
        const equipeQuiSort = conserveTouche ? (equipeKick === 'A' ? 'B' : 'A') : equipeKick;
        this._accorderTouche(equipeQuiSort, { x: cibleX, y: cibleY });
        return;
      }

      // Le ballon touche le sol : il reste loose au point de chute, personne
      // n'est téléporté dessus. _tickReceptionCoupDePied (appelée au prochain
      // tick puisque ballonEnVol vient de passer à false) fait converger les
      // chasseurs/receveurs en courant et ne déclare un porteur qu'une fois
      // l'un d'eux réellement arrivé au contact du ballon.
      this.ballonVolX = cibleX;
      this.ballonVolY = cibleY;
      this._receptionEnAttente = true;
      this.timerReceptionAuSol = 0;
    }

    // Ballon au sol après un coup de pied tactique, en attente de réception :
    // les chasseurs et receveurs continuent de courir vers le point de chute
    // (mêmes vitesses que pendant le vol), et seul un joueur réellement arrivé
    // au contact peut capter le ballon — jamais de téléportation directe sur
    // la cible. Délai de grâce borné (4 s) pour ne jamais laisser le ballon
    // mort au sol indéfiniment si un dégagement profond atterrit loin de tout
    // le monde : on force alors l'arrivée du joueur le plus proche.
    _tickReceptionCoupDePied(dt) {
      this.timerReceptionAuSol += dt;
      const type = this.typeCoupDePiedJeu;
      const equipeKick = this.equipeCoupDePiedJeu;
      const chasseurs = equipeKick === 'A' ? this.equipeA : this.equipeB;
      const receveurs = equipeKick === 'A' ? this.equipeB : this.equipeA;
      const cibleX = this.ballonVolX, cibleY = this.ballonVolY;

      for (const j of [...chasseurs, ...receveurs]) {
        avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.85);
      }

      const RAYON_RECEPTION = 1.3;
      const { joueur: chasseurProche, distance: dChasseur } = joueurLePlusProche(chasseurs, cibleX, cibleY);
      const { joueur: receveurProche, distance: dReceveur } = joueurLePlusProche(receveurs, cibleX, cibleY);
      const chasseurOk = dChasseur <= RAYON_RECEPTION;
      const receveurOk = dReceveur <= RAYON_RECEPTION;
      const delaiEcoule = this.timerReceptionAuSol >= 4;
      if (!chasseurOk && !receveurOk && !delaiEcoule) return;

      this._receptionEnAttente = false;
      // Seul un camp réellement arrivé au contact peut capter le ballon : si
      // un seul camp est à portée, il récupère d'office (pas de tirage au
      // sort, pas de téléportation : le joueur est déjà là où il a couru).
      // Si les deux sont à portée (ou qu'aucun ne l'est après le délai de
      // grâce), le tirage au sort habituel départage, et le gagnant ramasse
      // depuis sa position réelle — jamais en se déplaçant sur la cible.
      let chasseurGagne;
      if (chasseurOk && !receveurOk) {
        chasseurGagne = true;
      } else if (receveurOk && !chasseurOk) {
        chasseurGagne = false;
      } else {
        const contestable = type === 'CHANDELLE' || type === 'CHIP';
        const probaChasseurGagne = contestable
          ? Math.max(0.15, Math.min(0.55, 0.4 - (dChasseur - dReceveur) / 20))
          : Math.max(0.03, Math.min(0.2, 0.08 - (dChasseur - dReceveur) / 30));
        chasseurGagne = this.rng() < probaChasseurGagne;
      }
      const joueur = chasseurGagne ? chasseurProche : receveurProche;
      // Coup de pied REGAGNÉ : l'équipe qui a botté récupère son propre coup de
      // pied (motif discriminant de l'étude).
      if (chasseurGagne) this.stats[equipeKick].kicksRegagnes++;
      this.porteur = joueur;
      this.possession = joueur.team;
      this.ruckPoint = { x: joueur.x, y: joueur.y };

      // Marque (loi 17) : réception propre dans son propre en-deçà des 22 m.
      const sensReceveur = joueur.team === 'A' ? 1 : -1;
      const distPropreLigne = sensReceveur > 0 ? joueur.x : (LONGUEUR - joueur.x);
      if (!chasseurGagne && distPropreLigne <= 22 && this.rng() < 0.35) {
        this._traiterCoupFranc(joueur.team, { x: joueur.x, y: joueur.y });
        return;
      }
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Pause de mi-temps (loi 12) : courte pause avant le coup d'envoi de la 2e
    // période, le temps que l'interface affiche l'événement MI_TEMPS avant
    // qu'il ne soit remplacé par le COUP_ENVOI suivant.
    _tickMiTemps(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 1) {
        this._nouvelleManche(this.equipeKickPremiereMiTemps);
      }
    }

    _tickRuck(dt) {
      this.timerPhase += dt;
      const pt = this.ruckPoint;
      const sensAttaque = this.porteur.sensAttaque;
      // Loi 14/15 : le joueur PLAQUÉ (porteur actuel) est au sol et NE PEUT PAS
      // se relever ni rejouer tant que le ruck n'est pas résolu. On maintient
      // son état « au sol » pendant toute la durée du regroupement (sinon il se
      // relevait après 1,5 s alors que le ruck dure plus longtemps) : il faut
      // qu'un partenaire vienne sécuriser puis sortir le ballon avant qu'il ne
      // reparte. Il se relèvera (auSol redescend) une fois le ballon sorti.
      if (this.porteur && this.porteur.auSol >= 0) {
        // Se relever quand on est à terre prend du temps : on maintient l'état
        // « au sol » à au moins 2 s pendant tout le ruck. Ainsi le plaqué reste
        // au sol pendant le regroupement PUIS met encore ~2 s à se relever et
        // rejoindre le jeu une fois le ballon sorti — il ne « rebondit » jamais
        // sur ses pieds instantanément.
        this.porteur.auSol = Math.max(this.porteur.auSol, 2.0);
        // Le plaqué reste figé à l'endroit où il est tombé pendant tout le ruck
        // (et le temps de se relever ensuite) : sa position est verrouillée par
        // le gel global des joueurs au sol dans tick(). On s'assure juste que sa
        // position de chute est mémorisée (cas d'un ruck formé par une autre
        // voie que le plaquage standard).
        if (this.porteur._solX == null) { this.porteur._solX = this.porteur.x; this.porteur._solY = this.porteur.y; }
      }
      // Marge de repli et délai de grâce : au moment du plaquage, des défenseurs
      // non-contestants se trouvent souvent déjà tout près du point de ruck (ils
      // suivaient le porteur en jeu ouvert). La loi sanctionne le hors-jeu, mais un
      // défenseur a le temps de courir se replier derrière la ligne avant d'être
      // sifflé ; sans ce délai, quasi tout plaquage dégénérait en pénalité.
      // Recul réel observé en match (au-delà du strict minimum légal de la ligne
      // de hors-jeu) : laisse un peu d'air à l'attaque avant le prochain contact.
      // Valeur modérée : combinée à la récupération post-regroupement (cf.
      // _imposerRecuperationRuck), un recul trop large ouvrirait des brèches
      // systématiques côté ligne d'en-but.
      const margeRecul = this.cfg.defense.reculRuck;
      const delaiGrace = 1.5 * this._echelleArret;

      // Joueurs qui convergent vers le point de ruck (le(s) contestant(s)
      // défensif(s) et les soutiens d'attaque) : chacun garde une position
      // décalée en rosette autour du point plutôt que de viser la même
      // coordonnée — deux joueurs ne peuvent pas occuper la même place.
      const placerEnRosette = (j, recul, i) => {
        const cx = pt.x - sensAttaque * recul * (0.5 + (i % 2) * 0.5);
        const cy = pt.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.7);
      };
      // Seuls les 3 attaquants les plus proches du ruck s'y engagent réellement
      // (nettoyage/conservation) ; le reste de l'équipe NE se jette PAS dedans,
      // il s'aligne pour la phase suivante (cf. plus bas). En match réel une
      // poignée de joueurs s'engage au ruck, pas tout le pack.
      const soutiensRuck = new Set(
        [...this.equipeA, ...this.equipeB]
          .filter(j => j.team === this.possession && j !== this.porteur && j.auSol === 0 && j.numero !== 9)
          .sort((a, b) => distance(a, pt) - distance(b, pt))
          .slice(0, 3)
      );
      let iContestants = 0, iSoutien = 0;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        const estContestant = this.contestants.includes(j.numero) && j.team !== this.possession;
        const estSoutienAttaque = soutiensRuck.has(j);
        // Le demi de mêlée court vers la base du ruck quelle que soit sa
        // distance de départ (il suit toujours le jeu en match réel) : c'est
        // lui qui jouera le ballon à la sortie (cf. plus bas), donc il ne
        // doit jamais y être téléporté à la résolution — il doit l'avoir
        // réellement rejoint en courant pendant la phase.
        const estDemiMelee = j.team === this.possession && j.numero === 9 && j.auSol === 0;

        if (estContestant) { placerEnRosette(j, 1, iContestants++); continue; }
        if (estSoutienAttaque) { placerEnRosette(j, -1, iSoutien++); continue; }
        if (estDemiMelee) {
          const cx = pt.x - sensAttaque * 1;
          avancer(j, cx - j.x, pt.y - j.y, dt, vitesseMs(j));
          continue;
        }

        if (j.team !== this.possession && Referee.horsJeuRuck(j, pt, sensAttaque)) {
          // Se replier vers la zone ONSIDE (au-delà du point de ruck, côté de
          // son propre en-but), en tenant son couloir (largeur) plutôt qu'en se
          // massant sur le ballon.
          const cibleX = sensAttaque > 0 ? pt.x + margeRecul : pt.x - margeRecul;
          avancer(j, cibleX - j.x, j.channelY - j.y, dt, vitesseMs(j));
          if (this.timerPhase > delaiGrace && Referee.horsJeuRuck(j, pt, sensAttaque)) {
            // Hors-jeu défensif au ruck : avantage (loi 8). L'équipe en possession
            // joue ; la pénalité n'est sifflée que si elle n'en tire rien (cf.
            // _tickAvantage). On ne stoppe donc PAS le ruck — il se résout
            // normalement et l'avantage est suivi à partir de là.
            this._jouerAvantage('PENALITE', this.possession === 'A' ? 'B' : 'A', this.possession, { x: this.porteur.x, y: this.porteur.y });
          }
          continue;
        }

        // Tous les autres (attaquants non engagés et défenseurs déjà onside) ne
        // courent pas après le ballon : ils tiennent leur couloir et occupent la
        // largeur, prêts pour la phase suivante. L'attaque se replace en retrait
        // du ruck (ligne onside prête à relancer), la défense monte en ligne à
        // plat de son côté.
        if (j.team === this.possession) {
          const cibleX = pt.x - sensAttaque * (8 + Math.abs(j.channelY - pt.y) * 0.12);
          avancer(j, cibleX - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.7);
        } else {
          const cibleX = sensAttaque > 0 ? pt.x + margeRecul : pt.x - margeRecul;
          avancer(j, cibleX - j.x, j.channelY - j.y, dt, vitesseMs(j) * 0.7);
        }
      }
      // Temps sans aucun soutien d'attaque proche du point de ruck (porteur
      // isolé au sol, ou soutien arrivé en retard) : accru ce tick si AUCUN
      // coéquipier n'est venu sécuriser le ballon, jamais réinitialisé tant que
      // le ruck dure — c'est ce cumul qui pèse sur le risque de turnover/pénalité.
      if (iSoutien === 0) this.ruckTempsSansSoutien = (this.ruckTempsSansSoutien || 0) + dt;
      const dureeCible = this.ruckDureeCible || 1.8 * this._echelleArret;
      // Le ballon ne SORT du ruck que lorsqu'un partenaire est venu le sécuriser
      // (au moins un coéquipier debout, hors le plaqué, est arrivé sur le ballon
      // au sol) : c'est lui qui va chercher le ballon puis le redonne (cf. la
      // sortie ci-dessous, par le n°9). Tant que personne n'est arrivé, le
      // ballon reste au sol et on attend (le porteur isolé voit son risque de
      // turnover/pénalité grandir), avec un plafond pour ne jamais bloquer.
      const eqAtt = this.possession === 'A' ? this.equipeA : this.equipeB;
      const soutienArrive = eqAtt.some(j => j !== this.porteur && j.auSol === 0
        && j.sinBin <= 0 && distance(j, pt) < 2.5);
      if (this.timerPhase >= dureeCible) {
        if (!soutienArrive && this.timerPhase < dureeCible + 4 * this._echelleArret) return;
        // Contest au ruck pondéré par les avants réellement engagés autour du
        // point de ruck (même proxy de force que le maul, forceMaul), plutôt
        // qu'un taux de turnover fixe : un paquet adverse plus nombreux ou
        // plus puissant fait gratter le ballon plus souvent, sans jamais
        // rendre l'issue certaine (bruit aléatoire conservé).
        const equipeOriginale = this.possession;
        const equipeAtt = equipeOriginale === 'A' ? this.equipeA : this.equipeB;
        const equipeDef = equipeOriginale === 'A' ? this.equipeB : this.equipeA;
        let forceAtt = 0, forceDef = 0;
        for (const j of equipeAtt) if (j.numero <= 8 && j.auSol === 0 && distance(j, pt) < 8) forceAtt += forceMaul(j);
        for (const j of equipeDef) if (j.numero <= 8 && j.auSol === 0 && distance(j, pt) < 8) forceDef += forceMaul(j);

        // Ruck très disputé des deux côtés et quasiment à l'équilibre : le
        // ballon ne sort franchement pour personne, l'arbitre rend une mêlée
        // plutôt que de trancher arbitrairement un gagnant.
        const ecartForces = Math.abs(forceDef - forceAtt);
        const engagementTotal = forceAtt + forceDef;
        // Ballon injouable au ruck → mêlée : rare en match réel. À 0.10 cette
        // voie produisait ~9 mêlées/match ; abaissée pour rester dans le repère
        // global de 8-25 mêlées TOTALES (cf. CLAUDE.md Rôle 6).
        if (engagementTotal > 80 && ecartForces < 35 && this.rng() < 0.04) {
          this.log('MELEE_RUCK_INJOUABLE', equipeOriginale, `Ballon injouable au ruck, melee pour l'equipe ${equipeOriginale}`);
          this._accorderMeleeA(equipeOriginale, pt);
          return;
        }

        // Porteur isolé (pas de soutien arrivé à temps) : risque accru de
        // turnover ou, si le porteur s'accroche au ballon sans soutien,
        // pénalité directe pour "ballon non rendu" plutôt qu'un turnover propre.
        const bonusIsolement = Math.min(0.12, (this.ruckTempsSansSoutien || 0) * 0.08);
        // Taux de grattage au ruck : en match réel l'équipe qui attaque conserve
        // ~95 % de ses rucks (turnover ~3-5 %). L'ancienne base de 0.12 donnait
        // ~24 % de turnovers, soit ~122 ballons grattés/match (réel ~20) et un
        // jeu en va-et-vient permanent irréaliste. Base abaissée à 0.03 ; le
        // différentiel de force du pack et surtout l'isolement du porteur
        // (bonusIsolement) restent les vrais moteurs d'un grattage — un porteur
        // isolé face à un pack costaud peut toujours se faire gratter souvent.
        // Ballon « sur l'avancée » après un plaquage dominant (cf. _tickPorte) :
        // la défense a gagné le contact, elle conteste avec bien plus de chances
        // de gratter le ballon. Bonus consommé une seule fois (ce ruck).
        const bonusDominant = this.ruckDominant ? 0.035 : 0;
        const probaTurnover = Math.max(0.012, Math.min(0.20, 0.025 + (forceDef - forceAtt) / 1600 + bonusIsolement + bonusDominant));
        const turnover = this.rng() < probaTurnover;
        this.ruckDominant = false;
        if (turnover) {
          this.stats[this.possession].turnoversConcedes++; // équipe qui PERD le ballon
          this.possession = this.possession === 'A' ? 'B' : 'A';
          this.stats[this.possession].turnovers++;           // équipe qui GAGNE le ballon
          this.log('TURNOVER', this.possession, `Ballon gratte au ruck, equipe ${this.possession} recupere`);
        } else if ((this.ruckTempsSansSoutien || 0) > 1.5 * this._echelleArret && this.rng() < 0.12) {
          this.log('PENALITE_RUCK_ISOLE', equipeOriginale, `Porteur isole au ruck, ballon non rendu, penalite pour l'equipe adverse`);
          this._traiterPenalite(equipeOriginale === 'A' ? 'B' : 'A', pt);
          return;
        }
        // Sortie de ruck : c'est le demi de mêlée (n°9) qui joue le ballon au
        // pied du regroupement, comme à la mêlée et à la sortie de maul — pas
        // simplement l'avant le plus proche du point de ruck. Il a couru vers
        // le ruck tout au long de la phase ci-dessus (cf. estDemiMelee) ; on
        // ne force donc plus sa position au point de ruck à la résolution, ce
        // qui le téléportait auparavant depuis là où il se trouvait vraiment.
        // S'il est lui-même au sol (rare, juste plaqué), l'avant le plus
        // proche du point relaie à sa place. La transmission à l'ouvreur
        // n'est plus instantanée : depuis sa position réelle, le 9 décide
        // ensuite normalement (cf. _tickPorte/_tenterPasse) s'il lui passe,
        // exactement comme n'importe quelle autre passe en jeu courant.
        const att = this.attaquants();
        let relayeur;
        if (turnover) {
          // Ballon gratté : c'est le joueur qui l'a arraché (le plus proche du
          // ruck dans la nouvelle équipe, déjà sur place) qui le récupère, là
          // où il est — pas le demi de mêlée adverse resté loin, ce qui
          // téléportait le ballon à l'autre bout du regroupement.
          ({ joueur: relayeur } = joueurLePlusProche(att.filter(j => j.auSol === 0), pt.x, pt.y));
        } else {
          // Sortie propre : le demi de mêlée (n°9) joue le ballon au pied du
          // regroupement (il a couru vers le ruck pendant la phase, cf.
          // estDemiMelee) ; il décide ensuite normalement (passe/jeu au pied).
          const neuf = att.find(j => j.numero === 9 && j.auSol === 0);
          if (neuf) { relayeur = neuf; this._neufLibre = true; this.log('RUCK_SORTIE_9', this.possession, `Sortie de ruck par le 9`); }
          else ({ joueur: relayeur } = joueurLePlusProche(att.filter(j => j.tendance >= 50), pt.x, pt.y));
        }
        // Le joueur qui était plaqué (ancien porteur, au sol) se relève PROMPTEMENT
        // une fois le ballon sorti et le jeu reparti : sinon il restait ~2 s au sol
        // TOUT SEUL pendant que le jeu s'éloignait de 10-15 m — c'est ce qui donnait
        // l'impression d'un joueur « qui tombe sans plaqueur ». Il se relève donc
        // plus vite (auSol ramené à ~1,3 s) au lieu de traîner ~2 s à terre. NB :
        // le relever trop vite (0,7 s) le renvoie tout de suite dans la ligne et
        // gonfle les essais (mesuré : 10/match) ; 1,3 s garde ~7 essais/match tout
        // en supprimant le "joueur au sol tout seul".
        const plaque = this.porteur;
        if (plaque && plaque.auSol > 1.3) plaque.auSol = 1.3;
        this.porteur = relayeur || att.find(j => j.numero === 8) || att[0];
        this.phase = 'PORTE';
        this.timerPhase = 0;
        // Le ballon sort du regroupement en étant JOUÉ depuis la base vers le
        // porteur (le 9 le ramasse au pied du ruck) : on anime ce trajet en
        // passe visible depuis le point de ruck. Sans ça le ballon, affiché au
        // point de ruck pendant toute la phase, "réapparaissait" d'un coup sur
        // le porteur — parfois à 15-20 m quand le 9 n'avait pas fini de rejoindre
        // la base —, exactement la téléportation signalée. Le ballon glisse
        // désormais à vue de la base vers le joueur qui le joue.
        if (this.porteur && distance({ x: pt.x, y: pt.y }, this.porteur) > 1.5) {
          this._lancerPasseVisuelle({ x: pt.x, y: pt.y }, this.porteur);
        }
        this._imposerRecuperationRuck(pt);
      }
    }

    // === Maul (loi 16) : machine à états complète ============================
    // Initialise l'objet maul et bascule la phase moteur sur 'MAUL'. À partir de
    // là, _tickMaul fait avancer la machine à états jusqu'à la sortie du ballon,
    // la mêlée (ballon injouable) ou une pénalité.
    _formerMaul(porteur, defenseur) {
      const poss = this.possession;
      const sens = porteur.sensAttaque;
      this.ruckDominant = false; // un maul n'est pas un ballon de ruck sur l'avancée
      this.maul = {
        etat: ETATS_MAUL.FORMATION,
        equipePossession: poss,
        equipeNonPossession: poss === 'A' ? 'B' : 'A',
        // Loi 8 : si le ballon est injouable, mêlée à l'équipe qui n'avait pas le
        // ballon au début du maul — sauf si le maul a suivi une réception directe
        // d'un coup de pied adverse, auquel cas la mêlée revient au réceptionneur.
        equipeMeleeSiInjouable: this._receptionDirecte ? poss : (poss === 'A' ? 'B' : 'A'),
        x: porteur.x, y: porteur.y, sens,
        timer: 0, timerGlobal: 0, timerUseIt: -1,
        nbArrets: 0, tempsImmobile: 0, tempsMouvement: 0,
        timerHorsJeu: 0, vitesse: 0,
      };
      this._receptionDirecte = false;
      this.ruckPoint = { x: porteur.x, y: porteur.y };
      this.contestants = [defenseur.numero];
      this.phase = 'MAUL';
      this.timerPhase = 0;
      this.stats[poss].mauls++; this.stats[poss].phases++;
      this.log('MAUL', poss, `Maul forme, l'equipe ${poss} garde le ballon debout avec ses soutiens`);
    }

    // Orchestrateur : exécute un pas de la machine à états du maul.
    _tickMaul(dt) {
      const m = this.maul;
      if (!m) { this.phase = 'PORTE'; this.timerPhase = 0; return; }
      m.timer += dt;
      m.timerGlobal += dt;
      this.ruckPoint = { x: m.x, y: m.y };

      // 1) IA des joueurs : liaisons, poussée dans l'axe, repli des non-engagés.
      this._maulGererLiaisons(dt);

      // 2) Arbitrage permanent : hors-jeu, puis fautes techniques/volontaires.
      const horsJeu = this._maulDetecterHorsJeu(dt);
      if (horsJeu) return this._maulSanctionner(horsJeu);
      const faute = this._maulDetecterFautes(dt);
      if (faute) return this._maulSanctionner(faute);

      // 3) Poussée collective + classification avance/arrêt (états « jouables »).
      const etatsPoussee = [ETATS_MAUL.FORMATION, ETATS_MAUL.ACTIF, ETATS_MAUL.AVANCE, ETATS_MAUL.PREMIER_ARRET];
      if (etatsPoussee.includes(m.etat)) {
        const avance = this._maulCalculerPoussee(dt);
        m.x = Math.max(0, Math.min(LONGUEUR, m.x + avance * m.sens));
        // Le ballon est transféré vers l'arrière du maul (côté de son propre camp).
        this.porteur.x = Math.max(0, Math.min(LONGUEUR, m.x - m.sens * 0.8));
        this.porteur.y = m.y;
        const enMouvement = avance >= 0.04;
        if (enMouvement) { m.tempsMouvement += dt; m.tempsImmobile = 0; }
        else { m.tempsImmobile += dt; m.tempsMouvement = 0; }
        // Essai sur maul pénétrant : seulement s'il avance réellement jusqu'à la
        // ligne d'en-but adverse (rare, car la défense le stoppe le plus souvent).
        if (enMouvement && ((m.sens > 0 && m.x >= LONGUEUR - 0.3) || (m.sens < 0 && m.x <= 0.3))) {
          return this._maulEssai();
        }
      }

      // 4) Transitions de la machine à états.
      const poss = m.equipePossession;
      switch (m.etat) {
        case ETATS_MAUL.FORMATION:
          if (m.timer >= 0.5) { m.etat = ETATS_MAUL.ACTIF; m.timer = 0; }
          break;
        case ETATS_MAUL.ACTIF:
        case ETATS_MAUL.AVANCE:
          m.etat = m.tempsMouvement > 0 ? ETATS_MAUL.AVANCE : m.etat;
          if (m.tempsImmobile >= 1.0) {
            if (m.nbArrets === 0) {
              m.nbArrets = 1; m.etat = ETATS_MAUL.PREMIER_ARRET; m.timer = 0;
              this.log('MAUL_ARRET_UN', poss, `Maul arrete une fois : l'arbitre annonce "use it once" a l'equipe ${poss}`);
            } else {
              m.nbArrets = 2; m.etat = ETATS_MAUL.SECOND_ARRET; m.timer = 0;
            }
          }
          break;
        case ETATS_MAUL.PREMIER_ARRET:
          // Une seule relance autorisée : s'il repart clairement, on laisse jouer.
          if (m.tempsMouvement >= 0.4) { m.etat = ETATS_MAUL.AVANCE; }
          else if (m.timer >= 5) {
            m.nbArrets = 2; m.etat = ETATS_MAUL.SECOND_ARRET; m.timer = 0;
          }
          break;
        case ETATS_MAUL.SECOND_ARRET:
          this.log('MAUL_ARRET_DEUX', poss, `Maul arrete une deuxieme fois, equipe ${poss}`);
          m.etat = ETATS_MAUL.USE_IT; m.timerUseIt = 5; m.timer = 0;
          this.log('MAUL_USE_IT', poss, `"Use it" : l'equipe ${poss} doit sortir ou jouer le ballon sous 5 secondes`);
          break;
        case ETATS_MAUL.USE_IT:
          m.timerUseIt -= dt;
          // Le demi de mêlée sort/joue le ballon, avec une probabilité croissante.
          if (this.rng() < 0.6 * dt) return this._maulSortieBallon();
          if (m.timerUseIt <= 0) return this._maulMeleeInjouable();
          break;
      }
    }

    // Gestion des liaisons et de l'IA des joueurs autour du maul.
    _maulGererLiaisons(dt) {
      const m = this.maul;
      const att = m.equipePossession === 'A' ? this.equipeA : this.equipeB;
      const def = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      const liesAtt = this._maulJoueursLies(att);
      const liesDef = this._maulJoueursLies(def);
      // Attaque : avants liés DERRIÈRE le ballon (côté de leur camp), poussent
      // dans l'axe ; le porteur est maintenu au cœur du maul.
      liesAtt.forEach((j, i) => {
        const cx = m.x - m.sens * (0.6 + (i % 3) * 0.5);
        const cy = m.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j));
      });
      // Défense : avants liés DEVANT, debout, contestent la progression.
      liesDef.forEach((j, i) => {
        const cx = m.x + m.sens * (0.6 + (i % 3) * 0.5);
        const cy = m.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j));
      });
      // Le demi de mêlée de l'équipe en possession suit la base du maul tout
      // au long de la phase, comme au ruck (cf. _tickRuck, estDemiMelee) :
      // c'est lui qui jouera le ballon à la sortie (cf. _maulSortieBallon),
      // donc il ne doit jamais y être téléporté à la résolution — il doit
      // l'avoir réellement rejoint en courant pendant le maul.
      const neufAtt = att.find(j => j.numero === 9 && j.auSol === 0 && j !== this.porteur);
      if (neufAtt) {
        const cx9 = m.x - m.sens * 1.5;
        avancer(neufAtt, cx9 - neufAtt.x, m.y - neufAtt.y, dt, vitesseMs(neufAtt));
      }
      // Joueurs non liés : rester en-deçà de leur ligne de hors-jeu (onside).
      const cibleAtt = m.x - m.sens * 3;
      for (const j of att) {
        if (liesAtt.includes(j) || j === this.porteur || j === neufAtt) continue;
        if ((m.sens > 0 && j.x > cibleAtt) || (m.sens < 0 && j.x < cibleAtt)) {
          avancer(j, cibleAtt - j.x, 0, dt, vitesseMs(j) * 0.6);
        }
      }
      const cibleDef = m.x + m.sens * 3;
      for (const j of def) {
        if (liesDef.includes(j)) continue;
        if ((m.sens > 0 && j.x < cibleDef) || (m.sens < 0 && j.x > cibleDef)) {
          avancer(j, cibleDef - j.x, 0, dt, vitesseMs(j) * 0.6);
        }
      }
    }

    // Les (jusqu'à 5) avants d'une équipe les plus proches du maul et debout.
    _maulJoueursLies(equipe) {
      const m = this.maul;
      return equipe
        .filter(j => j.numero <= 8 && j.auSol === 0)
        .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))
        .slice(0, 5);
    }

    // Calcul de la poussée : déséquilibre des forces des deux paquets liés, borné
    // et bruité — un maul ne garantit jamais une avancée nette. Renvoie l'avancée
    // (mètres ce tick, positive = vers la ligne adverse).
    _maulCalculerPoussee(dt) {
      const m = this.maul;
      const att = m.equipePossession === 'A' ? this.equipeA : this.equipeB;
      const def = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      let fAtt = 0, fDef = 0;
      for (const j of att) if (j.auSol === 0 && Math.hypot(j.x - m.x, j.y - m.y) < 4) fAtt += forceMaul(j);
      for (const j of def) if (j.auSol === 0 && Math.hypot(j.x - m.x, j.y - m.y) < 4) fDef += forceMaul(j);
      const net = (fAtt - fDef) / 200 + (this.rng() - 0.5) * 0.5;
      m.vitesse = Math.max(-0.5, Math.min(0.8, net));
      return m.vitesse * dt;
    }

    // Hors-jeu au maul : un défenseur non lié, debout, passé du côté de la sortie
    // du ballon (contournement), au-delà d'un délai de grâce → pénalité.
    _maulDetecterHorsJeu(dt) {
      const m = this.maul;
      if (m.etat === ETATS_MAUL.FORMATION) return null;
      const def = m.equipeNonPossession === 'A' ? this.equipeA : this.equipeB;
      let fautif = false;
      for (const j of def) {
        if (j.auSol > 0) continue;
        if (Math.hypot(j.x - m.x, j.y - m.y) < 4) continue; // lié, donc légal
        if (Referee.horsJeuMaul(j, m, m.sens)) { fautif = true; break; }
      }
      m.timerHorsJeu = fautif ? m.timerHorsJeu + dt : 0;
      if (m.timerHorsJeu >= 1.2) {
        return { type: 'HORS_JEU', equipeFautive: m.equipeNonPossession, message: 'hors-jeu au maul (defenseur qui contourne)', delibere: false };
      }
      return null;
    }

    // Détection probabiliste des fautes de maul, pondérée par la situation. Les
    // taux sont volontairement faibles : la plupart des mauls ne sont pas
    // sanctionnés, comme dans la réalité (sinon l'équilibre du match casse).
    _maulDetecterFautes(dt) {
      const m = this.maul;
      const r = this.rng();
      if (m.etat === ETATS_MAUL.FORMATION) {
        if (r < 0.012 * dt) {
          const eqF = this.rng() < 0.5 ? m.equipePossession : m.equipeNonPossession;
          return { type: 'ENTREE_COTE', equipeFautive: eqF, message: 'entree sur le cote a la formation du maul', delibere: false };
        }
        return null;
      }
      const distLigneDef = m.sens > 0 ? (LONGUEUR - m.x) : m.x;
      const avance = m.etat === ETATS_MAUL.AVANCE;
      // Écroulement volontaire de la défense. Taux faibles en milieu de terrain
      // (la plupart des mauls ne sont pas sanctionnés), mais nettement plus élevés
      // tout près de la ligne d'en-but : c'est l'acte cynique typique pour
      // empêcher un essai sur maul lancé, qui vaut souvent carton/essai de pénalité.
      const tauxEcroulement = avance && distLigneDef < 5 ? 0.04
        : avance && distLigneDef < 18 ? 0.010
          : 0.003;
      let seuil = tauxEcroulement * dt;
      if (r < seuil) {
        return { type: 'ECROULEMENT', equipeFautive: m.equipeNonPossession, message: 'ecroulement volontaire du maul', delibere: true };
      }
      // Autres fautes techniques (joueur non lié qui pousse, saut sur le maul,
      // tirer un adversaire, obstruction, détachement illégal, joueur au sol).
      const techniques = [
        { p: 0.0015, cible: 'def', msg: 'entree sur le cote', del: false, type: 'ENTREE_COTE' },
        { p: 0.0010, cible: 'att', msg: 'obstruction devant le porteur', del: false, type: 'TECHNIQUE' },
        { p: 0.0010, cible: 'def', msg: 'joueur non lie qui pousse', del: false, type: 'TECHNIQUE' },
        { p: 0.0008, cible: 'def', msg: 'joueur qui saute sur le maul', del: true, type: 'TECHNIQUE' },
        { p: 0.0008, cible: 'att', msg: 'porteur qui se detache illegalement', del: false, type: 'TECHNIQUE' },
        { p: 0.0008, cible: 'def', msg: 'joueur au sol qui empeche la sortie', del: false, type: 'TECHNIQUE' },
      ];
      for (const f of techniques) {
        seuil += f.p * dt;
        if (r < seuil) {
          const eqF = f.cible === 'att' ? m.equipePossession : m.equipeNonPossession;
          return { type: f.type, equipeFautive: eqF, message: f.msg, delibere: f.del };
        }
      }
      return null;
    }

    // Décision d'arbitrage sur une faute de maul : essai de pénalité, carton
    // jaune, ou pénalité simple, selon le caractère délibéré, la répétition et la
    // proximité de la ligne d'en-but.
    _maulSanctionner(faute) {
      const m = this.maul;
      const fautive = faute.equipeFautive;
      const benef = fautive === 'A' ? 'B' : 'A';
      const pos = { x: m.x, y: m.y };
      // Infractions de maul répétées par cette équipe sur le match (≥ 3 → carton).
      this._maulPenalitesMatch[fautive] = (this._maulPenalitesMatch[fautive] || 0) + 1;
      const repetee = this._maulPenalitesMatch[fautive] >= 3;
      const sensBenef = benef === 'A' ? 1 : -1;
      const distLigne = sensBenef > 0 ? (LONGUEUR - pos.x) : pos.x;
      const presDeLigne = distLigne <= 5;
      const maulLance = m.etat === ETATS_MAUL.AVANCE;
      // Essai de pénalité : faute délibérée empêchant un maul lancé qui allait
      // probablement marquer.
      const empecheEssai = faute.delibere && faute.type === 'ECROULEMENT' && presDeLigne && maulLance;
      this._finMaul();

      if (faute.delibere && (presDeLigne || repetee)) {
        // Le carton doit coûter un joueur, pas seulement une bannière : 10 min
        // réelles de bin (ramenées à l'échelle du match, cf. _echelleArret),
        // pendant lesquelles l'équipe fautive joue à 14 (attaquants()/
        // defenseurs() l'excluent). Le fautif retenu est le joueur de l'équipe
        // fautive le plus proche du maul, faute d'identifier l'auteur exact.
        const eqFautive = fautive === 'A' ? this.equipeA : this.equipeB;
        const { joueur: fautif } = joueurLePlusProche(eqFautive, pos.x, pos.y);
        fautif.sinBin = 600 * this._echelleArret;
        this.stats[fautive].cartonsJaunes++;
        this.log('CARTON_JAUNE', fautive, `Carton jaune pour l'equipe ${fautive} (n°${fautif.numero}) : ${faute.message} - a 14 pendant ${Math.round(fautif.sinBin)}s`);
      }
      if (empecheEssai) {
        this.score[benef] += 7;
        this.stats[benef].essais++;
        this.log('ESSAI_PENALITE', benef, `Essai de penalite : ${faute.message} sur maul lance, equipe ${benef} +7`);
        this._nouvelleManche(benef);
        return;
      }
      const evt = faute.type === 'ECROULEMENT' ? 'MAUL_PEN_ECROULEMENT'
        : faute.type === 'HORS_JEU' ? 'MAUL_PEN_HORSJEU'
          : faute.type === 'ENTREE_COTE' ? 'MAUL_PEN_ENTREE_COTE'
            : 'MAUL_PEN_TECHNIQUE';
      this.log(evt, fautive, `Penalite maul : ${faute.message} (equipe ${fautive}), penalite pour l'equipe ${benef}`);
      // _traiterPenalite fixe lui-même la possession ET le porteur selon l'option
      // choisie (tir au but, pénalité-touche, ou jeu rapide où le tapeur REJOINT
      // la marque EN COURANT, cf. _lancerJeuRapidePenalite). On ne téléporte donc
      // plus un joueur directement sur la marque ici : ce set x/y était redondant
      // (aussitôt écrasé) et incohérent avec la politique anti-téléportation
      // appliquée partout ailleurs.
      this._traiterPenalite(benef, pos);
    }

    // Sortie du ballon après « use it » : le demi de mêlée (n°9) joue le ballon,
    // le jeu reprend à la main au pied du maul. Il a suivi la base du maul tout
    // au long de la phase (cf. _maulGererLiaisons, neufAtt) : pas de
    // téléportation, il joue depuis sa position réelle. S'il est au sol (rare,
    // juste plaqué), l'avant le plus proche du pied du maul relaie.
    _maulSortieBallon() {
      const m = this.maul;
      const poss = m.equipePossession;
      this.log('MAUL_BALLON_SORTI', poss, `Ballon sorti du maul par le demi de melee, l'equipe ${poss} relance`);
      this._finMaul();
      this.possession = poss;
      const eqMaul = poss === 'A' ? this.equipeA : this.equipeB;
      const neuf = eqMaul.find(j => j.numero === 9 && j.auSol === 0);
      this.porteur = neuf || joueurLePlusProche(eqMaul, m.x, m.y).joueur;
      this._imposerRecuperationRuck({ x: m.x, y: m.y });
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Ballon injouable : mêlée à l'équipe désignée par la loi 19 (défense, ou
    // réceptionneur si le maul a suivi une réception directe).
    _maulMeleeInjouable() {
      const m = this.maul;
      const equipe = m.equipeMeleeSiInjouable;
      const pos = { x: m.x, y: m.y };
      this.log('MAUL_INJOUABLE', m.equipePossession, `Ballon injouable dans le maul, melee pour l'equipe ${equipe}`);
      this._finMaul();
      this._accorderMeleeA(equipe, pos);
    }

    // Essai inscrit par un maul pénétrant qui franchit la ligne adverse.
    _maulEssai() {
      const m = this.maul;
      const poss = m.equipePossession;
      const x = m.sens > 0 ? LONGUEUR : 0;
      this.score[poss] += 5;
      this.stats[poss].essais++;
      this.essaiX = x;
      this.essaiY = m.y;
      this.essaiEquipe = poss;
      this.log('ESSAI', poss, `Essai sur maul penetrant, equipe ${poss} !`);
      this._finMaul();
      this.possession = poss;
      this.porteur = (poss === 'A' ? this.equipeA : this.equipeB)[7];
      this.porteur.x = x;
      this.porteur.y = m.y;
      this.phase = 'ESSAI';
      this.timerPhase = 0;
    }

    // Mêlée accordée à une équipe précise (utilisée par le maul injouable, où le
    // bénéficiaire n'est pas forcément l'adversaire du porteur).
    _accorderMeleeA(equipe, position) {
      this._formerMelee(equipe, position);
    }

    _finMaul() {
      this.maul = null;
      this.contestants = [];
    }

    // === Mêlée (lois 19/20) : machine à états complète ========================
    // Initialise l'objet mêlée et bascule la phase moteur sur 'MELEE'. À partir
    // de là, _tickMelee fait avancer la machine à états (placement -> "Crouch"
    // -> "Bind" -> "Set" -> introduction -> contestation -> sortie de balle),
    // exactement comme _formerMaul/_tickMaul pour le maul.
    _formerMelee(equipeIntroduction, position) {
      this.stats[equipeIntroduction].scrums++;
      this.log('MELEE', equipeIntroduction, `Melee, introduction pour l'equipe ${equipeIntroduction}`);
      const px = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      const py = Math.max(5, Math.min(LARGEUR - 5, position.y));
      this.melee = {
        etat: ETATS_MELEE.FORMATION,
        equipeIntroduction,
        equipeNonIntroduction: equipeIntroduction === 'A' ? 'B' : 'A',
        x: px, y: py, sens: equipeIntroduction === 'A' ? 1 : -1,
        timer: 0, timerGlobal: 0,
        // Conditions de terrain/ballon (pelouse, météo...) propres à cette
        // mêlée, tirées une seule fois : petit facteur de contestation parmi
        // d'autres, jamais déterminant à lui seul.
        conditions: (this.rng() - 0.5) * 0.1,
        rotation: 0, resets: 0,
        diff: 0, vainqueur: null, qualite: null, useItAnnonce: false,
      };
      this.possession = equipeIntroduction;
      const eq = equipeIntroduction === 'A' ? this.equipeA : this.equipeB;
      // Loi 19.13-15 : seul le demi de melee (n°9) introduit le ballon dans
      // le tunnel, jamais l'ouvreur. _neufVersDix (qui privilegie le n°10)
      // sert a la SORTIE de balle d'un regroupement, pas a l'introduction -
      // l'utiliser ici donnait le ballon au n°10 sur 100% des melees.
      this.porteur = eq.find(j => j.numero === 9 && j.sinBin <= 0) || eq[8];
      // Le demi de melee N'EST PLUS teleporte a l'entree du tunnel : il y court
      // depuis sa position courante (cf. _meleePositionnerBallon, via avancer()),
      // exactement comme les avants rejoignent le pack a la course. Avant ce
      // correctif il etait snappe d'un coup (jusqu'a ~27 m de saut visible). Il
      // se place sur le COTE du tunnel (loi 19 : le demi se tient sur le cote
      // pour introduire), pas au centre des avants, et ne glisse le ballon
      // qu'a l'annonce "introduction".
      // Les avants ET les deux demis convergent a la course (cf.
      // _meleePlacerPaquets, _meleePositionnerBallon et le palier "pret" de
      // _tickMelee, case FORMATION) : le joueur voit reellement la melee se
      // reorganiser vers le point plutot que d'apparaitre deja en place. Le
      // delai "Crouch" s'adapte a la distance du plus excentre, plafonne pour
      // ne jamais bloquer le match (cf. _capFormationMelee).
      this.melee.capFormation = this._capFormationMelee(px, py);
      this.ruckPoint = { x: px, y: py };
      this.contestants = [];
      this.phase = 'MELEE';
      this.timerPhase = 0;
    }

    // Estime le temps reel necessaire au pack le plus excentre pour rallier
    // le point de melee en courant (vitesse pack ~0.7x, cf. _meleePlacerPaquets),
    // avec une marge de securite (vitesse basse) et un plafond pour qu'un
    // en-avant survenu tres loin du point de melee ne bloque jamais le match :
    // remplace l'ancien plafond fixe de 3s, qui ne laissait pas le temps aux
    // avants partis de loin de vraiment se regrouper avant l'annonce "Crouch".
    _capFormationMelee(px, py) {
      const avants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
      let pireDistance = 0;
      for (const j of avants) {
        const d = Math.hypot(j.x - px, j.y - py);
        if (d > pireDistance) pireDistance = d;
      }
      // Le demi de melee qui introduit court lui aussi jusqu'a sa marque (le
      // cote du tunnel) : sans ce terme, "Crouch" pourrait etre annonce alors
      // qu'il est encore loin, et l'introduction se ferait sans lui en place.
      if (this.porteur && this.melee) {
        const feed = this._meleeFeedPos(this.melee);
        const d9 = Math.hypot(this.porteur.x - feed.x, this.porteur.y - feed.y);
        if (d9 > pireDistance) pireDistance = d9;
      }
      const vitessePackMin = 2.5; // m/s, vitesse basse d'un pack qui se regroupe
      return Math.min(10, Math.max(3, pireDistance / vitessePackMin));
    }

    // Position de mise en jeu du demi de melee : sur le COTE du tunnel (loi 19),
    // legerement du cote de son equipe, decale vers le centre du terrain pour
    // ne pas etre colle a la ligne de touche. Sert de cible de course (jamais
    // de teleportation) et de reference au palier "pret" de la formation.
    _meleeFeedPos(m) {
      const sideSign = m.y < LARGEUR / 2 ? 1 : -1;
      return { x: m.x - m.sens * 0.5, y: m.y + sideSign * 2.6 };
    }

    _finMelee() {
      this.melee = null;
      this.contestants = [];
    }

    // Orchestrateur : exécute un pas de la machine à états de la mêlée.
    _tickMelee(dt) {
      const m = this.melee;
      if (!m) { this.phase = 'PORTE'; this.timerPhase = 0; return; }
      m.timer += dt;
      m.timerGlobal += dt;
      this.ruckPoint = { x: m.x, y: m.y };

      // Garde-fou anti-blocage : une mêlée ne s'éternise JAMAIS. Une formation
      // lente (avants partis loin) répétée après une reformation pouvait faire
      // durer une mêlée > 34 s. Au-delà de ~24 s, l'arbitre RÉSOUT la mêlée au
      // lieu de la refaire (l'équipe qui introduit garde le ballon), ce qui
      // garantit que TOUTE mêlée se termine quelle que soit la durée du match.
      if (m.timerGlobal > 24 && m.etat !== ETATS_MELEE.SORTIE) {
        m.diff = m.diff || this._meleeFacteurs();
        return this._meleeResoudreContestation();
      }

      // 1) IA des joueurs : packs qui se rapprochent et se lient, lignes
      // arrières en retrait, prêtes pour la sortie de balle.
      this._meleePlacerPaquets(dt);
      this._meleePositionnerBallon(dt);

      // 2) Arbitrage permanent : fautes (poussée prématurée, écroulement,
      // pilier en travers, liaison incorrecte, introduction non droite,
      // ballon bloqué, hors-jeu des lignes arrières...).
      const faute = this._meleeDetecterFautes(dt);
      if (faute) return this._meleeSanctionner(faute);

      const E = ETATS_MELEE;
      const dur = (s) => s * this._echelleArret;
      switch (m.etat) {
        case E.FORMATION: {
          // Les deux packs se placent face à face ; si une équipe est plus
          // forte elle ne pousse pas encore, elle attend l'introduction.
          // L'arbitre n'engage "Crouch" que lorsque les avants sont
          // réellement arrivés (sinon, sur un en-avant loin du point de
          // mêlée, la contestation démarrerait avec une poignée de joueurs
          // encore en train de courir depuis l'autre bout du terrain) ;
          // un plafond évite un blocage si un avant reste très excentré.
          const tousAvants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
          const enPlace = tousAvants.filter(j => Math.hypot(j.x - m.x, j.y - m.y) < 3.5).length;
          // Tous les avants doivent être présents et alignés pour que l'arbitre
          // engage "Crouch" (pas seulement une majorité) : le plafond
          // capFormation reste l'unique garde-fou si un avant ne rejoint
          // jamais exactement le point (sin-bin, blocage en touche...).
          // Le demi de melee doit lui aussi avoir rejoint le cote du tunnel
          // (loi 19) avant l'engagement, sinon l'introduction demarrerait
          // alors qu'il court encore. Le plafond capFormation reste l'unique
          // garde-fou s'il ne peut jamais rallier exactement la marque.
          const feed = this._meleeFeedPos(m);
          const neufEnPlace = !this.porteur
            || Math.hypot(this.porteur.x - feed.x, this.porteur.y - feed.y) < 2;
          const pret = (tousAvants.length === 0 || enPlace >= tousAvants.length) && neufEnPlace;
          if (m.timer >= dur(1.5) && (pret || m.timer >= m.capFormation)) {
            m.etat = E.CROUCH; m.timer = 0;
            this.log('MELEE_CROUCH', m.equipeIntroduction, 'Arbitre : "Crouch" - les premieres lignes se baissent');
          }
          break;
        }
        case E.CROUCH:
          if (m.timer >= dur(1.0)) {
            m.etat = E.BIND; m.timer = 0;
            this.log('MELEE_BIND', m.equipeIntroduction, 'Arbitre : "Bind" - les piliers se lient a l\'adversaire');
          }
          break;
        case E.BIND:
          if (m.timer >= dur(0.8)) {
            m.etat = E.SET; m.timer = 0;
            this.log('MELEE_SET', m.equipeIntroduction, 'Arbitre : "Set" - les deux packs s\'engagent');
          }
          break;
        case E.SET:
          // La poussée ne commence qu'a partir d'ici (apres l'engagement),
          // jamais avant l'introduction.
          if (m.timer >= dur(0.6)) {
            m.etat = E.INTRODUCTION; m.timer = 0;
            this.log('MELEE_INTRODUCTION', m.equipeIntroduction, `Le demi de melee introduit le ballon dans le tunnel pour l'equipe ${m.equipeIntroduction}`);
          }
          break;
        case E.INTRODUCTION:
          // Le talonneur tente de talonner, le ballon progresse vers les
          // pieds du numero 8 : les facteurs de contestation sont calculés
          // une fois, au moment où la lutte pour le ballon démarre vraiment.
          if (m.timer >= dur(1.6)) {
            m.etat = E.CONTESTATION; m.timer = 0;
            m.diff = this._meleeFacteurs();
            this.log('MELEE_CONTESTATION', m.equipeIntroduction, 'Contestation en melee, les deux packs poussent pour le ballon');
          }
          break;
        case E.CONTESTATION:
          this._meleeAvancerPoussee(dt);
          if (Math.abs(m.rotation) > 90) {
            this.log('MELEE_TOURNEE', m.equipeIntroduction, 'La melee tourne de plus de 90 degres, l\'arbitre la fait reformer');
            return this._meleeReset();
          }
          if (m.timer >= dur(3.0)) this._meleeResoudreContestation();
          break;
        case E.SORTIE: {
          // Comme le "use it" du maul : le ballon doit ressortir sous peine
          // d'être sifflé injouable ; probabilité de sortie croissante avec
          // le temps plutôt qu'un instant fixe.
          const seuilUseIt = dur(1.5);
          if (m.timerSortie <= seuilUseIt && !m.useItAnnonce) {
            m.useItAnnonce = true;
            this.log('MELEE_USE_IT', m.vainqueur, 'Arbitre : "Use it !" - le ballon doit sortir de la melee');
          }
          m.timerSortie -= dt;
          if (this.rng() < 0.7 * dt || m.timerSortie <= 0) return this._meleeSortieBallon();
          break;
        }
      }
    }

    // Placement progressif des deux packs (et repli des lignes arrières) :
    // écart large à la formation, qui se resserre jusqu'à l'engagement
    // ("Set"), puis quasi nul une fois les packs liés en contestation.
    _meleePlacerPaquets(dt) {
      const m = this.melee;
      const E = ETATS_MELEE;
      const ecart = m.etat === E.FORMATION ? 1.6
        : m.etat === E.CROUCH ? 1.1
          : m.etat === E.BIND ? 0.7
            : 0.35;
      // Chaque pack se place de son propre cote du point de melee, celui
      // oppose a son sens d'attaque (comme un vrai pack qui pousse vers la
      // ligne adverse) : ce cote depend de l'equipe elle-meme (sensAttaque,
      // fixe pour tout le match), jamais de l'equipe qui introduit. Avant ce
      // correctif le cote dependait de m.sens (= equipe d'introduction), donc
      // les deux packs echangeaient de cote a chaque melee selon qui
      // introduisait - flagrant juste apres l'engagement, quand les deux
      // equipes arrivent encore bien separees de chaque cote du terrain.
      const placer = (equipe) => {
        // sinBin <= 0 : un avant au "bin" ne rejoint pas le pack, son équipe
        // joue la mêlée à 7 (ou moins), comme en match réel.
        const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0);
        avants.forEach((j, i) => {
          const cx = m.x - j.sensAttaque * (ecart + (i % 3) * 0.5);
          const cy = m.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.6;
          avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.7);
        });
        // Les DEUX demis de mêlée (n°9) sont positionnés à part par
        // _meleePositionnerBallon (sur le côté de la base), pas ramenés sur le
        // couloir des arrières : sinon le 9 serait tiré à 9 m en retrait puis
        // devrait être téléporté sur la base à la sortie du ballon.
        const backs = equipe.filter(j => j.numero > 9 && j.sinBin <= 0);
        // Ligne de hors-jeu des trois-quarts (loi 19.31) : 5 m DERRIÈRE le pied
        // le plus reculé de la mêlée (~1,5 m), soit ~6,5 m de la marque ; on
        // place la ligne à 7,5 m (1 m de marge). Les 3/4 ne sont PLUS alignés en
        // un mur plat : ils prennent leur VRAIE forme de mêlée.
        const sA = equipe[0].sensAttaque;
        const ligneHJ = m.x - sA * this.cfg.melee.reculTroisQuarts;
        const estAttaque = equipe[0].team === m.equipeIntroduction;
        // Côté OUVERT = celui qui a le plus de champ depuis la mêlée (vers le
        // large), côté FERMÉ = petit côté vers la touche la plus proche.
        const openSign = m.y < LARGEUR / 2 ? 1 : -1;
        const clampY = (y) => Math.max(2, Math.min(LARGEUR - 2, y));
        const idxLigne = (n) => (n === 10 ? 0 : n === 12 ? 1 : 2); // 10,12,13
        backs.forEach((j) => {
          let cx, cy;
          if (j.numero === 15) {
            // Arrière : couverture PROFONDE au centre (dernier rideau), pas dans
            // la ligne.
            cx = m.x - sA * this.cfg.defense.profondeurArriereMelee; cy = LARGEUR / 2;
          } else if (j.numero === 11 || j.numero === 14) {
            // Ailiers : l'ailier du côté OUVERT s'écarte au large sur la ligne de
            // hors-jeu ; l'autre couvre le petit côté (côté fermé).
            const cotAile = (Math.sign(j.channelY - LARGEUR / 2) || 1);
            cx = ligneHJ;
            cy = cotAile === openSign ? LARGEUR / 2 + openSign * 22 : m.y - openSign * 7;
          } else {
            // 10, 12, 13 : la ligne des trois-quarts, ÉTAGÉE vers le côté ouvert.
            const idx = idxLigne(j.numero);
            cy = m.y + openSign * (7 + idx * 8);
            // Attaque : ligne FANÉE (de plus en plus en retrait vers l'extérieur,
            // pour recevoir en avançant). Défense : ligne À PLAT sur la ligne de
            // hors-jeu, prête à monter à plat.
            cx = estAttaque ? ligneHJ - sA * idx * 2 : ligneHJ;
          }
          // Priorité au REPLI en profondeur : tant que le back est en avant de sa
          // ligne de hors-jeu (loi 19.31), il ferme d'abord la profondeur (on
          // réduit la composante latérale) — sinon une cible large lointaine (aile
          // au grand large) lui fait dépenser sa course en y et il reste
          // transitoirement hors-jeu. Une fois derrière la ligne, il s'écarte.
          const enAvantLigne = (j.x - ligneHJ) * sA > 0.3;
          const dyB = clampY(cy) - j.y;
          avancer(j, cx - j.x, enAvantLigne ? dyB * 0.3 : dyB, dt, vitesseMs(j) * 0.9);
        });
      };
      placer(this.equipeA);
      placer(this.equipeB);
    }

    // Ballon tenu par le demi de mêlée à l'entrée du tunnel pendant la mise
    // en place (formation/Crouch/Bind/Set), glissé dans la mêlée seulement
    // pendant l'état "introduction" : le ballon ne doit pas déjà être au
    // centre des avants avant que l'arbitre ait réellement annoncé son
    // entrée, sinon l'annonce "introduction" arrive après coup, sur un
    // ballon visuellement déjà en place.
    _meleePositionnerBallon(dt) {
      const m = this.melee;
      const E = ETATS_MELEE;
      const sideSign = m.y < LARGEUR / 2 ? 1 : -1;
      const eqIntro = m.equipeIntroduction === 'A' ? this.equipeA : this.equipeB;
      const eqDef = m.equipeIntroduction === 'A' ? this.equipeB : this.equipeA;
      const neufIntro = eqIntro.find(j => j.numero === 9 && j.sinBin <= 0);
      const neufDef = eqDef.find(j => j.numero === 9 && j.sinBin <= 0);
      // Demi qui introduit : à la bouche du tunnel, sur le côté de son équipe.
      // Il se penche vers le tunnel au moment de l'introduction pour y glisser
      // le ballon (jamais au centre des avants). Tout en course (avancer),
      // jamais snappé, et il suit la base si la mêlée avance en poussant.
      if (neufIntro) {
        const cible = m.etat === E.INTRODUCTION
          ? { x: m.x - m.sens * 0.2, y: m.y + sideSign * 1.4 }
          : this._meleeFeedPos(m);
        avancer(neufIntro, cible.x - neufIntro.x, cible.y - neufIntro.y, dt, vitesseMs(neufIntro));
      }
      // Demi adverse : garde la base de la mêlée de l'autre côté du tunnel,
      // prêt à défendre la sortie (et à jouer le ballon s'il est gagné contre
      // l'introduction). Là aussi en course, donc aucune téléportation à la
      // sortie quand c'est lui qui récupère un ballon volé.
      if (neufDef) {
        const cibleDef = { x: m.x + m.sens * 0.5, y: m.y - sideSign * 2.6 };
        avancer(neufDef, cibleDef.x - neufDef.x, cibleDef.y - neufDef.y, dt, vitesseMs(neufDef) * 0.9);
      }
    }

    // Facteurs de contestation (loi 19) combinés en un différentiel unique :
    // force des piliers, puissance du pack, technique du talonneur, cohésion/
    // fatigue (bruit plus fort en fin de match), moral (lié au score), terrain,
    // et avantage structurel de l'introduction (le pack qui introduit gagne
    // l'immense majorité des mêlées en match réel). Positif = avantage à
    // l'équipe qui introduit.
    _meleeFacteurs() {
      const m = this.melee;
      const eqIntro = m.equipeIntroduction === 'A' ? this.equipeA : this.equipeB;
      const eqDef = m.equipeNonIntroduction === 'A' ? this.equipeA : this.equipeB;
      // sinBin <= 0 : une équipe qui joue la mêlée à 7 (pack incomplet, cf.
      // _meleePlacerPaquets) ne doit pas garder la force de poussée d'un
      // pack à 8 dans le calcul de la contestation.
      const avantsIntro = eqIntro.filter(j => j.numero <= 8 && j.sinBin <= 0);
      const avantsDef = eqDef.filter(j => j.numero <= 8 && j.sinBin <= 0);
      const puissanceIntro = avantsIntro.reduce((s, j) => s + forceMaul(j), 0);
      const puissanceDef = avantsDef.reduce((s, j) => s + forceMaul(j), 0);
      const piliersIntro = avantsIntro.filter(j => j.numero === 1 || j.numero === 3).reduce((s, j) => s + forceMaul(j), 0);
      const piliersDef = avantsDef.filter(j => j.numero === 1 || j.numero === 3).reduce((s, j) => s + forceMaul(j), 0);
      const talonneur = eqIntro.find(j => j.numero === 2 && j.sinBin <= 0);
      const techniqueTalonneur = talonneur ? (talonneur.plaquage - 60) * 0.4 : 0;
      const fatigue = (this.dureeMatch === Infinity || this.dureeMatch <= 0) ? 0 : Math.min(1, this.tempsMatch / this.dureeMatch);
      const moral = Math.max(-4, Math.min(4, (this.score[m.equipeIntroduction] - this.score[m.equipeNonIntroduction]) / 5));
      const avantageIntroduction = 18;
      return (puissanceIntro - puissanceDef) + (piliersIntro - piliersDef) * 0.5
        + techniqueTalonneur + moral + avantageIntroduction
        + m.conditions * 40 + (this.rng() - 0.5) * (10 + fatigue * 10);
    }

    // Pendant la contestation : la poussée fait dériver le point de mêlée
    // (gain/perte de terrain) et accumule une rotation (mêlée qui tourne),
    // jamais de façon déterministe — un déséquilibre net augmente juste la
    // probabilité, sans jamais la garantir.
    _meleeAvancerPoussee(dt) {
      const m = this.melee;
      const vitessePoussee = Math.max(-0.5, Math.min(0.7, m.diff / 80));
      m.x = Math.max(0, Math.min(LONGUEUR, m.x + vitessePoussee * m.sens * dt));
      m.rotation += (-m.diff / 20 + (this.rng() - 0.5) * 12) * dt;
    }

    // Détection des fautes probables de mêlée, gravité et camp fautif selon
    // l'état courant — mêmes ordres de grandeur que le maul (la plupart des
    // mêlées ne sont pas sanctionnées, sinon l'équilibre du match casse).
    _meleeDetecterFautes(dt) {
      const m = this.melee;
      const E = ETATS_MELEE;
      const r = this.rng();
      let seuil = 0;
      if (m.etat === E.CROUCH || m.etat === E.BIND || m.etat === E.SET) {
        seuil += 0.006 * dt;
        if (r < seuil) {
          const eqF = this.rng() < 0.5 ? m.equipeIntroduction : m.equipeNonIntroduction;
          return { type: 'POUSSEE_AVANT', equipeFautive: eqF, gravite: 'COUP_FRANC', message: "poussee avant l'introduction du ballon", delibere: false };
        }
        seuil += 0.004 * dt;
        if (r < seuil) {
          const eqF = this.rng() < 0.5 ? m.equipeIntroduction : m.equipeNonIntroduction;
          return { type: 'LIAISON', equipeFautive: eqF, gravite: 'COUP_FRANC', message: 'liaison incorrecte en premiere ligne', delibere: false };
        }
      }
      if (m.etat === E.INTRODUCTION) {
        seuil += 0.05 * dt;
        if (r < seuil) {
          return { type: 'INTRODUCTION_NON_DROITE', equipeFautive: m.equipeIntroduction, gravite: 'COUP_FRANC', message: 'introduction non droite dans le tunnel', delibere: false };
        }
      }
      if (m.etat === E.SET || m.etat === E.CONTESTATION) {
        const distLigneDef = m.sens > 0 ? (LONGUEUR - m.x) : m.x;
        // Le camp en difficulté (qui recule dans le duel de poussée) est le
        // plus exposé à l'écroulement volontaire et au pilier en travers.
        const campEnDifficulte = m.diff >= 0 ? m.equipeNonIntroduction : m.equipeIntroduction;
        seuil += distLigneDef < 5 ? 0.05 * dt : 0.008 * dt;
        if (r < seuil) {
          return { type: 'ECROULEMENT', equipeFautive: campEnDifficulte, gravite: 'PENALITE', message: 'ecroulement volontaire de la melee', delibere: true };
        }
        seuil += 0.0025 * dt;
        if (r < seuil) {
          return { type: 'PILIER_TRAVERS', equipeFautive: campEnDifficulte, gravite: 'PENALITE', message: 'pilier qui pousse en travers (boring in)', delibere: false };
        }
        seuil += 0.0025 * dt;
        if (r < seuil) {
          const eqF = this.rng() < 0.5 ? m.equipeIntroduction : m.equipeNonIntroduction;
          return { type: 'RELEVE', equipeFautive: eqF, gravite: 'COUP_FRANC', message: 'joueur de premiere ligne qui se releve', delibere: false };
        }
        seuil += 0.002 * dt;
        if (r < seuil) {
          return { type: 'BALLON_BLOQUE', equipeFautive: m.equipeIntroduction, gravite: 'RESET', message: 'ballon bloque, ne ressort pas du pied du numero 8', delibere: false };
        }
      }
      // Hors-jeu des lignes arrières (loi 19.31) : les trois-quarts défenseurs
      // (n°10-15) doivent rester 5 m DERRIÈRE le pied le plus reculé de la
      // mêlée, de LEUR côté, jusqu'à la sortie du ballon. La mêlée étant
      // profonde d'environ 1,5 m depuis la marque (m.x), la ligne réglementaire
      // est à ~6,5 m de la marque (5 m + 1,5 m), et non 5 m du centre comme
      // auparavant : on mesurait alors le hors-jeu depuis la marque, pas depuis
      // le dernier pied, ce qui laissait un défenseur s'avancer ~1,5 m trop
      // près. On ne contrôle qu'à partir de l'introduction (pas pendant SET)
      // pour laisser aux arrières le temps de rejoindre leur ligne.
      if (m.etat === E.INTRODUCTION || m.etat === E.CONTESTATION || m.etat === E.SORTIE) {
        const def = m.equipeNonIntroduction === 'A' ? this.equipeA : this.equipeB;
        const margeBacks = 6.5, delaiGrace = 2.5;
        for (const j of def) {
          // Avants (dans la mêlée) ET demi de mêlée exclus : le demi défenseur
          // a sa propre ligne (rester derrière le ballon, de son côté), pas la
          // ligne des 5 m qui ne vaut que pour les autres trois-quarts.
          if (j.numero <= 9) continue;
          // L'équipe défenseure se tient du côté +m.sens de la mêlée (m.sens =
          // sens d'attaque de l'équipe qui introduit). Sa ligne de hors-jeu est
          // donc ~6,5 m derrière la marque DANS CE SENS. Un défenseur est
          // hors-jeu s'il est à moins de 6,5 m (5 m + profondeur de mêlée)
          // derrière le point de mêlée de son côté.
          // (Avant correctif : la limite était calculée du mauvais côté, si
          // bien que les arrières défenseurs — désormais correctement placés de
          // leur côté — étaient sifflés hors-jeu sur 100 % des mêlées, qui ne
          // ressortaient donc jamais proprement.)
          const reculBack = (j.x - m.x) * m.sens;
          if (reculBack < margeBacks && m.timerGlobal > delaiGrace) {
            return { type: 'HORS_JEU_BACKS', equipeFautive: m.equipeNonIntroduction, gravite: 'PENALITE', message: 'hors-jeu des lignes arrieres a la melee', delibere: false };
          }
        }
      }
      return null;
    }

    // Reformation sans faute (mêlée tournée, ballon bloqué) : même équipe
    // réintroduit, sans changement de possession ni sanction. Bornée pour
    // éviter une boucle en cas de série de reformations improbable.
    _meleeReset() {
      const m = this.melee;
      m.resets = (m.resets || 0) + 1;
      m.rotation = 0;
      m.timer = 0;
      m.etat = m.resets > 2 ? ETATS_MELEE.SET : ETATS_MELEE.FORMATION;
    }

    // Décision d'arbitrage sur une faute de mêlée : reformation simple, coup
    // franc, pénalité (avec essai de pénalité/carton si délibérée, proche de
    // la ligne ou répétée), même logique que _maulSanctionner.
    _meleeSanctionner(faute) {
      const m = this.melee;
      if (faute.gravite === 'RESET') {
        this.log('MELEE_RESET', m.equipeIntroduction, `Melee a refaire : ${faute.message}`);
        return this._meleeReset();
      }
      const fautive = faute.equipeFautive;
      const benef = fautive === 'A' ? 'B' : 'A';
      const pos = { x: m.x, y: m.y };
      this._meleePenalitesMatch[fautive] = (this._meleePenalitesMatch[fautive] || 0) + 1;
      const repetee = this._meleePenalitesMatch[fautive] >= 3;
      const sensBenef = benef === 'A' ? 1 : -1;
      const distLigne = sensBenef > 0 ? (LONGUEUR - pos.x) : pos.x;
      const presDeLigne = distLigne <= 5;
      const empecheEssai = faute.delibere && faute.type === 'ECROULEMENT' && presDeLigne;
      this._finMelee();

      if (faute.delibere && (presDeLigne || repetee)) {
        const eqFautive = fautive === 'A' ? this.equipeA : this.equipeB;
        const { joueur: fautif } = joueurLePlusProche(eqFautive, pos.x, pos.y);
        fautif.sinBin = 600 * this._echelleArret;
        this.stats[fautive].cartonsJaunes++;
        this.log('CARTON_JAUNE', fautive, `Carton jaune pour l'equipe ${fautive} (n°${fautif.numero}) : ${faute.message} - a 14 pendant ${Math.round(fautif.sinBin)}s`);
      }
      if (empecheEssai) {
        this.score[benef] += 7;
        this.stats[benef].essais++;
        this.log('ESSAI_PENALITE', benef, `Essai de penalite : ${faute.message} en melee, equipe ${benef} +7`);
        this._nouvelleManche(benef);
        return;
      }
      const evt = faute.type === 'ECROULEMENT' ? 'MELEE_PEN_ECROULEMENT'
        : faute.type === 'PILIER_TRAVERS' ? 'MELEE_PEN_TRAVERS'
          : faute.type === 'HORS_JEU_BACKS' ? 'MELEE_PEN_HORSJEU'
            : 'MELEE_PEN_TECHNIQUE';
      // Le ballon de pénalité/coup franc de mêlée est joué par le demi de mêlée,
      // déjà présent à la base (cf. _meleePositionnerBallon), et non par un avant
      // "le plus proche" téléporté sur la marque (~5-6 m de saut visible). Repli
      // sur le joueur disponible le plus proche si le 9 est indisponible.
      const eqB = benef === 'A' ? this.equipeA : this.equipeB;
      const neufB = eqB.find(j => j.numero === 9 && j.sinBin <= 0)
        || joueurLePlusProche(eqB.filter(j => j.sinBin <= 0), pos.x, pos.y).joueur;
      this.possession = benef;
      this.porteur = neufB;
      if (faute.gravite === 'COUP_FRANC') {
        this.log(evt, fautive, `Coup franc melee : ${faute.message} (equipe ${fautive}), coup franc pour l'equipe ${benef}`);
        this._traiterCoupFranc(benef, pos, neufB);
        return;
      }
      this.log(evt, fautive, `Penalite melee : ${faute.message} (equipe ${fautive}), penalite pour l'equipe ${benef}`);
      this._traiterPenalite(benef, pos);
    }

    // Résolution de la contestation : détermine qui ressort avec le ballon et
    // dans quelles conditions (propre, sous pression, poussée dominante, ou
    // volé contre l'introduction — rare mais possible), à partir du
    // différentiel de force calculé à l'entrée en contestation.
    _meleeResoudreContestation() {
      const m = this.melee;
      const intro = m.equipeIntroduction, nonIntro = m.equipeNonIntroduction;
      const probaVol = Math.max(0.02, Math.min(0.35, 0.05 - m.diff / 300));
      if (this.rng() < probaVol) {
        m.vainqueur = nonIntro; m.qualite = 'VOLE';
        this.stats[nonIntro].turnovers++;
        this.stats[intro].turnoversConcedes++;
        this.log('TURNOVER', nonIntro, `Ballon vole en melee contre l'introduction, l'equipe ${nonIntro} recupere`);
      } else if (m.diff > 25) {
        m.vainqueur = intro; m.qualite = 'DOMINANT';
        this.log('MELEE_DOMINEE', intro, `Poussee dominante en melee, l'equipe ${intro} fait reculer le pack adverse`);
      } else if (m.diff > 8) {
        m.vainqueur = intro; m.qualite = 'PROPRE';
        this.log('MELEE_GAGNEE', intro, `Ballon gagne proprement par l'equipe ${intro} en melee`);
      } else {
        m.vainqueur = intro; m.qualite = 'PRESSION';
        this.log('MELEE_PRESSION', intro, `Ballon gagne sous pression par l'equipe ${intro} en melee`);
      }
      this.stats[m.vainqueur].scrumsGagnes++;
      const eqVainqueur = m.vainqueur === 'A' ? this.equipeA : this.equipeB;
      // Pendant l'état SORTIE le n°8 contrôle le ballon au pied de la mêlée :
      // il est déjà à l'arrière de son pack (donc sur la base), aucun snap —
      // sinon il "sautait" sur la base depuis sa position de poussée.
      this.porteur = eqVainqueur.find(j => j.numero === 8) || eqVainqueur[7];
      m.etat = ETATS_MELEE.SORTIE;
      m.timer = 0;
      m.timerSortie = 4 * this._echelleArret;
      m.useItAnnonce = false;
    }

    // Sortie de balle : le demi de mêlée sort le ballon vers l'ouvreur dans la
    // grande majorité des cas (qui décide ensuite passe/jeu au large/coup de
    // pied via l'IA de jeu courant), ou le numéro 8 ramasse et part au près
    // (pick-and-go), plus probable après une poussée dominante.
    _meleeSortieBallon() {
      const m = this.melee;
      const poss = m.vainqueur;
      const eq = poss === 'A' ? this.equipeA : this.equipeB;
      const huit = eq.find(j => j.numero === 8);
      const pt = { x: m.x, y: m.y };
      const pickAndGo = huit && huit.auSol === 0 && this.rng() < (m.qualite === 'DOMINANT' ? this.cfg.melee.pickAndGoHuit.dominant : this.cfg.melee.pickAndGoHuit.normal);
      this._finMelee();
      this.possession = poss;
      if (pickAndGo) {
        // Le n°8 ramasse au pied de la mêlée : déjà à l'arrière du pack (sur la
        // base), aucun snap — il part au contact depuis là.
        this.porteur = huit;
        this.log('MELEE_PICK_AND_GO', poss, `Le numero 8 ramasse au pied de la melee et part au contact pour l'equipe ${poss}`);
      } else {
        // Loi 19 : le ballon gagné sort par l'ARRIÈRE de la mêlée, aux pieds du
        // n°8 (dernier joueur du pack, sur la base). C'est donc le 8 qui le
        // RÉCUPÈRE — « la balle sort sur le 8 » — puis le DÉLIVRE au demi de mêlée
        // (passe courte visible depuis la base). Le 9 ne cueille jamais le ballon
        // DANS la mêlée : il le reçoit du 8. La passe vers l'ouvreur se fait
        // ensuite naturellement en jeu courant (_tickPorte).
        const neuf = eq.find(j => j.numero === 9 && j.sinBin <= 0);
        this.porteur = huit || eq[7]; // le ballon sort SUR le n°8
        this.log('MELEE_BALLON_SORTI', poss, `Le n°8 recupere le ballon a la base de la melee pour l'equipe ${poss}`);
        if (neuf && neuf !== this.porteur) {
          // Le 8 délivre le ballon au demi de mêlée (passe courte depuis la base).
          this._lancerPasseVisuelle(this.porteur, neuf);
          this.porteur = neuf;
        }
      }
      // Sortie propre par le 9 : on peut enchaîner une COMBINAISON scriptée
      // (playbook, cf. cfg.combinaisons.melee) — ex. 9->10->12 croisé. Sinon jeu
      // libre normal. (Pas de combinaison sur un pick-and-go du n°8 : il part au
      // contact.)
      if (!pickAndGo) this._lancerCombinaison('melee');
      // Sortie de mêlée par le 9 SANS combinaison scriptée : il est libre et
      // décide lui-même (cf. choisirActionPorteur, branche _neufLibre).
      if (!pickAndGo && !this.combinaison && this.porteur && this.porteur.numero === 9) this._neufLibre = true;
      this._imposerRecuperationRuck(pt);
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // --- Combinaisons scriptées (playbook, cf. cfg.combinaisons) --------------
    // Tire une combinaison pondérée pour le type donné ('melee' | 'touche'),
    // ou null (jeu libre) selon la probabilité configurée.
    _choisirCombinaison(type) {
      const cc = this.cfg.combinaisons;
      if (!cc || this.rng() >= (cc.proba || 0)) return null;
      // Playbook SPÉCIFIQUE à l'équipe en possession (cc.A / cc.B) s'il existe,
      // sinon la liste partagée (cc.melee / cc.touche) : chaque équipe peut avoir
      // son propre répertoire de combinaisons.
      const specifique = cc[this.possession] && cc[this.possession][type];
      let liste = (specifique && specifique.length) ? specifique : cc[type];
      if (!liste || !liste.length) return null;
      // Filtre par ZONE de terrain si la combinaison en impose une (une chandelle
      // ou un cross-kick ne se joue que dans les 22 m adverses, etc.).
      const zone = this.porteur ? this._zoneTerrain(this.porteur) : null;
      liste = liste.filter((c) => !c.zone || (zone && c.zone.indexOf(zone) >= 0));
      if (!liste.length) return null;
      const total = liste.reduce((s, c) => s + (c.poids || 1), 0);
      let r = this.rng() * total;
      for (const c of liste) { r -= (c.poids || 1); if (r <= 0) return c; }
      return liste[liste.length - 1];
    }

    // Arme une combinaison : le porteur courant doit être le "de" de la 1re étape
    // (le 9 qui vient de récupérer). Rien ne se passe si aucune combinaison n'est
    // tirée (jeu libre).
    _lancerCombinaison(type) {
      const combo = this._choisirCombinaison(type);
      if (!combo || !combo.etapes || !combo.etapes.length) return;
      this.combinaison = { etapes: combo.etapes, i: 0, timer: 0, delai: 0.55 };
    }

    // Déroule pas à pas la combinaison en cours (passes ciblées + lignes de
    // course). Renvoie true si une passe a été jouée CE tick (le tick de jeu
    // courant s'arrête là). Une passe qui serait en avant, ou vers un joueur
    // indisponible, ou un porteur qui n'est plus le "de" attendu (plaquage,
    // interruption), stoppe la combinaison et rend la main au jeu libre.
    _tickCombinaison(dt) {
      const c = this.combinaison;
      if (!c) return false;
      const etape = c.etapes[c.i];
      if (!this.porteur || this.porteur.numero !== etape.de || this.porteur.team !== this.possession) {
        this.combinaison = null; return false;
      }
      c.timer += dt;
      if (c.timer < c.delai) return false; // le porteur court en attendant l'action
      c.timer = 0;

      // Action COUP DE PIED programmé (ex. cross-kick / chandelle sur combinaison
      // de zone) : le joueur "de" botte, ce qui termine la combinaison.
      if (etape.action === 'pied') {
        const TYPES = ['DEGAGEMENT', 'OCCUPATION', 'TOUCHE', 'CHANDELLE', 'CHIP'];
        const type = TYPES.indexOf((etape.type || '').toUpperCase()) >= 0 ? etape.type.toUpperCase() : 'CHANDELLE';
        this.log('COMBINAISON', this.possession, `Combinaison : coup de pied (${type.toLowerCase()}) du n°${etape.de}`);
        this.combinaison = null;
        this._tenterCoupDePiedJeu(this.porteur, type);
        return true;
      }

      // Action PASSE (défaut).
      const eq = this.possession === 'A' ? this.equipeA : this.equipeB;
      const cible = eq.find(j => j.numero === etape.vers && j.sinBin <= 0 && j.auSol === 0);
      if (!cible || Referee.passeEnAvant(this.porteur.sensAttaque, this.porteur, cible)) {
        this.combinaison = null; return false; // option scriptée impossible -> jeu libre
      }
      const passeur = this.porteur;
      this.stats[this.possession].passesTentees++;
      this.stats[this.possession].passes++;
      this._lancerPasseVisuelle(passeur, cible);
      this.porteur = cible;
      this._receptionDirecte = false;
      this.log('COMBINAISON', this.possession, `Combinaison : passe du n°${etape.de} au n°${etape.vers}${etape.ligne ? ' (' + etape.ligne + ')' : ''}`);
      // Ligne de course du RECEVEUR (croisé ou boucle) : dans les deux cas il
      // CHANGE de direction un court instant.
      if (etape.ligne === 'croise' || etape.ligne === 'boucle') {
        // croisé : le receveur repique vers le côté du passeur (derrière lui) ;
        // boucle : il part à l'extérieur (le passeur boucle dans son dos).
        const versPasseur = Math.sign(passeur.y - cible.y) || 1;
        cible._croiseTimer = 1.2 * this._echelleArret + 0.6;
        cible._croiseDir = etape.ligne === 'croise' ? versPasseur : -versPasseur;
      }
      c.i++;
      if (c.i >= c.etapes.length) this.combinaison = null; // combinaison terminée
      return true;
    }

    // Touche (loi 18) : véritable contest au saut, pondéré par la force des
    // avants engagés (même proxy que ruck/maul/mêlée) — le lanceur ne conserve
    // pas systématiquement son propre lancer. Une touche gagnée dans les 22 m
    // adverses est la voie PRINCIPALE de formation d'un maul (catch-and-drive),
    // pas une mêlée aléatoire en plein champ.
    // Alignement progressif des deux lignes de touche pendant l'attente (loi 18) :
    // les avants des deux équipes convergent en courant vers le couloir
    // perpendiculaire à la ligne de touche, espacés le long de la touche (axe y),
    // de part et d'autre d'un mince couloir central où passe le ballon. Le demi
    // de mêlée de chaque équipe se tient en retrait, prêt à jouer un ballon
    // gagné — c'est lui qui récupère un lancer volé (cf. _tickTouche), donc il
    // doit avoir réellement rejoint cette position en courant, jamais y être
    // téléporté à la résolution.
    _touchePlacerLignes(dt) {
      const pt = this.ruckPoint;
      // yTouche = bord du terrain où se tient le lanceur (loi 18.22). La ligne
      // des sauteurs commence elle à 5 m de la touche (loi 18 : l'alignement est
      // entre la ligne des 5 m et celle des 15 m), d'où un vrai couloir entre le
      // lanceur et le premier sauteur, au lieu d'un lanceur noyé dans la ligne.
      const yTouche = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;
      const versCentre = yTouche <= LARGEUR / 2 ? 1 : -1;
      const yLigne5 = yTouche + versCentre * 5;
      // Le lanceur rejoint la marque de touche (sur le bord) en courant, comme
      // les avants ci-dessous — avant ce correctif, il y était téléporté
      // directement dès l'octroi de la touche (cf. _accorderTouche), ce qui
      // pouvait le faire apparaître instantanément à 30-50 m de sa position.
      if (this.porteur) {
        const xLanceur = this.toucheLanceurX != null ? this.toucheLanceurX : pt.x;
        avancer(this.porteur, xLanceur - this.porteur.x, yTouche - this.porteur.y, dt, vitesseMs(this.porteur) * 0.9);
      }
      const placer = (equipe, decalX) => {
        const sens = equipe[0].sensAttaque;
        // Sauteurs alignés perpendiculairement à la touche, de la ligne des 5 m
        // vers l'intérieur, espacés de 1,4 m (zone 5-15 m, loi 18.10). Avec
        // jusqu'à 7 avants dans l'alignement (n°1,3-8, le n°2 lance), un
        // espacement de 1,7 m poussait le dernier sauteur jusqu'à ~15,7-17,4 m,
        // donc AU-DELÀ de la ligne des 15 m (coup franc en jeu réel). À 1,4 m,
        // 7 sauteurs depuis 5 m s'étalent jusqu'à ~13,4 m, sous le plafond légal.
        // Les deux équipes forment deux colonnes séparées par le couloir d'un
        // mètre (decalX), conformément à la loi.
        const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0 && j !== this.porteur);
        avants.forEach((j, i) => {
          const cx = pt.x + decalX;
          const cy = yLigne5 + versCentre * (i * this.cfg.touche.espacementSauteurs);
          avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.8);
        });
        // Position du n°9 selon que SON équipe lance ou non (le placement diffère
        // dans la loi) :
        //  - Équipe qui LANCE → RECEVEUR (loi 18.16) : nettement DERRIÈRE son
        //    propre alignement, ~4 m en retrait, à au moins 2 m de ses
        //    coéquipiers. Il NE capte PAS le lancer (c'est le sauteur) ; il reçoit
        //    le ballon redescendu par le sauteur dans un DEUXIÈME temps.
        //  - Équipe qui NE LANCE PAS → GARDIEN du couloir avant (loi 18.15) : un
        //    joueur ENTRE la ligne de touche et la ligne des 5 m, à ~2 m de la
        //    marque (côté de son camp) et ~2 m de la ligne des 5 m. Auparavant ce
        //    9 défenseur était lui aussi planté en receveur à 10 m, si bien que
        //    personne ne tenait le couloir des 5 m (loi 18.15 jamais respectée).
        const estLanceur = equipe[0].team === this.possession;
        const neuf = equipe.find(j => j.numero === 9 && j.auSol === 0 && j !== this.porteur);
        if (neuf) {
          let cx9, cy9;
          if (estLanceur) {
            cx9 = pt.x - sens * this.cfg.touche.reculReceveur;
            cy9 = yLigne5 + versCentre * 5;
          } else {
            cx9 = pt.x + Math.sign(decalX) * 2;
            cy9 = yTouche + versCentre * 3;
          }
          avancer(neuf, cx9 - neuf.x, cy9 - neuf.y, dt, vitesseMs(neuf) * 0.8);
        }
        // Loi 18 : les joueurs NON participants à la touche (les trois-quarts,
        // n°10-15) doivent se replacer DERRIÈRE leur ligne de hors-jeu, à 10 m
        // de la ligne de touche, et non rester là où le ballon est sorti. Avant
        // ce correctif ils n'étaient jamais repositionnés pendant la touche : ils
        // restaient figés n'importe où sur le terrain. Ils s'alignent désormais
        // en courant (avancer, jamais de téléportation) sur cette ligne des 10 m,
        // côté de leur propre camp (sens), espacés sur la largeur du côté ouvert,
        // prêts à lancer ou défendre l'attaque issue de la touche.
        const backs = equipe.filter(j => j.numero >= 10 && j.sinBin <= 0 && j !== this.porteur);
        const xBacks = pt.x - sens * this.cfg.touche.offsideNonParticipants;
        backs.forEach((j, k) => {
          const cyB = yLigne5 + versCentre * (8 + k * 6);
          avancer(j, xBacks - j.x, cyB - j.y, dt, vitesseMs(j) * 0.85);
        });
      };
      placer(this.equipeA, -0.5);
      placer(this.equipeB, 0.5);
    }

    _tickTouche(dt) {
      this.timerPhase += dt;
      // Si le ballon est en train de voler du lanceur vers le sauteur, on
      // anime ce vol jusqu'à la réception (cf. _tickToucheLancer) plutôt que
      // de résoudre la touche dans le même tick.
      if (this.toucheLancer) return this._tickToucheLancer(dt);
      this._touchePlacerLignes(dt);
      // Alignement, lancer et contestation au saut pris dans leur ensemble :
      // une touche réelle prend bien plus que 2 s entre l'arrêt de jeu et la
      // remise en mouvement du ballon (~10-15 s en match réel). Compressée
      // comme les autres temps d'arrêt sur un format démo court (cf.
      // _echelleArret) pour laisser plus de place au jeu courant.
      const dureeMin = 12 * this._echelleArret;
      if (this.timerPhase < dureeMin) return;
      // Comme à la mêlée (cf. _tickMelee, case FORMATION) : l'arbitre n'autorise
      // le lancer que lorsque les avants des deux équipes sont réellement
      // alignés dans le couloir de touche, pas seulement après un délai fixe ;
      // le plafond toucheCapFormation évite un blocage si un avant reste très
      // excentré (cf. _capFormationTouche).
      const pt = this.ruckPoint;
      const tousAvants = this.equipeA.concat(this.equipeB).filter(j => j.numero <= 8 && j.sinBin <= 0);
      // Lancer autorisé seulement quand chaque avant est À LA FOIS aligné en
      // profondeur (x proche de la marque) ET dans la bande légale des 5-15 m
      // depuis la touche (loi 18.10). Sans la contrainte sur y, un avant encore
      // en course vers l'alignement (mesuré jusqu'à ~16,7 m sur la largeur)
      // pouvait se retrouver AU-DELÀ de la ligne des 15 m à l'instant où le
      // ballon partait : le lancer attend désormais qu'il soit rentré dans la
      // zone légale.
      const yTouche = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;
      const versTouche = yTouche <= LARGEUR / 2 ? 1 : -1;
      const dansBande = (j) => { const d = (j.y - yTouche) * versTouche; return d >= 4 && d <= 15; };
      const enPlace = tousAvants.filter(j => Math.abs(j.x - pt.x) < 2 && dansBande(j)).length;
      // Le lanceur lui-même doit avoir rejoint la marque de touche (loi 18.22)
      // avant que le lancer ne puisse être joué : sinon il pourrait "lancer"
      // alors qu'il court toujours vers la touche.
      const xLanceur = this.toucheLanceurX != null ? this.toucheLanceurX : pt.x;
      const yLanceur = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;
      const lanceurEnPlace = !this.porteur || distance(this.porteur, { x: xLanceur, y: yLanceur }) < 2;
      const pret = (tousAvants.length === 0 || enPlace >= tousAvants.length) && lanceurEnPlace;
      if (!pret && this.timerPhase < (this.toucheCapFormation || dureeMin)) return;

      const lanceur = this.possession;
      const adversaire = lanceur === 'A' ? 'B' : 'A';
      const eqLanceur = lanceur === 'A' ? this.equipeA : this.equipeB;
      const eqAdverse = adversaire === 'A' ? this.equipeA : this.equipeB;

      this.stats[lanceur].lineouts++;
      let forceLanceur = 0, forceAdverse = 0;
      for (const j of eqLanceur) if (j.numero <= 8) forceLanceur += forceMaul(j);
      for (const j of eqAdverse) if (j.numero <= 8) forceAdverse += forceMaul(j);
      const probaVolAdverse = Math.max(0.06, Math.min(0.30, 0.14 + (forceAdverse - forceLanceur) / 900));
      const vole = this.rng() < probaVolAdverse;
      const gagnant = vole ? adversaire : lanceur;
      this.stats[gagnant].lineoutsGagnes++;
      if (vole) { this.stats[adversaire].turnovers++; this.stats[lanceur].turnoversConcedes++; }
      // Le sauteur n'est jamais "le plus proche d'un point" : en match réel le
      // lancer vise un appel tactique (plot avant/milieu/fond de ligne), donc
      // un sauteur choisi au hasard parmi les vrais sauteurs (2e/3e ligne,
      // n°4-8 - jamais la 1ere ligne qui lie/lève sans sauter). Tous les
      // candidats sont déjà alignés en courant (cf. _touchePlacerLignes).
      const eqGagnante = gagnant === 'A' ? this.equipeA : this.equipeB;
      const poolSauteurs = this.cfg.touche.sauteurs;
      const tirerSauteur = (equipe, exclu) => {
        const sauteurs = equipe.filter(j => poolSauteurs.indexOf(j.numero) >= 0 && j.sinBin <= 0 && j.auSol === 0 && j !== exclu);
        const avants = equipe.filter(j => j.numero <= 8 && j.sinBin <= 0 && j.auSol === 0 && j !== exclu);
        const pool = sauteurs.length ? sauteurs : (avants.length ? avants : equipe);
        return pool[Math.floor(this.rng() * pool.length)];
      };
      const sauteur = tirerSauteur(eqGagnante, vole ? null : this.porteur);
      // On NE résout PAS la touche tout de suite : le ballon doit voler du
      // lanceur (sur la ligne de touche) jusqu'au sauteur, à vue, avant d'être
      // capté. Sans ça le ballon "sautait" instantanément de la touche jusque
      // dans l'alignement — la "magie" signalée. Le vol et la réception sont
      // gérés par _tickToucheLancer ; l'issue (volé/gagné, sauteur) est déjà
      // décidée ici mais ne s'applique qu'à la réception.
      const fromX = this.porteur ? this.porteur.x : xLanceur;
      const fromY = this.porteur ? this.porteur.y : yLanceur;
      this.toucheLancer = { sauteur, gagnant, vole, lanceur, eqAdverse, fromX, fromY, timer: 0, duree: 0.8 };
      this.ballonEnVol = true;
      this.ballonVolX = fromX;
      this.ballonVolY = fromY;
      this.ballonVolHauteur = 0;
      this.log('TOUCHE_LANCER', lanceur, `Lancer en touche de l'equipe ${lanceur}`);
    }

    // Vol du ballon lors d'un lancer en touche : trajectoire en cloche du
    // lanceur (ligne de touche) vers le sauteur, puis réception. Reprend le
    // mécanisme de vol des coups de pied (ballonEnVol) pour que la remise en
    // jeu soit réellement visible, jamais une téléportation du ballon.
    _tickToucheLancer(dt) {
      const L = this.toucheLancer;
      L.timer += dt;
      this._touchePlacerLignes(dt);
      const t = Math.min(1, L.timer / L.duree);
      // La cible suit le sauteur (toujours positionné par _touchePlacerLignes),
      // donc le ballon atterrit bien dans ses mains où qu'il se tienne.
      this.ballonEnVol = true;
      this.ballonVolX = L.fromX + (L.sauteur.x - L.fromX) * t;
      this.ballonVolY = L.fromY + (L.sauteur.y - L.fromY) * t;
      this.ballonVolHauteur = Math.sin(Math.PI * t);
      if (t < 1) return;
      // Réception : le sauteur capte le ballon en l'air, à sa position réelle.
      this.ballonEnVol = false;
      this.ballonVolHauteur = 0;
      this.toucheLancer = null;
      this.possession = L.gagnant;
      this.porteur = L.sauteur;
      if (L.vole) {
        this.log('TURNOVER', L.gagnant, `Touche volee, l'equipe ${L.gagnant} recupere le ballon`);
      } else {
        this.log('TOUCHE_BALLON_GAGNE', L.lanceur, `Touche gagnee, le n°${L.sauteur.numero} capte le ballon pour l'equipe ${L.lanceur}`);
        // Maul (catch-and-drive) probable près de la ligne adverse.
        const zone = this._zoneTerrain(this.porteur);
        const tauxMaulTouche = (zone === 'OPP_22' || zone === 'CINQ_M') ? this.cfg.touche.tauxMaul.proche : this.cfg.touche.tauxMaul.loin;
        if (this.rng() < tauxMaulTouche) {
          const { joueur: defenseurProche } = joueurLePlusProche(L.eqAdverse, this.porteur.x, this.porteur.y);
          this._formerMaul(this.porteur, defenseurProche);
          return;
        }
        // Le sauteur a capté le lancer ; il transmet ENSUITE le ballon au demi de
        // mêlée (receveur), en retrait derrière l'alignement (~4 m, cf.
        // _touchePlacerLignes). Cette transmission est une PASSE VISIBLE (le
        // ballon descend du sauteur vers le 9, à vue) et non un transfert
        // instantané : sans ça le ballon "apparaissait" directement dans les
        // mains du 9 (le 9 semblait capter le lancer lui-même). C'est le
        // "deuxième temps" de la touche. On NE délègue PAS à l'ouvreur ici
        // (_neufVersDix) : la passe 9 -> 10 se fait après, en jeu courant.
        const eqG = L.gagnant === 'A' ? this.equipeA : this.equipeB;
        const neuf = eqG.find(j => j.numero === 9 && j.sinBin <= 0 && j.auSol === 0);
        if (neuf && neuf !== this.porteur) {
          this._lancerPasseVisuelle(this.porteur, neuf);
          this.porteur = neuf;
          // Le 9 a le ballon derrière l'alignement : on peut enchaîner une
          // COMBINAISON scriptée de touche (cf. cfg.combinaisons.touche).
          this._lancerCombinaison('touche');
          // Sans combinaison, le 9 est libre et décide lui-même (dégagement,
          // chandelle, avant lancé, ouvreur, ou percée) — cf. choisirActionPorteur.
          if (!this.combinaison) this._neufLibre = true;
        }
      }
      this._imposerRecuperationRuck(this.ruckPoint);
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Replacement des joueurs pendant l'essai/la transformation (loi 8.9 et
    // 8.14) : l'équipe qui défend doit se replier sur sa ligne d'en-but tant
    // que le botteur n'a pas amorcé sa course d'élan ; l'équipe du botteur
    // reste derrière le ballon. Sans ce replacement, les 28 autres joueurs
    // restaient figés exactement là où l'essai avait été marqué pendant les
    // ~33 s de célébration + transformation.
    // Renvoie true quand tous les joueurs concernés ont rejoint leur place
    // (la défense sur sa ligne d'en-but, l'attaque derrière le ballon), ce qui
    // permet d'armer la frappe et de les figer ensuite.
    _transformationPlacerJoueurs(dt) {
      const sens = this.essaiEquipe === 'A' ? 1 : -1;
      const equipeAttaque = this.essaiEquipe === 'A' ? this.equipeA : this.equipeB;
      const equipeDefense = this.essaiEquipe === 'A' ? this.equipeB : this.equipeA;
      const ligneDefense = sens > 0 ? LONGUEUR : 0;
      const xAttaque = Math.max(0, Math.min(LONGUEUR, this.essaiX - sens * 15));
      const buteur = equipeAttaque[9]; // n°10
      const teeX = Math.max(0, Math.min(LONGUEUR, this.essaiX - sens * 10));
      const teeY = this.essaiY;
      let pireEcart = 0;
      for (const j of equipeDefense) {
        if (j.sinBin > 0) continue;
        avancer(j, ligneDefense - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - ligneDefense));
      }
      for (const j of equipeAttaque) {
        if (j.sinBin > 0 || j === this.porteur || j === buteur) continue;
        avancer(j, xAttaque - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - xAttaque));
      }
      // Le buteur COURT jusqu'au tee (dans l'axe de l'essai, ~10 m en retrait), à
      // pleine vitesse, dès la célébration de l'essai (la fonction est appelée
      // pendant ESSAI puis TRANSFORMATION) : il a tout le temps d'y arriver et
      // n'y est plus téléporté.
      if (buteur && buteur.sinBin <= 0) {
        avancer(buteur, teeX - buteur.x, teeY - buteur.y, dt, vitesseMs(buteur));
        pireEcart = Math.max(pireEcart, distance(buteur, { x: teeX, y: teeY }));
      }
      return pireEcart < 1.2;
    }

    // Célébration de l'essai avant l'enchaînement sur la transformation : en
    // match réel, l'arbitre laisse un temps mort notable (replays, retour au
    // sol, replacement) avant que le botteur ne s'installe.
    _tickEssai(dt) {
      this.timerPhase += dt;
      this._transformationPlacerJoueurs(dt);
      if (this.timerPhase >= 8 * this._echelleArret) {
        // Le buteur (l'ouvreur) a couru jusqu'au tee pendant la célébration
        // (cf. _transformationPlacerJoueurs) : il y est déjà, on ne le téléporte
        // plus. Il devient simplement le porteur pour la frappe.
        const eq = this.essaiEquipe === 'A' ? this.equipeA : this.equipeB;
        this.porteur = eq[9];
        this.phase = 'TRANSFORMATION';
        this.timerPhase = 0;
        this.transfoEnPlace = false;
      }
    }

    // Transformation : tentative de coup de pied au but (+2) depuis l'alignement
    // de l'essai, conformément à la loi (le botteur peut reculer mais pas changer d'axe).
    // Durée réaliste : placement du ballon, recul du botteur, course d'élan et
    // frappe prennent ~20-25 s en match réel, pas 2 s.
    _tickTransformation(dt) {
      this.timerPhase += dt;
      // Loi 8.21 : la transformation doit être JOUÉE dans les 90 secondes qui
      // suivent l'essai, sinon elle est refusée. Le buteur prend une vraie
      // routine (placement du tee, concentration, course d'élan), plus longue
      // sur un angle fermé — mais toujours sous le maximum réglementaire. Le
      // match étant regardé en avance rapide, ce temps réel reste confortable.
      const DUREE_MAX_TRANSFO = 60; // secondes réglementaires (loi 8.8.c : la transformation doit être jouée sous 60 s)
      const routine = 26 + Math.abs(this.essaiY - LARGEUR / 2) * 0.9; // ~26 s face aux poteaux, jusqu'à ~57 s près de la touche (toujours < 60 s)
      const duree = Math.min(DUREE_MAX_TRANSFO, routine) * this._echelleArret;
      // Le ballon s'envole vers les poteaux pendant la dernière fraction du
      // temps d'arrêt (le reste, c'est le placement et la course d'élan) :
      // réutilise le mécanisme de vol du coup d'envoi pour rendre la frappe
      // visible à l'écran, au lieu de 25 s où rien ne bouge.
      const dureeVol = Math.min(1.4, duree * 0.3);
      const debutVol = duree - dureeVol;
      // Mise en place : les joueurs rejoignent leur position. On ne les fige (et
      // la frappe n'est armée) qu'une fois TOUS arrivés — au plus tard au début
      // du vol, pour ne jamais bloquer. Une fois en place, on ne les replace
      // plus : ils sont donc parfaitement immobiles au moment du tir (loi 8 :
      // personne n'avance tant que le botteur n'a pas frappé).
      if (!this.transfoEnPlace) {
        const enPlace = this._transformationPlacerJoueurs(dt);
        if (enPlace || this.timerPhase >= debutVol) this.transfoEnPlace = true;
      }
      if (this.timerPhase >= debutVol && this.timerPhase < duree) {
        const t = Math.min(1, (this.timerPhase - debutVol) / dureeVol);
        this.ballonEnVol = true;
        this.ballonVolX = this.porteur.x + (this.essaiX - this.porteur.x) * t;
        this.ballonVolY = this.porteur.y + (LARGEUR / 2 - this.porteur.y) * t;
        this.ballonVolHauteur = Math.sin(Math.PI * t);
      }
      if (this.timerPhase >= duree) {
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        const equipe = this.essaiEquipe;
        const offsetLateral = Math.abs(this.essaiY - LARGEUR / 2);
        if (this.rng() < probaReussiteTir(10, offsetLateral)) {
          this.score[equipe] += 2;
          this.log('TRANSFORMATION_REUSSIE', equipe, `Transformation reussie, equipe ${equipe} +2`);
        } else {
          this.log('TRANSFORMATION_RATEE', equipe, `Transformation ratee, equipe ${equipe}`);
        }
        // Loi 12 : qu'elle soit réussie ou ratée, la transformation est suivie
        // d'un coup d'envoi à la mi-terrain, botté par l'équipe qui vient
        // d'encaisser l'essai (l'équipe qui a marqué le reçoit).
        this._nouvelleManche(equipe);
      }
    }

    // Replacement des joueurs pendant un coup de pied de pénalité au but : comme
    // à la transformation (cf. _transformationPlacerJoueurs), les 28 autres
    // joueurs restaient figés là où la faute avait été commise pendant les ~25 s
    // du tir. L'équipe qui défend se replie derrière sa ligne d'en-but (elle ne
    // peut pas charger un tir au but), l'équipe qui botte se replace derrière le
    // ballon (onside), prête à suivre le jeu sur une éventuelle touche/relance.
    // Tout se fait à la course (avancer), jamais de téléportation.
    // Renvoie true quand tous les joueurs concernés sont en place (même logique
    // que _transformationPlacerJoueurs) : sert à armer la frappe puis à figer.
    _penaliteTirPlacerJoueurs(dt) {
      if (!this.positionTir) return true;
      const sens = this.equipeAuTir === 'A' ? 1 : -1;
      const equipeAttaque = this.equipeAuTir === 'A' ? this.equipeA : this.equipeB;
      const equipeDefense = this.equipeAuTir === 'A' ? this.equipeB : this.equipeA;
      const ligneDefense = sens > 0 ? LONGUEUR : 0;
      const xAttaque = Math.max(0, Math.min(LONGUEUR, this.positionTir.x - sens * 15));
      let pireEcart = 0;
      for (const j of equipeDefense) {
        if (j.sinBin > 0) continue;
        avancer(j, ligneDefense - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - ligneDefense));
      }
      for (const j of equipeAttaque) {
        if (j.sinBin > 0 || j === this.porteur) continue;
        avancer(j, xAttaque - j.x, 0, dt, vitesseMs(j) * 0.8);
        pireEcart = Math.max(pireEcart, Math.abs(j.x - xAttaque));
      }
      // Le buteur COURT jusqu'au tee (point de pénalité), à pleine vitesse — il
      // n'y est jamais téléporté. Sa présence sur le tee fait partie des
      // conditions de « tous en place » avant d'armer la frappe.
      if (this.porteur) {
        avancer(this.porteur, this.positionTir.x - this.porteur.x, this.positionTir.y - this.porteur.y, dt, vitesseMs(this.porteur));
        pireEcart = Math.max(pireEcart, distance(this.porteur, this.positionTir));
      }
      return pireEcart < 1.2;
    }

    // Coup de pied de pénalité au but (+3). Loi 20 : le tir doit être PORTÉ dans
    // les 60 secondes qui suivent l'annonce de l'intention de taper au but, sinon
    // le coup de pied est annulé (mêlée à l'adversaire). Le buteur prend une
    // routine réaliste (placement, recul, course d'élan, frappe), plus longue sur
    // un angle fermé, mais toujours sous le maximum réglementaire.
    _tickPenaliteTir(dt) {
      this.timerPhase += dt;
      const DUREE_MAX_PENALITE = 60; // secondes réglementaires (loi 20)
      const offsetTir = this.positionTir ? Math.abs(this.positionTir.y - LARGEUR / 2) : 0;
      const routine = 26 + offsetTir * 0.8; // ~26 s face aux poteaux, jusqu'à ~52 s (plafonné 60)
      const duree = Math.min(DUREE_MAX_PENALITE, routine) * this._echelleArret;
      // Même principe que pour la transformation : le ballon vole vers les
      // poteaux pendant la dernière fraction du temps d'arrêt.
      const dureeVol = Math.min(1.4, duree * 0.3);
      const debutVol = duree - dureeVol;
      // On ne peut pas botter tant que le replacement n'est pas fini : les
      // joueurs rejoignent leur place, et seulement une fois tous arrivés (au
      // plus tard au début du vol) la frappe est armée et ils sont figés — ils
      // ne bougent plus au moment du tir.
      if (!this.tirEnPlace) {
        const enPlace = this._penaliteTirPlacerJoueurs(dt);
        if (enPlace || this.timerPhase >= debutVol) this.tirEnPlace = true;
      }
      if (this.timerPhase >= debutVol && this.timerPhase < duree) {
        const sensVol = this.equipeAuTir === 'A' ? 1 : -1;
        const cibleX = sensVol > 0 ? LONGUEUR : 0;
        const t = Math.min(1, (this.timerPhase - debutVol) / dureeVol);
        this.ballonEnVol = true;
        this.ballonVolX = this.porteur.x + (cibleX - this.porteur.x) * t;
        this.ballonVolY = this.porteur.y + (LARGEUR / 2 - this.porteur.y) * t;
        this.ballonVolHauteur = Math.sin(Math.PI * t);
      }
      if (this.timerPhase >= duree) {
        this.ballonEnVol = false;
        this.ballonVolHauteur = 0;
        const equipe = this.equipeAuTir;
        const { y, distanceButs } = this.positionTir;
        const offsetLateral = Math.abs(y - LARGEUR / 2);
        const sens = { A: 1, B: -1 };
        if (this.rng() < probaReussiteTir(distanceButs, offsetLateral)) {
          this.score[equipe] += 3;
          this.log('PENALITE_REUSSIE', equipe, `Coup de pied au but reussi, equipe ${equipe} +3`);
          // Comme après un essai : coup d'envoi à la mi-terrain, botté par
          // l'équipe qui vient d'encaisser la pénalité.
          this._nouvelleManche(equipe);
        } else {
          this.log('PENALITE_RATEE', equipe, `Coup de pied au but rate, equipe ${equipe}`);
          // Un tir manqué part en général au-delà de la ligne d'en-but adverse
          // et y meurt : remise en jeu en 22m (loi 12), botté par l'équipe
          // défenseure depuis SA ligne des 22m, pas un coup d'envoi à mi-terrain.
          const sensEquipe = sens[equipe];
          const ligneEssaiAdverse = sensEquipe > 0 ? LONGUEUR : 0;
          const x22 = ligneEssaiAdverse - sensEquipe * 22;
          this._nouvelleManche(equipe, x22);
        }
      }
    }

    tick(dt) {
      if (this.phase === 'TERMINE') return;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j.auSol > 0) {
          j.auSol = Math.max(0, j.auSol - dt);
          // Une fois relevé (auSol retombé à 0), on oublie la position de chute :
          // le joueur redevient libre de se déplacer (l'IA le replace).
          if (j.auSol === 0) j._solX = null;
        }
        if (j.missCooldown > 0) j.missCooldown = Math.max(0, j.missCooldown - dt);
        if (j.ruckRecovery > 0) j.ruckRecovery = Math.max(0, j.ruckRecovery - dt);
        if (j._croiseTimer > 0) j._croiseTimer = Math.max(0, j._croiseTimer - dt);
        // Plaqueur couché (visuel pur) : ne persiste qu'en JEU COURANT. Sur un
        // changement de phase (mêlée, touche, coup de pied...), on l'efface : sinon
        // un plaqueur restait dessiné au sol tout seul, loin de la nouvelle action
        // (effet « joueur qui tombe sans plaqueur »).
        if (j.solVisuel > 0) {
          j.solVisuel = (this.phase === 'PORTE' || this.phase === 'RUCK' || this.phase === 'MAUL')
            ? Math.max(0, j.solVisuel - dt) : 0;
        }
        if (j.sinBin > 0) j.sinBin = Math.max(0, j.sinBin - dt);
      }
      // Avancement du vol visuel d'une passe (cf. _lancerPasseVisuelle) : on le
      // termine au bout de sa durée. Le vol n'a de sens qu'en jeu courant ; si
      // la phase a changé entre-temps (plaquage -> ruck, sortie en touche...),
      // on l'arrête pour que le ballon ne reste pas "en l'air" sur un autre
      // arrêt de jeu.
      if (this.passeVisuelle) {
        this.passeVisuelle.timer += dt;
        if (this.passeVisuelle.timer >= this.passeVisuelle.duree || this.phase !== 'PORTE') {
          this.passeVisuelle = null;
        }
      }
      // Temps de jeu effectif (ballon vivant) : phases où le jeu est réellement
      // en cours, à l'exclusion des arrêts (essai/transformation/pénalité au
      // but/mi-temps) et de la formation mêlée/touche (liaison des paquets,
      // alignement avant lancer : le ballon n'est pas encore vivant). Mesuré
      // tick par tick, jamais recalculé après coup.
      if (this.phase === 'PORTE' || this.phase === 'RUCK' || this.phase === 'MAUL'
        || this.phase === 'COUP_ENVOI' || this.phase === 'COUP_DE_PIED_JEU') {
        this.tempsJeuEffectif += dt;
        this.tempsPossession[this.possession] += dt;
        // Occupation : où se joue le match (position réelle du ballon),
        // indépendamment de qui le porte — sensAttaque de A est toujours +1,
        // donc la moitié de terrain x > LONGUEUR/2 est sa moitié offensive.
        const xBallon = (this.ballonEnVol || this._receptionEnAttente) ? this.ballonVolX : this.porteur.x;
        if (xBallon > LONGUEUR / 2) this.tempsOccupation.A += dt;
        else this.tempsOccupation.B += dt;
      }
      this.tempsMatch += dt;
      // Une séquence de marque déjà engagée (essai en attente de transformation,
      // tir au but en cours) doit aller à son TERME même si le temps de la
      // période ou du match expire pendant ce temps : en rugby, un essai marqué
      // au temps écoulé se transforme, et un coup de pied accordé avant la fin se
      // joue (le temps ne s'arrête que lorsque le ballon est mort). Sans ce
      // report, la bascule en MI_TEMPS/TERMINE court-circuitait _tickEssai/
      // _tickTransformation/_tickPenaliteTir (return immédiat) et effaçait des
      // points légitimes — ~7,5 % des matchs perdaient la transformation d'un
      // essai de fin de période. On laisse donc la phase de marque se résoudre,
      // puis la bascule de temps se déclenche au tick suivant.
      const sequenceMarque = this.phase === 'ESSAI' || this.phase === 'TRANSFORMATION' || this.phase === 'PENALITE_TIR';
      if (!sequenceMarque && this.tempsMatch >= this.dureeMatch) {
        this.phase = 'TERMINE';
        this.log('FIN_MATCH', null, `Fin du match : equipe A ${this.score.A} - ${this.score.B} equipe B`);
        return;
      }
      // Coup d'envoi de la 2e période (loi 12) : ce sont les adversaires de
      // l'équipe qui a donné le coup d'envoi du match qui le donnent en 2e
      // période, depuis le centre, comme en début de match. Le coup d'envoi
      // est différé d'une seconde de jeu (phase MI_TEMPS) plutôt que déclenché
      // dans le même tick que l'événement MI_TEMPS, sinon l'événement COUP_ENVOI
      // qui suit immédiatement masque la bannière de mi-temps dans l'interface.
      if (!sequenceMarque && !this.miTempsJouee && this.tempsMatch >= this.dureeMiTemps) {
        this.miTempsJouee = true;
        this.log('MI_TEMPS', null, `Mi-temps : equipe A ${this.score.A} - ${this.score.B} equipe B`);
        this.phase = 'MI_TEMPS';
        this.timerPhase = 0;
        return;
      }
      if (this.phase === 'MI_TEMPS') this._tickMiTemps(dt);
      else if (this.phase === 'PORTE') {
        // Mise en place d'un jeu rapide sur pénalité/coup franc (recul de 10 m
        // des fautifs, tapeur vers la marque) avant que le jeu courant reprenne.
        if (this.penaliteRecul) this._tickJeuRapidePenalite(dt);
        else this._tickPorte(dt);
      }
      else if (this.phase === 'COUP_ENVOI') this._tickCoupEnvoi(dt);
      else if (this.phase === 'COUP_DE_PIED_JEU') this._tickCoupDePiedJeu(dt);
      else if (this.phase === 'RUCK') this._tickRuck(dt);
      else if (this.phase === 'MAUL') this._tickMaul(dt);
      else if (this.phase === 'MELEE') this._tickMelee(dt);
      else if (this.phase === 'TOUCHE') this._tickTouche(dt);
      else if (this.phase === 'ESSAI') this._tickEssai(dt);
      else if (this.phase === 'TRANSFORMATION') this._tickTransformation(dt);
      else if (this.phase === 'PENALITE_TIR') this._tickPenaliteTir(dt);
      // Gel global des joueurs AU SOL : un joueur plaqué/à terre (auSol > 0) ne
      // se déplace JAMAIS tant qu'il n'est pas relevé. Sans ce verrou, l'IA de
      // placement (ligne défensive, soutiens, replacement) le faisait glisser —
      // parfois à pleine vitesse de course (~7 m/s mesuré) — alors qu'il est
      // dessiné couché : on voyait des joueurs « courir au sol ». On les refige
      // à l'endroit exact de leur chute dans TOUTES les phases SAUF la formation
      // d'une mêlée ou d'une touche (où ils doivent au contraire pouvoir rejoindre
      // leur place, auSol expirant en ~2 s). Le coup de pied est inclus : sinon le
      // joueur, figé pendant le jeu courant, se « dégelait » au coup de pied et
      // sautait d'un coup vers sa position de chasse (téléportation détectée par
      // les invariants).
      if (this.phase !== 'MELEE' && this.phase !== 'TOUCHE') {
        for (const j of [...this.equipeA, ...this.equipeB]) {
          if (j.auSol > 0 && j._solX != null) { j.x = j._solX; j.y = j._solY; }
        }
      }
      // Suivi de l'avantage (loi 8) APRÈS la phase : on évalue sur l'état mis à
      // jour (possession, position du porteur) si l'avantage est joué ou s'il
      // faut revenir à la sanction.
      if (this.avantage) this._tickAvantage(dt);
      // L'arbitre court vers sa place (jamais de téléportation).
      if (this.phase !== 'TERMINE') this._majArbitre(dt);
    }

    // Forme normalisée du ballon (cf. docs/index.html refonte modulaire) :
    // un objet indépendant du porteur, avec un état explicite plutôt qu'une
    // simple référence d'objet joueur. Vitesse en m/s, dérivée de la cible et
    // de la durée de vol pendant un coup d'envoi ; nulle sinon (le ballon
    // "tenu" n'a pas de vitesse propre, il suit le porteur).
    _etatBallon() {
      if (this.ballonEnVol) return 'AIR';
      if (this._receptionEnAttente) return 'LOOSE';
      if (this.phase === 'RUCK') return 'RUCK';
      if (this.phase === 'MAUL') return 'MAUL';
      if (this.phase === 'TOUCHE') return 'OUT';
      return 'CARRIED';
    }

    getState() {
      const enVol = this.ballonEnVol;
      // Ballon au sol après un coup de pied tactique, pas encore récupéré :
      // pas tenu par le porteur (qui est resté en arrière, ballon déjà loin) —
      // sa position réelle est celle du point de chute, comme pendant le vol.
      const auSolLoose = !enVol && this._receptionEnAttente;
      let bvx = 0, bvy = 0;
      if (enVol) {
        const dxVol = this.ballonCibleX - this.xCoupEnvoi;
        const dyVol = this.ballonCibleY - LARGEUR / 2;
        const duree = Math.max(0.9, Math.min(2.0, Math.hypot(dxVol, dyVol) / 18));
        bvx = dxVol / duree;
        bvy = dyVol / duree;
      }
      // Vol visuel d'une passe en jeu courant (cf. _lancerPasseVisuelle) : le
      // ballon décrit un petit arc du passeur jusqu'au receveur (qui est déjà
      // le porteur côté logique). On ne l'affiche qu'en jeu courant (PORTE) :
      // si un plaquage/une touche a interrompu entre-temps, le ballon revient
      // à sa position normale. L'arc est plus bas qu'un coup de pied (×0,4).
      let passeX = null, passeY = null, passeH = 0;
      if (this.passeVisuelle && !enVol && !auSolLoose && this.phase === 'PORTE') {
        const P = this.passeVisuelle;
        const t = P.duree > 0 ? Math.min(1, P.timer / P.duree) : 1;
        passeX = P.fromX + (P.cible.x - P.fromX) * t;
        passeY = P.fromY + (P.cible.y - P.fromY) * t;
        passeH = Math.sin(Math.PI * t) * 0.4;
      }
      const enPasse = passeX != null;
      // Position d'affichage du ballon pendant les phases statiques (mêlée /
      // touche) : le ballon est sur la MARQUE (base de la mêlée, marque de
      // touche), PAS « dans les mains » d'un joueur encore loin — sinon il se
      // téléporte vers ce joueur au début de la phase (jusqu'à ~40 m observés à
      // la touche) puis en revient. Pendant un vol (lancer de touche, coup de
      // pied), le vol prime (géré au-dessus via enVol). Le porteur réel reste
      // inchangé côté logique ; ceci ne concerne QUE l'affichage du ballon.
      let ballonPhaseX = null, ballonPhaseY = null;
      if (!enVol && !enPasse && !auSolLoose) {
        if (this.phase === 'MELEE' && this.melee) {
          ballonPhaseX = this.melee.x; ballonPhaseY = this.melee.y;
        } else if (this.phase === 'TOUCHE') {
          ballonPhaseX = this.toucheLanceurX != null ? this.toucheLanceurX : this.ruckPoint.x;
          ballonPhaseY = this.toucheLanceurY != null ? this.toucheLanceurY : this.ruckPoint.y;
        } else if (this.phase === 'RUCK' && this.ruckPoint) {
          // Ballon au sol au point de regroupement, jamais « dans les mains » du
          // joueur plaqué : sans cet ancrage, le ballon suivait la position du
          // porteur (this.porteur.x/y plus bas). Le plaqué pouvant désormais
          // ramper pour s'écarter (loi 14, cf. _tickRuck), le ballon le suivrait
          // s'il n'était pas fixé ici au point de ruck.
          ballonPhaseX = this.ruckPoint.x; ballonPhaseY = this.ruckPoint.y;
        }
      }
      const enPhaseStatique = ballonPhaseX != null;
      const ballonX = enVol || auSolLoose ? this.ballonVolX : enPasse ? passeX : enPhaseStatique ? ballonPhaseX : this.porteur.x;
      const ballonY = enVol || auSolLoose ? this.ballonVolY : enPasse ? passeY : enPhaseStatique ? ballonPhaseY : this.porteur.y;
      return {
        equipeA: this.equipeA.map(j => ({ ...j })),
        equipeB: this.equipeB.map(j => ({ ...j })),
        porteur: { team: this.porteur.team, numero: this.porteur.numero, x: this.porteur.x, y: this.porteur.y },
        // Position réelle du ballon : en vol pendant un coup d'envoi (avec une
        // hauteur 0..1 pour figurer la cloche), au sol après un coup de pied
        // tactique tant que personne ne l'a rejoint, sinon dans les mains du
        // porteur. Conservé pour compatibilité avec le rendu existant.
        ballon: enVol
          ? { x: this.ballonVolX, y: this.ballonVolY, enVol: true, hauteur: this.ballonVolHauteur }
          : enPasse
            ? { x: passeX, y: passeY, enVol: true, hauteur: passeH }
            : { x: ballonX, y: ballonY, enVol: false, hauteur: 0 },
        // Objet ballon normalisé : { x, y, vx, vy, state, carrierTeam, carrierNumber }.
        // À terme, c'est cette forme qui doit devenir la source de vérité côté
        // rendu (docs/js/renderer.js) ; `ballon`/`porteur` restent en place tant
        // que la migration du rendu n'est pas terminée.
        ball: {
          x: ballonX,
          y: ballonY,
          vx: bvx, vy: bvy,
          state: enPasse ? 'AIR' : this._etatBallon(),
          carrierTeam: enVol || auSolLoose || enPasse || enPhaseStatique ? null : this.porteur.team,
          carrierNumber: enVol || auSolLoose || enPasse || enPhaseStatique ? null : this.porteur.numero,
        },
        arbitre: { x: this.arbitrePos.x, y: this.arbitrePos.y },
        possession: this.possession,
        phase: this.phase,
        // État détaillé du maul en cours (null hors maul), pour l'affichage.
        maul: this.maul ? { etat: this.maul.etat, x: this.maul.x, y: this.maul.y } : null,
        // État détaillé de la mêlée en cours (null hors mêlée), pour l'affichage.
        melee: this.melee ? { etat: this.melee.etat, x: this.melee.x, y: this.melee.y } : null,
        // État du ruck en cours (null hors ruck), pour l'affichage/les tests.
        ruck: this.phase === 'RUCK' ? {
          x: this.ruckPoint.x, y: this.ruckPoint.y,
          attackingTeam: this.possession,
          defendingTeam: this.possession === 'A' ? 'B' : 'A',
          attackersCommitted: [...this.equipeA, ...this.equipeB]
            .filter(j => j.team === this.possession && j !== this.porteur && distance(j, this.ruckPoint) < 8).length,
          defendersCommitted: [...this.equipeA, ...this.equipeB]
            .filter(j => j.team !== this.possession && j.auSol === 0 && distance(j, this.ruckPoint) < 8).length,
          timer: this.timerPhase,
          ballAvailable: this.timerPhase >= 1.2,
        } : null,
        score: { ...this.score },
        tempsMatch: this.tempsMatch,
        dureeMatch: this.dureeMatch,
        periode: this.miTempsJouee ? 2 : 1,
        events: this.events.slice(),
        // Statistiques agrégées réelles (cf. constructeur) : pour outillage de
        // calibrage (simulateBatch) et affichage éventuel, jamais recalculées
        // après coup à partir d'autre chose que ces compteurs.
        stats: { A: { ...this.stats.A }, B: { ...this.stats.B } },
        tempsJeuEffectif: this.tempsJeuEffectif,
        // % de possession réel, calculé à partir du temps de jeu effectif
        // accumulé par équipe (this.tempsPossession), pas un chiffre fixé :
        // 50/50 tant qu'aucune seconde de jeu effectif n'a encore eu lieu.
        possessionPct: this.tempsJeuEffectif > 0 ? {
          A: Math.round((this.tempsPossession.A / this.tempsJeuEffectif) * 100),
          B: Math.round((this.tempsPossession.B / this.tempsJeuEffectif) * 100),
        } : { A: 50, B: 50 },
        // % d'occupation réel (où s'est joué le match), calculé à partir de la
        // position du ballon accumulée par équipe (this.tempsOccupation).
        occupationPct: this.tempsJeuEffectif > 0 ? {
          A: Math.round((this.tempsOccupation.A / this.tempsJeuEffectif) * 100),
          B: Math.round((this.tempsOccupation.B / this.tempsJeuEffectif) * 100),
        } : { A: 50, B: 50 },
      };
    }
  }

  return { MatchEngine, LONGUEUR, LARGEUR, creerRng, distance, DEFAULT_CONFIG, fusionnerConfig };
});
