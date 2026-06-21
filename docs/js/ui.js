// Mise à jour du HUD (score, phase, horloge, fil d'événements, bannière
// arbitrale) et gestion du panneau d'historique des matchs (localStorage).
// Ne contient aucune règle de jeu ni aucun dessin Canvas.
(function (global) {
  'use strict';

  const { ICONES, ETATS_MAUL_LABEL, PHASES, TYPES_BANNIERE, CLE_HISTORIQUE } = global.RMConstants;

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
    // Pendant un maul, afficher l'état détaillé de la machine à états (loi 17).
    phaseEl.textContent = (state.phase === 'MAUL' && state.maul && ETATS_MAUL_LABEL[state.maul.etat])
      ? ETATS_MAUL_LABEL[state.maul.etat]
      : infosPhase.label;
    phaseEl.style.background = infosPhase.couleur;
    document.getElementById('horloge').textContent =
      `${formaterTemps(state.clock.time)} / ${formaterTemps(state.clock.duration === Infinity ? dureeAffichee : state.clock.duration)} · ${state.clock.period === 2 ? '2e pér.' : '1ère pér.'}`;

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
  };
})(window);
