// Décisions du manager (Mode Club) — TODO_AUDIT.md P1-15 : la boîte de
// réception ne contenait jusqu'ici QUE des messages informatifs (résultat,
// blessure, transfert...), jamais un vrai choix avec conséquence — signalé
// explicitement par l'audit ("boîte de réception avec décisions : présent
// mais incomplet") et par le manque documenté de "mécontentements, demandes
// et discussions" côté joueurs (audit domaine 2).
//
// Première tranche : la frustration liée au temps de jeu. Un joueur d'un
// niveau suffisant pour prétendre à une place (top 2 de son poste) mais non
// sélectionné plusieurs journées de suite vient réclamer plus de temps de
// jeu — le manager doit RÉELLEMENT trancher (le rassurer ou l'ignorer),
// directement depuis la boîte de réception, avec une conséquence durable :
// - le rassurer améliore son moral immédiatement ;
// - l'ignorer le fait baisser durablement, et une deuxième demande ignorée
//   du même joueur le fait vouloir quitter le club (moral qui ne remonte
//   plus vers la neutralité, progression à l'entraînement qui s'arrête —
//   cf. club-condition-joueurs.js).
//
// Domaine autonome : dépend seulement de RMClub.ajouterMessage (club.js).
(function (global) {
  'use strict';

  // Nombre de journées jouées consécutives sans la moindre sélection (ni
  // titulaire ni banc) avant qu'un joueur de qualité ne se manifeste.
  const SEUIL_JOURS_SANS_SELECTION = 3;
  // Nombre de demandes ignorées avant qu'un joueur ne veuille quitter le club.
  const SEUIL_AVERTISSEMENTS_AVANT_DEPART = 2;
  // Délai laissé au manager pour répondre à une demande (TODO_AUDIT.md
  // P1-23) : au-delà, le joueur considère qu'on l'a ignoré. Le silence a
  // donc un coût réel, comme un refus assumé.
  const DELAI_REPONSE_DECISION_JOURS = 10;

  // Un joueur "mérite" une place s'il fait partie des 2 meilleurs de son
  // poste (même critère vitesse+plaquage que meilleurCandidatPourNumero,
  // cf. club-composition.js) parmi les coéquipiers réellement disponibles
  // ce jour-là — sans ça, n'importe quel remplaçant de fond de banc se
  // plaindrait, ce qui ne serait pas crédible.
  function estCandidatSelectionAttendue(effectif, joueur) {
    const concurrents = effectif.filter((j) => j.poste === joueur.poste && !j.pret && !j.blessureJournees);
    concurrents.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
    return concurrents.slice(0, 2).some((j) => j.id === joueur.id);
  }

  // Appelée une fois par journée jouée (cf. clubUI.js, juste après
  // appliquerEntrainement) avec la composition RÉELLEMENT utilisée ce
  // jour-là (titulaires + banc, 23 joueurs) : fait avancer le compteur de
  // frustration de chaque joueur non sélectionné, et génère une vraie
  // demande dès que le seuil est franchi.
  function appliquerFrustrationTempsDeJeu(saison, compositionTitulaires, compositionBanc) {
    const effectif = saison.clubJoueur.effectif;
    const selectionnesIds = new Set([
      ...Object.values(compositionTitulaires || {}),
      ...Object.values(compositionBanc || {}),
    ]);
    for (const j of effectif) {
      if (selectionnesIds.has(j.id)) {
        j.joursSansSelection = 0;
        continue;
      }
      // Prêté ou blessé : indisponible de toute façon, pas de frustration
      // à accumuler pour une place qu'il ne pouvait pas occuper.
      if (j.pret || j.blessureJournees) continue;
      j.joursSansSelection = (j.joursSansSelection || 0) + 1;
      if (
        j.joursSansSelection >= SEUIL_JOURS_SANS_SELECTION &&
        !j.demandeTempsDeJeuEnAttente &&
        !j.veutPartir &&
        estCandidatSelectionAttendue(effectif, j)
      ) {
        j.demandeTempsDeJeuEnAttente = true;
        j.joursSansSelection = 0;
        // Décision DATÉE (TODO_AUDIT.md P1-23) : un joueur n'attend pas
        // indéfiniment une réponse. Passée l'échéance, le silence vaut
        // refus — avec exactement les mêmes conséquences réelles.
        const echeance = global.RMClub.ajouterJours(global.RMClub.dateCourante(saison), DELAI_REPONSE_DECISION_JOURS);
        global.RMClub.ajouterMessage(saison, 'joueur', 'Demande de temps de jeu',
          `${j.nom} (${j.poste}) n'a plus été sélectionné depuis plusieurs journées alors qu'il en a le niveau. Il vient te voir : il veut plus de temps de jeu.`,
          {
            type: 'tempsDeJeu',
            joueurId: j.id,
            resolu: false,
            dateLimite: global.RMClub.dateISO(echeance),
            options: [
              { id: 'rassurer', libelle: 'Le rassurer' },
              { id: 'ignorer', libelle: 'Ignorer sa demande' },
            ],
          });
      }
    }
  }

  // Tranche réellement la décision portée par un message (cf. clubUI.js,
  // clic sur un bouton de décision dans la boîte de réception). Idempotent :
  // un message déjà résolu (ou introuvable, ou une option invalide) ne
  // produit aucun effet — protège contre un double clic ou un id périmé.
  function resoudreDecisionMessage(saison, messageId, optionId) {
    const message = (saison.clubJoueur.messages || []).find((m) => m.id === messageId);
    if (!message || !message.decision || message.decision.resolu) return false;
    const decision = message.decision;
    if (!decision.options.some((o) => o.id === optionId)) return false;
    const joueur = saison.clubJoueur.effectif.find((j) => j.id === decision.joueurId);
    if (decision.type === 'tempsDeJeu' && joueur) {
      joueur.demandeTempsDeJeuEnAttente = false;
      if (optionId === 'rassurer') {
        joueur.moral = Math.max(0, Math.min(100, (joueur.moral != null ? joueur.moral : 65) + 10));
        decision.resultat = `Tu as rassuré ${joueur.nom} sur son avenir dans l'équipe.`;
      } else {
        joueur.moral = Math.max(0, Math.min(100, (joueur.moral != null ? joueur.moral : 65) - 14));
        joueur.avertissementsIgnores = (joueur.avertissementsIgnores || 0) + 1;
        decision.resultat = `Tu as ignoré la demande de ${joueur.nom}.`;
        if (joueur.avertissementsIgnores >= SEUIL_AVERTISSEMENTS_AVANT_DEPART && !joueur.veutPartir) {
          joueur.veutPartir = true;
          global.RMClub.ajouterMessage(saison, 'joueur', 'Demande de transfert',
            `${joueur.nom} ne veut plus rester au club après avoir été ignoré à plusieurs reprises. Il souhaite être transféré.`);
        }
      }
    }
    decision.resolu = true;
    decision.choix = optionId;
    message.lu = true;
    return true;
  }

  // Résout automatiquement les décisions dont l'échéance est passée : le
  // silence du manager vaut refus. Réutilise EXACTEMENT le même chemin que
  // le refus explicite (resoudreDecisionMessage) — aucune règle parallèle,
  // donc aucune divergence possible entre « ignorer » et « ne rien faire ».
  function resoudreDecisionsExpirees(saison, date) {
    const RMClub = global.RMClub;
    const expirees = [];
    for (const m of saison.clubJoueur.messages || []) {
      const d = m.decision;
      if (!d || d.resolu || !d.dateLimite) continue;
      const limite = RMClub.dateDepuisISO(d.dateLimite);
      if (!limite || RMClub.comparerDates(date, limite) < 0) continue;
      const joueur = (saison.clubJoueur.effectif || []).find((j) => j.id === d.joueurId);
      if (resoudreDecisionMessage(saison, m.id, 'ignorer')) {
        d.resultat = `Tu n'as pas répondu à temps : ${joueur ? joueur.nom : 'le joueur'} a pris ton silence pour un refus.`;
        d.expiree = true;
        expirees.push(joueur ? joueur.nom : null);
      }
    }
    return expirees.filter(Boolean);
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    SEUIL_JOURS_SANS_SELECTION, SEUIL_AVERTISSEMENTS_AVANT_DEPART, DELAI_REPONSE_DECISION_JOURS,
    estCandidatSelectionAttendue, appliquerFrustrationTempsDeJeu, resoudreDecisionMessage,
    resoudreDecisionsExpirees,
  });
})(window);
