// TEST DE PREUVE — LE SCOUT NE PARLE PAS DU POSTE
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré) :
//
//   Piliers du marché (5) — ce que le scout dit vs ce qu'ils valent :
//     2★ (vit 42/plaq 73) — mêlée 77 -> note au poste 72
//     2★ (vit 39/plaq 76) — mêlée 86 -> note au poste 74.8
//     2★ (vit 44/plaq 65) — mêlée 84 -> note au poste 73.2
//     2★ (vit 48/plaq 65) — mêlée 81 -> note au poste 72.2
//     2★ (vit 43/plaq 67) — mêlée 83 -> note au poste 73.5
//
// Les CINQ affichent la même note. Leur mêlée — l'attribut qui décide si un
// pilier joue, depuis le correctif P0-composition — s'échelonne de 77 à 86,
// et le rapport de scout n'en dit pas un mot. `statsApparentes` n'expose que
// `vitesse`, `plaquage` et `complet` ; les neuf autres attributs du joueur
// (mêlée, touche, puissance, endurance, passe, jeu au pied, décision,
// discipline, adresse) n'apparaissent nulle part.
//
// Sur 501 comparaisons, le joueur le mieux noté par le scout n'est PAS le
// meilleur au poste dans 347 cas (69 %).
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : c'est la dernière poche où le
// jeu se contredit lui-même. La composition automatique classe au poste
// (noteAuPoste, correctif P0), les réclamations aussi (P1-45), mais le
// recrutement — la décision la plus chère du jeu — se fait encore sur deux
// attributs génériques. Recruter un pilier est un tirage au sort.
//
// FONCTIONS EXACTES RESPONSABLES : club-transferts.js, `statsApparentes`
// (n'expose que vitesse/plaquage) et `estimationEtoiles` (moyenne de ces
// deux-là), ainsi que `genererJoueurLibre` qui ne tire d'incertitude que sur
// ces deux attributs (`ecartVitesse`, `ecartPlaquage`).
//
// CE QUE CE FICHIER EXIGE :
//   1. un rapport de scout qui expose TOUS les attributs ;
//   2. une incertitude sur chacun, qui se résorbe avec la connaissance ;
//   3. une note en étoiles calculée AU POSTE, comme la composition ;
//   4. la possibilité de demander « et à un autre poste ? » ;
//   5. la liste des attributs qui comptent réellement à un poste donné ;
//   6. une ancienne sauvegarde qui ne plante pas et reste déterministe.
//
// Usage : node server/test-scouting.js
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

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

const ATTRIBUTS = ['vitesse', 'plaquage', 'adresse', 'melee', 'touche', 'puissance',
  'endurance', 'passe', 'jeuPied', 'decision', 'discipline'];

function marche(graine, n) {
  const m = RMClub.genererMarcheTransferts(creerRng(graine), 0.5, n || 40);
  return m;
}
function pleinementConnu(j) {
  j.connaissance = 100;
  return j;
}

test('S1 — PREUVE : le rapport de scout classe les piliers comme la composition', () => {
  const m = marche(99, 60).map(pleinementConnu);
  const piliers = m.filter((j) => j.poste === 'P');
  assert.ok(piliers.length >= 4, `il faut plusieurs piliers pour comparer (${piliers.length})`);
  // Avec la connaissance au maximum, le rapport ne doit plus rien cacher :
  // le classement du scout DOIT être celui de la composition.
  const parScout = piliers.slice().sort((a, b) =>
    RMClub.noteApparenteAuPoste(b, 'P') - RMClub.noteApparenteAuPoste(a, 'P'));
  const parPoste = piliers.slice().sort((a, b) => RMClub.noteAuPoste(b, 'P') - RMClub.noteAuPoste(a, 'P'));
  assert.strictEqual(parScout[0].id, parPoste[0].id,
    'le pilier le mieux noté par le scout doit être le meilleur pilier');
  // Et le rapport doit DISTINGUER les joueurs, pas les écraser tous sur la
  // même valeur (mesuré avant : les cinq piliers affichaient 2★, alors que
  // leur mêlée allait de 77 à 86). Les étoiles restent un résumé grossier —
  // c'est la NOTE AU POSTE qui doit permettre de choisir.
  const notes = new Set(piliers.map((j) => RMClub.noteApparenteAuPoste(j, 'P')));
  assert.ok(notes.size >= 3,
    `le rapport doit distinguer les piliers entre eux (${[...notes].join(', ')})`);
  // Les étoiles doivent rester COHÉRENTES avec la note : jamais un joueur
  // mieux étoilé mais moins bien noté.
  for (let i = 1; i < parPoste.length; i++) {
    assert.ok(RMClub.estimationEtoiles(parPoste[i]) <= RMClub.estimationEtoiles(parPoste[i - 1]),
      'les étoiles doivent suivre la note au poste');
  }
});

test('S2 — le rapport expose TOUS les attributs, pas deux', () => {
  const j = pleinementConnu(marche(101, 5)[0]);
  const s = RMClub.statsApparentes(j);
  for (const attr of ATTRIBUTS) {
    assert.ok(typeof s[attr] === 'number', `le rapport doit donner ${attr} (${s[attr]})`);
  }
  assert.strictEqual(s.complet, true);
});

test('S3 — à connaissance complète, le rapport ne cache plus rien', () => {
  for (const j of marche(102, 12).map(pleinementConnu)) {
    const s = RMClub.statsApparentes(j);
    for (const attr of ATTRIBUTS) {
      assert.strictEqual(s[attr], j[attr],
        `${attr} : le rapport doit dire la vérité une fois le joueur connu (${s[attr]} vs ${j[attr]})`);
    }
  }
});

test('S4 — l\'incertitude porte sur CHAQUE attribut et se résorbe', () => {
  const j = marche(103, 5)[0];
  j.connaissance = 10;
  const flou = RMClub.statsApparentes(j);
  const ecartsAuDepart = ATTRIBUTS.filter((a) => flou[a] !== j[a]);
  assert.ok(ecartsAuDepart.length >= 5,
    `mal connu, le rapport doit se tromper sur plusieurs attributs (${ecartsAuDepart.length})`);
  j.connaissance = 60;
  const mieux = RMClub.statsApparentes(j);
  const sommeAvant = ATTRIBUTS.reduce((t, a) => t + Math.abs(flou[a] - j[a]), 0);
  const sommeApres = ATTRIBUTS.reduce((t, a) => t + Math.abs(mieux[a] - j[a]), 0);
  assert.ok(sommeApres < sommeAvant,
    `mieux connaître doit rapprocher le rapport de la réalité (${sommeApres} vs ${sommeAvant})`);
});

test('S5 — la note est calculée AU POSTE, et on peut demander un autre poste', () => {
  const m = marche(104, 60).map(pleinementConnu);
  const pilier = m.find((j) => j.poste === 'P');
  const ailier = m.find((j) => j.poste === 'AI');
  assert.ok(pilier && ailier);
  // Un pilier évalué comme ailier doit perdre beaucoup, et réciproquement :
  // c'est tout l'intérêt d'une note au poste.
  assert.ok(RMClub.estimationEtoiles(pilier, 'P') > RMClub.estimationEtoiles(pilier, 'AI'),
    'un pilier n\'est pas un ailier');
  assert.ok(RMClub.estimationEtoiles(ailier, 'AI') > RMClub.estimationEtoiles(ailier, 'P'),
    'un ailier n\'est pas un pilier');
  // Sans poste précisé : celui du joueur.
  assert.strictEqual(RMClub.estimationEtoiles(pilier), RMClub.estimationEtoiles(pilier, 'P'));
});

test('S6 — le rapport dit QUELS attributs comptent à ce poste', () => {
  const cles = RMClub.attributsClesDuPoste('P');
  assert.ok(Array.isArray(cles) && cles.length >= 3);
  assert.strictEqual(cles[0].attr, 'melee', 'la mêlée d\'abord pour un pilier');
  for (const c of cles) {
    assert.ok(c.libelle && typeof c.poids === 'number' && c.poids > 0, JSON.stringify(c));
  }
  // Trié du plus important au moins important.
  for (let i = 1; i < cles.length; i++) {
    assert.ok(cles[i].poids <= cles[i - 1].poids, 'les attributs doivent être triés par importance');
  }
  const clesAilier = RMClub.attributsClesDuPoste('AI');
  assert.strictEqual(clesAilier[0].attr, 'vitesse', 'la vitesse d\'abord pour un ailier');
});

test('S7 — commander un rapport réduit l\'incertitude sur TOUT le joueur', () => {
  const s = RMClub.nouvelleSaison(creerRng(105), 'AS Scout');
  RMClub.daterCalendrier(s);
  const j = s.marche[0];
  const avant = RMClub.statsApparentes(j);
  const ecartAvant = ATTRIBUTS.reduce((t, a) => t + Math.abs(avant[a] - j[a]), 0);
  assert.strictEqual(RMClub.scouterJoueur(s, j.id).ok, true);
  const apres = RMClub.statsApparentes(j);
  const ecartApres = ATTRIBUTS.reduce((t, a) => t + Math.abs(apres[a] - j[a]), 0);
  assert.ok(ecartApres < ecartAvant,
    `repérer doit resserrer l'ensemble du rapport (${ecartApres} vs ${ecartAvant})`);
});

test('S8 — une ancienne sauvegarde (sans incertitude détaillée) reste stable', () => {
  const j = marche(106, 5)[0];
  // Sauvegarde d'avant ce patch : seuls ecartVitesse/ecartPlaquage existent.
  delete j.ecarts;
  j.connaissance = 40;
  assert.doesNotThrow(() => RMClub.statsApparentes(j));
  const a = RMClub.statsApparentes(j);
  const b = RMClub.statsApparentes(j);
  for (const attr of ATTRIBUTS) {
    assert.strictEqual(a[attr], b[attr],
      `${attr} : deux lectures du même rapport doivent donner le MÊME chiffre`);
  }
  assert.doesNotThrow(() => RMClub.estimationEtoiles(j));
});

test('S9 — un joueur signé n\'a plus aucun brouillard', () => {
  const s = RMClub.nouvelleSaison(creerRng(107), 'AS Scout');
  RMClub.daterCalendrier(s);
  s.clubJoueur.budget = 9000;
  const cible = s.marche[0];
  assert.strictEqual(RMClub.signerJoueur(s, cible.id).ok, true);
  const recrue = s.clubJoueur.effectif.find((x) => x.id === cible.id);
  assert.ok(recrue, 'la recrue doit être dans l\'effectif');
  assert.strictEqual(recrue.connaissance, undefined, 'plus de connaissance partielle');
  assert.strictEqual(recrue.ecarts, undefined, 'plus d\'incertitude résiduelle');
});

test('S10 — le dossier de repérage compare le joueur au poste visé', () => {
  const s = RMClub.nouvelleSaison(creerRng(108), 'AS Scout');
  RMClub.daterCalendrier(s);
  const j = s.marche[0];
  const d = RMClub.rapportScouting(s, j.id);
  assert.ok(d, 'un dossier doit exister');
  assert.strictEqual(d.poste, j.poste);
  assert.ok(d.etoiles >= 1 && d.etoiles <= 5);
  assert.ok(typeof d.note === 'number' && d.note > 0, 'la note au poste doit être donnée');
  assert.ok(Array.isArray(d.attributsCles) && d.attributsCles.length >= 3);
  for (const a of d.attributsCles) {
    assert.ok(a.libelle && typeof a.valeur === 'number',
      `chaque attribut clé doit porter sa valeur apparente (${JSON.stringify(a)})`);
  }
  // Comparaison à l'effectif : le manager doit savoir si ça l'améliore.
  assert.ok(typeof d.meilleurActuel === 'number' || d.meilleurActuel === null,
    'la note du meilleur joueur actuel au poste doit être fournie');
  assert.ok(typeof d.fiabilite === 'number' && d.fiabilite >= 0 && d.fiabilite <= 1);
});

test('S11 — un rapport COMMANDÉ, une fois remis, resserre tout le dossier', () => {
  // C'est le chemin réellement emprunté par le bouton de l'écran
  // (commanderRapportScouting, différé de quelques jours — P1-23), distinct
  // de scouterJoueur testé en S7.
  const s = RMClub.nouvelleSaison(creerRng(109), 'AS Scout');
  RMClub.daterCalendrier(s);
  const j = s.marche[0];
  const ecartDe = () => {
    const a = RMClub.statsApparentes(j);
    return ATTRIBUTS.reduce((t, k) => t + Math.abs((a[k] || 0) - (j[k] || 0)), 0);
  };
  const avant = ecartDe();
  const cmd = RMClub.commanderRapportScouting(s, j.id);
  assert.strictEqual(cmd.ok, true, `commande attendue (${cmd.motif})`);
  assert.strictEqual(ecartDe(), avant, 'commander ne révèle rien tout de suite');
  // On avance jusqu'à la date de remise.
  const remise = RMClub.ajouterJours(RMClub.dateCourante(s), cmd.delai);
  const remis = RMClub.remettreRapportsScouting(s, remise);
  assert.ok(remis.length >= 1, 'le rapport doit être remis à échéance');
  assert.ok(ecartDe() < avant,
    `le rapport remis doit resserrer TOUS les attributs (${ecartDe()} vs ${avant})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
