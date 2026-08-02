// Outil de mesure des ÉCARTS DE SCORE selon le niveau des équipes
// (TODO_AUDIT.md P2-1 : « mes adversaires gagnent trop souvent avec beaucoup
// d'écart »). Complète server/simulate-batch.js, qui mesure les volumes
// cumulés des deux équipes mais jamais le différentiel.
//
// Deux mesures distinctes, car ce sont deux défauts possibles :
//
//  1. SYMÉTRIE — à niveau de club STRICTEMENT ÉGAL, le club du joueur
//     (effectif étendu de 24, composition du jour, fatigue/moral appliqués)
//     contre un club IA (15 joueurs par numéro, aucune fatigue) doit gagner
//     autant qu'il perd. Un biais ici est un défaut de câblage du mode Club,
//     pas du moteur.
//  2. ÉCHELLE — quand l'écart de niveau grandit, l'écart de score doit
//     grandir PROGRESSIVEMENT et rester dans des ordres de grandeur réels
//     (une équipe un peu plus forte gagne souvent de peu, pas de 40 points).
//
// Usage : node server/simulate-ecarts.js [nbMatchsParScenario] [graineDepart]
'use strict';

const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();
const { MatchEngine } = require('../engine/rugby-engine.js');

const DUREE = 4800; // 80 minutes, comme un vrai match
const DT = 0.2;

// Un « gros écart » au rugby : au-delà de 21 points, le match n'a plus été
// disputé (c'est aussi la limite du bonus défensif dans les vraies
// compétitions, donc un repère partagé par tout le monde du rugby).
const SEUIL_GROS_ECART = 21;

// --- Construction des deux camps, exactement comme le jeu le fait ----------
// Côté joueur : cfgPour() dans docs/js/clubUI.js appelle
// compositionVersJoueursCfg(effectif étendu, composition du jour).
// Côté IA : effectifVersJoueursCfg(club) sur un effectif de 15.

function cfgClubJoueur(rng, niveauClub, options) {
  const opt = options || {};
  const effectif = RMClub.genererEffectifEtendu(rng, niveauClub);
  for (const j of effectif) {
    if (opt.fatigue != null) j.fatigue = opt.fatigue;
    if (opt.moral != null) j.moral = opt.moral;
  }
  const composition = RMClub.meilleureComposition(effectif);
  return RMClub.compositionVersJoueursCfg(effectif, composition);
}

function cfgClubIA(rng, niveauClub) {
  return RMClub.effectifVersJoueursCfg({ effectif: RMClub.genererEffectif(rng, niveauClub) });
}

// --- Simulation d'un match, on ne garde que le différentiel ---------------

function jouer(graine, joueursA, joueursB) {
  const m = new MatchEngine(graine, DUREE, { joueursA, joueursB });
  for (let t = 0; t < DUREE; t += DT) m.tick(DT);
  const s = m.getState();
  return { pourA: s.score.A, pourB: s.score.B, ecart: s.score.A - s.score.B };
}

// --- Statistiques descriptives -------------------------------------------

function resumer(ecarts) {
  const tries = ecarts.slice().sort((a, b) => a - b);
  const moyenne = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
  const mediane = tries[Math.floor(tries.length / 2)];
  const abs = ecarts.map(Math.abs).sort((a, b) => a - b);
  return {
    n: ecarts.length,
    moyenne,
    mediane,
    ecartAbsMoyen: abs.reduce((a, b) => a + b, 0) / abs.length,
    victoires: ecarts.filter((e) => e > 0).length,
    nuls: ecarts.filter((e) => e === 0).length,
    defaites: ecarts.filter((e) => e < 0).length,
    grossesVictoires: ecarts.filter((e) => e >= SEUIL_GROS_ECART).length,
    grossesDefaites: ecarts.filter((e) => e <= -SEUIL_GROS_ECART).length,
  };
}

// Lance N matchs pour un scénario donné. `niveauA` est le club du joueur (sauf
// si `iaContreIa`), `niveauB` l'adversaire IA. Renvoie le résumé des écarts vus
// DEPUIS le club A.
function scenario({ n, graineDepart, niveauA, niveauB, iaContreIa = false, optionsA = null }) {
  const ecarts = [];
  for (let i = 0; i < n; i++) {
    // Une graine par match, utilisée à la fois pour la génération des
    // effectifs et pour le moteur : reproductible d'un lancement à l'autre.
    const graine = graineDepart + i;
    const rngA = creerRng(graine * 7919 + 13);
    const rngB = creerRng(graine * 6271 + 29);
    const a = iaContreIa ? cfgClubIA(rngA, niveauA) : cfgClubJoueur(rngA, niveauA, optionsA);
    const b = cfgClubIA(rngB, niveauB);
    ecarts.push(jouer(graine, a, b).ecart);
  }
  return { ecarts, resume: resumer(ecarts) };
}

// --- Affichage ------------------------------------------------------------

function ligne(nom, r) {
  const pct = (x) => `${Math.round((x / r.n) * 100)}%`;
  return [
    nom.padEnd(34),
    `moy ${r.moyenne >= 0 ? '+' : ''}${r.moyenne.toFixed(1)}`.padEnd(12),
    `méd ${r.mediane >= 0 ? '+' : ''}${r.mediane}`.padEnd(10),
    `|écart| ${r.ecartAbsMoyen.toFixed(1)}`.padEnd(14),
    `V/N/D ${r.victoires}/${r.nuls}/${r.defaites}`.padEnd(14),
    `>21 pts pour ${pct(r.grossesVictoires)} / contre ${pct(r.grossesDefaites)}`,
  ].join(' ');
}

function principal() {
  const n = Number(process.argv[2]) || 60;
  const graineDepart = Number(process.argv[3]) || 1;

  console.log(`--- Écarts de score sur ${n} match(s) par scénario (graines ${graineDepart}+) ---\n`);

  console.log('1) SYMÉTRIE — club du joueur contre IA de MÊME niveau (0.50)');
  console.log('   Attendu : moyenne proche de 0, autant de grosses victoires que de grosses défaites.\n');
  const sym = scenario({ n, graineDepart, niveauA: 0.5, niveauB: 0.5 });
  console.log('   ' + ligne('joueur 0.50 vs IA 0.50', sym.resume));

  const symIA = scenario({ n, graineDepart, niveauA: 0.5, niveauB: 0.5, iaContreIa: true });
  console.log('   ' + ligne('IA 0.50 vs IA 0.50 (référence)', symIA.resume));

  const symFatigue = scenario({ n, graineDepart, niveauA: 0.5, niveauB: 0.5, optionsA: { fatigue: 55, moral: 65 } });
  console.log('   ' + ligne('joueur fatigué 55 vs IA fraîche', symFatigue.resume));

  console.log('\n2) ÉCHELLE — le club du joueur (0.50) face à des niveaux croissants');
  console.log('   Attendu : progression régulière, pas de décrochage brutal.\n');
  for (const niveauB of [0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
    const s = scenario({ n, graineDepart, niveauA: 0.5, niveauB });
    console.log('   ' + ligne(`joueur 0.50 vs IA ${niveauB.toFixed(2)}`, s.resume));
  }

  console.log('\n3) ÉCHELLE IA/IA — même mesure sans le câblage du mode Club\n');
  for (const niveauB of [0.2, 0.5, 0.8, 0.95]) {
    const s = scenario({ n, graineDepart, niveauA: 0.5, niveauB, iaContreIa: true });
    console.log('   ' + ligne(`IA 0.50 vs IA ${niveauB.toFixed(2)}`, s.resume));
  }
  console.log('');
}

if (require.main === module) principal();

module.exports = { scenario, resumer, jouer, cfgClubJoueur, cfgClubIA, SEUIL_GROS_ECART };
