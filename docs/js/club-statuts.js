// Dynamique de vestiaire (Mode Club) — LE STATUT PROMIS.
//
// Ce qui existait avant ce fichier : une frustration SUBIE. Au bout de trois
// journées sans la moindre sélection, un joueur du top 2 de son poste venait
// réclamer du temps de jeu (club-decisions.js). Le manager, lui, ne pouvait
// rien promettre à personne : aligner ou non un joueur n'engageait sur rien.
//
// Ce que ce domaine ajoute : un ENGAGEMENT. Le manager annonce à chaque joueur
// le rôle qu'il compte lui donner (cadre, joueur de rotation, espoir). Cette
// promesse a un effet immédiat sur le moral, puis elle est confrontée aux
// SÉLECTIONS RÉELLEMENT effectuées — jamais à un compteur décoratif. Une
// promesse tenue ne déclenche rien ; une promesse rompue ramène le joueur
// dans le bureau du manager, avec trois issues qui ne se valent pas.
//
// Le statut ne modifie PAS la sélection automatique : c'est une promesse que
// le manager doit tenir lui-même, pas une consigne que le jeu appliquerait à
// sa place. La composition automatique reste réglée sur la seule valeur
// sportive au poste (cf. noteAuPoste, club-composition.js).
//
// Dépendances : RMClub.ajouterMessage, ajouterJours, dateCourante, dateISO.
(function (global) {
  'use strict';

  // `tauxTitulaireAttendu` : part de matchs DISPONIBLES que le joueur doit
  // passer sur le terrain pour que la promesse soit tenue. Une entrée en jeu
  // depuis le banc compte pour une demi-titularisation — c'est du temps de
  // jeu, mais pas celui d'un titulaire.
  const STATUTS = {
    cadre: {
      libelle: 'Cadre',
      rang: 3,
      tauxTitulaireAttendu: 0.60,
      description: 'Tu lui promets une place de titulaire dans la majorité des matchs.',
    },
    rotation: {
      libelle: 'Joueur de rotation',
      rang: 2,
      tauxTitulaireAttendu: 0.30,
      description: 'Tu lui promets du temps de jeu régulier, sans lui garantir le XV.',
    },
    espoir: {
      libelle: 'Espoir',
      rang: 1,
      tauxTitulaireAttendu: 0,
      description: 'Tu lui demandes de patienter et de progresser à l\'entraînement.',
    },
  };
  const CLES_STATUT = ['cadre', 'rotation', 'espoir'];
  // Une entrée en jeu vaut la moitié d'une titularisation dans le décompte.
  const POIDS_BANC = 0.5;
  // En dessous de ce nombre de matchs joués depuis la promesse, on ne juge
  // rien : deux feuilles de match ne font pas une saison, et un joueur
  // crédible ne vient pas se plaindre au bout de trois jours.
  const MATCHS_MINIMUM_EVALUATION = 6;
  // Délai de réponse, identique aux autres décisions (cf. club-decisions.js) :
  // le silence du manager vaut refus, avec les mêmes conséquences.
  const DELAI_REPONSE_STATUT_JOURS = 10;
  // Effets sur le moral — bornés, jamais décoratifs (le moral pèse réellement
  // sur les stats transmises au moteur, cf. compositionVersJoueursCfg).
  const MORAL_PROMOTION_PAR_RANG = 6;
  const MORAL_RETROGRADATION_PAR_RANG = 8;
  const MORAL_PREMIERE_PROMESSE = { cadre: 8, rotation: 2 };
  const MORAL_ESPOIR_JEUNE = 3;
  const MORAL_ESPOIR_CONFIRME = -6;
  const AGE_ESPOIR_ACCEPTABLE = 21;
  const MORAL_RETRAIT_STATUT = -3;
  const MORAL_PROMESSE_MAINTENUE = 10;
  const MORAL_STATUT_REVU = -6;
  const MORAL_PROMESSE_IGNOREE = -15;

  function borneMoral(v) { return Math.max(0, Math.min(100, Math.round(v))); }
  function moralDe(j) { return j.moral != null ? j.moral : 65; }
  function rangDe(statut) { return statut && STATUTS[statut] ? STATUTS[statut].rang : 0; }

  function libelleStatut(statut) {
    return statut && STATUTS[statut] ? STATUTS[statut].libelle : 'Aucun statut promis';
  }

  // Variation de moral produite par l'annonce elle-même. Isolée et pure :
  // c'est la règle du jeu, testable sans monter une saison entière.
  function effetMoralAnnonce(joueur, ancien, nouveau) {
    const ra = rangDe(ancien), rn = rangDe(nouveau);
    if (ra === rn) return 0;
    if (rn === 0) return MORAL_RETRAIT_STATUT;
    if (ra === 0) {
      if (nouveau === 'espoir') {
        return (joueur.age || 25) <= AGE_ESPOIR_ACCEPTABLE ? MORAL_ESPOIR_JEUNE : MORAL_ESPOIR_CONFIRME;
      }
      return MORAL_PREMIERE_PROMESSE[nouveau] || 0;
    }
    return rn > ra
      ? MORAL_PROMOTION_PAR_RANG * (rn - ra)
      : -MORAL_RETROGRADATION_PAR_RANG * (ra - rn);
  }

  // Repart le suivi à zéro : à partir de maintenant, seules les feuilles de
  // match À VENIR jugeront la promesse. Utilisé à l'annonce et à chaque fois
  // qu'une demande est tranchée.
  function reinitialiserSuivi(joueur) {
    joueur.statutRefMatchs = joueur.matchsDisponibles || 0;
    joueur.statutRefTitulaire = joueur.matchsJoues || 0;
    joueur.statutRefBanc = joueur.matchsSurLeBanc || 0;
    joueur.demandeStatutEnAttente = false;
  }

  // Annonce du manager. Renvoie {ok, motif, statut, effetMoral} — `motif`
  // sert à expliquer un refus à l'écran plutôt qu'à échouer en silence.
  function definirStatutPromis(saison, joueurId, statut) {
    const c = saison && saison.clubJoueur;
    if (!c) return { ok: false, motif: 'aucunClub' };
    const j = (c.effectif || []).find((x) => x.id === joueurId);
    if (!j) return { ok: false, motif: 'joueurInconnu' };
    const cible = statut || null;
    if (cible && !STATUTS[cible]) return { ok: false, motif: 'statutInconnu' };
    const ancien = j.statutPromis || null;
    if (ancien === cible) return { ok: true, motif: 'inchange', statut: cible, effetMoral: 0 };
    const effet = effetMoralAnnonce(j, ancien, cible);
    j.statutPromis = cible;
    j.moral = borneMoral(moralDe(j) + effet);
    reinitialiserSuivi(j);
    return { ok: true, motif: null, statut: cible, effetMoral: effet };
  }

  // Bilan CHIFFRÉ de la promesse, uniquement à partir de compteurs réels :
  // `matchsDisponibles` (matchs du club où le joueur était sélectionnable),
  // `matchsJoues` (titularisations, cf. appliquerFatigue) et `matchsSurLeBanc`.
  function bilanPromesse(joueur) {
    const statut = joueur.statutPromis || null;
    const matchs = (joueur.matchsDisponibles || 0) - (joueur.statutRefMatchs || 0);
    const titulaire = (joueur.matchsJoues || 0) - (joueur.statutRefTitulaire || 0);
    const banc = (joueur.matchsSurLeBanc || 0) - (joueur.statutRefBanc || 0);
    if (!statut) {
      return { statut: null, matchs, titulaire, banc, part: null, attendu: null, tenue: null, jugeable: false };
    }
    const attendu = STATUTS[statut].tauxTitulaireAttendu;
    const part = matchs > 0 ? (titulaire + POIDS_BANC * banc) / matchs : null;
    const jugeable = matchs >= MATCHS_MINIMUM_EVALUATION;
    // Tant qu'on ne juge pas, on ne déclare pas la promesse rompue : `tenue`
    // reflète l'état constaté, il vaut donc `true` par défaut.
    const tenue = part == null ? true : part >= attendu - 1e-9;
    return { statut, matchs, titulaire, banc, part, attendu, tenue, jugeable };
  }

  // Appelée une fois par journée jouée, avec la feuille de match RÉELLEMENT
  // utilisée. `compositionTitulaires` doit être le XV **après remplacements**,
  // c'est-à-dire exactement ce que reçoit appliquerFatigue : un joueur entré
  // en jeu a déjà vu son `matchsJoues` augmenter, le recompter comme
  // « remplaçant » lui donnerait 1,5 match pour une seule feuille.
  // Met à jour les compteurs, puis fait venir les joueurs dont la promesse
  // n'est manifestement pas tenue.
  function evaluerPromessesStatut(saison, compositionTitulaires, compositionBanc) {
    const RMClub = global.RMClub;
    const c = saison && saison.clubJoueur;
    if (!c || !Array.isArray(c.effectif)) return [];
    const idsTitulaires = new Set(Object.values(compositionTitulaires || {}));
    const idsBanc = new Set(Object.values(compositionBanc || {}));
    const reclamations = [];
    for (const j of c.effectif) {
      const surLaFeuille = idsTitulaires.has(j.id) || idsBanc.has(j.id);
      if (idsBanc.has(j.id) && !idsTitulaires.has(j.id)) {
        j.matchsSurLeBanc = (j.matchsSurLeBanc || 0) + 1;
      }
      // Prêté ou blessé SANS avoir figuré sur la feuille : le manager ne
      // pouvait pas l'aligner, ce match ne compte donc pas contre lui. C'est
      // ce qui empêche une blessure longue de transformer mécaniquement toute
      // promesse en trahison.
      //
      // Mais s'il ÉTAIT sur la feuille, le match compte, même s'il en est
      // sorti blessé : les blessures sont appliquées avant cet appel (cf.
      // appliquerEffetsMatch), et l'ignorer laissait `matchsJoues` grimper
      // pendant que le dénominateur restait à zéro — un joueur pouvait
      // afficher 2 titularisations sur 0 match. Mesuré en pilotant le jeu.
      if (!surLaFeuille && (j.pret || j.blessureJournees)) continue;
      j.matchsDisponibles = (j.matchsDisponibles || 0) + 1;
      if (!j.statutPromis) continue;
      if (j.demandeStatutEnAttente || j.veutPartir) continue;
      const bilan = bilanPromesse(j);
      if (!bilan.jugeable || bilan.tenue) continue;
      j.demandeStatutEnAttente = true;
      const echeance = RMClub.ajouterJours(RMClub.dateCourante(saison), DELAI_REPONSE_STATUT_JOURS);
      const def = STATUTS[bilan.statut];
      const pct = Math.round((bilan.part || 0) * 100);
      RMClub.ajouterMessage(saison, 'joueur', 'Promesse non tenue',
        `${j.nom} (${j.poste}) te rappelle que tu lui as promis un rôle de ${def.libelle.toLowerCase()}. ` +
        `Sur les ${bilan.matchs} matchs où il était disponible, il n'a été retenu que ${bilan.titulaire} fois dans le XV ` +
        `et ${bilan.banc} fois sur le banc, soit ${pct} % de temps de jeu là où ce statut en promet ` +
        `${Math.round(bilan.attendu * 100)} %. Il veut savoir où il en est.`,
        {
          type: 'statut',
          joueurId: j.id,
          resolu: false,
          dateLimite: RMClub.dateISO(echeance),
          options: [
            { id: 'maintenir', libelle: 'Maintenir sa promesse' },
            { id: 'revoir', libelle: 'Revoir son statut' },
            { id: 'ignorer', libelle: 'Ignorer sa demande' },
          ],
        });
      reclamations.push(j.nom);
    }
    return reclamations;
  }

  // Statut immédiatement inférieur — utilisé quand le manager assume et
  // reclasse honnêtement le joueur au lieu de lui rejouer la même promesse.
  function statutInferieur(statut) {
    const rang = rangDe(statut);
    let meilleur = null;
    for (const cle of CLES_STATUT) {
      const r = STATUTS[cle].rang;
      if (r < rang && (meilleur === null || r > STATUTS[meilleur].rang)) meilleur = cle;
    }
    return meilleur;
  }

  // Conséquence RÉELLE d'une décision de statut (appelée par
  // resoudreDecisionMessage, cf. club-decisions.js) — renvoie le compte rendu
  // affiché au manager.
  function appliquerDecisionStatut(saison, joueurId, optionId) {
    const RMClub = global.RMClub;
    const c = saison.clubJoueur;
    const j = (c.effectif || []).find((x) => x.id === joueurId);
    if (!j) return 'Ce joueur n\'est plus au club.';
    const statutAvant = j.statutPromis;
    const libelleAvant = libelleStatut(statutAvant);
    // Une promesse déjà renouvelée une fois puis rompue de nouveau ne se
    // rattrape pas : c'est la deuxième fois que le manager lui ment.
    const dejaRenouvelee = (j.promessesMaintenues || 0) >= 1;
    let resultat;
    if (optionId === 'maintenir') {
      j.promessesMaintenues = (j.promessesMaintenues || 0) + 1;
      j.moral = borneMoral(moralDe(j) + MORAL_PROMESSE_MAINTENUE);
      resultat = `Tu confirmes à ${j.nom} qu'il reste ${libelleAvant.toLowerCase()} dans ton projet. Il repart rassuré — mais il te regardera composer.`;
    } else if (optionId === 'revoir') {
      const nouveau = statutInferieur(statutAvant);
      j.statutPromis = nouveau;
      j.moral = borneMoral(moralDe(j) + MORAL_STATUT_REVU);
      resultat = nouveau
        ? `Tu assumes : ${j.nom} passe de ${libelleAvant.toLowerCase()} à ${libelleStatut(nouveau).toLowerCase()}. Il encaisse, mais il sait à quoi s'en tenir.`
        : `Tu retires son statut à ${j.nom}. Il n'a plus de garantie, mais plus de faux espoirs non plus.`;
    } else {
      j.moral = borneMoral(moralDe(j) + MORAL_PROMESSE_IGNOREE);
      j.avertissementsIgnores = (j.avertissementsIgnores || 0) + 1;
      resultat = `Tu ne réponds rien à ${j.nom}. Il retourne au vestiaire, et il en parle.`;
      const rupture = dejaRenouvelee
        || (j.avertissementsIgnores || 0) >= (RMClub.SEUIL_AVERTISSEMENTS_AVANT_DEPART || 2);
      if (rupture && !j.veutPartir) {
        j.veutPartir = true;
        RMClub.ajouterMessage(saison, 'joueur', 'Demande de transfert',
          `${j.nom} ne croit plus à ce que tu lui promets. Il demande à être transféré.`);
        resultat += ' Il demande son transfert.';
      }
    }
    reinitialiserSuivi(j);
    return resultat;
  }

  // Vue d'écran : une ligne par joueur, entièrement dérivée des compteurs
  // réels. Aucun chiffre n'est fabriqué — un joueur sans promesse a des
  // champs nuls, pas des zéros trompeurs.
  function dossierDynamique(saison) {
    const c = saison && saison.clubJoueur;
    const effectif = (c && c.effectif) || [];
    const lignes = effectif.map((j) => {
      const b = bilanPromesse(j);
      return {
        id: j.id, nom: j.nom, poste: j.poste, age: j.age,
        moral: moralDe(j),
        statut: j.statutPromis || null,
        libelleStatut: libelleStatut(j.statutPromis),
        matchsDepuisPromesse: j.statutPromis ? b.matchs : null,
        titularisationsDepuisPromesse: j.statutPromis ? b.titulaire : null,
        bancDepuisPromesse: j.statutPromis ? b.banc : null,
        partTempsDeJeu: b.part,
        tauxAttendu: b.attendu,
        jugeable: b.jugeable,
        promesseTenue: j.statutPromis ? (b.jugeable ? b.tenue : null) : null,
        demandeEnAttente: !!j.demandeStatutEnAttente,
        demandeTempsDeJeu: !!j.demandeTempsDeJeuEnAttente,
        veutPartir: !!j.veutPartir,
        promessesMaintenues: j.promessesMaintenues || 0,
      };
    });
    const parStatut = {};
    for (const cle of CLES_STATUT) parStatut[cle] = lignes.filter((l) => l.statut === cle).length;
    return {
      lignes,
      parStatut,
      sansStatut: lignes.filter((l) => !l.statut).length,
      promessesRompues: lignes.filter((l) => l.promesseTenue === false).length,
      mecontents: lignes.filter((l) => l.veutPartir || l.demandeEnAttente || l.demandeTempsDeJeu).length,
      moralMoyen: lignes.length
        ? Math.round(lignes.reduce((t, l) => t + l.moral, 0) / lignes.length) : null,
    };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    STATUTS, CLES_STATUT, MATCHS_MINIMUM_EVALUATION, DELAI_REPONSE_STATUT_JOURS,
    libelleStatut, effetMoralAnnonce, definirStatutPromis, bilanPromesse,
    evaluerPromessesStatut, appliquerDecisionStatut, statutInferieur, dossierDynamique,
  });
})(window);
