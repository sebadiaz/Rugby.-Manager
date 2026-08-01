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
    return {
      position, total, delta,
      confiance: c.confiancePresident,
      reussi: evaluation.reussi,
    };
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
    FRACTIONS_POINT_ETAPE, SEUIL_MORAL_VESTIAIRE, DELAI_ENTRE_REUNIONS_JOURS,
    assurerJournalDirection, moralVestiaire, positionActuelle,
    pointEtapeAFaire, resoudrePointEtape,
    reunionVestiaireAFaire, declencherReunionVestiaire, appliquerDecisionVestiaire,
  });
})(window);
