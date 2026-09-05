// Mise à jour du HUD (score, phase, horloge, fil d'événements, bannière
// arbitrale) et gestion du panneau d'historique des matchs (localStorage).
// Ne contient aucune règle de jeu ni aucun dessin Canvas.
(function (global) {
  'use strict';

  const { ICONES, ETATS_MAUL_LABEL, ETATS_MELEE_LABEL, PHASES, TYPES_BANNIERE, CLE_HISTORIQUE } = global.RMConstants;

  function formaterTemps(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  let dernierIdEvenementAffiche = 0;
  let banniereJusqua = 0;

  function reinitialiserSuivi() {
    dernierIdEvenementAffiche = 0;
    banniereJusqua = 0;
  }

  // Noms affichés pour l'équipe A / l'équipe B : génériques par défaut (Match
  // rapide), remplacés par les vrais noms de club pendant un match du Mode
  // Club (cf. definirNomsEquipes, appelé par main.js avant de démarrer un
  // match). Le moteur lui-même ne connaît que "A"/"B" — l'affichage seul
  // traduit ces identifiants en noms lisibles.
  let nomsEquipes = { A: 'Equipe A', B: 'Equipe B' };
  function definirNomsEquipes(noms) {
    nomsEquipes = { A: (noms && noms.A) || 'Equipe A', B: (noms && noms.B) || 'Equipe B' };
  }

  // Le fil d'événements et la bannière arbitrale viennent du moteur, qui ne
  // désigne les équipes que par "équipe A"/"équipe B" dans ses messages (ex.
  // "Pénalité, équipe A tente un coup de pied au but"). Pour un match de
  // club, on y substitue les vrais noms : chaque message contient toujours la
  // lettre d'équipe comme mot isolé (jamais accolée à un autre mot), donc un
  // remplacement par mot entier suffit à couvrir tous les messages sans
  // toucher au moteur. Ne rien faire en Match rapide (noms génériques) pour
  // ne pas produire "l'équipe Equipe A".
  function traduireEquipesDansMessage(msg) {
    if (nomsEquipes.A === 'Equipe A' && nomsEquipes.B === 'Equipe B') return msg;
    return msg.replace(/\bA\b|\bB\b/g, (lettre) => (lettre === 'A' ? nomsEquipes.A : nomsEquipes.B));
  }

  // Affiche l'état courant dans le HUD. `dureeAffichee` est utilisé pour le
  // libellé "x / y" tant que la durée réelle du match n'est pas finie (Infinity).
  function majAffichage(state, dureeAffichee) {
    document.getElementById('score').textContent =
      `${nomsEquipes.A} ${state.score.A} — ${state.score.B} ${nomsEquipes.B}`;
    const infosPhase = PHASES[state.phase] || { label: state.phase, couleur: '#455a64' };
    const phaseEl = document.getElementById('phase');
    // Pendant un maul ou une mêlée, afficher l'état détaillé de la machine à
    // états (loi 17 pour le maul, loi 19/20 pour la mêlée).
    phaseEl.textContent = (state.phase === 'MAUL' && state.maul && ETATS_MAUL_LABEL[state.maul.etat])
      ? ETATS_MAUL_LABEL[state.maul.etat]
      : (state.phase === 'MELEE' && state.melee && ETATS_MELEE_LABEL[state.melee.etat])
        ? ETATS_MELEE_LABEL[state.melee.etat]
        : infosPhase.label;
    phaseEl.style.background = infosPhase.couleur;
    document.getElementById('horloge').textContent =
      `${formaterTemps(state.clock.time)} / ${formaterTemps(state.clock.duration === Infinity ? dureeAffichee : state.clock.duration)} · ${state.clock.period === 2 ? '2e pér.' : '1ère pér.'}`;

    // Possession réelle (% du temps de jeu effectif par équipe, cf.
    // MatchEngine.getState().possessionPct), pas une valeur fixe.
    const pct = state.possessionPct || { A: 50, B: 50 };
    document.getElementById('possession').innerHTML =
      `<span>${pct.A}%</span><span class="barre"><span class="partA" style="width:${pct.A}%"></span><span class="partB" style="width:${pct.B}%"></span></span><span>${pct.B}%</span>`;

    const seekEl = document.getElementById('seek');
    if (document.activeElement !== seekEl) seekEl.value = Math.round(state.clock.time);
    document.getElementById('tempsLabel').textContent = formaterTemps(state.clock.time);

    // Fil d'événements : les 5 derniers, le plus récent en haut, icône par type.
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    const derniers = state.eventLog.slice(-5).reverse();
    for (const ev of derniers) {
      const li = document.createElement('li');
      li.textContent = `${ICONES[ev.type] || '•'} ${traduireEquipesDansMessage(ev.message)}`;
      if (ev.id > dernierIdEvenementAffiche - 1) li.className = 'recent';
      feed.appendChild(li);
    }

    // Bannière de décision arbitrale : se déclenche une seule fois par
    // événement neuf. On retient le dernier événement NEUF qui mérite une
    // bannière, pas strictement le tout dernier événement : un essai/
    // drop-goal/transformation est immédiatement suivi dans le même tick d'un
    // COUP_ENVOI (remise en jeu), qui sinon masquerait la bannière de
    // l'action marquante.
    const nouveaux = state.eventLog.filter(e => e.id > dernierIdEvenementAffiche);
    const aAfficher = [...nouveaux].reverse().find(e => TYPES_BANNIERE.has(e.type));
    if (aAfficher) {
      const banner = document.getElementById('banner');
      banner.textContent = `🟨 ARBITRE — ${traduireEquipesDansMessage(aAfficher.message)}`;
      banner.classList.add('visible');
      banniereJusqua = performance.now() + 2200;
    }
    const dernier = state.eventLog[state.eventLog.length - 1];
    if (dernier) dernierIdEvenementAffiche = dernier.id;

    if (performance.now() > banniereJusqua) {
      document.getElementById('banner').classList.remove('visible');
    }

    // Masqué (pas seulement désactivé) tant que le match n'est pas terminé :
    // un bouton "Enregistrer" doré-mais-grisé pendant 80 min laisse croire à
    // un bug plutôt qu'à une action qui n'a pas encore de sens. Il apparaît
    // exactement au moment où il devient pertinent.
    document.getElementById('btnSauver').style.display = state.phase === 'TERMINE' ? '' : 'none';
  }

  // --- Panneau de statistiques de match (toutes issues de state.stats, donc
  // des actions réellement produites par la simulation, jamais inventées) ---
  function ligneStat(label, a, b) {
    return `<div class="ligneStat"><span class="valA">${a}</span><span class="labelStat">${label}</span><span class="valB">${b}</span></div>`;
  }
  function rafraichirPanneauStats(state) {
    const s = state.stats;
    if (!s) return;
    document.getElementById('statsNomA').textContent = nomsEquipes.A;
    document.getElementById('statsNomB').textContent = nomsEquipes.B;
    const conteneur = document.getElementById('corpsStats');
    const pct = state.possessionPct || { A: 50, B: 50 };
    const occ = state.occupationPct || { A: 50, B: 50 };
    conteneur.innerHTML =
      ligneStat('Possession', `${pct.A}%`, `${pct.B}%`) +
      ligneStat('Occupation', `${occ.A}%`, `${occ.B}%`) +
      ligneStat('Essais', s.A.essais, s.B.essais) +
      ligneStat('Entrées dans les 22 m', s.A.entrees22, s.B.entrees22) +
      // Statistiques alignées sur les définitions officielles World Rugby
      // (game analysis) — toutes issues d'actions réelles de la simulation.
      ligneStat('Passes réussies', `${s.A.passes}/${s.A.passesTentees}`, `${s.B.passes}/${s.B.passesTentees}`) +
      ligneStat('Offloads', s.A.offloads, s.B.offloads) +
      ligneStat('Courses (au contact)', s.A.carries, s.B.carries) +
      ligneStat('Mètres gagnés', Math.round(s.A.metresGagnes), Math.round(s.B.metresGagnes)) +
      ligneStat('Défenseurs battus', s.A.defenseursBattus, s.B.defenseursBattus) +
      ligneStat('Franchissements', s.A.franchissements, s.B.franchissements) +
      ligneStat('Coups de pied', s.A.kicks, s.B.kicks) +
      ligneStat('Coups de pied regagnés', s.A.kicksRegagnes, s.B.kicksRegagnes) +
      ligneStat('Sorties de camp (ratées)', `${s.A.exits} (${s.A.exitsRates})`, `${s.B.exits} (${s.B.exitsRates})`) +
      ligneStat('Plaquages réussis', `${s.A.tacklesMade}/${s.A.tacklesAttempted}`, `${s.B.tacklesMade}/${s.B.tacklesAttempted}`) +
      ligneStat('Plaquages manqués', s.A.missedTackles, s.B.missedTackles) +
      ligneStat('Phases jouées', s.A.phases, s.B.phases) +
      ligneStat('Rucks', s.A.rucks, s.B.rucks) +
      ligneStat('Mauls', s.A.mauls, s.B.mauls) +
      ligneStat('Mêlées gagnées', `${s.A.scrumsGagnes}/${s.A.scrums + s.B.scrums}`, `${s.B.scrumsGagnes}/${s.A.scrums + s.B.scrums}`) +
      ligneStat('Touches gagnées', `${s.A.lineoutsGagnes}/${s.A.lineouts + s.B.lineouts}`, `${s.B.lineoutsGagnes}/${s.A.lineouts + s.B.lineouts}`) +
      ligneStat('Turnovers gagnés', s.A.turnovers, s.B.turnovers) +
      ligneStat('Turnovers concédés', s.A.turnoversConcedes, s.B.turnoversConcedes) +
      ligneStat('En-avants', s.A.knockOns, s.B.knockOns) +
      ligneStat('Pénalités concédées', s.A.penalitesConcedees, s.B.penalitesConcedees) +
      ligneStat('Cartons jaunes', s.A.cartonsJaunes, s.B.cartonsJaunes);
  }

  // Version de l'instantané de configuration enregistré avec un match. À
  // incrémenter si la forme de la configuration moteur change : un instantané
  // d'une version inconnue est REFUSÉ plutôt que rejoué de travers.
  const VERSION_INSTANTANE_MATCH = 1;

  // --- Historique des résultats (localStorage), pour rejouer un match déjà joué ---
  function chargerHistorique() {
    try { return JSON.parse(localStorage.getItem(CLE_HISTORIQUE)) || []; }
    catch { return []; }
  }
  // Renvoie true si l'écriture a REELLEMENT eu lieu. Le stockage peut être
  // plein, interdit (navigation privée, réglage du navigateur) ou simplement
  // indisponible : l'exception remontait jusque dans le gestionnaire du bouton,
  // sans message pour le joueur, et rien ne distinguait un enregistrement
  // réussi d'un échec.
  function sauvegarderHistorique(liste) {
    try {
      localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(liste));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Identifiant STABLE d'un match : la même rencontre enregistrée deux fois
  // produit la même clé. Graine + durée + score suffisent — deux matchs
  // distincts ne partagent pas cette combinaison, et elle ne dépend d'aucune
  // horloge (contrairement à l'ancien `id: Date.now()`, qui rendait chaque
  // clic unique et laissait donc passer les doublons).
  function identifiantMatch(seed, duree, score) {
    const a = score && score.A != null ? score.A : 0;
    const b = score && score.B != null ? score.B : 0;
    return `${seed}|${duree}|${a}-${b}`;
  }
  function rafraichirPanneauHistorique(onRevoir) {
    const liste = chargerHistorique();
    const conteneur = document.getElementById('listeHistorique');
    if (liste.length === 0) {
      conteneur.innerHTML = '<p>Aucun match enregistré pour le moment. Terminez un match puis cliquez sur « Enregistrer le résultat ».</p>';
      return;
    }
    conteneur.innerHTML = '';
    for (const entree of liste) {
      const div = document.createElement('div');
      div.className = 'entreeHistorique';
      const span = document.createElement('span');
      // Noms RÉELLEMENT enregistrés avec le match. Les entrées antérieures à
      // cette sauvegarde n'en ont pas : elles retombent sur les libellés
      // génériques plutôt que d'afficher « undefined » ou de faire planter la
      // liste — c'est la migration, il n'y a rien d'autre à convertir.
      const noms = nomsHistorique(entree);
      span.textContent = `${entree.date} — ${noms.A} ${entree.score.A} - ${entree.score.B} ${noms.B}`;
      const btn = document.createElement('button');
      btn.textContent = 'Revoir';
      btn.addEventListener('click', () => onRevoir(entree));
      div.appendChild(span);
      div.appendChild(btn);
      conteneur.appendChild(div);
    }
  }
  // Noms d'une entrée d'historique, avec repli sur les libellés génériques.
  // Une entrée enregistrée avant que les noms soient sauvegardés reste donc
  // lisible : « Equipe A 18 - 15 Equipe B », comme avant, au lieu de casser.
  function nomsHistorique(entree) {
    const n = entree && entree.noms;
    return { A: (n && n.A) || 'Equipe A', B: (n && n.B) || 'Equipe B' };
  }

  // `options.config` : instantané de la configuration RÉELLEMENT utilisée par
  // le moteur pour ce match (effectifs alignés + tactique par équipe). Sans
  // lui, « Revoir » rejoue avec la configuration générique du Match rapide et
  // montre un AUTRE match — mesuré sur 12 matchs de club à graine identique :
  // 12/12 donnent un score différent, écart moyen de 15,5 points sur la marge,
  // certains inversant le vainqueur. `options.configVersion` permettra de
  // refuser proprement un instantané devenu illisible.
  // Renvoie { ok, message, deja } — jamais une exception, et jamais un succès
  // annoncé à tort.
  function enregistrerResultat(seed, duree, score, options) {
    const liste = chargerHistorique();
    const cle = identifiantMatch(seed, duree, score);
    // Unicité : chaque clic faisait un `unshift` sans contrôle, donc un double
    // clic créait plusieurs entrées identiques et pouvait remplir l'historique
    // avec le même match.
    if (liste.some((e) => e && e.cle === cle)) {
      return { ok: true, deja: true, message: 'Ce match est déjà dans ton historique.' };
    }
    liste.unshift({
      id: Date.now(), cle, seed, duree, score,
      // Les noms des deux clubs, tels qu'affichés pendant le match (cf.
      // definirNomsEquipes). Sans eux, un match Saint-Malo contre un
      // adversaire redevenait « Equipe A 18 - 15 Equipe B » dans l'historique
      // et rien ne permettait de savoir qui avait joué.
      noms: { A: nomsEquipes.A, B: nomsEquipes.B },
      config: (options && options.config) || null,
      configVersion: (options && options.config) ? VERSION_INSTANTANE_MATCH : null,
      date: new Date().toLocaleString('fr-FR'),
    });
    if (liste.length > 20) liste.length = 20;
    if (!sauvegarderHistorique(liste)) {
      return { ok: false, deja: false,
        message: 'Impossible d\'enregistrer : l\'espace de stockage du navigateur est plein ou indisponible.' };
    }
    return { ok: true, deja: false, message: 'Résultat enregistré dans l\'historique.' };
  }

  global.RMUI = {
    formaterTemps, majAffichage, reinitialiserSuivi, definirNomsEquipes,
    chargerHistorique, rafraichirPanneauHistorique, enregistrerResultat, nomsHistorique, VERSION_INSTANTANE_MATCH, identifiantMatch,
    rafraichirPanneauStats,
  };
})(window);
