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

  function creerJoueur(numero, team, sensAttaque, rng) {
    const p = PROFILS[numero];
    const channelY = (numero - 0.5) / 15 * LARGEUR;
    return {
      team, numero, label: p.label,
      vitesse: p.vitesse + (rng() * 10 - 5),
      plaquage: p.plaquage + (rng() * 10 - 5),
      tendance: p.tendance,
      channelY,
      x: 0, y: channelY,
      auSol: 0,
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
      this._sequenceEvenement = 0;
      this._nouvelleManche('A');
      this.equipeKickPremiereMiTemps = this._dernierEquipeKick;
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

    attaquants() { return this.possession === 'A' ? this.equipeA : this.equipeB; }
    defenseurs() { return this.possession === 'A' ? this.equipeB : this.equipeA; }

    // --- Mêlée suite à infraction (passe en avant / en-avant) : avantage + relance
    // pour l'équipe non fautive, conformément à la loi (knock-on / forward pass). ---
    _accorderMelee(equipeFautive, position) {
      this.possession = equipeFautive === 'A' ? 'B' : 'A';
      const equipe = this.possession === 'A' ? this.equipeA : this.equipeB;
      this.porteur = equipe[8];
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
      this.porteur = equipe[8];
      this.porteur.x = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      this.porteur.y = position.y <= LARGEUR / 2 ? 5 : LARGEUR - 5;
      this.phase = 'TOUCHE';
      this.timerPhase = 0;
    }

    // --- Pénalité : selon la distance aux poteaux, l'équipe non fautive tente un
    // coup de pied au but (3 points) ou joue rapidement et avance (touche de pénalité
    // simplifiée), conformément aux options réelles de la loi sur les pénalités. ---
    _traiterPenalite(equipeBeneficiaire, position) {
      const sensAttaque = equipeBeneficiaire === 'A' ? 1 : -1;
      const distanceButs = sensAttaque > 0 ? (LONGUEUR - position.x) : position.x;
      // Essai de pénalité : quand la faute est commise tout près de la ligne
      // d'en-but adverse, elle a empêché un essai quasi certain. L'équipe non
      // fautive marque directement 7 points, sans tir ni jeu rapide.
      if (distanceButs <= 5 && this.rng() < 0.25) {
        this.score[equipeBeneficiaire] += 7;
        this.log('ESSAI_PENALITE', equipeBeneficiaire, `Essai de penalite, equipe ${equipeBeneficiaire} +7`);
        this._nouvelleManche(equipeBeneficiaire);
        return;
      }
      const enZoneDeTir = distanceButs >= 5 && distanceButs <= 45;
      if (enZoneDeTir && this.rng() < 0.55) {
        this.equipeAuTir = equipeBeneficiaire;
        this.positionTir = { x: position.x, y: position.y, distanceButs };
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

    _tickPorte(dt) {
      const porteur = this.porteur;
      const def = this.defenseurs();
      const { joueur: defenseurProche, distance: distDef } = joueurLePlusProche(def, porteur.x, porteur.y);

      const dx = porteur.sensAttaque * 6;
      const evite = (porteur.y - defenseurProche.y) > 0 ? 2.5 : -2.5;
      avancer(porteur, dx, evite, dt, vitesseMs(porteur));

      // Touche : le ballon porté au-delà de la ligne de touche est mort, jeu arrêté.
      if (porteur.y <= 0.01 || porteur.y >= LARGEUR - 0.01) {
        this._accorderTouche(this.possession, porteur);
        return;
      }

      const att = this.attaquants();
      for (const j of att) {
        if (j === porteur) continue;
        if (j.tendance >= 70) {
          const angle = (j.numero % 5) - 2;
          avancer(j, (porteur.x - j.x) + angle, (porteur.y - j.y) + angle * 0.5, dt, vitesseMs(j) * 0.9);
        } else if (j.tendance >= 30) {
          const cibleY = j.channelY * 0.4 + porteur.y * 0.6;
          const cibleX = porteur.x - porteur.sensAttaque * 4;
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.8);
        } else {
          const cibleY = j.channelY;
          const cibleX = porteur.x - porteur.sensAttaque * 7;
          avancer(j, cibleX - j.x, cibleY - j.y, dt, vitesseMs(j) * 0.6);
        }
      }

      for (const j of def) {
        if (j === defenseurProche) {
          avancer(j, porteur.x - j.x, porteur.y - j.y, dt, vitesseMs(j));
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
        porteur.x = porteur.sensAttaque > 0 ? LONGUEUR : 0;
        this.score[this.possession] += 5;
        this.essaiX = porteur.x;
        this.essaiY = porteur.y;
        this.essaiEquipe = this.possession;
        this.log('ESSAI', this.possession, `Essai equipe ${this.possession} !`);
        this.phase = 'ESSAI';
        this.timerPhase = 0;
        return;
      }

      // Tentative de passe périodique vers le meilleur soutien
      this.timerPhase += dt;
      if (this.timerPhase > 1.5 && this.rng() < 0.35 * dt) {
        const candidats = att.filter(j => j !== porteur && distance(j, porteur) <= 25);
        if (candidats.length > 0) {
          let meilleur = candidats[0], meilleurScore = -Infinity;
          for (const c of candidats) {
            const d = distance(c, porteur);
            const score = (100 - d) + c.tendance * 0.1;
            if (score > meilleurScore) { meilleurScore = score; meilleur = c; }
          }
          if (Referee.passeEnAvant(porteur.sensAttaque, porteur, meilleur)) {
            this.log('MELEE_AVANT', this.possession, `Passe en avant, equipe ${this.possession} - melee adverse`);
            this._accorderMelee(this.possession, porteur);
            return;
          }
          const distancePasse = distance(porteur, meilleur);
          const probaReussite = Math.max(0.3, Math.min(0.95, 0.9 - distancePasse / 40));
          if (this.rng() < probaReussite) {
            this.porteur = meilleur;
          } else {
            this.log('MELEE_ENAVANT', this.possession, `En-avant, equipe ${this.possession} - melee adverse`);
            this._accorderMelee(this.possession, meilleur);
            return;
          }
        }
        this.timerPhase = 0;
      }

      // Drop-goal (loi 9.A) : dans la zone de tir (8–38 m), l'équipe en
      // possession peut choisir de travailler le ballon pour son ouvreur, qui
      // tente un drop en jeu courant (ballon lâché qui rebondit puis botté entre
      // les poteaux). Choix tactique rare ; la réussite est calculée comme un
      // tir au but mais minorée, car botté en pleine action et sous pression.
      {
        const sensAttaqueDrop = porteur.sensAttaque;
        const distanceButsDrop = sensAttaqueDrop > 0 ? (LONGUEUR - porteur.x) : porteur.x;
        if (distanceButsDrop >= 8 && distanceButsDrop <= 38 && this.rng() < 0.012 * dt) {
          const offsetLateralDrop = Math.abs(porteur.y - LARGEUR / 2);
          const equipe = this.possession;
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

      // Plaquage
      if (distDef < 1.4) {
        const probaPlaquage = Math.max(0.1, Math.min(0.9, 0.5 + (defenseurProche.plaquage - this.porteur.vitesse) / 150));
        if (this.rng() < probaPlaquage) {
          this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
          this.contestants = [defenseurProche.numero];
          this.timerPhase = 0;
          // Maul (loi 17) : si le porteur reste debout (pas plaqué au sol) et qu'un
          // soutien est déjà à portée pour se lier, le ballon reste en main et le
          // jeu forme un maul plutôt qu'un ruck (ballon au sol). Sinon, plaquage
          // classique → ruck.
          const soutienProche = att.some(j => j !== porteur && distance(j, porteur) < 3);
          if (soutienProche && this.rng() < 0.3) {
            this.phase = 'MAUL';
            this.log('MAUL', this.possession, `Maul, equipe ${this.possession} maintient le ballon en jeu`);
          } else {
            this.porteur.auSol = 1.5;
            this.phase = 'RUCK';
          }
        }
      }
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
      const margeRecul = 1.5;
      const delaiGrace = 1.5;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        const estContestant = this.contestants.includes(j.numero) && j.team !== this.possession;
        const estSoutienAttaque = j.team === this.possession && distance(j, pt) < 8;

        if (estContestant || estSoutienAttaque) {
          avancer(j, pt.x - j.x, pt.y - j.y, dt, vitesseMs(j) * 0.7);
          continue;
        }

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
      if (this.timerPhase >= 1.8) {
        const turnover = this.rng() < 0.12;
        if (turnover) {
          this.possession = this.possession === 'A' ? 'B' : 'A';
          this.log('TURNOVER', this.possession, `Ballon gratte au ruck, equipe ${this.possession} recupere`);
        }
        const att = this.attaquants();
        const { joueur: relayeur } = joueurLePlusProche(att.filter(j => j.tendance >= 50), pt.x, pt.y);
        this.porteur = relayeur || att[8];
        this.porteur.x = pt.x;
        this.porteur.y = pt.y;
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    // Maul (loi 17) : le ballon reste en main (pas au sol comme au ruck), le
    // porteur est lié à ses soutiens au point de regroupement. Même ligne de
    // hors-jeu que le ruck (hindmost point). Volontairement sans avancée nette
    // automatique ni risque de turnover différent du ruck : sans modéliser la
    // poussée comparée des deux paquets, donner au maul un gain de terrain
    // garanti et peu risqué en ferait un raccourci vers l'essai qui casse
    // l'équilibre du match (constaté : essais quasi triplés en test).
    _tickMaul(dt) {
      this.timerPhase += dt;
      const pt = this.ruckPoint;
      const sensAttaque = this.porteur.sensAttaque;
      const margeRecul = 1.5;
      const delaiGrace = 1.5;

      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        const estContestant = this.contestants.includes(j.numero) && j.team !== this.possession;
        const estSoutienAttaque = j.team === this.possession && distance(j, pt) < 8;

        if (estContestant || estSoutienAttaque) {
          avancer(j, pt.x - j.x, pt.y - j.y, dt, vitesseMs(j) * 0.7);
          continue;
        }

        if (j.team !== this.possession && Referee.horsJeuRuck(j, pt, sensAttaque)) {
          const cibleX = sensAttaque > 0 ? pt.x + margeRecul : pt.x - margeRecul;
          avancer(j, cibleX - j.x, pt.y - j.y, dt, vitesseMs(j));
          if (this.timerPhase > delaiGrace && Referee.horsJeuRuck(j, pt, sensAttaque)) {
            this._traiterPenalite(this.possession, { x: this.porteur.x, y: this.porteur.y });
            return;
          }
        }
      }

      if (this.timerPhase >= 1.8) {
        // Maul arrêté (loi 17) : si le maul cesse d'avancer et que le ballon ne
        // ressort pas, l'arbitre siffle et accorde une mêlée à l'équipe qui
        // n'avait pas la possession (celle qui a stoppé le maul), comme dans les
        // vraies règles — et non un simple turnover joué à la main.
        const maulArrete = this.rng() < 0.12;
        if (maulArrete) {
          this.log('MAUL_ARRETE', this.possession, `Maul arrete, equipe ${this.possession} ne sort pas le ballon, melee adverse`);
          this._accorderMelee(this.possession, pt);
          return;
        }
        const att = this.attaquants();
        const { joueur: relayeur } = joueurLePlusProche(att.filter(j => j.tendance >= 50), pt.x, pt.y);
        this.porteur = relayeur || att[8];
        this.porteur.x = pt.x;
        this.porteur.y = pt.y;
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    _tickMelee(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 2.5) {
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    _tickTouche(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 2.5) {
        this.phase = 'PORTE';
        this.timerPhase = 0;
      }
    }

    _tickEssai(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 1.5) {
        this.phase = 'TRANSFORMATION';
        this.timerPhase = 0;
      }
    }

    // Transformation : tentative de coup de pied au but (+2) depuis l'alignement
    // de l'essai, conformément à la loi (le botteur peut reculer mais pas changer d'axe).
    _tickTransformation(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 2.0) {
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

    // Coup de pied de pénalité au but (+3), résolu après un court temps d'arrêt
    // pour que l'interface puisse afficher la tentative avant le résultat.
    _tickPenaliteTir(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 2.0) {
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
      else if (this.phase === 'RUCK') this._tickRuck(dt);
      else if (this.phase === 'MAUL') this._tickMaul(dt);
      else if (this.phase === 'MELEE') this._tickMelee(dt);
      else if (this.phase === 'TOUCHE') this._tickTouche(dt);
      else if (this.phase === 'ESSAI') this._tickEssai(dt);
      else if (this.phase === 'TRANSFORMATION') this._tickTransformation(dt);
      else if (this.phase === 'PENALITE_TIR') this._tickPenaliteTir(dt);
    }

    getState() {
      return {
        equipeA: this.equipeA.map(j => ({ ...j })),
        equipeB: this.equipeB.map(j => ({ ...j })),
        porteur: { team: this.porteur.team, numero: this.porteur.numero, x: this.porteur.x, y: this.porteur.y },
        // Position réelle du ballon : en vol pendant un coup d'envoi (avec une
        // hauteur 0..1 pour figurer la cloche), sinon dans les mains du porteur.
        ballon: this.ballonEnVol
          ? { x: this.ballonVolX, y: this.ballonVolY, enVol: true, hauteur: this.ballonVolHauteur }
          : { x: this.porteur.x, y: this.porteur.y, enVol: false, hauteur: 0 },
        arbitre: this._positionArbitre(),
        possession: this.possession,
        phase: this.phase,
        score: { ...this.score },
        tempsMatch: this.tempsMatch,
        dureeMatch: this.dureeMatch,
        periode: this.miTempsJouee ? 2 : 1,
        events: this.events.slice(),
      };
    }
  }

  return { MatchEngine, LONGUEUR, LARGEUR, creerRng, distance };
});
