// Événements quotidiens (Mode Club) — ce qui se passe RÉELLEMENT chaque jour
// de la carrière, entre deux matchs.
//
// Tranche 1 avait donné une date au jeu : « Continuer » sautait d'une
// échéance à l'autre, mais les jours traversés ne produisaient rien. Ce
// module les rend vivants : chaque journée écoulée est réellement simulée,
// dans l'ordre, et modifie l'effectif.
//
// Trois règles fixes :
//
// 1. AUCUNE CARTE DÉCORATIVE. Un événement n'existe que s'il a modifié
//    quelque chose de vérifiable dans la sauvegarde (fatigue, blessure,
//    disponibilité). `resoudreJourneeQuotidienne` renvoie ce qui a
//    RÉELLEMENT changé — l'UI n'affiche jamais autre chose.
//
// 2. DÉTERMINISME. Aucun `Math.random` : le rng est fourni par l'appelant,
//    dérivé de la graine de la saison et de la date (cf. club-temps.js,
//    grainePourJour). Rejouer la même date donne exactement le même résultat.
//
// 3. AUCUNE DÉPENDANCE AU DOM. Couche données pure, testable sans navigateur.
(function (global) {
  'use strict';

  // Récupération quotidienne : un joueur qui ne joue pas récupère chaque
  // jour, pas seulement le jour d'un match. C'est ce qui donne enfin un sens
  // au repos — avant, un titulaire permanent voyait sa fatigue ne faire que
  // monter (il ne récupérait QUE les journées où il n'était pas aligné) et
  // finissait scotché à 100 dès le premier tiers de saison.
  //
  // Ordres de grandeur : ~5 points par jour de récupération contre ~32 pour
  // un match, soit environ 30 points récupérés sur les six jours d'une
  // semaine sans match — un titulaire régulier accumule donc lentement de la
  // fatigue au lieu de saturer, et un joueur laissé au repos redevient frais
  // en quelques jours.
  const RECUPERATION_PAR_JOUR = 5;

  function recupererFatigueDuJour(effectif, facteurPreparateur) {
    const fp = facteurPreparateur != null ? facteurPreparateur : 1;
    let total = 0;
    for (const j of effectif) {
      const avant = j.fatigue || 0;
      if (avant <= 0) continue;
      // Endurance (neutre 60) : un joueur endurant récupère plus vite. Le
      // préparateur physique (fp < 1) accélère encore la récupération —
      // même convention que la charge de match.
      const endurance = j.endurance != null ? j.endurance : 60;
      const facteur = Math.max(0.5, Math.min(1.6, 1 + (endurance - 60) / 75)) / fp;
      j.fatigue = Math.max(0, avant - Math.round(RECUPERATION_PAR_JOUR * facteur));
      total += avant - j.fatigue;
    }
    return total;
  }

  // Guérison quotidienne : `blessureJournees` compte désormais des JOURS
  // (cf. migration 3 → 4 dans club-sauvegarde.js), donc une blessure se
  // résorbe jour après jour au lieu d'attendre le prochain match. Retourne
  // les joueurs qui redeviennent disponibles AUJOURD'HUI — un vrai
  // événement, pas un compteur qui bouge en silence.
  function soignerBlessuresDuJour(effectif, facteurMedecin) {
    const fm = facteurMedecin != null ? facteurMedecin : 1;
    const retablis = [];
    for (const j of effectif) {
      if (!(j.blessureJournees > 0)) continue;
      j.blessureJournees = Math.max(0, j.blessureJournees - Math.max(1, Math.round(fm)));
      if (j.blessureJournees === 0) retablis.push(j);
    }
    return retablis;
  }

  // Un prêt court aussi en jours (cf. progresserPrets, appelé jusqu'ici une
  // fois par match) : même principe, le temps passe même sans match.
  function progresserPretsDuJour(effectif) {
    const revenus = [];
    for (const j of effectif) {
      if (!j.pret) continue;
      j.pret.dureeRestante -= 1;
      if (j.pret.dureeRestante <= 0) { j.pret = null; revenus.push(j); }
    }
    return revenus;
  }

  // --- LE point d'entrée : une journée de carrière ------------------------
  // Applique, dans l'ordre, tout ce qui se produit un jour donné pour le
  // club du joueur, et renvoie la liste des changements RÉELS. Les matchs,
  // eux, restent résolus par clubUI.js (ils passent par le moteur et un
  // écran) : ce module couvre ce qui se passe ENTRE les matchs.
  function resoudreJourneeQuotidienne(saison, date, rng, options) {
    const RMClub = global.RMClub;
    const opts = options || {};
    const c = saison.clubJoueur;
    const effectifs = [c.effectif, c.jeunes || []];

    const facteurPreparateur = 1 / RMClub.effetPersonnel(saison, 'preparateur');
    const facteurMedecin = RMClub.effetPersonnel(saison, 'medecin');

    // Séance du jour (TODO_AUDIT.md P1-23) : elle module la récupération —
    // une journée de repos régénère bien plus qu'une séance physique — et
    // fait réellement progresser certains joueurs, jamais tout l'effectif de
    // la même façon (cf. club-semaine-entrainement.js). Un jour de match du
    // premier XV n'a pas de séance : le match EST la charge du jour.
    const cleSeance = RMClub.seancePourDate(saison, date);
    const seance = cleSeance ? RMClub.ACTIVITES_ENTRAINEMENT[cleSeance] : null;
    const facteurRecup = seance ? seance.recuperation : 1;
    const facteurEntraineur = RMClub.effetPersonnel(saison, 'entraineur');

    let fatigueRecuperee = 0;
    const retablis = [];
    const retoursDePret = [];
    const progressions = [];
    for (const effectif of effectifs) {
      fatigueRecuperee += recupererFatigueDuJour(effectif, facteurPreparateur / facteurRecup);
      if (cleSeance) {
        // Programme individuel : un joueur peut travailler SON activité
        // plutôt que celle du jour (cf. repartirParActivite).
        const groupes = RMClub.repartirParActivite(effectif, cleSeance);
        for (const cle of Object.keys(groupes)) {
          for (const p of RMClub.appliquerSeance(rng, groupes[cle], cle, facteurEntraineur, facteurPreparateur)) {
            progressions.push(p);
          }
        }
      }
      for (const j of soignerBlessuresDuJour(effectif, facteurMedecin)) retablis.push(j);
      for (const j of progresserPretsDuJour(effectif)) retoursDePret.push(j);
    }

    // Événements DATÉS de la journée, tous à conséquence réelle
    // (TODO_AUDIT.md P1-23/P1-24) : rapports de scouting remis, réponses des
    // joueurs aux propositions de contrat, décisions non tranchées dans les
    // délais, point d'étape de la direction, ambiance du vestiaire.
    const rapports = RMClub.remettreRapportsScouting(saison, date);
    const reponsesContrat = RMClub.resoudreNegociationsContrat(rng, saison, date);
    const decisionsExpirees = RMClub.resoudreDecisionsExpirees(saison, date);
    const pointEtape = RMClub.resoudrePointEtape(saison);
    const reunionVestiaire = RMClub.declencherReunionVestiaire(saison, date);

    // Un retour de blessure ou de prêt change la composition disponible : le
    // manager doit l'apprendre. Message RÉEL, adossé à un changement réel.
    for (const j of retablis) {
      RMClub.ajouterMessage(saison, 'blessure', 'Retour de blessure',
        `${j.nom} est de nouveau disponible pour la sélection.`);
    }
    for (const j of retoursDePret) {
      RMClub.ajouterMessage(saison, 'transfert', 'Fin de prêt',
        `${j.nom} revient de prêt et réintègre le groupe.`);
    }

    return {
      date: RMClub.dateISO(date),
      seance: cleSeance,
      fatigueRecuperee,
      progressions,
      rapports,
      reponsesContrat,
      decisionsExpirees,
      pointEtape,
      reunionVestiaire,
      retablis: retablis.map((j) => j.nom),
      retoursDePret: retoursDePret.map((j) => j.nom),
      estJourDeMatch: !!opts.estJourDeMatch,
    };
  }

  // Avance la carrière jour par jour jusqu'à `dateCible` INCLUSE, en
  // résolvant chaque journée traversée. Retourne le détail de ce qui s'est
  // passé — l'UI n'a plus qu'à le montrer, sans rien recalculer.
  //
  // Bornée par `maxJours` (garde-fou) : une date cible incohérente ne peut
  // jamais faire tourner la boucle indéfiniment.
  function avancerJusquA(saison, dateCible, maxJours) {
    const RMClub = global.RMClub;
    const graine = Number.isFinite(saison.graine) ? saison.graine : 1;
    const journees = [];
    const limite = maxJours || 400;
    let garde = 0;
    while (RMClub.comparerDates(RMClub.dateCourante(saison), dateCible) < 0 && garde++ < limite) {
      const suivant = RMClub.ajouterJours(RMClub.dateCourante(saison), 1);
      RMClub.definirDateCourante(saison, suivant);
      const rng = global.RugbyEngine.creerRng(RMClub.grainePourJour(graine, suivant, 7));
      journees.push(resoudreJourneeQuotidienne(saison, suivant, rng, {
        estJourDeMatch: !!RMClub.typeDArret(saison, suivant),
      }));
    }
    return journees;
  }

  // Résumé lisible d'une série de journées, pour l'affichage après un
  // « Continuer » — uniquement ce qui a réellement changé.
  function resumerJournees(journees) {
    const retablis = [];
    const retoursDePret = [];
    const rapports = [];
    const decisionsExpirees = [];
    const reponsesContrat = [];
    let fatigueRecuperee = 0;
    let nbProgressions = 0;
    let pointEtape = null;
    let reunionVestiaire = null;
    for (const j of journees) {
      fatigueRecuperee += j.fatigueRecuperee;
      nbProgressions += (j.progressions || []).length;
      for (const n of j.retablis) retablis.push(n);
      for (const n of j.retoursDePret) retoursDePret.push(n);
      for (const r of j.rapports || []) rapports.push(r);
      for (const r of j.reponsesContrat || []) reponsesContrat.push(r);
      for (const d of j.decisionsExpirees || []) decisionsExpirees.push(d);
      if (j.pointEtape) pointEtape = j.pointEtape;
      if (j.reunionVestiaire) reunionVestiaire = j.reunionVestiaire;
    }
    return {
      nbJours: journees.length, fatigueRecuperee, nbProgressions,
      retablis, retoursDePret, rapports, reponsesContrat, decisionsExpirees,
      pointEtape, reunionVestiaire,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    RECUPERATION_PAR_JOUR, recupererFatigueDuJour, soignerBlessuresDuJour, progresserPretsDuJour,
    resoudreJourneeQuotidienne, avancerJusquA, resumerJournees,
  });
})(window);
