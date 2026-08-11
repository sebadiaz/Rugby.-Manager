// Génération de l'effectif étendu du club du joueur (Mode Club) — domaine
// extrait de club.js (TODO_AUDIT.md P2-10, tranche 9) : genererJoueurEtendu
// (un joueur pour une CATÉGORIE de poste, id + contrat + suivi de saison
// complets) et genererEffectifEtendu (15 postes de base). Distinct de
// genererJoueur/genererEffectif (numero-based, effectif adverse "prêt à
// jouer", restés dans club.js) : ici chaque joueur a une identité stable
// suivie sur plusieurs saisons.
//
// Dépendance cachée trouvée en analysant le domaine AVANT de couper (comme
// compteurPersonnelId en tranche 1, compteurJoueurId en tranche 8) :
// attribution d'id via RMClub.genererProchainIdJoueur() (déjà exportée de
// club.js depuis la tranche 8), pas de nouvelle dépendance à traiter ici.
(function (global) {
  'use strict';

  // Génère un joueur pour une CATÉGORIE de poste (effectif étendu, club du
  // joueur) — pas de numéro fixe : c'est la composition du jour qui choisit
  // qui porte quel maillot (cf. meilleureComposition).
  // `options.age` : impose l'âge de la recrue AVANT le calcul du potentiel.
  // Sans lui, le seul moyen de choisir l'âge était d'écraser `age` après coup
  // — ce que faisait vieillirEffectif, laissant un espoir de 18 ans avec le
  // potentiel calculé pour l'âge tiré au hasard (mesuré : potentiel 53 pour un
  // niveau de 55,8, soit aucune marge de progression). Cf. TODO_AUDIT.md G1.
  function genererJoueurEtendu(poste, rng, niveauClub, options) {
    const RMClub = global.RMClub;
    const base = RMClub.ARCHETYPE_PAR_POSTE[poste];
    const ecartNiveau = (niveauClub - 0.5) * 20;
    const bruit = () => (rng() * 12 - 6);
    const ageImpose = options && typeof options.age === 'number' ? options.age : null;
    // Le tirage est consommé dans TOUS les cas : l'ordre des appels à rng()
    // ne doit pas dépendre de la présence de l'option, sinon deux carrières
    // de même graine divergeraient selon le chemin d'appel.
    const ageTire = 18 + Math.floor(rng() * 17);
    const age = ageImpose != null ? ageImpose : ageTire;
    const vitesse = RMClub.borneStat(base.vitesse + ecartNiveau + bruit());
    const plaquage = RMClub.borneStat(base.plaquage + ecartNiveau + bruit());
    const adresse = RMClub.borneAdresse((base.adresse != null ? base.adresse : 30) + ecartNiveau * 0.5 + bruit());
    const attributs = RMClub.genererAttributsProfondeur(base, ecartNiveau, rng);
    const niveauActuel = (vitesse + plaquage + attributs.melee + attributs.touche
      + attributs.puissance + attributs.passe + attributs.jeuPied) / 7;
    return {
      id: RMClub.genererProchainIdJoueur(),
      nom: RMClub.genererNomJoueur(rng),
      poste, age, vitesse, plaquage, adresse,
      melee: attributs.melee, touche: attributs.touche, puissance: attributs.puissance,
      endurance: attributs.endurance, passe: attributs.passe, jeuPied: attributs.jeuPied,
      decision: attributs.decision, discipline: attributs.discipline,
      potentiel: RMClub.genererPotentiel(niveauActuel, age, rng),
      tendance: base.tendance, couloir: base.couloir,
      contrat: 1 + Math.floor(rng() * 4), // saisons restantes (1-4)
      salaire: RMClub.calculerSalaire(vitesse, plaquage, age),
      blessureJournees: 0, // >0 = indisponible pour ce nombre de journées
      fatigue: 0, // 0-100, cf. appliquerFatigue — répercutée sur les stats effectives en match
      moral: 60 + Math.round(rng() * 10), // 0-100, cf. appliquerMoral — répercuté sur les stats effectives en match
      pret: null, // {dureeRestante} : joueur prêté, indisponible pour la sélection (cf. preterJoueur)
      matchsJoues: 0, // compteur RÉEL de titularisations cette saison (fiche joueur)
      statsSaison: null, // cf. accumulerStatsJoueurs — jamais fabriqué, alimenté match après match
      attributsDebutSaison: null, // snapshot RÉEL (cf. snapshotAttributsDebutSaison) pour la progression affichée en fiche joueur
      entrainementIndividuel: null, // cf. appliquerEntrainement — remplace le programme collectif pour CE joueur si défini
    };
  }

  function genererEffectifEtendu(rng, niveauClub) {
    return global.RMClub.GABARIT_EFFECTIF.map((poste) => genererJoueurEtendu(poste, rng, niveauClub));
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    genererJoueurEtendu, genererEffectifEtendu,
  });
})(window);
