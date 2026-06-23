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
    MELEE_RUCK_INJOUABLE: '🔒',
    MAUL_PEN_ECROULEMENT: '🟨', MAUL_PEN_HORSJEU: '🟨', MAUL_PEN_ENTREE_COTE: '🟨', MAUL_PEN_TECHNIQUE: '🟨', CARTON_JAUNE: '🟡',
    JEU_LARGE: '↔️', PASSE: '👐', PASSE_RATEE: '💥',
    // Machine à états de la mêlée (loi 19/20, cf. ETATS_MELEE dans le moteur).
    MELEE: '⚪', MELEE_CROUCH: '⬇️', MELEE_BIND: '🤝', MELEE_SET: '💥', MELEE_INTRODUCTION: '↘️',
    MELEE_CONTESTATION: '💪', MELEE_DOMINEE: '🚀', MELEE_GAGNEE: '✅', MELEE_PRESSION: '⚠️',
    MELEE_BALLON_SORTI: '➡️', MELEE_PICK_AND_GO: '🏃', MELEE_USE_IT: '⏱️', MELEE_TOURNEE: '🔄', MELEE_RESET: '↩️',
    MELEE_PEN_ECROULEMENT: '🟨', MELEE_PEN_TRAVERS: '🟨', MELEE_PEN_HORSJEU: '🟨', MELEE_PEN_TECHNIQUE: '🙌',
  };

  // Libellés lisibles des états du maul (loi 17) pour l'affichage de la phase.
  const ETATS_MAUL_LABEL = {
    MAUL_FORMING: 'Maul (formation)', MAUL_ACTIVE: 'Maul', MAUL_MOVING: 'Maul (avance)',
    MAUL_FIRST_STOP: 'Maul (arrêt 1 — use it once)', MAUL_SECOND_STOP: 'Maul (arrêt 2)',
    MAUL_USE_IT: 'Maul (use it !)', MAUL_UNPLAYABLE: 'Maul (injouable)',
  };

  // Libellés lisibles des états de la mêlée (loi 19/20) pour l'affichage de la phase.
  const ETATS_MELEE_LABEL = {
    MELEE_FORMATION: 'Mêlée (formation)', MELEE_CROUCH: 'Mêlée (« Crouch »)',
    MELEE_BIND: 'Mêlée (« Bind »)', MELEE_SET: 'Mêlée (« Set »)',
    MELEE_INTRODUCTION: 'Mêlée (introduction)', MELEE_CONTESTATION: 'Mêlée (contestation)',
    MELEE_SORTIE: 'Mêlée (sortie de balle)',
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
    'MAUL_ARRET_UN', 'MAUL_ARRET_DEUX', 'MAUL_USE_IT', 'MAUL_INJOUABLE', 'MELEE_RUCK_INJOUABLE',
    'MAUL_PEN_ECROULEMENT', 'MAUL_PEN_HORSJEU', 'MAUL_PEN_ENTREE_COTE', 'MAUL_PEN_TECHNIQUE', 'CARTON_JAUNE',
    // Jeu au large : assez rare (quelques fois par match) pour mériter une
    // bannière — sinon il est noyé en quelques secondes par les rucks dans
    // le fil d'événements (5 lignes affichées, écrasées en permanence).
    'JEU_LARGE',
    // Mêlée (loi 19/20) : on bannière l'octroi et les événements rares/notables
    // (poussée dominante, tournée, à refaire, use it, fautes), pas les appels
    // d'arbitre courants (crouch/bind/set) ni les sorties de balle routinières
    // qui se produisent à chaque mêlée et noieraient la bannière.
    'MELEE', 'MELEE_DOMINEE', 'MELEE_TOURNEE', 'MELEE_RESET', 'MELEE_USE_IT',
    'MELEE_PEN_ECROULEMENT', 'MELEE_PEN_TRAVERS', 'MELEE_PEN_HORSJEU', 'MELEE_PEN_TECHNIQUE',
  ]);

  global.RMConstants = {
    DUREE_MATCH, PAS_FIXE, CLE_HISTORIQUE, PROF_EN_BUT, MARGE_TOUCHE,
    ICONES, ETATS_MAUL_LABEL, ETATS_MELEE_LABEL, PHASES, TYPES_BANNIERE,
  };
})(window);
