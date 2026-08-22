// COUVERTURE — les matchs entre clubs IA arrivent enfin à leurs joueurs.
//
// Audit mesuré avant cette tranche, sur une saison complète :
//
//   156 matchs disputés entre clubs adverses
//   312 joueurs dans leurs groupes
//     ayant accumulé de la fatigue      : 0
//     blessés                           : 0
//     avec au moins un match au compteur: 0
//
// Ces 26 journées ne laissaient AUCUNE trace. Le résultat d'un match IA-IA
// ne dépendait que de `niveauClub` — ni de qui était disponible, ni de qui
// était blessé, ni de qui venait d'enchaîner trois matchs. Les groupes de 24
// joueurs, la fatigue, les blessures et la rotation que le jeu entretient
// pour chaque club adverse ne servaient QUE lors de ses matchs contre le
// club du joueur : un club sur vingt-six rencontres.
//
// Note honnête sur ce qui n'est PAS fait ici : remplacer la simulation
// abstraite par le vrai moteur pour ces 156 matchs a été mesuré et écarté.
// La corrélation de rang entre `niveauClub` et la force réelle des groupes
// reste de 0,80 à 0,91 sur sept saisons — le coût serait élevé pour un écart
// marginal. Ce qui manquait n'était pas la finesse du calcul, c'était que
// ces matchs ARRIVENT vraiment aux joueurs.
//
// Usage : node server/test-matchs-ia.js
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

let graine = 810000;
function carriere() {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Matchs IA');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  RMClub.assurerEffectifsAdverses(s);
  return s;
}
// Les rencontres de la prochaine journée qui n'impliquent PAS le joueur —
// exactement ce que clubUI résout en abstrait.
function matchsAdversesDeLaJournee(s) {
  const prochaine = (s.calendrier || []).find((f) => !f.joue);
  if (!prochaine) return [];
  return (s.calendrier || []).filter((f) => f.journee === prochaine.journee && !f.joue
    && f.domicileId !== s.clubJoueur.id && f.exterieurId !== s.clubJoueur.id);
}
function compteurs(s) {
  let fatigues = 0, blesses = 0, joues = 0, total = 0;
  for (const c of (s.adversaires || [])) {
    for (const j of (RMClub.groupeAdverse(s, c) || [])) {
      total++;
      if ((j.fatigue || 0) > 0) fatigues++;
      if (j.blessureJournees > 0) blesses++;
      if ((j.matchsJoues || 0) > 0) joues++;
    }
  }
  return { fatigues, blesses, joues, total };
}

test('R1 — PREUVE : une journée entre clubs IA laisse enfin une trace', () => {
  const s = carriere();
  const avant = compteurs(s);
  assert.strictEqual(avant.joues, 0, 'aucun match au compteur au départ');
  const matchs = matchsAdversesDeLaJournee(s);
  assert.ok(matchs.length >= 4, `il faut de vraies rencontres à résoudre (${matchs.length})`);
  RMClub.resoudreMatchsAdverses(creerRng(graine++), s, matchs);
  const apres = compteurs(s);
  assert.ok(apres.joues > 0,
    `des joueurs adverses doivent avoir joué (${apres.joues}/${apres.total})`);
  assert.ok(apres.fatigues > 0,
    `et avoir accumulé de la fatigue (${apres.fatigues})`);
  // Exactement les clubs concernés, pas tout le monde.
  const clubsConcernes = new Set();
  for (const f of matchs) { clubsConcernes.add(f.domicileId); clubsConcernes.add(f.exterieurId); }
  for (const c of (s.adversaires || [])) {
    const aJoue = (RMClub.groupeAdverse(s, c) || []).some((j) => (j.matchsJoues || 0) > 0);
    assert.strictEqual(aJoue, clubsConcernes.has(c.id),
      `${c.nom} : joué=${aJoue} alors qu'il ${clubsConcernes.has(c.id) ? 'devait' : 'ne devait pas'} jouer`);
  }
});

test('R2 — les rencontres sont RÉELLEMENT enregistrées au classement', () => {
  const s = carriere();
  const matchs = matchsAdversesDeLaJournee(s);
  const idsAvant = matchs.map((f) => f.id);
  RMClub.resoudreMatchsAdverses(creerRng(graine++), s, matchs);
  for (const id of idsAvant) {
    const f = (s.calendrier || []).find((x) => x.id === id);
    assert.strictEqual(f.joue, true, `la rencontre ${id} doit être jouée`);
    assert.ok(f.score && f.score.domicile != null, 'avec un score');
    assert.ok(s.classement[f.domicileId].j > 0, 'et un classement qui bouge');
  }
});

test('R3 — la force employée vient du groupe DISPONIBLE, pas d\'un nombre figé', () => {
  const s = carriere();
  const club = (s.adversaires || [])[0];
  const nominal = RMClub.niveauEffectifDuJour(s, club);
  assert.ok(nominal != null, 'la fonction doit répondre');
  assert.ok(Math.abs(nominal - club.niveauClub) < 0.02,
    `groupe au complet : la force doit valoir le niveau du club (${nominal} vs ${club.niveauClub})`);
  // On met la moitié du groupe à l'infirmerie.
  const groupe = RMClub.groupeAdverse(s, club);
  groupe.slice(0, Math.floor(groupe.length / 2)).forEach((j) => { j.blessureJournees = 20; });
  const ampute = RMClub.niveauEffectifDuJour(s, club);
  assert.ok(ampute < nominal,
    `un club amputé doit être plus faible (${ampute} vs ${nominal})`);
});

test('R4 — PREUVE : un club décimé perd des points qu\'il ne perdait pas avant', () => {
  // Deux mondes identiques, une seule différence : dans le second, le club
  // reçoit sa journée avec la moitié de son groupe à l'infirmerie.
  const marquer = (blesser) => {
    graine = 820000; // même graine pour les deux mondes
    const s = carriere();
    const matchs = matchsAdversesDeLaJournee(s);
    const club = (s.adversaires || []).find((c) =>
      matchs.some((f) => f.domicileId === c.id || f.exterieurId === c.id));
    if (blesser) {
      const groupe = RMClub.groupeAdverse(s, club);
      groupe.slice(0, Math.floor(groupe.length / 2)).forEach((j) => { j.blessureJournees = 20; });
    }
    RMClub.resoudreMatchsAdverses(creerRng(999), s, matchs);
    const f = matchs[0] && (s.calendrier || []).find((x) => x.id === matchs[0].id);
    return { pts: s.classement[club.id].pts, club, score: f && f.score };
  };
  const complet = marquer(false);
  const decime = marquer(true);
  assert.ok(decime.pts <= complet.pts,
    `le club décimé ne doit pas faire mieux (${decime.pts} vs ${complet.pts} pts)`);
  assert.notDeepStrictEqual(decime.score, complet.score,
    'et le score du match doit réellement changer');
});

test('R5 — un club SANS effectif simulé garde son ancien traitement', () => {
  const s = carriere();
  const abstrait = { id: 'clubAbstrait', nom: 'Club Abstrait', niveauClub: 0.42 };
  assert.strictEqual(RMClub.niveauEffectifDuJour(s, abstrait), 0.42,
    'sans groupe, on retombe sur niveauClub — rien n\'est inventé');
});

test('R6 — déterminisme : la même journée rejouée donne le même résultat', () => {
  const rejouer = () => {
    graine = 830000;
    const s = carriere();
    const matchs = matchsAdversesDeLaJournee(s);
    RMClub.resoudreMatchsAdverses(creerRng(1234), s, matchs);
    return matchs.map((f) => {
      const x = (s.calendrier || []).find((y) => y.id === f.id);
      return `${x.id}:${x.score.domicile}-${x.score.exterieur}`;
    }).join('|');
  };
  assert.strictEqual(rejouer(), rejouer(), 'deux exécutions identiques doivent coïncider');
});

test('R7 — les compteurs restent bornés', () => {
  const s = carriere();
  for (let j = 0; j < 6; j++) {
    const matchs = matchsAdversesDeLaJournee(s);
    if (!matchs.length) break;
    RMClub.resoudreMatchsAdverses(creerRng(graine++), s, matchs);
    // Le joueur, lui, n'a pas joué : on marque sa rencontre pour avancer.
    const sienne = (s.calendrier || []).find((f) => !f.joue
      && (f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id));
    if (sienne) RMClub.enregistrerResultat(s, sienne.id, 20, 20, 2, 2);
  }
  for (const c of (s.adversaires || [])) {
    for (const jo of (RMClub.groupeAdverse(s, c) || [])) {
      assert.ok((jo.fatigue || 0) >= 0 && (jo.fatigue || 0) <= 100,
        `${jo.nom} : fatigue ${jo.fatigue}`);
      assert.ok((jo.blessureJournees || 0) >= 0, `${jo.nom} : blessure ${jo.blessureJournees}`);
    }
  }
});

test('R8 — les blessures des clubs IA guérissent au fil des jours', () => {
  const s = carriere();
  const club = (s.adversaires || [])[0];
  const groupe = RMClub.groupeAdverse(s, club);
  groupe[0].blessureJournees = 5;
  const avant = groupe[0].blessureJournees;
  RMClub.avancerJourClubsAdverses(s);
  assert.ok(RMClub.groupeAdverse(s, club)[0].blessureJournees < avant,
    'une blessure doit se résorber jour après jour');
});

test('R9 — tout survit à une sauvegarde/rechargement', () => {
  const s = carriere();
  const matchs = matchsAdversesDeLaJournee(s);
  RMClub.resoudreMatchsAdverses(creerRng(graine++), s, matchs);
  const avant = compteurs(s);
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  assert.deepStrictEqual(compteurs(rechargee), avant,
    'fatigue, blessures et matchs joués doivent survivre');
});

test('R10 — sur une saison, les scores restent crédibles', () => {
  const s = carriere();
  let garde = 0;
  const scores = [];
  while (garde++ < 40) {
    const matchs = matchsAdversesDeLaJournee(s);
    if (!matchs.length) break;
    RMClub.resoudreMatchsAdverses(creerRng(graine++), s, matchs);
    for (const f of matchs) {
      const x = (s.calendrier || []).find((y) => y.id === f.id);
      if (x && x.score) scores.push(x.score.domicile, x.score.exterieur);
    }
    const sienne = (s.calendrier || []).find((f) => !f.joue
      && (f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id));
    if (sienne) RMClub.enregistrerResultat(s, sienne.id, 20, 20, 2, 2);
    // Une semaine passe entre deux journées : les clubs récupèrent, comme
    // dans le jeu (avancerJourClubsAdverses tourne tous les jours). Sans ça,
    // la fatigue ne redescendrait jamais et le banc d'essai mesurerait un
    // championnat que personne ne joue jamais.
    for (let jour = 0; jour < 7; jour++) RMClub.avancerJourClubsAdverses(s);
  }
  assert.ok(scores.length > 50, `il faut un échantillon (${scores.length} scores)`);
  const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;
  assert.ok(moyenne >= 12 && moyenne <= 40,
    `un score moyen d'équipe doit rester crédible (${moyenne.toFixed(1)})`);
  assert.ok(Math.max.apply(null, scores) < 90,
    `aucun score aberrant (${Math.max.apply(null, scores)})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
