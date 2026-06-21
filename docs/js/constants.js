// Constantes partagées par l'interface (rendu, UI, boucle principale). Le
// moteur de règles (engine/rugby-engine.js, copié en docs/rugby-engine.js)
// reste la seule source de vérité pour la simulation : ce fichier ne décrit
// que des constantes d'affichage et de configuration de la démo.
(function (global) {
  'use strict';

  // Secondes de jeu simulées par match (5 minutes, format démo) et pas de
  // simulation fixe (condition de la rejouabilité déterministe : le même
  // pas, appliqué le même nombre de fois, donne toujours le même état).
  const DUREE_MATCH = 300;
  const PAS_FIXE = 0.1;
  const CLE_HISTORIQUE = 'rugbyManager.historique';

  // Profondeur d'en-but (ligne d'essai à ligne de ballon mort) et marge au-delà
  // des lignes de touche, en mètres : réservées pour dessiner l'en-but et les
  // touches sans coller au bord de l'écran. La zone de jeu reste x∈[0,100].
  const PROF_EN_BUT = 8;
  const MARGE_TOUCHE = 4;

  const ICONES = {
    COUP_ENVOI: '▶️', CONTRE_COUP_ENVOI: '✋', ESSAI: '🏉', MELEE_AVANT: '🔄', MELEE_ENAVANT: '🔄',
    PENALITE: '🟨', PENALITE_REUSSIE: '🥅', PENALITE_RATEE: '❌',
    TRANSFORMATION_REUSSIE: '🥅', TRANSFORMATION_RATEE: '❌',
    TOUCHE: '👉', TURNOVER: '🔁', MAUL: '🧱', MI_TEMPS: '⏸️', COUP_ENVOI_COURT: '📏',
    DROP_GOAL_REUSSI: '🎯', DROP_GOAL_RATE: '😬', ESSAI_PENALITE: '🏉', COUP_FRANC: '🙌', FIN_MATCH: '🏁',
    MAUL_ARRET_UN: '🅰️', MAUL_ARRET_DEUX: '✋', MAUL_USE_IT: '⏱️', MAUL_BALLON_SORTI: '➡️', MAUL_INJOUABLE: '🔒',
    MAUL_PEN_ECROULEMENT: '🟨', MAUL_PEN_HORSJEU: '🟨', MAUL_PEN_ENTREE_COTE: '🟨', MAUL_PEN_TECHNIQUE: '🟨', CARTON_JAUNE: '🟡',
  };

  // Libellés lisibles des états du maul (loi 17) pour l'affichage de la phase.
  const ETATS_MAUL_LABEL = {
    MAUL_FORMING: 'Maul (formation)', MAUL_ACTIVE: 'Maul', MAUL_MOVING: 'Maul (avance)',
    MAUL_FIRST_STOP: 'Maul (arrêt 1 — use it once)', MAUL_SECOND_STOP: 'Maul (arrêt 2)',
    MAUL_USE_IT: 'Maul (use it !)', MAUL_UNPLAYABLE: 'Maul (injouable)',
  };

  const PHASES = {
    COUP_ENVOI: { label: "Coup d'envoi", couleur: '#37474f' },
    PORTE: { label: 'En jeu', couleur: '#2e7d32' },
    RUCK: { label: 'Ruck', couleur: '#ef6c00' },
    MAUL: { label: 'Maul', couleur: '#bf360c' },
    MELEE: { label: 'Mêlée', couleur: '#1565c0' },
    TOUCHE: { label: 'Touche', couleur: '#6a1b9a' },
    ESSAI: { label: 'ESSAI !', couleur: '#f9a825' },
    TRANSFORMATION: { label: 'Transformation', couleur: '#00838f' },
    PENALITE_TIR: { label: 'Pénalité au but', couleur: '#ad1457' },
    MI_TEMPS: { label: 'Mi-temps', couleur: '#455a64' },
    TERMINE: { label: 'Terminé', couleur: '#616161' },
  };

  const TYPES_BANNIERE = new Set([
    'PENALITE', 'MELEE_AVANT', 'MELEE_ENAVANT', 'TOUCHE', 'ESSAI', 'FIN_MATCH',
    'TRANSFORMATION_REUSSIE', 'TRANSFORMATION_RATEE', 'PENALITE_REUSSIE', 'PENALITE_RATEE',
    'CONTRE_COUP_ENVOI', 'MAUL', 'MI_TEMPS', 'COUP_ENVOI_COURT',
    'DROP_GOAL_REUSSI', 'DROP_GOAL_RATE', 'ESSAI_PENALITE', 'COUP_FRANC',
    'MAUL_ARRET_UN', 'MAUL_ARRET_DEUX', 'MAUL_USE_IT', 'MAUL_INJOUABLE',
    'MAUL_PEN_ECROULEMENT', 'MAUL_PEN_HORSJEU', 'MAUL_PEN_ENTREE_COTE', 'MAUL_PEN_TECHNIQUE', 'CARTON_JAUNE',
  ]);

  global.RMConstants = {
    DUREE_MATCH, PAS_FIXE, CLE_HISTORIQUE, PROF_EN_BUT, MARGE_TOUCHE,
    ICONES, ETATS_MAUL_LABEL, PHASES, TYPES_BANNIERE,
  };
})(window);
