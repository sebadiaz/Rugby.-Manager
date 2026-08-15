// Infrastructures du club (TODO_AUDIT.md P1-44, plan B).
//
// AVANT ce module, `clubJoueur.budget` n'était débité que par des transferts
// et des salaires. Dépenser 500 k€ sur un joueur n'était donc pas un choix :
// il n'existait aucune alternative. L'argent n'avait qu'une seule sortie.
//
// Ici, le club peut construire. Quatre infrastructures, cinq niveaux chacune,
// et surtout DEUX contraintes qui font le choix :
//   - un seul chantier à la fois (on ne construit pas tout en même temps) ;
//   - des travaux qui prennent des semaines (le gain n'est pas immédiat).
//
// Chaque niveau a un effet MESURABLE, branché sur une formule qui existe déjà
// — jamais un badge décoratif :
//   stade           -> recette de billetterie (appliquerFinancesMatch) ;
//   medical         -> risque de blessure (risqueBlessure) ;
//   formation       -> progression des jeunes (progresserCentreFormation) ;
//   entrainement    -> gain des séances (appliquerSeance).
//
// Entièrement déterministe : aucun tirage, un coût donné dépend uniquement du
// niveau actuel. Aucune dépendance au DOM.
(function (global) {
  'use strict';

  const NIVEAU_MAX = 5;

  const INFRASTRUCTURES = {
    stade: {
      label: 'Stade', icone: '🏟️',
      effet: 'Recette de billetterie à chaque match à domicile.',
      coutBase: 320, dureeBase: 45,
      // +18 % de recette par niveau au-dessus de 1.
      gainParNiveau: 0.18,
    },
    medical: {
      label: 'Centre médical', icone: '🩺',
      effet: 'Risque de blessure de tout l\'effectif.',
      coutBase: 260, dureeBase: 35,
      // -9 % de risque par niveau au-dessus de 1.
      gainParNiveau: 0.09,
    },
    formation: {
      label: 'Centre de formation', icone: '🌱',
      effet: 'Progression des jeunes du centre de formation.',
      coutBase: 300, dureeBase: 60,
      gainParNiveau: 0.20,
    },
    entrainement: {
      label: 'Terrains d\'entraînement', icone: '🏋️',
      effet: 'Gain de chaque séance d\'entraînement.',
      coutBase: 220, dureeBase: 30,
      gainParNiveau: 0.12,
    },
  };
  const CLES_INFRASTRUCTURE = Object.keys(INFRASTRUCTURES);

  // COÛT D'EXPLOITATION (TODO_AUDIT.md G3).
  //
  // Ce qui manquait : une infrastructure était du PUR BÉNÉFICE. On payait le
  // chantier une fois, le gain était acquis pour toujours et ne coûtait plus
  // jamais rien. Monter un niveau était donc toujours le bon choix, ce qui
  // n'est pas un choix. Aucun club ne fonctionne ainsi : un stade, un centre
  // de formation, un centre médical et des terrains, ça s'exploite —
  // personnel d'entretien, énergie, matériel, assurances.
  //
  // Le niveau 1 coûte déjà : le club POSSÈDE ces installations dès le départ,
  // il ne les découvre pas en montant de niveau. Chaque niveau supplémentaire
  // ajoute la même charge, ce qui donne enfin son prix au gain.
  //
  // Conséquence recherchée, et c'est tout l'intérêt : le stade reste rentable
  // (sa recette croît plus vite que son entretien), mais le centre de
  // formation, le centre médical et les terrains ne rapportent AUCUNE recette
  // — les monter est un pari sportif qu'il faut financer. C'est l'arbitrage
  // qui n'existait pas.
  //
  // DEUX charges distinctes, et la distinction compte.
  //
  // `COUT_ENTRETIEN_BASE` est incompressible : le club possède ses quatre
  // installations dès le départ et les fait tourner, quel que soit leur
  // niveau. 1,7 k€ par installation et par journée, soit ~7 k€/journée et
  // ~180 k€ sur une saison de 26 journées — à comparer à une masse salariale
  // de ~600 k€. C'est cette part qui ramène l'exercice à l'équilibre.
  //
  // `COUT_ENTRETIEN_PAR_NIVEAU_SUP` est le surcoût de chaque niveau au-dessus
  // de 1. Il est volontairement PLUS FAIBLE que la base, et la première
  // calibration l'a prouvé : à 1,7 k€ également, monter le stade au niveau 2
  // rapportait +104 k€/saison de recette pour +44 k€ d'entretien, soit un
  // retour sur investissement de 6,2 saisons sur un chantier à 320 k€ —
  // personne ne l'aurait construit. À 0,7 k€, le surcoût tombe à ~18 k€/saison
  // et le retour à ~3,7 saisons : l'investissement redevient un vrai pari,
  // au lieu d'un piège.
  const COUT_ENTRETIEN_BASE = 1.7;
  const COUT_ENTRETIEN_PAR_NIVEAU_SUP = 0.7;

  // Charge d'exploitation d'une journée, en k€. Fonction PURE : elle ne lit
  // que les niveaux réellement construits.
  function coutEntretienInfrastructures(club) {
    if (!club) return 0;
    const infra = club.infrastructures || {};
    let total = 0;
    for (const cle of CLES_INFRASTRUCTURE) {
      const n = Math.max(1, (infra[cle] && infra[cle].niveau) || 1);
      total += COUT_ENTRETIEN_BASE + (n - 1) * COUT_ENTRETIEN_PAR_NIVEAU_SUP;
    }
    return Math.round(total);
  }

  // Structure créée à la demande, comme les autres domaines : une carrière
  // existante n'a rien à perdre, elle démarre simplement au niveau 1.
  function assurerInfrastructures(saison) {
    const c = saison.clubJoueur;
    if (!c.infrastructures || typeof c.infrastructures !== 'object') c.infrastructures = {};
    for (const cle of CLES_INFRASTRUCTURE) {
      if (!c.infrastructures[cle] || typeof c.infrastructures[cle] !== 'object') {
        c.infrastructures[cle] = { niveau: 1 };
      }
      const n = c.infrastructures[cle].niveau;
      if (!(n >= 1 && n <= NIVEAU_MAX)) c.infrastructures[cle].niveau = 1;
    }
    return c.infrastructures;
  }

  function niveauInfrastructure(saison, cle) {
    const infra = assurerInfrastructures(saison);
    return infra[cle] ? infra[cle].niveau : 1;
  }

  // Coût et durée croissent avec le niveau ATTEINT : chaque palier
  // supplémentaire est plus lourd que le précédent, donc le club doit choisir
  // où mettre son argent plutôt que tout monter au maximum.
  function coutAmelioration(saison, cle) {
    const def = INFRASTRUCTURES[cle];
    if (!def) return 0;
    const n = niveauInfrastructure(saison, cle);
    if (n >= NIVEAU_MAX) return 0;
    return Math.round(def.coutBase * Math.pow(1.55, n - 1));
  }

  function dureeAmelioration(saison, cle) {
    const def = INFRASTRUCTURES[cle];
    if (!def) return 0;
    const n = niveauInfrastructure(saison, cle);
    if (n >= NIVEAU_MAX) return 0;
    return Math.round(def.dureeBase * (1 + (n - 1) * 0.35));
  }

  function chantierEnCours(saison) {
    const ch = (saison.clubJoueur || {}).chantier;
    return ch && ch.joursRestants > 0 ? ch : null;
  }

  // Refus EXPLICITES, chacun avec son motif : le manager doit savoir pourquoi
  // il ne peut pas, pas voir un bouton inerte.
  function lancerTravaux(saison, cle) {
    const RMClub = global.RMClub;
    const def = INFRASTRUCTURES[cle];
    if (!def) return { ok: false, motif: 'inconnue' };
    assurerInfrastructures(saison);
    if (chantierEnCours(saison)) return { ok: false, motif: 'chantierEnCours' };
    const n = niveauInfrastructure(saison, cle);
    if (n >= NIVEAU_MAX) return { ok: false, motif: 'niveauMax' };
    const cout = coutAmelioration(saison, cle);
    const c = saison.clubJoueur;
    if ((c.budget || 0) < cout) return { ok: false, motif: 'budget', cout, manque: cout - (c.budget || 0) };
    const duree = dureeAmelioration(saison, cle);
    // Le débit passe par le grand livre (cf. club-comptes.js) : un chantier
    // de plusieurs centaines de k€ ne doit pas disparaître de la trésorerie
    // sans laisser de trace, c'est le plus gros poste de dépense du jeu.
    RMClub.tresorerie(saison, 'travaux', `Travaux — ${def.label} niveau ${n + 1}`, -cout);
    c.chantier = {
      cle, niveauVise: n + 1, cout, joursTotal: duree, joursRestants: duree,
      debutISO: RMClub.dateISO ? RMClub.dateISO(RMClub.dateCourante(saison)) : null,
    };
    if (RMClub.ajouterMessage) {
      RMClub.ajouterMessage(saison, 'saison', `Travaux lancés : ${def.label}`,
        `${def.label} passe au niveau ${n + 1} dans ${duree} jour(s). ` +
        `${cout} k€ engagés — il reste ${c.budget} k€. ${def.effet}`);
    }
    return { ok: true, cout, duree, niveauVise: n + 1 };
  }

  // Appelé une fois par jour par la boucle quotidienne. Retourne l'événement
  // du jour s'il y en a un — jamais un compteur qui bouge en silence.
  function avancerJourInfrastructures(saison) {
    const RMClub = global.RMClub;
    const ch = chantierEnCours(saison);
    if (!ch) return null;
    ch.joursRestants -= 1;
    if (ch.joursRestants > 0) return { termine: false, joursRestants: ch.joursRestants, cle: ch.cle };
    const def = INFRASTRUCTURES[ch.cle];
    assurerInfrastructures(saison);
    saison.clubJoueur.infrastructures[ch.cle].niveau = ch.niveauVise;
    saison.clubJoueur.chantier = null;
    if (RMClub.ajouterMessage) {
      RMClub.ajouterMessage(saison, 'saison', `Travaux terminés : ${def.label}`,
        `${def.label} atteint le niveau ${ch.niveauVise}. ${def.effet}`);
    }
    return { termine: true, cle: ch.cle, niveau: ch.niveauVise, label: def.label };
  }

  // Multiplicateur appliqué par les formules du jeu. Niveau 1 = 1 exactement,
  // donc une carrière qui n'investit jamais se comporte comme avant.
  function effetInfrastructure(saison, cle) {
    const def = INFRASTRUCTURES[cle];
    if (!def || !saison || !saison.clubJoueur) return 1;
    const n = niveauInfrastructure(saison, cle);
    return 1 + (n - 1) * def.gainParNiveau;
  }

  // Vue prête à afficher : ce que chaque infrastructure apporte AUJOURD'HUI,
  // ce que coûterait le niveau suivant, et pourquoi c'est possible ou non.
  function dossierInfrastructures(saison) {
    assurerInfrastructures(saison);
    const c = saison.clubJoueur;
    const ch = chantierEnCours(saison);
    return {
      budget: c.budget,
      chantier: ch ? Object.assign({}, ch, { label: INFRASTRUCTURES[ch.cle].label }) : null,
      lignes: CLES_INFRASTRUCTURE.map((cle) => {
        const def = INFRASTRUCTURES[cle];
        const n = niveauInfrastructure(saison, cle);
        const cout = coutAmelioration(saison, cle);
        const duree = dureeAmelioration(saison, cle);
        const gainActuel = Math.round((effetInfrastructure(saison, cle) - 1) * 100);
        const gainSuivant = n < NIVEAU_MAX ? Math.round(def.gainParNiveau * 100) : 0;
        let blocage = null;
        if (n >= NIVEAU_MAX) blocage = 'niveauMax';
        else if (ch) blocage = 'chantierEnCours';
        else if ((c.budget || 0) < cout) blocage = 'budget';
        return {
          cle, label: def.label, icone: def.icone, effet: def.effet,
          niveau: n, niveauMax: NIVEAU_MAX, cout, duree,
          gainActuel, gainSuivant, blocage,
          manque: blocage === 'budget' ? cout - (c.budget || 0) : 0,
        };
      }),
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    CLES_INFRASTRUCTURE, assurerInfrastructures, niveauInfrastructure,
    coutAmelioration, dureeAmelioration, chantierEnCours, lancerTravaux,
    avancerJourInfrastructures, effetInfrastructure, dossierInfrastructures,
    coutEntretienInfrastructures,
  });
})(window);
