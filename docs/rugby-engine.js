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
      this._sequenceEvenement = 0;
      this._nouvelleManche('A');
    }

    // type : catégorie machine-lisible de l'événement (ESSAI, PENALITE, ...) pour que
    // l'interface puisse réagir (icône, bannière) sans reparser le message en français.
    // id : identifiant croissant, pour détecter côté client "un nouvel événement vient
    // d'arriver" même après que le tableau ait été tronqué (shift) à 30 entrées.
    log(type, team, message) {
      this.events.push({ id: ++this._sequenceEvenement, type, team, message, t: this.tempsMatch });
      if (this.events.length > 30) this.events.shift();
    }

    _nouvelleManche(possessionTeam) {
      const sens = { A: 1, B: -1 };
      this.equipeA = creerEquipe('A', sens.A, this.rng);
      this.equipeB = creerEquipe('B', sens.B, this.rng);
      for (const j of [...this.equipeA, ...this.equipeB]) {
        j.x = 50;
        if (j.numero <= 8) j.y = j.channelY * 0.5 + LARGEUR * 0.25;
      }
      this.possession = possessionTeam;
      const equipe = possessionTeam === 'A' ? this.equipeA : this.equipeB;
      this.porteur = equipe[8]; // demi de mêlée, numéro 9
      this.phase = 'PORTE';
      this.timerPhase = 0;
      this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
      this.contestants = [];
      this.log('COUP_ENVOI', possessionTeam, `Coup d'envoi, equipe ${possessionTeam}`);
    }

    // Position affichable de l'arbitre : suit le point de ruck/mêlée pendant les
    // phases statiques, sinon reste juste derrière le porteur du ballon.
    _positionArbitre() {
      if (this.phase === 'RUCK' || this.phase === 'MELEE' || this.phase === 'TOUCHE') {
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
        const estAvant = j.numero <= 8;
        const recul = porteur.sensAttaque > 0 ? -(estAvant ? 1 : 3) : (estAvant ? 1 : 3);
        const cibleX = porteur.x + recul;
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

      // Plaquage
      if (distDef < 1.4) {
        const probaPlaquage = Math.max(0.1, Math.min(0.9, 0.5 + (defenseurProche.plaquage - this.porteur.vitesse) / 150));
        if (this.rng() < probaPlaquage) {
          this.porteur.auSol = 1.5;
          this.ruckPoint = { x: this.porteur.x, y: this.porteur.y };
          this.contestants = [defenseurProche.numero];
          this.phase = 'RUCK';
          this.timerPhase = 0;
        }
      }
    }

    _tickRuck(dt) {
      this.timerPhase += dt;
      const pt = this.ruckPoint;
      const sensAttaque = this.porteur.sensAttaque;
      for (const j of [...this.equipeA, ...this.equipeB]) {
        if (j === this.porteur) continue;
        const estContestant = this.contestants.includes(j.numero) && j.team !== this.possession;
        const estProche = distance(j, pt) < 8;
        if (estProche || estContestant) avancer(j, pt.x - j.x, pt.y - j.y, dt, vitesseMs(j) * 0.7);

        if (j.team !== this.possession && !estContestant) {
          if (Referee.horsJeuRuck(j, pt, sensAttaque)) {
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
        const adversaire = equipe === 'A' ? 'B' : 'A';
        this._nouvelleManche(adversaire);
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
        if (this.rng() < probaReussiteTir(distanceButs, offsetLateral)) {
          this.score[equipe] += 3;
          this.log('PENALITE_REUSSIE', equipe, `Coup de pied au but reussi, equipe ${equipe} +3`);
        } else {
          this.log('PENALITE_RATEE', equipe, `Coup de pied au but rate, equipe ${equipe}`);
        }
        const adversaire = equipe === 'A' ? 'B' : 'A';
        this._nouvelleManche(adversaire);
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
      if (this.phase === 'PORTE') this._tickPorte(dt);
      else if (this.phase === 'RUCK') this._tickRuck(dt);
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
        arbitre: this._positionArbitre(),
        possession: this.possession,
        phase: this.phase,
        score: { ...this.score },
        tempsMatch: this.tempsMatch,
        dureeMatch: this.dureeMatch,
        events: this.events.slice(),
      };
    }
  }

  return { MatchEngine, LONGUEUR, LARGEUR, creerRng, distance };
});
