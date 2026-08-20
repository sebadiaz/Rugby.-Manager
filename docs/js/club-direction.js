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

  // --- Le conseil d'administration met le manager devant ses choix (G13) ---
  //
  // Audit mesuré avant : sur 12 saisons simulées, la boîte de réception n'a
  // proposé que deux types de décision — offreAchat (9,8 par saison) et
  // propositionVente (3,1). Rien d'autre. Sept types existent dans le code,
  // mais trois sont des RÉPONSES à une action du manager (il faut d'abord
  // qu'il propose un contrat, fasse une offre, promette un statut), et la
  // direction, elle, ne lui demandait JAMAIS rien : son point d'étape est un
  // message avec un chiffre, son ultimatum est imposé, pas arbitré.
  //
  // Aucune décision du jeu ne touchait donc à la confiance du président ni à
  // la trajectoire de la carrière. Ce bloc ajoute les deux arbitrages qu'un
  // conseil pose réellement à un manager :
  //
  //   - RALLONGE   : « on met de l'argent, mais on relève l'objectif » ;
  //   - ÉCONOMIES  : « les comptes ne suivent plus, il faut vendre ».
  //
  // Aucun tirage aléatoire : les deux naissent d'un état MESURÉ du club
  // (confiance, objectif, budget contre masse salariale). Deux carrières
  // identiques reçoivent la même proposition le même jour.

  // Confiance minimale pour qu'une direction investisse sur son manager.
  const CONFIANCE_RALLONGE = 60;
  // En dessous de ce rapport budget / masse salariale, le club ne couvre plus
  // ses salaires : le conseil exige des économies.
  const RATIO_ALERTE_SALAIRES = 0.5;
  // Un conseil ne revient pas le lendemain : il laisse le manager travailler.
  const DELAI_ENTRE_PROPOSITIONS_JOURS = 45;
  const DELAI_REPONSE_CONSEIL_JOURS = 10;
  // Ce que coûte un refus, en confiance. Refuser des économies pèse plus
  // lourd que refuser une ambition : dans un cas ce sont les comptes du club
  // qui sont en jeu, dans l'autre une envie de la direction.
  const COUT_REFUS_RALLONGE = 5;
  const COUT_REFUS_ECONOMIES = 14;
  // Rallonge proposée, en k€, selon le palier — même échelle que les droits
  // TV (cf. club-revenus-competition.js) : une saison de télévision environ.
  const RALLONGE_PAR_PALIER = { 1: 350, 2: 220, 3: 130 };

  function propositionConseilOuverte(saison) {
    for (const m of (saison.clubJoueur.messages || [])) {
      if (m.decision && m.decision.type === 'conseil' && !m.decision.resolu) return m;
    }
    return null;
  }

  // Le joueur que le conseil désignerait : le SALAIRE le plus lourd parmi
  // ceux qu'on peut réellement céder (cf. motifIncessible — jamais le dernier
  // de son poste, jamais un joueur prêté). C'est la logique d'un conseil qui
  // regarde la masse salariale, pas le niveau sportif — et c'est bien ce qui
  // rend la décision difficile pour le manager.
  function joueurAVendrePourEconomies(saison) {
    const RMClub = global.RMClub;
    const effectif = saison.clubJoueur.effectif || [];
    let choisi = null;
    for (const j of effectif) {
      if (RMClub.motifIncessible && RMClub.motifIncessible(saison, j)) continue;
      if (!choisi || (j.salaire || 0) > (choisi.salaire || 0)) choisi = j;
    }
    return choisi;
  }

  // Club acheteur : celui qui a réellement les moyens, le plus riche d'abord.
  // Si personne ne peut payer, le conseil ne propose rien — il n'invente pas
  // un acheteur pour l'occasion.
  function acheteurPour(saison, prix) {
    const RMClub = global.RMClub;
    let meilleur = null;
    for (const a of (saison.adversaires || [])) {
      if (RMClub.peutPayer && !RMClub.peutPayer(a, prix)) continue;
      if (!meilleur || (a.budget || 0) > (meilleur.budget || 0)) meilleur = a;
    }
    return meilleur;
  }

  // Quelle situation le conseil constate-t-il aujourd'hui ? Renvoie null si
  // aucune : le silence est le cas normal, pas un échec.
  // Un conseil d'administration ne se prononce pas avant que la saison ait
  // commencé : il n'a rien à juger, ni ambition à relever, ni comptes à
  // redresser. MESURÉ en branchant la tranche : sans cette borne, la
  // proposition tombait dès le PREMIER jour d'une carrière neuve — ce qui
  // n'a aucun sens et cassait au passage deux garanties déjà en place
  // (test-parcours-club : une journée qui ne devait produire aucun message,
  // et une avance qui ne devait pas être interrompue au premier jour).
  const MATCHS_AVANT_PROPOSITION = 3;

  function situationConseil(saison) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const objectif = c.objectifSaison;
    if (!objectif) return null;
    const joues = (saison.calendrier || [])
      .filter((f) => f.joue && (f.domicileId === c.id || f.exterieurId === c.id)).length;
    if (joues < MATCHS_AVANT_PROPOSITION) return null;

    // 1. Les comptes d'abord : une direction qui ne paie plus ses salaires ne
    //    parle pas d'ambition.
    const masse = RMClub.masseSalariale ? RMClub.masseSalariale(c.effectif || []) : 0;
    if (masse > 0 && (c.budget || 0) < masse * RATIO_ALERTE_SALAIRES) {
      const joueur = joueurAVendrePourEconomies(saison);
      if (!joueur) return null;
      const prix = RMClub.valeurMarchande
        ? RMClub.valeurMarchande(saison, joueur)
        : RMClub.estimerValeurTransfert(joueur.vitesse, joueur.plaquage, joueur.age);
      const acheteur = acheteurPour(saison, prix);
      if (!acheteur) return null;
      return {
        variante: 'economies',
        joueurId: joueur.id, joueurNom: joueur.nom, joueurPoste: joueur.poste,
        salaire: joueur.salaire, montant: prix,
        acheteurId: acheteur.id, acheteurNom: acheteur.nom,
        budget: c.budget, masse,
      };
    }

    // 2. Sinon, une direction confiante peut vouloir accélérer — à condition
    //    qu'il reste de la marge au-dessus de l'objectif actuel.
    const confiance = c.confiancePresident != null ? c.confiancePresident : 60;
    if (confiance >= CONFIANCE_RALLONGE && objectif.position > 1) {
      const niveau = (c.palierPyramide || { niveau: 3 }).niveau;
      const montant = RALLONGE_PAR_PALIER[niveau] != null
        ? RALLONGE_PAR_PALIER[niveau] : RALLONGE_PAR_PALIER[3];
      // L'objectif relevé : la moitié du chemin vers la première place, au
      // moins une place — jamais « champion » depuis le ventre mou.
      const vise = Math.max(1, objectif.position - Math.max(1, Math.round(objectif.position / 2)));
      return { variante: 'rallonge', montant, objectifVise: vise, confiance };
    }
    return null;
  }

  // Proposition du jour. Appelée par la boucle quotidienne, comme le point
  // d'étape et la réunion de vestiaire.
  function propositionConseilDuJour(saison, date) {
    const RMClub = global.RMClub;
    if (propositionConseilOuverte(saison)) return null;
    const journal = assurerJournalDirection(saison);
    if (journal.dernierePropositionConseil) {
      const precedente = RMClub.dateDepuisISO(journal.dernierePropositionConseil);
      if (RMClub.ecartJours(precedente, date) < DELAI_ENTRE_PROPOSITIONS_JOURS) return null;
    }
    const situation = situationConseil(saison);
    if (!situation) return null;
    journal.dernierePropositionConseil = RMClub.dateISO(date);

    const objectifTxt = RMClub.libelleObjectifSaison(saison.clubJoueur.objectifSaison);
    const corps = situation.variante === 'rallonge'
      ? `Le conseil d'administration est satisfait de ton travail et veut accélérer. `
        + `Il met ${situation.montant} k€ sur la table dès maintenant — mais l'objectif de la saison `
        + `ne serait plus « ${objectifTxt} » : il faudrait finir ${situation.objectifVise}e ou mieux. `
        + `À toi de dire si tu prends l'argent et la pression avec.`
      : `Le conseil a examiné les comptes : ${Math.round(situation.budget)} k€ en caisse pour `
        + `${Math.round(situation.masse)} k€ de salaires annuels. Il exige une vente. `
        + `${situation.joueurNom} (${situation.joueurPoste}, ${situation.salaire} k€/saison) intéresse `
        + `${situation.acheteurNom} pour ${situation.montant} k€. `
        + `Tu peux accepter, ou tenir tête au conseil et l'assumer.`;

    const options = situation.variante === 'rallonge'
      ? [{ id: 'accepter', libelle: `Prendre les ${situation.montant} k€` },
        { id: 'refuser', libelle: 'Garder l\'objectif actuel' }]
      : [{ id: 'accepter', libelle: `Vendre ${situation.joueurNom}` },
        { id: 'refuser', libelle: 'Refuser la vente' }];

    RMClub.ajouterMessage(saison, 'saison',
      situation.variante === 'rallonge'
        ? 'Le conseil propose une rallonge'
        : 'Le conseil exige des économies',
      corps,
      Object.assign({
        type: 'conseil',
        resolu: false,
        dateLimite: RMClub.dateISO(RMClub.ajouterJours(date, DELAI_REPONSE_CONSEIL_JOURS)),
        options,
      }, situation));
    return situation;
  }

  // Conséquences RÉELLES, appliquées par resoudreDecisionMessage
  // (club-decisions.js) : même chemin que toutes les autres décisions, donc
  // même idempotence et même traitement du silence.
  function appliquerDecisionConseil(saison, decision, optionId) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const confiance = c.confiancePresident != null ? c.confiancePresident : 60;

    if (decision.variante === 'rallonge') {
      if (optionId === 'accepter') {
        RMClub.mouvementTresorerie(saison, 'direction',
          'Rallonge du conseil d\'administration', decision.montant);
        c.objectifSaison = Object.assign({}, c.objectifSaison, { position: decision.objectifVise });
        return `Tu as accepté les ${decision.montant} k€. L'objectif de la saison devient `
          + `« ${RMClub.libelleObjectifSaison(c.objectifSaison)} » — le conseil te jugera là-dessus.`;
      }
      c.confiancePresident = Math.max(0, Math.min(100, confiance - COUT_REFUS_RALLONGE));
      return `Tu as décliné la rallonge. Le conseil comprend, mais note que tu n'as pas voulu `
        + `de l'ambition qu'il te proposait (confiance ${c.confiancePresident} %).`;
    }

    if (decision.variante === 'economies') {
      if (optionId === 'accepter') {
        const vente = RMClub.vendreJoueur(saison, decision.joueurId, decision.acheteurId, decision.montant);
        if (!vente || !vente.ok) {
          // La situation a changé depuis la proposition (joueur déjà parti,
          // acheteur ruiné) : on le dit, on n'invente pas une vente.
          return `La vente de ${decision.joueurNom} n'a pas pu se faire entre-temps. `
            + `Le conseil reviendra sur le sujet.`;
        }
        return `${decision.joueurNom} part à ${decision.acheteurNom} pour ${decision.montant} k€. `
          + `Les comptes respirent, l'effectif est plus court.`;
      }
      c.confiancePresident = Math.max(0, Math.min(100, confiance - COUT_REFUS_ECONOMIES));
      return `Tu as refusé de vendre ${decision.joueurNom}. Le conseil prend acte, `
        + `mais la confiance en prend un coup (${c.confiancePresident} %).`;
    }
    return '';
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    ultimatumEnCours, poserUltimatum, avancerUltimatum, avancerUltimatumApresMatch,
    moralVestiaire, pointEtapeAFaire, resoudrePointEtape, reunionVestiaireAFaire,
    declencherReunionVestiaire, appliquerDecisionVestiaire,
    propositionConseilDuJour, appliquerDecisionConseil, situationConseil,
  });
})(window);
