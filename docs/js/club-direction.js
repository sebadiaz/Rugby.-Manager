// Direction et vestiaire (Mode Club) — les deux pressions qui pèsent sur un
// manager en dehors du terrain, désormais DATÉES.
//
// La confiance du président et l'objectif de saison existaient déjà, mais ne
// bougeaient qu'une fois par an, à la bascule de saison : entre septembre et
// mai, rien ne venait jamais rappeler au manager qu'il était jugé. De même,
// le moral individuel des joueurs était suivi sans qu'aucun état COLLECTIF
// n'en soit tiré.
//
// Ce module ajoute deux rendez-vous datés :
//
// - le POINT D'ÉTAPE de la direction, à des fractions fixes du championnat :
//   le président compare la position RÉELLE à l'objectif et ajuste sa
//   confiance en conséquence (à la hausse comme à la baisse) ;
// - la RÉUNION DE VESTIAIRE, déclenchée quand le moral moyen de l'effectif
//   tombe réellement bas : une vraie décision, avec un coût.
//
// Rien n'est fabriqué : la position vient du classement réel, le moral moyen
// des moraux réellement suivis joueur par joueur. Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Points d'étape, exprimés en fraction du championnat réellement joué —
  // pas en journées fixes, pour rester juste quel que soit le nombre de
  // clubs de la division (14 ou 16, cf. TAILLE_DIVISION_FRANCE).
  const FRACTIONS_POINT_ETAPE = [0.34, 0.67];
  // En dessous de ce moral moyen, le vestiaire va mal et il se passe
  // quelque chose.
  const SEUIL_MORAL_VESTIAIRE = 45;
  // Un même type d'événement ne se redéclenche pas avant ce délai.
  const DELAI_ENTRE_REUNIONS_JOURS = 21;

  function assurerJournalDirection(saison) {
    const c = saison.clubJoueur;
    if (!c.journalDirection || typeof c.journalDirection !== 'object') {
      c.journalDirection = { pointsEtapeFaits: [], derniereReunionVestiaire: null };
    }
    if (!Array.isArray(c.journalDirection.pointsEtapeFaits)) c.journalDirection.pointsEtapeFaits = [];
    return c.journalDirection;
  }

  // Moral COLLECTIF : moyenne réelle des moraux de l'effectif professionnel.
  function moralVestiaire(saison) {
    const effectif = saison.clubJoueur.effectif || [];
    if (!effectif.length) return 65;
    const total = effectif.reduce((s, j) => s + (j.moral != null ? j.moral : 65), 0);
    return Math.round(total / effectif.length);
  }

  // Position RÉELLE du club au classement (1 = premier).
  function positionActuelle(saison) {
    const classement = global.RMClub.classementTrie(saison);
    return {
      position: classement.findIndex((r) => r.clubId === saison.clubJoueur.id) + 1,
      total: classement.length,
    };
  }

  // --- Point d'étape de la direction --------------------------------------
  // Déclenché quand la part de journées jouées franchit une fraction clé.
  // Le président ajuste sa confiance selon l'écart RÉEL à l'objectif, avec
  // exactement la même logique de comparaison qu'en fin de saison
  // (evaluerObjectifSaison) — jamais une seconde règle qui divergerait.
  function pointEtapeAFaire(saison) {
    const c = saison.clubJoueur;
    const journal = assurerJournalDirection(saison);
    const total = (saison.calendrier || []).filter((f) => f.domicileId === c.id || f.exterieurId === c.id).length;
    if (!total) return null;
    const joues = (saison.calendrier || []).filter((f) => f.joue && (f.domicileId === c.id || f.exterieurId === c.id)).length;
    const part = joues / total;
    for (let i = 0; i < FRACTIONS_POINT_ETAPE.length; i++) {
      if (part >= FRACTIONS_POINT_ETAPE[i] && journal.pointsEtapeFaits.indexOf(i) === -1) {
        return { index: i, joues, total };
      }
    }
    return null;
  }

  function resoudrePointEtape(saison) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const aFaire = pointEtapeAFaire(saison);
    if (!aFaire) return null;
    const journal = assurerJournalDirection(saison);
    journal.pointsEtapeFaits.push(aFaire.index);
    if (!c.objectifSaison) return null; // pas d'objectif défini : rien à juger
    const { position, total } = positionActuelle(saison);
    const confianceAvant = c.confiancePresident != null ? c.confiancePresident : 60;
    // Même comparaison qu'en fin de saison, mais à effet réduit : un point
    // d'étape n'est pas un bilan définitif.
    const evaluation = RMClub.evaluerObjectifSaison(c.objectifSaison, position, confianceAvant);
    const delta = Math.round(evaluation.delta / 2);
    c.confiancePresident = Math.max(0, Math.min(100, confianceAvant + delta));
    const objectifTxt = RMClub.libelleObjectifSaison(c.objectifSaison);
    const corps = evaluation.reussi
      ? `Après ${aFaire.joues} journée(s), le club est ${position}e sur ${total}. La direction est satisfaite : l'objectif « ${objectifTxt} » est en bonne voie. Confiance ${delta >= 0 ? '+' : ''}${delta} (${c.confiancePresident} %).`
      : `Après ${aFaire.joues} journée(s), le club n'est que ${position}e sur ${total}. La direction rappelle son objectif : « ${objectifTxt} ». Confiance ${delta >= 0 ? '+' : ''}${delta} (${c.confiancePresident} %).`;
    RMClub.ajouterMessage(saison, 'saison', 'Point d\'étape de la direction', corps);
    // Sous le seuil, le chiffre ne suffit plus : la direction pose un
    // ultimatum qui dit ce qu'elle attend et ce qui arrivera sinon.
    const ultimatum = poserUltimatum(saison, { position, total });
    return {
      position, total, delta,
      confiance: c.confiancePresident,
      reussi: evaluation.reussi,
      ultimatum,
    };
  }

  // --- Ultimatum de la direction (TODO_AUDIT.md P1-42a) -------------------
  //
  // AVANT, un point d'étape écrivait « Confiance −4 (31 %) » : un chiffre,
  // sans la moindre conséquence. La confiance pouvait descendre à 5 % sans
  // que rien n'arrive avant la fin de saison, et le manager ne savait ni ce
  // qu'on attendait de lui, ni ce qu'il risquait.
  //
  // Un ultimatum répond aux trois questions : POURQUOI (position réelle
  // contre objectif), QUELLE DÉCISION (regagner N places en M matchs), et
  // QUELLE CONSÉQUENCE (licenciement). Il vit dans la sauvegarde, se
  // décompte à chaque rencontre RÉELLE du premier XV, et se résout tout
  // seul. Aucun tirage : deux situations identiques donnent le même
  // ultimatum.
  const SEUIL_ULTIMATUM = 35;
  const MATCHS_ULTIMATUM = 3;
  const PLACES_A_REGAGNER = 2;
  const BONUS_CONFIANCE_REUSSITE = 12;

  function ultimatumEnCours(saison) {
    const u = (saison.clubJoueur || {}).ultimatum;
    return u && u.actif ? u : null;
  }

  // Posé UNIQUEMENT sous le seuil, et jamais deux fois de suite.
  function poserUltimatum(saison, situation) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const confiance = c.confiancePresident != null ? c.confiancePresident : 60;
    if (confiance >= SEUIL_ULTIMATUM) return null;
    if (ultimatumEnCours(saison)) return null;
    const position = situation.position;
    const total = situation.total;
    const objectifTxt = c.objectifSaison ? RMClub.libelleObjectifSaison(c.objectifSaison) : null;
    // Cible : regagner deux places, sans jamais exiger mieux que l'objectif
    // de la saison — la direction ne demande pas l'impossible.
    const viseObjectif = c.objectifSaison ? c.objectifSaison.position : 1;
    const positionCible = Math.max(viseObjectif, position - PLACES_A_REGAGNER);
    const u = {
      actif: true,
      poseSaison: saison.numero || 1,
      poseISO: RMClub.dateISO ? RMClub.dateISO(RMClub.dateCourante(saison)) : null,
      positionDepart: position,
      positionCible,
      totalClubs: total,
      matchsRestants: MATCHS_ULTIMATUM,
      matchsTotal: MATCHS_ULTIMATUM,
      confianceALaPose: confiance,
      explication: `Confiance ${confiance} % — la direction juge la ${position}e place insuffisante` +
        (objectifTxt ? ` par rapport à l'objectif « ${objectifTxt} »` : '') +
        `. ${MATCHS_ULTIMATUM} matchs pour remonter au moins ${positionCible}e, sous peine de licenciement.`,
    };
    c.ultimatum = u;
    RMClub.ajouterMessage(saison, 'direction', 'Ultimatum de la direction', u.explication);
    return u;
  }

  // Appelé après CHAQUE rencontre du premier XV. `situation` porte le
  // classement réel du moment — jamais une estimation.
  function avancerUltimatum(saison, situation) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const u = ultimatumEnCours(saison);
    if (!u) return null;
    // Cible atteinte : on lève l'ultimatum immédiatement, sans attendre la
    // fin du compte — c'est le sens même d'un redressement.
    if (situation.position <= u.positionCible) {
      u.actif = false;
      u.issue = 'reussi';
      const avant = c.confiancePresident != null ? c.confiancePresident : 60;
      c.confiancePresident = Math.max(0, Math.min(100, avant + BONUS_CONFIANCE_REUSSITE));
      RMClub.ajouterMessage(saison, 'direction', 'Ultimatum levé — la direction te soutient',
        `${situation.position}e place : la cible (${u.positionCible}e) est atteinte. ` +
        `La direction renouvelle sa confiance (${avant} % → ${c.confiancePresident} %).`);
      return { issue: 'reussi', ultimatum: u };
    }
    u.matchsRestants -= 1;
    if (u.matchsRestants > 0) {
      RMClub.ajouterMessage(saison, 'direction', 'Ultimatum en cours',
        `${situation.position}e place. Il reste ${u.matchsRestants} match(s) pour remonter au moins ${u.positionCible}e.`);
      return { issue: 'enCours', ultimatum: u };
    }
    // Compte épuisé sans redressement : licenciement RÉEL. Le manager
    // atterrit sur le marché de l'emploi (cf. club-carriere-manager.js), il
    // ne se retrouve jamais devant un écran sans issue.
    u.actif = false;
    u.issue = 'echoue';
    const raison = `${MATCHS_ULTIMATUM} matchs pour remonter ${u.positionCible}e, et le club est toujours ` +
      `${situation.position}e. La direction met fin à ta mission.`;
    if (RMClub.licencierManager) RMClub.licencierManager(saison, raison);
    else RMClub.ajouterMessage(saison, 'direction', 'Licenciement', raison);
    return { issue: 'echoue', ultimatum: u, raison };
  }

  // Point d'entrée de la BOUCLE DE JEU : appelé une fois par rencontre du
  // premier XV, une fois le classement de la journée complet. Il dérive la
  // position réelle lui-même pour que l'UI n'ait aucun calcul à refaire —
  // sinon deux endroits décideraient de la même chose (le défaut récurrent
  // corrigé en P1-35/39/41).
  function avancerUltimatumApresMatch(saison) {
    if (!ultimatumEnCours(saison)) return null;
    const { position, total } = positionActuelle(saison);
    if (!position) return null;
    return avancerUltimatum(saison, { position, total });
  }

  // --- Vestiaire ----------------------------------------------------------
  // Un moral collectif réellement bas déclenche une décision : réunir le
  // groupe (le lendemain devient une journée de récupération, et le moral
  // remonte) ou laisser filer (rien n'est imposé, mais rien ne s'arrange).
  function reunionVestiaireAFaire(saison, date) {
    const RMClub = global.RMClub;
    const journal = assurerJournalDirection(saison);
    if (moralVestiaire(saison) >= SEUIL_MORAL_VESTIAIRE) return false;
    if (journal.derniereReunionVestiaire) {
      const derniere = RMClub.dateDepuisISO(journal.derniereReunionVestiaire);
      if (derniere && RMClub.ecartJours(derniere, date) < DELAI_ENTRE_REUNIONS_JOURS) return false;
    }
    return true;
  }

  function declencherReunionVestiaire(saison, date) {
    const RMClub = global.RMClub;
    if (!reunionVestiaireAFaire(saison, date)) return null;
    const journal = assurerJournalDirection(saison);
    journal.derniereReunionVestiaire = RMClub.dateISO(date);
    const moral = moralVestiaire(saison);
    RMClub.ajouterMessage(saison, 'joueur', 'Ambiance du vestiaire',
      `Le moral du groupe est tombé à ${moral} %. Ton capitaine vient te voir : le vestiaire a besoin d'être remobilisé.`,
      {
        type: 'vestiaire',
        resolu: false,
        dateLimite: RMClub.dateISO(RMClub.ajouterJours(date, 7)),
        options: [
          { id: 'reunir', libelle: 'Réunir le groupe' },
          { id: 'laisser', libelle: 'Laisser passer' },
        ],
      });
    return { moral };
  }

  // Conséquences RÉELLES de la décision de vestiaire, appliquées par
  // resoudreDecisionMessage (cf. club-decisions.js) : réunir remonte
  // réellement le moral de tout l'effectif mais coûte une journée de travail
  // (le lendemain passe en récupération) ; laisser filer l'enfonce un peu.
  function appliquerDecisionVestiaire(saison, optionId) {
    const RMClub = global.RMClub;
    const effectif = saison.clubJoueur.effectif || [];
    if (optionId === 'reunir') {
      for (const j of effectif) {
        j.moral = Math.max(0, Math.min(100, (j.moral != null ? j.moral : 65) + 9));
      }
      // Le coût : la séance du lendemain passe en récupération — une réunion
      // de groupe prend la place du travail prévu.
      const demain = RMClub.jourSemaine(RMClub.ajouterJours(RMClub.dateCourante(saison), 1));
      RMClub.definirSeance(saison, demain, 'recuperation');
      return `Tu as réuni le groupe : le moral remonte, mais la séance du lendemain est sacrifiée à la discussion.`;
    }
    for (const j of effectif) {
      j.moral = Math.max(0, Math.min(100, (j.moral != null ? j.moral : 65) - 4));
    }
    return `Tu as laissé passer : l'ambiance ne s'arrange pas d'elle-même.`;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    ultimatumEnCours, poserUltimatum, avancerUltimatum, avancerUltimatumApresMatch,
    moralVestiaire, pointEtapeAFaire, resoudrePointEtape, reunionVestiaireAFaire,
    declencherReunionVestiaire, appliquerDecisionVestiaire,
  });
})(window);
