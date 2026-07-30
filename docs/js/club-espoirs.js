// Match espoirs (Mode Club) — domaine dédié au centre de formation (cf.
// club-centre-formation.js). Audit ("pas de tournois junior") : le centre de
// formation jouait déjà des minutes via l'Équipe B (mélangé aux réservistes
// pro, cf. club-equipe-b.js), mais n'avait jamais de match RÉSERVÉ à lui
// seul. Ajoute un match occasionnel (une journée sur PERIODE_JOURNEES_ESPOIRS),
// réellement simulé par le moteur complet, contre un adversaire synthétique
// (académie rivale, même principe que le "B synthétique" de l'Équipe B,
// cf. clubUI.js) — PAS une compétition à classement multi-clubs, qui
// exigerait de donner un centre de formation à CHAQUE club IA (hors
// périmètre de cette première tranche, cf. TODO_AUDIT.md).
(function (global) {
  'use strict';

  // Une journée sur 4 (pas chaque journée, comme Équipe B, pour ne pas
  // noyer le signal) — ~6-7 matchs espoirs sur une saison de 26 journées.
  const PERIODE_JOURNEES_ESPOIRS = 4;

  function journeeDeMatchEspoirs(journee) {
    return journee % PERIODE_JOURNEES_ESPOIRS === 0;
  }

  // Un XV complet peut-il être aligné avec les espoirs DU JOUR ? Certains
  // ont pu être promus en pro entre-temps (cf. promouvoirJeune) : jamais
  // supposé, toujours vérifié comme pour n'importe quelle composition.
  function eligiblePourMatchEspoirs(saison) {
    const jeunes = saison.clubJoueur.jeunes || [];
    const composition = global.RMClub.meilleureComposition(jeunes);
    return global.RMClub.validerComposition(composition).length === 0;
  }

  // Adversaire synthétique nettement plus modeste que le "B" d'Équipe B
  // (facteur 0,65 côté pro) : des espoirs 16-18 ans n'ont pas le niveau
  // d'une réserve professionnelle.
  function niveauAdversaireEspoirs(niveauClubAdverse) {
    return Math.max(0.05, (niveauClubAdverse != null ? niveauClubAdverse : 0.5) * 0.35);
  }

  // Conséquences réelles pour les espoirs alignés (même principe qu'Équipe
  // B, cf. appliquerEffetsMatchEquipeB) : du temps de jeu → fatigue, un
  // léger regain de moral — jamais un effet décoratif.
  function appliquerEffetsMatchEspoirs(saison, composition) {
    const parId = {};
    for (const j of (saison.clubJoueur.jeunes || [])) parId[j.id] = j;
    for (const id of Object.values(composition)) {
      const j = parId[id];
      if (!j) continue;
      j.matchsJoues = (j.matchsJoues || 0) + 1;
      j.fatigue = Math.min(100, (j.fatigue || 0) + 15);
      j.moral = Math.min(100, (j.moral != null ? j.moral : 65) + 2);
    }
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    PERIODE_JOURNEES_ESPOIRS, journeeDeMatchEspoirs,
    eligiblePourMatchEspoirs, niveauAdversaireEspoirs, appliquerEffetsMatchEspoirs,
  });
})(window);
