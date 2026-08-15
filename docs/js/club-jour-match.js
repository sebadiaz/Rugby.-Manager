// Préparation de match progressive (Mode Club) — de l'annonce de la
// rencontre au coup d'envoi.
//
// Avant, tout arrivait d'un coup au moment de cliquer « jouer » : l'analyse
// de l'adversaire, la composition, la tactique, les rôles. Depuis la
// carrière calendaire, un match a une DATE : sa préparation peut donc
// s'étaler sur les jours qui la précèdent, comme dans un vrai club.
//
// Deux principes, directement issus de la demande :
//
// 1. L'ANALYSE DEMANDE DU TEMPS. Le rapport de l'analyste n'est pas
//    disponible dès que la rencontre apparaît au calendrier : il faut
//    quelques jours pour observer l'adversaire — moins si le club a un bon
//    analyste vidéo. Ce n'est pas une contrainte artificielle, c'est la
//    même logique que les rapports de scouting différés (tranche 3).
//
// 2. AUCUN BLOCAGE ARTIFICIEL. Un élément non préparé est SIGNALÉ, jamais
//    empêchant : le manager reste libre de jouer un match sans avoir rien
//    réglé. La seule impossibilité qui existe déjà (composition incomplète,
//    aucun joueur disponible à un poste) est une vraie impasse de données,
//    pas une règle inventée pour forcer la main.
//
// Aucune dépendance au DOM : `etatPreparationMatch` renvoie une description
// que l'UI se contente d'afficher.
(function (global) {
  'use strict';

  // Nombre de jours avant la rencontre où le rapport d'analyse devient
  // disponible. Un analyste vidéo (cf. effetPersonnel) le rend disponible
  // plus tôt : il observe plus vite et plus loin.
  const JOURS_ANALYSE_ADVERSAIRE = 4;

  function joursAvantAnalyse(saison) {
    const facteur = global.RMClub.effetPersonnel(saison, 'analyste');
    return Math.round(JOURS_ANALYSE_ADVERSAIRE * facteur);
  }

  // Calendrier de l'équipe demandée. Chaque équipe a le sien, déjà daté par
  // le reste du jeu (TODO_AUDIT.md P1-39) — on ne recrée aucune source, on
  // lit celles qui existent : championnat pour le premier XV, `competitionB`
  // pour l'Équipe B, championnat espoirs pour les jeunes.
  function calendrierDeLEquipe(saison, equipe) {
    if (equipe === 'b') {
      const comp = saison.competitionB;
      return (comp && comp.calendrier) ? comp.calendrier : [];
    }
    if (equipe === 'jeunes') {
      const comp = global.RMClub.assurerCompetitionEspoirs(saison);
      return (comp && comp.calendrier) ? comp.calendrier : [];
    }
    return saison.calendrier || [];
  }

  // Prochaine rencontre de l'équipe demandée (le premier XV par défaut), avec
  // sa date et le nombre de jours qui nous en séparent — la base de toute la
  // préparation.
  function prochaineRencontre(saison, equipe) {
    const RMClub = global.RMClub;
    RMClub.daterCalendrier(saison);
    const c = saison.clubJoueur;
    const aujourdhui = RMClub.dateCourante(saison);
    // `!f.joue` ne suffit pas : une rencontre non jouée peut être DERRIÈRE
    // nous (journée sautée). La présenter comme « prochaine » affichait
    // « dans -1 jours » sur la carte. Une prochaine rencontre est, au plus
    // tôt, aujourd'hui.
    const isoAujourdhui = RMClub.dateISO(aujourdhui);
    const fixtures = calendrierDeLEquipe(saison, equipe || 'pro')
      .filter((f) => !f.joue && (f.domicileId === c.id || f.exterieurId === c.id) && f.date
        && f.date >= isoAujourdhui)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!fixtures.length) return null;
    const f = fixtures[0];
    const date = RMClub.dateDepuisISO(f.date);
    return {
      fixture: f,
      date,
      jours: RMClub.ecartJours(aujourdhui, date),
      domicile: f.domicileId === c.id,
      adversaireId: f.domicileId === c.id ? f.exterieurId : f.domicileId,
    };
  }

  // Le rapport de l'analyste est-il prêt ? Honnête dans les deux sens : on
  // dit quand il ne l'est pas ET dans combien de jours il le sera.
  function analyseDisponible(saison, rencontre) {
    if (!rencontre) return { disponible: false, joursRestants: null };
    const seuil = joursAvantAnalyse(saison);
    return {
      disponible: rencontre.jours <= seuil,
      joursRestants: Math.max(0, rencontre.jours - seuil),
      seuil,
    };
  }

  // --- État de préparation ------------------------------------------------
  // Chaque point est dérivé de l'état RÉEL de la saison, jamais d'une case à
  // cocher décorative : la composition est-elle complète et disponible ? la
  // tactique a-t-elle été touchée ou reste-t-elle au réglage par défaut ?
  // les rôles (capitaine, buteur, lanceur en touche) sont-ils tenus par des
  // titulaires ? le banc est-il rempli ?
  //
  // `statut` vaut 'ok', 'attention' (préparable, mais discutable) ou
  // 'nonPrepare' (rien n'a été fait). Aucun ne bloque le coup d'envoi.
  //
  // Chaque point porte AUSSI une `nature` (TODO_AUDIT.md P1-38), qui répond
  // à la seule question que se pose le manager devant la liste : « est-ce
  // que j'ai quelque chose à faire, là, maintenant ? »
  //
  //   'termine'    — c'est réglé, plus rien à faire ;
  //   'urgent'     — ça compromet vraiment la rencontre ;
  //   'recommande' — à traiter avant le coup d'envoi, sans gravité ;
  //   'facultatif' — un choix possible, pas un manque ;
  //   'enAttente'  — HORS de portée du manager aujourd'hui (le rapport de
  //                  l'analyste n'est pas prêt) : lui présenter ça comme
  //                  « non préparé » lui reproche l'impossible.
  //
  // `statut` est conservé tel quel : les consommateurs existants continuent
  // de fonctionner sans modification.
  const NATURES_PREPARATION = ['termine', 'urgent', 'recommande', 'facultatif', 'enAttente'];

  // Quelle équipe joue l'échéance annoncée (TODO_AUDIT.md P1-39) ? La carte
  // de préparation doit préparer LA rencontre que le tableau de bord annonce,
  // pas systématiquement celle du premier XV — mesuré : le jour d'un match
  // d'Équipe B, l'échéance annonçait « Match de l'Équipe B, aujourd'hui »
  // pendant que la préparation décrivait le match de championnat.
  // Coupes et amicaux se jouent avec le premier XV.
  const EQUIPE_POUR_ARRET = { pro: 'pro', coupe: 'pro', amical: 'pro', b: 'b', jeunes: 'jeunes' };
  function equipePourArret(type) {
    return EQUIPE_POUR_ARRET[type] || 'pro';
  }

  function etatPreparationMatch(saison, equipe) {
    const RMClub = global.RMClub;
    // Le premier XV par défaut : tous les appelants historiques continuent de
    // fonctionner sans être modifiés.
    const eq = equipe || 'pro';
    const rencontre = prochaineRencontre(saison, eq);
    if (!rencontre) return { rencontre: null, equipe: eq, points: [], pretPct: 100 };

    // Chaque équipe est jugée sur SON effectif et SA composition — sinon
    // l'Équipe B se croirait préparée parce que le premier XV l'est.
    const slot = RMClub.assurerCompositionPourEquipe(saison, eq);
    const parId = {};
    for (const j of RMClub.effectifPourEquipe(saison, eq)) parId[j.id] = j;
    const titulaires = Object.values(slot.compositionTitulaires || {}).map((id) => parId[id]).filter(Boolean);
    const points = [];

    // 1. Analyse de l'adversaire — disponible seulement à quelques jours.
    const analyse = analyseDisponible(saison, rencontre);
    points.push({
      cle: 'analyse',
      libelle: 'Analyse de l\'adversaire',
      statut: analyse.disponible ? 'ok' : 'nonPrepare',
      // Rien à faire tant que l'analyste observe : c'est une attente, pas un
      // oubli. C'est le seul point de la liste que le manager ne contrôle pas.
      nature: analyse.disponible ? 'termine' : 'enAttente',
      detail: analyse.disponible
        ? 'Rapport de ton analyste disponible.'
        : `Ton analyste a besoin d'encore ${analyse.joursRestants} jour(s) d'observation.`,
    });

    // 2. Composition — complète ? des titulaires diminués ?
    const manquants = RMClub.validerComposition(slot.compositionTitulaires);
    const blesses = titulaires.filter((j) => j.blessureJournees > 0);
    const fatigues = titulaires.filter((j) => !(j.blessureJournees > 0) && (j.fatigue || 0) >= 65);
    let statutCompo = 'ok';
    let natureCompo = 'termine';
    let detailCompo = 'Quinze titulaires disponibles et en état.';
    if (manquants.length) {
      statutCompo = 'nonPrepare';
      // Un poste non pourvu, c'est un XV qu'on ne peut pas aligner tel quel :
      // le seul point de la liste qui compromet réellement la rencontre.
      natureCompo = 'urgent';
      detailCompo = `Poste(s) non pourvu(s) : ${manquants.map((m) => 'n°' + m.numero).join(', ')}.`;
    } else if (blesses.length || fatigues.length) {
      statutCompo = 'attention';
      natureCompo = 'recommande';
      detailCompo = [
        blesses.length ? `${blesses.length} titulaire(s) blessé(s)` : null,
        fatigues.length ? `${fatigues.length} titulaire(s) très fatigué(s)` : null,
      ].filter(Boolean).join(', ') + '.';
    }
    points.push({ cle: 'composition', libelle: 'Composition', statut: statutCompo, nature: natureCompo, detail: detailCompo });

    // 3. Tactique — le réglage par défaut est signalé comme non préparé :
    // ce n'est pas un mauvais choix, c'est simplement un choix pas encore
    // fait. Le manager reste libre de le laisser tel quel.
    const tactique = (slot.tactique && typeof slot.tactique === 'object') ? slot.tactique : {};
    const axesRegles = Object.keys(RMClub.AXES_TACTIQUE)
      .filter((axe) => tactique[axe] && tactique[axe] !== RMClub.AXES_TACTIQUE[axe].defaut);
    points.push({
      cle: 'tactique',
      libelle: 'Tactique',
      statut: axesRegles.length ? 'ok' : 'nonPrepare',
      // Le commentaire ci-dessus le dit déjà : le réglage neutre n'est pas un
      // mauvais choix. L'affichage doit le dire aussi, au lieu de laisser
      // croire à un oubli.
      nature: axesRegles.length ? 'termine' : 'facultatif',
      detail: axesRegles.length
        ? `${axesRegles.length} axe(s) réglé(s) spécifiquement pour ce match.`
        : 'Tous les axes sont au réglage neutre par défaut.',
    });

    // 4. Coups de pied arrêtés et rôles — buteur, lanceur en touche,
    // capitaine, réellement titulaires et disponibles.
    const titulaireIds = new Set(Object.values(slot.compositionTitulaires || {}));
    const roles = [
      ['buteurId', 'buteur'],
      ['lanceurToucheId', 'lanceur en touche'],
      ['capitaineId', 'capitaine'],
    ];
    const rolesManquants = roles.filter(([champ]) => !slot[champ] || !titulaireIds.has(slot[champ])).map(([, nom]) => nom);
    const rolesDiminues = roles
      .filter(([champ]) => slot[champ] && parId[slot[champ]] && parId[slot[champ]].blessureJournees > 0)
      .map(([, nom]) => nom);
    points.push({
      cle: 'roles',
      libelle: 'Coups de pied arrêtés et rôles',
      statut: rolesManquants.length ? 'nonPrepare' : (rolesDiminues.length ? 'attention' : 'ok'),
      // Sans buteur désigné, les points au pied ne sont plus tentés par le
      // bon joueur : la conséquence est immédiate et se paie au score.
      nature: rolesManquants.length ? 'urgent' : (rolesDiminues.length ? 'recommande' : 'termine'),
      detail: rolesManquants.length
        ? `Rôle(s) sans titulaire désigné : ${rolesManquants.join(', ')}.`
        : rolesDiminues.length
          ? `Rôle(s) tenu(s) par un joueur blessé : ${rolesDiminues.join(', ')}.`
          : 'Buteur, lanceur en touche et capitaine désignés parmi les titulaires.',
    });

    // 5. Banc et remplacements prévus — le banc de 8 pilote de vrais
    // remplacements en match (cf. remplacementsVersConfig).
    const banc = Object.values(slot.compositionBanc || {}).filter(Boolean);
    points.push({
      cle: 'banc',
      libelle: 'Banc et remplacements',
      statut: banc.length >= 8 ? 'ok' : (banc.length ? 'attention' : 'nonPrepare'),
      // Un banc incomplet n'empêche pas de jouer : il prive de remplacements.
      nature: banc.length >= 8 ? 'termine' : 'recommande',
      detail: banc.length >= 8
        ? 'Banc de 8 complet : les remplacements sont planifiés.'
        : `${banc.length} remplaçant(s) sur 8 — les places vides ne produiront aucun remplacement.`,
    });

    // Le pourcentage ne porte QUE sur ce que le manager peut régler
    // aujourd'hui : compter l'attente de l'analyste dans le dénominateur
    // affichait 60 % à un club dont tout le réglable était fait.
    const actionnables = points.filter((p) => p.nature !== 'enAttente');
    const faits = actionnables.filter((p) => p.nature === 'termine').length;
    return {
      rencontre,
      equipe: eq,
      analyse,
      points,
      // Compteurs dérivés de la MÊME liste, pour que l'entête de la carte ne
      // recalcule jamais l'urgence de son côté.
      resume: {
        actionnables: actionnables.length,
        faits,
        urgents: points.filter((p) => p.nature === 'urgent').length,
        recommandes: points.filter((p) => p.nature === 'recommande').length,
        enAttente: points.filter((p) => p.nature === 'enAttente').length,
      },
      pretPct: actionnables.length ? Math.round((faits / actionnables.length) * 100) : 100,
    };
  }

  // --- Dossier de préparation : UNE vue, UNE source (TODO_AUDIT.md P1-41) --
  //
  // Mesuré sur une carrière neuve : le même adversaire, le même lieu et la
  // MÊME date apparaissaient dans trois cartes du tableau de bord
  // (« Prochaine échéance » 305 px, « Préparation » 353 px, « Prochain
  // adversaire » 343 px — 1001 px au total) ET dans l'aperçu d'avant-match.
  // Pire, la carte adversaire résolvait la rencontre par `prochainesFixtures`
  // et non par `prochainArret` : elle pouvait décrire un AUTRE match que les
  // deux autres cartes (même classe de défaut qu'en P1-35 et P1-39).
  //
  // Cette fonction ASSEMBLE, elle ne décide de rien et ne STOCKE rien : la
  // rencontre vient de `prochainArret`, l'état de `etatPreparationMatch`,
  // l'analyse de `analyserAdversaire`, la recommandation de
  // `recommanderTactique`. Aucun second état de préparation n'est créé.
  function dossierPreparation(saison) {
    const RMClub = global.RMClub;
    const arret = RMClub.prochainArret(saison);
    if (!arret) return null;
    const equipe = equipePourArret(arret.type);
    const etat = etatPreparationMatch(saison, equipe);

    // Analyse de l'adversaire : la MÊME que celle du tableau de bord, mais
    // portant explicitement sur l'adversaire de CETTE rencontre. Elle n'a de
    // sens que pour un club du championnat (un adversaire d'académie espoirs
    // n'a pas d'effectif comparable) — sinon on le dit, on n'invente pas.
    const facteurAnalyste = RMClub.effetPersonnel(saison, 'analyste');
    const seuilAnalyste = Math.max(2, Math.round(6 - (facteurAnalyste - 1) * 8));
    const brute = arret.adversaireId && RMClub.analyserAdversaire
      ? RMClub.analyserAdversaire(saison, arret.adversaireId, seuilAnalyste) : null;
    const analyse = brute ? Object.assign({ clubId: arret.adversaireId }, brute) : null;
    // Le rapport de l'analyste demande du temps (cf. analyseDisponible) : on
    // distingue « pas encore prêt » de « pas d'analyse possible ».
    const dispo = analyseDisponible(saison, { jours: arret.joursRestants });
    const recommandations = (analyse && dispo.disponible && RMClub.recommanderTactique)
      ? RMClub.recommanderTactique(analyse) : null;

    return {
      // 1. La rencontre exacte.
      rencontre: { date: arret.date, iso: arret.iso },
      type: arret.type,
      libelle: arret.libelle,
      equipe,
      libelleEquipe: arret.equipe || 'Équipe première',
      competition: arret.competition || arret.libelle,
      tour: arret.tour || null,
      adversaireNom: arret.adversaireNom,
      adversaireId: arret.adversaireId,
      domicile: arret.domicile,
      joursRestants: Math.max(0, arret.joursRestants),
      // 8. On ne lance un match qu'à sa date.
      jouable: arret.joursRestants <= 0,
      // 2, 3, 4 — points de préparation, composition et effectif diminué.
      etat,
      // 5, 6 — analyse réelle et recommandation.
      analyse,
      analyseDisponible: !!(analyse && dispo.disponible),
      joursAvantAnalyse: dispo.joursRestants,
      recommandations,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    joursAvantAnalyse, prochaineRencontre, analyseDisponible, etatPreparationMatch,
    equipePourArret, dossierPreparation,
  });
})(window);
