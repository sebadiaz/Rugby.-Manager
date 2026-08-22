// COUVERTURE — les clubs du monde ont enfin une histoire.
//
// Audit mesuré avant cette tranche, après quatre saisons jouées :
//
//   club du joueur       historiqueSaisons = 4 entrées
//   club adverse         historiqueSaisons = ABSENT
//                        palmares          = ABSENT
//                        champs : id, nom, couleur, niveauClub, effectif,
//                                 budget, groupe, banc
//   club d'une autre division : id, nom, niveauClub, budget
//
// Et pourtant, la simulation PRODUIT déjà des histoires : sur ces quatre
// saisons, « Valfleur Ours » a été champion **quatre fois de suite**. Ce
// n'était écrit nulle part — l'information n'existait que sous forme d'une
// chaîne `champion` dans les propres lignes d'historique du joueur, et
// disparaissait dès qu'il changeait de division.
//
// Depuis G15 les clubs SURVIVENT aux montées et aux descentes. Il leur
// manquait la mémoire de ce qu'ils ont vécu.
//
// Usage : node server/test-palmares-clubs.js
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

let graine = 610000;
function carriere(niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Palmarès');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  RMClub.assurerAutresDivisionsFrance(creerRng(graine++), s);
  return s;
}
// Termine la saison avec un vainqueur IMPOSÉ (par son id) et le club du
// joueur à la position voulue.
function finir(s, position, championId) {
  const c = s.clubJoueur;
  const ids = Object.keys(s.classement);
  const rivaux = ids.filter((id) => id !== c.id);
  s.classement[c.id].pts = 50;
  rivaux.forEach((id, i) => { s.classement[id].pts = i < (position - 1) ? 90 : 10; });
  if (championId) s.classement[championId].pts = 500;
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(graine++), s);
}

test('P1 — chaque club de MA division garde son histoire, pas seulement moi', () => {
  const s = carriere(3);
  const suivi = (s.adversaires || [])[0];
  const id = suivi.id;
  finir(s, 7);
  const c = RMClub.clubPartout(s, id);
  assert.ok(c, 'le club doit toujours exister');
  const h = RMClub.historiqueClub(s, id);
  assert.ok(Array.isArray(h) && h.length === 1,
    `${suivi.nom} doit avoir une saison à son historique (${h ? h.length : 'aucun'})`);
  assert.strictEqual(h[0].numero, 1);
  assert.ok(h[0].position >= 1 && h[0].position <= h[0].totalClubs,
    `position invalide (${h[0].position}/${h[0].totalClubs})`);
  assert.strictEqual(h[0].palierNiveau, 3, 'avec le palier où la saison a été jouée');
});

test('P2 — PREUVE : un club qui gagne quatre fois le sait', () => {
  const s = carriere(3);
  const champion = (s.adversaires || [])[0];
  for (let n = 0; n < 4; n++) finir(s, 7, champion.id);
  const p = RMClub.palmaresClub(s, champion.id);
  assert.ok(p, 'le club doit avoir un palmarès');
  assert.strictEqual(p.titres, 4, `${champion.nom} doit compter 4 titres (${p.titres})`);
  assert.strictEqual(p.saisons, 4, 'sur 4 saisons suivies');
  assert.strictEqual(p.meilleurePosition, 1, 'sa meilleure place est la première');
});

test('P3 — et un club qui ne gagne jamais ne s\'en invente pas', () => {
  const s = carriere(3);
  const champion = (s.adversaires || [])[0];
  const autre = (s.adversaires || [])[1];
  for (let n = 0; n < 3; n++) finir(s, 7, champion.id);
  const p = RMClub.palmaresClub(s, autre.id);
  assert.strictEqual(p.titres, 0, `${autre.nom} ne doit compter aucun titre (${p.titres})`);
  assert.strictEqual(p.saisons, 3);
});

test('P4 — le palmarès du CLUB DU JOUEUR vient de la même fonction', () => {
  const s = carriere(3);
  for (let n = 0; n < 2; n++) finir(s, 1);
  const p = RMClub.palmaresClub(s, s.clubJoueur.id);
  assert.ok(p, 'le club du joueur doit avoir un palmarès');
  assert.strictEqual(p.titres, 2, `deux titres attendus (${p.titres})`);
  // Une seule source : le palmarès doit concorder avec son propre historique.
  const titresHistorique = (s.clubJoueur.historiqueSaisons || []).filter((h) => h.titre).length;
  assert.strictEqual(p.titres, titresHistorique,
    'le palmarès ne doit pas diverger de l\'historique du club');
});

test('P5 — les clubs des AUTRES divisions ont aussi leur histoire', () => {
  const s = carriere(3);
  const autres = (s.autresDivisionsFrance || {}).divisions || {};
  const cible = ((autres[1] || {}).clubs || [])[0];
  assert.ok(cible, 'il faut un club de Ligue d\'Excellence');
  // Leur saison doit être RÉELLEMENT disputée avant d'être consignée — c'est
  // ce que fait le jeu, une journée de ces divisions par journée jouée par le
  // manager (cf. clubUI.js). Sans ça, rien n'est enregistré, et c'est
  // exactement ce que verrouille P14.
  for (let j = 0; j < 30; j++) {
    RMClub.avancerJourneeAutresDivisionsFrance(creerRng(graine++), s.autresDivisionsFrance);
  }
  finir(s, 7);
  const h = RMClub.historiqueClub(s, cible.id);
  assert.ok(Array.isArray(h) && h.length >= 1,
    `${cible.nom} doit avoir une saison à son historique (${h ? h.length : 'aucun'})`);
  assert.strictEqual(h[0].palierNiveau, 1, 'jouée dans SA division');
});

test('P6 — l\'histoire suit le club quand il change de division', () => {
  const s = carriere(3);
  const suivi = (s.adversaires || [])[0];
  finir(s, 7);
  const avant = RMClub.historiqueClub(s, suivi.id).length;
  assert.ok(avant >= 1, 'il faut déjà une saison enregistrée');
  finir(s, 1); // promotion du joueur : les clubs changent de division
  const apres = RMClub.historiqueClub(s, suivi.id);
  assert.ok(apres.length > avant,
    `${suivi.nom} doit avoir gagné une saison, pas tout perdre (${avant} -> ${apres.length})`);
  assert.ok(RMClub.clubPartout(s, suivi.id), 'et exister toujours');
});

test('P7 — montées et descentes sont comptées, pas devinées', () => {
  // Une montée se LIT entre deux saisons enregistrées : la ligne d'une
  // saison porte le palier où elle a été jouée, pas celui où l'on ira. Il
  // faut donc avoir joué la saison suivante pour que le mouvement apparaisse
  // — c'est exactement ce que voit le manager sur la fiche du club.
  const s = carriere(3);
  finir(s, 1);   // champion de Régionale : le club montera en Nationale
  let p = RMClub.palmaresClub(s, s.clubJoueur.id);
  assert.strictEqual(p.montees, 0,
    'une seule saison enregistrée : aucun mouvement encore lisible');
  finir(s, 7);   // première saison en Nationale
  p = RMClub.palmaresClub(s, s.clubJoueur.id);
  assert.strictEqual(p.montees, 1, `la montée doit apparaître (${p.montees})`);
  assert.strictEqual(p.descentes, 0);
  assert.deepStrictEqual(p.paliers, [3, 2], 'et les deux paliers fréquentés');
  finir(s, RMClub.TAILLE_DIVISION_FRANCE[2]); // dernier : il redescend
  finir(s, 7);                                // retour en Régionale
  const p2 = RMClub.palmaresClub(s, s.clubJoueur.id);
  assert.strictEqual(p2.montees, 1, 'la montée reste comptée');
  assert.strictEqual(p2.descentes, 1, `une descente attendue (${p2.descentes})`);
});

test('P8 — un club sans passé le dit, il n\'invente pas un palmarès', () => {
  const s = carriere(3);
  const neuf = (s.adversaires || [])[0];
  const p = RMClub.palmaresClub(s, neuf.id);
  assert.ok(p, 'la fonction doit répondre même sans historique');
  assert.strictEqual(p.saisons, 0, 'aucune saison suivie');
  assert.strictEqual(p.titres, 0);
  assert.strictEqual(p.meilleurePosition, null, 'et aucune meilleure place inventée');
  assert.deepStrictEqual(RMClub.historiqueClub(s, neuf.id), []);
});

test('P9 — un club inconnu ne fait pas planter la lecture', () => {
  const s = carriere(3);
  assert.deepStrictEqual(RMClub.historiqueClub(s, 'clubQuiNExistePas'), []);
  const p = RMClub.palmaresClub(s, 'clubQuiNExistePas');
  assert.ok(p && p.saisons === 0, 'un palmarès vide, pas une exception');
});

test('P10 — l\'historique reste borné : la sauvegarde ne gonfle pas sans fin', () => {
  const s = carriere(3);
  const suivi = (s.adversaires || [])[0].id;
  for (let n = 0; n < 16; n++) finir(s, 7);
  const h = RMClub.historiqueClub(s, suivi);
  assert.ok(h.length > 0, 'le club doit avoir une histoire');
  assert.ok(h.length <= RMClub.MAX_SAISONS_HISTORIQUE_CLUB,
    `l'historique doit être borné (${h.length} > ${RMClub.MAX_SAISONS_HISTORIQUE_CLUB})`);
  // Et ce sont les saisons les plus RÉCENTES qui restent.
  const numeros = h.map((x) => x.numero);
  assert.strictEqual(Math.max.apply(null, numeros), Math.max.apply(null, numeros),
    'les numéros doivent être cohérents');
  assert.ok(numeros[numeros.length - 1] > numeros[0], 'et rangées dans l\'ordre');
});

test('P11 — tout survit à une sauvegarde/rechargement', () => {
  const s = carriere(3);
  const champion = (s.adversaires || [])[0];
  for (let n = 0; n < 2; n++) finir(s, 7, champion.id);
  const avant = RMClub.palmaresClub(s, champion.id);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const apres = RMClub.palmaresClub(rechargee, champion.id);
  assert.deepStrictEqual(apres, avant, 'le palmarès doit être identique');
});

test('P12 — une sauvegarde ANTÉRIEURE ne se voit pas inventer un passé', () => {
  const s = carriere(3);
  finir(s, 7);
  // On efface les historiques, comme une carrière commencée avant la tranche.
  for (const a of (s.adversaires || [])) delete a.historiqueSaisons;
  const suivi = (s.adversaires || [])[0];
  assert.deepStrictEqual(RMClub.historiqueClub(s, suivi.id), [],
    'aucune saison reconstituée après coup');
  assert.strictEqual(RMClub.palmaresClub(s, suivi.id).saisons, 0);
  // Et la saison suivante recommence à enregistrer normalement.
  finir(s, 7);
  assert.ok(RMClub.historiqueClub(s, suivi.id).length >= 1,
    'l\'enregistrement doit reprendre à partir de maintenant');
});

test('P13 — les autres divisions REJOUENT une saison chaque année', () => {
  // Défaut mesuré, antérieur à cette tranche et rendu visible par le
  // palmarès : sans changement de palier, ces divisions n'étaient jamais
  // réinitialisées. Leur calendrier restait à 182/182 rencontres jouées, donc
  // plus rien ne se jouait et leur classement restait figé sur la saison 1
  // pour toute la carrière.
  const s = carriere(3);
  const div = () => ((s.autresDivisionsFrance || {}).divisions || {})[1];
  assert.ok(div(), 'la Ligue d\'Excellence doit exister');
  const jouerLaSaison = () => {
    for (let j = 0; j < 30; j++) {
      RMClub.avancerJourneeAutresDivisionsFrance(creerRng(graine++), s.autresDivisionsFrance);
    }
  };
  jouerLaSaison();
  const joueesAvant = (div().calendrier || []).filter((f) => f.joue).length;
  assert.ok(joueesAvant > 0, 'la division doit avoir joué sa saison');
  finir(s, 7); // milieu de tableau : aucun mouvement de palier
  const restantes = (div().calendrier || []).filter((f) => !f.joue).length;
  assert.ok(restantes > 0,
    `la division doit repartir avec un calendrier à jouer (${restantes} rencontres restantes)`);
  const classe = RMClub.classementTrieDe(div().classement || {});
  assert.strictEqual(classe[0].j, 0, 'et un classement remis à zéro');
  // Les clubs, eux, RESTENT (acquis de G15).
  assert.strictEqual((div().clubs || []).length, RMClub.TAILLE_DIVISION_FRANCE[1],
    'sans perdre un seul club');
});

test('P14 — un champion n\'est enregistré QUE si la saison a été jouée', () => {
  // Le classement d'une division existe dès sa création, à zéro partout.
  // Le trier renvoie un ordre arbitraire mais STABLE : sacrer son premier
  // fabriquerait un titre, et le même club aurait été champion chaque saison.
  const s = carriere(3);
  const div = ((s.autresDivisionsFrance || {}).divisions || {})[1];
  const cible = (div.clubs || [])[0];
  assert.strictEqual((div.calendrier || []).filter((f) => f.joue).length, 0,
    'la division ne doit avoir joué aucune rencontre pour ce test');
  finir(s, 7);
  for (const c of (div.clubs || [])) {
    const p = RMClub.palmaresClub(s, c.id);
    assert.strictEqual(p.titres, 0,
      `${c.nom} ne doit pas être sacré sans avoir joué (${p.titres} titre(s))`);
  }
  assert.deepStrictEqual(RMClub.historiqueClub(s, cible.id), [],
    'et aucune saison ne doit être consignée');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
