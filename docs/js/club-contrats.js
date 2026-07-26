// Mode Club : renouvellement de contrat — une offre RÉELLE calculée depuis
// le niveau et l'âge actuels du joueur (pas un chiffre décoratif) ;
// l'accepter modifie vraiment contrat/salaire, donc la masse salariale et
// le budget dès la prochaine journée. La négociation (contrairement au
// renouvellement simple, qui accepte toujours le tarif du marché) laisse le
// manager proposer un montant, que le joueur peut refuser : son exigence
// dépend de son moral RÉEL (un joueur mécontent réclame davantage pour
// rester), une offre acceptée remonte le moral, un refus sur une offre trop
// basse le fait un peu chuter. Rien n'est fabriqué : tout dérive de l'état
// du joueur (salaire de marché, âge, moral) déjà suivi par la simulation.
//
// Cinquième domaine extrait de docs/js/club.js (TODO_AUDIT.md P2-10,
// tranche 5) : autonome à l'exception de deux aides restées dans club.js
// (calculerSalaire, une formule générique aussi utilisée par plusieurs
// fonctions de génération de joueurs ; ajouterMessage, l'utilité "cœur"
// partagée par presque tous les domaines), appelées ici via RMClub.*. Même
// mécanisme de fusion que les tranches précédentes.
(function (global) {
  'use strict';

  function calculerOffreRenouvellement(joueur) {
    const dureeMax = joueur.age >= 32 ? 1 : joueur.age >= 29 ? 2 : 3;
    const salaire = global.RMClub.calculerSalaire(joueur.vitesse, joueur.plaquage, joueur.age);
    return { dureeMax, salaire };
  }
  function renouvelerContrat(saison, joueurId, duree) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const offre = calculerOffreRenouvellement(joueur);
    const dureeFinale = Math.max(1, Math.min(offre.dureeMax, duree || offre.dureeMax));
    joueur.contrat = dureeFinale;
    joueur.salaire = offre.salaire;
    global.RMClub.ajouterMessage(saison, 'contrat', 'Contrat renouvelé', `${joueur.nom} prolonge (${dureeFinale} saison(s), ${offre.salaire} k€).`);
    return { ok: true, contrat: joueur.contrat, salaire: joueur.salaire };
  }
  function negocierRenouvellement(rng, saison, joueurId, salaireOffert, duree) {
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const offre = calculerOffreRenouvellement(joueur);
    const dureeFinale = Math.max(1, Math.min(offre.dureeMax, duree || offre.dureeMax));
    const moral = joueur.moral != null ? joueur.moral : 60;
    const facteurExigence = 1 + Math.max(0, 60 - moral) / 200; // moral bas → exige plus pour rester
    const seuil = offre.salaire * facteurExigence;
    const ratio = salaireOffert / seuil;
    const probaAcceptation = Math.max(0.03, Math.min(0.97, (ratio - 0.7) * 2));
    if (rng() >= probaAcceptation) {
      if (ratio < 0.9) joueur.moral = Math.max(0, moral - 3);
      return { ok: false, motif: 'refuse', salaireMinimumEstime: Math.round(seuil) };
    }
    joueur.contrat = dureeFinale;
    joueur.salaire = Math.round(salaireOffert);
    joueur.moral = Math.min(100, moral + 5);
    global.RMClub.ajouterMessage(saison, 'contrat', 'Contrat renouvelé', `${joueur.nom} prolonge (${dureeFinale} saison(s), ${joueur.salaire} k€).`);
    return { ok: true, contrat: joueur.contrat, salaire: joueur.salaire };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    calculerOffreRenouvellement, renouvelerContrat, negocierRenouvellement,
  });
})(window);
