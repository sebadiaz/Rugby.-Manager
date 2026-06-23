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

  // Affiche l'état courant dans le HUD. `dureeAffichee` est utilisé pour le
  // libellé "x / y" tant que la durée réelle du match n'est pas finie (Infinity).
  function majAffichage(state, dureeAffichee) {
    document.getElementById('score').textContent =
      `Equipe A ${state.score.A} — ${state.score.B} Equipe B`;
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
      li.textContent = `${ICONES[ev.type] || '•'} ${ev.message}`;
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
      banner.textContent = `🟨 ARBITRE — ${aAfficher.message}`;
      banner.classList.add('visible');
      banniereJusqua = performance.now() + 2200;
    }
    const dernier = state.eventLog[state.eventLog.length - 1];
    if (dernier) dernierIdEvenementAffiche = dernier.id;

    if (performance.now() > banniereJusqua) {
      document.getElementById('banner').classList.remove('visible');
    }

    document.getElementById('btnSauver').disabled = state.phase !== 'TERMINE';
  }

  // --- Panneau de statistiques de match (toutes issues de state.stats, donc
  // des actions réellement produites par la simulation, jamais inventées) ---
  function ligneStat(label, a, b) {
    return `<div class="ligneStat"><span class="valA">${a}</span><span class="labelStat">${label}</span><span class="valB">${b}</span></div>`;
  }
  function rafraichirPanneauStats(state) {
    const s = state.stats;
    if (!s) return;
    const conteneur = document.getElementById('corpsStats');
    const pct = state.possessionPct || { A: 50, B: 50 };
    const occ = state.occupationPct || { A: 50, B: 50 };
    conteneur.innerHTML =
      ligneStat('Possession', `${pct.A}%`, `${pct.B}%`) +
      ligneStat('Occupation', `${occ.A}%`, `${occ.B}%`) +
      ligneStat('Essais', s.A.essais, s.B.essais) +
      ligneStat('Passes réussies', `${s.A.passes}/${s.A.passesTentees}`, `${s.B.passes}/${s.B.passesTentees}`) +
      ligneStat('Courses', s.A.carries, s.B.carries) +
      ligneStat('Mètres gagnés', Math.round(s.A.metresGagnes), Math.round(s.B.metresGagnes)) +
      ligneStat('Coups de pied', s.A.kicks, s.B.kicks) +
      ligneStat('Plaquages réussis', `${s.A.tacklesMade}/${s.A.tacklesAttempted}`, `${s.B.tacklesMade}/${s.B.tacklesAttempted}`) +
      ligneStat('Plaquages manqués', s.A.missedTackles, s.B.missedTackles) +
      ligneStat('Mêlées gagnées', `${s.A.scrumsGagnes}/${s.A.scrums + s.B.scrums}`, `${s.B.scrumsGagnes}/${s.A.scrums + s.B.scrums}`) +
      ligneStat('Touches gagnées', `${s.A.lineoutsGagnes}/${s.A.lineouts + s.B.lineouts}`, `${s.B.lineoutsGagnes}/${s.A.lineouts + s.B.lineouts}`) +
      ligneStat('Rucks', s.A.rucks, s.B.rucks) +
      ligneStat('Mauls', s.A.mauls, s.B.mauls) +
      ligneStat('Turnovers gagnés', s.A.turnovers, s.B.turnovers) +
      ligneStat('En-avants', s.A.knockOns, s.B.knockOns) +
      ligneStat('Pénalités concédées', s.A.penalitesConcedees, s.B.penalitesConcedees) +
      ligneStat('Cartons jaunes', s.A.cartonsJaunes, s.B.cartonsJaunes);
  }

  // --- Historique des résultats (localStorage), pour rejouer un match déjà joué ---
  function chargerHistorique() {
    try { return JSON.parse(localStorage.getItem(CLE_HISTORIQUE)) || []; }
    catch { return []; }
  }
  function sauvegarderHistorique(liste) {
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(liste));
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
      span.textContent = `${entree.date} — Equipe A ${entree.score.A} - ${entree.score.B} Equipe B`;
      const btn = document.createElement('button');
      btn.textContent = 'Revoir';
      btn.addEventListener('click', () => onRevoir(entree));
      div.appendChild(span);
      div.appendChild(btn);
      conteneur.appendChild(div);
    }
  }
  function enregistrerResultat(seed, duree, score) {
    const liste = chargerHistorique();
    liste.unshift({
      id: Date.now(), seed, duree, score,
      date: new Date().toLocaleString('fr-FR'),
    });
    if (liste.length > 20) liste.length = 20;
    sauvegarderHistorique(liste);
  }

  global.RMUI = {
    formaterTemps, majAffichage, reinitialiserSuivi,
    chargerHistorique, rafraichirPanneauHistorique, enregistrerResultat,
    rafraichirPanneauStats,
  };
})(window);
