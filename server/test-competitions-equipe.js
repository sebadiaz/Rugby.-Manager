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

// ------------------------------------------------- JOURNÉES (C3) ---------
//
// Défaut mesuré : le sous-onglet « Calendrier » empilait TOUTES les journées
// d'un coup — 182 rencontres pour un championnat à 14 clubs en aller-retour.

test('J1 — une compétition se découpe en journées réelles', () => {
  const s = carriere();
  const comp = RMClub.competition(s, 'joueur');
  const journees = RMClub.journeesDe(comp);
  assert.strictEqual(journees.length, 26, 'aller-retour à 14 clubs : 26 journées');
  const total = journees.reduce((t, j) => t + j.total, 0);
  assert.strictEqual(total, comp.calendrier.length,
    'aucune rencontre perdue ni comptée deux fois');
  for (const j of journees) {
    assert.strictEqual(j.total, 7, `${j.nom} : 14 clubs = 7 rencontres`);
    assert.ok(j.date, 'chaque journée porte sa date');
    assert.strictEqual(j.terminee, false, 'rien n\'est joué au départ');
  }
});

test('J2 — une coupe nomme ses tours au lieu de les numéroter', () => {
  const s = carriere();
  const comp = RMClub.competition(s, 'coupe:nationale');
  const journees = RMClub.journeesDe(comp);
  assert.ok(journees.length, 'la coupe a au moins un tour');
  for (const j of journees) {
    assert.ok(!/^Journée /.test(j.nom), `un tour de coupe se nomme (${j.nom})`);
  }
});

test('J3 — on ouvre là où EN EST la compétition, pas sur la journée 1', () => {
  const s = carriere();
  const comp0 = RMClub.competition(s, 'joueur');
  assert.strictEqual(RMClub.journeeCouranteDe(comp0), 1,
    'saison neuve : la journée 1');
  // Joue entièrement les trois premières journées.
  for (const f of s.calendrier) {
    if (f.journee <= 3) RMClub.enregistrerResultat(s, f.id, 20, 15, 2, 1);
  }
  const comp = RMClub.competition(s, 'joueur');
  assert.strictEqual(RMClub.journeeCouranteDe(comp), 4,
    'trois journées jouées : on ouvre sur la 4e');
  const journees = RMClub.journeesDe(comp);
  assert.strictEqual(journees[0].terminee, true, 'la J1 est terminée');
  assert.strictEqual(journees[3].commencee, false, 'la J4 n\'a pas commencé');
});

test('J4 — une journée partiellement jouée est signalée comme telle', () => {
  const s = carriere();
  const premiere = s.calendrier.filter((f) => f.journee === 1);
  RMClub.enregistrerResultat(s, premiere[0].id, 20, 15, 2, 1);
  const comp = RMClub.competition(s, 'joueur');
  const j1 = RMClub.journeesDe(comp)[0];
  assert.strictEqual(j1.commencee, true);
  assert.strictEqual(j1.terminee, false);
  assert.strictEqual(j1.jouees, 1);
  assert.strictEqual(RMClub.journeeCouranteDe(comp), 1,
    'une journée entamée reste la journée courante');
});

test('J5 — en fin de saison, on ouvre sur la DERNIÈRE journée', () => {
  const s = carriere();
  for (const f of s.calendrier) RMClub.enregistrerResultat(s, f.id, 20, 15, 2, 1);
  const comp = RMClub.competition(s, 'joueur');
  assert.strictEqual(RMClub.journeeCouranteDe(comp), 26,
    'tout joué : on reste sur la dernière, jamais null');
});

test('J6 — l\'interface affiche UNE journée, avec sa navigation', () => {
  const fs = require('fs');
  const ui = fs.readFileSync(__dirname + '/../docs/js/clubUI.js', 'utf8');
  assert.ok(ui.indexOf('function rendreJourneeCalendrier') !== -1,
    'un rendu dédié à une seule journée doit exister');
  assert.ok(ui.indexOf('RMClub.journeeCouranteDe') !== -1,
    'et il doit ouvrir sur la journée courante réelle');
  assert.ok(ui.indexOf('btnJournee') !== -1, 'avec des boutons de navigation');
  const css = fs.readFileSync(__dirname + '/../docs/css/style.css', 'utf8');
  assert.ok(css.indexOf('.navJournee') !== -1, 'stylés une seule fois dans la feuille de style');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
