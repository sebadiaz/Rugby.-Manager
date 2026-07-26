// Condition physique et progression individuelle (Mode Club) — domaine
// extrait de club.js (TODO_AUDIT.md P2-10, tranche 12) : fatigue, moral,
// entraînement, blessures. Appelés une fois par journée jouée (cf.
// clubUI.js, onResultat), répercutés RÉELLEMENT sur les stats effectives
// transmises au moteur (cf. compositionVersJoueursCfg dans
// club-composition.js) — jamais de simples badges cosmétiques.
//
// Domaine autonome : aucun état de module, une seule dépendance externe
// (ajouterMessage, déjà exportée de club.js), appelée via RMClub.*.
(function (global) {
  'use strict';

  // Fatigue (Mode Club) : les titulaires du jour encaissent une charge de
  // match (répercutée sur leurs stats effectives au match suivant, cf.
  // compositionVersJoueursCfg), les autres récupèrent — appelé une fois par
  // journée jouée, comme faireProgresserBlessures. `matchsJoues` est le
  // compteur RÉEL de titularisations affiché dans la fiche joueur.
  // `facteurPreparateur` (défaut 1 = comportement historique inchangé) :
  // <1 réduit la fatigue encaissée et accélère la récupération, cf. le
  // préparateur physique dans le personnel (effetPersonnel).
  function appliquerFatigue(effectif, compositionTitulaires, facteurPreparateur) {
    const fp = facteurPreparateur != null ? facteurPreparateur : 1;
    const titulairesIds = new Set(Object.values(compositionTitulaires || {}));
    for (const j of effectif) {
      // Endurance (0-100, neutre 60 = comportement historique inchangé) :
      // un joueur endurant encaisse moins de fatigue et récupère plus vite,
      // un joueur peu endurant l'inverse — borné pour rester réaliste.
      const endurance = j.endurance != null ? j.endurance : 60;
      if (titulairesIds.has(j.id)) {
        const facteurGain = Math.max(0.5, Math.min(1.6, 1 + (60 - endurance) / 75)) * fp;
        j.fatigue = Math.min(100, (j.fatigue || 0) + Math.round(32 * facteurGain));
        j.matchsJoues = (j.matchsJoues || 0) + 1;
      } else {
        const facteurRecup = Math.max(0.5, Math.min(1.6, 1 + (endurance - 60) / 75)) / fp;
        j.fatigue = Math.max(0, (j.fatigue || 0) - Math.round(22 * facteurRecup));
      }
    }
  }

  // --- Moral (Mode Club) : monte pour les titulaires qui gagnent, baisse
  // légèrement en cas de défaite, dérive doucement vers la neutralité (65)
  // pour les non-sélectionnés — répercuté sur les stats effectives en match
  // (cf. compositionVersJoueursCfg), jamais un simple badge. ---
  function appliquerMoral(effectif, compositionTitulaires, forme) {
    const titulairesIds = new Set(Object.values(compositionTitulaires || {}));
    const variation = forme === 'v' ? 8 : forme === 'd' ? -6 : 1;
    for (const j of effectif) {
      const actuel = j.moral != null ? j.moral : 65;
      if (titulairesIds.has(j.id)) {
        j.moral = Math.max(0, Math.min(100, actuel + variation));
      } else {
        // Dérive lente vers la neutralité pour qui ne joue pas (ni euphorie
        // ni frustration durable sans y avoir participé).
        j.moral = actuel + Math.sign(65 - actuel) * Math.min(3, Math.abs(65 - actuel));
      }
    }
  }

  // --- Entraînement (Mode Club) : un programme choisi par le joueur nudge
  // réellement les attributs correspondants, borné par le potentiel de
  // chacun et sa fenêtre d'âge — appelé une fois par journée jouée, comme
  // appliquerFatigue/faireProgresserBlessures. Jamais un simple badge : les
  // valeurs affichées dans la fiche joueur bougent vraiment. ---
  const ENTRAINEMENTS = {
    melee: { label: 'Mêlée', description: 'Renforce la technique de poussée en mêlée des avants.', attributs: ['melee'], postes: ['P', 'T', '2L', '3L'] },
    touche: { label: 'Touche', description: 'Améliore la contestation en touche (sauteurs et soutiens).', attributs: ['touche'], postes: ['2L', '3L', 'T'] },
    physique: { label: 'Physique', description: "Développe puissance et endurance de tout l'effectif.", attributs: ['puissance', 'endurance'], postes: null },
    main: { label: 'Jeu de main', description: 'Travaille la passe et la prise de décision au contact.', attributs: ['passe', 'decision'], postes: ['DM', 'OV', 'CE', 'AI', 'AR'] },
    pied: { label: 'Jeu au pied', description: 'Perfectionne la précision au pied (buts et jeu courant).', attributs: ['jeuPied', 'adresse'], postes: ['DM', 'OV', 'AR'] },
    discipline: { label: 'Discipline', description: 'Réduit les fautes concédées, notamment en mêlée et au maul.', attributs: ['discipline'], postes: null },
  };
  // `facteurEntraineur` (défaut 1 = comportement historique inchangé) : >1
  // accélère la progression, cf. l'entraîneur adjoint dans le personnel.
  // Entraînement INDIVIDUEL (cf. j.entrainementIndividuel) : un joueur peut
  // suivre un programme différent du collectif — utile pour cibler la
  // faiblesse d'un joueur précis sans réorienter tout l'effectif.
  function appliquerEntrainement(rng, effectif, focus, facteurEntraineur) {
    const fe = facteurEntraineur != null ? facteurEntraineur : 1;
    const programmeCollectif = ENTRAINEMENTS[focus];
    for (const j of effectif) {
      const programme = (j.entrainementIndividuel && ENTRAINEMENTS[j.entrainementIndividuel]) || programmeCollectif;
      if (!programme) continue;
      if (programme.postes && !programme.postes.includes(j.poste)) continue;
      if (j.age >= 32) continue; // progression réservée aux joueurs encore en développement
      const potentiel = j.potentiel != null ? j.potentiel : 70;
      // Progression graduelle et probabiliste (pas à chaque journée pour
      // chaque joueur, sinon tout le monde plafonnerait en 3 semaines) —
      // jamais au-delà du potentiel individuel.
      if (rng() >= 0.35 * fe) continue;
      for (const attr of programme.attributs) {
        const actuel = j[attr] != null ? j[attr] : 60;
        if (actuel >= potentiel) continue;
        j[attr] = Math.min(potentiel, actuel + 1);
      }
    }
  }

  // Réduit les blessures d'une journée (appelé une fois par journée jouée) et
  // tire une petite chance de blessure pour chaque titulaire qui a joué.
  // `facteurMedecin` (défaut 1 = comportement historique inchangé) : >1
  // accélère la guérison (récupération plus rapide, nouvelles blessures plus
  // courtes) — cf. le médecin dans le personnel (effetPersonnel).
  // `saison` (optionnel, 5e paramètre) : si fourni, une nouvelle blessure
  // génère un message RÉEL dans la boîte de réception — omis dans les
  // scripts/tests qui n'ont pas de saison complète sous la main.
  function faireProgresserBlessures(rng, effectif, composition, facteurMedecin, saison) {
    const fm = facteurMedecin != null ? facteurMedecin : 1;
    for (const j of effectif) {
      if (j.blessureJournees > 0) j.blessureJournees = Math.max(0, j.blessureJournees - Math.max(1, Math.round(fm)));
    }
    const titulairesIds = new Set(Object.values(composition || {}));
    for (const j of effectif) {
      if (!titulairesIds.has(j.id)) continue;
      if (rng() < 0.06) {
        j.blessureJournees = Math.max(1, Math.round((1 + Math.floor(rng() * 3)) / fm)); // 1-3 journées, réduites par le médecin
        if (saison) global.RMClub.ajouterMessage(saison, 'blessure', 'Blessure', `${j.nom} est blessé pour ${j.blessureJournees} journée(s).`);
      }
    }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    appliquerFatigue, appliquerMoral, ENTRAINEMENTS, appliquerEntrainement, faireProgresserBlessures,
  });
})(window);
