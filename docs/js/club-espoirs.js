// Match espoirs (Mode Club) — domaine dédié au centre de formation (cf.
// club-centre-formation.js). Audit ("pas de tournois junior") : le centre de
// formation jouait déjà des minutes via l'Équipe B (mélangé aux réservistes
// pro, cf. club-equipe-b.js), mais n'avait jamais de match RÉSERVÉ à lui
// seul. Ajoute un match occasionnel (une journée sur PERIODE_JOURNEES_ESPOIRS),
// réellement simulé par le moteur complet, contre un adversaire synthétique
// (académie rivale, même principe que le "B synthétique" de l'Équipe B,
// cf. clubUI.js) — PAS une compétition à classement multi-clubs, qui
// exigerait de donner un centre de formation à CHAQUE club IA (hors
// périmètre de cette première tranche, cf. TODO_AUDIT.md).
(function (global) {
  'use strict';

  // Une journée sur 4 (pas chaque journée, comme Équipe B, pour ne pas
  // noyer le signal) — ~6-7 matchs espoirs sur une saison de 26 journées.
  const PERIODE_JOURNEES_ESPOIRS = 4;

  function journeeDeMatchEspoirs(journee) {
    return journee % PERIODE_JOURNEES_ESPOIRS === 0;
  }

  // Un XV complet peut-il être aligné avec les espoirs DU JOUR ? Certains
  // ont pu être promus en pro entre-temps (cf. promouvoirJeune) : jamais
  // supposé, toujours vérifié comme pour n'importe quelle composition.
  function eligiblePourMatchEspoirs(saison) {
    const jeunes = saison.clubJoueur.jeunes || [];
    const composition = global.RMClub.meilleureComposition(jeunes);
    return global.RMClub.validerComposition(composition).length === 0;
  }

  // Adversaire synthétique nettement plus modeste que le "B" d'Équipe B
  // (facteur 0,65 côté pro) : des espoirs 16-18 ans n'ont pas le niveau
  // d'une réserve professionnelle.
  function niveauAdversaireEspoirs(niveauClubAdverse) {
    return Math.max(0.05, (niveauClubAdverse != null ? niveauClubAdverse : 0.5) * 0.35);
  }

  // Conséquences réelles pour les espoirs alignés (même principe qu'Équipe
  // B, cf. appliquerEffetsMatchEquipeB) : du temps de jeu → fatigue, un
  // léger regain de moral — jamais un effet décoratif.
  function appliquerEffetsMatchEspoirs(saison, composition) {
    const parId = {};
    for (const j of (saison.clubJoueur.jeunes || [])) parId[j.id] = j;
    for (const id of Object.values(composition)) {
      const j = parId[id];
      if (!j) continue;
      j.matchsJoues = (j.matchsJoues || 0) + 1;
      j.fatigue = Math.min(100, (j.fatigue || 0) + 15);
      j.moral = Math.min(100, (j.moral != null ? j.moral : 65) + 2);
    }
  }

  // --- Vrai championnat espoirs (TODO_AUDIT.md P1-31) ---------------------
  // Avant : un match occasionnel contre une académie SYNTHÉTIQUE régénérée à
  // chaque fois puis jetée — aucun adversaire ne revenait, aucun classement
  // n'existait, et le seul « classement » affiché était le bilan du club du
  // joueur tout seul. Maintenant : des académies PERSISTANTES, un vrai
  // calendrier aller-retour daté, un vrai classement.
  //
  // Même mécanique que le championnat d'Équipe B (cf. club-equipe-b.js) :
  // genererCalendrier + classementInitial, jamais un moteur parallèle.

  // Les dates d'espoirs RÉELLEMENT disponibles dans la saison (une journée
  // de championnat sur PERIODE_JOURNEES_ESPOIRS, cf. journeeDeMatchEspoirs).
  function journeesEspoirsDisponibles(saison) {
    const journees = [];
    const vues = new Set();
    for (const f of (saison.calendrier || [])) {
      if (vues.has(f.journee)) continue;
      vues.add(f.journee);
      if (journeeDeMatchEspoirs(f.journee)) journees.push(f.journee);
    }
    return journees.sort((a, b) => a - b);
  }

  // Nombre d'académies compatible avec le nombre de dates disponibles : un
  // aller-retour à n clubs occupe 2(n-1) journées. On prend le plus grand n
  // PAIR qui tient dans le calendrier — mieux vaut une compétition COMPLÈTE
  // (tout le monde rencontre tout le monde, aller et retour) qu'une grande
  // ligue tronquée dont le classement ne voudrait rien dire.
  function tailleCompetitionEspoirs(nbDates) {
    let n = 4;
    while (2 * ((n + 2) - 1) <= nbDates) n += 2;
    return n;
  }

  function genererCompetitionEspoirs(saison) {
    const RMClub = global.RMClub;
    const dates = journeesEspoirsDisponibles(saison);
    const taille = tailleCompetitionEspoirs(dates.length);
    // Les académies sont adossées aux clubs adverses RÉELS de la division :
    // « Académie <club> », de niveau dérivé du sien (cf.
    // niveauAdversaireEspoirs) — des adversaires qu'on retrouve d'une
    // journée à l'autre, et dont le nom reste reconnaissable.
    const sources = (saison.adversaires || []).slice(0, taille - 1);
    const clubs = [{ id: saison.clubJoueur.id, nom: saison.clubJoueur.nom, academie: true,
      niveauClub: niveauAdversaireEspoirs(saison.clubJoueur.niveauClub) }];
    for (const adv of sources) {
      clubs.push({
        id: 'esp-' + adv.id,
        nom: 'Académie ' + adv.nom,
        academie: true,
        clubParentId: adv.id,
        niveauClub: niveauAdversaireEspoirs(adv.niveauClub),
      });
    }
    if (clubs.length < 4 || clubs.length % 2 === 1) return { clubs: [], calendrier: [], classement: {} };
    const calendrier = RMClub.genererCalendrier(clubs);
    // Datation : la journée R de la compétition tombe à la R-ième date
    // d'espoirs de la saison (mercredi, cf. DECALAGE_JOUR_MATCH.jeunes).
    for (const f of calendrier) {
      const journeeChampionnat = dates[f.journee - 1];
      if (journeeChampionnat == null) continue;
      f.journeeChampionnat = journeeChampionnat;
      f.date = RMClub.dateISO(RMClub.dateDeJournee(saison.numero || 1, journeeChampionnat, 'jeunes'));
    }
    return { clubs, calendrier: calendrier.filter((f) => f.date), classement: RMClub.classementInitial(clubs) };
  }

  // Créée à la volée si absente (sauvegarde antérieure), sans jamais écraser
  // une compétition déjà en cours — même principe qu'assurerCompetitionB.
  function assurerCompetitionEspoirs(saison) {
    if (!saison.competitionEspoirs || !saison.competitionEspoirs.calendrier
      || !saison.competitionEspoirs.calendrier.length) {
      saison.competitionEspoirs = genererCompetitionEspoirs(saison);
    }
    return saison.competitionEspoirs;
  }

  function enregistrerResultatEspoirs(saison, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    const comp = saison.competitionEspoirs;
    if (!comp) return;
    global.RMClub.enregistrerResultatDans(comp.calendrier, comp.classement, fixtureId,
      scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur);
  }

  // Toutes les rencontres de la plus proche journée non jouée — même
  // principe que prochaineRondeEquipeB.
  function prochaineRondeEspoirs(saison) {
    const comp = assurerCompetitionEspoirs(saison);
    if (!comp.calendrier.length) return [];
    const prochaine = comp.calendrier.find((f) => !f.joue);
    if (!prochaine) return [];
    return comp.calendrier.filter((f) => f.journee === prochaine.journee);
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    PERIODE_JOURNEES_ESPOIRS, journeeDeMatchEspoirs,
    eligiblePourMatchEspoirs, niveauAdversaireEspoirs, appliquerEffetsMatchEspoirs,
    journeesEspoirsDisponibles, tailleCompetitionEspoirs, genererCompetitionEspoirs,
    assurerCompetitionEspoirs, enregistrerResultatEspoirs, prochaineRondeEspoirs,
  });
})(window);
