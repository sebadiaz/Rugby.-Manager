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
      if (this.phase === 'RUCK' || this.phase === 'MELEE') {
        return { x: this.ruckPoint.x, y: Math.max(0, Math.min(LARGEUR, this.ruckPoint.y - 5)) };
      }
      const p = this.porteur;
      return { x: p.x, y: Math.max(0, Math.min(LARGEUR, p.y - 6)) };
    }

    attaquants() { return this.possession === 'A' ? this.equipeA : this.equipeB; }
    defenseurs() { return this.possession === 'A' ? this.equipeB : this.equipeA; }

    // --- Mêlée suite à infraction : avantage + relance pour l'équipe non fautive ---
    _accorderMelee(equipeFautive, position) {
      this.possession = equipeFautive === 'A' ? 'B' : 'A';
      const equipe = this.possession === 'A' ? this.equipeA : this.equipeB;
      this.porteur = equipe[8];
      this.porteur.x = Math.max(5, Math.min(LONGUEUR - 5, position.x));
      this.porteur.y = Math.max(5, Math.min(LARGEUR - 5, position.y));
      this.phase = 'MELEE';
      this.timerPhase = 0;
    }

    _tickPorte(dt) {
      const porteur = this.porteur;
      const def = this.defenseurs();
      const { joueur: defenseurProche, distance: distDef } = joueurLePlusProche(def, porteur.x, porteur.y);

      const dx = porteur.sensAttaque * 6;
      const evite = (porteur.y - defenseurProche.y) > 0 ? 2.5 : -2.5;
      avancer(porteur, dx, evite, dt, vitesseMs(porteur));

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
            this.log('PENALITE', this.possession, `Penalite hors-jeu, equipe ${this.possession} avance`);
            this.porteur.x += sensAttaque * 8;
            this.porteur.x = Math.max(0, Math.min(LONGUEUR, this.porteur.x));
            this.phase = 'PORTE';
            this.timerPhase = 0;
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

    _tickEssai(dt) {
      this.timerPhase += dt;
      if (this.timerPhase >= 1.5) {
        const prochainPossesseur = this.possession === 'A' ? 'B' : 'A';
        this._nouvelleManche(prochainPossesseur);
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
      else if (this.phase === 'ESSAI') this._tickEssai(dt);
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
