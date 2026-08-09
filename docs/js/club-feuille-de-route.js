// La feuille de route de la direction (Mode Club).
//
// Ce qui existait avant ce fichier : `confiancePresident` ne bougeait qu'en
// fonction du CLASSEMENT, et nulle part ailleurs (club-direction.js,
// resoudrePointEtape ; club.js, avancerSaison — tous deux via
// evaluerObjectifSaison). Conséquence : tous les arbitrages de gestion
// construits jusqu'ici — infrastructures, centre de formation, mercato,
// statuts promis — n'avaient aucun poids sur la seule jauge qui décide si le
// manager garde son poste. Vider la caisse et ne jamais aligner un joueur
// formé au club coûtait exactement zéro, à classement égal.
//
// Ce que ce domaine ajoute : la direction annonce en début de saison ce
// qu'elle attend, sur trois axes, avec des cibles DÉRIVÉES du club lui-même.
// Le manager sait donc sur quoi il est jugé, il voit son avancement chiffré
// pendant la saison, et le bilan de fin de saison ajuste réellement la
// confiance.
//
// Rien n'est fabriqué :
//   - résultats  -> `objectifSaison`, l'objectif QUI EXISTE DÉJÀ (jamais une
//                   seconde règle qui divergerait) ;
//   - formation  -> somme des titularisations RÉELLES (`matchsJoues`) des
//                   joueurs marqués `issuDuCentre` par promouvoirJeune ;
//   - finances   -> `budget`, comparé à un plancher tiré du budget de départ.
//
// L'axe résultats n'est PAS recompté dans le bilan : evaluerObjectifSaison
// s'en charge déjà. Le doubler récompenserait ou punirait deux fois la même
// chose. Il figure dans la feuille pour que le manager la lise d'un bloc.
(function (global) {
  'use strict';

  const AXES_DIRECTION = {
    resultats: {
      libelle: 'Résultats',
      description: 'Le classement final visé par le président.',
      unite: 'place',
    },
    formation: {
      libelle: 'Formation',
      description: 'Le nombre de titularisations accordées à des joueurs formés au club.',
      unite: 'titularisation(s)',
    },
    finances: {
      libelle: 'Finances',
      description: 'Le budget à ne pas passer sous ce plancher d\'ici la fin de saison.',
      unite: 'k€',
    },
  };
  const CLES_AXE_DIRECTION = ['resultats', 'formation', 'finances'];

  // Exigence de formation : un petit club compte davantage sur son centre —
  // c'est souvent tout ce qu'il a. `niveauClub` va de 0 à 1.
  const FORMATION_BASE = 6;
  const FORMATION_AMPLITUDE = 8;
  // Plancher financier : la direction accepte qu'on investisse, pas qu'on
  // dilapide. La moitié du budget de départ.
  const PART_BUDGET_PLANCHER = 0.5;
  // Effets sur la confiance, volontairement plus faibles que le classement
  // (evaluerObjectifSaison va de −30 à +20) : la gestion pèse, elle ne
  // remplace pas les résultats.
  const CONFIANCE_FORMATION_REUSSIE = 6;
  const CONFIANCE_FORMATION_MANQUEE = -6;
  const CONFIANCE_FINANCES_REUSSIES = 5;
  const CONFIANCE_FINANCES_MANQUEES = -10;

  function cibleFormation(club) {
    const niveau = club.niveauClub != null ? club.niveauClub : 0.5;
    return Math.max(1, Math.round(FORMATION_BASE + (1 - niveau) * FORMATION_AMPLITUDE));
  }

  function ciblePlancherFinancier(budgetDepart) {
    return Math.max(1, Math.round((budgetDepart || 0) * PART_BUDGET_PLANCHER));
  }

  // Fixe la feuille de route de la saison en cours si elle n'existe pas (ou
  // si elle date d'une saison précédente). Idempotente : deux appels dans la
  // même saison ne rejouent pas les cibles, sinon le plancher financier
  // suivrait le budget au lieu de le contraindre.
  function assurerFeuilleDeRoute(saison) {
    const c = saison && saison.clubJoueur;
    if (!c) return null;
    const numero = saison.numero || 1;
    const existante = c.feuilleDeRoute;
    if (existante && existante.saisonNumero === numero && Array.isArray(existante.axes)) return existante;
    const budgetDepart = c.budget || 0;
    const objectif = c.objectifSaison;
    c.feuilleDeRoute = {
      saisonNumero: numero,
      budgetDepart,
      bilanFait: false,
      axes: [
        { cle: 'resultats', cible: objectif ? objectif.position : null },
        { cle: 'formation', cible: cibleFormation(c) },
        { cle: 'finances', cible: ciblePlancherFinancier(budgetDepart) },
      ],
    };
    return c.feuilleDeRoute;
  }

  function axeDe(feuille, cle) {
    return (feuille && feuille.axes || []).find((a) => a.cle === cle) || null;
  }

  // Mesure RÉELLE d'un axe, à l'instant où on la demande.
  function mesurerAxeDirection(saison, cle) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const feuille = assurerFeuilleDeRoute(saison);
    const axe = axeDe(feuille, cle);
    const def = AXES_DIRECTION[cle];
    if (!axe || !def) return null;
    let mesure = 0, atteint = false, detail = '';
    if (cle === 'resultats') {
      const classement = RMClub.classementTrie(saison);
      const position = classement.findIndex((r) => r.clubId === c.id) + 1;
      mesure = position;
      atteint = axe.cible != null && position > 0 && position <= axe.cible;
      detail = axe.cible == null
        ? 'Aucun objectif de classement fixé.'
        : `${position}e sur ${classement.length}, objectif ${axe.cible}e ou mieux.`;
    } else if (cle === 'formation') {
      // Uniquement les joueurs PROMUS du centre de formation (cf.
      // promouvoirJeune) : acheter un joueur de 19 ans n'est pas le former.
      mesure = (c.effectif || [])
        .filter((j) => j.issuDuCentre)
        .reduce((t, j) => t + (j.matchsJoues || 0), 0);
      atteint = mesure >= axe.cible;
      detail = `${mesure} titularisation(s) de joueurs formés au club, cible ${axe.cible}.`;
    } else if (cle === 'finances') {
      mesure = c.budget || 0;
      atteint = mesure >= axe.cible;
      detail = `Budget ${mesure} k€, plancher fixé à ${axe.cible} k€.`;
    }
    return { cle, libelle: def.libelle, description: def.description, unite: def.unite,
      cible: axe.cible, mesure, atteint, detail };
  }

  // Vue d'écran : les trois axes, leur avancement chiffré, rien de plus.
  function dossierFeuilleDeRoute(saison) {
    const feuille = assurerFeuilleDeRoute(saison);
    if (!feuille) return { saisonNumero: null, axes: [], atteints: 0 };
    const axes = CLES_AXE_DIRECTION.map((cle) => mesurerAxeDirection(saison, cle)).filter(Boolean);
    return {
      saisonNumero: feuille.saisonNumero,
      budgetDepart: feuille.budgetDepart,
      axes,
      atteints: axes.filter((a) => a.atteint).length,
    };
  }

  function annoncerFeuilleDeRoute(saison) {
    const RMClub = global.RMClub;
    const feuille = assurerFeuilleDeRoute(saison);
    if (!feuille) return null;
    const lignes = CLES_AXE_DIRECTION.map((cle) => {
      const m = mesurerAxeDirection(saison, cle);
      const def = AXES_DIRECTION[cle];
      if (!m) return '';
      if (cle === 'resultats') {
        return `• ${def.libelle} : ${m.cible != null ? `finir ${m.cible}e ou mieux` : 'aucun classement imposé'}.`;
      }
      if (cle === 'formation') {
        return `• ${def.libelle} : au moins ${m.cible} titularisation(s) de joueurs formés au club sur la saison.`;
      }
      return `• ${def.libelle} : ne pas descendre sous ${m.cible} k€ de budget.`;
    }).filter(Boolean).join('\n');
    RMClub.ajouterMessage(saison, 'saison', 'Feuille de route de la direction',
      `Le président fixe ses attentes pour la saison ${feuille.saisonNumero} :\n${lignes}\n` +
      `Le classement reste l'essentiel, mais la formation et la tenue des comptes compteront aussi dans son jugement.`);
    return feuille;
  }

  // Bilan de fin de saison — ajuste RÉELLEMENT la confiance du président sur
  // les axes que le classement ne couvre pas. Appelé par avancerSaison, juste
  // après evaluerObjectifSaison. Idempotent via `bilanFait` : deux passages
  // ne doivent pas doubler l'effet.
  function evaluerFeuilleDeRoute(saison) {
    const RMClub = global.RMClub;
    const c = saison && saison.clubJoueur;
    if (!c) return null;
    const feuille = assurerFeuilleDeRoute(saison);
    if (!feuille || feuille.bilanFait) return null;
    feuille.bilanFait = true;
    const confianceAvant = c.confiancePresident != null ? c.confiancePresident : 60;
    const axes = [];
    for (const cle of CLES_AXE_DIRECTION) {
      const m = mesurerAxeDirection(saison, cle);
      if (!m) continue;
      let delta = 0, explication = '';
      if (cle === 'resultats') {
        // Déjà compté par evaluerObjectifSaison : delta nul, mais on le
        // rappelle pour que le bilan soit lisible d'un bloc.
        explication = m.detail;
      } else if (cle === 'formation') {
        delta = m.atteint ? CONFIANCE_FORMATION_REUSSIE : CONFIANCE_FORMATION_MANQUEE;
        explication = m.atteint
          ? `Le club a bien fait jouer ses jeunes : ${m.mesure} titularisation(s) pour une cible de ${m.cible}.`
          : `Trop peu de temps de jeu pour les joueurs formés au club : ${m.mesure} titularisation(s) sur ${m.cible} attendues.`;
      } else {
        delta = m.atteint ? CONFIANCE_FINANCES_REUSSIES : CONFIANCE_FINANCES_MANQUEES;
        explication = m.atteint
          ? `Les comptes sont tenus : ${m.mesure} k€ pour un plancher de ${m.cible} k€.`
          : `Le budget est tombé à ${m.mesure} k€, sous le plancher de ${m.cible} k€.`;
      }
      axes.push({ cle, libelle: m.libelle, cible: m.cible, mesure: m.mesure,
        atteint: m.atteint, delta, explication });
    }
    const deltaTotal = axes.reduce((t, a) => t + a.delta, 0);
    c.confiancePresident = Math.max(0, Math.min(100, confianceAvant + deltaTotal));
    const corps = axes.map((a) =>
      `${a.atteint ? '✅' : '❌'} ${a.libelle} — ${a.explication}` +
      (a.delta ? ` (confiance ${a.delta > 0 ? '+' : ''}${a.delta})` : '')).join('\n');
    RMClub.ajouterMessage(saison, 'saison', 'Bilan de la feuille de route',
      `${corps}\nConfiance du président : ${c.confiancePresident} %` +
      `${deltaTotal ? ` (${deltaTotal > 0 ? '+' : ''}${deltaTotal} au titre de la gestion)` : ''}.`);
    return { axes, deltaTotal, confiance: c.confiancePresident };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    AXES_DIRECTION, CLES_AXE_DIRECTION,
    assurerFeuilleDeRoute, mesurerAxeDirection, dossierFeuilleDeRoute,
    annoncerFeuilleDeRoute, evaluerFeuilleDeRoute,
  });
})(window);
