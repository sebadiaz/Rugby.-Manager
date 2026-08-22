// COUVERTURE — le barème des matchs résolus en ABSTRAIT.
//
// Tous les matchs que le joueur ne dispute pas lui-même passent par ce
// barème : les 156 rencontres IA-IA de son championnat, les deux autres
// divisions françaises, les tours de coupe qu'il ne joue pas, et les 12 pays
// du monde. C'est donc lui qui écrit la quasi-totalité des classements que le
// jeu affiche.
//
// Audit mesuré avant cette tranche (4 000 tirages par cas) :
//
//   palier                niveaux      total moyen   % dans 25-70
//   Régionale (bas)       0,15 / 0,20      22,8          43 %
//   Régionale (haut)      0,40 / 0,45      29,8          73 %
//   Nationale             0,45 / 0,55      31,9          80 %
//   Excellence            0,70 / 0,80      38,9          96 %
//
// `CLAUDE.md` vise un score TOTAL de 25 à 70 points par match. Le barème
// tenait donc au sommet de la pyramide et s'effondrait en bas : `base = 18 +
// (nA + nB) × 14` fait dépendre LINÉAIREMENT le nombre de points du niveau
// des clubs. Or un match de division inférieure n'est pas un demi-match : il
// oppose des joueurs moins bons, ce qui change la QUALITÉ du jeu, pas le
// nombre de points au tableau d'affichage.
//
// Usage : node server/test-scores-abstraits.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();
const RMWorld = global.window.RMWorld;

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

// Les paliers RÉELS du jeu (cf. bandeNiveauPalier) : c'est sur ces
// intervalles que le barème doit tenir, pas sur une plage théorique.
const PALIERS = [
  { nom: 'Régionale (bas)', a: 0.15, b: 0.20 },
  { nom: 'Régionale (haut)', a: 0.40, b: 0.45 },
  { nom: 'Nationale', a: 0.45, b: 0.55 },
  { nom: 'Excellence', a: 0.70, b: 0.80 },
];
function echantillon(simuler, a, b, n) {
  const rng = creerRng(4242);
  const out = [];
  for (let i = 0; i < (n || 3000); i++) out.push(simuler(rng, a, b));
  return out;
}
const part = (liste, predicat) => liste.filter(predicat).length / liste.length;
const moyenne = (liste) => liste.reduce((s, x) => s + x, 0) / liste.length;

test('S1 — PREUVE : le score total tient dans la fourchette du rugby, à TOUS les paliers', () => {
  for (const p of PALIERS) {
    const r = echantillon(RMWorld.simulerResultatAbstrait, p.a, p.b);
    const totaux = r.map((x) => x.scoreA + x.scoreB);
    const dedans = part(totaux, (t) => t >= 25 && t <= 70);
    assert.ok(dedans >= 0.75,
      `${p.nom} : seulement ${Math.round(dedans * 100)} % des matchs entre 25 et 70 points ` +
      `(total moyen ${moyenne(totaux).toFixed(1)})`);
  }
});

test('S2 — et le total MOYEN reste celui d\'un vrai match, partout', () => {
  for (const p of PALIERS) {
    const totaux = echantillon(RMWorld.simulerResultatAbstrait, p.a, p.b)
      .map((x) => x.scoreA + x.scoreB);
    const m = moyenne(totaux);
    assert.ok(m >= 30 && m <= 55,
      `${p.nom} : total moyen ${m.toFixed(1)} hors de la plage attendue (30-55)`);
  }
});

test('S3 — les essais restent dans les ordres de grandeur d\'un match de XV', () => {
  for (const p of PALIERS) {
    const r = echantillon(RMWorld.simulerResultatAbstrait, p.a, p.b);
    const essais = r.map((x) => x.essaisA + x.essaisB);
    const dedans = part(essais, (e) => e >= 2 && e <= 8);
    assert.ok(dedans >= 0.8,
      `${p.nom} : ${Math.round(dedans * 100)} % des matchs entre 2 et 8 essais ` +
      `(moyenne ${moyenne(essais).toFixed(1)})`);
  }
});

test('S4 — un club supérieur marque toujours plus : le niveau compte encore', () => {
  const rng = creerRng(77);
  let gagnesParLeFort = 0;
  const n = 3000;
  for (let i = 0; i < n; i++) {
    const r = RMWorld.simulerResultatAbstrait(rng, 0.80, 0.30);
    if (r.scoreA > r.scoreB) gagnesParLeFort++;
  }
  const taux = gagnesParLeFort / n;
  assert.ok(taux >= 0.75,
    `un club nettement supérieur doit gagner la plupart du temps (${Math.round(taux * 100)} %)`);
  assert.ok(taux <= 0.98,
    `mais pas toujours : le rugby garde une part d'incertitude (${Math.round(taux * 100)} %)`);
});

test('S5 — deux clubs égaux produisent un match serré', () => {
  const r = echantillon(RMWorld.simulerResultatAbstrait, 0.5, 0.5);
  const ecarts = r.map((x) => Math.abs(x.scoreA - x.scoreB));
  const m = moyenne(ecarts);
  assert.ok(m >= 4 && m <= 14,
    `écart moyen à niveau égal : ${m.toFixed(1)} points (attendu 4-14)`);
});

test('S6 — les matchs nuls restent rares', () => {
  const r = echantillon(RMWorld.simulerResultatAbstrait, 0.5, 0.5, 5000);
  const nuls = part(r, (x) => x.scoreA === x.scoreB);
  assert.ok(nuls <= 0.08,
    `trop de matchs nuls (${Math.round(nuls * 100)} %) — le rugby en compte très peu`);
});

test('S7 — aucun score aberrant, jamais de négatif', () => {
  for (const p of PALIERS.concat([{ nom: 'très déséquilibré', a: 0.9, b: 0.1 }])) {
    const r = echantillon(RMWorld.simulerResultatAbstrait, p.a, p.b);
    for (const x of r) {
      assert.ok(x.scoreA >= 0 && x.scoreB >= 0, `${p.nom} : score négatif`);
      assert.ok(x.scoreA <= 90 && x.scoreB <= 90,
        `${p.nom} : score aberrant (${x.scoreA}-${x.scoreB})`);
      assert.ok(x.essaisA >= 0 && x.essaisB >= 0, `${p.nom} : essais négatifs`);
    }
  }
});

test('S8 — déterminisme : même graine, mêmes résultats', () => {
  const suite = () => echantillon(RMWorld.simulerResultatAbstrait, 0.4, 0.6, 200)
    .map((x) => `${x.scoreA}-${x.scoreB}`).join('|');
  assert.strictEqual(suite(), suite());
});

test('S9 — UNE SEULE source : la pyramide française emploie le même barème', () => {
  // La formule était DUPLIQUÉE dans club-pyramide-france.js pour éviter une
  // dépendance vers world.js. Deux copies, donc deux barèmes à corriger le
  // jour où l'un change — exactement le défaut que ce projet corrige partout
  // ailleurs.
  assert.ok(typeof RMClub.simulerResultatAbstrait === 'function',
    'le barème doit être exporté une fois pour toutes');
  const a = creerRng(31), b = creerRng(31);
  for (let i = 0; i < 200; i++) {
    const x = RMWorld.simulerResultatAbstrait(a, 0.35, 0.65);
    const y = RMClub.simulerResultatAbstrait(b, 0.35, 0.65);
    assert.deepStrictEqual(x, y, 'les deux chemins doivent donner exactement le même résultat');
  }
});

test('S10 — sur une saison entière, le classement reste crédible', () => {
  const s = RMClub.nouvelleSaison(creerRng(88123), 'AS Barème');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const rng = creerRng(9);
  for (const f of (s.calendrier || [])) {
    if (f.joue) continue;
    const a = RMClub.clubPartout(s, f.domicileId), b = RMClub.clubPartout(s, f.exterieurId);
    const r = RMWorld.simulerResultatAbstrait(rng, a.niveauClub, b.niveauClub);
    RMClub.enregistrerResultat(s, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
  }
  const trie = RMClub.classementTrieDe(s.classement);
  const journees = trie[0].j;
  assert.ok(journees >= 20, `il faut une saison complète (${journees} journées)`);
  // Le champion d'un championnat à 26 journées tourne autour de 70-100 points.
  assert.ok(trie[0].pts >= 55 && trie[0].pts <= 115,
    `le champion doit finir dans une fourchette crédible (${trie[0].pts} pts sur ${journees} journées)`);
  // Et le dernier ne doit pas finir à zéro.
  assert.ok(trie[trie.length - 1].pts > 0,
    `la lanterne rouge ne doit pas finir à zéro point (${trie[trie.length - 1].pts})`);
  // Points marqués par équipe et par match : l'ordre de grandeur du rugby.
  const parMatch = trie.reduce((t, l) => t + l.pointsPour, 0) / trie.reduce((t, l) => t + l.j, 0);
  assert.ok(parMatch >= 15 && parMatch <= 30,
    `points marqués par équipe et par match : ${parMatch.toFixed(1)} (attendu 15-30)`);
});

test('S11 — le barème abstrait est ANCRÉ sur le moteur, pas deviné', () => {
  // Le club du joueur dispute ses matchs avec le vrai moteur ; ses rivaux
  // sont résolus en abstrait. Si les deux barèmes divergent, la colonne
  // « points pour » du classement compare des choses incomparables — mesuré
  // avant : le joueur marquait 43 points par match pendant que les
  // rencontres IA de son championnat en produisaient 23 à deux.
  //
  // Repères MESURÉS sur 500 matchs du moteur (server/test-stats-matchs.js) :
  // 43,3 points au total, 5,4 essais.
  const MOTEUR_POINTS = 43.3;
  const MOTEUR_ESSAIS = 5.4;
  // Le milieu de la pyramide est le point de comparaison honnête : le moteur
  // a été mesuré sur des équipes de niveau moyen tirées de la même loi.
  const r = echantillon(RMWorld.simulerResultatAbstrait, 0.45, 0.55, 5000);
  const points = moyenne(r.map((x) => x.scoreA + x.scoreB));
  const essais = moyenne(r.map((x) => x.essaisA + x.essaisB));
  assert.ok(Math.abs(points - MOTEUR_POINTS) <= 6,
    `abstrait ${points.toFixed(1)} pts contre ${MOTEUR_POINTS} au moteur : l'écart doit rester sous 6 points`);
  assert.ok(Math.abs(essais - MOTEUR_ESSAIS) <= 1.5,
    `abstrait ${essais.toFixed(1)} essais contre ${MOTEUR_ESSAIS} au moteur`);
  // Et le rapport points/essai doit rester celui d'un vrai match (essai +
  // transformation + pénalités), pas celui d'un essai sec.
  const parEssai = points / essais;
  assert.ok(parEssai >= 6.5 && parEssai <= 9.5,
    `${parEssai.toFixed(1)} points par essai (attendu 6,5-9,5)`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
