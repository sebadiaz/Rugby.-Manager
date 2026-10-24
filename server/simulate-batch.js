// Outil de calibration : simule N matchs complets (80 min) sans rendu et compare
// les moyennes cumulées (équipe A + équipe B) aux fourchettes réalistes attendues,
// pour calibrer le comportement du moteur (server/simulate-batch.js [n] [seedDepart]).
'use strict';

const { MatchEngine } = require('../engine/rugby-engine.js');

const n = Number(process.argv[2]) || 50;
const seedDepart = Number(process.argv[3]) || 1;
const dureeSecondes = 4800; // 80 minutes
const dt = 0.2;

// Fourchettes réalistes demandées (cumul des deux équipes, sur un match complet).
const FOURCHETTES = {
  essais: [4, 8],
  points: [35, 65],
  carries: [170, 280],
  passes: [250, 420],
  kicks: [35, 70],
  tacklesAttempted: [220, 360],
  // Rucks et mêlées revus en P2-94 sur des matchs réels : Coupe du monde 2023,
  // 79 rucks par équipe (~158 par match, Stats Perform) ; Irlande 2018, 137 par
  // match pour elle seule ; France-Irlande 2026, 181. Mêlées : ~12 par match
  // dans les deux derniers Tournois (RugbyPass), jusqu'à 19 (Galles-France
  // 2010). Les plafonds 180 et 15 excluaient des matchs réels à haut tempo.
  rucks: [110, 220],
  lineouts: [20, 35],
  scrums: [6, 18],
  mauls: [3, 10],
  penalitesConcedees: [16, 28],
  turnovers: [8, 18],
  knockOns: [8, 18],
  tempsJeuEffectifMin: [32, 42],
};

const cles = Object.keys(FOURCHETTES);
const totaux = {};
for (const k of cles) totaux[k] = 0;

// Décompositions (bugs.md QA-RM-007) : buts par type et distance, buteurs,
// essais par poste, par origine de séquence et par distance de départ. Tout
// vient des événements du match (chronologie), jamais d'une estimation.
const buts = {};
const buteurs = {};
const essais = { poste: {}, origine: {}, depuis: {}, rucks: {} };
const ajouter = (o, k) => { o[k] = (o[k] || 0) + 1; };
const tranche = (d) => (d < 22 ? '<22 m' : d < 35 ? '22-35 m' : d < 45 ? '35-45 m' : '45 m+');
const POSTE = (n) => (n <= 3 ? 'premiere ligne' : n <= 5 ? 'deuxieme ligne' : n <= 8 ? 'troisieme ligne'
  : n === 9 ? 'demi de melee' : n === 10 ? 'ouvreur' : n === 11 || n === 14 ? 'ailiers' : n === 15 ? 'arriere' : 'centres');

let matchsOk = 0;
for (let i = 0; i < n; i++) {
  const seed = seedDepart + i;
  const m = new MatchEngine(seed, dureeSecondes);
  m.jouerJusquAuSifflet(dt); // au coup de sifflet, pas à 80:00 (BUG-RM-010)

  const s = m.getState();
  const sa = s.stats.A, sb = s.stats.B;
  totaux.essais += sa.essais + sb.essais;
  totaux.points += s.score.A + s.score.B;
  totaux.carries += sa.carries + sb.carries;
  totaux.passes += sa.passes + sb.passes;
  totaux.kicks += sa.kicks + sb.kicks;
  totaux.tacklesAttempted += sa.tacklesAttempted + sb.tacklesAttempted;
  totaux.rucks += sa.rucks + sb.rucks;
  totaux.lineouts += sa.lineouts + sb.lineouts;
  totaux.scrums += sa.scrums + sb.scrums;
  totaux.mauls += sa.mauls + sb.mauls;
  totaux.penalitesConcedees += sa.penalitesConcedees + sb.penalitesConcedees;
  totaux.turnovers += sa.turnovers + sb.turnovers;
  totaux.knockOns += sa.knockOns + sb.knockOns;
  totaux.tempsJeuEffectifMin += s.tempsJeuEffectif / 60;
  for (const e of s.chronologie || []) {
    const type = /^TRANSFORMATION/.test(e.type) ? 'transformation' : /^PENALITE_(REUSSIE|RATEE)$/.test(e.type) ? 'penalite'
      : /^DROP_GOAL/.test(e.type) ? 'drop' : null;
    if (type) {
      const reussi = /REUSSI/.test(e.type);
      const cle = `${type} ${e.distance != null ? tranche(e.distance) : '(distance inconnue)'}`;
      buts[cle] = buts[cle] || { tentes: 0, reussis: 0 };
      buts[cle].tentes++; if (reussi) buts[cle].reussis++;
      if (e.buteur != null) ajouter(buteurs, 'n°' + e.buteur);
    }
    if (e.type === 'ESSAI') {
      ajouter(essais.poste, e.maul ? 'maul' : e.marqueur != null ? POSTE(e.marqueur) : 'inconnu');
      ajouter(essais.origine, e.origine || 'inconnue');
      ajouter(essais.depuis, e.depuis == null ? 'inconnu' : e.depuis < 22 ? 'dans les 22' : e.depuis < 50 ? '22-50 m' : 'au-dela de 50 m');
      ajouter(essais.rucks, e.rucks === 0 ? '0 ruck' : e.rucks <= 2 ? '1-2 rucks' : e.rucks <= 5 ? '3-5 rucks' : '6+ rucks');
    }
  }
  matchsOk++;
}

console.log(`--- Calibration sur ${matchsOk} match(s) simulé(s) (graines ${seedDepart} à ${seedDepart + n - 1}) ---\n`);

const LABELS = {
  essais: 'Essais',
  points: 'Points (total)',
  carries: 'Courses (ballon en main)',
  passes: 'Passes',
  kicks: 'Coups de pied',
  tacklesAttempted: 'Plaquages tentés',
  rucks: 'Rucks',
  lineouts: 'Touches (lineouts)',
  scrums: 'Mêlées (scrums)',
  mauls: 'Mauls',
  penalitesConcedees: 'Pénalités concédées',
  turnovers: 'Turnovers',
  knockOns: 'En-avants (knock-ons)',
  tempsJeuEffectifMin: 'Temps de jeu effectif (min)',
};

let nbHorsFourchette = 0;
for (const k of cles) {
  const [min, max] = FOURCHETTES[k];
  const moyenne = totaux[k] / matchsOk;
  let statut;
  if (moyenne < min) { statut = 'TROP BAS'; nbHorsFourchette++; }
  else if (moyenne > max) { statut = 'TROP HAUT'; nbHorsFourchette++; }
  else statut = 'OK';
  console.log(
    `${LABELS[k].padEnd(28)} moyenne=${moyenne.toFixed(1).padStart(7)}  attendu=[${min}-${max}]  ${statut}`
  );
}

console.log(`\n${cles.length - nbHorsFourchette}/${cles.length} catégories dans la fourchette attendue.`);

// --- Décompositions (par match, cumul des deux équipes) -------------------
const parMatch = (v) => (v / matchsOk).toFixed(2);
const liste = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${parMatch(v)}`).join(' · ');
console.log('\nButs (tentés / réussis par match, réussite) :');
for (const k of Object.keys(buts).sort()) {
  const b = buts[k];
  console.log(`  ${k.padEnd(28)} ${parMatch(b.tentes)} / ${parMatch(b.reussis)}  (${Math.round(100 * b.reussis / b.tentes)} %)`);
}
console.log(`Buteurs : ${liste(buteurs)}`);
console.log(`Essais par poste : ${liste(essais.poste)}`);
console.log(`Essais par origine : ${liste(essais.origine)}`);
console.log(`Essais par point de départ : ${liste(essais.depuis)}`);
console.log(`Essais par nombre de rucks : ${liste(essais.rucks)}`);
if (nbHorsFourchette > 0) process.exitCode = 1;
