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

  // Niveau PROPRE d'une académie, celui qui sert à la résolution ABSTRAITE
  // des rencontres académie-contre-académie (cf. simulerResultatAbstrait, où
  // le niveau entre dans un barème absolu : un niveau négatif y produirait
  // des scores nuls). Ce n'est PAS le niveau à donner au générateur pour
  // composer un XV d'académie — c'est le rôle de niveauXVAcademieDe.
  function niveauAdversaireEspoirs(niveauClubAdverse) {
    return Math.max(0.05, (niveauClubAdverse != null ? niveauClubAdverse : 0.5) * 0.35);
  }

  // Conséquences réelles pour les espoirs alignés (même principe qu'Équipe
  // B, cf. appliquerEffetsMatchEquipeB) : du temps de jeu → fatigue, un
  // léger regain de moral — jamais un effet décoratif.
  // Un match espoirs use et blesse comme les autres (TODO_AUDIT.md P1-40).
  // Avant, il ajoutait +15 de fatigue FORFAITAIRES — sans tenir compte de
  // l'endurance de chacun — et ne pouvait blesser PERSONNE. Les jeunes
  // passent désormais par le même point d'entrée que les deux autres
  // équipes ; seul le moral reste propre à ce niveau (jouer avec l'académie
  // fait plaisir, même en perdant).
  function appliquerEffetsMatchEspoirs(saison, composition, rng) {
    const RMClub = global.RMClub;
    const jeunes = saison.clubJoueur.jeunes || [];
    RMClub.appliquerEffetsMatch(saison, jeunes, composition,
      rng || (global.Math && (() => 0.5)), { equipe: 'jeunes' });
    const parId = {};
    for (const j of jeunes) parId[j.id] = j;
    for (const id of Object.values(composition)) {
      const j = parId[id];
      if (!j) continue;
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

  // Quels clubs de la division ont une académie dans ce championnat ?
  //
  // Le championnat espoirs ne peut accueillir que `taille` clubs alors que la
  // division en compte bien plus : il en retient donc une PARTIE. Cette
  // sélection se faisait par `adversaires.slice(0, n)` — or cette liste est
  // ordonnée par niveau CROISSANT. Mesuré sur quatre carrières, division de
  // 13 rivaux de 0,15 à 0,45, mon club à 0,30 : les académies retenues
  // étaient à chaque fois celles des trois clubs les plus FAIBLES (0,15,
  // 0,175, 0,20). Le championnat ne représentait jamais la division, et mon
  // club en était structurellement le plus fort.
  //
  // On prend donc un échantillon ÉTALÉ sur toute la division — le plus
  // faible, le plus fort, et des paliers réguliers entre les deux. Le club du
  // joueur y trouve des adversaires au-dessus comme en dessous de lui, selon
  // son niveau réel.
  function echantillonnerDivision(clubs, combien) {
    const tries = clubs.slice().sort((a, b) => (a.niveauClub || 0) - (b.niveauClub || 0));
    if (combien >= tries.length) return tries;
    if (combien <= 0) return [];
    if (combien === 1) return [tries[Math.floor(tries.length / 2)]];
    const pris = [];
    const dejaPris = new Set();
    for (let i = 0; i < combien; i++) {
      let idx = Math.round((i * (tries.length - 1)) / (combien - 1));
      // Deux paliers peuvent retomber sur le même club quand l'échantillon est
      // presque aussi grand que la division : on décale plutôt que de rendre
      // une liste plus courte que demandée.
      while (dejaPris.has(idx) && idx < tries.length - 1) idx++;
      while (dejaPris.has(idx) && idx > 0) idx--;
      if (dejaPris.has(idx)) continue;
      dejaPris.add(idx);
      pris.push(tries[idx]);
    }
    return pris;
  }

  function genererCompetitionEspoirs(saison) {
    const RMClub = global.RMClub;
    const dates = journeesEspoirsDisponibles(saison);
    const taille = tailleCompetitionEspoirs(dates.length);
    // Les académies sont adossées aux clubs adverses RÉELS de la division :
    // « Académie <club> », de niveau dérivé du sien (cf.
    // niveauAdversaireEspoirs) — des adversaires qu'on retrouve d'une
    // journée à l'autre, et dont le nom reste reconnaissable.
    const sources = echantillonnerDivision(saison.adversaires || [], taille - 1);
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

  // Niveau à demander au générateur pour le XV d'une ACADÉMIE, à partir du
  // niveau du XV premier de son club parent — exactement la même forme que
  // RMClub.niveauReserveDe pour l'Équipe B.
  //
  // À ne pas confondre avec `niveauClub` de l'académie (ci-dessus), qui sert
  // à la résolution ABSTRAITE des rencontres académie-contre-académie : ce
  // barème-là est absolu, un niveau négatif y produirait des scores nuls.
  // Deux usages différents, deux valeurs.
  //
  // Même défaut que pour l'Équipe B : `genererJoueur` décale les notes de
  // `(niveauClub - 0,5) * 20`, donc MULTIPLIER un niveau de division ne
  // retire presque rien. Mesuré : six rencontres espoirs perdues 5-33, 0-30,
  // 9-37, 0-38, 15-39, 7-49 pendant que les académies entre elles restaient
  // à 11-9, 11-11, 17-26, 17-20, 23-21, 19-21 — mes espoirs valaient 45,7,
  // l'académie adverse 55.
  //
  // L'écart RÉEL entre le XV premier d'un club et ses espoirs, mesuré sur 12
  // carrières, est de 13,8 points de note — soit 0,69 de niveau, en
  // SOUSTRACTION.
  const ECART_NIVEAU_ACADEMIE = 0.69;
  function niveauXVAcademie(niveauPremiere) {
    return (niveauPremiere != null ? niveauPremiere : 0.5) - ECART_NIVEAU_ACADEMIE;
  }

  // Le club RÉEL dont une académie est l'équipe de jeunes. C'est son niveau
  // qui sert de référence : une académie n'a pas d'entraîneur enregistré, mais
  // son club parent en a un, et l'effet de cet entraîneur doit compter comme
  // partout ailleurs (cf. niveauAvecEntraineur). Renvoie null pour l'académie
  // du club du joueur et pour une sauvegarde antérieure à `clubParentId`.
  function clubParentAcademie(saison, academie) {
    const RMClub = global.RMClub;
    if (!academie || !academie.clubParentId || !RMClub.clubPartout) return null;
    return RMClub.clubPartout(saison, academie.clubParentId) || null;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    ECART_NIVEAU_ACADEMIE, niveauXVAcademie, clubParentAcademie,
    echantillonnerDivision,
    PERIODE_JOURNEES_ESPOIRS, journeeDeMatchEspoirs, eligiblePourMatchEspoirs,
    niveauAdversaireEspoirs, appliquerEffetsMatchEspoirs, assurerCompetitionEspoirs,
    enregistrerResultatEspoirs, prochaineRondeEspoirs,
  });
})(window);
