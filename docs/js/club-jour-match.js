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

  // Prochaine rencontre du premier XV, avec sa date et le nombre de jours
  // qui nous en séparent — la base de toute la préparation.
  function prochaineRencontre(saison) {
    const RMClub = global.RMClub;
    RMClub.daterCalendrier(saison);
    const c = saison.clubJoueur;
    const aujourdhui = RMClub.dateCourante(saison);
    const fixtures = (saison.calendrier || [])
      .filter((f) => !f.joue && (f.domicileId === c.id || f.exterieurId === c.id) && f.date)
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

  function etatPreparationMatch(saison) {
    const RMClub = global.RMClub;
    const rencontre = prochaineRencontre(saison);
    if (!rencontre) return { rencontre: null, points: [], pretPct: 100 };

    const c = saison.clubJoueur;
    const slot = RMClub.assurerCompositionPourEquipe(saison, 'pro');
    const parId = {};
    for (const j of c.effectif) parId[j.id] = j;
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

  global.RMClub = Object.assign(global.RMClub || {}, {
    JOURS_ANALYSE_ADVERSAIRE, NATURES_PREPARATION, joursAvantAnalyse, prochaineRencontre,
    analyseDisponible, etatPreparationMatch,
  });
})(window);
