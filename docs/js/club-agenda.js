// Agenda quotidien (Mode Club) — quelles rencontres tombent quel jour, et
// jusqu'où le bouton « Continuer » doit avancer.
//
// Ce module ne simule rien et ne touche pas au DOM : il répond uniquement à
// « que se passe-t-il à cette date ? » et « quelle est la prochaine échéance
// qui demande l'attention du manager ? ». La résolution effective (moteur de
// match, finances, fatigue…) reste côté clubUI.js, exactement comme avant.
//
// Les rencontres du club du joueur sont réparties sur trois jours distincts
// de la même semaine (cf. club-temps.js, DECALAGE_JOUR_MATCH) :
//   mercredi — espoirs (une semaine sur PERIODE_JOURNEES_ESPOIRS)
//   samedi   — équipe première (championnat)
//   dimanche — Équipe B
// Un clic sur « Continuer » avance donc jusqu'au prochain de ces jours, et
// jamais au-delà : aucun match ne peut être joué avant sa date.
(function (global) {
  'use strict';

  // Estampille chaque rencontre d'une VRAIE date, dérivée de sa journée.
  // Idempotent : rejouable à volonté (création d'une saison, migration d'une
  // ancienne sauvegarde, chargement) sans jamais décaler un calendrier déjà
  // daté ni écraser une progression.
  function daterCalendrier(saison) {
    const RMClub = global.RMClub;
    const numero = saison.numero || 1;
    for (const f of saison.calendrier || []) {
      if (!f.date) f.date = RMClub.dateISO(RMClub.dateDeJournee(numero, f.journee, 'pro'));
    }
    const compB = saison.competitionB;
    if (compB && Array.isArray(compB.calendrier)) {
      for (const f of compB.calendrier) {
        if (!f.date) f.date = RMClub.dateISO(RMClub.dateDeJournee(numero, f.journee, 'b'));
      }
    }
    return saison;
  }

  function concerne(fixture, clubId) {
    return fixture.domicileId === clubId || fixture.exterieurId === clubId;
  }

  // Rencontres d'espoirs : elles n'ont pas de calendrier stocké (ce sont des
  // rencontres amicales contre une académie, cf. club-espoirs.js). On les
  // dérive des journées de championnat, comme le fait déjà l'écran
  // Calendrier — jamais une liste parallèle qui pourrait diverger.
  function journeesEspoirsDuClub(saison) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const dejaJouees = new Set((c.matchsEspoirs || []).map((m) => m.journee));
    const journees = [];
    for (const f of saison.calendrier || []) {
      if (!concerne(f, c.id)) continue;
      if (!RMClub.journeeDeMatchEspoirs(f.journee)) continue;
      if (dejaJouees.has(f.journee)) continue;
      journees.push(f.journee);
    }
    return journees;
  }

  // Tout ce qui est programmé à une date donnée, pour le club du joueur.
  // `autresPro` porte les rencontres du championnat qui ne le concernent pas
  // (résolues en arrière-plan le même jour, comme aujourd'hui).
  function evenementsDuJour(saison, date) {
    const RMClub = global.RMClub;
    daterCalendrier(saison);
    const iso = RMClub.dateISO(date);
    const c = saison.clubJoueur;
    const pro = (saison.calendrier || []).filter((f) => f.date === iso && !f.joue);
    const compB = saison.competitionB;
    const b = (compB && compB.calendrier ? compB.calendrier : []).filter((f) => f.date === iso && !f.joue);
    const journeesEspoirs = journeesEspoirsDuClub(saison).filter(
      (j) => RMClub.dateISO(RMClub.dateDeJournee(saison.numero || 1, j, 'jeunes')) === iso);
    return {
      date: iso,
      matchPro: pro.find((f) => concerne(f, c.id)) || null,
      autresPro: pro.filter((f) => !concerne(f, c.id)),
      rondeB: b,
      matchBJoueur: b.find((f) => concerne(f, c.id)) || null,
      journeeEspoirs: journeesEspoirs.length ? journeesEspoirs[0] : null,
    };
  }

  // Une date « demande l'attention du manager » si le club du joueur y joue —
  // avec l'une quelconque de ses trois équipes.
  function estJourDArret(saison, date) {
    const e = evenementsDuJour(saison, date);
    // Le match espoirs n'a lieu que si un XV complet peut être aligné : sans
    // ça, rien ne se produirait ce jour-là et s'y arrêter n'aurait aucun sens.
    const espoirsJouable = e.journeeEspoirs != null && global.RMClub.eligiblePourMatchEspoirs(saison);
    return !!(e.matchPro || e.matchBJoueur || espoirsJouable);
  }

  const LIBELLE_ARRET = { pro: 'Match de championnat', b: 'Match de l\'Équipe B', jeunes: 'Match des espoirs' };

  function typeDArret(saison, date) {
    const e = evenementsDuJour(saison, date);
    if (e.matchPro) return 'pro';
    if (e.matchBJoueur) return 'b';
    if (e.journeeEspoirs != null && global.RMClub.eligiblePourMatchEspoirs(saison)) return 'jeunes';
    return null;
  }

  // Prochaine échéance : la PLUS PROCHE date, à partir d'aujourd'hui inclus,
  // où le club du joueur joue. « Aujourd'hui inclus » est essentiel — c'est
  // ce qui rend « Continuer » idempotent : arriver un jour de match puis
  // recliquer ne saute jamais ce match, il rouvre simplement sa préparation.
  //
  // La recherche est bornée par la dernière rencontre datée de la saison :
  // aucune boucle infinie possible même si le calendrier est incohérent.
  function prochainArret(saison) {
    const RMClub = global.RMClub;
    daterCalendrier(saison);
    const depart = RMClub.dateCourante(saison);
    const toutesDates = []
      .concat((saison.calendrier || []).map((f) => f.date))
      .concat(saison.competitionB && saison.competitionB.calendrier ? saison.competitionB.calendrier.map((f) => f.date) : [])
      .filter(Boolean);
    if (!toutesDates.length) return null;
    const derniere = RMClub.dateDepuisISO(toutesDates.slice().sort()[toutesDates.length - 1]);
    // +7 : la dernière journée d'Équipe B tombe le lendemain de la dernière
    // journée de championnat, et un match espoirs peut précéder de 3 jours.
    const limite = RMClub.jourAbsolu(derniere) + 7;
    for (let n = RMClub.jourAbsolu(depart); n <= limite; n++) {
      const date = RMClub.dateDepuisJourAbsolu(n);
      const type = typeDArret(saison, date);
      if (type) {
        return {
          date, iso: RMClub.dateISO(date), type,
          libelle: LIBELLE_ARRET[type],
          joursRestants: n - RMClub.jourAbsolu(depart),
        };
      }
    }
    return null; // saison terminée : plus aucune rencontre à jouer
  }

  // Agenda des prochains jours (utilisé par le libellé du bouton et, dès la
  // tranche suivante, par la carte « 7 prochains jours » du tableau de bord).
  function agenda(saison, nbJours) {
    const RMClub = global.RMClub;
    daterCalendrier(saison);
    const depart = RMClub.dateCourante(saison);
    const jours = [];
    for (let i = 0; i < (nbJours || 7); i++) {
      const date = RMClub.ajouterJours(depart, i);
      const type = typeDArret(saison, date);
      const e = evenementsDuJour(saison, date);
      jours.push({
        date, iso: RMClub.dateISO(date), type,
        libelle: type ? LIBELLE_ARRET[type] : null,
        matchPro: e.matchPro, matchBJoueur: e.matchBJoueur, journeeEspoirs: e.journeeEspoirs,
      });
    }
    return jours;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    daterCalendrier, evenementsDuJour, estJourDArret, typeDArret, prochainArret, agenda,
    LIBELLE_ARRET,
  });
})(window);
