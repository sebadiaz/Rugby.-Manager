// Inscription des joueurs aux compétitions (Mode Club).
//
// Audit mesuré avant : AUCUNE occurrence d'inscription ou d'éligibilité à une
// compétition dans tout docs/js. Conséquences concrètes en jeu :
//   - un joueur recruté la veille d'une finale pouvait la disputer ;
//   - un joueur de 32 ans pouvait jouer le championnat espoirs ;
//   - la taille de l'effectif n'était contrainte par rien ;
//   - recruter tard ne coûtait donc rien, et le manager n'avait aucune
//     décision d'effectif à prendre en début de saison.
//
// Ce module apporte la décision manquante : QUI inscrire, avant une date
// limite, dans un nombre de places fini. Une fois la fenêtre fermée, le choix
// engage la saison — un joueur non inscrit ne peut pas être aligné.
//
// Trois principes, pour ne casser aucune partie en cours :
//   1. l'effectif éligible est inscrit d'office tant que la fenêtre est
//      ouverte (une carrière existante ne se retrouve jamais sans équipe) ;
//   2. les places sont attribuées aux MEILLEURS d'abord quand l'effectif
//      dépasse le plafond — jamais au hasard ;
//   3. tout refus porte un motif ET un message lisible.
//
// Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Règles par compétition. Une coupe hérite de l'équipe qui la dispute
  // (cf. club-coupes.js, equipePourCoupe) : il n'existe pas deux endroits qui
  // décident quelle équipe joue quoi.
  //
  // Le plafond n'est pas décoratif : mesuré, l'effectif professionnel compte
  // 24 joueurs et l'Équipe B pioche dans 39 — 30 places obligent donc à
  // trancher dès que le groupe s'étoffe, sans bloquer un club modeste.
  const PLAFOND_PRO = 30;
  const PLAFOND_B = 30;
  const PLAFOND_ESPOIRS = 26;
  const AGE_MAX_ESPOIRS = 21;
  // Jours après le début de la saison où la fenêtre se referme. Assez tard
  // pour laisser le mercato d'intersaison se terminer, assez tôt pour que le
  // choix engage vraiment la saison.
  const JOURS_AVANT_CLOTURE = 30;

  const REGLES = {
    joueur: { equipe: 'pro', maxJoueurs: PLAFOND_PRO, ageMax: null, nom: 'Championnat' },
    equipeB: { equipe: 'b', maxJoueurs: PLAFOND_B, ageMax: null, nom: 'Championnat Équipe B' },
    espoirs: { equipe: 'jeunes', maxJoueurs: PLAFOND_ESPOIRS, ageMax: AGE_MAX_ESPOIRS, nom: 'Championnat des espoirs' },
  };

  function reglesInscription(ref) {
    if (!ref) return null;
    if (REGLES[ref]) return Object.assign({ ref }, REGLES[ref]);
    if (ref.indexOf('coupe:') === 0) {
      const cle = ref.slice('coupe:'.length);
      // La règle d'équipe vient du moteur de coupes, jamais recopiée ici.
      const equipe = global.RMClub.equipePourCoupe ? global.RMClub.equipePourCoupe(cle) : 'pro';
      const base = equipe === 'jeunes' ? REGLES.espoirs : equipe === 'b' ? REGLES.equipeB : REGLES.joueur;
      return { ref, equipe, maxJoueurs: base.maxJoueurs, ageMax: base.ageMax, nom: 'Coupe' };
    }
    return null;
  }

  // Les compétitions du club qui demandent une inscription — celles de ses
  // trois équipes, et rien d'autre : on n'inscrit pas de joueurs au
  // championnat japonais.
  function competitionsInscriptibles(saison) {
    const RMClub = global.RMClub;
    const refs = [];
    for (const equipe of ['pro', 'b', 'jeunes']) {
      for (const c of (RMClub.competitionsDeLEquipe(saison, equipe) || [])) refs.push(c.ref);
    }
    return refs;
  }

  function registre(saison) {
    if (!saison.inscriptions || typeof saison.inscriptions !== 'object') saison.inscriptions = {};
    return saison.inscriptions;
  }

  // Date limite d'inscription : une VRAIE date du calendrier de la saison,
  // pas un compteur abstrait.
  function dateLimiteInscription(saison) {
    const RMClub = global.RMClub;
    const debut = saison.dateDebut
      ? RMClub.dateDepuisISO(saison.dateDebut)
      : RMClub.dateCourante(saison);
    return RMClub.dateISO(RMClub.ajouterJours(debut, JOURS_AVANT_CLOTURE));
  }

  function fenetreOuverte(saison, dateLimite) {
    const RMClub = global.RMClub;
    return RMClub.comparerDates(RMClub.dateCourante(saison),
      RMClub.dateDepuisISO(dateLimite)) <= 0;
  }

  // Note d'un joueur : sert UNIQUEMENT à départager quand l'effectif dépasse
  // le plafond. Même lecture que partout ailleurs (cf. noteGlobale).
  function note(j) {
    if (global.RMClub.noteGlobale) return global.RMClub.noteGlobale(j);
    return (j.vitesse || 0) + (j.plaquage || 0);
  }

  // N'importe quel joueur du club, quelle que soit son équipe.
  function joueurDuClub(saison, joueurId) {
    for (const equipe of ['pro', 'b', 'jeunes']) {
      const trouve = (global.RMClub.effectifPourEquipe(saison, equipe) || [])
        .find((j) => j.id === joueurId);
      if (trouve) return trouve;
    }
    return null;
  }

  // Un joueur est-il éligible à cette compétition, et sinon pourquoi ?
  function eligibilite(saison, ref, joueur) {
    const regles = reglesInscription(ref);
    if (!regles) return { eligible: false, motif: 'competitionInconnue', message: 'Compétition inconnue.' };
    if (!joueur) return { eligible: false, motif: 'joueurInconnu', message: 'Joueur introuvable.' };
    const effectif = global.RMClub.effectifPourEquipe(saison, regles.equipe) || [];
    if (!effectif.some((j) => j.id === joueur.id)) {
      return { eligible: false, motif: 'horsEffectif',
        message: `${joueur.nom} n'appartient pas à cette équipe.` };
    }
    if (regles.ageMax != null && (joueur.age || 0) > regles.ageMax) {
      return { eligible: false, motif: 'age',
        message: `${joueur.nom} a ${joueur.age} ans : cette compétition est réservée aux moins de ${regles.ageMax + 1} ans.` };
    }
    return { eligible: true, motif: null, message: null };
  }

  // Crée ou complète le registre. Tant que la fenêtre est OUVERTE, l'effectif
  // éligible est inscrit d'office : une carrière existante ne doit jamais se
  // retrouver sans équipe alignable à cause de cette nouveauté. Une fois la
  // fenêtre fermée, plus rien n'est ajouté — c'est là que le choix engage.
  function assurerInscriptions(saison) {
    const reg = registre(saison);
    const dateLimite = dateLimiteInscription(saison);
    for (const ref of competitionsInscriptibles(saison)) {
      const regles = reglesInscription(ref);
      if (!regles) continue;
      if (!reg[ref]) reg[ref] = { joueurs: [], dateLimite };
      const dossier = reg[ref];
      if (!Array.isArray(dossier.joueurs)) dossier.joueurs = [];
      if (!dossier.dateLimite) dossier.dateLimite = dateLimite;
      // Purge : un joueur parti du club ne reste pas inscrit.
      const effectif = global.RMClub.effectifPourEquipe(saison, regles.equipe) || [];
      const presents = new Set(effectif.map((j) => j.id));
      dossier.joueurs = dossier.joueurs.filter((id) => presents.has(id));
      if (!fenetreOuverte(saison, dossier.dateLimite)) continue;
      // Complète avec les éligibles, les meilleurs d'abord.
      const candidats = effectif
        .filter((j) => eligibilite(saison, ref, j).eligible)
        .filter((j) => dossier.joueurs.indexOf(j.id) === -1)
        .sort((a, b) => note(b) - note(a));
      for (const j of candidats) {
        if (dossier.joueurs.length >= regles.maxJoueurs) break;
        dossier.joueurs.push(j.id);
      }
    }
    return reg;
  }

  function estInscrit(saison, ref, joueurId) {
    const d = registre(saison)[ref];
    return !!(d && d.joueurs && d.joueurs.indexOf(joueurId) !== -1);
  }

  function inscrireJoueur(saison, ref, joueurId) {
    const regles = reglesInscription(ref);
    if (!regles) return { ok: false, motif: 'competitionInconnue', message: 'Compétition inconnue.' };
    const reg = registre(saison);
    const dossier = reg[ref];
    if (!dossier) return { ok: false, motif: 'competitionInconnue', message: 'Cette compétition n\'accepte pas d\'inscription.' };
    if (!fenetreOuverte(saison, dossier.dateLimite)) {
      return { ok: false, motif: 'fenetreFermee',
        message: 'La date limite d\'inscription est passée : la liste est figée pour la saison.' };
    }
    if (estInscrit(saison, ref, joueurId)) {
      return { ok: false, motif: 'dejaInscrit', message: 'Ce joueur est déjà inscrit.' };
    }
    // On cherche le joueur dans TOUT le club, pas seulement dans l'effectif
    // visé : sinon un joueur professionnel qu'on tenterait d'inscrire en
    // espoirs serait déclaré « introuvable » alors qu'il existe — le motif
    // utile est « il n'appartient pas à cette équipe ».
    const joueur = joueurDuClub(saison, joueurId);
    const e = eligibilite(saison, ref, joueur);
    if (!e.eligible) return { ok: false, motif: e.motif, message: e.message };
    if (dossier.joueurs.length >= regles.maxJoueurs) {
      return { ok: false, motif: 'plafond',
        message: `La liste est complète (${regles.maxJoueurs} places) : désinscris un joueur d'abord.` };
    }
    dossier.joueurs.push(joueurId);
    return { ok: true, message: `${joueur.nom} est inscrit.` };
  }

  function desinscrireJoueur(saison, ref, joueurId) {
    const reg = registre(saison);
    const dossier = reg[ref];
    if (!dossier) return { ok: false, motif: 'competitionInconnue', message: 'Compétition inconnue.' };
    if (!fenetreOuverte(saison, dossier.dateLimite)) {
      return { ok: false, motif: 'fenetreFermee',
        message: 'La date limite est passée : la liste est figée pour la saison.' };
    }
    const i = dossier.joueurs.indexOf(joueurId);
    if (i === -1) return { ok: false, motif: 'nonInscrit', message: 'Ce joueur n\'est pas inscrit.' };
    dossier.joueurs.splice(i, 1);
    return { ok: true, message: 'Joueur retiré de la liste.' };
  }

  // Les joueurs d'une composition qui NE SONT PAS inscrits. Renvoie des
  // objets nommés : le message affiché doit dire QUI pose problème.
  function joueursNonInscrits(saison, ref, composition) {
    const regles = reglesInscription(ref);
    if (!regles || !composition) return [];
    if (!registre(saison)[ref]) return [];
    const effectif = global.RMClub.effectifPourEquipe(saison, regles.equipe) || [];
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const vus = new Set();
    const manquants = [];
    for (const id of Object.values(composition)) {
      if (!id || vus.has(id)) continue;
      vus.add(id);
      if (estInscrit(saison, ref, id)) continue;
      const j = parId[id];
      manquants.push({ id, nom: j ? j.nom : id, poste: j ? j.poste : null });
    }
    return manquants;
  }

  // Tout ce que l'écran doit afficher, sans rien recouper lui-même.
  function dossierInscriptions(saison, ref) {
    const regles = reglesInscription(ref);
    if (!regles) return null;
    const dossier = registre(saison)[ref];
    if (!dossier) return null;
    const effectif = global.RMClub.effectifPourEquipe(saison, regles.equipe) || [];
    const candidats = effectif.map((j) => {
      const e = eligibilite(saison, ref, j);
      return {
        id: j.id, nom: j.nom, poste: j.poste, age: j.age,
        inscrit: estInscrit(saison, ref, j.id),
        eligible: e.eligible, motif: e.motif, message: e.message,
      };
    }).sort((a, b) => (b.inscrit ? 1 : 0) - (a.inscrit ? 1 : 0) || (a.nom < b.nom ? -1 : 1));
    return {
      ref, nom: regles.nom, equipe: regles.equipe,
      maxJoueurs: regles.maxJoueurs, ageMax: regles.ageMax,
      dateLimite: dossier.dateLimite,
      ouverte: fenetreOuverte(saison, dossier.dateLimite),
      inscrits: dossier.joueurs.slice(),
      placesRestantes: Math.max(0, regles.maxJoueurs - dossier.joueurs.length),
      candidats,
      nonEligibles: candidats.filter((c) => !c.eligible).length,
    };
  }

  // Fin de saison : les listes de la saison écoulée n'ont plus de sens (les
  // compétitions sont régénérées, les effectifs ont bougé).
  function reinitialiserInscriptions(saison) {
    saison.inscriptions = {};
    return saison.inscriptions;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    reglesInscription, assurerInscriptions, estInscrit, inscrireJoueur,
    desinscrireJoueur, joueursNonInscrits, dossierInscriptions,
    dateLimiteInscription, competitionsInscriptibles, reinitialiserInscriptions,
    AGE_MAX_ESPOIRS,
  });
})(window);
