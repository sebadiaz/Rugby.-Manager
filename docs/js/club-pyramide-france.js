// Autres divisions de la pyramide française (Mode Club) — domaine dédié,
// dépendant uniquement de docs/js/club.js et docs/js/club-pyramide.js
// (jamais de world.js, qui lui dépend de club.js — même principe
// d'autonomie déjà documenté dans club-pyramide.js).
//
// Audit ("les autres championnats ne sont jamais simulés") : la pyramide
// française (Ligue Régionale/Nationale/Excellence, cf. club-pyramide.js)
// n'existait RÉELLEMENT que pour le palier occupé par le club du joueur —
// les deux autres paliers n'avaient ni clubs, ni calendrier, ni classement :
// une simple étiquette de nom, régénérée à zéro à chaque montée/descente
// comme si l'ancien palier n'avait jamais existé. Ce fichier leur donne un
// contenu réel (clubs + calendrier + classement), simulé une fois par
// journée jouée par le joueur — pas seulement si un onglet est ouvert (cf.
// TODO_AUDIT.md, limite déjà documentée pour l'écosystème mondial : ne pas
// reproduire ce même défaut ici).
(function (global) {
  'use strict';

  // Résultat ABSTRAIT (statistique, pas le moteur physique) — même formule
  // que RMWorld.simulerResultatAbstrait, DUPLIQUÉE ici (pas importée) pour
  // ne créer aucune dépendance vers world.js. Une trentaine de clubs sur 2
  // divisions ne peuvent pas tourner sur le moteur complet à chaque journée
  // du joueur, sans quoi une seule journée prendrait des minutes à générer.
  function simulerResultatAbstraitFrance(rng, niveauA, niveauB) {
    const base = 18 + (niveauA + niveauB) * 14;
    const ecartForce = (niveauA - niveauB) * 22;
    const bruitA = (rng() - 0.5) * 20;
    const bruitB = (rng() - 0.5) * 20;
    const scoreA = Math.max(0, Math.round(base / 2 + ecartForce / 2 + bruitA));
    const scoreB = Math.max(0, Math.round(base / 2 - ecartForce / 2 + bruitB));
    const essaisA = Math.max(0, Math.round(scoreA / 6.5));
    const essaisB = Math.max(0, Math.round(scoreB / 6.5));
    return { scoreA, scoreB, essaisA, essaisB };
  }

  // Club léger (pas d'effectif complet — inutile pour une simulation
  // abstraite, cf. RMWorld.genererClubMonde, même principe) pour peupler
  // une division française que le joueur n'occupe pas.
  function genererClubDivisionFrance(rng, niveau) {
    const RMClub = global.RMClub;
    const bande = RMClub.bandeNiveauPalier(niveau);
    const niveauClub = Math.max(0.05, Math.min(0.95, bande.min + rng() * (bande.max - bande.min)));
    return {
      id: RMClub.genererProchainIdClub(),
      nom: RMClub.genererNomClub(rng),
      niveauClub,
      budget: RMClub.budgetInitial(niveauClub, rng),
    };
  }

  function genererDivisionFrance(rng, niveau) {
    const RMClub = global.RMClub;
    const clubs = [];
    for (let i = 0; i < RMClub.TAILLE_DIVISION_FRANCE[niveau]; i++) clubs.push(genererClubDivisionFrance(rng, niveau));
    return {
      niveau, nom: RMClub.nomPalierFrance(niveau),
      clubs,
      calendrier: RMClub.genererCalendrier(clubs),
      classement: RMClub.classementInitial(clubs),
    };
  }

  // Les 2 paliers que le club du joueur n'occupe PAS cette saison, réellement
  // peuplés (clubs/calendrier/classement) — jamais le palier du joueur lui-
  // même, déjà géré par saison.adversaires/calendrier/classement.
  function genererAutresDivisionsFrance(rng, niveauExclu) {
    const divisions = {};
    for (const niveau of [1, 2, 3]) {
      if (niveau === niveauExclu) continue;
      divisions[niveau] = genererDivisionFrance(rng, niveau);
    }
    return { niveauExclu, divisions };
  }

  // Rétrocompat (ancienne sauvegarde sans ce champ) ET resynchronisation
  // après une montée/descente (le palier exclu doit toujours correspondre au
  // palier RÉEL du joueur — sinon son ancien palier resterait figé et le
  // nouveau resterait doublement peuplé). Ne carry-over PAS l'identité des
  // clubs d'un palier quitté : régénéré à neuf, comme saison.adversaires
  // l'est déjà pour le palier du joueur (cf. avancerSaison, club.js) — une
  // amélioration ultérieure pourra faire persister l'identité des clubs
  // d'un palier à l'autre, hors périmètre de cette première tranche.
  function assurerAutresDivisionsFrance(rng, saison) {
    const niveauActuel = (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
    if (!saison.autresDivisionsFrance || saison.autresDivisionsFrance.niveauExclu !== niveauActuel) {
      saison.autresDivisionsFrance = genererAutresDivisionsFrance(rng, niveauActuel);
    }
    return saison.autresDivisionsFrance;
  }

  // Avance chaque division d'une journée (prochaine ronde non jouée) —
  // appelée une fois par journée RÉELLEMENT jouée par le joueur (cf.
  // clubUI.js, lancerLaJournee), jamais conditionnée à l'ouverture d'un
  // onglet particulier.
  function avancerJourneeAutresDivisionsFrance(rng, autresDivisions) {
    if (!autresDivisions) return;
    for (const niveau of Object.keys(autresDivisions.divisions)) {
      const div = autresDivisions.divisions[niveau];
      const prochaine = div.calendrier.find((f) => !f.joue);
      if (!prochaine) continue;
      const ronde = div.calendrier.filter((f) => f.journee === prochaine.journee);
      const parId = {};
      for (const c of div.clubs) parId[c.id] = c;
      for (const f of ronde) {
        const a = parId[f.domicileId], b = parId[f.exterieurId];
        if (!a || !b) continue;
        const r = simulerResultatAbstraitFrance(rng, a.niveauClub, b.niveauClub);
        global.RMClub.enregistrerResultatDans(div.calendrier, div.classement, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
      }
    }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    assurerAutresDivisionsFrance, avancerJourneeAutresDivisionsFrance,
  });
})(window);
