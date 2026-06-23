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
    return Math.max(0.05, Math.min(0.92, 0.97 - distanceReelle / 90 - angleDeg / 110));
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

  function creerJoueur(numero, team, sensAttaque, rng) {
    const p = PROFILS[numero];
    const channelY = COULOIR_BASE[numero] * (LARGEUR / 70);
    return {
      team, numero, label: p.label,
      vitesse: p.vitesse + (rng() * 10 - 5),
      plaquage: p.plaquage + (rng() * 10 - 5),
      tendance: p.tendance,
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

  function creerEquipe(team, sensAttaque, rng) {
    const joueurs = [];
    for (let n = 1; n <= 15; n++) joueurs.push(creerJoueur(n, team, sensAttaque, rng));
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

  // --- Maul (loi 17) : machine à états ---------------------------------------
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
    // Décision : un maul est-il valablement formé (loi 17) ? Il faut le porteur
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
    constructor(seed, dureeMatch = Infinity) {
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
      // Maul (loi 17) : objet d'état courant (null hors maul), et indicateur
      // « le ballon vient d'une réception directe d'un coup de pied adverse »
      // (exception loi 8 sur l'attribution de la mêlée en cas de ballon injouable).
      this.maul = null;
      this._receptionDirecte = false;
      // Compteur d'infractions de maul par équipe sur l'ensemble du match
      // (persiste d'un maul à l'autre) : sert à siffler un carton jaune pour
      // fautes répétées, comme l'arbitrage réel.
      this._maulPenalitesMatch = { A: 0, B: 0 };
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
      this._nouvelleManche('A');
      this.equipeKickPremiereMiTemps = this._dernierEquipeKick;
    }

    _statsVierges() {
      return {
        essais: 0, carries: 0, passes: 0, offloads: 0, kicks: 0,
        tacklesAttempted: 0, tacklesMade: 0, missedTackles: 0,
        rucks: 0, lineouts: 0, lineoutsGagnes: 0, scrums: 0, mauls: 0,
        penalitesConcedees: 0, turnovers: 0, knockOns: 0, cartonsJaunes: 0,
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
      this._receptionDirecte = false;
      this.equipeA = creerEquipe('A', sens.A, this.rng);
      this.equipeB = creerEquipe('B', sens.B, this.rng);
      const equipeKick = equipeReceptrice === 'A' ? 'B' : 'A';
      this._dernierEquipeKick = equipeKick;
      const dirKick = sens[equipeKick];
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j.team === equipeKick) {
          j.x = Math.max(0, Math.min(LONGUEUR, xCentre - dirKick * (j.numero <= 8 ? 2 : 6)));
        } else {
          j.x = Math.max(0, Math.min(LONGUEUR, xCentre + dirKick * (10 + (j.numero <= 8 ? 0 : 6))));
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
      // 22 m et peut donc demander une marque (loi 11).
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
        // Marque (loi 11) : un joueur qui réceptionne proprement le ballon dans
        // son propre en-deçà des 22 m peut crier « marque » et obtenir un coup
        // franc (pas de tir au but possible), pour dégager la pression.
        const sensReceveur = joueur.team === 'A' ? 1 : -1;
        const distPropreLigne = sensReceveur > 0 ? joueur.x : (LONGUEUR - joueur.x);
        if (distPropreLigne <= 22 && this.rng() < 0.5) {
          this._traiterCoupFranc(joueur.team, { x: joueur.x, y: joueur.y });
          return;
        }
        // Réception directe d'un coup de pied adverse : si un maul se forme dans
        // la foulée, l'exception de la loi 8 attribuera la mêlée (ballon
        // injouable) à l'équipe du réceptionneur, pas à la défense.
        this._receptionDirecte = true;
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    // Coup franc (loi 11/20) : sanction plus légère qu'une pénalité, sans
    // possibilité de tir au but ni de touche directe avec gain de terrain par
    // le pied. L'équipe joue rapidement à la main et avance un peu.
    _traiterCoupFranc(equipe, position) {
      this.possession = equipe;
      const sensAttaque = equipe === 'A' ? 1 : -1;
      const eq = equipe === 'A' ? this.equipeA : this.equipeB;
      const { joueur } = joueurLePlusProche(eq, position.x, position.y);
      this.porteur = joueur;
      this.porteur.x = Math.max(0, Math.min(LONGUEUR, position.x + sensAttaque * 5));
      this.porteur.y = Math.max(2, Math.min(LARGEUR - 2, position.y));
      this.log('COUP_FRANC', equipe, `Marque, equipe ${equipe} obtient un coup franc et joue rapidement`);
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Position affichable de l'arbitre : suit le point de ruck/mêlée pendant les
    // phases statiques, sinon reste juste derrière le porteur du ballon.
    _positionArbitre() {
      if (this.phase === 'RUCK' || this.phase === 'MAUL' || this.phase === 'MELEE' || this.phase === 'TOUCHE') {
        return { x: this.ruckPoint.x, y: Math.max(0, Math.min(LARGEUR, this.ruckPoint.y - 5)) };
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
      this.possession = equipeFautive === 'A' ? 'B' : 'A';
      this.stats[this.possession].scrums++;
      this.log('MELEE', this.possession, `Melee, introduction pour l'equipe ${this.possession}`);
      const equipe = this.possession === 'A' ? this.equipeA : this.equipeB;
      this.porteur = this._neufVersDix(equipe, equipe[8]);
      this.porteur.x = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      this.porteur.y = Math.max(5, Math.min(LARGEUR - 5, position.y));
      this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
      this.phase = 'MELEE';
      this.timerPhase = 0;
    }

    // --- Touche : un ballon porté en touche donne une touche (lancer) à l'équipe
    // adverse de celle qui l'a porté en touche, à l'endroit où il a franchi la ligne. ---
    _accorderTouche(equipeQuiSort, position) {
      this.log('TOUCHE', equipeQuiSort, `Ballon porte en touche par l'equipe ${equipeQuiSort}, touche pour l'equipe adverse`);
      this.ruckPoint = { x: position.x, y: position.y };
      this.possession = equipeQuiSort === 'A' ? 'B' : 'A';
      const equipe = this.possession === 'A' ? this.equipeA : this.equipeB;
      this.porteur = this._neufVersDix(equipe, equipe[8]);
      this.porteur.x = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      this.porteur.y = position.y <= LARGEUR / 2 ? 5 : LARGEUR - 5;
      this.phase = 'TOUCHE';
      this.timerPhase = 0;
      // Position des deux lignes de touche (loi 9) : avants au centre dans le
      // couloir, le reste écarté, comme préparation à un vrai contest (résolu
      // dans _tickTouche) plutôt qu'un simple timer sans enjeu.
      this.toucheLanceurY = position.y <= LARGEUR / 2 ? 5 : LARGEUR - 5;
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
      // fautive marque directement 7 points, sans tir ni jeu rapide.
      if (distanceButs <= 5 && this.rng() < 0.25) {
        this.score[equipeBeneficiaire] += 7;
        this.stats[equipeBeneficiaire].essais++;
        this.log('ESSAI_PENALITE', equipeBeneficiaire, `Essai de penalite, equipe ${equipeBeneficiaire} +7`);
        this._nouvelleManche(equipeBeneficiaire);
        return;
      }
      const enZoneDeTir = distanceButs >= 5 && distanceButs <= 45;
      if (enZoneDeTir && this.rng() < 0.55) {
        this.equipeAuTir = equipeBeneficiaire;
        this.positionTir = { x: position.x, y: position.y, distanceButs };
        // Place le buteur (l'ouvreur) sur le point de pénalité : sans ça, le
        // porteur reste figé là où la faute a été commise et rien ne montre
        // visuellement qu'un coup de pied au but va être tenté.
        const eqTir = equipeBeneficiaire === 'A' ? this.equipeA : this.equipeB;
        this.porteur = eqTir[9];
        this.porteur.x = position.x;
        this.porteur.y = position.y;
        this.phase = 'PENALITE_TIR';
        this.timerPhase = 0;
        this.log('PENALITE', equipeBeneficiaire, `Penalite, equipe ${equipeBeneficiaire} tente un coup de pied au but`);
        return;
      }
      this.log('PENALITE', equipeBeneficiaire, `Penalite, equipe ${equipeBeneficiaire} joue rapidement et avance`);
      this.porteur.x += sensAttaque * 8;
      this.porteur.x = Math.max(0, Math.min(LONGUEUR, this.porteur.x));
      this.phase = 'PORTE';
      this.timerPhase = 0;
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

      // Décision tactique du porteur (botter, passer, jouer au large, foncer au
      // contact) : tranchée AVANT la résolution du plaquage ci-dessous, sur la
      // base de la zone, de la pression défensive, du soutien disponible, du
      // numéro du porteur et du score (cf. choisirActionPorteur). Le coup de
      // pied peut survenir même défenseur tout proche (dégagement sous
      // pression) ; la passe suppose de ne pas être déjà au contact.
      const action = this.choisirActionPorteur(porteur, defenseurProche, distDef, dt);
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
        const probaPlaquage = Math.max(0.70, Math.min(0.94, 0.83 + (defenseurProche.plaquage - this.porteur.vitesse) / 250));
        if (this.rng() >= probaPlaquage) {
          // Plaquage manqué : le défenseur reste hors-jeu de contact un court
          // instant, le porteur poursuit sa course sans être inquiété par lui.
          defenseurProche.missCooldown = 1.0;
          this.stats[defenseurProche.team].missedTackles++;
          this.log('PLAQUAGE_MANQUE', this.possession, `Plaquage manque, l'equipe ${this.possession} poursuit sa course`);
          return;
        }
        this.stats[defenseurProche.team].tacklesMade++;
        this.timerPhase = 0;
        // En-avant au contact : conséquence directe et distincte du plaquage
        // réussi, pas seulement un succès/échec binaire ruck-ou-rien.
        if (this.rng() < 0.045) {
          this.stats[this.possession].knockOns++;
          this.log('MELEE_ENAVANT', this.possession, `En-avant au contact, equipe ${this.possession} - melee adverse`);
          this._accorderMelee(this.possession, porteur);
          return;
        }
        this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
        this.contestants = [defenseurProche.numero];
        // Offload : le porteur plaqué mais pas encore au sol transmet à un
        // soutien tout proche plutôt que de finir au ruck — garde le ballon vivant.
        const soutiens = att0.filter(j => j !== porteur && distance(j, porteur) < 4 && j.auSol === 0);
        if (soutiens.length > 0 && this.rng() < 0.10) {
          const { joueur: receveurOffload } = joueurLePlusProche(soutiens, porteur.x, porteur.y);
          this.stats[this.possession].passes++;
          this.stats[this.possession].offloads++;
          this.log('OFFLOAD', this.possession, `Offload de l'equipe ${this.possession} dans le plaquage`);
          this.porteur = receveurOffload;
          this._receptionDirecte = false;
          return;
        }
        // Maul (loi 17) : voie secondaire (rare en plein champ), nettement plus
        // probable tout près de la ligne adverse (pick-and-go qui se transforme
        // en maul) — la voie PRINCIPALE de formation reste la touche gagnée
        // dans les 22 m adverses (cf. _tickTouche).
        const zone0 = this._zoneTerrain(porteur);
        const tauxMaul = (zone0 === 'OPP_22' || zone0 === 'CINQ_M') ? 0.05 : 0.012;
        if (soutiens.length > 0 && this.rng() < tauxMaul && Referee.maulForme(porteur, defenseurProche, soutiens.length > 0)) {
          this._formerMaul(porteur, defenseurProche);
        } else {
          this.porteur.auSol = 1.5;
          this.stats[this.possession].rucks++;
          const tierRuck = this.rng();
          this.ruckDureeCible = tierRuck < 0.55 ? 2 + this.rng() * 2
            : tierRuck < 0.85 ? 4 + this.rng() * 3
              : 7 + this.rng() * 4;
          this.ruckTempsSansSoutien = 0;
          this.phase = 'RUCK';
          this._receptionDirecte = false;
        }
        return;
      }

      const dx = porteur.sensAttaque * 6;
      const evite = (porteur.y - defenseurProche.y) > 0 ? 2.5 : -2.5;
      avancer(porteur, dx, evite, dt, vitesseMs(porteur));

      // Touche : le ballon porté au-delà de la ligne de touche est mort, jeu arrêté.
      if (porteur.y <= 0.01 || porteur.y >= LARGEUR - 0.01) {
        this._accorderTouche(this.possession, porteur);
        return;
      }

      // Soutien rapproché : seuls 1 à 2 coéquipiers (les plus proches parmi les
      // joueurs à forte tendance de proximité) collent réellement le porteur ;
      // les autres tiennent leur couloir ou suivent à distance, sinon toute
      // l'équipe converge sur le ballon comme un seul bloc, ce qui n'arrive pas
      // en match réel (lignes, options de passe écartées...).
      const att = this.attaquants();
      const candidatsProches = att
        .filter(j => j !== porteur && j.tendance >= 70)
        .sort((a, b) => distance(a, porteur) - distance(b, porteur));
      const pursuiteEtroite = new Set(candidatsProches.slice(0, 2));
      for (const j of att) {
        if (j === porteur) continue;
        if (pursuiteEtroite.has(j)) {
          // L'écart latéral (angle) ne doit jouer que sur Y : appliqué aussi à
          // X, il pouvait placer le soutien jusqu'à 2 m devant le porteur dans
          // le sens d'attaque, ce qui transformait toute passe vers lui en
          // passe en avant (mêlée injustifiée). Le soutien reste toujours
          // légèrement en retrait du porteur en profondeur, comme un vrai
          // joueur de soutien qui attend le ballon dans son dos.
          const angle = (j.numero % 5) - 2;
          const cibleX = porteur.x - porteur.sensAttaque * 1.5;
          avancer(j, cibleX - j.x, (porteur.y - j.y) + angle * 0.5, dt, vitesseMs(j) * 0.9);
        } else if (j.tendance >= 30) {
          // Ouvreur/centres tiennent surtout leur couloir (ligne d'attaque
          // écartée, options de passe disponibles) avec juste une légère
          // dérive vers le ballon ; avec un poids majoritaire donné au ballon
          // (l'ancien 0.6), toute la ligne se compactait sur un seul point
          // au lieu de garder une vraie largeur de jeu.
          const cibleY = j.channelY * 0.75 + porteur.y * 0.25;
          const cibleX = porteur.x - porteur.sensAttaque * (6 + Math.abs(j.channelY - porteur.y) * 0.2);
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.8);
        } else {
          const cibleY = j.channelY;
          const cibleX = porteur.x - porteur.sensAttaque * 10;
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.6);
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
        // Les défenseurs hors plaqueur direct doivent se placer ENTRE le porteur
        // et leur propre ligne d'en-but (donc dans le sens d'attaque du porteur),
        // pas derrière lui : sinon le couloir vers l'essai reste grand ouvert.
        const estAvant = j.numero <= 8;
        const avance = porteur.sensAttaque > 0 ? (estAvant ? 1 : 3) : -(estAvant ? 1 : 3);
        const cibleX = porteur.x + avance;
        const cibleY = j.channelY * 0.6 + porteur.y * 0.4;
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
            porteur.auSol = 1.5;
            this.stats[this.possession].rucks++;
            const tierRuck = this.rng();
            this.ruckDureeCible = tierRuck < 0.55 ? 2 + this.rng() * 2
              : tierRuck < 0.85 ? 4 + this.rng() * 3
                : 7 + this.rng() * 4;
            this.ruckTempsSansSoutien = 0;
            this.phase = 'RUCK';
            this._receptionDirecte = false;
            this.timerPhase = 0;
            return;
          }
          sauveteur.missCooldown = 1.0;
          this.stats[sauveteur.team].missedTackles++;
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

      // 1. Botter en jeu courant : très fréquent dans son propre 22 (surtout
      // sous pression), de plus en plus rare en remontant le terrain. Une
      // équipe qui mène botte un peu plus pour la touche/le territoire.
      if (this.timerPhase > 0.4 && zone !== 'CINQ_M') {
        let pParSeconde;
        if (zone === 'OWN_22') pParSeconde = 0.40 + (pression ? 0.22 : 0);
        else if (zone === 'OWN_HALF') pParSeconde = 0.12 + (pression ? 0.08 : 0);
        else if (zone === 'OPP_HALF') pParSeconde = 0.03 + (pression ? 0.02 : 0);
        else pParSeconde = 0.015; // OPP_22 : on privilégie le jeu au sol/pick-and-go.
        if (enMene) pParSeconde *= 1.15; else pParSeconde *= 0.9;
        if (this.rng() < pParSeconde * dt) return 'KICK';
      }

      // 2. Pick-and-go : un avant tout près de la ligne adverse sous pression
      // préfère relancer au contact plutôt que chercher le large.
      if (avant && (zone === 'CINQ_M' || zone === 'OPP_22') && pression && this.rng() < 0.55 * dt) {
        return 'PICK_GO';
      }

      // 3. Passe avant contact : défenseur qui se rapproche mais pas encore au
      // plaquage, avec un soutien à proximité immédiate — l'attaque transmet
      // le ballon plutôt que d'attendre le choc.
      if (distDef < 5.5 && soutienDisponible && this.rng() < 0.7 * dt) {
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
    _tenterPasse(porteur, jeuLarge) {
      const att = this.attaquants();
      // Rayon de recherche du destinataire : un jeu au large vise précisément
      // un ailier/arrière qui tient son couloir à 20-30 m du regroupement, le
      // plafond de 25 m utilisé pour la passe courte l'exclurait presque
      // toujours — la distance reste pénalisée via probaReussite ci-dessous.
      const rayon = jeuLarge ? 45 : 25;
      let candidats = att.filter(j => j !== porteur && j.auSol === 0 && distance(j, porteur) <= rayon);
      if (jeuLarge) candidats = candidats.filter(j => j.tendance <= 50);
      if (candidats.length === 0) return false;

      let cible = candidats[0], meilleurScore = -Infinity;
      for (const c of candidats) {
        const d = distance(c, porteur);
        const score = jeuLarge
          ? Math.abs(c.channelY - LARGEUR / 2) - d * 0.3
          : (100 - d) + c.tendance * 0.1;
        if (score > meilleurScore) { meilleurScore = score; cible = c; }
      }

      if (Referee.passeEnAvant(porteur.sensAttaque, porteur, cible)) {
        this.log('MELEE_AVANT', this.possession, `Passe en avant, equipe ${this.possession} - melee adverse`);
        this._accorderMelee(this.possession, porteur);
        return true;
      }
      const distancePasse = distance(porteur, cible);
      const probaReussite = Math.max(0.65, Math.min(0.97, 0.97 - distancePasse / 70));
      if (this.rng() < probaReussite) {
        this.stats[this.possession].passes++;
        this.log(jeuLarge ? 'JEU_LARGE' : 'PASSE', this.possession, `${jeuLarge ? 'Jeu au large' : 'Passe'} de l'equipe ${this.possession}`);
        this.porteur = cible;
        this._receptionDirecte = false;
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

    // Vol puis résolution d'un coup de pied tactique : sortie en touche (avec
    // l'exception loi 19.2 du 22 m), contest aérien (chandelle/chip) ou simple
    // récupération par l'équipe la mieux placée (dégagement/occupation).
    _tickCoupDePiedJeu(dt) {
      this.timerPhase += dt;
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
      const type = this.typeCoupDePiedJeu;
      const cibleX = Math.max(0, Math.min(LONGUEUR, this.cibleCoupDePiedX));
      const horsTerrain = this.cibleCoupDePiedY <= 0.01 || this.cibleCoupDePiedY >= LARGEUR - 0.01;

      if (horsTerrain) {
        // Touche : un coup de pied direct en touche depuis son propre 22
        // conserve le lancer pour l'équipe qui a botté (loi 19.2) ; sinon la
        // touche revient à l'équipe adverse, comme pour toute sortie en touche.
        const zoneKickeur = this._zoneTerrain({ x: this.xCoupDePiedJeu, sensAttaque: equipeKick === 'A' ? 1 : -1 });
        const conserveTouche = zoneKickeur === 'OWN_22';
        const equipeQuiSort = conserveTouche ? (equipeKick === 'A' ? 'B' : 'A') : equipeKick;
        this._accorderTouche(equipeQuiSort, { x: cibleX, y: Math.max(0, Math.min(LARGEUR, this.cibleCoupDePiedY)) });
        return;
      }

      const { joueur: chasseurProche, distance: dChasseur } = joueurLePlusProche(chasseurs, cibleX, this.cibleCoupDePiedY);
      const { joueur: receveurProche, distance: dReceveur } = joueurLePlusProche(receveurs, cibleX, this.cibleCoupDePiedY);
      const contestable = type === 'CHANDELLE' || type === 'CHIP';
      const probaChasseurGagne = contestable
        ? Math.max(0.15, Math.min(0.55, 0.4 - (dChasseur - dReceveur) / 20))
        : Math.max(0.03, Math.min(0.2, 0.08 - (dChasseur - dReceveur) / 30));
      const chasseurGagne = this.rng() < probaChasseurGagne;
      const joueur = chasseurGagne ? chasseurProche : receveurProche;
      joueur.x = cibleX;
      joueur.y = Math.max(0, Math.min(LARGEUR, this.cibleCoupDePiedY));
      this.porteur = joueur;
      this.possession = joueur.team;
      this.ruckPoint = { x: joueur.x, y: joueur.y };

      // Marque (loi 11) : réception propre dans son propre en-deçà des 22 m.
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
      const margeRecul = 3;
      const delaiGrace = 1.5;

      // Joueurs qui convergent vers le point de ruck (le(s) contestant(s)
      // défensif(s) et les soutiens d'attaque) : chacun garde une position
      // décalée en rosette autour du point plutôt que de viser la même
      // coordonnée — deux joueurs ne peuvent pas occuper la même place.
      const placerEnRosette = (j, recul, i) => {
        const cx = pt.x - sensAttaque * recul * (0.5 + (i % 2) * 0.5);
        const cy = pt.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.7;
        avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.7);
      };
      let iContestants = 0, iSoutien = 0;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        const estContestant = this.contestants.includes(j.numero) && j.team !== this.possession;
        const estSoutienAttaque = j.team === this.possession && distance(j, pt) < 8;

        if (estContestant) { placerEnRosette(j, 1, iContestants++); continue; }
        if (estSoutienAttaque) { placerEnRosette(j, -1, iSoutien++); continue; }

        if (j.team !== this.possession && Referee.horsJeuRuck(j, pt, sensAttaque)) {
          // Se replier vers la zone ONSIDE (au-delà du point de ruck, côté de
          // son propre en-but), pas plus profondément dans la zone hors-jeu.
          const cibleX = sensAttaque > 0 ? pt.x + margeRecul : pt.x - margeRecul;
          avancer(j, cibleX - j.x, pt.y - j.y, dt, vitesseMs(j));
          if (this.timerPhase > delaiGrace && Referee.horsJeuRuck(j, pt, sensAttaque)) {
            this._traiterPenalite(this.possession, { x: this.porteur.x, y: this.porteur.y });
            return;
          }
        }
      }
      // Temps sans aucun soutien d'attaque proche du point de ruck (porteur
      // isolé au sol, ou soutien arrivé en retard) : accru ce tick si AUCUN
      // coéquipier n'est venu sécuriser le ballon, jamais réinitialisé tant que
      // le ruck dure — c'est ce cumul qui pèse sur le risque de turnover/pénalité.
      if (iSoutien === 0) this.ruckTempsSansSoutien = (this.ruckTempsSansSoutien || 0) + dt;
      const dureeCible = this.ruckDureeCible || 1.8;
      if (this.timerPhase >= dureeCible) {
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
        if (engagementTotal > 80 && ecartForces < 35 && this.rng() < 0.10) {
          this.log('MELEE_RUCK_INJOUABLE', equipeOriginale, `Ballon injouable au ruck, melee pour l'equipe ${equipeOriginale}`);
          this._accorderMeleeA(equipeOriginale, pt);
          return;
        }

        // Porteur isolé (pas de soutien arrivé à temps) : risque accru de
        // turnover ou, si le porteur s'accroche au ballon sans soutien,
        // pénalité directe pour "ballon non rendu" plutôt qu'un turnover propre.
        const bonusIsolement = Math.min(0.22, (this.ruckTempsSansSoutien || 0) * 0.15);
        const probaTurnover = Math.max(0.04, Math.min(0.45, 0.12 + (forceDef - forceAtt) / 700 + bonusIsolement));
        const turnover = this.rng() < probaTurnover;
        if (turnover) {
          this.possession = this.possession === 'A' ? 'B' : 'A';
          this.stats[this.possession].turnovers++;
          this.log('TURNOVER', this.possession, `Ballon gratte au ruck, equipe ${this.possession} recupere`);
        } else if ((this.ruckTempsSansSoutien || 0) > 1.5 && this.rng() < 0.12) {
          this.log('PENALITE_RUCK_ISOLE', equipeOriginale, `Porteur isole au ruck, ballon non rendu, penalite pour l'equipe adverse`);
          this._traiterPenalite(equipeOriginale === 'A' ? 'B' : 'A', pt);
          return;
        }
        // Sortie de ruck : c'est le demi de mêlée (n°9) qui joue le ballon au
        // pied du regroupement, comme à la mêlée, à la touche et à la sortie
        // de maul — pas simplement l'avant le plus proche du point de ruck.
        // S'il est lui-même au sol (rare, juste plaqué), un autre avant relaie.
        const att = this.attaquants();
        const neuf = att.find(j => j.numero === 9 && j.auSol === 0);
        let relayeur = neuf;
        if (!relayeur) {
          ({ joueur: relayeur } = joueurLePlusProche(att.filter(j => j.tendance >= 50), pt.x, pt.y));
        } else {
          // Sortie nette (le 9 a bien récupéré le ballon) : il le transmet
          // presque toujours immédiatement à l'ouvreur, qui décide du jeu.
          this.log('RUCK_SORTIE_9', this.possession, `Sortie de ruck par le 9, transmission a l'ouvreur`);
          relayeur = this._neufVersDix(att, neuf);
        }
        this.porteur = relayeur || att.find(j => j.numero === 8) || att[0];
        this.porteur.x = pt.x;
        this.porteur.y = pt.y;
        this._imposerRecuperationRuck(pt);
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    // === Maul (loi 17) : machine à états complète ============================
    // Initialise l'objet maul et bascule la phase moteur sur 'MAUL'. À partir de
    // là, _tickMaul fait avancer la machine à états jusqu'à la sortie du ballon,
    // la mêlée (ballon injouable) ou une pénalité.
    _formerMaul(porteur, defenseur) {
      const poss = this.possession;
      const sens = porteur.sensAttaque;
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
      this.stats[poss].mauls++;
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
      // Joueurs non liés : rester en-deçà de leur ligne de hors-jeu (onside).
      const cibleAtt = m.x - m.sens * 3;
      for (const j of att) {
        if (liesAtt.includes(j) || j === this.porteur) continue;
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
      // Préparer le porteur bénéficiaire puis appliquer la pénalité (tir/jeu rapide).
      this.possession = benef;
      const eqB = benef === 'A' ? this.equipeA : this.equipeB;
      const { joueur } = joueurLePlusProche(eqB, pos.x, pos.y);
      this.porteur = joueur;
      this.porteur.x = Math.max(0, Math.min(LONGUEUR, pos.x));
      this.porteur.y = Math.max(0, Math.min(LARGEUR, pos.y));
      this._traiterPenalite(benef, pos);
    }

    // Sortie du ballon après « use it » : le demi de mêlée (n°9) joue le ballon,
    // le jeu reprend à la main au pied du maul.
    _maulSortieBallon() {
      const m = this.maul;
      const poss = m.equipePossession;
      const x = Math.max(0, Math.min(LONGUEUR, m.x - m.sens * 1.5));
      const y = m.y;
      this.log('MAUL_BALLON_SORTI', poss, `Ballon sorti du maul par le demi de melee, l'equipe ${poss} relance`);
      this._finMaul();
      this.possession = poss;
      const eqMaul = poss === 'A' ? this.equipeA : this.equipeB;
      this.porteur = this._neufVersDix(eqMaul, eqMaul[8]);
      this.porteur.x = x;
      this.porteur.y = y;
      this._imposerRecuperationRuck({ x: m.x, y: m.y });
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Ballon injouable : mêlée à l'équipe désignée par la loi 8 (défense, ou
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
      this.possession = equipe;
      this.stats[equipe].scrums++;
      this.log('MELEE', this.possession, `Melee, introduction pour l'equipe ${this.possession}`);
      const eq = equipe === 'A' ? this.equipeA : this.equipeB;
      this.porteur = this._neufVersDix(eq, eq[8]);
      this.porteur.x = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      this.porteur.y = Math.max(5, Math.min(LARGEUR - 5, position.y));
      this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
      this.phase = 'MELEE';
      this.timerPhase = 0;
    }

    _finMaul() {
      this.maul = null;
      this.contestants = [];
    }

    // Mêlée (lois 19/20) : les avants se regroupent réellement (première ligne
    // contre première ligne) plutôt que de figer le jeu courant, les lignes
    // arrières défensives doivent respecter les 5 m de hors-jeu jusqu'à la
    // sortie du ballon, et le paquet le plus puissant peut faire gratter le
    // ballon contre le sens de l'introduction (jamais garanti, comme au ruck).
    _tickMelee(dt) {
      this.timerPhase += dt;
      const pt = this.ruckPoint;
      const sensAttaque = this.porteur.sensAttaque;
      const equipeAtt = this.possession === 'A' ? this.equipeA : this.equipeB;
      const equipeDef = this.possession === 'A' ? this.equipeB : this.equipeA;

      const placerPaquet = (equipe, recul) => {
        const avants = equipe.filter(j => j.numero <= 8);
        avants.forEach((j, i) => {
          const cx = pt.x - sensAttaque * recul * (0.5 + (i % 3) * 0.4);
          const cy = pt.y + ((i % 2) ? -1 : 1) * Math.ceil((i + 1) / 2) * 0.6;
          avancer(j, cx - j.x, cy - j.y, dt, vitesseMs(j) * 0.7);
        });
      };
      placerPaquet(equipeAtt, -1);
      placerPaquet(equipeDef, 1);

      // Hors-jeu (loi 19/20) : les arrières défenseurs doivent rester à 5 m du
      // point d'introduction jusqu'à la sortie du ballon ; un délai de grâce
      // leur laisse le temps de se replier avant d'être sifflés (même logique
      // qu'au ruck).
      const margeBacks = 5;
      const delaiGrace = 1.5;
      for (const j of equipeDef) {
        if (j.numero <= 8) continue;
        const limite = sensAttaque > 0 ? pt.x - margeBacks : pt.x + margeBacks;
        const enInfraction = sensAttaque > 0 ? j.x < limite : j.x > limite;
        if (enInfraction) {
          avancer(j, limite - j.x, pt.y - j.y, dt, vitesseMs(j));
          const toujoursEnInfraction = sensAttaque > 0 ? j.x < limite : j.x > limite;
          if (this.timerPhase > delaiGrace && toujoursEnInfraction) {
            this._traiterPenalite(this.possession, { x: pt.x, y: pt.y });
            return;
          }
        }
      }

      // Durée totale de la mêlée (formation, liaison, poussée, sortie du
      // ballon) : un vrai engagement de mêlée prend bien plus que quelques
      // secondes en match réel (~10-15 s entre l'introduction et la sortie).
      // Compressée comme les autres temps d'arrêt sur un format démo court
      // (cf. _echelleArret) pour laisser plus de place au jeu courant.
      if (this.timerPhase >= 12 * this._echelleArret) {
        // Poussée des paquets (même proxy de force que le ruck/maul,
        // forceMaul), sur les 8 avants de chaque équipe : un paquet plus
        // puissant fait gratter le ballon plus souvent côté défense, sans
        // jamais rendre l'issue certaine.
        let forceAtt = 0, forceDef = 0;
        for (const j of equipeAtt) if (j.numero <= 8) forceAtt += forceMaul(j);
        for (const j of equipeDef) if (j.numero <= 8) forceDef += forceMaul(j);
        const probaTurnover = Math.max(0.03, Math.min(0.25, 0.08 + (forceDef - forceAtt) / 900));
        if (this.rng() < probaTurnover) {
          this.possession = this.possession === 'A' ? 'B' : 'A';
          this.stats[this.possession].turnovers++;
          this.log('TURNOVER', this.possession, `Ballon talonne contre le sens de l'introduction, equipe ${this.possession} recupere a la melee`);
          const eqNouv = this.possession === 'A' ? this.equipeA : this.equipeB;
          this.porteur = this._neufVersDix(eqNouv, eqNouv[8]);
        }
        this.porteur.x = pt.x;
        this.porteur.y = pt.y;
        this._imposerRecuperationRuck(pt);
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    // Touche (loi 18) : véritable contest au saut, pondéré par la force des
    // avants engagés (même proxy que ruck/maul/mêlée) — le lanceur ne conserve
    // pas systématiquement son propre lancer. Une touche gagnée dans les 22 m
    // adverses est la voie PRINCIPALE de formation d'un maul (catch-and-drive),
    // pas une mêlée aléatoire en plein champ.
    _tickTouche(dt) {
      this.timerPhase += dt;
      // Alignement, lancer et contestation au saut pris dans leur ensemble :
      // une touche réelle prend bien plus que 2 s entre l'arrêt de jeu et la
      // remise en mouvement du ballon (~10-15 s en match réel). Compressée
      // comme les autres temps d'arrêt sur un format démo court (cf.
      // _echelleArret) pour laisser plus de place au jeu courant.
      if (this.timerPhase < 12 * this._echelleArret) return;
      const lanceur = this.possession;
      const adversaire = lanceur === 'A' ? 'B' : 'A';
      const eqLanceur = lanceur === 'A' ? this.equipeA : this.equipeB;
      const eqAdverse = adversaire === 'A' ? this.equipeA : this.equipeB;
      const pt = this.ruckPoint;

      this.stats[lanceur].lineouts++;
      let forceLanceur = 0, forceAdverse = 0;
      for (const j of eqLanceur) if (j.numero <= 8) forceLanceur += forceMaul(j);
      for (const j of eqAdverse) if (j.numero <= 8) forceAdverse += forceMaul(j);
      const probaVolAdverse = Math.max(0.06, Math.min(0.30, 0.14 + (forceAdverse - forceLanceur) / 900));
      const vole = this.rng() < probaVolAdverse;
      const gagnant = vole ? adversaire : lanceur;
      this.stats[gagnant].lineoutsGagnes++;
      if (vole) {
        this.stats[adversaire].turnovers++;
        this.log('TURNOVER', adversaire, `Touche volee, l'equipe ${adversaire} recupere le ballon`);
      }
      this.possession = gagnant;
      const eqGagnante = gagnant === 'A' ? this.equipeA : this.equipeB;
      this.porteur = this._neufVersDix(eqGagnante, eqGagnante[8]);
      this.porteur.x = pt.x;
      // pt.y est le point exact de sortie en touche (sur la ligne) : on récupère
      // plutôt la position resserrée de 5 m calculée à l'octroi de la touche, sinon
      // le porteur démarre sur la ligne de touche et la sort à nouveau immédiatement.
      this.porteur.y = this.toucheLanceurY != null ? this.toucheLanceurY : pt.y;

      if (!vole) {
        const zone = this._zoneTerrain(this.porteur);
        const tauxMaulTouche = (zone === 'OPP_22' || zone === 'CINQ_M') ? 0.45 : 0.08;
        if (this.rng() < tauxMaulTouche) {
          const { joueur: defenseurProche } = joueurLePlusProche(eqAdverse, this.porteur.x, this.porteur.y);
          this._formerMaul(this.porteur, defenseurProche);
          return;
        }
      }
      this._imposerRecuperationRuck(pt);
      this.phase = 'PORTE';
      this.timerPhase = 0;
    }

    // Célébration de l'essai avant l'enchaînement sur la transformation : en
    // match réel, l'arbitre laisse un temps mort notable (replays, retour au
    // sol, replacement) avant que le botteur ne s'installe.
    _tickEssai(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 8 * this._echelleArret) {
        // Place le buteur (l'ouvreur) dans l'alignement de l'essai : sinon
        // tous les joueurs restent figés là où l'essai a été marqué et rien
        // n'indique qu'une transformation va être tentée.
        const eq = this.essaiEquipe === 'A' ? this.equipeA : this.equipeB;
        const sens = this.essaiEquipe === 'A' ? 1 : -1;
        const kicker = eq[9];
        kicker.x = Math.max(0, Math.min(LONGUEUR, this.essaiX - sens * 10));
        kicker.y = this.essaiY;
        this.porteur = kicker;
        this.phase = 'TRANSFORMATION';
        this.timerPhase = 0;
      }
    }

    // Transformation : tentative de coup de pied au but (+2) depuis l'alignement
    // de l'essai, conformément à la loi (le botteur peut reculer mais pas changer d'axe).
    // Durée réaliste : placement du ballon, recul du botteur, course d'élan et
    // frappe prennent ~20-25 s en match réel, pas 2 s.
    _tickTransformation(dt) {
      this.timerPhase += dt;
      const duree = 25 * this._echelleArret;
      // Le ballon s'envole vers les poteaux pendant la dernière fraction du
      // temps d'arrêt (le reste, c'est le placement et la course d'élan) :
      // réutilise le mécanisme de vol du coup d'envoi pour rendre la frappe
      // visible à l'écran, au lieu de 25 s où rien ne bouge.
      const dureeVol = Math.min(1.4, duree * 0.3);
      const debutVol = duree - dureeVol;
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

    // Coup de pied de pénalité au but (+3), résolu après un temps d'arrêt
    // réaliste (placement, recul, course d'élan, frappe : ~20-25 s en match réel).
    _tickPenaliteTir(dt) {
      this.timerPhase += dt;
      const duree = 25 * this._echelleArret;
      // Même principe que pour la transformation : le ballon vole vers les
      // poteaux pendant la dernière fraction du temps d'arrêt.
      const dureeVol = Math.min(1.4, duree * 0.3);
      const debutVol = duree - dureeVol;
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
          // et y meurt : remise en jeu en 22m (loi 13), botté par l'équipe
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
        if (j.auSol > 0) j.auSol = Math.max(0, j.auSol - dt);
        if (j.missCooldown > 0) j.missCooldown = Math.max(0, j.missCooldown - dt);
        if (j.ruckRecovery > 0) j.ruckRecovery = Math.max(0, j.ruckRecovery - dt);
        if (j.sinBin > 0) j.sinBin = Math.max(0, j.sinBin - dt);
      }
      // Temps de jeu effectif (ballon vivant) : phases où le jeu est réellement
      // en cours, à l'exclusion des arrêts (essai/transformation/pénalité au
      // but/mi-temps) et de la formation mêlée/touche (liaison des paquets,
      // alignement avant lancer : le ballon n'est pas encore vivant). Mesuré
      // tick par tick, jamais recalculé après coup.
      if (this.phase === 'PORTE' || this.phase === 'RUCK' || this.phase === 'MAUL'
        || this.phase === 'COUP_ENVOI' || this.phase === 'COUP_DE_PIED_JEU') {
        this.tempsJeuEffectif += dt;
      }
      this.tempsMatch += dt;
      if (this.tempsMatch >= this.dureeMatch) {
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
      if (!this.miTempsJouee && this.tempsMatch >= this.dureeMiTemps) {
        this.miTempsJouee = true;
        this.log('MI_TEMPS', null, `Mi-temps : equipe A ${this.score.A} - ${this.score.B} equipe B`);
        this.phase = 'MI_TEMPS';
        this.timerPhase = 0;
        return;
      }
      if (this.phase === 'MI_TEMPS') this._tickMiTemps(dt);
      else if (this.phase === 'PORTE') this._tickPorte(dt);
      else if (this.phase === 'COUP_ENVOI') this._tickCoupEnvoi(dt);
      else if (this.phase === 'COUP_DE_PIED_JEU') this._tickCoupDePiedJeu(dt);
      else if (this.phase === 'RUCK') this._tickRuck(dt);
      else if (this.phase === 'MAUL') this._tickMaul(dt);
      else if (this.phase === 'MELEE') this._tickMelee(dt);
      else if (this.phase === 'TOUCHE') this._tickTouche(dt);
      else if (this.phase === 'ESSAI') this._tickEssai(dt);
      else if (this.phase === 'TRANSFORMATION') this._tickTransformation(dt);
      else if (this.phase === 'PENALITE_TIR') this._tickPenaliteTir(dt);
    }

    // Forme normalisée du ballon (cf. docs/index.html refonte modulaire) :
    // un objet indépendant du porteur, avec un état explicite plutôt qu'une
    // simple référence d'objet joueur. Vitesse en m/s, dérivée de la cible et
    // de la durée de vol pendant un coup d'envoi ; nulle sinon (le ballon
    // "tenu" n'a pas de vitesse propre, il suit le porteur).
    _etatBallon() {
      if (this.ballonEnVol) return 'AIR';
      if (this.phase === 'RUCK') return 'RUCK';
      if (this.phase === 'MAUL') return 'MAUL';
      if (this.phase === 'TOUCHE') return 'OUT';
      return 'CARRIED';
    }

    getState() {
      const enVol = this.ballonEnVol;
      let bvx = 0, bvy = 0;
      if (enVol) {
        const dxVol = this.ballonCibleX - this.xCoupEnvoi;
        const dyVol = this.ballonCibleY - LARGEUR / 2;
        const duree = Math.max(0.9, Math.min(2.0, Math.hypot(dxVol, dyVol) / 18));
        bvx = dxVol / duree;
        bvy = dyVol / duree;
      }
      return {
        equipeA: this.equipeA.map(j => ({ ...j })),
        equipeB: this.equipeB.map(j => ({ ...j })),
        porteur: { team: this.porteur.team, numero: this.porteur.numero, x: this.porteur.x, y: this.porteur.y },
        // Position réelle du ballon : en vol pendant un coup d'envoi (avec une
        // hauteur 0..1 pour figurer la cloche), sinon dans les mains du porteur.
        // Conservé pour compatibilité avec le rendu existant.
        ballon: enVol
          ? { x: this.ballonVolX, y: this.ballonVolY, enVol: true, hauteur: this.ballonVolHauteur }
          : { x: this.porteur.x, y: this.porteur.y, enVol: false, hauteur: 0 },
        // Objet ballon normalisé : { x, y, vx, vy, state, carrierTeam, carrierNumber }.
        // À terme, c'est cette forme qui doit devenir la source de vérité côté
        // rendu (docs/js/renderer.js) ; `ballon`/`porteur` restent en place tant
        // que la migration du rendu n'est pas terminée.
        ball: {
          x: enVol ? this.ballonVolX : this.porteur.x,
          y: enVol ? this.ballonVolY : this.porteur.y,
          vx: bvx, vy: bvy,
          state: this._etatBallon(),
          carrierTeam: enVol ? null : this.porteur.team,
          carrierNumber: enVol ? null : this.porteur.numero,
        },
        arbitre: this._positionArbitre(),
        possession: this.possession,
        phase: this.phase,
        // État détaillé du maul en cours (null hors maul), pour l'affichage.
        maul: this.maul ? { etat: this.maul.etat, x: this.maul.x, y: this.maul.y } : null,
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
      };
    }
  }

  return { MatchEngine, LONGUEUR, LARGEUR, creerRng, distance };
});
