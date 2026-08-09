// Mode Club : prêt d'un joueur — il reste dans l'effectif (contrat/salaire
// inchangés) mais devient INDISPONIBLE pour la sélection pendant la durée
// du prêt (exclusion dure, cf. meilleureComposition/completerComposition
// dans docs/js/club.js), en échange d'une indemnité de prêt immédiate — un
// vrai compromis temps de jeu / finances, pas un simple badge.
//
// Quatrième domaine extrait de docs/js/club.js (TODO_AUDIT.md P2-10,
// tranche 4) : aucun appelant interne à club.js (uniquement consommé par
// docs/js/clubUI.js, déjà namespacé), une seule dépendance externe
// (ajouterMessage, resté dans club.js), appelée ici via RMClub.*. Même
// mécanisme de fusion que les tranches précédentes.
(function (global) {
  'use strict';

  function preterJoueur(saison, joueurId, dureeJournees) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    if (joueur.pret) return { ok: false, motif: 'deja_prete' };
    // Même garde que libererJoueur : un prêt ne doit jamais vider complètement
    // un poste (sinon la composition ne peut plus être complétée — plus aucun
    // joueur disponible à aligner à ce numéro, cf. completerComposition).
    const memePoste = saison.clubJoueur.effectif.filter((j) => j.poste === joueur.poste && !j.pret);
    if (memePoste.length <= 1) return { ok: false, motif: 'dernier_du_poste' };
    // En JOURS depuis le passage à la carrière quotidienne (TODO_AUDIT.md
    // P1-22) : la progression du prêt est désormais quotidienne (cf.
    // club-evenements.js, progresserPretsDuJour), plus une décrémentation
    // par match. 21 jours = les 3 journées de championnat d'avant.
    const duree = Math.max(1, Math.min(70, dureeJournees || 21));
    const indemnite = Math.round(joueur.salaire * 0.3 * (duree / 10));
    joueur.pret = { dureeRestante: duree };
    global.RMClub.tresorerie(saison, 'pret',
      `Indemnité de prêt — ${joueur.nom} (${duree} j)`, indemnite);
    const c = saison.clubJoueur;
    if (c.capitaineId === joueurId) c.capitaineId = null;
    if (c.buteurId === joueurId) c.buteurId = null;
    if (c.lanceurToucheId === joueurId) c.lanceurToucheId = null;
    for (const compo of [c.compositionTitulaires, c.compositionBanc]) {
      if (!compo) continue;
      for (const numero of Object.keys(compo)) {
        if (compo[numero] === joueurId) delete compo[numero];
      }
    }
    global.RMClub.ajouterMessage(saison, 'transfert', 'Prêt sortant', `${joueur.nom} part en prêt pour ${duree} journée(s) (indemnité ${indemnite} k€).`);
    return { ok: true, indemnite };
  }
  function rappelerJoueur(saison, joueurId) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur || !joueur.pret) return { ok: false, motif: 'pas_prete' };
    joueur.pret = null;
    global.RMClub.ajouterMessage(saison, 'transfert', 'Retour de prêt', `${joueur.nom} est rappelé de prêt.`);
    return { ok: true };
  }
  // Décompte la durée restante de chaque prêt en cours (une fois par journée
  // jouée, comme faireProgresserBlessures) et lève le prêt à échéance.
  function progresserPrets(effectif) {
    for (const j of effectif) {
      if (!j.pret) continue;
      j.pret.dureeRestante--;
      if (j.pret.dureeRestante <= 0) j.pret = null;
    }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    preterJoueur, rappelerJoueur, progresserPrets,
  });
})(window);
