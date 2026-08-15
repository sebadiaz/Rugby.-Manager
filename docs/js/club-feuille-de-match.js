// La feuille de match (Mode Club) — le compte rendu de la rencontre.
//
// Ce qui existait avant ce fichier : rien. Après un match simulé, le joueur
// voyait un badge (Victoire/Défaite), un score et une ligne de détail. Aucune
// chronologie, aucun marqueur, aucun compte rendu.
//
// Et il était IMPOSSIBLE d'en produire un : le moteur ne gardait que les 30
// derniers événements du match (fenêtre glissante dimensionnée pour le fil
// temps réel). Mesuré sur un match complet : ces 30 entrées étaient toutes
// postérieures à la 78e minute. C'est ce qu'a corrigé la chronologie du
// moteur (cf. CHRONOLOGIE_MAX) ; ce fichier la met en forme.
//
// Rien n'est fabriqué : chaque ligne vient d'un événement réellement produit
// par la simulation, chaque chiffre d'un compteur réellement incrémenté.
(function (global) {
  'use strict';

  // Comment chaque fait marquant se lit dans un compte rendu. `points` sert à
  // reconstituer l'évolution du score ligne à ligne.
  const FAITS_MATCH = {
    ESSAI: { libelle: 'Essai', icone: '🏉', points: 5, marqueur: true },
    ESSAI_PENALITE: { libelle: 'Essai de pénalité', icone: '🏉', points: 7, marqueur: true },
    TRANSFORMATION_REUSSIE: { libelle: 'Transformation', icone: '🎯', points: 2 },
    TRANSFORMATION_RATEE: { libelle: 'Transformation manquée', icone: '✖️', points: 0 },
    PENALITE_REUSSIE: { libelle: 'Pénalité', icone: '🎯', points: 3 },
    PENALITE_RATEE: { libelle: 'Pénalité manquée', icone: '✖️', points: 0 },
    DROP_GOAL_REUSSI: { libelle: 'Drop', icone: '🎯', points: 3 },
    DROP_GOAL_RATE: { libelle: 'Drop manqué', icone: '✖️', points: 0 },
    CARTON_JAUNE: { libelle: 'Carton jaune', icone: '🟨', points: 0 },
    PENALITE: { libelle: 'Pénalité concédée', icone: '⚠️', points: 0, mineur: true },
    PENALITE_RUCK_ISOLE: { libelle: 'Pénalité au ruck', icone: '⚠️', points: 0, mineur: true },
    MI_TEMPS: { libelle: 'Mi-temps', icone: '⏸️', points: 0, repere: true },
    FIN_MATCH: { libelle: 'Coup de sifflet final', icone: '⏹️', points: 0, repere: true },
    REMPLACEMENT: { libelle: 'Remplacement', icone: '🔄', points: 0 },
  };

  // Statistiques mises face à face. Uniquement des compteurs RÉELS du moteur
  // (cf. state.stats) — aucune valeur dérivée ou estimée.
  const STATS_COMPAREES = [
    ['essais', 'Essais'],
    ['carries', 'Courses ballon en main'],
    ['metresGagnes', 'Mètres gagnés', (v) => Math.round(v)],
    ['passes', 'Passes réussies'],
    ['kicks', 'Coups de pied'],
    ['rucks', 'Rucks'],
    ['mauls', 'Mauls'],
    ['scrums', 'Mêlées introduites'],
    ['lineouts', 'Touches lancées'],
    ['tacklesMade', 'Plaquages réussis'],
    ['missedTackles', 'Plaquages manqués'],
    ['turnovers', 'Ballons récupérés'],
    ['knockOns', 'En-avants'],
    ['penalitesConcedees', 'Pénalités concédées'],
    ['cartonsJaunes', 'Cartons jaunes'],
  ];

  function nombre(v) { return typeof v === 'number' ? v : 0; }

  // Assemble le compte rendu d'un match terminé.
  // `etat` : le getState() du moteur. `opts.nomA`/`opts.nomB` : les noms à
  // afficher (le moteur ne connaît que « A » et « B »).
  function feuilleDeMatch(etat, opts) {
    const o = opts || {};
    const nomA = o.nomA || 'Équipe A';
    const nomB = o.nomB || 'Équipe B';
    const statsA = (etat && etat.stats && etat.stats.A) || {};
    const statsB = (etat && etat.stats && etat.stats.B) || {};
    const brute = (etat && etat.chronologie) || [];

    // Score reconstitué ligne à ligne : le manager voit l'évolution, pas
    // seulement le résultat final.
    let courantA = 0, courantB = 0;
    const chronologie = [];
    const marqueurs = { A: [], B: [] };
    for (const e of brute) {
      const def = FAITS_MATCH[e.type];
      if (!def) continue;
      if (e.team === 'A') courantA += def.points;
      else if (e.team === 'B') courantB += def.points;
      const ligne = {
        minute: e.minute,
        type: e.type,
        camp: e.team || null,
        equipe: e.team === 'A' ? nomA : e.team === 'B' ? nomB : null,
        icone: def.icone,
        libelle: def.libelle,
        message: e.message,
        points: def.points,
        mineur: !!def.mineur,
        repere: !!def.repere,
        scoreA: courantA,
        scoreB: courantB,
      };
      chronologie.push(ligne);
      if (def.marqueur && (e.team === 'A' || e.team === 'B')) {
        marqueurs[e.team].push({ minute: e.minute, type: e.type, message: e.message });
      }
    }

    const statistiques = STATS_COMPAREES
      .filter(([cle]) => statsA[cle] !== undefined || statsB[cle] !== undefined)
      .map(([cle, libelle, format]) => {
        const a = nombre(statsA[cle]), b = nombre(statsB[cle]);
        return {
          cle, libelle,
          a: format ? format(a) : a,
          b: format ? format(b) : b,
          // Qui domine ce poste — sert à colorer la barre à l'écran.
          avantage: a > b ? 'A' : b > a ? 'B' : null,
        };
      });

    // Possession : le moteur ne la compte pas comme une statistique, mais la
    // part de rucks joués la représente honnêtement (chaque ruck est une
    // phase de conservation). On le DIT plutôt que de laisser croire à une
    // mesure de temps de possession réelle.
    const rucksTotal = nombre(statsA.rucks) + nombre(statsB.rucks);
    const possession = rucksTotal > 0
      ? { a: Math.round((nombre(statsA.rucks) / rucksTotal) * 100),
          b: Math.round((nombre(statsB.rucks) / rucksTotal) * 100),
          source: 'part des rucks joués' }
      : null;

    return {
      nomA, nomB,
      score: { A: (etat && etat.score && etat.score.A) || 0, B: (etat && etat.score && etat.score.B) || 0 },
      chronologie,
      marqueurs,
      statistiques,
      possession,
      // Les faits vraiment marquants, pour un résumé court.
      tempsForts: chronologie.filter((l) => l.points > 0 || l.type === 'CARTON_JAUNE'),
    };
  }


  global.RMClub = Object.assign(global.RMClub || {}, {
    feuilleDeMatch,
  });
})(window);
