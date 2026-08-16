// COUVERTURE — l'écran Compétitions vu par ÉQUIPE.
//
// Audit mesuré avant cette tranche : pour ouvrir le championnat de son
// Équipe B, le manager devait le retrouver dans une liste PLATE de 21 entrées
// mélangeant 12 pays, 3 paliers français, ses 2 championnats de club et
// 4 coupes. Le sélecteur Première / B / Espoirs existait pourtant déjà —
// mais uniquement dans l'écran Calendrier.
//
// Ces deux fonctions donnent l'entrée par équipe, avec un résumé tiré des
// données RÉELLES. Une seule logique pour les trois équipes et pour les deux
// formats (championnat, coupe).
//
// Usage : node server/test-competitions-equipe.js
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

let graine = 41000;
function carriere() {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Compétitions');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerCompetitionB(s);
  RMClub.assurerCompetitionEspoirs(s);
  RMClub.assurerCoupes(s);
  return s;
}

test('E1 — chaque équipe a SES compétitions, et seulement les siennes', () => {
  const s = carriere();
  const pro = RMClub.competitionsDeLEquipe(s, 'pro').map((c) => c.ref);
  const b = RMClub.competitionsDeLEquipe(s, 'b').map((c) => c.ref);
  const jeunes = RMClub.competitionsDeLEquipe(s, 'jeunes').map((c) => c.ref);
  assert.ok(pro.indexOf('joueur') !== -1, 'la Première a son championnat');
  assert.ok(b.indexOf('equipeB') !== -1, 'la B a le sien');
  assert.ok(jeunes.indexOf('espoirs') !== -1, 'les espoirs aussi');
  // Aucune compétition ne doit apparaître dans deux équipes à la fois.
  const toutes = pro.concat(b, jeunes);
  assert.strictEqual(new Set(toutes).size, toutes.length,
    `aucune compétition partagée entre équipes (${JSON.stringify(toutes)})`);
});

test('E2 — les coupes suivent la règle du moteur, pas un classement arbitraire', () => {
  const s = carriere();
  const pro = RMClub.competitionsDeLEquipe(s, 'pro').map((c) => c.ref);
  const jeunes = RMClub.competitionsDeLEquipe(s, 'jeunes').map((c) => c.ref);
  assert.ok(jeunes.indexOf('coupe:espoirs') !== -1,
    'la Coupe des Espoirs appartient aux espoirs');
  assert.ok(pro.indexOf('coupe:espoirs') === -1,
    'et surtout PAS à l\'équipe première');
  // La règle vient de club-coupes.js, elle n'est pas recopiée ici.
  for (const cle of Object.keys(s.coupes || {})) {
    const attendu = RMClub.equipePourCoupe(cle);
    const ref = 'coupe:' + cle;
    const engage = (s.coupes[cle].clubs || []).some((c) => c.id === s.clubJoueur.id);
    if (!engage) continue;
    const listee = RMClub.competitionsDeLEquipe(s, attendu).map((c) => c.ref);
    assert.ok(listee.indexOf(ref) !== -1,
      `${cle} doit être listée pour l'équipe « ${attendu} »`);
  }
});

test('E3 — une compétition inexistante n\'est jamais listée', () => {
  // Le cas réel : une Équipe B non qualifiée n'a pas de championnat. L'écran
  // doit dire « aucune compétition », pas afficher une page vide.
  const s = carriere();
  s.competitionB = { eligibles: [], calendrier: [], classement: {} };
  s.coupes = {};
  assert.strictEqual(RMClub.competition(s, 'equipeB'), null,
    'sans calendrier, cette compétition n\'existe pas');
  assert.deepStrictEqual(RMClub.competitionsDeLEquipe(s, 'b'), [],
    'et elle n\'est donc pas listée');
  const pro = RMClub.competitionsDeLEquipe(s, 'pro').map((c) => c.ref);
  assert.deepStrictEqual(pro, ['joueur'],
    'sans coupes, la Première garde son seul championnat');
});

test('E4 — le résumé d\'un championnat vient du classement RÉEL', () => {
  const s = carriere();
  const r = RMClub.resumeCompetition(s, 'joueur');
  assert.ok(r, 'un résumé doit exister');
  assert.strictEqual(r.estCoupe, false);
  assert.strictEqual(r.nbClubs, 14);
  assert.strictEqual(r.j, 0, 'aucun match joué au départ');
  assert.strictEqual(r.pts, 0);
  assert.deepStrictEqual(r.forme, [], 'aucune forme sans match joué');
  assert.strictEqual(r.dernier, null, 'aucun dernier résultat inventé');
  assert.ok(r.prochain && r.prochain.adversaire, 'mais un prochain adversaire réel');
  assert.strictEqual(r.journeesRestantes, r.journees,
    'toutes les journées restent à jouer');
});

test('E5 — après un vrai match, le résumé le reflète', () => {
  const s = carriere();
  const c = s.clubJoueur;
  const f = (s.calendrier || []).find((x) => x.domicileId === c.id || x.exterieurId === c.id);
  const domicile = f.domicileId === c.id;
  RMClub.enregistrerResultat(s, f.id, domicile ? 30 : 10, domicile ? 10 : 30, 4, 1);
  const r = RMClub.resumeCompetition(s, 'joueur');
  assert.strictEqual(r.j, 1, 'un match joué');
  assert.deepStrictEqual(r.forme, ['V'], 'une victoire, lue depuis le score réel');
  assert.ok(r.dernier, 'un dernier résultat');
  assert.strictEqual(r.dernier.pour, 30);
  assert.strictEqual(r.dernier.contre, 10);
  assert.strictEqual(r.dernier.domicile, domicile);
  assert.ok(r.dernier.adversaire, 'avec le nom de l\'adversaire');
  assert.strictEqual(r.journeesRestantes, r.journees - 1);
  assert.ok(r.pts > 0, 'et des points au classement');
});

test('E6 — la forme est lue du point de vue du CLUB, pas du domicile', () => {
  // Un club qui gagne 10-30 à l'extérieur a gagné. Une lecture naïve de
  // `score.domicile > score.exterieur` écrirait « D ».
  const s = carriere();
  const c = s.clubJoueur;
  const exterieur = (s.calendrier || []).find((x) => x.exterieurId === c.id);
  assert.ok(exterieur, 'il doit exister un déplacement');
  RMClub.enregistrerResultat(s, exterieur.id, 10, 30, 1, 4);
  const r = RMClub.resumeCompetition(s, 'joueur');
  assert.deepStrictEqual(r.forme, ['V'], 'gagner à l\'extérieur est une victoire');
  assert.strictEqual(r.dernier.pour, 30);
  assert.strictEqual(r.dernier.domicile, false);
});

test('E7 — une coupe renseigne le tour, pas un classement', () => {
  const s = carriere();
  const r = RMClub.resumeCompetition(s, 'coupe:espoirs');
  assert.ok(r, 'la Coupe des Espoirs doit avoir un résumé');
  assert.strictEqual(r.estCoupe, true);
  assert.strictEqual(r.rang, undefined, 'aucun rang inventé pour une coupe');
  assert.ok(r.tourActuel, `un tour doit être nommé (${JSON.stringify(r)})`);
  assert.strictEqual(r.encoreEnLice, true, 'le club est engagé et non éliminé');
  assert.strictEqual(r.vainqueur, null, 'aucun vainqueur avant la finale');
  assert.ok(r.prochain && r.prochain.adversaire, 'un adversaire réel au prochain tour');
});

test('E8 — une élimination se lit dans le résumé', () => {
  const s = carriere();
  const c = s.clubJoueur;
  const coupe = s.coupes.espoirs;
  let rencontre = null;
  for (const t of coupe.tours) {
    rencontre = (t.rencontres || []).find((x) => x.domicileId === c.id || x.exterieurId === c.id);
    if (rencontre) break;
  }
  const domicile = rencontre.domicileId === c.id;
  RMClub.enregistrerResultatCoupe(coupe, rencontre.id, domicile ? 3 : 30, domicile ? 30 : 3);
  const r = RMClub.resumeCompetition(s, 'coupe:espoirs');
  assert.strictEqual(r.elimine, true, 'le club est éliminé');
  assert.strictEqual(r.encoreEnLice, false);
  assert.deepStrictEqual(r.forme, ['D']);
  assert.strictEqual(r.prochain, null, 'plus aucun match à venir pour lui');
});

test('E9 — le résumé marche pour N\'IMPORTE quel club, pas seulement le joueur', () => {
  // C'est ce qui permettra d'afficher la même fiche pour un adversaire sans
  // écrire un second écran.
  const s = carriere();
  const rival = (s.adversaires || [])[0];
  const r = RMClub.resumeCompetition(s, 'joueur', rival.id);
  assert.ok(r, 'un rival a lui aussi un résumé');
  assert.strictEqual(r.engage, true);
  assert.ok(r.prochain && r.prochain.adversaire, 'et un prochain match réel');
  assert.notStrictEqual(r.prochain.adversaire, rival.nom, 'jamais contre lui-même');
});

test('E10 — l\'interface propose bien le sélecteur d\'équipe sur Compétitions', () => {
  const fs = require('fs');
  const ui = fs.readFileSync(__dirname + '/../docs/js/clubUI.js', 'utf8');
  const html = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
  const ligne = ui.match(/const ONGLETS_AVEC_EQUIPE = \[[^\]]*\]/);
  assert.ok(ligne, 'la liste des onglets pilotés par le sélecteur doit exister');
  assert.ok(ligne[0].indexOf("'classement'") !== -1,
    `l'écran Compétitions doit y figurer (${ligne[0]})`);
  const volet = html.slice(html.indexOf('data-volet="classement"'));
  const fin = volet.indexOf('data-volet="calendrier"');
  const corps = volet.slice(0, fin === -1 ? volet.length : fin);
  assert.ok(corps.indexOf('emplacementSelecteurEquipe') !== -1,
    'et le volet doit avoir son emplacement de sélecteur');
  assert.ok(corps.indexOf('clubCompetitionsEquipe') !== -1,
    'ainsi que la carte listant les compétitions de l\'équipe');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
