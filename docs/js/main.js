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
  // Config paramétrable chargée avant le match (docs/rugby-config.json) :
  // caractéristiques des joueurs, combinaisons de touche, sorties de mêlée,
  // organisation attaque/défense. `null` = valeurs par défaut du moteur.
  // Chargée de façon asynchrone au démarrage ; si le chargement échoue (ex.
  // ouverture en file://), on garde le comportement par défaut.
  let configMatch = null;
  // Durée du match choisie par le joueur (menu déroulant). Par défaut la démo
  // de 5 min ; un match complet (80 min) montre un score et des statistiques
  // crédibles (~48-55 pts, 6-7 essais), invisibles sur 5 min faute de temps de
  // jeu. Le moteur accepte déjà n'importe quelle durée (new MatchEngine(seed,
  // duree, cfg)) : rien à changer côté simulation.
  let dureeMatchActuel = DUREE_MATCH;
  function lireDureeChoisie() {
    const sel = document.getElementById('selDuree');
    const v = sel ? Number(sel.value) : DUREE_MATCH;
    return Number.isFinite(v) && v > 0 ? v : DUREE_MATCH;
  }

  function afficherVueMatch() {
    document.getElementById('panneauAccueil').classList.remove('visible');
    document.getElementById('panneauGeneration').classList.remove('visible');
    document.getElementById('panneauMenu').classList.remove('visible');
    document.getElementById('vueMatch').style.display = '';
    redimensionner();
  }
  function afficherAccueil() {
    enCours = false;
    document.getElementById('vueMatch').style.display = 'none';
    document.getElementById('panneauGeneration').classList.remove('visible');
    document.getElementById('panneauMenu').classList.remove('visible');
    document.getElementById('panneauAccueil').classList.add('visible');
  }

  // GÉNÉRATION EN ARRIÈRE-PLAN : le match complet (jusqu'à 80 min = 48000 pas)
  // est simulé d'un coup par lots (setTimeout entre chaque lot pour ne pas
  // geler l'onglet), sur un moteur JETABLE avec la même graine — la
  // simulation est déterministe, donc la VRAIE lecture (si le joueur choisit
  // de la lancer, cf. plus bas) rejouera exactement le même match. Le joueur
  // voit une barre de progression pendant le calcul ; `onTermine` reçoit
  // l'état final normalisé (score, stats) une fois le match entièrement généré.
  // `cfg` est passé explicitement (pas lu depuis `configMatch`) pour pouvoir
  // aussi simuler des matchs tiers (Mode Club : les autres rencontres de la
  // journée) SANS toucher à la config du match réellement affiché ensuite.
  // Ne masque PAS le panneau à la fin : laissé aux appelants, pour pouvoir
  // enchaîner plusieurs simulations (une journée entière) sans clignoter.
  const PAS_PAR_LOT = 400; // ~40 s de jeu par lot : fluide (plusieurs lots/s), UI jamais bloquée longtemps
  function genererMatchEnArrierePlan(seed, duree, cfg, titre, onTermine) {
    // Referme le menu s'il était ouvert (ex. la durée vient d'être changée
    // depuis le menu) : sinon il resterait affiché AU-DESSUS de l'écran de
    // génération puis du résultat (tous deux ouverts bien avant que la vraie
    // lecture — et donc afficherVueMatch — ne démarre), bloquant les clics.
    document.getElementById('panneauMenu').classList.remove('visible');
    document.getElementById('panneauGeneration').classList.add('visible');
    const titreEl = document.getElementById('genTitre');
    if (titreEl) titreEl.textContent = titre || 'Génération du match…';
    const barre = document.getElementById('genProgressBar');
    const label = document.getElementById('genProgressLabel');
    barre.style.width = '0%';
    const genEngine = new MatchEngine(seed, duree, cfg);
    function lot() {
      let i = 0;
      while (i < PAS_PAR_LOT && genEngine.tempsMatch < duree && genEngine.phase !== 'TERMINE') {
        genEngine.tick(PAS_FIXE);
        i++;
      }
      const frac = Math.max(0, Math.min(1, genEngine.tempsMatch / duree));
      barre.style.width = (frac * 100) + '%';
      label.textContent = `${UI.formaterTemps(genEngine.tempsMatch)} / ${UI.formaterTemps(duree)}`;
      if (genEngine.tempsMatch < duree && genEngine.phase !== 'TERMINE') {
        setTimeout(lot, 0);
      } else {
        onTermine(normalizeMatchState(genEngine.getState()));
      }
    }
    lot();
  }

  // `noms` ({A,B}) donne les noms de club affichés dans le HUD/les stats
  // pendant CE match (Mode Club) ; par défaut (Match rapide, historique) on
  // retombe sur les libellés génériques "Equipe A"/"Equipe B".
  function demarrerLectureReelle(seed, duree, noms) {
    UI.definirNomsEquipes(noms);
    demarrerNouveauMatch(seed, duree);
    enCours = true;
    document.getElementById('btnPlay').textContent = 'Pause';
    afficherVueMatch();
    assurerBoucle();
  }

  // Point d'entrée commun pour lancer un NOUVEAU match : génère d'abord en
  // arrière-plan (voir ci-dessus). Le résultat est ACQUIS dès la génération
  // terminée (opts.onResultat reçoit l'état final tout de suite, que le
  // joueur regarde le match ou non) ; « voir le match » n'est qu'une option
  // proposée ensuite — le joueur peut fermer directement sur le résultat.
  // opts.direct=true saute l'écran de choix et lance la lecture tout de
  // suite (utilisé pour « Revoir » un match déjà connu depuis l'historique).
  // opts.noms ({A,B}) : noms de club à afficher (Mode Club uniquement).
  // opts.equipeJoueur ('A'|'B') : si fourni, affiche un badge Victoire/Nul/
  // Défaite du point de vue de cette équipe (Mode Club uniquement — un Match
  // rapide n'a pas de "camp du joueur", donc pas de badge).
  function lancerNouveauMatchAvecGeneration(seed, duree, opts) {
    const { onResultat, onFermer, direct, noms, equipeJoueur } = opts || {};
    const nomA = (noms && noms.A) || 'Equipe A';
    const nomB = (noms && noms.B) || 'Equipe B';
    genererMatchEnArrierePlan(seed, duree, configMatch, null, (etatFinal) => {
      document.getElementById('panneauGeneration').classList.remove('visible');
      if (onResultat) onResultat(etatFinal);
      if (direct) { demarrerLectureReelle(seed, duree, noms); return; }
      const s = etatFinal.stats;
      document.getElementById('resultatScore').textContent =
        `${nomA} ${etatFinal.score.A} — ${etatFinal.score.B} ${nomB}`;
      document.getElementById('resultatDetail').textContent = s
        ? `${s.A.essais} essai(s) contre ${s.B.essais} · possession ${etatFinal.possessionPct.A}% / ${etatFinal.possessionPct.B}%`
        : '';
      const badge = document.getElementById('resultatBadge');
      if (equipeJoueur) {
        const autre = equipeJoueur === 'A' ? 'B' : 'A';
        const pour = etatFinal.score[equipeJoueur], contre = etatFinal.score[autre];
        const forme = pour > contre ? 'v' : pour < contre ? 'd' : 'n';
        badge.textContent = forme === 'v' ? 'Victoire' : forme === 'd' ? 'Défaite' : 'Match nul';
        badge.className = `badgeResultat ${forme}`;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
      document.getElementById('panneauResultat').classList.add('visible');
      document.getElementById('btnResultatVoir').onclick = () => {
        document.getElementById('panneauResultat').classList.remove('visible');
        demarrerLectureReelle(seed, duree, noms);
      };
      document.getElementById('btnResultatFermer').onclick = () => {
        document.getElementById('panneauResultat').classList.remove('visible');
        if (onFermer) onFermer();
      };
    });
  }

  function demarrerNouveauMatch(seed, duree) {
    seedActuel = seed;
    dureeMatchActuel = duree;
    match = new MatchEngine(seed, duree, configMatch);
    UI.reinitialiserSuivi();
    accumulateur = 0;
    dernierEtatMelee = null;
    miniPauseJusqua = 0;
    etatPrecedent = null;
    etatCourant = null;
    ballonRendu = null; // nouveau match : le ballon se pose net, sans glisser depuis l'ancienne marque
    document.getElementById('seek').max = duree;
    document.getElementById('seek').value = 0;
    document.getElementById('tempsLabelFin').textContent = UI.formaterTemps(duree);
    // btnSauver est masqué/affiché par UI.majAffichage selon la phase (cf. ui.js).
    // La vitesse de lecture est PARAMÉTRABLE par le joueur (bouton Vitesse) et
    // PERSISTE : on ne la réinitialise pas à chaque nouveau match ni changement
    // de durée. On garde donc simplement `vitesseSim` tel que le joueur l'a réglé.
    UI.majAffichage(normalizeMatchState(match.getState()), duree);
  }

  // Reproduit l'état du match au temps `cible` en rejouant depuis le début
  // avec la même graine et le même pas fixe : c'est ce qui rend le match
  // "rejouable à tout moment" (la simulation est déterministe, donc rejouer
  // == recalculer).
  function avancerJusqua(cible) {
    const m = new MatchEngine(seedActuel, dureeMatchActuel, configMatch);
    const nbPas = Math.round(cible / PAS_FIXE);
    for (let i = 0; i < nbPas; i++) m.tick(PAS_FIXE);
    return m;
  }

  let enCours = true;
  // Le match est une VRAIE simulation de 80 min (durée choisie au menu), rejouée
  // en AVANCE RAPIDE. La VITESSE DE LECTURE est PARAMÉTRABLE par le joueur via le
  // bouton Vitesse et persiste (jamais réinitialisée). Paliers de x1 (temps réel,
  // pour savourer) à x16 (pour SAUTER en avant). Repère : à ~x4 le rendu reste
  // fluide et lisible (une passe dure ~0,5 s de jeu) ; au-delà l'action défile
  // vite (utile pour avancer dans le match, moins pour suivre le ballon).
  // Le moteur tourne à temps de jeu réel ; seul l'AFFICHAGE est accéléré.
  const PALIERS_VITESSE = [1, 2, 4, 8, 16];
  const VITESSE_INITIALE = 4; // départ regardable ; le joueur ajuste ensuite librement
  function appliquerVitesse(v) {
    vitesseSim = v;
    const b = document.getElementById('btnSpeed');
    if (b) b.textContent = `Vitesse x${v}`;
  }
  let vitesseSim = VITESSE_INITIALE;
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
  // Le ballon, lui, est interpolé même sur des sauts plus grands (jusqu'à 14 m)
  // pour qu'il GLISSE au lieu de se téléporter sur les transferts (sortie de
  // ruck, mise en jeu, mise sur la marque) : seuls les très grands placements
  // de reprise (renvoi à 50 m, ballon posé pour un coup d'envoi) ne sont pas
  // interpolés. Le vol des passes/coups de pied est déjà animé en continu.
  function sautBallonTropGrand(a, b) {
    if (!a || !b) return true;
    return Math.hypot(b.x - a.x, b.y - a.y) > 14;
  }
  function interpolerEtat(a, b, f) {
    if (!a || f >= 1) return b;
    return Object.assign({}, b, {
      teams: {
        A: interpolerJoueurs(a.teams.A, b.teams.A, f),
        B: interpolerJoueurs(a.teams.B, b.teams.B, f),
      },
      ball: sautBallonTropGrand(a.ball, b.ball) ? b.ball : interpolerPoint(a.ball, b.ball, f),
      ballon: (a.ballon && b.ballon && !sautBallonTropGrand(a.ballon, b.ballon))
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
  // Inutile sur un match complet : les arrêts y durent leur temps réel (la
  // mêlée s'étale déjà sur plusieurs secondes même en avance rapide), et
  // ces pauses casseraient la cible « tout le match en ~5 min ».
  const MINI_PAUSE_MELEE_MS = 700;
  const SEUIL_MINI_PAUSE = 600; // seulement pour la démo compressée (≤ 10 min)
  let dernierEtatMelee = null;
  let miniPauseJusqua = 0;

  // GLISSEMENT DU BALLON : le ballon a une position « rendue » qui rejoint sa
  // position logique à vitesse bornée, au lieu de « sauter » d'un coup sur les
  // relocalisations (marque de mêlée quand on siffle un en-avant, centre au coup
  // d'envoi, point de coup de pied, changement de porteur lointain). Le ballon
  // GLISSE ainsi jusqu'à la marque, il ne se téléporte jamais. Les vols (coup de
  // pied/coup d'envoi) ne sont pas bridés : ils sont déjà animés en cloche.
  let ballonRendu = null;
  function positionBallonLogique(st) {
    if (st.ballon && st.ballon.enVol) return { x: st.ballon.x, y: st.ballon.y, enVol: true };
    if (st.ball && (st.ball.state === 'LOOSE' || st.ball.state === 'RUCK')) return { x: st.ball.x, y: st.ball.y };
    if (st.porteur) return { x: st.porteur.x, y: st.porteur.y };
    return st.ballon ? { x: st.ballon.x, y: st.ballon.y } : null;
  }

  function boucle(ts) {
    if (dernierTs === null) dernierTs = ts;
    const dtReel = Math.min(0.05, (ts - dernierTs) / 1000);
    dernierTs = ts;
    const etatMeleeActuel = match.phase === 'MELEE' && match.melee ? match.melee.etat : null;
    if (etatMeleeActuel !== dernierEtatMelee) {
      dernierEtatMelee = etatMeleeActuel;
      if (etatMeleeActuel && dureeMatchActuel <= SEUIL_MINI_PAUSE) miniPauseJusqua = ts + MINI_PAUSE_MELEE_MS;
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
    // Position rendue du ballon : glisse vers sa cible logique à ~55 m/s de JEU
    // (donc rapide en avance rapide, posé et visible en temps réel). En vol, on
    // colle exactement à la trajectoire (déjà animée). En pause, on colle aussi.
    const dtGame = (enCours && !enMiniPause) ? dtReel * vitesseSim : 0;
    const cibleBallon = positionBallonLogique(etatRendu);
    if (cibleBallon) {
      if (!ballonRendu || cibleBallon.enVol || dtGame === 0) {
        ballonRendu = { x: cibleBallon.x, y: cibleBallon.y };
      } else {
        const dx = cibleBallon.x - ballonRendu.x, dy = cibleBallon.y - ballonRendu.y;
        const dist = Math.hypot(dx, dy);
        const pas = Math.min(dist, 55 * dtGame);
        if (dist > 1e-4) { ballonRendu.x += (dx / dist) * pas; ballonRendu.y += (dy / dist) * pas; }
      }
      etatRendu.ballonRendu = { x: ballonRendu.x, y: ballonRendu.y };
    }
    UI.majAffichage(etatCourant, dureeMatchActuel);
    Renderer.dessiner(etatRendu);
    requestAnimationFrame(boucle);
  }

  // La boucle de rendu ne démarre qu'une seule fois, au premier match réellement
  // visualisé (depuis l'accueil) — pas au chargement de la page, qui affiche
  // désormais la page d'accueil sans match en cours.
  let boucleDemarree = false;
  function assurerBoucle() {
    if (boucleDemarree) return;
    boucleDemarree = true;
    requestAnimationFrame(boucle);
  }

  document.getElementById('btnPlay').addEventListener('click', (e) => {
    enCours = !enCours;
    e.target.textContent = enCours ? 'Pause' : 'Lecture';
  });
  document.getElementById('btnSpeed').addEventListener('click', () => {
    // Palier jusqu'à x16 : le joueur peut ralentir pour savourer une action ou
    // accélérer ; la barre de progression permet aussi de sauter aux temps forts.
    const i = PALIERS_VITESSE.indexOf(vitesseSim);
    appliquerVitesse(PALIERS_VITESSE[(i + 1) % PALIERS_VITESSE.length]);
  });
  document.getElementById('btnNouveau').addEventListener('click', () => {
    lancerNouveauMatchAvecGeneration(graineAleatoire(), lireDureeChoisie(), { onFermer: afficherAccueil });
  });
  // Changer la durée relance immédiatement un match de cette durée (même graine
  // conservée pour comparer), pour que le choix soit visible tout de suite —
  // mais ça abandonne le match affiché, donc on prévient avant (sinon un tap
  // sur ce réglage, dans le menu à côté d'actions anodines comme "Stats",
  // efface silencieusement un match en cours sans qu'on l'ait demandé).
  document.getElementById('selDuree').addEventListener('change', () => {
    if (!window.confirm('Changer la durée relance un nouveau match et abandonne celui en cours. Continuer ?')) {
      document.getElementById('selDuree').value = String(dureeMatchActuel);
      return;
    }
    lancerNouveauMatchAvecGeneration(seedActuel, lireDureeChoisie(), { onFermer: afficherAccueil });
  });
  document.getElementById('btnAccueil').addEventListener('click', () => {
    afficherAccueil();
  });

  // Menu (Accueil/Stats/Historique/Mode Club/Règles/Durée) regroupé dans un
  // panneau à part : la barre de contrôles reste à une seule rangée, avec des
  // boutons assez grands pour être tapés sans viser (Lecture/Vitesse toujours
  // visibles, le reste à un tap de distance plutôt qu'entassé en permanence).
  document.getElementById('btnMenu').addEventListener('click', () => {
    document.getElementById('panneauMenu').classList.add('visible');
  });
  document.getElementById('fermerMenu').addEventListener('click', () => {
    document.getElementById('panneauMenu').classList.remove('visible');
  });
  // N'importe quel bouton d'action dans le menu (Nouveau match, Stats,
  // Historique, Mode Club, Règles, Accueil) referme le menu lui-même — sinon
  // il resterait affiché sous le panneau ouvert, et "Fermer" sur ce panneau
  // ramènerait au menu plutôt qu'au match.
  document.getElementById('panneauMenu').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.id !== 'fermerMenu') {
      document.getElementById('panneauMenu').classList.remove('visible');
    }
  });

  document.getElementById('seek').addEventListener('input', (e) => {
    const cible = Number(e.target.value);
    match = avancerJusqua(cible);
    accumulateur = 0;
    dernierEtatMelee = null;
    miniPauseJusqua = 0;
    etatPrecedent = null;
    etatCourant = null;
    ballonRendu = null; // saut dans le temps : le ballon se pose net à la nouvelle position
    document.getElementById('tempsLabel').textContent = UI.formaterTemps(cible);
  });

  document.getElementById('btnSauver').addEventListener('click', () => {
    const state = match.getState();
    UI.enregistrerResultat(seedActuel, dureeMatchActuel, state.score);
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
    document.getElementById('panneauHistorique').classList.remove('visible');
    // Un match déjà rejoué depuis l'historique va droit à la visualisation
    // (le joueur a déjà choisi « Revoir », pas besoin de reproposer le choix).
    lancerNouveauMatchAvecGeneration(entree.seed, entree.duree, { direct: true });
  }

  // --- Page d'accueil : point d'entrée du jeu, affichée au chargement. Le
  // match n'est plus démarré automatiquement — le joueur choisit une action,
  // le match est alors généré en arrière-plan (barre de progression) puis la
  // visualisation démarre. ---
  document.getElementById('btnAccueilMatchRapide').addEventListener('click', () => {
    const duree = Number(document.getElementById('selDureeAccueil').value) || DUREE_MATCH;
    document.getElementById('selDuree').value = String(duree); // reste cohérent pour "Nouveau match" ensuite
    lancerNouveauMatchAvecGeneration(graineAleatoire(), duree);
  });
  document.getElementById('btnAccueilModeClub').addEventListener('click', () => {
    document.getElementById('btnModeClub').click();
  });
  document.getElementById('btnAccueilHistorique').addEventListener('click', () => {
    UI.rafraichirPanneauHistorique(onRevoirHistorique);
    document.getElementById('panneauHistorique').classList.add('visible');
  });
  document.getElementById('btnAccueilLegende').addEventListener('click', () => {
    document.getElementById('panneauLegende').classList.add('visible');
  });

  redimensionner();
  appliquerVitesse(VITESSE_INITIALE); // affiche la vitesse de départ sur le bouton, avant même le 1er match
  // Charge la config paramétrable en arrière-plan ; si le chargement échoue
  // (fichier absent, ouverture en file://), le jeu garde les valeurs par
  // défaut du moteur — aucun blocage de la page d'accueil dans tous les cas.
  if (typeof fetch === 'function') {
    fetch('rugby-config.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => { if (cfg) { delete cfg._lisezMoi; configMatch = cfg; } })
      .catch(() => { /* pas de config : valeurs par défaut */ });
  }

  // API minimale exposée pour le Mode Club (docs/js/clubUI.js) : lancer un
  // match avec des effectifs de club (joueursA/joueursB) sur le MÊME canvas,
  // la même boucle de rendu et les mêmes contrôles que le Match rapide — pas
  // de second moteur de rendu à maintenir. Aucun changement du comportement
  // par défaut : tant que rien n'appelle demarrerMatchClub, le Match rapide
  // fonctionne exactement comme avant.
  window.RMMain = {
    // `callbacks.onResultat(etatFinal)` est appelé dès que le match est généré
    // (score connu, avant même que le joueur choisisse de le regarder) : c'est
    // le moment où clubUI.js doit enregistrer le résultat dans la saison — le
    // résultat est acquis, « voir le match » n'est qu'une option ensuite.
    // `callbacks.onFermer()` est appelé si le joueur ferme l'écran de résultat
    // sans regarder (pour rouvrir le panneau Club).
    // `callbacks.noms` ({A,B}) : noms des deux clubs, affichés dans le HUD/les
    // stats à la place des libellés génériques "Equipe A"/"Equipe B" si le
    // joueur regarde le match.
    demarrerMatchClub(seed, duree, joueursA, joueursB, callbacks) {
      configMatch = Object.assign({}, configMatch, { joueursA, joueursB });
      lancerNouveauMatchAvecGeneration(seed, duree, callbacks);
    },
    // Simule un match COMPLET en arrière-plan sans jamais l'afficher (Mode
    // Club : les autres rencontres de la journée, jouées par l'IA en même
    // temps que celui du joueur — cf. clubUI.js). Réutilise l'écran de
    // génération (même barre de progression, titre personnalisable) mais ne
    // le masque pas à la fin : l'appelant enchaîne d'autres simulations ou
    // passe au match du joueur, qui le masquera lui-même en terminant.
    simulerMatchEnArrierePlan(seed, duree, joueursA, joueursB, titre, onTermine) {
      const cfg = Object.assign({}, configMatch, { joueursA, joueursB });
      genererMatchEnArrierePlan(seed, duree, cfg, titre, onTermine);
    },
    // Efface joueursA/joueursB pour revenir aux effectifs par défaut du
    // moteur (utilisé en quittant le Mode Club vers le Match rapide).
    reinitialiserConfigClub() {
      if (configMatch) { delete configMatch.joueursA; delete configMatch.joueursB; }
    },
    etatActuel() {
      return match ? normalizeMatchState(match.getState()) : null;
    },
  };
})();
