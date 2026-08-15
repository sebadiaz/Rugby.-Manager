// Carrière du manager (Mode Club) — TODO_AUDIT.md P1-42.
//
// AVANT, le joueur créait un club et y restait POUR TOUJOURS. La confiance du
// président montait et descendait sans la moindre conséquence, et tout le
// domaine 8 de la roadmap (« Carrière du manager ») était vide : ni profil,
// ni réputation, ni licenciement, ni offre, ni possibilité de changer de club
// sans recommencer une partie.
//
// LA SOURCE DE VÉRITÉ est `saison.manager`, DÉLIBÉRÉMENT hors de
// `saison.clubJoueur` : c'est ce qui permet de changer de club sans rien
// perdre de la carrière personnelle. Le club, lui, garde ce qui lui
// appartient (effectif, finances, historique de SES saisons).
//
// Rien n'est tiré au hasard ici : la réputation dérive uniquement de
// résultats réellement produits par la simulation.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  const REPUTATION_DEPART = 45;

  // --- Profil -------------------------------------------------------------
  function creerManager(nom, clubId, clubNom, numeroSaison, dateISO) {
    return {
      id: 'mgr-' + String(clubId || 'x') + '-' + String(numeroSaison || 1),
      nom: nom || 'Manager',
      reputation: REPUTATION_DEPART,
      clubActuelId: clubId || null,
      statut: clubId ? 'enPoste' : 'sansClub',
      saisonsDirigees: 0,
      // Un poste = une ligne. `jusquaSaison` reste null tant qu'on y est.
      historiqueClubs: clubId ? [{
        clubId, clubNom: clubNom || null,
        depuisSaison: numeroSaison || 1, jusquaSaison: null, arriveeISO: dateISO || null,
      }] : [],
      // Résultats PAR SAISON, du point de vue du manager (le club, lui, a son
      // propre historiqueSaisons) : c'est ce qui survit à un changement de club.
      saisons: [],
      promotions: 0,
      relegations: 0,
      avertissements: [],
      // Offres reçues. `statut` : 'ouverte' | 'refusee' | 'acceptee'.
      offres: [],
    };
  }

  // Crée le profil s'il manque (nouvelle partie ET migration d'une ancienne
  // sauvegarde) sans jamais écraser un profil existant.
  function assurerManager(saison, nom) {
    if (saison.manager && saison.manager.id) return saison.manager;
    const RMClub = global.RMClub;
    const c = saison.clubJoueur || {};
    const dateISO = (RMClub.dateISO && RMClub.dateCourante)
      ? RMClub.dateISO(RMClub.dateCourante(saison)) : null;
    saison.manager = creerManager(nom, c.id || null, c.nom || null, saison.numero || 1, dateISO);
    // Une carrière déjà entamée n'a pas commencé aujourd'hui : on reprend le
    // nombre de saisons DÉJÀ dirigées dans ce club, pour ne pas faire passer
    // un vétéran pour un débutant.
    const dejaJouees = (c.historiqueSaisons || []).length;
    if (dejaJouees) {
      saison.manager.saisonsDirigees = dejaJouees;
      saison.manager.historiqueClubs[0].depuisSaison = Math.max(1, (saison.numero || 1) - dejaJouees);
    }
    return saison.manager;
  }

  // --- Réputation ---------------------------------------------------------
  // Uniquement des résultats RÉELS, aucun tirage : deux fois le même bilan
  // donne exactement le même gain (test dédié).
  //
  // `bilan` : { position, totalClubs, objectifAtteint, mouvement,
  //             niveauDivision (1 = élite), deltaBudget, coupe }
  function gainReputation(bilan) {
    const b = bilan || {};
    const total = Math.max(2, b.totalClubs || 14);
    const position = Math.max(1, Math.min(total, b.position || total));
    // Rang relatif : 1 pour le champion, 0 pour le dernier.
    const rang = 1 - (position - 1) / (total - 1);
    let points = Math.round((rang - 0.5) * 12);          // -6 … +6

    if (b.objectifAtteint === true) points += 5;
    else if (b.objectifAtteint === false) points -= 6;

    // Une promotion vaut d'autant plus qu'on l'obtient BAS dans la pyramide :
    // c'est l'exploit d'un petit club, pas la routine d'un grand.
    const niveau = b.niveauDivision != null ? b.niveauDivision : 2;
    if (b.mouvement === 'promotion') points += 8 + niveau * 2;   // niveau 3 -> +14
    else if (b.mouvement === 'relegation') points -= 8 + (4 - niveau) * 2;

    // Un parcours en coupe compte, sans écraser le championnat.
    if (b.coupe === 'vainqueur') points += 10;
    else if (b.coupe === 'finaliste') points += 5;

    // Santé financière laissée au club : petit effet, borné.
    const db = b.deltaBudget || 0;
    points += Math.max(-3, Math.min(3, Math.round(db / 100)));
    return points;
  }

  function appliquerReputation(reputationAvant, bilan) {
    const avant = reputationAvant != null ? reputationAvant : REPUTATION_DEPART;
    return Math.max(0, Math.min(100, avant + gainReputation(bilan)));
  }

  // --- Sécurité de l'emploi ----------------------------------------------
  // Réutilise la confiance du président DÉJÀ existante (cf. club-direction.js
  // et evaluerObjectifSaison) : on n'invente pas une seconde jauge.
  const SEUIL_SATISFAITE = 55;
  const SEUIL_PRESSION = 35;
  const SEUIL_AVERTISSEMENT = 15;
  const ECHECS_AVANT_LICENCIEMENT = 2;

  function echecsConsecutifs(manager) {
    const saisons = (manager && manager.saisons) || [];
    let n = 0;
    for (let i = saisons.length - 1; i >= 0; i--) {
      if (saisons[i].objectifAtteint === false) n++;
      else break;
    }
    return n;
  }

  function securiteEmploi(saison) {
    const m = saison.manager;
    const c = saison.clubJoueur || {};
    const confiance = c.confiancePresident != null ? c.confiancePresident : 60;
    const echecs = echecsConsecutifs(m);
    if (!m || m.statut === 'sansClub') {
      return { niveau: 'sansClub', confiance, echecs,
        libelle: 'Sans club', explication: 'Tu es libre de tout engagement : consulte les postes disponibles.' };
    }
    if (confiance >= SEUIL_SATISFAITE) {
      return { niveau: 'satisfaite', confiance, echecs, libelle: 'Direction satisfaite',
        explication: `La direction te soutient (confiance ${confiance} %).` };
    }
    if (confiance >= SEUIL_PRESSION) {
      return { niveau: 'sousPression', confiance, echecs, libelle: 'Sous pression',
        explication: `La direction attend mieux (confiance ${confiance} %). Un nouvel échec pèserait lourd.` };
    }
    // Un licenciement ne tombe JAMAIS sur un mauvais match : il faut une
    // confiance au plancher ET plusieurs saisons manquées d'affilée.
    if (confiance < SEUIL_AVERTISSEMENT && echecs >= ECHECS_AVANT_LICENCIEMENT) {
      return { niveau: 'licenciement', confiance, echecs, libelle: 'Poste intenable',
        explication: `Confiance ${confiance} % après ${echecs} saisons sans atteindre l'objectif : la direction met fin à ta mission.` };
    }
    return { niveau: 'avertissement', confiance, echecs, libelle: 'Avertissement officiel',
      explication: `Confiance ${confiance} % : la direction t'adresse un avertissement formel. ` +
        (echecs >= 1 ? `${echecs} saison(s) sans objectif atteint.` : 'Les résultats doivent remonter.') };
  }

  function licencierManager(saison, raison) {
    const RMClub = global.RMClub;
    const m = assurerManager(saison);
    if (m.statut === 'sansClub') return false;
    const enCours = m.historiqueClubs[m.historiqueClubs.length - 1];
    if (enCours && enCours.jusquaSaison == null) enCours.jusquaSaison = saison.numero || 1;
    m.statut = 'sansClub';
    m.clubActuelId = null;
    m.avertissements.push({ type: 'licenciement', saison: saison.numero || 1, raison: raison || null });
    // Un licenciement coûte de la réputation, mais ne l'anéantit pas : un
    // manager renvoyé reste employable plus bas.
    m.reputation = Math.max(0, m.reputation - 8);
    if (RMClub.ajouterMessage) {
      RMClub.ajouterMessage(saison, 'direction', 'Licenciement',
        `${raison || 'Résultats insuffisants'}. Tu quittes ${saison.clubJoueur.nom}. ` +
        'Consulte les postes disponibles dans l\'onglet Bilan.');
    }
    return true;
  }

  // --- Offres d'emploi ----------------------------------------------------
  // Uniquement des clubs qui EXISTENT dans la pyramide (saison.adversaires) :
  // aucun club fictif créé pour l'occasion, aucun monde parallèle.
  const MAX_OFFRES = 4;

  function positionDe(saison, clubId) {
    const classement = global.RMClub.classementTrie(saison);
    const i = classement.findIndex((r) => r.clubId === clubId);
    return i === -1 ? null : i + 1;
  }

  // Un club vise un manager dont la réputation correspond à son niveau. Un
  // club en difficulté est moins regardant : c'est ce qui donne toujours une
  // porte de sortie à un manager licencié.
  function exigenceClub(club, position, total) {
    const niveau = club.niveauClub != null ? club.niveauClub : 0.5;
    let exigence = 20 + niveau * 60;
    if (position != null && total) {
      const bas = position / total;
      if (bas > 0.75) exigence -= 18;       // lanterne rouge : prend qui veut
      else if (bas > 0.5) exigence -= 8;
    }
    return Math.max(5, Math.round(exigence));
  }

  function raisonInteret(position, total, exigence, reputation) {
    if (position != null && total && position / total > 0.75) {
      return 'Le club est en grande difficulté et cherche un redressement immédiat.';
    }
    if (reputation >= exigence + 20) return 'Ta réputation dépasse largement les attentes du club.';
    if (position != null && total && position / total <= 0.3) {
      return 'Le club vise le haut du tableau et veut un manager pour franchir un palier.';
    }
    return 'Le club cherche un manager capable de stabiliser ses résultats.';
  }

  // Les offres sont DÉRIVÉES de l'état du monde, pas stockées : on ne garde
  // que les décisions déjà prises (refus/acceptation), pour qu'une offre
  // refusée ne revienne pas.
  function offresDisponibles(saison) {
    const RMClub = global.RMClub;
    const m = assurerManager(saison);
    const decidees = new Set((m.offres || []).filter((o) => o.statut !== 'ouverte').map((o) => o.clubId));
    const classement = RMClub.classementTrie(saison);
    const total = classement.length;
    const candidats = [];
    for (const club of (saison.adversaires || [])) {
      if (decidees.has(club.id)) continue;
      const position = positionDe(saison, club.id);
      const exigence = exigenceClub(club, position, total);
      if (m.reputation < exigence) continue;
      candidats.push({ club, position, exigence });
    }
    // Les postes les plus flatteurs d'abord : un club exigeant qui t'accepte
    // vaut mieux qu'un club au bord du gouffre.
    candidats.sort((a, b) => b.exigence - a.exigence);
    return candidats.slice(0, MAX_OFFRES).map(({ club, position, exigence }) => ({
      id: 'offre-' + club.id + '-' + (saison.numero || 1),
      clubId: club.id,
      clubNom: club.nom,
      division: RMClub.nomPalierFrance
        ? RMClub.nomPalierFrance((saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau) : 'Championnat',
      position,
      totalClubs: total,
      objectif: position != null && total && position / total > 0.75
        ? 'Assurer le maintien' : 'Faire mieux que la saison passée',
      budget: club.budget != null ? club.budget : null,
      // Un club qui te veut vraiment démarre plus haut qu'un club résigné.
      confianceInitiale: Math.max(40, Math.min(75, 50 + Math.round((m.reputation - exigence) / 3))),
      raison: raisonInteret(position, total, exigence, m.reputation),
      exigence,
    }));
  }

  function enregistrerDecisionOffre(saison, offreId, statut) {
    const m = assurerManager(saison);
    const offre = offresDisponibles(saison).find((o) => o.id === offreId);
    if (!offre) return null;
    m.offres.push({ id: offre.id, clubId: offre.clubId, clubNom: offre.clubNom,
      saison: saison.numero || 1, statut });
    return offre;
  }

  function refuserOffre(saison, offreId) {
    return !!enregistrerDecisionOffre(saison, offreId, 'refusee');
  }

  function accepterOffre(saison, offreId) {
    const offre = enregistrerDecisionOffre(saison, offreId, 'acceptee');
    if (!offre) return false;
    changerClubManager(saison, offre.clubId, {
      confianceInitiale: offre.confianceInitiale, objectifLibelle: offre.objectif,
    });
    return true;
  }

  // --- Changement de club : LA fonction centrale --------------------------
  // Testable sans DOM. Elle échange le club dirigé et un club du monde SANS
  // rien régénérer : le nouveau club garde son identité et son effectif
  // RÉELS, l'ancien continue d'exister comme club IA avec les siens. Le
  // monde, le numéro de saison, la date, les compétitions et les classements
  // ne bougent pas — on ne relance pas une partie.
  function changerClubManager(saison, clubId, options) {
    const RMClub = global.RMClub;
    const o = options || {};
    const m = assurerManager(saison);
    const idx = (saison.adversaires || []).findIndex((a) => a.id === clubId);
    if (idx === -1) return false;
    const cible = saison.adversaires[idx];
    const ancien = saison.clubJoueur;

    // 1. L'ancien club redevient un club du monde : identité, effectif,
    // niveau et budget conservés. Ses résultats vivent déjà dans
    // `saison.classement`, qui est indexé par id — rien à recopier.
    const ancienIA = {
      id: ancien.id, nom: ancien.nom, couleur: ancien.couleur,
      niveauClub: ancien.niveauClub,
      effectif: ancien.effectif,
      budget: ancien.budget,
      // Ce que le club a accompli sous cette direction lui reste attaché.
      historiqueSaisons: ancien.historiqueSaisons || [],
    };
    if (ancien.groupe) ancienIA.groupe = ancien.groupe;
    if (ancien.banc) ancienIA.banc = ancien.banc;

    // 2. Le club cible devient le club dirigé. On PART de son objet réel pour
    // ne perdre ni son id, ni son nom, ni son effectif, ni ses résultats.
    const rng = (global.RugbyEngine && global.RugbyEngine.creerRng)
      ? global.RugbyEngine.creerRng(((saison.graine || 1) ^ hachage(cible.id)) >>> 0)
      : () => 0.5;
    const nouveau = Object.assign({}, cible, {
      // Champs propres à un club DIRIGÉ, absents d'un club IA.
      sponsor: cible.sponsor || (RMClub.genererSponsor ? RMClub.genererSponsor(rng, cible.niveauClub) : null),
      personnel: [],
      tactique: { style: 'equilibre', avants: 'equilibre', rythme: 'normal', ligneDef: 'normale', pied: 'normal', toucheMaul: 'equilibre' },
      historiqueFinances: [],
      statsCumulees: null,
      compositionTitulaires: null,
      compositionBanc: null,
      capitaineId: null,
      buteurId: null,
      lanceurToucheId: null,
      entrainementFocus: 'physique',
      historiqueSaisons: cible.historiqueSaisons || [],
      historiqueConfrontations: {},
      // La boîte de réception suit le POSTE, pas la personne : on arrive dans
      // un club sans hériter des messages du précédent.
      messages: [],
      confiancePresident: o.confianceInitiale != null ? o.confianceInitiale : 55,
      objectifSaison: ancien.objectifSaison ? Object.assign({}, ancien.objectifSaison) : null,
      jeunes: cible.jeunes || (RMClub.genererCentreFormation
        ? RMClub.genererCentreFormation(rng, cible.niveauClub) : []),
      palierPyramide: ancien.palierPyramide
        ? { pays: ancien.palierPyramide.pays, niveau: ancien.palierPyramide.niveau }
        : { pays: 'FRA', niveau: 3 },
      qualificationEuropeenne: null,
    });
    // Effectif : on part du GROUPE RÉEL du club (24 joueurs persistés depuis
    // P1-29, cf. club-effectif-adverse.js) plutôt que de sa seule feuille de
    // match à 15 — ce sont ses joueurs, avec leurs vrais noms et attributs.
    // Aucun n'est remplacé.
    const groupeReel = RMClub.groupeAdverse ? RMClub.groupeAdverse(saison, cible) : null;
    if (groupeReel && groupeReel.length >= nouveau.effectif.length) {
      const vus = new Set(groupeReel.map((j) => j.id));
      // Les titulaires de la feuille de match qui ne seraient pas dans le
      // groupe (sauvegarde ancienne) sont conservés : on n'en perd aucun.
      nouveau.effectif = groupeReel.concat(nouveau.effectif.filter((j) => !vus.has(j.id)));
    }
    // Filet : si le club n'a vraiment pas de quoi remplir un banc, on complète
    // en profondeur SANS toucher aux joueurs existants.
    if (nouveau.effectif.length < 23 && RMClub.genererEffectifEtendu) {
      const complement = RMClub.genererEffectifEtendu(rng, cible.niveauClub)
        .slice(0, 24 - nouveau.effectif.length);
      nouveau.effectif = nouveau.effectif.concat(complement);
    }

    saison.adversaires[idx] = ancienIA;
    saison.clubJoueur = nouveau;

    // 3. Aucun identifiant de l'ancien club ne doit survivre dans les écrans
    // ni dans les compositions. On efface les slots secondaires et le
    // contexte d'équipe : ils seront recomposés à la demande avec le NOUVEL
    // effectif (cf. assurerCompositionPourEquipe).
    saison.compositions = null;
    if (saison.clubJoueur.navigationClub) saison.clubJoueur.navigationClub = null;

    // 4. La carrière personnelle, elle, continue.
    const enCours = m.historiqueClubs[m.historiqueClubs.length - 1];
    if (enCours && enCours.jusquaSaison == null) enCours.jusquaSaison = saison.numero || 1;
    m.historiqueClubs.push({
      clubId: nouveau.id, clubNom: nouveau.nom,
      depuisSaison: saison.numero || 1, jusquaSaison: null,
      arriveeISO: (RMClub.dateISO && RMClub.dateCourante)
        ? RMClub.dateISO(RMClub.dateCourante(saison)) : null,
    });
    m.clubActuelId = nouveau.id;
    m.statut = 'enPoste';
    if (RMClub.ajouterMessage) {
      RMClub.ajouterMessage(saison, 'direction', 'Nouveau poste',
        `Tu prends les commandes de ${nouveau.nom}. Confiance initiale : ${nouveau.confiancePresident} %.`);
    }
    // Nouveau club, nouvelle direction, nouvelles attentes : la feuille de
    // route de l'ancien club n'a plus aucun sens ici (budget, centre de
    // formation et objectif sont ceux d'un autre club).
    delete nouveau.feuilleDeRoute;
    if (RMClub.annoncerFeuilleDeRoute) RMClub.annoncerFeuilleDeRoute(saison);
    return true;
  }

  // Hachage stable d'une chaîne (FNV-1a) : sert uniquement à dériver une
  // graine reproductible, jamais un résultat de jeu.
  function hachage(texte) {
    let h = 0x811c9dc5;
    const s = String(texte || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // --- Fin de saison ------------------------------------------------------
  // Appelée par avancerSaison, avec le bilan RÉEL déjà calculé là-bas : on ne
  // recalcule rien, on enregistre et on en tire les conséquences.
  function enregistrerSaisonManager(saison, bilan) {
    const m = assurerManager(saison);
    const b = bilan || {};
    m.saisons.push({
      numeroSaison: b.numeroSaison || saison.numero || 1,
      clubId: saison.clubJoueur.id, clubNom: saison.clubJoueur.nom,
      position: b.position, totalClubs: b.totalClubs,
      objectifAtteint: b.objectifAtteint,
      mouvement: b.mouvement || null,
      niveauDivision: b.niveauDivision,
      budgetFin: b.budgetFin,
    });
    if (m.saisons.length > 40) m.saisons.shift();
    m.saisonsDirigees += 1;
    m.reputation = appliquerReputation(m.reputation, b);
    if (b.mouvement === 'promotion') m.promotions += 1;
    else if (b.mouvement === 'relegation') m.relegations += 1;
    return m;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    assurerManager, gainReputation, appliquerReputation, securiteEmploi,
    licencierManager, offresDisponibles, refuserOffre, accepterOffre, changerClubManager,
    enregistrerSaisonManager,
  });
})(window);
