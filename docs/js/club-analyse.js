// Mode Club : analyse du prochain adversaire — moyennes d'attributs RÉELLES
// (avants/ensemble de l'effectif) comparées aux tiennes, plus la forme
// récente RÉELLE tirée du calendrier et l'historique des confrontations —
// jamais de note fabriquée.
//
// Troisième domaine extrait de docs/js/club.js (TODO_AUDIT.md P2-10,
// tranche 3) : autonome à l'exception de deux fonctions du domaine
// calendrier/classement, restées dans club.js (club, classementTrie),
// appelées ici via RMClub.*. Même mécanisme de fusion que les tranches
// précédentes : l'ordre de chargement par rapport à club.js n'a pas
// d'importance.
(function (global) {
  'use strict';

  const POSTES_AVANTS = ['P', 'T', '2L', '3L'];
  function moyenneAttribut(effectif, attr, postes) {
    const pool = postes ? effectif.filter((j) => postes.includes(j.poste)) : effectif;
    if (pool.length === 0) return 0;
    return Math.round(pool.reduce((s, j) => s + (j[attr] != null ? j[attr] : 60), 0) / pool.length);
  }
  const ATTRIBUTS_ANALYSE = [
    { cle: 'melee', label: 'Mêlée', postes: POSTES_AVANTS },
    { cle: 'touche', label: 'Touche', postes: POSTES_AVANTS },
    { cle: 'puissance', label: 'Puissance en contact', postes: null },
    { cle: 'vitesse', label: 'Vitesse', postes: null },
    { cle: 'passe', label: 'Jeu de main', postes: null },
    { cle: 'jeuPied', label: 'Jeu au pied', postes: null },
    { cle: 'discipline', label: 'Discipline', postes: null },
  ];
  // Un analyste vidéo (personnel, cf. docs/js/club-personnel.js,
  // effetPersonnel) abaisse le seuil de détection : il repère des écarts
  // plus fins qu'un manager sans analyste (seuil par défaut 6 points,
  // comportement historique inchangé sans lui).
  function analyserAdversaire(saison, clubId, seuilAnalyste) {
    const adversaire = global.RMClub.club(saison, clubId);
    if (!adversaire) return null;
    const seuil = seuilAnalyste != null ? seuilAnalyste : 6;
    const monEffectif = saison.clubJoueur.effectif;
    const comparaison = ATTRIBUTS_ANALYSE.map((a) => {
      const moi = moyenneAttribut(monEffectif, a.cle, a.postes);
      const eux = moyenneAttribut(adversaire.effectif, a.cle, a.postes);
      return { cle: a.cle, label: a.label, moi, eux, diff: eux - moi };
    });
    const forces = comparaison.filter((c) => c.diff >= seuil).sort((a, b) => b.diff - a.diff);
    const faiblesses = comparaison.filter((c) => c.diff <= -seuil).sort((a, b) => a.diff - b.diff);
    // Forme récente RÉELLE (5 derniers résultats de cet adversaire, tous
    // matchs confondus, y compris contre d'autres IA) — jamais fabriquée.
    const joues = saison.calendrier.filter((f) => f.joue && (f.domicileId === clubId || f.exterieurId === clubId));
    const forme = joues.slice(-5).map((f) => {
      const domicile = f.domicileId === clubId;
      const pour = domicile ? f.score.domicile : f.score.exterieur;
      const contre = domicile ? f.score.exterieur : f.score.domicile;
      return pour > contre ? 'v' : pour < contre ? 'd' : 'n';
    });
    const classement = global.RMClub.classementTrie(saison);
    const position = classement.findIndex((r) => r.clubId === clubId) + 1;
    // Historique des confrontations RÉEL contre CE club précis (cf.
    // enregistrerResultatClubJoueur dans docs/js/club.js) — vide tant
    // qu'aucun match ne l'a opposé au club du joueur, jamais reconstitué
    // après coup.
    const confrontations = (saison.clubJoueur.historiqueConfrontations || {})[clubId] || [];
    return { nom: adversaire.nom, comparaison, forces, faiblesses, forme, position, totalClubs: classement.length, confrontations };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    moyenneAttribut, analyserAdversaire,
  });
})(window);
