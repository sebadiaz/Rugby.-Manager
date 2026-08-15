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

  // --- Recommandation tactique (TODO_AUDIT.md P1-16, ROADMAP_FOOTBALL_MANAGER.md
  // domaines 1+3) : l'analyse de l'adversaire (ci-dessus) était purement
  // informative — le manager devait interpréter lui-même les écarts et
  // régler les 7 axes tactiques à la main, sans aucun lien automatique.
  // Règle simple et déterministe : un écart marqué (>= seuil) sur un
  // attribut de comparaison propose un réglage précis d'UN axe tactique
  // (jamais deux attributs sur le même axe, pour rester lisible) — jamais
  // une note fabriquée, toujours dérivée de la comparaison réelle déjà
  // calculée par analyserAdversaire. ---
  function recommanderTactique(analyse) {
    if (!analyse) return [];
    const parCle = {};
    for (const c of analyse.comparaison) parCle[c.cle] = c.diff; // diff = eux - moi (>0 : ils dominent cet attribut)
    const recommandations = [];
    function ajouter(axe, option, raison) {
      const info = global.RMClub.AXES_TACTIQUE[axe].options[option];
      recommandations.push({ axe, option, libelle: info.nom, raison });
    }
    const d = parCle;
    const seuil = 6;
    if (d.melee != null) {
      if (d.melee <= -seuil) ajouter('avants', 'proche', `Ta mêlée domine largement la leur (écart de ${-d.melee}) : joue près du regroupement pour l'exploiter.`);
      else if (d.melee >= seuil) ajouter('avants', 'large', `Leur mêlée est nettement supérieure (écart de ${d.melee}) : sors vite le ballon, évite le combat direct.`);
    }
    if (d.touche != null) {
      if (d.touche <= -seuil) ajouter('toucheMaul', 'maul', `Ta touche domine largement la leur : cherche le maul après chaque touche gagnée en zone proche.`);
      else if (d.touche >= seuil) ajouter('toucheMaul', 'sol', `Leur touche est nettement supérieure : évite de contester le maul, sors vite le ballon.`);
    }
    if (d.puissance != null) {
      if (d.puissance <= -seuil) ajouter('ligneDef', 'haute', `Tu domines les contacts : presse haut, tu gagneras la plupart des duels.`);
      else if (d.puissance >= seuil) ajouter('ligneDef', 'basse', `Ils sont plus puissants au contact : reste groupé, évite la percée directe.`);
    }
    if (d.vitesse != null) {
      if (d.vitesse <= -seuil) ajouter('style', 'large', `Tu es plus rapide qu'eux : cherche l'espace au large à chaque occasion.`);
      else if (d.vitesse >= seuil) ajouter('style', 'sol', `Ils sont plus rapides que toi : ne leur donne pas d'espace, reste au sol.`);
    }
    if (d.jeuPied != null) {
      if (d.jeuPied <= -seuil) ajouter('pied', 'frequent', `Leur jeu au pied est faible : mets-les sous pression avec des coups de pied fréquents.`);
      else if (d.jeuPied >= seuil) ajouter('pied', 'rare', `Leur jeu au pied est nettement supérieur : évite la bataille au pied, garde le ballon en main.`);
    }
    if (d.discipline != null && d.discipline <= -seuil) {
      ajouter('rythme', 'rapide', `Ils sont indisciplinés : joue vite pour multiplier les rucks et les fautes.`);
    }
    return recommandations;
  }

  // Applique en un clic les réglages recommandés (cf. ci-dessus) à la
  // tactique réellement utilisée en match — modifie directement
  // saison.clubJoueur.tactique, comme un réglage manuel dans l'onglet
  // Tactique (aucune sauvegarde séparée, le joueur garde la main pour
  // ajuster/annuler ensuite comme n'importe quel autre réglage).
  function appliquerRecommandationsTactique(saison, recommandations) {
    const tactique = Object.assign({}, (saison.clubJoueur.tactique && typeof saison.clubJoueur.tactique === 'object') ? saison.clubJoueur.tactique : {});
    for (const r of recommandations) tactique[r.axe] = r.option;
    saison.clubJoueur.tactique = tactique;
    return tactique;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    analyserAdversaire, recommanderTactique, appliquerRecommandationsTactique,
  });
})(window);
