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
    // La bannière d'arbitre se pose sur le BAS du HUD, jamais sous lui : posée
    // à hudH + 8 px, elle tombait sur la bordure du terrain et cachait un
    // joueur près de la touche ou de l'en-but (P2-73). Même règle qu'à son
    // affichage (cf. RMUI.placerBandeau), recalculée quand le HUD change.
    if (window.RMUI && window.RMUI.placerBandeau) window.RMUI.placerBandeau(document.getElementById('banner'));
  }
  window.addEventListener('resize', redimensionner);
  // Le HUD grandit EN COURS DE MATCH : le fil d'evenements part vide et se
  // remplit, et le bandeau passe (mesure) de 126 a 156 px. La place qu'on lui
  // reserve sur le terrain, elle, n'etait recalculee qu'au redimensionnement de
  // la fenetre et a l'ouverture de la vue match -- jamais a ce moment-la. Le
  // bandeau ecrivait donc 34 a 48 px par-dessus la pelouse, et sa derniere ligne
  // (souvent la penalite ou l'essai) etait coupee en deux par le bord superieur
  // du terrain. `#hud` est en position absolue, hors du flux : deplacer le
  // canvas ne change pas sa hauteur, il n'y a donc pas de boucle de rebond.
  if (typeof ResizeObserver === 'function') {
    const hud = document.getElementById('hud');
    let hauteurHudConnue = -1;
    new ResizeObserver(() => {
      const h = hud.offsetHeight;
      if (h !== hauteurHudConnue) { hauteurHudConnue = h; redimensionner(); }
    }).observe(hud);
  }

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
    // Feuille de match déclarée (FUNC-RM-005) : propre au club de CE match.
    'bancA', 'bancB',
    // Match de coupe (BUG-RM-001) : ne doit jamais survivre au match suivant.
    'eliminationDirecte',
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
  // Un match joué d'un coup s'arrête au COUP DE SIFFLET (phase TERMINE), pas
  // au chronomètre. Le moteur laisse une séquence de marque engagée — la
  // transformation d'un essai de la dernière seconde, un tir au but accordé
  // avant la fin — se jouer après le temps écoulé (loi du jeu : le temps ne
  // s'arrête qu'au ballon mort). Couper à `duree` perdait ces points dans le
  // score annoncé (6 % des matchs de 5 min), alors que la lecture du même match
  // les montrait : le résultat enregistré n'était pas celui qu'on voyait jouer.
  // La marge n'est qu'un garde-fou : mesuré, le sifflet vient au plus 11,5 s
  // de jeu après le temps écoulé.
  const MARGE_SIFFLET = 120;
  // `moteur.dureeMatch` : une prolongation de coupe (BUG-RM-001) allonge le
  // match au-delà de la durée demandée au lancement.
  function avantSifflet(moteur, duree) {
    return moteur.phase !== 'TERMINE' && moteur.tempsMatch < Math.max(duree, moteur.dureeMatch) + MARGE_SIFFLET;
  }
  // --- Décisions du manager rejouées sur une relecture (bugs.md FUNC-RM-003)
  //
  // Un match vécu ne se résume pas à sa graine : les consignes et les
  // remplacements du manager ont changé sa suite. Chaque moteur porte donc
  // ses décisions (`_decisions` : { equipe, remplacants, commandes }, chaque
  // commande datée au pas près), et TOUT pas de simulation passe par ici :
  // génération, affichage, barre de temps, fin jouée d'un coup, vérification
  // de fidélité. Sans décisions (match neuf, match joué en direct où elles
  // sont prises à la main), c'est un simple `tick`.
  // Groupes de postes pour le banc : première ligne (loi 3), autres avants,
  // trois-quarts (demis compris).
  function groupePoste(n) { return n <= 3 ? 'PL' : n <= 8 ? 'AV' : 'AR'; }
  function maillotsCompatibles(numeroPrevu) {
    const g = groupePoste(numeroPrevu);
    const out = [];
    for (let n = 1; n <= 15; n++) if (groupePoste(n) === g) out.push(n);
    return out;
  }
  // Le remplaçant prend la PLACE du maillot qu'il relève (couloir, tendance),
  // comme le fait déjà le banc prévu (cf. remplacementsVersConfig).
  function joueurAuMaillot(r, numero) {
    const maillot = window.RugbyEngine && window.RugbyEngine.DEFAULT_CONFIG.joueurs[numero];
    return Object.assign({}, r.joueur, maillot ? { tendance: maillot.tendance, couloir: maillot.couloir } : {});
  }
  function appliquerDecision(m, d, cmd) {
    if (cmd.type === 'consigne') {
      const c = CONSIGNES_MI_TEMPS.find((x) => x.cle === cmd.cle);
      if (c) m.appliquerTactiqueEnCours(d.equipe, c.consignes);
    } else if (cmd.type === 'remplacement') {
      const r = (d.remplacants || [])[cmd.index];
      const numero = cmd.numero || (r && r.numeroSortant);
      if (r) m.remplacerJoueurEnCours(d.equipe, numero, cmd.numero ? joueurAuMaillot(r, numero) : r.joueur, r.joueurId);
    }
  }
  function pasMoteur(m) {
    const d = m._decisions;
    if (d && d.commandes && d.commandes.length) {
      const n = m._numTick || 0;
      m._idxDecision = m._idxDecision || 0;
      while (m._idxDecision < d.commandes.length && d.commandes[m._idxDecision].tick <= n) {
        appliquerDecision(m, d, d.commandes[m._idxDecision++]);
      }
    }
    m.tick(PAS_FIXE);
  }
  // Décisions à rejouer sur le prochain match visualisé (relecture d'un match
  // vécu) ; null pour tout match neuf.
  let decisionsRelecture = null;

  function genererMatchEnArrierePlan(seed, duree, cfg, titre, onTermine, decisions) {
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
    genEngine._decisions = decisions || null;
    function lot() {
      let i = 0;
      while (i < PAS_PAR_LOT && avantSifflet(genEngine, duree)) {
        pasMoteur(genEngine);
        i++;
      }
      const frac = Math.max(0, Math.min(1, genEngine.tempsMatch / duree));
      barre.style.width = (frac * 100) + '%';
      label.textContent = `${UI.formaterTemps(genEngine.tempsMatch)} / ${UI.formaterTemps(duree)}`;
      if (avantSifflet(genEngine, duree)) {
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
    const { onResultat, onFermer, direct, noms, equipeJoueur, decisions } = opts || {};
    const nomA = (noms && noms.A) || 'Equipe A';
    const nomB = (noms && noms.B) || 'Equipe B';
    decisionsRelecture = decisions || null;
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
    }, decisions || null);
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
    // BANC (bugs.md FUNC-RM-005) : le manager choisit QUI sort, parmi les
    // maillots que le remplaçant peut tenir (loi 3 : une première ligne est
    // relevée par une première ligne ; un avant par un avant, un trois-quarts
    // par un trois-quarts). Un remplaçant déjà entré — à la main ou à sa
    // minute prévue — ne peut plus entrer.
    const banc = L.remplacants || [];
    const entres = new Map();
    for (const re of (e.remplacementsEffectues || match.remplacementsEffectues || [])) {
      // Un remplacement temporaire (protocole commotion) ne compte pas : le
      // remplaçant revient sur le banc et peut encore entrer.
      if (re.equipe === L.equipe && re.joueurId != null && !re.temporaire && !re.retour) entres.set(re.joueurId, re);
    }
    const temporaires = new Map();
    for (const p of (e.protocoles || [])) {
      if (p.equipe === L.equipe && !p.issue && p.joueurIdTemp != null) temporaires.set(p.joueurIdTemp, p);
    }
    const joueursEq = (L.equipe === 'A' ? e.teams.A : e.teams.B) || [];
    document.getElementById('miTempsRemplacants').innerHTML = banc.length
      ? banc.map((r, i) => {
        const entre = entres.get(r.joueurId);
        const proto = temporaires.get(r.joueurId);
        const fait = !!entre || !!proto || L.remplacementsFaits.indexOf(i) !== -1;
        const groupe = groupePoste(r.numeroSortant);
        const options = maillotsCompatibles(r.numeroSortant).map((n) => {
          const j = joueursEq.find((x) => x.numero === n);
          const exclu = j && j.sinBin > 0;
          return `<option value="${n}"${n === r.numeroSortant ? ' selected' : ''}${exclu ? ' disabled' : ''}>n°${n}${j && j.label ? ' — ' + j.label : ''}${exclu ? ' (exclu)' : ''}</option>`;
        }).join('');
        const detail = proto && !entre
          ? `remplacement temporaire au n°${proto.numero} (${proto.nature === 'saignement' ? 'saignement' : 'protocole commotion'}, jusqu'à la ${Math.ceil(proto.fin / 60)}e minute au plus tard)`
          : fait
          ? `entré${entre ? ' à la ' + Math.max(1, Math.round(entre.instant / 60)) + 'e minute, au n°' + entre.numero : ''}`
          : `remplace le <select class="selCibleRemplacant" data-index="${i}" aria-label="Maillot remplacé par ${r.nom}">${options}</select>`
            + (groupe === 'PL' ? ' · première ligne : relève une première ligne (loi 3)' : '');
        return `<div class="ligneRemplacant"><button class="alt btnRemplacantMiTemps${fait ? ' choisie' : ''}" data-index="${i}"${fait ? ' disabled' : ''}>`
          + `<b>${fait ? '' : 'Faire entrer '}${r.nom} (${r.poste})</b></button><span class="detailRemplacant">${detail}</span></div>`;
      }).join('') + '<p id="miTempsRemplacementRefus" class="noteRefus" style="display:none"></p>'
      : '<p style="font-size:12px;color:var(--text-faint);margin:0;">Aucun remplaçant disponible.</p>';
    document.getElementById('panneauMiTemps').classList.add('visible');
    ecrireJournalMatch();
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
    // Le match vécu garde ses décisions : « Enregistrer » les met dans
    // l'historique, et la barre de temps les rejoue (FUNC-RM-003).
    match._decisions = { equipe: L.equipe, remplacants: L.remplacants || [], commandes: L.commandes.slice() };
    match._idxDecision = L.commandes.length;
    const etatFinal = normalizeMatchState(match.getState());
    if (L.onResultat) L.onResultat(etatFinal);
    // Résultat envoyé (et sauvegardé par l'appelant) : plus rien à reprendre.
    effacerJournalMatch();
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
    const btnTerminer = document.getElementById('btnTerminerMatch');
    if (btnTerminer) btnTerminer.style.display = 'none';
    // Le match est joué : la relecture redevient libre.
    definirBarreTempsVerrouillee(false);
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

  // --- Reprise d'un match JOUÉ (bugs.md FUNC-RM-002) -----------------------
  //
  // Le match joué ne vivait qu'en mémoire : un F5 ou un onglet fermé le
  // perdait, et la journée se rejouait avec une autre graine. Le moteur est
  // déterministe : la graine, la configuration et les décisions du manager,
  // datées au pas près, suffisent à retrouver EXACTEMENT le même match. On les
  // garde dans un journal, réécrit à chaque décision, régulièrement pendant le
  // jeu et quand la page se ferme. Il est effacé au coup de sifflet final
  // (après l'envoi du résultat) ou à l'abandon.
  const CLE_MATCH_JOUE = 'rugbyManager.matchJoue.v1';
  let dernierJournalMs = 0;
  function ecrireJournalMatch() {
    if (!matchLive || !matchLive.journal || !match || matchLive.resultatEnvoye) return;
    matchLive.journal.tick = match._numTick || 0;
    matchLive.journal.temps = match.tempsMatch;
    matchLive.journal.score = { A: match.score.A, B: match.score.B };
    try { window.localStorage.setItem(CLE_MATCH_JOUE, JSON.stringify(matchLive.journal)); } catch (e) { /* stockage plein : pas de reprise possible */ }
  }
  function effacerJournalMatch() {
    try { window.localStorage.removeItem(CLE_MATCH_JOUE); } catch (e) { /* ignore */ }
  }
  function lireJournalMatch() {
    try {
      const j = JSON.parse(window.localStorage.getItem(CLE_MATCH_JOUE));
      return j && j.version === 1 && j.cle ? j : null;
    } catch (e) { return null; }
  }
  window.addEventListener('pagehide', ecrireJournalMatch);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ecrireJournalMatch(); });

  // Rejoue une décision du journal sur le moteur, comme le panneau l'a fait.
  function appliquerCommandeJournal(cmd) {
    const L = matchLive;
    if (cmd.type === 'consigne') {
      const c = CONSIGNES_MI_TEMPS.find((x) => x.cle === cmd.cle);
      if (!c) return;
      match.appliquerTactiqueEnCours(L.equipe, c.consignes);
      if (L.consignesPrises.indexOf(c.cle) === -1) L.consignesPrises.push(c.cle);
    } else if (cmd.type === 'remplacement') {
      const r = (L.remplacants || [])[cmd.index];
      if (!r || L.remplacementsFaits.indexOf(cmd.index) !== -1) return;
      const numero = cmd.numero || r.numeroSortant;
      match.remplacerJoueurEnCours(L.equipe, numero, cmd.numero ? joueurAuMaillot(r, numero) : r.joueur, r.joueurId);
      L.remplacementsFaits.push(cmd.index);
    }
  }
  function noterCommandeJournal(cmd) {
    if (!matchLive) return;
    const c = Object.assign({ tick: match._numTick || 0 }, cmd);
    matchLive.commandes.push(c);
    if (!matchLive.journal) return;
    matchLive.journal.commandes = matchLive.commandes;
    ecrireJournalMatch();
  }

  function lancerMatchJoue(seed, duree, opts) {
    const o = opts || {};
    decisionsRelecture = null;
    matchLive = {
      onResultat: o.onResultat, onFermer: o.onFermer, onAbandon: o.onAbandon, noms: o.noms,
      equipeJoueur: o.equipeJoueur, equipe: o.equipeJoueur || 'A',
      remplacants: o.remplacants || [],
      consignesPrises: [], remplacementsFaits: [], commandes: [],
      miTempsTraitee: false, resultatEnvoye: false,
      journal: o.cleReprise ? {
        version: 1, cle: o.cleReprise, seed, duree, config: JSON.parse(JSON.stringify(configMatch)),
        noms: o.noms || null, equipeJoueur: o.equipeJoueur || null, remplacants: o.remplacants || [],
        contexte: o.contexteReprise || null,
        commandes: [], tick: 0, temps: 0, score: { A: 0, B: 0 },
      } : null,
    };
    const btn = document.getElementById('btnConsigneMatch');
    if (btn) btn.style.display = '';
    // Les confirmations de gestion du club encore affichées (avance du
    // calendrier, demandes en attente) se posaient sur les commandes du
    // match au coup d'envoi : elles concernent l'écran qu'on vient de
    // quitter, on les retire.
    const toasts = document.getElementById('toastContainer');
    if (toasts) toasts.replaceChildren();
    // Sortie EXPLICITE d'un match joué en direct : le manager doit pouvoir
    // quitter sans aller la chercher dans le menu (signalé en jeu : « je ne
    // peux plus sortir »). Le bouton n'existe que pendant un match joué —
    // une relecture, elle, se ferme déjà par son écran de résultat.
    const btnQ = document.getElementById('btnQuitterMatch');
    if (btnQ) btnQ.style.display = '';
    const btnT = document.getElementById('btnTerminerMatch');
    if (btnT) btnT.style.display = '';
    definirBarreTempsVerrouillee(true);
    demarrerLectureReelle(seed, duree, o.noms);
    // En reprise, le journal reste celui du match interrompu jusqu'au bout du
    // rejeu (cf. reprendreMatchClub) : ne pas l'écraser par un match à 0:00.
    if (!o.reprise) ecrireJournalMatch();
  }

  // « Terminer le match » : jouer la fin d'un coup, sans rien perdre.
  //
  // Un match JOUE dure le temps d'un match : 80 minutes de jeu font 5 minutes
  // reelles a la vitesse maximale, 80 a la vitesse normale. Les deux seules
  // issues etaient de regarder jusqu'au bout ou de quitter — ce qui ANNULE la
  // rencontre. Il manquait « ca suffit, joue la fin ».
  //
  // Point essentiel : on ne relance RIEN. C'est le MEME moteur, deja en
  // cours, qu'on avance jusqu'au coup de sifflet final — le score acquis, les
  // consignes donnees et les remplacements faits restent donc en jeu, et le
  // resultat est celui de CE match. Relancer une simulation neuve donnerait
  // un autre match, sans les decisions du manager.
  //
  // Avance par lots comme la generation en arriere-plan (meme PAS_PAR_LOT,
  // meme setTimeout) : la page ne se fige pas, et la barre de progression dit
  // ou on en est.
  // La barre de temps REJOUE le match depuis la graine (cf. avancerJusqua) :
  // elle construit un moteur NEUF, qui ignore les consignes de mi-temps, les
  // remplacements et les changements tactiques. Sur une relecture sans enjeu
  // c'est sans conséquence ; sur un match JOUÉ qui compte pour la carrière,
  // cela effacerait silencieusement toutes les décisions du manager — et le
  // résultat envoyé à la sauvegarde viendrait d'un moteur qui ne les a jamais
  // vues. On la verrouille donc pendant un match joué, en DISANT pourquoi
  // plutôt qu'en laissant un curseur inerte.
  function definirBarreTempsVerrouillee(verrouillee) {
    const s = document.getElementById('seek');
    if (!s) return;
    s.disabled = !!verrouillee;
    s.title = verrouillee
      ? 'Indisponible pendant un match joué : revenir en arrière effacerait tes décisions (consignes, remplacements).'
      : '';
  }

  function terminerMatchMaintenant() {
    if (!matchLive || matchLive.resultatEnvoye || !match) return false;
    fermerMiTemps();
    // APRES fermerMiTemps, qui relance la lecture (enCours = true) : dans
    // l'autre ordre, la boucle d'affichage continuait de faire avancer le
    // moteur pendant et apres l'envoi du resultat — un tir au but de fin de
    // match pouvait alors s'ajouter au score APRES que le club eut enregistre
    // le resultat, et « Enregistrer » sauvait un autre score que celui annonce.
    enCours = false; // plus rien a animer : on saute a la fin
    document.getElementById('btnPlay').textContent = 'Lecture';
    // Le manager a choisi de ne plus intervenir : la mi-temps ne doit pas
    // rouvrir au milieu de l'acceleration.
    matchLive.miTempsTraitee = true;
    const btnC = document.getElementById('btnConsigneMatch');
    if (btnC) btnC.style.display = 'none';
    const btnT2 = document.getElementById('btnTerminerMatch');
    if (btnT2) btnT2.style.display = 'none';
    const btnQ2 = document.getElementById('btnQuitterMatch');
    if (btnQ2) btnQ2.style.display = 'none';
    const duree = dureeMatchActuel;
    document.getElementById('panneauGeneration').classList.add('visible');
    const titreEl = document.getElementById('genTitre');
    if (titreEl) titreEl.textContent = 'Fin du match en cours…';
    const barre = document.getElementById('genProgressBar');
    const label = document.getElementById('genProgressLabel');
    function lot() {
      // Le match a pu etre abandonne entre deux lots (retour au club) : on
      // s'arrete alors sans rien envoyer.
      if (!matchLive || matchLive.resultatEnvoye) {
        document.getElementById('panneauGeneration').classList.remove('visible');
        return;
      }
      let i = 0;
      while (i < PAS_PAR_LOT && avantSifflet(match, duree)) {
        pasMoteur(match);
        i++;
      }
      const frac = Math.max(0, Math.min(1, match.tempsMatch / duree));
      barre.style.width = (frac * 100) + '%';
      label.textContent = `${UI.formaterTemps(match.tempsMatch)} / ${UI.formaterTemps(duree)}`;
      if (avantSifflet(match, duree)) { setTimeout(lot, 0); return; }
      document.getElementById('panneauGeneration').classList.remove('visible');
      etatPrecedent = null;
      etatCourant = normalizeMatchState(match.getState());
      terminerMatchLive();
    }
    lot();
    return true;
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
    effacerJournalMatch();
    const btn = document.getElementById('btnConsigneMatch');
    if (btn) btn.style.display = 'none';
    const btnQ = document.getElementById('btnQuitterMatch');
    if (btnQ) btnQ.style.display = 'none';
    const btnT = document.getElementById('btnTerminerMatch');
    if (btnT) btnT.style.display = 'none';
    definirBarreTempsVerrouillee(false);
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
    noterCommandeJournal({ type: 'consigne', cle: c.cle });
    ouvrirMiTemps(matchLive.contexte);
  });

  document.getElementById('miTempsRemplacants').addEventListener('click', (e) => {
    const b = e.target.closest('.btnRemplacantMiTemps');
    if (!b || !matchLive || !match) return;
    const i = Number(b.dataset.index);
    const r = (matchLive.remplacants || [])[i];
    if (!r || matchLive.remplacementsFaits.indexOf(i) !== -1) return;
    const sel = document.querySelector(`.selCibleRemplacant[data-index="${i}"]`);
    const numero = sel ? Number(sel.value) : r.numeroSortant;
    const refus = document.getElementById('miTempsRemplacementRefus');
    if (maillotsCompatibles(r.numeroSortant).indexOf(numero) === -1
        || !match.remplacerJoueurEnCours(matchLive.equipe, numero, joueurAuMaillot(r, numero), r.joueurId)) {
      // Refus EXPLIQUÉ, jamais un bouton qui ne fait rien.
      if (refus) { refus.textContent = `${r.nom} ne peut pas entrer au n°${numero} : il est déjà entré, il tient un remplacement temporaire (protocole commotion), ou ce maillot n'est pas de son poste.`; refus.style.display = ''; }
      return;
    }
    matchLive.remplacementsFaits.push(i);
    noterCommandeJournal({ type: 'remplacement', index: i, numero });
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
    // Nouveau match : « Enregistrer » redevient disponible (il est désactivé
    // après un enregistrement réussi, cf. son gestionnaire).
    const btnS = document.getElementById('btnSauver');
    if (btnS) { btnS.disabled = false; btnS.title = ''; }
    seedActuel = seed;
    dureeMatchActuel = duree;
    match = new MatchEngine(seed, duree, configMatch);
    match._decisions = decisionsRelecture;
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
    m._decisions = match && match._decisions ? match._decisions : null;
    const nbPas = Math.round(cible / PAS_FIXE);
    for (let i = 0; i < nbPas; i++) pasMoteur(m);
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
    // SCRUM (P2-64) : ballon introduit dans la mêlée, au sol sous le pack —
    // dessiné à sa position réelle, jamais sur le 9 (porteur logique).
    if (st.ball && (st.ball.state === 'LOOSE' || st.ball.state === 'RUCK' || st.ball.state === 'SCRUM')) return { x: st.ball.x, y: st.ball.y };
    if (st.porteur) return { x: st.porteur.x, y: st.porteur.y };
    return st.ballon ? { x: st.ballon.x, y: st.ballon.y } : null;
  }

  // --- ACCELERATION DES TEMPS MORTS ------------------------------------------
  // Signale en jeu : « les melees et les touches, je les trouve tres longues a
  // jouer ». Mesure sur 6 matchs complets de 80 minutes : la MISE EN PLACE
  // d'une touche occupe 14,7 min par match et la formation d'une melee 13,8 min
  // — 28,5 minutes passees a regarder trente joueurs marcher vers leur place,
  // soit plus que le temps de jeu effectif lui-meme (32,6 min).
  //
  // Les DUREES, elles, sont justes : une touche dure 40 a 60 s en vrai, une
  // melee 60 a 90 s, et des tests de loi (server/test-invariants.js) les
  // protegent explicitement. On ne les raccourcit donc pas — ce serait mentir
  // sur le rugby et fausser le temps de jeu effectif.
  //
  // On accelere l'AFFICHAGE, et UNIQUEMENT pendant la mise en place. Le moteur,
  // le chronometre et les statistiques sont strictement inchanges : c'est la
  // meme simulation, regardee en avance rapide sur ses temps morts, exactement
  // comme un resume televise. Des que le rugby commence — le crouch-bind-set,
  // le lancer en touche, le coup de pied au but — on revient a la vitesse
  // choisie par le joueur.
  const ACCEL_MISE_EN_PLACE = 5;
  function multiplicateurMiseEnPlace(m) {
    if (!m) return 1;
    switch (m.phase) {
      // Touche : les deux alignements se forment et le lanceur rejoint sa
      // marque en courant. Des que le ballon est lance (toucheLancer), on
      // repasse en vitesse normale : le duel aerien est ce qu'on vient voir.
      case 'TOUCHE': return m.toucheLancer ? 1 : ACCEL_MISE_EN_PLACE;
      // Melee : seule la FORMATION (les deux paquets qui se placent) est un
      // temps mort. Le crouch-bind-set, l'introduction et la contestation sont
      // du jeu, et restent a vitesse normale.
      case 'MELEE': return (m.melee && m.melee.etat === 'MELEE_FORMATION') ? ACCEL_MISE_EN_PLACE : 1;
      // Apres un essai : replacement des vingt-deux autres joueurs.
      case 'ESSAI': return ACCEL_MISE_EN_PLACE;
      // Tir au but : la routine du buteur est acceleree, le coup de pied
      // lui-meme (ballon en vol) est rendu a vitesse normale.
      case 'TRANSFORMATION':
      case 'PENALITE_TIR': return m.ballonEnVol ? 1 : ACCEL_MISE_EN_PLACE;
      default: return 1;
    }
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
    const vitesseAffichee = vitesseSim * multiplicateurMiseEnPlace(match);
    if (enCours && !enMiniPause) {
      accumulateur += dtReel * vitesseAffichee;
      while (accumulateur >= PAS_FIXE) {
        etatPrecedent = etatCourant;
        pasMoteur(match);
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
    const dtGame = (enCours && !enMiniPause) ? dtReel * vitesseAffichee : 0;
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
      if (matchLive.journal && ts - dernierJournalMs > 1000) { dernierJournalMs = ts; ecrireJournalMatch(); }
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
  document.getElementById('btnTerminerMatch').addEventListener('click', () => {
    terminerMatchMaintenant();
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
    // Deuxième barrière, indépendante de l'attribut `disabled` : le clavier et
    // un script peuvent déclencher `input` sur un curseur désactivé. Un match
    // joué ne se rembobine pas — on remet le curseur là où en est le match.
    if (matchLive && !matchLive.resultatEnvoye) {
      e.target.value = String(match ? match.tempsMatch : 0);
      return;
    }
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

  document.getElementById('btnSauver').addEventListener('click', (e) => {
    // Aucun match chargé : le bouton ne doit rien tenter. Il se déclenchait sur
    // un moteur NUL (« Cannot read properties of null (reading 'getState') »)
    // — un bouton actif alors que l'action est impossible.
    if (!match) return;
    const state = match.getState();
    const d = match._decisions;
    const bilan = UI.enregistrerResultat(seedActuel, dureeMatchActuel, state.score, {
      config: instantaneConfigMatch(),
      decisions: d && d.commandes && d.commandes.length ? JSON.parse(JSON.stringify(d)) : null,
      empreinte: empreinteMatch(match),
    });
    UI.rafraichirPanneauHistorique(onRevoirHistorique);
    // On ne dit « enregistré » que si ça l'a réellement été. En cas d'échec de
    // stockage, le joueur est prévenu et le bouton reste disponible pour
    // réessayer.
    if (bilan && bilan.ok) {
      const b = e.currentTarget;
      b.disabled = true;
      b.title = bilan.deja ? 'Ce match est déjà dans ton historique.' : bilan.message;
    } else if (bilan && bilan.message) {
      window.alert(bilan.message);
    }
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

  // Instantané de ce qui rend un match REJOUABLE : la graine et la durée ne
  // suffisent pas, il faut la configuration réellement passée au moteur. On ne
  // capture QUE les clés propres au club (celles que reinitialiserConfigClub
  // efface) : le reste de la configuration est celle du moteur par défaut,
  // identique d'un lancement à l'autre. Un Match rapide n'en a aucune —
  // l'instantané est alors un objet vide, et le replay reste fidèle.
  function empreinteMatch(m) {
    const a = m.stats.A, b = m.stats.B;
    return [m.tempsMatch.toFixed(1), a.passes + b.passes, a.rucks + b.rucks, a.tacklesAttempted + b.tacklesAttempted].join('|');
  }

  function instantaneConfigMatch() {
    if (!configMatch) return {};
    const snap = {};
    if (configMatch.joueursA) snap.joueursA = configMatch.joueursA;
    if (configMatch.joueursB) snap.joueursB = configMatch.joueursB;
    for (const cle of CLES_TACTIQUE_PAR_EQUIPE) {
      if (configMatch[cle] !== undefined) snap[cle] = configMatch[cle];
    }
    return JSON.parse(JSON.stringify(snap));
  }

  // Rejoue une entrée d'historique et VÉRIFIE que le score obtenu est bien
  // celui enregistré. Renvoie { fidele, score, motif } — jamais un faux
  // replay silencieux.
  //
  // Trois cas honnêtes :
  //  - pas d'instantané (entrée antérieure, ou match joué en direct dont les
  //    décisions de mi-temps ne sont pas rejouables) -> non reproductible ;
  //  - instantané d'une version inconnue -> refusé ;
  //  - instantané exploitable -> on rejoue et on compare le score.
  function rejouerDepuisHistorique(entree) {
    if (!entree || !entree.config || typeof entree.configVersion !== 'number') {
      return { fidele: false, score: null,
        motif: 'Ce match a été enregistré sans les détails de sa composition : il ne peut pas être rejoué à l\'identique.' };
    }
    if (entree.configVersion !== UI.VERSION_INSTANTANE_MATCH) {
      return { fidele: false, score: null,
        motif: 'Ce match a été enregistré par une version antérieure du jeu : son déroulé ne peut plus être reproduit.' };
    }
    const cfg = Object.assign({}, configMatch);
    for (const cle of CLES_TACTIQUE_PAR_EQUIPE) delete cfg[cle];
    delete cfg.joueursA; delete cfg.joueursB;
    Object.assign(cfg, entree.config);
    const moteur = new MatchEngine(entree.seed, entree.duree, cfg);
    moteur._decisions = entree.decisions || null;
    while (avantSifflet(moteur, entree.duree)) pasMoteur(moteur);
    const score = moteur.getState().score;
    // Le score seul peut coïncider par hasard : l'empreinte (sifflet, passes,
    // rucks, plaquages) dit si c'est bien LE MÊME match, décisions comprises.
    const fidele = !!(entree.score && score.A === entree.score.A && score.B === entree.score.B)
      && (!entree.empreinte || entree.empreinte === empreinteMatch(moteur));
    return { fidele, score,
      motif: fidele ? null : 'Le déroulé enregistré n\'a pas pu être reproduit à l\'identique.' };
  }

  function onRevoirHistorique(entree) {
    document.getElementById('panneauHistorique').classList.remove('visible');
    // On repart d'une base propre, PUIS on réapplique l'instantané du match
    // enregistré s'il en a un. Sans instantané, le replay ne peut pas être
    // fidèle : on le DIT au joueur au lieu de lui montrer un autre match.
    window.RMMain.reinitialiserConfigClub();
    const verdict = rejouerDepuisHistorique(entree);
    if (!verdict.fidele) {
      window.alert(verdict.motif
        + '\n\nLe match affiché ne sera donc pas celui qui a été enregistré.');
    } else {
      Object.assign(configMatch, entree.config);
    }
    // Un match déjà rejoué depuis l'historique va droit à la visualisation
    // (le joueur a déjà choisi « Revoir », pas besoin de reproposer le choix).
    lancerNouveauMatchAvecGeneration(entree.seed, entree.duree, { direct: true, decisions: entree.decisions || null });
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
    // Rejoue une entrée d'historique et dit si le replay est FIDÈLE
    // (cf. rejouerDepuisHistorique).
    rejouerDepuisHistorique,
    // Joue la fin d'un match JOUE d'un coup, avec le MEME moteur : rien de ce
    // qui s'est deja passe n'est perdu (cf. terminerMatchMaintenant).
    terminerMatchMaintenant,
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
    // Reprise d'un match joué (bugs.md FUNC-RM-002). `journalMatchJoue(cle)`
    // rend le journal du match interrompu s'il correspond à CETTE rencontre
    // (sinon null : un journal d'une autre carrière ou d'une autre journée
    // n'est jamais repris). `reprendreMatchClub` rejoue le même match jusqu'au
    // pas atteint, décisions comprises, et le laisse en pause.
    journalMatchJoue(cle) {
      const j = lireJournalMatch();
      return j && j.cle === cle ? j : null;
    },
    oublierMatchJoue() { effacerJournalMatch(); },
    reprendreMatchClub(journal, callbacks) {
      configMatch = JSON.parse(JSON.stringify(journal.config));
      lancerMatchJoue(journal.seed, journal.duree, Object.assign({}, callbacks, {
        noms: journal.noms, equipeJoueur: journal.equipeJoueur,
        remplacants: journal.remplacants, cleReprise: journal.cle, reprise: true,
        contexteReprise: journal.contexte || null,
      }));
      const L = matchLive;
      L.commandes = (journal.commandes || []).slice().sort((a, b) => a.tick - b.tick);
      L.journal.commandes = L.commandes;
      const cmds = L.commandes;
      let k = 0;
      while ((match._numTick || 0) < journal.tick && match.phase !== 'TERMINE') {
        while (k < cmds.length && cmds[k].tick <= (match._numTick || 0)) appliquerCommandeJournal(cmds[k++]);
        match.tick(PAS_FIXE);
      }
      while (k < cmds.length && cmds[k].tick <= (match._numTick || 0)) appliquerCommandeJournal(cmds[k++]);
      // La mi-temps déjà passée ne se rouvre pas ; le match repart EN PAUSE,
      // le manager relance quand il est prêt.
      L.miTempsTraitee = !!match.miTempsJouee;
      etatPrecedent = null;
      etatCourant = normalizeMatchState(match.getState());
      ballonRendu = null;
      enCours = false;
      document.getElementById('btnPlay').textContent = 'Lecture';
      UI.majAffichage(etatCourant, dureeMatchActuel);
      ecrireJournalMatch();
      return true;
    },
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
    // Couture de test : la REGLE d'acceleration des temps morts, testable sans
    // dependre d'un chronometrage (mesurer des debits en secondes reelles dans
    // un navigateur donne un test qui tremble — essaye, puis remplace par
    // celui-ci). La boucle de rendu appelle exactement cette fonction.
    multiplicateurAffichage(etatMoteur) {
      return multiplicateurMiseEnPlace(etatMoteur);
    },
    // Couture de test (P2-64) : la position où le ballon est DESSINÉ pour un
    // état du moteur — c'est elle que voit le joueur, pas la position interne.
    positionBallonAffichee(etatMoteur) {
      return positionBallonLogique(normalizeMatchState(etatMoteur));
    },
  };

  // --- SORTIE DE SECOURS ----------------------------------------------------
  // Signale en jeu : « mon jeu est bloque, je ne peux ni rentrer dedans ni
  // supprimer pour continuer ». Le seul bouton de remise a zero du jeu vivait
  // DANS le panneau du club (onglet Palmares, cf. btnNouvelleSaisonClub) : il
  // n'etait donc atteignable qu'apres avoir reussi a entrer dans le club. Toute
  // panne qui empeche cette entree enfermait le joueur sans aucune issue, la
  // partie et le bouton pour l'effacer etant derriere la meme porte.
  //
  // Ce bloc est deliberement AUTONOME : il ne lit ni l'etat du club, ni le
  // rendu de l'interface (docs/js/clubUI.js), ni aucune fonction chargee apres
  // lui. Il ne regarde qu'une chose — est-ce qu'une sauvegarde existe — et son
  // gestionnaire n'appelle que l'effacement puis un rechargement de page. Il
  // reste donc utilisable quand tout le reste est casse, ce qui est exactement
  // le cas ou on en a besoin.
  (function sortieDeSecours() {
    const CLE = 'rugbyManager.club.v1'; // cf. docs/js/club-sauvegarde.js
    function auChargement() {
      let bouton = null;
      try { bouton = document.getElementById('btnSecoursEffacer'); } catch (e) { return; }
      if (!bouton) return;
      let existe = false;
      try { existe = !!window.localStorage.getItem(CLE); } catch (e) { existe = false; }
      bouton.style.display = existe ? 'block' : 'none';
      bouton.addEventListener('click', () => {
        const message = 'Effacer definitivement ta saison en cours et repartir de zero ?';
        let ok = false;
        try { ok = window.confirm(message); } catch (e) { ok = true; }
        if (!ok) return;
        try {
          if (window.RMClub && typeof window.RMClub.effacerSaison === 'function') window.RMClub.effacerSaison();
          else window.localStorage.removeItem(CLE);
        } catch (e) { /* rien d'autre a tenter : on recharge quand meme */ }
        try { window.location.reload(); } catch (e) { /* ignore */ }
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auChargement);
    else auChargement();
  })();

  // --- Sauvegardes : export, import, copies de secours (bugs.md FUNC-RM-001)
  // Même principe que la sortie de secours ci-dessus : rien ici ne dépend de
  // l'état du club ni de son interface. Le fichier importé n'est jamais
  // exécuté — il est lu par JSON.parse, migré et validé comme un chargement
  // (RMClub.analyserImport) avant toute écriture.
  (function () {
    const LIBELLES_RAISON = {
      json_invalide: 'données corrompues', schema_invalide: 'données incomplètes',
      version_sans_migration: 'format trop ancien', version_incoherente: 'format inconnu',
      boucle_migration: 'mise à jour du format en échec', avant_import: 'avant un import',
      avant_effacement: 'avant « repartir de zéro »', inconnue: 'incident',
    };
    const REFUS_IMPORT = {
      fichier_vide: 'le fichier est vide',
      json_invalide: 'ce n\'est pas un fichier de sauvegarde lisible',
      format_inconnu: 'ce fichier n\'est pas une sauvegarde de Rugby Manager',
      version_future: 'il vient d\'une version plus récente du jeu — mets le jeu à jour avant de l\'importer',
      version_sans_migration: 'son format est trop ancien pour être converti',
      schema_invalide: 'la carrière qu\'il contient est incomplète',
      secours_plein: 'ta carrière actuelle ne peut pas être mise de côté (5 copies de secours déjà gardées)',
      stockage: 'le stockage du navigateur est plein ou indisponible',
    };
    function telecharger(texte, nom) {
      const blob = new Blob([texte], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nom;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function dire(texte) {
      const el = document.getElementById('etatSauvegardes');
      if (el) el.textContent = texte;
    }
    function rafraichir() {
      const R = window.RMClub;
      if (!R || !R.sauvegardeBrute) return;
      const btn = document.getElementById('btnExporterCarriere');
      if (btn) btn.style.display = R.sauvegardeBrute() ? '' : 'none';
      const zone = document.getElementById('listeSecours');
      if (!zone) return;
      zone.textContent = '';
      for (const c of R.listerSecours()) {
        const ligne = document.createElement('div');
        ligne.className = 'ligneSecours';
        const texte = document.createElement('span');
        const quand = c.quand ? new Date(c.quand).toLocaleDateString('fr-FR') : '';
        texte.textContent = `Copie de secours${c.club ? ' · ' + c.club : ''}${c.saison ? ' · saison ' + c.saison : ''}` +
          ` · ${LIBELLES_RAISON[c.raison] || 'incident'}${quand ? ' · ' + quand : ''}`;
        const b = document.createElement('button');
        b.className = 'lienTexte'; b.textContent = 'Télécharger';
        b.dataset.cle = c.cle;
        b.addEventListener('click', () => {
          const brut = R.lireSecours(c.cle);
          if (brut != null) telecharger(brut, R.nomFichierCarriere(brut, 'rugby-manager-secours'));
        });
        const sup = document.createElement('button');
        sup.className = 'lienTexte'; sup.textContent = 'Supprimer';
        sup.addEventListener('click', () => {
          let ok = false;
          try { ok = window.confirm('Supprimer définitivement cette copie de secours ? Télécharge-la d\'abord si tu veux la garder.'); } catch (e) { ok = false; }
          if (!ok) return;
          dire(R.supprimerSecours(c.cle) ? 'Copie de secours supprimée.' : 'Suppression impossible.');
          rafraichir();
        });
        ligne.appendChild(texte); ligne.appendChild(b); ligne.appendChild(sup);
        zone.appendChild(ligne);
      }
    }
    function auChargement() {
      const R = window.RMClub;
      const btnExp = document.getElementById('btnExporterCarriere');
      const btnImp = document.getElementById('btnImporterCarriere');
      const fichier = document.getElementById('fichierImportCarriere');
      if (!R || !btnExp || !btnImp || !fichier) return;
      btnExp.addEventListener('click', () => {
        const brut = R.sauvegardeBrute();
        if (!brut) { dire('Aucune carrière enregistrée sur cet appareil.'); return; }
        telecharger(brut, R.nomFichierCarriere(brut));
        dire('Carrière exportée : garde ce fichier, il se réimporte ici ou sur un autre navigateur.');
      });
      btnImp.addEventListener('click', () => { fichier.value = ''; fichier.click(); });
      fichier.addEventListener('change', () => {
        const f = fichier.files && fichier.files[0];
        if (!f) return;
        const lecteur = new FileReader();
        lecteur.onerror = () => dire('Import impossible : le fichier n\'a pas pu être lu.');
        lecteur.onload = () => {
          const analyse = R.analyserImport(String(lecteur.result || ''));
          if (!analyse.ok) { dire(`Import refusé : ${REFUS_IMPORT[analyse.raison] || 'fichier non reconnu'}. Rien n\'a été modifié.`); return; }
          const a = analyse.apercu;
          const actuelle = R.sauvegardeBrute();
          const message = `Importer la carrière « ${a.club} »` + (a.manager ? ` (${a.manager})` : '') +
            `, saison ${a.saison}` + (a.date ? `, au ${a.date}` : '') + ' ?' +
            (a.migree ? '\n\nElle vient d\'une version précédente du jeu et sera mise à jour.' : '') +
            (actuelle ? '\n\nTa carrière actuelle sera conservée en copie de secours, téléchargeable ici.' : '');
          let ok = false;
          try { ok = window.confirm(message); } catch (e) { ok = false; }
          if (!ok) { dire('Import annulé. Rien n\'a été modifié.'); return; }
          const res = R.importerCarriere(analyse.saison);
          if (!res.ok) { dire(`Import refusé : ${REFUS_IMPORT[res.raison] || 'écriture impossible'}. Rien n\'a été modifié.`); return; }
          try { window.location.reload(); } catch (e) { /* ignore */ }
        };
        lecteur.readAsText(f);
      });
      rafraichir();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auChargement);
    else auChargement();
  })();
})();
