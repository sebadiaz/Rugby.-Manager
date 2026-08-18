// Le grand livre du club (Mode Club) — chaque mouvement de trésorerie.
//
// Ce qui existait avant ce fichier : `historiqueFinances`, alimenté par le
// SEUL `enregistrerMouvementFinances`, appelé uniquement après un match. Or
// onze endroits modifient `club.budget` : infrastructures, mercato, prêts,
// transferts nationaux et internationaux, repérage, et les deux fonctions de
// match. Neuf n'écrivaient nulle part.
//
// Mesuré sur une carrière neuve : un repérage (8 k€) puis un chantier au
// centre médical (260 k€) font tomber le budget de 434 à 166 k€, et le
// journal financier contient ZÉRO ligne. 268 k€ sans la moindre trace.
//
// Depuis que la direction impose un plancher de trésorerie (P1-46), le
// manager est jugé sur un chiffre dont il ne peut pas expliquer les
// variations. Ce module rend cet argent traçable.
//
// LA RÈGLE : on ne touche plus `club.budget` directement. On appelle
// `mouvementTresorerie(club, categorie, libelle, montant)`, qui débite ou
// crédite ET enregistre. L'invariant tenu par les tests :
//
//     budget_final − budget_initial === somme des totaux du grand livre
//
// `historiqueFinances` n'est PAS remplacé : il reste le résumé PAR JOURNÉE
// (un agrégat par match, utilisé par la vue journée après journée). Le grand
// livre, lui, est la trace LIGNE À LIGNE de chaque opération. Deux
// granularités, pas deux vérités : les deux découlent des mêmes appels.
(function (global) {
  'use strict';

  const CATEGORIES_COMPTE = {
    billetterie: { libelle: 'Billetterie', sens: 'recette',
      description: 'Recettes des jours de match, tribunes comprises.' },
    sponsor: { libelle: 'Sponsors', sens: 'recette',
      description: 'Revenu récurrent des partenaires.' },
    droitsTV: { libelle: 'Droits TV', sens: 'recette',
      description: 'Versés à chaque journée de championnat, selon le palier.' },
    primes: { libelle: 'Primes de compétition', sens: 'recette',
      description: 'Classement final et parcours en coupe, versés en fin de saison.' },
    transfertVente: { libelle: 'Ventes de joueurs', sens: 'recette',
      description: 'Indemnités encaissées sur les départs.' },
    pret: { libelle: 'Prêts', sens: 'recette',
      description: 'Indemnités liées aux joueurs prêtés.' },
    salaires: { libelle: 'Salaires des joueurs', sens: 'depense',
      description: 'Masse salariale de l\'effectif, répartie sur la saison.' },
    salairesPersonnel: { libelle: 'Salaires du personnel', sens: 'depense',
      description: 'Staff technique, médical et de recrutement.' },
    deplacement: { libelle: 'Déplacements', sens: 'depense',
      description: 'Voyage et hébergement du groupe sur les matchs à l\'extérieur.' },
    entretien: { libelle: 'Exploitation des installations', sens: 'depense',
      description: 'Entretien du stade, du centre médical, du centre de formation et des terrains.' },
    transfertAchat: { libelle: 'Achats de joueurs', sens: 'depense',
      description: 'Indemnités versées pour recruter.' },
    travaux: { libelle: 'Infrastructures', sens: 'depense',
      description: 'Chantiers engagés sur les installations du club.' },
    scouting: { libelle: 'Recrutement et repérage', sens: 'depense',
      description: 'Missions d\'observation et frais de dossier.' },
  };
  const CLES_CATEGORIE_COMPTE = Object.keys(CATEGORIES_COMPTE);
  // La liste affichée est bornée (l'écran n'en montre qu'un extrait), mais
  // les TOTAUX, eux, ne le sont jamais : c'est ce qui permet à l'invariant de
  // tenir sur une saison entière.
  const LIGNES_CONSERVEES = 60;

  let compteurLigne = 1;

  function totauxVides() {
    const t = {};
    for (const cle of CLES_CATEGORIE_COMPTE) t[cle] = 0;
    return t;
  }

  function clubDe(saisonOuClub) {
    if (!saisonOuClub) return null;
    return saisonOuClub.clubJoueur || saisonOuClub;
  }

  // Crée le grand livre s'il manque. Sur une sauvegarde antérieure, REPREND
  // l'ancien journal par journée pour ne rien perdre : les recettes et
  // salaires déjà encaissés redeviennent consultables et comptés.
  function assurerComptes(saisonOuClub, saisonNumero) {
    const c = clubDe(saisonOuClub);
    if (!c) return null;
    const numero = saisonNumero != null ? saisonNumero
      : (saisonOuClub && saisonOuClub.numero) || (c.comptes && c.comptes.saisonNumero) || 1;
    if (c.comptes && c.comptes.totaux && Array.isArray(c.comptes.lignes)) return c.comptes;
    // `journeesFinancieres` : nombre de journées de première équipe déjà
    // encaissées cette saison. C'est le dénominateur du prévisionnel — il ne
    // peut pas se déduire des lignes, qui sont bornées.
    const comptes = { saisonNumero: numero, totaux: totauxVides(), lignes: [], journeesFinancieres: 0 };
    comptes.journeesFinancieres = (c.historiqueFinances || []).filter((m) => m.source == null).length;
    for (const m of c.historiqueFinances || []) {
      const ajouts = [
        ['billetterie', 'Recette de match', m.recette || 0],
        ['sponsor', 'Revenu sponsor', m.revenuSponsor || 0],
        ['salaires', 'Salaires des joueurs', -(m.salaires || 0)],
        ['salairesPersonnel', 'Salaires du personnel', -(m.salairesPersonnel || 0)],
      ];
      for (const [categorie, libelle, montant] of ajouts) {
        if (!montant) continue;
        comptes.totaux[categorie] += montant;
        comptes.lignes.push({ id: 'op' + compteurLigne++, categorie, libelle, montant,
          budgetApres: m.budgetApres, journee: m.journee, repris: true });
      }
    }
    if (comptes.lignes.length > LIGNES_CONSERVEES) {
      comptes.lignes = comptes.lignes.slice(-LIGNES_CONSERVEES);
    }
    c.comptes = comptes;
    return comptes;
  }

  // LE point d'entrée. Débite (montant négatif) ou crédite (positif) le
  // budget ET l'inscrit au grand livre. Renvoie la ligne créée.
  // Rétrocompatibilité : `assurerComptes` sort tôt quand les comptes existent
  // déjà, donc une sauvegarde antérieure à l'ajout d'une catégorie n'a pas sa
  // clé dans `totaux`. Sans ce filet, `totaux[categorie] += montant` sur
  // `undefined` produit NaN et contamine le budget affiché.
  function assurerCategories(comptes) {
    for (const cle of CLES_CATEGORIE_COMPTE) {
      if (typeof comptes.totaux[cle] !== 'number') comptes.totaux[cle] = 0;
    }
    return comptes;
  }

  function mouvementTresorerie(saisonOuClub, categorie, libelle, montant, extra) {
    const c = clubDe(saisonOuClub);
    if (!c) return null;
    const m = Math.round(montant || 0);
    if (!m) return null;
    const comptes = assurerCategories(assurerComptes(saisonOuClub));
    if (!CATEGORIES_COMPTE[categorie]) {
      // Catégorie inconnue : on refuse plutôt que d'inventer une case, sinon
      // le total ne correspondrait plus à la ventilation affichée.
      return null;
    }
    c.budget = (c.budget || 0) + m;
    comptes.totaux[categorie] = (comptes.totaux[categorie] || 0) + m;
    const ligne = Object.assign({
      id: 'op' + compteurLigne++,
      categorie, libelle: libelle || CATEGORIES_COMPTE[categorie].libelle,
      montant: m, budgetApres: c.budget,
    }, extra || null);
    comptes.lignes.push(ligne);
    if (comptes.lignes.length > LIGNES_CONSERVEES) comptes.lignes.shift();
    return ligne;
  }

  // Une journée de première équipe vient d'être encaissée : c'est ce qui
  // donne son dénominateur au prévisionnel.
  function compterJourneeFinanciere(saisonOuClub) {
    const comptes = assurerComptes(saisonOuClub);
    if (!comptes) return 0;
    comptes.journeesFinancieres = (comptes.journeesFinancieres || 0) + 1;
    return comptes.journeesFinancieres;
  }

  function totauxComptes(saisonOuClub) {
    const comptes = assurerComptes(saisonOuClub);
    return comptes ? comptes.totaux : totauxVides();
  }

  // Les plus récentes d'abord — c'est l'ordre de lecture d'un relevé.
  function lignesComptes(saisonOuClub) {
    const comptes = assurerComptes(saisonOuClub);
    return comptes ? comptes.lignes.slice().reverse() : [];
  }

  // Vue d'écran : ventilation par catégorie + recettes/dépenses/solde.
  function dossierComptes(saisonOuClub) {
    const c = clubDe(saisonOuClub);
    const totaux = totauxComptes(saisonOuClub);
    const lignes = lignesComptes(saisonOuClub);
    const nbParCategorie = {};
    for (const l of lignes) nbParCategorie[l.categorie] = (nbParCategorie[l.categorie] || 0) + 1;
    const categories = CLES_CATEGORIE_COMPTE
      .filter((cle) => totaux[cle])
      .map((cle) => ({
        cle, libelle: CATEGORIES_COMPTE[cle].libelle,
        description: CATEGORIES_COMPTE[cle].description,
        sens: CATEGORIES_COMPTE[cle].sens,
        montant: totaux[cle],
        // Nombre d'opérations RÉELLEMENT conservées à l'affichage — une
        // ligne ancienne sortie de la liste ne peut pas être recomptée.
        nbOperations: nbParCategorie[cle] || 0,
      }));
    const recettes = categories.filter((x) => x.montant > 0).reduce((t, x) => t + x.montant, 0);
    const depenses = categories.filter((x) => x.montant < 0).reduce((t, x) => t + x.montant, 0);
    return {
      budget: c ? c.budget : 0,
      categories, recettes, depenses, solde: recettes + depenses,
      lignes,
      saisonNumero: c && c.comptes ? c.comptes.saisonNumero : null,
      historique: (c && c.historiqueComptes) || [],
    };
  }

  // Prévision de trésorerie : le solde net moyen des mouvements RÉCURRENTS
  // (billetterie, sponsor, salaires — ce qui retombe à chaque journée),
  // projeté sur N journées, MOINS ce qui est déjà engagé et pas encore payé.
  //
  // L'ancienne prevoirFinances extrapolait le journal de match sans jamais
  // regarder les engagements : un chantier de 260 k€ en cours n'apparaissait
  // pas, alors que c'est précisément le genre de dépense qui fait passer sous
  // le plancher imposé par la direction.
  const CATEGORIES_RECURRENTES = ['billetterie', 'sponsor', 'salaires', 'salairesPersonnel'];
  function previsionTresorerie(saisonOuClub, nJournees) {
    const RMClub = global.RMClub;
    const c = clubDe(saisonOuClub);
    if (!c) return null;
    const comptes = assurerComptes(saisonOuClub);
    const journees = comptes.journeesFinancieres || 0;
    if (!journees) return null;
    const recurrent = CATEGORIES_RECURRENTES.reduce((t, cle) => t + (comptes.totaux[cle] || 0), 0);
    const soldeNetMoyen = Math.round(recurrent / journees);
    // Chantier en cours : sa dépense est débitée D'UN COUP au lancement (cf.
    // club-infrastructures.js, lancerTravaux). Elle est donc DÉJÀ sortie du
    // budget affiché — la retrancher de la projection la compterait deux
    // fois. Mesuré en pilotant le jeu : budget 401 k€ avec un chantier de
    // 320 k€ déjà payé, projection annoncée 736 k€ au lieu de 1056 k€.
    // Le chantier est donc rappelé comme CONTEXTE, avec son échéance, sans
    // peser une seconde fois sur la projection.
    const chantier = (saisonOuClub && RMClub.chantierEnCours) ? RMClub.chantierEnCours(saisonOuClub) : null;
    const n = nJournees > 0 ? nJournees : 1;
    return {
      soldeNetMoyen,
      // Ce qui reste réellement à décaisser : nul tant que les travaux se
      // paient à la commande. Le champ existe pour le jour où un poste de
      // dépense s'étalera vraiment dans le temps.
      engagements: 0,
      chantier: chantier
        ? { cle: chantier.cle, cout: chantier.cout, joursRestants: chantier.joursRestants,
            niveauVise: chantier.niveauVise }
        : null,
      nJournees: n,
      projection: Math.round(c.budget + soldeNetMoyen * n),
    };
  }

  // Bascule de saison : archive les totaux réels puis repart de zéro.
  function archiverComptesSaison(saison, nouveauNumero) {
    const c = clubDe(saison);
    if (!c) return null;
    const comptes = assurerComptes(saison);
    if (!c.historiqueComptes) c.historiqueComptes = [];
    c.historiqueComptes.push(Object.assign({ saisonNumero: comptes.saisonNumero,
      budgetFin: c.budget }, comptes.totaux));
    if (c.historiqueComptes.length > 20) c.historiqueComptes.shift();
    c.comptes = { saisonNumero: nouveauNumero, totaux: totauxVides(), lignes: [], journeesFinancieres: 0 };
    return c.historiqueComptes[c.historiqueComptes.length - 1];
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    CATEGORIES_COMPTE, CLES_CATEGORIE_COMPTE, assurerComptes, mouvementTresorerie,
    compterJourneeFinanciere, totauxComptes, lignesComptes, dossierComptes,
    previsionTresorerie, archiverComptesSaison,
  });
})(window);
