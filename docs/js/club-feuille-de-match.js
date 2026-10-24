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
    // Tableau de marque et conservation (P2-63), comptés par le moteur.
    ['transformationsReussies', 'Transformations réussies'],
    ['penalitesButReussies', 'Pénalités au but réussies'],
    ['carries', 'Courses ballon en main'],
    ['metresGagnes', 'Mètres gagnés', (v) => Math.round(v)],
    ['passes', 'Passes réussies'],
    ['kicks', 'Coups de pied'],
    ['rucks', 'Rucks'],
    ['rucksConserves', 'Rucks conservés'],
    ['mauls', 'Mauls'],
    ['scrums', 'Mêlées introduites'],
    ['scrumsGagnesIntro', 'Mêlées gagnées sur introduction'],
    ['lineouts', 'Touches lancées'],
    ['lineoutsGagnesLancer', 'Touches gagnées sur lancer'],
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
        marqueurs[e.team].push({ minute: e.minute, type: e.type, message: e.message,
          // Numéro du marqueur (QA-RM-007) ; absent d'une ancienne archive.
          marqueur: e.marqueur != null ? e.marqueur : null });
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

    // Possession (bugs.md BUG-RM-008) : le moteur la CHRONOMÈTRE (part du
    // temps de jeu effectif où chaque équipe a le ballon, `possessionPct`).
    // C'est elle qu'on affiche. Seule une archive d'avant ce correctif, qui
    // ne l'a pas gardée, retombe sur la part des rucks — libellée comme une
    // estimation, jamais à la place d'une mesure connue.
    const pct = etat && etat.possessionPct;
    const jeuEffectif = etat && Number.isFinite(etat.tempsJeuEffectif) ? etat.tempsJeuEffectif : null;
    const rucksTotal = nombre(statsA.rucks) + nombre(statsB.rucks);
    let possession = null;
    if (pct && Number.isFinite(pct.A) && Number.isFinite(pct.B)) {
      possession = { a: pct.A, b: pct.B, mesuree: true, libelle: 'Possession',
        aide: 'Part du temps de jeu effectif où chaque équipe avait le ballon' +
          (jeuEffectif ? ` (${Math.round(jeuEffectif / 60)} min de jeu effectif)` : '') };
    } else if (rucksTotal > 0) {
      possession = { a: Math.round((nombre(statsA.rucks) / rucksTotal) * 100),
        b: Math.round((nombre(statsB.rucks) / rucksTotal) * 100), mesuree: false,
        libelle: 'Possession (est.)',
        aide: 'Estimée par la part des rucks joués : cette ancienne feuille n\'a pas gardé la possession chronométrée' };
    }
    const occ = etat && etat.occupationPct;
    const occupation = occ && Number.isFinite(occ.A) && Number.isFinite(occ.B)
      ? { a: occ.A, b: occ.B, libelle: 'Occupation',
          aide: 'Part du temps de jeu effectif passée dans le camp adverse' }
      : null;

    return {
      nomA, nomB,
      score: { A: (etat && etat.score && etat.score.A) || 0, B: (etat && etat.score && etat.score.B) || 0 },
      chronologie,
      marqueurs,
      statistiques,
      possession,
      occupation,
      // Les faits vraiment marquants, pour un résumé court.
      tempsForts: chronologie.filter((l) => l.points > 0 || l.type === 'CARTON_JAUNE'),
    };
  }


  function echapperTexte(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Mise en forme de la feuille. Elle vivait dans main.js, donc uniquement
  // sur l'écran de fin de match : rouvrir une rencontre du calendrier aurait
  // demandé d'en écrire une seconde. Elle est ici, à côté des données
  // qu'elle affiche, et les deux écrans l'appellent.
  //
  // Renvoie une CHAÎNE : aucun accès au DOM, l'appelant décide où l'insérer.
  function htmlFeuilleDeMatch(f) {
    if (!f || !f.chronologie.length) return '';
    // Chronologie : les faits qui pèsent (points, cartons, repères), pas le
    // détail de chaque pénalité — sinon le compte rendu devient illisible.
    const lignes = f.chronologie.filter((l) => !l.mineur).map((l) => {
      const cote = l.camp === 'A' ? 'gauche' : l.camp === 'B' ? 'droite' : 'centre';
      const score = l.points > 0 ? `<span class="scoreFeuille">${l.scoreA}-${l.scoreB}</span>` : '';
      const equipe = l.equipe ? `<span class="equipeFeuille">${echapperTexte(l.equipe)}</span>` : '';
      return `<div class="ligneFeuille ${cote}${l.repere ? ' repere' : ''}">` +
        `<span class="minuteFeuille">${l.minute}'</span>` +
        `<span class="faitFeuille">${l.icone} ${echapperTexte(l.libelle)} ${equipe}</span>` +
        score + `</div>`;
    }).join('');

    const marqueurs = ['A', 'B'].map((camp) => {
      const liste = f.marqueurs[camp];
      if (!liste.length) return '';
      const nom = camp === 'A' ? f.nomA : f.nomB;
      return `<div class="ligneStat"><span>${echapperTexte(nom)}</span>` +
        `<b>${liste.map((m) => m.minute + "'" + (m.marqueur != null ? ` (n°${m.marqueur})` : '')).join(', ')}</b></div>`;
    }).join('');

    const stats = f.statistiques.map((s) =>
      `<div class="ligneStatMatch">` +
      `<span class="valA${s.avantage === 'A' ? ' fort' : ''}">${s.a}</span>` +
      `<span class="libelleStat">${echapperTexte(s.libelle)}</span>` +
      `<span class="valB${s.avantage === 'B' ? ' fort' : ''}">${s.b}</span></div>`).join('');

    const lignePct = (x) => x
      ? `<div class="ligneStatMatch"><span class="valA">${x.a} %</span>` +
        `<span class="libelleStat" title="${echapperTexte(x.aide)}">${echapperTexte(x.libelle)}</span>` +
        `<span class="valB">${x.b} %</span></div>`
      : '';
    const possession = lignePct(f.possession) + lignePct(f.occupation);

    return `<h3 class="titreFeuille">Feuille de match</h3>` +
      (marqueurs ? `<h4 class="sousTitreFeuille">Essais marqués (minute, marqueur)</h4>${marqueurs}` : '') +
      `<h4 class="sousTitreFeuille">Le fil du match</h4><div class="chronoFeuille">${lignes}</div>` +
      `<h4 class="sousTitreFeuille">Statistiques</h4>${possession}${stats}`;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    feuilleDeMatch, htmlFeuilleDeMatch,
  });
})(window);
