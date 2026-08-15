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
  // Rencontres du championnat ESPOIRS restant à jouer pour le club du joueur
  // (TODO_AUDIT.md P1-31) : elles viennent désormais du vrai calendrier de
  // cette compétition, plus d'une déduction faite depuis le calendrier pro.
  function fixturesEspoirsDuClub(saison) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const comp = RMClub.assurerCompetitionEspoirs(saison);
    return (comp.calendrier || []).filter((f) =>
      !f.joue && (f.domicileId === c.id || f.exterieurId === c.id));
  }

  function journeesEspoirsDuClub(saison) {
    return fixturesEspoirsDuClub(saison).map((f) => f.journeeChampionnat).filter((j) => j != null);
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
    // La rencontre espoirs du jour est celle DATÉE de ce jour dans le
    // calendrier du championnat espoirs (TODO_AUDIT.md P1-31).
    const fixturesEspoirs = fixturesEspoirsDuClub(saison).filter((f) => f.date === iso);
    const journeesEspoirs = fixturesEspoirs.map((f) => f.journeeChampionnat);
    return {
      date: iso,
      matchPro: pro.find((f) => concerne(f, c.id)) || null,
      autresPro: pro.filter((f) => !concerne(f, c.id)),
      rondeB: b,
      matchBJoueur: b.find((f) => concerne(f, c.id)) || null,
      journeeEspoirs: journeesEspoirs.length ? journeesEspoirs[0] : null,
      fixtureEspoirs: fixturesEspoirs.length ? fixturesEspoirs[0] : null,
      amical: RMClub.amicalDuJour ? RMClub.amicalDuJour(saison, date) : null,
      // Rencontre de coupe du club du joueur ce jour-là (TODO_AUDIT.md
      // P1-34) : c'est la DATE du tour qui décide, comme pour tout le reste.
      coupe: RMClub.rencontreCoupeDuJoueur ? RMClub.rencontreCoupeDuJoueur(saison, date) : null,
    };
  }


  const LIBELLE_ARRET = {
    pro: 'Match de championnat', b: 'Match de l\'Équipe B', jeunes: 'Match des espoirs',
    // Amical organisé par le manager (TODO_AUDIT.md P1-32) : une vraie
    // rencontre, à sa date, avec des conséquences réelles.
    amical: 'Match amical',
    coupe: 'Match de coupe',
  };

  function typeDArret(saison, date) {
    const e = evenementsDuJour(saison, date);
    if (e.matchPro) return 'pro';
    if (e.coupe) return 'coupe';
    if (e.matchBJoueur) return 'b';
    if (e.amical) return 'amical';
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
        // La carte « Prochaine échéance » et le bouton « Continuer » lisent
        // le MÊME objet (TODO_AUDIT.md P1-35). Avant, la carte affichait la
        // journée de CHAMPIONNAT pendant que le bouton visait la prochaine
        // échéance réelle (qui pouvait être l'Équipe B le lendemain) : deux
        // rencontres différentes annoncées dans la même carte. En décrivant
        // la rencontre ici, une seule fois, la divergence devient impossible.
        return Object.assign({
          date, iso: RMClub.dateISO(date), type,
          libelle: LIBELLE_ARRET[type],
          joursRestants: n - RMClub.jourAbsolu(depart),
        }, descriptionRencontre(saison, date, type));
      }
    }
    return null; // saison terminée : plus aucune rencontre à jouer
  }

  // Qui joue, contre qui, et où — pour l'échéance d'un jour donné. Tout vient
  // de la rencontre RÉELLEMENT programmée ce jour-là : rien n'est déduit du
  // numéro de journée ni supposé.
  function descriptionRencontre(saison, date, type) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const e = evenementsDuJour(saison, date);
    const LIBELLE_EQUIPE = { pro: 'Équipe première', b: 'Équipe B', jeunes: 'Espoirs', amical: 'Équipe première', coupe: 'Équipe première' };
    function depuisFixture(f, nomAdverse) {
      const domicile = f.domicileId === c.id;
      const adverseId = domicile ? f.exterieurId : f.domicileId;
      const adverse = nomAdverse || ((RMClub.clubPartout && RMClub.clubPartout(saison, adverseId)) || {}).nom || null;
      return { adversaireNom: adverse, adversaireId: adverseId, domicile, equipe: LIBELLE_EQUIPE[type] || null };
    }
    if (type === 'pro' && e.matchPro) return depuisFixture(e.matchPro);
    if (type === 'b' && e.matchBJoueur) return depuisFixture(e.matchBJoueur);
    if (type === 'jeunes' && e.fixtureEspoirs) {
      const comp = RMClub.assurerCompetitionEspoirs(saison);
      const f = e.fixtureEspoirs;
      const domicile = f.domicileId === c.id;
      const adverseId = domicile ? f.exterieurId : f.domicileId;
      const club = (comp.clubs || []).find((x) => x.id === adverseId);
      return { adversaireNom: club ? club.nom : null, adversaireId: adverseId, domicile, equipe: LIBELLE_EQUIPE.jeunes };
    }
    if (type === 'amical' && e.amical) {
      return { adversaireNom: e.amical.adversaireNom, adversaireId: e.amical.adversaireId,
        domicile: e.amical.domicile !== false, equipe: LIBELLE_EQUIPE.amical };
    }
    if (type === 'coupe' && e.coupe) {
      const r = e.coupe.rencontre;
      const domicile = r.domicileId === c.id;
      const adverseId = domicile ? r.exterieurId : r.domicileId;
      const club = (e.coupe.coupe.clubs || []).find((x) => x.id === adverseId)
        || (RMClub.clubPartout && RMClub.clubPartout(saison, adverseId));
      return { adversaireNom: club ? club.nom : null, adversaireId: adverseId, domicile,
        equipe: LIBELLE_EQUIPE.coupe, competition: e.coupe.coupe.nom,
        tour: (e.coupe.coupe.tours[r.tour] || {}).nom };
    }
    return { adversaireNom: null, adversaireId: null, domicile: true, equipe: LIBELLE_EQUIPE[type] || null };
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
    daterCalendrier, evenementsDuJour, typeDArret, prochainArret, agenda,
  });
})(window);
