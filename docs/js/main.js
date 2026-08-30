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
  // Réglages tactiques PAR ÉQUIPE (Mode Club) que configMatch peut accumuler
  // au fil des matchs successifs — cf. simulerMatchEnArrierePlan, qui les
  // efface avant chaque simulation en arrière-plan pour ne jamais laisser un
  // réglage du dernier match du premier XV contaminer un match d'Équipe B ou
  // d'Espoirs (TODO_AUDIT.md P1-18), même liste que reinitialiserConfigClub.
  const CLES_TACTIQUE_PAR_EQUIPE = [
    'attaqueA', 'attaqueB', 'defenseA', 'defenseB', 'meleeA', 'meleeB',
    'toucheA', 'toucheB', 'ruckA', 'ruckB', 'buteurA', 'buteurB',
    'toucheLanceurA', 'toucheLanceurB', 'remplacements',
  ];
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

  // --- Feuille de match (TODO_AUDIT.md P1-52) ------------------------------
  //
  // Avant, la fin d'un match affichait un badge, un score et une ligne de
  // détail. Le manager ne savait ni qui avait marqué, ni quand, ni si le
  // match s'était joué en première ou en seconde période. Un score seul n'est
  // pas un match.
  //
  // Tout ce qui s'affiche ici vient de `state.chronologie` (les faits
  // marquants réellement produits par la simulation) et de `state.stats` (des
  // compteurs réellement incrémentés). Rien n'est reconstitué après coup.
  function echapperTexte(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function rendreFeuilleDeMatch(etatFinal, nomA, nomB) {
    const zone = document.getElementById('resultatFeuille');
    if (!zone) return;
    const RM = window.RMClub;
    if (!RM || !RM.feuilleDeMatch || !RM.htmlFeuilleDeMatch) { zone.innerHTML = ''; return; }
    // Un seul rendu dans le jeu (cf. club-feuille-de-match.js) : le même
    // compte rendu s'affiche ici et en rouvrant la rencontre au calendrier.
    zone.innerHTML = RM.htmlFeuilleDeMatch(RM.feuilleDeMatch(etatFinal, { nomA, nomB }));
  }

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
      rendreFeuilleDeMatch(etatFinal, nomA, nomB);
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

  // --- Match JOUÉ (P0-match) ----------------------------------------------
  //
  // Le chemin historique (genererMatchEnArrierePlan puis relecture) laisse le
  // résultat ACQUIS avant la première image : le manager regarde un film.
  // Ici, le match n'est simulé QUE par la boucle de rendu, et `onResultat`
  // n'est appelé qu'au coup de sifflet final. Tout ce que le manager décide
  // en route change donc réellement la suite (cf.
  // server/test-match-interactif.js).
  //
  // Le chemin instantané reste disponible et par défaut : jouer un match dure
  // le temps d'un match, ce n'est pas toujours ce que le joueur veut.
  let matchLive = null;

  // Consignes de seconde période. Chacune écrit dans les VRAIES clés du
  // moteur (cf. DEFAULT_CONFIG.attaque/defense), jamais dans un champ
  // décoratif — c'est ce qui fait qu'elles changent le jeu.
  const CONSIGNES_MI_TEMPS = [
    {
      cle: 'occuper', libelle: '🦶 Occuper au pied',
      detail: 'On joue au pied pour sortir de son camp et mettre la pression sur leur arrière.',
      consignes: { attaque: { tauxJeuAuPied: 4, jeuLargeTaux: { pression: 1.1, calme: 0.9 } } },
    },
    {
      cle: 'main', libelle: '🤾 Garder le ballon à la main',
      detail: 'On enchaîne les temps de jeu et on écarte : plus de rucks, moins de ballons rendus.',
      consignes: { attaque: { tauxJeuAuPied: 0.6, jeuLargeTaux: { pression: 2.3, calme: 1.9 } } },
    },
    {
      cle: 'monter', libelle: '⚡ Monter très vite en défense',
      detail: 'La ligne monte sans temps mort : on étouffe leur ouvreur, au risque de laisser des espaces derrière.',
      consignes: { defense: { rampeMontee: 0.4, reculRuck: 3 } },
    },
    {
      cle: 'fermer', libelle: '🛡️ Défendre en retrait',
      detail: 'On recule et on couvre le fond du terrain : moins de brèches, mais on rend du terrain.',
      consignes: { defense: { rampeMontee: 4.5, profondeurArriereJeu: 26 } },
    },
  ];

  function libelleConsigneAppliquee(cle) {
    const c = CONSIGNES_MI_TEMPS.find((x) => x.cle === cle);
    return c ? c.libelle : cle;
  }

  // Affiche la mi-temps : le match est EN PAUSE, rien n'est encore décidé.
  function ouvrirMiTemps(contexte) {
    const L = matchLive;
    // `contexte` : 'miTemps' (arrêt imposé) ou 'enCours' (le manager ouvre le
    // panneau de lui-même pendant le jeu). Même écran, mêmes conséquences —
    // une consigne prise à la 62e minute vaut celle prise à la mi-temps.
    const ctx = contexte || 'miTemps';
    L.contexte = ctx;
    const titre = document.getElementById('miTempsTitre');
    if (titre) titre.textContent = ctx === 'enCours' ? 'Consigne en cours de jeu' : 'Mi-temps';
    const btnReprendre = document.getElementById('btnMiTempsReprendre');
    if (btnReprendre) btnReprendre.textContent = ctx === 'enCours' ? 'Retour au match' : 'Reprendre le match';
    enCours = false;
    document.getElementById('btnPlay').textContent = 'Play';
    const e = normalizeMatchState(match.getState());
    const nomA = (L.noms && L.noms.A) || 'Equipe A';
    const nomB = (L.noms && L.noms.B) || 'Equipe B';
    document.getElementById('miTempsScore').textContent =
      `${nomA} ${e.score.A} — ${e.score.B} ${nomB}`;
    const s = e.stats;
    document.getElementById('miTempsDetail').textContent = s
      ? `${s.A.essais} essai(s) contre ${s.B.essais} · possession ${e.possessionPct.A}% / ${e.possessionPct.B}%`
      : '';
    document.getElementById('miTempsConsignes').innerHTML = CONSIGNES_MI_TEMPS.map((c) =>
      `<button class="alt btnConsigneMiTemps${L.consignesPrises.indexOf(c.cle) !== -1 ? ' choisie' : ''}" data-cle="${c.cle}">` +
      `<b>${c.libelle}</b><span>${c.detail}</span></button>`).join('');
    const banc = L.remplacants || [];
    document.getElementById('miTempsRemplacants').innerHTML = banc.length
      ? banc.map((r, i) =>
        `<button class="alt btnRemplacantMiTemps${L.remplacementsFaits.indexOf(i) !== -1 ? ' choisie' : ''}" data-index="${i}"` +
        `${L.remplacementsFaits.indexOf(i) !== -1 ? ' disabled' : ''}>` +
        `<b>${r.nom} (${r.poste})</b><span>entre à la place du n°${r.numeroSortant}</span></button>`).join('')
      : '<p style="font-size:12px;color:var(--text-faint);margin:0;">Aucun remplaçant disponible.</p>';
    document.getElementById('panneauMiTemps').classList.add('visible');
  }

  function fermerMiTemps() {
    document.getElementById('panneauMiTemps').classList.remove('visible');
    enCours = true;
    document.getElementById('btnPlay').textContent = 'Pause';
  }

  // Coup de sifflet final d'un match JOUÉ : c'est SEULEMENT ici que le
  // résultat devient acquis et part vers la sauvegarde.
  function terminerMatchLive() {
    const L = matchLive;
    L.resultatEnvoye = true;
    const etatFinal = normalizeMatchState(match.getState());
    if (L.onResultat) L.onResultat(etatFinal);
    const nomA = (L.noms && L.noms.A) || 'Equipe A';
    const nomB = (L.noms && L.noms.B) || 'Equipe B';
    document.getElementById('resultatScore').textContent =
      `${nomA} ${etatFinal.score.A} — ${etatFinal.score.B} ${nomB}`;
    const s = etatFinal.stats;
    document.getElementById('resultatDetail').textContent = s
      ? `${s.A.essais} essai(s) contre ${s.B.essais} · possession ${etatFinal.possessionPct.A}% / ${etatFinal.possessionPct.B}%`
      : '';
    rendreFeuilleDeMatch(etatFinal, nomA, nomB);
    const badge = document.getElementById('resultatBadge');
    if (L.equipeJoueur) {
      const autre = L.equipeJoueur === 'A' ? 'B' : 'A';
      const pour = etatFinal.score[L.equipeJoueur], contre = etatFinal.score[autre];
      const forme = pour > contre ? 'v' : pour < contre ? 'd' : 'n';
      badge.textContent = forme === 'v' ? 'Victoire' : forme === 'd' ? 'Défaite' : 'Match nul';
      badge.className = `badgeResultat ${forme}`;
      badge.style.display = '';
    } else badge.style.display = 'none';
    // Le match vient d'être joué : plus rien à « voir », et surtout pas un
    // second moteur qui rejouerait sans les décisions prises.
    const btnConsigne = document.getElementById('btnConsigneMatch');
    if (btnConsigne) btnConsigne.style.display = 'none';
    const btnQuitter = document.getElementById('btnQuitterMatch');
    if (btnQuitter) btnQuitter.style.display = 'none';
    document.getElementById('btnResultatVoir').style.display = 'none';
    document.getElementById('panneauResultat').classList.add('visible');
    const onFermer = L.onFermer;
    document.getElementById('btnResultatFermer').onclick = () => {
      document.getElementById('panneauResultat').classList.remove('visible');
      document.getElementById('btnResultatVoir').style.display = '';
      if (onFermer) onFermer();
    };
    matchLive = null;
  }

  function lancerMatchJoue(seed, duree, opts) {
    const o = opts || {};
    matchLive = {
      onResultat: o.onResultat, onFermer: o.onFermer, onAbandon: o.onAbandon, noms: o.noms,
      equipeJoueur: o.equipeJoueur, equipe: o.equipeJoueur || 'A',
      remplacants: o.remplacants || [],
      consignesPrises: [], remplacementsFaits: [],
      miTempsTraitee: false, resultatEnvoye: false,
    };
    const btn = document.getElementById('btnConsigneMatch');
    if (btn) btn.style.display = '';
    // Sortie EXPLICITE d'un match joué en direct : le manager doit pouvoir
    // quitter sans aller la chercher dans le menu (signalé en jeu : « je ne
    // peux plus sortir »). Le bouton n'existe que pendant un match joué —
    // une relecture, elle, se ferme déjà par son écran de résultat.
    const btnQ = document.getElementById('btnQuitterMatch');
    if (btnQ) btnQ.style.display = '';
    demarrerLectureReelle(seed, duree, o.noms);
  }

  // Quitter un match JOUÉ avant le coup de sifflet final.
  //
  // `onResultat` n'arrive qu'à la fin d'un match joué : sortir en route ne
  // remonte donc RIEN à l'appelant. Sans ce point de sortie, le Mode Club
  // restait verrouillé sur une journée qui ne se terminerait jamais — bouton
  // « Continuer » cliquable mais inerte, bouton flottant grisé, carrière
  // bloquée (signalé en jeu). `onAbandon` prévient l'appelant que la journée
  // n'a PAS eu lieu, à lui de la rendre rejouable.
  // Renvoie true si un match joué a réellement été abandonné.
  function abandonnerMatchLive() {
    if (!matchLive || matchLive.resultatEnvoye) return false;
    const onAbandon = matchLive.onAbandon;
    matchLive = null;
    const btn = document.getElementById('btnConsigneMatch');
    if (btn) btn.style.display = 'none';
    const btnQ = document.getElementById('btnQuitterMatch');
    if (btnQ) btnQ.style.display = 'none';
    fermerMiTemps();
    if (onAbandon) onAbandon();
    return true;
  }

  document.getElementById('miTempsConsignes').addEventListener('click', (e) => {
    const b = e.target.closest('.btnConsigneMiTemps');
    if (!b || !matchLive || !match) return;
    const c = CONSIGNES_MI_TEMPS.find((x) => x.cle === b.dataset.cle);
    if (!c) return;
    match.appliquerTactiqueEnCours(matchLive.equipe, c.consignes);
    if (matchLive.consignesPrises.indexOf(c.cle) === -1) matchLive.consignesPrises.push(c.cle);
    ouvrirMiTemps(matchLive.contexte);
  });

  document.getElementById('miTempsRemplacants').addEventListener('click', (e) => {
    const b = e.target.closest('.btnRemplacantMiTemps');
    if (!b || !matchLive || !match) return;
    const i = Number(b.dataset.index);
    const r = (matchLive.remplacants || [])[i];
    if (!r || matchLive.remplacementsFaits.indexOf(i) !== -1) return;
    match.remplacerJoueurEnCours(matchLive.equipe, r.numeroSortant, r.joueur);
    matchLive.remplacementsFaits.push(i);
    ouvrirMiTemps(matchLive.contexte);
  });

  document.getElementById('btnMiTempsReprendre').addEventListener('click', fermerMiTemps);

  // Consigne PENDANT le jeu : le manager n'attend pas la mi-temps pour réagir
  // au score. Le moteur accepte déjà un changement à tout instant
  // (appliquerTactiqueEnCours) — il ne manquait que l'accès.
  document.getElementById('btnConsigneMatch').addEventListener('click', () => {
    if (!matchLive || !match || matchLive.resultatEnvoye) return;
    ouvrirMiTemps('enCours');
  });

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
    // Match JOUÉ (P0-match) : la mi-temps met le jeu en pause pour laisser le
    // manager décider, et le coup de sifflet final est le SEUL moment où le
    // résultat part vers la sauvegarde.
    if (matchLive) {
      if (!matchLive.miTempsTraitee && match.miTempsJouee) {
        matchLive.miTempsTraitee = true;
        ouvrirMiTemps('miTemps');
      }
      if (!matchLive.resultatEnvoye && match.phase === 'TERMINE') terminerMatchLive();
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
    // Lancer autre chose abandonne le match joué en cours : le prévenir,
    // sinon la journée de Mode Club resterait verrouillée dans le vide.
    abandonnerMatchLive();
    // Un vrai Match rapide ne doit jamais hériter d'une config de club
    // laissée par une précédente journée (cf. reinitialiserConfigClub) —
    // fait ici, au moment de démarrer un Match rapide, jamais juste après un
    // résultat de club (sinon "Voir le match" rejouerait avec la mauvaise config).
    window.RMMain.reinitialiserConfigClub();
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
  document.getElementById('btnQuitterMatch').addEventListener('click', () => {
    if (!window.confirm('Quitter le match en cours ? Il n\'aura pas eu lieu et tu pourras le relancer.')) return;
    abandonnerMatchLive();
    // Le Mode Club reprend la main via onAbandon ; hors Mode Club, on revient
    // à l'accueil comme n'importe quelle sortie de match.
    if (!document.getElementById('panneauClub').classList.contains('visible')) afficherAccueil();
  });
  document.getElementById('btnAccueil').addEventListener('click', () => {
    abandonnerMatchLive();
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

  // Échap referme le calque ouvert le plus "au-dessus" (aucun de ces
  // panneaux n'écoutait le clavier jusqu'ici, seul un clic sur leur bouton
  // dédié fonctionnait). Ne touche jamais au Mode Club (panneauClub), qui
  // gère ses propres calques indépendamment (cf. clubUI.js) — les deux
  // contextes ne sont jamais actifs en même temps.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const id of ['panneauLegende', 'panneauStats', 'panneauHistorique', 'panneauMenu']) {
      const p = document.getElementById(id);
      if (p && p.classList.contains('visible')) { p.classList.remove('visible'); return; }
    }
  });

  function onRevoirHistorique(entree) {
    document.getElementById('panneauHistorique').classList.remove('visible');
    // Un historique enregistré ne porte jamais de composition/tactique de
    // club (seulement seed/durée/score) — sans ce nettoyage, "Revoir"
    // hériterait d'une config de club encore active depuis une dernière
    // journée jouée en Mode Club, et rejouerait un déroulé différent de
    // celui réellement enregistré (même bug que reinitialiserConfigClub
    // ailleurs dans ce fichier).
    window.RMMain.reinitialiserConfigClub();
    // Un match déjà rejoué depuis l'historique va droit à la visualisation
    // (le joueur a déjà choisi « Revoir », pas besoin de reproposer le choix).
    lancerNouveauMatchAvecGeneration(entree.seed, entree.duree, { direct: true });
  }

  // --- Page d'accueil : point d'entrée du jeu, affichée au chargement. Le
  // match n'est plus démarré automatiquement — le joueur choisit une action,
  // le match est alors généré en arrière-plan (barre de progression) puis la
  // visualisation démarre. ---
  document.getElementById('btnAccueilMatchRapide').addEventListener('click', () => {
    // Idem "Nouveau match" : repart d'une config saine, sans résidu d'une
    // précédente journée de Mode Club (cf. reinitialiserConfigClub).
    window.RMMain.reinitialiserConfigClub();
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
    // Quitter un match JOUÉ en direct avant la fin (cf. abandonnerMatchLive) :
    // appelé par le Mode Club quand le manager revient à son club en cours de
    // match. Renvoie true si un match joué a bien été interrompu.
    abandonnerMatchLive,
    // `callbacks.onResultat(etatFinal)` est appelé dès que le match est généré
    // (score connu, avant même que le joueur choisisse de le regarder) : c'est
    // le moment où clubUI.js doit enregistrer le résultat dans la saison — le
    // résultat est acquis, « voir le match » n'est qu'une option ensuite.
    // `callbacks.onFermer()` est appelé si le joueur ferme l'écran de résultat
    // sans regarder (pour rouvrir le panneau Club).
    // `callbacks.noms` ({A,B}) : noms des deux clubs, affichés dans le HUD/les
    // stats à la place des libellés génériques "Equipe A"/"Equipe B" si le
    // joueur regarde le match.
    // `tactiqueCfg` ({attaqueA?/attaqueB?/defenseA?/defenseB?}) : réglages
    // tactiques PAR ÉQUIPE (Mode Club, cf. RMClub.tactiqueVersConfig) —
    // n'affecte que le club du joueur, jamais l'IA adverse.
    demarrerMatchClub(seed, duree, joueursA, joueursB, tactiqueCfg, callbacks) {
      // Repart d'une base sans tactique par équipe avant de réappliquer
      // celle de CE match : le club du joueur alterne domicile/extérieur
      // (donc de lettre A/B) d'un match à l'autre — sans ce nettoyage, un
      // réglage resté sous 'attaqueA' depuis un match précédent où le club
      // du joueur jouait côté A pourrait contaminer l'ADVERSAIRE du match
      // suivant si le club du joueur joue cette fois côté B.
      const base = Object.assign({}, configMatch);
      for (const cle of CLES_TACTIQUE_PAR_EQUIPE) delete base[cle];
      configMatch = Object.assign(base, { joueursA, joueursB }, tactiqueCfg || {});
      // `callbacks.live` : le match est JOUÉ (P0-match) — rien n'est calculé
      // d'avance, et les décisions de mi-temps changent réellement la suite.
      // Sans ce drapeau, comportement historique strictement inchangé.
      if (callbacks && callbacks.live) lancerMatchJoue(seed, duree, callbacks);
      else lancerNouveauMatchAvecGeneration(seed, duree, callbacks);
    },
    // Simule un match COMPLET en arrière-plan sans jamais l'afficher (Mode
    // Club : les autres rencontres de la journée, jouées par l'IA en même
    // temps que celui du joueur — cf. clubUI.js). Réutilise l'écran de
    // génération (même barre de progression, titre personnalisable) mais ne
    // le masque pas à la fin : l'appelant enchaîne d'autres simulations ou
    // passe au match du joueur, qui le masquera lui-même en terminant.
    // `tactiqueCfg` (optionnel, TODO_AUDIT.md P1-18) : réglages tactiques PAR
    // ÉQUIPE (mêmes clés que demarrerMatchClub — attaqueA/défenseA/buteurA/
    // remplacements/...) pour les matchs simulés en arrière-plan qui ne sont
    // pas celui du premier XV (Équipe B, Espoirs) — sans lui, comportement
    // historique inchangé (aucune tactique appliquée, réglages par défaut du
    // moteur).
    simulerMatchEnArrierePlan(seed, duree, joueursA, joueursB, titre, onTermine, tactiqueCfg) {
      const base = Object.assign({}, configMatch);
      for (const cle of CLES_TACTIQUE_PAR_EQUIPE) delete base[cle];
      const cfg = Object.assign(base, { joueursA, joueursB }, tactiqueCfg || {});
      genererMatchEnArrierePlan(seed, duree, cfg, titre, onTermine);
    },
    // Efface joueursA/joueursB et toute tactique par équipe pour revenir aux
    // réglages par défaut du moteur (utilisé en quittant le Mode Club vers le
    // Match rapide) — sinon une tactique de club resterait active sur un
    // Match rapide suivant, qui n'a pourtant aucune notion de "mon club".
    reinitialiserConfigClub() {
      if (!configMatch) return;
      delete configMatch.joueursA; delete configMatch.joueursB;
      for (const cle of CLES_TACTIQUE_PAR_EQUIPE) delete configMatch[cle];
    },
    etatActuel() {
      return match ? normalizeMatchState(match.getState()) : null;
    },
  };
})();
