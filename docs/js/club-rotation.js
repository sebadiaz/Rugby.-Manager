// Aide à la rotation de l'effectif (Mode Club).
//
// Audit mesuré avant : toute la donnée existait déjà — fatigue, endurance,
// matchs joués, statut promis, gabarit de 24 places réparties sur 9 postes,
// règle de récupération de 5 points par jour — mais RIEN ne l'agrégeait.
// `profondeurEffectif`, `suggestionRotation` et `recuperationPrevue`
// n'existaient pas. Le manager voyait une barre de fatigue par joueur et
// devait faire lui-même le calcul : qui reposer, qui est doublure à quel
// poste, et dans combien de jours un titulaire cuit redevient alignable.
//
// RÈGLE ABSOLUE DE CE MODULE : il ne modifie RIEN. Aucune fonction ici
// n'écrit dans une composition, ni dans un joueur. Il propose, le manager
// dispose — une suggestion qui s'appliquerait toute seule ne serait plus une
// décision de manager.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Seuils d'alerte. Choisis à partir des ordres de grandeur RÉELS du jeu :
  // un match coûte ~32 points de fatigue, une journée de repos en rend ~5,
  // donc une semaine sans jouer efface un match. Au-delà de 75, un joueur a
  // enchaîné sans récupérer ; au-delà de 80, il ne retient même plus
  // l'entraînement (cf. facteurFatigueProgression).
  const SEUIL_FATIGUE_ALERTE = 75;
  const SEUIL_FATIGUE_REPOS = 60;
  const ECART_MATCHS_SURCHARGE = 4;
  const ROLES = ['titulaire', 'doublure', 'troisieme'];

  function note(j) {
    if (global.RMClub.noteGlobale) return global.RMClub.noteGlobale(j);
    return (j.vitesse || 0) + (j.plaquage || 0);
  }

  function disponible(j) {
    return !(j.blessureJournees > 0) && !(j.pret && j.pret.joursRestants > 0);
  }

  // Places prévues par le gabarit pour chaque poste — la même source que la
  // génération d'effectif, jamais une table recopiée.
  function requisParPoste() {
    const requis = {};
    for (const p of (global.RMClub.GABARIT_EFFECTIF || [])) requis[p] = (requis[p] || 0) + 1;
    return requis;
  }

  // --- Profondeur : qui est titulaire, doublure, troisième choix ------------
  function profondeurEffectif(saison, equipe) {
    const effectif = global.RMClub.effectifPourEquipe(saison, equipe || 'pro') || [];
    const requis = requisParPoste();
    const postes = Object.keys(requis).map((poste) => {
      const joueurs = effectif
        .filter((j) => j.poste === poste)
        .sort((a, b) => note(b) - note(a))
        .map((j, i) => ({
          id: j.id, nom: j.nom, rang: i + 1,
          role: ROLES[i] || 'reserve',
          note: Math.round(note(j)),
          fatigue: j.fatigue || 0,
          matchsJoues: j.matchsJoues || 0,
          disponible: disponible(j),
        }));
      const dispos = joueurs.filter((j) => j.disponible).length;
      return {
        poste, requis: requis[poste],
        joueurs,
        effectifs: joueurs.length,
        disponibles: dispos,
        // Fragile : pas de doublure DISPONIBLE derrière le titulaire. C'est
        // l'information qui manque au manager quand il prépare une rotation.
        fragile: dispos <= 1,
        sousLeGabarit: joueurs.length < requis[poste],
      };
    }).sort((a, b) => (a.poste < b.poste ? -1 : 1));
    return {
      equipe: equipe || 'pro',
      postes,
      postesFragiles: postes.filter((p) => p.fragile).map((p) => p.poste),
      postesSousGabarit: postes.filter((p) => p.sousLeGabarit).map((p) => p.poste),
    };
  }

  // --- Récupération projetée ----------------------------------------------
  // Rappelle la règle du jeu jour après jour (club-evenements.js,
  // fatigueApresUnJourDeRepos) sur une COPIE : le joueur n'est jamais touché.
  function recuperationPrevue(joueur, nbJours, facteurPreparateur) {
    const jours = Math.max(1, Math.min(30, Number(nbJours) || 7));
    const copie = { fatigue: (joueur && joueur.fatigue) || 0, endurance: joueur && joueur.endurance };
    const dans = [];
    for (let i = 0; i < jours; i++) {
      copie.fatigue = global.RMClub.fatigueApresUnJourDeRepos(copie, facteurPreparateur);
      dans.push(copie.fatigue);
    }
    // Jours nécessaires pour repasser sous le seuil où un joueur est
    // réellement frais — l'information que le manager cherche vraiment.
    let joursPourEtreFrais = null;
    for (let i = 0; i < dans.length; i++) {
      if (dans[i] <= SEUIL_FATIGUE_REPOS) { joursPourEtreFrais = i + 1; break; }
    }
    return { actuelle: (joueur && joueur.fatigue) || 0, dans, joursPourEtreFrais };
  }

  // --- Charge : qui est en surrégime, qui ne joue pas ----------------------
  function chargeEffectif(saison, equipe) {
    const effectif = global.RMClub.effectifPourEquipe(saison, equipe || 'pro') || [];
    const joues = effectif.map((j) => j.matchsJoues || 0);
    const moyenne = joues.length ? joues.reduce((t, n) => t + n, 0) / joues.length : 0;
    const surcharges = [];
    const sousUtilises = [];
    for (const j of effectif) {
      if (!disponible(j)) continue;
      const m = j.matchsJoues || 0;
      const f = j.fatigue || 0;
      if (f >= SEUIL_FATIGUE_ALERTE) {
        surcharges.push({ id: j.id, nom: j.nom, poste: j.poste, fatigue: f, matchsJoues: m,
          motif: `Fatigue à ${f} : au-delà de ${SEUIL_FATIGUE_ALERTE}, il ne récupère plus entre deux matchs.` });
      } else if (moyenne > 0 && m >= moyenne + ECART_MATCHS_SURCHARGE) {
        surcharges.push({ id: j.id, nom: j.nom, poste: j.poste, fatigue: f, matchsJoues: m,
          motif: `${m} matchs joués contre ${Math.round(moyenne)} en moyenne dans le groupe.` });
      } else if (moyenne >= 2 && m === 0) {
        sousUtilises.push({ id: j.id, nom: j.nom, poste: j.poste, fatigue: f, matchsJoues: m,
          motif: 'Aucun match joué cette saison.' });
      }
    }
    return {
      equipe: equipe || 'pro',
      moyenneMatchs: Math.round(moyenne * 10) / 10,
      surcharges: surcharges.sort((a, b) => b.fatigue - a.fatigue),
      sousUtilises,
    };
  }

  // --- Suggestion de rotation ---------------------------------------------
  // Propose un XV en pénalisant la fatigue, sans jamais l'appliquer. Le score
  // retenu est la note du joueur DIMINUÉE de sa fatigue : un excellent joueur
  // à 90 de fatigue passe derrière une doublure fraîche, ce qui est
  // exactement l'arbitrage que le manager doit pouvoir voir.
  const POIDS_FATIGUE = 0.45;

  function suggestionRotation(saison, equipe, options) {
    const RMClub = global.RMClub;
    const type = equipe || 'pro';
    const effectif = (RMClub.effectifPourEquipe(saison, type) || []).filter(disponible);
    const slot = RMClub.slotCompositionPourEquipe(saison, type);
    const actuelle = (slot && slot.compositionTitulaires) || {};
    // On réutilise le sélecteur du jeu en lui INJECTANT notre critère : la
    // note au poste diminuée de la fatigue. Aucune seconde logique de
    // composition n'est écrite ici — les règles de poste, de repli et de
    // doublon restent celles du jeu.
    const composition = RMClub.meilleureComposition(effectif,
      (j, poste) => RMClub.noteAuPoste(j, poste) - POIDS_FATIGUE * (j.fatigue || 0));
    const parId = {};
    for (const j of (RMClub.effectifPourEquipe(saison, type) || [])) parId[j.id] = j;
    const changements = [];
    for (const numero of Object.keys(composition)) {
      const avant = actuelle[numero];
      const apres = composition[numero];
      if (!avant || avant === apres) continue;
      const jAvant = parId[avant];
      const jApres = parId[apres];
      if (!jAvant || !jApres) continue;
      const raison = (jAvant.blessureJournees > 0)
        ? `${jAvant.nom} est blessé.`
        : (jAvant.fatigue || 0) >= SEUIL_FATIGUE_REPOS
          ? `${jAvant.nom} est à ${jAvant.fatigue} de fatigue, ${jApres.nom} à ${jApres.fatigue || 0}.`
          : `${jApres.nom} est plus frais et disponible à ce poste.`;
      changements.push({
        numero,
        sort: { id: jAvant.id, nom: jAvant.nom, fatigue: jAvant.fatigue || 0 },
        entre: { id: jApres.id, nom: jApres.nom, fatigue: jApres.fatigue || 0 },
        raison,
      });
    }
    return {
      equipe: type,
      composition,
      changements,
      // Ce que le manager gagnerait : fatigue moyenne du XV proposé contre
      // celle du XV actuel. Chiffre RÉEL, calculé sur les deux compositions.
      fatigueMoyenneActuelle: moyenneFatigue(actuelle, parId),
      fatigueMoyenneProposee: moyenneFatigue(composition, parId),
    };
  }

  function moyenneFatigue(composition, parId) {
    const ids = Object.values(composition || {}).filter((id) => parId[id]);
    if (!ids.length) return 0;
    return Math.round(ids.reduce((t, id) => t + (parId[id].fatigue || 0), 0) / ids.length);
  }

  // Tout ce qu'un écran doit afficher, pour n'importe laquelle des trois
  // équipes — une seule logique, aucune branche par équipe.
  function dossierRotation(saison, equipe) {
    const type = equipe || 'pro';
    return {
      equipe: type,
      profondeur: profondeurEffectif(saison, type),
      charge: chargeEffectif(saison, type),
      suggestion: suggestionRotation(saison, type),
      seuilAlerte: SEUIL_FATIGUE_ALERTE,
      seuilRepos: SEUIL_FATIGUE_REPOS,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    profondeurEffectif, recuperationPrevue, chargeEffectif, suggestionRotation,
    dossierRotation, SEUIL_FATIGUE_ALERTE, SEUIL_FATIGUE_REPOS,
  });
})(window);
