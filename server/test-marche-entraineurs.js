// COUVERTURE — un marché des entraîneurs : les clubs adverses ont un manager,
// et une offre arrive parce qu'un POSTE S'EST LIBÉRÉ.
//
// Audit mesuré AVANT cette tranche, sur une carrière où les trois divisions
// françaises vivent dans la même sauvegarde :
//
//   clubs simulés (ma division + les deux autres)          43
//   clubs portant un entraîneur                             0
//   offres reçues à 85 de réputation                        6
//   offres correspondant à un poste réellement libre        0 / 6
//
// `clubsRecruteurs` retenait TOUS les clubs, sans condition. Une offre
// arrivait parce que la réputation du joueur dépassait l'exigence du club —
// jamais parce que ce club cherchait quelqu'un. Conséquence en jeu : les
// offres étaient un TIRAGE, pas une conséquence. Un club pouvait « recruter »
// alors que personne n'était parti, et l'écran ne pouvait rien dire de plus
// que « ce club s'intéresse à vous ».
//
// Ce que cette suite exige : chaque club porte un entraîneur nommé, dont le
// sort dépend de ses RÉSULTATS RÉELS dans sa division ; un poste se libère
// par limogeage ou par départ ; et une offre ne peut venir que d'un poste
// libre, en disant pourquoi il l'est.
//
// Usage : node server/test-marche-entraineurs.js
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

let graine = 720000;
function carriere(reputation, niveau) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Marché');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  if (niveau != null) s.clubJoueur.palierPyramide = { pays: 'FRA', niveau };
  RMClub.assurerManager(s, 'Testeur');
  RMClub.assurerAutresDivisionsFrance(creerRng(2), s);
  RMClub.assurerEntraineursRivaux(creerRng(3), s);
  if (reputation != null) s.manager.reputation = reputation;
  return s;
}

// Tous les clubs pilotés par l'ordinateur, ma division et les autres.
function tousLesClubsRivaux(s) {
  const liste = [...(s.adversaires || [])];
  const autres = (s.autresDivisionsFrance || {}).divisions || {};
  for (const cle of Object.keys(autres)) {
    for (const club of (autres[cle].clubs || [])) liste.push(club);
  }
  return liste;
}

function finirSaison(s, position) {
  const c = s.clubJoueur;
  const rivaux = Object.keys(s.classement).filter((id) => id !== c.id);
  s.classement[c.id].pts = 50;
  rivaux.forEach((id, i) => { s.classement[id].pts = i < (position - 1) ? 90 : 10; });
  for (const f of s.calendrier) f.joue = true;
  RMClub.avancerSaison(creerRng(graine++), s);
}

// --- E1..E3 : les entraîneurs existent, et existent VRAIMENT --------------

test('E1 — chaque club rival porte un entraîneur nommé', () => {
  const s = carriere();
  const clubs = tousLesClubsRivaux(s);
  assert.ok(clubs.length >= 30, `il faut des clubs à peupler (${clubs.length})`);
  const sans = clubs.filter((c) => !RMClub.entraineurDuClub(s, c.id));
  assert.strictEqual(sans.length, 0,
    `${sans.length}/${clubs.length} clubs n'ont pas d'entraîneur`);
  for (const c of clubs) {
    const e = RMClub.entraineurDuClub(s, c.id);
    assert.ok(e.nom && e.nom.length > 2, `nom d'entraîneur invalide pour ${c.nom} : ${e.nom}`);
    assert.ok(e.reputation >= 0 && e.reputation <= 100,
      `réputation hors échelle pour ${e.nom} : ${e.reputation}`);
    assert.ok(Number.isInteger(e.saisonsAuClub) && e.saisonsAuClub >= 0,
      `ancienneté invalide pour ${e.nom} : ${e.saisonsAuClub}`);
  }
});

test('E2 — les entraîneurs ne sont pas tous le même homme', () => {
  const s = carriere();
  const clubs = tousLesClubsRivaux(s);
  const noms = new Set(clubs.map((c) => RMClub.entraineurDuClub(s, c.id).nom));
  assert.ok(noms.size >= clubs.length * 0.9,
    `les noms doivent être variés (${noms.size} noms distincts pour ${clubs.length} clubs)`);
  const reps = clubs.map((c) => RMClub.entraineurDuClub(s, c.id).reputation);
  assert.ok(new Set(reps).size >= 5,
    `les réputations doivent varier (${new Set(reps).size} valeurs distinctes)`);
});

test('E3 — un club de l\'élite a un entraîneur mieux coté qu\'un club de Régionale', () => {
  const s = carriere(null, 3);
  const autres = (s.autresDivisionsFrance || {}).divisions || {};
  const moyenne = (clubs) => {
    const r = clubs.map((c) => RMClub.entraineurDuClub(s, c.id).reputation);
    return r.reduce((t, n) => t + n, 0) / r.length;
  };
  const elite = autres[1] && autres[1].clubs;
  assert.ok(elite && elite.length, 'la division 1 doit être simulée');
  const regionale = s.adversaires;
  assert.ok(moyenne(elite) > moyenne(regionale) + 5,
    `l'élite doit être mieux dotée (élite ${moyenne(elite).toFixed(1)} vs Régionale ${moyenne(regionale).toFixed(1)})`);
});

// --- E4..E6 : un poste se libère pour une RAISON ---------------------------

test('E4 — au départ, aucun poste n\'est libre : personne n\'a encore échoué', () => {
  const s = carriere();
  const libres = RMClub.postesLibres(s);
  assert.strictEqual(libres.length, 0,
    `une saison qui commence ne doit libérer aucun poste (${libres.length} trouvés)`);
});

test('E5 — une saison ratée coûte sa place à l\'entraîneur, une bonne saison non', () => {
  const s = carriere(null, 3);
  const clubs = tousLesClubsRivaux(s);
  const cancre = clubs[0];
  const bon = clubs[1];
  const avantCancre = RMClub.entraineurDuClub(s, cancre.id).nom;
  const avantBon = RMClub.entraineurDuClub(s, bon.id).nom;
  // Bilans RÉELS, pas des drapeaux : dernier et premier de leur division.
  RMClub.resoudreEntraineursFinDeSaison(creerRng(11), s, {
    bilans: { [cancre.id]: { position: 14, total: 14 }, [bon.id]: { position: 1, total: 14 } },
  });
  assert.notStrictEqual(RMClub.entraineurDuClub(s, cancre.id).nom, avantCancre,
    'un entraîneur dernier de sa division doit perdre sa place');
  assert.strictEqual(RMClub.entraineurDuClub(s, bon.id).nom, avantBon,
    'un entraîneur champion ne doit PAS être limogé');
});

test('E6 — un poste libéré dit POURQUOI, et nomme celui qui est parti', () => {
  const s = carriere(null, 3);
  const cancre = tousLesClubsRivaux(s)[0];
  const partant = RMClub.entraineurDuClub(s, cancre.id).nom;
  RMClub.resoudreEntraineursFinDeSaison(creerRng(12), s, {
    bilans: { [cancre.id]: { position: 14, total: 14 } },
  });
  const libres = RMClub.postesLibres(s);
  const poste = libres.find((p) => p.clubId === cancre.id);
  assert.ok(poste, `le poste de ${cancre.nom} doit figurer parmi les postes libres`);
  assert.ok(poste.raison && poste.raison.length > 10, `raison trop maigre : « ${poste.raison} »`);
  assert.ok(poste.raison.includes(partant),
    `la raison doit nommer l'entraîneur parti (${partant}) : « ${poste.raison} »`);
});

// --- E7..E9 : les offres deviennent une CONSÉQUENCE ------------------------

test('E7 — aucune offre tant qu\'aucun poste n\'est libre', () => {
  const s = carriere(95, 3);
  assert.strictEqual(RMClub.postesLibres(s).length, 0, 'prémisse : aucun poste libre');
  const offres = RMClub.offresDisponibles(s);
  assert.strictEqual(offres.length, 0,
    `un manager à 95 de réputation ne doit recevoir AUCUNE offre si personne ne cherche (${offres.length} reçues)`);
});

test('E8 — une offre ne peut venir que d\'un poste réellement libre', () => {
  const s = carriere(95, 3);
  const clubs = tousLesClubsRivaux(s);
  const bilans = {};
  // Une moitié des clubs sombre, l'autre non.
  clubs.forEach((c, i) => { bilans[c.id] = { position: i % 2 === 0 ? 14 : 1, total: 14 }; });
  RMClub.resoudreEntraineursFinDeSaison(creerRng(13), s, { bilans });
  const libres = new Set(RMClub.postesLibres(s).map((p) => p.clubId));
  assert.ok(libres.size > 0, 'prémisse : des postes doivent s\'être libérés');
  const offres = RMClub.offresDisponibles(s);
  assert.ok(offres.length > 0, `des postes libres doivent produire des offres (${libres.size} libres, 0 offre)`);
  const intruses = offres.filter((o) => !libres.has(o.clubId));
  assert.strictEqual(intruses.length, 0,
    `${intruses.length} offre(s) viennent d'un club dont le poste est OCCUPÉ : ${intruses.map((o) => o.clubNom).join(', ')}`);
});

test('E9 — l\'offre porte la raison du poste libre, pour que le joueur comprenne', () => {
  const s = carriere(95, 3);
  const clubs = tousLesClubsRivaux(s);
  const bilans = {};
  clubs.forEach((c) => { bilans[c.id] = { position: 14, total: 14 }; });
  RMClub.resoudreEntraineursFinDeSaison(creerRng(14), s, { bilans });
  const offres = RMClub.offresDisponibles(s);
  assert.ok(offres.length > 0, 'prémisse : des offres doivent exister');
  for (const o of offres) {
    assert.ok(o.raisonPosteLibre && o.raisonPosteLibre.length > 10,
      `l'offre de ${o.clubNom} n'explique pas pourquoi le poste est libre`);
  }
});

// --- E10..E11 : le marché VIT, sans se vider ni déborder -------------------

test('E10 — sur une carrière, des postes se libèrent régulièrement', () => {
  const s = carriere(90, 3);
  let saisonsAvecOffre = 0;
  const total = 6;
  for (let i = 0; i < total; i++) {
    finirSaison(s, 5);
    if (RMClub.offresDisponibles(s).length > 0) saisonsAvecOffre++;
  }
  assert.ok(saisonsAvecOffre >= 3,
    `un manager réputé doit voir s'ouvrir des portes régulièrement (${saisonsAvecOffre}/${total} saisons avec au moins une offre)`);
});

test('E11 — le marché ne se vide pas : chaque club retrouve un entraîneur', () => {
  const s = carriere(90, 3);
  for (let i = 0; i < 5; i++) finirSaison(s, 5);
  const clubs = tousLesClubsRivaux(s);
  const sans = clubs.filter((c) => !RMClub.entraineurDuClub(s, c.id));
  assert.strictEqual(sans.length, 0,
    `après cinq saisons, ${sans.length}/${clubs.length} clubs sont sans entraîneur`);
  const libres = RMClub.postesLibres(s);
  assert.ok(libres.length < clubs.length * 0.5,
    `la moitié des clubs ne peut pas être sans entraîneur en même temps (${libres.length}/${clubs.length})`);
});

// --- E12..E13 : ça survit à la sauvegarde ---------------------------------

test('E12 — les entraîneurs survivent à une sauvegarde et un rechargement', () => {
  const s = carriere(null, 3);
  const clubs = tousLesClubsRivaux(s);
  const avant = clubs.map((c) => `${c.id}:${RMClub.entraineurDuClub(s, c.id).nom}`).join('|');
  RMClub.sauvegarderSaison(s);
  const relu = RMClub.chargerSaison();
  assert.ok(relu, 'la sauvegarde doit se relire');
  const apres = tousLesClubsRivaux(relu)
    .map((c) => `${c.id}:${RMClub.entraineurDuClub(relu, c.id).nom}`).join('|');
  assert.strictEqual(apres, avant, 'les entraîneurs doivent être identiques après rechargement');
});

test('E13 — une carrière d\'avant cette tranche est migrée, pas cassée', () => {
  const s = carriere(null, 3);
  // On rembobine à l'état d'une sauvegarde de version 11 : aucun entraîneur.
  delete s.entraineursRivaux;
  s.version = 11;
  RMClub.sauvegarderSaison(s);
  const relu = RMClub.chargerSaison();
  assert.ok(relu, 'une sauvegarde de version 11 doit se relire');
  assert.ok(relu.version >= 12, `la version doit avoir été migrée (obtenue ${relu.version})`);
  const clubs = tousLesClubsRivaux(relu);
  const sans = clubs.filter((c) => !RMClub.entraineurDuClub(relu, c.id));
  assert.strictEqual(sans.length, 0,
    `après migration, ${sans.length}/${clubs.length} clubs restent sans entraîneur`);
  assert.strictEqual(RMClub.postesLibres(relu).length, 0,
    'une carrière migrée ne doit pas inventer de limogeages rétroactifs');
});

// --- E14..E19 : l'entraîneur PÈSE sur le jeu de son club ------------------
//
// Audit avant cette partie : `effetEntraineur` n'existait pas, et ni
// `simulerResultatAbstrait` (autres divisions, coupes, monde) ni
// `niveauEffectifDuJour` (matchs IA de ma division) ne lisaient le banc. Le
// nom sur le banc était une ÉTIQUETTE : limoger un entraîneur ne changeait
// rien à ce qui se passait sur le terrain, et accepter un poste plutôt qu'un
// autre n'avait aucune conséquence sportive.

test('E14 — l\'effet d\'un entraîneur est borné et centré sur zéro', () => {
  const s = carriere(null, 3);
  const A = RMClub.AMPLITUDE_EFFET_ENTRAINEUR;
  assert.ok(A > 0 && A < 0.2, `amplitude hors de toute échelle plausible (${A})`);
  const bornes = RMClub.REPUTATION_PAR_NIVEAU[2];
  const milieu = (bornes.min + bornes.max) / 2;
  assert.ok(Math.abs(RMClub.effetEntraineur({ reputation: milieu }, 2)) < 0.005,
    'un entraîneur au milieu de la fourchette de sa division ne doit rien changer');
  assert.ok(Math.abs(RMClub.effetEntraineur({ reputation: bornes.max }, 2) - A) < 0.005,
    'le mieux coté de sa division vaut exactement +amplitude');
  assert.ok(Math.abs(RMClub.effetEntraineur({ reputation: bornes.min }, 2) + A) < 0.005,
    'le moins bien coté vaut exactement -amplitude');
  // Une réputation aberrante ne doit pas faire exploser l'échelle.
  assert.ok(Math.abs(RMClub.effetEntraineur({ reputation: 500 }, 2)) <= A + 1e-9,
    'l\'effet doit rester borné même pour une réputation hors de tout');
});

test('E15 — l\'effet se juge dans SA division, pas sur une échelle absolue', () => {
  // 63 est le BAS de la fourchette de l'élite, 59 le HAUT de celle de la
  // Régionale. Sur une échelle absolue, le premier serait le meilleur des
  // deux ; en vérité l'un est le maillon faible de son championnat et
  // l'autre en est la référence.
  const basDeLElite = RMClub.effetEntraineur({ reputation: 63 }, 1);
  const hautDeLaRegionale = RMClub.effetEntraineur({ reputation: 59 }, 3);
  assert.ok(basDeLElite < 0, `63 en division 1 doit être un handicap (${basDeLElite})`);
  assert.ok(hautDeLaRegionale > 0, `59 en division 3 doit être un atout (${hautDeLaRegionale})`);
});

test('E16 — un intérimaire est un handicap, pas un statut décoratif', () => {
  const s = carriere(null, 3);
  const cancre = tousLesClubsRivaux(s)[0];
  const avant = RMClub.effetEntraineurDuClub(s, cancre.id);
  RMClub.resoudreEntraineursFinDeSaison(creerRng(21), s, {
    bilans: { [cancre.id]: { position: 14, total: 14 } },
  });
  const apres = RMClub.effetEntraineurDuClub(s, cancre.id);
  assert.ok(RMClub.entraineurDuClub(s, cancre.id).interim, 'prémisse : un intérimaire a pris le banc');
  assert.ok(apres < avant,
    `un intérimaire doit peser moins que celui qu'il remplace (avant ${avant.toFixed(3)}, après ${apres.toFixed(3)})`);
});

test('E17 — le banc atteint les résultats des autres divisions', () => {
  const bornes = RMClub.REPUTATION_PAR_NIVEAU[1];
  // On traverse le VRAI chemin : `avancerJourneeAutresDivisionsFrance`, celui
  // que l'écran appelle chaque jour. Vérifier `niveauAvecEntraineur` seule
  // prouverait que ma fonction calcule, pas que quelqu'un l'appelle — c'est
  // exactement ainsi qu'un effet reste décoratif sans qu'aucun test ne bronche.
  const pointsApres = (reputation) => {
    const s = carriere(null, 3);
    const div = (s.autresDivisionsFrance || {}).divisions[1];
    const club = div.clubs[0];
    for (const c of div.clubs) RMClub.entraineurDuClub(s, c.id).reputation = bornes.min;
    RMClub.entraineurDuClub(s, club.id).reputation = reputation;
    for (let j = 0; j < 8; j++) {
      RMClub.avancerJourneeAutresDivisionsFrance(creerRng(4400 + j), s.autresDivisionsFrance, s);
    }
    const ligne = div.classement[club.id];
    return ligne ? ligne.pts : null;
  };
  const bon = pointsApres(bornes.max);
  const mauvais = pointsApres(bornes.min);
  assert.ok(bon != null && mauvais != null, 'le classement de la division doit être tenu');
  assert.ok(bon > mauvais,
    `le même club, même graine, doit marquer plus de points avec un meilleur banc (${bon} vs ${mauvais})`);
});

test('E18 — le banc atteint aussi les matchs IA de MA division', () => {
  const s = carriere(null, 3);
  const club = s.adversaires[0];
  const bornes = RMClub.REPUTATION_PAR_NIVEAU[3];
  RMClub.entraineurDuClub(s, club.id).reputation = bornes.max;
  const bon = RMClub.niveauEffectifDuJour(s, club);
  RMClub.entraineurDuClub(s, club.id).reputation = bornes.min;
  const mauvais = RMClub.niveauEffectifDuJour(s, club);
  assert.ok(bon > mauvais,
    `niveauEffectifDuJour doit tenir compte du banc (${bon.toFixed(3)} vs ${mauvais.toFixed(3)})`);
});

test('E19 — sur une saison, le banc compte SANS écraser l\'effectif', () => {
  // La mesure qui a servi à calibrer : une division de 14 clubs de niveaux
  // réalistes, saison aller-retour, un seul club change d'entraîneur.
  const niveauxBase = Array.from({ length: 14 }, (_, k) => 0.35 + k * 0.02);
  const CIBLE = 6;
  const A = RMClub.AMPLITUDE_EFFET_ENTRAINEUR;
  const placeMoyenne = (delta) => {
    let somme = 0;
    const SAISONS = 200;
    for (let s = 0; s < SAISONS; s++) {
      const rng = creerRng(3000 + s);
      const niveaux = niveauxBase.slice();
      niveaux[CIBLE] += delta;
      const pts = new Array(14).fill(0);
      for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
        if (i === j) continue;
        const r = RMClub.simulerResultatAbstrait(rng, niveaux[i], niveaux[j]);
        if (r.scoreA > r.scoreB) pts[i] += 4;
        else if (r.scoreA < r.scoreB) pts[j] += 4;
        else { pts[i] += 2; pts[j] += 2; }
      }
      somme += pts.map((p, i) => ({ p, i })).sort((x, y) => y.p - x.p)
        .findIndex((x) => x.i === CIBLE) + 1;
    }
    return somme / SAISONS;
  };
  const ecart = placeMoyenne(-A) - placeMoyenne(A);
  // Deux échecs possibles, et les DEUX comptent :
  //   - sous 1 place, l'entraîneur est décoratif : le joueur ne verra rien ;
  //   - au-delà de 5, il écrase l'effectif : recruter ne servirait plus.
  assert.ok(ecart >= 1,
    `un bon entraîneur doit valoir au moins une place au classement (${ecart.toFixed(2)})`);
  assert.ok(ecart <= 5,
    `mais pas écraser l'effectif : ${ecart.toFixed(2)} places d'écart, c'est trop`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
