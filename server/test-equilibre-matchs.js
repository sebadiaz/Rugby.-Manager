// Tests d'ÉQUILIBRE des matchs du Mode Club (TODO_AUDIT.md P2-1) :
// « mes adversaires gagnent trop souvent avec beaucoup d'écart ».
//
// Ces tests vérifient que le club du JOUEUR est envoyé au moteur dans les
// mêmes conditions qu'un club IA de même niveau — pas que le moteur est
// équilibré (server/simulate-batch.js s'en charge déjà), mais que le CÂBLAGE
// du mode Club ne handicape pas structurellement le joueur.
//
// Usage : node server/test-equilibre-matchs.js
'use strict';

const assert = require('assert');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();
const { MatchEngine, DEFAULT_CONFIG } = require('../engine/rugby-engine.js');

let nbTests = 0;
let nbEchecs = 0;
function test(nom, fn) {
  nbTests++;
  try {
    fn();
    console.log(`  ok   ${nom}`);
  } catch (e) {
    nbEchecs++;
    console.log(`  ÉCHEC ${nom}\n       ${e.message}`);
  }
}

// Config du XV du joueur telle qu'elle part réellement au moteur
// (cf. cfgPour dans docs/js/clubUI.js).
function cfgClubJoueur(rng, niveauClub) {
  const effectif = RMClub.genererEffectifEtendu(rng, niveauClub);
  const composition = RMClub.meilleureComposition(effectif);
  return RMClub.compositionVersJoueursCfg(effectif, composition);
}

function cfgClubIA(rng, niveauClub) {
  return RMClub.effectifVersJoueursCfg({ effectif: RMClub.genererEffectif(rng, niveauClub) });
}

console.log('--- Équilibre des matchs du Mode Club ---\n');

// --- 1. Le placement sur le terrain appartient au MAILLOT, pas au joueur ---
// `couloir` est le couloir latéral au repos (0-70 m de large), défini par
// NUMÉRO dans le moteur : le 11 est sur une aile (7), le 14 sur l'autre (63).
// L'effectif du joueur est généré par POSTE, donc les deux ailiers héritaient
// du même couloir : ils se plaçaient au même endroit et toute une aile
// restait vide. Même problème pour 1/3, 4/5, 6/7/8, 12/13.

test('Chaque numéro du XV du joueur occupe le couloir de son maillot', () => {
  for (let graine = 1; graine <= 20; graine++) {
    const cfg = cfgClubJoueur(creerRng(graine * 7919 + 13), 0.5);
    for (let n = 1; n <= 15; n++) {
      assert.ok(cfg[n], `numéro ${n} absent de la composition (graine ${graine})`);
      assert.strictEqual(
        cfg[n].couloir, DEFAULT_CONFIG.joueurs[n].couloir,
        `graine ${graine}, n°${n} : couloir ${cfg[n].couloir} au lieu de ${DEFAULT_CONFIG.joueurs[n].couloir}`
      );
    }
  }
});

test('Les deux ailiers du joueur ne sont jamais sur la même aile', () => {
  for (let graine = 1; graine <= 20; graine++) {
    const cfg = cfgClubJoueur(creerRng(graine * 7919 + 13), 0.5);
    const ecart = Math.abs(cfg[11].couloir - cfg[14].couloir);
    assert.ok(ecart > 40, `graine ${graine} : n°11 et n°14 séparés de ${ecart} m seulement`);
  }
});

test('Le XV du joueur couvre la largeur du terrain comme un XV IA', () => {
  for (let graine = 1; graine <= 20; graine++) {
    const cfgJ = cfgClubJoueur(creerRng(graine * 7919 + 13), 0.5);
    const cfgI = cfgClubIA(creerRng(graine * 6271 + 29), 0.5);
    const couloirs = (c) => { const s = new Set(); for (let n = 1; n <= 15; n++) s.add(c[n].couloir); return s.size; };
    assert.strictEqual(
      couloirs(cfgJ), couloirs(cfgI),
      `graine ${graine} : ${couloirs(cfgJ)} couloirs distincts côté joueur contre ${couloirs(cfgI)} côté IA`
    );
  }
});

// --- 2. Le joueur reste libre de ses attributs -----------------------------
// Le correctif ne doit PAS aligner les attributs du joueur sur l'archétype du
// maillot : un joueur apporte SES qualités, seul son placement vient du poste
// qu'il occupe ce jour-là.

test("Les attributs restent ceux du joueur, pas ceux de l'archétype du maillot", () => {
  const rng = creerRng(4242);
  const effectif = RMClub.genererEffectifEtendu(rng, 0.5);
  const composition = RMClub.meilleureComposition(effectif);
  const cfg = RMClub.compositionVersJoueursCfg(effectif, composition);
  const parId = {};
  for (const j of effectif) parId[j.id] = j;
  for (let n = 1; n <= 15; n++) {
    const j = parId[composition[n]];
    assert.ok(j, `aucun joueur pour le n°${n}`);
    for (const champ of ['melee', 'touche', 'puissance', 'endurance', 'passe', 'jeuPied', 'decision', 'discipline', 'adresse']) {
      assert.strictEqual(cfg[n][champ], j[champ], `n°${n} : ${champ} écrasé (${cfg[n][champ]} au lieu de ${j[champ]})`);
    }
  }
});

// --- 3. Symétrie mesurée sur de vrais matchs -------------------------------
// À niveau strictement égal, le club du joueur doit gagner à peu près autant
// qu'il perd. Le nombre de matchs est volontairement modeste (CI) : le seuil
// est large, il ne détecte qu'un biais STRUCTUREL, pas un déséquilibre fin.
// La mesure fine est dans server/simulate-ecarts.js.

const DUREE = 4800;
const DT = 0.2;

function jouerSerie(n, graineDepart, niveauJoueur, niveauIA) {
  const ecarts = [];
  for (let i = 0; i < n; i++) {
    const graine = graineDepart + i;
    const a = cfgClubJoueur(creerRng(graine * 7919 + 13), niveauJoueur);
    const b = cfgClubIA(creerRng(graine * 6271 + 29), niveauIA);
    const m = new MatchEngine(graine, DUREE, { joueursA: a, joueursB: b });
    for (let t = 0; t < DUREE; t += DT) m.tick(DT);
    const s = m.getState();
    ecarts.push(s.score.A - s.score.B);
  }
  return ecarts;
}

test('À niveau égal, le club du joueur ne perd pas systématiquement (20 matchs)', () => {
  const ecarts = jouerSerie(20, 1, 0.5, 0.5);
  const moyenne = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
  const victoires = ecarts.filter((e) => e > 0).length;
  console.log(`       (écart moyen ${moyenne.toFixed(1)} pt, ${victoires}/20 victoires)`);
  assert.ok(
    Math.abs(moyenne) <= 12,
    `écart moyen ${moyenne.toFixed(1)} pt à niveau égal (attendu |moyenne| <= 12)`
  );
  assert.ok(
    victoires >= 5 && victoires <= 15,
    `${victoires}/20 victoires à niveau égal (attendu entre 5 et 15)`
  );
});

test('À niveau égal, les grosses défaites (>21 pts) restent minoritaires', () => {
  const ecarts = jouerSerie(20, 101, 0.5, 0.5);
  const grosses = ecarts.filter((e) => e <= -21).length;
  console.log(`       (${grosses}/20 défaites de plus de 21 points)`);
  assert.ok(grosses <= 6, `${grosses}/20 grosses défaites à niveau égal (attendu <= 6)`);
});

console.log(`\n${nbTests - nbEchecs}/${nbTests} test(s) réussi(s).`);
process.exit(nbEchecs > 0 ? 1 : 0);
