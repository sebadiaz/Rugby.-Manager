// Mode Club : personnel du club (entraîneur adjoint, préparateur physique,
// médecin, recruteur, analyste vidéo) — un poste par rôle, chacun avec un
// niveau (0-100) qui module RÉELLEMENT un mécanisme existant ailleurs (cf.
// effetPersonnel), et un salaire qui pèse sur les finances comme celui des
// joueurs.
//
// Premier domaine extrait de docs/js/club.js (TODO_AUDIT.md P2-10, tranche
// 1) : entièrement autonome à l'exception de deux aides génériques exportées
// par club.js (choisir, genererNomJoueur). L'ordre de chargement de ce
// fichier par rapport à club.js dans docs/index.html n'a pas d'importance :
// chacun ajoute ses fonctions à RMClub par fusion (Object.assign), jamais
// par réaffectation complète, donc aucun des deux n'écrase l'autre.
(function (global) {
  'use strict';

  const POSTES_PERSONNEL = {
    entraineur: { label: 'Entraîneur adjoint', effet: "Accélère la progression à l'entraînement collectif." },
    preparateur: { label: 'Préparateur physique', effet: 'Réduit la fatigue accumulée et accélère la récupération.' },
    medecin: { label: 'Médecin', effet: 'Réduit la durée des blessures.' },
    recruteur: { label: 'Recruteur', effet: 'Réduit le coût du scouting et affine plus vite les rapports.' },
    analyste: { label: 'Analyste vidéo', effet: "Affine l'analyse de l'adversaire (écarts plus fins détectés)." },
  };
  let compteurPersonnelId = 1;
  function genererMembrePersonnel(rng, poste) {
    const niveau = 40 + Math.floor(rng() * 55); // 40-95
    return {
      id: 'staff' + compteurPersonnelId++,
      nom: global.RMClub.genererNomJoueur(rng),
      poste,
      niveau,
      salaire: Math.round(10 + niveau * 0.35), // k€/saison, ordre de grandeur d'un joueur modeste
    };
  }
  function genererMarchePersonnel(rng, n) {
    const postes = Object.keys(POSTES_PERSONNEL);
    const marche = [];
    for (let i = 0; i < (n || 5); i++) marche.push(genererMembrePersonnel(rng, global.RMClub.choisir(rng, postes)));
    return marche;
  }
  // Un seul membre par poste à la fois (comme un vrai organigramme) : engager
  // un nouvel entraîneur suppose d'abord licencier l'ancien.
  function embaucherPersonnel(saison, candidatId) {
    if (!saison.clubJoueur.personnel) saison.clubJoueur.personnel = [];
    const i = (saison.marchePersonnel || []).findIndex((p) => p.id === candidatId);
    if (i === -1) return { ok: false, motif: 'introuvable' };
    const candidat = saison.marchePersonnel[i];
    if (saison.clubJoueur.personnel.some((p) => p.poste === candidat.poste)) return { ok: false, motif: 'poste_pourvu' };
    saison.marchePersonnel.splice(i, 1);
    saison.clubJoueur.personnel.push(candidat);
    return { ok: true };
  }
  function licencierPersonnel(saison, staffId) {
    const personnel = saison.clubJoueur.personnel || [];
    const avant = personnel.length;
    saison.clubJoueur.personnel = personnel.filter((p) => p.id !== staffId);
    return { ok: saison.clubJoueur.personnel.length < avant };
  }
  function masseSalarialePersonnel(club) {
    return (club.personnel || []).reduce((s, p) => s + p.salaire, 0);
  }
  // Facteur d'effet (>=1, 1 = poste non pourvu, comportement historique
  // inchangé) dérivé du niveau du membre occupant ce poste — chaque
  // consommateur (appliquerEntrainement, faireProgresserBlessures,
  // scouterJoueur, analyserAdversaire, appliquerFatigue, dans docs/js/club.js)
  // l'applique selon son propre sens (voir leurs commentaires respectifs).
  function effetPersonnel(saison, poste) {
    const membre = (saison.clubJoueur.personnel || []).find((p) => p.poste === poste);
    if (!membre) return 1;
    return 1 + membre.niveau / 130; // niveau 95 -> ~1.73x, niveau 40 -> ~1.31x
  }
  // Audit P0-1 (TODO_AUDIT.md) : resynchronisation de compteurPersonnelId
  // après un rechargement de page, appelée par docs/js/club.js
  // (resynchroniserCompteurs) qui ne peut plus muter cette variable
  // directement depuis que le personnel vit dans ce fichier séparé — même
  // logique qu'avant (repart au-delà du plus grand id déjà présent dans la
  // sauvegarde rechargée), juste déplacée là où l'état vit réellement.
  function resynchroniserCompteurPersonnel(maxPersonnel) {
    compteurPersonnelId = Math.max(compteurPersonnelId, maxPersonnel + 1);
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    POSTES_PERSONNEL, genererMembrePersonnel, genererMarchePersonnel,
    embaucherPersonnel, licencierPersonnel, masseSalarialePersonnel,
    effetPersonnel, resynchroniserCompteurPersonnel,
  });
})(window);
