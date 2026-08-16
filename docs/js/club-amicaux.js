// Matchs amicaux (Mode Club) — TODO_AUDIT.md P1-32.
//
// Le calendrier d'une carrière est daté depuis P1-21, mais il ne comportait
// que des rencontres IMPOSÉES : championnat, Équipe B, espoirs. Un manager
// n'avait aucun moyen d'occuper une date libre — ni pour préparer une reprise
// après l'intersaison, ni pour donner du temps de jeu à un joueur qui revient
// de blessure, ni simplement pour se tester face à un club d'un autre niveau.
//
// Un amical est une VRAIE rencontre : elle se joue à sa date, avec le moteur
// complet, et elle a des conséquences réelles (fatigue, blessures, temps de
// jeu, moral). Ce qu'elle ne fait JAMAIS : rapporter le moindre point au
// championnat.
//
// Navigation : on ne choisit pas un adversaire dans une liste (règle P1-20).
// On ouvre un club en cliquant son nom, et c'est depuis SA page qu'on lui
// propose une rencontre — l'action vit sur le club qu'on regarde.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Un club ne joue pas un amical la VEILLE d'un match officiel : il faut au
  // moins un jour de récupération entre les deux. On écarte donc les dates
  // dont le lendemain porte déjà une échéance.
  const JOURS_REPOS_APRES_AMICAL = 1;

  function amicaux(saison) {
    if (!Array.isArray(saison.amicaux)) saison.amicaux = [];
    return saison.amicaux;
  }

  // L'amical PROGRAMMÉ (pas encore joué) à une date donnée, s'il existe.
  function amicalDuJour(saison, date) {
    const iso = global.RMClub.dateISO(date);
    return amicaux(saison).find((a) => a.date === iso && !a.joue) || null;
  }

  // Une date est libre si aucune des trois équipes n'y joue, si aucun amical
  // n'y est déjà programmé, et si le lendemain est lui aussi dégagé.
  function dateEstLibre(saison, date) {
    const RMClub = global.RMClub;
    if (RMClub.typeDArret(saison, date)) return false;
    if (amicalDuJour(saison, date)) return false;
    for (let i = 1; i <= JOURS_REPOS_APRES_AMICAL; i++) {
      if (RMClub.typeDArret(saison, RMClub.ajouterJours(date, i))) return false;
    }
    return true;
  }

  // Les prochaines dates libres, à partir de DEMAIN (on ne programme pas une
  // rencontre le jour même : un club prévient son adversaire).
  function datesLibresPourAmical(saison, nbJours) {
    const RMClub = global.RMClub;
    const depart = RMClub.dateCourante(saison);
    const libres = [];
    for (let i = 1; i <= (nbJours || 45); i++) {
      const date = RMClub.ajouterJours(depart, i);
      if (!dateEstLibre(saison, date)) continue;
      libres.push({
        iso: RMClub.dateISO(date),
        date,
        libelle: RMClub.formaterDateLongue(date),
        joursRestants: i,
      });
    }
    return libres;
  }

  let compteurAmicalId = 1;
  // Resynchronise le compteur après un rechargement (même principe que les
  // autres compteurs d'id du projet, cf. resynchroniserCompteurPersonnel) :
  // sans ça, deux amicaux pourraient partager un identifiant après un F5.
  function resynchroniserCompteurAmicaux(saison) {
    let max = 0;
    for (const a of amicaux(saison)) {
      const n = Number(String(a.id || '').replace('am', ''));
      if (Number.isFinite(n) && n > max) max = n;
    }
    compteurAmicalId = max + 1;
    return compteurAmicalId;
  }

  // Propose une rencontre amicale à un club. Renvoie toujours un résultat
  // EXPLICITE : accepté, ou refusé avec un motif lisible — jamais un échec
  // silencieux ni un bouton grisé sans explication.
  function proposerAmical(saison, adversaireId, dateISO) {
    const RMClub = global.RMClub;
    const adversaire = RMClub.club(saison, adversaireId);
    if (!adversaire || adversaireId === saison.clubJoueur.id) {
      return { accepte: false, motif: 'adversaire_invalide',
        message: "Ce club ne peut pas être affronté en amical : seuls les clubs de ta division ont un effectif simulé." };
    }
    let date;
    try { date = RMClub.dateDepuisISO(dateISO); } catch (e) { date = null; }
    if (!date) return { accepte: false, motif: 'date_invalide', message: 'Date invalide.' };
    if (RMClub.comparerDates(date, RMClub.dateCourante(saison)) <= 0) {
      return { accepte: false, motif: 'date_passee',
        message: 'Cette date est déjà passée : choisis un jour à venir.' };
    }
    if (!dateEstLibre(saison, date)) {
      return { accepte: false, motif: 'date_occupee',
        message: "Cette date n'est pas libre : une rencontre y est déjà programmée, ou un match officiel a lieu le lendemain." };
    }
    resynchroniserCompteurAmicaux(saison);
    const amical = {
      id: 'am' + compteurAmicalId++,
      date: RMClub.dateISO(date),
      adversaireId,
      adversaireNom: adversaire.nom,
      domicile: true, // un amical proposé se joue chez celui qui invite
      joue: false,
      score: null,
    };
    amicaux(saison).push(amical);
    return { accepte: true, amical,
      message: `${adversaire.nom} accepte de te rencontrer le ${RMClub.formaterDateLongue(date)}.` };
  }

  function annulerAmical(saison, id) {
    const liste = amicaux(saison);
    const i = liste.findIndex((a) => a.id === id && !a.joue);
    if (i === -1) return false;
    liste.splice(i, 1);
    return true;
  }

  // Enregistre le résultat RÉEL produit par le moteur. Le classement du
  // championnat n'est jamais touché : un amical ne rapporte aucun point.
  function enregistrerResultatAmical(saison, id, scorePour, scoreContre) {
    const amical = amicaux(saison).find((a) => a.id === id);
    if (!amical) return null;
    amical.joue = true;
    amical.score = { pour: scorePour, contre: scoreContre };
    return amical;
  }


  // Fin de saison : les amicaux de la saison écoulée ne doivent pas encombrer
  // la suivante (dont le calendrier est entièrement redaté).
  function reinitialiserAmicaux(saison) {
    saison.amicaux = [];
    compteurAmicalId = 1;
    return saison.amicaux;
  }

  // Toutes les conséquences d'un match amical DISPUTÉ par le joueur. Comme
  // pour la coupe, cette chaîne vivait dans le callback `onResultat` de
  // l'interface alors qu'elle ne contient aucune ligne de DOM.
  //
  // Conséquences RÉELLES, les mêmes qu'un match officiel : c'est ce qui fait
  // d'un amical une décision et non un bouton gratuit. Seule différence avec
  // le championnat : aucun point, aucun classement, aucune recette.
  //
  // Aucune dépendance au DOM.
  function appliquerConsequencesMatchAmical(saison, params) {
    const RMClub = global.RMClub;
    const p = params || {};
    const c = saison.clubJoueur;
    const etat = p.etat;
    const adversaire = p.adversaire;

    enregistrerResultatAmical(saison, p.amical.id, etat.score.A, etat.score.B);

    // Point d'entrée UNIQUE (P1-40) : fatigue + blessures + reprise, avec
    // le facteur préparateur, que la coupe et l'amical oubliaient.
    RMClub.appliquerEffetsMatch(saison, c.effectif, p.compositionUtilisee,
      p.rng, { equipe: 'pro' });
    const forme = etat.score.A > etat.score.B ? 'v' : etat.score.A < etat.score.B ? 'd' : 'n';
    RMClub.appliquerMoral(c.effectif, p.compositionUtilisee, forme);
    RMClub.accumulerStatsJoueurs(c.effectif, p.compositionUtilisee,
      etat.statsJoueurs && etat.statsJoueurs.A, 'pro');

    // L'adversaire aussi encaisse sa rencontre (cf. P1-29).
    const slotAdv = RMClub.slotAdverse(adversaire, RMClub.effectifAdverseNormalise(adversaire));
    RMClub.appliquerEffetsMatchAdverse(saison, adversaire, slotAdv, p.rngAdverse);

    const verbe = forme === 'v' ? 'bat' : forme === 'd' ? "s'incline face à" : 'fait match nul avec';
    const texte = `${c.nom} ${verbe} ${adversaire.nom} (${etat.score.A} - ${etat.score.B}) en match amical. Aucun point au championnat.`;
    RMClub.ajouterMessage(saison, 'match', 'Match amical', texte);

    // Compte rendu archivé (C4) — un amical est une vraie rencontre, il a
    // donc droit à sa feuille comme les autres.
    RMClub.archiverFeuilleDeMatch(saison, {
      cle: RMClub.cleFeuille('amical', p.amical.id),
      etat, date: p.amical.date || null,
      nomA: c.nom, nomB: adversaire.nom, libelle: 'Match amical',
    });

    return { forme, message: texte };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    amicalDuJour, datesLibresPourAmical, proposerAmical, annulerAmical,
    enregistrerResultatAmical, reinitialiserAmicaux,
    appliquerConsequencesMatchAmical,
  });
})(window);
