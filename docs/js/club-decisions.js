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
  // poste parmi les coéquipiers réellement disponibles ce jour-là — sans ça,
  // n'importe quel remplaçant de fond de banc se plaindrait, ce qui ne serait
  // pas crédible.
  //
  // Le classement doit être EXACTEMENT celui de la sélection automatique
  // (noteAuPoste, cf. club-composition.js). Il est resté sur l'ancien critère
  // `vitesse + plaquage` après le correctif P0-composition, et le jeu se
  // contredisait : un pilier 95 vitesse / 95 plaquage / 20 mêlée n'était plus
  // aligné (à raison) mais venait réclamer sa place tous les trois matchs,
  // pendant que le vrai deuxième pilier du poste ne se plaignait jamais. Le
  // manager était puni pour avoir fait le bon choix.
  function estCandidatSelectionAttendue(effectif, joueur) {
    const noteAuPoste = global.RMClub.noteAuPoste
      || ((j) => ((j.vitesse || 0) + (j.plaquage || 0)) / 2);
    const poste = joueur.poste;
    const concurrents = effectif.filter((j) => j.poste === poste && !j.pret && !j.blessureJournees);
    concurrents.sort((a, b) => noteAuPoste(b, poste) - noteAuPoste(a, poste));
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
    // Vestiaire (TODO_AUDIT.md P1-24) : la conséquence vit dans
    // club-direction.js — même chemin de résolution que les autres décisions,
    // donc même garantie d'idempotence.
    if (decision.type === 'vestiaire') {
      decision.resultat = global.RMClub.appliquerDecisionVestiaire(saison, optionId);
    }
    // Statut promis (club-statuts.js) : même chemin de résolution, donc même
    // idempotence et même traitement du silence (cf. resoudreDecisionsExpirees,
    // dont l'option par défaut « ignorer » est justement une des trois issues).
    if (decision.type === 'statut') {
      decision.resultat = global.RMClub.appliquerDecisionStatut(saison, decision.joueurId, optionId);
    }
    // Offre reçue pour un de mes joueurs (club-ventes.js) : même chemin de
    // résolution, donc même idempotence et même traitement du silence — une
    // offre laissée sans réponse expire, comme dans un vrai mercato.
    if (decision.type === 'offreAchat') {
      decision.resultat = global.RMClub.appliquerDecisionOffre(saison, decision, optionId);
    }
    // Contre-proposition d'un joueur sur son contrat (club-negociations.js) :
    // accepter ses conditions, revenir avec un compromis, ou arrêter là.
    if (decision.type === 'negociationContrat') {
      decision.resultat = global.RMClub.appliquerDecisionNegociation(saison, decision, optionId);
    }
    // Contre-proposition d'un club adverse sur MON offre de transfert.
    if (decision.type === 'offreSortante') {
      decision.resultat = global.RMClub.appliquerDecisionOffreSortante(saison, decision, optionId);
    }
    // Un club vient me PROPOSER un joueur : acheter, négocier à la baisse, ou
    // décliner (club-negociations.js).
    if (decision.type === 'propositionVente') {
      decision.resultat = global.RMClub.appliquerDecisionPropositionVente(saison, decision, optionId);
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
      // Chaque type de décision a SA façon de traiter le silence, et elle
      // doit exister parmi ses options — sinon resoudreDecisionMessage refuse
      // l'option et la décision resterait en attente pour toujours (une offre
      // jamais expirée bloquerait toute nouvelle offre sur ce joueur).
      // Chaque type a SA façon de traiter le silence, et elle doit exister
      // parmi ses options.
      const optionDefaut = d.type === 'vestiaire' ? 'laisser'
        : d.type === 'offreAchat' ? 'refuser'
        : d.type === 'propositionVente' ? 'refuser' : 'ignorer';
      if (resoudreDecisionMessage(saison, m.id, optionDefaut)) {
        d.resultat = d.type === 'vestiaire'
          ? "Tu n'as pas réagi à temps : l'ambiance du vestiaire s'est dégradée toute seule."
          : d.type === 'offreAchat'
            ? `Tu n'as pas répondu à temps : ${d.clubNom || 'le club'} retire son offre pour ${d.joueurNom || 'ton joueur'}.`
            : d.type === 'propositionVente'
              ? `Tu n'as pas répondu à temps : ${d.clubNom || 'le club'} ne propose plus ${d.joueurNom || 'son joueur'}.`
            : d.type === 'offreSortante'
              ? `Tu n'as pas répondu à temps : ${d.clubNom || 'le club'} retire ${d.joueurNom || 'son joueur'} du marché.`
              : d.type === 'negociationContrat'
                ? `Tu n'as pas répondu à temps : l'agent de ${d.joueurNom || 'ton joueur'} a classé le dossier.`
                : `Tu n'as pas répondu à temps : ${joueur ? joueur.nom : 'le joueur'} a pris ton silence pour un refus.`;
        d.expiree = true;
        expirees.push(joueur ? joueur.nom : null);
      }
    }
    return expirees.filter(Boolean);
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    SEUIL_JOURS_SANS_SELECTION, SEUIL_AVERTISSEMENTS_AVANT_DEPART, estCandidatSelectionAttendue,
    appliquerFrustrationTempsDeJeu, resoudreDecisionMessage, resoudreDecisionsExpirees,
  });
})(window);
