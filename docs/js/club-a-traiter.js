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
    // Infirmerie : on annonce ce qui EST, pas un compte générique — le
    // dossier médical (P1-40) permet de nommer la blessure la plus grave.
    const blessesListe = c.effectif.filter((j) => RMClub.joursIndisponible(j) > 0);
    if (blessesListe.length > 0) {
      const pire = blessesListe.slice().sort((a, b) => (b.blessure.gravite || 0) - (a.blessure.gravite || 0))[0];
      const d = RMClub.descriptionBlessure(pire);
      liste.push({ cle: 'blesses', niveau: 'urgent', icone: '🤕',
        texte: blessesListe.length === 1
          ? `${pire.nom} blessé — ${d.libelle} (${d.zone}), retour dans ${d.joursMin} à ${d.joursMax} j`
          : `${blessesListe.length} joueurs blessés — le plus touché : ${pire.nom} (${d.libelle})`,
        onglet: 'medical' });
    }
    // Reprise en cours : ce n'est PAS une urgence, mais le manager doit
    // savoir qu'un joueur n'est pas encore à son niveau avant de l'aligner.
    const enReprise = c.effectif.filter((j) => {
      const e = RMClub.etapeReprise(j);
      return e && e !== 'soins';
    });
    if (enReprise.length > 0) {
      const limites = enReprise.filter((j) => !RMClub.peutJouer(j, 'pro'));
      liste.push({ cle: 'reprise', niveau: 'recommande', icone: '🔄',
        texte: limites.length
          ? `${enReprise.length} joueur(s) en reprise, dont ${limites.length} pas encore alignable(s) en équipe première`
          : `${enReprise.length} joueur(s) en reprise — pas encore à 100 %`,
        onglet: 'medical' });
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

    // Ultimatum de la direction (P1-42a) : c'est LA chose la plus urgente
    // qui puisse arriver à un manager, avec un compte à rebours réel. On
    // affiche le compte, pas seulement un état.
    const ultimatum = RMClub.ultimatumEnCours ? RMClub.ultimatumEnCours(saison) : null;
    if (ultimatum) {
      liste.push({ cle: 'ultimatum', niveau: 'urgent', icone: '⏳',
        texte: `Ultimatum de la direction — ${ultimatum.matchsRestants} match(s) pour remonter ` +
          `au moins ${ultimatum.positionCible}e, sous peine de licenciement`,
        onglet: 'dashboard' });
    }

    // Carrière du manager (TODO_AUDIT.md P1-42) : un poste à saisir ou un
    // avertissement de la direction sont des choses à TRAITER, pas des
    // informations à découvrir par hasard dans l'onglet Bilan.
    if (RMClub.assurerManager && saison.manager) {
      const m = saison.manager;
      const securite = RMClub.securiteEmploi(saison);
      if (m.statut === 'sansClub') {
        liste.push({ cle: 'sansClub', niveau: 'decision', icone: '🎖️',
          texte: 'Tu es sans club — choisis ton prochain poste', onglet: 'stats' });
      } else if (securite.niveau === 'avertissement') {
        liste.push({ cle: 'avertissementDirection', niveau: 'urgent', icone: '⚠️',
          texte: `Avertissement de la direction — confiance ${securite.confiance} %`, onglet: 'stats' });
      } else if (securite.niveau === 'sousPression') {
        liste.push({ cle: 'pressionDirection', niveau: 'recommande', icone: '🎖️',
          texte: `La direction attend mieux — confiance ${securite.confiance} %`, onglet: 'stats' });
      }
      // Volontairement PAS de ligne « des clubs s'intéressent à toi » quand le
      // manager est en poste et que tout va bien : une offre non sollicitée
      // n'est pas quelque chose à TRAITER, et « rien à traiter » doit rester
      // une liste vide. Les offres restent consultables dans l'onglet Bilan.
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
    elementsATraiter, resumeATraiter,
  });
})(window);
