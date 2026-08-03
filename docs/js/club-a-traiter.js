// Ce qu'il reste À TRAITER (Mode Club) — TODO_AUDIT.md P1-36.
//
// Le tableau de bord dispersait l'attention du manager sur deux cartes qui
// disaient des choses de même nature à deux endroits différents :
//   - « Décisions & alertes » : blessés, fatigue, contrats, budget ;
//   - « Boîte de réception » : les messages, dont certains portent une VRAIE
//     décision à trancher — mesuré : 5 messages tous non lus, sans le moindre
//     signal sur le premier écran, la boîte étant à 1586 px sur mobile.
// Et surtout : une décision non tranchée, qui est ce qu'un manager doit
// traiter EN PRIORITÉ, n'apparaissait nulle part dans les alertes.
//
// Ce module produit UNE liste ordonnée, dérivée de l'état réel de la
// carrière. Il ne stocke rien et ne duplique rien : les décisions viennent
// de `saison.clubJoueur.messages` (le seul endroit où elles existent), les
// alertes de l'effectif et des finances réels. Aucun second système.
//
// Quatre niveaux, du plus au moins pressant :
//   'decision'   — un choix explicite attend le manager, avec une échéance ;
//   'urgent'     — quelque chose empêche ou compromet la prochaine rencontre ;
//   'recommande' — utile avant le match, mais on peut s'en passer ;
//   'info'       — à savoir, sans action immédiate.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  const ORDRE_NIVEAUX = ['decision', 'urgent', 'recommande', 'info'];

  function rang(niveau) {
    const i = ORDRE_NIVEAUX.indexOf(niveau);
    return i === -1 ? ORDRE_NIVEAUX.length : i;
  }

  // Décisions RÉELLEMENT en attente : un message qui porte un choix non
  // tranché. C'est la seule source — on ne maintient pas de liste parallèle.
  function decisionsEnAttente(saison) {
    return (saison.clubJoueur.messages || []).filter((m) => m.decision && !m.decision.resolue);
  }

  function elementsATraiter(saison) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const liste = [];

    // 1. Les décisions : ce sont les seules choses qui ATTENDENT le manager.
    for (const m of decisionsEnAttente(saison)) {
      const echeance = m.decision.dateLimite
        ? ` — réponse attendue avant le ${RMClub.formaterDateCourte(RMClub.dateDepuisISO(m.decision.dateLimite))}`
        : '';
      liste.push({
        cle: 'decision:' + m.id, niveau: 'decision', icone: '⚖️',
        texte: `${m.titre}${echeance}`, onglet: 'dashboard', messageId: m.id,
      });
    }

    // 2. Ce qui compromet la prochaine rencontre.
    const blesses = c.effectif.filter((j) => j.blessureJournees > 0).length;
    if (blesses > 0) {
      liste.push({ cle: 'blesses', niveau: 'urgent', icone: '🤕',
        texte: `${blesses} joueur(s) blessé(s)`, onglet: 'medical' });
    }
    // Un poste sans aucun joueur disponible empêche littéralement d'aligner
    // un XV : c'est le plus grave, mais ça reste rare.
    const POSTE_COMPLET = RMClub.POSTE_COMPLET || {};
    const postesVides = Object.keys(POSTE_COMPLET).filter((poste) =>
      !c.effectif.some((j) => j.poste === poste && j.blessureJournees <= 0 && !j.pret));
    if (postesVides.length > 0) {
      liste.push({ cle: 'posteVide', niveau: 'urgent', icone: '🌱',
        texte: `Plus aucun ${POSTE_COMPLET[postesVides[0]] || postesVides[0]} disponible — un espoir peut être promu`,
        onglet: 'effectif' });
    }
    if (c.budget < 0) {
      liste.push({ cle: 'budget', niveau: 'urgent', icone: '💸',
        texte: `Budget négatif (${c.budget} k€)`, onglet: 'finances' });
    }

    // 3. Ce qui mérite un coup d'œil avant de continuer.
    const fatigues = c.effectif.filter((j) => (j.fatigue || 0) >= 70).length;
    if (fatigues > 0) {
      liste.push({ cle: 'fatigue', niveau: 'recommande', icone: '⚡',
        texte: `${fatigues} joueur(s) très fatigué(s) — pense à les laisser souffler`,
        onglet: 'composition' });
    }

    // 4. À savoir. Les messages non lus en font partie : ils ne bloquent
    // rien, mais le manager doit savoir qu'il en a — c'est précisément ce
    // qui manquait sur le premier écran.
    const nonLus = (c.messages || []).filter((m) => !m.lu).length;
    if (nonLus > 0) {
      liste.push({ cle: 'messages', niveau: 'info', icone: '📬',
        texte: `${nonLus} message(s) non lu(s)`, onglet: 'dashboard' });
    }
    const contratsCourts = c.effectif.filter((j) => j.contrat <= 1).length;
    if (contratsCourts > 0) {
      liste.push({ cle: 'contrats', niveau: 'info', icone: '📄',
        texte: `${contratsCourts} contrat(s) expirant en fin de saison`, onglet: 'effectif' });
    }

    liste.sort((a, b) => rang(a.niveau) - rang(b.niveau));
    return liste;
  }

  // Compteurs pour un repère compact (badge, entête) — dérivés de la même
  // liste, jamais recalculés autrement.
  function resumeATraiter(saison) {
    const liste = elementsATraiter(saison);
    return {
      total: liste.length,
      decisions: liste.filter((e) => e.niveau === 'decision').length,
      urgents: liste.filter((e) => e.niveau === 'urgent').length,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    ORDRE_NIVEAUX_A_TRAITER: ORDRE_NIVEAUX, decisionsEnAttente, elementsATraiter, resumeATraiter,
  });
})(window);
