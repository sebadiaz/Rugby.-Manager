// Vendre un joueur (Mode Club).
//
// Ce qui existait avant ce fichier : rien. Le club pouvait ACHETER
// (signerJoueur sur le marché, approcherJoueurAdverse sur un club rival) mais
// jamais VENDRE. La seule sortie était `libererJoueur` — mesuré : budget
// 439 -> 439, gain 0 k€. Le grand livre (P1-47) déclarait même une catégorie
// « Ventes de joueurs » sans aucun producteur.
//
// Ce que ça coûtait au joueur :
//   - la direction impose un plancher de trésorerie (P1-46) et le seul levier
//     pour rentrer de l'argent était la billetterie ;
//   - les statuts promis (P1-45) produisent des joueurs qui demandent leur
//     transfert, et la seule issue était de les lâcher pour rien ;
//   - arbitrer entre garder un cadre et encaisser son prix, c'est la moitié
//     du travail d'un manager. Ce levier n'existait pas.
//
// Deux moitiés, symétriques de l'achat :
//   1. le manager met un joueur sur la LISTE DES TRANSFERTS — un signal
//      envoyé au marché, qui fait baisser le prix (tout le monde sait qu'il
//      est vendeur) mais multiplie les offres ;
//   2. des clubs qui ont RÉELLEMENT le budget et RÉELLEMENT le besoin
//      viennent faire une offre, qui arrive comme une vraie décision.
//
// Aucun acheteur fabriqué : le club est pris dans `saison.adversaires`, son
// budget est vérifié, et son besoin vient de `besoinsDe` (club-mercato.js).
(function (global) {
  'use strict';

  // Échelle de prix : la MÊME que le marché des joueurs libres, où
  // `prixTransfert = estimerValeurTransfert(...)` sans aucun multiplicateur
  // (club-transferts.js). Vendre plus cher que ce qu'un joueur équivalent
  // coûte en accès libre n'aurait aucun sens : personne n'achèterait.
  //
  // Mesuré avec un coefficient de 1,5 : sur trois carrières, le club IA le
  // PLUS RICHE ne pouvait s'offrir que 0 à 1 joueur sur 24. La vente aurait
  // été une fonctionnalité morte au palier de départ.
  const COEFFICIENT_VENTE = 1;
  // Un club adverse peut engager une grosse part de sa trésorerie pour UNE
  // occasion — comme le manager, qui dépense couramment tout son budget sur
  // une signature du marché. C'est un évènement, pas son mercato de routine
  // (celui-ci reste plafonné à PART_BUDGET_MAX_MERCATO, 35 %).
  const PART_BUDGET_ACHETEUR = 0.85;
  // Un joueur qu'on a mis sur la liste, ou qui réclame son départ, se négocie
  // moins cher : la position de force a changé de camp.
  const RABAIS_SUR_LISTE = 0.85;
  const RABAIS_VEUT_PARTIR = 0.8;
  // Contre-proposition du manager, en une fois : « pas à ce prix-là ».
  const SURCOTE_EXIGENCE = 1.4;
  // Délai de réponse, identique aux autres décisions.
  const DELAI_REPONSE_OFFRE_JOURS = 7;
  // Probabilité qu'un club vienne spontanément, un jour donné, pour UN joueur
  // donné. Faible : une offre doit rester un évènement.
  const PROBA_OFFRE_SUR_LISTE = 0.06;
  const PROBA_OFFRE_SPONTANEE = 0.006;
  // Une seule offre en attente par joueur, et pas d'avalanche.
  const OFFRES_MAX_EN_ATTENTE = 3;
  // Vendre un joueur à qui on avait promis un rôle de cadre se paie dans le
  // vestiaire : la parole du manager vaut pour tout le monde.
  const MORAL_VESTIAIRE_CADRE_VENDU = -4;
  const MORAL_REFUS_JOUEUR_MECONTENT = -10;
  // Canal de tirage DÉDIÉ (cf. grainePourJour) : consommer le flux quotidien
  // partagé décalerait toute la séquence en aval et casserait des tests de
  // déterminisme existants.
  const CANAL_VENTES = 37;

  function borneMoral(v) { return Math.max(0, Math.min(100, Math.round(v))); }

  // Un club peut-il réellement payer ce prix ? Une seule règle, partagée par
  // l'offre spontanée, l'enregistrement et la vente — sinon une offre
  // pourrait naître puis devenir impayable au moment de l'accepter.
  function peutPayer(club, prix) {
    return (club.budget || 0) * PART_BUDGET_ACHETEUR >= prix;
  }

  // Valeur marchande d'UN de mes joueurs. Repose sur estimerValeurTransfert
  // (club.js), la même base que le marché et que les clubs adverses — jamais
  // une seconde échelle de prix qui divergerait.
  function valeurMarchande(saison, joueur) {
    const RMClub = global.RMClub;
    if (!joueur) return 0;
    const base = RMClub.estimerValeurTransfert(joueur.vitesse, joueur.plaquage, joueur.age);
    const effectif = (saison.clubJoueur && saison.clubJoueur.effectif) || [];
    const niveauJoueur = (joueur.vitesse + joueur.plaquage) / 2;
    const niveauMoyen = effectif.length
      ? effectif.reduce((s, j) => s + (j.vitesse + j.plaquage) / 2, 0) / effectif.length
      : niveauJoueur;
    const primeCle = Math.max(1, 1 + (niveauJoueur - niveauMoyen) / 35);
    let prix = base * COEFFICIENT_VENTE * primeCle;
    if (joueur.surListeTransfert) prix *= RABAIS_SUR_LISTE;
    if (joueur.veutPartir) prix *= RABAIS_VEUT_PARTIR;
    return Math.max(1, Math.round(prix));
  }

  // Un joueur est-il cessible ? Mêmes garde-fous que libererJoueur, plus le
  // prêt : on ne vend pas un joueur qui est physiquement ailleurs.
  function motifIncessible(saison, joueur) {
    const effectif = saison.clubJoueur.effectif || [];
    if (!joueur) return 'introuvable';
    if (joueur.pret) return 'pret';
    if (effectif.filter((j) => j.poste === joueur.poste).length <= 1) return 'dernier_du_poste';
    return null;
  }

  function joueursCessibles(saison) {
    return (saison.clubJoueur.effectif || []).filter((j) => !motifIncessible(saison, j));
  }

  // --- Liste des transferts : le levier du manager -------------------------
  function basculerListeTransfert(saison, joueurId) {
    const j = (saison.clubJoueur.effectif || []).find((x) => x.id === joueurId);
    if (!j) return { ok: false, motif: 'introuvable', surListe: false };
    if (j.surListeTransfert) { delete j.surListeTransfert; return { ok: true, surListe: false, joueur: j }; }
    j.surListeTransfert = true;
    return { ok: true, surListe: true, joueur: j };
  }

  // --- La vente elle-même --------------------------------------------------
  // Débranchée de l'offre : c'est elle qui fait le travail, l'offre n'est
  // qu'une façon d'y arriver. Vérifie TOUT (cessibilité, budget de
  // l'acheteur), encaisse via le grand livre, et fait rejoindre le joueur à
  // son nouveau club — il ne s'évapore pas.
  function vendreJoueur(saison, joueurId, clubAcheteurId, montant) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const joueur = (c.effectif || []).find((x) => x.id === joueurId);
    const motif = motifIncessible(saison, joueur);
    if (motif) return { ok: false, motif };
    const acheteur = (saison.adversaires || []).find((a) => a.id === clubAcheteurId);
    if (!acheteur) return { ok: false, motif: 'clubInconnu' };
    const prix = Math.max(0, Math.round(montant || 0));
    if (!peutPayer(acheteur, prix)) return { ok: false, motif: 'budgetAcheteur' };

    // Le club acheteur paie RÉELLEMENT : son budget baisse, ce n'est pas de
    // l'argent créé pour l'occasion.
    acheteur.budget = (acheteur.budget || 0) - prix;
    RMClub.tresorerie(saison, 'transfertVente',
      `Vente de ${joueur.nom} (${joueur.poste}) à ${acheteur.nom}`, prix);

    c.effectif = (c.effectif || []).filter((x) => x.id !== joueurId);
    // Mêmes nettoyages que libererJoueur : sinon la composition ou la config
    // moteur pointerait vers un id qui n'existe plus.
    if (c.capitaineId === joueurId) c.capitaineId = null;
    if (c.buteurId === joueurId) c.buteurId = null;
    if (c.lanceurToucheId === joueurId) c.lanceurToucheId = null;
    for (const compo of [c.compositionTitulaires, c.compositionBanc]) {
      if (!compo) continue;
      for (const numero of Object.keys(compo)) {
        if (compo[numero] === joueurId) delete compo[numero];
      }
    }
    // Il rejoint son nouveau club pour de bon : le manager pourra le
    // retrouver en face, et tenter de le racheter.
    const groupe = acheteur.groupe || acheteur.effectif || [];
    groupe.push(Object.assign({}, joueur, {
      fatigue: 0, matchsJoues: 0, statsSaison: null,
      surListeTransfert: false, veutPartir: false, statutPromis: null,
    }));
    acheteur.groupe = groupe;

    // Un cadre vendu, c'est une promesse qui saute devant tout le vestiaire.
    if (joueur.statutPromis === 'cadre') {
      for (const autre of c.effectif) {
        autre.moral = borneMoral((autre.moral != null ? autre.moral : 65) + MORAL_VESTIAIRE_CADRE_VENDU);
      }
    }
    // Toute offre encore en attente sur ce joueur n'a plus d'objet.
    for (const m of c.messages || []) {
      if (m.decision && m.decision.type === 'offreAchat'
        && m.decision.joueurId === joueurId && !m.decision.resolu) {
        m.decision.resolu = true;
        m.decision.resultat = m.decision.resultat || `${joueur.nom} a déjà été vendu.`;
      }
    }
    return { ok: true, prix, joueur, acheteur, cadreVendu: joueur.statutPromis === 'cadre' };
  }

  // --- Offres reçues -------------------------------------------------------
  function offresEnAttente(saison) {
    return (saison.clubJoueur.messages || [])
      .filter((m) => m.decision && m.decision.type === 'offreAchat' && !m.decision.resolu);
  }

  // Enregistre une offre et la présente au manager. `tirageContre` est
  // PRÉ-TIRÉ ici : la réponse du club à une contre-proposition doit être
  // décidée au moment où l'offre naît, pas au moment où le manager clique —
  // sinon la même partie donnerait deux résultats selon le moment du clic.
  function enregistrerOffreAchat(saison, { joueurId, clubId, montant, tirageContre }) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const joueur = (c.effectif || []).find((x) => x.id === joueurId);
    const motif = motifIncessible(saison, joueur);
    if (motif) return { ok: false, motif };
    const club = (saison.adversaires || []).find((a) => a.id === clubId);
    if (!club) return { ok: false, motif: 'clubInconnu' };
    const prix = Math.max(1, Math.round(montant || 0));
    if (!peutPayer(club, prix)) return { ok: false, motif: 'budgetAcheteur' };
    if (offresEnAttente(saison).some((m) => m.decision.joueurId === joueurId)) {
      return { ok: false, motif: 'dejaEnAttente' };
    }
    const montantExige = Math.round(prix * SURCOTE_EXIGENCE);
    // Le club acceptera-t-il de payer plus ? Il faut qu'il ait les moyens ET
    // l'envie. L'envie est d'autant plus forte que le joueur lui manque.
    const besoins = RMClub.besoinsDe ? RMClub.besoinsDe(saison, club) : [];
    const manqueAuPoste = besoins.some((b) => b.poste === joueur.poste);
    const probaAccepteContre = peutPayer(club, montantExige)
      ? (manqueAuPoste ? 0.6 : 0.3) : 0;
    const tirage = tirageContre != null ? tirageContre : 0.5;
    const echeance = RMClub.ajouterJours(RMClub.dateCourante(saison), DELAI_REPONSE_OFFRE_JOURS);
    const valeur = valeurMarchande(saison, joueur);
    RMClub.ajouterMessage(saison, 'transfert', 'Offre reçue',
      `${club.nom} propose ${prix} k€ pour ${joueur.nom} (${joueur.poste}, ${joueur.age} ans). ` +
      `Tes recruteurs estiment sa valeur à ${valeur} k€.` +
      (joueur.veutPartir ? ` Il a lui-même demandé son transfert.` : '') +
      (joueur.surListeTransfert ? ` Il figure sur ta liste des transferts.` : ''),
      {
        type: 'offreAchat',
        joueurId, clubId,
        joueurNom: joueur.nom, clubNom: club.nom,
        montant: prix, montantExige,
        contrePropositionAcceptee: tirage < probaAccepteContre,
        resolu: false,
        dateLimite: RMClub.dateISO(echeance),
        options: [
          { id: 'accepter', libelle: `Accepter ${prix} k€` },
          { id: 'exiger', libelle: `Exiger ${montantExige} k€` },
          { id: 'refuser', libelle: 'Refuser' },
        ],
      });
    return { ok: true, montant: prix, montantExige };
  }

  // Conséquence RÉELLE d'une décision d'offre (appelée par
  // resoudreDecisionMessage, cf. club-decisions.js).
  function appliquerDecisionOffre(saison, decision, optionId) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const joueur = (c.effectif || []).find((x) => x.id === decision.joueurId);
    if (!joueur) return 'Ce joueur n\'est plus au club.';
    if (optionId === 'accepter' || (optionId === 'exiger' && decision.contrePropositionAcceptee)) {
      const prix = optionId === 'exiger' ? decision.montantExige : decision.montant;
      const res = vendreJoueur(saison, decision.joueurId, decision.clubId, prix);
      if (!res.ok) return `La vente n'a pas pu se faire (${res.motif}).`;
      RMClub.ajouterMessage(saison, 'transfert', 'Transfert conclu',
        `${res.joueur.nom} rejoint ${res.acheteur.nom} pour ${res.prix} k€.`);
      return `${res.joueur.nom} part à ${res.acheteur.nom} pour ${res.prix} k€.` +
        (optionId === 'exiger' ? ' Ton exigence a payé.' : '') +
        (res.cadreVendu ? ' Le vestiaire encaisse mal le départ d\'un cadre.' : '');
    }
    if (optionId === 'exiger') {
      return `${decision.clubNom} refuse de monter à ${decision.montantExige} k€ et retire son offre. ` +
        `${joueur.nom} reste au club.`;
    }
    // Refus pur et simple.
    if (joueur.veutPartir) {
      joueur.moral = borneMoral((joueur.moral != null ? joueur.moral : 65) + MORAL_REFUS_JOUEUR_MECONTENT);
      return `Tu refuses l'offre de ${decision.clubNom}. ${joueur.nom} voulait partir : il le prend très mal.`;
    }
    return `Tu refuses l'offre de ${decision.clubNom} pour ${joueur.nom}.`;
  }

  // --- Boucle quotidienne --------------------------------------------------
  // Un club adverse peut venir, chaque jour, sur un joueur qui l'intéresse.
  // Tout est vérifié contre l'état réel : fenêtre de transfert ouverte, club
  // qui a le budget, besoin réel au poste.
  function avancerJourVentes(saison, date) {
    const RMClub = global.RMClub;
    const c = saison && saison.clubJoueur;
    if (!c) return null;
    const fenetre = RMClub.etatFenetreTransfert ? RMClub.etatFenetreTransfert(saison) : { ouverte: true };
    if (!fenetre.ouverte) return null;
    if (offresEnAttente(saison).length >= OFFRES_MAX_EN_ATTENTE) return null;
    const graine = Number.isFinite(saison.graine) ? saison.graine : 1;
    const rng = global.RugbyEngine.creerRng(RMClub.grainePourJour(graine, date, CANAL_VENTES));
    const cessibles = joueursCessibles(saison);
    if (!cessibles.length) return null;
    const clubs = (saison.adversaires || []).filter((a) => (a.budget || 0) > 0);
    if (!clubs.length) return null;

    for (const joueur of cessibles) {
      const proba = joueur.surListeTransfert ? PROBA_OFFRE_SUR_LISTE : PROBA_OFFRE_SPONTANEE;
      if (rng() >= proba) continue;
      const prix = valeurMarchande(saison, joueur);
      // Acheteurs possibles : ceux qui ont les moyens ET un besoin au poste.
      const candidats = clubs.filter((club) => {
        if (!peutPayer(club, prix)) return false;
        const besoins = RMClub.besoinsDe ? RMClub.besoinsDe(saison, club) : [];
        return besoins.some((b) => b.poste === joueur.poste);
      });
      if (!candidats.length) continue;
      const club = candidats[Math.floor(rng() * candidats.length) % candidats.length];
      const res = enregistrerOffreAchat(saison, {
        joueurId: joueur.id, clubId: club.id, montant: prix, tirageContre: rng(),
      });
      if (res.ok) return res;
    }
    return null;
  }

  // --- Vue d'écran ---------------------------------------------------------
  function dossierVentes(saison) {
    const c = saison && saison.clubJoueur;
    const effectif = (c && c.effectif) || [];
    const surListe = effectif.filter((j) => j.surListeTransfert).map((j) => ({
      id: j.id, nom: j.nom, poste: j.poste, age: j.age,
      valeur: valeurMarchande(saison, j),
      veutPartir: !!j.veutPartir,
      statutPromis: j.statutPromis || null,
    }));
    const offres = offresEnAttente(saison).map((m) => ({
      messageId: m.id,
      joueurId: m.decision.joueurId, joueurNom: m.decision.joueurNom,
      clubNom: m.decision.clubNom,
      montant: m.decision.montant, montantExige: m.decision.montantExige,
      dateLimite: m.decision.dateLimite,
    }));
    const cessibles = joueursCessibles(saison).map((j) => ({
      id: j.id, nom: j.nom, poste: j.poste, age: j.age,
      valeur: valeurMarchande(saison, j),
      surListe: !!j.surListeTransfert, veutPartir: !!j.veutPartir,
    })).sort((a, b) => b.valeur - a.valeur);
    return {
      surListe, offres, cessibles,
      valeurEffectif: effectif.reduce((t, j) => t + valeurMarchande(saison, j), 0),
      demandesDepart: effectif.filter((j) => j.veutPartir).length,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    COEFFICIENT_VENTE, PART_BUDGET_ACHETEUR, SURCOTE_EXIGENCE, DELAI_REPONSE_OFFRE_JOURS,
    peutPayer,
    valeurMarchande, motifIncessible, joueursCessibles,
    basculerListeTransfert, vendreJoueur,
    enregistrerOffreAchat, offresEnAttente, appliquerDecisionOffre,
    avancerJourVentes, dossierVentes,
  });
})(window);
