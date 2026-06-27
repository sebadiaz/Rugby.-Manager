// Point d'entrée : démarre/relance des matchs, fait tourner la boucle de
// rendu, et relie les boutons de contrôle à l'état du match. Délègue le
// dessin à RMRenderer, le HUD à RMUI, les constantes à RMConstants — aucune
// règle de jeu ici, seulement de l'orchestration.
(function () {
  'use strict';

  const { MatchEngine } = window.RugbyEngine;
  const { DUREE_MATCH, PAS_FIXE } = window.RMConstants;
  const { normalizeMatchState } = window.RMMatchState;
  const Renderer = window.RMRenderer;
  const UI = window.RMUI;
  const Rng = window.RMRng;

  function graineAleatoire() {
    return Math.floor(Rng.random() * 0xffffffff);
  }

  const canvas = document.getElementById('pitch');
  Renderer.init(canvas);

  function tailleZones() {
    return {
      hudH: document.getElementById('hud').offsetHeight,
      seekH: document.getElementById('seekZone').offsetHeight,
      ctrlH: document.getElementById('controls').offsetHeight,
    };
  }
  function redimensionner() {
    const { hudH, seekH, ctrlH } = tailleZones();
    Renderer.redimensionner(hudH, seekH, ctrlH);
    // La bannière d'arbitre est ancrée en haut à droite, sous le HUD (dont
    // la hauteur varie avec le contenu du fil d'événements) plutôt qu'au
    // centre de l'écran, pour ne pas masquer l'action sur le terrain.
    document.getElementById('banner').style.top = (hudH + 8) + 'px';
  }
  window.addEventListener('resize', redimensionner);

  let match = null;
  let seedActuel = graineAleatoire();

  function demarrerNouveauMatch(seed, duree) {
    seedActuel = seed;
    match = new MatchEngine(seed, duree);
    UI.reinitialiserSuivi();
    accumulateur = 0;
    dernierEtatMelee = null;
    miniPauseJusqua = 0;
    etatPrecedent = null;
    etatCourant = null;
    document.getElementById('seek').max = duree;
    document.getElementById('seek').value = 0;
    document.getElementById('tempsLabelFin').textContent = UI.formaterTemps(duree);
    document.getElementById('btnSauver').disabled = true;
    UI.majAffichage(normalizeMatchState(match.getState()), DUREE_MATCH);
  }

  // Reproduit l'état du match au temps `cible` en rejouant depuis le début
  // avec la même graine et le même pas fixe : c'est ce qui rend le match
  // "rejouable à tout moment" (la simulation est déterministe, donc rejouer
  // == recalculer).
  function avancerJusqua(cible) {
    const m = new MatchEngine(seedActuel, DUREE_MATCH);
    const nbPas = Math.round(cible / PAS_FIXE);
    for (let i = 0; i < nbPas; i++) m.tick(PAS_FIXE);
    return m;
  }

  let enCours = true;
  let vitesseSim = 1;
  let dernierTs = null;
  let accumulateur = 0;
  // Interpolation de rendu : le moteur n'avance que par pas fixes de 0,1 s,
  // mais l'écran rafraîchit à ~60 fps. Sans interpolation, chaque position est
  // figée ~6 images puis « saute » d'un coup — le mouvement paraît saccadé, pas
  // animé. On garde donc l'état AVANT et APRÈS le dernier pas et on affiche une
  // position interpolée selon la fraction de pas écoulée : les joueurs et le
  // ballon glissent de façon continue. Purement visuel, le moteur est intact.
  let etatPrecedent = null;
  let etatCourant = null;

  function lerp(a, b, f) { return a + (b - a) * f; }
  function interpolerJoueurs(ja, jb, f) {
    return jb.map((joueur, i) => {
      const p = ja[i];
      return p ? Object.assign({}, joueur, { x: lerp(p.x, joueur.x, f), y: lerp(p.y, joueur.y, f) }) : joueur;
    });
  }
  function interpolerPoint(pa, pb, f) {
    return (pa && pb) ? Object.assign({}, pb, { x: lerp(pa.x, pb.x, f), y: lerp(pa.y, pb.y, f) }) : pb;
  }
  // Au-delà d'un certain saut (reprise de jeu : coup d'envoi, replacement), on
  // n'interpole pas (sinon un joueur « file » à toute vitesse à travers le
  // terrain sur 0,1 s) : on bascule directement sur la nouvelle position.
  function sautTropGrand(a, b) {
    if (!a || !b) return true;
    return Math.hypot(b.x - a.x, b.y - a.y) > 4; // > vitesse de course réelle sur un pas
  }
  function interpolerEtat(a, b, f) {
    if (!a || f >= 1) return b;
    return Object.assign({}, b, {
      teams: {
        A: interpolerJoueurs(a.teams.A, b.teams.A, f),
        B: interpolerJoueurs(a.teams.B, b.teams.B, f),
      },
      ball: sautTropGrand(a.ball, b.ball) ? b.ball : interpolerPoint(a.ball, b.ball, f),
      ballon: (a.ballon && b.ballon && !sautTropGrand(a.ballon, b.ballon))
        ? Object.assign({}, b.ballon, { x: lerp(a.ballon.x, b.ballon.x, f), y: lerp(a.ballon.y, b.ballon.y, f) })
        : b.ballon,
      arbitre: interpolerPoint(a.arbitre, b.arbitre, f),
      porteur: sautTropGrand(a.porteur, b.porteur) ? b.porteur : interpolerPoint(a.porteur, b.porteur, f),
    });
  }

  // Mini-pause automatique sur mêlée : chaque étape (formation, Crouch,
  // Bind, Set, introduction, contestation, sortie) est sinon trop rapide
  // pour être vraiment vue (durées compressées sur un match démo de 5 min,
  // cf. _echelleArret dans le moteur). On gèle l'avancée du temps de
  // simulation (pas le rendu) une fraction de seconde à chaque changement
  // d'étape, pour que le joueur voie réellement le déroulé de la mêlée.
  const MINI_PAUSE_MELEE_MS = 700;
  let dernierEtatMelee = null;
  let miniPauseJusqua = 0;

  function boucle(ts) {
    if (dernierTs === null) dernierTs = ts;
    const dtReel = Math.min(0.05, (ts - dernierTs) / 1000);
    dernierTs = ts;
    const etatMeleeActuel = match.phase === 'MELEE' && match.melee ? match.melee.etat : null;
    if (etatMeleeActuel !== dernierEtatMelee) {
      dernierEtatMelee = etatMeleeActuel;
      if (etatMeleeActuel) miniPauseJusqua = ts + MINI_PAUSE_MELEE_MS;
    }
    const enMiniPause = ts < miniPauseJusqua;
    if (etatCourant === null) etatCourant = normalizeMatchState(match.getState());
    if (enCours && !enMiniPause) {
      accumulateur += dtReel * vitesseSim;
      while (accumulateur >= PAS_FIXE) {
        etatPrecedent = etatCourant;
        match.tick(PAS_FIXE);
        etatCourant = normalizeMatchState(match.getState());
        accumulateur -= PAS_FIXE;
      }
    }
    // Fraction de pas écoulée depuis le dernier tick : position interpolée.
    const frac = (enCours && !enMiniPause && etatPrecedent)
      ? Math.max(0, Math.min(1, accumulateur / PAS_FIXE)) : 1;
    const etatRendu = frac < 1 ? interpolerEtat(etatPrecedent, etatCourant, frac) : etatCourant;
    UI.majAffichage(etatCourant, DUREE_MATCH);
    Renderer.dessiner(etatRendu);
    requestAnimationFrame(boucle);
  }

  document.getElementById('btnPlay').addEventListener('click', (e) => {
    enCours = !enCours;
    e.target.textContent = enCours ? 'Pause' : 'Lecture';
  });
  document.getElementById('btnSpeed').addEventListener('click', (e) => {
    vitesseSim = vitesseSim === 1 ? 2 : (vitesseSim === 2 ? 4 : 1);
    e.target.textContent = `Vitesse x${vitesseSim}`;
  });
  document.getElementById('btnNouveau').addEventListener('click', () => {
    demarrerNouveauMatch(graineAleatoire(), DUREE_MATCH);
  });

  document.getElementById('seek').addEventListener('input', (e) => {
    const cible = Number(e.target.value);
    match = avancerJusqua(cible);
    accumulateur = 0;
    dernierEtatMelee = null;
    miniPauseJusqua = 0;
    etatPrecedent = null;
    etatCourant = null;
    document.getElementById('tempsLabel').textContent = UI.formaterTemps(cible);
  });

  document.getElementById('btnSauver').addEventListener('click', () => {
    const state = match.getState();
    UI.enregistrerResultat(seedActuel, DUREE_MATCH, state.score);
    UI.rafraichirPanneauHistorique(onRevoirHistorique);
  });
  document.getElementById('btnHistorique').addEventListener('click', () => {
    UI.rafraichirPanneauHistorique(onRevoirHistorique);
    document.getElementById('panneauHistorique').classList.add('visible');
  });
  document.getElementById('fermerHistorique').addEventListener('click', () => {
    document.getElementById('panneauHistorique').classList.remove('visible');
  });
  document.getElementById('btnStats').addEventListener('click', () => {
    UI.rafraichirPanneauStats(normalizeMatchState(match.getState()));
    document.getElementById('panneauStats').classList.add('visible');
  });
  document.getElementById('fermerStats').addEventListener('click', () => {
    document.getElementById('panneauStats').classList.remove('visible');
  });
  document.getElementById('btnLegende').addEventListener('click', () => {
    document.getElementById('panneauLegende').classList.add('visible');
  });
  document.getElementById('fermerLegende').addEventListener('click', () => {
    document.getElementById('panneauLegende').classList.remove('visible');
  });

  function onRevoirHistorique(entree) {
    demarrerNouveauMatch(entree.seed, entree.duree);
    enCours = true;
    document.getElementById('btnPlay').textContent = 'Pause';
    document.getElementById('panneauHistorique').classList.remove('visible');
  }

  redimensionner();
  demarrerNouveauMatch(seedActuel, DUREE_MATCH);
  requestAnimationFrame(boucle);
})();
