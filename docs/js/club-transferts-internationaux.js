// Transferts internationaux (Mode Club) — approcher un joueur d'un club
// adverse pour le recruter, contre une indemnité négociée. Domaine extrait
// de club.js (TODO_AUDIT.md P2-10, tranche 8), distinct du marché national
// (docs/js/club-transferts.js, tranche 7) : ici on cible un joueur PRÉCIS
// déjà dans l'effectif d'un adversaire, pas un joueur libre du marché.
//
// Dépendance cachée trouvée en analysant le domaine AVANT de couper (comme
// compteurPersonnelId en tranche 1) : convertirJoueurAdverseEnEffectifEtendu
// attribuait un id via `'j' + compteurJoueurId++`, une variable de module de
// club.js hors de la fermeture de ce fichier. club.js exporte maintenant
// une fonction dédiée `genererProchainIdJoueur()` pour ça — même logique
// d'id, juste déplacée là où l'état vit réellement.
(function (global) {
  'use strict';

  // Prix demandé par le club adverse pour céder ce joueur : jamais un solde
  // fixe, dépend de la valeur du joueur ET de son importance dans son
  // équipe (un titulaire clé, nettement au-dessus de la moyenne de son club,
  // coûte plus cher et refuse plus souvent qu'un remplaçant).
  function calculerPrixDemandeAdverse(joueurAdverse, clubAdverse) {
    const RMClub = global.RMClub;
    const valeurBase = RMClub.estimerValeurTransfert(joueurAdverse.vitesse, joueurAdverse.plaquage, joueurAdverse.age);
    const niveauJoueur = (joueurAdverse.vitesse + joueurAdverse.plaquage) / 2;
    const niveauMoyenClub = clubAdverse.effectif.reduce((s, j) => s + (j.vitesse + j.plaquage) / 2, 0) / clubAdverse.effectif.length;
    // Un joueur nettement au-dessus de la moyenne de son équipe (pilier de
    // l'effectif) coûte une prime réelle ; un remplaçant sous la moyenne se
    // négocie proche de sa valeur de base — jamais en dessous.
    const primeCle = Math.max(1, 1 + (niveauJoueur - niveauMoyenClub) / 35);
    return Math.round(valeurBase * 1.6 * primeCle);
  }

  // Convertit un joueur adverse (effectif "prêt à jouer", numéro-based) en
  // joueur d'effectif étendu (id, contrat, statistiques de saison...) une
  // fois le transfert accepté — mêmes champs que genererJoueurEtendu, à
  // partir des attributs RÉELS du joueur transféré (jamais régénérés).
  function convertirJoueurAdverseEnEffectifEtendu(joueurAdverse, rng) {
    const RMClub = global.RMClub;
    return {
      id: RMClub.genererProchainIdJoueur(),
      nom: joueurAdverse.nom,
      poste: joueurAdverse.poste,
      age: joueurAdverse.age,
      vitesse: joueurAdverse.vitesse,
      plaquage: joueurAdverse.plaquage,
      adresse: joueurAdverse.adresse,
      melee: joueurAdverse.melee, touche: joueurAdverse.touche, puissance: joueurAdverse.puissance,
      endurance: joueurAdverse.endurance, passe: joueurAdverse.passe, jeuPied: joueurAdverse.jeuPied,
      decision: joueurAdverse.decision, discipline: joueurAdverse.discipline,
      potentiel: joueurAdverse.potentiel,
      tendance: joueurAdverse.tendance, couloir: joueurAdverse.couloir,
      contrat: 2 + Math.floor(rng() * 3),
      salaire: joueurAdverse.salaire != null ? joueurAdverse.salaire : RMClub.calculerSalaire(joueurAdverse.vitesse, joueurAdverse.plaquage, joueurAdverse.age),
      blessureJournees: 0,
      fatigue: 0,
      moral: 60,
      pret: null,
      matchsJoues: 0,
      statsSaison: null,
      attributsDebutSaison: null,
      entrainementIndividuel: null,
    };
  }

  // Tente d'acheter le joueur `index` de l'effectif du club adverse `clubAdverseId`.
  // L'acceptation n'est jamais garantie même en offrant plus que le prix
  // demandé (un club refuse parfois de céder un titulaire clé) : la
  // probabilité croît avec le ratio offre/prix demandé, jamais 0% ni 100%.
  // Si accepté, le club adverse recrute IMMÉDIATEMENT un remplaçant du même
  // numéro (même niveau) : son effectif reste toujours complet à 15, sinon
  // sa composition du prochain match deviendrait impossible à compléter.
  function approcherJoueurAdverse(rng, saison, clubAdverseId, index, montantOffre) {
    const RMClub = global.RMClub;
    const adversaire = saison.adversaires.find((a) => a.id === clubAdverseId);
    if (!adversaire) return { ok: false, motif: 'introuvable' };
    const joueurAdverse = adversaire.effectif[index];
    if (!joueurAdverse) return { ok: false, motif: 'introuvable' };
    if (saison.clubJoueur.budget < montantOffre) return { ok: false, motif: 'budget' };
    const prixDemande = calculerPrixDemandeAdverse(joueurAdverse, adversaire);
    const ratio = montantOffre / prixDemande;
    const probaAcceptation = Math.max(0.05, Math.min(0.95, (ratio - 0.6) * 1.2));
    if (rng() >= probaAcceptation) return { ok: false, motif: 'refuse', prixDemande };
    saison.clubJoueur.budget -= montantOffre;
    const nouveauJoueur = convertirJoueurAdverseEnEffectifEtendu(joueurAdverse, rng);
    saison.clubJoueur.effectif.push(nouveauJoueur);
    adversaire.effectif[index] = RMClub.genererJoueur(joueurAdverse.numero, rng, adversaire.niveauClub);
    RMClub.ajouterMessage(saison, 'transfert', 'Transfert international',
      `${nouveauJoueur.nom} rejoint le club en provenance de ${adversaire.nom} (${montantOffre} k€).`);
    return { ok: true, joueur: nouveauJoueur, prixDemande };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    calculerPrixDemandeAdverse, convertirJoueurAdverseEnEffectifEtendu, approcherJoueurAdverse,
  });
})(window);
