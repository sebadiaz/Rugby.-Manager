// COUVERTURE — une carrière d'entraîneur qui peut CHANGER DE DIVISION.
//
// Audit mesuré avant cette tranche. Un manager porté à 85 de réputation
// (l'échelle démarre à 45), dans une carrière où les trois divisions
// françaises sont réellement simulées dans la MÊME sauvegarde :
//
//   offres reçues                                    4
//   offres venant de MA division                     4 / 4
//   clubs réellement simulés dans les 2 autres        30
//   offres venant de ces 30 clubs                     0
//   divisions annoncées, valeurs distinctes          ["Ligue Régionale"]
//   exigence la plus haute parmi les offres           37  (pour 85 de réputation)
//
// `offresDisponibles` ne lisait que `saison.adversaires`, et le champ
// `division` de chaque offre était rempli avec... le palier du JOUEUR, donc
// toujours le même. Conséquence en jeu : **un entraîneur ne pouvait jamais
// changer de division**. Le seul moyen de monter était de faire monter son
// club ; un manager licencié ne pouvait pas rebondir plus bas ; une
// réputation d'élite n'ouvrait aucune porte, alors que 30 clubs d'autres
// divisions vivaient dans la même partie.
//
// Usage : node server/test-carriere-divisions.js
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

let graine = 410000;
function carriere(reputation, niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Carrière');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  RMClub.assurerManager(s, 'Testeur');
  RMClub.assurerAutresDivisionsFrance(creerRng(2), s);
  if (reputation != null) s.manager.reputation = reputation;
  return s;
}
function idsDeMaDivision(s) { return new Set((s.adversaires || []).map((a) => a.id)); }
// Termine la saison à une position donnée, puis passe à la suivante.
function finirSaison(s, position) {
  const c = s.clubJoueur;
  const rivaux = Object.keys(s.classement).filter((id) => id !== c.id);
  s.classement[c.id].pts = 50;
  rivaux.forEach((id, i) => { s.classement[id].pts = i < (position - 1) ? 90 : 10; });
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(graine++), s);
}

test('K1 — les offres ne viennent plus SEULEMENT de ma division', () => {
  const s = carriere(85);
  const offres = RMClub.offresDisponibles(s);
  assert.ok(offres.length > 0, 'un manager très réputé doit recevoir des offres');
  const miennes = idsDeMaDivision(s);
  const ailleurs = offres.filter((o) => !miennes.has(o.clubId));
  assert.ok(ailleurs.length > 0,
    `au moins une offre doit venir d'une autre division (${offres.length} offre(s), toutes de ma division)`);
});

test('K2 — chaque offre annonce SA division, pas la mienne', () => {
  const s = carriere(85);
  const offres = RMClub.offresDisponibles(s);
  const divisions = new Set(offres.map((o) => o.division));
  assert.ok(divisions.size >= 2,
    `les offres doivent couvrir plusieurs divisions (${JSON.stringify([...divisions])})`);
  for (const o of offres) {
    assert.ok(o.niveauCible >= 1 && o.niveauCible <= 3, `niveau cible invalide (${o.niveauCible})`);
    assert.strictEqual(o.division, RMClub.nomPalierFrance(o.niveauCible),
      `le libellé doit correspondre au niveau réel du club (${o.clubNom})`);
  }
});

test('K3 — une réputation modeste n\'ouvre PAS les portes de l\'élite', () => {
  const s = carriere(45, 3); // réputation de départ, en bas de la pyramide
  const offres = RMClub.offresDisponibles(s);
  const elite = offres.filter((o) => o.niveauCible === 1);
  assert.strictEqual(elite.length, 0,
    `un débutant ne doit pas être appelé par l'élite (${elite.map((o) => o.clubNom).join(', ')})`);
});

test('K4 — une grande réputation, elle, ouvre la division du dessus', () => {
  const s = carriere(95, 3);
  const offres = RMClub.offresDisponibles(s);
  assert.ok(offres.some((o) => o.niveauCible < 3),
    `une réputation de 95 doit intéresser au moins un club d'une division supérieure ` +
    `(${offres.map((o) => o.clubNom + '/' + o.niveauCible).join(', ')})`);
});

test('K5 — monter demande PLUS que rester : l\'échelle est réelle', () => {
  const s = carriere(95, 3);
  const offres = RMClub.offresDisponibles(s);
  const parNiveau = {};
  for (const o of offres) {
    if (parNiveau[o.niveauCible] == null || o.exigence > parNiveau[o.niveauCible]) {
      parNiveau[o.niveauCible] = o.exigence;
    }
  }
  const niveaux = Object.keys(parNiveau).map(Number).sort((a, b) => a - b);
  assert.ok(niveaux.length >= 2, 'il faut au moins deux divisions pour comparer');
  for (let i = 1; i < niveaux.length; i++) {
    assert.ok(parNiveau[niveaux[i - 1]] > parNiveau[niveaux[i]],
      `un club de ${RMClub.nomPalierFrance(niveaux[i - 1])} doit exiger plus qu'un club de ` +
      `${RMClub.nomPalierFrance(niveaux[i])} (${parNiveau[niveaux[i - 1]]} vs ${parNiveau[niveaux[i]]})`);
  }
});

test('K6 — accepter dans MA division change de club tout de suite (inchangé)', () => {
  const s = carriere(85);
  const miennes = idsDeMaDivision(s);
  const offre = RMClub.offresDisponibles(s).find((o) => miennes.has(o.clubId));
  assert.ok(offre, 'il faut une offre de ma division pour ce test');
  const ancienId = s.clubJoueur.id;
  assert.strictEqual(RMClub.accepterOffre(s, offre.id), true);
  assert.strictEqual(s.clubJoueur.id, offre.clubId, 'le club dirigé doit changer immédiatement');
  assert.ok((s.adversaires || []).some((a) => a.id === ancienId),
    'et l\'ancien club doit rester dans le monde');
});

test('K7 — PREUVE : accepter AILLEURS engage pour la saison prochaine', () => {
  const s = carriere(95, 3);
  const miennes = idsDeMaDivision(s);
  const offre = RMClub.offresDisponibles(s).find((o) => !miennes.has(o.clubId));
  assert.ok(offre, 'il faut une offre d\'une autre division pour ce test');
  const ancienId = s.clubJoueur.id;
  const journeesAvant = (s.calendrier || []).length;
  assert.strictEqual(RMClub.accepterOffre(s, offre.id), true);
  // La saison en cours n'est PAS cassée : on ne change pas de championnat
  // en plein milieu d'un calendrier déjà joué à moitié.
  assert.strictEqual(s.clubJoueur.id, ancienId, 'on dirige encore son club jusqu\'en juin');
  assert.strictEqual((s.calendrier || []).length, journeesAvant, 'le calendrier ne bouge pas');
  const engagement = RMClub.engagementProchaineSaison(s);
  assert.ok(engagement, 'un engagement doit être enregistré');
  assert.strictEqual(engagement.clubId, offre.clubId);
  assert.strictEqual(engagement.niveau, offre.niveauCible);
  // Et le manager en est informé.
  assert.ok((s.clubJoueur.messages || []).some((m) => /engag|accord|saison prochaine/i.test(m.corps || '')),
    'le manager doit lire qu\'il est engagé pour la saison prochaine');
});

test('K8 — à la saison suivante, il dirige RÉELLEMENT le club promis', () => {
  const s = carriere(95, 3);
  const miennes = idsDeMaDivision(s);
  const offre = RMClub.offresDisponibles(s).find((o) => !miennes.has(o.clubId));
  assert.ok(offre, 'il faut une offre d\'une autre division pour ce test');
  RMClub.accepterOffre(s, offre.id);
  finirSaison(s, 7); // milieu de tableau : ni promotion ni relégation
  assert.strictEqual(s.clubJoueur.id, offre.clubId,
    `le manager doit diriger ${offre.clubNom} (il dirige ${s.clubJoueur.nom})`);
  assert.strictEqual(s.clubJoueur.nom, offre.clubNom, 'avec son vrai nom');
  assert.strictEqual((s.clubJoueur.palierPyramide || {}).niveau, offre.niveauCible,
    'et dans la division de ce club');
  assert.strictEqual(RMClub.engagementProchaineSaison(s), null,
    'l\'engagement est consommé, pas rejoué chaque année');
  // Le monde reste cohérent : une vraie division autour de lui.
  assert.ok((s.adversaires || []).length >= 9,
    `il lui faut de vrais adversaires (${(s.adversaires || []).length})`);
  assert.ok((s.calendrier || []).length > 0, 'et un vrai calendrier');
  assert.ok((s.clubJoueur.effectif || []).length >= 23,
    `et un effectif jouable (${(s.clubJoueur.effectif || []).length})`);
});

test('K9 — la carrière garde la trace du passage d\'un club à l\'autre', () => {
  const s = carriere(95, 3);
  const miennes = idsDeMaDivision(s);
  const offre = RMClub.offresDisponibles(s).find((o) => !miennes.has(o.clubId));
  const ancienNom = s.clubJoueur.nom;
  RMClub.accepterOffre(s, offre.id);
  finirSaison(s, 7);
  const clubs = (s.manager.historiqueClubs || []).map((h) => h.clubNom);
  assert.ok(clubs.indexOf(ancienNom) !== -1, `l'ancien club doit figurer à l'historique (${clubs.join(' → ')})`);
  assert.strictEqual(clubs[clubs.length - 1], offre.clubNom, 'et le nouveau en dernier');
  const precedent = s.manager.historiqueClubs[s.manager.historiqueClubs.length - 2];
  assert.ok(precedent && precedent.jusquaSaison != null, 'le passage précédent doit être clôturé');
});

test('K10 — on ne signe pas deux fois : un engagement ferme les autres portes', () => {
  const s = carriere(95, 3);
  const miennes = idsDeMaDivision(s);
  const offre = RMClub.offresDisponibles(s).find((o) => !miennes.has(o.clubId));
  RMClub.accepterOffre(s, offre.id);
  assert.deepStrictEqual(RMClub.offresDisponibles(s), [],
    'aucune autre offre tant que l\'engagement court');
});

test('K11 — l\'engagement survit à une sauvegarde/rechargement', () => {
  const s = carriere(95, 3);
  const miennes = idsDeMaDivision(s);
  const offre = RMClub.offresDisponibles(s).find((o) => !miennes.has(o.clubId));
  RMClub.accepterOffre(s, offre.id);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const e = RMClub.engagementProchaineSaison(rechargee);
  assert.ok(e && e.clubId === offre.clubId, 'l\'engagement doit être là après rechargement');
  finirSaison(rechargee, 7);
  assert.strictEqual(rechargee.clubJoueur.id, offre.clubId,
    'et se réaliser normalement à la saison suivante');
});

test('K12 — sans engagement, la saison change exactement comme avant', () => {
  const s = carriere(45, 3);
  const idAvant = s.clubJoueur.id;
  const nomAvant = s.clubJoueur.nom;
  finirSaison(s, 7);
  assert.strictEqual(s.clubJoueur.id, idAvant, 'aucun changement de club');
  assert.strictEqual(s.clubJoueur.nom, nomAvant);
  assert.strictEqual((s.clubJoueur.palierPyramide || {}).niveau, 3, 'ni de division');
});

test('K13 — une promotion sportive reste prioritaire sur rien d\'autre', () => {
  // Garde-fou : le nouveau chemin ne doit pas perturber la montée normale.
  const s = carriere(45, 3);
  const idAvant = s.clubJoueur.id;
  finirSaison(s, 1); // champion : promotion
  assert.strictEqual(s.clubJoueur.id, idAvant, 'on monte avec SON club');
  assert.strictEqual((s.clubJoueur.palierPyramide || {}).niveau, 2, 'd\'un palier');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
