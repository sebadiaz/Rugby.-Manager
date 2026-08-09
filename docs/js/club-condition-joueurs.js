// Condition physique et progression individuelle (Mode Club) — domaine
// extrait de club.js (TODO_AUDIT.md P2-10, tranche 12) : fatigue, moral,
// entraînement, blessures — répercutés RÉELLEMENT sur les stats effectives
// transmises au moteur (cf. compositionVersJoueursCfg dans
// club-composition.js), jamais de simples badges cosmétiques.
//
// Depuis le passage à la carrière quotidienne (TODO_AUDIT.md P1-22), ce
// fichier ne garde que ce qui se produit LE JOUR D'UN MATCH : la charge de
// fatigue encaissée par les titulaires et le tirage de nouvelles blessures.
// La RÉCUPÉRATION et la GUÉRISON, elles, sont devenues quotidiennes et
// vivent dans docs/js/club-evenements.js — c'est ce qui donne enfin un sens
// au repos, et ce qui empêche un titulaire permanent de rester scotché à
// 100 de fatigue faute de jamais récupérer.
//
// Domaine autonome : aucun état de module, une seule dépendance externe
// (ajouterMessage, déjà exportée de club.js), appelée via RMClub.*.
(function (global) {
  'use strict';

  // Fatigue de MATCH : les titulaires du jour encaissent une charge
  // (répercutée sur leurs stats effectives au match suivant, cf.
  // compositionVersJoueursCfg). La récupération des autres est quotidienne
  // (cf. club-evenements.js, recupererFatigueDuJour) et n'est donc plus
  // traitée ici. `matchsJoues` est le compteur RÉEL de titularisations
  // affiché dans la fiche joueur.
  // `facteurPreparateur` (défaut 1 = comportement historique inchangé) :
  // <1 réduit la fatigue encaissée et accélère la récupération, cf. le
  // préparateur physique dans le personnel (effetPersonnel).
  function appliquerFatigue(effectif, compositionTitulaires, facteurPreparateur) {
    const fp = facteurPreparateur != null ? facteurPreparateur : 1;
    const titulairesIds = new Set(Object.values(compositionTitulaires || {}));
    for (const j of effectif) {
      if (!titulairesIds.has(j.id)) continue;
      // Endurance (0-100, neutre 60) : un joueur endurant encaisse moins de
      // fatigue, un joueur peu endurant davantage — borné pour rester réaliste.
      const endurance = j.endurance != null ? j.endurance : 60;
      const facteurGain = Math.max(0.5, Math.min(1.6, 1 + (60 - endurance) / 75)) * fp;
      j.fatigue = Math.min(100, (j.fatigue || 0) + Math.round(32 * facteurGain));
      j.matchsJoues = (j.matchsJoues || 0) + 1;
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
        // ni frustration durable sans y avoir participé) — SAUF un joueur
        // qui veut partir (cf. club-decisions.js, demande de temps de jeu
        // ignorée deux fois) : son mécontentement reste réel et visible, il
        // ne se résigne pas silencieusement à la neutralité.
        const cible = j.veutPartir ? 35 : 65;
        j.moral = actuel + Math.sign(cible - actuel) * Math.min(3, Math.abs(cible - actuel));
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
      if (j.veutPartir) continue; // un joueur qui veut partir ne se donne plus à l'entraînement
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

  // Tire une petite chance de blessure pour chaque titulaire qui a joué. La
  // GUÉRISON est quotidienne (cf. club-evenements.js, soignerBlessuresDuJour) :
  // elle n'est plus traitée ici. `facteurMedecin` (défaut 1) : >1 raccourcit
  // les nouvelles blessures — cf. le médecin dans le personnel.
  // `saison` (optionnel, 5e paramètre) : si fourni, une nouvelle blessure
  // génère un message RÉEL dans la boîte de réception — omis dans les
  // scripts/tests qui n'ont pas de saison complète sous la main.
  // Depuis P1-40, ni le TIRAGE ni la DURÉE ne vivent ici : tout passe par
  // club-medical.js, seule source de vérité. Avant, c'était un `rng() < 0.06`
  // PLAT — un pilier de 34 ans cuit à 95 de fatigue et un ailier de 21 ans
  // frais se blessaient exactement autant. Le risque dépend désormais
  // réellement du poste, de l'âge, de la fatigue et des antécédents.
  // `facteurPreparateur` (<1 pour un bon préparateur) réduit le risque ;
  // `facteurMedecin` (>=1) raccourcit la convalescence et affine le
  // diagnostic. Un joueur en reprise peut RECHUTER, et d'autant plus que le
  // manager a précipité son retour.
  function faireProgresserBlessures(rng, effectif, composition, facteurMedecin, saison, facteurPreparateur) {
    const RMClub = global.RMClub;
    const titulairesIds = new Set(Object.values(composition || {}));
    const nouvelles = [];
    for (const j of effectif) {
      if (!titulairesIds.has(j.id)) continue;
      // `saison` transmise pour que le niveau du centre médical (P1-44)
      // s'applique RÉELLEMENT au tirage, pas seulement à l'affichage.
      if (!RMClub.tirerBlessure(rng, j, { cause: 'match', facteurPreparateur, saison })) continue;
      const rechute = !!j.reprise;
      const b = RMClub.infligerBlessure(saison, j, 'match', rng, { facteurMedecin, facteurPreparateur });
      nouvelles.push({ joueur: j, blessure: b, rechute });
      if (saison) {
        const d = RMClub.descriptionBlessure(j);
        global.RMClub.ajouterMessage(saison, 'blessure', rechute ? 'Rechute' : 'Blessure',
          `${j.nom} — ${d.libelle} (${d.zone}), gravité ${d.graviteLibelle.toLowerCase()}. ` +
          `Indisponibilité estimée entre ${d.joursMin} et ${d.joursMax} jour(s).` +
          (rechute ? ' Il était encore en phase de reprise.' : ''));
      }
    }
    return nouvelles;
  }

  // --- Conséquences d'un match : UN SEUL point d'entrée (P1-40) -----------
  // Mesuré avant cette tranche, dans clubUI.js : les quatre types de match ne
  // se comportaient PAS pareil.
  //
  //   Championnat (1er XV)  fatigue oui   blessures oui   préparateur oui
  //   Coupe                 fatigue oui   blessures oui   préparateur NON
  //   Amical                fatigue oui   blessures oui   préparateur NON
  //   Équipe B              fatigue NON   blessures NON   —
  //   Espoirs               +15 fixe      blessures NON   —
  //
  // Un joueur pouvait donc disputer TOUTE la saison avec la réserve sans
  // jamais fatiguer ni se blesser. Les quatre chemins passent désormais par
  // ici : une seule règle, appliquée partout, quelle que soit l'équipe.
  function appliquerEffetsMatch(saison, effectif, composition, rng, options) {
    const RMClub = global.RMClub;
    const o = options || {};
    const facteurPreparateur = o.facteurPreparateur != null ? o.facteurPreparateur
      : (saison && RMClub.effetPersonnel ? 1 / RMClub.effetPersonnel(saison, 'preparateur') : 1);
    const facteurMedecin = o.facteurMedecin != null ? o.facteurMedecin
      : (saison && RMClub.effetPersonnel ? RMClub.effetPersonnel(saison, 'medecin') : 1);
    appliquerFatigue(effectif, composition, facteurPreparateur);
    const blessures = faireProgresserBlessures(rng, effectif, composition,
      facteurMedecin, o.saisonPourMessages !== undefined ? o.saisonPourMessages : saison,
      facteurPreparateur);
    // Un match compte comme un palier franchi pour qui est en reprise : c'est
    // le sens même du « temps de jeu limité » (cf. club-medical.js).
    const titulaires = new Set(Object.values(composition || {}));
    for (const j of effectif) {
      if (titulaires.has(j.id) && j.reprise) RMClub.avancerJourMedical(saison, j);
    }
    return { fatigues: titulaires.size, blessures };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    appliquerFatigue, appliquerMoral, ENTRAINEMENTS, appliquerEntrainement, faireProgresserBlessures,
    appliquerEffetsMatch,
  });
})(window);
