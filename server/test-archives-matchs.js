// COUVERTURE — les feuilles de match archivées.
//
// Défaut mesuré : `club-feuille-de-match.js` produit un vrai compte rendu,
// mais à partir de l'état VIVANT du moteur, qui n'est jamais sauvegardé. D'un
// match joué, la sauvegarde ne gardait que le score. Cliquer une rencontre
// déjà jouée ne pouvait donc rien ouvrir — il n'y avait rien à ouvrir, et le
// compte rendu disparaissait dès qu'on fermait l'écran de fin de match.
//
// Usage : node server/test-archives-matchs.js
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

let graine = 61000;
function carriere() {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Archives');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  return s;
}
// Un état de match de la forme que produit réellement le moteur.
function etatMatch(scoreA, scoreB) {
  return {
    score: { A: scoreA, B: scoreB },
    stats: { A: { essais: 4, rucks: 60, tacklesMade: 80 }, B: { essais: 2, rucks: 40, tacklesMade: 70 } },
    statsJoueurs: { A: {}, B: {} },
    chronologie: [
      { minute: 12, id: 1, type: 'ESSAI', team: 'A', message: 'Essai !', t: 720 },
      { minute: 13, id: 2, type: 'TRANSFORMATION_REUSSIE', team: 'A', message: 'Transformation', t: 780 },
      { minute: 40, id: 3, type: 'MI_TEMPS', team: null, message: 'Mi-temps', t: 2400 },
      { minute: 55, id: 4, type: 'ESSAI', team: 'B', message: 'Essai !', t: 3300 },
      { minute: 70, id: 5, type: 'PENALITE', team: 'A', message: 'Pénalité concédée', t: 4200 },
    ],
  };
}
function jouerChampionnat(s, etat) {
  const c = s.clubJoueur;
  const slot = RMClub.slotCompositionPourEquipe(s, 'pro');
  const f = (s.calendrier || []).find((x) => !x.joue && (x.domicileId === c.id || x.exterieurId === c.id));
  const lettre = f.domicileId === c.id ? 'A' : 'B';
  RMClub.appliquerConsequencesMatchJoueur(s, {
    fixture: f, etat, lettreJoueur: lettre, forme: 'v',
    compositionUtilisee: slot.compositionTitulaires,
    compositionAvecRemplacants: slot.compositionTitulaires,
    nomA: 'Domicile', nomB: 'Extérieur', rng: creerRng(3),
  });
  return f;
}

test('F1 — un match du joueur laisse un compte rendu consultable', () => {
  const s = carriere();
  assert.deepStrictEqual(s.feuillesMatch || [], [], 'aucune archive au départ');
  const f = jouerChampionnat(s, etatMatch(27, 15));
  const cle = RMClub.cleFeuille(RMClub.REF_COMPETITION_JOUEUR, f.id);
  const feuille = RMClub.feuilleDeMatchArchivee(s, cle);
  assert.ok(feuille, 'la rencontre doit avoir un compte rendu');
  assert.strictEqual(feuille.score.A, 27);
  assert.strictEqual(feuille.score.B, 15);
  assert.ok(feuille.chronologie.length >= 5, 'la chronologie est conservée');
  assert.ok(feuille.statistiques.length, 'les statistiques comparées aussi');
  assert.strictEqual(feuille.libelle, `Journée ${f.journee}`);
  assert.strictEqual(feuille.date, f.date);
});

test('F2 — seuls les champs RÉELLEMENT lus sont conservés', () => {
  // `id` et `t` sont des détails internes au moteur : les garder gonflerait
  // la sauvegarde sans rien apporter à la feuille.
  const s = carriere();
  jouerChampionnat(s, etatMatch(27, 15));
  const brute = s.feuillesMatch[0];
  const evenement = brute.chronologie[0];
  assert.deepStrictEqual(Object.keys(evenement).sort(), ['message', 'minute', 'team', 'type']);
  assert.ok(!('id' in evenement) && !('t' in evenement), 'aucun champ interne au moteur');
});

test('F3 — la taille reste tenable, plafond compris', () => {
  // Mesuré dans le navigateur sur un VRAI match : 47 événements, ~6,3 Ko.
  // On reproduit cette échelle plutôt que de se rassurer avec la
  // chronologie de cinq lignes des autres cas.
  const s = carriere();
  const etat = etatMatch(27, 15);
  const gabarit = etat.chronologie[0];
  while (etat.chronologie.length < 50) {
    etat.chronologie.push(Object.assign({}, gabarit, { minute: etat.chronologie.length }));
  }
  jouerChampionnat(s, etat);
  const octets = JSON.stringify(s.feuillesMatch).length;
  assert.ok(octets < 12000, `un compte rendu doit rester compact (${octets} octets)`);
  // Et surtout : le pire cas total reste très en dessous de ce qu'un
  // navigateur accepte en localStorage (~5 Mo).
  const pireCas = octets * RMClub.MAX_FEUILLES_MATCH;
  assert.ok(pireCas < 700000,
    `le plafond doit borner la sauvegarde (${Math.round(pireCas / 1024)} Ko au pire)`);
});

test('F4 — le nombre d\'archives est plafonné', () => {
  const s = carriere();
  const plafond = RMClub.MAX_FEUILLES_MATCH;
  assert.ok(plafond > 0, 'un plafond doit exister');
  for (let i = 0; i < plafond + 15; i++) {
    RMClub.archiverFeuilleDeMatch(s, { cle: 'test#' + i, etat: etatMatch(10, 10) });
  }
  assert.strictEqual(s.feuillesMatch.length, plafond,
    'la sauvegarde ne doit pas croître indéfiniment');
  assert.strictEqual(RMClub.feuilleArchivee(s, 'test#0'), null,
    'la plus ancienne est évincée');
  assert.ok(RMClub.feuilleArchivee(s, 'test#' + (plafond + 14)), 'la plus récente est là');
});

test('F5 — rejouer la même rencontre remplace, n\'empile pas', () => {
  const s = carriere();
  RMClub.archiverFeuilleDeMatch(s, { cle: 'joueur#f1', etat: etatMatch(10, 20) });
  RMClub.archiverFeuilleDeMatch(s, { cle: 'joueur#f1', etat: etatMatch(30, 5) });
  assert.strictEqual(s.feuillesMatch.length, 1, 'une seule entrée pour une rencontre');
  assert.strictEqual(RMClub.feuilleArchivee(s, 'joueur#f1').score.A, 30, 'la plus récente gagne');
});

test('F6 — une rencontre sans compte rendu répond null, elle n\'en invente pas', () => {
  const s = carriere();
  assert.strictEqual(RMClub.feuilleArchivee(s, 'joueur#inexistant'), null);
  assert.strictEqual(RMClub.feuilleDeMatchArchivee(s, 'joueur#inexistant'), null);
});

test('F7 — coupe et amical laissent eux aussi leur compte rendu', () => {
  const s = carriere();
  RMClub.assurerCoupes(s);
  const c = s.clubJoueur;
  const coupe = s.coupes.nationale;
  let rencontre = null;
  for (const t of coupe.tours) {
    rencontre = (t.rencontres || []).find((x) => x.domicileId === c.id || x.exterieurId === c.id);
    if (rencontre) break;
  }
  assert.ok(rencontre, 'le club est engagé en Coupe Nationale');
  const domicile = rencontre.domicileId === c.id;
  const advId = domicile ? rencontre.exterieurId : rencontre.domicileId;
  const slot = RMClub.slotCompositionPourEquipe(s, 'pro');
  RMClub.appliquerConsequencesMatchCoupe(s, {
    coupe, rencontre, adversaire: coupe.clubs.find((x) => x.id === advId),
    date: RMClub.dateDepuisISO(coupe.tours[rencontre.tour].date),
    etat: etatMatch(30, 10), lettreJoueur: domicile ? 'A' : 'B',
    compositionUtilisee: slot.compositionTitulaires, equipe: 'pro',
    rng: creerRng(11), rngCoupes: creerRng(13),
  });
  const cle = RMClub.cleFeuille('coupe:nationale', rencontre.id);
  const f = RMClub.feuilleDeMatchArchivee(s, cle);
  assert.ok(f, 'la coupe doit archiver sa feuille');
  assert.ok(f.libelle, `avec le nom de son tour (${f.libelle})`);
});

test('F8 — une sauvegarde antérieure se charge, sans archives et sans casse', () => {
  const s = carriere();
  jouerChampionnat(s, etatMatch(27, 15));
  // Simule une sauvegarde v8 : la clé n'existe pas encore.
  const ancienne = JSON.parse(JSON.stringify(s));
  delete ancienne.feuillesMatch;
  ancienne.version = 8;
  RMClub.sauvegarderSaison(ancienne);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde v8 doit rester chargeable');
  assert.strictEqual(rechargee.version, RMClub.VERSION_SAUVEGARDE,
    'et être migrée jusqu\'à la version courante');
  assert.deepStrictEqual(rechargee.feuillesMatch, [],
    'sans archives : c\'est le cas normal, pas une perte');
  // Et le classement, lui, est intact.
  assert.strictEqual(Object.keys(rechargee.classement).length,
    Object.keys(s.classement).length, 'la progression sportive est préservée');
});

test('F9 — la fin de saison purge RÉELLEMENT les comptes rendus périmés', () => {
  // Pas seulement la fonction : le passage de saison doit l'appeler. Sinon
  // une carrière de dix saisons empile dix saisons de comptes rendus.
  const s = carriere();
  jouerChampionnat(s, etatMatch(27, 15));
  assert.strictEqual((s.feuillesMatch || []).length, 1, 'un compte rendu enregistré');
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(5), s);
  assert.deepStrictEqual(s.feuillesMatch, [],
    'la saison suivante repart sans les comptes rendus de la précédente');
});

test('F10 — un seul rendu de feuille dans le jeu', () => {
  const fs = require('fs');
  const main = fs.readFileSync(__dirname + '/../docs/js/main.js', 'utf8');
  const module_ = fs.readFileSync(__dirname + '/../docs/js/club-feuille-de-match.js', 'utf8');
  assert.strictEqual(typeof RMClub.htmlFeuilleDeMatch, 'function',
    'le rendu doit être exporté par le module qui produit la feuille');
  assert.ok(main.indexOf('titreFeuille') === -1,
    'main.js ne doit plus contenir sa propre copie du rendu');
  assert.ok(main.indexOf('htmlFeuilleDeMatch') !== -1,
    'il doit appeler le rendu partagé');
  assert.ok(module_.indexOf('function htmlFeuilleDeMatch') !== -1);
  // Et le rendu produit bien quelque chose de lisible.
  const s = carriere();
  const f = jouerChampionnat(s, etatMatch(27, 15));
  const feuille = RMClub.feuilleDeMatchArchivee(s, RMClub.cleFeuille(RMClub.REF_COMPETITION_JOUEUR, f.id));
  const html = RMClub.htmlFeuilleDeMatch(feuille);
  assert.ok(html.indexOf('Feuille de match') !== -1, 'un titre');
  assert.ok(html.indexOf('Le fil du match') !== -1, 'la chronologie');
  assert.ok(html.indexOf('Statistiques') !== -1, 'les statistiques');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
