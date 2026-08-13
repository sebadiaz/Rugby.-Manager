// Contrats, négociations et transferts entrants (Mode Club).
//
// CE QUI EXISTAIT AVANT CE FICHIER, vérifié dans le code et en jouant :
//
//   - `club-contrats.js` : une proposition part, revient 3 jours plus tard,
//     et le joueur répond OUI ou NON. Deux issues, rien entre les deux.
//   - `club-ventes.js` : les clubs adverses font des offres pour MES joueurs,
//     et je peux vendre. L'inverse n'existait pas : le marché des transferts
//     (`club-transferts.js`, `genererJoueurLibre`) ne contient QUE des joueurs
//     libres. Impossible de faire une offre pour le joueur d'un autre club.
//   - `vieillirEffectif` : un contrat arrivé à zéro fait partir le joueur à
//     l'intersaison — y compris dans les clubs IA, qui ne PROLONGENT jamais
//     personne. Ils subissent leur effectif au lieu de le gérer.
//   - Aucun champ de satisfaction contractuelle, aucune volonté exprimée de
//     prolonger ou de partir (hors `veutPartir`, qui vient du temps de jeu),
//     aucune prime, aucune saison de fin de contrat lisible.
//
// CE FICHIER APPORTE :
//   1. les champs de contrat qui manquaient, dérivés de l'état réel du joueur ;
//   2. une négociation à ÉTAPES : acceptation, refus motivé, contre-proposition,
//      délai de réflexion, rupture définitive des discussions ;
//   3. les offres SORTANTES : proposer un transfert à un club adverse, négocier,
//      finaliser ou annuler ;
//   4. les prolongations des clubs IA, pour qu'ils gèrent leur effectif.
//
// UNE SEULE RÈGLE DE DÉCISION : `evaluerOffreContrat`. `negocierRenouvellement`
// (club-contrats.js) s'appuie sur la même exigence salariale — il n'existe pas
// deux barèmes qui pourraient diverger.
//
// Aucune dépendance au DOM, aucun `Math.random` : le rng vient de l'appelant.
(function (global) {
  'use strict';

  // --- 1. Le contrat, complété -------------------------------------------

  // Délai de réponse à une proposition, et délai supplémentaire quand le
  // joueur demande à réfléchir.
  const DELAI_REPONSE_JOURS = 3;
  const DELAI_REFLEXION_JOURS = 4;
  // Au-delà de deux refus, l'agent met fin aux discussions pour la saison :
  // sans ça, le manager pourrait harceler un joueur jusqu'à ce qu'un tirage
  // passe, et la négociation n'aurait aucun enjeu.
  const REFUS_AVANT_RUPTURE = 2;
  // Délai laissé à un club adverse pour répondre à une offre de transfert.
  const DELAI_REPONSE_TRANSFERT_JOURS = 4;
  // Ce qu'un club adverse exige au-dessus de la valeur estimée pour lâcher un
  // joueur qu'il n'a pas mis sur le marché.
  const SURCOTE_VENDEUR = 1.25;
  // Indemnité de rupture : rompre un contrat en cours coûte le reste dû,
  // ramené à une part négociée. On ne licencie pas gratuitement.
  const PART_INDEMNITE_RUPTURE = 0.6;
  // Au-delà de ce montant, la direction considère la rupture comme une erreur
  // de gestion et retire de la confiance. En dessous (contrat qui s'achevait,
  // petit salaire), elle laisse faire.
  const SEUIL_RUPTURE_NOTABLE = 40;

  const CANAL_NEGOCIATIONS = 41;

  function borne(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // Retire toute référence à un joueur qui quitte l'effectif : brassard,
  // buteur, lanceur, composition du jour. Exactement les mêmes nettoyages que
  // `vendreJoueur` (club-ventes.js) — sans eux, la composition pointerait vers
  // un id qui n'existe plus.
  function detacherDuClub(c, joueurId) {
    if (c.capitaineId === joueurId) c.capitaineId = null;
    if (c.buteurId === joueurId) c.buteurId = null;
    if (c.lanceurToucheId === joueurId) c.lanceurToucheId = null;
    for (const compo of [c.compositionTitulaires, c.compositionBanc]) {
      if (!compo) continue;
      for (const numero of Object.keys(compo)) {
        if (compo[numero] === joueurId) delete compo[numero];
      }
    }
  }
  function borneMoral(v) { return borne(Math.round(v), 0, 100); }
  function clubJoueurDe(saison) { return saison && saison.clubJoueur; }

  // Saison à laquelle le contrat s'achève réellement. `contrat` est un nombre
  // de saisons restantes ; le manager, lui, raisonne en échéance.
  function saisonFinContrat(saison, joueur) {
    if (!joueur || joueur.contrat == null) return null;
    return (saison.numero || 1) + Math.max(0, joueur.contrat);
  }

  // Salaire que le marché paierait AUJOURD'HUI pour ce joueur — la même
  // formule que partout ailleurs dans le jeu (calculerSalaire), pour qu'un
  // joueur ne vaille pas deux prix différents selon l'écran.
  function salaireDeMarche(joueur) {
    return global.RMClub.calculerSalaire(joueur.vitesse, joueur.plaquage, joueur.age);
  }

  // Combien de clubs adverses ont un BESOIN RÉEL à ce poste et les moyens de
  // payer ce joueur. Sert à la fois à l'exigence salariale du joueur (il sait
  // qu'il a un marché) et à l'affichage.
  function interetExterieur(saison, joueur) {
    const RMClub = global.RMClub;
    if (!joueur || !RMClub.besoinsDe || !RMClub.valeurMarchande) return 0;
    const valeur = RMClub.valeurMarchande(saison, joueur);
    let n = 0;
    for (const club of saison.adversaires || []) {
      if ((club.budget || 0) < valeur * 0.6) continue;
      const besoins = RMClub.besoinsDe(saison, club) || [];
      if (besoins.some((b) => b.poste === joueur.poste)) n++;
    }
    return n;
  }

  // Satisfaction contractuelle (0-100) : ce que le joueur pense de sa
  // situation. Dérivée UNIQUEMENT de faits déjà suivis par la simulation —
  // son salaire face au marché, le statut qu'on lui a promis face au temps de
  // jeu qu'il a réellement eu, son moral. Jamais un chiffre stocké à part qui
  // pourrait diverger de la réalité.
  function satisfactionContrat(saison, joueur) {
    if (!joueur) return 0;
    const RMClub = global.RMClub;
    const marche = salaireDeMarche(joueur);
    const salaire = joueur.salaire != null ? joueur.salaire : marche;
    // Payé au marché = neutre ; payé 30 % au-dessus = nettement satisfait.
    let s = 55 + borne((salaire / Math.max(1, marche) - 1) * 110, -35, 30);
    // Statut promis tenu ou non (cf. club-statuts.js) : c'est le deuxième
    // pilier d'un contrat, à égalité avec l'argent.
    if (joueur.statutPromis && RMClub.STATUTS && RMClub.STATUTS[joueur.statutPromis]) {
      const attendu = RMClub.STATUTS[joueur.statutPromis].tauxTitulaireAttendu;
      if (attendu != null) {
        const joues = joueur.matchsJoues || 0;
        const dispo = Math.max(1, joueur.matchsDisponibles || joues);
        s += borne((joues / dispo - attendu) * 60, -25, 15);
      }
    }
    // Le moral pèse, mais ne fait pas tout : un joueur bien payé et bien
    // utilisé reste satisfait de son contrat même un jour sans.
    const moral = joueur.moral != null ? joueur.moral : 65;
    s += (moral - 65) * 0.25;
    if (joueur.veutPartir) s -= 20;
    return borne(Math.round(s), 0, 100);
  }

  // Ce que le joueur veut faire de son avenir. Quatre états lisibles, dérivés
  // de la satisfaction, de l'âge et de l'échéance.
  function volonteProlonger(saison, joueur) {
    if (!joueur) return 'inconnu';
    if (joueur.veutPartir) return 'refuse';
    if (joueur.negociationRompue) return 'refuse';
    const s = satisfactionContrat(saison, joueur);
    if (s >= 70) return 'souhaite';
    if (s >= 50) return 'ouvert';
    if (s >= 30) return 'reticent';
    return 'refuse';
  }

  // Exigence salariale RÉELLE du joueur pour une offre donnée. C'est LE
  // barème : `negocierRenouvellement` (club-contrats.js) s'en sert aussi, il
  // n'existe pas deux règles.
  function exigenceSalariale(saison, joueur, options) {
    const o = options || {};
    const marche = salaireDeMarche(joueur);
    let facteur = 1;
    // Moral bas : il faut payer plus pour le retenir (règle historique,
    // conservée à l'identique).
    const moral = joueur.moral != null ? joueur.moral : 60;
    facteur *= 1 + Math.max(0, 60 - moral) / 200;
    // Insatisfait de sa situation : il monte ses prétentions.
    const satisfaction = satisfactionContrat(saison, joueur);
    facteur *= 1 + Math.max(0, 55 - satisfaction) / 260;
    // Il sait qu'il a un marché : chaque club intéressé le renforce.
    const interet = o.interet != null ? o.interet : interetExterieur(saison, joueur);
    facteur *= 1 + Math.min(3, interet) * 0.05;
    // Durée : un contrat long rassure un joueur âgé (il baisse ses
    // prétentions) et enferme un jeune (il les monte).
    const duree = o.duree || 2;
    if (joueur.age >= 30) facteur *= 1 - Math.min(3, duree) * 0.02;
    else if (joueur.age <= 23) facteur *= 1 + Math.min(4, duree) * 0.015;
    // Réputation du club : un club réputé se paie en prestige.
    const reputation = (saison.manager && saison.manager.reputation) || 50;
    facteur *= 1 - borne((reputation - 50) / 500, -0.06, 0.06);
    return Math.max(1, Math.round(marche * facteur));
  }

  // --- 2. La décision du joueur ------------------------------------------

  // Verdict d'une proposition. Fonction PURE (le tirage est passé) : la règle
  // se vérifie directement, sans jouer une carrière — même méthode que pour la
  // touche et la mêlée.
  //
  // Cinq issues, comme dans une vraie négociation :
  //   accepte    — l'offre est au moins à hauteur
  //   contre     — proche, mais il renvoie ses conditions
  //   reflexion  — hésite, demande quelques jours (une seule fois)
  //   refuse     — trop bas
  //   rompt      — insultant, ou trop de refus : les discussions s'arrêtent
  function evaluerOffreContrat(exigence, offre, contexte) {
    const c = contexte || {};
    const salaire = Math.max(0, offre && offre.salaire ? offre.salaire : 0);
    // La prime compte, mais moins qu'un salaire pérenne : elle est ramenée à
    // son équivalent annuel sur la durée du contrat.
    const duree = Math.max(1, (offre && offre.duree) || 1);
    const prime = Math.max(0, (offre && offre.prime) || 0);
    const valeurAnnuelle = salaire + prime / duree;
    const ratio = valeurAnnuelle / Math.max(1, exigence);
    const refusPrecedents = c.refusPrecedents || 0;
    const aDejaReflechi = !!c.aDejaReflechi;
    // Deux refus et l'agent classe le dossier, quelle que soit l'offre : on ne
    // harcèle pas un joueur jusqu'à ce qu'un tirage passe. Une offre
    // insultante (moins de 55 % de l'exigence) suffit à elle seule.
    if (refusPrecedents >= REFUS_AVANT_RUPTURE || ratio < 0.55) {
      return { verdict: 'rompt', ratio, exigence };
    }
    if (ratio >= 1.02) return { verdict: 'accepte', ratio, exigence };
    if (ratio >= 0.90) return { verdict: 'contre', ratio, exigence };
    if (ratio >= 0.78 && !aDejaReflechi) return { verdict: 'reflexion', ratio, exigence };
    // Ce refus-ci est le DEUXIÈME : il met fin aux discussions. Sans cette
    // ligne, il fallait trois propositions pour atteindre la rupture alors que
    // la règle annoncée est « au-delà de deux refus » (mesuré en écrivant le
    // test : refusPrecedents valait 1 au deuxième passage, donc jamais 2).
    if (refusPrecedents >= REFUS_AVANT_RUPTURE - 1) {
      return { verdict: 'rompt', ratio, exigence };
    }
    return { verdict: 'refuse', ratio, exigence };
  }

  // Conditions que le joueur renvoie sur une contre-proposition : ce qu'il
  // exige vraiment, arrondi, avec la durée qu'il préfère.
  function contrePropositionDe(saison, joueur, offre) {
    const duree = Math.max(1, (offre && offre.duree) || 2);
    const exigence = exigenceSalariale(saison, joueur, { duree });
    // Il accepte de rogner un peu s'il obtient une prime.
    const prime = Math.round(exigence * 0.25);
    return { salaire: exigence, duree, prime };
  }

  // --- 3. Le cycle de négociation ----------------------------------------

  function negociations(saison) {
    if (!Array.isArray(saison.negociationsContrat)) saison.negociationsContrat = [];
    return saison.negociationsContrat;
  }

  function negociationDe(saison, joueurId) {
    return negociations(saison).find((n) => n.joueurId === joueurId) || null;
  }

  // Ouvre (ou relance) une négociation. Renvoie un refus explicite et motivé
  // plutôt qu'un échec silencieux — le manager doit savoir pourquoi.
  function ouvrirNegociation(saison, joueurId, offre) {
    const RMClub = global.RMClub;
    const c = clubJoueurDe(saison);
    const joueur = (c.effectif || []).find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    if (joueur.negociationRompue) return { ok: false, motif: 'rompue' };
    if (negociationDe(saison, joueurId)) return { ok: false, motif: 'deja_en_cours' };
    const o = offre || {};
    const duree = Math.max(1, Math.min(5, o.duree || 2));
    const salaire = Math.max(1, Math.round(o.salaire || salaireDeMarche(joueur)));
    const prime = Math.max(0, Math.round(o.prime || 0));
    const dateReponse = RMClub.ajouterJours(RMClub.dateCourante(saison), DELAI_REPONSE_JOURS);
    negociations(saison).push({
      joueurId, nom: joueur.nom,
      salaire, duree, prime,
      etape: 'attente',
      refus: joueur.refusContratSaison || 0,
      dateReponse: RMClub.dateISO(dateReponse),
    });
    return { ok: true, dateReponse, delai: DELAI_REPONSE_JOURS, salaire, duree, prime };
  }

  // Applique un contrat conclu : c'est le SEUL endroit qui écrit le contrat,
  // le salaire et la prime, pour que la masse salariale et le grand livre
  // soient toujours d'accord avec la fiche du joueur.
  function conclureContrat(saison, joueur, offre) {
    const RMClub = global.RMClub;
    joueur.contrat = Math.max(1, offre.duree || 1);
    joueur.salaire = Math.max(1, Math.round(offre.salaire));
    joueur.primeContrat = Math.max(0, Math.round(offre.prime || 0));
    joueur.moral = borneMoral((joueur.moral != null ? joueur.moral : 65) + 6);
    joueur.refusContratSaison = 0;
    joueur.negociationRompue = false;
    joueur.nonRenouvele = false;
    // La prime de signature est décaissée immédiatement, et tracée : c'est de
    // l'argent réel qui sort du club.
    if (joueur.primeContrat > 0 && RMClub.tresorerie) {
      RMClub.tresorerie(saison, 'salaires', `Prime de prolongation — ${joueur.nom}`, -joueur.primeContrat);
    }
    RMClub.ajouterMessage(saison, 'contrat', 'Contrat renouvelé',
      `${joueur.nom} prolonge (${joueur.contrat} saison(s), ${joueur.salaire} k€` +
      (joueur.primeContrat ? `, prime ${joueur.primeContrat} k€` : '') + ').');
    return joueur;
  }

  // Traite les négociations arrivées à échéance. Chaque étape produit un
  // message dans la boîte de réception ; une contre-proposition produit une
  // vraie DÉCISION (accepter / re-proposer / arrêter).
  function avancerNegociations(rng, saison, date) {
    const RMClub = global.RMClub;
    const liste = negociations(saison);
    if (!liste.length) return [];
    const c = clubJoueurDe(saison);
    const restantes = [];
    const reponses = [];
    for (const n of liste) {
      const echeance = RMClub.dateDepuisISO(n.dateReponse);
      if (!echeance || RMClub.comparerDates(date, echeance) < 0) { restantes.push(n); continue; }
      const joueur = (c.effectif || []).find((j) => j.id === n.joueurId);
      if (!joueur) continue; // parti du club : négociation caduque
      const exigence = exigenceSalariale(saison, joueur, { duree: n.duree });
      const res = evaluerOffreContrat(exigence,
        { salaire: n.salaire, duree: n.duree, prime: n.prime },
        { refusPrecedents: n.refus || 0, aDejaReflechi: !!n.aReflechi });
      if (res.verdict === 'accepte') {
        conclureContrat(saison, joueur, { salaire: n.salaire, duree: n.duree, prime: n.prime });
        reponses.push({ nom: joueur.nom, verdict: 'accepte', salaire: n.salaire });
        continue;
      }
      if (res.verdict === 'reflexion') {
        n.aReflechi = true;
        n.etape = 'reflexion';
        n.dateReponse = RMClub.dateISO(RMClub.ajouterJours(date, DELAI_REFLEXION_JOURS));
        RMClub.ajouterMessage(saison, 'contrat', 'Demande de réflexion',
          `${joueur.nom} ne dit pas non à ${n.salaire} k€/saison, mais veut y réfléchir. ` +
          `Son agent rappellera dans ${DELAI_REFLEXION_JOURS} jours.`);
        restantes.push(n);
        reponses.push({ nom: joueur.nom, verdict: 'reflexion' });
        continue;
      }
      if (res.verdict === 'contre') {
        const contre = contrePropositionDe(saison, joueur, n);
        n.etape = 'contre';
        RMClub.ajouterMessage(saison, 'contrat', 'Contre-proposition',
          `${joueur.nom} est prêt à rester, mais pas à ${n.salaire} k€/saison. ` +
          `Son agent demande ${contre.salaire} k€/saison sur ${contre.duree} saison(s), ` +
          `avec une prime de ${contre.prime} k€.`,
          {
            type: 'negociationContrat',
            joueurId: joueur.id, joueurNom: joueur.nom,
            salaire: contre.salaire, duree: contre.duree, prime: contre.prime,
            offrePrecedente: n.salaire,
            resolu: false,
            dateLimite: RMClub.dateISO(RMClub.ajouterJours(date, DELAI_REPONSE_JOURS + 2)),
            options: [
              { id: 'accepter', libelle: `Accepter ${contre.salaire} k€ + ${contre.prime} k€ de prime` },
              { id: 'compromis', libelle: `Proposer ${Math.round((n.salaire + contre.salaire) / 2)} k€ sans prime` },
              { id: 'ignorer', libelle: 'Arrêter les discussions' },
            ],
          });
        reponses.push({ nom: joueur.nom, verdict: 'contre', demande: contre.salaire });
        continue; // la négociation quitte la file : elle vit dans la décision
      }
      // Refus, ou rupture.
      joueur.refusContratSaison = (joueur.refusContratSaison || 0) + 1;
      joueur.moral = borneMoral((joueur.moral != null ? joueur.moral : 65) - (res.ratio < 0.7 ? 5 : 2));
      if (res.verdict === 'rompt') {
        joueur.negociationRompue = true;
        // Même titre qu'un refus simple : une rupture EST un refus, et
        // l'interface comme les tests existants s'appuient sur ce titre. Ce
        // qui change est dans le corps — et dans le fait qu'il n'y aura plus
        // de proposition possible cette saison.
        RMClub.ajouterMessage(saison, 'contrat', 'Proposition refusée',
          `${joueur.nom} décline ton offre de ${n.salaire} k€/saison et met fin aux ` +
          `discussions. Son agent estimait ses prétentions à ${exigence} k€/saison ; ` +
          `il n'y aura pas d'autre proposition cette saison.`);
        reponses.push({ nom: joueur.nom, verdict: 'rompt', exigence });
      } else {
        RMClub.ajouterMessage(saison, 'contrat', 'Proposition refusée',
          `${joueur.nom} décline ton offre de ${n.salaire} k€/saison. ` +
          `Son agent évoque plutôt ${exigence} k€/saison.`);
        reponses.push({ nom: joueur.nom, verdict: 'refuse', exigence });
      }
    }
    saison.negociationsContrat = restantes;
    return reponses;
  }

  // Suite d'une contre-proposition, depuis la boîte de réception.
  function appliquerDecisionNegociation(saison, decision, optionId) {
    const RMClub = global.RMClub;
    const c = clubJoueurDe(saison);
    const joueur = (c.effectif || []).find((j) => j.id === decision.joueurId);
    if (!joueur) return "Ce joueur n'est plus au club.";
    if (optionId === 'accepter') {
      conclureContrat(saison, joueur,
        { salaire: decision.salaire, duree: decision.duree, prime: decision.prime });
      return `${joueur.nom} prolonge : ${decision.salaire} k€/saison sur ${decision.duree} saison(s), ` +
        `prime de ${decision.prime} k€.`;
    }
    if (optionId === 'compromis') {
      const montant = Math.round((decision.offrePrecedente + decision.salaire) / 2);
      const res = ouvrirNegociation(saison, joueur.id,
        { salaire: montant, duree: decision.duree, prime: 0 });
      if (!res.ok) return `Impossible de relancer la discussion (${res.motif}).`;
      return `Tu reviens à ${montant} k€/saison sans prime. Réponse dans ${res.delai} jours.`;
    }
    // Arrêt des discussions.
    joueur.negociationRompue = true;
    joueur.moral = borneMoral((joueur.moral != null ? joueur.moral : 65) - 6);
    return `Tu arrêtes les discussions avec ${joueur.nom}. Il ira au bout de son contrat.`;
  }

  // --- 4. Ne pas renouveler, rompre --------------------------------------

  // Le manager annonce qu'il ne prolongera pas : le joueur partira libre à la
  // fin de son contrat. Réversible tant que le contrat court.
  function basculerNonRenouvellement(saison, joueurId) {
    const c = clubJoueurDe(saison);
    const joueur = (c.effectif || []).find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    if (joueur.nonRenouvele) {
      delete joueur.nonRenouvele;
      return { ok: true, nonRenouvele: false, joueur };
    }
    joueur.nonRenouvele = true;
    joueur.moral = borneMoral((joueur.moral != null ? joueur.moral : 65) - 8);
    global.RMClub.ajouterMessage(saison, 'contrat', 'Contrat non renouvelé',
      `Tu as informé ${joueur.nom} qu'il ne serait pas prolongé. Il quittera le club ` +
      `librement à la fin de son contrat.`);
    return { ok: true, nonRenouvele: true, joueur };
  }

  // Indemnité due pour rompre un contrat en cours : le reste dû, ramené à une
  // part négociée. On ne se sépare pas d'un joueur sous contrat sans payer.
  function indemniteRupture(joueur) {
    if (!joueur) return 0;
    const restant = Math.max(0, joueur.contrat || 0);
    return Math.max(1, Math.round((joueur.salaire || 0) * restant * PART_INDEMNITE_RUPTURE));
  }

  function rompreContrat(saison, joueurId) {
    const RMClub = global.RMClub;
    const c = clubJoueurDe(saison);
    const joueur = (c.effectif || []).find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const indemnite = indemniteRupture(joueur);
    if ((c.budget || 0) < indemnite) {
      return { ok: false, motif: 'budget', indemnite, manque: indemnite - (c.budget || 0) };
    }
    // Un effectif ne peut pas tomber sous le minimum réglementaire d'un poste.
    const memePoste = (c.effectif || []).filter((j) => j.poste === joueur.poste).length;
    if (memePoste <= 1) return { ok: false, motif: 'dernierAuPoste' };
    RMClub.tresorerie(saison, 'salaires', `Indemnité de rupture — ${joueur.nom}`, -indemnite);
    c.effectif = (c.effectif || []).filter((j) => j.id !== joueurId);
    detacherDuClub(c, joueurId);
    // Le vestiaire regarde : rompre le contrat d'un joueur n'est jamais neutre.
    for (const j of c.effectif) {
      j.moral = borneMoral((j.moral != null ? j.moral : 65) - 2);
    }
    // La DIRECTION regarde aussi : payer pour se séparer d'un joueur sous
    // contrat est un aveu d'erreur de gestion. La sanction est proportionnée à
    // ce que ça coûte — une rupture anodine (fin de contrat proche, petit
    // salaire) ne l'émeut pas.
    let confiancePerdue = 0;
    if (indemnite >= SEUIL_RUPTURE_NOTABLE) {
      const avant = c.confiancePresident != null ? c.confiancePresident : 60;
      confiancePerdue = Math.max(1, Math.min(8, Math.round(indemnite / 25)));
      c.confiancePresident = Math.max(0, avant - confiancePerdue);
    }
    RMClub.ajouterMessage(saison, 'contrat', 'Contrat rompu',
      `${joueur.nom} quitte le club. Indemnité de rupture : ${indemnite} k€. ` +
      `Le vestiaire a pris note.` +
      (confiancePerdue
        ? ` La direction n'apprécie pas de payer pour un joueur qui ne joue plus ` +
          `(confiance ${c.confiancePresident} %, ${-confiancePerdue}).`
        : ''));
    return { ok: true, indemnite, joueur, confiancePerdue };
  }

  // --- 5. Offres SORTANTES : acheter le joueur d'un club adverse ---------

  // Joueurs réellement recrutables chez les adversaires : ceux de leur groupe,
  // avec le prix qu'il faudrait mettre. Rien d'inventé — le groupe est celui
  // que le moteur utilise pour composer leurs équipes.
  function joueursDesClubsAdverses(saison, options) {
    const RMClub = global.RMClub;
    const o = options || {};
    const lignes = [];
    for (const club of saison.adversaires || []) {
      const groupe = club.groupe || club.effectif || [];
      for (const j of groupe) {
        if (!j || !j.id) continue;
        if (o.poste && j.poste !== o.poste) continue;
        const valeur = RMClub.estimerValeurTransfert
          ? RMClub.estimerValeurTransfert(j.vitesse, j.plaquage, j.age) : 0;
        lignes.push({
          joueurId: j.id, nom: j.nom, poste: j.poste, age: j.age,
          vitesse: j.vitesse, plaquage: j.plaquage,
          salaire: j.salaire, contrat: j.contrat,
          clubId: club.id, clubNom: club.nom,
          prixDemande: Math.max(1, Math.round(valeur * SURCOTE_VENDEUR)),
        });
      }
    }
    lignes.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
    return o.limite ? lignes.slice(0, o.limite) : lignes;
  }

  function offresSortantes(saison) {
    if (!Array.isArray(saison.offresSortantes)) saison.offresSortantes = [];
    return saison.offresSortantes;
  }

  // Proposer un montant à un club adverse pour un de ses joueurs. Refus
  // EXPLICITE et motivé si l'opération est impossible — jamais un bouton
  // inerte.
  function proposerOffreTransfert(saison, clubId, joueurId, montant) {
    const RMClub = global.RMClub;
    const c = clubJoueurDe(saison);
    const club = (saison.adversaires || []).find((a) => a.id === clubId);
    if (!club) return { ok: false, motif: 'clubInconnu' };
    const groupe = club.groupe || club.effectif || [];
    const joueur = groupe.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    if (RMClub.etatFenetreTransfert) {
      const fenetre = RMClub.etatFenetreTransfert(saison, RMClub.dateCourante(saison));
      if (fenetre && fenetre.ouverte === false) return { ok: false, motif: 'fenetreFermee' };
    }
    if (offresSortantes(saison).some((o) => o.joueurId === joueurId)) {
      return { ok: false, motif: 'deja_en_cours' };
    }
    const prix = Math.max(1, Math.round(montant || 0));
    // Budget : on VÉRIFIE avant, et on dit combien il manque.
    if ((c.budget || 0) < prix) {
      return { ok: false, motif: 'budget', prix, manque: prix - (c.budget || 0) };
    }
    const valeur = RMClub.estimerValeurTransfert
      ? RMClub.estimerValeurTransfert(joueur.vitesse, joueur.plaquage, joueur.age) : prix;
    const attendu = Math.max(1, Math.round(valeur * SURCOTE_VENDEUR));
    const dateReponse = RMClub.ajouterJours(RMClub.dateCourante(saison), DELAI_REPONSE_TRANSFERT_JOURS);
    offresSortantes(saison).push({
      joueurId, joueurNom: joueur.nom, poste: joueur.poste,
      clubId, clubNom: club.nom,
      montant: prix, attendu,
      dateReponse: RMClub.dateISO(dateReponse),
    });
    RMClub.ajouterMessage(saison, 'transfert', 'Offre transmise',
      `Tu proposes ${prix} k€ à ${club.nom} pour ${joueur.nom} (${joueur.poste}, ${joueur.age} ans). ` +
      `Réponse attendue sous ${DELAI_REPONSE_TRANSFERT_JOURS} jours.`);
    return { ok: true, prix, attendu, dateReponse };
  }

  // Réponse du club vendeur. Il accepte au-dessus de son prix, contre-propose
  // juste en dessous, refuse plus bas — et il tient compte du fait qu'il ait
  // besoin ou non de ce joueur.
  function decisionVendeur(saison, club, joueur, montant, attendu) {
    const RMClub = global.RMClub;
    const besoins = (RMClub.besoinsDe && RMClub.besoinsDe(saison, club)) || [];
    const indispensable = besoins.some((b) => b.poste === joueur.poste);
    const seuil = attendu * (indispensable ? 1.35 : 1);
    if (montant >= seuil) return { verdict: 'accepte' };
    if (montant >= seuil * 0.8) return { verdict: 'contre', attendu: Math.round(seuil) };
    return { verdict: 'refuse', attendu: Math.round(seuil) };
  }

  // Le transfert lui-même : l'argent et les deux effectifs changent VRAIMENT
  // de main, dans les deux sens.
  function finaliserAchat(saison, offre) {
    const RMClub = global.RMClub;
    const c = clubJoueurDe(saison);
    const club = (saison.adversaires || []).find((a) => a.id === offre.clubId);
    if (!club) return { ok: false, motif: 'clubInconnu' };
    const groupe = club.groupe || club.effectif || [];
    const joueur = groupe.find((j) => j.id === offre.joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const prix = Math.round(offre.montant);
    if ((c.budget || 0) < prix) {
      return { ok: false, motif: 'budget', manque: prix - (c.budget || 0) };
    }
    RMClub.tresorerie(saison, 'transfertAchat', `Transfert — ${joueur.nom}`, -prix);
    club.budget = (club.budget || 0) + prix;
    club.groupe = groupe.filter((j) => j.id !== joueur.id);
    club.effectif = (club.effectif || []).filter((j) => j.id !== joueur.id);
    // Le joueur arrive avec une fiche de club, pas une fiche d'adversaire :
    // les compteurs de saison repartent à zéro, comme pour toute recrue.
    const recrue = Object.assign({}, joueur, {
      fatigue: 0, matchsJoues: 0, statsSaison: null, attributsDebutSaison: null,
      surListeTransfert: false, veutPartir: false, statutPromis: null,
      negociationRompue: false, nonRenouvele: false, refusContratSaison: 0,
      contrat: Math.max(1, joueur.contrat || 2),
      salaire: joueur.salaire != null ? joueur.salaire : salaireDeMarche(joueur),
    });
    c.effectif = (c.effectif || []).concat([recrue]);
    RMClub.ajouterMessage(saison, 'transfert', 'Transfert conclu',
      `${recrue.nom} (${recrue.poste}, ${recrue.age} ans) rejoint le club pour ${prix} k€. ` +
      `Salaire ${recrue.salaire} k€/saison, contrat ${recrue.contrat} saison(s).`);
    return { ok: true, prix, joueur: recrue, vendeur: club };
  }

  // Traite les offres sortantes arrivées à échéance.
  function avancerOffresSortantes(saison, date) {
    const RMClub = global.RMClub;
    const liste = offresSortantes(saison);
    if (!liste.length) return [];
    const restantes = [];
    const reponses = [];
    for (const o of liste) {
      const echeance = RMClub.dateDepuisISO(o.dateReponse);
      if (!echeance || RMClub.comparerDates(date, echeance) < 0) { restantes.push(o); continue; }
      const club = (saison.adversaires || []).find((a) => a.id === o.clubId);
      const groupe = club ? (club.groupe || club.effectif || []) : [];
      const joueur = groupe.find((j) => j.id === o.joueurId);
      if (!club || !joueur) {
        RMClub.ajouterMessage(saison, 'transfert', 'Offre caduque',
          `${o.joueurNom} n'est plus disponible. Ton offre est annulée.`);
        reponses.push({ joueurNom: o.joueurNom, verdict: 'caduque' });
        continue;
      }
      const d = decisionVendeur(saison, club, joueur, o.montant, o.attendu);
      if (d.verdict === 'accepte') {
        const res = finaliserAchat(saison, o);
        if (!res.ok) {
          RMClub.ajouterMessage(saison, 'transfert', 'Transfert annulé',
            `${club.nom} acceptait ${o.montant} k€ pour ${o.joueurNom}, mais l'opération ` +
            `n'a pas pu se faire (${res.motif === 'budget' ? `il te manque ${res.manque} k€` : res.motif}).`);
          reponses.push({ joueurNom: o.joueurNom, verdict: 'echec', motif: res.motif });
          continue;
        }
        reponses.push({ joueurNom: o.joueurNom, verdict: 'accepte', prix: res.prix });
        continue;
      }
      if (d.verdict === 'contre') {
        RMClub.ajouterMessage(saison, 'transfert', 'Contre-proposition du club',
          `${club.nom} refuse ${o.montant} k€ pour ${o.joueurNom} mais accepterait ${d.attendu} k€.`,
          {
            type: 'offreSortante',
            joueurId: o.joueurId, clubId: o.clubId,
            joueurNom: o.joueurNom, clubNom: club.nom,
            montant: d.attendu, montantPrecedent: o.montant,
            resolu: false,
            dateLimite: RMClub.dateISO(RMClub.ajouterJours(date, DELAI_REPONSE_TRANSFERT_JOURS)),
            options: [
              { id: 'accepter', libelle: `Payer ${d.attendu} k€` },
              { id: 'ignorer', libelle: 'Renoncer' },
            ],
          });
        reponses.push({ joueurNom: o.joueurNom, verdict: 'contre', attendu: d.attendu });
        continue;
      }
      RMClub.ajouterMessage(saison, 'transfert', 'Offre refusée',
        `${club.nom} refuse ton offre de ${o.montant} k€ pour ${o.joueurNom}. ` +
        `Il n'en veut pas moins de ${d.attendu} k€.`);
      reponses.push({ joueurNom: o.joueurNom, verdict: 'refuse', attendu: d.attendu });
    }
    saison.offresSortantes = restantes;
    return reponses;
  }

  function appliquerDecisionOffreSortante(saison, decision, optionId) {
    if (optionId !== 'accepter') {
      return `Tu renonces à recruter ${decision.joueurNom}.`;
    }
    const res = finaliserAchat(saison,
      { clubId: decision.clubId, joueurId: decision.joueurId, montant: decision.montant });
    if (!res.ok) {
      return res.motif === 'budget'
        ? `Impossible : il te manque ${res.manque} k€ pour payer ${decision.montant} k€.`
        : `L'opération n'a pas pu se faire (${res.motif}).`;
    }
    return `${res.joueur.nom} rejoint le club pour ${res.prix} k€.`;
  }

  // --- 6. Les clubs IA gèrent leurs contrats ------------------------------

  // À l'intersaison, un club IA prolonge les joueurs dont il a besoin, dans la
  // limite de ses moyens. Sans ça, il perdait chaque année tous ses joueurs en
  // fin de contrat sans jamais réagir.
  function prolongationsClubIA(rng, saison, club) {
    const RMClub = global.RMClub;
    const groupe = club.groupe || club.effectif || [];
    const enFin = groupe.filter((j) => (j.contrat || 0) <= 1);
    if (!enFin.length) return [];
    // Il garde en priorité ses meilleurs éléments à chaque poste.
    const parPoste = {};
    for (const j of groupe) (parPoste[j.poste] = parPoste[j.poste] || []).push(j);
    for (const poste of Object.keys(parPoste)) {
      parPoste[poste].sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
    }
    const prolonges = [];
    for (const j of enFin) {
      const rang = parPoste[j.poste].indexOf(j);
      // Un titulaire est prolongé presque à coup sûr, un troisième couteau
      // rarement, un joueur de 34 ans jamais.
      const proba = j.age >= 34 ? 0 : rang === 0 ? 0.85 : rang === 1 ? 0.55 : 0.2;
      if (rng() >= proba) continue;
      const duree = j.age >= 31 ? 1 : j.age >= 28 ? 2 : 3;
      const salaire = RMClub.calculerSalaire(j.vitesse, j.plaquage, j.age);
      // Il ne prolonge que ce qu'il peut payer.
      if ((club.budget || 0) < salaire) continue;
      j.contrat = Math.max(j.contrat || 0, duree);
      j.salaire = salaire;
      prolonges.push({ nom: j.nom, poste: j.poste, duree, salaire });
    }
    return prolonges;
  }

  function prolongationsClubsIA(rng, saison) {
    const tout = [];
    for (const club of saison.adversaires || []) {
      const p = prolongationsClubIA(rng, saison, club);
      if (p.length) tout.push({ clubId: club.id, clubNom: club.nom, prolonges: p });
    }
    return tout;
  }

  // --- 7. La vue d'écran --------------------------------------------------

  const VOLONTES = {
    souhaite: { libelle: 'Veut prolonger', icone: '💚' },
    ouvert: { libelle: 'Ouvert', icone: '🟡' },
    reticent: { libelle: 'Réticent', icone: '🟠' },
    refuse: { libelle: 'Veut partir', icone: '🔴' },
    inconnu: { libelle: 'Inconnu', icone: '—' },
  };

  // Tout ce que l'écran Contrats affiche, assemblé UNE fois : chaque valeur
  // vient de l'état réel du joueur, jamais d'un calcul d'affichage.
  function dossierContrats(saison) {
    const RMClub = global.RMClub;
    const c = clubJoueurDe(saison);
    const effectif = (c && c.effectif) || [];
    const lignes = effectif.map((j) => {
      const volonte = volonteProlonger(saison, j);
      const nego = negociationDe(saison, j.id);
      return {
        id: j.id, nom: j.nom, poste: j.poste, age: j.age,
        niveau: Math.round(((j.vitesse || 0) + (j.plaquage || 0)) / 2),
        potentiel: j.potentiel != null ? Math.round(j.potentiel) : null,
        statut: j.statutPromis || null,
        salaire: j.salaire != null ? j.salaire : 0,
        prime: j.primeContrat || 0,
        valeur: RMClub.valeurMarchande ? RMClub.valeurMarchande(saison, j) : 0,
        contrat: j.contrat != null ? j.contrat : 0,
        saisonFin: saisonFinContrat(saison, j),
        expire: (j.contrat || 0) <= 1,
        moral: j.moral != null ? j.moral : 65,
        satisfaction: satisfactionContrat(saison, j),
        volonte, volonteLibelle: VOLONTES[volonte].libelle, volonteIcone: VOLONTES[volonte].icone,
        interet: interetExterieur(saison, j),
        exigence: exigenceSalariale(saison, j, { duree: 2 }),
        negociationEnCours: nego ? { salaire: nego.salaire, duree: nego.duree, etape: nego.etape } : null,
        rompue: !!j.negociationRompue,
        nonRenouvele: !!j.nonRenouvele,
        surListeTransfert: !!j.surListeTransfert,
        veutPartir: !!j.veutPartir,
        indemniteRupture: indemniteRupture(j),
      };
    });
    const masse = lignes.reduce((s, l) => s + l.salaire, 0);
    return {
      lignes,
      masseSalariale: masse,
      expirants: lignes.filter((l) => l.expire).length,
      aRisque: lignes.filter((l) => l.expire && (l.volonte === 'refuse' || l.volonte === 'reticent')).length,
      negociationsEnCours: negociations(saison).length,
      offresSortantes: offresSortantes(saison).length,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    DELAI_REPONSE_JOURS, DELAI_REFLEXION_JOURS, REFUS_AVANT_RUPTURE,
    DELAI_REPONSE_TRANSFERT_JOURS, SURCOTE_VENDEUR, PART_INDEMNITE_RUPTURE,
    SEUIL_RUPTURE_NOTABLE,
    CANAL_NEGOCIATIONS, VOLONTES,
    saisonFinContrat, salaireDeMarche, interetExterieur, satisfactionContrat,
    volonteProlonger, exigenceSalariale, evaluerOffreContrat, contrePropositionDe,
    negociationDe, ouvrirNegociation, conclureContrat, avancerNegociations,
    appliquerDecisionNegociation,
    basculerNonRenouvellement, indemniteRupture, rompreContrat,
    joueursDesClubsAdverses, proposerOffreTransfert, decisionVendeur,
    finaliserAchat, avancerOffresSortantes, appliquerDecisionOffreSortante,
    prolongationsClubIA, prolongationsClubsIA,
    dossierContrats,
  });
})(window);
